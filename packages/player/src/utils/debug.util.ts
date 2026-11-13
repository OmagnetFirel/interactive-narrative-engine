import { state } from '../core/state';
import { dom } from '../ui/dom-elements';
import { formatTime } from './format.utils';

const PREFIX = '[Player]';

/** Ative com `localStorage.setItem('playerDebug', '1')` ou `?debug=1` na URL */
export function isPlayerDebugEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        if (new URLSearchParams(window.location.search).get('debug') === '1') return true;
        return localStorage.getItem('playerDebug') === '1';
    } catch {
        return false;
    }
}

export function debugLog(category: string, message: string, data?: Record<string, unknown>): void {
    if (!isPlayerDebugEnabled()) return;

    const label = `${PREFIX}[${category}]`;
    if (data !== undefined) {
        console.log(label, message, data);
    } else {
        console.log(label, message);
    }
}

export function debugWarn(category: string, message: string, data?: Record<string, unknown>): void {
    if (!isPlayerDebugEnabled()) return;

    const label = `${PREFIX}[${category}]`;
    if (data !== undefined) {
        console.warn(label, message, data);
    } else {
        console.warn(label, message);
    }
}

export function logVideoElement(context: string): void {
    if (!isPlayerDebugEnabled()) return;

    const v = dom.video;
    const buffered: string[] = [];
    for (let i = 0; i < v.buffered.length; i++) {
        buffered.push(`${v.buffered.start(i).toFixed(2)}–${v.buffered.end(i).toFixed(2)}`);
    }

    debugLog('video', context, {
        currentTime: Number(v.currentTime.toFixed(3)),
        duration: Number.isFinite(v.duration) ? Number(v.duration.toFixed(3)) : v.duration,
        paused: v.paused,
        ended: v.ended,
        readyState: v.readyState,
        buffered: buffered.join(', ') || '(vazio)',
    });
}

export function logPlayerState(context: string): void {
    if (!isPlayerDebugEnabled()) return;

    const segments = state.virtualTimeline.map((seg, i) => ({
        idx: i,
        nodeId: seg.node.id,
        label: seg.node.data.label,
        type: seg.node.type,
        start: Number(seg.startTime.toFixed(2)),
        end: Number((seg.startTime + seg.duration).toFixed(2)),
        metaDuration: seg.duration,
        active: i === state.currentSegmentIndex,
    }));

    debugLog('state', context, {
        currentNodeId: state.currentNode?.id,
        currentNodeLabel: state.currentNode?.data.label,
        currentNodeType: state.currentNode?.type,
        currentSegmentIndex: state.currentSegmentIndex,
        virtualTotalDuration: Number(state.virtualTotalDuration.toFixed(2)),
        choicesShown: state.choicesShown,
        hasChosenDuringVideo: state.hasChosenDuringVideo,
        sessionId: state.sessionId,
        stitchedPlaylistUrl: state.stitchedPlaylistUrl,
        sessionFinalizeRequested: state.sessionFinalizeRequested,
        stitchedPathLabels: state.stitchedPath.map(n => n.data.label),
        segments,
    });
}

export function logTimelineSegmentChange(
    fromIndex: number,
    toIndex: number,
    currentTime: number
): void {
    if (!isPlayerDebugEnabled()) return;

    const from = state.virtualTimeline[fromIndex];
    const to = state.virtualTimeline[toIndex];

    debugLog('segment', `Troca de segmento ${fromIndex + 1} → ${toIndex + 1}`, {
        videoTime: Number(currentTime.toFixed(3)),
        from: from
            ? { id: from.node.id, label: from.node.data.label, range: `${formatTime(from.startTime)}–${formatTime(from.startTime + from.duration)}` }
            : null,
        to: to
            ? { id: to.node.id, label: to.node.type, labelText: to.node.data.label, range: `${formatTime(to.startTime)}–${formatTime(to.startTime + to.duration)}` }
            : null,
    });

    logVideoElement('após troca de segmento');
    logPlayerState('após troca de segmento');
}

export function logNoSegmentMatch(currentTime: number): void {
    if (!isPlayerDebugEnabled()) return;

    debugWarn('segment', `Tempo ${currentTime.toFixed(3)}s não encaixa em nenhum segmento`, {
        virtualTotal: state.virtualTotalDuration,
        segments: state.virtualTimeline.map((s, i) => ({
            i,
            label: s.node.data.label,
            start: s.startTime,
            end: s.startTime + s.duration,
        })),
    });
}
