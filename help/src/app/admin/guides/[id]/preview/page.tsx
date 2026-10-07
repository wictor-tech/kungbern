import { notFound, redirect } from "next/navigation";
import { GuideView } from "@/components/GuideView";
import { Shell } from "@/components/Shell";
import { getAdmin } from "@/lib/auth";
import { getGuide, listGuides, toSummary } from "@/lib/guides";

export const dynamic = "force-dynamic";

/** Så här ser guiden ut för användaren – även utkast. */
export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdmin())) redirect("/admin/login");
  const guide = await getGuide((await params).id, { includeDrafts: true });
  if (!guide) notFound();
  const all = await listGuides({ includeDrafts: true });
  const related = guide.relatedGuides.map((r) => all.find((g) => g.id === r)).filter((g) => g !== undefined).map(toSummary);
  return (
    <Shell>
      <p className="mb-4 rounded-lg bg-warn px-3 py-2 text-sm text-warn-ink">
        Förhandsgranskning{guide.status === "draft" ? " – utkastet syns inte för användare än" : ""}. Feedback härifrån räknas inte.
      </p>
      <GuideView guide={guide} related={related} queryId={null} originalQuery={null} page={null} preview />
    </Shell>
  );
}
