// Clawdini Server - Main entry point
import express from 'express';
import cors from 'cors';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { GatewayClient } from './gateway/client.js';
import { createRouter } from './api/routes.js';

const PORT = process.env.PORT || 3001;

// Load OpenClaw config to get tokens
function loadOpenClawConfig() {
  const configPath = join(homedir(), '.openclaw', 'openclaw.json');
  try {
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      return {
        token: config.token || process.env.OPENCLAW_TOKEN,
        gatewayToken: config.gateway?.auth?.token || process.env.OPENCLAW_GATEWAY_TOKEN,
      };
    }
  } catch {
    // Ignore
  }
  return {
    token: process.env.OPENCLAW_TOKEN,
    gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN,
  };
}

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Gateway URL from env or default ( Crabwalk uses 18789 )
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';
  const config = loadOpenClawConfig();

  console.log('='.repeat(50));
  console.log('Clawdini Server v0.1.0');
  console.log('='.repeat(50));
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Gateway: ${gatewayUrl}`);
  console.log('='.repeat(50));

  // Create Gateway client with gateway token from config
  const gatewayClient = new GatewayClient({
    gatewayUrl,
    token: config.gatewayToken,
    scopes: ['operator.read', 'operator.write', 'operator.admin'],
  });

  // Try to connect, but don't fail if Gateway isn't available
  try {
    await gatewayClient.connect();
    console.log('✓ Connected to Gateway');
  } catch (error) {
    console.log('⚠ Gateway not connected (will retry on API calls):', error instanceof Error ? error.message : 'Connection failed');
  }

  // API routes
  app.use('/api', createRouter(gatewayClient));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      gatewayConnected: gatewayClient.isConnected(),
      gatewayUrl,
    });
  });

  app.listen(PORT, () => {
    console.log(`✓ Clawdini UI API ready at http://localhost:${PORT}/api`);
    console.log('');
  });
}

main().catch(console.error);
