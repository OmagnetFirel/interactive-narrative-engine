import type { Express, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { upload } from '../config/multer.js';
import { convertToHLS, getVideoMetadata } from '../services/ffmpegService.js';
import { getVideosRepository, type VideoRecord } from '../repositories/videosRepo.js';
import { checkVideosCompatibility } from '../services/videoCompatibilityService.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/requireAdmin.js';
import { quotas } from '../config/runtime.js';
import { acquireTranscodeLock, releaseTranscodeLock } from '../services/transcodeLock.js';

export interface VideosRoutesContext {
    uploadsRoot: string;
}

export function registerVideosRoutes(app: Express, ctx: VideosRoutesContext) {
    const repo = getVideosRepository();
    const hlsBaseDir = path.join(ctx.uploadsRoot, 'hls');

    app.post('/api/videos/upload', requireAuth, upload.single('video'), async (req: AuthenticatedRequest, res: Response) => {
        let temporaryPath: string | undefined;
        let persisted = false;
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'Nenhum arquivo enviado' });
            }

            const file = req.file;
            temporaryPath = file.path;
            const videoId = path.parse(file.filename).name;
            const usedBytes = await repo.sumFileSizeByOwner(req.user!.sub);
            if (usedBytes + file.size > quotas.uploadBytesPerUser) {
                await fs.unlink(file.path).catch(() => undefined);
                temporaryPath = undefined;
                return res.status(413).json({
                    error: 'Quota de armazenamento do usuário excedida',
                    code: 'UPLOAD_QUOTA_EXCEEDED',
                    limitBytes: quotas.uploadBytesPerUser,
                    usedBytes,
                    requestedBytes: file.size,
                });
            }

            console.log(`📤 Upload recebido: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);

            const metadata = await getVideoMetadata(file.path);
            console.log(`📊 Metadados: ${metadata.width}x${metadata.height}, ${metadata.duration.toFixed(2)}s`);

            const record: VideoRecord = {
                id: videoId,
                originalName: file.originalname,
                tempPath: file.path,
                status: 'uploaded',
                metadata,
                fileSize: file.size,
                uploadedAt: new Date().toISOString(),
            };

            await repo.insert(record, req.user!.sub);
            persisted = true;

            res.status(200).json({
                message: 'Upload realizado com sucesso',
                videoId,
                metadata: {
                    duration: metadata.duration,
                    width: metadata.width,
                    height: metadata.height,
                    size: file.size,
                },
            });
        } catch (error: any) {
            console.error('❌ Erro no upload:', error);
            if (temporaryPath && !persisted) {
                await fs.unlink(temporaryPath).catch(() => undefined);
            }
            res.status(500).json({ error: error?.message ?? 'Erro no upload' });
        }
    });

    app.post('/api/videos/:videoId/process', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const { videoId } = req.params;
            const ownerId = req.user!.sub;
            const videoInfo = await repo.get(videoId, ownerId);

            if (!videoInfo) {
                return res.status(404).json({ error: 'Vídeo não encontrado' });
            }

            if (videoInfo.status === 'processing') {
                return res.status(409).json({ error: 'Vídeo já está sendo processado' });
            }

            if (!acquireTranscodeLock(videoId)) {
                res.setHeader('Retry-After', '30');
                return res.status(429).json({
                    error: 'Outra transcodificação está em andamento. Tente novamente em instantes.',
                    code: 'TRANSCODE_BUSY',
                });
            }

            try {
                await repo.update(videoId, ownerId, { status: 'processing' });
            } catch (error) {
                releaseTranscodeLock(videoId);
                throw error;
            }

            console.log(`🎬 Iniciando processamento HLS: ${videoId}`);

            const outputDir = path.join(hlsBaseDir, videoId);

            res.status(202).json({
                message: 'Processamento iniciado',
                videoId,
                status: 'processing',
            });

            convertToHLS(videoInfo.tempPath, outputDir, videoId)
                .then(async (hlsOutput) => {
                    await repo.update(videoId, ownerId, {
                        status: 'ready',
                        hlsUrl: `/hls/${videoId}/${hlsOutput.masterPlaylist}`,
                        thumbnailUrl: hlsOutput.thumbnailUrl ? `/hls/${videoId}/${hlsOutput.thumbnailUrl}` : undefined,
                        variants: hlsOutput.variants,
                        processedAt: new Date().toISOString(),
                    });

                    try {
                        await fs.unlink(videoInfo.tempPath);
                    } catch (cleanupErr) {
                        console.warn(`⚠️ Não foi possível remover arquivo temporário ${videoInfo.tempPath}:`, cleanupErr);
                    }

                    console.log(`✅ Processamento concluído: ${videoId}`);
                })
                .catch(async (error) => {
                    console.error(`❌ Erro no processamento: ${error.message}`);
                    await repo.update(videoId, ownerId, { status: 'error', error: error.message });
                })
                .finally(() => {
                    releaseTranscodeLock(videoId);
                });
        } catch (error: any) {
            console.error('❌ Erro ao iniciar processamento:', error);
            res.status(500).json({ error: error?.message ?? 'Erro ao iniciar processamento' });
        }
    });

    app.get('/api/videos/:videoId/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const { videoId } = req.params;
            const videoInfo = await repo.get(videoId, req.user!.sub);

            if (!videoInfo) {
                return res.status(404).json({ error: 'Vídeo não encontrado' });
            }

            res.json({
                videoId,
                status: videoInfo.status,
                hlsUrl: videoInfo.hlsUrl,
                thumbnailUrl: videoInfo.thumbnailUrl,
                metadata: videoInfo.metadata,
                error: videoInfo.error,
            });
        } catch (error: any) {
            console.error('❌ /api/videos/:videoId/status:', error);
            res.status(500).json({ error: error?.message ?? 'Erro ao buscar status' });
        }
    });

    app.get('/api/videos', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const videoList = (await repo.list(req.user!.sub)).map((v) => ({
                id: v.id,
                originalName: v.originalName,
                status: v.status,
                hlsUrl: v.hlsUrl,
                thumbnailUrl: v.thumbnailUrl,
                metadata: v.metadata,
                uploadedAt: v.uploadedAt,
                processedAt: v.processedAt,
            }));

            res.json({ videos: videoList, count: videoList.length });
        } catch (error: any) {
            console.error('❌ /api/videos:', error);
            res.status(500).json({ error: error?.message ?? 'Erro ao listar vídeos' });
        }
    });

    app.post('/api/videos/:videoId/retranscode', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const { videoId } = req.params;
            if (!(await repo.get(videoId, req.user!.sub))) return res.status(404).json({ error: 'Vídeo não encontrado' });
            const hlsDir = path.join(hlsBaseDir, videoId);

            try {
                await fs.access(hlsDir);
            } catch {
                return res.status(404).json({ error: 'Vídeo não encontrado' });
            }

            const files = await fs.readdir(hlsDir);
            const tsFiles = files.filter((f) => f.endsWith('.ts')).sort();

            if (tsFiles.length === 0) {
                return res.status(400).json({ error: 'Nenhum segmento .ts encontrado' });
            }

            console.log(`🔄 Re-transcodificando vídeo: ${videoId}`);
            console.log(`   Encontrados ${tsFiles.length} segmentos .ts`);

            res.json({
                message: 'Para re-transcodificar, faça upload do vídeo original novamente',
                videoId,
                currentSegments: tsFiles.length,
                hint: 'Os novos parâmetros de encoding serão aplicados automaticamente no próximo upload',
            });
        } catch (error: any) {
            console.error('❌ Erro ao re-transcodificar:', error);
            res.status(500).json({ error: error?.message ?? 'Erro ao re-transcodificar' });
        }
    });

    app.post('/api/videos/check-compatibility', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const { videoIds } = req.body;

            if (!Array.isArray(videoIds) || videoIds.length < 2) {
                return res.status(400).json({ error: 'videoIds deve ser um array com pelo menos 2 IDs' });
            }
            const owned = await Promise.all(videoIds.map((id: string) => repo.get(id, req.user!.sub)));
            if (owned.some((video) => !video)) return res.status(404).json({ error: 'Um ou mais vídeos não foram encontrados' });

            const report = await checkVideosCompatibility(hlsBaseDir, videoIds);

            res.json({
                compatible: report.compatible,
                videos: report.videos,
                summary: {
                    resolution: report.resolution,
                    issues: report.issues,
                    recommendation: report.compatible
                        ? 'Vídeos são compatíveis para stitching'
                        : report.issues[report.issues.length - 1],
                },
            });
        } catch (error: any) {
            console.error('❌ Erro ao verificar compatibilidade:', error);
            res.status(500).json({ error: error?.message ?? 'Erro ao verificar compatibilidade' });
        }
    });

    app.post('/api/videos/retranscode-all', requireAuth, (_req: Request, res: Response) => {
        res.status(501).json({ error: 'Re-transcodificação em lote desativada no modo multiusuário' });
    });
}
