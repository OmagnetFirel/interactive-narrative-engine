import { state } from '../core/state';
import { formatTime } from '../utils/format.utils';
import { dom } from './dom-elements';
import { timelineService } from '../services/timeline.service';

/** Janela mínima à frente do playhead (efeito “ao vivo”). */
const LIVE_LOOKAHEAD_SEC = 2;

let displayTotalDuration = 0;
let rafId: number | null = null;
let lastTickMs = 0;

/**
 * Reinicia o indicador ao montar uma timeline nova (não em append).
 */
export function resetProgressDisplay(): void {
    displayTotalDuration = 0;
    lastTickMs = 0;

    dom.progressAvailable.style.width = '0%';
    dom.progressFilled.style.width = '0%';
    dom.progressHandle.style.left = '0%';
}

/**
 * Chamado após buildVirtualTimeline — mostra só o primeiro trecho, não o caminho inteiro.
 */
export function onTimelineBuilt(): void {
    const first = state.virtualTimeline[0];
    displayTotalDuration = first ? first.startTime + first.duration : 0;
    lastTickMs = 0;
}

/**
 * Chamado após appendToTimeline — não altera displayTotal (cresce suavemente durante playback).
 */
export function onTimelineAppended(): void {
    lastTickMs = 0;
}

export function startProgressLoop(): void {
    if (rafId !== null) return;
    lastTickMs = 0;
    rafId = requestAnimationFrame(tickProgress);
}

export function stopProgressLoop(): void {
    if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    lastTickMs = 0;
}

function tickProgress(now: number): void {
    rafId = requestAnimationFrame(tickProgress);

    if (state.isSeekingVirtual) return;

    const dt = lastTickMs > 0 ? (now - lastTickMs) / 1000 : 0;
    lastTickMs = now;

    const virtualTime = timelineService.getVirtualTime();
    const targetTotal = state.virtualTotalDuration;

    if (targetTotal <= 0) {
        dom.progressAvailable.style.width = '0%';
        dom.progressFilled.style.width = '0%';
        dom.progressHandle.style.left = '0%';
        dom.currentTimeSpan.textContent = formatTime(0);
        dom.totalTimeSpan.textContent = formatTime(0);
        dom.virtualTimeSpan.textContent = `${formatTime(0)} / ${formatTime(0)}`;
        return;
    }

    if (displayTotalDuration <= 0) {
        const first = state.virtualTimeline[0];
        displayTotalDuration = first ? first.startTime + first.duration : targetTotal;
    }

    // Borda “ao vivo” avança no ritmo do vídeo enquanto há conteúdo a revelar
    if (!dom.video.paused && dt > 0 && displayTotalDuration < targetTotal) {
        displayTotalDuration = Math.min(
            targetTotal,
            displayTotalDuration + dt * dom.video.playbackRate
        );
    }

    // Mantém um colchão à frente do playhead sem saltos
    displayTotalDuration = Math.max(
        displayTotalDuration,
        Math.min(targetTotal, virtualTime + LIVE_LOOKAHEAD_SEC)
    );
    displayTotalDuration = Math.min(displayTotalDuration, targetTotal);

    const playedPercent = (virtualTime / displayTotalDuration) * 100;
    const availablePercent = (displayTotalDuration / targetTotal) * 100;
    const clampedPlayed = Math.min(Math.max(playedPercent, 0), 100);

    dom.progressAvailable.style.width = `${availablePercent}%`;
    dom.progressFilled.style.width = `${clampedPlayed}%`;
    dom.progressHandle.style.left = `${clampedPlayed}%`;

    dom.currentTimeSpan.textContent = formatTime(virtualTime);
    dom.totalTimeSpan.textContent = formatTime(displayTotalDuration);
    dom.virtualTimeSpan.textContent = `${formatTime(virtualTime)} / ${formatTime(displayTotalDuration)}`;
}

/** Compatível com timeupdate — o loop rAF já atualiza a UI. */
export function updateVirtualProgress(): void {
    // noop: mantido para não quebrar imports; o rAF faz o trabalho
}
