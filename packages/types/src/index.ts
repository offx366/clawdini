// Graph and Node types for Clawdini

// Node types
export type NodeType = 'input' | 'agent' | 'merge' | 'judge' | 'output';

// Base node data
export interface BaseNodeData {
  label: string;
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
  output: string;
  status: 'idle' | 'running' | 'completed' | 'error';
}

// MergeNode - combines outputs
export interface MergeNodeData extends BaseNodeData {
  type: 'merge';
  mode: 'concat' | 'llm' | 'consensus';
  modelId?: string; // optional model for LLM merge
  prompt?: string; // custom prompt for LLM merge
  output: string;
  status: 'idle' | 'running' | 'completed' | 'error';
}

// JudgeNode - evaluates inputs and outputs JSON decision
export interface JudgeNodeData extends BaseNodeData {
  type: 'judge';
  modelId?: string;
  criteria: string;
  output: string; // JSON output
  status: 'idle' | 'running' | 'completed' | 'error';
}

// OutputNode - final output
export interface OutputNodeData extends BaseNodeData {
  type: 'output';
  output: string;
}

export type ClawdiniNodeData = InputNodeData | AgentNodeData | MergeNodeData | JudgeNodeData | OutputNodeData;

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
  target: string;
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
  data?: string;
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
