import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
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
import type { InteractiveGraph, GraphNode, GraphEdge, SceneNodeData, ProjectVisibility } from '@ine/shared';
import { canSaveGraph, getBlockingErrors, normalizeGraph, validateGraph } from '@ine/shared';
import { api, PLAYER_URL } from './services/api';
import { SceneNode } from './components/Nodes/SceneNode';
import { ChoiceEdge } from './components/Edges/ChoiceEdge';
import { Toolbar } from './components/Toolbar/Toolbar';
import { PropertiesPanel } from './components/PropertiesPanel/PropertiesPanel';
import { ValidationPanel } from './components/ValidationPanel/ValidationPanel';
import { TutorialModal } from './components/Tutorial/TutorialModal';
import { useTutorial } from './components/Tutorial/useTutorial';
import { IconCheck, IconDeviceFloppy, IconFileDescription, IconListCheck, IconLoader2 } from '@tabler/icons-react';

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'video',
    data: { label: 'Introdução', title: 'Introdução' },
    position: { x: 250, y: 0 },
  },
  {
    id: '2',
    type: 'video',
    data: { label: 'Caminho A', title: 'Caminho A' },
    position: { x: 60, y: 300 },
  },
  {
    id: '3',
    type: 'video',
    data: { label: 'Caminho B', title: 'Caminho B' },
    position: { x: 440, y: 300 },
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', type: 'choice', label: 'Opção A', data: { label: 'Opção A' } },
  { id: 'e1-3', source: '1', target: '3', type: 'choice', label: 'Opção B', data: { label: 'Opção B' } },
];

/** Retrato do que é salvo no projeto; usado para saber se há alterações não salvas. */
function snapshotOf(name: string, visibility: ProjectVisibility, nodes: Node[], edges: Edge[]): string {
  return JSON.stringify({
    name,
    visibility,
    nodes: nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.label ?? '' })),
  });
}

function confirmDeleteScenes(labels: string[]): boolean {
  if (labels.length === 0) return true;
  const what = labels.length === 1 ? `a cena "${labels[0]}"` : `${labels.length} cenas`;
  return window.confirm(`Deletar ${what}? As conexões ligadas a ela também serão removidas.`);
}

/** Garante que toda conexão use o componente de escolha editável. */
function withChoiceEdgeType(edges: Edge[]): Edge[] {
  return edges.map((e) => (e.type === 'choice' ? e : { ...e, type: 'choice' }));
}

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
  const [visibility, setVisibility] = useState<ProjectVisibility>('public');
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'project' | 'validation'>('project');
  const tutorial = useTutorial();

  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);

  // Versões atuais do elemento selecionado (o estado guarda só um retrato do clique).
  // Comparar só `data`/`label` evita re-sincronizar o painel a cada arraste.
  const liveSelectedNodeData = nodes.find((n) => n.id === selectedNode?.id)?.data;
  const liveSelectedNode = useMemo(
    () => (selectedNode && liveSelectedNodeData ? { ...selectedNode, data: liveSelectedNodeData } : null),
    [selectedNode, liveSelectedNodeData]
  );
  const liveSelectedEdge = useMemo(
    () => (selectedEdge ? edges.find((e) => e.id === selectedEdge.id) ?? null : null),
    [selectedEdge, edges]
  );

  const [migrationNotice, setMigrationNotice] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Alterações não salvas: compara o estado atual com o último salvo/carregado.
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    snapshotOf('Minha História Interativa', 'public', initialNodes, initialEdges)
  );
  const currentSnapshot = useMemo(
    () => snapshotOf(projectName, visibility, nodes, edges),
    [projectName, visibility, nodes, edges]
  );
  const isDirty = loadState === 'idle' && currentSnapshot !== savedSnapshot;
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirtyRef.current && currentLocation.pathname !== nextLocation.pathname
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('Há alterações não salvas neste projeto. Sair mesmo assim e perder as alterações?')) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);

  const nodeTypes = useMemo(() => ({ video: SceneNode }), []);
  const edgeTypes = useMemo(() => ({ choice: ChoiceEdge }), []);

  const validation = useMemo(
    () => validateGraph(nodes as unknown as GraphNode[], edges as unknown as GraphEdge[]),
    [nodes, edges]
  );
  const saveBlocked = !canSaveGraph(validation);
  const blockingReason = getBlockingErrors(validation)[0]?.message;

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
      setVisibility('public');
      setShareToken(null);
      setShareUrl(null);
      setLoadState('idle');
      setLoadError(null);
      setMigrationNotice(false);
      setSavedSnapshot(snapshotOf('Minha História Interativa', 'public', initialNodes, initialEdges));
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
        // Projetos antigos (com nós de escolha/fim) são convertidos para o modelo de cena única.
        const normalized = normalizeGraph(
          (graph.nodes ?? []) as unknown as Node[],
          (graph.edges ?? []) as unknown as Edge[]
        );
        const loadedEdges = withChoiceEdgeType(normalized.edges);
        const loadedVisibility = graph.visibility ?? 'public';
        setNodes(normalized.nodes);
        setEdges(loadedEdges);
        setMigrationNotice(normalized.changed);
        setProjectName(graph.name);
        setSourceGraph(graph);
        setVisibility(loadedVisibility);
        // Projeto migrado conta como alterado: precisa ser salvo no formato novo.
        setSavedSnapshot(
          normalized.changed
            ? ''
            : snapshotOf(graph.name, loadedVisibility, normalized.nodes, loadedEdges)
        );
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

  const handleAddNode = useCallback(() => {
    const newId = `${Date.now()}`;
    const newNode: Node = {
      id: newId,
      type: 'video',
      data: { label: 'Nova cena', title: 'Nova cena' },
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 400 + 100,
      },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes]);

  const onConnect: OnConnect = useCallback(
    (connection) => {
      const edge: Edge = {
        id: `e${connection.source}-${connection.target}`,
        source: connection.source!,
        target: connection.target!,
        type: 'choice',
        label: '',
        data: { label: '' },
      };
      setEdges((eds) => addEdge(edge, eds));
    },
    [setEdges]
  );

  const handleUpdateNode = useCallback(
    (nodeId: string, newData: Partial<SceneNodeData>) => {
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
      const label = String(nodes.find((n) => n.id === nodeId)?.data.label ?? 'sem nome');
      if (!confirmDeleteScenes([label])) return;
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      setSelectedNode(null);
    },
    [nodes, setNodes, setEdges]
  );

  // Tecla Delete/Backspace no canvas também pede confirmação para cenas.
  const onBeforeDelete = useCallback(
    async ({ nodes: toDelete }: { nodes: Node[]; edges: Edge[] }) =>
      confirmDeleteScenes(toDelete.map((n) => String(n.data.label ?? 'sem nome'))),
    []
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
    if (saveBlocked) {
      alert(blockingReason ?? 'O projeto ainda não pode ser salvo.');
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
      setSavedSnapshot(snapshotOf(projectName, visibility, nodes, edges));
      isDirtyRef.current = false;
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
      setMigrationNotice(false);
      setSaveFeedback('Projeto salvo');
      setTimeout(() => setSaveFeedback(null), 2500);
    } catch (error) {
      const apiMessage = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(`Não foi possível salvar o projeto.\n\n${apiMessage ?? 'Verifique se a API está rodando.'}`);
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
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: 'choice' }}
        zoomOnDoubleClick={false}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onBeforeDelete={onBeforeDelete}
        deleteKeyCode={['Backspace', 'Delete']}
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
              <IconFileDescription size={16} stroke={1.75} className="inline -mt-0.5 mr-1.5" aria-hidden="true" />Projeto
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
              <IconListCheck size={16} stroke={1.75} className="inline -mt-0.5 mr-1.5" aria-hidden="true" />Validação
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
                  <button
                    type="button"
                    onClick={tutorial.show}
                    className="ml-auto px-2.5 py-0.5 rounded-full text-xs font-semibold border border-copper/50 text-copper-light hover:bg-white/10 transition-colors"
                    title="Ver o tutorial do editor"
                  >
                    ? Como usar
                  </button>
                </div>

                <h2 className="text-xl font-semibold text-text mb-4">Editor de aula</h2>

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
                          {p.name} ({p.nodes?.length ?? 0} cenas)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="mb-4">
                  <label className="field-label">Nome do projeto</label>
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
                    <div className="text-xs text-text-secondary">Cenas</div>
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
                    {visibility === 'public'
                      ? 'Qualquer pessoa com o link de compartilhamento pode assistir.'
                      : 'Privado: o link não abre para ninguém, nem para você. Use para rascunhos.'}
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

                {migrationNotice && (
                  <div className="mb-3 p-3 rounded-lg bg-white/5 border border-copper/40 text-xs text-text-secondary">
                    Este projeto usava nós de escolha/final e foi convertido para cenas. Confira as conexões e salve para manter.
                  </div>
                )}

                <button
                  type="button"
                  onClick={exportGraph}
                  disabled={isSaving || saveBlocked}
                  title={saveBlocked ? blockingReason : undefined}
                  className="btn-primary w-full"
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    {isSaving ? (
                      <IconLoader2 size={18} stroke={2} className="animate-spin" aria-hidden="true" />
                    ) : saveFeedback ? (
                      <IconCheck size={18} stroke={2} aria-hidden="true" />
                    ) : (
                      <IconDeviceFloppy size={18} stroke={1.75} aria-hidden="true" />
                    )}
                    {isSaving ? 'Salvando…' : saveFeedback ?? 'Salvar Projeto'}
                  </span>
                </button>
                {isDirty && !saveBlocked && !isSaving && (
                  <p className="text-xs text-copper-light mt-2">• Alterações não salvas</p>
                )}
                {saveBlocked && blockingReason && (
                  <p className="text-xs text-danger-soft mt-2">{blockingReason}</p>
                )}
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
              selectedNode={liveSelectedNode}
              selectedEdge={liveSelectedEdge}
              edges={edges}
              onUpdateNode={handleUpdateNode}
              onUpdateEdge={handleUpdateEdge}
              onDeleteNode={handleDeleteNode}
              onDeleteEdge={handleDeleteEdge}
            />
          </div>
        </div>
      </ReactFlow>

      <TutorialModal open={tutorial.open} onClose={tutorial.close} />
    </div>
  );
}
