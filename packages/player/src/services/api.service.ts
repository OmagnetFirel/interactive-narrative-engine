import axios from 'axios';
import type { InteractiveGraph, GraphNode, StitchedPlaylist } from '../core/types';
import { API_URL } from '../core/config';
import { extractVideoId } from '../utils/format.utils';

export class ApiService {
    async getProjects(): Promise<InteractiveGraph[]> {
        const response = await axios.get(`${API_URL}/api/projects`);
        return response.data.projects;
    }

    async getProject(projectId: string): Promise<InteractiveGraph> {
        const response = await axios.get(`${API_URL}/api/projects/${projectId}`);
        return response.data;
    }

    async preloadStitchedPlaylist(nodePath: GraphNode[]): Promise<StitchedPlaylist | null> {
        console.log(`\n🎬 ===== PRÉ-CARREGANDO PLAYLIST STITCHED =====`);
        console.log(`Caminho: ${nodePath.map((n) => n.data.label).join(' → ')}`);

        try {
            const videoIds: string[] = [];

            for (const node of nodePath) {
                const videoUrl = (node.data as any).videoUrl;

                if (!videoUrl || !videoUrl.trim()) {
                    console.warn(`⚠️ Nó ${node.data.label} não tem videoUrl, pulando`);
                    continue;
                }

                const videoId = extractVideoId(videoUrl);

                if (videoId) {
                    console.log(`  ✅ ${node.data.label} → videoId: ${videoId.slice(0, 8)}...`);
                    videoIds.push(videoId);
                } else {
                    console.error(`  ❌ Não foi possível extrair videoId de: ${videoUrl}`);
                }
            }

            if (videoIds.length === 0) {
                console.error('❌ Nenhum videoId válido encontrado no caminho');
                return null;
            }

            if (videoIds.length === 1) {
                console.log('ℹ️ Apenas 1 vídeo no caminho, não precisa stitching');
                return null;
            }

            console.log(`📦 Solicitando stitching de ${videoIds.length} vídeos...`);

            const response = await axios.post(`${API_URL}/api/playlists/stitch`, {
                nodePath: videoIds,
            });

            const { masterPlaylistUrl } = response.data;
            console.log(`✅ Playlist stitched pré-carregada: ${masterPlaylistUrl}`);

            return {
                url: masterPlaylistUrl,
                path: nodePath,
            };
        } catch (error: any) {
            console.error(
                '❌ Erro ao pré-carregar playlist stitched:',
                error.response?.data || error.message
            );
            return null;
        }
    }
}

export const apiService = new ApiService();
