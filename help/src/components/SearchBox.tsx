"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { GuideSummary } from "@/lib/types";
import { suggestApi, type HelpContext } from "./client";

const EXAMPLES = [
  "Hur lägger jag upp en bild?",
  "Ingen kan boka",
  "Hur kallar jag in en förare?",
  "Ändra öppettider i jul",
  "Skicka SMS till alla på området",
  "Byta port för en chaufför",
];

/**
 * Frågerutan. Medan användaren skriver visas de bästa guiderna direkt (pil upp/ned + Enter, eller klick).
 * Enter utan valt förslag ställer frågan som vanligt.
 */
export function SearchBox({
  initial = "",
  large = false,
  autoFocus = false,
  busy = false,
  ctx = {},
  onSubmit,
  onPick,
}: {
  initial?: string;
  large?: boolean;
  autoFocus?: boolean;
  busy?: boolean;
  ctx?: HelpContext;
  onSubmit: (q: string) => void;
  /** Användaren valde ett förslag. */
  onPick?: (guide: GuideSummary, q: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [example, setExample] = useState(0);
  const [suggestions, setSuggestions] = useState<GuideSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const typed = useRef(false);

  useEffect(() => setValue(initial), [initial]);

  useEffect(() => {
    if (value) return;
    const t = setInterval(() => setExample((i) => (i + 1) % EXAMPLES.length), 3500);
    return () => clearInterval(t);
  }, [value]);

  // Hämta förslag med kort fördröjning; avbryt föregående anrop när användaren skriver vidare.
  useEffect(() => {
    if (!onPick || !typed.current) return;
    const q = value.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      suggestApi(q, ctx, ctrl.signal)
        .then((s) => {
          setSuggestions(s);
          setActive(-1);
        })
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // ctx är ett nytt objekt varje rendering; sidan ändras inte medan man skriver.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, onPick]);

  const showList = open && suggestions.length > 0 && !busy;

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        if (showList && active >= 0 && onPick) {
          setOpen(false);
          onPick(suggestions[active], q);
          return;
        }
        setOpen(false);
        if (q) onSubmit(q);
      }}
      className="relative"
    >
      <div
        className={`flex w-full items-center gap-2 rounded-2xl border-2 bg-white shadow-sm transition focus-within:border-lup focus-within:shadow-md ${
          large ? "border-lup/40 p-2" : "border-line p-1.5"
        }`}
      >
        <span aria-hidden className={`pl-2 text-muted ${large ? "text-2xl" : "text-lg"}`}>
          🔎
        </span>
        <label htmlFor="q" className="sr-only">
          Vad vill du ha hjälp med?
        </label>
        <input
          id="q"
          name="q"
          value={value}
          onChange={(e) => {
            typed.current = true;
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!showList) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={500}
          placeholder={`T.ex. ”${EXAMPLES[example]}”`}
          className={`min-w-0 flex-1 bg-transparent px-1 text-ink placeholder:text-slate-400 focus:outline-none focus-visible:outline-none ${
            large ? "h-14 text-xl sm:text-2xl" : "h-11 text-lg"
          }`}
        />
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className={`shrink-0 rounded-xl bg-lup font-semibold text-white transition hover:bg-lup-dark disabled:opacity-40 ${
            large ? "h-14 px-6 text-lg" : "h-11 px-5"
          }`}
        >
          {busy ? "Letar…" : "Visa hur"}
        </button>
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Förslag"
          className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-line bg-white text-left shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
                onPick?.(s, value.trim());
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-3 px-4 py-3 ${i === active ? "bg-lup-tint" : ""}`}
            >
              <span aria-hidden className="text-lup">
                →
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-navy">{s.title}</span>
                <span className="block truncate text-sm text-muted">{s.summary.replace(/\*\*/g, "")}</span>
              </span>
            </li>
          ))}
          <li className="border-t border-line px-4 py-2 text-xs text-muted">Tryck Enter för att söka på hela frågan</li>
        </ul>
      )}
    </form>
  );
}
