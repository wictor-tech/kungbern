import { useRef } from "react";
import type { GuideVideo } from "../../../shared/types";

/** Korta instruktionsvideor. Hoppar direkt till rätt del (start/end). Stöd för egna filer samt YouTube/Loom-länkar. */
export function VideoPlayer({ video, onPlay }: { video: GuideVideo; onPlay?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const yt = video.url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{6,15})/);
  const loom = video.url.match(/loom\.com\/(?:share|embed)\/([a-f0-9]{16,40})/i);
  if (yt) {
    const q = new URLSearchParams({ start: String(Math.floor(video.start ?? 0)), rel: "0", ...(video.end ? { end: String(Math.floor(video.end)) } : {}) });
    return <div className="video"><iframe src={`https://www.youtube-nocookie.com/embed/${yt[1]}?${q}`} title="video" allow="fullscreen; picture-in-picture" loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" /></div>;
  }
  if (loom) {
    return <div className="video"><iframe src={`https://www.loom.com/embed/${loom[1]}${video.start ? `?t=${Math.floor(video.start)}` : ""}`} title="video" allow="fullscreen" loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" /></div>;
  }
  const frag = video.start || video.end ? `#t=${video.start ?? 0}${video.end ? "," + video.end : ""}` : "";
  return (
    <div className="video">
      <video
        ref={ref} src={video.url + frag} poster={video.poster} controls playsInline preload="metadata" onPlay={onPlay}
        onTimeUpdate={(e) => { if (video.end && e.currentTarget.currentTime >= video.end) e.currentTarget.pause(); }}
      />
    </div>
  );
}
