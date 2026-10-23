import type { Express, Request, Response } from 'express';
import type { InteractiveGraph } from '@ine/shared';
import { requireAuth, type AuthenticatedRequest } from '../middleware/requireAdmin.js';
import { buildShareUrl, getProjectsRepository } from '../repositories/projectsRepo.js';
import { quotas } from '../config/runtime.js';

export function registerProjectsRoutes(app: Express) {
    const repo = getProjectsRepository();

    // Public: resolve project by share token (player)
    app.get('/api/projects/share/:token', async (req: Request, res: Response) => {
        try {
            const project = await repo.getByShareToken(req.params.token);
            if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
            res.json(project);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Erro ao buscar projeto';
            console.error('❌ /api/projects/share/:token:', msg);
            res.status(500).json({ error: msg });
        }
    });

    app.get('/api/projects', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const projects = await repo.list(req.user!.sub);
            res.json({ projects, count: projects.length });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Erro ao listar projetos';
            console.error('❌ /api/projects list:', msg);
            res.status(500).json({ error: msg });
        }
    });

    app.post('/api/projects', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        const graph = req.body as InteractiveGraph;

        if (!graph || !graph.id || !graph.name || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
            return res.status(400).json({
                error: 'Grafo inválido: id, name, nodes e edges são obrigatórios',
            });
        }

        try {
            const ownerId = req.user!.sub;
            const existing = await repo.get(graph.id, ownerId);
            if (!existing && await repo.countByOwner(ownerId) >= quotas.projectsPerUser) {
                return res.status(409).json({
                    error: `Limite de ${quotas.projectsPerUser} projetos por usuário atingido`,
                    code: 'PROJECT_QUOTA_EXCEEDED',
                    limit: quotas.projectsPerUser,
                });
            }
            const saved = await repo.upsert(graph, ownerId);
            const shareUrl = saved.shareToken ? buildShareUrl(saved.shareToken) : undefined;
            console.log(`✅ Projeto salvo (${repo.mode}): ${saved.name} (${saved.nodes.length} nós)`);
            res.status(201).json({
                message: 'Projeto criado com sucesso',
                project: saved,
                shareToken: saved.shareToken,
                shareUrl,
            });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Erro ao salvar projeto';
            console.error('❌ /api/projects upsert:', msg);
            res.status(500).json({ error: msg });
        }
    });

    app.get('/api/projects/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const project = await repo.get(req.params.id, req.user!.sub);
            if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
            res.json(project);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Erro ao buscar projeto';
            console.error('❌ /api/projects get:', msg);
            res.status(500).json({ error: msg });
        }
    });
}
