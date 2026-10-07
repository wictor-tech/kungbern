import { useState } from "react";
import type { LocalizedGuide } from "../../../shared/types";
import { api } from "../api";
import { pageLabel, useHelp } from "../context";

/** Supportärende som startar med full kontext – supporten behöver inte börja från noll. */
export function TicketForm({ question, guide, stepsViewed, comment, queryId, onDone }: {
  question: string; guide?: LocalizedGuide; stepsViewed: number[]; comment?: string; queryId?: string; onDone?: () => void;
}) {
  const { t, lang, page, sessionId } = useHelp();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [id, setId] = useState("");
  const steps = [...stepsViewed].sort((a, b) => a - b).map((n) => n + 1);

  if (state === "sent") return <div className="card ok-card"><h3>✓ {t.ticketSent}</h3><p className="muted">{id}</p>{onDone && <button className="btn ghost" onClick={onDone}>{t.home}</button>}</div>;

  return (
    <form className="card ticket" onSubmit={async (e) => {
      e.preventDefault(); setState("sending");
      try {
        const r = await api.ticket({ question, guideId: guide?.id, page, stepsViewed, comment, email: email || undefined, message: message || undefined, lang, queryId, sessionId });
        setId(r.ticketId); setState("sent");
      } catch { setState("error"); }
    }}>
      <h3>{t.ticketTitle}</h3>
      <dl className="ctx">
        <dt>{t.ticketQuestion}</dt><dd>{question}</dd>
        {guide && <><dt>{t.ticketGuide}</dt><dd>{guide.title}</dd></>}
        {page && <><dt>{t.ticketPage}</dt><dd>{pageLabel(page, lang)}</dd></>}
        {steps.length > 0 && <><dt>{t.ticketSteps}</dt><dd>{steps.join(", ")}</dd></>}
        {comment && <><dt>{t.ticketComment}</dt><dd>{comment}</dd></>}
      </dl>
      <p className="muted small">✓ {t.ticketIncluded}</p>
      <label>{t.ticketEmail}<input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>{t.ticketMessage}<textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
      {state === "error" && <p className="error">{t.loadError}</p>}
      <button className="btn primary" disabled={state === "sending"}>{t.ticketSend}</button>
    </form>
  );
}
