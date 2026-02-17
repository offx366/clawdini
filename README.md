# Clawdini

> Houdini/Nuke for agents - vertical node-based workflow orchestrator

A visual workflow editor for orchestrating AI agents using OpenClaw Gateway. Build complex agent pipelines by connecting nodes in a graph.

## Features

- **Visual Node Editor** - Drag and drop nodes to build workflows
- **Multiple Node Types**:
  - **Input** - Define prompts/inputs
  - **Agent** - Execute AI agents with optional model selection
  - **Merge** - Combine multiple agent outputs (concat or LLM)
  - **Output** - Capture final results
- **Model Selection** - Choose different AI models per agent node
- **Parallel Execution** - Agents run in parallel when not dependent on each other
- **Real-time Streaming** - See agent responses as they generate
- **Local Storage Persistence** - Graphs persist across browser sessions

## Quick Start

```bash
# Clone and install
pnpm install

# Start all services
./start.sh

# Stop services
./stop.sh
```

Then open http://localhost:3000

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        UI (React + ReactFlow)            │
│                    http://localhost:3000                │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                     Server (Node.js)                     │
│                    http://localhost:3001                │
│  - Graph execution engine                                │
│  - SSE event streaming                                    │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│                  OpenClaw Gateway                       │
│               ws://127.0.0.1:18789                      │
│  - Agent execution                                       │
│  - Model management                                      │
└─────────────────────────────────────────────────────────┘
```

## Node Types

### Input Node
Defines the input/prompt for downstream nodes.

**Properties:**
- `label` - Display name
- `prompt` - The text prompt

### Agent Node
Executes an AI agent via OpenClaw Gateway.

**Properties:**
- `label` - Display name
- `agentId` - Which agent to use (e.g., "main")
- `modelId` - Optional model override (e.g., "google/gemini-3-flash-preview")

Available models can be viewed in the Inspector when an agent node is selected.

### Merge Node
Combines outputs from multiple upstream nodes.

**Properties:**
- `label` - Display name
- `mode` - Merge strategy:
  - `concat` - Concatenate all inputs
  - `llm` - Use LLM to merge/rewrite inputs

### Output Node
Captures the final output of the workflow.

**Properties:**
- `label` - Display name

## API

### POST /api/run
Execute a graph.

```bash
curl -X POST http://localhost:3001/api/run \
  -H "Content-Type: application/json" \
  -d '{
    "graph": {
      "id": "my-workflow",
      "nodes": [
        {"id": "n1", "type": "clawdiniNode", "data": {"type": "input", "label": "Input", "prompt": "Hello"}},
        {"id": "n2", "type": "clawdiniNode", "data": {"type": "agent", "label": "Agent", "agentId": "main"}}
      ],
      "edges": [{"id": "e1", "source": "n1", "target": "n2"}]
    }
  }'
```

### GET /api/run/:runId/events
Subscribe to SSE events for a run.

Events:
- `connected` - Subscription established
- `runStarted` - Run has begun
- `nodeStarted` - A node started executing
- `nodeDelta` - Streaming text chunk from agent
- `nodeFinal` - Node completed with final output
- `nodeError` - Node failed
- `runCompleted` - Entire workflow finished

### GET /api/models
List available models from the gateway.

### GET /api/agents
List available agents from the gateway.

## Configuration

### Environment Variables
- `OPENCLAW_GATEWAY_URL` - Gateway WebSocket URL (default: ws://127.0.0.1:18789)

### Scripts

```bash
./start.sh    # Start UI, Server, Gateway
./stop.sh     # Stop UI and Server (Gateway stays)
```

## Tech Stack

- **Frontend**: React, ReactFlow, Zustand
- **Backend**: Node.js, Express, WebSocket
- **Gateway**: OpenClaw Gateway (protocol v3)

## License

MIT
