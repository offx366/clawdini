// Run Log - bottom panel showing execution logs
import { useGraphStore } from '../store';
import { Play, Square, RotateCcw, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export function RunLog() {
  const { nodes, edges, isRunning, runId, runLogs, setIsRunning, setRunId, clearRunLogs, getGraph, updateNode, addRunLog } = useGraphStore();
  const [showDebug, setShowDebug] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [runLogs.length]);

  const addDebugLog = (message: string) => {
    console.log('[DEBUG]', message);
    addRunLog({ type: 'debug', nodeId: 'system', data: message, timestamp: Date.now() } as any);
  };

  const handleRun = async () => {
    console.log('[RunLog] === handleRun START ===');
    addDebugLog('🚀 Starting workflow execution...');
    addDebugLog(`📊 Graph: ${nodes.length} nodes, ${edges.length} edges`);

    const graph = getGraph();

    if (graph.nodes.length === 0) {
      alert('Add nodes first!');
      return;
    }

    clearRunLogs();
    setIsRunning(true);
    addDebugLog('🔄 Initializing run...');

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

      graph.nodes.forEach((node) => {
        addDebugLog(`▶️ Starting node: ${node.data.label} (${node.data.type})`);
        updateNode(node.id, { status: 'running', payload: { text: '', meta: {} } });
      });

      addDebugLog('🔌 Connecting to event stream (SSE)...');
      const eventSource = new EventSource(`/api/run/${newRunId}/events`);

      eventSource.onmessage = (event) => {
        const evtData = JSON.parse(event.data);
        if (!evtData || typeof evtData.type !== 'string') return;

        if (evtData.type === 'nodeStarted') {
          const node = graph.nodes.find(n => n.id === evtData.nodeId);
          addDebugLog(`▶️ Node started: ${node?.data.label || evtData.nodeId}`);
          updateNode(evtData.nodeId, { status: 'running' });
        } else if (evtData.type === 'nodeDelta') {
          const node = graph.nodes.find(n => n.id === evtData.nodeId);
          const nodeLabel = node?.data.label || evtData.nodeId;
          const textDelta = evtData.data?.text || '';
          addDebugLog(`💭 ${nodeLabel}: receiving response... "${textDelta.slice(0, 30)}..."`);

          const currNode = useGraphStore.getState().nodes.find((n) => n.id === evtData.nodeId);
          if (currNode) {
            const currentPayload = (currNode.data as any).payload || { text: '', meta: {} };
            updateNode(evtData.nodeId, {
              payload: { ...currentPayload, text: currentPayload.text + textDelta }
            });
          }
        } else if (evtData.type === 'nodeFinal') {
          const node = graph.nodes.find(n => n.id === evtData.nodeId);
          addDebugLog(`✅ Node completed: ${node?.data.label || evtData.nodeId}`);
          addDebugLog(`📝 Output: "${evtData.data?.text?.slice(0, 100) || ''}..."`);
          updateNode(evtData.nodeId, { status: 'completed', payload: evtData.data });
        } else if (evtData.type === 'nodeError') {
          const node = graph.nodes.find(n => n.id === evtData.nodeId);
          addDebugLog(`❌ Node error: ${node?.data.label || evtData.nodeId}`);
          addDebugLog(`💥 Error details: ${evtData.error}`);
          updateNode(evtData.nodeId, { status: 'error', payload: { text: evtData.error || '', meta: {} } });
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

  const getLogColor = (logData: string) => {
    if (logData.includes('❌') || logData.includes('💥')) return 'var(--accent-red)';
    if (logData.includes('✅') || logData.includes('🏁')) return 'var(--accent-green)';
    if (logData.includes('💭')) return 'var(--accent-amber)';
    if (logData.includes('🧠')) return 'var(--accent-primary)';
    if (logData.includes('🚀') || logData.includes('📡') || logData.includes('🔌')) return 'var(--accent-cyan)';
    return 'var(--text-muted)';
  };

  return (
    <div
      style={{
        height: '100%',
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <button
          className={`btn ${isRunning ? 'btn-stop' : 'btn-run'}`}
          onClick={isRunning ? handleCancel : handleRun}
          disabled={nodes.length === 0}
          style={{
            opacity: nodes.length === 0 ? 0.4 : 1,
            cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {isRunning ? <Square size={12} /> : <Play size={12} />}
          {isRunning ? 'STOP' : 'RUN'}
        </button>

        <button className="btn btn-secondary" onClick={clearRunLogs}>
          <RotateCcw size={11} />
          Clear
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
          {isRunning ? (
            <span style={{ color: 'var(--accent-green)', animation: 'pulse 1.5s infinite' }}>
              ● Running...
            </span>
          ) : (
            `${nodes.length} nodes · ${edges.length} edges`
          )}
        </span>
      </div>

      {/* Log content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '6px 10px',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 10,
        }}
      >
        {/* Debug toggle */}
        <div
          onClick={() => setShowDebug(!showDebug)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            color: 'var(--text-muted)',
            marginBottom: 6,
            padding: '2px 6px',
            background: 'var(--bg-input)',
            borderRadius: 4,
            fontSize: 10,
          }}
        >
          {showDebug ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          <MessageSquare size={10} />
          <span>Execution Log</span>
          {runLogs.length > 0 && (
            <span style={{ color: 'var(--accent-primary)', marginLeft: 4 }}>({runLogs.length})</span>
          )}
        </div>

        {showDebug && (
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              display: 'flex',
              flexDirection: 'column',
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
          >
            {runLogs.map((log: any, i) => (
              <div
                key={i}
                style={{
                  color: log.type === 'debug' ? getLogColor(String(log.data)) : 'var(--text-dim)',
                  marginBottom: 1,
                  fontSize: 9,
                  lineHeight: 1.5,
                  animation: 'fadeIn 0.2s ease',
                }}
              >
                {log.data && typeof log.data === 'string' ? log.data : ''}
              </div>
            ))}
            {runLogs.length === 0 && (
              <span style={{ color: 'var(--text-dim)' }}>Click RUN to see execution logs...</span>
            )}
            <div ref={logEndRef} />
          </div>
        )}

        {/* Node status */}
        {nodes.length > 0 && (
          <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
            {nodes.map((node) => (
              <div
                key={node.id}
                style={{
                  marginBottom: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span>
                  {node.data.status === 'running'
                    ? '⏳'
                    : node.data.status === 'completed'
                      ? '✅'
                      : node.data.status === 'error'
                        ? '❌'
                        : '◦'}
                </span>
                <span style={{ fontWeight: 600 }}>{node.data.label}</span>
                <span style={{ color: 'var(--text-dim)' }}>({node.data.type})</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
