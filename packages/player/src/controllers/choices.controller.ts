import type { GraphEdge, GraphNode } from '../core/types';
import { state } from '../core/state';
import { dom } from '../ui/dom-elements';
import { hideChoices } from '../ui/overlay.ui';
import { timelineService } from '../services/timeline.service';
import { hlsService } from '../services/hls.service';
import { calculateVideoPathUntilBranch } from '../utils/path.utils';
import { debugLog, logPlayerState, logVideoElement } from '../utils/debug.util';
import { CHOICE_PAUSE_LEAD_SEC } from '../core/config';

export function showChoicesDuringVideo(edges: GraphEdge[], decisionNode?: GraphNode): void {
    if (edges.length <= 1) return;

    const node = decisionNode ?? state.currentNode;
    if (!node) return;

    if (state.hasChosenDuringVideo && state.choiceResolvedNodeId === node.id) {
        return;
    }

    state.choicesShown = true;
    state.currentNode = node;

    let referenceEnd = dom.video.duration;
    let segmentInfo: Record<string, unknown> = {};
    if (state.stitchedPlaylistUrl && state.virtualTimeline.length > 0) {
        const segment = state.virtualTimeline[state.currentSegmentIndex];
        if (segment) {
            referenceEnd = segment.startTime + segment.duration;
            segmentInfo = {
                segmentIndex: state.currentSegmentIndex,
                segmentLabel: segment.node.data.label,
                segmentStart: segment.startTime,
                segmentMetaDuration: segment.duration,
            };
        }
    }

    debugLog('choice', 'Exibindo overlay de escolhas', {
        options: edges.map(e => ({ id: e.id, label: e.label, target: e.target })),
        currentTime: Number(dom.video.currentTime.toFixed(3)),
        referenceEnd: Number(referenceEnd.toFixed(3)),
        timeRemaining: Number((referenceEnd - dom.video.currentTime).toFixed(3)),
        ...segmentInfo,
    });
    logPlayerState('antes das escolhas');

    dom.choicesButtons.innerHTML = '';

    edges.forEach((edge) => {
        const button = document.createElement('button');
        button.className = 'choice-button';
        button.textContent = edge.label || edge.data?.label || 'Continuar';
        button.addEventListener('click', () => handleChoiceDuringVideo(edge));
        dom.choicesButtons.appendChild(button);
    });

    dom.choicesTitle.textContent = 'Faça sua escolha:';
    dom.choicesOverlay.classList.remove('hidden');

    // Barra apenas visual: mostra quanto falta até o vídeo pausar esperando a escolha.
    // Não existe escolha automática.
    const timeUntilPause = referenceEnd - CHOICE_PAUSE_LEAD_SEC - dom.video.currentTime;
    if (timeUntilPause > 0.5) {
        startCountdownBar(timeUntilPause);
    }
}

function startCountdownBar(seconds: number): void {
    dom.timeoutBar.classList.remove('hidden');
    dom.timeoutProgress.style.transition = 'none';
    dom.timeoutProgress.style.width = '100%';

    setTimeout(() => {
        dom.timeoutProgress.style.transition = `width ${seconds}s linear`;
        dom.timeoutProgress.style.width = '0%';
    }, 50);
}

/**
 * ✅ NOVO: Estilo Netflix Bandersnatch - expandir timeline sem interrupção
 */
async function handleChoiceDuringVideo(edge: GraphEdge): Promise<void> {
    debugLog('choice', 'Escolha confirmada', {
        edgeId: edge.id,
        label: edge.label,
        target: edge.target,
        fromNodeId: state.currentNode?.id,
        fromNodeLabel: state.currentNode?.data.label,
        videoTime: Number(dom.video.currentTime.toFixed(3)),
        sessionId: state.sessionId,
    });
    logVideoElement('no clique da escolha');
    logPlayerState('no clique da escolha');

    state.hasChosenDuringVideo = true;
    state.choiceResolvedNodeId = state.currentNode?.id ?? edge.source;
    state.choicesShown = false;
    hideChoices();

    // Se o vídeo estava parado esperando a decisão, ele volta a tocar após anexar o trecho escolhido.
    const wasWaiting = state.waitingForChoice;
    state.waitingForChoice = false;

    // Limpar timeout se existir
    if (state.timeoutId) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
    }

    const nextNode = state.currentGraph!.nodes.find(n => n.id === edge.target);

    if (!nextNode) {
        debugLog('choice', 'ERRO: nó alvo não encontrado', { target: edge.target });
        return;
    }

    const pathFromChoice = calculateVideoPathUntilBranch(nextNode);

    debugLog('choice', 'Caminho calculado após escolha', {
        targetNode: { id: nextNode.id, label: nextNode.data.label, type: nextNode.type },
        pathLabels: pathFromChoice.map(n => n.data.label),
        pathNodeIds: pathFromChoice.map(n => n.id),
        pathLength: pathFromChoice.length,
    });

    if (pathFromChoice.length === 0) {
        debugLog('choice', 'AVISO: nenhum vídeo no caminho escolhido');
        if (wasWaiting) await dom.video.play().catch(() => { });
        return;
    }

    timelineService.appendToTimeline(pathFromChoice);

    const appendOk = await hlsService.appendToCurrentPlaylist(pathFromChoice);

    if (!appendOk) {
        debugLog('choice', 'Append seamless falhou — tentando fallback stitched');
        const rebuilt = await hlsService.fallbackRebuildStitchedPlaylist();
        if (!rebuilt) {
            console.error('❌ Não foi possível anexar o vídeo escolhido. Tente re-transcodificar os vídeos.');
        }
    } else {
        debugLog('choice', 'Append seamless OK — reprodução continua sem trocar fonte');
    }

    debugLog('choice', 'Append HLS concluído', {
        success: appendOk,
        sessionId: state.sessionId,
        newVirtualTotal: state.virtualTotalDuration,
        segmentCount: state.virtualTimeline.length,
    });
    logVideoElement('após append HLS');
    logPlayerState('após append HLS');

    state.nextNodeQueued = nextNode;

    if (wasWaiting && !state.playbackFinished) {
        await dom.video.play().catch(() => { });
    }
}
