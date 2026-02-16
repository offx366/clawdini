// GatewayClient - WebSocket client for OpenClaw Gateway
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { AgentInfo, AgentsListResponse } from '@clawdini/types';

export interface GatewayClientOptions {
  gatewayUrl: string;
  token?: string;
  scopes?: string[];
}

interface RequestFrame {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

interface ResponseFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

interface EventFrame {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
}

type Frame = RequestFrame | ResponseFrame | EventFrame;

export class GatewayClient {
  private ws: WebSocket | null = null;
  private options: GatewayClientOptions;
  private pendingRequests = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private eventListeners = new Map<string, Set<(payload: unknown) => void>>();
  private connected = false;
  private serverInfo: { version: string; connId: string; features: { methods: string[]; events: string[] } } | null = null;

  constructor(options: GatewayClientOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.options.gatewayUrl);

      this.ws.on('open', () => {
        // Send connect frame
        const connectFrame = {
          type: 'req',
          id: uuidv4(),
          method: 'connect',
          params: {
            minProtocol: 1,
            maxProtocol: 1,
            client: {
              id: 'clawdini',
              displayName: 'Clawdini',
              version: '0.1.0',
              platform: 'node',
              mode: 'client',
            },
            scopes: this.options.scopes || ['operator.read', 'operator.write'],
            auth: this.options.token ? { token: this.options.token } : undefined,
          },
        };
        this.ws!.send(JSON.stringify(connectFrame));
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const frame: Frame = JSON.parse(data.toString());
          this.handleFrame(frame);
        } catch (e) {
          console.error('Failed to parse frame:', e);
        }
      });

      this.ws.on('error', (error) => {
        reject(error);
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.emitEvent('connectionClosed', {});
      });

      // Wait for hello-ok response
      const originalHandler = this.handleFrame.bind(this);
      this.handleFrame = (frame: Frame) => {
        if (frame.type === 'res' && (frame as ResponseFrame).payload && (frame as ResponseFrame).ok) {
          const payload = (frame as ResponseFrame).payload as { protocol: number; server: { version: string; connId: string; features: { methods: string[]; events: string[] } } };
          this.serverInfo = payload.server;
          this.connected = true;
          resolve();
        }
        originalHandler(frame);
      };

      // Timeout
      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  private handleFrame(frame: Frame): void {
    if (frame.type === 'res') {
      const { id, ok, payload, error } = frame as ResponseFrame;
      const pending = this.pendingRequests.get(id);
      if (pending) {
        if (ok) {
          pending.resolve(payload);
        } else {
          pending.reject(new Error(error?.message || 'Request failed'));
        }
        this.pendingRequests.delete(id);
      }
    } else if (frame.type === 'event') {
      const { event, payload } = frame as EventFrame;
      this.emitEvent(event, payload);
    }
  }

  private emitEvent(event: string, payload: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => listener(payload));
    }
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      const id = uuidv4();
      const frame: RequestFrame = { type: 'req', id, method, params };
      this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.ws!.send(JSON.stringify(frame));

      // Timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  on(event: string, handler: (payload: unknown) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  }

  off(event: string, handler: (payload: unknown) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(handler);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  async listAgents(): Promise<AgentsListResponse> {
    return this.request<AgentsListResponse>('agents.list');
  }

  async chatSend(sessionKey: string, message: string, idempotencyKey?: string): Promise<{ runId: string }> {
    return this.request<{ runId: string }>('chat.send', {
      sessionKey,
      message,
      idempotencyKey: idempotencyKey || uuidv4(),
      timeoutMs: 120000,
    });
  }

  async chatAbort(sessionKey: string, runId?: string): Promise<void> {
    await this.request('chat.abort', { sessionKey, runId });
  }

  async sessionsReset(sessionKey: string): Promise<void> {
    await this.request('sessions.reset', { key: sessionKey, reason: 'new' });
  }
}
