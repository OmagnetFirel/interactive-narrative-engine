import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { formatDuration, thumbnailFromVideoUrl } from '../../utils/media';

/** Evento usado para garantir que só uma prévia toque por vez. */
const PREVIEW_EVENT = 'branchplay:preview-play';

interface VideoPreviewProps {
  id: string;
  videoUrl: string;
  thumbnail?: string;
  duration?: number;
}

/**
 * Prévia do vídeo da cena: mostra a miniatura e, ao clicar, toca o HLS
 * dentro do próprio nó. A instância do hls.js só existe enquanto toca.
 */
export function VideoPreview({ id, videoUrl, thumbnail, duration }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [playing, setPlaying] = useState(false);
  const [failedPoster, setFailedPoster] = useState<string | undefined>();

  const poster = thumbnail || thumbnailFromVideoUrl(videoUrl);
  const durationLabel = formatDuration(duration);
  const thumbFailed = Boolean(poster) && failedPoster === poster;

  useEffect(() => {
    const onOtherPlay = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) setPlaying(false);
    };
    window.addEventListener(PREVIEW_EVENT, onOtherPlay);
    return () => window.removeEventListener(PREVIEW_EVENT, onOtherPlay);
  }, [id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!playing || !video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 10 });
      hlsRef.current = hls;
      hls.loadSource(videoUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => { });
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = videoUrl;
      void video.play().catch(() => { });
    }

    return () => {
      video.pause();
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeAttribute('src');
      video.load();
    };
  }, [playing, videoUrl]);

  const start = () => {
    window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: id }));
    setPlaying(true);
  };

  return (
    <div className="nodrag nowheel relative w-full aspect-video rounded-lg overflow-hidden bg-[#241711]">
      {playing ? (
        <>
          <video
            ref={videoRef}
            className="w-full h-full object-contain bg-black"
            controls
            playsInline
            onEnded={() => setPlaying(false)}
          />
          <button
            type="button"
            onClick={() => setPlaying(false)}
            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs hover:bg-black/80"
            title="Fechar prévia"
          >
            ✕
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={start}
          className="group w-full h-full flex items-center justify-center"
          title="Ver prévia do vídeo"
        >
          {poster && !thumbFailed && (
            <img
              src={poster}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setFailedPoster(poster)}
              draggable={false}
            />
          )}
          <span className="relative w-10 h-10 rounded-full bg-black/55 text-white flex items-center justify-center text-lg group-hover:bg-copper group-hover:scale-105 transition">
            ▶
          </span>
          {durationLabel && (
            <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/65 text-white text-[10px] font-semibold tabular-nums">
              {durationLabel}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
