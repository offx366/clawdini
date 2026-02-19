// GraphRunner - executes the graph workflow
import { v4 as uuidv4 } from 'uuid';
import type {
  ClawdiniGraph,
  ClawdiniNode,
  ClawdiniNodeData,
  AgentNodeData,
  MergeNodeData,
  InputNodeData,
  RunEvent,
  RunNodeEvent,
  NodePayload,
  SwitchNodeData,
  ExtractNodeData,
  InvokeNodeData,
  ForEachNodeData,
} from '@clawdini/types';
import { GatewayClient } from '../gateway/client.js';

export type EventHandler = (event: RunEvent) => void;

interface NodeOutput {
  output: NodePayload;
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

// Extract subgraph from startNodeId
function getSubgraph(graph: ClawdiniGraph, startNodeId: string): ClawdiniGraph {
  const descendantIds = new Set<string>();
  const queue = [startNodeId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const outgoing = graph.edges.filter(e => e.source === curr).map(e => e.target);
    for (const tgt of outgoing) {
      if (!descendantIds.has(tgt)) {
        descendantIds.add(tgt);
        queue.push(tgt);
      }
    }
  }
  return {
    ...graph,
    id: `${graph.id}-sub-${startNodeId}`,
    nodes: graph.nodes.filter(n => descendantIds.has(n.id)),
    edges: graph.edges.filter(e => descendantIds.has(e.source) && descendantIds.has(e.target))
  };
}

export class GraphRunner {
  private gatewayClient: GatewayClient;
  private runId: string;
  private eventHandler: EventHandler;
  private nodeOutputs = new Map<string, NodeOutput>();
  private runningNodes = new Map<string, { runId: string; sessionKey: string }>();
  private disabledEdges = new Set<string>();
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
    this.disabledEdges.clear();

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

    const inputEdges = graph.edges.filter((e) => e.target === nodeId);
    if (inputEdges.length > 0) {
      const allDisabled = inputEdges.every((e) => this.disabledEdges.has(e.id));
      if (allDisabled) {
        console.log(`[Runner] Skipping node ${nodeId} (all input paths halted)`);
        const outgoingEdges = graph.edges.filter((e) => e.source === nodeId);
        for (const edge of outgoingEdges) {
          this.disabledEdges.add(edge.id);
        }
        this.emitEvent({ type: 'nodeAborted', nodeId });
        this.nodeOutputs.set(nodeId, { output: { text: 'Halted (Skipped)', meta: {} }, status: 'completed' });
        return;
      }
    }

    // Emit started event
    this.emitEvent({ type: 'nodeStarted', nodeId, data: { text: '', meta: {} } });

    try {
      let output: NodePayload = { text: '', meta: {} };

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
        case 'switch':
          output = await this.executeSwitchNode(graph, node, data as SwitchNodeData);
          break;
        case 'extract':
          output = await this.executeExtractNode(graph, nodeId, data as ExtractNodeData);
          break;
        case 'invoke':
          output = await this.executeInvokeNode(graph, nodeId, data as InvokeNodeData);
          break;
        case 'foreach':
          output = await this.executeForEachNode(graph, nodeId, data as ForEachNodeData);
          break;
        case 'judge':
          output = await this.executeJudgeNode(graph, nodeId, data as any);
          break;
        case 'output':
          output = this.getOutput(graph, nodeId);
          break;
      }

      console.log('[Runner] Node output:', nodeId, output?.text?.slice(0, 50));
      this.nodeOutputs.set(nodeId, { output, status: 'completed' });
      this.emitEvent({ type: 'nodeFinal', nodeId, data: output });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[Runner] Node error:', nodeId, errorMsg);
      this.nodeOutputs.set(nodeId, { output: { text: '', meta: {} }, status: 'error', error: errorMsg });
      this.emitEvent({ type: 'nodeError', nodeId, error: errorMsg });
    }
  }

  private async executeInputNode(data: InputNodeData): Promise<NodePayload> {
    return { text: data.prompt || '', meta: {} };
  }

  private async executeAgentNode(
    graph: ClawdiniGraph,
    node: ClawdiniNode,
    data: AgentNodeData,
    globalInput?: string
  ): Promise<NodePayload> {
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
          sourceOutputs.push(sourceOutput.output.text);
        }
      }
      inputText = sourceOutputs.join('\n\n');
    }

    // Inject Role Prompt if specified
    if (data.role && data.role !== 'custom') {
      const rolePrompts: Record<string, string> = {
        planner: 'You are a Chief Planner. Your goal is to analyze the input and create a high-level strategy, identifying key objectives and success criteria.',
        critic: 'You are a strict Critic. Your goal is to find flaws, security risks, edge cases, and logical inconsistencies in the input.',
        researcher: 'You are a deeply analytical Researcher. Your goal is to pull facts, provide context, and cite relevant information related to the input.',
        operator: 'You are a pragmatic Operator. Your goal is to take the input and formulate a concrete, step-by-step action plan to execute it.',
      };
      const systemPrompt = rolePrompts[data.role];
      if (systemPrompt) {
        inputText = `${systemPrompt}\n\n--- INPUT ---\n${inputText}`;
      }
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
                this.emitEvent({ type: 'nodeDelta', nodeId: nodeIdCopy, data: { text: delta, meta: {} } });
                // Also emit thinking event for detailed debug
                this.emitEvent({ type: 'thinking', nodeId: nodeIdCopy, content: delta.slice(0, 50) });
              }
              fullOutput = text;
            } else {
              // Unexpected non-prefix update; fall back to replacing.
              fullOutput = text;
              this.emitEvent({ type: 'nodeDelta', nodeId: nodeIdCopy, data: { text, meta: {} } });
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

      return {
        text: fullOutput,
        meta: { agentId, modelId: data.modelId, sessionKey }
      };
    } finally {
      this.gatewayClient.off('chat', chatHandler);
      this.runningNodes.delete(nodeId);
    }
  }

  private async executeMergeNode(graph: ClawdiniGraph, nodeId: string, data: MergeNodeData): Promise<NodePayload> {
    // Get inputs from connected nodes
    const inputEdges = graph.edges.filter((e) => e.target === nodeId);
    const sourceOutputs: { id: string; output: string }[] = [];

    for (const edge of inputEdges) {
      const sourceOutput = this.nodeOutputs.get(edge.source);
      if (sourceOutput && sourceOutput.status === 'completed') {
        sourceOutputs.push({ id: edge.source, output: sourceOutput.output.text });
      }
    }

    if (data.mode === 'concat') {
      return {
        text: sourceOutputs
          .map((item, i) => `=== Source ${i + 1} ===\n${item.output}\n`)
          .join('\n'),
        meta: {}
      };
    } else {
      let mergePrompt = '';

      if (data.mode === 'consensus') {
        if (sourceOutputs.length === 0) return { text: '', meta: {} };
        if (sourceOutputs.length === 1) return { text: sourceOutputs[0].output, meta: {} };

        const inputsText = sourceOutputs
          .map((item, i) => `--- Participant ${i + 1} ---\n${item.output}`)
          .join('\n\n');

        mergePrompt = `You are an expert Meeting Facilitator for a board of AI agents. Your task is to analyze the various perspectives below and produce a structured Meeting Minutes document.

Instructions:
1. Identify who said what (summarize key points from each participant).
2. Highlight areas of AGREEMENT (consensus).
3. Highlight areas of DISAGREEMENT or conflict.
4. Formulate a final proposed resolution or next steps based on the synthesis.

--- INPUTS ---
${inputsText}

--- OUTPUT ---
Provide the Meeting Minutes:`;
      } else {
        // Default LLM Merge
        if (sourceOutputs.length === 0) return { text: '', meta: {} };
        if (sourceOutputs.length === 1) return { text: sourceOutputs[0].output, meta: {} };

        // Build the merge prompt
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
      }

      // Create a session key for this merge operation
      const sessionKey = `agent:main:merge:${this.runId}:${nodeId}`;

      // Reset session for clean run (required before patching)
      try {
        await this.gatewayClient.sessionsReset(sessionKey);
      } catch (e) {
        console.log('[Runner] Merge session reset error (ignored):', e);
      }

      // Set model if specified
      if (data.modelId) {
        await this.gatewayClient.sessionsPatch(sessionKey, { model: data.modelId });
      }

      // Send the merge request
      const result = await this.gatewayClient.chatSend(sessionKey, mergePrompt);

      // Wait for the response
      const mergedOutputText = await this.waitForMergeResult(nodeId, sessionKey, result.runId);
      return {
        text: mergedOutputText,
        meta: { modelId: data.modelId, sessionKey }
      };
    }
  }

  private async executeJudgeNode(graph: ClawdiniGraph, nodeId: string, data: any): Promise<NodePayload> {
    // Get inputs from connected nodes
    const inputEdges = graph.edges.filter((e) => e.target === nodeId);
    const sourceOutputs: string[] = [];

    for (const edge of inputEdges) {
      const sourceOutput = this.nodeOutputs.get(edge.source);
      if (sourceOutput && sourceOutput.status === 'completed') {
        sourceOutputs.push(sourceOutput.output.text);
      }
    }

    const inputText = sourceOutputs.join('\n\n');
    const criteria = data.criteria || 'Evaluate the input objectively.';

    const judgePrompt = `You are an impartial, strict AI Judge. You must evaluate the provided input based ONLY on the criteria listed below.
Your output MUST be a valid JSON object. Do NOT wrap it in markdown codeblocks (like \`\`\`json). Output raw JSON only.

--- CRITERIA ---
${criteria}

--- INPUT TO EVALUATE ---
${inputText}

--- REQUIRED JSON FORMAT ---
{
  "score": <number from 1 to 10>,
  "approved": <boolean>,
  "reasoning": "<short explanation>",
  "action_items": ["<item 1>", "<item 2>"]
}

OUTPUT RAW JSON:`;

    const sessionKey = `agent:main:judge:${this.runId}:${nodeId}`;

    try {
      await this.gatewayClient.sessionsReset(sessionKey);
    } catch (e) {
      console.log('[Runner] Judge session reset error:', e);
    }

    if (data.modelId) {
      await this.gatewayClient.sessionsPatch(sessionKey, { model: data.modelId });
    }

    const result = await this.gatewayClient.chatSend(sessionKey, judgePrompt);
    const output = await this.waitForMergeResult(nodeId, sessionKey, result.runId);
    // Try to ensure clean JSON output
    try {
      let cleanOutput = output.trim();
      if (cleanOutput.startsWith('```json')) {
        cleanOutput = cleanOutput.replace(/```json\n?/, '').replace(/```\n?$/, '');
      }
      const parsed = JSON.parse(cleanOutput);
      return {
        text: cleanOutput,
        json: parsed,
        meta: { sessionKey, modelId: data.modelId }
      };
    } catch (e) {
      console.log('[Runner] Judge output was not valid JSON, returning raw.');
      return { text: output, meta: { sessionKey, modelId: data.modelId } };
    }
  }

  private async executeSwitchNode(graph: ClawdiniGraph, node: ClawdiniNode, data: SwitchNodeData): Promise<NodePayload> {
    const inputEdges = graph.edges.filter((e) => e.target === node.id);
    let inputText = '';
    let sessionKey = uuidv4();

    if (inputEdges.length > 0) {
      const sourceOutputs: NodePayload[] = [];
      for (const edge of inputEdges) {
        if (this.disabledEdges.has(edge.id)) continue;
        const sourceOutput = this.nodeOutputs.get(edge.source);
        if (sourceOutput && sourceOutput.status === 'completed') {
          sourceOutputs.push(sourceOutput.output);
          if (sourceOutput.output.meta.sessionKey) {
            sessionKey = sourceOutput.output.meta.sessionKey;
          }
        }
      }
      inputText = sourceOutputs.map(o => o.text).join('\n\n');
    }

    const matchingRuleIds: string[] = [];
    for (const rule of data.rules || []) {
      try {
        const regex = new RegExp(rule.condition);
        if (regex.test(inputText)) matchingRuleIds.push(rule.id);
      } catch (e) {
        console.error('Invalid regex', rule.condition);
      }
    }

    const outgoingEdges = graph.edges.filter((e) => e.source === node.id);

    if (matchingRuleIds.length === 0) {
      for (const edge of outgoingEdges) {
        this.disabledEdges.add(edge.id);
      }
      return { text: 'Halted (No conditions matched)', meta: { sessionKey } };
    } else {
      let activeCount = 0;
      for (const edge of outgoingEdges) {
        if (!matchingRuleIds.includes(edge.sourceHandle || '')) {
          this.disabledEdges.add(edge.id);
        } else {
          activeCount++;
        }
      }
      return { text: `Flow routed to ${activeCount} branches`, meta: { sessionKey } };
    }
  }

  private async executeExtractNode(graph: ClawdiniGraph, nodeId: string, data: ExtractNodeData): Promise<NodePayload> {
    const inputEdges = graph.edges.filter((e) => e.target === nodeId);
    const sourceOutputs: string[] = [];

    for (const edge of inputEdges) {
      if (this.disabledEdges.has(edge.id)) continue;
      const sourceOutput = this.nodeOutputs.get(edge.source);
      if (sourceOutput && sourceOutput.status === 'completed') {
        sourceOutputs.push(sourceOutput.output.text);
      }
    }

    const inputText = sourceOutputs.join('\\n\\n');
    const schema = data.schema || '{}';

    const extractPrompt = `You are a strict data extraction AI. You must extract information from the input text and format it EXACTLY according to the JSON schema/structure provided below.
Your output MUST be a valid JSON object. Do NOT wrap it in markdown codeblocks (like \`\`\`json). Output raw JSON only.

--- TARGET SCHEMA / STRUCTURE ---
${schema}

--- INPUT TEXT ---
${inputText}

OUTPUT RAW JSON:`;

    const sessionKey = `agent:main:extract:${this.runId}:${nodeId}`;

    try {
      await this.gatewayClient.sessionsReset(sessionKey);
    } catch (e) {
      console.log('[Runner] Extract session reset error:', e);
    }

    if (data.modelId) {
      await this.gatewayClient.sessionsPatch(sessionKey, { model: data.modelId });
    }

    const result = await this.gatewayClient.chatSend(sessionKey, extractPrompt);
    const output = await this.waitForMergeResult(nodeId, sessionKey, result.runId);

    try {
      let cleanOutput = output.trim();
      if (cleanOutput.startsWith('```json')) {
        cleanOutput = cleanOutput.replace(/```json\\n?/, '').replace(/```\\n?$/, '');
      }
      const parsed = JSON.parse(cleanOutput);
      return {
        text: 'Successfully extracted JSON data.',
        json: parsed,
        meta: { sessionKey, modelId: data.modelId }
      };
    } catch (e) {
      console.error('[Runner] Extract output was not valid JSON, returning raw.');
      return { text: output, meta: { sessionKey, modelId: data.modelId } };
    }
  }

  private async executeInvokeNode(graph: ClawdiniGraph, nodeId: string, data: InvokeNodeData): Promise<NodePayload> {
    const inputEdges = graph.edges.filter((e) => e.target === nodeId);
    const sourceOutputs: string[] = [];

    for (const edge of inputEdges) {
      if (this.disabledEdges.has(edge.id)) continue;
      const sourceOutput = this.nodeOutputs.get(edge.source);
      if (sourceOutput && sourceOutput.status === 'completed') {
        sourceOutputs.push(sourceOutput.output.text);
      }
    }

    const inputText = sourceOutputs.join('\\n\\n');
    let rawPayload = data.payloadTemplate || '';

    // Replace {INPUT} with the actual input text (escaped for JSON)
    const escapedInputText = inputText.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"').replace(/\\n/g, '\\\\n');
    rawPayload = rawPayload.replace(/\\{INPUT\\}/g, escapedInputText);

    let parsedPayload: any = {};
    if (rawPayload.trim()) {
      try {
        parsedPayload = JSON.parse(rawPayload);
      } catch (e) {
        console.warn('[Runner] Invoke payload template is not valid JSON string after replacement.', e);
        parsedPayload = { payload: rawPayload };
      }
    }

    const sessionKey = `invoke:${this.runId}:${nodeId}`;

    try {
      console.log(`[Runner] Invoking OpenClaw capability: ${data.commandName}`, parsedPayload);
      const result = await this.gatewayClient.request<any>(data.commandName, parsedPayload);

      const responseText = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);

      return {
        text: responseText,
        json: typeof result === 'object' ? result : undefined,
        meta: { sessionKey }
      };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error(`[Runner] Invoke error on ${data.commandName}:`, errorMsg);
      throw new Error(`Failed to invoke ${data.commandName}: ${errorMsg}`);
    }
  }

  private async executeForEachNode(graph: ClawdiniGraph, nodeId: string, data: ForEachNodeData): Promise<NodePayload> {
    const inputEdges = graph.edges.filter((e) => e.target === nodeId);
    let inputText = '';
    let parsedJson: any = null;
    let sessionKey = uuidv4();

    for (const edge of inputEdges) {
      if (this.disabledEdges.has(edge.id)) continue;
      const sourceOutput = this.nodeOutputs.get(edge.source);
      if (sourceOutput && sourceOutput.status === 'completed') {
        const payload = sourceOutput.output;
        inputText += payload.text + '\\n';
        if (payload.json) parsedJson = payload.json;
        if (payload.meta?.sessionKey) sessionKey = payload.meta.sessionKey;
      }
    }

    if (!parsedJson) {
      try {
        parsedJson = JSON.parse(inputText);
      } catch (e) {
        parsedJson = [];
      }
    }

    let targetArray: any[] = [];
    if (data.arrayPath && parsedJson) {
      const parts = data.arrayPath.split('.');
      let current = parsedJson;
      for (const part of parts) {
        if (current && typeof current === 'object') {
          current = current[part];
        } else {
          current = null;
          break;
        }
      }
      if (Array.isArray(current)) targetArray = current;
    } else if (Array.isArray(parsedJson)) {
      targetArray = parsedJson;
    }

    if (!Array.isArray(targetArray) || targetArray.length === 0) {
      const outgoingEdges = graph.edges.filter((e) => e.source === nodeId);
      for (const edge of outgoingEdges) {
        this.disabledEdges.add(edge.id);
      }
      return { text: 'Halted (No Array Found)', meta: { sessionKey } };
    }

    const subGraph = getSubgraph(graph, nodeId);

    // Disable outgoing edges in THIS runner so main execution doesn't run the subgraph
    const outgoingEdges = graph.edges.filter((e) => e.source === nodeId);
    for (const edge of outgoingEdges) {
      this.disabledEdges.add(edge.id);
    }

    console.log(`[Runner] ForEach spawning ${targetArray.length} parallel runs for subgraph.`);

    const promises = targetArray.map((item) => {
      const subRunner = new GraphRunner(this.gatewayClient, this.eventHandler);
      const itemStr = typeof item === 'object' ? JSON.stringify(item) : String(item);
      return subRunner.run(subGraph, itemStr);
    });

    await Promise.all(promises);

    return { text: `Completed ${targetArray.length} parallel sub-executions.`, meta: { sessionKey } };
  }

  private waitForMergeResult(nodeId: string, sessionKey: string, runId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let fullOutput = '';
      let finished = false;

      const cleanup = () => {
        this.gatewayClient.off('chat', chatHandler);
        clearTimeout(timeout);
        this.runningNodes.delete(nodeId + '-merge');
      };

      const chatHandler = (payload: unknown) => {
        const event = payload as {
          runId: string;
          sessionKey: string;
          state: string;
          message?: unknown;
          errorMessage?: string;
        };

        console.log('[Runner][Merge] chat event received:', event.state, 'sessionKey:', event.sessionKey, 'expected:', sessionKey);

        if (event.sessionKey === sessionKey) {
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
              // Gateway sends CUMULATIVE text (same as agent handler).
              // Emit only the new suffix as a delta.
              if (text.startsWith(fullOutput)) {
                const delta = text.slice(fullOutput.length);
                if (delta) {
                  this.emitEvent({ type: 'nodeDelta', nodeId, data: { text: delta, meta: {} } });
                  this.emitEvent({ type: 'thinking', nodeId, content: `🔀 Merging: ${delta.slice(0, 50)}` });
                }
                fullOutput = text;
              } else {
                // Non-prefix update; fall back to replacing by clearing and re-emitting if needed
                if (text.length > fullOutput.length) {
                  const delta = text.slice(fullOutput.length);
                  this.emitEvent({ type: 'nodeDelta', nodeId, data: { text: delta, meta: {} } });
                }
                fullOutput = text;
              }
            }

            if (event.state === 'final' && !finished) {
              finished = true;
              cleanup();
              resolve(fullOutput);
            }
          } else if (event.state === 'error') {
            if (!finished) {
              finished = true;
              cleanup();
              reject(new Error(event.errorMessage || 'Merge chat error'));
            }
          } else if (event.state === 'aborted') {
            if (!finished) {
              finished = true;
              cleanup();
              reject(new Error('Merge aborted'));
            }
          }
        }
      };

      this.gatewayClient.on('chat', chatHandler);

      // Hard timeout - 120s for merge (same as agent)
      const timeout = setTimeout(() => {
        if (!finished) {
          finished = true;
          this.gatewayClient.off('chat', chatHandler);
          this.runningNodes.delete(nodeId + '-merge');
          if (fullOutput) {
            // Got partial output - return what we have
            resolve(fullOutput);
          } else {
            reject(new Error('Merge timeout'));
          }
        }
      }, 120000);

      // Store for cleanup on cancel
      this.runningNodes.set(nodeId + '-merge', { runId: runId, sessionKey: sessionKey });
    });
  }

  private getOutput(graph: ClawdiniGraph, nodeId: string): NodePayload {
    const inputEdges = graph.edges.filter((e) => e.target === nodeId);
    const sourceOutputs: string[] = [];

    for (const edge of inputEdges) {
      const sourceOutput = this.nodeOutputs.get(edge.source);
      if (sourceOutput && sourceOutput.status === 'completed') {
        sourceOutputs.push(sourceOutput.output.text);
      }
    }

    return { text: sourceOutputs.join('\n\n'), meta: {} };
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
