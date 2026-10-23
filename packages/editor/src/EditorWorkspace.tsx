import { useCallback, useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import type { InteractiveGraph, GraphNode, GraphEdge, EndNodeData, ChoiceNodeData, VideoNodeData, ProjectVisibility } from '@ine/shared';
import { api, PLAYER_URL } from './services/api';
import { VideoNode } from './components/Nodes/VideoNode';
import { ChoiceNode } from './components/Nodes/ChoiceNode';
import { EndNode } from './components/Nodes/EndNode';
import { Toolbar } from './components/Toolbar/Toolbar';
import { PropertiesPanel } from './components/PropertiesPanel/PropertiesPanel';
import { ValidationPanel } from './components/ValidationPanel/ValidationPanel';

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'video',
    data: {
      label: 'Início da História',
      title: 'Início da História',
      videoUrl: undefined,
      duration: 45,
      description: 'Primeiro nó da narrativa',
    },
    position: { x: 250, y: 0 },
  },
  {
    id: '2',
    type: 'choice',
    data: {
      label: 'Escolha A',
      title: 'Escolha A',
      timeout: 10,
    },
    position: { x: 100, y: 180 },
  },
  {
    id: '3',
    type: 'choice',
    data: {
      label: 'Escolha B',
      title: 'Escolha B',
    },
    position: { x: 400, y: 180 },
  },
  {
    id: '4',
    type: 'end',
    data: {
      label: 'Final Feliz',
      title: 'Final Feliz',
      endingType: 'good',
    },
    position: { x: 100, y: 360 },
  },
  {
    id: '5',
    type: 'end',
    data: {
      label: 'Final Triste',
      title: 'Final Triste',
      endingType: 'bad',
    },
    position: { x: 400, y: 360 },
  },
];

const initialEdges: Edge[] = [
  {
    id: 'e1-2',
    source: '1',
    target: '2',
    label: 'Caminho A',
    data: { label: 'Caminho A' },
  },
  {
    id: 'e1-3',
    source: '1',
    target: '3',
    label: 'Caminho B',
    data: { label: 'Caminho B' },
  },
  {
    id: 'e2-4',
    source: '2',
    target: '4',
    label: 'Fim',
  },
  {
    id: 'e3-5',
    source: '3',
    target: '5',
    label: 'Fim',
  },
];

export default function EditorWorkspace() {
  const { projectId: projectIdParam } = useParams<{ projectId?: string }>();
  const projectIdFromUrl = projectIdParam ? decodeURIComponent(projectIdParam) : undefined;
  const navigate = useNavigate();

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [projectName, setProjectName] = useState('Minha História Interativa');
  const [sourceGraph, setSourceGraph] = useState<InteractiveGraph | null>(null);
  const [projectList, setProjectList] = useState<InteractiveGraph[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>(() =>
    projectIdFromUrl ? 'loading' : 'idle'
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [visibility, setVisibility] = useState<ProjectVisibility>('private');
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'project' | 'validation'>('project');

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);

  const nodeTypes = useMemo(
    () => ({
      video: VideoNode,
      choice: ChoiceNode,
      end: EndNode,
    }),
    []
  );

  useEffect(() => {
    let cancelled = false;

    const refreshProjectList = async () => {
      try {
        const list = await api.getProjectsList();
        if (!cancelled) setProjectList(list);
      } catch {
        if (!cancelled) setProjectList([]);
      }
    };

    void refreshProjectList();

    if (!projectIdFromUrl) {
      setNodes(initialNodes);
      setEdges(initialEdges);
      setProjectName('Minha História Interativa');
      setSourceGraph(null);
      setVisibility('private');
      setShareToken(null);
      setShareUrl(null);
      setLoadState('idle');
      setLoadError(null);
      return () => {
        cancelled = true;
      };
    }

    setLoadState('loading');
    setLoadError(null);

    (async () => {
      try {
        const graph = await api.getProject(projectIdFromUrl);
        if (cancelled) return;
        setNodes((graph.nodes ?? []) as unknown as Node[]);
        setEdges((graph.edges ?? []) as unknown as Edge[]);
        setProjectName(graph.name);
        setSourceGraph(graph);
        setVisibility(graph.visibility ?? 'private');
        if (graph.shareToken) {
          setShareToken(graph.shareToken);
          setShareUrl(`${PLAYER_URL.replace(/\/$/, '')}/play/${graph.shareToken}`);
        }
        setLoadState('idle');
      } catch (e) {
        if (cancelled) return;
        setLoadState('error');
        setLoadError(e instanceof Error ? e.message : 'Erro ao carregar projeto');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectIdFromUrl, setNodes, setEdges]);

  const handleAddNode = useCallback(
    (type: 'video' | 'choice' | 'end') => {
      const newId = `${Date.now()}`;
      const labels = {
        video: 'Novo Vídeo',
        choice: 'Nova Escolha',
        end: 'Novo Final',
      };

      const newNode: Node = {
        id: newId,
        type,
        data: {
          label: labels[type],
          title: labels[type],
        },
        position: {
          x: Math.random() * 400 + 100,
          y: Math.random() * 400 + 100,
        },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      const edge: Edge = {
        id: `e${connection.source}-${connection.target}`,
        source: connection.source!,
        target: connection.target!,
        label: 'Nova conexão',
        data: { label: 'Nova conexão' },
      };
      setEdges((eds) => addEdge(edge, eds));
    },
    [setEdges]
  );

  const handleUpdateNode = useCallback(
    (nodeId: string, newData: Partial<VideoNodeData | ChoiceNodeData | EndNodeData>) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, ...newData } } : node
        )
      );
    },
    [setNodes]
  );

  const handleUpdateEdge = useCallback(
    (edgeId: string, label: string) => {
      setEdges((eds) =>
        eds.map((edge) =>
          edge.id === edgeId ? { ...edge, label, data: { ...edge.data, label } } : edge
        )
      );
    },
    [setEdges]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      setSelectedNode(null);
    },
    [setNodes, setEdges]
  );

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
      setSelectedEdge(null);
    },
    [setEdges]
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  }, []);

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

    const now = new Date().toISOString();
    const id = sourceGraph?.id ?? projectIdFromUrl ?? crypto.randomUUID();

    const graph: InteractiveGraph = {
      ...sourceGraph,
      id,
      name: projectName.trim(),
      nodes: nodes as unknown as GraphNode[],
      edges: edges as unknown as GraphEdge[],
      visibility,
      shareToken: shareToken ?? undefined,
      metadata: {
        ...sourceGraph?.metadata,
        createdAt: sourceGraph?.metadata?.createdAt ?? now,
        updatedAt: now,
        author: sourceGraph?.metadata?.author ?? 'Desenvolvedor',
      },
    };

    try {
      const result = await api.saveProject(graph);
      const saved = result.project;
      setSourceGraph(saved);
      if (saved.shareToken) {
        setShareToken(saved.shareToken);
        const url = result.shareUrl ?? `${PLAYER_URL.replace(/\/$/, '')}/play/${saved.shareToken}`;
        setShareUrl(url);
      }
      try {
        setProjectList(await api.getProjectsList());
      } catch {
        /* ignore */
      }
      if (!projectIdFromUrl) {
        navigate(`/editor/${encodeURIComponent(saved.id)}`, { replace: true });
      }
      console.log('✅ Salvo na API:', saved.id);
      alert(
        `✅ Projeto "${saved.name}" salvo com sucesso!\n\n📊 ${nodes.length} nós e ${edges.length} conexões\n\nVisibilidade: ${saved.visibility ?? visibility}`
      );
    } catch (error) {
      console.error('❌ Erro:', error);
      alert('❌ Erro ao salvar projeto.\n\nVerifique se a API está rodando.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loadState === 'loading') {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-bg text-text-secondary text-sm">
        Carregando projeto…
      </div>
    );
  }

  if (loadState === 'error' && projectIdFromUrl) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center gap-4 bg-bg p-6">
        <p className="text-danger font-medium text-center max-w-md">{loadError}</p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link to="/" className="btn-ghost">
            ← Lista de projetos
          </Link>
          <button
            type="button"
            onClick={() => navigate('/editor', { replace: true })}
            className="btn-primary"
          >
            Novo projeto
          </button>
        </div>
      </div>
    );
  }

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
          maskColor="rgba(250, 248, 244, 0.72)"
          nodeColor={(node) => (node.selected ? '#D64A45' : '#B87333')}
        />
        <Background gap={18} size={1.1} color="rgba(58, 36, 24, 0.08)" />

        <div className="panel-floating absolute top-4 left-4 z-10 w-[340px] max-h-[calc(100vh-32px)] overflow-hidden flex flex-col">
          <div className="flex border-b border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab('project')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'project'
                  ? 'text-danger border-b-2 border-danger bg-danger/10'
                  : 'text-text-secondary hover:bg-surface-hover'
              }`}
            >
              📝 Projeto
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('validation')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'validation'
                  ? 'text-danger border-b-2 border-danger bg-danger/10'
                  : 'text-text-secondary hover:bg-surface-hover'
              }`}
            >
              🔍 Validação
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {activeTab === 'project' && (
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <Link to="/" className="text-xs font-medium text-primary hover:text-secondary transition-colors">
                    ← Projetos
                  </Link>
                  <span className="text-text-secondary/40">|</span>
                  <Link
                    to="/editor"
                    className="text-xs font-medium text-text-secondary hover:text-text transition-colors"
                  >
                    Novo projeto
                  </Link>
                </div>

                <h2 className="text-xl font-semibold text-text mb-4">🎬 Editor de Narrativa</h2>

                {projectList.length > 0 && (
                  <div className="mb-4">
                    <label className="field-label">Trocar de projeto</label>
                    <select
                      value={projectIdFromUrl ?? '__new__'}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === '__new__') navigate('/editor');
                        else navigate(`/editor/${encodeURIComponent(next)}`);
                      }}
                      className="field-input"
                    >
                      <option value="__new__">Novo projeto (rascunho)</option>
                      {projectList.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.nodes?.length ?? 0} nós)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="mb-4">
                  <label className="field-label">📝 Nome do Projeto</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Digite o nome..."
                    className="field-input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-surface-hover rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary tabular-nums">{nodes.length}</div>
                    <div className="text-xs text-text-secondary">Nós</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary tabular-nums">{edges.length}</div>
                    <div className="text-xs text-text-secondary">Conexões</div>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="field-label">Visibilidade</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibility('private')}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        visibility === 'private'
                          ? 'border-danger bg-danger/15 text-danger'
                          : 'border-white/15 text-text-secondary hover:border-copper/60'
                      }`}
                    >
                      Privado
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibility('public')}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        visibility === 'public'
                          ? 'border-danger bg-danger/15 text-danger'
                          : 'border-white/15 text-text-secondary hover:border-copper/60'
                      }`}
                    >
                      Público
                    </button>
                  </div>
                  <p className="text-xs text-text-secondary mt-2">
                    Visitantes acessam somente via link de compartilhamento.
                  </p>
                </div>

                {shareUrl && (
                  <div className="mb-4 p-3 bg-surface-hover rounded-lg">
                    <label className="field-label">Link de compartilhamento</label>
                    <div className="flex gap-2 mt-1">
                      <input
                        type="text"
                        readOnly
                        value={shareUrl}
                        className="field-input text-xs font-mono flex-1"
                      />
                      <button
                        type="button"
                        className="btn-secondary shrink-0"
                        onClick={() => {
                          void navigator.clipboard.writeText(shareUrl).then(() => {
                            setCopyFeedback('Copiado!');
                            setTimeout(() => setCopyFeedback(null), 2000);
                          });
                        }}
                      >
                        {copyFeedback ?? 'Copiar'}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={exportGraph}
                  disabled={isSaving}
                  className="btn-primary w-full"
                >
                  {isSaving ? '⏳ Salvando...' : '💾 Salvar Projeto na API'}
                </button>
              </div>
            )}

            {activeTab === 'validation' && (
              <ValidationPanel nodes={nodes as unknown as GraphNode[]} edges={edges as unknown as GraphEdge[]} />
            )}
          </div>
        </div>

        {/* Coluna direita: toolbar no topo e painel de propriedades logo abaixo
            (assim o painel nunca cobre os botões de adicionar nó). */}
        <div className="absolute top-4 right-4 bottom-4 z-10 flex flex-col items-end gap-4 max-h-[calc(100vh-32px)] pointer-events-none">
          <div className="pointer-events-auto">
            <Toolbar onAddNode={handleAddNode} />
          </div>

          <div className="panel-floating w-[340px] min-h-0 overflow-y-auto pointer-events-auto">
            <PropertiesPanel
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              onUpdateNode={handleUpdateNode}
              onUpdateEdge={handleUpdateEdge}
              onDeleteNode={handleDeleteNode}
              onDeleteEdge={handleDeleteEdge}
            />
          </div>
        </div>
      </ReactFlow>
    </div>
  );
}
