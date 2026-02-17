// Node Inspector - right panel for editing selected node properties
import { useGraphStore } from '../store';
import { Trash2 } from 'lucide-react';
import type { InputNodeData, AgentNodeData, MergeNodeData, OutputNodeData } from '@clawdini/types';

export function NodeInspector() {
  const { nodes, selectedNodeId, agents, models, updateNode, removeNode } = useGraphStore();

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!selectedNode) {
    return (
      <div
        style={{
          width: 240,
          background: '#16213e',
          borderLeft: '1px solid #333',
          padding: 16,
          color: '#666',
          fontSize: 13,
        }}
      >
        Select a node to edit
      </div>
    );
  }

  const data = selectedNode.data;

  return (
    <div
      style={{
        width: 240,
        background: '#16213e',
        borderLeft: '1px solid #333',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
        Inspector
      </div>

      {/* Label */}
      <div>
        <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 4 }}>Label</label>
        <input
          type="text"
          value={data.label}
          onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
          style={{
            width: '100%',
            padding: '8px 10px',
            background: '#1a1a2e',
            border: '1px solid #333',
            borderRadius: 4,
            color: '#eee',
            fontSize: 13,
          }}
        />
      </div>

      {/* Type-specific fields */}
      {data.type === 'input' && (
        <div>
          <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 4 }}>Prompt</label>
          <textarea
            value={(data as InputNodeData).prompt}
            onChange={(e) => updateNode(selectedNode.id, { prompt: e.target.value })}
            placeholder="Enter prompt..."
            rows={4}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: '#1a1a2e',
              border: '1px solid #333',
              borderRadius: 4,
              color: '#eee',
              fontSize: 13,
              resize: 'vertical',
              fontFamily: 'monospace',
            }}
          />
        </div>
      )}

      {data.type === 'agent' && (
        <>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 4 }}>Agent</label>
            <select
              value={(data as AgentNodeData).agentId}
              onChange={(e) => updateNode(selectedNode.id, { agentId: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: '#1a1a2e',
                border: '1px solid #333',
                borderRadius: 4,
                color: '#eee',
                fontSize: 13,
              }}
            >
              <option value="">Select agent...</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.identity?.name || agent.name || agent.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 4 }}>Model (optional)</label>
            <select
              value={(data as AgentNodeData).modelId || ''}
              onChange={(e) => updateNode(selectedNode.id, { modelId: e.target.value || undefined })}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: '#1a1a2e',
                border: '1px solid #333',
                borderRadius: 4,
                color: '#eee',
                fontSize: 13,
              }}
            >
              <option value="">Default model</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.provider})
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {data.type === 'merge' && (
        <>
          <div>
            <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 4 }}>Mode</label>
            <select
              value={(data as MergeNodeData).mode}
              onChange={(e) => updateNode(selectedNode.id, { mode: e.target.value as 'concat' | 'llm' })}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: '#1a1a2e',
                border: '1px solid #333',
                borderRadius: 4,
                color: '#eee',
                fontSize: 13,
              }}
            >
              <option value="concat">Concatenate</option>
              <option value="llm">LLM Merge</option>
            </select>
          </div>

          {(data as MergeNodeData).mode === 'llm' && (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 4 }}>Model (for LLM Merge)</label>
                <select
                  value={(data as MergeNodeData).modelId || ''}
                  onChange={(e) => updateNode(selectedNode.id, { modelId: e.target.value || undefined })}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: '#1a1a2e',
                    border: '1px solid #333',
                    borderRadius: 4,
                    color: '#eee',
                    fontSize: 13,
                  }}
                >
                  <option value="">Default model</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} ({model.provider})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 4 }}>Custom Prompt (optional)</label>
                <textarea
                  value={(data as MergeNodeData).prompt || ''}
                  onChange={(e) => updateNode(selectedNode.id, { prompt: e.target.value || undefined })}
                  placeholder="Leave empty to use default prompt..."
                  rows={6}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: '#1a1a2e',
                    border: '1px solid #333',
                    borderRadius: 4,
                    color: '#eee',
                    fontSize: 12,
                    resize: 'vertical',
                    fontFamily: 'monospace',
                  }}
                />
              </div>
            </>
          )}
        </>
      )}

      {data.type === 'output' && (
        <div>
          <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 4 }}>Output</label>
          <textarea
            value={(data as OutputNodeData).output || ''}
            readOnly
            placeholder="Output will appear here after run..."
            rows={8}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: '#0a0a15',
              border: '1px solid #333',
              borderRadius: 4,
              color: '#22c55e',
              fontSize: 12,
              resize: 'vertical',
              fontFamily: 'monospace',
            }}
          />
        </div>
      )}

      {/* Delete button */}
      <button
        onClick={() => {
          removeNode(selectedNode.id);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          marginTop: 'auto',
          padding: '8px 12px',
          background: '#3d1f1f',
          border: '1px solid #ef4444',
          borderRadius: 4,
          color: '#ef4444',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        <Trash2 className="w-3 h-3" />
        Delete Node
      </button>
    </div>
  );
}
