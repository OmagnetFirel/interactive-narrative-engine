import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import {
    ENCODING_PARAMS,
    FIXED_RESOLUTIONS,
    RESOLUTION_BANDWIDTH,
    RESOLUTION_DIMENSIONS,
    HLS_VERSION,
} from '../config/constants.js';
import { STITCHING_RESOLUTION, probeVideoSegment } from './videoCompatibilityService.js';

async function concatenateSegments(videoDir: string): Promise<string | null> {
    const files = await fs.readdir(videoDir);
    const segments = files
        .filter((f) => f.endsWith('.ts') && f.includes(`_${STITCHING_RESOLUTION}_`))
        .sort();

    if (segments.length === 0) return null;

    const listPath = path.join(videoDir, '_concat_list.txt');
    await fs.writeFile(listPath, segments.map((s) => `file '${s}'`).join('\n'));

    const outputPath = path.join(videoDir, '_temp_concat.ts');

    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', [
            '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-y', outputPath,
        ], { cwd: videoDir });

        ffmpeg.on('close', async (code) => {
            await fs.unlink(listPath).catch(() => {});
            resolve(code === 0 ? outputPath : null);
        });
    });
}

async function retranscodeFromFile(videoDir: string, videoId: string, inputPath: string): Promise<boolean> {
    const backupDir = path.join(videoDir, '_backup');
    await fs.mkdir(backupDir, { recursive: true });

    const files = await fs.readdir(videoDir);
    for (const file of files) {
        if ((file.endsWith('.ts') || file.endsWith('.m3u8')) && !file.startsWith('_')) {
            await fs.rename(path.join(videoDir, file), path.join(backupDir, file)).catch(() => {});
        }
    }

    const resolutions = FIXED_RESOLUTIONS.filter((r) =>
        ['360p', '480p', '720p'].includes(r.name)
    );

    for (const resolution of resolutions) {
        const variantName = `${videoId}_${resolution.name}`;
        const playlistPath = path.join(videoDir, `${variantName}.m3u8`);
        const vf = `scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2:black,fps=${ENCODING_PARAMS.frameRate}`;

        const ok = await new Promise<boolean>((resolve) => {
            const args = [
                '-i', inputPath,
                '-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=${ENCODING_PARAMS.audioSampleRate}`,
                '-map', '0:v:0', '-map', '1:a:0', '-shortest',
                '-c:v', ENCODING_PARAMS.videoCodec,
                '-profile:v', ENCODING_PARAMS.profile,
                '-level', ENCODING_PARAMS.level,
                '-preset', 'fast',
                '-pix_fmt', ENCODING_PARAMS.pixelFormat,
                '-r', String(ENCODING_PARAMS.frameRate),
                '-vf', vf,
                '-b:v', resolution.videoBitrate,
                '-maxrate', resolution.videoBitrate,
                '-bufsize', `${parseInt(resolution.videoBitrate, 10) * 2}k`,
                '-g', String(ENCODING_PARAMS.gopSize),
                '-keyint_min', String(ENCODING_PARAMS.keyintMin),
                '-sc_threshold', String(ENCODING_PARAMS.sceneChangeThreshold),
                '-c:a', ENCODING_PARAMS.audioCodec,
                '-b:a', resolution.audioBitrate,
                '-ac', String(ENCODING_PARAMS.audioChannels),
                '-ar', String(ENCODING_PARAMS.audioSampleRate),
                '-f', 'hls',
                '-hls_time', String(ENCODING_PARAMS.segmentDuration),
                '-hls_playlist_type', ENCODING_PARAMS.hlsPlaylistType,
                '-hls_segment_type', ENCODING_PARAMS.hlsSegmentType,
                '-hls_flags', ENCODING_PARAMS.hlsFlags,
                '-hls_segment_filename', path.join(videoDir, `${variantName}_%03d.ts`),
                '-y', playlistPath,
            ];

            const ffmpeg = spawn('ffmpeg', args);
            ffmpeg.on('close', (code) => resolve(code === 0));
        });

        if (!ok) {
            const backupFiles = await fs.readdir(backupDir).catch(() => []);
            for (const file of backupFiles) {
                await fs.rename(path.join(backupDir, file), path.join(videoDir, file)).catch(() => {});
            }
            await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});
            await fs.unlink(inputPath).catch(() => {});
            return false;
        }
    }

    const masterPath = path.join(videoDir, `${videoId}.m3u8`);
    const masterContent = [
        '#EXTM3U',
        `#EXT-X-VERSION:${HLS_VERSION.master}`,
        ...resolutions.map((res) => {
            const bandwidth = RESOLUTION_BANDWIDTH[res.name] || 896000;
            const dimensions = RESOLUTION_DIMENSIONS[res.name] || '640x360';
            return `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${dimensions}\n${videoId}_${res.name}.m3u8`;
        }),
    ].join('\n');

    await fs.writeFile(masterPath, masterContent);
    await fs.unlink(inputPath).catch(() => {});
    await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});

    return true;
}

export async function retranscodeAllVideos(hlsBaseDir: string): Promise<{ success: number; failed: number; skipped: number }> {
    const entries = await fs.readdir(hlsBaseDir, { withFileTypes: true });
    const videoIds = entries.filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name);

    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (const videoId of videoIds) {
        const videoDir = path.join(hlsBaseDir, videoId);
        const probe = await probeVideoSegment(hlsBaseDir, videoId);

        if (probe.fps === ENCODING_PARAMS.frameRate && probe.hasAudio && probe.codec === 'h264' && probe.width === 640) {
            skipped++;
            continue;
        }

        console.log(`🔄 Re-transcodificando ${videoId.slice(0, 8)}...`);
        const concatPath = await concatenateSegments(videoDir);
        if (!concatPath) {
            failed++;
            continue;
        }

        const ok = await retranscodeFromFile(videoDir, videoId, concatPath);
        if (ok) success++;
        else failed++;
    }

    return { success, failed, skipped };
}
