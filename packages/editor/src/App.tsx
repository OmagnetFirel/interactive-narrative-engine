import { useCallback, useState, useMemo } from 'react';
import {
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  Controls,
  Background,
  MiniMap,
  type OnConnect,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { InteractiveGraph, GraphNode, GraphEdge, EndNodeData, ChoiceNodeData, VideoNodeData } from '@ine/shared';
import { api } from './services/api';
import { VideoNode } from './components/Nodes/VideoNode';
import { ChoiceNode } from './components/Nodes/ChoiceNode';
import { EndNode } from './components/Nodes/EndNode';
import { Toolbar } from './components/Toolbar/Toolbar';
import { PropertiesPanel } from './components/PropertiesPanel/PropertiesPanel';
import { ValidationPanel } from './components/ValidationPanel/ValidationPanel';

const initialNodes: GraphNode[] = [
  {
    id: '1',
    type: 'video',
    data: { 
      label: 'Início da História',
      title: 'Início da História',
      videoUrl: undefined,
      duration: 45,
      description: 'Primeiro nó da narrativa'
    } as VideoNodeData, // ✅ Type assertion
    position: { x: 250, y: 0 },
  },
  {
    id: '2',
    type: 'choice',
    data: { 
      label: 'Escolha A',
      title: 'Escolha A',
      timeout: 10
    } as ChoiceNodeData, // ✅ Type assertion
    position: { x: 100, y: 180 },
  },
  {
    id: '3',
    type: 'choice',
    data: { 
      label: 'Escolha B',
      title: 'Escolha B'
    } as ChoiceNodeData, // ✅ Type assertion
    position: { x: 400, y: 180 },
  },
  {
    id: '4',
    type: 'end',
    data: { 
      label: 'Final Feliz',
      title: 'Final Feliz',
      endingType: 'good'
    } as EndNodeData, // ✅ Type assertion
    position: { x: 100, y: 360 },
  },
  {
    id: '5',
    type: 'end',
    data: { 
      label: 'Final Triste',
      title: 'Final Triste',
      endingType: 'bad'
    } as EndNodeData, // ✅ Type assertion
    position: { x: 400, y: 360 },
  },
];


const initialEdges: GraphEdge[] = [
  { 
    id: 'e1-2', 
    source: '1', 
    target: '2',
    label: 'Caminho A',
    data: { label: 'Caminho A' }
  },
  { 
    id: 'e1-3', 
    source: '1', 
    target: '3',
    label: 'Caminho B',
    data: { label: 'Caminho B' }
  },
  { 
    id: 'e2-4', 
    source: '2', 
    target: '4',
    label: 'Fim'
  },
  { 
    id: 'e3-5', 
    source: '3', 
    target: '5',
    label: 'Fim'
  },
];

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<GraphEdge>(initialEdges);
  const [projectName, setProjectName] = useState('Minha História Interativa');
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'project' | 'validation'>('project');

    // ✅ Estado para elementos selecionados
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);

  const nodeTypes = useMemo(() => ({
    video: VideoNode,
    choice: ChoiceNode,
    end: EndNode,
  }), []);

  const handleAddNode = useCallback((type: 'video' | 'choice' | 'end') => {
    const newId = `${Date.now()}`;
    const labels = {
      video: 'Novo Vídeo',
      choice: 'Nova Escolha',
      end: 'Novo Final'
    };

    const newNode: GraphNode = {
      id: newId,
      type,
      data: { 
        label: labels[type],
        title: labels[type]
      },
      position: { 
        x: Math.random() * 400 + 100, 
        y: Math.random() * 400 + 100 
      },
    };

    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const onConnect: OnConnect = useCallback(
    (connection) => {
      const edge: GraphEdge = {
        id: `e${connection.source}-${connection.target}`,
        source: connection.source!,
        target: connection.target!,
        label: 'Nova conexão',
        data: { label: 'Nova conexão' }
      };
      setEdges((eds) => addEdge(edge, eds));
    },
    [setEdges]
  );

  
  // ✅ Atualizar dados do nó
  const handleUpdateNode = useCallback((nodeId: string, newData: Partial<VideoNodeData | ChoiceNodeData | EndNodeData>) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, ...newData } }
          : node
      )
    );
  }, [setNodes]);

  // ✅ Atualizar label da edge
  const handleUpdateEdge = useCallback((edgeId: string, label: string) => {
    setEdges((eds) =>
      eds.map((edge) =>
        edge.id === edgeId
          ? { ...edge, label, data: { ...edge.data, label } }
          : edge
      )
    );
  }, [setEdges]);

  // ✅ Deletar nó
  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    setSelectedNode(null);
  }, [setNodes, setEdges]);

  // ✅ Deletar edge
  const handleDeleteEdge = useCallback((edgeId: string) => {
    setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
    setSelectedEdge(null);
  }, [setEdges]);

  // ✅ Capturar seleção de nó
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  // ✅ Capturar seleção de edge
  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  }, []);

  // ✅ Desselecionar ao clicar no fundo
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  const exportGraph = async () => {
    if (!projectName.trim()) {
      alert('Por favor, digite um nome para o projeto!');
      return;
    }

    setIsSaving(true);
    
    const graph: InteractiveGraph = {
      id: Date.now().toString(),
      name: projectName.trim(),
      nodes,
      edges,
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: 'Desenvolvedor'
      }
    };
    
    try {
      const result = await api.saveProject(graph);
      console.log('✅ Salvo na API:', result);
      alert(`✅ Projeto "${graph.name}" salvo com sucesso!\n\n📊 ${nodes.length} nós e ${edges.length} conexões`);
    } catch (error) {
      console.error('❌ Erro:', error);
      alert('❌ Erro ao salvar projeto.\n\nVerifique se a API está rodando.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
      >
        <Controls />
        <MiniMap 
          nodeColor={(node) => {
            if (node.type === 'video') return '#4a90e2';
            if (node.type === 'choice') return '#ffa726';
            if (node.type === 'end') return '#ff6b6b';
            return '#999';
          }}
        />
        <Background gap={16} size={1} />
        
        <Toolbar onAddNode={handleAddNode} />

        {/* Painel esquerdo com abas */}
        <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl z-10 w-[340px] max-h-[calc(100vh-32px)] overflow-hidden border border-gray-200 flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('project')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'project'
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              📝 Projeto
            </button>
            <button
              onClick={() => setActiveTab('validation')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'validation'
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              🔍 Validação
            </button>
          </div>

          {/* Conteúdo das abas */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'project' && (
              <div className="p-5">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  🎬 Editor de Narrativa
                </h2>
                
                {/* Campo de nome */}
                <div className="mb-4">
                  <label className="block text-[13px] text-gray-600 font-medium mb-1.5">
                    📝 Nome do Projeto
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Digite o nome..."
                    className="w-full px-3 py-2.5 text-sm border-2 border-gray-200 rounded-lg
                               focus:border-blue-500 focus:outline-none transition-colors"
                  />
                </div>

                {/* Estatísticas */}
                <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {nodes.length}
                    </div>
                    <div className="text-xs text-gray-600">Nós</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {edges.length}
                    </div>
                    <div className="text-xs text-gray-600">Conexões</div>
                  </div>
                </div>

                {/* Botão de salvar */}
                <button 
                  onClick={exportGraph}
                  disabled={isSaving}
                  className={`
                    w-full py-3 rounded-lg font-semibold text-sm transition-all
                    ${isSaving 
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                      : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/30'
                    }
                  `}
                >
                  {isSaving ? '⏳ Salvando...' : '💾 Salvar Projeto na API'}
                </button>
              </div>
            )}

            {activeTab === 'validation' && (
              <ValidationPanel nodes={nodes} edges={edges} />
            )}
          </div>
        </div>

        {/* ✅ Painel direito - Propriedades */}
        <div className="absolute top-4 right-20 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl z-10 w-[340px] max-h-[calc(100vh-32px)] overflow-y-auto border border-gray-200">
          <PropertiesPanel
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            onUpdateNode={handleUpdateNode}
            onUpdateEdge={handleUpdateEdge}
            onDeleteNode={handleDeleteNode}
            onDeleteEdge={handleDeleteEdge}
          />
        </div>
      </ReactFlow>
    </div>
  );
}

export default App;
