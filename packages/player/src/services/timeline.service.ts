import type { GraphNode, VideoSegment } from '../core/types';
import { state } from '../core/state';
import { formatTime } from '../utils/format.utils';
import { dom } from '../ui/dom-elements';

export class TimelineService {
    buildVirtualTimeline(nodePath: GraphNode[]): void {
        console.log(`\n📊 ===== CONSTRUINDO TIMELINE VIRTUAL =====`);

        state.virtualTimeline = [];
        let accumulatedTime = 0;

        for (const node of nodePath) {
            const duration = (node.data as any).duration || 0;

            state.virtualTimeline.push({
                node,
                startTime: accumulatedTime,
                duration,
            });

            console.log(
                `  📹 ${node.data.label}: ${formatTime(accumulatedTime)} - ${formatTime(accumulatedTime + duration)} (${formatTime(duration)})`
            );

            accumulatedTime += duration;
        }

        state.virtualTotalDuration = accumulatedTime;
        state.currentSegmentIndex = 0;

        console.log(`✅ Timeline total: ${formatTime(state.virtualTotalDuration)}`);

        this.updateTimelineUI();
    }

    /**
     * ✅ NOVO: Expandir timeline dinamicamente (estilo Bandersnatch)
     * Adiciona novos vídeos à timeline SEM resetar o que já foi reproduzido
     */
    appendToTimeline(nodePath: GraphNode[]): void {
        console.log(`\n📊 ===== EXPANDINDO TIMELINE =====`);

        if (nodePath.length === 0) return;

        let accumulatedTime = state.virtualTotalDuration;

        for (const node of nodePath) {
            const duration = (node.data as any).duration || 0;

            // Verificar se já existe na timeline
            const alreadyExists = state.virtualTimeline.some(seg => seg.node.id === node.id);
            if (alreadyExists) {
                console.log(`  ⚠️ ${node.data.label} já está na timeline, pulando`);
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

            console.log(
                `  ➕ ${node.data.label}: ${formatTime(accumulatedTime)} - ${formatTime(accumulatedTime + duration)} (${formatTime(duration)})`
            );

            accumulatedTime += duration;
        }

        state.virtualTotalDuration = accumulatedTime;

        console.log(`✅ Timeline expandida para: ${formatTime(state.virtualTotalDuration)}`);

        this.updateTimelineUI();
    }

    /**
     * ✅ NOVO: Atualizar UI da timeline (seekbar, duração total)
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
            console.log(`📹 Avançando para segmento ${state.currentSegmentIndex + 1}/${state.virtualTimeline.length}`);
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

            if (currentTime >= segment.startTime && currentTime < segmentEnd) {
                if (state.currentSegmentIndex !== i) {
                    console.log(`🔄 Segmento atualizado: ${state.currentSegmentIndex + 1} → ${i + 1}`);
                    state.currentSegmentIndex = i;
                    state.currentNode = segment.node;

                    // Atualizar UI
                    dom.currentNodeSpan.textContent = segment.node.data.label;
                }
                return;
            }
        }

        // Se passou do último segmento
        if (currentTime >= state.virtualTotalDuration) {
            state.currentSegmentIndex = state.virtualTimeline.length - 1;
        }
    }

    seekToVirtualTime(virtualTime: number): void {
        console.log(
            `🎯 Seeking para tempo virtual: ${formatTime(virtualTime)} / ${formatTime(state.virtualTotalDuration)}`
        );

        virtualTime = Math.max(0, Math.min(virtualTime, state.virtualTotalDuration));

        if (state.virtualTimeline.length === 0) {
            console.warn('⚠️ Timeline virtual vazia');
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
            console.warn('⚠️ Não foi possível encontrar segmento');
            return;
        }

        const localTime = Math.max(0, virtualTime - targetSegment.startTime);

        console.log(`  Segmento ${targetSegmentIndex}: ${targetSegment.node.data.label}`);
        console.log(`  Tempo local: ${formatTime(localTime)}/${formatTime(targetSegment.duration)}`);

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
    }
}

export const timelineService = new TimelineService();
