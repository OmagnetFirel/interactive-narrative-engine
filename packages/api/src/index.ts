import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs/promises';
import { registerProjectsRoutes } from './routes/projects.js';
import { registerVideosRoutes } from './routes/videos.js';
import { registerAuthRoutes, warnIfAuthNotConfigured } from './routes/auth.js';
import { checkFFmpegInstalled } from './services/ffmpegService.js';
import { createStitchedPlaylistForPath, cleanOldStitchedPlaylists } from './services/hlsStitchingService.js';
import { createSession, appendToSession, endSession, cleanOldSessions } from './services/hlsSessionService.js';
import { getProjectsRepository } from './repositories/projectsRepo.js';
import { getVideosRepository } from './repositories/videosRepo.js';
import { getPool } from './db/pool.js';
import { initializeAuth } from './services/authService.js';
import { assertSafeProductionSecrets, trustProxySetting, uploadsRoot } from './config/runtime.js';
import {
    generalLimiter, inviteLimiter, loginLimiter, publicExpensiveLimiter,
} from './config/rateLimits.js';

assertSafeProductionSecrets();
const app = express();
const PORT = process.env.PORT || 3001;
const PUBLIC_API_URL = process.env.PUBLIC_API_URL || `http://localhost:${PORT}`;
const PUBLIC_MEDIA_URL = (process.env.PUBLIC_MEDIA_URL || PUBLIC_API_URL).replace(/\/$/, '');
app.set('trust proxy', trustProxySetting());

const defaultCorsOrigins = ['http://localhost:3000', 'http://localhost:5173'];
const configuredCorsOrigins =
    process.env.CORS_ORIGINS?.split(',')
        .map((o) => o.trim())
        .filter(Boolean) ?? [];
const corsOrigins = process.env.NODE_ENV === 'production'
    ? configuredCorsOrigins
    : [...new Set([...defaultCorsOrigins, ...configuredCorsOrigins])];

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
    cors({
        origin: corsOrigins,
        credentials: true,
    })
);
app.use(express.json({ limit: '10mb' }));
app.use(generalLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/invites', inviteLimiter);
app.use(['/api/playlists/stitch', '/api/sessions'], publicExpensiveLimiter);

// Garantir estrutura de diretórios (clone fresco / primeiro boot)
for (const dir of ['videos', 'hls', 'temp']) {
    await fs.mkdir(path.join(uploadsRoot, dir), { recursive: true });
}

app.use('/videos', express.static(path.join(uploadsRoot, 'videos')));
app.use('/hls', express.static(path.join(uploadsRoot, 'hls')));

const projectsRepo = getProjectsRepository();
const videosRepo = getVideosRepository();

await initializeAuth();
warnIfAuthNotConfigured();
registerAuthRoutes(app);
registerProjectsRoutes(app);
registerVideosRoutes(app, { uploadsRoot });

app.get('/health', async (_req, res) => {
    try {
        const [projectsCount, videosCount] = await Promise.all([
            projectsRepo.count(),
            videosRepo.count(),
        ]);

        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            storage: {
                projects: projectsRepo.mode,
                videos: videosRepo.mode,
            },
            projectsCount,
            videosCount,
        });
    } catch (e: any) {
        res.status(500).json({
            status: 'degraded',
            error: e?.message ?? 'Falha ao consultar contagens',
        });
    }
});

async function publicProjectAllowsVideos(shareToken: unknown, videoIds: unknown): Promise<boolean> {
    if (typeof shareToken !== 'string' || !Array.isArray(videoIds)) return false;
    const project = await projectsRepo.getByShareToken(shareToken);
    if (!project) return false;
    const publicVideoIds = new Set<string>();
    for (const node of project.nodes) {
        const videoUrl = node.data.videoUrl;
        if (typeof videoUrl !== 'string') continue;
        const match = videoUrl.match(
            /\/hls\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\/|$)/i
        );
        if (match) publicVideoIds.add(match[1].toLowerCase());
    }
    return videoIds.every(
        (id) => typeof id === 'string' && publicVideoIds.has(id.toLowerCase())
    );
}

app.post('/api/playlists/stitch', async (req, res) => {
    try {
        const { nodePath, shareToken } = req.body;

        if (!Array.isArray(nodePath) || nodePath.length === 0) {
            return res.status(400).json({ error: 'nodePath deve ser um array não vazio' });
        }
        if (!(await publicProjectAllowsVideos(shareToken, nodePath))) {
            return res.status(403).json({ error: 'Projeto público não autoriza estes vídeos' });
        }

        console.log(`\n📝 ===== REQUISIÇÃO DE STITCHING =====`);
        console.log(`nodePath recebido (${nodePath.length} vídeos): ${nodePath.join(' → ')}`);

        if (nodePath.length === 1) {
            console.log('ℹ️ Apenas 1 vídeo, stitching não necessário');
            return res.status(400).json({
                error: 'Stitching requer pelo menos 2 vídeos',
            });
        }

        const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

        for (const id of nodePath) {
            if (!uuidRegex.test(id)) {
                console.error(`❌ ID inválido (não é UUID): ${id}`);
                return res.status(400).json({
                    error: `ID inválido: ${id}. Esperado UUID de vídeo processado (ex: bcaf7d1d-0460-47f5-94e1-f15d0fd93358)`,
                });
            }
        }

        const baseHlsPath = path.join(uploadsRoot, 'hls');
        const missingVideos: string[] = [];

        for (const videoId of nodePath) {
            const videoDir = path.join(baseHlsPath, videoId);
            try {
                await fs.access(videoDir);
                console.log(`  ✅ Vídeo existe: ${videoId.slice(0, 8)}...`);
            } catch {
                console.error(`  ❌ Vídeo não encontrado: ${videoId}`);
                missingVideos.push(videoId);
            }
        }

        if (missingVideos.length > 0) {
            return res.status(404).json({
                error: `${missingVideos.length} vídeo(s) não encontrado(s)`,
                missingVideos,
                hint: 'Certifique-se de que todos os vídeos foram processados e estão em uploads/hls/{videoId}/',
            });
        }

        const result = await createStitchedPlaylistForPath(nodePath, baseHlsPath);

        console.log(`✅ Stitching concluído: ${result.masterPlaylistUrl}\n`);

        res.json({
            message: 'Playlist stitched criada com sucesso',
            masterPlaylistUrl: `${PUBLIC_MEDIA_URL}${result.masterPlaylistUrl}`,
            playlistId: result.playlistId,
            videosCount: nodePath.length,
        });
    } catch (error: any) {
        console.error('❌ Erro ao criar playlist stitched:', error);
        res.status(500).json({
            error: error?.message ?? 'Erro ao criar playlist stitched',
            stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
        });
    }
});

const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const playbackSessionTokens = new Map<string, string>();

type ValidationError = { status: number; body: Record<string, unknown> };

async function validateVideoIds(nodePath: unknown, baseHlsPath: string): Promise<
    { ids: string[]; error?: undefined } | { ids?: undefined; error: ValidationError }
> {
    if (!Array.isArray(nodePath) || nodePath.length === 0) {
        return { error: { status: 400, body: { error: 'nodePath deve ser um array não vazio' } } };
    }

    for (const id of nodePath) {
        if (typeof id !== 'string' || !uuidRegex.test(id)) {
            return { error: { status: 400, body: { error: `ID inválido: ${id}. Esperado UUID de vídeo processado` } } };
        }
    }

    const missingVideos: string[] = [];
    for (const videoId of nodePath as string[]) {
        try {
            await fs.access(path.join(baseHlsPath, videoId));
        } catch {
            missingVideos.push(videoId);
        }
    }

    if (missingVideos.length > 0) {
        return {
            error: {
                status: 404,
                body: {
                    error: `${missingVideos.length} vídeo(s) não encontrado(s)`,
                    missingVideos,
                    hint: 'Certifique-se de que todos os vídeos foram processados e estão em uploads/hls/{videoId}/',
                },
            },
        };
    }

    return { ids: nodePath as string[] };
}

// ✅ SESSÕES DE PLAYBACK (seamless / EVENT) — URL estável que cresce por append
app.post('/api/sessions', async (req, res) => {
    try {
        if (!(await publicProjectAllowsVideos(req.body?.shareToken, req.body?.nodePath))) {
            return res.status(403).json({ error: 'Projeto público não autoriza estes vídeos' });
        }
        const baseHlsPath = path.join(uploadsRoot, 'hls');
        const validation = await validateVideoIds(req.body?.nodePath, baseHlsPath);
        if (validation.error) {
            return res.status(validation.error.status).json(validation.error.body);
        }

        const result = await createSession(validation.ids, baseHlsPath);
        playbackSessionTokens.set(result.sessionId, req.body.shareToken);

        res.json({
            message: 'Sessão de playback criada',
            sessionId: result.sessionId,
            masterPlaylistUrl: `${PUBLIC_MEDIA_URL}${result.masterPlaylistUrl}`,
            videosCount: validation.ids.length,
        });
    } catch (error: any) {
        if (error?.code === 'INCOMPATIBLE_VIDEOS') {
            return res.status(422).json({
                error: error.message,
                code: error.code,
                report: error.report,
            });
        }
        console.error('❌ Erro ao criar sessão:', error);
        res.status(500).json({ error: error?.message ?? 'Erro ao criar sessão' });
    }
});

app.post('/api/sessions/:sessionId/append', async (req, res) => {
    try {
        const { sessionId } = req.params;
        if (playbackSessionTokens.get(sessionId) !== req.body?.shareToken ||
            !(await publicProjectAllowsVideos(req.body?.shareToken, req.body?.nodePath))) {
            return res.status(403).json({ error: 'Sessão pública inválida' });
        }
        const baseHlsPath = path.join(uploadsRoot, 'hls');
        const validation = await validateVideoIds(req.body?.nodePath, baseHlsPath);
        if (validation.error) {
            return res.status(validation.error.status).json(validation.error.body);
        }

        const result = await appendToSession(sessionId, validation.ids, baseHlsPath);

        res.json({
            message: 'Vídeos anexados à sessão',
            sessionId,
            totalVideos: result.totalVideos,
            appended: result.appended,
        });
    } catch (error: any) {
        if (error?.code === 'SESSION_NOT_FOUND') {
            return res.status(404).json({ error: 'Sessão não encontrada', code: error.code });
        }
        if (error?.code === 'RESOLUTION_MISMATCH') {
            return res.status(409).json({ error: error.message, code: error.code });
        }
        if (error?.code === 'INCOMPATIBLE_VIDEOS') {
            return res.status(422).json({
                error: error.message,
                code: error.code,
                report: error.report,
            });
        }
        console.error('❌ Erro ao anexar à sessão:', error);
        res.status(500).json({ error: error?.message ?? 'Erro ao anexar à sessão' });
    }
});

app.post('/api/sessions/:sessionId/end', async (req, res) => {
    try {
        const { sessionId } = req.params;
        if (playbackSessionTokens.get(sessionId) !== req.body?.shareToken ||
            !(await publicProjectAllowsVideos(req.body?.shareToken, []))) {
            return res.status(403).json({ error: 'Sessão pública inválida' });
        }
        const baseHlsPath = path.join(uploadsRoot, 'hls');
        await endSession(sessionId, baseHlsPath);
        playbackSessionTokens.delete(sessionId);
        res.json({ message: 'Sessão encerrada', sessionId });
    } catch (error: any) {
        console.error('❌ Erro ao encerrar sessão:', error);
        res.status(500).json({ error: error?.message ?? 'Erro ao encerrar sessão' });
    }
});

app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error?.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            error: 'Arquivo excede o limite máximo permitido para upload',
            code: 'UPLOAD_TOO_LARGE',
        });
    }
    console.error('❌ Erro não tratado:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

setInterval(async () => {
    try {
        const baseHlsPath = path.join(uploadsRoot, 'hls');
        await cleanOldStitchedPlaylists(baseHlsPath);
        await cleanOldSessions(baseHlsPath);
    } catch (error) {
        console.error('❌ Falha na limpeza periódica de playlists:', error);
    }
}, 30 * 60 * 1000);

(async () => {
    const hasFFmpeg = await checkFFmpegInstalled();
    if (!hasFFmpeg) {
        console.warn('⚠️  FFmpeg não encontrado no sistema!');
        console.warn('   Instale com: brew install ffmpeg (macOS) ou apt install ffmpeg (Linux)');
    } else {
        console.log('✅ FFmpeg detectado');
    }

    const pool = getPool();
    if (pool) {
        try {
            await pool.query('SELECT 1');
            console.log('✅ PostgreSQL conectado');
        } catch (e: any) {
            console.error('❌ Falha ao conectar no PostgreSQL:', e?.message ?? e);
            console.error('   A API continuará subindo, mas operações que dependem do banco vão falhar.');
        }
    }
})();

app.listen(PORT, () => {
    console.log(`🚀 API rodando em http://localhost:${PORT}`);
    console.log(`📊 Health: http://localhost:${PORT}/health`);
    console.log(`🔗 CORS habilitado para: ${corsOrigins.join(', ') || '(nenhuma origem)'}`);
    console.log(`📹 Uploads: ${uploadsRoot}`);
    console.log(`🗃️ Storage: projects=${projectsRepo.mode}, videos=${videosRepo.mode}`);
});
