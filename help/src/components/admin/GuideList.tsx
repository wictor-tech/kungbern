"use client";

import Link from "next/link";
import { useState } from "react";
import type { Category } from "@/lib/categories";
import { normalize } from "@/lib/text";
import type { GuideSummary } from "@/lib/types";
import { AppBadge } from "../ui";

export function GuideList({ guides, categories }: { guides: (GuideSummary & { updatedBy: string | null })[]; categories: Category[] }) {
  const [filter, setFilter] = useState("");
  const f = normalize(filter);
  const visible = guides.filter((g) => !f || normalize(`${g.title} ${g.summary} ${g.id}`).includes(f));
  const fmt = (d: string) => new Date(d).toLocaleDateString("sv-SE", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div className="space-y-6">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtrera guider…"
        className="min-h-11 w-full max-w-md rounded-xl border border-line bg-white px-3"
      />
      {categories.map((c) => {
        const list = visible.filter((g) => g.category === c.id);
        if (!list.length) return null;
        return (
          <section key={c.id}>
            <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">
              {c.icon} {c.label}
            </h2>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
              {list.map((g) => (
                <li key={g.id}>
                  <Link href={`/admin/guides/${g.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-canvas">
                    <span className="w-8 text-sm text-muted">{g.number}</span>
                    <span className="min-w-0 flex-1 font-semibold text-ink">{g.title}</span>
                    <AppBadge app={g.app} />
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        g.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {g.status === "published" ? "Publicerad" : "Utkast"}
                    </span>
                    <span className="w-40 text-right text-xs text-muted" title={g.updatedBy ?? ""}>
                      Ändrad {fmt(g.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {visible.filter((g) => !categories.some((c) => c.id === g.category)).length > 0 && (
        <p className="text-sm text-muted">Guider utan känd kategori visas inte här.</p>
      )}
    </div>
  );
}
