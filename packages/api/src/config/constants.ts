/**
 * ✅ CONSTANTES DE CONFIGURAÇÃO - VÍDEO & HLS
 * Centralizadas para garantir compatibilidade no stitching
 */

export interface Resolution {
    name: string;
    width: number;
    height: number;
    videoBitrate: string;
    audioBitrate: string;
}

/**
 * ✅ PARÂMETROS DE ENCODING NORMALIZADOS
 * Todos os vídeos devem usar os mesmos parâmetros para compatibilidade de stitching
 */
export const ENCODING_PARAMS = {
    // Vídeo
    videoCodec: 'libx264',
    profile: 'baseline',     // ✅ baseline = máxima compatibilidade no MSE/stitching
    level: '3.1',            // ✅ adequado para 640x360 @ 30fps
    preset: 'medium',        // Balanço qualidade/velocidade (fast, medium, slow)
    pixelFormat: 'yuv420p',  // ✅ Compatibilidade universal
    frameRate: 30,           // ✅ NOVO: Frame rate fixo para compatibilidade de stitching

    // Áudio
    audioCodec: 'aac',
    audioChannels: 2,
    audioSampleRate: 48000,  // ✅ 48kHz padrão profissional

    // GOP (Group of Pictures) - Crítico para stitching
    gopSize: 120,            // ✅ GOP fixo (4 segundos @ 30fps)
    keyintMin: 120,          // ✅ Keyframe mínimo igual ao GOP
    sceneChangeThreshold: 0, // ✅ Desabilitar detecção de mudança de cena

    // HLS Segmentation
    segmentDuration: 4,      // ✅ Segmentos de 4 segundos
    hlsPlaylistType: 'vod',  // Video On Demand
    hlsSegmentType: 'mpegts',
    hlsFlags: 'independent_segments+append_list', // ✅ CRÍTICO para stitching
} as const;

/**
 * ✅ RESOLUÇÕES FIXAS com bitrates consistentes
 * Ordenadas da maior para menor qualidade
 */
export const FIXED_RESOLUTIONS: Resolution[] = [
    { name: '1080p', width: 1920, height: 1080, videoBitrate: '5000k', audioBitrate: '192k' },
    { name: '720p', width: 1280, height: 720, videoBitrate: '2800k', audioBitrate: '128k' },
    { name: '480p', width: 854, height: 480, videoBitrate: '1400k', audioBitrate: '128k' },
    { name: '360p', width: 640, height: 360, videoBitrate: '800k', audioBitrate: '96k' },
] as const;

/**
 * Mapeamento de resoluções para dimensões (usado em playlists)
 */
export const RESOLUTION_DIMENSIONS: Record<string, string> = {
    '1080p': '1920x1080',
    '720p': '1280x720',
    '480p': '854x480',
    '360p': '640x360',
} as const;

/**
 * Mapeamento de bandwidth estimado por resolução (em bps)
 */
export const RESOLUTION_BANDWIDTH: Record<string, number> = {
    '1080p': 5192000,  // 5000k video + 192k audio
    '720p': 2928000,   // 2800k video + 128k audio
    '480p': 1528000,   // 1400k video + 128k audio
    '360p': 896000,    // 800k video + 96k audio
} as const;

/**
 * ✅ CONFIGURAÇÕES HLS.js para stitching
 */
export const HLS_PLAYER_CONFIG = {
    debug: false,
    enableWorker: true,
    lowLatencyMode: false,

    // Buffer settings
    maxBufferLength: 30,
    maxMaxBufferLength: 600,
    maxBufferSize: 60 * 1000 * 1000, // 60MB
    maxBufferHole: 0.5,
    backBufferLength: 90,

    // Stitching support
    enableDateRange: false,
    forceKeyFrameOnDiscontinuity: true,

    // Retry policies
    manifestLoadPolicy: {
        default: {
            maxNumRetry: 3,
            retryDelayMs: 1000,
            maxRetryDelayMs: 8000,
        }
    },

    fragLoadPolicy: {
        default: {
            maxNumRetry: 6,
            retryDelayMs: 1000,
            maxRetryDelayMs: 8000,
        }
    },
} as const;

/**
 * Configurações de upload
 */
export const UPLOAD_CONFIG = {
    maxFileSize: 500 * 1024 * 1024, // 500MB
    allowedMimeTypes: [
        'video/mp4',
        'video/mpeg',
        'video/quicktime',
        'video/x-msvideo',
        'video/webm',
    ] as const,
} as const;

/**
 * Configurações de limpeza de playlists stitched
 */
export const STITCHED_CLEANUP = {
    maxAgeMs: 6 * 3600000, // 6 horas
    cleanupIntervalMs: 1800000, // 30 minutos
} as const;

/**
 * Versões de playlist HLS
 */
export const HLS_VERSION = {
    master: 3,
    variant: 3,
} as const;

/**
 * Configurações de thumbnail
 */
export const THUMBNAIL_CONFIG = {
    width: 640,
    scale: 'scale=640:-1', // Manter aspect ratio
    quality: 2, // 1-31 (menor = melhor)
    timeInSeconds: 2, // Capturar aos 2 segundos
} as const;
