import Hls from 'hls.js';
import { HLS_CONFIG, HLS_STITCHED_CONFIG } from '../core/config';
import { dom } from '../ui/dom-elements';
import { retryWithBackoff } from '../utils/retry.utils';
import type { GraphNode } from '../core/types';
import { debugLog, logVideoElement } from '../utils/debug.util';

export class HlsService {
    private hls: Hls | null = null;

    // ✅ NOVO: Callback para fallback quando stitching falhar
    private onStitchingFailed?: () => void;
    private stitchingFallbackInProgress = false;
    /** Evita fallback com reload logo após append seamless (discontinuidade HLS). */
    private lastSeamlessAppendAt = 0;

    // ✅ NOVO: Hooks públicos para UI de qualidade (sobrevivem à troca de instância de Hls)
    private manifestParsedCallbacks: Array<(levels: Hls['levels']) => void> = [];
    private levelSwitchedCallbacks: Array<(level: number) => void> = [];

    onManifestParsed(cb: (levels: Hls['levels']) => void): void {
        this.manifestParsedCallbacks.push(cb);
    }

    onLevelSwitched(cb: (level: number) => void): void {
        this.levelSwitchedCallbacks.push(cb);
    }

    init() {
        if (Hls.isSupported()) {
            this.createHlsInstance();
        }

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
                debugLog('hls', 'bufferAppendError — codecs incompatíveis na playlist stitched', {
                    fatal: data.fatal,
                    reason: data.reason,
                    msSinceAppend: Date.now() - this.lastSeamlessAppendAt,
                });
                logVideoElement('no bufferAppendError');

                // Logo após append seamless, tentar recovery leve antes de rebuild completo
                if (Date.now() - this.lastSeamlessAppendAt < 4000) {
                    debugLog('hls', 'bufferAppendError pós-append — recoverMediaError (sem reload)');
                    this.hls?.recoverMediaError();
                    return;
                }

                if (this.onStitchingFailed) {
                    const fallbackFn = this.onStitchingFailed;
                    this.onStitchingFailed = undefined;
                    fallbackFn();
                    return;
                }

                void this.fallbackRebuildStitchedPlaylist();
                return;
            }

            // Manifest vazio/corrompido durante append EVENT — tentar recarregar antes de rebuild
            if (data.details === 'levelLoadError' || data.details === 'manifestLoadError') {
                if (Date.now() - this.lastSeamlessAppendAt < 8000) {
                    debugLog('hls', `${data.details} pós-append — startLoad()`, {
                        fatal: data.fatal,
                    });
                    this.hls?.startLoad(-1);
                    return;
                }
            }

            if (data.fatal) {
                this.handleFatalError(data);
            }
        });

        // Auto-fix: currentTime antes do buffer
        this.hls.on(Hls.Events.BUFFER_APPENDED, () => {
            // Verificar se currentTime está antes do buffer
            if (dom.video.buffered.length > 0 && !dom.video.seeking && !dom.video.paused) {
                const bufferStart = dom.video.buffered.start(0);
                const currentTime = dom.video.currentTime;

                if (currentTime < bufferStart && bufferStart - currentTime < 1.0) {
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
            dom.video.currentTime = bufferStart + 0.01; // Pequeno offset para garantir
            return true;
        }

        // Caso 2: currentTime está em um "buraco" entre ranges de buffer
        for (let i = 0; i < dom.video.buffered.length - 1; i++) {
            const rangeEnd = dom.video.buffered.end(i);
            const nextRangeStart = dom.video.buffered.start(i + 1);

            if (currentTime >= rangeEnd && currentTime < nextRangeStart) {
                dom.video.currentTime = nextRangeStart + 0.01;
                return true;
            }
        }

        // Caso 3: currentTime está DEPOIS do buffer (ficou para trás)
        if (currentTime > bufferEnd) {
            dom.video.currentTime = bufferEnd - 0.5;
            return true;
        }

        return false;
    }

    /**
     * Event listeners HLS (qualidade, manifest)
     */
    private setupEventListeners(): void {
        if (!this.hls) return;

        // ✅ NOVO: Notificar UI quando o manifest da instância atual for parseado
        this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
            const levels = this.hls?.levels ?? [];
            this.manifestParsedCallbacks.forEach(cb => cb(levels));
        });

        // Rastrear mudanças de qualidade
        this.hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
            this.levelSwitchedCallbacks.forEach(cb => cb(data.level));
        });

    }

    /**
     * ✅ RACE CONDITION FIX - Carregar vídeo com Promise e cleanup
     */
    async loadVideo(videoUrl: string, seekToTime?: number): Promise<void> {

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
                }

                // Remover fade-in após animação
                setTimeout(() => {
                    dom.video.classList.remove('fading-in');
                }, 400);
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

        // ✅ NOVO: Registrar callback de fallback
        this.onStitchingFailed = onError;

        if (Hls.isSupported()) {
            try {
                await retryWithBackoff(async () => {
                    // Destruir instância anterior
                    this.destroyHls();

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


                                // ✅ Aguardar pelo menos 2 segundos de buffer
                                if (bufferLength >= 2.0) {
                                    // ✅ CORREÇÃO: Iniciar no ponto real do buffer (pula gap inicial)
                                    if (bufferStart > 0 && bufferStart < 1.0) {
                                        dom.video.currentTime = bufferStart;
                                    } else {
                                        dom.video.currentTime = 0;
                                    }
                                    resolve();
                                } else {
                                    // Aguardar mais buffer
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
                        await dom.video.play();
                    }

                    // ✅ Limpar callback de fallback após sucesso
                    this.onStitchingFailed = undefined;
                }, {
                    maxAttempts: 2,
                    baseDelay: 1000
                });

            } catch (error) {
                console.error('❌ Erro fatal em playlist stitched, usando fallback');
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
     * ✅ SEAMLESS (Opção A): expandir a reprodução SEM recarregar a fonte.
     *
     * Se já existe uma sessão de playback, apenas pedimos ao servidor para anexar
     * os novos vídeos à playlist EVENT (URL estável). O hls.js recarrega só o
     * manifesto e faz append dos fragmentos no mesmo buffer — sem loadSource, sem
     * piscada, sem re-seek. Caso ainda não exista sessão (ex.: começou como vídeo
     * único), criamos uma agora (esse primeiro carregamento ainda troca a fonte,
     * mas todas as escolhas seguintes passam a ser seamless).
     */
    async appendToCurrentPlaylist(nodePath: GraphNode[]): Promise<boolean> {

        if (nodePath.length === 0) {
            return false;
        }

        const { state } = await import('../core/state');
        const { extractVideoId } = await import('../utils/format.utils');
        const { apiService } = await import('./api.service');

        const videoIds: string[] = [];
        for (const node of nodePath) {
            const videoUrl = (node.data as any).videoUrl;
            if (videoUrl) {
                const videoId = extractVideoId(videoUrl);
                if (videoId) videoIds.push(videoId);
            }
        }

        if (videoIds.length === 0) {
            return false;
        }

        // ✅ Caminho seamless: já temos sessão → append sem reload
        if (state.sessionId) {
            const result = await apiService.appendToSession(state.sessionId, videoIds);
            if (result.ok) {
                // Obs.: state.stitchedPath/virtualTimeline já foram estendidos por
                // timelineService.appendToTimeline antes desta chamada.
                this.lastSeamlessAppendAt = Date.now();

                await this.refreshEventPlaylist();
                const nextSegStart = state.virtualTimeline[state.currentSegmentIndex + 1]?.startTime;
                if (nextSegStart !== undefined) {
                    await this.waitUntilBuffered(nextSegStart + 0.05, 12000);
                }

                if (dom.video.paused) {
                    await dom.video.play().catch(() => { });
                }
                return true;
            }
            if (result.status === 422 || result.status === 409) {
                console.error('❌ Vídeos incompatíveis ou resolução divergente — execute POST /api/videos/retranscode-all');
                return false;
            }
            return this.appendViaStitch(nodePath);
        }

        // ✅ Ainda não há sessão: criar uma com [vídeo atual + novos] e carregar 1x.
        const currentVideoUrl = (state.currentNode?.data as any)?.videoUrl;
        const allVideoIds: string[] = [];
        if (currentVideoUrl) {
            const currentVideoId = extractVideoId(currentVideoUrl);
            if (currentVideoId) allVideoIds.push(currentVideoId);
        }
        allVideoIds.push(...videoIds);

        const session = await apiService.createSession(allVideoIds);
        if (session) {
            state.sessionId = session.sessionId;
            state.stitchedPlaylistUrl = session.masterPlaylistUrl;

            if (state.currentNode && !state.stitchedPath.find(n => n.id === state.currentNode!.id)) {
                state.stitchedPath = [state.currentNode, ...nodePath];
            } else {
                state.stitchedPath = [...state.stitchedPath, ...nodePath];
            }

            const currentTime = dom.video.currentTime;
            const wasPlaying = !dom.video.paused;
            await this.loadStitchedPlaylistSeamless(session.masterPlaylistUrl, currentTime);
            if (wasPlaying && dom.video.paused) {
                await dom.video.play().catch(() => { });
            }
            return true;
        }

        return this.appendViaStitch(nodePath);
    }

    /**
     * Força o hls.js a recarregar o manifesto EVENT (após append na sessão).
     */
    async refreshEventPlaylist(): Promise<void> {
        if (!this.hls) return;
        debugLog('hls', 'Recarregando manifesto EVENT após append');
        this.hls.startLoad(-1);
        await new Promise((resolve) => setTimeout(resolve, 350));
    }

    /**
     * Aguarda o buffer cobrir um instante da timeline (ex.: início do próximo segmento).
     */
    async waitUntilBuffered(targetTime: number, timeoutMs = 8000): Promise<boolean> {
        const start = Date.now();

        while (Date.now() - start < timeoutMs) {
            if (this.isTimeBuffered(targetTime)) {
                debugLog('hls', 'Buffer pronto para seek', { targetTime: Number(targetTime.toFixed(3)) });
                return true;
            }
            this.hls?.startLoad(-1);
            await new Promise((resolve) => setTimeout(resolve, 250));
        }

        debugLog('hls', 'Timeout aguardando buffer', { targetTime: Number(targetTime.toFixed(3)) });
        return false;
    }

    private isTimeBuffered(targetTime: number): boolean {
        const video = dom.video;
        for (let i = 0; i < video.buffered.length; i++) {
            if (targetTime >= video.buffered.start(i) && targetTime <= video.buffered.end(i) + 0.15) {
                return true;
            }
        }
        if (video.buffered.length > 0) {
            const bufferEnd = video.buffered.end(video.buffered.length - 1);
            if (targetTime >= bufferEnd - 0.3 && targetTime <= bufferEnd + 2) {
                return true;
            }
        }
        return false;
    }

    /**
     * ✅ Encerrar a sessão de playback no servidor (escreve ENDLIST) para que a
     * playlist EVENT vire VOD e o vídeo dispare 'ended' normalmente no fim.
     */
    async endSession(): Promise<void> {
        const { state } = await import('../core/state');
        if (!state.sessionId) return;
        const { apiService } = await import('./api.service');
        await apiService.endSession(state.sessionId);
    }

    /**
     * Fallback: reconstrói playlist stitched quando append seamless falha (bufferAppendError).
     */
    async fallbackRebuildStitchedPlaylist(): Promise<boolean> {
        if (this.stitchingFallbackInProgress) return false;
        this.stitchingFallbackInProgress = true;

        try {
            const { state } = await import('../core/state');
            if (state.stitchedPath.length < 1) return false;

            debugLog('hls', 'Reconstruindo playlist stitched (fallback pós bufferAppendError)', {
                nodes: state.stitchedPath.map((n) => n.data.label),
            });

            state.sessionId = null;
            state.stitchedPlaylistUrl = null;
            const wasPlaying = !dom.video.paused;
            const ok = await this.appendViaStitch([...state.stitchedPath]);

            if (ok && wasPlaying && dom.video.paused) {
                await dom.video.play().catch(() => {});
            }

            return ok;
        } finally {
            this.stitchingFallbackInProgress = false;
        }
    }

    /**
     * ⚠️ LEGADO (fallback): expandir gerando uma nova master playlist e recarregando
     * a fonte (causa a "piscada"). Usado apenas quando a sessão seamless falha.
     */
    private async appendViaStitch(nodePath: GraphNode[]): Promise<boolean> {

        if (nodePath.length === 0) {
            return false;
        }

        try {
            // Importar state dinamicamente para evitar circular dependency
            const { state } = await import('../core/state');
            const { apiService } = await import('./api.service');

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
                return false;
            }

            // ✅ Se ainda não temos uma playlist stitched, criar uma nova
            // com o vídeo atual + os novos vídeos
            if (!state.stitchedPlaylistUrl) {

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
                const newPlaylistUrl = await apiService.stitchVideoIds(allVideoIds);
                if (!newPlaylistUrl) throw new Error('Erro ao criar playlist autorizada');
                state.stitchedPlaylistUrl = newPlaylistUrl;

                // Combinar paths
                if (state.currentNode && !state.stitchedPath.find(n => n.id === state.currentNode!.id)) {
                    state.stitchedPath = [state.currentNode, ...nodePath];
                } else {
                    state.stitchedPath = [...state.stitchedPath, ...nodePath];
                }


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

            const allVideoIds = [...new Set([...currentVideoIds, ...videoIds])];

            // Criar nova playlist expandida
            const newPlaylistUrl = await apiService.stitchVideoIds(allVideoIds);
            if (!newPlaylistUrl) throw new Error('Erro ao expandir playlist autorizada');

            // Guardar posição atual
            const currentTime = dom.video.currentTime;
            const wasPlaying = !dom.video.paused;

            // Atualizar estado
            state.stitchedPlaylistUrl = newPlaylistUrl;
            state.stitchedPath = [...state.stitchedPath, ...nodePath];


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

        if (!Hls.isSupported()) {
            dom.video.src = playlistUrl;
            dom.video.currentTime = seekToTime;
            return;
        }

        // ✅ Não destruir instância atual - apenas trocar a source
        if (this.hls) {
            // Pausar temporariamente para evitar erros
            const wasPlaying = !dom.video.paused;

            // ✅ Trocar a source no HLS recarrega o MediaSource/buffer, o que provoca
            // uma "piscada" (frame preto + re-seek). Mascaramos isso com um fade-out
            // curto antes de recarregar e um fade-in depois de reposicionar, para a
            // transição parecer intencional em vez de um glitch.
            dom.video.classList.remove('fading-in');
            dom.video.classList.add('fading-out');
            await new Promise(resolve => setTimeout(resolve, 200));

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

            // ✅ Revelar o vídeo novamente com fade-in suave
            dom.video.classList.remove('fading-out');
            dom.video.classList.add('fading-in');
            setTimeout(() => {
                dom.video.classList.remove('fading-in');
            }, 400);

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

        }
    }

    /**
     * ✅ Destruir completamente o serviço
     */
    destroy(): void {
        this.destroyHls();
    }

    /**
     * ✅ Tratamento de erro fatal com recovery
     */
    private handleFatalError(data: any): void {

        switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
                this.hls?.startLoad();
                break;
            case Hls.ErrorTypes.MEDIA_ERROR:
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
     * Obter instância HLS atual
     */
    getHls(): Hls | null {
        return this.hls;
    }
}

export const hlsService = new HlsService();
