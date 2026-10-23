import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { ENCODING_PARAMS } from '../config/constants.js';

export const STITCHING_RESOLUTION = '360p';

export interface SegmentProbe {
    videoId: string;
    exists: boolean;
    segmentPath?: string;
    codec?: string;
    profile?: string;
    width?: number;
    height?: number;
    fps?: number;
    audioCodec?: string;
    audioSampleRate?: number;
    audioChannels?: number;
    hasAudio?: boolean;
    error?: string;
}

async function probeFile(filePath: string): Promise<Omit<SegmentProbe, 'videoId' | 'exists'>> {
    return new Promise((resolve) => {
        const ffprobe = spawn('ffprobe', [
            '-v', 'error',
            '-print_format', 'json',
            '-show_streams',
            filePath,
        ]);

        let stdout = '';
        ffprobe.stdout.on('data', (d) => { stdout += d.toString(); });
        ffprobe.on('close', (code) => {
            if (code !== 0) {
                resolve({ error: 'ffprobe falhou' });
                return;
            }
            try {
                const data = JSON.parse(stdout);
                const video = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
                const audio = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'audio');

                if (!video) {
                    resolve({ error: 'Sem stream de vídeo no segmento' });
                    return;
                }

                const fpsMatch = String(video.r_frame_rate ?? '').match(/(\d+)\/(\d+)/);
                const fps = fpsMatch
                    ? Math.round(parseInt(fpsMatch[1], 10) / parseInt(fpsMatch[2], 10))
                    : undefined;

                resolve({
                    codec: video.codec_name,
                    profile: video.profile,
                    width: video.width,
                    height: video.height,
                    fps,
                    hasAudio: Boolean(audio),
                    audioCodec: audio?.codec_name,
                    audioSampleRate: audio?.sample_rate ? parseInt(audio.sample_rate, 10) : undefined,
                    audioChannels: audio?.channels,
                });
            } catch {
                resolve({ error: 'Falha ao parsear ffprobe' });
            }
        });
    });
}

async function findStitchingSegment(videoDir: string, videoId: string): Promise<string | null> {
    const files = await fs.readdir(videoDir);
    const preferred = files
        .filter((f) => f.endsWith('.ts') && f.includes(`_${STITCHING_RESOLUTION}_`))
        .sort();
    if (preferred.length > 0) {
        return path.join(videoDir, preferred[0]);
    }

    const anyTs = files.filter((f) => f.endsWith('.ts') && !f.includes('_stitched')).sort();
    return anyTs.length > 0 ? path.join(videoDir, anyTs[0]) : null;
}

export async function probeVideoSegment(
    hlsBaseDir: string,
    videoId: string
): Promise<SegmentProbe> {
    const videoDir = path.join(hlsBaseDir, videoId);

    try {
        await fs.access(videoDir);
    } catch {
        return { videoId, exists: false, error: 'Diretório não encontrado' };
    }

    const segmentPath = await findStitchingSegment(videoDir, videoId);
    if (!segmentPath) {
        return { videoId, exists: true, error: `Sem segmento ${STITCHING_RESOLUTION}` };
    }

    const probe = await probeFile(segmentPath);
    return { videoId, exists: true, segmentPath, ...probe };
}

export interface CompatibilityReport {
    compatible: boolean;
    resolution: string;
    videos: SegmentProbe[];
    issues: string[];
}

export async function checkVideosCompatibility(
    hlsBaseDir: string,
    videoIds: string[]
): Promise<CompatibilityReport> {
    const videos = await Promise.all(videoIds.map((id) => probeVideoSegment(hlsBaseDir, id)));
    const issues: string[] = [];
    const valid = videos.filter((v) => v.exists && !v.error && v.codec);

    if (valid.length < videoIds.length) {
        for (const v of videos) {
            if (!v.exists || v.error) {
                issues.push(`${v.videoId.slice(0, 8)}: ${v.error ?? 'não encontrado'}`);
            }
        }
    }

    if (valid.length < 2) {
        return { compatible: valid.length > 0, resolution: STITCHING_RESOLUTION, videos, issues };
    }

    const ref = valid[0];
    const expected = {
        codec: ref.codec,
        width: ref.width,
        height: ref.height,
        fps: ref.fps,
        hasAudio: ref.hasAudio,
        audioCodec: ref.audioCodec,
        audioSampleRate: ref.audioSampleRate,
        audioChannels: ref.audioChannels,
    };

    for (const v of valid.slice(1)) {
        if (v.codec !== expected.codec) {
            issues.push(`${v.videoId.slice(0, 8)}: codec ${v.codec} ≠ ${expected.codec}`);
        }
        if (v.width !== expected.width || v.height !== expected.height) {
            issues.push(`${v.videoId.slice(0, 8)}: ${v.width}x${v.height} ≠ ${expected.width}x${expected.height}`);
        }
        if (v.fps !== expected.fps) {
            issues.push(`${v.videoId.slice(0, 8)}: ${v.fps}fps ≠ ${expected.fps}fps`);
        }
        if (Boolean(v.hasAudio) !== Boolean(expected.hasAudio)) {
            issues.push(`${v.videoId.slice(0, 8)}: áudio ${v.hasAudio ? 'sim' : 'não'} ≠ ${expected.hasAudio ? 'sim' : 'não'}`);
        }
        if (v.hasAudio && expected.hasAudio) {
            if (v.audioSampleRate !== expected.audioSampleRate) {
                issues.push(`${v.videoId.slice(0, 8)}: áudio ${v.audioSampleRate}Hz ≠ ${expected.audioSampleRate}Hz`);
            }
            if (v.audioChannels !== expected.audioChannels) {
                issues.push(`${v.videoId.slice(0, 8)}: ${v.audioChannels}ch ≠ ${expected.audioChannels}ch`);
            }
        }
    }

    const compatible = issues.length === 0;

    if (!compatible) {
        issues.push(
            `Re-transcodifique com POST /api/videos/retranscode-all (perfil ${ENCODING_PARAMS.profile}, ${ENCODING_PARAMS.frameRate}fps, ${STITCHING_RESOLUTION})`
        );
    }

    return { compatible, resolution: STITCHING_RESOLUTION, videos, issues };
}

export async function assertVideosCompatible(hlsBaseDir: string, videoIds: string[]): Promise<void> {
    if (videoIds.length < 2) return;

    const report = await checkVideosCompatibility(hlsBaseDir, videoIds);
    if (!report.compatible) {
        const err = new Error(report.issues.join('; ')) as Error & { code?: string; report?: CompatibilityReport };
        err.code = 'INCOMPATIBLE_VIDEOS';
        err.report = report;
        throw err;
    }
}
