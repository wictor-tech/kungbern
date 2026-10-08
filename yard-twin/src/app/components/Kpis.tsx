import type { MonteCarloResult } from "../../engine/montecarlo.ts";
import type { CostConfig, RunResult } from "../../engine/types.ts";
import { fmtMoney, fmtNum, type Lang, type T } from "../i18n.ts";
import { kpisAt } from "../playback.ts";

interface Props {
  result: RunResult;
  mc: MonteCarloResult | null;
  t: number;
  cost: CostConfig;
  t_: T;
  lang: Lang;
}

export function Kpis({ result, mc, t, cost, t_, lang }: Props) {
  const k = kpisAt(result, t, cost);
  const day = (key: "avgWait" | "detentionCost") => {
    if (!mc || mc.reps < 2) return null;
    const s = mc.summary[key];
    return key === "avgWait"
      ? `${t_("dayInterval")}: ${fmtNum(lang, s.p10)}–${fmtNum(lang, s.p90)} min`
      : `${t_("dayInterval")}: ${fmtMoney(lang, s.p10, cost.currency)}–${fmtMoney(lang, s.p90, cost.currency)}`;
  };
  return (
    <section className="kpis" aria-live="polite">
      <div className="card kpi">
        <div className="label">{t_("kpiOnSite")}</div>
        <div className="value">{k.onSite}</div>
        <div className="sub">{t_("kpiWaitingOf")} {k.waiting}</div>
      </div>
      <div className="card kpi">
        <div className="label">{t_("kpiAvgWait")}</div>
        <div className="value">{fmtNum(lang, k.avgWaitSoFar)} <span className="small">min</span></div>
        <div className="sub">{day("avgWait") ?? t_("sofar")}</div>
      </div>
      <div className="card kpi">
        <div className="label">{t_("kpiUnloaded")}</div>
        <div className="value">{k.unloaded} <span className="small">/ {k.planned}</span></div>
        <div className="sub">{fmtNum(lang, k.planned ? (100 * k.unloaded) / k.planned : 0)} %</div>
      </div>
      <div className="card kpi">
        <div className="label">{t_("kpiDetention")}</div>
        <div className="value">{fmtMoney(lang, k.detentionCostSoFar, cost.currency)}</div>
        <div className="sub">{day("detentionCost") ?? t_("sofar")}</div>
      </div>
    </section>
  );
}
