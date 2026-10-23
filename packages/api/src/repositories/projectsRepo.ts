import type pg from 'pg';
import { randomUUID } from 'crypto';
import type { InteractiveGraph, ProjectVisibility } from '@ine/shared';
import { getPool } from '../db/pool.js';

/**
 * Camada de persistência de projetos.
 *
 * Implementa o requisito RF16 (persistência relacional dos projetos):
 * quando `DATABASE_URL` está definido, lê e escreve em PostgreSQL na tabela
 * `projects` (criada por `docker/init.sql`); caso contrário, mantém um Map
 * em memória apenas como modo de desenvolvimento rápido sem Docker.
 */
export interface ProjectsRepository {
    readonly mode: 'postgres' | 'memory';
    list(ownerId: string): Promise<InteractiveGraph[]>;
    get(id: string, ownerId: string): Promise<InteractiveGraph | null>;
    getByShareToken(token: string): Promise<InteractiveGraph | null>;
    upsert(graph: InteractiveGraph, ownerId: string): Promise<InteractiveGraph>;
    count(): Promise<number>;
    countByOwner(ownerId: string): Promise<number>;
}

interface ProjectRow {
    id: string;
    name: string;
    description: string | null;
    graph: { nodes?: InteractiveGraph['nodes']; edges?: InteractiveGraph['edges']; settings?: InteractiveGraph['settings'] } | null;
    metadata: InteractiveGraph['metadata'] | null;
    visibility: ProjectVisibility;
    share_token: string;
    created_at: Date;
    updated_at: Date;
}

function rowToGraph(row: ProjectRow): InteractiveGraph {
    const graphJson = row.graph ?? {};
    const metadata = row.metadata ?? undefined;

    const mergedMetadata: InteractiveGraph['metadata'] = metadata
        ? {
              createdAt: metadata.createdAt ?? row.created_at.toISOString(),
              updatedAt: metadata.updatedAt ?? row.updated_at.toISOString(),
              author: metadata.author,
              version: metadata.version,
          }
        : {
              createdAt: row.created_at.toISOString(),
              updatedAt: row.updated_at.toISOString(),
          };

    return {
        id: row.id,
        name: row.name,
        description: row.description ?? undefined,
        nodes: graphJson.nodes ?? [],
        edges: graphJson.edges ?? [],
        settings: graphJson.settings,
        visibility: row.visibility ?? 'private',
        shareToken: row.share_token,
        metadata: mergedMetadata,
    };
}

function graphToPersistedShape(graph: InteractiveGraph) {
    const { nodes, edges, settings } = graph;
    return { nodes, edges, settings };
}

function normalizeVisibility(v: string | undefined): ProjectVisibility {
    return v === 'public' ? 'public' : 'private';
}

function createDbRepository(pool: pg.Pool): ProjectsRepository {
    return {
        mode: 'postgres',

        async list(ownerId) {
            const r = await pool.query<ProjectRow>(
                `SELECT id, name, description, graph, metadata, visibility, share_token, created_at, updated_at
                 FROM projects WHERE owner_id = $1
                 ORDER BY updated_at DESC`
                , [ownerId]
            );
            return r.rows.map(rowToGraph);
        },

        async get(id, ownerId) {
            const r = await pool.query<ProjectRow>(
                `SELECT id, name, description, graph, metadata, visibility, share_token, created_at, updated_at
                 FROM projects
                 WHERE id = $1 AND owner_id = $2`,
                [id, ownerId]
            );
            const row = r.rows[0];
            return row ? rowToGraph(row) : null;
        },

        async getByShareToken(token) {
            const r = await pool.query<ProjectRow>(
                `SELECT id, name, description, graph, metadata, visibility, share_token, created_at, updated_at
                 FROM projects
                 WHERE share_token = $1 AND visibility = 'public'`,
                [token]
            );
            const row = r.rows[0];
            return row ? rowToGraph(row) : null;
        },

        async upsert(graph, ownerId) {
            const existing = await this.get(graph.id, ownerId);
            const payload = graphToPersistedShape(graph);
            const metadata = graph.metadata ?? {
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            const visibility = normalizeVisibility(graph.visibility);
            const shareToken = existing?.shareToken ?? graph.shareToken ?? randomUUID();

            const r = await pool.query<ProjectRow>(
                `INSERT INTO projects (id, name, description, graph, metadata, visibility, share_token, owner_id, created_at, updated_at)
                 VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, now(), now())
                 ON CONFLICT (id) DO UPDATE SET
                     name = EXCLUDED.name,
                     description = EXCLUDED.description,
                     graph = EXCLUDED.graph,
                     metadata = EXCLUDED.metadata,
                     visibility = EXCLUDED.visibility,
                     updated_at = now()
                 WHERE projects.owner_id = EXCLUDED.owner_id
                 RETURNING id, name, description, graph, metadata, visibility, share_token, created_at, updated_at`,
                [
                    graph.id,
                    graph.name,
                    graph.description ?? null,
                    JSON.stringify(payload),
                    JSON.stringify(metadata),
                    visibility,
                    shareToken,
                    ownerId,
                ]
            );
            if (!r.rows[0]) throw new Error('Projeto pertence a outro usuário');
            return rowToGraph(r.rows[0]);
        },

        async count() {
            const r = await pool.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM projects`);
            return r.rows[0]?.c ?? 0;
        },

        async countByOwner(ownerId) {
            const r = await pool.query<{ c: number }>(
                `SELECT COUNT(*)::int AS c FROM projects WHERE owner_id = $1`,
                [ownerId]
            );
            return r.rows[0]?.c ?? 0;
        },
    };
}

function createMemoryRepository(): ProjectsRepository {
    const store: Map<string, { graph: InteractiveGraph; ownerId: string }> = new Map();

    return {
        mode: 'memory',

        async list(ownerId) {
            return Array.from(store.values()).filter((v) => v.ownerId === ownerId).map((v) => v.graph);
        },

        async get(id, ownerId) {
            const value = store.get(id);
            return value?.ownerId === ownerId ? value.graph : null;
        },

        async getByShareToken(token) {
            for (const { graph } of store.values()) {
                if (graph.shareToken === token && graph.visibility === 'public') return graph;
            }
            return null;
        },

        async upsert(graph, ownerId) {
            const nowIso = new Date().toISOString();
            const stored = store.get(graph.id);
            if (stored && stored.ownerId !== ownerId) throw new Error('Projeto pertence a outro usuário');
            const existing = stored?.graph;
            const merged: InteractiveGraph = {
                ...graph,
                visibility: normalizeVisibility(graph.visibility),
                shareToken: existing?.shareToken ?? graph.shareToken ?? randomUUID(),
                metadata: {
                    createdAt: existing?.metadata?.createdAt ?? graph.metadata?.createdAt ?? nowIso,
                    updatedAt: nowIso,
                    author: graph.metadata?.author ?? existing?.metadata?.author,
                    version: graph.metadata?.version ?? existing?.metadata?.version,
                },
            };
            store.set(graph.id, { graph: merged, ownerId });
            return merged;
        },

        async count() {
            return store.size;
        },

        async countByOwner(ownerId) {
            return Array.from(store.values()).filter((value) => value.ownerId === ownerId).length;
        },
    };
}

let cached: ProjectsRepository | null = null;

export function getProjectsRepository(): ProjectsRepository {
    if (cached) return cached;
    const pool = getPool();
    if (pool) {
        console.log('💾 Projects: persistência em PostgreSQL ativa');
        cached = createDbRepository(pool);
    } else {
        console.warn('⚠️ Projects: DATABASE_URL não definido — usando armazenamento em memória (não persiste entre reinícios)');
        cached = createMemoryRepository();
    }
    return cached;
}

export function buildShareUrl(shareToken: string): string {
    const base = process.env.PUBLIC_PLAYER_URL ?? 'http://localhost:5173';
    return `${base.replace(/\/$/, '')}/play/${shareToken}`;
}
