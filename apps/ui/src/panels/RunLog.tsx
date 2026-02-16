// Run Log - bottom panel showing execution logs
import { useGraphStore } from '../store';
import { Play, Square, RotateCcw } from 'lucide-react';

export function RunLog() {
  const { nodes, isRunning, runId, runLogs, setIsRunning, setRunId, clearRunLogs, getGraph, updateNode } = useGraphStore();

  const handleRun = async () => {
    const graph = getGraph();
    clearRunLogs();
    setIsRunning(true);

    try {
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph }),
      });

      if (!response.ok) {
        throw new Error('Failed to start run');
      }

      const { runId: newRunId } = await response.json();
      setRunId(newRunId);

      // Update node statuses
      nodes.forEach((node) => {
        updateNode(node.id, { status: 'running', output: '' });
      });

      // Poll for events (simplified SSE)
      const eventSource = new EventSource(`/api/run/${newRunId}/events`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'nodeStarted') {
          updateNode(data.nodeId, { status: 'running' });
        } else if (data.type === 'nodeDelta') {
          const node = nodes.find((n) => n.id === data.nodeId);
          if (node) {
            const currentOutput = (node.data as { output?: string }).output || '';
            updateNode(data.nodeId, { output: currentOutput + data.data });
          }
        } else if (data.type === 'nodeFinal') {
          updateNode(data.nodeId, { status: 'completed', output: data.data });
        } else if (data.type === 'nodeError') {
          updateNode(data.nodeId, { status: 'error', output: data.error });
        } else if (data.type === 'runCompleted') {
          setIsRunning(false);
          eventSource.close();
        } else if (data.type === 'runError') {
          setIsRunning(false);
          eventSource.close();
        }
      };

      eventSource.onerror = () => {
        setIsRunning(false);
        eventSource.close();
      };
    } catch (error) {
      console.error('Run error:', error);
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
        height: 150,
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
            padding: '6px 12px',
            background: isRunning ? '#7f1d1d' : '#166534',
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            fontSize: 12,
            cursor: nodes.length === 0 ? 'not-allowed' : 'pointer',
            opacity: nodes.length === 0 ? 0.5 : 1,
          }}
        >
          {isRunning ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {isRunning ? 'Stop' : 'Run'}
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

        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#666' }}>
          {isRunning ? 'Running...' : 'Ready'}
        </span>
      </div>

      {/* Log content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '8px 12px',
          fontFamily: 'monospace',
          fontSize: 11,
        }}
      >
        {runLogs.length === 0 ? (
          <span style={{ color: '#666' }}>No run logs yet. Add nodes and click Run.</span>
        ) : (
          runLogs.map((log, i) => (
            <div key={i} style={{ color: '#888', marginBottom: 2 }}>
              <span style={{ color: '#555' }}>[{log.type}]</span>{' '}
              {'nodeId' in log ? log.nodeId : ''} {'data' in log && log.data ? String(log.data).slice(0, 50) : ''}
              {'error' in log && log.error ? `Error: ${log.error}` : ''}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
