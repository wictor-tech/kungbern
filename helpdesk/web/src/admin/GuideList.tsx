import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type AdminGuideRow } from "../api";

export const ago = (iso: string) => {
  const d = (Date.now() - Date.parse(iso)) / 1000;
  if (d < 90) return "just nu";
  if (d < 3600) return `${Math.round(d / 60)} min sedan`;
  if (d < 86400) return `${Math.round(d / 3600)} tim sedan`;
  if (d < 86400 * 30) return `${Math.round(d / 86400)} dagar sedan`;
  return new Date(iso).toLocaleDateString("sv-SE");
};

export function GuideList() {
  const [rows, setRows] = useState<AdminGuideRow[] | null>(null);
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState("");
  const load = () => api.admin.guides().then(setRows).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const shown = useMemo(() => (rows ?? []).filter((r) => (r.title + r.category).toLowerCase().includes(filter.toLowerCase())), [rows, filter]);
  if (err) return <p className="error">{err}</p>;
  if (!rows) return <p className="muted">Laddar…</p>;
  const drafts = rows.filter((r) => r.status === "draft").length;
  return (
    <>
      <div className="toolbar">
        <input placeholder="Sök guide…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Sök guide" />
        <span className="muted">{rows.length} guider · {rows.length - drafts} publicerade · {drafts} utkast</span>
      </div>
      <table className="gtable">
        <thead><tr><th>Guide</th><th>Status</th><th>Kategori</th><th>Senast uppdaterad</th><th>Visningar</th><th>👍 / 👎</th><th /></tr></thead>
        <tbody>
          {shown.map((r) => {
            const rate = r.yes + r.no ? r.no / (r.yes + r.no) : 0;
            return (
              <tr key={r.id}>
                <td><Link to={`/admin/guides/${r.id}`}>{r.title}</Link><br /><small className="muted">{r.steps} steg{r.hasVideo ? " · video" : ""}{r.langs.length ? ` · ${r.langs.join(", ")}` : ""}</small></td>
                <td><span className={r.status === "published" ? "pill pub" : "pill"}>{r.status === "published" ? "Publicerad" : "Utkast"}</span></td>
                <td>{r.category}</td>
                <td title={r.updatedAt}>{ago(r.updatedAt)}</td>
                <td>{r.views}</td>
                <td>{r.yes} / {r.no} {r.yes + r.no >= 5 && rate >= 0.4 && <span className="pill bad">Dålig</span>}</td>
                <td><button className="btn small" onClick={async () => { await api.admin.publish(r.id, r.status !== "published"); load(); }}>{r.status === "published" ? "Avpublicera" : "Publicera"}</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
