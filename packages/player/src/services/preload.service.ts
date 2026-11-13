import Hls from 'hls.js';
import { HLS_CONFIG } from '../core/config';

interface PreloadedVideo {
    hls: Hls;
    videoElement: HTMLVideoElement;
    buffered: boolean;
    url: string;
}

interface PreloadCache {
    [videoId: string]: PreloadedVideo;
}

class PreloadService {
    private cache: PreloadCache = {};
    private readonly MAX_CACHE_SIZE = 3;
    private readonly PRELOAD_BUFFER_TIME = 3; // segundos de buffer inicial

    /**
     * Precarregar vídeo em background
     */
    async preload(videoUrl: string, videoId: string): Promise<void> {
        // Se já está em cache, não fazer nada
        if (this.cache[videoId]) {
            return;
        }


        try {
            // Criar elemento de vídeo oculto
            const tempVideo = document.createElement('video');
            tempVideo.muted = true;
            tempVideo.preload = 'auto';
            tempVideo.style.display = 'none';
            tempVideo.setAttribute('data-preload-id', videoId);
            document.body.appendChild(tempVideo);

            // Criar instância HLS com config otimizada para preload
            const hls = new Hls({
                ...HLS_CONFIG,
                maxBufferLength: 10, // Buffer menor para preload
                maxMaxBufferLength: 15,
                startLevel: 0 // Começar com qualidade mais baixa
            });

            // Carregar vídeo
            hls.loadSource(videoUrl);
            hls.attachMedia(tempVideo);

            // Aguardar manifest e iniciar buffering
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout ao precarregar'));
                }, 10000);

                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    clearTimeout(timeout);

                    // Iniciar playback silencioso para buffer
                    tempVideo.play().then(() => {
                        // Aguardar buffer inicial
                        setTimeout(() => {
                            tempVideo.pause();
                            resolve();
                        }, this.PRELOAD_BUFFER_TIME * 1000);
                    }).catch(reject);
                });

                hls.on(Hls.Events.ERROR, (_event, data) => {
                    if (data.fatal) {
                        clearTimeout(timeout);
                        reject(new Error(`Erro ao precarregar: ${data.details}`));
                    }
                });
            });

            // Adicionar ao cache
            this.cache[videoId] = {
                hls,
                videoElement: tempVideo,
                buffered: true,
                url: videoUrl
            };


            // Limpar cache antigo se necessário
            this.cleanupOldCache();

        } catch (error) {
            console.error(`❌ Erro ao precarregar vídeo ${videoId}:`, error);
            // Limpar recursos em caso de erro
            this.remove(videoId);
        }
    }

    /**
     * Obter vídeo precarregado
     */
    getPreloaded(videoId: string): Hls | null {
        const cached = this.cache[videoId];

        if (cached) {
            return cached.hls;
        }

        return null;
    }

    /**
     * Transferir vídeo precarregado para elemento principal
     */
    transferToMainVideo(videoId: string, targetVideo: HTMLVideoElement): Hls | null {
        const cached = this.cache[videoId];

        if (!cached) {
            return null;
        }


        try {
            // Detach do elemento temporário
            cached.hls.detachMedia();

            // Attach no elemento principal
            cached.hls.attachMedia(targetVideo);

            // Remover elemento temporário
            cached.videoElement.remove();

            // Remover do cache (já está em uso)
            delete this.cache[videoId];

            return cached.hls;

        } catch (error) {
            console.error(`❌ Erro ao transferir vídeo precarregado:`, error);
            return null;
        }
    }

    /**
     * Remover vídeo específico do cache
     */
    remove(videoId: string): void {
        const cached = this.cache[videoId];

        if (cached) {
            cached.hls.destroy();
            cached.videoElement.remove();
            delete this.cache[videoId];
        }
    }

    /**
     * Limpar cache antigo (FIFO)
     */
    private cleanupOldCache(): void {
        const keys = Object.keys(this.cache);

        while (keys.length > this.MAX_CACHE_SIZE) {
            const oldest = keys.shift()!;
            this.remove(oldest);
        }
    }

    /**
     * Limpar todo o cache
     */
    clearAll(): void {

        for (const videoId of Object.keys(this.cache)) {
            this.remove(videoId);
        }
    }

    /**
     * Obter status do cache
     */
    getCacheStatus() {
        return {
            size: Object.keys(this.cache).length,
            maxSize: this.MAX_CACHE_SIZE,
            videos: Object.keys(this.cache).map(id => ({
                id,
                url: this.cache[id].url,
                buffered: this.cache[id].buffered
            }))
        };
    }

    /**
     * Precarregar próximas escolhas de um nó
     */
    async preloadChoices(choices: Array<{ nextNodeId: string; videoUrl: string }>): Promise<void> {

        // Precarregar em paralelo (com limite)
        const preloadPromises = choices.slice(0, this.MAX_CACHE_SIZE).map(choice =>
            this.preload(choice.videoUrl, choice.nextNodeId).catch(() => { })
        );

        await Promise.all(preloadPromises);
    }
}

export const preloadService = new PreloadService();
