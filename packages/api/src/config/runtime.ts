import path from 'path';

function positiveInteger(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`${name} deve ser um inteiro positivo`);
    }
    return parsed;
}

export const uploadsRoot = path.resolve(process.env.UPLOAD_DIR ?? './uploads');

export const quotas = {
    authors: positiveInteger('MAX_AUTHORS', 5),
    projectsPerUser: positiveInteger('MAX_PROJECTS_PER_USER', 3),
    uploadBytesPerUser: positiveInteger('MAX_UPLOAD_BYTES_PER_USER', 5 * 1024 ** 3),
} as const;

export function trustProxySetting(): boolean | number | string {
    const value = process.env.TRUST_PROXY?.trim();
    if (!value || value === 'false') return false;
    if (value === 'true') return true;
    if (/^\d+$/.test(value)) return Number(value);
    return value;
}

export function assertSafeProductionSecrets(): void {
    if (process.env.NODE_ENV !== 'production') return;

    const weakDefaults: Record<string, string[]> = {
        JWT_SECRET: ['change-me-to-a-long-random-secret', 'secret', 'changeme'],
        ADMIN_PASSWORD: ['change-me-in-production', 'password', 'admin'],
        ADMIN_EMAIL: ['admin@example.com'],
    };
    const missingOrWeak: string[] = [];

    for (const [name, defaults] of Object.entries(weakDefaults)) {
        const value = process.env[name]?.trim();
        if (!value || defaults.includes(value.toLowerCase())) missingOrWeak.push(name);
    }

    if ((process.env.JWT_SECRET?.trim().length ?? 0) < 32) {
        if (!missingOrWeak.includes('JWT_SECRET')) missingOrWeak.push('JWT_SECRET');
    }
    if ((process.env.ADMIN_PASSWORD?.length ?? 0) < 12) {
        if (!missingOrWeak.includes('ADMIN_PASSWORD')) missingOrWeak.push('ADMIN_PASSWORD');
    }

    if (missingOrWeak.length > 0) {
        throw new Error(
            `Configuração insegura de produção: defina valores fortes para ${missingOrWeak.join(', ')}`
        );
    }
}
