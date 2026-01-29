/**
 * ✅ Script para re-transcodificar todos os vídeos existentes
 * com configurações normalizadas para compatibilidade de stitching
 * 
 * Uso: npx ts-node src/scripts/retranscode-all.ts
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { ENCODING_PARAMS, FIXED_RESOLUTIONS, RESOLUTION_BANDWIDTH, RESOLUTION_DIMENSIONS, HLS_VERSION } from '../config/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HLS_DIR = path.join(__dirname, '../../uploads/hls');

interface VideoInfo {
    id: string;
    path: string;
    hasSegments: boolean;
    currentFps?: number;
    needsRetranscode: boolean;
}

/**
 * Analisar um segmento .ts para obter informações do vídeo
 */
async function analyzeSegment(segmentPath: string): Promise<{ fps: number; codec: string } | null> {
    return new Promise((resolve) => {
        const ffprobe = spawn('ffprobe', [
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=r_frame_rate,codec_name',
            '-of', 'json',
            segmentPath
        ]);

        let stdout = '';
        ffprobe.stdout.on('data', (data) => { stdout += data.toString(); });
        ffprobe.on('close', (code) => {
            if (code !== 0) {
                resolve(null);
                return;
            }
            try {
                const data = JSON.parse(stdout);
                const stream = data.streams?.[0];
                if (stream) {
                    const fpsMatch = stream.r_frame_rate?.match(/(\d+)\/(\d+)/);
                    const fps = fpsMatch ? parseInt(fpsMatch[1]) / parseInt(fpsMatch[2]) : 0;
                    resolve({ fps: Math.round(fps), codec: stream.codec_name });
                } else {
                    resolve(null);
                }
            } catch {
                resolve(null);
            }
        });
    });
}

/**
 * Concatenar todos os segmentos .ts de um vídeo em um arquivo temporário
 */
async function concatenateSegments(videoDir: string, videoId: string): Promise<string | null> {
    console.log(`  📦 Concatenando segmentos...`);

    const files = await fs.readdir(videoDir);
    // Pegar segmentos 720p (ou a resolução disponível)
    const segments = files
        .filter(f => f.endsWith('.ts') && !f.includes('_stitched'))
        .sort();

    if (segments.length === 0) {
        console.log(`  ⚠️ Nenhum segmento encontrado`);
        return null;
    }

    // Usar a resolução mais alta disponível
    const resolutions = ['1080p', '720p', '480p', '360p'];
    let selectedRes = '';
    for (const res of resolutions) {
        if (segments.some(s => s.includes(`_${res}_`))) {
            selectedRes = res;
            break;
        }
    }

    if (!selectedRes) {
        console.log(`  ⚠️ Nenhuma resolução padrão encontrada`);
        return null;
    }

    const resSegments = segments.filter(s => s.includes(`_${selectedRes}_`)).sort();
    console.log(`  📹 Usando ${resSegments.length} segmentos ${selectedRes}`);

    // Criar arquivo de lista para ffmpeg concat
    const listPath = path.join(videoDir, '_concat_list.txt');
    const listContent = resSegments.map(s => `file '${s}'`).join('\n');
    await fs.writeFile(listPath, listContent);

    // Concatenar em um arquivo temporário
    const outputPath = path.join(videoDir, '_temp_concat.ts');

    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', [
            '-f', 'concat',
            '-safe', '0',
            '-i', listPath,
            '-c', 'copy',
            '-y',
            outputPath
        ], { cwd: videoDir });

        ffmpeg.on('close', async (code) => {
            // Limpar arquivo de lista
            await fs.unlink(listPath).catch(() => { });

            if (code === 0) {
                resolve(outputPath);
            } else {
                resolve(null);
            }
        });
    });
}

/**
 * Re-transcodificar um vídeo com configurações normalizadas
 */
async function retranscodeVideo(videoDir: string, videoId: string, inputPath: string): Promise<boolean> {
    console.log(`  🔄 Re-transcodificando com fps=${ENCODING_PARAMS.frameRate}...`);

    // Backup dos arquivos antigos
    const backupDir = path.join(videoDir, '_backup');
    await fs.mkdir(backupDir, { recursive: true });

    const files = await fs.readdir(videoDir);
    for (const file of files) {
        if (file.endsWith('.ts') || file.endsWith('.m3u8')) {
            if (!file.startsWith('_')) {
                await fs.rename(
                    path.join(videoDir, file),
                    path.join(backupDir, file)
                ).catch(() => { });
            }
        }
    }

    // Processar cada resolução
    const resolutions = FIXED_RESOLUTIONS.filter(res => res.name === '720p' || res.name === '480p' || res.name === '360p');

    let success = true;

    for (const resolution of resolutions) {
        const variantName = `${videoId}_${resolution.name}`;
        const playlistPath = path.join(videoDir, `${variantName}.m3u8`);

        console.log(`    🎬 Processando ${resolution.name}...`);

        const result = await new Promise<boolean>((resolve) => {
            const args = [
                '-i', inputPath,
                '-c:v', ENCODING_PARAMS.videoCodec,
                '-profile:v', ENCODING_PARAMS.profile,
                '-level', ENCODING_PARAMS.level,
                '-preset', 'fast', // Mais rápido para re-transcodificação
                '-pix_fmt', ENCODING_PARAMS.pixelFormat,
                '-r', String(ENCODING_PARAMS.frameRate),
                '-vf', `scale=${resolution.width}:${resolution.height}:force_original_aspect_ratio=decrease,pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2:black,fps=${ENCODING_PARAMS.frameRate}`,
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
                '-hls_segment_filename', path.join(videoDir, `${variantName}_%03d.ts`),
                '-y',
                playlistPath
            ];

            const ffmpeg = spawn('ffmpeg', args);

            let stderr = '';
            ffmpeg.stderr.on('data', (data) => { stderr += data.toString(); });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    console.log(`    ✅ ${resolution.name} concluído`);
                    resolve(true);
                } else {
                    console.error(`    ❌ ${resolution.name} falhou`);
                    resolve(false);
                }
            });
        });

        if (!result) {
            success = false;
            break;
        }
    }

    // Criar master playlist
    if (success) {
        const masterPath = path.join(videoDir, `${videoId}.m3u8`);
        const masterContent = [
            '#EXTM3U',
            `#EXT-X-VERSION:${HLS_VERSION.master}`,
            ...resolutions.map(res => {
                const bandwidth = RESOLUTION_BANDWIDTH[res.name] || 2928000;
                const dimensions = RESOLUTION_DIMENSIONS[res.name] || '1280x720';
                return `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${dimensions}\n${videoId}_${res.name}.m3u8`;
            })
        ].join('\n');

        await fs.writeFile(masterPath, masterContent);
        console.log(`  ✅ Master playlist criada`);
    }

    // Limpar arquivo temporário
    await fs.unlink(inputPath).catch(() => { });

    // Se sucesso, remover backup; se falhou, restaurar
    if (success) {
        await fs.rm(backupDir, { recursive: true, force: true }).catch(() => { });
    } else {
        // Restaurar backup
        const backupFiles = await fs.readdir(backupDir).catch(() => []);
        for (const file of backupFiles) {
            await fs.rename(
                path.join(backupDir, file),
                path.join(videoDir, file)
            ).catch(() => { });
        }
        await fs.rm(backupDir, { recursive: true, force: true }).catch(() => { });
    }

    return success;
}

/**
 * Função principal
 */
async function main() {
    console.log('\n🎬 ===== RE-TRANSCODIFICAÇÃO DE VÍDEOS =====\n');
    console.log(`📁 Diretório HLS: ${HLS_DIR}`);
    console.log(`🎯 Frame rate alvo: ${ENCODING_PARAMS.frameRate} fps`);
    console.log(`🔧 Codec: ${ENCODING_PARAMS.videoCodec} (${ENCODING_PARAMS.profile} @ ${ENCODING_PARAMS.level})`);
    console.log(`🔊 Áudio: ${ENCODING_PARAMS.audioCodec} @ ${ENCODING_PARAMS.audioSampleRate}Hz\n`);

    // Listar todos os diretórios de vídeo
    const entries = await fs.readdir(HLS_DIR, { withFileTypes: true });
    const videoDirs = entries
        .filter(e => e.isDirectory() && !e.name.startsWith('_'))
        .map(e => e.name);

    console.log(`📊 Encontrados ${videoDirs.length} vídeos para analisar\n`);

    // Analisar cada vídeo
    const videos: VideoInfo[] = [];

    for (const videoId of videoDirs) {
        const videoDir = path.join(HLS_DIR, videoId);
        const files = await fs.readdir(videoDir);
        const segments = files.filter(f => f.endsWith('.ts') && !f.startsWith('_'));

        if (segments.length === 0) {
            console.log(`⚠️ ${videoId.slice(0, 8)}... - Sem segmentos`);
            continue;
        }

        // Analisar primeiro segmento
        const firstSegment = segments.sort()[0];
        const info = await analyzeSegment(path.join(videoDir, firstSegment));

        const needsRetranscode = info ? info.fps !== ENCODING_PARAMS.frameRate : true;

        videos.push({
            id: videoId,
            path: videoDir,
            hasSegments: true,
            currentFps: info?.fps,
            needsRetranscode
        });

        const status = needsRetranscode ? '❌ Precisa re-transcodificar' : '✅ OK';
        console.log(`${status} - ${videoId.slice(0, 8)}... (${info?.fps || '?'} fps)`);
    }

    // Filtrar vídeos que precisam re-transcodificação
    const toRetranscode = videos.filter(v => v.needsRetranscode);

    console.log(`\n📊 Resumo:`);
    console.log(`   Total de vídeos: ${videos.length}`);
    console.log(`   Precisam re-transcodificação: ${toRetranscode.length}`);
    console.log(`   Já compatíveis: ${videos.length - toRetranscode.length}\n`);

    if (toRetranscode.length === 0) {
        console.log('✅ Todos os vídeos já estão compatíveis!\n');
        return;
    }

    // Confirmar antes de continuar
    console.log('🚀 Iniciando re-transcodificação...\n');

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < toRetranscode.length; i++) {
        const video = toRetranscode[i];
        console.log(`\n[${i + 1}/${toRetranscode.length}] 🎬 ${video.id.slice(0, 8)}... (${video.currentFps} fps → ${ENCODING_PARAMS.frameRate} fps)`);

        // Concatenar segmentos
        const concatenated = await concatenateSegments(video.path, video.id);

        if (!concatenated) {
            console.log(`  ❌ Falha ao concatenar segmentos`);
            failCount++;
            continue;
        }

        // Re-transcodificar
        const success = await retranscodeVideo(video.path, video.id, concatenated);

        if (success) {
            successCount++;
            console.log(`  ✅ Re-transcodificação concluída!`);
        } else {
            failCount++;
            console.log(`  ❌ Falha na re-transcodificação`);
        }
    }

    console.log(`\n\n🏁 ===== RESULTADO FINAL =====`);
    console.log(`✅ Sucesso: ${successCount}`);
    console.log(`❌ Falhas: ${failCount}`);
    console.log(`📊 Total: ${toRetranscode.length}\n`);
}

// Executar
main().catch(console.error);
