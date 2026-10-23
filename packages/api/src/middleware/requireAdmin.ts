import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type AccessTokenPayload } from '../services/authService.js';

export interface AuthenticatedRequest extends Request {
    user?: AccessTokenPayload;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Autenticação necessária' });
        return;
    }

    const token = header.slice(7);
    const payload = verifyAccessToken(token);
    if (!payload) {
        res.status(401).json({ error: 'Token inválido ou expirado' });
        return;
    }

    req.user = payload;
    next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    requireAuth(req, res, () => {
        if (req.user?.role !== 'admin') {
            res.status(403).json({ error: 'Acesso restrito a administradores' });
            return;
        }
        next();
    });
}
