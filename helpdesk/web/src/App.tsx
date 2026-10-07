import { Suspense, lazy } from "react";
import { Link, Outlet, Route, Routes } from "react-router-dom";
import { LANG_NAMES, LANGS } from "../../shared/types";
import { useHelp } from "./context";
import { Home } from "./pages/Home";
import { Ask } from "./pages/Ask";
import { GuidePage, TopicPage } from "./pages/Guide";
const AdminApp = lazy(() => import("./admin/AdminApp").then((m) => ({ default: m.AdminApp })));

function Layout() {
  const { t, lang, setLang, embedded } = useHelp();
  return (
    <div className={embedded ? "shell embedded" : "shell"}>
      <header className="topbar">
        <Link to="/" className="brand" aria-label={t.home}><span className="logo">?</span><span><b>LUP</b> {t.poweredBy}</span></Link>
        <div className="topbar-right">
          <select aria-label={t.language} value={lang} onChange={(e) => setLang(e.target.value as typeof lang)}>
            {LANGS.map((l) => <option key={l} value={l}>{LANG_NAMES[l]}</option>)}
          </select>
        </div>
      </header>
      <main><Outlet /></main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="ask" element={<Ask />} />
        <Route path="g/:id" element={<GuidePage />} />
        <Route path="c/:id" element={<TopicPage />} />
      </Route>
      <Route path="admin/*" element={<Suspense fallback={null}><AdminApp /></Suspense>} />
    </Routes>
  );
}
