import { HelpApp } from "@/components/HelpApp";
import { Shell } from "@/components/Shell";
import { CATEGORIES, POPULAR_QUESTIONS } from "@/lib/categories";
import { listGuides, toSummary } from "@/lib/guides";
import { one, type SearchParams } from "@/lib/params";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = one(sp.q) ?? "";
  const page = one(sp.page);
  const app = one(sp.app);
  const embed = one(sp.embed) === "1";

  const guides = await listGuides();
  const summaries = Object.fromEntries(guides.map((g) => [g.id, toSummary(g)]));

  return (
    <Shell embed={embed}>
      <HelpApp
        q={q}
        page={page}
        app={app === "site" || app === "location-admin" ? app : null}
        embed={embed}
        categories={CATEGORIES.map((c) => ({ ...c, count: guides.filter((g) => g.category === c.id).length }))}
        siteGuides={guides.filter((g) => g.app === "site").map(toSummary)}
        contextGuides={page ? guides.filter((g) => g.pageKey === page).map(toSummary) : []}
        summaries={summaries}
        popular={POPULAR_QUESTIONS}
      />
    </Shell>
  );
}
