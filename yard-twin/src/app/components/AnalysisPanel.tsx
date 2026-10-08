import { useMemo, useState } from "react";
import type { BottleneckResult } from "../../analysis/bottleneck.ts";
import type { CapacityResult } from "../../analysis/capacity.ts";
import type { WaitTarget } from "../../analysis/common.ts";
import type { DoorSweepResult } from "../../analysis/optimize.ts";
import type { RoiResult } from "../../analysis/roi.ts";
import type { TornadoResult } from "../../analysis/sensitivity.ts";
import type { SlotDesignResult } from "../../analysis/slotDesign.ts";
import type { SiteModel } from "../../engine/model.ts";
import type { ScenarioFile } from "../../engine/scenario.ts";
import { fmtMoney, fmtNum, type Lang, type T } from "../i18n.ts";
import { withBooking, withoutBooking } from "../scenarioBuilder.ts";
import type { Controls, Dataset } from "../types.ts";
import { sim } from "../worker-client.ts";

interface Props {
  c: Controls;
  ds: Dataset;
  model: SiteModel;
  scenario: ScenarioFile;
  t_: T;
  lang: Lang;
}

const REPS = 100;

/**
 * Fas 4: optimering och analys. Analyser körs på en typisk dag enligt veckodagsprofilen
 * (inspelade ankomster ersätts av Poisson-ankomster med samma timprofil), med samma seed i alla steg.
 */
export function AnalysisPanel({ c, model, scenario, t_, lang }: Props) {
  const [targetMax, setTargetMax] = useState(20);
  const [opDays, setOpDays] = useState<number | "">("");
  const [carrierFee, setCarrierFee] = useState<number | "">(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tor, setTor] = useState<TornadoResult | null>(null);
  const [doors, setDoors] = useState<DoorSweepResult | null>(null);
  const [bn, setBn] = useState<BottleneckResult | null>(null);
  const [cap, setCap] = useState<CapacityResult | null>(null);
  const [slot, setSlot] = useState<SlotDesignResult | null>(null);
  const [roi, setRoi] = useState<RoiResult | null>(null);

  const s = useMemo<ScenarioFile>(() => {
    const base = scenario.arrivals.pattern === "recorded" ? { ...scenario, arrivals: { pattern: "poisson" as const, volumeFactor: scenario.arrivals.volumeFactor } } : scenario;
    return { ...base, monteCarlo: { reps: REPS, seed: scenario.monteCarlo?.seed ?? scenario.id } };
  }, [scenario]);
  const target: WaitTarget = { metric: "p90Wait", max: targetMax, quantile: "median" };
  const L = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const min = (v: number) => `${fmtNum(lang, v)} min`;

  const go = async <R,>(key: string, fn: string, set: (r: R) => void, ...args: unknown[]) => {
    setBusy(key);
    setErr(null);
    try {
      set(await sim.call<R>(fn, ...args));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const Btn = ({ k, onClick }: { k: string; onClick: () => void }) => (
    <button className="btn" onClick={onClick} disabled={busy !== null}>{busy === k ? t_("computing") : t_("runAnalysis")}</button>
  );

  return (
    <section className="card">
      <div className="card-head">
        <h2>{t_("analysis")}</h2>
        <span className="muted small">
          {scenario.arrivals.pattern === "recorded"
            ? L("Körs på en typisk dag för veckodagen (samma timprofil, slumpade ankomster).", "Runs on a typical day for the weekday (same hourly profile, random arrivals).")
            : L("Körs på aktuellt scenario.", "Runs on the current scenario.")}{" "}
          {REPS} {L("repetitioner per steg, samma seed.", "repetitions per step, same seed.")}
        </span>
        <span className="spacer" />
        <label className="small" htmlFor="target">{t_("target")}</label>
        <input id="target" type="number" min={1} max={240} value={targetMax} onChange={(e) => setTargetMax(Math.max(1, Number(e.target.value) || 1))} style={{ width: 70 }} />
        <span className="tag assume">{t_("assumption")}</span>
      </div>
      {err && <div className="warnbox small" role="alert">{err}</div>}

      <div className="two" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {/* Dörrar */}
        <div>
          <div className="card-head"><h3>{t_("doorsNeeded")}</h3><span className="spacer" /><Btn k="doors" onClick={() => go("doors", "doors", setDoors, model, s, target, Math.max(c.doors * 2, c.doors + 6), REPS)} /></div>
          {doors && (
            <>
              <p className="small" style={{ marginTop: 0 }}>
                <b>{t_("minimal")}: {doors.minimalDoors ?? t_("none")}</b>{doors.diminishing ? ` · ${doors.diminishing.text[lang]}` : ""}
              </p>
              <table className="list">
                <thead><tr><th>{t_("doors")}</th><th>P90 ({t_("median")})</th><th>10–90 %</th><th>{L("Vinst", "Gain")}</th><th>{L("Detention/dag", "Detention/day")}</th></tr></thead>
                <tbody>
                  {doors.steps.map((st) => (
                    <tr key={st.doors} style={{ fontWeight: st.doors === doors.minimalDoors ? 700 : 400 }}>
                      <td>{st.doors} {st.meetsTarget ? "✓" : ""}</td>
                      <td className="num">{min(st.summary.p90Wait.median)}</td>
                      <td className="num">{min(st.summary.p90Wait.p10)}–{min(st.summary.p90Wait.p90)}</td>
                      <td className="num">{st.marginalGain === null ? "" : `−${min(st.marginalGain)}`}</td>
                      <td className="num">{fmtMoney(lang, st.detentionCost.median, c.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Flaskhals */}
        <div>
          <div className="card-head"><h3>{t_("bottleneck")}</h3><span className="spacer" /><Btn k="bn" onClick={() => go("bn", "bottleneck", setBn, model, s, 40)} /></div>
          {bn && (
            <>
              <p className="small" style={{ marginTop: 0 }}>{bn.explanation[lang]}</p>
              <table className="list">
                <thead><tr><th>{L("Resurs", "Resource")}</th><th>{L("Beläggning", "Utilisation")}</th><th>{L("Andel av väntan", "Share of wait")}</th></tr></thead>
                <tbody>
                  {bn.resources.map((r) => (
                    <tr key={r.resource} style={{ fontWeight: r.resource === bn.bottleneck ? 700 : 400 }}>
                      <td>{{ gate: t_("gate"), doors: t_("doors"), parking: t_("parking") }[r.resource]} {r.saturated ? "⚠" : ""}</td>
                      <td className="num">{r.utilization === null ? "–" : `${fmtNum(lang, r.utilization * 100)} %`}</td>
                      <td className="num">{fmtNum(lang, r.waitShare * 100)} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ol className="small" style={{ paddingLeft: 18 }}>
                {bn.cascade.map((st, i) => (
                  <li key={i}>{st.change ? `${st.change[lang]} → ` : ""}{L("flaskhals", "bottleneck")}: <b>{st.bottleneck}</b>, {L("medelväntan", "avg wait")} {min(st.avgWait)}, P90 {min(st.p90Wait)}</li>
                ))}
              </ol>
            </>
          )}
        </div>

        {/* Kapacitet */}
        <div>
          <div className="card-head"><h3>{t_("capacity")}</h3><span className="spacer" /><Btn k="cap" onClick={() => go("cap", "capacity", setCap, model, s, target, REPS)} /></div>
          {cap && (
            <>
              <p className="small" style={{ marginTop: 0 }}>
                {cap.breakpointFactor === null
                  ? L(`Gården klarar målet upp till minst × ${fmtNum(lang, cap.maxFactor, 1)} dagens volym.`, `The yard meets the target up to at least × ${fmtNum(lang, cap.maxFactor, 1)} today's volume.`)
                  : L(
                      `${t_("breakpoint")} vid cirka × ${fmtNum(lang, cap.breakpointFactor, 2)} volym (≈ ${fmtNum(lang, cap.currentTrucks * cap.breakpointFactor)} bilar/dag). ${t_("margin")}: ${cap.margin === null ? "–" : `${fmtNum(lang, cap.margin * 100)} %`}.`,
                      `${t_("breakpoint")} at about × ${fmtNum(lang, cap.breakpointFactor, 2)} volume (≈ ${fmtNum(lang, cap.currentTrucks * cap.breakpointFactor)} trucks/day). ${t_("margin")}: ${cap.margin === null ? "–" : `${fmtNum(lang, cap.margin * 100)} %`}.`,
                    )}
                {cap.fired ? ` (${[cap.fired.target ? L("målet bryts", "target violated") : "", cap.fired.breakdown ? L("kön hinner inte betas av", "queue does not clear") : ""].filter(Boolean).join(", ")})` : ""}
              </p>
              <CapacityChart cap={cap} target={targetMax} lang={lang} />
            </>
          )}
        </div>

        {/* Slotdesign */}
        <div>
          <div className="card-head"><h3>{t_("slotDesign")}</h3><span className="spacer" /><Btn k="slot" onClick={() => go("slot", "slotDesign", setSlot, model, withBooking(s, c), 40)} /></div>
          {slot && (
            <>
              <p className="small" style={{ marginTop: 0 }}>{slot.reason[lang]}</p>
              {slot.recommended && (
                <p className="small"><b>{L("Rekommendation", "Recommendation")}: {slot.recommended.lengthMin} min, {slot.recommended.capacityPerHour} {L("bilar/timme", "trucks/hour")}</b> → P90 {min(slot.recommended.p90Wait.median)} ({min(slot.recommended.p90Wait.p10)}–{min(slot.recommended.p90Wait.p90)})</p>
              )}
              <div className="scroll" style={{ maxHeight: 200 }}>
                <table className="list">
                  <thead><tr><th>{L("Längd", "Length")}</th><th>{L("Bilar/h", "Trucks/h")}</th><th>{L("Medel", "Avg")}</th><th>P90</th><th>{L("Obokade", "Walk-ins")}</th></tr></thead>
                  <tbody>
                    {[...slot.grid].sort((a, b) => a.p90Wait.median - b.p90Wait.median).slice(0, 12).map((g) => (
                      <tr key={`${g.lengthMin}-${g.capacityPerHour}`}>
                        <td>{g.lengthMin} min</td><td>{g.capacityPerHour}</td><td className="num">{min(g.avgWait.median)}</td><td className="num">{min(g.p90Wait.median)}</td><td className="num">{fmtNum(lang, g.walkInShare.median * 100)} %</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Känslighet */}
        <div>
          <div className="card-head"><h3>{t_("tornado")}</h3><span className="spacer" /><Btn k="tor" onClick={() => go("tor", "tornado", setTor, model, s, REPS)} /></div>
          {tor && <TornadoChart tor={tor} lang={lang} />}
        </div>

        {/* ROI */}
        <div>
          <div className="card-head"><h3>{t_("roi")}</h3></div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="opdays">{t_("operatingDays")}</label>
              <input id="opdays" type="number" min={1} max={31} value={opDays} placeholder="?" onChange={(e) => setOpDays(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: 90 }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="cfee">{t_("carrierFee")} ({c.currency})</label>
              <input id="cfee" type="number" min={0} value={carrierFee} onChange={(e) => setCarrierFee(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: 120 }} />
            </div>
            <Btn
              k="roi"
              onClick={() =>
                go("roi", "roi", setRoi, model, withoutBooking(s, c), withBooking(s, c), {
                  detentionCostPerHour: c.detentionCostPerHour,
                  staffCostPerHour: c.staffCostPerHour,
                  carrierFeePerTruckOverLimit: carrierFee === "" ? undefined : carrierFee,
                  operatingDaysPerMonth: opDays === "" ? undefined : opDays,
                  currency: c.currency,
                  source: c.costSource,
                }, 200)
              }
            />
          </div>
          {roi && (
            <>
              <table className="cmp-table" style={{ marginTop: 8 }}>
                <tbody>
                  {(["daily", "monthly", "yearly"] as const).map((k) => (
                    <tr key={k}>
                      <td>{t_(k === "daily" ? "perDay" : k === "monthly" ? "perMonth" : "perYear")}</td>
                      <td><b>{fmtMoney(lang, roi[k].median, roi.currency)}</b></td>
                      <td className="muted">{fmtMoney(lang, roi[k].p10, roi.currency)} – {fmtMoney(lang, roi[k].p90, roi.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="small muted">{L("Besparing (positiv = billigare med slottbokning), median och 10–90 %-intervall.", "Saving (positive = cheaper with slot booking), median and 10–90 % interval.")}</p>
              <details className="small">
                <summary>{t_("assumptions")}</summary>
                <ul>{roi.assumptions.map((a) => <li key={a.key}>{a.label[lang]}: {typeof a.value === "number" ? fmtNum(lang, a.value, 2) : a.value} {a.unit} <span className="muted">({a.source})</span></li>)}</ul>
                <ul>{roi.caveats.map((cv, i) => <li key={i}>{cv[lang]}</li>)}</ul>
              </details>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function TornadoChart({ tor, lang }: { tor: TornadoResult; lang: Lang }) {
  const vals = tor.bars.flatMap((b) => [b.lowValue, b.highValue, b.baseline]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = (v: number) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
  return (
    <div className="bars">
      <div className="small muted">P90 {lang === "sv" ? "väntan, baslinje" : "wait, baseline"} {fmtNum(lang, tor.baseline)} min</div>
      {tor.bars.map((b) => {
        const a = x(Math.min(b.lowValue, b.highValue)), z = x(Math.max(b.lowValue, b.highValue));
        return (
          <div className="bar-row" key={b.param}>
            <span>{b.label[lang]} <span className="muted">({fmtNum(lang, b.lowSetting, 2)} / {fmtNum(lang, b.highSetting, 2)})</span></span>
            <div style={{ position: "relative", height: 16, background: "var(--grid)", borderRadius: 4 }}>
              <div style={{ position: "absolute", left: `${a}%`, width: `${Math.max(0.5, z - a)}%`, top: 0, bottom: 0, background: "var(--accent)", borderRadius: 4, transition: "all 0.4s" }} title={`${fmtNum(lang, b.lowValue)} – ${fmtNum(lang, b.highValue)} min`} />
              <div style={{ position: "absolute", left: `${x(b.baseline)}%`, top: -2, bottom: -2, width: 2, background: "var(--heading)" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CapacityChart({ cap, target, lang }: { cap: CapacityResult; target: number; lang: Lang }) {
  const W = 420, H = 150, P = 30;
  const pts = [...cap.curve].sort((a, b) => a.factor - b.factor);
  if (pts.length < 2) return null;
  const maxY = Math.max(target * 1.3, ...pts.map((p) => p.value.p90));
  const fx = (f: number) => P + ((f - pts[0].factor) / (pts[pts.length - 1].factor - pts[0].factor)) * (W - P - 8);
  const fy = (v: number) => H - 20 - (Math.min(v, maxY) / maxY) * (H - 30);
  const band = `${pts.map((p) => `${fx(p.factor)},${fy(p.value.p90)}`).join(" ")} ${[...pts].reverse().map((p) => `${fx(p.factor)},${fy(p.value.p10)}`).join(" ")}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Kapacitetskurva">
      <polygon points={band} fill="var(--accent)" opacity={0.18} />
      <polyline points={pts.map((p) => `${fx(p.factor)},${fy(p.value.median)}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth={2} />
      <line x1={P} x2={W - 8} y1={fy(target)} y2={fy(target)} stroke="var(--bad)" strokeDasharray="5 4" />
      <text x={W - 10} y={fy(target) - 4} fontSize={10} textAnchor="end" fill="var(--bad)">{lang === "sv" ? "mål" : "target"} {target} min</text>
      <line x1={fx(1)} x2={fx(1)} y1={10} y2={H - 20} stroke="var(--muted)" strokeDasharray="2 3" />
      {pts.map((p) => <text key={p.factor} x={fx(p.factor)} y={H - 6} fontSize={10} textAnchor="middle" fill="var(--muted)">×{fmtNum(lang, p.factor, 1)}</text>)}
    </svg>
  );
}
