import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { GuideList } from "@/components/admin/GuideList";
import { getInsights } from "@/lib/analytics";
import { getAdmin } from "@/lib/auth";
import { CATEGORIES } from "@/lib/categories";
import { listGuides, toSummary } from "@/lib/guides";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  const [guides, insights] = await Promise.all([listGuides({ includeDrafts: true }), getInsights(30)]);
  return (
    <AdminShell admin={admin} active="guides">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold text-navy">Guider</h1>
        <Link href="/admin/guides/new" className="min-h-11 rounded-xl bg-lup px-5 py-2.5 font-semibold text-white hover:bg-lup-dark">
          + Ny guide
        </Link>
      </div>
      {insights.suggestions.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-warn p-4 text-warn-ink">
          <p className="font-semibold">Systemet har {insights.suggestions.length} förslag på förbättringar.</p>
          <Link href="/admin/insights" className="text-sm underline">
            Visa förslagen →
          </Link>
        </div>
      )}
      <GuideList guides={guides.map((g) => ({ ...toSummary(g), updatedBy: g.updatedBy ?? null }))} categories={CATEGORIES} />
    </AdminShell>
  );
}
