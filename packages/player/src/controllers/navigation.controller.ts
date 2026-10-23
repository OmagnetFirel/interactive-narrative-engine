import type { GraphNode, InteractiveGraph } from '../core/types';
import { state, resetState } from '../core/state';
import { dom } from '../ui/dom-elements';
import { hideChoices, hideEnd, showEndOverlay } from '../ui/overlay.ui';
import { videoController } from './video.controller';
import { showChoicesDuringVideo } from './choices.controller';
import { hlsService } from '../services/hls.service';
import { timelineService } from '../services/timeline.service';
import { extractVideoId } from '../utils/format.utils';
import { calculateVideoPathUntilBranch, getChoiceBeforeEndSeconds } from '../utils/path.utils';
import { STITCHED_PREFETCH_LEAD_SEC, STITCHED_TRANSITION_LEAD_SEC, STITCHED_MIN_PLAY_BEFORE_TRANSITION_SEC } from '../core/config';
import { debugLog, logPlayerState, logVideoElement } from '../utils/debug.util';

/** Evita disparos duplicados de continuação linear em playlists EVENT. */
let stitchedResumeInFlight = false;

function hasPlayedEnoughOfSegment(seg: { startTime: number; duration: number }, currentTime: number): boolean {
    const played = currentTime - seg.startTime;
    const minPlay = Math.max(
        STITCHED_MIN_PLAY_BEFORE_TRANSITION_SEC,
        seg.duration * 0.2
    );
    return played >= minPlay;
}

export function findInitialNode(graph: InteractiveGraph): GraphNode | null {
    for (const node of graph.nodes) {
        const hasIncoming = graph.edges.some(edge => edge.target === node.id);
        if (!hasIncoming && node.type === 'video') {
            return node;
        }
    }
    return graph.nodes[0] || null;
}

export function navigateToNode(node: GraphNode, seekToTime?: number): void {
    console.log(`\n📍 ===== NAVEGANDO PARA: ${node.data.label} ${seekToTime !== undefined ? `(seek: ${seekToTime})` : ''} =====`);
    console.log(`📊 Estado atual - Timeline length: ${state.virtualTimeline.length}, Stitched path: ${state.stitchedPath.length}`);

    state.currentNode = node;

    if (!state.isSeekingVirtual) {
        state.pathHistory.push(node.id);
    }

    state.choicesShown = false;

    if (seekToTime === undefined) {
        state.nextNodeQueued = null;
        state.hasChosenDuringVideo = false;
        state.isWaitingForVideoEnd = false;

        // ✅ CORREÇÃO: Sempre calcular caminho sequencial se for vídeo E não estiver em stitched mode
        if (node.type === 'video' && !state.stitchedPlaylistUrl) {
            console.log('🔍 Verificando se há caminho sequencial...');
            const sequentialPath = calculateSequentialPath(node);

            // ✅ Opção A: sessão EVENT quando há múltiplos vídeos em sequência OU quando
            // o caminho leva a uma bifurcação (inclusive via nó de escolha intermediário).
            // Sem sessão, a 1ª escolha troca a fonte HLS e causa "piscada".
            const pathTail = sequentialPath[sequentialPath.length - 1];
            const shouldUsePlaybackSession =
                sequentialPath.length > 1 ||
                (pathTail !== undefined && pathLeadsToChoice(pathTail));

            if (shouldUsePlaybackSession) {
                console.log(`🎬 Iniciando sessão de playback com ${sequentialPath.length} vídeo(s)...`);
                loadSequentialVideos(sequentialPath);
                return; // ✅ IMPORTANTE: Não continuar execução normal
            } else {
                console.log(`📹 Apenas 1 vídeo no caminho (linear), reprodução normal`);
                // Construir timeline com apenas este vídeo
                timelineService.buildVirtualTimeline([node]);
            }
        }
    }

    updateNodeInfo();
    hideChoices();
    hideEnd();

    if (node.type === 'video') {
        videoController.playVideo(node, seekToTime);
    } else if (node.type === 'choice') {
        handleChoiceNode(node);
    } else if (node.type === 'end') {
        handleEndNode(node);
    }

    if (seekToTime !== undefined) {
        state.isSeekingVirtual = false;
    }
}

/**
 * ✅ CORREÇÃO: Calcular caminho sequencial incluindo ESCOLHAS COM VÍDEO
 */
function calculateSequentialPath(startNode: GraphNode): GraphNode[] {
    console.log('\n🔍 Calculando caminho sequencial...');
    const path = calculateVideoPathUntilBranch(startNode);
    for (const node of path) {
        console.log(`  ✅ Adicionando: ${node.data.label} (${node.type})`);
    }
    console.log(`📦 Caminho calculado: ${path.length} vídeo(s) em sequência`);
    return path;
}

/**
 * ✅ Opção A: o caminho à frente leva a um ponto de escolha (mais appends virão)
 * ou termina (nó final/sem saída)? Usado para decidir se a sessão fica EVENT
 * (aberta) ou recebe ENDLIST (fechada, vira VOD e dispara 'ended' no fim).
 */
export function pathLeadsToChoice(startNode: GraphNode | undefined): boolean {
    if (!startNode || !state.currentGraph) return false;

    let current: GraphNode | undefined = startNode;
    const seen = new Set<string>();

    while (current && !seen.has(current.id)) {
        seen.add(current.id);

        if (current.type === 'end') return false;

        const outgoing = state.currentGraph.edges.filter(e => e.source === current!.id);
        if (outgoing.length === 0) return false;
        if (outgoing.length > 1) return true;

        current = state.currentGraph.nodes.find(n => n.id === outgoing[0].target);
    }

    return false;
}

/**
 * ✅ Opção A: iniciar uma SESSÃO de playback (URL estável + EVENT).
 * O carregamento acontece UMA vez; escolhas posteriores apenas anexam à sessão
 * sem recarregar a fonte (sem "piscada").
 */
async function loadSequentialVideos(sequentialPath: GraphNode[]): Promise<void> {
    try {
        const { apiService } = await import('../services/api.service');

        const videoIds = sequentialPath
            .map(n => extractVideoId((n.data as any).videoUrl))
            .filter((id): id is string => Boolean(id));

        const session = videoIds.length > 0 ? await apiService.createSession(videoIds) : null;

        if (session) {
            state.sessionId = session.sessionId;
            state.stitchedPlaylistUrl = session.masterPlaylistUrl;
            state.stitchedPath = sequentialPath;

            timelineService.buildVirtualTimeline(state.stitchedPath);
            state.currentNode = state.stitchedPath[0];
            updateNodeInfo();

            debugLog('session', 'Sessão HLS criada no início', {
                sessionId: session.sessionId,
                playlistUrl: session.masterPlaylistUrl,
                videoIds,
                pathLabels: sequentialPath.map(n => n.data.label),
            });
            logPlayerState('após criar sessão inicial');

            await hlsService.loadStitchedPlaylist(state.stitchedPlaylistUrl);
            logVideoElement('após loadStitchedPlaylist inicial');
            return;
        }

        // Fallback: stitching legado (com reload) ou vídeo único
        console.warn('⚠️ Falha ao criar sessão, tentando stitching legado...');
        const stitched = await apiService.preloadStitchedPlaylist(sequentialPath);

        if (stitched) {
            state.stitchedPlaylistUrl = stitched.url;
            state.stitchedPath = stitched.path;
            timelineService.buildVirtualTimeline(state.stitchedPath);
            state.currentNode = state.stitchedPath[0];
            updateNodeInfo();
            await hlsService.loadStitchedPlaylist(state.stitchedPlaylistUrl);
        } else {
            console.warn('⚠️ Falha no stitching, usando reprodução normal');
            timelineService.buildVirtualTimeline([sequentialPath[0]]);
            videoController.playVideo(sequentialPath[0]);
        }

    } catch (error) {
        console.error('❌ Erro ao carregar vídeos sequenciais:', error);
        // Fallback: reproduzir apenas o primeiro vídeo
        timelineService.buildVirtualTimeline([sequentialPath[0]]);
        videoController.playVideo(sequentialPath[0]);
    }
}

async function seekToStitchedSegment(segmentIndex: number): Promise<boolean> {
    const segment = state.virtualTimeline[segmentIndex];
    if (!segment) return false;

    const seekTo = segment.startTime + 0.05;
    debugLog('stitched', 'Seek para segmento da timeline', {
        segmentIndex,
        label: segment.node.data.label,
        seekTo: Number(seekTo.toFixed(3)),
    });

    await hlsService.refreshEventPlaylist();
    await hlsService.waitUntilBuffered(seekTo, 10000);

    dom.video.currentTime = seekTo;
    timelineService.updateCurrentSegmentByTime(seekTo);
    await dom.video.play().catch(() => { });
    return true;
}

async function resolveStitchedEndState(): Promise<void> {
    const lastNode = state.virtualTimeline[state.virtualTimeline.length - 1]?.node || state.currentNode;
    if (!lastNode || !state.currentGraph) return;

    const outgoingEdges = state.currentGraph.edges.filter(
        edge => edge.source === lastNode.id
    );

    if (outgoingEdges.length > 1) {
        console.log('🔀 Múltiplas escolhas no fim da playlist');
        state.currentNode = lastNode;
        showChoicesDuringVideo(outgoingEdges, lastNode);
        return;
    }

    if (lastNode.type === 'end' || outgoingEdges.length === 0) {
        console.log('🏁 Fim da narrativa (stitched)');
        finishStitchedEnd(lastNode);
        return;
    }

    if (outgoingEdges.length === 1) {
        const nextNode = state.currentGraph.nodes.find(n => n.id === outgoingEdges[0].target);
        if (nextNode) {
            if (state.stitchedPlaylistUrl && state.sessionId) {
                const continued = await continueStitchedPathIfNeeded();
                if (continued) return;
            }
            console.log(`➡️ Próximo nó após stitched: ${nextNode.data.label}`);
            navigateToNode(nextNode);
        }
    }
}

async function resumeStitchedPlaybackAfterSegmentEnd(): Promise<void> {
    if (stitchedResumeInFlight) return;
    stitchedResumeInFlight = true;

    try {
        const nextSeg = state.virtualTimeline[state.currentSegmentIndex + 1];
        if (nextSeg) {
            await seekToStitchedSegment(state.currentSegmentIndex + 1);
            return;
        }

        const videoTime = dom.video.currentTime;
        const isRealEnd = videoTime >= state.virtualTotalDuration - 0.5;

        if (!isRealEnd) {
            debugLog('ended', 'Ainda não é fim virtual — retomando play()', {
                videoTime: Number(videoTime.toFixed(3)),
                virtualTotal: state.virtualTotalDuration,
            });
            await dom.video.play().catch(() => { });
            return;
        }

        debugLog('ended', 'Fim virtual do trecho — verificando continuação');

        const continued = await continueStitchedPathIfNeeded();
        if (continued) {
            debugLog('ended', 'Playlist continuada com novo append');
            return;
        }

        await resolveStitchedEndState();
    } finally {
        stitchedResumeInFlight = false;
    }
}

async function continueStitchedPathIfNeeded(options?: { seekAfter?: boolean }): Promise<boolean> {
    const seekAfter = options?.seekAfter ?? true;
    const anchorIdx = state.currentSegmentIndex;
    const anchorSegment = state.virtualTimeline[anchorIdx];

    if (!anchorSegment || !state.currentGraph || !state.stitchedPlaylistUrl) {
        return false;
    }

    const outgoing = state.currentGraph.edges.filter(e => e.source === anchorSegment.node.id);
    if (outgoing.length !== 1) {
        return false;
    }

    const nextNode = state.currentGraph.nodes.find(n => n.id === outgoing[0].target);
    if (!nextNode) {
        return false;
    }

    const existingIdx = state.virtualTimeline.findIndex(seg => seg.node.id === nextNode.id);
    if (existingIdx !== -1) {
        debugLog('continue', 'Próximo nó já na timeline — seek', {
            anchorLabel: anchorSegment.node.data.label,
            nextLabel: nextNode.data.label,
            existingIdx,
        });
        if (seekAfter && existingIdx > anchorIdx) {
            await seekToStitchedSegment(existingIdx);
        }
        return true;
    }

    debugLog('continue', 'Tentando continuar playlist stitched', {
        anchorLabel: anchorSegment.node.data.label,
        anchorId: anchorSegment.node.id,
        nextNodeId: nextNode.id,
        nextNodeLabel: nextNode.data.label,
        nextNodeType: nextNode.type,
    });

    const path = calculateVideoPathUntilBranch(nextNode);
    if (path.length === 0) {
        debugLog('continue', 'Nenhum vídeo a anexar — abortando');
        return false;
    }

    debugLog('continue', 'Anexando próximo trecho', {
        pathLabels: path.map(n => n.data.label),
    });
    state.sessionFinalizeRequested = false;

    const timelineLengthBefore = state.virtualTimeline.length;
    timelineService.appendToTimeline(path);
    const ok = await hlsService.appendToCurrentPlaylist(path);

    debugLog('continue', 'Resultado do append', { ok, sessionId: state.sessionId });
    logPlayerState('após continueStitchedPath');
    logVideoElement('após continueStitchedPath');

    if (!ok) {
        return false;
    }

    const firstNewIndex = timelineLengthBefore;
    const nextStart = state.virtualTimeline[firstNewIndex]?.startTime;

    if (!seekAfter && nextStart !== undefined) {
        debugLog('continue', 'Prefetch HLS — aguardando buffer do próximo trecho', {
            nextStart: Number(nextStart.toFixed(3)),
        });
        void hlsService.waitUntilBuffered(nextStart + 0.05, 15000);
        return true;
    }

    if (firstNewIndex < state.virtualTimeline.length) {
        await seekToStitchedSegment(firstNewIndex);
    } else if (dom.video.paused) {
        await dom.video.play().catch(() => { });
    }

    return true;
}

/**
 * Fecha a sessão HLS (ENDLIST) só perto do fim real da timeline, quando não há
 * mais bifurcações à frente. Evita parar a reprodução no fim do segmento atual.
 */
export function maybeFinalizeSessionNearEnd(): void {
    if (!state.sessionId || !state.stitchedPlaylistUrl || state.virtualTotalDuration <= 0) {
        return;
    }

    if (state.sessionFinalizeRequested) {
        return;
    }

    const currentTime = dom.video.currentTime;
    const remaining = state.virtualTotalDuration - currentTime;
    if (remaining <= 0 || remaining > 2) {
        return;
    }

    const lastSegment = state.virtualTimeline[state.virtualTimeline.length - 1];
    const lastNode = lastSegment?.node;
    if (!lastNode || !state.currentGraph) {
        return;
    }

    const isOnLastSegment = state.currentSegmentIndex >= state.virtualTimeline.length - 1;
    if (!isOnLastSegment) {
        return;
    }

    const outgoing = state.currentGraph.edges.filter(e => e.source === lastNode.id);
    if (outgoing.length > 1) {
        return;
    }

    // Ainda há trecho linear não anexado à playlist
    if (outgoing.length === 1) {
        const nextNode = state.currentGraph.nodes.find(n => n.id === outgoing[0].target);
        if (nextNode && !state.virtualTimeline.some(seg => seg.node.id === nextNode.id)) {
            return;
        }
    }

    state.sessionFinalizeRequested = true;
    debugLog('session', 'Encerrando sessão (ENDLIST) perto do fim', {
        currentTime: Number(currentTime.toFixed(3)),
        virtualTotal: state.virtualTotalDuration,
        lastNodeLabel: lastNode.data.label,
    });
    void hlsService.endSession();
}

export function handleTimeUpdate(): void {
    if (state.stitchedPlaylistUrl && state.stitchedPath.length > 0) {
        maybeFinalizeSessionNearEnd();
        timelineService.updateCurrentSegmentByTime(dom.video.currentTime);

        // HLS EVENT: pode pausar no fim do último segmento conhecido sem disparar 'ended'
        const seg = state.virtualTimeline[state.currentSegmentIndex];
        const nextSeg = state.virtualTimeline[state.currentSegmentIndex + 1];
        const isLastKnownSegment = state.currentSegmentIndex >= state.virtualTimeline.length - 1;

        if (seg) {
            const segEnd = seg.startTime + seg.duration;
            const t = dom.video.currentTime;
            const timeToEnd = segEnd - t;
            const segIdx = state.currentSegmentIndex;

            if (nextSeg) {
                const canTransition =
                    timeToEnd <= STITCHED_TRANSITION_LEAD_SEC &&
                    timeToEnd > 0 &&
                    hasPlayedEnoughOfSegment(seg, t) &&
                    state.stitchedTransitionedFromIndex !== segIdx;

                if (canTransition) {
                    state.stitchedTransitionedFromIndex = segIdx;
                    void seekToStitchedSegment(segIdx + 1);
                } else if (
                    dom.video.paused &&
                    t >= segEnd - 0.25 &&
                    t < nextSeg.startTime + nextSeg.duration * 0.5
                ) {
                    void seekToStitchedSegment(segIdx + 1);
                }
            } else if (isLastKnownSegment) {
                if (
                    timeToEnd <= STITCHED_PREFETCH_LEAD_SEC &&
                    timeToEnd > STITCHED_TRANSITION_LEAD_SEC &&
                    hasPlayedEnoughOfSegment(seg, t) &&
                    state.stitchedPrefetchSegmentIndex !== segIdx
                ) {
                    state.stitchedPrefetchSegmentIndex = segIdx;
                    void continueStitchedPathIfNeeded({ seekAfter: false });
                }
                if (
                    timeToEnd <= STITCHED_TRANSITION_LEAD_SEC &&
                    hasPlayedEnoughOfSegment(seg, t)
                ) {
                    void resumeStitchedPlaybackAfterSegmentEnd();
                }
            }
        }
    }

    if (!state.currentGraph) return;

    // Nó ativo: em modo stitched, sempre o do segmento da timeline virtual
    let activeNode = state.currentNode;
    if (state.stitchedPlaylistUrl && state.virtualTimeline.length > 0) {
        const segment = state.virtualTimeline[state.currentSegmentIndex];
        if (segment) {
            activeNode = segment.node;
        }
    }

    if (!activeNode) return;

    const outgoingEdges = state.currentGraph.edges.filter(
        edge => edge.source === activeNode.id
    );

    // Caminho linear: nunca exibir overlay de escolhas
    if (outgoingEdges.length <= 1) {
        if (state.choicesShown) {
            hideChoices();
            state.choicesShown = false;
            state.hasChosenDuringVideo = false;
        }
        return;
    }

    if (state.choicesShown) return;

    if (state.hasChosenDuringVideo && state.choiceResolvedNodeId === activeNode.id) {
        return;
    }

    const currentTime = dom.video.currentTime;
    const duration = dom.video.duration;

    if (!duration || isNaN(duration)) return;

    const data = activeNode.data as unknown as Record<string, unknown>;

    let referenceEnd = duration;
    let segmentDuration = duration;
    if (state.stitchedPlaylistUrl && state.virtualTimeline.length > 0) {
        const segment = state.virtualTimeline[state.currentSegmentIndex];
        if (segment) {
            referenceEnd = segment.startTime + segment.duration;
            segmentDuration = segment.duration;
        }
    }

    const choiceBeforeEnd = getChoiceBeforeEndSeconds(data, segmentDuration);
    const showChoicesAt = referenceEnd - choiceBeforeEnd;

    if (currentTime >= showChoicesAt) {
        debugLog('timeupdate', 'Momento de escolha atingido', {
            currentTime: Number(currentTime.toFixed(3)),
            showChoicesAt: Number(showChoicesAt.toFixed(3)),
            referenceEnd: Number(referenceEnd.toFixed(3)),
            choiceBeforeEnd,
            segmentDuration,
            segmentIndex: state.currentSegmentIndex,
            currentNodeLabel: activeNode.data.label,
            optionCount: outgoingEdges.length,
        });
        showChoicesDuringVideo(outgoingEdges, activeNode);
    }
}

export function handleVideoEnded(): void {
    const videoTime = dom.video.currentTime;
    const hlsDuration = dom.video.duration;

    debugLog('ended', 'Evento ended do <video>', {
        videoTime: Number(videoTime.toFixed(3)),
        hlsDuration: Number.isFinite(hlsDuration) ? Number(hlsDuration.toFixed(3)) : hlsDuration,
        virtualTotal: state.virtualTotalDuration,
        currentSegmentIndex: state.currentSegmentIndex,
        currentNodeLabel: state.currentNode?.data.label,
        stitched: Boolean(state.stitchedPlaylistUrl),
        sessionId: state.sessionId,
        hasNextSegment: state.currentSegmentIndex < state.virtualTimeline.length - 1,
    });
    logVideoElement('no evento ended');
    logPlayerState('no evento ended');

    // ✅ Em modo stitched: se ainda há segmentos na timeline virtual, é fim de trecho — não fim da história
    if (state.stitchedPath.length > 0 && state.stitchedPlaylistUrl) {
        if (state.currentSegmentIndex < state.virtualTimeline.length - 1) {
            debugLog('ended', 'Fim de segmento (não fim virtual) — avançando');
        }
        void resumeStitchedPlaybackAfterSegmentEnd();
        return;
    }

    // ✅ Modo normal (sem stitching) - processar próximo nó
    if (!state.currentGraph || !state.currentNode) {
        console.log('⚠️ Sem grafo ou nó atual');
        return;
    }

    const outgoingEdges = state.currentGraph.edges.filter(
        edge => edge.source === state.currentNode?.id
    ) || [];

    console.log(`🔍 Processando próximo nó (${outgoingEdges.length} edges)`);

    if (outgoingEdges.length === 0) {
        console.log('🏁 Fim da narrativa (sem edges)');
        handleEndNode(state.currentNode);
    } else if (outgoingEdges.length === 1) {
        const nextNode = state.currentGraph.nodes.find(n => n.id === outgoingEdges[0].target);
        if (nextNode) {
            console.log(`➡️ Próximo nó: ${nextNode.data.label}`);
            navigateToNode(nextNode);
        }
    } else if (!state.hasChosenDuringVideo) {
        // Múltiplas escolhas mas usuário não escolheu - usar primeira
        console.log('🔀 Usando primeira opção (timeout)');
        const nextNode = state.currentGraph.nodes.find(n => n.id === outgoingEdges[0].target);
        if (nextNode) {
            navigateToNode(nextNode);
        }
    }
}

export function handleRestart(): void {
    if (state.currentGraph) {
        const initialNode = findInitialNode(state.currentGraph);
        if (initialNode) {
            resetState();
            navigateToNode(initialNode);
        }
    }
}

function handleChoiceNode(node: GraphNode): void {
    const videoUrl = (node.data as any).videoUrl;

    if (videoUrl && videoUrl.trim()) {
        // Tem vídeo de transição, reproduzir normalmente
        videoController.playVideo(node);
    } else {
        // ✅ CORREÇÃO: Sem vídeo de transição
        const outgoingEdges = state.currentGraph!.edges.filter(edge => edge.source === node.id);

        console.log(`🔀 Nó de escolha sem vídeo: ${node.data.label} (${outgoingEdges.length} opções)`);

        if (outgoingEdges.length === 0) {
            console.log('⚠️ Nó de escolha sem edges, tratando como fim');
            handleEndNode(node);
        } else if (outgoingEdges.length === 1) {
            // ✅ Apenas 1 opção: pular automaticamente para o próximo nó
            console.log('➡️ Apenas 1 opção, pulando automaticamente...');
            const nextNode = state.currentGraph!.nodes.find(n => n.id === outgoingEdges[0].target);
            if (nextNode) {
                navigateToNode(nextNode);
            }
        } else {
            // Múltiplas opções: mostrar escolhas imediatamente
            console.log('🔀 Múltiplas opções, mostrando escolhas');
            showChoicesDuringVideo(outgoingEdges);
        }
    }
}

function finishStitchedEnd(node: GraphNode): void {
    if (state.sessionId) {
        void hlsService.endSession();
    }

    dom.video.pause();
    showEndOverlay(node);
}

function handleEndNode(node: GraphNode): void {
    const videoUrl = (node.data as any).videoUrl;

    // Em modo stitched o vídeo final já foi reproduzido na playlist concatenada
    if (state.stitchedPlaylistUrl && state.virtualTimeline.some(seg => seg.node.id === node.id)) {
        finishStitchedEnd(node);
        return;
    }

    // ✅ Garantir que a sessão (se houver) seja encerrada (ENDLIST) ao chegar no fim.
    if (state.sessionId) {
        void hlsService.endSession();
    }

    if (videoUrl) {
        videoController.playVideo(node);
        dom.video.addEventListener(
            'ended',
            () => {
                showEndOverlay(node);
            },
            { once: true }
        );
    } else {
        dom.video.pause();
        showEndOverlay(node);
    }
}

function updateNodeInfo(): void {
    dom.currentNodeSpan.textContent = state.currentNode?.data.label || '';
    dom.pathHistorySpan.textContent = state.pathHistory
        .map(id => {
            const n = state.currentGraph?.nodes.find(n => n.id === id);
            return n?.data.label || id.slice(0, 8);
        })
        .join(' → ');
}
