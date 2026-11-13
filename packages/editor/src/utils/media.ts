/**
 * A API gera a miniatura ao lado da playlist HLS:
 *   .../hls/{id}/{id}.m3u8  →  .../hls/{id}/{id}_thumb.jpg
 * Usado para nós antigos que não guardaram a miniatura.
 */
export function thumbnailFromVideoUrl(videoUrl?: string): string | undefined {
  if (!videoUrl) return undefined;
  const match = videoUrl.match(/^(.*\/)([^/]+)\.m3u8(\?.*)?$/);
  if (!match) return undefined;
  return `${match[1]}${match[2]}_thumb.jpg`;
}

export function formatDuration(seconds?: number): string | undefined {
  if (!seconds || !Number.isFinite(seconds)) return undefined;
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
