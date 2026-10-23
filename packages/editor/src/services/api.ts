import type { InteractiveGraph } from '@ine/shared';
import { getStoredToken, clearStoredToken, setStoredToken } from '../auth/tokenStorage';

export const API_URL =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
        ? String(import.meta.env.VITE_API_URL)
        : 'http://localhost:3001';

export const PLAYER_URL =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_PLAYER_URL
        ? String(import.meta.env.VITE_PLAYER_URL)
        : 'http://localhost:5173';

export const MEDIA_URL =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_MEDIA_URL
        ? String(import.meta.env.VITE_MEDIA_URL).replace(/\/$/, '')
        : API_URL.replace(/\/$/, '');

export const UPLOAD_API_URL =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_UPLOAD_API_URL
        ? String(import.meta.env.VITE_UPLOAD_API_URL).replace(/\/$/, '')
        : API_URL.replace(/\/$/, '');

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void): void {
    unauthorizedHandler = handler;
}

function authHeaders(): Record<string, string> {
    const token = getStoredToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseError(response: Response): Promise<string> {
    try {
        const j = (await response.json()) as { error?: string };
        if (j.error) return j.error;
    } catch {
        /* ignore */
    }
    return `Erro HTTP ${response.status}`;
}

async function fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
    let response = await fetch(url, {
        ...init,
        credentials: 'include',
        headers: {
            ...init?.headers,
            ...authHeaders(),
        },
    });

    if (response.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            response = await fetch(url, {
                ...init,
                credentials: 'include',
                headers: { ...init?.headers, ...authHeaders() },
            });
        }
        if (response.status === 401) {
            clearStoredToken();
            unauthorizedHandler?.();
        }
    }

    return response;
}

export interface AuthUser {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'user';
}

async function refreshAccessToken(): Promise<AuthUser | null> {
    const response = await fetch(`${API_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!response.ok) return null;
    const data = (await response.json()) as { accessToken: string; user: AuthUser };
    setStoredToken(data.accessToken);
    return data.user;
}

export interface SaveProjectResult {
    message: string;
    project: InteractiveGraph;
    shareToken?: string;
    shareUrl?: string;
}

export const api = {
    setUnauthorizedHandler,

    async login(email: string, password: string): Promise<{ accessToken: string; expiresIn: string; user: AuthUser }> {
        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            throw new Error(await parseError(response));
        }

        return response.json();
    },

    async refresh(): Promise<AuthUser | null> {
        return refreshAccessToken();
    },

    async logout(): Promise<void> {
        await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
        clearStoredToken();
    },

    async getMe(): Promise<{ authenticated: boolean; user: AuthUser }> {
        const response = await fetchWithAuth(`${API_URL}/api/auth/me`);
        if (!response.ok) throw new Error(await parseError(response));
        return response.json();
    },

    async createInvite(email: string): Promise<{ token: string; url: string; expiresAt: string }> {
        const response = await fetchWithAuth(`${API_URL}/api/auth/invites`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        if (!response.ok) throw new Error(await parseError(response));
        return response.json();
    },

    async getInvite(token: string): Promise<{ email: string; expiresAt: string }> {
        const response = await fetch(`${API_URL}/api/auth/invites/${encodeURIComponent(token)}`);
        if (!response.ok) throw new Error(await parseError(response));
        return response.json();
    },

    async acceptInvite(token: string, name: string, password: string): Promise<void> {
        const response = await fetch(`${API_URL}/api/auth/invites/${encodeURIComponent(token)}/accept`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password }),
        });
        if (!response.ok) throw new Error(await parseError(response));
    },

    async saveProject(graph: InteractiveGraph): Promise<SaveProjectResult> {
        const response = await fetchWithAuth(`${API_URL}/api/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify(graph),
        });

        if (!response.ok) {
            throw new Error(await parseError(response));
        }

        return response.json();
    },

    async getProjectsList(): Promise<InteractiveGraph[]> {
        const response = await fetchWithAuth(`${API_URL}/api/projects`);
        if (!response.ok) throw new Error(await parseError(response));
        const data = (await response.json()) as { projects?: InteractiveGraph[] };
        return data.projects ?? [];
    },

    async getProject(id: string): Promise<InteractiveGraph> {
        const response = await fetchWithAuth(`${API_URL}/api/projects/${encodeURIComponent(id)}`);
        if (!response.ok) throw new Error(await parseError(response));
        return response.json();
    },

    getAuthHeaders(): Record<string, string> {
        return authHeaders();
    },
};
