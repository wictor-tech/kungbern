import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AnalyticsReport } from "../../../shared/types";
import { api } from "../api";

function Bars({ rows, bad = false }: { rows: { label: React.ReactNode; value: number; extra?: React.ReactNode }[]; bad?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="muted small">Ingen data ännu.</p>;
  return (
    <div className="bars">
      {rows.map((r, i) => (
        <div key={i} className="bar-row">
          <div className="lbl"><span>{r.label}</span><b>{r.value}{r.extra}</b></div>
          <div className="bar"><i className={bad ? "bad" : ""} style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export function Analytics({ onCreateFromQuestion }: { onCreateFromQuestion: (q: string) => void }) {
  const [days, setDays] = useState(30);
  const [r, setR] = useState<AnalyticsReport | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { setR(null); api.admin.analytics(days).then(setR).catch((e) => setErr(e.message)); }, [days]);
  if (err) return <p className="error">{err}</p>;
  if (!r) return <p className="muted">Laddar…</p>;
  const T = r.totals;
  const maxDay = Math.max(1, ...r.days.map((d) => d.questions));
  return (
    <>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Varför behöver människor hjälp?</h2>
        <select style={{ width: "auto" }} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
          <option value={7}>7 dagar</option><option value={30}>30 dagar</option><option value={90}>90 dagar</option>
        </select>
      </div>

      <div className="tiles">
        <div className="tile"><b>{T.questions}</b><span>Frågor ställda</span></div>
        <div className="tile"><b>{T.questions ? Math.round((T.answered / T.questions) * 100) : 0} %</b><span>Fick en guide</span></div>
        <div className="tile"><b>{T.solveRate === null ? "–" : Math.round(T.solveRate * 100) + " %"}</b><span>Löste problemet (👍 av {T.helpedYes + T.helpedNo})</span></div>
        <div className="tile"><b>{T.tickets}</b><span>Supportärenden</span></div>
        <div className="tile"><b>{T.deflectable}</b><span>…som en guide kunde ha löst</span></div>
      </div>

      {r.suggestions.length > 0 && (
        <section className="panel">
          <h3>🔁 Återkommande problem – föreslagna åtgärder</h3>
          {r.suggestions.map((s, i) => (
            <div key={i} className={`suggest ${s.kind}`}>
              <p>{s.text}</p>
              <p className="muted small">Exempel: {s.examples.map((e) => `"${e}"`).join(" · ")}</p>
              {s.kind === "create"
                ? <button className="btn small primary" onClick={() => onCreateFromQuestion(s.examples[0])}>✨ Skapa guide</button>
                : s.guideId && <Link className="btn small" to={`/admin/guides/${s.guideId}`}>Öppna guiden</Link>}
            </div>
          ))}
        </section>
      )}

      <section className="panel">
        <h3>Frågor per dag <span className="muted small">(rött = 👎)</span></h3>
        <div className="spark" role="img" aria-label="Frågor per dag">
          {r.days.map((d) => <i key={d.day} title={`${d.day}: ${d.questions} frågor, ${d.no} nej`} style={{ height: `${Math.max(3, (d.questions / maxDay) * 100)}%` }}><b style={{ height: d.questions ? `${(d.no / d.questions) * 100}%` : 0 }} /></i>)}
        </div>
      </section>

      <div className="dash">
        <section className="panel"><h3>Vanligaste frågorna</h3><Bars rows={r.topQuestions.map((q) => ({ label: <>{q.q}{q.guideTitle && <small className="muted"> → {q.guideTitle}</small>}</>, value: q.count }))} /></section>
        <section className="panel">
          <h3>Frågor utan bra svar</h3>
          {r.unanswered.length ? r.unanswered.map((u) => (
            <div key={u.q} className="bar-row"><div className="lbl"><span>{u.q}</span><span><b>{u.count}</b> <button className="btn small" style={{ minHeight: 30, marginLeft: 6 }} onClick={() => onCreateFromQuestion(u.q)}>✨ Skapa guide</button></span></div></div>
          )) : <p className="muted small">Inga – alla frågor fick en guide.</p>}
        </section>
        <section className="panel"><h3>Guider med flest visningar</h3><Bars rows={r.topGuides.map((g) => ({ label: <Link to={`/admin/guides/${g.guideId}`}>{g.title}</Link>, value: g.views, extra: <small className="muted"> · 👍{g.yes} 👎{g.no}</small> }))} /></section>
        <section className="panel">
          <h3>Guider där användaren klickar Nej</h3>
          {r.badGuides.length ? <Bars bad rows={r.badGuides.map((g) => ({ label: <Link to={`/admin/guides/${g.guideId}`}>{g.title} <span className="pill bad">Dålig</span></Link>, value: Math.round(g.noRate * 100), extra: <small className="muted"> % av {g.yes + g.no}</small> }))} /> : <p className="muted small">Ingen guide är flaggad.</p>}
        </section>
        <section className="panel">
          <h3>Funktioner som verkar svåra att förstå</h3>
          <p className="muted small">Sidor i programmet där flest frågor ställs och flest svarar Nej – kandidater att förenkla i produkten.</p>
          <Bars bad rows={r.hardPages.map((p) => ({ label: p.page, value: p.questions, extra: <small className="muted"> frågor · {p.no} nej</small> }))} />
        </section>
        <section className="panel">
          <h3>Supportärenden som en guide kunde ha löst</h3>
          {r.deflectableTickets.length ? r.deflectableTickets.map((t) => <p key={t.id}><b>{t.id}</b> {t.question}{t.guideTitle && <small className="muted"> – guide: {t.guideTitle}</small>}</p>) : <p className="muted small">Inga.</p>}
        </section>
      </div>
    </>
  );
}
