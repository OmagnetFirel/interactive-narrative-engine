/**
 * Modelo do grafo do BranchPlay.
 *
 * Existe um único tipo de nó: a CENA (`type: 'video'`), sempre associada a um clipe.
 * As escolhas são as arestas (o rótulo da aresta é o texto do botão no player).
 * Os papéis de cada cena são derivados da estrutura (ver `getSceneRoles`):
 *   - Início: cena sem conexões de entrada;
 *   - Bifurcação: cena com 2+ saídas (o aluno escolhe);
 *   - Final: cena sem saídas.
 */
export type NodeType = 'video';

/** Tipos de nó das versões anteriores, convertidos por `normalizeGraph`. */
export type LegacyNodeType = 'choice' | 'end';

export interface SceneNodeData {
    label: string;
    title?: string;
    videoUrl?: string;
    /** Duração em segundos, preenchida automaticamente a partir do vídeo enviado. */
    duration?: number;
    thumbnail?: string;
    /** Segundos antes do fim da cena em que as escolhas aparecem (cenas com bifurcação). */
    choiceBeforeEnd?: number;
    /** Mensagem exibida ao terminar a aula (cenas finais). */
    endMessage?: string;
    description?: string;
}

/** @deprecated use SceneNodeData */
export type VideoNodeData = SceneNodeData;

// Edge (conexão = escolha)
export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    label?: string; // Texto da escolha ("Ir para a esquerda")
    type?: string;
    data?: {
        label?: string;
        condition?: string;
        weight?: number;
    };
}

export interface GraphNode {
    id: string;
    type: NodeType;
    position: { x: number; y: number };
    data: SceneNodeData;
}

export type ProjectVisibility = 'public' | 'private';

export interface InteractiveGraph {
    id: string;
    name: string;
    description?: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
    visibility?: ProjectVisibility;
    shareToken?: string;
    metadata?: {
        createdAt: string;
        updatedAt: string;
        author?: string;
        version?: string;
    };
    settings?: {
        autoplay?: boolean;
        showProgressBar?: boolean;
    };
}

export interface SceneRoles {
    isStart: boolean;
    isBranch: boolean;
    isEnd: boolean;
}

// Validação
export type ValidationErrorType =
    | 'empty_graph'
    | 'missing_start'
    | 'orphan_node'
    | 'unreachable_node'
    | 'invalid_edge'
    | 'no_branch';

export type ValidationWarningType =
    | 'multiple_starts'
    | 'missing_video'
    | 'missing_label'
    | 'no_reachable_end'
    | 'cycle'
    | 'choice_timing';

export interface ValidationError {
    type: ValidationErrorType;
    message: string;
    nodeId?: string;
    edgeId?: string;
}

export interface ValidationWarning {
    type: ValidationWarningType;
    message: string;
    nodeId?: string;
    edgeId?: string;
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}
