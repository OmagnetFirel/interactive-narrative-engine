import type { GraphEdge, SceneRoles } from '../types/graph.js';

interface MinimalNode {
    id: string;
}

interface MinimalEdge {
    source: string;
    target: string;
}

/** Papéis de uma cena, derivados apenas das conexões. */
export function getSceneRoles(nodeId: string, edges: MinimalEdge[]): SceneRoles {
    let incoming = 0;
    let outgoing = 0;
    for (const edge of edges) {
        if (edge.target === nodeId) incoming++;
        if (edge.source === nodeId) outgoing++;
    }
    return {
        isStart: incoming === 0,
        isBranch: outgoing > 1,
        isEnd: outgoing === 0,
    };
}

/** Papéis de todas as cenas do grafo, indexados pelo id. */
export function computeSceneRoles(nodes: MinimalNode[], edges: MinimalEdge[]): Map<string, SceneRoles> {
    const roles = new Map<string, SceneRoles>();
    for (const node of nodes) {
        roles.set(node.id, getSceneRoles(node.id, edges));
    }
    return roles;
}

/** O grafo tem ao menos uma cena com duas ou mais escolhas? */
export function hasBranch(edges: MinimalEdge[]): boolean {
    const outgoing = new Map<string, number>();
    for (const edge of edges) {
        const count = (outgoing.get(edge.source) ?? 0) + 1;
        if (count > 1) return true;
        outgoing.set(edge.source, count);
    }
    return false;
}

export function getOutgoingEdges<E extends GraphEdge>(nodeId: string, edges: E[]): E[] {
    return edges.filter(edge => edge.source === nodeId);
}
