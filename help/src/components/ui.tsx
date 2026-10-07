import Link from "next/link";
import { APP_LABEL } from "@/lib/categories";
import type { AppArea, GuideSummary } from "@/lib/types";

export function Logo({ embed = false }: { embed?: boolean }) {
  return (
    <Link href={embed ? "/?embed=1" : "/"} className="flex items-baseline gap-2" aria-label="LUP Hjälp – till startsidan">
      <span className="text-xl font-extrabold tracking-tight">
        <span className="text-lup">LUP</span>
        <span className="text-navy">NUMBER</span>
      </span>
      <span className="rounded-md bg-lup-tint px-2 py-0.5 text-sm font-semibold text-navy">Hjälp</span>
    </Link>
  );
}

export function AppBadge({ app }: { app: AppArea }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        app === "site" ? "bg-emerald-50 text-emerald-800" : "bg-lup-tint text-navy"
      }`}
    >
      {APP_LABEL[app]}
    </span>
  );
}

/** Menysökvägen ("Location Admin › DEMO LUP › …") som i manualens blå ruta. */
export function Breadcrumb({ items }: { items: string[] }) {
  return (
    <nav aria-label="Var du hittar det" className="rounded-lg border-l-4 border-lup bg-lup-tint/70 px-3 py-2 text-sm text-navy">
      <span className="sr-only">Var: </span>
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1.5 text-lup">›</span>}
          <span className={i === items.length - 1 ? "font-semibold" : ""}>{item}</span>
        </span>
      ))}
    </nav>
  );
}

export function GuideCard({ guide, href, onClick }: { guide: GuideSummary; href?: string; onClick?: () => void }) {
  const inner = (
    <>
      {guide.screenshot && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={guide.screenshot}
          alt=""
          loading="lazy"
          className="h-20 w-32 shrink-0 rounded-md border border-line object-cover object-left-top"
        />
      )}
      <span className="min-w-0">
        <span className="block font-semibold text-navy group-hover:text-lup-dark">{guide.title}</span>
        <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{guide.summary}</span>
        <span className="mt-1.5 block">
          <AppBadge app={guide.app} />
        </span>
      </span>
    </>
  );
  const cls =
    "group flex w-full items-start gap-4 rounded-xl border border-line bg-white p-3 text-left transition hover:border-lup hover:shadow-sm";
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  return (
    <Link href={href ?? `/g/${guide.id}`} className={cls}>
      {inner}
    </Link>
  );
}
