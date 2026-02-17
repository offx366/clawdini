// Run Log - bottom panel showing execution logs
import { useGraphStore } from '../store';
import { Play, Square, RotateCcw } from 'lucide-react';

export function RunLog() {
  const { nodes, edges, isRunning, runId, setIsRunning, setRunId, clearRunLogs, getGraph, updateNode } = useGraphStore();

  const handleRun = async () => {
    console.log('[RunLog] === handleRun START ===');
    console.log('[RunLog] nodes count:', nodes.length);
    console.log('[RunLog] edges count:', edges.length);

    const graph = getGraph();
    console.log('[RunLog] Graph nodes:', graph.nodes.map(n => ({ id: n.id, type: n.data.type, label: n.data.label })));
    console.log('[RunLog] Graph edges:', graph.edges);

    if (graph.nodes.length === 0) {
      console.log('[RunLog] No nodes to run!');
      alert('Add nodes first!');
      return;
    }

    clearRunLogs();
    setIsRunning(true);

    try {
      console.log('[RunLog] Sending request to /api/run');
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph }),
      });

      console.log('[RunLog] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[RunLog] Error response:', errorText);
        alert('Error: ' + errorText);
        setIsRunning(false);
        return;
      }

      const data = await response.json();
      console.log('[RunLog] Response data:', data);
      const newRunId = data.runId;

      if (!newRunId) {
        console.error('[RunLog] No runId in response!');
        alert('No runId returned!');
        setIsRunning(false);
        return;
      }

      setRunId(newRunId);

      // Update node statuses
      graph.nodes.forEach((node) => {
        console.log('[RunLog] Setting node running:', node.id);
        updateNode(node.id, { status: 'running', output: '' });
      });

      // Connect to SSE
      console.log('[RunLog] Connecting to SSE...');
      const eventSource = new EventSource(`/api/run/${newRunId}/events`);

      eventSource.onmessage = (event) => {
        console.log('[RunLog] SSE message:', event.data);
        const data = JSON.parse(event.data);

        // Ignore non-run events
        if (!data || typeof data.type !== 'string') return;

        if (data.type === 'nodeStarted') {
          console.log('[RunLog] Node started:', data.nodeId);
          updateNode(data.nodeId, { status: 'running' });
        } else if (data.type === 'nodeDelta') {
          // Pull latest state; the `nodes` captured by this closure can be stale.
          const node = useGraphStore.getState().nodes.find((n) => n.id === data.nodeId);
          if (node) {
            const currentOutput = (node.data as { output?: string }).output || '';
            updateNode(data.nodeId, { output: currentOutput + data.data });
          }
        } else if (data.type === 'nodeFinal') {
          console.log('[RunLog] Node final:', data.nodeId);
          updateNode(data.nodeId, { status: 'completed', output: data.data });
        } else if (data.type === 'nodeError') {
          console.log('[RunLog] Node error:', data.nodeId, data.error);
          updateNode(data.nodeId, { status: 'error', output: data.error });
        } else if (data.type === 'runCompleted') {
          console.log('[RunLog] Run completed!');
          setIsRunning(false);
          eventSource.close();
        } else if (data.type === 'runError') {
          console.log('[RunLog] Run error:', data.error);
          alert('Run error: ' + data.error);
          setIsRunning(false);
          eventSource.close();
        }
      };

      eventSource.onerror = (err) => {
        console.error('[RunLog] SSE error:', err);
        setIsRunning(false);
        eventSource.close();
      };
    } catch (error) {
      console.error('[RunLog] Catch error:', error);
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
        <div style={{ color: '#666', marginBottom: 4 }}>
          💡 Check browser console (F12) for detailed debug logs
        </div>
        {nodes.length === 0 ? (
          <div style={{ color: '#666' }}>Click nodes in palette to add them, then click RUN</div>
        ) : (
          <div>
            {nodes.map(node => (
              <div key={node.id} style={{ marginBottom: 2 }}>
                📍 {node.data.label} ({node.data.type})
                {node.data.type === 'input' && ` - "${(node.data as any).prompt?.slice(0, 30) || 'no prompt'}..."`}
                {node.data.type === 'agent' && ` - agent: ${(node.data as any).agentId || 'none'}`}
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
