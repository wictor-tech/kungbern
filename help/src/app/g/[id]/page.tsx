import Link from "next/link";
import { notFound } from "next/navigation";
import { GuideView } from "@/components/GuideView";
import { Shell } from "@/components/Shell";
import { categoryById } from "@/lib/categories";
import { getGuide, listGuides, toSummary } from "@/lib/guides";
import { one, type SearchParams } from "@/lib/params";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const guide = await getGuide((await params).id);
  return { title: guide ? `${guide.title} – LUP Hjälp` : "LUP Hjälp" };
}

/** En guide med delbar länk (/g/lagga-upp-en-bild). */
export default async function GuidePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const guide = await getGuide(id);
  if (!guide) notFound();

  const all = await listGuides();
  const related = guide.relatedGuides
    .map((r) => all.find((g) => g.id === r))
    .filter((g) => g !== undefined)
    .map(toSummary);
  const q = one(sp.q);
  const embed = one(sp.embed) === "1";
  const back = new URLSearchParams();
  if (q) back.set("q", q);
  if (embed) back.set("embed", "1");
  const cat = categoryById(guide.category);

  return (
    <Shell embed={embed}>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <Link href={`/?${back.toString()}`} className="font-medium text-lup-dark hover:underline">
          ← {q ? "Tillbaka till svaret" : "Ställ en fråga"}
        </Link>
        {cat && (
          <>
            <span className="text-line">|</span>
            <Link href={`/k/${cat.id}`} className="text-muted hover:text-navy">
              {cat.label}
            </Link>
          </>
        )}
      </div>
      <GuideView guide={guide} related={related} queryId={one(sp.from)} originalQuery={q} page={one(sp.page)} />
    </Shell>
  );
}
