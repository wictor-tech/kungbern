import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { GuideCard } from "@/components/ui";
import { APP_LABEL, categoryById } from "@/lib/categories";
import { listGuides, toSummary } from "@/lib/guides";

export const dynamic = "force-dynamic";

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const cat = categoryById((await params).category);
  if (!cat) notFound();
  const guides = (await listGuides()).filter((g) => g.category === cat.id);

  return (
    <Shell>
      <Link href="/" className="text-sm font-medium text-lup-dark hover:underline">
        ← Ställ en fråga
      </Link>
      <header className="bg-brand mt-3 flex items-center gap-5 rounded-3xl px-5 py-6 text-white sm:px-8 sm:py-8">
        <span aria-hidden className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white text-4xl shadow-lg">
          {cat.icon}
        </span>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{cat.label}</h1>
          <p className="mt-1 text-white/85">
            {APP_LABEL[cat.app]} · {cat.description} · {guides.length} {guides.length === 1 ? "guide" : "guider"}
          </p>
        </div>
      </header>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {guides.map((g) => (
          <GuideCard key={g.id} guide={toSummary(g)} />
        ))}
      </div>
    </Shell>
  );
}
