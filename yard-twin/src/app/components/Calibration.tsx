import { fmtNum, type Lang, type T } from "../i18n.ts";
import type { CalibrationSummary } from "../types.ts";

export function CalibrationBadge({ cal, t_ }: { cal?: CalibrationSummary; t_: T; lang: Lang }) {
  if (!cal) return <span className="badge low">{t_("calibration")}: –</span>;
  return (
    <span className={`badge ${cal.grade}`} title={t_("calibration")}>
      {cal.warning ? "⚠ " : "✓ "}
      {t_("calibration")}: {t_(`grade_${cal.grade}`)}
    </span>
  );
}

/** Betyget med motivering. Vid låg kvalitet eller tunn data: varning i stället för polerade siffror. */
export function CalibrationCard({ cal, t_, lang }: { cal?: CalibrationSummary; t_: T; lang: Lang }) {
  if (!cal) {
    return (
      <section className="card warnbox">
        <h2>{t_("calibration")}</h2>
        <p className="small">{lang === "sv" ? "Ingen kalibrering finns för den här sajten. Resultaten är inte backtestade och ska inte presenteras som prognos." : "No calibration exists for this site. Results are not backtested and must not be presented as a forecast."}</p>
      </section>
    );
  }
  const w = cal.metrics.avgWait;
  return (
    <section className={`card ${cal.warning ? "warnbox" : ""}`}>
      <div className="card-head">
        <h2>{t_("calibration")}</h2>
        <CalibrationBadge cal={cal} t_={t_} lang={lang} />
      </div>
      {cal.grade !== "insufficient" && w && (
        <p className="small" style={{ marginTop: 0 }}>
          {lang === "sv"
            ? `Backtest med verkliga ankomster på ${cal.testDays} senare dagar som modellen inte sett (${cal.testRange[0]}–${cal.testRange[1]}): medelväntan avviker ${fmtNum(lang, w.wmape * 100)} % (wMAPE), systematisk avvikelse ${fmtNum(lang, w.relBias * 100)} %, verkligheten låg inom modellens 10–90 %-intervall ${fmtNum(lang, w.coverage * 100)} % av dagarna.`
            : `Backtest with real arrivals on ${cal.testDays} later days unseen by the model (${cal.testRange[0]}–${cal.testRange[1]}): average wait error ${fmtNum(lang, w.wmape * 100)} % (wMAPE), bias ${fmtNum(lang, w.relBias * 100)} %, reality inside the model's 10–90 % interval on ${fmtNum(lang, w.coverage * 100)} % of days.`}
        </p>
      )}
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        {cal.reasons.map((r, i) => <li key={i}>{r[lang]}</li>)}
      </ul>
    </section>
  );
}
