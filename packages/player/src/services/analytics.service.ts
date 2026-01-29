interface AnalyticsEvent {
    type: 'play' | 'pause' | 'choice' | 'buffer' | 'quality_change' | 'error' | 'seek' | 'ended' | 'stitch';
    timestamp: number;
    nodeId?: string;
    choiceId?: string;
    bufferLength?: number;
    quality?: string;
    errorCode?: string;
    errorMessage?: string;
    metadata?: Record<string, any>;
}

interface BufferMetrics {
    averageBufferLength: number;
    bufferStarvationCount: number;
    lastBufferCheck: number;
}

class AnalyticsService {
    private events: AnalyticsEvent[] = [];
    private sessionId: string;
    private bufferMetrics: BufferMetrics = {
        averageBufferLength: 0,
        bufferStarvationCount: 0,
        lastBufferCheck: Date.now()
    };
    private readonly FLUSH_THRESHOLD = 10;
    private readonly LOW_BUFFER_THRESHOLD = 2; // segundos

    constructor() {
        this.sessionId = this.generateSessionId();
        console.log(`📊 Analytics iniciado - Session: ${this.sessionId}`);

        // Flush ao fechar janela
        window.addEventListener('beforeunload', () => this.flush());
    }

    /**
     * Rastrear evento
     */
    track(event: Omit<AnalyticsEvent, 'timestamp'>) {
        const trackedEvent: AnalyticsEvent = {
            ...event,
            timestamp: Date.now()
        };

        this.events.push(trackedEvent);

        console.log(`📊 [Analytics] ${event.type}`, event);

        // Auto-flush se atingir threshold
        if (this.events.length >= this.FLUSH_THRESHOLD) {
            this.flush();
        }
    }

    /**
     * ✅ Monitorar buffer e rastrear problemas
     */
    monitorBuffer(video: HTMLVideoElement, nodeId?: string): void {
        if (!video.buffered || video.buffered.length === 0) return;

        // ✅ CORREÇÃO: Ignorar se estiver fazendo seek
        if (video.seeking) {
            return;
        }

        const currentTime = video.currentTime;

        // ✅ CORREÇÃO: Calcular buffer corretamente considerando gaps
        let bufferLength = 0;

        for (let i = 0; i < video.buffered.length; i++) {
            const start = video.buffered.start(i);
            const end = video.buffered.end(i);

            // Se currentTime está dentro deste range
            if (currentTime >= start && currentTime <= end) {
                bufferLength = end - currentTime;
                break;
            }
            // Se currentTime está ANTES deste range (gap inicial)
            else if (currentTime < start && i === 0) {
                // Considerar o buffer disponível à frente
                bufferLength = end - start;
                break;
            }
        }

        // Atualizar métricas
        this.bufferMetrics.lastBufferCheck = Date.now();

        // Média móvel do buffer
        if (this.bufferMetrics.averageBufferLength === 0) {
            this.bufferMetrics.averageBufferLength = bufferLength;
        } else {
            this.bufferMetrics.averageBufferLength =
                this.bufferMetrics.averageBufferLength * 0.8 + bufferLength * 0.2;
        }

        // Rastrear buffer (menos frequente para não poluir logs)
        if (bufferLength < this.LOW_BUFFER_THRESHOLD) {
            this.bufferMetrics.bufferStarvationCount++;
        }

        // ✅ CORREÇÃO: Só logar warning se buffer realmente baixo E não estiver pausado
        if (bufferLength < this.LOW_BUFFER_THRESHOLD && !video.paused && bufferLength > 0) {
            // Log menos frequente - apenas 1 em cada 3 checks
            if (this.bufferMetrics.bufferStarvationCount % 3 === 1) {
                console.warn(`⚠️ Buffer baixo: ${bufferLength.toFixed(2)}s`);
            }
        }

        // Rastrear apenas ocasionalmente (não em todo check)
        if (Math.random() < 0.3) {
            this.track({
                type: 'buffer',
                bufferLength,
                nodeId,
                metadata: {
                    currentTime,
                    bufferedRanges: video.buffered.length,
                    averageBuffer: this.bufferMetrics.averageBufferLength.toFixed(2)
                }
            });
        }
    }

    /**
     * Obter métricas de buffer
     */
    getBufferMetrics(): BufferMetrics {
        return { ...this.bufferMetrics };
    }

    /**
     * Obter caminho mais escolhido
     */
    getMostChosenPath(): string[] {
        // Reconstruir caminhos
        const paths: string[][] = [];
        let currentPath: string[] = [];

        for (const event of this.events) {
            if (event.type === 'play' && event.nodeId) {
                currentPath.push(event.nodeId);
            } else if (event.type === 'ended') {
                if (currentPath.length > 0) {
                    paths.push([...currentPath]);
                    currentPath = [];
                }
            }
        }

        // Contar ocorrências de cada caminho
        const pathCounts = new Map<string, number>();

        for (const path of paths) {
            const pathKey = path.join('->');
            pathCounts.set(pathKey, (pathCounts.get(pathKey) || 0) + 1);
        }

        // Encontrar mais frequente
        let mostFrequentPath: string[] = [];
        let maxCount = 0;

        for (const [pathKey, count] of pathCounts.entries()) {
            if (count > maxCount) {
                maxCount = count;
                mostFrequentPath = pathKey.split('->');
            }
        }

        return mostFrequentPath;
    }

    /**
     * Enviar eventos para backend
     */
    async flush(): Promise<void> {
        if (this.events.length === 0) return;

        const eventsToSend = [...this.events];
        this.events = [];

        try {
            console.log(`📤 Enviando ${eventsToSend.length} eventos de analytics...`);

            // TODO: Implementar endpoint de analytics no backend
            // await fetch('/api/analytics', {
            //     method: 'POST',
            //     headers: { 'Content-Type': 'application/json' },
            //     body: JSON.stringify({
            //         sessionId: this.sessionId,
            //         events: eventsToSend,
            //         bufferMetrics: this.bufferMetrics
            //     })
            // });

            // Por enquanto, apenas log
            console.log('📊 Analytics Data:', {
                sessionId: this.sessionId,
                eventCount: eventsToSend.length,
                bufferMetrics: this.bufferMetrics,
                events: eventsToSend
            });

        } catch (error) {
            console.error('❌ Falha ao enviar analytics:', error);
            // Re-adicionar eventos em caso de erro
            this.events.unshift(...eventsToSend);
        }
    }

    /**
     * Resetar sessão
     */
    reset(): void {
        this.events = [];
        this.sessionId = this.generateSessionId();
        this.bufferMetrics = {
            averageBufferLength: 0,
            bufferStarvationCount: 0,
            lastBufferCheck: Date.now()
        };
        console.log(`🔄 Analytics resetado - Nova session: ${this.sessionId}`);
    }

    /**
     * Gerar ID de sessão único
     */
    private generateSessionId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Obter resumo da sessão
     */
    getSummary() {
        const summary = {
            sessionId: this.sessionId,
            totalEvents: this.events.length,
            eventsByType: {} as Record<string, number>,
            bufferMetrics: this.bufferMetrics,
            errors: this.events.filter(e => e.type === 'error').length,
            choices: this.events.filter(e => e.type === 'choice').length,
            averageBufferHealth: this.bufferMetrics.averageBufferLength > this.LOW_BUFFER_THRESHOLD ? 'Bom' : 'Ruim'
        };

        // Contar eventos por tipo
        for (const event of this.events) {
            summary.eventsByType[event.type] = (summary.eventsByType[event.type] || 0) + 1;
        }

        return summary;
    }
}

export const analytics = new AnalyticsService();
