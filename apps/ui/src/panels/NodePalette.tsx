// Node Palette - left panel with draggable node types
import { FileInput, Bot, GitMerge, FileOutput } from 'lucide-react';
import type { ClawdiniNodeData } from '@clawdini/types';

const nodeTypes: { type: ClawdiniNodeData['type']; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { type: 'input', label: 'Input', icon: FileInput, color: '#3b82f6' },
  { type: 'agent', label: 'Agent', icon: Bot, color: '#8b5cf6' },
  { type: 'merge', label: 'Merge', icon: GitMerge, color: '#22c55e' },
  { type: 'output', label: 'Output', icon: FileOutput, color: '#f59e0b' },
];

export function NodePalette() {
  const onDragStart = (event: React.DragEvent, nodeType: ClawdiniNodeData['type']) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      style={{
        width: 160,
        background: '#16213e',
        borderRight: '1px solid #333',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
        Nodes
      </div>
      {nodeTypes.map(({ type, label, icon: Icon, color }) => (
        <div
          key={type}
          draggable
          onDragStart={(e) => onDragStart(e, type)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            background: '#1a1a2e',
            border: `1px solid ${color}40`,
            borderRadius: 6,
            cursor: 'grab',
            fontSize: 13,
            color: '#eee',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = color;
            e.currentTarget.style.background = `${color}20`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = `${color}40`;
            e.currentTarget.style.background = '#1a1a2e';
          }}
        >
          <Icon className="w-4 h-4" />
          {label}
        </div>
      ))}
    </div>
  );
}
