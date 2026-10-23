let activeVideoId: string | null = null;

export function acquireTranscodeLock(videoId: string): boolean {
    if (activeVideoId !== null) return false;
    activeVideoId = videoId;
    return true;
}

export function releaseTranscodeLock(videoId: string): void {
    if (activeVideoId === videoId) activeVideoId = null;
}

export function getActiveTranscodeId(): string | null {
    return activeVideoId;
}
