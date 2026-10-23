let accessToken: string | null = null;

export function getStoredToken(): string | null {
    return accessToken;
}

export function setStoredToken(token: string): void {
    accessToken = token;
}

export function clearStoredToken(): void {
    accessToken = null;
}
