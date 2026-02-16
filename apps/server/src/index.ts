// Clawdini Server - Main entry point
import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { GatewayClient } from './gateway/client.js';
import { createRouter } from './api/routes.js';

const PORT = process.env.PORT || 3001;

// Load OpenClaw config to get token
function loadOpenClawConfig() {
  const configPath = join(homedir(), '.openclaw', 'openclaw.json');
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return config.token || process.env.OPENCLAW_TOKEN;
  } catch {
    return process.env.OPENCLAW_TOKEN;
  }
}

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Gateway URL from env or default
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || 'ws://localhost:3000/ws';
  const token = loadOpenClawConfig();

  console.log('Connecting to Gateway:', gatewayUrl);

  // Create Gateway client
  const gatewayClient = new GatewayClient({
    gatewayUrl,
    token,
    scopes: ['operator.read', 'operator.write'],
  });

  try {
    await gatewayClient.connect();
    console.log('Connected to Gateway');
  } catch (error) {
    console.error('Failed to connect to Gateway:', error);
    console.log('Note: Gateway must be running. Set OPENCLAW_GATEWAY_URL if needed.');
    process.exit(1);
  }

  // API routes
  app.use('/api', createRouter(gatewayClient));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', gatewayConnected: gatewayClient.isConnected() });
  });

  app.listen(PORT, () => {
    console.log(`Clawdini server running on http://localhost:${PORT}`);
  });
}

main().catch(console.error);
