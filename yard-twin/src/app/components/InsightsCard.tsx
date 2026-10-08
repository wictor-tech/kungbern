import { useMemo } from "react";
import { generateInsights } from "../../analysis/insights.ts";
import type { Lang, T } from "../i18n.ts";
import type { RunOutput } from "../jobs.ts";

/** Insikter i klartext – genereras ur körningen, aldrig hårdkodade. */
export function InsightsCard({ out, t_, lang, currency, doors, closeAt, openAt }: { out: RunOutput; t_: T; lang: Lang; currency: "SEK" | "EUR"; doors: number; closeAt: number; openAt: number }) {
  const items = useMemo(() => generateInsights({ result: out.detail, mc: out.mc.reps > 1 ? out.mc : undefined, lang, currency, doorCount: doors, closeAt, openAt }), [out, lang, currency, doors, closeAt, openAt]);
  return (
    <section className="card">
      <div className="card-head"><h2>{t_("insights")}</h2></div>
      {items.map((i) => (
        <div key={i.id} className="insight" data-sev={i.severity}>
          <span className="dot" aria-hidden="true" />
          <span>{i.text}</span>
        </div>
      ))}
    </section>
  );
}
