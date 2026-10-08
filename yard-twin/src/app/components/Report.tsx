import { generateInsights } from "../../analysis/insights.ts";
import { LIMITATIONS } from "../../analysis/limitations.ts";
import { scenarioHash, type ScenarioFile } from "../../engine/scenario.ts";
import { formatClock } from "../../engine/time.ts";
import { fmtMoney, fmtNum, type Lang, type T } from "../i18n.ts";
import type { RunOutput } from "../jobs.ts";
import type { Controls, Dataset } from "../types.ts";

/**
 * Utskriftsvy = PDF-rapport för kundmöte (webbläsarens "Spara som PDF"). Den syns bara vid utskrift.
 * Innehåll: scenario, antaganden med källa, kalibreringsbetyg, resultat med intervall, insikter, begränsningar.
 */
export function Report({ c, ds, out, scenario, t_, lang, doors, openFrom, openTo }: { c: Controls; ds: Dataset; out: RunOutput; scenario: ScenarioFile; t_: T; lang: Lang; doors: number; openFrom: number; openTo: number }) {
  const s = out.mc.summary;
  const L = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const min = (v: number) => `${fmtNum(lang, v)} min`;
  const cal = ds.calibration;
  const insights = generateInsights({ result: out.detail, mc: out.mc.reps > 1 ? out.mc : undefined, lang, currency: c.currency, doorCount: doors, closeAt: openTo, openAt: openFrom });
  const rows: [string, string][] = [
    [L("Medelväntan till dörr", "Average wait to door"), `${min(s.avgWait.median)} (${min(s.avgWait.p10)}–${min(s.avgWait.p90)})`],
    [L("P90-väntan", "P90 wait"), `${min(s.p90Wait.median)} (${min(s.p90Wait.p10)}–${min(s.p90Wait.p90)})`],
    [L("Max kö", "Max queue"), `${fmtNum(lang, s.maxQueue.median)} (${fmtNum(lang, s.maxQueue.p10)}–${fmtNum(lang, s.maxQueue.p90)})`],
    [L("Bilar över detention-gräns", "Trucks over detention limit"), `${fmtNum(lang, s.overDetention.median)} (${fmtNum(lang, s.overDetention.p10)}–${fmtNum(lang, s.overDetention.p90)})`],
    [L("Detention-kostnad per dag", "Detention cost per day"), `${fmtMoney(lang, s.detentionCost.median, c.currency)} (${fmtMoney(lang, s.detentionCost.p10, c.currency)}–${fmtMoney(lang, s.detentionCost.p90, c.currency)})`],
    [L("Dörrbeläggning", "Door utilisation"), `${fmtNum(lang, s.doorUtilization.median * 100)} % (${fmtNum(lang, s.doorUtilization.p10 * 100)}–${fmtNum(lang, s.doorUtilization.p90 * 100)} %)`],
    [L("Gården tom", "Yard empty"), `${formatClock(s.timeToEmpty.median)} (${formatClock(s.timeToEmpty.p10)}–${formatClock(s.timeToEmpty.p90)})`],
  ];
  return (
    <div className="report" aria-hidden="true">
      <h1>LUPNUMBER {t_("reportTitle")}</h1>
      <p>{ds.site.label} · {c.date} · {scenario.name} · {L("scenario-id", "scenario id")} {scenarioHash(scenario)} · {t_("generated")} {new Date().toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB")}</p>
      {ds.kind === "demo" && <p><i>{t_("demoNote")}</i></p>}

      <section>
        <h2>{t_("calibration")}</h2>
        {cal ? (
          <>
            <p><b>{t_(`grade_${cal.grade}`)}</b>{cal.warning ? L(" – VARNING: resultaten ska tolkas med försiktighet.", " – WARNING: interpret results with caution.") : ""}</p>
            <ul>{cal.reasons.map((r, i) => <li key={i}>{r[lang]}</li>)}</ul>
          </>
        ) : (
          <p>{L("Ingen kalibrering – resultaten är inte backtestade.", "No calibration – results are not backtested.")}</p>
        )}
      </section>

      <section>
        <h2>{t_("scenario")}</h2>
        <table>
          <tbody>
            <tr><td>{t_("mode")}</td><td>{c.mode === "replay" ? t_("replay") : t_("whatif")}</td></tr>
            <tr><td>{t_("pattern")}</td><td>{t_(`p_${scenario.arrivals.pattern}`)} · {t_("volume")} × {fmtNum(lang, scenario.arrivals.volumeFactor, 2)}</td></tr>
            <tr><td>{t_("doors")}</td><td>{typeof scenario.site.doors === "number" ? scenario.site.doors : scenario.site.doors.length}</td></tr>
            <tr><td>{t_("open")}–{t_("close")}</td><td>{scenario.site.open}–{scenario.site.close}</td></tr>
            <tr><td>{t_("strategy")}</td><td>{t_(`s_${scenario.strategy.kind}`)}</td></tr>
            {scenario.arrivals.slot && <tr><td>Slots</td><td>{scenario.arrivals.slot.lengthMin} min · {scenario.arrivals.slot.capacityPerHour}/h · adherence {scenario.arrivals.slot.adherence === null ? t_("adherenceData") : `${fmtNum(lang, scenario.arrivals.slot.adherence * 100)} %`}</td></tr>}
            <tr><td>Monte Carlo</td><td>{out.mc.reps} {L("repetitioner", "repetitions")}, seed "{out.mc.seed}"</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>{t_("assumptions")}</h2>
        <table>
          <tbody>
            <tr><td>{t_("costPerHour")}</td><td>{fmtMoney(lang, c.detentionCostPerHour, c.currency)}</td><td>{c.costSource}</td></tr>
            <tr><td>{t_("freeTime")}</td><td>{c.detentionFreeMin} min</td><td>{c.costSource}</td></tr>
            <tr><td>{t_("staffCost")}</td><td>{fmtMoney(lang, c.staffCostPerHour, c.currency)}</td><td>{c.costSource}</td></tr>
            <tr><td>{L("Lossningstider, ankomstprofil, grindtid, no-show", "Unloading times, arrival profile, gate time, no-show")}</td><td>{L("Mätt", "Measured")}</td><td>{ds.quality ? `${ds.quality.firstDate}–${ds.quality.lastDate}, ${ds.quality.includedVisits} ${L("besök", "visits")}` : ""}</td></tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>{t_("results")} ({L("median och 10–90 %-intervall", "median and 10–90 % interval")})</h2>
        <table><tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
      </section>

      <section>
        <h2>{t_("insights")}</h2>
        <ul>{insights.map((i) => <li key={i.id}>{i.text}</li>)}</ul>
      </section>

      <section>
        <h2>{t_("limitations")}</h2>
        <ul>{LIMITATIONS.map((l) => <li key={l.id}>{l[lang]}</li>)}</ul>
      </section>
    </div>
  );
}
