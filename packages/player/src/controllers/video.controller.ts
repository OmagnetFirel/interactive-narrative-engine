import { state } from '../core/state';
import { hlsService } from '../services/hls.service';
import { transitionService } from '../services/transition.service';
import { preloadService } from '../services/preload.service';
import type { GraphNode } from '@ine/shared';

export const videoController = {
    async playVideo(node: GraphNode, seekToTime?: number, withTransition: boolean = true) {
        const videoUrl = (node.data as any).videoUrl;

        if (!videoUrl) {
            console.warn('⚠️ Nó sem videoUrl');
            return;
        }

        console.log(`▶️ Reproduzindo: ${node.data.label}`);

        try {
            if (withTransition && seekToTime === undefined) {
                await transitionService.transition(async () => {
                    await hlsService.loadVideo(videoUrl, seekToTime);
                });
            } else {
                await hlsService.loadVideo(videoUrl, seekToTime);
            }

            await this.preloadNextChoices(node);
        } catch (error) {
            console.error('❌ Erro ao reproduzir vídeo:', error);
        }
    },

    async preloadNextChoices(node: GraphNode): Promise<void> {
        if (!state.currentGraph) return;

        const outgoingEdges = state.currentGraph.edges.filter(
            edge => edge.source === node.id
        );

        if (outgoingEdges.length === 0) return;

        const nextNodes = outgoingEdges
            .map(edge => state.currentGraph!.nodes.find(n => n.id === edge.target))
            .filter(n => n !== undefined) as GraphNode[];

        const choicesToPreload = nextNodes.map(nextNode => ({
            nextNodeId: nextNode.id,
            videoUrl: (nextNode.data as any).videoUrl
        })).filter(choice => choice.videoUrl);

        if (choicesToPreload.length > 0) {
            preloadService.preloadChoices(choicesToPreload).catch(err => {
                console.warn('⚠️ Erro ao precarregar escolhas:', err);
            });
        }
    }
};
