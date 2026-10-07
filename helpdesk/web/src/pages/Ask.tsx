import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { AskResponse } from "../../../shared/types";
import { api } from "../api";
import { useHelp } from "../context";
import { CandidateList, GuideView } from "../components/GuideView";
import { TicketForm } from "../components/TicketForm";
import { AskBox } from "./Home";

export function Ask() {
  const { t, lang, page, role, sessionId, config, catIcon, catLabel } = useHelp();
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const [res, setRes] = useState<AskResponse | null>(null);
  const [related, setRelated] = useState<AskResponse["alternatives"]>([]);
  const [error, setError] = useState(false);
  const [showTicket, setShowTicket] = useState(false);

  useEffect(() => {
    let live = true;
    setRes(null); setError(false); setShowTicket(false);
    api.ask(q, lang, { page, role, sessionId })
      .then((r) => { if (live) { setRes(r); setRelated(r.alternatives.slice(0, 3)); } })
      .catch(() => live && setError(true));
    return () => { live = false; };
  }, [q, lang, page, role, sessionId]);

  return (
    <div className="ask-page">
      <AskBox initial={q} compact />
      {error && <div className="card"><p className="error">{t.loadError}</p></div>}
      {!res && !error && <div className="skeleton" aria-busy="true" aria-label={t.searching}><div className="sk sk-title" /><div className="sk sk-img" /><div className="sk sk-line" /></div>}

      {res?.quality === "good" && res.guide && (
        <GuideView guide={res.guide} question={q} queryId={res.queryId} short={res.short} related={related} />
      )}

      {res && res.quality !== "good" && (() => {
        // Visa bara förslag som faktiskt ligger nära – hellre inget än löst relaterat brus.
        const near = res.alternatives.filter((a) => a.score >= 0.3).slice(0, 3);
        const weak = res.quality === "weak" && near.length > 0;
        return (
        <div className="no-answer">
          <div className="card">
            <h2>{weak ? t.weakTitle : t.noneTitle}</h2>
            {!weak && <p className="muted">{t.noneHint}</p>}
            {weak && <CandidateList items={near} />}
          </div>
          {!weak && (
            <div className="topics">
              {config?.categories.map((c) => <Link key={c.id} to={`/c/${c.id}`} className="topic"><span aria-hidden>{catIcon(c.id)}</span><b>{catLabel(c.id)}</b></Link>)}
            </div>
          )}
          {showTicket ? <TicketForm question={q} stepsViewed={[]} queryId={res.queryId} /> : <button className="btn big" onClick={() => setShowTicket(true)}>{t.support}</button>}
        </div>
        );
      })()}
    </div>
  );
}
