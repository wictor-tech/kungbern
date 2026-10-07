import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { GuideView } from "@/components/GuideView";
import { HelpApp } from "@/components/HelpApp";
import { Shell } from "@/components/Shell";
import { GuideCard } from "@/components/ui";
import { APP_LABEL, CATEGORIES, POPULAR_QUESTIONS, categoryById } from "@/lib/categories";
import { toSummary } from "@/lib/guides-summary";
import { DEMO_GUIDES } from "./data";
import Link from "./shims/next-link";
import { subscribe } from "./shims/router";

const summaries = Object.fromEntries(DEMO_GUIDES.map((g) => [g.id, toSummary(g)]));

function parse(href: string) {
  const url = new URL(href, "https://demo.local");
  const p = url.searchParams;
  return { path: url.pathname, q: p.get("q") ?? "", page: p.get("page"), app: p.get("app") };
}

function DemoBanner() {
  return (
    <div className="border-b border-amber-200 bg-warn px-4 py-2 text-center text-sm text-warn-ink">
      <strong>Demo.</strong> Sökningen körs i webbläsaren utan AI-lagret, och feedback och supportärenden skickas inte. Bilderna är tagna i app.lupnumber.com (demoplatsen).
    </div>
  );
}

function Demo() {
  const [href, setHref] = useState("/");
  useEffect(() => subscribe(setHref), []);
  const r = parse(href);

  let body: React.ReactNode;
  const guideMatch = r.path.match(/^\/g\/(.+)$/);
  const catMatch = r.path.match(/^\/k\/(.+)$/);

  if (guideMatch) {
    const guide = DEMO_GUIDES.find((g) => g.id === guideMatch[1]);
    body = guide ? (
      <>
        <div className="mb-4 text-sm">
          <Link href={r.q ? `/?q=${encodeURIComponent(r.q)}` : "/"} className="font-medium text-lup-dark hover:underline">
            ← {r.q ? "Tillbaka till svaret" : "Ställ en fråga"}
          </Link>
        </div>
        <GuideView
          guide={guide}
          related={guide.relatedGuides.map((id) => summaries[id]).filter(Boolean)}
          queryId={null}
          originalQuery={r.q || null}
          page={r.page}
        />
      </>
    ) : null;
  } else if (catMatch) {
    const cat = categoryById(catMatch[1]);
    body = cat ? (
      <>
        <Link href="/" className="text-sm font-medium text-lup-dark hover:underline">
          ← Ställ en fråga
        </Link>
        <h1 className="mt-3 text-3xl font-bold text-navy">
          <span aria-hidden>{cat.icon}</span> {cat.label}
        </h1>
        <p className="mt-1 text-muted">
          {APP_LABEL[cat.app]} · {cat.description}
        </p>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {DEMO_GUIDES.filter((g) => g.category === cat.id).map((g) => (
            <GuideCard key={g.id} guide={toSummary(g)} />
          ))}
        </div>
      </>
    ) : null;
  } else {
    body = (
      <HelpApp
        q={r.q}
        page={r.page}
        app={r.app}
        embed={false}
        categories={CATEGORIES.map((c) => ({ ...c, count: DEMO_GUIDES.filter((g) => g.category === c.id).length }))}
        siteGuides={DEMO_GUIDES.filter((g) => g.app === "site").map(toSummary)}
        contextGuides={r.page ? DEMO_GUIDES.filter((g) => g.pageKey === r.page).map(toSummary) : []}
        summaries={summaries}
        popular={POPULAR_QUESTIONS}
      />
    );
  }

  return (
    <>
      <DemoBanner />
      <Shell>{body}</Shell>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Demo />);
