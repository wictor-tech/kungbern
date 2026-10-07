import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { GuideEditor } from "@/components/admin/GuideEditor";
import { draftEnabled } from "@/lib/ai-draft";
import { getAdmin } from "@/lib/auth";
import { CATEGORIES } from "@/lib/categories";
import { listGuides, nextGuideNumber, slugify } from "@/lib/guides";
import { one, type SearchParams } from "@/lib/params";
import type { Guide } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Ny guide. ?q=… förifyller titel och första alternativa fråga (från Insikter → "Skapa guide"). */
export default async function NewGuide({ searchParams }: { searchParams: SearchParams }) {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  const q = one((await searchParams).q);
  const all = await listGuides({ includeDrafts: true });
  const blank: Guide = {
    id: q ? slugify(q) : "",
    number: await nextGuideNumber(),
    title: q ?? "",
    category: CATEGORIES[0].id,
    app: CATEGORIES[0].app,
    pageKey: "",
    breadcrumb: [],
    summary: "",
    screenshot: null,
    hotspots: [],
    steps: [{ n: 1, text: "" }],
    notes: [],
    alternativeQueries: q ? [q] : [],
    relatedGuides: [],
    roles: [],
    language: "sv",
    status: "draft",
    video: null,
    version: 0,
    updatedAt: new Date().toISOString(),
    updatedBy: admin,
  };
  return (
    <AdminShell admin={admin} active="guides">
      <GuideEditor aiEnabled={draftEnabled()} initial={blank} isNew categories={CATEGORIES} allGuides={all.map((g) => ({ id: g.id, title: g.title }))} />
    </AdminShell>
  );
}
