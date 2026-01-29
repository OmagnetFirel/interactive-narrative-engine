import Hls from 'hls.js';
import { HLS_CONFIG, HLS_STITCHED_CONFIG, API_URL } from '../core/config';
import { dom } from '../ui/dom-elements';
import { retryWithBackoff } from '../utils/retry.utils';
import { analytics } from './analytics.service';
import type { GraphNode } from '../core/types';

export class HlsService {
    private hls: Hls | null = null;
    private recoveryAttempts = 0;
    private readonly MAX_RECOVERY_ATTEMPTS = 3;
    private bufferMonitorInterval: number | null = null;
    private currentNodeId?: string;

    // ✅ NOVO: Callback para fallback quando stitching falhar
    private onStitchingFailed?: () => void;

    init() {
        if (Hls.isSupported()) {
            this.createHlsInstance();
        }

        // Iniciar monitoramento de buffer
        this.startBufferMonitoring();

        // Cleanup ao fechar janela
        window.addEventListener('beforeunload', () => this.destroy());
    }

    /**
     * ✅ Criar instância HLS com error boundary
     */
    private createHlsInstance(): Hls {
        if (this.hls) {
            this.hls.destroy();
        }

        this.hls = new Hls(HLS_CONFIG);
        this.hls.attachMedia(dom.video);
        this.setupErrorBoundary();
        this.setupEventListeners();

        return this.hls;
    }

    /**
     * ✅ ERROR BOUNDARY - Tratamento robusto de erros
     */
    private setupErrorBoundary(): void {
        if (!this.hls) return;

        this.hls.on(Hls.Events.ERROR, (_event, data) => {
            // ✅ NOVO: Não logar erros não-fatais de buffer repetidamente
            if (data.details === 'bufferStalledError' || data.details === 'bufferSeekOverHole') {
                // Tratamento silencioso
            } else {
                console.error('❌ Erro HLS:', data.type, data.details);
            }

            // ✅ Tratamento específico para bufferSeekOverHole
            if (data.details === 'bufferSeekOverHole') {
                this.fixBufferGap();
                return;
            }

            // ✅ Tratamento específico para bufferStalledError
            if (data.details === 'bufferStalledError') {
                // ✅ Se estiver fazendo seek, ignorar
                if (dom.video.seeking) {
                    return;
                }

                // ✅ Tentar corrigir gap no buffer
                if (this.fixBufferGap()) {
                    return; // Corrigido, não precisa fazer mais nada
                }

                // Se não conseguiu corrigir, deixar HLS.js tentar
                return;
            }

            // ✅ CRÍTICO: Tratamento para bufferAppendError (codecs incompatíveis)
            if (data.details === 'bufferAppendError') {
                console.error('⚠️ bufferAppendError: Vídeos com codecs/formatos incompatíveis');
                console.error('💡 Solução: Re-transcodifique todos os vídeos com as mesmas configurações');

                if (this.onStitchingFailed) {
                    console.log('🔄 Ativando fallback para reprodução individual...');
                    const fallbackFn = this.onStitchingFailed;
                    this.onStitchingFailed = undefined;
                    fallbackFn();
                    return;
                }

                if (this.recoveryAttempts < this.MAX_RECOVERY_ATTEMPTS) {
                    this.hls?.recoverMediaError();
                    this.recoveryAttempts++;
                }
                return;
            }

            // Rastrear erro no analytics
            analytics.track({
                type: 'error',
                errorCode: data.details,
                errorMessage: data.error?.message,
                nodeId: this.currentNodeId,
                metadata: {
                    fatal: data.fatal,
                    type: data.type,
                    level: data.level
                }
            });

            if (data.fatal) {
                this.handleFatalError(data);
            }
        });

        // Reset recovery counter on successful playback
        this.hls.on(Hls.Events.FRAG_LOADED, () => {
            this.recoveryAttempts = 0;
        });

        // ✅ NOVO: Corrigir gap automaticamente quando buffer é atualizado
        this.hls.on(Hls.Events.BUFFER_APPENDED, () => {
            // Verificar se currentTime está antes do buffer
            if (dom.video.buffered.length > 0 && !dom.video.seeking && !dom.video.paused) {
                const bufferStart = dom.video.buffered.start(0);
                const currentTime = dom.video.currentTime;

                if (currentTime < bufferStart && bufferStart - currentTime < 1.0) {
                    console.log(`🔄 Auto-fix: currentTime ${currentTime.toFixed(3)}s → ${bufferStart.toFixed(3)}s`);
                    dom.video.currentTime = bufferStart;
                }
            }
        });
    }

    /**
     * ✅ NOVO: Corrigir gaps no buffer automaticamente
     */
    private fixBufferGap(): boolean {
        if (dom.video.buffered.length === 0) return false;

        const currentTime = dom.video.currentTime;
        const bufferStart = dom.video.buffered.start(0);
        const bufferEnd = dom.video.buffered.end(dom.video.buffered.length - 1);

        // Caso 1: currentTime está ANTES do buffer (gap inicial)
        if (currentTime < bufferStart && bufferStart - currentTime < 2.0) {
            console.log(`🔄 Corrigindo gap inicial: ${currentTime.toFixed(3)}s → ${bufferStart.toFixed(3)}s`);
            dom.video.currentTime = bufferStart + 0.01; // Pequeno offset para garantir
            return true;
        }

        // Caso 2: currentTime está em um "buraco" entre ranges de buffer
        for (let i = 0; i < dom.video.buffered.length - 1; i++) {
            const rangeEnd = dom.video.buffered.end(i);
            const nextRangeStart = dom.video.buffered.start(i + 1);

            if (currentTime >= rangeEnd && currentTime < nextRangeStart) {
                console.log(`🔄 Corrigindo gap no meio: ${currentTime.toFixed(3)}s → ${nextRangeStart.toFixed(3)}s`);
                dom.video.currentTime = nextRangeStart + 0.01;
                return true;
            }
        }

        // Caso 3: currentTime está DEPOIS do buffer (ficou para trás)
        if (currentTime > bufferEnd) {
            console.log(`🔄 currentTime além do buffer, voltando para ${bufferEnd.toFixed(3)}s`);
            dom.video.currentTime = bufferEnd - 0.5;
            return true;
        }

        return false;
    }

    /**
     * ✅ Event listeners para analytics e debug
     */
    private setupEventListeners(): void {
        if (!this.hls) return;

        // Rastrear mudanças de qualidade
        this.hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
            const level = this.hls!.levels[data.level];
            console.log(`📊 Qualidade alterada: ${level.height}p`);

            analytics.track({
                type: 'quality_change',
                quality: `${level.height}p`,
                nodeId: this.currentNodeId,
                metadata: {
                    bitrate: level.bitrate,
                    width: level.width,
                    height: level.height
                }
            });
        });

        // Rastrear fragmentos carregados
        this.hls.on(Hls.Events.FRAG_LOADED, (_event, data) => {
            const stats = data.frag.stats;
            const bitrate = (stats.total * 8 / data.frag.duration / 1000).toFixed(0);
            console.log(`✅ Fragmento carregado: ${bitrate} kbps`);
        });

        // Detectar buffering
        this.hls.on(Hls.Events.BUFFER_APPENDING, () => {
            console.log('🔄 Buffer appending...');
        });

        this.hls.on(Hls.Events.BUFFER_APPENDED, () => {
            console.log('✅ Buffer appended');
        });
    }

    /**
     * ✅ BUFFER MONITORING - Monitorar continuamente
     */
    private startBufferMonitoring(): void {
        // Parar monitoramento anterior
        this.stopBufferMonitoring();

        // Monitorar a cada 2 segundos
        this.bufferMonitorInterval = window.setInterval(() => {
            if (dom.video && !dom.video.paused) {
                analytics.monitorBuffer(dom.video, this.currentNodeId);
            }
        }, 2000);
    }

    private stopBufferMonitoring(): void {
        if (this.bufferMonitorInterval !== null) {
            clearInterval(this.bufferMonitorInterval);
            this.bufferMonitorInterval = null;
        }
    }

    /**
     * ✅ RACE CONDITION FIX - Carregar vídeo com Promise e cleanup
     */
    async loadVideo(videoUrl: string, seekToTime?: number, nodeId?: string): Promise<void> {
        console.log(`▶️ Reproduzindo vídeo: ${videoUrl}`);
        this.currentNodeId = nodeId;

        // ✅ CORREÇÃO: Pausar e aguardar antes de destruir
        if (!dom.video.paused) {
            dom.video.pause();
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (Hls.isSupported()) {
            // ✅ Usar retry logic para carregamento
            await retryWithBackoff(async () => {
                // Destruir instância anterior (evita race condition)
                this.destroyHls();
                this.recoveryAttempts = 0;

                // Criar nova instância
                this.createHlsInstance();
                this.hls!.loadSource(videoUrl);

                // ✅ Aguardar manifest estar pronto (Promise-based)
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Timeout ao carregar manifest'));
                    }, 10000);

                    const onManifestParsed = () => {
                        clearTimeout(timeout);
                        this.hls!.off(Hls.Events.MANIFEST_PARSED, onManifestParsed);
                        this.hls!.off(Hls.Events.ERROR, onError);
                        resolve();
                    };

                    const onError = (_event: string, data: any) => {
                        if (data.fatal) {
                            clearTimeout(timeout);
                            this.hls!.off(Hls.Events.MANIFEST_PARSED, onManifestParsed);
                            this.hls!.off(Hls.Events.ERROR, onError);
                            reject(new Error(`Erro HLS: ${data.details}`));
                        }
                    };

                    this.hls!.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
                    this.hls!.on(Hls.Events.ERROR, onError);
                });

                console.log('✅ Manifest carregado');

                // ✅ NOVO: Aguardar buffer inicial antes de dar play
                await this.waitForInitialBuffer();

                // Seek se necessário (APÓS buffer estar pronto)
                if (seekToTime !== undefined) {
                    dom.video.currentTime = seekToTime;
                }

                // ✅ Remover fade-out e aplicar fade-in suave
                dom.video.classList.remove('fading-out');
                dom.video.classList.add('fading-in');

                // ✅ Aguardar vídeo estar pronto para reprodução
                try {
                    await dom.video.play();
                } catch (playError: any) {
                    // ✅ Ignorar AbortError se já estamos pausando/destruindo
                    if (playError.name !== 'AbortError') {
                        throw playError;
                    }
                    console.warn('⚠️ Play abortado (normal durante transições)');
                }

                // Remover fade-in após animação
                setTimeout(() => {
                    dom.video.classList.remove('fading-in');
                }, 400);

                // Rastrear reprodução
                analytics.track({
                    type: 'play',
                    nodeId: this.currentNodeId
                });
            }, {
                maxAttempts: 3,
                baseDelay: 1000,
                maxDelay: 5000
            });

        } else if (dom.video.canPlayType('application/vnd.apple.mpegurl')) {
            dom.video.src = videoUrl;

            if (seekToTime !== undefined) {
                await new Promise<void>((resolve) => {
                    dom.video.addEventListener('loadedmetadata', () => {
                        dom.video.currentTime = seekToTime;
                        resolve();
                    }, { once: true });
                });
            }

            dom.video.classList.remove('fading-out');
            dom.video.classList.add('fading-in');

            try {
                await dom.video.play();
            } catch (playError: any) {
                if (playError.name !== 'AbortError') {
                    throw playError;
                }
            }

            setTimeout(() => {
                dom.video.classList.remove('fading-in');
            }, 400);
        }
    }

    /**
     * ✅ NOVO: Aguardar buffer inicial e pular gap se necessário
     */
    private async waitForInitialBuffer(): Promise<void> {
        return new Promise<void>((resolve) => {
            const maxWait = 5000; // 5 segundos máximo
            const startTime = Date.now();

            const checkBuffer = () => {
                if (Date.now() - startTime > maxWait) {
                    console.warn('⚠️ Timeout aguardando buffer inicial, continuando mesmo assim...');
                    resolve();
                    return;
                }

                if (dom.video.buffered.length > 0) {
                    const bufferStart = dom.video.buffered.start(0);
                    const bufferEnd = dom.video.buffered.end(0);
                    const bufferLength = bufferEnd - bufferStart;

                    // ✅ Aguardar pelo menos 1 segundo de buffer
                    if (bufferLength >= 1.0) {
                        // ✅ CRÍTICO: Pular gap inicial ANTES de dar play
                        if (bufferStart > 0 && bufferStart < 0.5) {
                            console.log(`🎯 Pulando gap inicial: 0s → ${bufferStart.toFixed(3)}s`);
                            dom.video.currentTime = bufferStart;
                        }
                        resolve();
                    } else {
                        setTimeout(checkBuffer, 100);
                    }
                } else {
                    setTimeout(checkBuffer, 100);
                }
            };

            checkBuffer();
        });
    }

    /**
     * ✅ Carregar playlist stitched com tratamento melhorado e FALLBACK
     */
    async loadStitchedPlaylist(playlistUrl: string, onError?: () => void): Promise<void> {
        console.log(`\n▶️ ===== REPRODUZINDO PLAYLIST STITCHED =====`);
        console.log(`URL: ${playlistUrl}`);

        // ✅ NOVO: Registrar callback de fallback
        this.onStitchingFailed = onError;

        if (Hls.isSupported()) {
            try {
                await retryWithBackoff(async () => {
                    // Destruir instância anterior
                    this.destroyHls();
                    this.recoveryAttempts = 0;

                    // Criar nova instância com config stitched
                    this.hls = new Hls(HLS_STITCHED_CONFIG);
                    this.hls.attachMedia(dom.video);
                    this.setupErrorBoundary();
                    this.setupEventListeners();

                    this.hls.loadSource(playlistUrl);

                    // Aguardar manifest
                    await new Promise<void>((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            reject(new Error('Timeout ao carregar playlist stitched'));
                        }, 15000);

                        const onManifestParsed = () => {
                            clearTimeout(timeout);
                            this.hls!.off(Hls.Events.MANIFEST_PARSED, onManifestParsed);
                            this.hls!.off(Hls.Events.ERROR, onErrorHandler);
                            resolve();
                        };

                        const onErrorHandler = (_event: string, data: any) => {
                            if (data.fatal) {
                                clearTimeout(timeout);
                                this.hls!.off(Hls.Events.MANIFEST_PARSED, onManifestParsed);
                                this.hls!.off(Hls.Events.ERROR, onErrorHandler);
                                reject(new Error(`Erro stitched: ${data.details}`));
                            }
                        };

                        this.hls!.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
                        this.hls!.on(Hls.Events.ERROR, onErrorHandler);
                    });

                    console.log('✅ Playlist stitched carregada, aguardando buffer...');

                    // ✅ CRÍTICO: Aguardar buffer ter conteúdo SUFICIENTE antes de iniciar
                    await new Promise<void>((resolve, reject) => {
                        const maxWait = 10000; // 10 segundos máximo
                        const startTime = Date.now();

                        const checkBuffer = () => {
                            if (Date.now() - startTime > maxWait) {
                                reject(new Error('Timeout aguardando buffer'));
                                return;
                            }

                            if (dom.video.buffered.length > 0) {
                                const bufferStart = dom.video.buffered.start(0);
                                const bufferEnd = dom.video.buffered.end(0);
                                const bufferLength = bufferEnd - bufferStart;

                                console.log(`📊 Buffer: start=${bufferStart.toFixed(3)}s, end=${bufferEnd.toFixed(3)}s, length=${bufferLength.toFixed(2)}s`);

                                // ✅ Aguardar pelo menos 2 segundos de buffer
                                if (bufferLength >= 2.0) {
                                    // ✅ CORREÇÃO: Iniciar no ponto real do buffer (pula gap inicial)
                                    if (bufferStart > 0 && bufferStart < 1.0) {
                                        console.log(`🎯 Iniciando playback em ${bufferStart.toFixed(3)}s (pulando gap inicial)`);
                                        dom.video.currentTime = bufferStart;
                                    } else {
                                        console.log(`🎯 Iniciando playback em 0s (sem gap)`);
                                        dom.video.currentTime = 0;
                                    }
                                    resolve();
                                } else {
                                    // Aguardar mais buffer
                                    console.log(`⏳ Aguardando mais buffer... (${bufferLength.toFixed(2)}s/2.0s)`);
                                    setTimeout(checkBuffer, 200);
                                }
                            } else {
                                // Ainda não há buffer
                                setTimeout(checkBuffer, 100);
                            }
                        };

                        checkBuffer();
                    });

                    // ✅ CORREÇÃO: Garantir que o vídeo está tocando
                    if (dom.video.paused) {
                        console.log('▶️ Iniciando playback...');
                        await dom.video.play();
                        console.log('✅ Playback iniciado com sucesso');
                    } else {
                        console.log('✅ Vídeo já está tocando, continuando...');
                    }

                    // ✅ Limpar callback de fallback após sucesso
                    this.onStitchingFailed = undefined;

                    // Rastrear stitching
                    analytics.track({
                        type: 'stitch',
                        metadata: { playlistUrl }
                    });
                }, {
                    maxAttempts: 2,
                    baseDelay: 1000
                });

            } catch (error) {
                console.error('❌ Erro fatal em playlist stitched, usando fallback');
                analytics.track({
                    type: 'error',
                    errorCode: 'stitched_failed',
                    errorMessage: (error as Error).message
                });
                onError?.();
            }
        } else if (dom.video.canPlayType('application/vnd.apple.mpegurl')) {
            dom.video.src = playlistUrl;

            // ✅ Aguardar metadata no Safari também
            await new Promise<void>((resolve) => {
                const onLoadedMetadata = () => {
                    dom.video.removeEventListener('loadedmetadata', onLoadedMetadata);

                    // Pular gap inicial se existir
                    if (dom.video.buffered.length > 0) {
                        const bufferStart = dom.video.buffered.start(0);
                        if (bufferStart > 0 && bufferStart < 1.0) {
                            dom.video.currentTime = bufferStart;
                        }
                    }

                    resolve();
                };

                dom.video.addEventListener('loadedmetadata', onLoadedMetadata);
            });

            if (dom.video.paused) {
                await dom.video.play();
            }
        }
    }

    /**
     * ✅ NOVO: Expandir playlist atual com novos vídeos (estilo Bandersnatch)
     * Adiciona segmentos à playlist SEM interromper a reprodução
     */
    async appendToCurrentPlaylist(nodePath: GraphNode[]): Promise<boolean> {
        console.log(`\n🎬 ===== EXPANDINDO PLAYLIST ATUAL =====`);

        if (nodePath.length === 0) {
            console.warn('⚠️ Nenhum nó para adicionar');
            return false;
        }

        try {
            // Importar state dinamicamente para evitar circular dependency
            const { state } = await import('../core/state');

            // Extrair videoIds dos nós
            const { extractVideoId } = await import('../utils/format.utils');
            const videoIds: string[] = [];

            for (const node of nodePath) {
                const videoUrl = (node.data as any).videoUrl;
                if (videoUrl) {
                    const videoId = extractVideoId(videoUrl);
                    if (videoId) {
                        videoIds.push(videoId);
                    }
                }
            }

            if (videoIds.length === 0) {
                console.warn('⚠️ Nenhum videoId válido encontrado');
                return false;
            }

            // ✅ Se ainda não temos uma playlist stitched, criar uma nova
            // com o vídeo atual + os novos vídeos
            if (!state.stitchedPlaylistUrl) {
                console.log('📝 Criando nova playlist stitched...');

                // Incluir vídeo atual se existir
                const currentVideoUrl = (state.currentNode?.data as any)?.videoUrl;
                const allVideoIds: string[] = [];

                if (currentVideoUrl) {
                    const currentVideoId = extractVideoId(currentVideoUrl);
                    if (currentVideoId) {
                        allVideoIds.push(currentVideoId);
                    }
                }

                allVideoIds.push(...videoIds);

                // Criar playlist stitched completa
                const response = await fetch(`${API_URL}/api/playlists/stitch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nodePath: allVideoIds })
                });

                if (!response.ok) {
                    throw new Error(`Erro ao criar playlist: ${response.statusText}`);
                }

                const data = await response.json();
                const newPlaylistUrl = data.masterPlaylistUrl;
                state.stitchedPlaylistUrl = newPlaylistUrl;

                // Combinar paths
                if (state.currentNode && !state.stitchedPath.find(n => n.id === state.currentNode!.id)) {
                    state.stitchedPath = [state.currentNode, ...nodePath];
                } else {
                    state.stitchedPath = [...state.stitchedPath, ...nodePath];
                }

                console.log(`✅ Nova playlist criada com ${allVideoIds.length} vídeos`);

                // ✅ CRÍTICO: Carregar nova playlist SEM interromper
                // Guardar posição atual
                const currentTime = dom.video.currentTime;
                const wasPlaying = !dom.video.paused;

                // Carregar nova playlist
                await this.loadStitchedPlaylistSeamless(newPlaylistUrl, currentTime);

                // Retomar reprodução se estava tocando
                if (wasPlaying && dom.video.paused) {
                    await dom.video.play();
                }

                return true;
            }

            // ✅ Se já temos playlist stitched, precisamos criar uma nova expandida
            console.log('📝 Expandindo playlist stitched existente...');

            // Pegar todos os videoIds atuais + novos
            const currentVideoIds: string[] = [];
            for (const node of state.stitchedPath) {
                const videoUrl = (node.data as any).videoUrl;
                if (videoUrl) {
                    const videoId = extractVideoId(videoUrl);
                    if (videoId) {
                        currentVideoIds.push(videoId);
                    }
                }
            }

            const allVideoIds = [...currentVideoIds, ...videoIds];

            // Criar nova playlist expandida
            const response = await fetch(`${API_URL}/api/playlists/stitch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodePath: allVideoIds })
            });

            if (!response.ok) {
                throw new Error(`Erro ao expandir playlist: ${response.statusText}`);
            }

            const data = await response.json();
            const newPlaylistUrl = data.masterPlaylistUrl;

            // Guardar posição atual
            const currentTime = dom.video.currentTime;
            const wasPlaying = !dom.video.paused;

            // Atualizar estado
            state.stitchedPlaylistUrl = newPlaylistUrl;
            state.stitchedPath = [...state.stitchedPath, ...nodePath];

            console.log(`✅ Playlist expandida para ${allVideoIds.length} vídeos`);

            // ✅ CRÍTICO: Carregar playlist expandida mantendo posição
            await this.loadStitchedPlaylistSeamless(newPlaylistUrl, currentTime);

            // Retomar reprodução
            if (wasPlaying && dom.video.paused) {
                await dom.video.play();
            }

            return true;

        } catch (error) {
            console.error('❌ Erro ao expandir playlist:', error);
            return false;
        }
    }

    /**
     * ✅ NOVO: Carregar playlist stitched mantendo posição atual (seamless)
     */
    private async loadStitchedPlaylistSeamless(playlistUrl: string, seekToTime: number): Promise<void> {
        console.log(`🔄 Carregando playlist seamless em ${seekToTime.toFixed(2)}s...`);

        if (!Hls.isSupported()) {
            console.warn('⚠️ HLS não suportado, usando fallback');
            dom.video.src = playlistUrl;
            dom.video.currentTime = seekToTime;
            return;
        }

        // ✅ Não destruir instância atual - apenas trocar a source
        if (this.hls) {
            // Pausar temporariamente para evitar erros
            const wasPlaying = !dom.video.paused;

            // Carregar nova source
            this.hls.loadSource(playlistUrl);

            // Aguardar manifest
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);

                const onManifestParsed = () => {
                    clearTimeout(timeout);
                    this.hls!.off(Hls.Events.MANIFEST_PARSED, onManifestParsed);
                    resolve();
                };

                this.hls!.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
            });

            // Restaurar posição
            dom.video.currentTime = seekToTime;

            // Retomar reprodução
            if (wasPlaying) {
                await dom.video.play().catch(() => { });
            }

            console.log(`✅ Playlist carregada, continuando em ${seekToTime.toFixed(2)}s`);
        } else {
            // Se não tem instância, criar uma nova
            await this.loadStitchedPlaylist(playlistUrl);
            dom.video.currentTime = seekToTime;
        }
    }

    /**
     * ✅ MEMORY CLEANUP - Destruir HLS adequadamente
     */
    destroyHls(): void {
        if (this.hls) {
            console.log('🗑️ Destruindo instância HLS...');

            // Remover todos os listeners
            this.hls.off(Hls.Events.ERROR);
            this.hls.off(Hls.Events.MANIFEST_PARSED);
            this.hls.off(Hls.Events.LEVEL_SWITCHED);
            this.hls.off(Hls.Events.FRAG_LOADED);
            this.hls.off(Hls.Events.BUFFER_APPENDING);
            this.hls.off(Hls.Events.BUFFER_APPENDED);

            // Destruir instância
            this.hls.destroy();
            this.hls = null;

            console.log('✅ HLS destruído');
        }
    }

    /**
     * ✅ Destruir completamente o serviço
     */
    destroy(): void {
        console.log('🗑️ Destruindo HLS Service...');
        this.stopBufferMonitoring();
        this.destroyHls();
    }

    /**
     * ✅ Tratamento de erro fatal com recovery
     */
    private handleFatalError(data: any): void {
        console.log(`🔄 Tratando erro fatal: ${data.type}`);

        switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
                console.log('🌐 Tentando recuperar erro de rede...');
                this.hls?.startLoad();
                break;
            case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('🎥 Tentando recuperar erro de mídia...');
                this.hls?.recoverMediaError();
                break;
            default:
                console.error('❌ Erro irrecuperável, recriando HLS...');
                setTimeout(() => {
                    this.createHlsInstance();
                }, 1000);
                break;
        }
    }

    /**
     * Mostrar erro na UI
     */
    private showErrorUI(message: string): void {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-overlay';
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 0, 0, 0.9);
            color: white;
            padding: 20px;
            border-radius: 8px;
            z-index: 10000;
            max-width: 400px;
            text-align: center;
        `;
        errorDiv.innerHTML = `
            <h3>❌ Erro</h3>
            <p>${message}</p>
            <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; cursor: pointer;">
                Recarregar Página
            </button>
        `;
        document.body.appendChild(errorDiv);
    }

    /**
     * Obter instância HLS atual
     */
    getHls(): Hls | null {
        return this.hls;
    }
}

export const hlsService = new HlsService();
