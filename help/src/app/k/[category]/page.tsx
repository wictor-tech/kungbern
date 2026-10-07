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
      <h1 className="mt-3 text-3xl font-bold text-navy">
        <span aria-hidden>{cat.icon}</span> {cat.label}
      </h1>
      <p className="mt-1 text-muted">
        {APP_LABEL[cat.app]} · {cat.description}
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {guides.map((g) => (
          <GuideCard key={g.id} guide={toSummary(g)} />
        ))}
      </div>
    </Shell>
  );
}
