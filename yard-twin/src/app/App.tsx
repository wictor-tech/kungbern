import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compileScenario } from "../engine/scenario.ts";
import { formatClock, parseClock } from "../engine/time.ts";
import { AnalysisPanel } from "./components/AnalysisPanel.tsx";
import { CalibrationBadge, CalibrationCard } from "./components/Calibration.tsx";
import { ComparePanel } from "./components/ComparePanel.tsx";
import { ControlsPanel } from "./components/ControlsPanel.tsx";
import { Gantt } from "./components/Gantt.tsx";
import { InsightsCard } from "./components/InsightsCard.tsx";
import { Kpis } from "./components/Kpis.tsx";
import { LimitationsCard } from "./components/LimitationsCard.tsx";
import { Report } from "./components/Report.tsx";
import { TruckList } from "./components/TruckList.tsx";
import { YardView } from "./components/YardView.tsx";
import { dataset } from "./data.ts";
import { download, monteCarloCsv, trucksCsv } from "./exporters.ts";
import { fmtNum, makeT, type Lang } from "./i18n.ts";
import type { RunOutput } from "./jobs.ts";
import { timeBounds } from "./playback.ts";
import { PRESETS } from "./presets.ts";
import { buildScenario, dayOf, decodeShare, defaultControls, encodeShare, modelFor } from "./scenarioBuilder.ts";
import type { Controls } from "./types.ts";
import { sim } from "./worker-client.ts";

const Yard3D = lazy(() => import("./components/Yard3D.tsx"));
const SPEEDS = [1, 5, 15, 40];

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writePref(key: string, v: string): void {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* privat läge – ignorera */
  }
}

export function App() {
  const ds = dataset;
  const [lang, setLang] = useState<Lang>((readPref("yt.lang") as Lang) ?? "sv");
  const [theme, setTheme] = useState<"light" | "dark">((readPref("yt.theme") as "light" | "dark") ?? "light");
  const [present, setPresent] = useState(false);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [c, setC] = useState<Controls>(() => ({ ...defaultControls(ds), ...(decodeShare(location.hash) ?? {}) }));
  const [out, setOut] = useState<RunOutput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [t, setT] = useState(() => parseClock(c.open));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(15);
  const [toast, setToast] = useState<string | null>(null);
  const t_ = useMemo(() => makeT(lang), [lang]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writePref("yt.theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang;
    writePref("yt.lang", lang);
  }, [lang]);
  useEffect(() => {
    document.documentElement.dataset.present = String(present);
  }, [present]);

  const set = useCallback((patch: Partial<Controls>) => setC((prev) => ({ ...prev, ...patch })), []);
  const scenario = useMemo(() => buildScenario(c, ds), [c, ds]);
  const model = useMemo(() => modelFor(ds, c.date), [ds, c.date]);
  const day = dayOf(ds, c.date);
  const compiled = useMemo(() => {
    try {
      return compileScenario(scenario);
    } catch {
      return null;
    }
  }, [scenario]);

  // Kör om hela dagen vid varje ändring (debounce så att reglage inte översvämmar workern).
  const reqRef = useRef(0);
  useEffect(() => {
    if (!compiled) {
      setError("Ogiltigt scenario");
      return;
    }
    const id = ++reqRef.current;
    setBusy(true);
    const h = setTimeout(() => {
      sim
        .call<RunOutput>("run", { model, scenario, recorded: scenario.arrivals.pattern === "recorded" ? day?.trucks : undefined })
        .then((r) => {
          if (id !== reqRef.current) return;
          setOut(r);
          setError(null);
        })
        .catch((e: Error) => id === reqRef.current && setError(e.message))
        .finally(() => id === reqRef.current && setBusy(false));
    }, 120);
    return () => clearTimeout(h);
  }, [scenario, model, compiled, day]);

  const openFrom = parseClock(c.open);
  const openTo = parseClock(c.close);
  const bounds = useMemo<[number, number]>(() => (out ? timeBounds(out.detail, openFrom, openTo) : [openFrom - 60, openTo + 60]), [out, openFrom, openTo]);

  // Uppspelning: hastighet = simulerade minuter per sekund.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((prev) => {
        const next = prev + dt * speed;
        if (next >= bounds[1]) {
          setPlaying(false);
          return bounds[1];
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, bounds]);

  useEffect(() => {
    setT((prev) => Math.min(bounds[1], Math.max(bounds[0], prev)));
  }, [bounds]);

  // Tangentbord: mellanslag = spela/paus, pilar = ±15 min.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON") return;
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight") setT((p) => Math.min(bounds[1], p + 15));
      else if (e.key === "ArrowLeft") setT((p) => Math.max(bounds[0], p - 15));
      else if (e.key === "Escape") setPresent(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bounds]);

  const share = async () => {
    const url = `${location.origin}${location.pathname}${encodeShare(c)}`;
    history.replaceState(null, "", encodeShare(c));
    try {
      await navigator.clipboard.writeText(url);
      setToast(t_("copied"));
    } catch {
      setToast(url);
    }
    setTimeout(() => setToast(null), 2500);
  };

  const tm = Math.floor(t);
  const doors = compiled?.site.doors.map((d) => d.id) ?? [];
  const cost = compiled?.cost ?? { currency: c.currency, detentionFreeMin: c.detentionFreeMin, detentionCostPerHour: c.detentionCostPerHour };

  return (
    <>
      <div className="app" data-present={present}>
        <header className="top">
          <div className="wordmark" aria-label="LUPNUMBER Yard Twin">
            <span className="lup">LUP</span>
            <span className="number">NUMBER</span>
            <span className="sub">{t_("appSub")}</span>
          </div>
          {ds.kind === "demo" && <span className="tag" title={t_("demoNote")}>DEMO</span>}
          <CalibrationBadge cal={ds.calibration} t_={t_} lang={lang} />
          {busy && <span className="muted small" role="status">{t_("computing")}</span>}
          <span className="spacer" />
          <div className="seg" role="group" aria-label="Språk / Language">
            <button aria-pressed={lang === "sv"} onClick={() => setLang("sv")}>SV</button>
            <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
          </div>
          <div className="seg" role="group" aria-label={t_("theme")}>
            <button aria-pressed={theme === "light"} onClick={() => setTheme("light")}>{t_("light")}</button>
            <button aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>{t_("dark")}</button>
          </div>
          {!present && (
            <>
              <button className="btn" onClick={share}>{t_("share")}</button>
              <button className="btn" onClick={() => window.print()} disabled={!out}>{t_("exportPdf")}</button>
              <button className="btn" onClick={() => out && download(`yard-twin-${c.date}-lastbilar.csv`, trucksCsv(out.detail))} disabled={!out}>{t_("exportCsv")}</button>
              <button className="btn" onClick={() => out && download(`yard-twin-${c.date}-montecarlo.csv`, monteCarloCsv(out.mc))} disabled={!out || out.mc.reps < 2}>{t_("exportCsvMc")}</button>
            </>
          )}
          <button className="btn primary" onClick={() => setPresent((p) => !p)}>{present ? t_("exitPresent") : t_("present")}</button>
          {toast && <span className="tag" role="status">{toast}</span>}
        </header>

        {!present && <ControlsPanel c={c} set={set} ds={ds} t_={t_} lang={lang} />}

        <main>
          {present && (
            <section className="card">
              <div className="card-head"><h2>{t_("presets")}</h2></div>
              <div className="presets">
                {PRESETS.map((p) => (
                  <button key={p.id} className="btn" onClick={() => set(p.patch(c))}>{lang === "sv" ? p.sv : p.en}</button>
                ))}
              </div>
            </section>
          )}
          {error && <div className="warnbox" role="alert">{error}</div>}
          {out && <Kpis result={out.detail} mc={out.mc} t={t} cost={cost} t_={t_} lang={lang} />}

          <section className="card">
            <div className="card-head">
              <h2>{t_("yard")} · {c.mode === "replay" ? t_("replay") : t_("whatif")}</h2>
              <span className="muted small">{ds.site.label} · {c.date}</span>
              <span className="spacer" />
              <div className="seg" role="group" aria-label="2D/3D">
                <button aria-pressed={view === "2d"} onClick={() => setView("2d")}>{t_("view2d")}</button>
                <button aria-pressed={view === "3d"} onClick={() => setView("3d")}>{t_("view3d")}</button>
              </div>
            </div>
            <div className="playback" style={{ marginBottom: 10 }}>
              <button className="btn primary" onClick={() => setPlaying((p) => !p)} aria-label={playing ? t_("pause") : t_("play")}>{playing ? "❚❚" : "▶"} {playing ? t_("pause") : t_("play")}</button>
              <div className="seg" role="group" aria-label="Hastighet">
                {SPEEDS.map((s) => (
                  <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}x</button>
                ))}
              </div>
              <span className="clock" aria-live="off">{formatClock(tm)}</span>
              <input type="range" aria-label={t_("jumpTo")} min={bounds[0]} max={bounds[1]} step={1} value={tm} onChange={(e) => setT(Number(e.target.value))} />
              <input type="time" aria-label={t_("jumpTo")} value={formatClock(Math.min(tm, 23 * 60 + 59))} onChange={(e) => e.target.value && setT(parseClock(e.target.value))} style={{ width: 110 }} />
            </div>
            {c.mode === "replay" && day && out && (
              <p className="small muted" style={{ marginTop: 0 }}>
                {t_("replayNote")} {t_("actual")}: <b className="num">{fmtNum(lang, day.actual.avgWait, 1)} min</b> · {t_("model")}: <b className="num">{fmtNum(lang, out.mc.summary.avgWait.median, 1)} min</b> ({t_("kpiAvgWait").toLowerCase()})
              </p>
            )}
            {out && view === "2d" && <YardView result={out.detail} doors={doors} t={t} t_={t_} lang={lang} present={present} />}
            {out && view === "3d" && (
              <Suspense fallback={<p className="muted">{t_("computing")}</p>}>
                <Yard3D result={out.detail} doors={doors} t={t} theme={theme} />
              </Suspense>
            )}
          </section>

          <div className="two">
            <section className="card">
              <div className="card-head"><h2>{t_("timeline")}</h2></div>
              {out && <Gantt result={out.detail} doors={doors} bounds={bounds} openFrom={openFrom} openTo={openTo} t={t} onSeek={setT} t_={t_} />}
              {!present && (
                <>
                  <div className="card-head" style={{ marginTop: 12 }}><h2>{t_("trucks")}</h2></div>
                  {out && <TruckList result={out.detail} t={t} t_={t_} lang={lang} />}
                </>
              )}
            </section>
            <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
              {out && <InsightsCard out={out} t_={t_} lang={lang} currency={c.currency} doors={doors.length} closeAt={openTo} />}
              <CalibrationCard cal={ds.calibration} t_={t_} lang={lang} />
              <LimitationsCard t_={t_} lang={lang} model={model} calibrationDays={ds.calibration?.calibrationDays} />
            </div>
          </div>

          {compiled && <ComparePanel c={c} ds={ds} model={model} base={scenario} t_={t_} lang={lang} />}
          {compiled && !present && <AnalysisPanel c={c} ds={ds} model={model} scenario={scenario} t_={t_} lang={lang} />}
          <p className="small muted">{t_("demoNote")}</p>
        </main>
      </div>
      {out && compiled && <Report c={c} ds={ds} out={out} scenario={scenario} t_={t_} lang={lang} />}
    </>
  );
}
