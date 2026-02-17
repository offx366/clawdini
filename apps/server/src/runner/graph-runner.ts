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
    console.log('[Runner] Starting run with', graph.nodes.length, 'nodes');
    this.cancelled = false;
    this.nodeOutputs.clear();
    this.runningNodes.clear();

    // Give SSE clients time to connect
    await new Promise(resolve => setTimeout(resolve, 500));

    this.emitEvent({ type: 'runStarted', runId: this.runId });

    try {
      const levels = groupByLevel(graph.nodes, graph.edges);
      console.log('[Runner] Levels:', levels);

      for (const level of levels) {
        console.log('[Runner] Processing level:', level);
        if (this.cancelled) break;

        // Execute all nodes in parallel at this level
        const promises = level.map((nodeId) => this.executeNode(graph, nodeId, globalInput));
        await Promise.all(promises);
      }

      if (!this.cancelled) {
        this.emitEvent({ type: 'runCompleted', runId: this.runId });
      }
    } catch (error) {
      console.error('[Runner] Error:', error);
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

    console.log('[Runner] Executing node:', nodeId, node.data.type);

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
          output = await this.executeAgentNode(graph, node, data as AgentNodeData, globalInput);
          break;
        case 'merge':
          output = await this.executeMergeNode(graph, nodeId, data as MergeNodeData);
          break;
        case 'output':
          output = this.getOutput(graph, nodeId);
          break;
      }

      console.log('[Runner] Node output:', nodeId, output?.slice(0, 50));
      this.nodeOutputs.set(nodeId, { output, status: 'completed' });
      this.emitEvent({ type: 'nodeFinal', nodeId, data: output });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[Runner] Node error:', nodeId, errorMsg);
      this.nodeOutputs.set(nodeId, { output: '', status: 'error', error: errorMsg });
      this.emitEvent({ type: 'nodeError', nodeId, error: errorMsg });
    }
  }

  private async executeInputNode(data: InputNodeData): Promise<string> {
    return data.prompt || '';
  }

  private async executeAgentNode(
    graph: ClawdiniGraph,
    node: ClawdiniNode,
    data: AgentNodeData,
    globalInput?: string
  ): Promise<string> {
    const nodeId = node.id;

    // Get input from connected nodes
    const inputEdges = graph.edges.filter((e) => e.target === nodeId);
    console.log('[Runner] Agent input edges:', inputEdges);

    let inputText = globalInput || '';

    if (inputEdges.length > 0) {
      const sourceOutputs: string[] = [];
      for (const edge of inputEdges) {
        const sourceOutput = this.nodeOutputs.get(edge.source);
        console.log('[Runner] Source output for', edge.source, sourceOutput?.status);
        if (sourceOutput && sourceOutput.status === 'completed') {
          sourceOutputs.push(sourceOutput.output);
        }
      }
      inputText = sourceOutputs.join('\n\n');
    }

    console.log('[Runner] Input text:', inputText?.slice(0, 100));

    // Use the agentId from node data
    const agentId = data.agentId || 'main';
    // Make sessionKey unique per node to avoid collisions when running nodes in parallel.
    const sessionKey = `agent:${agentId}:clawdini:${this.runId}:${nodeId}`;

    console.log('[Runner] Session key:', sessionKey);

    // Reset session for clean run
    try {
      await this.gatewayClient.sessionsReset(sessionKey);
    } catch (e) {
      console.log('[Runner] Session reset error (ignored):', e);
    }

    // Set up event listener for streaming. We prefer `chat` events; they include sessionKey
    // and are sufficient for incremental UI output.
    // Note: Gateway `chat` events send cumulative message content for each delta (not incremental).
    // We track the last full text and only emit the new suffix as nodeDelta.
    let fullOutput = '';
    const nodeIdCopy = nodeId; // Capture for closure
    let finished = false;
    let finishOk: (() => void) | null = null;
    let finishErr: ((e: Error) => void) | null = null;
    const finishedPromise = new Promise<void>((resolve, reject) => {
      finishOk = resolve;
      finishErr = reject;
    });

    const chatHandler = (payload: unknown) => {
      const event = payload as {
        runId: string;
        sessionKey: string;
        state: string;
        message?: unknown;
        errorMessage?: string;
      };

      console.log('[Runner] Chat event received:', event.state, event.sessionKey);

      if (event.sessionKey === sessionKey) {
        if (event.state === 'delta' || event.state === 'final') {
          // Parse message to extract text
          let text = '';
          if (event.message) {
            const msg = event.message as Record<string, unknown>;
            if (typeof msg.content === 'string') {
              text = msg.content;
            } else if (Array.isArray(msg.content)) {
              // Handle content blocks
              for (const block of msg.content) {
                if (typeof block === 'object' && block !== null) {
                  const b = block as Record<string, unknown>;
                  if (b.type === 'text' && typeof b.text === 'string') {
                    text += b.text;
                  }
                }
              }
            } else if (typeof msg.text === 'string') {
              text = msg.text;
            }
          }
          if (text) {
            // `text` is cumulative. Emit only the new suffix when possible.
            if (text.startsWith(fullOutput)) {
              const delta = text.slice(fullOutput.length);
              if (delta) {
                this.emitEvent({ type: 'nodeDelta', nodeId: nodeIdCopy, data: delta });
                // Also emit thinking event for detailed debug
                this.emitEvent({ type: 'thinking', nodeId: nodeIdCopy, content: delta.slice(0, 50) });
              }
              fullOutput = text;
            } else {
              // Unexpected non-prefix update; fall back to replacing.
              fullOutput = text;
              this.emitEvent({ type: 'nodeDelta', nodeId: nodeIdCopy, data: text });
            }
          }
          if (event.state === 'final' && !finished) {
            finished = true;
            finishOk?.();
          }
        } else if (event.state === 'error') {
          const errMsg = event.errorMessage || 'chat error';
          this.emitEvent({ type: 'nodeError', nodeId: nodeIdCopy, error: errMsg });
          if (!finished) {
            finished = true;
            finishErr?.(new Error(errMsg));
          }
        } else if (event.state === 'aborted') {
          const errMsg = 'aborted';
          this.emitEvent({ type: 'nodeError', nodeId: nodeIdCopy, error: errMsg });
          if (!finished) {
            finished = true;
            finishErr?.(new Error(errMsg));
          }
        }
      }
    };

    this.gatewayClient.on('chat', chatHandler);

    try {
      // Start chat
      const modelInfo = data.modelId ? ` with model: ${data.modelId}` : ' (using default model)';
      console.log('[Runner] Sending chat to gateway:', sessionKey, inputText?.slice(0, 50), modelInfo);
      this.emitEvent({ type: 'thinking', nodeId, content: `🤖 Starting agent${modelInfo}...` });

      // If model is specified, patch the session to set the model before sending
      if (data.modelId) {
        console.log('[Runner] Patching session with model:', data.modelId);
        await this.gatewayClient.sessionsPatch(sessionKey, { model: data.modelId });
      }

      const result = await this.gatewayClient.chatSend(sessionKey, inputText);
      console.log('[Runner] Chat result:', result);
      this.emitEvent({ type: 'thinking', nodeId, content: `📡 Request sent, waiting for response...` });

      // Track running node
      this.runningNodes.set(nodeId, { runId: result.runId, sessionKey });

      // Wait for final/error (with a hard timeout).
      const timeoutMs = 120000;
      await Promise.race([
        finishedPromise,
        new Promise<void>((_resolve, reject) =>
          setTimeout(() => reject(new Error(`agent timeout after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);

      return fullOutput;
    } finally {
      this.gatewayClient.off('chat', chatHandler);
      this.runningNodes.delete(nodeId);
    }
  }

  private async executeMergeNode(graph: ClawdiniGraph, nodeId: string, data: MergeNodeData): Promise<string> {
    // Get inputs from connected nodes
    const inputEdges = graph.edges.filter((e) => e.target === nodeId);
    const sourceOutputs: { id: string; output: string }[] = [];

    for (const edge of inputEdges) {
      const sourceOutput = this.nodeOutputs.get(edge.source);
      if (sourceOutput && sourceOutput.status === 'completed') {
        sourceOutputs.push({ id: edge.source, output: sourceOutput.output });
      }
    }

    if (data.mode === 'concat') {
      return sourceOutputs
        .map((item, i) => `=== Source ${i + 1} ===\n${item.output}\n`)
        .join('\n');
    } else {
      // LLM Merge - use model to intelligently combine inputs
      if (sourceOutputs.length === 0) {
        return '';
      }
      if (sourceOutputs.length === 1) {
        return sourceOutputs[0].output;
      }

      // Build the merge prompt
      let mergePrompt: string;
      if (data.prompt) {
        // Use custom prompt - replace {INPUTS} placeholder with actual inputs
        const inputsText = sourceOutputs
          .map((item, i) => `Input ${i + 1}:\n${item.output}`)
          .join('\n\n---\n\n');
        mergePrompt = data.prompt.replace(/\{INPUTS\}/gi, inputsText);
      } else {
        // Default prompt
        const inputsText = sourceOutputs
          .map((item, i) => `--- Input ${i + 1} ---\n${item.output}`)
          .join('\n\n');

        mergePrompt = `You are an expert at synthesizing information from multiple sources. Your task is to analyze the multiple inputs below and create a single, comprehensive, and coherent response that combines the most important information from all sources.

Instructions:
1. Integrate and synthesize the information from all inputs
2. Remove duplicate information and consolidate similar points
3. Prioritize the most accurate and up-to-date information
4. Present the combined information in a clear, organized manner
5. If there are conflicting facts, note both perspectives and explain the discrepancy
6. Keep the most relevant and useful information for the user's original question

--- INPUTS ---
${inputsText}

--- OUTPUT ---
Provide a comprehensive, well-structured response that combines the above inputs:`;
      }

      // Create a session key for this merge operation
      const sessionKey = `merge:${this.runId}:${nodeId}`;

      // Set model if specified
      if (data.modelId) {
        await this.gatewayClient.sessionsPatch(sessionKey, { model: data.modelId });
      }

      // Send the merge request
      const result = await this.gatewayClient.chatSend(sessionKey, mergePrompt);

      // Wait for the response
      const mergedOutput = await this.waitForMergeResult(nodeId, sessionKey, result.runId);
      return mergedOutput;
    }
  }

  private waitForMergeResult(nodeId: string, sessionKey: string, runId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let fullOutput = '';

      const chatHandler = (payload: unknown) => {
        const event = payload as {
          runId: string;
          sessionKey: string;
          state: string;
          message?: unknown;
        };

        if (event.sessionKey === sessionKey && event.runId === runId) {
          if (event.state === 'delta' || event.state === 'final') {
            // Parse message to extract text
            let text = '';
            if (event.message) {
              const msg = event.message as Record<string, unknown>;
              if (typeof msg.content === 'string') {
                text = msg.content;
              } else if (Array.isArray(msg.content)) {
                for (const block of msg.content) {
                  if (typeof block === 'object' && block !== null) {
                    const b = block as Record<string, unknown>;
                    if (b.type === 'text' && typeof b.text === 'string') {
                      text += b.text;
                    }
                  }
                }
              } else if (typeof msg.text === 'string') {
                text = msg.text;
              }
            }
            if (text) {
              if (event.state === 'final') {
                fullOutput = text;
              } else {
                fullOutput += text;
              }
            }
          }
        }
      };

      this.gatewayClient.on('chat', chatHandler);

      // Timeout after 60 seconds
      const timeout = setTimeout(() => {
        this.gatewayClient.off('chat', chatHandler);
        if (fullOutput) {
          resolve(fullOutput);
        } else {
          reject(new Error('Merge timeout'));
        }
      }, 60000);

      // Store timeout info for cleanup
      this.runningNodes.set(nodeId + '-merge', { runId: runId, sessionKey: sessionKey });
    });
  }

  private getOutput(graph: ClawdiniGraph, nodeId: string): string {
    const inputEdges = graph.edges.filter((e) => e.target === nodeId);
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
