import fs from 'fs/promises';
import path from 'path';
import {
    RESOLUTION_DIMENSIONS,
    RESOLUTION_BANDWIDTH,
    HLS_VERSION,
    STITCHED_CLEANUP,
    type Resolution
} from '../config/constants.js';

interface VideoSegment {
    videoId: string;
    resolution: string; // '360p', '720p', '1080p'
}

interface StitchedPlaylist {
    masterPlaylistUrl: string;
    playlistId: string;
}

/**
 * Parse uma playlist HLS e extrai segmentos
 */
async function parsePlaylist(playlistPath: string): Promise<string[]> {
    const content = await fs.readFile(playlistPath, 'utf-8');
    const lines = content.split('\n');

    const segments: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Linhas que terminam em .ts ou .m4s são segmentos
        if (line.endsWith('.ts') || line.endsWith('.m4s')) {
            segments.push(line);
        }
    }

    return segments;
}

/**
 * Detectar as resoluções disponíveis (playlists) de um diretório de vídeo
 */
async function detectResolutions(videoDir: string): Promise<string[]> {
    const files = await fs.readdir(videoDir);
    return files
        .map(f => f.match(/_(360p|480p|720p|1080p)\.m3u8$/)?.[1])
        .filter((r): r is string => Boolean(r));
}

/**
 * ✅ Criar playlist concatenada com EXT-X-DISCONTINUITY para compatibilidade entre vídeos
 */
async function createStitchedPlaylist(
    videoSegments: VideoSegment[],
    resolution: string,
    outputPath: string,
    baseHlsPath: string
): Promise<void> {
    console.log(`\n  🎬 Criando playlist ${resolution}...`);

    const playlistLines: string[] = [
        '#EXTM3U',
        `#EXT-X-VERSION:${HLS_VERSION.variant}`,
        '#EXT-X-TARGETDURATION:10',
        '#EXT-X-PLAYLIST-TYPE:VOD',
        '#EXT-X-MEDIA-SEQUENCE:0'
    ];

    for (let i = 0; i < videoSegments.length; i++) {
        const segment = videoSegments[i];
        const videoId = segment.videoId;

        console.log(`  📹 Processando vídeo ${i + 1}/${videoSegments.length}: ${videoId}`);

        // Caminho da playlist do vídeo original
        const originalPlaylistPath = path.join(
            baseHlsPath,
            videoId,
            `${videoId}_${resolution}.m3u8`
        );

        console.log(`    Buscando: ${originalPlaylistPath}`);

        // Verificar se existe
        try {
            await fs.access(originalPlaylistPath);
            console.log(`    ✅ Playlist encontrada`);
        } catch {
            throw new Error(`Playlist não encontrada: ${originalPlaylistPath}`);
        }

        // ✅ CORREÇÃO: DISCONTINUITY apenas ENTRE vídeos (não no início, não duplicado)
        if (i > 0) {
            playlistLines.push('#EXT-X-DISCONTINUITY');
            console.log(`    🔀 DISCONTINUITY adicionado (transição ${i} → ${i + 1})`);
        }

        // Ler playlist original
        const content = await fs.readFile(originalPlaylistPath, 'utf-8');
        const lines = content.split('\n');

        let segmentCount = 0;

        // Extrair segmentos e EXTINF
        for (let j = 0; j < lines.length; j++) {
            const line = lines[j].trim();

            // ✅ CRÍTICO: Ignorar headers (incluindo EXT-X-INDEPENDENT-SEGMENTS)
            if (line.startsWith('#EXTM3U') ||
                line.startsWith('#EXT-X-VERSION') ||
                line.startsWith('#EXT-X-TARGETDURATION') ||
                line.startsWith('#EXT-X-PLAYLIST-TYPE') ||
                line.startsWith('#EXT-X-MEDIA-SEQUENCE') ||
                line.startsWith('#EXT-X-INDEPENDENT-SEGMENTS') ||  // ✅ NOVO: Ignorar
                line.startsWith('#EXT-X-DISCONTINUITY') ||         // ✅ NOVO: Ignorar (já adicionamos)
                line.startsWith('#EXT-X-ENDLIST') ||
                line === '') {
                continue;
            }

            // Copiar EXTINF e outros metadados
            if (line.startsWith('#')) {
                playlistLines.push(line);
            }
            // Processar segmento
            else if (line.endsWith('.ts') || line.endsWith('.m4s')) {
                // ✅ Caminho relativo correto
                playlistLines.push(`../../${videoId}/${line}`);
                segmentCount++;
            }
        }

        console.log(`    ✅ ${segmentCount} segmentos adicionados`);
    }

    // Finalizar playlist
    playlistLines.push('#EXT-X-ENDLIST');

    // Escrever arquivo
    await fs.writeFile(outputPath, playlistLines.join('\n'));
    console.log(`  ✅ Playlist ${resolution} salva: ${path.basename(outputPath)}`);
}

/**
 * ✅ Criar playlists stitched para todas as resoluções disponíveis
 */
async function createStitchedMasterPlaylist(
    videoSegments: VideoSegment[],
    stitchId: string,
    baseHlsPath: string
): Promise<StitchedPlaylist> {
    const stitchDir = path.join(baseHlsPath, '_stitched', stitchId);
    await fs.mkdir(stitchDir, { recursive: true });

    console.log(`📂 Diretório stitched criado: ${stitchDir}`);

    // Detectar resoluções comuns a TODOS os vídeos do path (interseção)
    let resolutions: string[] | null = null;
    for (const segment of videoSegments) {
        const videoDir = path.join(baseHlsPath, segment.videoId);
        const available = await detectResolutions(videoDir);
        resolutions = resolutions === null
            ? available
            : resolutions.filter(r => available.includes(r));
    }

    console.log(`📊 Resoluções comuns detectadas: ${resolutions?.join(', ') ?? '(nenhuma)'}`);

    if (!resolutions || resolutions.length === 0) {
        throw new Error(
            `Nenhuma resolução comum entre os vídeos do path. Stitching abortado.`
        );
    }

    // Criar variant playlists para cada resolução
    const variants: Array<{ resolution: string; bandwidth: number; playlist: string }> = [];

    for (const resolution of resolutions) {
        const playlistName = `${stitchId}_${resolution}.m3u8`;
        const playlistPath = path.join(stitchDir, playlistName);

        await createStitchedPlaylist(
            videoSegments,
            resolution,
            playlistPath,
            baseHlsPath
        );

        // Usar bandwidth das constantes
        const bandwidth = RESOLUTION_BANDWIDTH[resolution] || 2000000;

        variants.push({
            resolution,
            bandwidth,
            playlist: playlistName
        });

        console.log(`✅ Playlist ${resolution} criada: ${playlistName} (${bandwidth} bps)`);
    }

    // Criar master playlist
    const masterPlaylistLines = [
        '#EXTM3U',
        `#EXT-X-VERSION:${HLS_VERSION.master}`
    ];

    // Ordenar por bandwidth (maior para menor)
    const sortedVariants = [...variants].sort((a, b) => b.bandwidth - a.bandwidth);

    sortedVariants.forEach(variant => {
        const dimensions = RESOLUTION_DIMENSIONS[variant.resolution] || '1280x720';
        masterPlaylistLines.push(
            `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=${dimensions}`,
            variant.playlist
        );
    });

    const masterPlaylistPath = path.join(stitchDir, `${stitchId}.m3u8`);
    await fs.writeFile(masterPlaylistPath, masterPlaylistLines.join('\n'));

    console.log(`✅ Master playlist criada: ${stitchId}.m3u8`);
    console.log(`📊 Variants criadas: ${sortedVariants.length}`);

    return {
        masterPlaylistUrl: `/hls/_stitched/${stitchId}/${stitchId}.m3u8`,
        playlistId: stitchId
    };
}

/**
 * ✅ Criar playlist stitched para um caminho (path) de nós
 */
export async function createStitchedPlaylistForPath(
    nodePath: string[], // Array de IDs de nós
    baseHlsPath: string
): Promise<StitchedPlaylist> {
    const stitchId = `path_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`\n🎬 ===== CRIANDO PLAYLIST STITCHED (DISCONTINUITY MODE) =====`);
    console.log(`Path: ${nodePath.join(' → ')}`);
    console.log(`Stitch ID: ${stitchId}`);
    console.log(`Modo: HLS com EXT-X-DISCONTINUITY para compatibilidade`);

    // Converter IDs de nós em videoIds (assumindo que nodeId = videoId)
    const videoSegments: VideoSegment[] = nodePath.map(nodeId => ({
        videoId: nodeId,
        resolution: '720p' // Será detectado dinamicamente
    }));

    const result = await createStitchedMasterPlaylist(
        videoSegments,
        stitchId,
        baseHlsPath
    );

    console.log(`✅ Playlist stitched criada com sucesso!`);
    console.log(`🔗 URL: ${result.masterPlaylistUrl}`);

    return result;
}

/**
 * ✅ Limpar playlists stitched antigas (baseado em configuração)
 */
export async function cleanOldStitchedPlaylists(
    baseHlsPath: string,
    maxAgeMs: number = STITCHED_CLEANUP.maxAgeMs
): Promise<void> {
    const stitchedDir = path.join(baseHlsPath, '_stitched');

    try {
        await fs.access(stitchedDir);
    } catch {
        // Diretório não existe ainda
        return;
    }

    try {
        const dirs = await fs.readdir(stitchedDir);
        const now = Date.now();
        let removedCount = 0;

        for (const dir of dirs) {
            const dirPath = path.join(stitchedDir, dir);
            const stats = await fs.stat(dirPath);

            if (stats.isDirectory() && (now - stats.mtimeMs > maxAgeMs)) {
                await fs.rm(dirPath, { recursive: true });
                console.log(`🗑️ Playlist stitched antiga removida: ${dir} (${Math.round((now - stats.mtimeMs) / 60000)} minutos)`);
                removedCount++;
            }
        }

        if (removedCount > 0) {
            console.log(`✅ ${removedCount} playlist(s) stitched antigas removidas`);
        }
    } catch (error) {
        console.error('❌ Erro ao limpar playlists stitched:', error);
    }
}
