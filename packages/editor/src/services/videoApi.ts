import axios from 'axios';
import { API_URL, UPLOAD_API_URL, api } from './api';

axios.interceptors.response.use(undefined, async (error) => {
    const config = error.config as (typeof error.config & { _authRetried?: boolean }) | undefined;
    if (error.response?.status === 401 && config && !config._authRetried) {
        config._authRetried = true;
        const user = await api.refresh();
        if (user) {
            config.headers = { ...config.headers, ...api.getAuthHeaders() };
            return axios(config);
        }
    }
    return Promise.reject(error);
});

export interface UploadProgress {
    percent: number;
    loaded: number;
    total: number;
}

export interface VideoMetadata {
    duration: number;
    width: number;
    height: number;
    size: number;
}

export interface VideoStatus {
    videoId: string;
    status: 'uploaded' | 'processing' | 'ready' | 'error';
    hlsUrl?: string;
    thumbnailUrl?: string;
    metadata?: VideoMetadata;
    error?: string;
}

export interface VideoInfo {
    id: string;
    originalName: string;
    status: string;
    hlsUrl?: string;
    thumbnailUrl?: string;
    metadata?: VideoMetadata;
    uploadedAt: string;
    processedAt?: string;
}

function authConfig() {
    return { headers: api.getAuthHeaders() };
}

/**
 * Upload de vídeo com progresso usando fetch moderno
 */
export async function uploadVideo(
    file: File,
    onProgress?: (progress: UploadProgress) => void
): Promise<{ videoId: string; metadata: VideoMetadata }> {
    const formData = new FormData();
    formData.append('video', file);

    const response = await axios.post(`${UPLOAD_API_URL}/api/videos/upload`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
            ...api.getAuthHeaders(),
        },
        onUploadProgress: (progressEvent) => {
            if (progressEvent.total && onProgress) {
                onProgress({
                    percent: Math.round((progressEvent.loaded / progressEvent.total) * 100),
                    loaded: progressEvent.loaded,
                    total: progressEvent.total,
                });
            }
        },
    });

    return response.data;
}

/**
 * Iniciar processamento HLS
 */
export async function processVideo(videoId: string): Promise<void> {
    await axios.post(`${API_URL}/api/videos/${videoId}/process`, undefined, authConfig());
}

/**
 * Verificar status do processamento
 */
export async function getVideoStatus(videoId: string): Promise<VideoStatus> {
    const response = await axios.get(`${API_URL}/api/videos/${videoId}/status`, authConfig());
    return response.data;
}

/**
 * Listar todos os vídeos
 */
export async function listVideos(): Promise<VideoInfo[]> {
    const response = await axios.get(`${API_URL}/api/videos`, authConfig());
    return response.data.videos;
}

/**
 * Polling de status até conclusão
 */
export async function waitForProcessing(
    videoId: string,
    onStatusChange?: (status: VideoStatus) => void,
    intervalMs: number = 2000
): Promise<VideoStatus> {
    return new Promise((resolve, reject) => {
        const check = async () => {
            try {
                const status = await getVideoStatus(videoId);
                onStatusChange?.(status);

                if (status.status === 'ready') {
                    resolve(status);
                } else if (status.status === 'error') {
                    reject(new Error(status.error || 'Erro no processamento'));
                } else {
                    setTimeout(check, intervalMs);
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                reject(error);
            }
        };

        check();
    });
}
