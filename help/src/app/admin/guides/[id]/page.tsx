import { notFound, redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { GuideEditor } from "@/components/admin/GuideEditor";
import { getAdmin } from "@/lib/auth";
import { CATEGORIES } from "@/lib/categories";
import { getGuide, listGuides } from "@/lib/guides";

export const dynamic = "force-dynamic";

export default async function EditGuide({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  const guide = await getGuide((await params).id, { includeDrafts: true });
  if (!guide) notFound();
  const all = await listGuides({ includeDrafts: true });
  return (
    <AdminShell admin={admin} active="guides">
      <GuideEditor initial={guide} isNew={false} categories={CATEGORIES} allGuides={all.map((g) => ({ id: g.id, title: g.title }))} />
    </AdminShell>
  );
}
