// Zustand store for Clawdini UI state
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ClawdiniNode, ClawdiniEdge, ClawdiniGraph, AgentInfo, RunEvent } from '@clawdini/types';
import { v4 as uuidv4 } from 'uuid';

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

interface GraphState {
  nodes: ClawdiniNode[];
  edges: ClawdiniEdge[];
  selectedNodeId: string | null;
  agents: AgentInfo[];
  models: ModelInfo[];
  isRunning: boolean;
  runId: string | null;
  runLogs: any[];
}

interface GraphActions {
  addNode: (type: ClawdiniNode['data']['type'], position: { x: number; y: number }) => void;
  updateNode: (id: string, data: Partial<ClawdiniNode['data']>) => void;
  removeNode: (id: string) => void;
  removeEdge: (id: string) => void;
  setNodes: (nodes: ClawdiniNode[]) => void;
  setEdges: (edges: ClawdiniEdge[]) => void;
  setSelectedNode: (id: string | null) => void;
  setAgents: (agents: AgentInfo[]) => void;
  setModels: (models: ModelInfo[]) => void;
  setIsRunning: (running: boolean) => void;
  setRunId: (id: string | null) => void;
  addRunLog: (event: any) => void;
  clearRunLogs: () => void;
  getGraph: () => ClawdiniGraph;
}

const initialState: GraphState = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  agents: [],
  models: [],
  isRunning: false,
  runId: null,
  runLogs: [],
};

function createDefaultNodeData(type: ClawdiniNode['data']['type']): ClawdiniNode['data'] {
  const id = uuidv4();

  switch (type) {
    case 'input':
      return { type: 'input', label: `Input-${id.slice(0, 4)}`, prompt: '', status: 'idle' };
    case 'agent':
      return { type: 'agent', label: `Agent-${id.slice(0, 4)}`, agentId: '', status: 'idle' };
    case 'merge':
      return { type: 'merge', label: `Merge-${id.slice(0, 4)}`, mode: 'concat', status: 'idle' };
    case 'switch':
      return { type: 'switch', label: `Switch-${id.slice(0, 4)}`, rules: [{ id: uuidv4(), condition: '.*' }], status: 'idle' };
    case 'extract':
      return { type: 'extract', label: `Extract-${id.slice(0, 4)}`, schema: '{\n  "key": "value"\n}', status: 'idle' };
    case 'invoke':
      return { type: 'invoke', label: `Invoke-${id.slice(0, 4)}`, commandName: 'system.run', payloadTemplate: '{\\n  "command": "echo \\"{INPUT}\\""\\n}', status: 'idle' };
    case 'foreach':
      return { type: 'foreach', label: `ForEach-${id.slice(0, 4)}`, arrayPath: '', status: 'idle' };
    case 'output':
      return { type: 'output', label: `Output-${id.slice(0, 4)}`, status: 'idle' };
    default:
      return { type: 'input', label: `Input-${id.slice(0, 4)}`, prompt: '', status: 'idle' };
  }
}

export const useGraphStore = create<GraphState & GraphActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      addNode: (type, position) => {
        const id = uuidv4();
        const data = createDefaultNodeData(type);

        const newNode: ClawdiniNode = {
          id,
          type: 'clawdiniNode',
          position,
          data,
        };

        set((state) => ({
          nodes: [...state.nodes, newNode],
        }));
      },

      updateNode: (id, data) => {
        set((state) => ({
          nodes: state.nodes.map((node) =>
            node.id === id ? { ...node, data: { ...node.data, ...data } as ClawdiniNode['data'] } : node
          ),
        }));
      },

      removeNode: (id) => {
        set((state) => ({
          nodes: state.nodes.filter((node) => node.id !== id),
          edges: state.edges.filter((edge) => edge.source !== id && edge.target !== id),
        }));
      },

      removeEdge: (id) => {
        set((state) => ({
          edges: state.edges.filter((edge) => edge.id !== id),
        }));
      },

      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),
      setSelectedNode: (id) => set({ selectedNodeId: id }),
      setAgents: (agents) => set({ agents }),
      setModels: (models) => set({ models }),
      setIsRunning: (running) => set({ isRunning: running }),
      setRunId: (id) => set({ runId: id }),
      addRunLog: (event) => set((state) => ({ runLogs: [...state.runLogs, event] })),
      clearRunLogs: () => set({ runLogs: [] }),

      getGraph: () => {
        const state = get();
        return {
          id: uuidv4(),
          name: 'Untitled Graph',
          nodes: state.nodes,
          edges: state.edges,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
    }),
    {
      name: 'clawdini-storage',
      partialize: (state) => ({ nodes: state.nodes, edges: state.edges }),
    }
  )
);
