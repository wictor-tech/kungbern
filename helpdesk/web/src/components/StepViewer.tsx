import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Step } from "../../../shared/types";
import { fmt } from "../i18n";
import { useHelp } from "../context";
import { Markup } from "./Markup";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** En skärmbild som zoomar mot rätt knapp. Markeringar (ring/ruta) ligger i samma transformerade lager som bilden. */
export function Shot({ step, zoomed, n, showBadge = true }: { step: Step; zoomed: boolean; n?: number; showBadge?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const [ratio, setRatio] = useState(step.ratio ?? 1.6);
  const [loaded, setLoaded] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setLoaded(false); if (step.ratio) setRatio(step.ratio); }, [step.image, step.ratio]);

  const H = Math.round(Math.min(w * 0.72, 440)) || 240;
  const center = step.hotspot ? { x: step.hotspot.x + step.hotspot.w / 2, y: step.hotspot.y + step.hotspot.h / 2 } : step.focus;
  const baseH = w / ratio;
  const contain = Math.min(1, H / (baseH || 1));
  const zoomScale = step.hotspot ? clamp(0.5 / Math.max(step.hotspot.w, step.hotspot.h * 0.8, 0.1), 1.3, 3.2) : step.focus ? 2.1 : 1;
  const s = zoomed && center ? Math.max(zoomScale, contain) : contain;
  const imgW = w * s, imgH = imgW / ratio;
  const c = zoomed && center ? center : { x: 0.5, y: 0.5 };
  const tx = imgW <= w ? (w - imgW) / 2 : clamp(w / 2 - c.x * imgW, w - imgW, 0);
  const ty = imgH <= H ? (H - imgH) / 2 : clamp(H / 2 - c.y * imgH, H - imgH, 0);

  return (
    <div ref={ref} className="shot" style={{ height: H }}>
      <div className="shot-layer" style={{ width: w, transform: `translate(${tx}px, ${ty}px) scale(${s})` }}>
        <img
          src={step.image} alt="" draggable={false} decoding="async" style={{ aspectRatio: String(ratio) }}
          onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth) setRatio(i.naturalWidth / i.naturalHeight); setLoaded(true); }}
        />
        {step.hotspot && (
          <div className="hotspot" style={{ left: `${step.hotspot.x * 100}%`, top: `${step.hotspot.y * 100}%`, width: `${step.hotspot.w * 100}%`, height: `${step.hotspot.h * 100}%` }}>
            {showBadge && n !== undefined && <span className="hotspot-badge" style={{ transform: `scale(${1 / s})` }}>{n}</span>}
          </div>
        )}
        {!step.hotspot && (step.pin ?? step.focus) && <div className="ring" style={{ left: `${(step.pin ?? step.focus)!.x * 100}%`, top: `${(step.pin ?? step.focus)!.y * 100}%` }} />}
      </div>
      {!loaded && <div className="shot-loading" />}
    </div>
  );
}

export function StepViewer({ steps, onStep, onFinish }: { steps: Step[]; onStep?: (i: number) => void; onFinish?: () => void }) {
  const { t } = useHelp();
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<"single" | "all">("single");
  const [zoomed, setZoomed] = useState(true);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const total = steps.length;
  const step = steps[Math.min(idx, total - 1)];

  useEffect(() => { setIdx(0); setMode("single"); }, [steps]);
  useEffect(() => { if (mode === "single") onStep?.(idx); }, [idx, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // förladda nästa bild så att bytet känns direkt
    const nx = steps[idx + 1]?.image; if (nx) { const i = new Image(); i.src = nx; }
  }, [idx, steps]);

  const go = useCallback((d: number) => {
    setIdx((i) => clamp(i + d, 0, total - 1));
    setZoomed(true);
  }, [total]);

  if (!total) return null;

  if (mode === "all") {
    return (
      <div className="steps steps-all">
        <button className="link-btn" onClick={() => setMode("single")}>↩ {t.oneByOne}</button>
        <ol>
          {steps.map((s, i) => (
            <li key={s.id} className="card step-card">
              <div className="step-text"><span className="badge">{i + 1}</span><p><Markup text={s.text} /></p></div>
              {s.image && <Shot step={s} zoomed n={i + 1} />}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const last = idx === total - 1;
  return (
    <div
      className="steps" tabIndex={0} aria-roledescription="carousel"
      onKeyDown={(e) => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); }}
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        const s0 = touch.current; touch.current = null; if (!s0) return;
        const dx = e.changedTouches[0].clientX - s0.x, dy = e.changedTouches[0].clientY - s0.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="steps-head">
        <strong>{fmt(t.stepOf, { n: idx + 1, total })}</strong>
        <div className="dots" role="tablist">
          {steps.map((s, i) => <button key={s.id} className={i === idx ? "dot on" : i < idx ? "dot done" : "dot"} onClick={() => setIdx(i)} aria-label={`${t.stepsShort} ${i + 1}`} />)}
        </div>
        <button className="link-btn" onClick={() => setMode("all")}>{t.allSteps}</button>
      </div>

      {step.image ? (
        <div className="shot-wrap" onClick={() => (step.focus || step.hotspot) && setZoomed((z) => !z)}>
          <Shot step={step} zoomed={zoomed} n={idx + 1} />
          {(step.focus || step.hotspot) && <button className="chip zoom-chip" onClick={(e) => { e.stopPropagation(); setZoomed((z) => !z); }}>{zoomed ? `⤢ ${t.fullImage}` : `🔍 ${t.zoomIn}`}</button>}
        </div>
      ) : (
        <div className="noshot" aria-hidden><span>{idx + 1}</span></div>
      )}

      <div className={step.image ? "step-text big" : "step-text big solo"} aria-live="polite">
        <span className="badge">{idx + 1}</span>
        <p><Markup text={step.text} /></p>
      </div>

      <div className="steps-nav">
        <button className="btn ghost" disabled={idx === 0} onClick={() => go(-1)}>← {t.back}</button>
        {last ? (
          <button className="btn primary" onClick={onFinish}>✓ {t.finish}</button>
        ) : (
          <button className="btn primary" onClick={() => go(1)}>{t.next} →</button>
        )}
      </div>
    </div>
  );
}
