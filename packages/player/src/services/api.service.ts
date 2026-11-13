import axios from 'axios';
import type { InteractiveGraph, GraphNode, StitchedPlaylist } from '../core/types';
import { API_URL } from '../core/config';
import { extractVideoId } from '../utils/format.utils';

export class ApiService {
    private shareToken: string | null = null;

    async getProjectByShareToken(token: string): Promise<InteractiveGraph> {
        const response = await axios.get(`${API_URL}/api/projects/share/${encodeURIComponent(token)}`);
        this.shareToken = token;
        return response.data;
    }

    /**
     * ✅ Criar uma sessão de playback (URL estável, EVENT) a partir de videoIds.
     */
    async createSession(videoIds: string[]): Promise<{ sessionId: string; masterPlaylistUrl: string } | null> {
        if (videoIds.length === 0) return null;
        try {
            const response = await axios.post(`${API_URL}/api/sessions`, { nodePath: videoIds, shareToken: this.shareToken });
            return {
                sessionId: response.data.sessionId,
                masterPlaylistUrl: response.data.masterPlaylistUrl,
            };
        } catch (error: any) {
            console.error('❌ Erro ao criar sessão:', error.response?.data || error.message);
            return null;
        }
    }

    /**
     * ✅ Anexar vídeos a uma sessão existente (seamless, sem reload no player).
     * Lança em erro de rede; retorna o status HTTP para o chamador decidir fallback.
     */
    async appendToSession(sessionId: string, videoIds: string[]): Promise<{ ok: boolean; status: number }> {
        try {
            await axios.post(`${API_URL}/api/sessions/${sessionId}/append`, { nodePath: videoIds, shareToken: this.shareToken });
            return { ok: true, status: 200 };
        } catch (error: any) {
            const status = error.response?.status ?? 0;
            return { ok: false, status };
        }
    }

    /**
     * ✅ Encerrar a sessão (escreve ENDLIST). Best-effort.
     */
    async endSession(sessionId: string): Promise<void> {
        try {
            await axios.post(`${API_URL}/api/sessions/${sessionId}/end`, { shareToken: this.shareToken });
        } catch (error: any) {
        }
    }

    async stitchVideoIds(videoIds: string[]): Promise<string | null> {
        if (videoIds.length < 2 || !this.shareToken) return null;
        try {
            const response = await axios.post(`${API_URL}/api/playlists/stitch`, {
                nodePath: videoIds,
                shareToken: this.shareToken,
            });
            return response.data.masterPlaylistUrl;
        } catch (error: any) {
            console.error('❌ Erro ao criar playlist stitched:', error.response?.data || error.message);
            return null;
        }
    }

    async preloadStitchedPlaylist(nodePath: GraphNode[]): Promise<StitchedPlaylist | null> {

        try {
            const videoIds: string[] = [];

            for (const node of nodePath) {
                const videoUrl = (node.data as any).videoUrl;

                if (!videoUrl || !videoUrl.trim()) {
                    continue;
                }

                const videoId = extractVideoId(videoUrl);

                if (videoId) {
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
                return null;
            }


            const masterPlaylistUrl = await this.stitchVideoIds(videoIds);
            if (!masterPlaylistUrl) return null;

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
