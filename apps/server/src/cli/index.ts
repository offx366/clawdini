#!/usr/bin/env node
// Clawdini CLI - Command line tool for managing workflows

const API_BASE = process.env.CLAWDINI_API || 'http://localhost:3001/api';

async function request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) (options as any).body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, options);
  const data = (await res.json()) as any;
  if (!res.ok) {
    console.error('Error:', data);
    throw new Error(data.error || 'Request failed');
  }
  return data as T;
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  switch (cmd) {
    case 'agents':
      console.log('Available agents:');
      const agents = await request('GET', '/agents');
      console.log(JSON.stringify(agents, null, 2));
      break;

    case 'run': {
      // Parse graph from arguments or use stdin
      let graph;
      if (args[1] === '-') {
        const stdin = await readStdin();
        graph = JSON.parse(stdin);
      } else if (args[1]) {
        const fs = await import('fs');
        graph = JSON.parse(fs.readFileSync(args[1], 'utf-8'));
      } else {
        // Default test graph
        graph = {
          id: 'cli-test',
          name: 'CLI Test',
          nodes: [
            { id: '1', type: 'clawdiniNode', position: { x: 100, y: 100 }, data: { type: 'input', label: 'Input', prompt: args.slice(2).join(' ') || 'hello' } },
            { id: '2', type: 'clawdiniNode', position: { x: 300, y: 100 }, data: { type: 'output', label: 'Output' } },
          ],
          edges: [{ id: '1-2', source: '1', target: '2' }],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      }

      console.log('Starting run...');
      const { runId } = await request<{ runId: string }>('POST', '/run', { graph });
      console.log('Run ID:', runId);

      // Connect to SSE
      console.log('Connecting to events...');
      const events = await fetch(`${API_BASE}/run/${runId}/events`);
      const reader = (events.body as any)?.getReader?.();
      if (!reader) {
        console.error('Failed to get reader');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            console.log(`[${data.type}]`, data.nodeId || '', data.data || data.error || '');
          }
        }
      }
      break;
    }

    case 'run-agent': {
      // Simple agent test with Input -> Agent -> Output
      const prompt = args.slice(2).join(' ') || 'What is the capital of UK?';
      const graph = {
        id: 'cli-agent-test',
        name: 'CLI Agent Test',
        nodes: [
          { id: 'input1', type: 'clawdiniNode', position: { x: 100, y: 100 }, data: { type: 'input', label: 'Input', prompt } },
          { id: 'agent1', type: 'clawdiniNode', position: { x: 300, y: 100 }, data: { type: 'agent', label: 'Agent', agentId: 'main' } },
          { id: 'output1', type: 'clawdiniNode', position: { x: 500, y: 100 }, data: { type: 'output', label: 'Output' } },
        ],
        edges: [
          { id: 'e1', source: 'input1', target: 'agent1' },
          { id: 'e2', source: 'agent1', target: 'output1' },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      console.log('Running agent with prompt:', prompt);
      const { runId } = await request<{ runId: string }>('POST', '/run', { graph });
      console.log('Run ID:', runId);
      console.log('Waiting for completion...');

      // Wait for run to complete
      await new Promise(resolve => setTimeout(resolve, 20000));

      // Check final status
      console.log('\nFinal events:');
      try {
        const eventsRes = await fetch(`${API_BASE}/run/${runId}/events`);
        const text = await eventsRes.text();
        console.log(text);
      } catch (e) {
        console.log('Run completed (SSE stream closed)');
      }
      break;
    }

    case 'help':
    default:
      console.log(`
Clawdini CLI

Usage:
  clawdini agents              List available agents
  clawdini run [file]         Run a workflow from file or use default
  clawdini run -              Run a workflow from stdin
  clawdini run-agent [prompt] Run a simple Input -> Agent -> Output workflow

Examples:
  clawdini agents
  clawdini run-agent "What is the capital of UK?"
  clawdini run graph.json
  echo '{"nodes":[],"edges":[]}' | clawdini run -
`);
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

main().catch(console.error);
