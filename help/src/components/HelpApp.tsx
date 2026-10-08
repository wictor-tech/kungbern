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
      .catch((e: unknown) =>
        !cancelled && setError(e instanceof Error && e.message ? e.message : "Något gick fel. Försök igen."),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, page, app]);

  const pick = (g: GuideSummary, typed: string) => {
    const p = ctxParams();
    if (typed) p.set("q", typed);
    router.push(`/g/${g.id}?${p.toString()}`);
  };

  const guideHref = (id: string) => {
    const p = ctxParams();
    if (result?.queryId) p.set("from", result.queryId);
    if (q) p.set("q", q);
    return `/g/${id}?${p.toString()}`;
  };

  // ---------- Startläge ----------
  if (!q) {
    const total = props.categories.reduce((n, c) => n + c.count, 0);
    const search = <SearchBox large autoFocus ctx={{ page, app }} onSubmit={submit} onPick={pick} />;
    const chips = (light: boolean) => (
      <div className={`flex flex-wrap gap-2 ${light ? "justify-center" : ""}`}>
        {props.popular.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => submit(p)}
            className={
              light
                ? "rounded-full bg-white/[0.06] px-4 py-2 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white hover:text-navy"
                : "rounded-full border border-line bg-white px-4 py-2 text-sm text-ink transition hover:border-lup hover:text-lup-dark"
            }
          >
            {p}
          </button>
        ))}
      </div>
    );

    // I panelen inne i produkten: kompakt, utan stor banner.
    if (embed)
      return (
        <div className="space-y-6">
          <section className="space-y-4 pt-2">
            <h1 className="text-2xl font-bold tracking-tight text-navy">Vad vill du ha hjälp med?</h1>
            {search}
            {chips(false)}
          </section>
          {props.contextGuides.length > 0 && <ContextGuides guides={props.contextGuides} href={guideHref} />}
        </div>
      );

    return (
      <div className="space-y-12">
        <section className="full-bleed bg-brand relative -mt-6 overflow-hidden text-white sm:-mt-8">
          <DockDoors />
          <div className="relative mx-auto max-w-3xl px-4 pt-14 pb-48 text-center sm:px-6 sm:pt-20 sm:pb-56">
            <p className="eyebrow eyebrow-dark mb-5">Hjälpcenter · {total} guider</p>
            <h1 className="text-4xl leading-[1.05] font-extrabold tracking-[-0.02em] text-balance sm:text-6xl">
              Vad vill du ha <span className="text-sky">hjälp</span> med?
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-white/80 sm:text-xl">
              Skriv med egna ord – vi visar exakt var du klickar.
            </p>
            <div className="mt-8 text-left text-ink">{search}</div>
            <div className="mt-5">{chips(true)}</div>
          </div>
        </section>

        {props.contextGuides.length > 0 && <ContextGuides guides={props.contextGuides} href={guideHref} />}

        <section className="relative z-10 -mt-32 grid items-start gap-6 sm:-mt-36 lg:grid-cols-2" aria-label="Bläddra bland guiderna">
          <AppPanel
            title="Location Admin"
            text="Ställ in platsen: öppettider, bilder, bokning, SMS och grindar."
            tone="navy"
            count={props.categories.filter((c) => c.app === "location-admin").reduce((n, c) => n + c.count, 0)}
          >
            {props.categories
              .filter((c) => c.app === "location-admin")
              .map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/k/${c.id}`}
                    className="lift group flex min-h-16 items-center gap-3 rounded-xl border border-line bg-white px-3 py-2 hover:border-lup"
                  >
                    <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lup-tint text-2xl">
                      {c.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink group-hover:text-navy">{c.label}</span>
                      <span className="block text-xs text-muted">
                        {c.count} {c.count === 1 ? "guide" : "guider"}
                      </span>
                    </span>
                    <Arrow />
                  </Link>
                </li>
              ))}
          </AppPanel>
          <AppPanel title="Site" text="Daglig drift: kalla in, checka ut, kö och SMS till alla." tone="blue" count={props.siteGuides.length}>
            {props.siteGuides.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/g/${g.id}`}
                  className="lift group flex min-h-16 items-center gap-3 rounded-xl border border-line bg-white px-4 py-2 hover:border-lup"
                >
                  <span className="min-w-0 flex-1 font-semibold text-ink group-hover:text-navy">{g.title}</span>
                  <Arrow />
                </Link>
              </li>
            ))}
          </AppPanel>
        </section>

        <section className="text-center" aria-labelledby="how-title">
          <p className="eyebrow">Så fungerar hjälpen</p>
          <h2 id="how-title" className="mt-3 text-3xl font-extrabold tracking-[-0.02em] text-navy sm:text-4xl">
            Från fråga till klick på några sekunder.
          </h2>
          <ol className="relative mt-10 grid gap-8 sm:grid-cols-3">
            <span aria-hidden className="absolute top-7 right-[16%] left-[16%] hidden h-0.5 bg-lup/25 sm:block" />
            {[
              ["Fråga med egna ord", "Skriv som du skulle fråga en kollega. Stavfel gör inget."],
              ["Se exakt var du klickar", "Skärmbilder från appen med numrerade markeringar, steg för steg."],
              ["Fastnar du? Vi tar över", "Tryck 👎 så skickas din fråga och guiden med till supporten."],
            ].map(([t, d], i) => (
              <li key={t} className="relative flex flex-col items-center px-4">
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-full text-lg font-extrabold ${
                    i === 0 ? "glow bg-lup text-white ring-8 ring-lup/15" : "border-2 border-lup bg-white text-lup"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="mt-4 block text-lg font-bold text-navy">{t}</span>
                <span className="mt-1 block max-w-xs text-sm text-muted">{d}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    );
  }

  // ---------- Svarsläge ----------
  const related = (result?.guide?.relatedGuides ?? []).map((id) => props.summaries[id]).filter(Boolean);

  return (
    <div className="space-y-6">
      <SearchBox initial={q} busy={loading} ctx={{ page, app }} onSubmit={submit} onPick={pick} />

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

function ContextGuides({ guides, href }: { guides: GuideSummary[]; href: (id: string) => string }) {
  return (
    <section className="mx-auto max-w-3xl" aria-labelledby="ctx-title">
      <h2 id="ctx-title" className="eyebrow mb-3">
        Hjälp för sidan du står på
      </h2>
      <div className="space-y-2">
        {guides.map((g) => (
          <GuideCard key={g.id} guide={g} href={href(g.id)} />
        ))}
      </div>
    </section>
  );
}

function AppPanel({
  title,
  text,
  tone,
  count,
  children,
}: {
  title: string;
  text: string;
  tone: "navy" | "blue";
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-navy/10 ring-1 ring-line">
      <div className={`flex items-end justify-between gap-4 px-6 py-5 text-white ${tone === "navy" ? "bg-navy" : "bg-lup"}`}>
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <p className="mt-0.5 text-sm text-white/85">{text}</p>
        </div>
        <span className="shrink-0 text-right leading-none">
          <span className="block text-3xl font-extrabold italic tabular-nums">{count}</span>
          <span className="text-xs text-white/75">guider</span>
        </span>
      </div>
      <ul className="grid gap-2 bg-canvas/60 p-4 sm:grid-cols-2 sm:p-5">{children}</ul>
    </div>
  );
}

function Arrow() {
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lup-tint text-lup-dark transition group-hover:bg-lup group-hover:text-white"
    >
      →
    </span>
  );
}

/** Dekor: en rad numrerade lastbryggor längst ner i bannern – det LUPNUMBER styr trafiken till. */
function DockDoors() {
  const doors = Array.from({ length: 14 }, (_, i) => i);
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-44 w-full opacity-[0.08] sm:h-52"
      viewBox="0 0 1400 200"
      preserveAspectRatio="xMidYMax slice"
      fill="none"
      stroke="white"
    >
      {doors.map((i) => {
        const x = 20 + i * 100;
        return (
          <g key={i}>
            <text x={x + 40} y="52" fill="white" stroke="none" fontSize="26" fontWeight="700" textAnchor="middle" fontStyle="italic">
              {String(i + 1).padStart(2, "0")}
            </text>
            <rect x={x} y="68" width="80" height="132" strokeWidth="3" />
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <line key={k} x1={x + 6} x2={x + 74} y1={86 + k * 18} y2={86 + k * 18} strokeWidth="2" />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
