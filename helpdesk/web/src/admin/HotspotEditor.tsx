import { useRef, useState } from "react";
import type { Hotspot } from "../../../shared/types";

/** Dra en ruta över skärmbilden för att markera knappen/fältet användaren ska klicka på. */
export function HotspotEditor({ src, value, onChange, onRatio }: { src: string; value?: Hotspot; onChange: (h?: Hotspot) => void; onRatio?: (r: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [live, setLive] = useState<Hotspot | undefined>();

  const pos = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const rect = (a: { x: number; y: number }, b: { x: number; y: number }): Hotspot => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  const shown = live ?? value;

  return (
    <div>
      <div
        ref={box} className="hs-edit"
        onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); const p = pos(e); setDrag(p); setLive({ ...p, w: 0, h: 0 }); }}
        onPointerMove={(e) => { if (drag) setLive(rect(drag, pos(e))); }}
        onPointerUp={(e) => { if (!drag) return; const r = rect(drag, pos(e)); setDrag(null); setLive(undefined); if (r.w > 0.01 && r.h > 0.01) onChange(r); }}
      >
        <img src={src} alt="" onLoad={(e) => onRatio?.(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} />
        {shown && <div className="hs-rect" style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%`, width: `${shown.w * 100}%`, height: `${shown.h * 100}%` }} />}
      </div>
      <div className="row" style={{ marginTop: 6, alignItems: "center" }}>
        <span className="muted small">{value ? "Markerat område sparat. Dra igen för att ändra." : "Dra en ruta på bilden för att markera knappen."}</span>
        {value && <button type="button" className="btn small ghost" onClick={() => onChange(undefined)}>Ta bort markering</button>}
      </div>
    </div>
  );
}
