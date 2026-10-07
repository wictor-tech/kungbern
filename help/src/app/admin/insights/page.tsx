import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { getInsights } from "@/lib/analytics";
import { getAdmin } from "@/lib/auth";
import { listGuides } from "@/lib/guides";
import { one, type SearchParams } from "@/lib/params";

export const dynamic = "force-dynamic";

const OUTCOME_LABEL: Record<string, string> = { answered: "Besvarad", ambiguous: "Osäker", none: "Ingen guide" };

/** Varför behöver folk support – och vilka delar av produkten är svåra? */
export default async function Insights({ searchParams }: { searchParams: SearchParams }) {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  const days = [7, 30, 90].includes(Number(one((await searchParams).dagar))) ? Number(one((await searchParams).dagar)) : 30;
  const [ins, guides] = await Promise.all([getInsights(days), listGuides({ includeDrafts: true })]);
  const title = (id: string | null) => (id ? (guides.find((g) => g.id === id)?.title ?? id) : "–");
  const t = ins.totals;
  const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)} %` : "–");

  return (
    <AdminShell admin={admin} active="insights">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold text-navy">Insikter</h1>
        <div className="flex rounded-xl border border-line bg-white p-1 text-sm" role="group" aria-label="Period">
          {[7, 30, 90].map((d) => (
            <Link
              key={d}
              href={`/admin/insights?dagar=${d}`}
              className={`rounded-lg px-3 py-1.5 font-semibold ${d === days ? "bg-lup-tint text-navy" : "text-muted hover:text-navy"}`}
            >
              {d} dagar
            </Link>
          ))}
        </div>
      </div>

      {/* Nyckeltal */}
      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Nyckeltal">
        <Stat label="Frågor" value={t.queries} />
        <Stat label="Fick en guide direkt" value={pct(t.answered, t.queries)} sub={`${t.answered} st`} />
        <Stat label="Utan bra svar" value={t.ambiguous + t.none} sub={`${t.none} helt utan guide`} />
        <Stat label="Löste problemet" value={pct(t.yes, t.yes + t.no)} sub={`👍 ${t.yes} · 👎 ${t.no}`} />
        <Stat label="Supportärenden" value={t.tickets} />
      </section>

      {/* Förslag från förbättringssystemet */}
      {ins.suggestions.length > 0 && (
        <section className="mb-8 rounded-2xl border border-amber-200 bg-warn p-5" aria-labelledby="sugg">
          <h2 id="sugg" className="font-bold text-warn-ink">
            ⚠ Förslag
          </h2>
          <ul className="mt-3 space-y-2">
            {ins.suggestions.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 rounded-xl bg-white/70 px-4 py-3">
                {s.kind === "create" ? (
                  <>
                    <span className="flex-1">
                      <strong>{s.count} frågor</strong> om ”{s.text}” fick inget bra svar. Detta verkar vara ett återkommande problem.
                    </span>
                    <Link href={`/admin/guides/new?q=${encodeURIComponent(s.text)}`} className="rounded-lg bg-navy px-3 py-1.5 text-sm font-semibold text-white">
                      Skapa guide
                    </Link>
                  </>
                ) : (
                  <>
                    <span className="flex-1">
                      Guiden <strong>{title(s.guideId ?? null)}</strong> får många 👎 ({s.count}). Den löser troligen inte problemet.
                    </span>
                    <Link href={`/admin/guides/${s.guideId}`} className="rounded-lg bg-navy px-3 py-1.5 text-sm font-semibold text-white">
                      Förbättra guiden
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Vanligaste frågorna" empty={ins.topQueries.length === 0}>
          <Bars
            rows={ins.topQueries.map((q) => ({
              label: q.text,
              value: q.count,
              note: OUTCOME_LABEL[q.outcome] ?? q.outcome,
              warn: q.outcome !== "answered",
            }))}
          />
        </Panel>

        <Panel title="Frågor utan bra svar" hint="Här saknas en guide – eller fler alternativa frågor i en befintlig." empty={ins.unanswered.length === 0}>
          <Bars
            rows={ins.unanswered.map((q) => ({
              label: q.text,
              value: q.count,
              href: `/admin/guides/new?q=${encodeURIComponent(q.text)}`,
              action: "Skapa guide",
            }))}
          />
        </Panel>

        <Panel title="Mest visade guider" empty={ins.topGuides.length === 0}>
          <Bars rows={ins.topGuides.map((g) => ({ label: title(g.guideId), value: g.views, href: `/admin/guides/${g.guideId}` }))} />
        </Panel>

        <Panel
          title="Guider där användare svarar Nej"
          hint="Svåra funktioner – eller guider som behöver förbättras."
          empty={ins.guideFeedback.filter((g) => g.no > 0).length === 0}
        >
          <Bars
            rows={ins.guideFeedback
              .filter((g) => g.no > 0)
              .map((g) => ({
                label: title(g.guideId),
                value: g.no,
                note: `${Math.round(g.noRate * 100)} % nej av ${g.yes + g.no}`,
                warn: g.flagged,
                href: `/admin/guides/${g.guideId}`,
              }))}
          />
        </Panel>

        <Panel title="Supportärenden trots guide" hint="Ärenden där användaren först tittat på en guide." empty={ins.ticketsAfterGuide.length === 0}>
          <Bars rows={ins.ticketsAfterGuide.map((g) => ({ label: title(g.guideId), value: g.count, href: `/admin/guides/${g.guideId}` }))} />
        </Panel>

        <Panel title="Sidor där folk ber om hjälp" hint="Från ”?”-knappen i produkten." empty={ins.pages.length === 0}>
          <Bars rows={ins.pages.map((p) => ({ label: p.page, value: p.count }))} />
        </Panel>

        <Panel title="Vad saknades? (senaste kommentarerna)" empty={ins.recentComments.length === 0}>
          <ul className="space-y-2 text-sm">
            {ins.recentComments.map((c, i) => (
              <li key={i} className="rounded-lg bg-canvas px-3 py-2">
                ”{c.comment}” <span className="text-muted">– {title(c.guideId)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Senaste supportärenden" empty={ins.tickets.length === 0}>
          <ul className="divide-y divide-line text-sm">
            {ins.tickets.map((tk) => (
              <li key={tk.id} className="py-2">
                <div className="flex gap-2">
                  <span className="font-mono text-xs text-muted">{tk.id}</span>
                  <span className="font-semibold">{tk.queryText ?? "–"}</span>
                </div>
                <div className="text-muted">
                  Guide: {title(tk.guideId)} · Sida: {tk.page ?? "–"} · {tk.contact ?? "–"}
                </div>
                {tk.comment && <div className="mt-1">{tk.comment}</div>}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </AdminShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-3xl font-bold text-navy tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Panel({ title, hint, empty, children }: { title: string; hint?: string; empty: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="font-bold text-navy">{title}</h2>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <div className="mt-4">{empty ? <p className="text-sm text-muted">Inga data för perioden än.</p> : children}</div>
    </section>
  );
}

/** Rangordnade staplar: en färg, tunna staplar, värdet utskrivet vid stapeln (färgen bär aldrig text). */
function Bars({
  rows,
}: {
  rows: { label: string; value: number; note?: string; warn?: boolean; href?: string; action?: string }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="space-y-3">
      {rows.map((r, i) => (
        <li key={i} title={`${r.label}: ${r.value}`}>
          <div className="flex items-baseline gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink">
              {r.href && !r.action ? (
                <Link href={r.href} className="hover:underline">
                  {r.label}
                </Link>
              ) : (
                r.label
              )}
            </span>
            {r.note && (
              <span className={`shrink-0 text-xs ${r.warn ? "font-semibold text-warn-ink" : "text-muted"}`}>
                {r.warn ? "⚠ " : ""}
                {r.note}
              </span>
            )}
            {r.action && r.href && (
              <Link href={r.href} className="shrink-0 text-xs font-semibold text-lup-dark hover:underline">
                {r.action}
              </Link>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-2.5 flex-1">
              <div className="h-full rounded-r bg-lup" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
            </div>
            <span className="w-8 text-right text-sm font-semibold text-ink tabular-nums">{r.value}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
