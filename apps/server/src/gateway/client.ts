// GatewayClient - WebSocket client for OpenClaw Gateway (based on Crabwalk)
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { AgentInfo, AgentsListResponse } from '@clawdini/types';

export interface GatewayClientOptions {
  gatewayUrl?: string;
  token?: string;
  scopes?: string[];
}

const DEFAULT_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';

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

interface HelloOk {
  type: 'hello-ok';
  protocol: number;
  server?: { version: string; connId: string; features: { methods: string[]; events: string[] } };
}

type Frame = RequestFrame | ResponseFrame | EventFrame;

export class GatewayClient {
  private ws: WebSocket | null = null;
  private options: GatewayClientOptions;
  private pendingRequests = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private eventListeners = new Map<string, Set<(payload: unknown) => void>>();
  private connected = false;
  private connecting = false;
  private serverInfo: { version: string; connId: string; features: { methods: string[]; events: string[] } } | null = null;

  constructor(options: GatewayClientOptions = {}) {
    this.options = {
      gatewayUrl: options.gatewayUrl || DEFAULT_GATEWAY_URL,
      token: options.token,
      scopes: options.scopes || ['operator.admin'],
    };
  }

  async connect(): Promise<void> {
    if (this.connecting || this.connected) {
      return Promise.resolve();
    }

    this.connecting = true;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.connecting = false;
        this.ws?.close();
        reject(new Error('Connection timeout - is OpenClaw Gateway running?'));
      }, 10000);

      try {
        this.ws = new WebSocket(this.options.gatewayUrl!);
      } catch (e) {
        clearTimeout(timeout);
        reject(new Error(`Failed to create WebSocket: ${e}`));
        return;
      }

      this.ws.on('open', () => {
        // WebSocket connected, now send connect request
        const connectFrame = {
          type: 'req',
          id: `connect-${Date.now()}`,
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: 'cli',
              displayName: 'Clawdini',
              version: '0.1.0',
              platform: 'linux',
              mode: 'cli',
            },
            role: 'operator',
            scopes: this.options.scopes || ['operator.read', 'operator.write', 'operator.admin'],
            caps: [],
            commands: [],
            permissions: {},
            auth: this.options.token ? { token: this.options.token } : undefined,
          },
        };
        console.log('[gateway] Sending connect with scopes:', JSON.stringify(this.options.scopes));
        this.ws!.send(JSON.stringify(connectFrame));
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const raw = data.toString();
          console.log('[gateway] Raw message:', raw.slice(0, 200));
          const msg = JSON.parse(raw);
          this.handleMessage(msg as Frame, resolve, reject, timeout);
        } catch (e) {
          console.error('[gateway] Failed to parse message:', e);
        }
      });

      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        this.connecting = false;
        reject(err);
      });

      this.ws.on('close', () => {
        clearTimeout(timeout);
        const wasConnected = this.connected;
        this.connected = false;
        this.connecting = false;
      });
    });
  }

  private handleMessage(
    msg: Frame | HelloOk,
    connectResolve?: (v: void) => void,
    connectReject?: (e: Error) => void,
    connectTimeout?: ReturnType<typeof setTimeout>
  ): void {
    if ('type' in msg) {
      switch (msg.type) {
        case 'hello-ok':
          if (connectTimeout) clearTimeout(connectTimeout);
          this.connected = true;
          this.connecting = false;
          if (msg.server) {
            this.serverInfo = msg.server;
          }
          connectResolve?.();
          break;

        case 'res':
          // Check if this is the hello-ok response to our connect request
          if (msg.ok && (msg.payload as HelloOk)?.type === 'hello-ok') {
            if (connectTimeout) clearTimeout(connectTimeout);
            this.connected = true;
            this.connecting = false;
            if (msg.payload && typeof msg.payload === 'object' && 'server' in msg.payload) {
              this.serverInfo = (msg.payload as { server: any }).server;
            }
            connectResolve?.();
          } else {
            this.handleResponse(msg);
          }
          break;

        case 'event':
          this.handleEvent(msg);
          break;
      }
    }
  }

  private handleResponse(res: ResponseFrame): void {
    const pending = this.pendingRequests.get(res.id);
    if (pending) {
      this.pendingRequests.delete(res.id);
      if (res.ok) {
        pending.resolve(res.payload);
      } else {
        pending.reject(new Error(res.error?.message || 'Request failed'));
      }
    }
  }

  private handleEvent(event: EventFrame): void {
    const listeners = this.eventListeners.get(event.event);
    if (listeners) {
      listeners.forEach((listener) => listener(event.payload));
    }
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || !this.connected) {
      throw new Error('Not connected');
    }

    const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const frame: RequestFrame = { type: 'req', id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.ws!.send(JSON.stringify(frame));

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
    this.connecting = false;
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
