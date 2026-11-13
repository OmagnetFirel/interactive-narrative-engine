/**
 * Converte grafos salvos em versões anteriores (com nós de escolha e de fim)
 * para o modelo atual, em que só existe a cena (`type: 'video'`).
 *
 * Regras:
 * - nó de escolha ou de fim COM vídeo vira cena (o vídeo é preservado);
 * - nó de escolha SEM vídeo é removido e suas entradas passam a apontar
 *   direto para as saídas, mantendo o texto das escolhas;
 * - nó de fim SEM vídeo é removido; a mensagem dele vai para a cena anterior,
 *   que passa a ser o final daquele caminho;
 * - campos que não existem mais (timeout, defaultChoice, endingType) são descartados.
 *
 * É idempotente: aplicar num grafo já normalizado não muda nada.
 */

type AnyRecord = Record<string, unknown>;

export interface NormalizableNode {
    id: string;
    type?: string;
    data: object;
}

export interface NormalizableEdge {
    id: string;
    source: string;
    target: string;
}

export interface NormalizeResult<N, E> {
    nodes: N[];
    edges: E[];
    /** true quando algo foi convertido (útil para avisar o autor). */
    changed: boolean;
}

const LEGACY_FIELDS = ['timeout', 'defaultChoice', 'endingType', 'message'];

const dataOf = (node: NormalizableNode): AnyRecord => (node.data ?? {}) as AnyRecord;

function hasVideo(node: NormalizableNode): boolean {
    const url = dataOf(node).videoUrl;
    return typeof url === 'string' && url.trim() !== '';
}

function edgeLabel(edge: NormalizableEdge): string | undefined {
    const e = edge as NormalizableEdge & { label?: unknown; data?: AnyRecord };
    const raw = e.label ?? e.data?.label;
    return typeof raw === 'string' && raw.trim() !== '' ? raw : undefined;
}

function withLabel<E extends NormalizableEdge>(edge: E, label: string | undefined): E {
    const data = (edge as { data?: AnyRecord }).data ?? {};
    return { ...edge, label, data: { ...data, label } };
}

function legacyEndMessage(data: AnyRecord): string | undefined {
    for (const key of ['endMessage', 'message', 'description']) {
        const value = data[key];
        if (typeof value === 'string' && value.trim() !== '') return value;
    }
    return undefined;
}

function cleanSceneData(data: AnyRecord, wasEnd: boolean): AnyRecord {
    const next: AnyRecord = { ...data };
    if (wasEnd && next.endMessage === undefined) {
        const message = legacyEndMessage(data);
        if (message) next.endMessage = message;
    }
    for (const field of LEGACY_FIELDS) delete next[field];
    return next;
}

export function normalizeGraph<N extends NormalizableNode, E extends NormalizableEdge>(
    inputNodes: N[],
    inputEdges: E[]
): NormalizeResult<N, E> {
    let nodes = [...(inputNodes ?? [])];
    let edges = [...(inputEdges ?? [])];
    let changed = false;

    // 1. Remover nós legados sem vídeo, um de cada vez (podem existir em cadeia).
    for (;;) {
        const legacy = nodes.find(n => (n.type === 'choice' || n.type === 'end') && !hasVideo(n));
        if (!legacy) break;
        changed = true;

        const incoming = edges.filter(e => e.target === legacy.id);
        const outgoing = edges.filter(e => e.source === legacy.id);
        edges = edges.filter(e => e.source !== legacy.id && e.target !== legacy.id);
        nodes = nodes.filter(n => n.id !== legacy.id);

        if (outgoing.length === 0) {
            // Fim sem vídeo: a cena anterior vira o final e herda a mensagem.
            const message = legacyEndMessage(dataOf(legacy));
            if (message) {
                const predecessors = new Set(incoming.map(e => e.source));
                nodes = nodes.map(n =>
                    predecessors.has(n.id) &&
                    !edges.some(e => e.source === n.id) &&
                    !dataOf(n).endMessage
                        ? { ...n, data: { ...dataOf(n), endMessage: message } }
                        : n
                );
            }
            continue;
        }

        // Escolha sem vídeo: ligar entradas direto às saídas.
        for (const inEdge of incoming) {
            for (const outEdge of outgoing) {
                if (inEdge.source === outEdge.target) continue;
                const label = outgoing.length > 1 ? edgeLabel(outEdge) : edgeLabel(inEdge) ?? edgeLabel(outEdge);
                const bridged = withLabel(
                    { ...outEdge, id: `e${inEdge.source}-${outEdge.target}`, source: inEdge.source },
                    label
                );
                edges.push(bridged);
            }
        }
    }

    // 2. Nós legados com vídeo viram cenas; limpar campos antigos.
    nodes = nodes.map(n => {
        const wasLegacy = n.type !== 'video';
        const hasLegacyFields = LEGACY_FIELDS.some(f => f in dataOf(n));
        if (!wasLegacy && !hasLegacyFields) return n;
        changed = true;
        return { ...n, type: 'video', data: cleanSceneData(dataOf(n), n.type === 'end') };
    });

    // 3. Descartar arestas inválidas ou duplicadas (mesma origem e destino).
    const ids = new Set(nodes.map(n => n.id));
    const seen = new Set<string>();
    const cleanEdges: E[] = [];
    for (const edge of edges) {
        const key = `${edge.source}->${edge.target}`;
        if (!ids.has(edge.source) || !ids.has(edge.target) || seen.has(key)) {
            changed = true;
            continue;
        }
        seen.add(key);
        cleanEdges.push(edge);
    }

    return { nodes, edges: cleanEdges, changed };
}
