import { useEffect, useState } from "react";
import type { Ticket } from "../../../shared/types";
import { api } from "../api";
import { ago } from "./GuideList";

export function Tickets() {
  const [list, setList] = useState<Ticket[] | null>(null);
  useEffect(() => { api.admin.tickets().then(setList); }, []);
  if (!list) return <p className="muted">Laddar…</p>;
  if (!list.length) return <p className="muted">Inga supportärenden ännu.</p>;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {list.map((t) => (
        <article key={t.id} className="card" style={{ opacity: t.status === "closed" ? 0.6 : 1 }}>
          <div className="toolbar" style={{ marginBottom: 6 }}>
            <strong>{t.id}</strong><span className={t.status === "open" ? "pill warn" : "pill pub"}>{t.status === "open" ? "Öppet" : "Stängt"}</span>
            {t.deflectable && <span className="pill bad">Guide fanns</span>}<span className="muted small">{ago(t.createdAt)}</span>
            <span style={{ flex: 1 }} />
            <button className="btn small" onClick={async () => { const u = await api.admin.setTicket(t.id, t.status === "open" ? "closed" : "open"); setList(list.map((x) => (x.id === u.id ? u : x))); }}>{t.status === "open" ? "Markera klart" : "Öppna igen"}</button>
          </div>
          <dl className="ticket ctx" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", margin: 0 }}>
            <dt>Fråga</dt><dd style={{ margin: 0 }}>{t.question}</dd>
            {t.guideTitle && <><dt>Guide som visades</dt><dd style={{ margin: 0 }}>{t.guideTitle}</dd></>}
            {t.page && <><dt>Sida</dt><dd style={{ margin: 0 }}>{t.page}</dd></>}
            {t.stepsViewed.length > 0 && <><dt>Steg som visades</dt><dd style={{ margin: 0 }}>{t.stepsViewed.map((n) => n + 1).join(", ")}</dd></>}
            {t.comment && <><dt>Kommentar</dt><dd style={{ margin: 0 }}>{t.comment}</dd></>}
            {t.message && <><dt>Meddelande</dt><dd style={{ margin: 0 }}>{t.message}</dd></>}
            {t.email && <><dt>E-post</dt><dd style={{ margin: 0 }}>{t.email}</dd></>}
            <dt>Språk</dt><dd style={{ margin: 0 }}>{t.lang}</dd>
          </dl>
        </article>
      ))}
    </div>
  );
}
