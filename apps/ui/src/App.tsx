// Clawdini - Main App Component
import { useEffect, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  type Connection,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import ClawdiniNode from './nodes/ClawdiniNode';
import { NodePalette } from './panels/NodePalette';
import { NodeInspector } from './panels/NodeInspector';
import { RunLog } from './panels/RunLog';
import { useGraphStore } from './store';
import type { ClawdiniNodeData, AgentInfo } from '@clawdini/types';

// Register custom node types
const nodeTypes = {
  clawdiniNode: ClawdiniNode,
};

function App() {
  const {
    nodes: storeNodes,
    edges: storeEdges,
    selectedNodeId,
    setNodes,
    setEdges,
    setSelectedNode,
    setAgents,
    addNode,
  } = useGraphStore();

  // Convert store nodes to ReactFlow format
  const rfNodes: Node[] = useMemo(
    () =>
      storeNodes.map((n) => ({
        id: n.id,
        type: 'clawdiniNode',
        position: n.position,
        data: n.data,
        selected: n.id === selectedNodeId,
      })),
    [storeNodes, selectedNodeId]
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      storeEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        style: { stroke: '#666', strokeWidth: 2 },
      })),
    [storeEdges]
  );

  // Fetch agents on mount
  useEffect(() => {
    fetch('/api/agents')
      .then((res) => res.json())
      .then((data: { agents: AgentInfo[] }) => {
        setAgents(data.agents || []);
      })
      .catch((err) => {
        console.error('Failed to fetch agents:', err);
      });
  }, [setAgents]);

  const onNodesChange = useCallback(
    (changes: any[]) => {
      const positionChanges = changes.filter((c) => c.type === 'position');
      const selectionChanges = changes.filter((c) => c.type === 'select');

      if (positionChanges.length > 0) {
        // Update node positions in store
        const newNodes = [...storeNodes];
        positionChanges.forEach((change: any) => {
          const node = newNodes.find((n) => n.id === change.id);
          if (node && change.position) {
            node.position = change.position;
          }
        });
        setNodes(newNodes);
      }

      if (selectionChanges.length > 0) {
        const selected = selectionChanges.find((c: any) => c.selected);
        setSelectedNode(selected?.selected ? selectionChanges[0]?.id || null : null);
      }
    },
    [storeNodes, setNodes, setSelectedNode]
  );

  const onEdgesChange = useCallback(
    (changes: any[]) => {
      const newEdges = [...storeEdges];
      changes.forEach((change: any) => {
        if (change.type === 'remove') {
          const idx = newEdges.findIndex((e) => e.id === change.id);
          if (idx !== -1) newEdges.splice(idx, 1);
        }
      });
      setEdges(newEdges);
    },
    [storeEdges, setEdges]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        const newEdge = {
          id: `${connection.source}-${connection.target}`,
          source: connection.source,
          target: connection.target,
        };
        setEdges([...storeEdges, newEdge]);
      }
    },
    [storeEdges, setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const nodeType = event.dataTransfer.getData('application/reactflow') as ClawdiniNodeData['type'];
      console.log('[App] onDrop:', nodeType, event.dataTransfer.types);

      if (!nodeType) {
        console.log('[App] No node type in drop');
        return;
      }

      const reactFlowBounds = document.querySelector('.react-flow')?.getBoundingClientRect();

      if (reactFlowBounds) {
        const position = {
          x: event.clientX - reactFlowBounds.left - 90,
          y: event.clientY - reactFlowBounds.top - 20,
        };

        console.log('[App] Adding node at:', position);
        addNode(nodeType, position);
      }
    },
    [addNode]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <div
        style={{
          height: 48,
          background: '#0f0f23',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700, color: '#8b5cf6' }}>Clawdini</span>
        <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>Agent Workflow Orchestrator</span>
      </div>

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <NodePalette />

        <div style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            style={{ background: '#0a0a1a' }}
            defaultEdgeOptions={{
              type: 'smoothstep',
              style: { stroke: '#666', strokeWidth: 2 },
            }}
          >
            <Background color="#333" gap={20} />
            <Controls style={{ background: '#1a1a2e', borderColor: '#333' }} />
          </ReactFlow>
        </div>

        <NodeInspector />
      </div>

      <RunLog />
    </div>
  );
}

export default App;
