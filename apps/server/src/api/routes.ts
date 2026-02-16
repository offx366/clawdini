// API routes for Clawdini server
import express from 'express';
import { GatewayClient } from '../gateway/client.js';
import { GraphRunner } from '../runner/graph-runner.js';
import type { StartRunRequest, RunEvent } from '@clawdini/types';
import { v4 as uuidv4 } from 'uuid';

export function createRouter(gatewayClient: GatewayClient): express.Router {
  const router = express.Router();
  const runs = new Map<string, { runner: GraphRunner; aborted: boolean }>();

  // GET /api/agents - list available agents
  router.get('/agents', async (req, res) => {
    try {
      const agents = await gatewayClient.listAgents();
      res.json(agents);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch agents' });
    }
  });

  // POST /api/run - start a run
  router.post('/run', async (req, res) => {
    try {
      const { graph, input } = req.body as StartRunRequest;

      if (!graph || !graph.nodes || !graph.edges) {
        res.status(400).json({ error: 'Invalid graph' });
        return;
      }

      const runId = uuidv4();

      // Set up event emitter for SSE
      const clients = new Set<(event: RunEvent) => void>();

      const eventHandler = (event: RunEvent) => {
        clients.forEach((client) => client(event));
      };

      const runner = new GraphRunner(gatewayClient, eventHandler);
      runs.set(runId, { runner, aborted: false });

      // Start the run (don't await - run in background)
      runner.run(graph, input).then(() => {
        runs.delete(runId);
      });

      res.json({ runId });
    } catch (error) {
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
      res.write('event: error\ndata: {"error":"Run not found"}\n\n');
      res.end();
      return;
    }

    // For simplicity, we use a simple approach - check for abort
    const checkAbort = setInterval(() => {
      if (run.aborted) {
        clearInterval(checkAbort);
        res.end();
      }
    }, 1000);

    res.on('close', () => {
      clearInterval(checkAbort);
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
