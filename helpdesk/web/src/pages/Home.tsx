import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type GuideListItem } from "../api";
import { pageLabel, useHelp } from "../context";
import { CandidateList } from "../components/GuideView";

export function AskBox({ initial = "", autoFocus = false, compact = false }: { initial?: string; autoFocus?: boolean; compact?: boolean }) {
  const { t } = useHelp();
  const nav = useNavigate();
  const [q, setQ] = useState(initial);
  const [ph, setPh] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setQ(initial); }, [initial]);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  useEffect(() => {
    if (compact) return;
    const id = setInterval(() => setPh((p) => (p + 1) % t.askExamples.length), 3500);
    return () => clearInterval(id);
  }, [t, compact]);

  return (
    <form className={compact ? "askbox compact" : "askbox"} role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim().length > 1) nav(`/ask?q=${encodeURIComponent(q.trim())}`); }}>
      <input
        ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.askExamples[ph % t.askExamples.length]}
        aria-label={t.askTitle} enterKeyHint="search" autoComplete="off" maxLength={300}
      />
      <button className="btn primary" aria-label={t.askButton}>{compact ? "→" : t.askButton}</button>
    </form>
  );
}

export function Home() {
  const { t, lang, config, page, catIcon, catLabel } = useHelp();
  const [pageGuides, setPageGuides] = useState<GuideListItem[]>([]);
  const [popular, setPopular] = useState<GuideListItem[]>([]);

  useEffect(() => { api.guides(lang).then((l) => setPopular(l.slice(0, 5))).catch(() => {}); }, [lang]);
  useEffect(() => { if (page) api.guides(lang, { page }).then(setPageGuides).catch(() => setPageGuides([])); else setPageGuides([]); }, [page, lang]);

  return (
    <div className="home">
      <section className="hero">
        <h1>{t.askTitle}</h1>
        <AskBox autoFocus={!page} />
      </section>

      {page && (
        <section className="page-ctx card">
          <p className="ctx-line">📍 {t.onPage}: <strong>{pageLabel(page, lang)}</strong></p>
          {pageGuides.length > 0 && (
            <CandidateList items={pageGuides.map((g) => ({ guideId: g.id, title: g.title, summary: g.summary, category: g.category, score: 1 }))} />
          )}
        </section>
      )}

      <section>
        <h2 className="section-title">{t.topics}</h2>
        <div className="topics">
          {config?.categories.map((c) => (
            <Link key={c.id} to={`/c/${c.id}`} className="topic"><span aria-hidden>{catIcon(c.id)}</span><b>{catLabel(c.id)}</b></Link>
          ))}
        </div>
      </section>

      {popular.length > 0 && (
        <section>
          <h2 className="section-title">{t.popular}</h2>
          <CandidateList items={popular.map((g) => ({ guideId: g.id, title: g.title, summary: g.summary, category: g.category, score: 1 }))} />
        </section>
      )}
    </div>
  );
}
