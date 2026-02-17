// Custom Clawdini Node for ReactFlow
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  InputNodeData,
  AgentNodeData,
  MergeNodeData,
  OutputNodeData,
} from '@clawdini/types';
import { Bot, FileInput, GitMerge, FileOutput, Loader2, CheckCircle, XCircle } from 'lucide-react';

const nodeStyles: Record<string, React.CSSProperties> = {
  input: { background: '#1e3a5f', borderColor: '#3b82f6' },
  agent: { background: '#2d1f4e', borderColor: '#8b5cf6' },
  merge: { background: '#1f3d2d', borderColor: '#22c55e' },
  output: { background: '#3d2d1f', borderColor: '#f59e0b' },
};

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  input: FileInput,
  agent: Bot,
  merge: GitMerge,
  output: FileOutput,
};

const statusIcons: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  idle: CheckCircle,
  running: Loader2,
  completed: CheckCircle,
  error: XCircle,
};

function ClawdiniNode({ data, selected, id }: NodeProps) {
  const nodeData = data as InputNodeData | AgentNodeData | MergeNodeData | OutputNodeData;
  const type = nodeData.type;
  const style = nodeStyles[type] || nodeStyles.input;
  const Icon = icons[type] || FileInput;

  // Get status only for nodes that have it
  const status = 'status' in nodeData ? (nodeData as AgentNodeData | MergeNodeData).status : 'idle';
  const StatusIcon = statusIcons[status || 'idle'];

  return (
    <div
      style={{
        ...style,
        borderWidth: selected ? 2 : 1,
        borderStyle: 'solid',
        borderRadius: 8,
        padding: 12,
        minWidth: 180,
        color: '#eee',
      }}
    >
      {/* Input handle (top) */}
      {type !== 'input' && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ background: '#666', width: 8, height: 8 }}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon className="w-4 h-4" />
        <span style={{ fontWeight: 600, fontSize: 14 }}>{nodeData.label}</span>
        {StatusIcon && (
          <StatusIcon
            className="w-3 h-3"
            style={{
              marginLeft: 'auto',
              animation: status === 'running' ? 'spin 1s linear infinite' : 'none',
            }}
          />
        )}
      </div>

      {/* Content based on type */}
      {type === 'input' && (
        <div style={{ fontSize: 12, color: '#aaa' }}>
          {(nodeData as InputNodeData).prompt || 'Click to add prompt...'}
        </div>
      )}

      {type === 'agent' && (
        <div style={{ fontSize: 11, color: '#aaa' }}>
          {(nodeData as AgentNodeData).agentId || 'No agent selected'}
        </div>
      )}

      {type === 'merge' && (
        <div style={{ fontSize: 11, color: '#aaa' }}>
          Mode: {(nodeData as MergeNodeData).mode}
        </div>
      )}

      {/* Output */}
      {'output' in nodeData && nodeData.output && (
        <div
          style={{
            marginTop: 8,
            padding: 6,
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 4,
            fontSize: 10,
            maxHeight: 60,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}
        >
          {String(nodeData.output).slice(0, 100)}
          {String(nodeData.output).length > 100 && '...'}
        </div>
      )}

      {/* Output handle (bottom) */}
      {type !== 'output' && (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ background: '#666', width: 8, height: 8 }}
        />
      )}
    </div>
  );
}

// Add keyframes for spin animation
const nodeStyle = document.createElement('style');
nodeStyle.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(nodeStyle);

export default memo(ClawdiniNode);
