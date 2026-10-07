import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { adminConfigured, getAdmin } from "@/lib/auth";
import { one, type SearchParams } from "@/lib/params";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: SearchParams }) {
  if (await getAdmin()) redirect("/admin");
  const failed = one((await searchParams).fel) === "1";
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form action="/api/admin/login" method="post" className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-white p-6 shadow-sm">
        <Logo />
        <h1 className="text-xl font-bold text-navy">Logga in som administratör</h1>
        {!adminConfigured() && (
          <p className="rounded-lg bg-warn p-3 text-sm text-warn-ink">ADMIN_PASSWORD är inte satt på servern. Se .env.example.</p>
        )}
        {failed && <p className="rounded-lg bg-marker-tint p-3 text-sm text-marker">Fel lösenord.</p>}
        <label className="block text-sm font-medium">
          Ditt namn <span className="font-normal text-muted">(visas som "senast ändrad av")</span>
          <input name="name" autoComplete="name" className="mt-1 min-h-11 w-full rounded-xl border border-line px-3" />
        </label>
        <label className="block text-sm font-medium">
          Lösenord
          <input name="password" type="password" required autoComplete="current-password" className="mt-1 min-h-11 w-full rounded-xl border border-line px-3" />
        </label>
        <button className="min-h-11 w-full rounded-xl bg-lup font-semibold text-white hover:bg-lup-dark">Logga in</button>
      </form>
    </div>
  );
}
