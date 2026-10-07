import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { AskResponse, Candidate, LocalizedGuide } from "../../../shared/types";
import { api } from "../api";
import { pageLabel, useHelp } from "../context";
import { Markup } from "./Markup";
import { StepViewer } from "./StepViewer";
import { TicketForm } from "./TicketForm";
import { VideoPlayer } from "./VideoPlayer";

export function CandidateList({ items }: { items: Candidate[] }) {
  const { catIcon } = useHelp();
  return (
    <ul className="cand-list">
      {items.map((c) => (
        <li key={c.guideId}>
          <Link className="cand" to={`/g/${c.guideId}`}>
            <span className="cand-icon" aria-hidden>{catIcon(c.category)}</span>
            <span><strong>{c.title}</strong><small>{c.summary}</small></span>
            <span aria-hidden className="chev">›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Svar på "Löste detta ditt problem?" – Nej → kort fråga, nytt försök av AI, därefter supportärende. */
function Feedback({ guide, question, queryId, stepsViewed, exclude }: { guide: LocalizedGuide; question: string; queryId?: string; stepsViewed: number[]; exclude: string[] }) {
  const { t, lang, page, sessionId } = useHelp();
  const [state, setState] = useState<"ask" | "yes" | "no" | "busy" | "retried" | "ticket">("ask");
  const [comment, setComment] = useState("");
  const [retry, setRetry] = useState<AskResponse | null>(null);
  const base = { queryId, guideId: guide.id, q: question, lang, page, sessionId, stepsViewed };

  if (state === "yes") return <div className="card ok-card"><h3>👍 {t.glad}</h3></div>;

  return (
    <section className="feedback" aria-label={t.solved}>
      {state === "ask" && (
        <div className="card">
          <h3>{t.solved}</h3>
          <div className="yn">
            <button className="btn big yes" onClick={() => { setState("yes"); api.feedback({ ...base, helped: true }).catch(() => {}); }}>👍 {t.yes}</button>
            <button className="btn big no" onClick={() => { setState("no"); api.feedback({ ...base, q: "", helped: false }).catch(() => {}); }}>👎 {t.no}</button>
          </div>
        </div>
      )}
      {(state === "no" || state === "busy") && (
        <div className="card">
          <h3>{t.missing}</h3>
          <div className="chips">
            {t.chips.map((c) => <button key={c} className={comment === c ? "chip on" : "chip"} onClick={() => setComment(c)}>{c}</button>)}
          </div>
          <textarea rows={2} placeholder={t.missingPlaceholder} value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="row">
            <button className="btn primary" disabled={state === "busy"} onClick={async () => {
              setState("busy");
              try {
                const r = await api.feedback({ ...base, helped: false, followup: true, comment, exclude });
                setRetry(r.retry ?? null);
              } catch { setRetry(null); }
              setState("retried");
            }}>{t.tryAgain}</button>
            <button className="btn ghost" onClick={() => setState("ticket")}>{t.support}</button>
          </div>
        </div>
      )}
      {state === "retried" && (
        <div className="retry">
          {retry?.guide ? (
            <>
              <h3 className="retry-title">{t.retryTitle}</h3>
              <GuideView key={retry.guide.id} guide={retry.guide} question={retry.q} queryId={retry.queryId} short={retry.short} related={[]} exclude={[...exclude, guide.id]} nested />
            </>
          ) : (
            <div className="card">
              <p>{t.retryNone}</p>
              {retry && retry.alternatives.length > 0 && <CandidateList items={retry.alternatives} />}
              <TicketForm question={question} guide={guide} stepsViewed={stepsViewed} comment={comment} queryId={queryId} />
            </div>
          )}
        </div>
      )}
      {state === "ticket" && <TicketForm question={question} guide={guide} stepsViewed={stepsViewed} comment={comment} queryId={queryId} />}
    </section>
  );
}

export function GuideView({ guide: initial, question, queryId, short, related, exclude = [], nested = false }: {
  guide: LocalizedGuide; question?: string; queryId?: string; short?: string; related: Candidate[]; exclude?: string[]; nested?: boolean;
}) {
  const { t, lang, page, sessionId, embedded, toHost, config } = useHelp();
  const [guide, setGuide] = useState(initial);
  const [view, setView] = useState<"video" | "steps">(initial.video ? "video" : "steps");
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [translating, setTranslating] = useState(false);
  const seen = useRef(new Set<number>([0]));
  useEffect(() => { setGuide(initial); seen.current = new Set([0]); setView(initial.video ? "video" : "steps"); }, [initial]);

  const q = question || guide.title;
  const log = (type: string, extra: Record<string, unknown> = {}) => api.event({ type, guideId: guide.id, queryId, sessionId, page, lang, ...extra });

  return (
    <article className={nested ? "guide nested" : "guide"}>
      <header>
        <h1>{guide.title}</h1>
        <p className="short">{short || guide.summary}</p>
        {guide.machineTranslated && <span className="chip static">🌐 {t.machineTranslated}</span>}
        {guide.untranslated && lang !== guide.lang && (
          <div className="notice">
            <span>{t.untranslated}</span>
            {config?.aiEnabled && (
              <button className="btn small" disabled={translating} onClick={async () => { setTranslating(true); try { setGuide((await api.translate(guide.id, lang)).guide); } catch { /* visa original */ } setTranslating(false); }}>🌐 {t.translate}</button>
            )}
          </div>
        )}
      </header>

      {guide.video && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={view === "video"} className={view === "video" ? "tab on" : "tab"} onClick={() => setView("video")}>▶ {t.showVideo}</button>
          <button role="tab" aria-selected={view === "steps"} className={view === "steps" ? "tab on" : "tab"} onClick={() => setView("steps")}>☰ {t.showSteps}</button>
        </div>
      )}
      {guide.video && view === "video" && <VideoPlayer video={guide.video} onPlay={() => log("video")} />}
      {(!guide.video || view === "steps") && (
        <StepViewer steps={guide.steps} onStep={(i) => { seen.current.add(i); if (i > 0) log("step", { step: i }); }} onFinish={() => feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })} />
      )}

      {embedded && guide.walkthrough?.length ? (
        <button className="btn walk" onClick={() => { log("walkthrough"); toHost({ type: "start-walkthrough", guideId: guide.id, title: guide.title, steps: guide.walkthrough }); }}>🎯 {t.walkthrough}</button>
      ) : null}

      {guide.warning && <aside className="note warn"><strong>⚠ {t.warning}</strong><p><Markup text={guide.warning} /></p></aside>}
      {guide.tip && <aside className="note tip"><strong>💡 {t.tip}</strong><p><Markup text={guide.tip} /></p></aside>}

      <div ref={feedbackRef}><Feedback key={guide.id} guide={guide} question={q} queryId={queryId} stepsViewed={[...seen.current]} exclude={exclude} /></div>

      {!nested && related.length > 0 && (
        <section><h3 className="section-title">{t.related}</h3><CandidateList items={related} /></section>
      )}
      {!nested && guide.pageKeys[0] && <p className="muted small">📍 {pageLabel(guide.pageKeys[0], lang)}</p>}
    </article>
  );
}
