import type {
    GraphNode,
    GraphEdge,
    ValidationResult,
    ValidationError,
    ValidationWarning
} from '../types/graph.js';
import { computeSceneRoles, hasBranch } from './graphRoles.js';

/** Padrão de "segundos antes do fim" em que as escolhas aparecem. */
export const DEFAULT_CHOICE_BEFORE_END = 7;

/** Erros que impedem salvar o projeto (os demais são apenas informativos). */
const BLOCKING_ERRORS: ValidationError['type'][] = ['empty_graph', 'no_branch'];

/**
 * Valida um grafo de narrativa interativa.
 */
export function validateGraph(
    nodes: GraphNode[],
    edges: GraphEdge[]
): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (nodes.length === 0) {
        errors.push({
            type: 'empty_graph',
            message: 'O grafo está vazio. Adicione pelo menos uma cena.'
        });
        return { valid: false, errors, warnings };
    }

    const nodeIds = new Set(nodes.map(n => n.id));
    const labelOf = (id: string) => nodes.find(n => n.id === id)?.data.label || id;

    // Conexões apontando para cenas inexistentes
    const validEdges = edges.filter(edge => {
        const ok = nodeIds.has(edge.source) && nodeIds.has(edge.target);
        if (!ok) {
            errors.push({
                type: 'invalid_edge',
                edgeId: edge.id,
                message: 'Existe uma conexão ligada a uma cena que não existe mais.'
            });
        }
        return ok;
    });

    const roles = computeSceneRoles(nodes, validEdges);

    // Bifurcação mínima: sem ela a aula seria um vídeo linear
    if (!hasBranch(validEdges)) {
        errors.push({
            type: 'no_branch',
            message: 'A aula precisa de pelo menos uma bifurcação: uma cena com duas ou mais escolhas. Sem isso ela seria um vídeo linear.'
        });
    }

    // Cena inicial
    const startNodes = nodes.filter(n => roles.get(n.id)?.isStart);
    if (startNodes.length === 0) {
        errors.push({
            type: 'missing_start',
            message: 'Não há cena inicial: toda cena recebe alguma conexão. Deixe uma cena sem entradas para ser o início.'
        });
    } else if (startNodes.length > 1) {
        warnings.push({
            type: 'multiple_starts',
            message: `Há ${startNodes.length} cenas sem entrada. Só "${labelOf(startNodes[0].id)}" será usada como início.`
        });
    }

    // Cenas isoladas (sem nenhuma conexão) quando há mais de uma cena
    if (nodes.length > 1) {
        nodes.forEach(node => {
            const r = roles.get(node.id)!;
            if (r.isStart && r.isEnd) {
                errors.push({
                    type: 'orphan_node',
                    nodeId: node.id,
                    message: `A cena "${node.data.label}" está isolada (sem conexões).`
                });
            }
        });
    }

    // Cenas inalcançáveis a partir do início
    if (startNodes.length > 0) {
        const reachable = getReachableNodes(startNodes[0].id, validEdges);
        nodes
            .filter(node => !reachable.has(node.id))
            .filter(node => !errors.some(e => e.type === 'orphan_node' && e.nodeId === node.id))
            .forEach(node => {
                errors.push({
                    type: 'unreachable_node',
                    nodeId: node.id,
                    message: `A cena "${node.data.label}" não pode ser alcançada a partir do início.`
                });
            });

        const reachesEnd = [...reachable].some(id => roles.get(id)?.isEnd);
        if (!reachesEnd) {
            warnings.push({
                type: 'no_reachable_end',
                message: 'Nenhum caminho chega a um final (uma cena sem saídas). O aluno pode ficar preso num ciclo.'
            });
        }
    }

    // Ciclos (permitidos, mas avisados)
    detectCycles(nodes, validEdges).forEach(cycle => {
        warnings.push({
            type: 'cycle',
            message: `Ciclo entre as cenas: ${cycle.map(labelOf).join(' → ')}. Verifique se é intencional.`
        });
    });

    // Cenas sem vídeo e tempo das escolhas
    nodes.forEach(node => {
        const data = node.data;
        if (!data.videoUrl || !data.videoUrl.trim()) {
            warnings.push({
                type: 'missing_video',
                nodeId: node.id,
                message: `A cena "${data.label}" ainda não tem vídeo.`
            });
        }

        const r = roles.get(node.id)!;
        const lead = data.choiceBeforeEnd ?? DEFAULT_CHOICE_BEFORE_END;
        if (r.isBranch && data.duration && lead >= data.duration) {
            warnings.push({
                type: 'choice_timing',
                nodeId: node.id,
                message: `Na cena "${data.label}", as escolhas aparecem ${lead}s antes do fim, mas o vídeo tem ${Math.round(data.duration)}s. Elas aparecerão logo no começo.`
            });
        }
    });

    // Texto das escolhas: só importa nas saídas de bifurcações (é o que o aluno lê)
    validEdges.forEach(edge => {
        if (!roles.get(edge.source)?.isBranch) return;
        const label = typeof edge.label === 'string' ? edge.label : edge.data?.label;
        if (!label || label.trim() === '') {
            warnings.push({
                type: 'missing_label',
                edgeId: edge.id,
                message: `Uma escolha de "${labelOf(edge.source)}" para "${labelOf(edge.target)}" está sem texto.`
            });
        }
    });

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/** O projeto pode ser salvo? Só erros bloqueantes impedem (ex.: falta de bifurcação). */
export function canSaveGraph(result: ValidationResult): boolean {
    return !result.errors.some(e => BLOCKING_ERRORS.includes(e.type));
}

export function getBlockingErrors(result: ValidationResult): ValidationError[] {
    return result.errors.filter(e => BLOCKING_ERRORS.includes(e.type));
}

function getReachableNodes(startNodeId: string, edges: GraphEdge[]): Set<string> {
    const reachable = new Set<string>();
    const queue = [startNodeId];

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (reachable.has(currentId)) continue;
        reachable.add(currentId);

        edges
            .filter(edge => edge.source === currentId)
            .forEach(edge => {
                if (!reachable.has(edge.target)) queue.push(edge.target);
            });
    }

    return reachable;
}

function detectCycles(nodes: GraphNode[], edges: GraphEdge[]): string[][] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    function dfs(nodeId: string, path: string[]): void {
        visited.add(nodeId);
        recursionStack.add(nodeId);
        path.push(nodeId);

        for (const edge of edges.filter(e => e.source === nodeId)) {
            if (!visited.has(edge.target)) {
                dfs(edge.target, [...path]);
            } else if (recursionStack.has(edge.target)) {
                cycles.push(path.slice(path.indexOf(edge.target)));
            }
        }

        recursionStack.delete(nodeId);
    }

    nodes.forEach(node => {
        if (!visited.has(node.id)) dfs(node.id, []);
    });

    return cycles;
}

export function getValidationSummary(result: ValidationResult): string {
    const errorCount = result.errors.length;
    const warningCount = result.warnings.length;

    if (errorCount === 0 && warningCount === 0) {
        return '✓ Grafo válido sem problemas';
    }

    const parts = [];
    if (errorCount > 0) parts.push(`${errorCount} erro(s)`);
    if (warningCount > 0) parts.push(`${warningCount} aviso(s)`);
    return parts.join(', ');
}
