// Node Palette - left panel with draggable node types
import { FileInput, Bot, GitMerge, FileOutput, Scale, GitBranch, Database, Zap, Repeat } from 'lucide-react';
import type { ClawdiniNodeData } from '@clawdini/types';
import { useGraphStore } from '../store';

const nodeTypes: {
  type: ClawdiniNodeData['type'];
  label: string;
  desc: string;
  icon: React.ElementType;
  color: string;
}[] = [
    { type: 'input', label: 'Input', desc: 'Prompt / source text', icon: FileInput, color: '#3b82f6' },
    { type: 'agent', label: 'Agent', desc: 'AI agent execution', icon: Bot, color: '#8b5cf6' },
    { type: 'merge', label: 'Merge', desc: 'Combine outputs', icon: GitMerge, color: '#22c55e' },
    { type: 'judge', label: 'Judge', desc: 'Eval & JSON decision', icon: Scale, color: '#eab308' },
    { type: 'switch', label: 'Switch', desc: 'Branch execution path', icon: GitBranch, color: '#ec4899' },
    { type: 'extract', label: 'Extract', desc: 'Force JSON extraction', icon: Database, color: '#06b6d4' },
    { type: 'invoke', label: 'Invoke', desc: 'Call OpenClaw API', icon: Zap, color: '#ef4444' },
    { type: 'foreach', label: 'ForEach', desc: 'Parallel execution per item', icon: Repeat, color: '#f97316' },
    { type: 'output', label: 'Output', desc: 'Final result', icon: FileOutput, color: '#f59e0b' },
  ];

export function NodePalette() {
  const { addNode } = useGraphStore();

  const onDragStart = (event: React.DragEvent, nodeType: ClawdiniNodeData['type']) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onClick = (nodeType: ClawdiniNodeData['type']) => {
    addNode(nodeType, { x: 250, y: 150 });
  };

  return (
    <div
      style={{
        width: 'var(--palette-width)',
        minWidth: 'var(--palette-width)',
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border-subtle)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontWeight: 700,
        }}
      >
        Nodes
      </div>
      {nodeTypes.map(({ type, label, desc, icon: Icon, color }) => (
        <div
          key={type}
          className="palette-item"
          draggable
          onDragStart={(e) => onDragStart(e, type)}
          onClick={() => onClick(type)}
          style={{
            borderColor: `${color}25`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = `${color}80`;
            e.currentTarget.style.background = `${color}12`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = `${color}25`;
            e.currentTarget.style.background = 'var(--bg-input)';
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: `${color}18`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon size={14} style={{ color }} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{label}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>{desc}</div>
          </div>
        </div>
      ))}

      <div style={{ flex: 1 }} />
      <div style={{ fontSize: 9, color: 'var(--text-dim)', lineHeight: 1.4, padding: '8px 4px' }}>
        Drag nodes onto the canvas or click to add at center.
      </div>
    </div>
  );
}
