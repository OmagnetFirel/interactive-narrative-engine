import type { Express, Request, Response } from 'express';
import {
    acceptInvite, authenticate, AuthorQuotaError, createInvite, getInvite, isAuthConfigured,
    issueRefreshToken, revokeRefreshToken, rotateRefreshToken, signAccessToken,
} from '../services/authService.js';
import { requireAdmin, requireAuth, type AuthenticatedRequest } from '../middleware/requireAdmin.js';

const COOKIE = 'ine_refresh';
function cookies(req: Request): Record<string, string> {
    return Object.fromEntries((req.headers.cookie ?? '').split(';').map((part) => {
        const [key, ...value] = part.trim().split('=');
        return [key, decodeURIComponent(value.join('='))];
    }).filter(([key]) => key));
}
function setRefreshCookie(res: Response, token: string): void {
    const secure = process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
    res.cookie(COOKIE, token, {
        httpOnly: true, secure, sameSite: 'strict', path: '/api/auth',
        maxAge: 30 * 24 * 60 * 60 * 1000,
    });
}
function clearRefreshCookie(res: Response): void {
    res.clearCookie(COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true', sameSite: 'strict', path: '/api/auth' });
}

export function registerAuthRoutes(app: Express) {
    app.post('/api/auth/login', async (req: Request, res: Response) => {
        if (!isAuthConfigured()) {
            return res.status(503).json({ error: 'Autenticação não configurada no servidor' });
        }
        const { email, password } = req.body as { email?: string; password?: string };
        if (typeof email !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ error: 'Email e senha são obrigatórios' });
        }
        try {
            const user = await authenticate(email, password);
            if (!user) return res.status(401).json({ error: 'Email ou senha inválidos' });
            setRefreshCookie(res, await issueRefreshToken(user.id));
            res.json({ accessToken: signAccessToken(user), expiresIn: '15m', user });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Erro ao autenticar';
            console.error('❌ /api/auth/login:', msg);
            res.status(500).json({ error: msg });
        }
    });

    app.post('/api/auth/refresh', async (req, res) => {
        const token = cookies(req)[COOKIE];
        if (!token) return res.status(401).json({ error: 'Refresh token ausente' });
        const rotated = await rotateRefreshToken(token);
        if (!rotated) { clearRefreshCookie(res); return res.status(401).json({ error: 'Sessão expirada' }); }
        setRefreshCookie(res, rotated.refreshToken);
        res.json({ accessToken: signAccessToken(rotated.user), expiresIn: '15m', user: rotated.user });
    });

    app.post('/api/auth/logout', async (req, res) => {
        const token = cookies(req)[COOKIE];
        if (token) await revokeRefreshToken(token);
        clearRefreshCookie(res);
        res.status(204).send();
    });

    app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
        res.json({ authenticated: true, user: req.user });
    });

    app.post('/api/auth/invites', requireAdmin, async (req: AuthenticatedRequest, res) => {
        const { email, expiresHours } = req.body as { email?: string; expiresHours?: number };
        if (typeof email !== 'string' || !email.includes('@')) return res.status(400).json({ error: 'Email inválido' });
        try {
            const invite = await createInvite(email, req.user!.sub, expiresHours);
            const base = (process.env.PUBLIC_EDITOR_URL ?? 'http://localhost:3000').replace(/\/$/, '');
            res.status(201).json({ token: invite.token, expiresAt: invite.expiresAt, url: `${base}/accept-invite/${invite.token}` });
        } catch (error) {
            if (error instanceof AuthorQuotaError) {
                return res.status(409).json({ error: error.message, code: error.code });
            }
            throw error;
        }
    });

    app.get('/api/auth/invites/:token', async (req, res) => {
        const invite = await getInvite(req.params.token);
        if (!invite) return res.status(404).json({ error: 'Convite inválido ou expirado' });
        res.json(invite);
    });

    app.post('/api/auth/invites/:token/accept', async (req, res) => {
        const { name, password } = req.body as { name?: string; password?: string };
        if (typeof name !== 'string' || name.trim().length < 2) return res.status(400).json({ error: 'Nome inválido' });
        if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres' });
        try {
            const user = await acceptInvite(req.params.token, name, password);
            if (!user) return res.status(409).json({ error: 'Convite inválido, expirado, usado ou email já cadastrado' });
            res.status(201).json({ message: 'Conta criada', email: user.email });
        } catch (error) {
            if (error instanceof AuthorQuotaError) {
                return res.status(409).json({ error: error.message, code: error.code });
            }
            throw error;
        }
    });
}

export function warnIfAuthNotConfigured(): void {
    if (!isAuthConfigured()) {
        console.warn('⚠️ JWT_SECRET não definido — rotas protegidas retornarão 503');
    }
}
