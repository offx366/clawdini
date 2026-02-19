// Clawdini - Main App Component
import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Connection,
  type Node,
  type Edge,
  type OnConnectStartParams,
  reconnectEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import ClawdiniNode from './nodes/ClawdiniNode';
import { NodePalette } from './panels/NodePalette';
import { NodeInspector } from './panels/NodeInspector';
import { RunLog } from './panels/RunLog';
import { useGraphStore } from './store';
import type { ClawdiniNodeData, AgentInfo } from '@clawdini/types';
import {
  PanelLeft,
  PanelRight,
  PanelBottomClose,
  PanelLeftClose,
  PanelRightClose,
  PanelBottom,
} from 'lucide-react';

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
    setModels,
    addNode,
    removeEdge,
  } = useGraphStore();

  // ─── Panel visibility ──────────────────────────────────────────────
  const [showPalette, setShowPalette] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [showRunLog, setShowRunLog] = useState(true);

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
        animated: false,
        style: { stroke: '#555580', strokeWidth: 2 },
        selectable: true,
        selected: e.selected || false,
      })),
    [storeEdges]
  );

  // Fetch agents and models on mount
  useEffect(() => {
    fetch('/api/agents')
      .then((res) => res.json())
      .then((data: { agents: AgentInfo[] }) => {
        setAgents(data.agents || []);
      })
      .catch((err) => {
        console.error('Failed to fetch agents:', err);
      });

    fetch('/api/models')
      .then((res) => res.json())
      .then((data: { models: Array<{ id: string; name: string; provider: string }> }) => {
        setModels(data.models || []);
      })
      .catch((err) => {
        console.error('Failed to fetch models:', err);
      });
  }, [setAgents, setModels]);

  // ─── Helper: is target node a merge? ───────────────────────────────
  const isTargetMerge = useCallback(
    (nodeId: string) => {
      const node = storeNodes.find((n) => n.id === nodeId);
      return node?.data?.type === 'merge';
    },
    [storeNodes]
  );

  const onNodesChange = useCallback(
    (changes: any[]) => {
      const positionChanges = changes.filter((c) => c.type === 'position');
      const selectionChanges = changes.filter((c) => c.type === 'select');

      if (positionChanges.length > 0) {
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

  // ─── Houdini-style connection logic ───────────────────────────────
  //
  // • Target handles on normal nodes: single input only → Houdini pick-up
  // • Target handles on MERGE nodes: multiple inputs allowed → no pick-up
  // • Source handles: always start new connections (no pick-up)
  // ───────────────────────────────────────────────────────────────────

  const reconnectSucceeded = useRef(false);

  const onConnectStart = useCallback(
    (_: any, params: OnConnectStartParams) => {
      if (params.handleType === 'target' && params.nodeId) {
        // Only pick up existing edge for NON-MERGE nodes
        const { nodes: currentNodes, edges: currentEdges } = useGraphStore.getState();
        const targetNode = currentNodes.find((n) => n.id === params.nodeId);
        if (targetNode?.data?.type !== 'merge') {
          const existing = currentEdges.find((e) => e.target === params.nodeId);
          if (existing) {
            console.log('[App] Houdini pick-up: detaching edge', existing.id);
            setEdges(currentEdges.filter((e) => e.id !== existing.id));
          }
        }
      }
    },
    [setEdges]
  );

  const onConnectEnd = useCallback(() => {
    // intentionally empty
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        const { nodes: currentNodes, edges: currentEdges } = useGraphStore.getState();
        const targetNode = currentNodes.find((n) => n.id === connection.target);
        const isMerge = targetNode?.data?.type === 'merge';

        // Prevent duplicate edges (same source → same target)
        const duplicate = currentEdges.find(
          (e) => e.source === connection.source && e.target === connection.target
        );
        if (duplicate) return;

        const newEdge = {
          id: `${connection.source}-${connection.target}-${Date.now()}`,
          source: connection.source,
          target: connection.target,
        };

        if (isMerge) {
          // Merge node: allow multiple inputs — just add the new edge
          setEdges([...currentEdges, newEdge]);
        } else {
          // Normal node: replace any existing incoming edge
          setEdges([...currentEdges.filter((e) => e.target !== connection.target), newEdge]);
        }
      }
    },
    [setEdges]
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      reconnectSucceeded.current = true;
      const { edges: currentEdges } = useGraphStore.getState();
      setEdges(reconnectEdge(oldEdge, newConnection, currentEdges as Edge[]) as typeof storeEdges);
    },
    [setEdges]
  );

  const onReconnectEnd = useCallback(
    (_: MouseEvent | TouchEvent, edge: Edge) => {
      if (!reconnectSucceeded.current) {
        console.log('[App] Edge dropped in empty space — removing:', edge.id);
        setEdges(useGraphStore.getState().edges.filter((e) => e.id !== edge.id));
      }
      reconnectSucceeded.current = false;
    },
    [setEdges]
  );

  // ─── Drop handling ─────────────────────────────────────────────────

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/reactflow') as ClawdiniNodeData['type'];
      if (!nodeType) return;

      const reactFlowBounds = document.querySelector('.react-flow')?.getBoundingClientRect();
      if (reactFlowBounds) {
        const position = {
          x: event.clientX - reactFlowBounds.left - 90,
          y: event.clientY - reactFlowBounds.top - 20,
        };
        addNode(nodeType, position);
      }
    },
    [addNode]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode]
  );

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-deep)' }}>
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="app-header">
        <span className="logo">⬡ Clawdini</span>
        <span className="subtitle">Agent Workflow Orchestrator</span>
        <div className="spacer" />
        <div className="toggle-group">
          <button
            className="panel-toggle-btn"
            onClick={() => setShowPalette(!showPalette)}
            title={showPalette ? 'Hide palette' : 'Show palette'}
          >
            {showPalette ? <PanelLeftClose size={14} /> : <PanelLeft size={14} />}
          </button>
          <button
            className="panel-toggle-btn"
            onClick={() => setShowRunLog(!showRunLog)}
            title={showRunLog ? 'Hide run log' : 'Show run log'}
          >
            {showRunLog ? <PanelBottomClose size={14} /> : <PanelBottom size={14} />}
          </button>
          <button
            className="panel-toggle-btn"
            onClick={() => setShowInspector(!showInspector)}
            title={showInspector ? 'Hide inspector' : 'Show inspector'}
          >
            {showInspector ? <PanelRightClose size={14} /> : <PanelRight size={14} />}
          </button>
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left panel – Palette */}
        <div className={`panel-left ${showPalette ? '' : 'collapsed'}`}>
          <NodePalette />
        </div>

        {/* Center – Canvas */}
        <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              onReconnect={onReconnect}
              onReconnectEnd={onReconnectEnd}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onPaneClick={onPaneClick}
              onNodeClick={onNodeClick}
              onEdgeClick={(_, edge) => {
                setEdges(storeEdges.map(e => e.id === edge.id ? { ...e, selected: true } : { ...e, selected: false }));
              }}
              onKeyDown={(event) => {
                if (event.key === 'Delete' || event.key === 'Backspace') {
                  const selectedEdges = storeEdges.filter(e => e.selected);
                  if (selectedEdges.length > 0) {
                    setEdges(storeEdges.filter(e => !e.selected));
                  }
                }
              }}
              nodeTypes={nodeTypes}
              fitView
              style={{ background: 'var(--bg-base)' }}
              defaultEdgeOptions={{
                type: 'smoothstep',
                style: { stroke: '#555580', strokeWidth: 2 },
                selectable: true,
                reconnectable: true,
              }}
            >
              <Background color="#222248" gap={24} size={1} />
              <Controls />
              <MiniMap
                style={{
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                }}
                nodeColor={(n: Node) => {
                  const d = n.data as any;
                  if (d?.type === 'input') return '#3b82f6';
                  if (d?.type === 'agent') return '#8b5cf6';
                  if (d?.type === 'merge') return '#22c55e';
                  if (d?.type === 'output') return '#f59e0b';
                  return '#555';
                }}
                maskColor="rgba(0,0,0,0.6)"
              />
            </ReactFlow>
          </div>

          {/* Bottom panel – Run Log */}
          <div className={`panel-bottom ${showRunLog ? '' : 'collapsed'}`}>
            <RunLog />
          </div>
        </div>

        {/* Right panel – Inspector */}
        <div className={`panel-right ${showInspector ? '' : 'collapsed'}`}>
          <NodeInspector />
        </div>
      </div>
    </div>
  );
}

export default App;
