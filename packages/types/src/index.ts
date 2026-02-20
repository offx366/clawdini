// Graph and Node types for Clawdini

// Node types
export type NodeType = 'input' | 'agent' | 'merge' | 'judge' | 'output' | 'switch' | 'extract' | 'invoke' | 'foreach' | 'state' | 'template';

// Strongly typed ports
export type PortType = 'text' | 'json' | 'task' | 'decision' | 'state' | 'any';

// Core Decision contract from Judge Node
export interface Decision {
  status: 'done' | 'continue' | 'needs_info' | 'failed' | 'human_review';
  score: number;
  reasons: string[];
  missing: string[];
  nextActionHint: string;
  recommendedBranch: string;
}

// Payload structure that flows between nodes
export interface NodePayload {
  text: string;
  json?: any;
  meta: {
    modelId?: string;
    agentId?: string;
    latencyMs?: number;
    sessionKey?: string;
  };
}

// Base node data
export interface BaseNodeData {
  label: string;
  status?: 'idle' | 'running' | 'completed' | 'error';
  payload?: NodePayload;
}

// InputNode - text prompt input
export interface InputNodeData extends BaseNodeData {
  type: 'input';
  prompt: string;
}

// AgentNode - runs an agent
export interface AgentNodeData extends BaseNodeData {
  type: 'agent';
  agentId: string;
  modelId?: string;
  role?: 'planner' | 'critic' | 'researcher' | 'operator' | 'custom';
}

// MergeNode - combines outputs
export interface MergeNodeData extends BaseNodeData {
  type: 'merge';
  mode: 'concat' | 'llm' | 'consensus';
  modelId?: string; // optional model for LLM merge
  prompt?: string; // custom prompt for LLM merge
}

// JudgeNode - evaluates inputs and outputs JSON decision
export interface JudgeNodeData extends BaseNodeData {
  type: 'judge';
  modelId?: string;
  criteria: string;
  passScore?: number;
}

// OutputNode - final output
export interface OutputNodeData extends BaseNodeData {
  type: 'output';
}

export interface SwitchRule {
  id: string;
  mode: 'regex' | 'fieldMatch';
  condition: string; // Regex pattern or JSON path (e.g., "decision.status")
  valueMatch?: string; // Target value to match if mode is fieldMatch
}

// SwitchNode - branches flow based on regex matches
export interface SwitchNodeData extends BaseNodeData {
  type: 'switch';
  rules: SwitchRule[];
}

// ExtractNode - forces JSON extraction
export interface ExtractNodeData extends BaseNodeData {
  type: 'extract';
  schema: string;
  modelId?: string;
}

// InvokeNode - executes a real environment command via OpenClaw
export interface InvokeNodeData extends BaseNodeData {
  type: 'invoke';
  commandName: string;      // e.g. system.run, browser.goto
  payloadTemplate?: string; // JSON template for the request payload
}

// ForEachNode - spawns parallel sub-graphs for each item in a JSON array
export interface ForEachNodeData extends BaseNodeData {
  type: 'foreach';
  arrayPath?: string;       // Optional JSONPath or key to extract array from payload
}

// StateNode - Blackboard memory for subgraph executions
export interface StateNodeData extends BaseNodeData {
  type: 'state';
  namespace: string;
  mode: 'merge' | 'replace' | 'append';
}

// TemplateNode - Builder for fusing inputs
export interface TemplateNodeData extends BaseNodeData {
  type: 'template';
  template: string;
  format: 'text' | 'json';
}

export type ClawdiniNodeData = InputNodeData | AgentNodeData | MergeNodeData | JudgeNodeData | OutputNodeData | SwitchNodeData | ExtractNodeData | InvokeNodeData | ForEachNodeData | StateNodeData | TemplateNodeData;

// Position for nodes
export interface Position {
  x: number;
  y: number;
}

// Basic node structure (similar to ReactFlow but simpler)
export interface ClawdiniNode {
  id: string;
  type: string;
  position: Position;
  data: ClawdiniNodeData;
}

export interface ClawdiniEdge {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
  selected?: boolean;
}

// Graph - the full workflow
export interface ClawdiniGraph {
  id: string;
  name: string;
  nodes: ClawdiniNode[];
  edges: ClawdiniEdge[];
  createdAt: number;
  updatedAt: number;
}

// Run types
export type RunStatus = 'pending' | 'running' | 'completed' | 'error' | 'cancelled';

export interface RunNodeEvent {
  type: 'nodeStarted' | 'nodeDelta' | 'nodeFinal' | 'nodeError' | 'nodeAborted' | 'thinking';
  nodeId: string;
  data?: NodePayload;
  content?: string;
  error?: string;
}

export interface RunStatusEvent {
  type: 'runStarted' | 'runCompleted' | 'runError' | 'runCancelled';
  runId: string;
  error?: string;
}

export type RunEvent = RunNodeEvent | RunStatusEvent;

// API types
export interface StartRunRequest {
  graph: ClawdiniGraph;
  input?: string;
}

export interface StartRunResponse {
  runId: string;
}

// Agent info from Gateway
export interface AgentInfo {
  id: string;
  name?: string;
  identity?: {
    name?: string;
    theme?: string;
    emoji?: string;
    avatar?: string;
    avatarUrl?: string;
  };
}

export interface AgentsListResponse {
  defaultId: string;
  mainKey: string;
  agents: AgentInfo[];
}
