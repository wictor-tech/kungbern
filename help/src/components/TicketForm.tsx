"use client";

import { useState } from "react";
import { ticketApi } from "./client";

/** Supportärende. Frågan, guiden, sidan och stegen följer med automatiskt – användaren skriver bara det som saknas. */
export function TicketForm({
  guideId,
  queryText,
  page,
  stepsViewed,
  initialComment = "",
}: {
  guideId: string | null;
  queryText: string | null;
  page: string | null;
  stepsViewed: number[];
  initialComment?: string;
}) {
  const [comment, setComment] = useState(initialComment);
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (done)
    return (
      <div role="status" className="space-y-1">
        <p className="font-semibold text-emerald-700">Tack! Ärende {done} är skickat till supporten.</p>
        <p className="text-sm text-muted">De ser din fråga och vad du redan har provat, så du behöver inte förklara igen.</p>
      </div>
    );

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSending(true);
        setError(null);
        try {
          const { id } = await ticketApi({ queryText, guideId, page, stepsViewed, comment, contact });
          setDone(id);
        } catch (err) {
          setError(err instanceof Error && err.message ? err.message : "Kunde inte skicka ärendet. Försök igen om en stund.");
        } finally {
          setSending(false);
        }
      }}
    >
      <p className="font-semibold text-navy">Kontakta support</p>
      <p className="text-sm text-muted">
        Vi skickar med {queryText ? <>din fråga ”{queryText}”</> : "din fråga"}
        {guideId ? " och guiden du tittade på" : ""}, så supporten inte behöver börja från noll.
      </p>
      <label className="block text-sm font-medium" htmlFor="t-comment">
        Vad vill du ha hjälp med?
      </label>
      <textarea
        id="t-comment"
        required
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="w-full rounded-xl border border-line p-3 text-base focus:border-lup focus:outline-none"
      />
      <label className="block text-sm font-medium" htmlFor="t-contact">
        Din e-post eller ditt telefonnummer
      </label>
      <input
        id="t-contact"
        required
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        autoComplete="email"
        className="min-h-12 w-full rounded-xl border border-line px-3 text-base focus:border-lup focus:outline-none"
      />
      {error && <p className="text-sm text-marker">{error}</p>}
      <button
        type="submit"
        disabled={sending}
        className="min-h-12 rounded-xl bg-lup px-6 font-semibold text-white hover:bg-lup-dark disabled:opacity-50"
      >
        {sending ? "Skickar…" : "Skicka till support"}
      </button>
    </form>
  );
}
