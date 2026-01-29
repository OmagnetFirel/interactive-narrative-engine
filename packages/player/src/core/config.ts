export const API_URL = 'http://localhost:3001';

/**
 * ✅ CONFIGURAÇÕES HLS.js OTIMIZADAS
 * Sincronizadas com as configurações do backend
 */

export const HLS_CONFIG = {
    debug: false,
    enableWorker: true,
    lowLatencyMode: false,

    // ✅ CRÍTICO: Buffer muito mais agressivo
    maxBufferLength: 120,       // 2 minutos! (antes: 60s)
    maxMaxBufferLength: 600,
    maxBufferSize: 200 * 1000 * 1000, // 200MB! (antes: 120MB)
    maxBufferHole: 2.0,         // Muito tolerante
    backBufferLength: 90,

    // ✅ CRÍTICO: Configurações para lidar com gaps iniciais (0 → 0.021s)
    nudgeOffset: 0.1,
    nudgeMaxRetry: 5,
    startPosition: -1,

    // ✅ NOVO: Ignorar pequenos gaps no início
    highBufferWatchdogPeriod: 5,  // Aumentado

    // ✅ CRÍTICO: Tolerância para pequenos buffers/gaps
    maxStarvationDelay: 4,          // ✅ NOVO: Esperar até 4s antes de considerar stall
    maxLoadingDelay: 4,             // ✅ NOVO: Delay máximo de loading
    startFragPrefetch: true,        // ✅ NOVO: Pré-carregar primeiro fragmento

    // ✅ Configurações de fragmentos
    fragLoadingTimeOut: 20000,
    fragLoadingMaxRetry: 6,
    fragLoadingRetryDelay: 1000,
};

/**
 * ✅ CONFIGURAÇÕES HLS.js PARA STITCHING
 * Otimizado para lidar com descontinuidades entre vídeos
 */
export const HLS_STITCHED_CONFIG = {
    debug: false,
    enableWorker: true,
    lowLatencyMode: false,

    // ✅ CRÍTICO: Buffer MUITO GRANDE para stitching - começa a carregar próximo vídeo mais cedo
    maxBufferLength: 120,       // 2 minutos!
    maxMaxBufferLength: 600,
    maxBufferSize: 200 * 1000 * 1000, // 200MB!
    maxBufferHole: 3.0,         // ✅ AUMENTADO: Muito mais tolerante para stitching
    backBufferLength: 90,

    // ✅ CRÍTICO: Suporte a descontinuidades
    enableDateRange: false,
    forceKeyFrameOnDiscontinuity: true,

    // ✅ CRÍTICO: Configurações para gaps iniciais em playlists stitched
    nudgeOffset: 0.5,               // ✅ AUMENTADO: Pular gaps maiores
    nudgeMaxRetry: 20,              // ✅ MUITO AUMENTADO
    startPosition: -1,

    // ✅ CRÍTICO: Mais tolerante a stalls durante stitching
    highBufferWatchdogPeriod: 10, // ✅ DOBRADO

    // ✅ CRÍTICO: Tolerância para pequenos buffers/gaps em stitching
    maxStarvationDelay: 6,          // ✅ NOVO: Muito tolerante
    maxLoadingDelay: 6,             // ✅ NOVO: Delay máximo de loading
    startFragPrefetch: true,        // ✅ NOVO: Pré-carregar primeiro fragmento

    // ✅ NOVO: Configurações para carregar próximo segmento antecipadamente
    abrEwmaDefaultEstimate: 500000, // 500kbps mínimo estimado
    abrBandWidthFactor: 0.95,       // Fator de segurança
    abrBandWidthUpFactor: 0.7,      // Subir qualidade mais rápido

    // ✅ Timeouts mais longos para stitching
    fragLoadingTimeOut: 30000,
    fragLoadingMaxRetry: 10,    // ✅ AUMENTADO
    fragLoadingRetryDelay: 500, // ✅ REDUZIDO para retry mais rápido
    manifestLoadingTimeOut: 15000,

    // ✅ CRÍTICO: Lidar com pequenos gaps automaticamente
    liveSyncDurationCount: 3,
    liveMaxLatencyDurationCount: 10,
};

export const DEFAULT_CHOICE_BEFORE_END = 7;
export const CONTROLS_HIDE_TIMEOUT = 3000;

/**
 * ✅ CONFIGURAÇÕES DE TRANSIÇÃO
 */
export const TRANSITION_CONFIG = {
    fadeDuration: 300, // ms
    fadeEasing: 'ease',
};
