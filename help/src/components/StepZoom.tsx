import type { Hotspot } from "@/lib/types";

/**
 * Inzoomat utsnitt av skärmbilden runt en markering, så att varje steg visar exakt var man klickar.
 * Räknas fram från markeringens position (procent) och bildens storlek – ingen extra bildfil behövs.
 */
export function StepZoom({ src, size, spot, label }: { src: string; size: [number, number]; spot: Hotspot; label: string }) {
  const [W, H] = size;
  const A = 16 / 6; // utsnittets proportioner
  const rx = ((spot.x ?? 0) / 100) * W;
  const ry = ((spot.y ?? 0) / 100) * H;
  const rw = ((spot.w ?? 6) / 100) * W;
  const rh = ((spot.h ?? 6) / 100) * H;
  const pad = Math.max(rw, rh) * 0.25 + 50;
  let cw = Math.max(rw + 2 * pad, W * 0.3);
  let ch = Math.max(rh + 2 * pad, H * 0.18);
  if (cw / ch < A) cw = ch * A;
  else ch = cw / A;
  if (cw > W) {
    cw = W;
    ch = Math.min(H, cw / A);
  }
  if (ch > H) ch = H;
  // Täcker utsnittet ändå nästan hela bilden ger zoomen inget – då räcker den stora skärmbilden.
  if (cw > W * 0.8) return null;
  const cx = Math.min(Math.max(rx + rw / 2 - cw / 2, 0), W - cw);
  const cy = Math.min(Math.max(ry + rh / 2 - ch / 2, 0), H - ch);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <div
      className="relative mt-3 w-full overflow-hidden rounded-lg border border-line bg-white"
      style={{ aspectRatio: `${cw} / ${ch}`, maxWidth: "100%" }}
      role="img"
      aria-label={`Inzoomat: ${label}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        className="absolute max-w-none select-none"
        style={{ width: pct(W, cw), left: `-${pct(cx, cw)}`, top: `-${pct(cy, ch)}` }}
      />
      <span
        aria-hidden
        className="absolute rounded-md ring-4 ring-lup/70 ring-offset-2"
        style={{ left: pct(rx - cx, cw), top: pct(ry - cy, ch), width: pct(rw, cw), height: pct(rh, ch) }}
      />
    </div>
  );
}
