// Node Inspector - right panel for editing selected node properties
import { useGraphStore } from '../store';
import { Trash2, Settings2, XCircle, PlusCircle } from 'lucide-react';
import type { InputNodeData, AgentNodeData, MergeNodeData, OutputNodeData, SwitchNodeData, ExtractNodeData, InvokeNodeData, ForEachNodeData } from '@clawdini/types';
import { v4 as uuidv4 } from 'uuid';

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
    judge: '#eab308',
    switch: '#ec4899',
    extract: '#06b6d4',
    invoke: '#ef4444',
    foreach: '#f97316',
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
        </>
      )}

      {data.type === 'switch' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label className="inspector-label" style={{ margin: 0 }}>Routing Rules (Regex)</label>
            <button
              className="btn"
              style={{ padding: '2px 6px', fontSize: 10, display: 'flex', gap: 4, alignItems: 'center' }}
              onClick={() => {
                const rules = [...((data as SwitchNodeData).rules || [])];
                rules.push({ id: uuidv4(), condition: '' });
                updateNode(selectedNode.id, { rules });
              }}
            >
              <PlusCircle size={10} /> Add Rule
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {((data as SwitchNodeData).rules || []).map((rule, idx) => (
              <div key={rule.id} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 14 }}>{idx + 1}.</span>
                <input
                  type="text"
                  className="inspector-input"
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }}
                  value={rule.condition}
                  onChange={(e) => {
                    const rules = [...((data as SwitchNodeData).rules || [])];
                    rules[idx] = { ...rule, condition: e.target.value };
                    updateNode(selectedNode.id, { rules });
                  }}
                  placeholder="Regex pattern (e.g. .*error.*)"
                />
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex' }}
                  onClick={() => {
                    const rules = ((data as SwitchNodeData).rules || []).filter(r => r.id !== rule.id);
                    updateNode(selectedNode.id, { rules });
                  }}
                  title="Remove rule"
                >
                  <XCircle size={12} />
                </button>
              </div>
            ))}
            {((data as SwitchNodeData).rules || []).length === 0 && (
              <div style={{ fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                No routing rules defined. Node will halt execution.
              </div>
            )}
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.4 }}>
              If multiple rules match, execution duplicates down all matching branches. If no rules match, this path halts.
            </div>
          </div>
        </>
      )}

      {data.type === 'extract' && (
        <>
          <div>
            <label className="inspector-label">Model (for Extraction)</label>
            <select
              className="inspector-select"
              value={(data as ExtractNodeData).modelId || ''}
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
            <label className="inspector-label">JSON Schema</label>
            <textarea
              className="inspector-textarea"
              value={(data as ExtractNodeData).schema || ''}
              onChange={(e) => updateNode(selectedNode.id, { schema: e.target.value })}
              placeholder={'{\\n  "key": "type"\\n}'}
              rows={10}
              style={{ fontFamily: 'monospace', fontSize: 11 }}
            />
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.4 }}>
              The runner will force the LLM to output ONLY JSON matching this structure. The result will be available in payload.json
            </div>
          </div>
        </>
      )}

      {data.type === 'invoke' && (
        <>
          <div>
            <label className="inspector-label">API Command Name</label>
            <input
              type="text"
              className="inspector-input"
              value={(data as InvokeNodeData).commandName || ''}
              onChange={(e) => updateNode(selectedNode.id, { commandName: e.target.value })}
              placeholder="e.g. system.run, browser.goto"
            />
          </div>

          <div>
            <label className="inspector-label">Payload Template (JSON)</label>
            <textarea
              className="inspector-textarea"
              value={(data as InvokeNodeData).payloadTemplate || ''}
              onChange={(e) => updateNode(selectedNode.id, { payloadTemplate: e.target.value })}
              placeholder={'{\\n  "url": "{INPUT}"\\n}'}
              rows={8}
              style={{ fontFamily: 'monospace', fontSize: 11 }}
            />
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.4 }}>
              Tip: Use {'{INPUT}'} to merge upstream payload text.
            </div>
          </div>
        </>
      )}

      {data.type === 'foreach' && (
        <>
          <div>
            <label className="inspector-label">JSON Array Path</label>
            <input
              type="text"
              className="inspector-input"
              value={(data as ForEachNodeData).arrayPath || ''}
              onChange={(e) => updateNode(selectedNode.id, { arrayPath: e.target.value })}
              placeholder="e.g. results.items"
            />
            <div style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.4 }}>
              Leave blank to use the root JSON array. The graph logic below this node will execute in parallel for each item in the array.
            </div>
          </div>
        </>
      )}

      {/* ── Payload Data (if exists) ─────────────────────────────── */}
      {(data as any).payload && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 4 }}>
            Payload Data
          </div>

          <label className="inspector-label">Text</label>
          <textarea
            className="inspector-textarea"
            value={(data as any).payload.text || ''}
            readOnly
            rows={5}
            style={{ color: 'var(--text-primary)', background: 'var(--bg-input)' }}
          />

          {(data as any).payload.json && (
            <>
              <label className="inspector-label" style={{ marginTop: 8 }}>JSON</label>
              <textarea
                className="inspector-textarea"
                value={JSON.stringify((data as any).payload.json, null, 2)}
                readOnly
                rows={5}
                style={{ color: 'var(--accent-green)', background: 'rgba(0,0,0,0.25)', fontFamily: 'monospace' }}
              />
            </>
          )}

          {(data as any).payload.meta && Object.keys((data as any).payload.meta).length > 0 && (
            <div style={{ marginTop: 8, padding: 8, background: 'var(--bg-deep)', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 4 }}>METADATA</div>
              {Object.entries((data as any).payload.meta).map(([k, v]) => (
                <div key={k} style={{ fontSize: 10, display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{k}:</span>
                  <span style={{ color: 'var(--accent-cyan)', fontFamily: 'monospace', textAlign: 'right', wordBreak: 'break-all', marginLeft: 8 }}>
                    {String(v)}
                  </span>
                </div>
              ))}
            </div>
          )}
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
