// Node Inspector - right panel for editing selected node properties
import { useGraphStore } from '../store';
import { Trash2, Settings2 } from 'lucide-react';
import type { InputNodeData, AgentNodeData, MergeNodeData, OutputNodeData } from '@clawdini/types';

export function NodeInspector() {
  const { nodes, edges, selectedNodeId, agents, models, updateNode, removeNode } = useGraphStore();

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  if (!selectedNode) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'var(--bg-panel)',
          borderLeft: '1px solid var(--border-subtle)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          color: 'var(--text-dim)',
        }}
      >
        <Settings2 size={24} />
        <span style={{ fontSize: 12 }}>Select a node to inspect</span>
      </div>
    );
  }

  const data = selectedNode.data;
  const incomingEdges = edges.filter((e) => e.target === selectedNode.id);
  const outgoingEdges = edges.filter((e) => e.source === selectedNode.id);

  const nodeColors: Record<string, string> = {
    input: '#3b82f6',
    agent: '#8b5cf6',
    merge: '#22c55e',
    output: '#f59e0b',
  };
  const color = nodeColors[data.type] || '#888';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border-subtle)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 6px ${color}80`,
          }}
        />
        <span
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 700,
          }}
        >
          {data.type} Inspector
        </span>
      </div>

      {/* Label */}
      <div>
        <label className="inspector-label">Label</label>
        <input
          className="inspector-input"
          type="text"
          value={data.label}
          onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
        />
      </div>

      {/* ── Type-specific fields ────────────────────────────────── */}

      {data.type === 'input' && (
        <div>
          <label className="inspector-label">Prompt</label>
          <textarea
            className="inspector-textarea"
            value={(data as InputNodeData).prompt}
            onChange={(e) => updateNode(selectedNode.id, { prompt: e.target.value })}
            placeholder="Enter prompt..."
            rows={5}
          />
        </div>
      )}

      {data.type === 'agent' && (
        <>
          <div>
            <label className="inspector-label">Agent</label>
            <select
              className="inspector-select"
              value={(data as AgentNodeData).agentId}
              onChange={(e) => updateNode(selectedNode.id, { agentId: e.target.value })}
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
            <label className="inspector-label">Model (optional)</label>
            <select
              className="inspector-select"
              value={(data as AgentNodeData).modelId || ''}
              onChange={(e) => updateNode(selectedNode.id, { modelId: e.target.value || undefined })}
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
            <label className="inspector-label">Role (optional)</label>
            <select
              className="inspector-select"
              value={(data as AgentNodeData).role || ''}
              onChange={(e) => updateNode(selectedNode.id, { role: (e.target.value as any) || undefined })}
            >
              <option value="">None (Default)</option>
              <option value="planner">Planner / Manager</option>
              <option value="critic">Critic / Reviewer</option>
              <option value="researcher">Researcher</option>
              <option value="operator">Operator / Executor</option>
            </select>
          </div>
        </>
      )}

      {data.type === 'merge' && (
        <>
          <div>
            <label className="inspector-label">Mode</label>
            <select
              className="inspector-select"
              value={(data as MergeNodeData).mode}
              onChange={(e) => updateNode(selectedNode.id, { mode: e.target.value as 'concat' | 'llm' | 'consensus' })}
            >
              <option value="concat">Concatenate</option>
              <option value="llm">LLM Merge</option>
              <option value="consensus">Consensus (Meeting Minutes)</option>
            </select>
          </div>

          {/* Show incoming connections count */}
          <div
            style={{
              padding: '6px 10px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}>
              {incomingEdges.length}
            </span>{' '}
            input{incomingEdges.length !== 1 ? 's' : ''} connected
          </div>

          {(data as MergeNodeData).mode === 'llm' && (
            <>
              <div>
                <label className="inspector-label">Model (for LLM Merge)</label>
                <select
                  className="inspector-select"
                  value={(data as MergeNodeData).modelId || ''}
                  onChange={(e) => updateNode(selectedNode.id, { modelId: e.target.value || undefined })}
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
                <label className="inspector-label">Custom Prompt (optional)</label>
                <textarea
                  className="inspector-textarea"
                  value={(data as MergeNodeData).prompt || ''}
                  onChange={(e) => updateNode(selectedNode.id, { prompt: e.target.value || undefined })}
                  placeholder="Use {INPUTS} placeholder..."
                  rows={5}
                />
              </div>
            </>
          )}

          {(data as MergeNodeData).mode === 'consensus' && (
            <div>
              <label className="inspector-label">Model (for Consensus)</label>
              <select
                className="inspector-select"
                value={(data as MergeNodeData).modelId || ''}
                onChange={(e) => updateNode(selectedNode.id, { modelId: e.target.value || undefined })}
              >
                <option value="">Default model</option>
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.provider})
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {data.type === 'judge' && (
        <>
          <div>
            <label className="inspector-label">Model</label>
            <select
              className="inspector-select"
              value={(data as any).modelId || ''}
              onChange={(e) => updateNode(selectedNode.id, { modelId: e.target.value || undefined })}
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
            <label className="inspector-label">Evaluation Criteria</label>
            <textarea
              className="inspector-textarea"
              value={(data as any).criteria || ''}
              onChange={(e) => updateNode(selectedNode.id, { criteria: e.target.value })}
              placeholder="e.g. 1. Is it safe to execute? 2. Are all edge cases handled?"
              rows={5}
            />
          </div>

          <div>
            <label className="inspector-label">Output (JSON format)</label>
            <textarea
              className="inspector-textarea"
              value={(data as any).output || ''}
              readOnly
              placeholder="{}"
              rows={8}
              style={{ color: 'var(--accent-green)', background: 'rgba(0,0,0,0.25)', fontFamily: 'monospace' }}
            />
          </div>
        </>
      )}

      {data.type === 'output' && (
        <div>
          <label className="inspector-label">Output</label>
          <textarea
            className="inspector-textarea"
            value={(data as OutputNodeData).output || ''}
            readOnly
            placeholder="Output will appear after run..."
            rows={8}
            style={{ color: 'var(--accent-green)', background: 'rgba(0,0,0,0.25)' }}
          />
        </div>
      )}

      {/* ── Connections info ─────────────────────────────────────── */}
      <div
        style={{
          padding: '6px 10px',
          background: 'var(--bg-input)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          fontSize: 10,
          color: 'var(--text-muted)',
          lineHeight: 1.6,
        }}
      >
        {incomingEdges.length > 0 && (
          <div>↓ {incomingEdges.length} incoming</div>
        )}
        {outgoingEdges.length > 0 && (
          <div>↑ {outgoingEdges.length} outgoing</div>
        )}
        {incomingEdges.length === 0 && outgoingEdges.length === 0 && (
          <div>No connections</div>
        )}
      </div>

      {/* Delete button */}
      <div style={{ flex: 1 }} />
      <button
        className="btn btn-danger"
        onClick={() => removeNode(selectedNode.id)}
        style={{ width: '100%' }}
      >
        <Trash2 size={12} />
        Delete Node
      </button>
    </div>
  );
}
