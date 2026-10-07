"use client";

import { useEffect, useState } from "react";

const EXAMPLES = [
  "Hur lägger jag upp en bild?",
  "Ingen kan boka",
  "Hur kallar jag in en förare?",
  "Ändra öppettider i jul",
  "Skicka SMS till alla på området",
  "Lägga till en lastbrygga",
];

export function SearchBox({
  initial = "",
  large = false,
  autoFocus = false,
  busy = false,
  onSubmit,
}: {
  initial?: string;
  large?: boolean;
  autoFocus?: boolean;
  busy?: boolean;
  onSubmit: (q: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [example, setExample] = useState(0);

  useEffect(() => setValue(initial), [initial]);

  useEffect(() => {
    if (value) return;
    const t = setInterval(() => setExample((i) => (i + 1) % EXAMPLES.length), 3500);
    return () => clearInterval(t);
  }, [value]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        if (q) onSubmit(q);
      }}
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
        onChange={(e) => setValue(e.target.value)}
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
    </form>
  );
}
