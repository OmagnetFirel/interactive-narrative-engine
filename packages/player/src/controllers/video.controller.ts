import { state } from '../core/state';
import { hlsService } from '../services/hls.service';
import { transitionService } from '../services/transition.service';
import { timelineService } from '../services/timeline.service';
import { preloadService } from '../services/preload.service';
import { analytics } from '../services/analytics.service';
import { dom } from '../ui/dom-elements';
import { showEndOverlay } from '../ui/overlay.ui';
import type { GraphNode } from '@ine/shared';

// ✅ Callback para evitar dependência circular
let navigateToNodeCallback: ((node: GraphNode) => void) | null = null;

export function setNavigateCallback(callback: (node: GraphNode) => void) {
    navigateToNodeCallback = callback;
}

export const videoController = {
    /**
     * ✅ Reproduzir vídeo com transição e preloading
     */
    async playVideo(node: GraphNode, seekToTime?: number, withTransition: boolean = true) {
        const videoUrl = (node.data as any).videoUrl;

        if (!videoUrl) {
            console.warn('⚠️ Nó sem videoUrl');
            return;
        }

        console.log(`▶️ Reproduzindo: ${node.data.label}`);

        try {
            // ✅ Rastrear analytics
            analytics.track({
                type: 'play',
                nodeId: node.id,
                metadata: {
                    label: node.data.label,
                    seekToTime
                }
            });

            if (withTransition && seekToTime === undefined) {
                await transitionService.transition(async () => {
                    await hlsService.loadVideo(videoUrl, seekToTime, node.id);
                });
            } else {
                await hlsService.loadVideo(videoUrl, seekToTime, node.id);
            }

            // ✅ Precarregar próximas escolhas
            await this.preloadNextChoices(node);

        } catch (error) {
            console.error('❌ Erro ao reproduzir vídeo:', error);

            // ✅ Rastrear erro
            analytics.track({
                type: 'error',
                nodeId: node.id,
                errorMessage: (error as Error).message
            });
        }
    },

    /**
     * ✅ Precarregar próximas escolhas possíveis
     */
    async preloadNextChoices(node: GraphNode): Promise<void> {
        if (!state.currentGraph) return;

        // Buscar edges que saem do nó atual
        const outgoingEdges = state.currentGraph.edges.filter(
            edge => edge.source === node.id
        );

        if (outgoingEdges.length === 0) return;

        // Buscar nós destino
        const nextNodes = outgoingEdges
            .map(edge => state.currentGraph!.nodes.find(n => n.id === edge.target))
            .filter(n => n !== undefined) as GraphNode[];

        // Preparar para preload
        const choicesToPreload = nextNodes.map(nextNode => ({
            nextNodeId: nextNode.id,
            videoUrl: (nextNode.data as any).videoUrl
        })).filter(choice => choice.videoUrl);

        if (choicesToPreload.length > 0) {
            // Precarregar em background (não bloqueia)
            preloadService.preloadChoices(choicesToPreload).catch(err => {
                console.warn('⚠️ Erro ao precarregar escolhas:', err);
            });
        }
    },

    /**
     * Handler de vídeo terminado
     */
    handleVideoEnded() {
        console.log(`\n🏁 ===== VÍDEO TERMINOU =====`);

        // ✅ Rastrear fim do vídeo
        analytics.track({
            type: 'ended',
            nodeId: state.currentNode?.id
        });

        // Se tem playlist stitched, avançar segmento
        if (state.stitchedPath.length > 0) {
            const hasNext = timelineService.advanceToNextSegment();

            if (hasNext) {
                const nextSegment = state.virtualTimeline[state.currentSegmentIndex];
                state.currentNode = nextSegment.node;

                console.log(`📹 Próximo segmento: ${nextSegment.node.data.label}`);

                // Atualizar UI
                dom.currentNodeSpan.textContent = nextSegment.node.data.label;

                return;
            } else {
                console.log('✅ Playlist stitched concluída');
                timelineService.resetTimeline();
                state.stitchedPath = [];
                state.stitchedPlaylistUrl = null;
            }
        }

        // Se tem próximo nó enfileirado
        if (state.nextNodeQueued) {
            const nodeToGo = state.nextNodeQueued;
            state.nextNodeQueued = null;

            if (navigateToNodeCallback) {
                navigateToNodeCallback(nodeToGo);
            }
            return;
        }

        // Processar próximo nó normalmente
        const outgoingEdges = state.currentGraph?.edges.filter(
            edge => edge.source === state.currentNode?.id
        ) || [];

        if (outgoingEdges.length === 0) {
            this.handleEndNode(state.currentNode!);
        } else if (outgoingEdges.length === 1) {
            const nextNode = state.currentGraph?.nodes.find(
                n => n.id === outgoingEdges[0].target
            );

            if (nextNode && navigateToNodeCallback) {
                navigateToNodeCallback(nextNode);
            }
        }
    },

    handleEndNode(node: GraphNode) {
        const videoUrl = (node.data as any).videoUrl;

        if (videoUrl) {
            this.playVideo(node);
            dom.video.addEventListener('ended', () => {
                showEndOverlay(node);
            }, { once: true });
        } else {
            dom.video.pause();
            showEndOverlay(node);
        }
    }
};
