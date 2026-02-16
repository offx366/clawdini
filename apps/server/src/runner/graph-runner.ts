// GraphRunner - executes the graph workflow
import { v4 as uuidv4 } from 'uuid';
import type {
  ClawdiniGraph,
  ClawdiniNode,
  ClawdiniNodeData,
  AgentNodeData,
  MergeNodeData,
  InputNodeData,
  OutputNodeData,
  RunEvent,
  RunNodeEvent,
} from '@clawdini/types';
import { GatewayClient } from '../gateway/client.js';

export type EventHandler = (event: RunEvent) => void;

interface NodeOutput {
  output: string;
  status: 'completed' | 'error';
  error?: string;
}

// Topological sort - order nodes by dependencies
function topologicalSort(nodes: ClawdiniNode[], edges: { source: string; target: string }[]): string[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  nodes.forEach((node) => {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  });

  // Build graph
  edges.forEach((edge) => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      adjacency.get(edge.source)!.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }
  });

  // Kahn's algorithm
  const queue: string[] = [];
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) queue.push(nodeId);
  });

  const result: string[] = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    result.push(nodeId);
    adjacency.get(nodeId)?.forEach((target) => {
      const newDegree = (inDegree.get(target) || 0) - 1;
      inDegree.set(target, newDegree);
      if (newDegree === 0) queue.push(target);
    });
  }

  // Check for cycles
  if (result.length !== nodes.length) {
    throw new Error('Graph has cycles');
  }

  return result;
}

// Group nodes by level for parallel execution
function groupByLevel(nodes: ClawdiniNode[], edges: { source: string; target: string }[]): string[][] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  nodes.forEach((node) => {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  });

  edges.forEach((edge) => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      adjacency.get(edge.source)!.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }
  });

  const levels: string[][] = [];
  let currentLevel: string[] = [];

  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) currentLevel.push(nodeId);
  });

  while (currentLevel.length > 0) {
    levels.push(currentLevel);
    const nextLevel: string[] = [];

    currentLevel.forEach((nodeId) => {
      adjacency.get(nodeId)?.forEach((target) => {
        const newDegree = (inDegree.get(target) || 0) - 1;
        inDegree.set(target, newDegree);
        if (newDegree === 0) nextLevel.push(target);
      });
    });

    currentLevel = nextLevel;
  }

  return levels;
}

export class GraphRunner {
  private gatewayClient: GatewayClient;
  private runId: string;
  private eventHandler: EventHandler;
  private nodeOutputs = new Map<string, NodeOutput>();
  private runningNodes = new Map<string, { runId: string; sessionKey: string }>();
  private cancelled = false;

  constructor(gatewayClient: GatewayClient, eventHandler: EventHandler) {
    this.gatewayClient = gatewayClient;
    this.runId = uuidv4();
    this.eventHandler = eventHandler;
  }

  async run(graph: ClawdiniGraph, globalInput?: string): Promise<void> {
    this.cancelled = false;
    this.nodeOutputs.clear();
    this.runningNodes.clear();

    this.emitEvent({ type: 'runStarted', runId: this.runId });

    try {
      const levels = groupByLevel(graph.nodes, graph.edges);

      for (const level of levels) {
        if (this.cancelled) break;

        // Execute all nodes in parallel at this level
        const promises = level.map((nodeId) => this.executeNode(graph, nodeId, globalInput));
        await Promise.all(promises);
      }

      if (!this.cancelled) {
        this.emitEvent({ type: 'runCompleted', runId: this.runId });
      }
    } catch (error) {
      this.emitEvent({
        type: 'runError',
        runId: this.runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async executeNode(graph: ClawdiniGraph, nodeId: string, globalInput?: string): Promise<void> {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const data = node.data as ClawdiniNodeData;

    // Emit started event
    this.emitEvent({ type: 'nodeStarted', nodeId, data: '' });

    try {
      let output = '';

      switch (data.type) {
        case 'input':
          output = await this.executeInputNode(data as InputNodeData);
          break;
        case 'agent':
          output = await this.executeAgentNode(graph, data as AgentNodeData, globalInput);
          break;
        case 'merge':
          output = await this.executeMergeNode(graph, data as MergeNodeData);
          break;
        case 'output':
          // Output node just displays combined results
          output = this.getMergeOutput(graph, nodeId);
          break;
      }

      this.nodeOutputs.set(nodeId, { output, status: 'completed' });
      this.emitEvent({ type: 'nodeFinal', nodeId, data: output });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.nodeOutputs.set(nodeId, { output: '', status: 'error', error: errorMsg });
      this.emitEvent({ type: 'nodeError', nodeId, error: errorMsg });
    }
  }

  private async executeInputNode(data: InputNodeData): Promise<string> {
    return data.prompt;
  }

  private async executeAgentNode(
    graph: ClawdiniGraph,
    data: AgentNodeData,
    globalInput?: string
  ): Promise<string> {
    // Get input from connected nodes
    const inputEdges = graph.edges.filter((e) => e.target === data.agentId);
    let inputText = globalInput || '';

    if (inputEdges.length > 0) {
      const sourceOutputs: string[] = [];
      for (const edge of inputEdges) {
        const sourceOutput = this.nodeOutputs.get(edge.source);
        if (sourceOutput && sourceOutput.status === 'completed') {
          sourceOutputs.push(sourceOutput.output);
        }
      }
      inputText = sourceOutputs.join('\n\n');
    }

    // Generate session key
    const sessionKey = `agent:${data.agentId}:clawdini-${this.runId}-${data.agentId}`;

    // Reset session for clean run
    try {
      await this.gatewayClient.sessionsReset(sessionKey);
    } catch {
      // Ignore if session doesn't exist
    }

    // Set up event listener for streaming
    let fullOutput = '';
    const handler = (payload: unknown) => {
      const event = payload as {
        runId: string;
        sessionKey: string;
        state: string;
        message?: { delta?: { text?: string }; text?: string };
        errorMessage?: string;
      };

      if (event.sessionKey === sessionKey) {
        if (event.state === 'delta') {
          const text = event.message?.delta?.text || event.message?.text || '';
          fullOutput += text;
          this.emitEvent({ type: 'nodeDelta', nodeId: data.agentId, data: text });
        } else if (event.state === 'error') {
          this.emitEvent({ type: 'nodeError', nodeId: data.agentId, error: event.errorMessage });
        }
      }
    };

    this.gatewayClient.on('chat', handler);

    try {
      // Start chat
      const result = await this.gatewayClient.chatSend(sessionKey, inputText);

      // Track running node
      this.runningNodes.set(data.agentId, { runId: result.runId, sessionKey });

      // Wait a bit for streaming to complete (simplified - in production would wait for final event)
      await new Promise((resolve) => setTimeout(resolve, 3000));

      return fullOutput || inputText + ' [Agent completed]';
    } finally {
      this.gatewayClient.off('chat', handler);
      this.runningNodes.delete(data.agentId);
    }
  }

  private async executeMergeNode(graph: ClawdiniGraph, data: MergeNodeData): Promise<string> {
    // Get inputs from connected nodes
    const inputEdges = graph.edges.filter((e) => e.target === data.label);
    const sourceOutputs: string[] = [];

    for (const edge of inputEdges) {
      const sourceOutput = this.nodeOutputs.get(edge.source);
      if (sourceOutput && sourceOutput.status === 'completed') {
        sourceOutputs.push(sourceOutput.output);
      }
    }

    if (data.mode === 'concat') {
      // Simple concatenation
      return sourceOutputs
        .map((output, i) => `=== Source ${i + 1} ===\n${output}\n`)
        .join('\n');
    } else {
      // LLM merge - just concat for MVP
      return sourceOutputs.join('\n\n');
    }
  }

  private getMergeOutput(graph: ClawdiniGraph, outputNodeId: string): string {
    const inputEdges = graph.edges.filter((e) => e.target === outputNodeId);
    const sourceOutputs: string[] = [];

    for (const edge of inputEdges) {
      const sourceOutput = this.nodeOutputs.get(edge.source);
      if (sourceOutput && sourceOutput.status === 'completed') {
        sourceOutputs.push(sourceOutput.output);
      }
    }

    return sourceOutputs.join('\n\n');
  }

  async cancel(): Promise<void> {
    this.cancelled = true;

    // Abort all running nodes
    for (const [, nodeInfo] of this.runningNodes) {
      try {
        await this.gatewayClient.chatAbort(nodeInfo.sessionKey, nodeInfo.runId);
      } catch {
        // Ignore errors during cancel
      }
    }

    this.emitEvent({ type: 'runCancelled', runId: this.runId });
  }

  private emitEvent(event: RunEvent): void {
    this.eventHandler(event);
  }

  getRunId(): string {
    return this.runId;
  }
}
