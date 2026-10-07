"use client";

import { useEffect, useRef, useState } from "react";
import type { Guide, GuideSummary } from "@/lib/types";
import { logViewApi } from "./client";
import { Feedback } from "./Feedback";
import { RichText } from "./RichText";
import { Screenshot } from "./Screenshot";
import { StepZoom } from "./StepZoom";
import { AppBadge, Breadcrumb, GuideCard } from "./ui";

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

  return (
    <article className="animate-rise" aria-labelledby="guide-title">
      {answer && <p className="mb-2 text-lg font-medium text-ink">{answer}</p>}
      <header className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="guide-title" className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">
            {guide.title}
          </h2>
          <AppBadge app={guide.app} />
        </div>
        <Breadcrumb items={guide.breadcrumb} />
      </header>

      <div
        className={
          hasMedia ? "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" : "grid max-w-2xl grid-cols-1 gap-6"
        }
      >
        {hasMedia && (
        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
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
            <p key={i} role="note" className="rounded-xl border border-amber-200 bg-warn px-4 py-3 text-sm text-warn-ink">
              <strong>Var försiktig.</strong> <RichText text={n.text} />
            </p>
          ))}

          <section aria-labelledby="steps-title">
            <h3 id="steps-title" className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">
              Gör så här
            </h3>
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
                        checked ? "border-emerald-300 bg-emerald-50" : "border-line bg-white hover:border-lup"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                          checked ? "bg-emerald-500 text-white" : "bg-lup text-white"
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
            <p key={i} role="note" className="rounded-xl border border-emerald-200 bg-tip px-4 py-3 text-sm text-tip-ink">
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
          <h3 id="related-title" className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
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
