import { rateLimit } from 'express-rate-limit';

function envLimit(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function limiter(windowMs: number, limit: number, message: string) {
    return rateLimit({
        windowMs,
        limit,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (_req, res) => {
            res.status(429).json({
                error: message,
                code: 'RATE_LIMIT_EXCEEDED',
            });
        },
    });
}

export const generalLimiter = limiter(
    15 * 60_000,
    envLimit('RATE_LIMIT_GENERAL', 300),
    'Muitas requisições. Aguarde alguns minutos e tente novamente.'
);

export const loginLimiter = limiter(
    15 * 60_000,
    5,
    'Muitas tentativas de login. Tente novamente em 15 minutos.'
);

export const inviteLimiter = limiter(
    60 * 60_000,
    envLimit('RATE_LIMIT_INVITES', 20),
    'Limite de operações com convites atingido. Tente novamente mais tarde.'
);

export const publicExpensiveLimiter = limiter(
    60_000,
    envLimit('RATE_LIMIT_PUBLIC_EXPENSIVE', 60),
    'Limite de operações de playback atingido. Aguarde um minuto.'
);
