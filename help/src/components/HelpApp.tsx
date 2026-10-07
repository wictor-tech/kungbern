"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Category } from "@/lib/categories";
import type { AskResult, GuideSummary } from "@/lib/types";
import { askApi } from "./client";
import { GuideView } from "./GuideView";
import { SearchBox } from "./SearchBox";
import { TicketForm } from "./TicketForm";
import { GuideCard } from "./ui";

export interface HelpAppProps {
  q: string;
  page: string | null;
  app: string | null;
  embed: boolean;
  categories: (Category & { count: number })[];
  siteGuides: GuideSummary[];
  contextGuides: GuideSummary[];
  summaries: Record<string, GuideSummary>;
  popular: string[];
}

/** Startsidan: en fråga in, en visuell guide ut. */
export function HelpApp(props: HelpAppProps) {
  const { q, page, app, embed } = props;
  const router = useRouter();
  const [result, setResult] = useState<AskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctxParams = () => {
    const p = new URLSearchParams();
    if (page) p.set("page", page);
    if (app) p.set("app", app);
    if (embed) p.set("embed", "1");
    return p;
  };

  const submit = (text: string) => {
    const p = ctxParams();
    p.set("q", text);
    router.push(`/?${p.toString()}`);
  };

  useEffect(() => {
    if (!q) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    askApi(q, { page, app })
      .then((r) => !cancelled && setResult(r))
      .catch(() => !cancelled && setError("Något gick fel. Försök igen."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, page, app]);

  const guideHref = (id: string) => {
    const p = ctxParams();
    if (result?.queryId) p.set("from", result.queryId);
    if (q) p.set("q", q);
    return `/g/${id}?${p.toString()}`;
  };

  // ---------- Startläge ----------
  if (!q) {
    return (
      <div className={embed ? "space-y-6" : "space-y-12"}>
        <section className={`mx-auto max-w-3xl text-center ${embed ? "pt-2" : "pt-10 sm:pt-16"}`}>
          <h1 className="text-3xl font-bold tracking-tight text-navy sm:text-5xl">Vad vill du ha hjälp med?</h1>
          <p className="mt-3 text-lg text-muted">Skriv med egna ord – vi visar exakt var du klickar.</p>
          <div className="mt-6">
            <SearchBox large autoFocus onSubmit={submit} />
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {props.popular.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => submit(p)}
                className="rounded-full border border-line bg-white px-4 py-2 text-sm text-ink transition hover:border-lup hover:text-lup-dark"
              >
                {p}
              </button>
            ))}
          </div>
        </section>

        {props.contextGuides.length > 0 && (
          <section className="mx-auto max-w-3xl" aria-labelledby="ctx-title">
            <h2 id="ctx-title" className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
              Hjälp för sidan du står på
            </h2>
            <div className="space-y-2">
              {props.contextGuides.map((g) => (
                <GuideCard key={g.id} guide={g} href={guideHref(g.id)} />
              ))}
            </div>
          </section>
        )}

        {!embed && (
          <section className="grid gap-6 lg:grid-cols-2" aria-label="Bläddra bland guiderna">
            <div className="rounded-2xl border border-line bg-white p-5 sm:p-6">
              <h2 className="text-xl font-bold text-navy">Location Admin</h2>
              <p className="text-sm text-muted">Ställ in platsen: öppettider, bilder, bokning, SMS och grindar.</p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {props.categories
                  .filter((c) => c.app === "location-admin")
                  .map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/k/${c.id}`}
                        className="flex min-h-14 items-center gap-3 rounded-xl border border-line px-3 py-2 transition hover:border-lup hover:bg-lup-tint/40"
                      >
                        <span aria-hidden className="text-2xl">
                          {c.icon}
                        </span>
                        <span>
                          <span className="block font-semibold text-ink">{c.label}</span>
                          <span className="block text-xs text-muted">{c.count} {c.count === 1 ? "guide" : "guider"}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-line bg-white p-5 sm:p-6">
              <h2 className="text-xl font-bold text-navy">Site</h2>
              <p className="text-sm text-muted">Daglig drift: kalla in, checka ut, kö och SMS till alla.</p>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {props.siteGuides.map((g) => (
                  <li key={g.id}>
                    <Link
                      href={`/g/${g.id}`}
                      className="flex min-h-14 items-center rounded-xl border border-line px-3 py-2 font-semibold text-ink transition hover:border-lup hover:bg-lup-tint/40"
                    >
                      {g.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </div>
    );
  }

  // ---------- Svarsläge ----------
  const related = (result?.guide?.relatedGuides ?? []).map((id) => props.summaries[id]).filter(Boolean);

  return (
    <div className="space-y-6">
      <SearchBox initial={q} busy={loading} onSubmit={submit} />

      {loading && !result && <ResultSkeleton />}
      {error && <p className="rounded-xl bg-marker-tint p-4 text-marker">{error}</p>}

      {result && !loading && (
        <div aria-live="polite">
          {result.outcome === "answered" && result.guide ? (
            <GuideView
              guide={result.guide}
              related={related.length ? related : result.alternatives}
              queryId={result.queryId}
              originalQuery={q}
              page={page}
              answer={result.answer}
            />
          ) : result.outcome === "ambiguous" && result.alternatives.length > 0 ? (
            <section className="animate-rise space-y-4">
              <p className="text-2xl font-bold text-navy">{result.answer}</p>
              <div className="grid gap-3 md:grid-cols-2">
                {result.alternatives.map((g) => (
                  <GuideCard key={g.id} guide={g} href={guideHref(g.id)} />
                ))}
              </div>
              <NotFoundHelp q={q} page={page} />
            </section>
          ) : (
            <section className="animate-rise space-y-4">
              <p className="text-2xl font-bold text-navy">{result.answer}</p>
              <p className="text-muted">Vi har sparat frågan så att vi kan skriva en guide om det.</p>
              {result.alternatives.length > 0 && (
                <>
                  <p className="text-sm font-semibold tracking-wide text-muted uppercase">Närmast vi har</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {result.alternatives.map((g) => (
                      <GuideCard key={g.id} guide={g} href={guideHref(g.id)} />
                    ))}
                  </div>
                </>
              )}
              <NotFoundHelp q={q} page={page} open />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function NotFoundHelp({ q, page, open = false }: { q: string; page: string | null; open?: boolean }) {
  const [show, setShow] = useState(open);
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      {show ? (
        <TicketForm guideId={null} queryText={q} page={page} stepsViewed={[]} initialComment={q} />
      ) : (
        <button type="button" onClick={() => setShow(true)} className="font-semibold text-navy underline">
          Inget av detta? Kontakta support
        </button>
      )}
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="grid animate-pulse gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" aria-hidden>
      <div className="aspect-[16/8] rounded-xl bg-slate-200" />
      <div className="space-y-3">
        <div className="h-16 rounded-xl bg-slate-200" />
        <div className="h-16 rounded-xl bg-slate-200" />
        <div className="h-16 rounded-xl bg-slate-200" />
      </div>
    </div>
  );
}
