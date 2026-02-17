// GatewayClient - WebSocket client for OpenClaw Gateway (based on Crabwalk)
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { AgentInfo, AgentsListResponse } from '@clawdini/types';

export interface GatewayClientOptions {
  gatewayUrl?: string;
  token?: string;
  scopes?: string[];
}

interface DeviceIdentity {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

const DEFAULT_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';

function fingerprintPublicKey(publicKeyPem: string): string {
  const raw = derivePublicKeyRaw(publicKeyPem);
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function loadOrCreateDeviceIdentity(): DeviceIdentity | null {
  const devicePath = path.join(process.env.HOME || '/root', '.openclaw/identity/device.json');
  try {
    if (fs.existsSync(devicePath)) {
      const data = JSON.parse(fs.readFileSync(devicePath, 'utf-8'));
      if (data?.deviceId && data?.publicKeyPem && data?.privateKeyPem) {
        const derivedId = fingerprintPublicKey(data.publicKeyPem as string);
        if (derivedId && derivedId !== data.deviceId) {
          // Heal stale deviceId values (older formats).
          const updated = { ...data, deviceId: derivedId };
          try {
            fs.mkdirSync(path.dirname(devicePath), { recursive: true });
            fs.writeFileSync(devicePath, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 });
            try {
              fs.chmodSync(devicePath, 0o600);
            } catch {
              // best-effort
            }
          } catch {
            // best-effort
          }
          return {
            deviceId: derivedId,
            publicKeyPem: data.publicKeyPem as string,
            privateKeyPem: data.privateKeyPem as string,
          };
        }
        return data as DeviceIdentity;
      }
    }
  } catch {
    // fall through to create
  }

  // Create identity if missing. This matches OpenClaw's identity format (ed25519 keypair).
  try {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const deviceId = fingerprintPublicKey(publicKeyPem);
    const stored = {
      version: 1,
      deviceId,
      publicKeyPem,
      privateKeyPem,
      createdAtMs: Date.now(),
    };
    fs.mkdirSync(path.dirname(devicePath), { recursive: true });
    fs.writeFileSync(devicePath, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
    try {
      fs.chmodSync(devicePath, 0o600);
    } catch {
      // best-effort
    }
    return { deviceId, publicKeyPem, privateKeyPem };
  } catch {
    console.warn('[gateway] No device identity available, using token auth only');
    return null;
  }
  return null;
}

function base64UrlEncode(buffer: Buffer): string {
  // Keep encoding consistent with OpenClaw (no padding).
  return buffer
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/g, '');
}

// Matches OpenClaw's device identity format: sha256(raw_ed25519_public_key_bytes).
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const key = crypto.createPublicKey(publicKeyPem);
  const spki = key.export({ type: 'spki', format: 'der' }) as Buffer;
  // For ed25519 keys, strip the SPKI prefix and keep the 32-byte raw key.
  if (
    spki.length === ED25519_SPKI_PREFIX.length + 32 &&
    spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }
  return spki;
}

function publicKeyRawBase64UrlFromPem(publicKeyPem: string): string {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem));
}

function buildDeviceAuthPayload(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce?: string | null;
}): string {
  const version = params.nonce ? 'v2' : 'v1';
  const scopes = params.scopes.join(',');
  const token = params.token ?? '';
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
  ];
  if (version === 'v2') {
    base.push(params.nonce ?? '');
  }
  return base.join('|');
}

function signDevicePayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  const sig = crypto.sign(null, Buffer.from(payload, 'utf8'), key);
  return base64UrlEncode(sig);
}

interface ChallengePayload {
  nonce: string;
  ts: number;
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
  private deviceIdentity: DeviceIdentity | null = null;

  constructor(options: GatewayClientOptions = {}) {
    this.options = {
      gatewayUrl: options.gatewayUrl || DEFAULT_GATEWAY_URL,
      token: options.token,
      // Default to admin to get all scopes
      scopes: options.scopes || ['operator.admin'],
    };
    // Load device identity for authenticated handshake
    this.deviceIdentity = loadOrCreateDeviceIdentity();
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

      let connectSent = false;
      const sendConnect = () => {
        if (connectSent || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        connectSent = true;

        const scopes = this.options.scopes || ['operator.admin'];
        const role = 'operator';
        const signedAtMs = Date.now();

        // Build device auth for proper scope assignment
        let device:
          | { id: string; publicKey: string; signature: string; signedAt: number; nonce?: string }
          | undefined;
        if (this.deviceIdentity) {
          const payload = buildDeviceAuthPayload({
            deviceId: this.deviceIdentity.deviceId,
            clientId: 'cli',
            clientMode: 'cli',
            role,
            scopes,
            signedAtMs,
            token: this.options.token ?? null,
            nonce: connectNonce,
          });
          const signature = signDevicePayload(this.deviceIdentity.privateKeyPem, payload);
          device = {
            id: this.deviceIdentity.deviceId,
            publicKey: publicKeyRawBase64UrlFromPem(this.deviceIdentity.publicKeyPem),
            signature,
            signedAt: signedAtMs,
            ...(connectNonce ? { nonce: connectNonce } : {}),
          };
        }

        const connectFrame: RequestFrame = {
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
            role,
            scopes,
            caps: [],
            commands: [],
            permissions: {},
            locale: 'en-US',
            userAgent: 'clawdini/0.1.0',
            auth: this.options.token ? { token: this.options.token } : undefined,
            device,
          },
        };
        console.log('[gateway] Sending connect with scopes:', JSON.stringify(scopes), device ? '(with device auth)' : '(token only)');
        this.ws.send(JSON.stringify(connectFrame));
      };

      let connectNonce: string | null = null;

      this.ws.on('open', () => {
        // OpenClaw gateway uses challenge-response auth; wait for connect.challenge.
        // If gateway doesn't emit a challenge (or no token), fall back to sending connect soon.
        if (!this.options.token) {
          sendConnect();
          return;
        }
        setTimeout(() => sendConnect(), 1000);
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const raw = data.toString();
          const msg = JSON.parse(raw);
          // Challenge-response auth (mirrors crabwalk).
          if (msg?.type === 'event' && msg?.event === 'connect.challenge') {
            const p = msg.payload as ChallengePayload;
            if (p && typeof p.nonce === 'string') {
              connectNonce = p.nonce;
            }
            sendConnect();
            return;
          }
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
          console.log('[gateway] res:', msg.id, 'ok:', msg.ok, 'payload:', msg.payload ? JSON.stringify(msg.payload).slice(0, 200) : 'none');
          // Check if this is the hello-ok response to our connect request
          if (msg.ok && (msg.payload as HelloOk)?.type === 'hello-ok') {
            console.log('[gateway] Connected! Setting connected=true');
            if (connectTimeout) clearTimeout(connectTimeout);
            this.connected = true;
            this.connecting = false;
            if (msg.payload && typeof msg.payload === 'object' && 'server' in msg.payload) {
              this.serverInfo = (msg.payload as { server: any }).server;
            }
            connectResolve?.();
          } else if (!msg.ok) {
            console.error('[gateway] Connect failed:', msg.error);
            if (connectTimeout) clearTimeout(connectTimeout);
            this.connecting = false;
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
      await this.connect();
    }
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

  async listModels(): Promise<{ models: Array<{ id: string; name: string; provider: string }> }> {
    return this.request<{ models: Array<{ id: string; name: string; provider: string }> }>('models.list');
  }

  async chatSend(sessionKey: string, message: string, idempotencyKey?: string, modelId?: string): Promise<{ runId: string }> {
    const params: Record<string, unknown> = {
      sessionKey,
      message,
      idempotencyKey: idempotencyKey || uuidv4(),
      timeoutMs: 120000,
    };
    if (modelId) {
      params.modelId = modelId;
    }
    return this.request<{ runId: string }>('chat.send', params);
  }

  async chatAbort(sessionKey: string, runId?: string): Promise<void> {
    await this.request('chat.abort', { sessionKey, runId });
  }

  async sessionsReset(sessionKey: string): Promise<void> {
    await this.request('sessions.reset', { key: sessionKey, reason: 'new' });
  }
}
