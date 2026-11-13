import type { GraphNode, VideoSegment } from '../core/types';
import { state } from '../core/state';
import { formatTime } from '../utils/format.utils';
import { dom } from '../ui/dom-elements';
import { hideChoices } from '../ui/overlay.ui';
import { debugLog, logTimelineSegmentChange, logNoSegmentMatch } from '../utils/debug.util';
import { onTimelineBuilt, onTimelineAppended, resetProgressDisplay } from '../ui/progress.ui';

export class TimelineService {
    buildVirtualTimeline(nodePath: GraphNode[]): void {

        state.virtualTimeline = [];
        let accumulatedTime = 0;

        for (const node of nodePath) {
            const duration = Math.max((node.data as any).duration || 0, 0.25);

            state.virtualTimeline.push({
                node,
                startTime: accumulatedTime,
                duration,
            });


            accumulatedTime += duration;
        }

        state.virtualTotalDuration = accumulatedTime;
        state.currentSegmentIndex = 0;

        debugLog('timeline', 'Timeline construída', {
            totalDuration: accumulatedTime,
            segments: state.virtualTimeline.map((s, i) => ({
                i,
                label: s.node.data.label,
                start: s.startTime,
                end: s.startTime + s.duration,
            })),
        });

        this.updateTimelineUI();
        onTimelineBuilt();
    }

    /**
     * ✅ NOVO: Expandir timeline dinamicamente (estilo Bandersnatch)
     * Adiciona novos vídeos à timeline SEM resetar o que já foi reproduzido
     */
    appendToTimeline(nodePath: GraphNode[]): void {

        if (nodePath.length === 0) return;

        let accumulatedTime = state.virtualTotalDuration;

        for (const node of nodePath) {
            const duration = Math.max((node.data as any).duration || 0, 0.25);

            // Verificar se já existe na timeline
            const alreadyExists = state.virtualTimeline.some(seg => seg.node.id === node.id);
            if (alreadyExists) {
                continue;
            }

            state.virtualTimeline.push({
                node,
                startTime: accumulatedTime,
                duration,
            });

            // Adicionar ao stitchedPath também
            if (!state.stitchedPath.find(n => n.id === node.id)) {
                state.stitchedPath.push(node);
            }


            accumulatedTime += duration;
        }

        state.virtualTotalDuration = accumulatedTime;

        debugLog('timeline', 'Timeline expandida', {
            totalDuration: accumulatedTime,
            added: nodePath.map(n => n.data.label),
        });

        this.updateTimelineUI();
        onTimelineAppended();
    }

    /**
     * Atualizar UI da timeline (seekbar, duração total)
     */
    private updateTimelineUI(): void {
        dom.totalTimeSpan.textContent = formatTime(state.virtualTotalDuration);

        // Atualizar duração do vídeo no progress bar se necessário
        if (dom.video.duration && dom.video.duration !== Infinity) {
            // A duração real do vídeo HLS pode ser diferente da virtual
            // Usamos a virtual para a UI
        }
    }

    getVirtualTime(): number {
        if (state.virtualTimeline.length === 0) {
            return 0;
        }

        const videoTime = dom.video.currentTime;

        // ✅ CORREÇÃO: Em modo stitched, o currentTime é CONTÍNUO através dos segmentos
        // Não resetar entre vídeos, então usar diretamente o currentTime
        if (state.stitchedPlaylistUrl && state.stitchedPath.length > 0) {
            // Em playlist stitched, currentTime já é o tempo acumulado total
            return videoTime;
        }

        // ✅ Modo normal (vídeo único): usar segmento atual
        if (state.currentSegmentIndex >= state.virtualTimeline.length) {
            return state.virtualTotalDuration;
        }

        const currentSegment = state.virtualTimeline[state.currentSegmentIndex];
        return currentSegment.startTime + videoTime;
    }

    /**
     * ✅ CORREÇÃO: Atualizar índice do segmento baseado no currentTime real
     */
    advanceToNextSegment(): boolean {
        if (state.currentSegmentIndex < state.virtualTimeline.length - 1) {
            state.currentSegmentIndex++;
            return true;
        }
        return false;
    }

    /**
     * ✅ NOVO: Atualizar segmento atual baseado no tempo real do vídeo (para stitched)
     */
    updateCurrentSegmentByTime(currentTime: number): void {
        if (state.virtualTimeline.length === 0) return;

        // Encontrar qual segmento estamos baseado no tempo acumulado
        for (let i = 0; i < state.virtualTimeline.length; i++) {
            const segment = state.virtualTimeline[i];
            const segmentEnd = segment.startTime + segment.duration;
            const isLast = i === state.virtualTimeline.length - 1;
            const epsilon = 0.2;

            const inSegment = isLast
                ? currentTime >= segment.startTime - epsilon && currentTime <= segmentEnd + epsilon
                : currentTime >= segment.startTime - epsilon && currentTime < segmentEnd;

            if (inSegment) {
                if (state.currentSegmentIndex !== i) {
                    const prevIndex = state.currentSegmentIndex;
                    state.currentSegmentIndex = i;
                    state.currentNode = segment.node;
                    state.hasChosenDuringVideo = false;
                    state.choiceResolvedNodeId = null;
                    state.stitchedPrefetchSegmentIndex = -1;
                    state.stitchedTransitionedFromIndex = -1;

                    if (state.choicesShown) {
                        hideChoices();
                    }
                    state.choicesShown = false;

                    logTimelineSegmentChange(prevIndex, i, currentTime);
                }
                return;
            }
        }

        if (currentTime >= state.virtualTotalDuration) {
            state.currentSegmentIndex = state.virtualTimeline.length - 1;
        } else {
            logNoSegmentMatch(currentTime);
        }
    }

    seekToVirtualTime(virtualTime: number): void {

        virtualTime = Math.max(0, Math.min(virtualTime, state.virtualTotalDuration));

        if (state.virtualTimeline.length === 0) {
            return;
        }

        let targetSegment: VideoSegment | null = null;
        let targetSegmentIndex = 0;

        for (let i = 0; i < state.virtualTimeline.length; i++) {
            const segment = state.virtualTimeline[i];
            const segmentEnd = segment.startTime + segment.duration;

            if (virtualTime >= segment.startTime && virtualTime <= segmentEnd) {
                targetSegment = segment;
                targetSegmentIndex = i;
                break;
            }
        }

        if (!targetSegment && state.virtualTimeline.length > 0) {
            targetSegmentIndex = state.virtualTimeline.length - 1;
            targetSegment = state.virtualTimeline[targetSegmentIndex];
        }

        if (!targetSegment) {
            return;
        }

        const localTime = Math.max(0, virtualTime - targetSegment.startTime);


        if (targetSegmentIndex === state.currentSegmentIndex) {
            dom.video.currentTime = Math.min(localTime, targetSegment.duration);
        } else {
            state.isSeekingVirtual = true;
            state.currentSegmentIndex = targetSegmentIndex;

            import('../controllers/navigation.controller').then(({ navigateToNode }) => {
                navigateToNode(targetSegment!.node, localTime);
            });
        }
    }

    resetTimeline() {
        state.virtualTimeline = [];
        state.currentSegmentIndex = 0;
        state.virtualTotalDuration = 0;
        resetProgressDisplay();
    }
}

export const timelineService = new TimelineService();
