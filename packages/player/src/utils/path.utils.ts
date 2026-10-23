import type { GraphNode } from '../core/types';
import { state } from '../core/state';

/**
 * Percorre o grafo a partir de um nó e coleta vídeos em sequência linear até:
 * - bifurcação (múltiplas saídas)
 * - nó de escolha que já tem vídeo (pausa narrativa)
 * - fim do caminho
 */
export function calculateVideoPathUntilBranch(startNode: GraphNode): GraphNode[] {
    const path: GraphNode[] = [];
    let currentNode: GraphNode | undefined = startNode;

    while (currentNode && state.currentGraph) {
        const videoUrl = (currentNode.data as { videoUrl?: string }).videoUrl;
        const hasVideo = Boolean(videoUrl?.trim());

        if (hasVideo) {
            path.push(currentNode);
        }

        const outgoing = state.currentGraph.edges.filter(e => e.source === currentNode!.id);

        if (outgoing.length === 0 || currentNode.type === 'end') {
            break;
        }

        if (currentNode.type === 'choice' && hasVideo) {
            break;
        }

        if (outgoing.length > 1) {
            break;
        }

        currentNode = state.currentGraph.nodes.find(n => n.id === outgoing[0].target);
    }

    return path;
}

export function getChoiceBeforeEndSeconds(nodeData: Record<string, unknown>, segmentDuration: number): number {
    const raw = nodeData.choiceBeforeEnd;
    const configured = typeof raw === 'number' && !Number.isNaN(raw) ? raw : undefined;
    const fallback = 7;
    const choiceBeforeEnd = configured ?? fallback;

    // Garantir pelo menos ~1s de vídeo antes das escolhas (evita overlay em clipes de 5s com choiceBeforeEnd=4)
    const maxLeadIn = Math.max(0.5, segmentDuration - 1);
    return Math.min(choiceBeforeEnd, maxLeadIn);
}
