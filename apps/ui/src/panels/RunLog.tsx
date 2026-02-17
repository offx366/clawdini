// Run Log - bottom panel showing execution logs
import { useGraphStore } from '../store';
import { Play, Square, RotateCcw, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import { useState } from 'react';

export function RunLog() {
  const { nodes, edges, isRunning, runId, runLogs, setIsRunning, setRunId, clearRunLogs, getGraph, updateNode, addRunLog } = useGraphStore();
  const [showDebug, setShowDebug] = useState(true);

  const addDebugLog = (message: string) => {
    console.log('[DEBUG]', message);
    addRunLog({ type: 'debug', nodeId: 'system', data: message, timestamp: Date.now() });
  };

  const handleRun = async () => {
    console.log('[RunLog] === handleRun START ===');
    addDebugLog('🚀 Starting workflow execution...');
    addDebugLog(`📊 Graph: ${nodes.length} nodes, ${edges.length} edges`);

    const graph = getGraph();
    console.log('[RunLog] Graph nodes:', graph.nodes.map(n => ({ id: n.id, type: n.data.type, label: n.data.label })));

    if (graph.nodes.length === 0) {
      alert('Add nodes first!');
      return;
    }

    clearRunLogs();
    setIsRunning(true);
    addDebugLog('🔄 Initializing run...');

    // Log each node configuration
    for (const node of graph.nodes) {
      const data = node.data;
      if (data.type === 'input') {
        addDebugLog(`📥 Input node "${data.label}": "${(data as any).prompt?.slice(0, 50) || '(empty)'}..."`);
      } else if (data.type === 'agent') {
        const agentId = (data as any).agentId || 'main';
        const modelId = (data as any).modelId;
        addDebugLog(`🤖 Agent node "${data.label}": agent=${agentId}${modelId ? `, model=${modelId}` : ' (default model)'}`);
      } else if (data.type === 'merge') {
        addDebugLog(`🔀 Merge node "${data.label}": mode=${(data as any).mode}`);
      } else if (data.type === 'output') {
        addDebugLog(`📤 Output node "${data.label}"`);
      }
    }

    // Log edges
    if (graph.edges.length > 0) {
      addDebugLog(`🔗 Connections: ${graph.edges.map(e => `${e.source} → ${e.target}`).join(', ')}`);
    }

    try {
      addDebugLog('📡 Sending request to server...');
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph }),
      });

      addDebugLog(`📬 Server response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        addDebugLog(`❌ Error: ${errorText}`);
        alert('Error: ' + errorText);
        setIsRunning(false);
        return;
      }

      const data = await response.json();
      const newRunId = data.runId;

      if (!newRunId) {
        addDebugLog('❌ No runId returned from server!');
        alert('No runId returned!');
        setIsRunning(false);
        return;
      }

      setRunId(newRunId);
      addDebugLog(`✅ Run started with ID: ${newRunId}`);

      // Update node statuses
      graph.nodes.forEach((node) => {
        addDebugLog(`▶️ Starting node: ${node.data.label} (${node.data.type})`);
        updateNode(node.id, { status: 'running', output: '' });
      });

      // Connect to SSE
      addDebugLog('🔌 Connecting to event stream (SSE)...');
      const eventSource = new EventSource(`/api/run/${newRunId}/events`);

      eventSource.onmessage = (event) => {
        const evtData = JSON.parse(event.data);
        console.log('[RunLog] SSE message:', evtData);

        if (!evtData || typeof evtData.type !== 'string') return;

        if (evtData.type === 'nodeStarted') {
          const node = graph.nodes.find(n => n.id === evtData.nodeId);
          addDebugLog(`▶️ Node started: ${node?.data.label || evtData.nodeId}`);
          updateNode(evtData.nodeId, { status: 'running' });
        } else if (evtData.type === 'nodeDelta') {
          // Show thinking indicator
          const node = graph.nodes.find(n => n.id === evtData.nodeId);
          const nodeLabel = node?.data.label || evtData.nodeId;
          addDebugLog(`💭 ${nodeLabel}: receiving response... "${evtData.data?.slice(0, 30) || ''}..."`);

          const currNode = useGraphStore.getState().nodes.find((n) => n.id === evtData.nodeId);
          if (currNode) {
            const currentOutput = (currNode.data as { output?: string }).output || '';
            updateNode(evtData.nodeId, { output: currentOutput + evtData.data });
          }
        } else if (evtData.type === 'nodeFinal') {
          const node = graph.nodes.find(n => n.id === evtData.nodeId);
          addDebugLog(`✅ Node completed: ${node?.data.label || evtData.nodeId}`);
          addDebugLog(`📝 Output: "${evtData.data?.slice(0, 100) || ''}..."`);
          updateNode(evtData.nodeId, { status: 'completed', output: evtData.data });
        } else if (evtData.type === 'nodeError') {
          const node = graph.nodes.find(n => n.id === evtData.nodeId);
          addDebugLog(`❌ Node error: ${node?.data.label || evtData.nodeId}`);
          addDebugLog(`💥 Error details: ${evtData.error}`);
          updateNode(evtData.nodeId, { status: 'error', output: evtData.error });
        } else if (evtData.type === 'runCompleted') {
          addDebugLog('🏁 Workflow completed successfully!');
          setIsRunning(false);
          eventSource.close();
        } else if (evtData.type === 'runError') {
          addDebugLog(`❌ Workflow error: ${evtData.error}`);
          alert('Run error: ' + evtData.error);
          setIsRunning(false);
          eventSource.close();
        } else if (evtData.type === 'thinking') {
          const node = graph.nodes.find(n => n.id === evtData.nodeId);
          addDebugLog(`🧠 ${node?.data.label || evtData.nodeId}: ${evtData.content || 'thinking...'}`);
        }
      };

      eventSource.onerror = (err) => {
        addDebugLog(`⚠️ Event stream disconnected: ${err}`);
        setIsRunning(false);
        eventSource.close();
      };
    } catch (error) {
      addDebugLog(`❌ Exception: ${error}`);
      alert('Error: ' + error);
      setIsRunning(false);
    }
  };

  const handleCancel = async () => {
    if (!runId) return;

    try {
      await fetch(`/api/run/${runId}/cancel`, { method: 'POST' });
      setIsRunning(false);
      nodes.forEach((node) => {
        if (node.data.status === 'running') {
          updateNode(node.id, { status: 'idle' });
        }
      });
    } catch (error) {
      console.error('Cancel error:', error);
    }
  };

  return (
    <div
      style={{
        height: 200,
        background: '#16213e',
        borderTop: '1px solid #333',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid #333',
        }}
      >
        <button
          onClick={isRunning ? handleCancel : handleRun}
          disabled={nodes.length === 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            background: isRunning ? '#dc2626' : '#16a34a',
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            fontSize: 13,
            fontWeight: 'bold',
            cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
            opacity: nodes.length === 0 ? 0.5 : 1,
          }}
        >
          {isRunning ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isRunning ? 'STOP' : 'RUN'}
        </button>

        <button
          onClick={clearRunLogs}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: '#333',
            border: 'none',
            borderRadius: 4,
            color: '#aaa',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <RotateCcw className="w-3 h-3" />
          Clear
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#888' }}>
          {isRunning ? '🔄 Running...' : `Ready (${nodes.length} nodes, ${edges.length} edges)`}
        </span>
      </div>

      {/* Log content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '8px 12px',
          fontFamily: 'monospace',
          fontSize: 10,
          color: '#aaa',
        }}
      >
        {/* Debug toggle */}
        <div
          onClick={() => setShowDebug(!showDebug)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            color: '#888',
            marginBottom: 8,
          }}
        >
          {showDebug ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <MessageSquare className="w-3 h-3" />
          <span>Debug Log (thinking process)</span>
        </div>

        {showDebug && (
          <div style={{ marginBottom: 8, maxHeight: 120, overflow: 'auto', background: '#0a0a1a', padding: 4, borderRadius: 4 }}>
            {runLogs.map((log, i) => (
              <div key={i} style={{
                color: log.type === 'debug'
                  ? (String(log.data).includes('❌') ? '#ef4444' :
                     String(log.data).includes('✅') ? '#22c55e' :
                     String(log.data).includes('🏁') ? '#22c55e' :
                     String(log.data).includes('💭') ? '#f59e0b' :
                     String(log.data).includes('🧠') ? '#a855f7' :
                     '#888')
                  : '#666',
                marginBottom: 2,
                fontSize: 9,
              }}>
                {log.data}
              </div>
            ))}
            {runLogs.length === 0 && <span style={{ color: '#444' }}>Click RUN to see execution logs...</span>}
          </div>
        )}

        {nodes.length === 0 ? (
          <div style={{ color: '#666' }}>Click nodes in palette to add them, then click RUN</div>
        ) : (
          <div>
            {nodes.map(node => (
              <div key={node.id} style={{ marginBottom: 2 }}>
                {node.data.status === 'running' ? '⏳' :
                 node.data.status === 'completed' ? '✅' :
                 node.data.status === 'error' ? '❌' : '📍'} {node.data.label} ({node.data.type})
                {node.data.type === 'input' && ` - "${(node.data as any).prompt?.slice(0, 30) || 'no prompt'}..."`}
                {node.data.type === 'agent' && ` - agent: ${(node.data as any).agentId || 'none'}`}
                {node.data.type === 'agent' && (node.data as any).modelId && `, model: ${(node.data as any).modelId}`}
              </div>
            ))}
            {edges.length > 0 && (
              <div style={{ marginTop: 8, color: '#888' }}>
                Connections: {edges.map(e => `${e.source} → ${e.target}`).join(', ')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
