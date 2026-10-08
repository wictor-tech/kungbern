"use client";

import { useEffect, useRef, useState } from "react";
import type { Guide, GuideSummary } from "@/lib/types";
import { logViewApi } from "./client";
import { Feedback } from "./Feedback";
import { RichText } from "./RichText";
import { Screenshot } from "./Screenshot";
import { StepZoom } from "./StepZoom";
import { buildTour, hasTour } from "@/lib/tour";
import { Breadcrumb, GuideCard } from "./ui";

/**
 * En guide: var den finns, skärmbilden och stegen. Stegen går att bocka av,
 * vilket både hjälper användaren och visar supporten hur långt hen kom.
 */
export function GuideView({
  guide,
  related,
  queryId,
  originalQuery,
  page,
  answer,
  onOpenGuide,
  preview = false,
}: {
  guide: Guide;
  related: GuideSummary[];
  queryId: string | null;
  originalQuery: string | null;
  page: string | null;
  answer?: string;
  onOpenGuide?: (id: string) => void;
  /** Förhandsgranskning i admin: ingen loggning och ingen feedback. */
  preview?: boolean;
}) {
  const [done, setDone] = useState<number[]>([]);
  const [legendOpen, setLegendOpen] = useState(false);
  const [activeHotspot, setActiveHotspot] = useState<number | null>(null);
  const doneRef = useRef(done);
  doneRef.current = done;

  useEffect(() => {
    setDone([]);
    setLegendOpen(false);
    setActiveHotspot(null);
    // Visningen loggas när användaren lämnar guiden, med de steg hen bockat av.
    if (preview) return;
    return () => logViewApi(guide.id, queryId, doneRef.current);
  }, [guide.id, queryId, preview]);

  const toggle = (n: number) => setDone((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort((a, b) => a - b)));
  const warnings = guide.notes.filter((n) => n.type === "warning");
  const tips = guide.notes.filter((n) => n.type === "tip");
  const allDone = guide.steps.length > 0 && done.length === guide.steps.length;
  const hasMedia = Boolean(guide.screenshot || guide.video?.url);
  // Öppnad via "?"-knappen inne i LUPNUMBER (i en ram)? Då kan vi visa vägen direkt i appen.
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    try {
      setEmbedded(window.self !== window.top);
    } catch {
      setEmbedded(true);
    }
  }, []);
  const startTour = () => {
    window.parent.postMessage({ type: "lup-help:tour", guideId: guide.id, title: guide.title, steps: buildTour(guide) }, "*");
  };

  return (
    <article className="animate-rise" aria-labelledby="guide-title">
      {answer && <p className="mb-2 text-lg font-medium text-ink">{answer}</p>}
      <header className="bg-brand relative mb-6 space-y-3 overflow-hidden rounded-3xl px-5 py-5 text-white sm:space-y-4 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="guide-title" className="text-2xl font-bold tracking-tight text-balance sm:text-4xl">
            {guide.title}
          </h2>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold ring-1 ring-white/30">
            {guide.app === "site" ? "Site" : "Location Admin"}
          </span>
        </div>
        {guide.summary && <p className="max-w-3xl text-white/85">{guide.summary.replace(/\*\*/g, "")}</p>}
        <Breadcrumb items={guide.breadcrumb} onDark />
      </header>

      <div
        className={
          hasMedia ? "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : "grid max-w-2xl grid-cols-1 gap-6"
        }
      >
        {hasMedia && (
        <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          {guide.video?.url ? (
            <video
              src={`${guide.video.url}${guide.video.startSec ? `#t=${guide.video.startSec}${guide.video.endSec ? `,${guide.video.endSec}` : ""}` : ""}`}
              controls
              playsInline
              className="w-full rounded-xl border border-line bg-black"
            />
          ) : null}
          {guide.screenshot && (
            <Screenshot
              src={guide.screenshot}
              alt={`Skärmbild: ${guide.title}`}
              hotspots={guide.hotspots}
              active={activeHotspot}
              annotated={guide.screenshotAnnotated}
            />
          )}
          {guide.hotspots.length > 0 && (
            <div className="rounded-xl border border-line bg-white">
              <button
                type="button"
                onClick={() => setLegendOpen((o) => !o)}
                aria-expanded={legendOpen}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-navy"
              >
                <span>
                  Vad betyder siffrorna i bilden?
                  <span className="ml-2 font-normal text-muted">{guide.hotspots.length} markeringar</span>
                </span>
                <span aria-hidden className={`transition ${legendOpen ? "rotate-180" : ""}`}>
                  ▾
                </span>
              </button>
              {legendOpen && (
                <ol className="space-y-2 border-t border-line px-4 py-3">
                  {guide.hotspots.map((h) => (
                    <li
                      key={h.n}
                      onMouseEnter={() => setActiveHotspot(h.n)}
                      onMouseLeave={() => setActiveHotspot(null)}
                      className={`flex gap-3 rounded-md p-1 text-sm ${activeHotspot === h.n ? "bg-marker-tint" : ""}`}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-marker text-xs font-bold text-white">
                        {h.n}
                      </span>
                      <span>
                        <strong className="text-ink">{h.label}</strong>
                        {h.text && (
                          <span className="text-muted">
                            {" "}
                            — <RichText text={h.text} />
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
        )}

        <div className="space-y-4">
          {warnings.map((n, i) => (
            <p key={i} role="note" className="flex gap-3 rounded-2xl border-l-4 border-sun bg-warn px-4 py-3 text-sm text-warn-ink">
              <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sun text-base font-bold text-navy">
                !
              </span>
              <span className="pt-1">
                <strong>Var försiktig.</strong> <RichText text={n.text} />
              </span>
            </p>
          ))}

          {embedded && !preview && hasTour(guide) && (
            <button
              type="button"
              onClick={startTour}
              className="bg-brand flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 font-semibold text-white shadow-lg shadow-lup/30 hover:opacity-95"
            >
              <span aria-hidden>👆</span> Visa mig i appen
            </button>
          )}

          <section aria-labelledby="steps-title">
            <div className="mb-3 flex items-center gap-3">
              <h3 id="steps-title" className="text-xl font-bold text-navy">
                Gör så här
              </h3>
              <span className="ml-auto text-sm text-muted tabular-nums" aria-live="polite">
                {done.length} av {guide.steps.length} klara
              </span>
            </div>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
              <div
                className={`h-full rounded-full transition-all duration-300 ${allDone ? "bg-emerald-500" : "bg-lup"}`}
                style={{ width: `${guide.steps.length ? (done.length / guide.steps.length) * 100 : 0}%` }}
              />
            </div>
            <ol className="space-y-2">
              {guide.steps.map((s) => {
                const checked = done.includes(s.n);
                const spot = s.hotspot ? guide.hotspots.find((h) => h.n === s.hotspot && h.x !== undefined) : undefined;
                return (
                  <li key={s.n} onMouseEnter={() => spot && setActiveHotspot(spot.n)} onMouseLeave={() => setActiveHotspot(null)}>
                    <button
                      type="button"
                      onClick={() => toggle(s.n)}
                      aria-pressed={checked}
                      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition sm:p-4 ${
                        checked ? "border-emerald-300 bg-emerald-50" : "lift border-line bg-white shadow-sm hover:border-lup"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold ${
                          checked ? "bg-emerald-500 text-white" : "bg-navy text-white"
                        }`}
                        aria-hidden
                      >
                        {checked ? "✓" : s.n}
                      </span>
                      <span className="min-w-0 flex-1 pt-1">
                        <span className={`block text-base leading-snug ${checked ? "text-muted line-through" : "text-ink"}`}>
                          <RichText text={s.text} />
                        </span>
                        {spot && guide.screenshot && guide.screenshotSize && !checked && (
                          <StepZoom src={guide.screenshot} size={guide.screenshotSize} spot={spot} label={spot.label} />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="mt-2 text-xs text-muted">Tryck på ett steg när du har gjort det.</p>
          </section>

          {tips.map((n, i) => (
            <p key={i} role="note" className="rounded-2xl border-l-4 border-emerald-500 bg-tip px-4 py-3 text-sm text-tip-ink">
              <strong>Tips.</strong> <RichText text={n.text} />
            </p>
          ))}

          {!preview && <Feedback
            key={`${guide.id}-${queryId}`}
            guideId={guide.id}
            queryId={queryId}
            originalQuery={originalQuery}
            page={page}
            stepsViewed={done}
            highlight={allDone}
            onOpenGuide={onOpenGuide}
          />}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-10" aria-labelledby="related-title">
          <h3 id="related-title" className="mb-3 text-xl font-bold text-navy">
            Nästa steg
          </h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {related.map((r) =>
              onOpenGuide ? (
                <GuideCard key={r.id} guide={r} onClick={() => onOpenGuide(r.id)} />
              ) : (
                <GuideCard key={r.id} guide={r} />
              ),
            )}
          </div>
        </section>
      )}
    </article>
  );
}
