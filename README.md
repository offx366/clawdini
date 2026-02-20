# Clawdini

> Houdini/Nuke for agents - vertical node-based workflow orchestrator

![Clawdini Workflow](screenshot_v2.png)

A visual workflow editor for orchestrating AI agents using OpenClaw Gateway. Build complex agent pipelines by connecting nodes in a graph. Supports parallel execution, model selection, and intelligent merging.

## Features

- **Visual Node Editor** - Drag and drop nodes to build workflows
- **11 Node Types**:
  - **Input** - Define prompts/inputs
  - **Agent** - Execute AI agents with optional model selection
  - **Merge** - Combine multiple agent outputs (concat or LLM)
  - **Judge** - Evaluate outputs using LLMs to create strict `Decision` payloads
  - **Switch** - Route execution via Regex or nested JSON field matches
  - **Extract** - Force LLMs to output guaranteed JSON schemas
  - **Invoke** - Execute external OpenClaw system commands
  - **ForEach** - Parallel Map/Reduce sub-graph execution over arrays
  - **State** - Persist and aggregate cross-run Memory into global namespaces
  - **Template** - Build Prompts by fusing variables using Handlebars tags
  - **Output** - Capture final results
- **Model Selection** - Choose different AI models per agent/merge node
- **Parallel Execution** - Agents run in parallel when not dependent on each other
- **LLM Merge** - AI-powered intelligent merging of multiple outputs
- **Real-time Streaming** - See agent responses as they generate
- **Local Storage Persistence** - Graphs persist across browser sessions
- **SSE Events** - Real-time progress updates via Server-Sent Events

## Recent updates

- **Visual Agent OS (v0.2 Sprint 1):** Upgraded Clawdini from a text-processor to a robust multi-agent orchestration pipeline. Added strongly typed schema support (`NodePayload`) across ports.
- **Added 6 Core OS Nodes:** Deployed Judge (Structured Decisions), State (Cross-node Memory), Template (Prompt Fusion), Switch (Deep JSON Routing), Extract (Guaranteed JSON schema output), and Invoke (OpenClaw bridge).
- **Advanced Draft Improvement Loops:** The backend `GraphRunner` now natively supports iterative generation scenarios, halting, looping, and map/reduction over arrays (`ForEach`).

## Quick Start

```bash
# Install dependencies
pnpm install

# Start all services (Gateway, Server, UI)
./start.sh

# Open browser
http://localhost:3000

# When done, stop services
./stop.sh
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      UI (React + ReactFlow)                 │
│                      http://localhost:3000                  │
│  - Drag & drop node editor                                  │
│  - Real-time workflow visualization                         │
│  - Node Inspector panel                                    │
│  - Run log panel                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Server (Node.js + Express)              │
│                    http://localhost:3001                    │
│  - Graph execution engine (levels-based)                    │
│  - SSE event streaming                                      │
│  - OpenClaw Gateway WebSocket client                        │
│  - REST API for runs                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  OpenClaw Gateway (Protocol v3)            │
│                  ws://127.0.0.1:18789                      │
│  - Agent execution                                          │
│  - Model management                                         │
│  - Session management                                       │
│  - Device authentication                                    │
└─────────────────────────────────────────────────────────────┘
```

## OpenClaw Gateway Integration

To successfully execute agents and utilize the underlying LLMs, the Clawdini server establishes a persistent WebSocket connection to the OpenClaw Gateway (default `ws://127.0.0.1:18789`). The connection relies on **OpenClaw Protocol v3** and implements a secure, challenge-response authentication handshake:

1. **Device Identity Generation**: Upon startup, the server looks for an identity file at `~/.openclaw/identity/device.json`. If it doesn't exist, the server generates a fresh `ed25519` keypair, hashes the raw public key to derive a unique `deviceId`, and securely saves it.
2. **WebSocket Handshake**: The server connects to the Gateway and waits for a `connect.challenge` event containing a cryptographic `nonce`.
3. **Challenge-Response Auth**: Using its private `ed25519` key, the server signs a heavily structured payload consisting of the required scopes, the nonce, device ID, and platform metadata.
4. **Session Activation**: Clawdini dispatches a `connect` JSON-RPC method request carrying the generated signature, requesting full admin scopes (`operator.read, operator.write, operator.admin`). The gateway validates the signature and replies with a `hello-ok`, granting full access to agent endpoints.

### Agent Identities & SOUL.md Synchronization

It is important to understand how Clawdini nodes map to OpenClaw's internal architecture:

- **Clawdini Nodes are NOT OpenClaw "Sub-Agents"**: According to OpenClaw documentation, built-in sub-agents run in a restricted context and **do not** load `SOUL.md`, `IDENTITY.md`, or `USER.md`. Because we want Clawdini to support fully personalized agents with their own identities, Clawdini executes each node as a **standard independent session** (e.g., `agent:<agentId>:clawdini:...`).
- **Synchronized SOULs**: Because Clawdini runs them as standard sessions, OpenClaw **does** inject the `SOUL.md` file associated with the selected `agentId` (e.g., `~/.openclaw/agents/<agentId>/SOUL.md`). This means the agents running inside Clawdini perfectly synchronize with the base personalities, core truths, and restrictions defined in their OpenClaw `SOUL.md` files.
- **Dynamic Roles**: If you select a specific role (like "Planner" or "Critic") in the Clawdini UI, Clawdini dynamically injects a system prompt payload *on top of* the existing OpenClaw `SOUL.md`. This allows you to combine OpenClaw's foundational identities with Clawdini's task-specific graph roles.

Once active, the server acts as an intelligent bridge, wrapping Agent/Merge/Judge node executions into `chat.send` WS payloads. Each node uses distinct `sessionKey` prefixes (e.g., `agent:main:clawdini:...`) to correctly route execution on the gateway side, parsing `delta` responses and continuously feeding the browser UI via Server-Sent Events (SSE).

## Node Types

### Input Node
The starting point of your workflow. Defines the input/prompt that will be sent to downstream nodes.

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `label` | string | Display name in the editor |
| `prompt` | string | The text prompt to send to agents |

**Usage:**
```
[Input] ──────► [Agent]
```

---

### Template Node
The Template Builder injects static text with variables populated from upstream nodes or global data namespaces using a Handlebars-like syntax (e.g. `{{state.feedback}}` or `{{Agent1.text}}`).

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `label` | string | Display name |
| `template`| string | The raw text specifying what to render |
| `format` | string | 'text' or 'json' for strict parsing. |

**Usage:**
```
[Input] ──────► [Template] ──────► [Agent]
```

---

### Agent Node
Executes an AI agent via OpenClaw Gateway. This is where the magic happens - you can select which agent to use and optionally override the model.

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `label` | string | Display name |
| `agentId` | string | Agent ID to use (e.g., "main") |
| `modelId` | string (optional) | Model override (e.g., "google/gemini-3-flash-preview") |
| `status` | string | Current execution status |
| `output` | string | Generated output (after run) |

**Available Models:**
- `google/gemini-3-flash-preview` - Google Gemini Flash
- `google-antigravity/gemini-3-flash` - Google Gemini Flash (antigravity)
- `fireworks/accounts/fireworks/models/kimi-k2p5` - Fireworks AI
- `minimax/MiniMax-Text-01` - MiniMax
- `nvidia/moonshotai/kimi-k2.5` - NVIDIA hosted
- `openrouter/moonshotai/kimi-k2.5` - OpenRouter

**Usage:**
```
[Input] ──────► [Agent: main] ──────► [Output]
```

**Parallel Execution:**
```
[Input] ──────► [Agent: gemini] ──┐
       │                            ├──► [Merge]
       └──────► [Agent: default] ──┘
```
When agents receive input from the same source, they execute in parallel.

---

### Merge Node
Combines outputs from multiple upstream nodes. Supports two modes: simple concatenation or AI-powered intelligent merging.

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `label` | string | Display name |
| `mode` | string | Merge strategy: "concat" or "llm" |
| `modelId` | string (optional) | Model for LLM merge |
| `prompt` | string (optional) | Custom prompt for LLM merge |
| `output` | string | Merged output (after run) |

**Mode: Concatenate**
Simple text concatenation with separators:
```
=== Source 1 ===
[output from first node]

=== Source 2 ===
[output from second node]
```

**Mode: LLM Merge**
Uses AI to intelligently combine inputs. Features:
- Synthesizes information from multiple sources
- Removes duplicates, consolidates similar points
- Resolves conflicting information
- Produces coherent, well-structured output

**Default Prompt:**
```
You are an expert at synthesizing information from multiple sources.
Your task is to analyze the multiple inputs below and create a single,
comprehensive, and coherent response that combines the most important
information from all sources.

Instructions:
1. Integrate and synthesize the information from all inputs
2. Remove duplicate information and consolidate similar points
3. Prioritize the most accurate and up-to-date information
4. Present the combined information in a clear, organized manner
5. If there are conflicting facts, note both perspectives
6. Keep the most relevant and useful information

--- INPUTS ---
[source outputs]

--- OUTPUT ---
Provide a comprehensive response...
```

**Custom Prompt:**
Use `{INPUTS}` placeholder to inject source outputs:
```
Compare these answers and highlight differences:
{INPUTS}

Provide a summary.
```

**Usage:**
```
[Agent: gemini] ──┐
                  ├──► [Merge: LLM] ──► [Output]
[Agent: default] ──┘
```

---

### Judge Node
The Judge Node evaluates input context against explicit pass/fail criteria and generates a strict JSON `Decision` schema summarizing its assessment, scores, and required action items.

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `label` | string | Display name |
| `modelId` | string (optional) | Override fallback LLM |
| `criteria` | string | Rule descriptions for the Judge |
| `passScore`| number | (0 - 100) Minimum scoring boundary |

---

### Switch & Router
Branches execution flow by comparing inputs via traditional regular expressions or advanced nested `fieldMatch` rules on incoming `payload.json` objects (e.g., `status` equals `done`).

---

### State (Blackboard) Node
Creates a generic global shared memory namespace across the current run, absorbing input via three separate write modes: `append`, `replace`, and `merge`.

---

### Extract, Invoke, ForEach
- **Extract**: Guarantees output formats to precisely match a JSON schema definition.
- **Invoke**: Native binding utilizing `gatewayClient.request(...)` natively.
- **ForEach**: Recursively forks parallel subgraph child-executors for each slice mapped from an initial array field.

---

### Output Node
The final destination. Captures and displays the complete workflow output.

**Properties:**
| Property | Type | Description |
|----------|------|-------------|
| `label` | string | Display name |
| `output` | string | Final output (read-only in Inspector) |

**Usage:**
```
[Input] ──────► [Agent] ──────► [Output]
```

---

## Workflow Execution

### Level-Based Processing
The graph executor processes nodes level by level:
1. **Level 0**: Input nodes (no dependencies)
2. **Level 1**: Nodes receiving from Level 0
3. **Level N**: Nodes receiving from Level N-1

This enables:
- **Parallel execution**: All nodes at the same level run simultaneously
- **Dependency handling**: Downstream nodes wait for upstream to complete

### Execution Flow
```
1. Start Run
      │
      ▼
2. Process Level 0 (Input nodes)
      │
      ▼
3. Process Level 1 (Agents, parallel)
      │     │
      │     ├─► Agent 1 ──► Wait for complete
      │     └─► Agent 2 ──► Wait for complete
      │
      ▼
4. Process Level 2 (Merge/Output)
      │
      ▼
5. Complete
```

## UI Components

### Node Palette (Left Panel)
- Drag nodes onto canvas
- Available types: Input, Agent, Merge, Output

### Inspector Panel (Right Panel)
- Edit selected node properties
- View generated output (for Agent, Merge, Output nodes)
- Model selection dropdown

### Run Log Panel (Bottom)
- Real-time execution log
- Streaming responses from agents
- Debug information

### Canvas (Center)
- Visual graph editor
- Drag to position nodes
- Connect nodes by dragging handles

## API

### POST /api/run
Execute a graph workflow.

**Request:**
```json
{
  "graph": {
    "id": "my-workflow",
    "name": "My Workflow",
    "nodes": [
      {"id": "n1", "type": "clawdiniNode", "position": {"x": 0, "y": 0}, "data": {"type": "input", "label": "Input", "prompt": "Hello"}},
      {"id": "n2", "type": "clawdiniNode", "position": {"x": 200, "y": 0}, "data": {"type": "agent", "label": "Agent", "agentId": "main"}}
    ],
    "edges": [{"id": "e1", "source": "n1", "target": "n2", "sourceHandle": "output", "targetHandle": "input"}]
  }
}
```

**Response:**
```json
{
  "runId": "uuid-of-run"
}
```

### GET /api/run/:runId/events
Subscribe to SSE events for real-time updates.

**Events:**
| Event | Description |
|-------|-------------|
| `connected` | Subscription established |
| `runStarted` | Run has begun |
| `nodeStarted` | Node started executing |
| `nodeDelta` | Streaming text chunk |
| `nodeFinal` | Node completed |
| `nodeError` | Node failed |
| `thinking` | Agent thinking/processing |
| `runCompleted` | Entire workflow finished |
| `runCancelled` | Run was cancelled |

### GET /api/models
List available models from gateway.

**Response:**
```json
{
  "models": [
    {"id": "google/gemini-3-flash-preview", "name": "gemini-3-flash-preview", "provider": "google"},
    ...
  ]
}
```

### GET /api/agents
List available agents from gateway.

### GET /api/health
Server health check.

## Configuration

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCLAW_GATEWAY_URL` | ws://127.0.0.1:18789 | Gateway WebSocket URL |

### Scripts

```bash
# Start all services
./start.sh

# Stop services (Gateway stays running)
./stop.sh
```

**start.sh** checks for existing processes to avoid duplicates.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, ReactFlow, Zustand |
| Backend | Node.js, Express, WS |
| Gateway | OpenClaw Gateway (Protocol v3) |
| Build | Vite, TypeScript, pnpm |

## Troubleshooting

### "missing scope: operator.write"
- Ensure Gateway has proper device authentication
- Check Gateway config allows required scopes

### Model selection not working
- Use `sessions.patch` to set model before `chat.send`
- Gateway doesn't accept `model` param in `chat.send`

### Nodes not running in parallel
- Check that nodes receive input from the same upstream node
- Different upstream sources = sequential execution

## License

MIT
