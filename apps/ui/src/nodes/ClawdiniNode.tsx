// Custom Clawdini Node for ReactFlow
import { memo } from 'react';
import { Handle, Position, useEdges, type NodeProps } from '@xyflow/react';
import {
  InputNodeData,
  AgentNodeData,
  MergeNodeData,
  OutputNodeData,
} from '@clawdini/types';
import { Bot, FileInput, GitMerge, FileOutput, Loader2, CheckCircle, XCircle } from 'lucide-react';

const nodeStyles: Record<string, { bg: string; border: string; glow: string }> = {
  input: { bg: '#0f2440', border: '#3b82f6', glow: 'rgba(59,130,246,0.15)' },
  agent: { bg: '#1a1040', border: '#8b5cf6', glow: 'rgba(139,92,246,0.15)' },
  merge: { bg: '#0f2818', border: '#22c55e', glow: 'rgba(34,197,94,0.15)' },
  output: { bg: '#2a1a08', border: '#f59e0b', glow: 'rgba(245,158,11,0.15)' },
};

const icons: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  input: FileInput,
  agent: Bot,
  merge: GitMerge,
  output: FileOutput,
};

const statusConfig: Record<string, { icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; color: string }> = {
  idle: { icon: CheckCircle, color: '#555' },
  running: { icon: Loader2, color: '#f59e0b' },
  completed: { icon: CheckCircle, color: '#22c55e' },
  error: { icon: XCircle, color: '#ef4444' },
};

function ClawdiniNode({ data, selected, id }: NodeProps) {
  const nodeData = data as unknown as InputNodeData | AgentNodeData | MergeNodeData | OutputNodeData;
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
      {type !== 'output' && (
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
