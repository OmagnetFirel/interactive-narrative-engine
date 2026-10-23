import fs from 'fs/promises';
import path from 'path';
import {
    RESOLUTION_DIMENSIONS,
    RESOLUTION_BANDWIDTH,
    HLS_VERSION,
    STITCHED_CLEANUP,
} from '../config/constants.js';
import { assertVideosCompatible } from './videoCompatibilityService.js';

/**
 * ✅ SESSÕES DE PLAYBACK (estilo Bandersnatch / seamless)
 *
 * Em vez de gerar uma master playlist nova a cada escolha (o que obriga o player
 * a chamar hls.loadSource → recarregar o MediaSource → "piscada"), mantemos UMA
 * playlist por sessão com URL ESTÁVEL e do tipo EVENT (sem #EXT-X-ENDLIST). A cada
 * escolha apenas ANEXAMOS segmentos. O hls.js, tratando como stream EVENT, recarrega
 * só o manifesto e faz append dos novos fragmentos no mesmo buffer — sem reload.
 */

interface SessionState {
    id: string;
    resolutions: string[];
    videoIds: string[];
    ended: boolean;
}

interface SessionResult {
    sessionId: string;
    masterPlaylistUrl: string;
}

// Estado das sessões em memória (fonte de verdade: arquivos em disco).
// Em ambiente single-instance (TCC) isto é suficiente; se a API reiniciar,
// o append retorna 404 e o cliente cai no fluxo legado de stitching.
const sessions = new Map<string, SessionState>();

const SESSION_META = 'session.json';

async function writeFileAtomic(filePath: string, content: string): Promise<void> {
    const tmpPath = `${filePath}.tmp`;
    await fs.writeFile(tmpPath, content, 'utf-8');
    await fs.rename(tmpPath, filePath);
}

async function persistSessionMeta(session: SessionState, sessionDir: string): Promise<void> {
    await writeFileAtomic(
        path.join(sessionDir, SESSION_META),
        JSON.stringify({
            id: session.id,
            resolutions: session.resolutions,
            videoIds: session.videoIds,
            ended: session.ended,
        })
    );
}

async function loadSessionFromDisk(sessionId: string, baseHlsPath: string): Promise<SessionState | null> {
    const sessionDir = path.join(baseHlsPath, '_sessions', sessionId);
    try {
        const raw = await fs.readFile(path.join(sessionDir, SESSION_META), 'utf-8');
        const data = JSON.parse(raw) as SessionState;
        if (data.id !== sessionId || !Array.isArray(data.videoIds)) {
            return null;
        }
        sessions.set(sessionId, data);
        return data;
    } catch {
        return null;
    }
}

async function getOrRestoreSession(sessionId: string, baseHlsPath: string): Promise<SessionState | null> {
    const existing = sessions.get(sessionId);
    if (existing) return existing;
    return loadSessionFromDisk(sessionId, baseHlsPath);
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
 * Resoluções comuns (interseção) a todos os vídeos informados.
 */
async function intersectResolutions(videoIds: string[], baseHlsPath: string): Promise<string[]> {
    let resolutions: string[] | null = null;
    for (const videoId of videoIds) {
        const available = await detectResolutions(path.join(baseHlsPath, videoId));
        resolutions = resolutions === null
            ? available
            : resolutions.filter(r => available.includes(r));
    }
    return resolutions ?? [];
}

/**
 * Extrair o "corpo" (EXTINF + caminhos de segmento) de um vídeo numa resolução.
 * Retorna as linhas já com caminho relativo correto e a maior duração de segmento.
 */
async function extractVideoBody(
    videoId: string,
    resolution: string,
    baseHlsPath: string
): Promise<{ lines: string[]; maxDuration: number }> {
    const originalPlaylistPath = path.join(
        baseHlsPath,
        videoId,
        `${videoId}_${resolution}.m3u8`
    );

    await fs.access(originalPlaylistPath); // lança se não existir

    const content = await fs.readFile(originalPlaylistPath, 'utf-8');
    const sourceLines = content.split('\n');

    const lines: string[] = [];
    let maxDuration = 0;

    for (const raw of sourceLines) {
        const line = raw.trim();

        // Ignorar headers e marcadores que controlamos manualmente
        if (line.startsWith('#EXTM3U') ||
            line.startsWith('#EXT-X-VERSION') ||
            line.startsWith('#EXT-X-TARGETDURATION') ||
            line.startsWith('#EXT-X-PLAYLIST-TYPE') ||
            line.startsWith('#EXT-X-MEDIA-SEQUENCE') ||
            line.startsWith('#EXT-X-INDEPENDENT-SEGMENTS') ||
            line.startsWith('#EXT-X-DISCONTINUITY') ||
            line.startsWith('#EXT-X-ENDLIST') ||
            line === '') {
            continue;
        }

        if (line.startsWith('#EXTINF')) {
            const dur = parseFloat(line.replace('#EXTINF:', ''));
            if (!Number.isNaN(dur) && dur > maxDuration) {
                maxDuration = dur;
            }
            lines.push(line);
        } else if (line.startsWith('#')) {
            lines.push(line);
        } else if (line.endsWith('.ts') || line.endsWith('.m4s')) {
            // _sessions/{id}/file.m3u8 → hls/{videoId}/seg => ../../{videoId}/seg
            lines.push(`../../${videoId}/${line}`);
        }
    }

    return { lines, maxDuration };
}

/**
 * (Re)gerar o arquivo de variant (EVENT) de uma resolução a partir da lista
 * completa de vídeos da sessão. A geração é determinística: o prefixo (vídeos já
 * existentes) permanece idêntico, então o hls.js apenas enxerga os novos segmentos.
 */
async function writeVariantPlaylist(
    session: SessionState,
    resolution: string,
    sessionDir: string,
    baseHlsPath: string
): Promise<void> {
    const body: string[] = [];
    let maxDuration = 0;

    for (let i = 0; i < session.videoIds.length; i++) {
        const videoId = session.videoIds[i];
        if (i > 0) {
            body.push('#EXT-X-DISCONTINUITY');
        }
        const { lines, maxDuration: vidMax } = await extractVideoBody(videoId, resolution, baseHlsPath);
        if (vidMax > maxDuration) maxDuration = vidMax;
        body.push(...lines);
    }

    const targetDuration = Math.max(1, Math.ceil(maxDuration || 10));

    const playlistLines: string[] = [
        '#EXTM3U',
        `#EXT-X-VERSION:${HLS_VERSION.variant}`,
        `#EXT-X-TARGETDURATION:${targetDuration}`,
        // EVENT: segmentos só são ANEXADOS; player recarrega o manifesto enquanto não houver ENDLIST
        '#EXT-X-PLAYLIST-TYPE:EVENT',
        '#EXT-X-MEDIA-SEQUENCE:0',
        ...body,
    ];

    if (session.ended) {
        playlistLines.push('#EXT-X-ENDLIST');
    }

    const playlistName = `${session.id}_${resolution}.m3u8`;
    await writeFileAtomic(path.join(sessionDir, playlistName), playlistLines.join('\n'));
}

/**
 * Escrever a master playlist (uma vez; resoluções são fixas na sessão).
 */
async function writeMasterPlaylist(session: SessionState, sessionDir: string): Promise<void> {
    const masterLines = [
        '#EXTM3U',
        `#EXT-X-VERSION:${HLS_VERSION.master}`,
    ];

    const sorted = [...session.resolutions].sort(
        (a, b) => (RESOLUTION_BANDWIDTH[b] || 0) - (RESOLUTION_BANDWIDTH[a] || 0)
    );

    for (const resolution of sorted) {
        const bandwidth = RESOLUTION_BANDWIDTH[resolution] || 2000000;
        const dimensions = RESOLUTION_DIMENSIONS[resolution] || '1280x720';
        masterLines.push(
            `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${dimensions}`,
            `${session.id}_${resolution}.m3u8`
        );
    }

    await writeFileAtomic(path.join(sessionDir, `${session.id}.m3u8`), masterLines.join('\n'));
}

async function regenerateVariants(session: SessionState, sessionDir: string, baseHlsPath: string): Promise<void> {
    for (const resolution of session.resolutions) {
        await writeVariantPlaylist(session, resolution, sessionDir, baseHlsPath);
    }
}

/**
 * ✅ Criar uma sessão de playback com os vídeos iniciais.
 */
export async function createSession(
    initialVideoIds: string[],
    baseHlsPath: string
): Promise<SessionResult> {
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const resolutions = await intersectResolutions(initialVideoIds, baseHlsPath);
    if (resolutions.length === 0) {
        throw new Error('Nenhuma resolução comum entre os vídeos iniciais da sessão.');
    }

    const session: SessionState = {
        id: sessionId,
        resolutions,
        videoIds: [...initialVideoIds],
        ended: false,
    };

    if (initialVideoIds.length >= 2) {
        await assertVideosCompatible(baseHlsPath, initialVideoIds);
    }

    const sessionDir = path.join(baseHlsPath, '_sessions', sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    await regenerateVariants(session, sessionDir, baseHlsPath);
    await writeMasterPlaylist(session, sessionDir);

    sessions.set(sessionId, session);
    await persistSessionMeta(session, sessionDir);

    console.log(`\n🟢 ===== SESSÃO DE PLAYBACK CRIADA =====`);
    console.log(`Session ID: ${sessionId}`);
    console.log(`Resoluções: ${resolutions.join(', ')}`);
    console.log(`Vídeos iniciais (${initialVideoIds.length}): ${initialVideoIds.map(v => v.slice(0, 8)).join(' → ')}`);

    return {
        sessionId,
        masterPlaylistUrl: `/hls/_sessions/${sessionId}/${sessionId}.m3u8`,
    };
}

/**
 * ✅ Anexar vídeos a uma sessão existente (sem recarregar a fonte no player).
 */
export async function appendToSession(
    sessionId: string,
    videoIds: string[],
    baseHlsPath: string
): Promise<{ totalVideos: number; appended: number }> {
    const session = await getOrRestoreSession(sessionId, baseHlsPath);
    if (!session) {
        const err = new Error('Sessão não encontrada') as Error & { code?: string };
        err.code = 'SESSION_NOT_FOUND';
        throw err;
    }

    // Dedupe: não anexar vídeos já presentes
    const newOnes = videoIds.filter(id => !session.videoIds.includes(id));
    if (newOnes.length === 0) {
        return { totalVideos: session.videoIds.length, appended: 0 };
    }

    const allVideoIds = [...session.videoIds, ...newOnes];
    const commonResolutions = await intersectResolutions(allVideoIds, baseHlsPath);
    if (commonResolutions.length === 0) {
        const err = new Error(
            `Nenhuma resolução comum entre os vídeos da sessão e os novos (${newOnes.map(v => v.slice(0, 8)).join(', ')})`
        ) as Error & { code?: string };
        err.code = 'RESOLUTION_MISMATCH';
        throw err;
    }

    session.videoIds.push(...newOnes);
    session.resolutions = commonResolutions;

    await assertVideosCompatible(baseHlsPath, session.videoIds);

    const sessionDir = path.join(baseHlsPath, '_sessions', sessionId);
    await regenerateVariants(session, sessionDir, baseHlsPath);
    await persistSessionMeta(session, sessionDir);

    console.log(`➕ Sessão ${sessionId}: +${newOnes.length} vídeo(s) → total ${session.videoIds.length}`);

    return { totalVideos: session.videoIds.length, appended: newOnes.length };
}

/**
 * ✅ Encerrar a sessão: escreve #EXT-X-ENDLIST para o player parar de recarregar.
 */
export async function endSession(sessionId: string, baseHlsPath: string): Promise<void> {
    const session = await getOrRestoreSession(sessionId, baseHlsPath);
    if (!session || session.ended) return;

    session.ended = true;
    const sessionDir = path.join(baseHlsPath, '_sessions', sessionId);
    await regenerateVariants(session, sessionDir, baseHlsPath);
    await persistSessionMeta(session, sessionDir);

    console.log(`🔚 Sessão ${sessionId} encerrada (ENDLIST escrito)`);
}

/**
 * ✅ Limpar sessões antigas (disco + memória).
 */
export async function cleanOldSessions(
    baseHlsPath: string,
    maxAgeMs: number = STITCHED_CLEANUP.maxAgeMs
): Promise<void> {
    const sessionsDir = path.join(baseHlsPath, '_sessions');

    try {
        await fs.access(sessionsDir);
    } catch {
        return;
    }

    try {
        const dirs = await fs.readdir(sessionsDir);
        const now = Date.now();

        for (const dir of dirs) {
            const dirPath = path.join(sessionsDir, dir);
            const stats = await fs.stat(dirPath);

            if (stats.isDirectory() && (now - stats.mtimeMs > maxAgeMs)) {
                await fs.rm(dirPath, { recursive: true });
                sessions.delete(dir);
                console.log(`🗑️ Sessão antiga removida: ${dir}`);
            }
        }
    } catch (error) {
        console.error('❌ Erro ao limpar sessões:', error);
    }
}
