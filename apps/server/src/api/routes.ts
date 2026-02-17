// API routes for Clawdini server
import express from 'express';
import { GatewayClient } from '../gateway/client.js';
import { GraphRunner } from '../runner/graph-runner.js';
import type { StartRunRequest, RunEvent, AgentsListResponse } from '@clawdini/types';
import { v4 as uuidv4 } from 'uuid';

// Mock agents for when gateway doesn't have operator.read scope
const MOCK_AGENTS: AgentsListResponse = {
  defaultId: 'main',
  mainKey: 'main',
  agents: [
    { id: 'main', name: 'Main Agent', identity: { name: 'Assistant', theme: 'blue', emoji: '🤖' } },
  ],
};

interface RunContext {
  runner: GraphRunner;
  aborted: boolean;
  sseRes: express.Response | null;
  buffer: RunEvent[];
}

export function createRouter(gatewayClient: GatewayClient): express.Router {
  const router = express.Router();
  const runs = new Map<string, RunContext>();

  const writeSse = (res: express.Response, event: RunEvent | { type: string; [k: string]: unknown }) => {
    // Use default SSE "message" event so browser EventSource `onmessage` receives it.
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // GET /api/agents - list available agents
  router.get('/agents', async (req, res) => {
    try {
      const agents = await gatewayClient.listAgents();
      res.json(agents);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes('missing scope')) {
        console.log('[api] Using mock agents');
        res.json(MOCK_AGENTS);
      } else {
        res.status(500).json({ error: errMsg });
      }
    }
  });

  // POST /api/run - start a run
  router.post('/run', async (req, res) => {
    try {
      const { graph, input } = req.body as StartRunRequest;

      console.log('[api] POST /run received');
      console.log('[api] Graph nodes:', graph?.nodes?.length);
      console.log('[api] Graph edges:', graph?.edges?.length);

      if (!graph || !graph.nodes || !graph.edges) {
        console.log('[api] Invalid graph!');
        res.status(400).json({ error: 'Invalid graph' });
        return;
      }

      const runId = uuidv4();
      console.log('[api] Created runId:', runId);

      // Event handler that sends to SSE endpoint
      const eventHandler = (event: RunEvent) => {
        const run = runs.get(runId);
        if (!run) return;

        // Always buffer so the UI can connect after the run starts.
        run.buffer.push(event);
        if (run.buffer.length > 500) run.buffer.shift();

        if (run.sseRes && !run.sseRes.writableEnded) {
          writeSse(run.sseRes, event);
        }
      };

      const runner = new GraphRunner(gatewayClient, eventHandler);
      runs.set(runId, { runner, aborted: false, sseRes: null, buffer: [] });

      // Start the run asynchronously (don't wait)
      runner.run(graph, input).then(() => {
        console.log('[api] Run completed, cleaning up after delay');
        // Keep run in map for 10 more seconds to allow SSE clients to connect
        setTimeout(() => {
          console.log('[api] Final cleanup for run:', runId);
          runs.delete(runId);
        }, 10000);
      }).catch((err) => {
        console.error('[api] Run error:', err);
        setTimeout(() => {
          runs.delete(runId);
        }, 10000);
      });

      console.log('[api] Sending runId to client:', runId);
      res.json({ runId });
    } catch (error) {
      console.error('[api] Error starting run:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to start run' });
    }
  });

  // GET /api/run/:runId/events - SSE stream
  router.get('/run/:runId/events', (req, res) => {
    const { runId } = req.params as { runId: string };

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const run = runs.get(runId);
    if (!run) {
      writeSse(res, { type: 'error', error: 'Run not found' });
      res.end();
      return;
    }

    // Store the SSE response for this run
    run.sseRes = res;

    // Send initial event and flush any buffered events.
    writeSse(res, { type: 'connected', runId });
    for (const evt of run.buffer) {
      writeSse(res, evt);
    }

    res.on('close', () => {
      const currentRun = runs.get(runId);
      if (currentRun) {
        currentRun.sseRes = null;
      }
    });
  });

  // POST /api/run/:runId/cancel - cancel a run
  router.post('/run/:runId/cancel', async (req, res) => {
    const { runId } = req.params as { runId: string };
    const run = runs.get(runId);

    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    run.aborted = true;
    await run.runner.cancel();
    runs.delete(runId);

    res.json({ ok: true });
  });

  return router;
}
