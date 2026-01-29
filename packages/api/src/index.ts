import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import type { InteractiveGraph } from '@ine/shared';
import { upload } from './config/multer';
import { convertToHLS, getVideoMetadata, checkFFmpegInstalled } from './services/ffmpegService';
import { createStitchedPlaylistForPath, cleanOldStitchedPlaylists } from './services/hlsStitchingService.js';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true
}));
app.use(express.json());

// Servir arquivos estáticos (HLS e thumbnails)
app.use('/videos', express.static(path.join(__dirname, '../uploads/videos')));
app.use('/hls', express.static(path.join(__dirname, '../uploads/hls')));

// Armazenamento em memória
const projects: Map<string, InteractiveGraph> = new Map();
const videos: Map<string, any> = new Map();

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        projectsCount: projects.size,
        videosCount: videos.size
    });
});

// ============================================
// PROJECTS ENDPOINTS
// ============================================

app.get('/api/projects', (req, res) => {
    const projectList = Array.from(projects.values());
    res.json({
        projects: projectList,
        count: projectList.length
    });
});

app.post('/api/projects', (req, res) => {
    const graph: InteractiveGraph = req.body;

    if (!graph.name || !graph.nodes || !graph.edges) {
        return res.status(400).json({
            error: 'Grafo inválido: name, nodes e edges são obrigatórios'
        });
    }

    projects.set(graph.id, graph);
    console.log(`✅ Projeto salvo: ${graph.name} (${graph.nodes.length} nós)`);

    res.status(201).json({
        message: 'Projeto criado com sucesso',
        project: graph
    });
});

app.get('/api/projects/:id', (req, res) => {
    const { id } = req.params;
    const project = projects.get(id);

    if (!project) {
        return res.status(404).json({ error: 'Projeto não encontrado' });
    }

    res.json(project);
});

// ============================================
// VIDEO UPLOAD ENDPOINTS
// ============================================

/**
 * Upload de vídeo
 */
app.post('/api/videos/upload', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        const file = req.file;
        const videoId = path.parse(file.filename).name;

        console.log(`📤 Upload recebido: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);

        // Extrair metadados
        const metadata = await getVideoMetadata(file.path);
        console.log(`📊 Metadados: ${metadata.width}x${metadata.height}, ${metadata.duration.toFixed(2)}s`);

        // Salvar info temporária
        videos.set(videoId, {
            id: videoId,
            originalName: file.originalname,
            tempPath: file.path,
            metadata,
            status: 'uploaded',
            uploadedAt: new Date().toISOString()
        });

        res.status(200).json({
            message: 'Upload realizado com sucesso',
            videoId,
            metadata: {
                duration: metadata.duration,
                width: metadata.width,
                height: metadata.height,
                size: file.size
            }
        });

    } catch (error: any) {
        console.error('❌ Erro no upload:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Processar vídeo para HLS
 */
app.post('/api/videos/:videoId/process', async (req, res) => {
    try {
        const { videoId } = req.params;
        const videoInfo = videos.get(videoId);

        if (!videoInfo) {
            return res.status(404).json({ error: 'Vídeo não encontrado' });
        }

        if (videoInfo.status === 'processing') {
            return res.status(409).json({ error: 'Vídeo já está sendo processado' });
        }

        // Atualizar status
        videoInfo.status = 'processing';
        videos.set(videoId, videoInfo);

        console.log(`🎬 Iniciando processamento HLS: ${videoId}`);

        // Processar HLS em background
        const outputDir = path.join(__dirname, '../uploads/hls', videoId);

        // Responder imediatamente
        res.status(202).json({
            message: 'Processamento iniciado',
            videoId,
            status: 'processing'
        });

        // Processar (assíncrono)
        convertToHLS(videoInfo.tempPath, outputDir, videoId)
            .then(async (hlsOutput) => {
                // Atualizar info do vídeo
                videoInfo.status = 'ready';
                videoInfo.hlsUrl = `/hls/${videoId}/${hlsOutput.masterPlaylist}`;
                videoInfo.thumbnailUrl = hlsOutput.thumbnailUrl ? `/hls/${videoId}/${hlsOutput.thumbnailUrl}` : undefined;
                videoInfo.variants = hlsOutput.variants;
                videoInfo.processedAt = new Date().toISOString();
                videos.set(videoId, videoInfo);

                // Remover arquivo temporário
                await fs.unlink(videoInfo.tempPath);
                console.log(`✅ Processamento concluído: ${videoId}`);
            })
            .catch((error) => {
                console.error(`❌ Erro no processamento: ${error.message}`);
                videoInfo.status = 'error';
                videoInfo.error = error.message;
                videos.set(videoId, videoInfo);
            });

    } catch (error: any) {
        console.error('❌ Erro ao iniciar processamento:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Status do processamento
 */
app.get('/api/videos/:videoId/status', (req, res) => {
    const { videoId } = req.params;
    const videoInfo = videos.get(videoId);

    if (!videoInfo) {
        return res.status(404).json({ error: 'Vídeo não encontrado' });
    }

    res.json({
        videoId,
        status: videoInfo.status,
        hlsUrl: videoInfo.hlsUrl,
        thumbnailUrl: videoInfo.thumbnailUrl,
        metadata: videoInfo.metadata,
        error: videoInfo.error
    });
});

/**
 * Listar vídeos
 */
app.get('/api/videos', (req, res) => {
    const videoList = Array.from(videos.values()).map(v => ({
        id: v.id,
        originalName: v.originalName,
        status: v.status,
        hlsUrl: v.hlsUrl,
        thumbnailUrl: v.thumbnailUrl,
        metadata: v.metadata,
        uploadedAt: v.uploadedAt,
        processedAt: v.processedAt
    }));

    res.json({
        videos: videoList,
        count: videoList.length
    });
});

/**
 * ✅ NOVO: Re-transcodificar um vídeo existente para compatibilidade com stitching
 */
app.post('/api/videos/:videoId/retranscode', async (req, res) => {
    try {
        const { videoId } = req.params;
        const hlsDir = path.join(__dirname, '../uploads/hls', videoId);

        // Verificar se o vídeo existe
        try {
            await fs.access(hlsDir);
        } catch {
            return res.status(404).json({ error: 'Vídeo não encontrado' });
        }

        // Buscar arquivo .ts original para re-transcodificar
        const files = await fs.readdir(hlsDir);
        const tsFiles = files.filter(f => f.endsWith('.ts')).sort();

        if (tsFiles.length === 0) {
            return res.status(400).json({ error: 'Nenhum segmento .ts encontrado' });
        }

        console.log(`🔄 Re-transcodificando vídeo: ${videoId}`);
        console.log(`   Encontrados ${tsFiles.length} segmentos .ts`);

        // Por enquanto, retornar informação sobre o que precisa ser feito
        res.json({
            message: 'Para re-transcodificar, faça upload do vídeo original novamente',
            videoId,
            currentSegments: tsFiles.length,
            hint: 'Os novos parâmetros de encoding serão aplicados automaticamente no próximo upload'
        });

    } catch (error: any) {
        console.error('❌ Erro ao re-transcodificar:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * ✅ NOVO: Verificar compatibilidade de codecs entre vídeos
 */
app.post('/api/videos/check-compatibility', async (req, res) => {
    try {
        const { videoIds } = req.body;

        if (!Array.isArray(videoIds) || videoIds.length < 2) {
            return res.status(400).json({ error: 'videoIds deve ser um array com pelo menos 2 IDs' });
        }

        const hlsDir = path.join(__dirname, '../uploads/hls');
        const results: any[] = [];

        for (const videoId of videoIds) {
            const videoPath = path.join(hlsDir, videoId);

            try {
                await fs.access(videoPath);

                // Buscar primeiro segmento .ts para análise
                const files = await fs.readdir(videoPath);
                const firstTs = files.find(f => f.endsWith('.ts') && !f.includes('_stitched'));

                if (firstTs) {
                    const tsPath = path.join(videoPath, firstTs);
                    const metadata = await getVideoMetadata(tsPath);

                    results.push({
                        videoId,
                        exists: true,
                        codec: metadata.codec,
                        width: metadata.width,
                        height: metadata.height,
                        fps: metadata.fps
                    });
                } else {
                    results.push({
                        videoId,
                        exists: true,
                        error: 'Nenhum segmento .ts encontrado'
                    });
                }
            } catch {
                results.push({
                    videoId,
                    exists: false
                });
            }
        }

        // Verificar compatibilidade
        const validResults = results.filter(r => r.exists && !r.error);
        const codecs = [...new Set(validResults.map(r => r.codec))];
        const resolutions = [...new Set(validResults.map(r => `${r.width}x${r.height}`))];

        const isCompatible = codecs.length === 1 && resolutions.length === 1;

        res.json({
            compatible: isCompatible,
            videos: results,
            summary: {
                codecs,
                resolutions,
                recommendation: isCompatible
                    ? 'Vídeos são compatíveis para stitching'
                    : 'Re-transcodifique os vídeos com as mesmas configurações para compatibilidade'
            }
        });

    } catch (error: any) {
        console.error('❌ Erro ao verificar compatibilidade:', error);
        res.status(500).json({ error: error.message });
    }
});

(async () => {
    const hasFFmpeg = await checkFFmpegInstalled();
    if (!hasFFmpeg) {
        console.warn('⚠️  FFmpeg não encontrado no sistema!');
        console.warn('   Instale com: brew install ffmpeg (macOS) ou apt install ffmpeg (Linux)');
    } else {
        console.log('✅ FFmpeg detectado');
    }
})();

/**
 *  Criar playlist stitched para um caminho específico
 */

app.post('/api/playlists/stitch', async (req, res) => {
    try {
        const { nodePath } = req.body;

        if (!Array.isArray(nodePath) || nodePath.length === 0) {
            return res.status(400).json({ error: 'nodePath deve ser um array não vazio' });
        }

        console.log(`\n📝 ===== REQUISIÇÃO DE STITCHING =====`);
        console.log(`nodePath recebido (${nodePath.length} vídeos): ${nodePath.join(' → ')}`);

        // ✅ Se só tem 1 vídeo, não precisa stitching
        if (nodePath.length === 1) {
            console.log('ℹ️ Apenas 1 vídeo, stitching não necessário');
            return res.status(400).json({
                error: 'Stitching requer pelo menos 2 vídeos'
            });
        }

        // ✅ Validar que são UUIDs válidos
        const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

        for (const id of nodePath) {
            if (!uuidRegex.test(id)) {
                console.error(`❌ ID inválido (não é UUID): ${id}`);
                return res.status(400).json({
                    error: `ID inválido: ${id}. Esperado UUID de vídeo processado (ex: bcaf7d1d-0460-47f5-94e1-f15d0fd93358)`
                });
            }
        }

        const baseHlsPath = path.join(__dirname, '../uploads/hls');

        // ✅ Verificar se vídeos existem
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
                hint: 'Certifique-se de que todos os vídeos foram processados e estão em uploads/hls/{videoId}/'
            });
        }

        const result = await createStitchedPlaylistForPath(nodePath, baseHlsPath);

        console.log(`✅ Stitching concluído: ${result.masterPlaylistUrl}\n`);

        res.json({
            message: 'Playlist stitched criada com sucesso',
            masterPlaylistUrl: `http://localhost:${PORT}${result.masterPlaylistUrl}`,
            playlistId: result.playlistId,
            videosCount: nodePath.length
        });

    } catch (error: any) {
        console.error('❌ Erro ao criar playlist stitched:', error);
        res.status(500).json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * Limpar playlists antigas a cada 30 minutos
 */
setInterval(async () => {
    const baseHlsPath = path.join(__dirname, '../uploads/hls');
    await cleanOldStitchedPlaylists(baseHlsPath);
}, 30 * 60 * 1000);



// Start server
app.listen(PORT, () => {
    console.log(`🚀 API rodando em http://localhost:${PORT}`);
    console.log(`📊 Health: http://localhost:${PORT}/health`);
    console.log(`🔗 CORS habilitado para Editor (3000) e Player (5173)`);
    console.log(`📹 Uploads: ${path.join(__dirname, '../uploads')}`);
});
