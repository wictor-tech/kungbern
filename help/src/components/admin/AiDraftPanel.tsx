"use client";

import { useState } from "react";
import type { GuideDraft } from "@/lib/ai-draft";

/**
 * "Föreslå med AI": redaktören beskriver guiden (och laddar gärna upp en skärmbild först).
 * Förslaget fylls i formuläret – inget sparas förrän redaktören själv trycker Spara.
 */
export function AiDraftPanel({ screenshot, onDraft }: { screenshot: string | null; onDraft: (d: GuideDraft) => void }) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState<string[]>([]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction, screenshot }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "AI-förslaget misslyckades.");
      onDraft(json.draft);
      setUncertain(json.draft.uncertain ?? []);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "Ingen kontakt med servern.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-lup/40 bg-lup/5 p-5">
      {!open ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-h-11 rounded-xl bg-navy px-4 font-semibold text-white hover:opacity-90"
          >
            ✨ Föreslå med AI
          </button>
          <p className="text-sm text-muted">Beskriv guiden så fyller AI:n i titel, steg, markeringar och vanliga frågor. Du granskar innan du sparar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <label htmlFor="ai-instruction" className="block text-sm font-semibold text-navy">
            Vad ska guiden visa?
          </label>
          <textarea
            id="ai-instruction"
            rows={3}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="T.ex. Hur man lägger upp en bild på platsen så att förarna hittar rätt."
            className="field-sizing-content min-h-11 w-full rounded-xl border border-line bg-white p-3 focus:border-lup focus:outline-none"
          />
          <p className="text-xs text-muted">
            {screenshot
              ? "AI:n tittar även på skärmbilden till höger och använder knappnamnen därifrån."
              : "Tips: ladda upp en skärmbild från appen först – då blir knappnamnen exakta."}
          </p>
          {error && <p className="text-sm text-marker">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || instruction.trim().length < 5}
              onClick={() => void run()}
              className="min-h-11 rounded-xl bg-navy px-4 font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "AI:n skriver… (upp till en minut)" : "Skapa förslag"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-xl px-4 text-sm text-muted hover:text-navy">
              Avbryt
            </button>
          </div>
        </div>
      )}
      {uncertain.length > 0 && (
        <div role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-warn-ink">
          <p className="font-semibold">Förslaget är ifyllt. Kontrollera särskilt:</p>
          <ul className="mt-1 list-disc pl-5">
            {uncertain.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
