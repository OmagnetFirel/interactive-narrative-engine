// Tipos base
export type NodeType = 'video' | 'choice' | 'end';

// Node de Vídeo (sempre tem vídeo)
export interface VideoNodeData {
    label: string;
    title: string;
    videoUrl?: string;
    duration?: number;
    description?: string;
    thumbnail?: string;
    choiceTimestamp?: number;
    choiceBeforeEnd?: number;
}

// Node de Escolha (pode ou não ter vídeo)
export interface ChoiceNodeData {
    label: string;
    title: string;
    description?: string;
    videoUrl?: string;
    duration?: number;
    timeout?: number;
    defaultChoice?: string; // ID da edge default
    choiceBeforeEnd?: number; // Segundos antes do fim do vídeo de transição para mostrar as escolhas
}

// Node Final (pode ter vídeo final ou apenas mensagem)
export interface EndNodeData {
    label: string;
    title: string;
    description?: string;
    endingType?: 'good' | 'bad' | 'neutral';
    // OPCIONAL: vídeo final
    videoUrl?: string;
    duration?: number;
    // Mensagem de encerramento
    message?: string;
}

// Edge (conexão = escolha)
export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    label?: string; // Texto da escolha ("Ir para a esquerda")
    type?: string;
    data?: {
        label?: string;
        // Condição para exibir a escolha (futuro)
        condition?: string;
        // Peso/probabilidade para prefetching
        weight?: number;
    };
}

// Node completo
export interface GraphNode {
    id: string;
    type: NodeType;
    position: { x: number; y: number };
    data: VideoNodeData | ChoiceNodeData | EndNodeData;
}

export type ProjectVisibility = 'public' | 'private';

// Grafo completo
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
    // Configurações globais
    settings?: {
        autoplay?: boolean;
        defaultTimeout?: number;
        showProgressBar?: boolean;
    };
}

// Validação
export interface ValidationError {
    type: 'missing_start' | 'orphan_node' | 'unreachable_node' | 'invalid_edge' | 'missing_video';
    message: string;
    nodeId?: string;
    edgeId?: string;
}

export interface ValidationWarning {
    type: 'no_choices' | 'multiple_ends' | 'long_path' | 'missing_video';
    message: string;
    nodeId?: string;
}

export interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}
