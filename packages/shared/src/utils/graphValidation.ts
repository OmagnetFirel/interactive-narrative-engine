import type {
    GraphNode,
    GraphEdge,
    ValidationResult,
    ValidationError,
    ValidationWarning
} from '../types/graph';

/**
 * Valida um grafo de narrativa interativa
 */
export function validateGraph(
    nodes: GraphNode[],
    edges: GraphEdge[]
): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. Verificar se existe pelo menos um nó
    if (nodes.length === 0) {
        errors.push({
            type: 'missing_start',
            message: 'O grafo está vazio. Adicione pelo menos um nó.'
        });
        return { valid: false, errors, warnings };
    }

    // 2. Verificar nó inicial (tipo 'video' sem edges de entrada)
    const initialNodes = nodes.filter(node => {
        const hasIncomingEdges = edges.some(edge => edge.target === node.id);
        return !hasIncomingEdges && node.type === 'video';
    });

    if (initialNodes.length === 0) {
        errors.push({
            type: 'missing_start',
            message: 'Não foi encontrado um nó inicial válido. Deve haver pelo menos um nó de vídeo sem conexões de entrada.'
        });
    } else if (initialNodes.length > 1) {
        warnings.push({
            type: 'multiple_ends',
            message: `Encontrados ${initialNodes.length} possíveis nós iniciais. Considere deixar apenas um ponto de partida.`
        });
    }

    // 3. Verificar nós finais (tipo 'end')
    const endNodes = nodes.filter(node => node.type === 'end');
    if (endNodes.length === 0) {
        warnings.push({
            type: 'no_choices',
            message: 'Nenhum nó final encontrado. Considere adicionar pelo menos um final para a história.'
        });
    }

    // 4. Detectar nós órfãos (sem conexões de entrada E saída)
    nodes.forEach(node => {
        const hasIncoming = edges.some(edge => edge.target === node.id);
        const hasOutgoing = edges.some(edge => edge.source === node.id);

        // Nó inicial pode não ter incoming, nó final pode não ter outgoing
        const isInitial = !hasIncoming && node.type === 'video';
        const isFinal = node.type === 'end';

        if (!hasIncoming && !hasOutgoing && !isInitial) {
            errors.push({
                type: 'orphan_node',
                nodeId: node.id,
                message: `Nó "${node.data.label}" está isolado (sem conexões).`
            });
        } else if (!hasIncoming && !isInitial) {
            warnings.push({
                type: 'missing_video',
                nodeId: node.id,
                message: `Nó "${node.data.label}" não possui conexões de entrada e não é um nó inicial.`
            });
        } else if (!hasOutgoing && !isFinal) {
            warnings.push({
                type: 'missing_video',
                nodeId: node.id,
                message: `Nó "${node.data.label}" não possui conexões de saída e não é um nó final.`
            });
        }
    });

    // 5. Verificar nós inacessíveis (não alcançáveis a partir do inicial)
    if (initialNodes.length > 0) {
        const reachableNodes = getReachableNodes(initialNodes[0].id, nodes, edges);
        const unreachableNodes = nodes.filter(node => !reachableNodes.has(node.id));

        unreachableNodes.forEach(node => {
            errors.push({
                type: 'unreachable_node',
                nodeId: node.id,
                message: `Nó "${node.data.label}" não pode ser alcançado a partir do início.`
            });
        });
    }

    // 6. Detectar ciclos (opcional - pode ser intencional em algumas narrativas)
    const cycles = detectCycles(nodes, edges);
    if (cycles.length > 0) {
        cycles.forEach(cycle => {
            warnings.push({
                type: 'long_path',
                message: `Ciclo detectado envolvendo os nós: ${cycle.join(', ')}. Verifique se é intencional.`
            });
        });
    }

    // 7. Verificar nós de vídeo sem URL
    nodes.forEach(node => {
        if (node.type === 'video') {
            const videoData = node.data as any;
            if (!videoData.videoUrl) {
                warnings.push({
                    type: 'missing_video',
                    nodeId: node.id,
                    message: `Nó de vídeo "${node.data.label}" não possui URL de vídeo configurada.`
                });
            }
        }
    });

    // 8. Verificar edges com labels vazias
    edges.forEach(edge => {
        if (!edge.label || edge.label.trim() === '') {
            warnings.push({
                type: 'no_choices',
                message: `Conexão entre nós não possui label descritivo.`
            });
        }
    });

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Busca em largura para encontrar nós alcançáveis
 */
function getReachableNodes(
    startNodeId: string,
    nodes: GraphNode[],
    edges: GraphEdge[]
): Set<string> {
    const reachable = new Set<string>();
    const queue = [startNodeId];

    while (queue.length > 0) {
        const currentId = queue.shift()!;

        if (reachable.has(currentId)) continue;
        reachable.add(currentId);

        // Adicionar nós adjacentes
        edges
            .filter(edge => edge.source === currentId)
            .forEach(edge => {
                if (!reachable.has(edge.target)) {
                    queue.push(edge.target);
                }
            });
    }

    return reachable;
}

/**
 * Detecta ciclos no grafo usando DFS
 */
function detectCycles(nodes: GraphNode[], edges: GraphEdge[]): string[][] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    function dfs(nodeId: string, path: string[]): void {
        visited.add(nodeId);
        recursionStack.add(nodeId);
        path.push(nodeId);

        const outgoingEdges = edges.filter(edge => edge.source === nodeId);

        for (const edge of outgoingEdges) {
            const targetId = edge.target;

            if (!visited.has(targetId)) {
                dfs(targetId, [...path]);
            } else if (recursionStack.has(targetId)) {
                // Ciclo detectado
                const cycleStart = path.indexOf(targetId);
                cycles.push(path.slice(cycleStart));
            }
        }

        recursionStack.delete(nodeId);
    }

    nodes.forEach(node => {
        if (!visited.has(node.id)) {
            dfs(node.id, []);
        }
    });

    return cycles;
}

/**
 * Helper para contar problemas críticos
 */
export function getValidationSummary(result: ValidationResult): string {
    const errorCount = result.errors.length;
    const warningCount = result.warnings.length;

    if (errorCount === 0 && warningCount === 0) {
        return '✓ Grafo válido sem problemas';
    }

    const parts = [];
    if (errorCount > 0) {
        parts.push(`${errorCount} erro(s)`);
    }
    if (warningCount > 0) {
        parts.push(`${warningCount} aviso(s)`);
    }

    return parts.join(', ');
}
