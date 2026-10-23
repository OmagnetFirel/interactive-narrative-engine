import { hash, verify, Algorithm } from '@node-rs/argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { getPool } from '../db/pool.js';
import { quotas } from '../config/runtime.js';

const ACCESS_EXPIRY = '15m';
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type UserRole = 'admin' | 'user';
export interface AuthUser { id: string; email: string; name: string; role: UserRole }
export interface AccessTokenPayload { sub: string; email: string; name: string; role: UserRole; type: 'access' }
interface StoredUser extends AuthUser { passwordHash: string }
interface StoredRefresh { userId: string; expiresAt: Date }
interface StoredInvite { email: string; expiresAt: Date; usedAt: Date | null; createdBy: string }

const memory = {
    users: new Map<string, StoredUser>(),
    refresh: new Map<string, StoredRefresh>(),
    invites: new Map<string, StoredInvite>(),
};

export class AuthorQuotaError extends Error {
    readonly code = 'AUTHOR_QUOTA_EXCEEDED';
    constructor() {
        super(`Limite de ${quotas.authors} autores atingido`);
    }
}

function secret(): string {
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET não configurado');
    return process.env.JWT_SECRET;
}
function digest(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}
function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}
export async function hashPassword(password: string): Promise<string> {
    return hash(password, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}
export function signAccessToken(user: AuthUser): string {
    return jwt.sign(
        { email: user.email, name: user.name, role: user.role, type: 'access' },
        secret(),
        { subject: user.id, expiresIn: ACCESS_EXPIRY }
    );
}
export function verifyAccessToken(token: string): AccessTokenPayload | null {
    try {
        const p = jwt.verify(token, secret()) as AccessTokenPayload;
        return p.type === 'access' && p.sub && (p.role === 'admin' || p.role === 'user') ? p : null;
    } catch {
        return null;
    }
}

export async function initializeAuth(): Promise<void> {
    if (!process.env.JWT_SECRET) {
        console.warn('⚠️ JWT_SECRET não definido — autenticação não ficará disponível');
        return;
    }
    const pool = getPool();
    if (pool) {
        await pool.query(`
            CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                email VARCHAR(320) NOT NULL UNIQUE,
                name VARCHAR(255) NOT NULL,
                password_hash TEXT NOT NULL,
                role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS user_invites (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                email VARCHAR(320) NOT NULL,
                token_hash CHAR(64) NOT NULL UNIQUE,
                created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TIMESTAMPTZ NOT NULL,
                used_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS refresh_tokens (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash CHAR(64) NOT NULL UNIQUE,
                expires_at TIMESTAMPTZ NOT NULL,
                revoked_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
            ALTER TABLE videos ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
            CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
            CREATE INDEX IF NOT EXISTS idx_videos_owner ON videos(owner_id);
        `);
    }
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) {
        console.warn('⚠️ ADMIN_EMAIL/ADMIN_PASSWORD não definidos — bootstrap de admin ignorado');
        return;
    }
    const normalized = normalizeEmail(email);
    const passwordHash = await hashPassword(password);
    let adminId: string;
    if (pool) {
        const result = await pool.query<{ id: string }>(
            `INSERT INTO users (email, name, password_hash, role)
             VALUES ($1, $2, $3, 'admin')
             ON CONFLICT (email) DO UPDATE SET role = 'admin'
             RETURNING id`,
            [normalized, 'Administrador', passwordHash]
        );
        adminId = result.rows[0].id;
        await pool.query('UPDATE projects SET owner_id = $1 WHERE owner_id IS NULL', [adminId]);
        await pool.query('UPDATE videos SET owner_id = $1 WHERE owner_id IS NULL', [adminId]);
        await pool.query('ALTER TABLE projects ALTER COLUMN owner_id SET NOT NULL');
        await pool.query('ALTER TABLE videos ALTER COLUMN owner_id SET NOT NULL');
    } else {
        const existing = [...memory.users.values()].find((u) => u.email === normalized);
        adminId = existing?.id ?? randomUUID();
        if (!existing) memory.users.set(adminId, { id: adminId, email: normalized, name: 'Administrador', role: 'admin', passwordHash });
    }
}

export async function authenticate(email: string, password: string): Promise<AuthUser | null> {
    const normalized = normalizeEmail(email);
    const pool = getPool();
    let user: StoredUser | undefined;
    if (pool) {
        const r = await pool.query<{ id: string; email: string; name: string; role: UserRole; password_hash: string }>(
            'SELECT id, email, name, role, password_hash FROM users WHERE email = $1',
            [normalized]
        );
        const row = r.rows[0];
        if (row) user = { id: row.id, email: row.email, name: row.name, role: row.role, passwordHash: row.password_hash };
    } else {
        user = [...memory.users.values()].find((u) => u.email === normalized);
    }
    if (!user || !(await verify(user.passwordHash, password))) return null;
    const { passwordHash: _, ...safe } = user;
    return safe;
}

export async function issueRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(48).toString('base64url');
    const tokenHash = digest(token);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    const pool = getPool();
    if (pool) await pool.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)', [userId, tokenHash, expiresAt]);
    else memory.refresh.set(tokenHash, { userId, expiresAt });
    return token;
}

async function findUser(id: string): Promise<AuthUser | null> {
    const pool = getPool();
    if (pool) {
        const r = await pool.query<AuthUser>('SELECT id, email, name, role FROM users WHERE id = $1', [id]);
        return r.rows[0] ?? null;
    }
    const user = memory.users.get(id);
    return user ? { id: user.id, email: user.email, name: user.name, role: user.role } : null;
}

export async function rotateRefreshToken(token: string): Promise<{ user: AuthUser; refreshToken: string } | null> {
    const tokenHash = digest(token);
    const pool = getPool();
    let userId: string | undefined;
    if (pool) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const r = await client.query<{ user_id: string }>(
                `UPDATE refresh_tokens SET revoked_at = now()
                 WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
                 RETURNING user_id`,
                [tokenHash]
            );
            userId = r.rows[0]?.user_id;
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally { client.release(); }
    } else {
        const found = memory.refresh.get(tokenHash);
        if (found && found.expiresAt > new Date()) {
            userId = found.userId;
            memory.refresh.delete(tokenHash);
        }
    }
    if (!userId) return null;
    const user = await findUser(userId);
    if (!user) return null;
    return { user, refreshToken: await issueRefreshToken(user.id) };
}

export async function revokeRefreshToken(token: string): Promise<void> {
    const tokenHash = digest(token);
    const pool = getPool();
    if (pool) await pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1', [tokenHash]);
    else memory.refresh.delete(tokenHash);
}

export async function createInvite(email: string, createdBy: string, expiresHours = 48): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = digest(token);
    const expiresAt = new Date(Date.now() + Math.min(Math.max(expiresHours, 1), 168) * 3600000);
    const normalized = normalizeEmail(email);
    const pool = getPool();
    if (pool) {
        const capacity = await pool.query<{ total: string | number }>(
            `SELECT
                (SELECT COUNT(*) FROM users) +
                (SELECT COUNT(DISTINCT i.email) FROM user_invites i
                 WHERE i.used_at IS NULL AND i.expires_at > now()
                   AND NOT EXISTS (SELECT 1 FROM users u WHERE u.email = i.email)) AS total`
        );
        if (Number(capacity.rows[0]?.total ?? 0) >= quotas.authors) throw new AuthorQuotaError();
        await pool.query('INSERT INTO user_invites (email, token_hash, created_by, expires_at) VALUES ($1,$2,$3,$4)', [normalized, tokenHash, createdBy, expiresAt]);
    } else {
        const pendingEmails = new Set(
            [...memory.invites.values()]
                .filter((invite) => !invite.usedAt && invite.expiresAt > new Date())
                .map((invite) => invite.email)
        );
        const existingEmails = new Set([...memory.users.values()].map((user) => user.email));
        const reserved = [...pendingEmails].filter((email) => !existingEmails.has(email)).length;
        if (memory.users.size + reserved >= quotas.authors) throw new AuthorQuotaError();
        memory.invites.set(tokenHash, { email: normalized, expiresAt, usedAt: null, createdBy });
    }
    return { token, expiresAt };
}

export async function getInvite(token: string): Promise<{ email: string; expiresAt: Date } | null> {
    const tokenHash = digest(token);
    const pool = getPool();
    if (pool) {
        const r = await pool.query<{ email: string; expires_at: Date }>(
            'SELECT email, expires_at FROM user_invites WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()',
            [tokenHash]
        );
        return r.rows[0] ? { email: r.rows[0].email, expiresAt: r.rows[0].expires_at } : null;
    }
    const invite = memory.invites.get(tokenHash);
    return invite && !invite.usedAt && invite.expiresAt > new Date() ? { email: invite.email, expiresAt: invite.expiresAt } : null;
}

export async function acceptInvite(token: string, name: string, password: string): Promise<AuthUser | null> {
    const invite = await getInvite(token);
    if (!invite) return null;
    const pool = getPool();
    const passwordHash = await hashPassword(password);
    const tokenHash = digest(token);
    if (pool) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
            const userCount = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users');
            if (Number(userCount.rows[0]?.count ?? 0) >= quotas.authors) {
                throw new AuthorQuotaError();
            }
            const consumed = await client.query<{ email: string }>(
                `UPDATE user_invites SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() RETURNING email`,
                [tokenHash]
            );
            if (!consumed.rows[0]) { await client.query('ROLLBACK'); return null; }
            const created = await client.query<AuthUser>(
                `INSERT INTO users (email,name,password_hash,role) VALUES ($1,$2,$3,'user')
                 ON CONFLICT (email) DO NOTHING RETURNING id,email,name,role`,
                [consumed.rows[0].email, name.trim(), passwordHash]
            );
            if (!created.rows[0]) { await client.query('ROLLBACK'); return null; }
            await client.query('COMMIT');
            return created.rows[0];
        } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    }
    const stored = memory.invites.get(tokenHash);
    if (!stored || stored.usedAt) return null;
    if ([...memory.users.values()].some((u) => u.email === stored.email)) return null;
    if (memory.users.size >= quotas.authors) throw new AuthorQuotaError();
    stored.usedAt = new Date();
    const user: StoredUser = { id: randomUUID(), email: stored.email, name: name.trim(), role: 'user', passwordHash };
    memory.users.set(user.id, user);
    return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export function isAuthConfigured(): boolean {
    return Boolean(process.env.JWT_SECRET);
}
