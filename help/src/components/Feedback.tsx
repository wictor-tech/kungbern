"use client";

import { useState } from "react";
import type { AskResult } from "@/lib/types";
import { feedbackApi } from "./client";
import { TicketForm } from "./TicketForm";
import { GuideCard } from "./ui";

/** Snabbval. Vissa går att lösa med en annan guide, andra behöver en människa direkt. */
const QUICK_REASONS: { text: string; retry: boolean }[] = [
  { text: "Det var fel guide", retry: true },
  { text: "Hittar inte knappen", retry: true },
  { text: "Ser annorlunda ut hos mig", retry: false },
  { text: "Det fungerar ändå inte", retry: false },
];

type State =
  | { s: "ask" }
  | { s: "thanks" }
  | { s: "why" }
  | { s: "retrying" }
  | { s: "retried"; result: AskResult }
  | { s: "ticket" };

/**
 * "Löste detta ditt problem?" → Nej → "Vad saknades?" → nytt försök → supportärende med all kontext.
 */
export function Feedback({
  guideId,
  queryId,
  originalQuery,
  page,
  stepsViewed,
  highlight,
  onOpenGuide,
}: {
  guideId: string | null;
  queryId: string | null;
  originalQuery: string | null;
  page: string | null;
  stepsViewed: number[];
  highlight?: boolean;
  onOpenGuide?: (id: string) => void;
}) {
  const [state, setState] = useState<State>({ s: "ask" });
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function sendYes() {
    setState({ s: "thanks" });
    feedbackApi({ guideId, queryId, helpful: true }).catch(() => {});
  }

  async function sendNo(text: string, retry = true) {
    setError(null);
    setState({ s: "retrying" });
    try {
      const res = await feedbackApi({ guideId, queryId, helpful: false, comment: text, originalQuery, page });
      const r = res.retry;
      // Visa bara nya förslag om sökningen faktiskt hittade något rimligt – annars direkt till support.
      if (retry && r && r.outcome !== "none" && (r.guide || r.alternatives.length > 0)) setState({ s: "retried", result: r });
      else setState({ s: "ticket" });
    } catch {
      setError("Kunde inte skicka. Försök igen.");
      setState({ s: "why" });
    }
  }

  const box = `rounded-2xl border p-5 transition ${highlight && state.s === "ask" ? "border-lup bg-lup-tint ring-4 ring-lup/15" : "border-line bg-white shadow-sm"}`;

  if (state.s === "thanks")
    return (
      <div className={box} role="status">
        <p className="font-semibold text-emerald-700">Tack! Skönt att det löste sig. 🎉</p>
      </div>
    );

  if (state.s === "ticket")
    return (
      <div className={box}>
        <TicketForm guideId={guideId} queryText={originalQuery} page={page} stepsViewed={stepsViewed} initialComment={comment} />
      </div>
    );

  return (
    <div className={box}>
      {state.s === "ask" && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="w-full text-lg font-bold text-navy">Löste detta ditt problem?</p>
          <button
            type="button"
            onClick={sendYes}
            className="min-h-12 flex-1 rounded-full border-2 border-line bg-white px-6 font-semibold text-ink hover:border-emerald-400 hover:bg-emerald-50"
          >
            👍 Ja
          </button>
          <button
            type="button"
            onClick={() => setState({ s: "why" })}
            className="min-h-12 flex-1 rounded-full border-2 border-line bg-white px-6 font-semibold text-ink hover:border-marker hover:bg-marker-tint"
          >
            👎 Nej
          </button>
          <button
            type="button"
            onClick={() => setState({ s: "ticket" })}
            className="w-full text-left text-sm text-muted underline hover:text-navy"
          >
            Kontakta support
          </button>
        </div>
      )}

      {state.s === "why" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (comment.trim()) void sendNo(comment.trim());
          }}
          className="space-y-3"
        >
          <label htmlFor="why" className="block font-semibold text-navy">
            Vad saknades?
          </label>
          <div className="flex flex-wrap gap-2">
            {QUICK_REASONS.map((r) => (
              <button
                key={r.text}
                type="button"
                onClick={() => {
                  setComment(r.text);
                  void sendNo(r.text, r.retry);
                }}
                className="rounded-full border border-line bg-canvas px-3 py-1.5 text-sm hover:border-lup"
              >
                {r.text}
              </button>
            ))}
          </div>
          <textarea
            id="why"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Eller beskriv med egna ord…"
            className="w-full rounded-xl border border-line p-3 text-base focus:border-lup focus:outline-none"
          />
          {error && <p className="text-sm text-marker">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!comment.trim()}
              className="min-h-11 rounded-xl bg-lup px-5 font-semibold text-white hover:bg-lup-dark disabled:opacity-40"
            >
              Försök igen
            </button>
            <button type="button" onClick={() => setState({ s: "ticket" })} className="min-h-11 px-3 text-sm text-muted underline">
              Kontakta support direkt
            </button>
          </div>
        </form>
      )}

      {state.s === "retrying" && (
        <p className="text-muted" role="status">
          Letar efter något bättre…
        </p>
      )}

      {state.s === "retried" && (
        <div className="space-y-3">
          <p className="font-semibold text-navy">
            {state.result.guide ? "Kanske är det här du letar efter?" : "Kanske något av det här?"}
          </p>
          <div className="space-y-2">
            {[...(state.result.guide ? [state.result.guide] : []), ...state.result.alternatives].slice(0, 3).map((g) =>
              onOpenGuide ? (
                <GuideCard key={g.id} guide={g} onClick={() => onOpenGuide(g.id)} />
              ) : (
                <GuideCard key={g.id} guide={g} />
              ),
            )}
          </div>
          <button
            type="button"
            onClick={() => setState({ s: "ticket" })}
            className="min-h-11 rounded-xl border border-line px-4 font-semibold text-navy hover:border-lup"
          >
            Nej, jag behöver kontakta support
          </button>
        </div>
      )}
    </div>
  );
}
