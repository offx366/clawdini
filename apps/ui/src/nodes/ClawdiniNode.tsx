// Custom Clawdini Node for ReactFlow
import { memo } from 'react';
import { Handle, Position, useEdges, type NodeProps } from '@xyflow/react';
import {
  InputNodeData,
  AgentNodeData,
  MergeNodeData,
  OutputNodeData,
  SwitchNodeData,
  ExtractNodeData,
  InvokeNodeData,
  ForEachNodeData,
  StateNodeData,
  TemplateNodeData,
} from '@clawdini/types';
import { Bot, FileInput, GitMerge, FileOutput, Loader2, CheckCircle, XCircle, GitBranch, Scale, Database, Zap, Repeat, Layers, FileJson } from 'lucide-react';

const nodeStyles: Record<string, { bg: string; border: string; glow: string }> = {
  input: { bg: '#0f2440', border: '#3b82f6', glow: 'rgba(59,130,246,0.15)' },
  agent: { bg: '#1a1040', border: '#8b5cf6', glow: 'rgba(139,92,246,0.15)' },
  merge: { bg: '#0f2818', border: '#22c55e', glow: 'rgba(34,197,94,0.15)' },
  judge: { bg: '#2a2408', border: '#eab308', glow: 'rgba(234,179,8,0.15)' },
  switch: { bg: '#2a0a18', border: '#ec4899', glow: 'rgba(236,72,153,0.15)' },
  extract: { bg: '#082f2a', border: '#06b6d4', glow: 'rgba(6,182,212,0.15)' },
  invoke: { bg: '#2a0a0a', border: '#ef4444', glow: 'rgba(239,68,68,0.15)' },
  foreach: { bg: '#2a1400', border: '#f97316', glow: 'rgba(249,115,22,0.15)' },
  state: { bg: '#081a2f', border: '#3b82f6', glow: 'rgba(59,130,246,0.15)' },
  template: { bg: '#170c2e', border: '#6366f1', glow: 'rgba(99,102,241,0.15)' },
  output: { bg: '#2a1a08', border: '#f59e0b', glow: 'rgba(245,158,11,0.15)' },
};

const icons: Record<string, React.ElementType> = {
  input: FileInput,
  agent: Bot,
  merge: GitMerge,
  judge: Scale,
  switch: GitBranch,
  extract: Database,
  invoke: Zap,
  foreach: Repeat,
  state: Layers,
  template: FileJson,
  output: FileOutput,
};

const statusConfig: Record<string, { icon: React.ElementType; color: string }> = {
  idle: { icon: CheckCircle, color: '#555' },
  running: { icon: Loader2, color: '#f59e0b' },
  completed: { icon: CheckCircle, color: '#22c55e' },
  error: { icon: XCircle, color: '#ef4444' },
};

function ClawdiniNode({ data, selected, id }: NodeProps) {
  const nodeData = data as unknown as InputNodeData | AgentNodeData | MergeNodeData | OutputNodeData | SwitchNodeData | ExtractNodeData | InvokeNodeData | ForEachNodeData | StateNodeData | TemplateNodeData;
  const type = nodeData.type;
  const style = nodeStyles[type] || nodeStyles.input;
  const Icon = icons[type] || FileInput;
  const edges = useEdges();

  // Get status only for nodes that have it
  const status = 'status' in nodeData ? (nodeData as AgentNodeData | MergeNodeData).status : 'idle';
  const { icon: StatusIcon, color: statusColor } = statusConfig[status || 'idle'];

  // Count incoming edges for merge nodes
  const incomingCount = type === 'merge' ? edges.filter((e) => e.target === id).length : 0;

  return (
    <div
      style={{
        background: `linear-gradient(180deg, ${style.bg} 0%, ${style.bg}dd 100%)`,
        borderWidth: selected ? 2 : 1,
        borderStyle: 'solid',
        borderColor: selected ? style.border : `${style.border}60`,
        borderRadius: 10,
        padding: '10px 14px',
        minWidth: 180,
        color: '#e8e8f0',
        boxShadow: selected
          ? `0 0 20px ${style.glow}, 0 4px 16px rgba(0,0,0,0.4)`
          : `0 2px 8px rgba(0,0,0,0.3)`,
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Input handle (top) */}
      {type !== 'input' && (
        <Handle
          type="target"
          position={Position.Top}
          style={{
            background: style.border,
            width: 10,
            height: 10,
            border: '2px solid #0a0a1e',
            cursor: 'crosshair',
          }}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            background: `${style.border}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={13} style={{ color: style.border }} />
        </div>
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{nodeData.label}</span>
        <StatusIcon
          size={14}
          style={{
            color: statusColor,
            animation: status === 'running' ? 'spin 1s linear infinite' : 'none',
            flexShrink: 0,
          }}
        />
      </div>

      {/* Content based on type */}
      {type === 'input' && (
        <div style={{ fontSize: 11, color: '#8888aa', lineHeight: 1.4 }}>
          {(nodeData as InputNodeData).prompt
            ? (nodeData as InputNodeData).prompt.slice(0, 60) + ((nodeData as InputNodeData).prompt.length > 60 ? '...' : '')
            : 'Click to add prompt...'}
        </div>
      )}

      {type === 'agent' && (
        <div style={{ fontSize: 10, color: '#8888aa' }}>
          {(nodeData as AgentNodeData).agentId || 'No agent selected'}
          {(nodeData as AgentNodeData).modelId && (
            <div style={{ fontSize: 9, color: '#555578', marginTop: 2 }}>
              🧠 {(nodeData as AgentNodeData).modelId!.split('/').pop()}
            </div>
          )}
        </div>
      )}

      {type === 'merge' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#8888aa' }}>
          <span>Mode: {(nodeData as MergeNodeData).mode}</span>
          {incomingCount > 0 && (
            <span
              style={{
                background: '#22c55e20',
                color: '#22c55e',
                padding: '1px 6px',
                borderRadius: 10,
                fontSize: 9,
                fontWeight: 700,
              }}
            >
              {incomingCount} in
            </span>
          )}
        </div>
      )}

      {type === 'switch' && (
        <div style={{ fontSize: 10, color: '#8888aa', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(nodeData as SwitchNodeData).rules?.map((r, i) => (
            <span key={r.id} style={{ background: '#ec489920', color: '#ec4899', padding: '2px 6px', borderRadius: 4, fontSize: 9 }}>
              {r.condition || '.*'}
            </span>
          ))}
        </div>
      )}

      {type === 'extract' && (
        <div style={{ fontSize: 10, color: '#8888aa', display: 'flex', flexDirection: 'column', gap: 2 }}>
          Extraction Schema
          {(nodeData as ExtractNodeData).modelId && (
            <div style={{ fontSize: 9, color: '#555578' }}>
              🧠 {(nodeData as ExtractNodeData).modelId!.split('/').pop()}
            </div>
          )}
        </div>
      )}

      {type === 'invoke' && (
        <div style={{ fontSize: 10, color: '#8888aa', display: 'flex', flexDirection: 'column', gap: 2 }}>
          API: <span style={{ color: '#ef4444' }}>{(nodeData as InvokeNodeData).commandName || 'not set'}</span>
        </div>
      )}

      {type === 'foreach' && (
        <div style={{ fontSize: 10, color: '#8888aa', display: 'flex', flexDirection: 'column', gap: 2 }}>
          Array: <span style={{ color: '#f97316' }}>{(nodeData as ForEachNodeData).arrayPath || 'Root Array'}</span>
        </div>
      )}

      {type === 'template' && (
        <div style={{ fontSize: 10, color: '#8888aa', display: 'flex', flexDirection: 'column', gap: 2 }}>
          Format: <span style={{ color: '#6366f1' }}>{(nodeData as TemplateNodeData).format}</span>
        </div>
      )}

      {type === 'state' && (
        <div style={{ fontSize: 10, color: '#8888aa', display: 'flex', flexDirection: 'column', gap: 2 }}>
          Namespace: <span style={{ color: '#3b82f6' }}>{(nodeData as StateNodeData).namespace}</span>
          Mode: <span style={{ color: '#3b82f6' }}>{(nodeData as StateNodeData).mode}</span>
        </div>
      )}

      {/* Output preview */}
      {'output' in nodeData && nodeData.output && (
        <div
          style={{
            marginTop: 6,
            padding: '4px 6px',
            background: 'rgba(0,0,0,0.25)',
            borderRadius: 4,
            fontSize: 9,
            maxHeight: 50,
            overflow: 'hidden',
            whiteSpace: 'pre-wrap',
            color: '#22c55e',
            lineHeight: 1.3,
          }}
        >
          {String(nodeData.output).slice(0, 80)}
          {String(nodeData.output).length > 80 && '...'}
        </div>
      )}

      {/* Output handle (bottom) */}
      {type === 'switch' ? (
        <div style={{ position: 'relative', marginTop: 10, height: 10 }}>
          {(nodeData as SwitchNodeData).rules?.map((rule, i, arr) => (
            <Handle
              key={rule.id}
              type="source"
              id={rule.id}
              position={Position.Bottom}
              style={{
                background: style.border,
                width: 10,
                height: 10,
                border: '2px solid #0a0a1e',
                left: `${((i + 1) / (arr.length + 1)) * 100}%`,
                transform: 'translateX(-50%)',
              }}
            />
          ))}
        </div>
      ) : type !== 'output' && (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{
            background: style.border,
            width: 10,
            height: 10,
            border: '2px solid #0a0a1e',
          }}
        />
      )}
    </div>
  );
}

export default memo(ClawdiniNode);
