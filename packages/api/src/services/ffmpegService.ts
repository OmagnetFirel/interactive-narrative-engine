import { spawn, exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { promisify } from 'util';
import {
    ENCODING_PARAMS,
    FIXED_RESOLUTIONS,
    RESOLUTION_DIMENSIONS,
    RESOLUTION_BANDWIDTH,
    THUMBNAIL_CONFIG,
    HLS_VERSION,
    type Resolution
} from '../config/constants.js';

const execPromise = promisify(exec);

export interface VideoMetadata {
    width: number;
    height: number;
    duration: number;
    fps: number;
    codec: string;
    bitrate: number;
    hasAudio: boolean;
}

export interface HLSVariant {
    resolution: string;
    bandwidth: number;
    playlist: string;
}

export interface HLSOutput {
    masterPlaylist: string;
    variants: HLSVariant[];
    thumbnailUrl: string;
}

/**
 * Parse do frame rate emitido pelo ffprobe (ex.: "30/1", "30000/1001", "30")
 */
function parseFps(rate: string | undefined): number {
    if (!rate) return 24;
    const [num, den] = rate.split('/').map(Number);
    if (!num) return 24;
    return den ? num / den : num;
}

/**
 * Obter metadados do vídeo usando ffprobe
 */
export async function getVideoMetadata(inputPath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
        const ffprobe = spawn('ffprobe', [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            inputPath
        ]);

        let stdout = '';
        let stderr = '';

        ffprobe.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        ffprobe.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        ffprobe.on('close', (code) => {
            if (code !== 0) {
                return reject(new Error(`ffprobe failed: ${stderr}`));
            }

            try {
                const data = JSON.parse(stdout);
                const videoStream = data.streams.find((s: any) => s.codec_type === 'video');
                const audioStream = data.streams.find((s: any) => s.codec_type === 'audio');

                if (!videoStream) {
                    return reject(new Error('No video stream found'));
                }

                const metadata: VideoMetadata = {
                    width: videoStream.width,
                    height: videoStream.height,
                    duration: parseFloat(data.format.duration),
                    fps: parseFps(videoStream.r_frame_rate),
                    codec: videoStream.codec_name,
                    bitrate: parseInt(data.format.bit_rate) || 0,
                    hasAudio: Boolean(audioStream),
                };

                resolve(metadata);
            } catch (error) {
                reject(error);
            }
        });
    });
}

/**
 * ✅ Determinar resoluções ótimas (não maiores que o original)
 * CORREÇÃO: Sempre retorna pelo menos uma resolução (a menor disponível)
 */
function getOptimalResolutions(metadata: VideoMetadata): Resolution[] {
    const validResolutions = FIXED_RESOLUTIONS.filter(res => {
        // Incluir apenas resoluções menores ou iguais ao original
        return res.width <= metadata.width && res.height <= metadata.height;
    });

    // ✅ CORREÇÃO: Se nenhuma resolução é menor que o original,
    // usar a menor resolução disponível (360p) e fazer upscale
    if (validResolutions.length === 0) {
        console.log(`⚠️ Vídeo muito pequeno (${metadata.width}x${metadata.height}), usando resolução mínima`);
        // Retornar apenas a menor resolução
        const smallestRes = FIXED_RESOLUTIONS[FIXED_RESOLUTIONS.length - 1]; // 360p
        return [smallestRes];
    }

    return validResolutions;
}

/**
 * ✅ Processar uma resolução específica com parâmetros normalizados para stitching
 */
async function processResolution(
    inputPath: string,
    outputDir: string,
    videoId: string,
    resolution: Resolution,
    metadata: VideoMetadata,
    onProgress?: (percent: number) => void
): Promise<HLSVariant> {
    const variantName = `${videoId}_${resolution.name}`;
    const playlistPath = path.join(outputDir, `${variantName}.m3u8`);

    console.log(`\n🔄 Processando ${resolution.name} (${resolution.width}x${resolution.height})...`);

    return new Promise((resolve, reject) => {
        const vf = `scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2:black,fps=${ENCODING_PARAMS.frameRate}`;

        const args: string[] = metadata.hasAudio
            ? ['-i', inputPath, '-map', '0:v:0', '-map', '0:a:0?']
            : [
                '-i', inputPath,
                '-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=${ENCODING_PARAMS.audioSampleRate}`,
                '-map', '0:v:0', '-map', '1:a:0',
                '-shortest',
            ];

        args.push(
            // ✅ VÍDEO: Parâmetros normalizados para stitching
            '-c:v', ENCODING_PARAMS.videoCodec,
            '-profile:v', ENCODING_PARAMS.profile,
            '-level', ENCODING_PARAMS.level,
            '-preset', ENCODING_PARAMS.preset,
            '-pix_fmt', ENCODING_PARAMS.pixelFormat,
            '-r', String(ENCODING_PARAMS.frameRate),
            '-vf', vf,
            '-b:v', resolution.videoBitrate,
            '-maxrate', resolution.videoBitrate,
            '-bufsize', `${parseInt(resolution.videoBitrate) * 2}k`,
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
            '-hls_segment_filename', path.join(outputDir, `${variantName}_%03d.ts`),
            playlistPath
        );

        if (!metadata.hasAudio) {
            console.log(`  🔇 Sem faixa de áudio — gerando áudio silencioso estéreo ${ENCODING_PARAMS.audioSampleRate}Hz`);
        }

        console.log(`  🎥 FFmpeg args: -r ${ENCODING_PARAMS.frameRate} -vf "...fps=${ENCODING_PARAMS.frameRate}" ...`);

        const ffmpeg = spawn('ffmpeg', args);

        let stderr = '';

        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString();

            // Extrair progresso
            if (onProgress) {
                const timeMatch = stderr.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
                if (timeMatch) {
                    const hours = parseInt(timeMatch[1]);
                    const minutes = parseInt(timeMatch[2]);
                    const seconds = parseFloat(timeMatch[3]);
                    const currentTime = hours * 3600 + minutes * 60 + seconds;
                    const progress = (currentTime / metadata.duration) * 100;
                    onProgress(Math.min(progress, 99));
                }
            }
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                console.log(`  ✅ ${resolution.name} concluído`);

                const bandwidth = RESOLUTION_BANDWIDTH[resolution.name] ||
                    (parseInt(resolution.videoBitrate) * 1000 + parseInt(resolution.audioBitrate) * 1000);

                resolve({
                    resolution: resolution.name,
                    bandwidth,
                    playlist: `${variantName}.m3u8`
                });
            } else {
                console.error(`  ❌ FFmpeg falhou com código ${code}`);
                console.error(`  Stderr: ${stderr.slice(-500)}`);
                reject(new Error(`FFmpeg failed with code ${code}`));
            }
        });

        ffmpeg.on('error', (error) => {
            console.error(`  ❌ Erro ao executar FFmpeg: ${error.message}`);
            reject(error);
        });
    });
}

/**
 * Criar master playlist HLS
 */
async function createMasterPlaylist(
    outputPath: string,
    variants: HLSVariant[]
): Promise<void> {
    const lines = [
        '#EXTM3U',
        `#EXT-X-VERSION:${HLS_VERSION.master}`
    ];

    // Ordenar por bandwidth (maior para menor)
    const sortedVariants = [...variants].sort((a, b) => b.bandwidth - a.bandwidth);

    for (const variant of sortedVariants) {
        const resolution = RESOLUTION_DIMENSIONS[variant.resolution] || '1280x720';
        lines.push(
            `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=${resolution}`,
            variant.playlist
        );
    }

    await fs.writeFile(outputPath, lines.join('\n'));
    console.log(`✅ Master playlist criada: ${outputPath}`);
}

/**
 * Gerar thumbnail do vídeo
 */
async function generateThumbnail(
    inputPath: string,
    outputPath: string,
    timeInSeconds: number = THUMBNAIL_CONFIG.timeInSeconds
): Promise<void> {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-ss', String(timeInSeconds),
            '-i', inputPath,
            '-vframes', '1',
            '-vf', THUMBNAIL_CONFIG.scale,
            '-q:v', String(THUMBNAIL_CONFIG.quality),
            '-y',
            outputPath
        ]);

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ Thumbnail gerada: ${outputPath}`);
                resolve();
            } else {
                reject(new Error(`Thumbnail generation failed with code ${code}`));
            }
        });

        ffmpeg.on('error', reject);
    });
}

/**
 * ✅ Converte vídeo para HLS multi-bitrate com parâmetros normalizados para stitching
 */
export async function convertToHLS(
    inputPath: string,
    outputDir: string,
    videoId: string,
    onProgress?: (percent: number) => void
): Promise<HLSOutput> {
    console.log(`\n🎬 ===== CONVERTENDO PARA HLS (STITCHING COMPATIBLE) =====`);
    console.log(`Input: ${inputPath}`);
    console.log(`Output: ${outputDir}`);

    // Criar diretório de saída
    await fs.mkdir(outputDir, { recursive: true });

    const metadata = await getVideoMetadata(inputPath);
    console.log(`📊 Vídeo: ${metadata.width}x${metadata.height}, ${metadata.duration.toFixed(1)}s, ${metadata.fps}fps`);
    console.log(`📊 Codec: ${metadata.codec}`);

    // Determinar resoluções com base no vídeo original
    const resolutions = getOptimalResolutions(metadata);
    console.log(`🎯 Resoluções a processar: ${resolutions.map(r => r.name).join(', ')}`);
    console.log(`🔧 Parâmetros de encoding (STITCHING COMPATIBLE):`);
    console.log(`   - Codec: ${ENCODING_PARAMS.videoCodec}`);
    console.log(`   - Profile: ${ENCODING_PARAMS.profile}`);
    console.log(`   - Level: ${ENCODING_PARAMS.level}`);
    console.log(`   - GOP Size: ${ENCODING_PARAMS.gopSize} frames`);
    console.log(`   - Audio: ${ENCODING_PARAMS.audioCodec} @ ${ENCODING_PARAMS.audioSampleRate}Hz`);
    console.log(`   - Segment Duration: ${ENCODING_PARAMS.segmentDuration}s`);
    console.log(`   - HLS Flags: ${ENCODING_PARAMS.hlsFlags}`);

    // Processar cada resolução
    const variants: HLSVariant[] = [];

    for (const res of resolutions) {
        const variant = await processResolution(inputPath, outputDir, videoId, res, metadata, onProgress);
        variants.push(variant);
    }

    // Criar master playlist
    const masterPlaylist = path.join(outputDir, `${videoId}.m3u8`);
    await createMasterPlaylist(masterPlaylist, variants);

    // Gerar thumbnail
    const thumbnailPath = path.join(outputDir, `${videoId}_thumb.jpg`);
    try {
        await generateThumbnail(inputPath, thumbnailPath, Math.min(THUMBNAIL_CONFIG.timeInSeconds, metadata.duration / 2));
    } catch (error) {
        console.warn('⚠️ Não foi possível gerar thumbnail:', error);
    }

    console.log(`✅ Conversão HLS concluída!`);
    console.log(`📦 Master playlist: ${masterPlaylist}`);
    console.log(`📹 Variants: ${variants.length}`);

    return {
        masterPlaylist: `${videoId}.m3u8`,
        variants,
        thumbnailUrl: `${videoId}_thumb.jpg`
    };
}

/**
 * Verifica se FFmpeg está instalado
 */
export async function checkFFmpegInstalled(): Promise<boolean> {
    try {
        await execPromise('ffmpeg -version');
        return true;
    } catch {
        return false;
    }
}
