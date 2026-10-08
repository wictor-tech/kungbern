import { useEffect, useMemo, useRef, useState } from "react";
import { generateInsights } from "../../analysis/insights.ts";
import type { SiteModel } from "../../engine/model.ts";
import { pairedDelta } from "../../engine/montecarlo.ts";
import type { ScenarioFile } from "../../engine/scenario.ts";
import { formatClock, parseClock } from "../../engine/time.ts";
import type { MetricKey } from "../../engine/types.ts";
import { fmtMoney, fmtNum, type Lang, type T } from "../i18n.ts";
import type { RunOutput } from "../jobs.ts";
import { timeBounds } from "../playback.ts";
import { encodeShare, withBooking, withoutBooking } from "../scenarioBuilder.ts";
import type { Controls, Dataset } from "../types.ts";
import { sim } from "../worker-client.ts";
import { Gantt } from "./Gantt.tsx";

interface Props {
  c: Controls;
  ds: Dataset;
  model: SiteModel;
  base: ScenarioFile;
  t_: T;
  lang: Lang;
}

const ROWS: { key: MetricKey; sv: string; en: string; kind: "min" | "n" | "money" | "pct" | "clock"; lowerIsBetter: boolean }[] = [
  { key: "avgWait", sv: "Medelväntan till dörr", en: "Average wait to door", kind: "min", lowerIsBetter: true },
  { key: "p90Wait", sv: "P90-väntan", en: "P90 wait", kind: "min", lowerIsBetter: true },
  { key: "maxQueue", sv: "Max kö", en: "Max queue", kind: "n", lowerIsBetter: true },
  { key: "overDetention", sv: "Bilar över detention-gräns", en: "Trucks over detention limit", kind: "n", lowerIsBetter: true },
  { key: "detentionCost", sv: "Detention-kostnad", en: "Detention cost", kind: "money", lowerIsBetter: true },
  { key: "doorUtilization", sv: "Dörrbeläggning", en: "Door utilisation", kind: "pct", lowerIsBetter: false },
  { key: "timeToEmpty", sv: "Tom gård", en: "Yard empty at", kind: "clock", lowerIsBetter: true },
];

/** Sida vid sida: utan vs med slottbokning, samma volym och seed (parvisa deltan). */
export function ComparePanel({ c, ds, model, base, t_, lang }: Props) {
  const [res, setRes] = useState<{ without: RunOutput; with: RunOutput } | null>(null);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const files = useMemo(() => ({ without: withoutBooking(base, c), with: withBooking(base, c) }), [base, c]);

  const reqId = useRef(0);
  const [ranFor, setRanFor] = useState<string | null>(null);
  const sig = useMemo(() => JSON.stringify([files, model.siteId, model.dayType]), [files, model]);
  const run = () => {
    const id = ++reqId.current;
    const at = sig;
    setBusy(true);
    sim
      .call<{ without: RunOutput; with: RunOutput }>("compare", model, files.without, files.with)
      .then((r) => {
        // Bara det senaste anropet får skriva – annars kan ett äldre svar skriva över ett nyare.
        if (id !== reqId.current) return;
        setRes(r);
        setRanFor(at);
      })
      .finally(() => id === reqId.current && setBusy(false));
  };
  useEffect(() => {
    if (!auto) return;
    const h = setTimeout(run, 200);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, files, model]);

  const fmt = (kind: (typeof ROWS)[number]["kind"], v: number) =>
    kind === "min" ? `${fmtNum(lang, v)} min` : kind === "money" ? fmtMoney(lang, v, c.currency) : kind === "pct" ? `${fmtNum(lang, v * 100)} %` : kind === "clock" ? formatClock(v) : fmtNum(lang, v, 1);
  const fmtD = (kind: (typeof ROWS)[number]["kind"], v: number) =>
    kind === "clock" ? `${v > 0 ? "+" : ""}${fmtNum(lang, v)} min` : kind === "pct" ? `${v > 0 ? "+" : ""}${fmtNum(lang, v * 100)} p.e.` : `${v > 0 ? "+" : ""}${fmt(kind, v)}`;

  const insights = useMemo(
    () =>
      res
        ? generateInsights({ result: res.with.detail, mc: res.with.mc, lang, currency: c.currency, compare: { label: lang === "sv" ? "slottbokning" : "slot booking", mc: res.with.mc, baseLabel: lang === "sv" ? "ankomster utan bokning" : "unbooked arrivals", baseMc: res.without.mc } }).filter((i) => i.id.startsWith("compare"))
        : [],
    [res, lang, c.currency],
  );
  const openFrom = parseClock(c.open);
  const openTo = parseClock(c.close);

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t_("compareTitle")}</h2>
        {res && ranFor !== sig && <span className="tag assume" role="status">{t_("stale")}</span>}
        <span className="muted small">{lang === "sv" ? `Samma volym (× ${fmtNum(lang, c.volumeFactor, 2)}), samma dörrar och samma slumpströmmar – skillnaden beror på bokningen.` : `Same volume, doors and random streams – the difference is due to booking.`}</span>
        <span className="spacer" />
        <label className="small"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> {lang === "sv" ? "uppdatera automatiskt" : "auto-update"}</label>
        <button className="btn primary" onClick={run} disabled={busy}>{busy ? t_("computing") : t_("runAnalysis")}</button>
        <button className="btn" onClick={() => navigator.clipboard?.writeText(`${location.origin}${location.pathname}${encodeShare(c)}`)}>{t_("share")}</button>
      </div>
      {res && (
        <>
          <table className="cmp-table">
            <thead>
              <tr>
                <th></th>
                <th>{t_("without")}</th>
                <th>{t_("with")}</th>
                <th>{t_("delta")} ({t_("median")}, 10–90 %)</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => {
                const a = res.without.mc.summary[r.key];
                const b = res.with.mc.summary[r.key];
                const d = pairedDelta(res.without.mc, res.with.mc, r.key);
                const better = r.lowerIsBetter ? d.p90 < 0 : d.p10 > 0;
                const worse = r.lowerIsBetter ? d.p10 > 0 : d.p90 < 0;
                return (
                  <tr key={r.key}>
                    <td>{r[lang]}</td>
                    <td>{fmt(r.kind, a.median)} <span className="muted small">({fmt(r.kind, a.p10)}–{fmt(r.kind, a.p90)})</span></td>
                    <td>{fmt(r.kind, b.median)} <span className="muted small">({fmt(r.kind, b.p10)}–{fmt(r.kind, b.p90)})</span></td>
                    <td className={`delta ${better ? "good" : worse ? "bad" : ""}`}>
                      {fmtD(r.kind, d.median)} <span className="small">({fmtD(r.kind, d.p10)} … {fmtD(r.kind, d.p90)})</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {insights.map((i) => (
            <div key={i.id} className="insight" data-sev={i.severity}>
              <span className="dot" aria-hidden="true" />
              <span>{i.text}</span>
            </div>
          ))}
          <div className="cmp" style={{ marginTop: 12 }}>
            {(["without", "with"] as const).map((k) => {
              const o = res[k];
              const doors = Array.from(new Set(o.detail.doorIntervals.map((d) => d.doorId))).sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)));
              return (
                <div key={k}>
                  <h3>{t_(k)}</h3>
                  <Gantt result={o.detail} doors={doors} bounds={timeBounds(o.detail, openFrom, openTo)} openFrom={openFrom} openTo={openTo} t={openFrom} onSeek={() => undefined} t_={t_} />
                </div>
              );
            })}
          </div>
          <p className="small muted">{ds.kind === "demo" ? t_("demoNote") : ""}</p>
        </>
      )}
    </section>
  );
}
