"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Category } from "@/lib/categories";
import type { Guide, Hotspot, Note, Step } from "@/lib/types";

/**
 * Enkel redigering av en guide. Allt på en sida, i samma ordning som användaren ser guiden.
 * Markeringar ritas direkt på skärmbilden genom att dra en ruta.
 */
export function GuideEditor({
  initial,
  isNew,
  categories,
  allGuides,
}: {
  initial: Guide;
  isNew: boolean;
  categories: Category[];
  allGuides: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [g, setG] = useState<Guide>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [drawing, setDrawing] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);

  const set = <K extends keyof Guide>(key: K, value: Guide[K]) => {
    setG((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };
  const renumber = <T extends { n: number }>(list: T[]) => list.map((x, i) => ({ ...x, n: i + 1 }));

  async function save(status?: Guide["status"]) {
    setSaving(true);
    setMessage(null);
    // Tomma rader städas bort innan sparning.
    const body = {
      ...g,
      status: status ?? g.status,
      breadcrumb: g.breadcrumb.map((s) => s.trim()).filter(Boolean),
      alternativeQueries: g.alternativeQueries.map((q) => q.trim()).filter(Boolean),
      steps: g.steps.filter((s) => s.text.trim()).map((s, i) => ({ ...s, n: i + 1 })),
      notes: g.notes.filter((n) => n.text.trim()),
    };
    try {
      const res = await fetch(isNew ? "/api/admin/guides" : `/api/admin/guides/${g.id}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Kunde inte spara");
      setG(json.guide);
      setDirty(false);
      setMessage({ ok: true, text: "Sparat." });
      if (isNew) router.replace(`/admin/guides/${json.guide.id}`);
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Kunde inte spara" });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Ta bort guiden "${g.title}"? Det går inte att ångra.`)) return;
    const res = await fetch(`/api/admin/guides/${g.id}`, { method: "DELETE" });
    if (res.ok) router.push("/admin");
  }

  async function upload(file: File, onDone: (url: string, kind: string) => void) {
    setUploading(true);
    setMessage(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Uppladdningen misslyckades");
      onDone(json.url, json.kind);
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Uppladdningen misslyckades" });
    } finally {
      setUploading(false);
    }
  }

  const input = "min-h-11 w-full rounded-xl border border-line bg-white px-3 focus:border-lup focus:outline-none";
  const area = "field-sizing-content min-h-11 w-full rounded-xl border border-line bg-white p-3 focus:border-lup focus:outline-none";
  const label = "mb-1 block text-sm font-semibold text-navy";
  const hint = "mt-1 text-xs text-muted";
  const card = "space-y-4 rounded-2xl border border-line bg-white p-5";

  return (
    <div className="pb-40 sm:pb-28">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/admin" className="text-sm font-medium text-lup-dark hover:underline">
          ← Alla guider
        </Link>
        <span className="ml-auto text-xs text-muted">
          {isNew
            ? "Ny guide"
            : `Senast uppdaterad ${new Date(g.updatedAt).toLocaleString("sv-SE")}${g.updatedBy ? ` av ${g.updatedBy}` : ""} · version ${g.version}`}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          {/* Grunduppgifter */}
          <section className={card}>
            <div>
              <label className={label} htmlFor="title">
                Titel – skriv det användaren vill göra
              </label>
              <input
                id="title"
                className={`${input} text-lg font-semibold`}
                value={g.title}
                onChange={(e) => {
                  set("title", e.target.value);
                  if (isNew)
                    set(
                      "id",
                      e.target.value
                        .toLowerCase()
                        .replace(/[åä]/g, "a")
                        .replace(/ö/g, "o")
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, "")
                        .slice(0, 60),
                    );
                }}
                placeholder="T.ex. Lägga upp en bild"
              />
              {isNew && <p className={hint}>Länk: /g/{g.id || "…"}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={label} htmlFor="category">
                  Kategori
                </label>
                <select
                  id="category"
                  className={input}
                  value={g.category}
                  onChange={(e) => {
                    const c = categories.find((x) => x.id === e.target.value);
                    set("category", e.target.value);
                    if (c) set("app", c.app);
                  }}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label} ({c.app === "site" ? "Site" : "Location Admin"})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label} htmlFor="pageKey">
                  Sida i produkten
                </label>
                <input
                  id="pageKey"
                  className={input}
                  value={g.pageKey}
                  onChange={(e) => set("pageKey", e.target.value.trim())}
                  placeholder="t.ex. image-management"
                />
                <p className={hint}>Används när hjälpen öppnas från den sidan.</p>
              </div>
            </div>
            <div>
              <label className={label} htmlFor="crumb">
                Var finns det? (menysökväg)
              </label>
              <input
                id="crumb"
                className={input}
                value={g.breadcrumb.join(" › ")}
                onChange={(e) =>
                  set(
                    "breadcrumb",
                    e.target.value.split(/\s*[›>]\s*/).filter((s, i, arr) => s || i < arr.length - 1),
                  )
                }
                placeholder="Location Admin › Location details › Image management"
              />
              <p className={hint}>Skilj stegen åt med › eller &gt;.</p>
            </div>
            <div>
              <label className={label} htmlFor="summary">
                Kort beskrivning (en–två meningar)
              </label>
              <textarea id="summary" rows={2} className={area} value={g.summary} onChange={(e) => set("summary", e.target.value)} />
            </div>
          </section>

          {/* Steg */}
          <section className={card}>
            <h2 className="text-lg font-bold text-navy">Gör så här</h2>
            <ol className="space-y-2">
              {g.steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lup text-sm font-bold text-white">
                    {s.n}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <textarea
                      aria-label={`Steg ${s.n}`}
                      rows={1}
                      className={area}
                      value={s.text}
                      onChange={(e) => set("steps", g.steps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                    />
                    {g.hotspots.length > 0 && (
                      <select
                        aria-label={`Markering för steg ${s.n}`}
                        className="rounded-lg border border-line px-2 py-1 text-xs text-muted"
                        value={s.hotspot ?? ""}
                        onChange={(e) =>
                          set(
                            "steps",
                            g.steps.map((x, j) =>
                              j === i ? { ...x, hotspot: e.target.value ? Number(e.target.value) : undefined } : x,
                            ),
                          )
                        }
                      >
                        <option value="">Ingen markering</option>
                        {g.hotspots.map((h) => (
                          <option key={h.n} value={h.n}>
                            Markering {h.n}: {h.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <ListButtons
                    index={i}
                    length={g.steps.length}
                    onMove={(from, to) => set("steps", renumber(move(g.steps, from, to)))}
                    onRemove={() => set("steps", renumber(g.steps.filter((_, j) => j !== i)))}
                  />
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="rounded-xl border border-dashed border-lup px-4 py-2 text-sm font-semibold text-lup-dark hover:bg-lup-tint/40"
              onClick={() => set("steps", [...g.steps, { n: g.steps.length + 1, text: "" } as Step])}
            >
              + Lägg till steg
            </button>
          </section>

          {/* Tips och varningar */}
          <section className={card}>
            <h2 className="text-lg font-bold text-navy">Tips och varningar</h2>
            {g.notes.map((n, i) => (
              <div key={i} className="flex items-start gap-2">
                <select
                  aria-label="Typ"
                  className={`rounded-lg border px-2 py-2 text-sm ${n.type === "warning" ? "border-amber-300 bg-warn" : "border-emerald-300 bg-tip"}`}
                  value={n.type}
                  onChange={(e) =>
                    set("notes", g.notes.map((x, j) => (j === i ? { ...x, type: e.target.value as Note["type"] } : x)))
                  }
                >
                  <option value="tip">Tips</option>
                  <option value="warning">Var försiktig</option>
                </select>
                <textarea
                  aria-label="Text"
                  rows={1}
                  className={area}
                  value={n.text}
                  onChange={(e) => set("notes", g.notes.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                />
                <button type="button" aria-label="Ta bort" className="px-2 py-2 text-muted hover:text-marker" onClick={() => set("notes", g.notes.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <button type="button" className="rounded-xl border border-dashed border-emerald-400 px-3 py-2 text-sm font-semibold text-tip-ink" onClick={() => set("notes", [...g.notes, { type: "tip", text: "" }])}>
                + Tips
              </button>
              <button type="button" className="rounded-xl border border-dashed border-amber-400 px-3 py-2 text-sm font-semibold text-warn-ink" onClick={() => set("notes", [...g.notes, { type: "warning", text: "" }])}>
                + Varning
              </button>
            </div>
          </section>

          {/* Alternativa frågor */}
          <section className={card}>
            <div>
              <h2 className="text-lg font-bold text-navy">Hur frågar användarna?</h2>
              <p className={hint}>
                En fråga per rad, med användarnas egna ord. Ju fler varianter, desto oftare hittar sökningen rätt. Titta under
                Insikter efter frågor som inte fick svar.
              </p>
            </div>
            <textarea
              aria-label="Alternativa frågor"
              rows={8}
              className={`${area} font-mono text-sm`}
              value={g.alternativeQueries.join("\n")}
              onChange={(e) => set("alternativeQueries", e.target.value.split("\n"))}
              onBlur={() => set("alternativeQueries", g.alternativeQueries.map((q) => q.trim()).filter(Boolean))}
            />
          </section>

          {/* Relaterade */}
          <section className={card}>
            <h2 className="text-lg font-bold text-navy">Nästa steg (relaterade guider)</h2>
            <div className="flex flex-wrap gap-2">
              {g.relatedGuides.map((id) => (
                <span key={id} className="inline-flex items-center gap-1 rounded-full bg-lup-tint px-3 py-1 text-sm text-navy">
                  {allGuides.find((x) => x.id === id)?.title ?? id}
                  <button type="button" aria-label="Ta bort" onClick={() => set("relatedGuides", g.relatedGuides.filter((x) => x !== id))}>
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <select
              aria-label="Lägg till relaterad guide"
              className={input}
              value=""
              onChange={(e) => e.target.value && set("relatedGuides", [...g.relatedGuides, e.target.value].slice(0, 10))}
            >
              <option value="">+ Lägg till relaterad guide…</option>
              {allGuides
                .filter((x) => x.id !== g.id && !g.relatedGuides.includes(x.id))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
            </select>
          </section>
        </div>

        {/* Höger: skärmbild och markeringar */}
        <div className="min-w-0 space-y-6 xl:sticky xl:top-4 xl:self-start">
          <section className={card}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-navy">Skärmbild</h2>
              <label className="cursor-pointer rounded-xl border border-line px-3 py-2 text-sm font-semibold text-navy hover:border-lup">
                {uploading ? "Laddar upp…" : g.screenshot ? "Byt bild" : "Ladda upp bild"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f, (url) => set("screenshot", url));
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {g.screenshot ? (
              <HotspotCanvas
                src={g.screenshot}
                hotspots={g.hotspots}
                drawing={drawing}
                onSize={(w, h) => {
                  // Bildens storlek behövs för de inzoomade stegen; uppdateras när en ny bild laddats upp.
                  if (g.screenshotSize?.[0] !== w || g.screenshotSize?.[1] !== h) setG((prev) => ({ ...prev, screenshotSize: [w, h] }));
                }}
                onDraw={(n, rect) => {
                  set("hotspots", g.hotspots.map((h) => (h.n === n ? { ...h, ...rect } : h)));
                  setDrawing(null);
                }}
              />
            ) : (
              <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">Ingen skärmbild än.</p>
            )}
            {drawing !== null && (
              <p className="rounded-lg bg-marker-tint p-2 text-sm text-marker">
                Dra en ruta på bilden runt det som markering {drawing} ska visa. <button className="underline" onClick={() => setDrawing(null)}>Avbryt</button>
              </p>
            )}
            {g.screenshot && (
              <button type="button" className="text-xs text-muted underline" onClick={() => set("screenshot", null)}>
                Ta bort bilden
              </button>
            )}
          </section>

          <section className={card}>
            <div>
              <h2 className="text-lg font-bold text-navy">Markeringar i bilden</h2>
              <p className={hint}>Förklara vad varje markering visar. Rita gärna rutan så blir den klickbar för användaren.</p>
            </div>
            <ol className="space-y-3">
              {g.hotspots.map((h, i) => (
                <li key={i} className="space-y-1 rounded-xl border border-line p-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-marker text-xs font-bold text-white">{h.n}</span>
                    <input
                      aria-label={`Namn på markering ${h.n}`}
                      className="min-h-9 min-w-0 flex-1 rounded-lg border border-line px-2 text-sm font-semibold"
                      value={h.label}
                      placeholder="Knappens namn"
                      onChange={(e) => set("hotspots", g.hotspots.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    />
                    <button
                      type="button"
                      disabled={!g.screenshot}
                      onClick={() => setDrawing(h.n)}
                      className={`rounded-lg px-2 py-1 text-xs font-semibold ${h.x !== undefined ? "bg-emerald-50 text-emerald-700" : "bg-marker-tint text-marker"} disabled:opacity-40`}
                    >
                      {h.x !== undefined ? "✓ Ritad" : "Rita"}
                    </button>
                    <ListButtons
                      index={i}
                      length={g.hotspots.length}
                      onMove={(from, to) => set("hotspots", renumber(move(g.hotspots, from, to)))}
                      onRemove={() => set("hotspots", renumber(g.hotspots.filter((_, j) => j !== i)))}
                    />
                  </div>
                  <textarea
                    aria-label={`Förklaring markering ${h.n}`}
                    rows={1}
                    className="field-sizing-content w-full rounded-lg border border-line p-2 text-sm"
                    value={h.text}
                    placeholder="Vad gör den?"
                    onChange={(e) => set("hotspots", g.hotspots.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  />
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="rounded-xl border border-dashed border-marker px-4 py-2 text-sm font-semibold text-marker hover:bg-marker-tint"
              onClick={() => set("hotspots", [...g.hotspots, { n: g.hotspots.length + 1, label: "", text: "" } as Hotspot])}
            >
              + Lägg till markering
            </button>
          </section>

          <section className={card}>
            <h2 className="text-lg font-bold text-navy">Video (valfritt)</h2>
            <p className={hint}>Kort film, 10–60 sekunder. Visas ovanför skärmbilden.</p>
            {g.video?.url && <video src={g.video.url} controls className="w-full rounded-lg border border-line" />}
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-xl border border-line px-3 py-2 text-sm font-semibold text-navy hover:border-lup">
                {g.video?.url ? "Byt video" : "Ladda upp video"}
                <input
                  type="file"
                  accept="video/mp4,video/webm"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f, (url) => set("video", { url, startSec: g.video?.startSec }));
                    e.target.value = "";
                  }}
                />
              </label>
              {g.video?.url && (
                <>
                  <label className="text-sm">
                    Börja vid{" "}
                    <input
                      type="number"
                      min={0}
                      className="w-20 rounded-lg border border-line px-2 py-1"
                      value={g.video.startSec ?? 0}
                      onChange={(e) => set("video", { ...g.video!, startSec: Number(e.target.value) || 0 })}
                    />{" "}
                    s
                  </label>
                  <button type="button" className="text-xs text-muted underline" onClick={() => set("video", null)}>
                    Ta bort
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Fast spara-rad */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${g.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
          >
            {g.status === "published" ? "Publicerad" : "Utkast – syns inte för användare"}
          </span>
          {message && <span className={`text-sm ${message.ok ? "text-emerald-700" : "text-marker"}`}>{message.text}</span>}
          {dirty && !message && <span className="text-sm text-muted">Osparade ändringar</span>}
          <div className="ml-auto flex flex-wrap gap-2">
            {!isNew && (
              <>
                <button type="button" onClick={remove} className="min-h-11 px-3 text-sm text-muted hover:text-marker">
                  Ta bort
                </button>
                <Link href={`/admin/guides/${g.id}/preview`} target="_blank" className="flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-semibold text-navy hover:border-lup">
                  Förhandsgranska
                </Link>
              </>
            )}
            {g.status === "published" ? (
              <button type="button" disabled={saving} onClick={() => save("draft")} className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold text-navy hover:border-lup">
                Avpublicera
              </button>
            ) : (
              <button type="button" disabled={saving} onClick={() => save("published")} className="min-h-11 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800">
                Spara och publicera
              </button>
            )}
            <button type="button" disabled={saving} onClick={() => save()} className="min-h-11 rounded-xl bg-lup px-6 font-semibold text-white hover:bg-lup-dark disabled:opacity-50">
              {saving ? "Sparar…" : "Spara"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function move<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list];
  const [x] = copy.splice(from, 1);
  copy.splice(to, 0, x);
  return copy;
}

function ListButtons({ index, length, onMove, onRemove }: { index: number; length: number; onMove: (from: number, to: number) => void; onRemove: () => void }) {
  const btn = "px-1.5 py-1 text-muted hover:text-navy disabled:opacity-30";
  return (
    <div className="flex shrink-0">
      <button type="button" aria-label="Flytta upp" className={btn} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
        ↑
      </button>
      <button type="button" aria-label="Flytta ned" className={btn} disabled={index === length - 1} onClick={() => onMove(index, index + 1)}>
        ↓
      </button>
      <button type="button" aria-label="Ta bort" className={`${btn} hover:text-marker`} onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}

/** Skärmbild där admin drar en ruta för att placera en markering (koordinater i procent). */
function HotspotCanvas({
  src,
  hotspots,
  drawing,
  onDraw,
  onSize,
}: {
  src: string;
  hotspots: Hotspot[];
  drawing: number | null;
  onSize: (w: number, h: number) => void;
  onDraw: (n: number, rect: { x: number; y: number; w: number; h: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [cur, setCur] = useState<{ x: number; y: number } | null>(null);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  };
  const round = (v: number) => Math.round(v * 10) / 10;

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden rounded-xl border border-line select-none ${drawing !== null ? "cursor-crosshair ring-4 ring-marker/30" : ""}`}
      onPointerDown={(e) => {
        if (drawing === null) return;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        setStart(pos(e));
        setCur(pos(e));
      }}
      onPointerMove={(e) => start && setCur(pos(e))}
      onPointerUp={() => {
        if (drawing !== null && start && cur) {
          const x = Math.min(start.x, cur.x);
          const y = Math.min(start.y, cur.y);
          const w = Math.abs(cur.x - start.x);
          const h = Math.abs(cur.y - start.y);
          if (w > 0.5 && h > 0.5) onDraw(drawing, { x: round(x), y: round(y), w: round(w), h: round(h) });
        }
        setStart(null);
        setCur(null);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        className="block h-auto w-full"
        onLoad={(e) => onSize(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
      />
      {hotspots
        .filter((h) => h.x !== undefined)
        .map((h) => (
          <div
            key={h.n}
            className="pointer-events-none absolute rounded border-2 border-marker bg-marker/10"
            style={{ left: `${h.x}%`, top: `${h.y}%`, width: `${h.w}%`, height: `${h.h}%` }}
          >
            <span className="absolute -top-2.5 -left-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-marker text-[10px] font-bold text-white">
              {h.n}
            </span>
          </div>
        ))}
      {start && cur && (
        <div
          className="pointer-events-none absolute border-2 border-dashed border-marker bg-marker/20"
          style={{
            left: `${Math.min(start.x, cur.x)}%`,
            top: `${Math.min(start.y, cur.y)}%`,
            width: `${Math.abs(cur.x - start.x)}%`,
            height: `${Math.abs(cur.y - start.y)}%`,
          }}
        />
      )}
    </div>
  );
}
