import Link from "next/link";
import { Logo } from "../ui";

export function AdminShell({ admin, active, children }: { admin: string; active: "guides" | "insights"; children: React.ReactNode }) {
  const tab = (key: string, href: string, label: string) => (
    <Link
      href={href}
      className={`rounded-lg px-3 py-2 text-sm font-semibold ${active === key ? "bg-lup-tint text-navy" : "text-muted hover:text-navy"}`}
    >
      {label}
    </Link>
  );
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
          <Logo />
          <span className="rounded bg-navy px-2 py-0.5 text-xs font-bold tracking-wide text-white uppercase">Admin</span>
          <nav className="order-last flex w-full gap-1 sm:order-none sm:ml-4 sm:w-auto">
            {tab("guides", "/admin", "Guider")}
            {tab("insights", "/admin/insights", "Insikter")}
          </nav>
          <form action="/api/admin/logout" method="post" className="ml-auto flex items-center gap-3 text-sm text-muted">
            <span className="hidden sm:inline">Inloggad som {admin}</span>
            <button className="font-medium text-navy hover:underline">Logga ut</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
