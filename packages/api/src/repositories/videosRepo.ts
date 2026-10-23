import type pg from 'pg';
import { getPool } from '../db/pool.js';
import type { VideoMetadata, HLSVariant } from '../services/ffmpegService.js';

export type VideoStatus = 'uploaded' | 'processing' | 'ready' | 'error';

/**
 * Representação canônica de um vídeo na API, independente do mecanismo de
 * persistência. Atende RF03/RF04 mantendo o status do processamento e os
 * metadados extraídos pelo ffprobe, e suporta RA5 ao persistir o registro
 * na tabela `videos` quando há banco disponível.
 */
export interface VideoRecord {
    id: string;
    originalName: string;
    tempPath: string;
    status: VideoStatus;
    metadata: VideoMetadata;
    fileSize?: number;
    hlsUrl?: string;
    thumbnailUrl?: string;
    variants?: HLSVariant[];
    uploadedAt: string;
    processedAt?: string;
    error?: string;
}

export interface VideosRepository {
    readonly mode: 'postgres' | 'memory';
    list(ownerId: string): Promise<VideoRecord[]>;
    get(id: string, ownerId: string): Promise<VideoRecord | null>;
    insert(video: VideoRecord, ownerId: string): Promise<VideoRecord>;
    update(id: string, ownerId: string, partial: Partial<VideoRecord>): Promise<VideoRecord | null>;
    count(): Promise<number>;
    sumFileSizeByOwner(ownerId: string): Promise<number>;
}

interface VideoRow {
    id: string;
    original_filename: string;
    storage_path: string;
    hls_path: string | null;
    thumbnail_path: string | null;
    duration_seconds: string | number | null;
    file_size_bytes: string | number | null;
    status: VideoStatus;
    processing_progress: number | null;
    metadata: VideoRowMetadata | null;
    created_at: Date;
    updated_at: Date;
}

interface VideoRowMetadata {
    width?: number;
    height?: number;
    fps?: number;
    codec?: string;
    bitrate?: number;
    hasAudio?: boolean;
    variants?: HLSVariant[];
    uploadedAt?: string;
    processedAt?: string;
    error?: string;
}

function rowToVideo(row: VideoRow): VideoRecord {
    const md = row.metadata ?? {};
    const duration = row.duration_seconds != null ? Number(row.duration_seconds) : 0;

    return {
        id: row.id,
        originalName: row.original_filename,
        tempPath: row.storage_path,
        status: row.status,
        metadata: {
            width: md.width ?? 0,
            height: md.height ?? 0,
            duration,
            fps: md.fps ?? 0,
            codec: md.codec ?? '',
            bitrate: md.bitrate ?? 0,
            hasAudio: md.hasAudio ?? true,
        },
        fileSize: row.file_size_bytes != null ? Number(row.file_size_bytes) : undefined,
        hlsUrl: row.hls_path ?? undefined,
        thumbnailUrl: row.thumbnail_path ?? undefined,
        variants: md.variants,
        uploadedAt: md.uploadedAt ?? row.created_at.toISOString(),
        processedAt: md.processedAt,
        error: md.error,
    };
}

function videoToMetadataJson(v: VideoRecord): VideoRowMetadata {
    return {
        width: v.metadata.width,
        height: v.metadata.height,
        fps: v.metadata.fps,
        codec: v.metadata.codec,
        bitrate: v.metadata.bitrate,
        hasAudio: v.metadata.hasAudio,
        variants: v.variants,
        uploadedAt: v.uploadedAt,
        processedAt: v.processedAt,
        error: v.error,
    };
}

function createDbRepository(pool: pg.Pool): VideosRepository {
    return {
        mode: 'postgres',

        async list(ownerId) {
            const r = await pool.query<VideoRow>(
                `SELECT id, original_filename, storage_path, hls_path, thumbnail_path,
                        duration_seconds, file_size_bytes, status, processing_progress,
                        metadata, created_at, updated_at
                 FROM videos WHERE owner_id = $1
                 ORDER BY created_at DESC`
                , [ownerId]
            );
            return r.rows.map(rowToVideo);
        },

        async get(id, ownerId) {
            const r = await pool.query<VideoRow>(
                `SELECT id, original_filename, storage_path, hls_path, thumbnail_path,
                        duration_seconds, file_size_bytes, status, processing_progress,
                        metadata, created_at, updated_at
                 FROM videos
                 WHERE id = $1 AND owner_id = $2`,
                [id, ownerId]
            );
            const row = r.rows[0];
            return row ? rowToVideo(row) : null;
        },

        async insert(video, ownerId) {
            const r = await pool.query<VideoRow>(
                `INSERT INTO videos (
                    id, original_filename, storage_path, hls_path, thumbnail_path,
                    duration_seconds, file_size_bytes, status, metadata, owner_id
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
                 RETURNING id, original_filename, storage_path, hls_path, thumbnail_path,
                           duration_seconds, file_size_bytes, status, processing_progress,
                           metadata, created_at, updated_at`,
                [
                    video.id,
                    video.originalName,
                    video.tempPath,
                    video.hlsUrl ?? null,
                    video.thumbnailUrl ?? null,
                    video.metadata.duration ?? null,
                    video.fileSize ?? null,
                    video.status,
                    JSON.stringify(videoToMetadataJson(video)),
                    ownerId,
                ]
            );
            return rowToVideo(r.rows[0]);
        },

        async update(id, ownerId, partial) {
            const existing = await this.get(id, ownerId);
            if (!existing) return null;

            const merged: VideoRecord = { ...existing, ...partial };

            const r = await pool.query<VideoRow>(
                `UPDATE videos SET
                    original_filename = $2,
                    storage_path = $3,
                    hls_path = $4,
                    thumbnail_path = $5,
                    duration_seconds = $6,
                    file_size_bytes = $7,
                    status = $8,
                    metadata = $9::jsonb
                 WHERE id = $1 AND owner_id = $10
                 RETURNING id, original_filename, storage_path, hls_path, thumbnail_path,
                           duration_seconds, file_size_bytes, status, processing_progress,
                           metadata, created_at, updated_at`,
                [
                    id,
                    merged.originalName,
                    merged.tempPath,
                    merged.hlsUrl ?? null,
                    merged.thumbnailUrl ?? null,
                    merged.metadata.duration ?? null,
                    merged.fileSize ?? null,
                    merged.status,
                    JSON.stringify(videoToMetadataJson(merged)),
                    ownerId,
                ]
            );
            const row = r.rows[0];
            return row ? rowToVideo(row) : null;
        },

        async count() {
            const r = await pool.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM videos`);
            return r.rows[0]?.c ?? 0;
        },

        async sumFileSizeByOwner(ownerId) {
            const r = await pool.query<{ total: string | number }>(
                `SELECT COALESCE(SUM(file_size_bytes), 0) AS total FROM videos WHERE owner_id = $1`,
                [ownerId]
            );
            return Number(r.rows[0]?.total ?? 0);
        },
    };
}

function createMemoryRepository(): VideosRepository {
    const store: Map<string, { video: VideoRecord; ownerId: string }> = new Map();

    return {
        mode: 'memory',

        async list(ownerId) {
            return Array.from(store.values()).filter((v) => v.ownerId === ownerId).map((v) => v.video);
        },

        async get(id, ownerId) {
            const value = store.get(id);
            return value?.ownerId === ownerId ? value.video : null;
        },

        async insert(video, ownerId) {
            store.set(video.id, { video, ownerId });
            return video;
        },

        async update(id, ownerId, partial) {
            const existing = store.get(id);
            if (!existing || existing.ownerId !== ownerId) return null;
            const merged = { ...existing.video, ...partial };
            store.set(id, { video: merged, ownerId });
            return merged;
        },

        async count() {
            return store.size;
        },

        async sumFileSizeByOwner(ownerId) {
            return Array.from(store.values())
                .filter((value) => value.ownerId === ownerId)
                .reduce((total, value) => total + (value.video.fileSize ?? 0), 0);
        },
    };
}

let cached: VideosRepository | null = null;

export function getVideosRepository(): VideosRepository {
    if (cached) return cached;
    const pool = getPool();
    if (pool) {
        console.log('🎞️ Videos: persistência em PostgreSQL ativa');
        cached = createDbRepository(pool);
    } else {
        console.warn('⚠️ Videos: DATABASE_URL não definido — usando armazenamento em memória (não persiste entre reinícios)');
        cached = createMemoryRepository();
    }
    return cached;
}
