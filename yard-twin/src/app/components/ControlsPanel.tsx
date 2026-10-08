import type { StrategyKind } from "../../engine/types.ts";
import { fmtNum, type Lang, type T } from "../i18n.ts";
import type { Controls, Dataset, Pattern } from "../types.ts";

interface Props {
  c: Controls;
  set: (patch: Partial<Controls>) => void;
  ds: Dataset;
  t_: T;
  lang: Lang;
}

const PATTERNS: Pattern[] = ["recorded", "booked", "poisson", "burst"];
const STRATS: StrategyKind[] = ["fcfs", "booked-first", "priority", "specialized"];

/** Vänsterpanelen. Alla ändringar utom läge/dag växlar automatiskt till "What if". */
export function ControlsPanel({ c, set, ds, t_, lang }: Props) {
  const what = (patch: Partial<Controls>) => set({ ...patch, mode: "whatif" });
  const weekday = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(lang === "sv" ? "sv-SE" : "en-GB", { weekday: "short", timeZone: "UTC" });
  return (
    <aside className="controls" aria-label={t_("scenario")}>
      <div className="field">
        <label htmlFor="site">{t_("site")}</label>
        <select id="site" disabled value={ds.site.siteId}>
          <option value={ds.site.siteId}>{ds.site.label}</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="date">{t_("date")}</label>
        <select id="date" value={c.date} onChange={(e) => set({ date: e.target.value })}>
          {ds.days.map((d) => (
            <option key={d.date} value={d.date}>{`${d.date} (${weekday(d.date)}) · ${d.trucks.length}`}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>{t_("mode")}</label>
        <div className="seg" role="group" aria-label={t_("mode")}>
          <button aria-pressed={c.mode === "replay"} onClick={() => set({ mode: "replay" })}>{t_("replay")}</button>
          <button aria-pressed={c.mode === "whatif"} onClick={() => set({ mode: "whatif" })}>{t_("whatif")}</button>
        </div>
      </div>

      <div className="group">
        <h3>{t_("scenario")}</h3>
        <div className="field">
          <label htmlFor="pattern">{t_("pattern")}</label>
          <select id="pattern" value={c.mode === "replay" ? "recorded" : c.pattern} onChange={(e) => what({ pattern: e.target.value as Pattern })}>
            {PATTERNS.map((p) => <option key={p} value={p}>{t_(`p_${p}`)}</option>)}
          </select>
        </div>
        <Range id="vol" label={t_("volume")} value={c.volumeFactor} min={0.5} max={2} step={0.05} show={`× ${fmtNum(lang, c.volumeFactor, 2)}`} onChange={(v) => what({ volumeFactor: v })} />
        <Range id="doors" label={t_("doors")} value={c.doors} min={1} max={Math.max(20, ds.site.doors * 2)} step={1} show={String(c.doors)} onChange={(v) => what({ doors: v })} />
        <div className="field">
          <label htmlFor="strategy">{t_("strategy")}</label>
          <select id="strategy" value={c.mode === "replay" ? "fcfs" : c.strategy} onChange={(e) => what({ strategy: e.target.value as StrategyKind })}>
            {STRATS.map((s) => <option key={s} value={s}>{t_(`s_${s}`)}</option>)}
          </select>
        </div>
        {c.pattern === "booked" && c.mode === "whatif" && (
          <>
            <div className="field">
              <label htmlFor="adh">
                <span>{t_("adherence")}</span>
                <span className="num">{c.adherence === null ? t_("adherenceData") : `${fmtNum(lang, c.adherence * 100)} %`}</span>
              </label>
              <input id="adh" type="range" min={0} max={1.01} step={0.01} value={c.adherence ?? 1.01} onChange={(e) => what({ adherence: Number(e.target.value) > 1 ? null : Number(e.target.value) })} />
            </div>
            <Num id="slotlen" label={t_("slotLength")} value={c.slotLengthMin} min={5} max={240} onChange={(v) => what({ slotLengthMin: v })} />
            <Num id="slotcap" label={t_("slotCap")} value={c.capacityPerHour} min={1} max={200} onChange={(v) => what({ capacityPerHour: v })} />
            <Num id="tol" label={t_("tolerance")} value={c.toleranceMin} min={0} max={120} onChange={(v) => what({ toleranceMin: v })} />
          </>
        )}
        {c.pattern === "burst" && c.mode === "whatif" && (
          <>
            <div className="field">
              <label>{t_("burstWindow")}</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input type="time" aria-label={`${t_("burstWindow")} från`} value={c.burstFrom} onChange={(e) => what({ burstFrom: e.target.value })} />
                <input type="time" aria-label={`${t_("burstWindow")} till`} value={c.burstTo} onChange={(e) => what({ burstTo: e.target.value })} />
              </div>
            </div>
            <Range id="bm" label={t_("burstMult")} value={c.burstMultiplier} min={1} max={4} step={0.1} show={`× ${fmtNum(lang, c.burstMultiplier, 1)}`} onChange={(v) => what({ burstMultiplier: v })} />
          </>
        )}
        <Num id="lanes" label={`${t_("gateLanes")} (0 = ${t_("unlimited")})`} value={c.gateLanes} min={0} max={6} onChange={(v) => what({ gateLanes: v })} />
        <div className="field">
          <label htmlFor="park">{t_("parking")} <span className="muted">{c.parkingSpaces === null ? t_("unlimited") : ""}</span></label>
          <input id="park" type="number" min={0} placeholder={t_("unlimited")} value={c.parkingSpaces ?? ""} onChange={(e) => what({ parkingSpaces: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} />
        </div>
        <div className="field" style={{ gridTemplateColumns: "1fr 1fr", display: "grid", gap: 8 }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="open">{t_("open")}</label>
            <input id="open" type="time" value={c.open} onChange={(e) => what({ open: e.target.value })} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="close">{t_("close")}</label>
            <input id="close" type="time" value={c.close} onChange={(e) => what({ close: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="group">
        <h3>{t_("costs")} <span className="tag assume">{t_("assumption")}</span></h3>
        <div className="field">
          <label htmlFor="cur">Valuta / Currency</label>
          <select id="cur" value={c.currency} onChange={(e) => set({ currency: e.target.value as "SEK" | "EUR" })}>
            <option>SEK</option>
            <option>EUR</option>
          </select>
        </div>
        <Num id="cph" label={`${t_("costPerHour")} (${c.currency})`} value={c.detentionCostPerHour} min={0} max={100000} onChange={(v) => set({ detentionCostPerHour: v })} />
        <Num id="free" label={t_("freeTime")} value={c.detentionFreeMin} min={0} max={600} onChange={(v) => set({ detentionFreeMin: v })} />
        <Num id="staff" label={`${t_("staffCost")} (${c.currency})`} value={c.staffCostPerHour} min={0} max={100000} onChange={(v) => set({ staffCostPerHour: v })} />
        <div className="field">
          <label htmlFor="src">{t_("costSource")}</label>
          <input id="src" type="text" value={c.costSource} onChange={(e) => set({ costSource: e.target.value })} />
        </div>
        <Num id="reps" label={t_("reps")} value={c.reps} min={20} max={2000} onChange={(v) => set({ reps: v })} />
      </div>
    </aside>
  );
}

function Range({ id, label, value, min, max, step, show, onChange }: { id: string; label: string; value: number; min: number; max: number; step: number; show: string; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <label htmlFor={id}><span>{label}</span><span className="num">{show}</span></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function Num({ id, label, value, min, max, onChange }: { id: string; label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
    </div>
  );
}
