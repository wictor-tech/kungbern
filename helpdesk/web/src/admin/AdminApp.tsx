import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { ApiError, adminToken, api } from "../api";
import { GuideList } from "./GuideList";
import { GuideEditor } from "./GuideEditor";
import { Analytics } from "./Analytics";
import { Tickets } from "./Tickets";
import { AiDraftModal } from "./AiDraftModal";

function Login({ onOk }: { onOk: () => void }) {
  const [token, setToken] = useState("");
  const [err, setErr] = useState("");
  return (
    <form className="card login" onSubmit={async (e) => {
      e.preventDefault(); adminToken.set(token);
      try { await api.admin.me(); onOk(); } catch (x) { adminToken.clear(); setErr(x instanceof ApiError && x.status === 401 ? "Fel kod" : "Kunde inte logga in"); }
    }}>
      <h1>Admin</h1>
      <label>Åtkomstkod<input type="password" autoFocus value={token} onChange={(e) => setToken(e.target.value)} autoComplete="current-password" /></label>
      {err && <p className="error">{err}</p>}
      <button className="btn primary" style={{ width: "100%", marginTop: 14 }}>Logga in</button>
    </form>
  );
}

export function AdminApp() {
  const [state, setState] = useState<"checking" | "in" | "out">("checking");
  const [aiOpen, setAiOpen] = useState(false);
  const nav = useNavigate();
  useEffect(() => { document.title = "LUP Hjälp – Admin"; if (!adminToken.get()) return setState("out"); api.admin.me().then(() => setState("in")).catch(() => setState("out")); }, []);
  if (state === "checking") return null;
  if (state === "out") return <div className="admin"><Login onOk={() => setState("in")} /></div>;
  return (
    <div className="admin">
      <nav className="admin-nav">
        <strong style={{ marginRight: 8 }}>LUP Hjälp</strong>
        <NavLink end to="/admin" className={({ isActive }) => (isActive ? "on" : "")}>Guider</NavLink>
        <NavLink to="/admin/analytics" className={({ isActive }) => (isActive ? "on" : "")}>Analytics</NavLink>
        <NavLink to="/admin/tickets" className={({ isActive }) => (isActive ? "on" : "")}>Supportärenden</NavLink>
        <span className="spacer" />
        <button className="btn small" onClick={() => setAiOpen(true)}>✨ AI-skapa guide</button>
        <button className="btn small primary" onClick={() => nav("/admin/guides/new")}>+ Ny guide</button>
        <a className="btn small ghost" href="/" target="_blank" rel="noreferrer">Visa hjälpen ↗</a>
        <button className="btn small ghost" onClick={() => { adminToken.clear(); setState("out"); }}>Logga ut</button>
      </nav>
      <Routes>
        <Route index element={<GuideList />} />
        <Route path="guides/:id" element={<GuideEditor />} />
        <Route path="analytics" element={<Analytics onCreateFromQuestion={(q) => { try { sessionStorage.setItem("lup-help-ai-prompt", `Skapa en guide för: ${q}`); } catch { /* */ } setAiOpen(true); }} />} />
        <Route path="tickets" element={<Tickets />} />
      </Routes>
      {aiOpen && <AiDraftModal onClose={() => setAiOpen(false)} />}
    </div>
  );
}
