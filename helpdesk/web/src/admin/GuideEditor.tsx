import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LANGS, LANG_NAMES, type Guide, type Lang, type Step } from "../../../shared/types";
import { api, type AdminGuideRow, type Config } from "../api";
import { Markup } from "../components/Markup";
import { StepViewer } from "../components/StepViewer";
import { Where } from "../components/Where";
import { HotspotEditor } from "./HotspotEditor";
import { ago } from "./GuideList";
import { DRAFT_KEY } from "./AiDraftModal";

const uid = () => Math.random().toString(36).slice(2, 10);
const blank = (): Guide => ({
  id: "", status: "draft", title: "", summary: "", category: "start", altQueries: [], steps: [{ id: uid(), text: "" }], pageKeys: [], roles: [],
  lang: "sv", translations: {}, related: [], createdAt: "", updatedAt: "",
});

function Tags({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [txt, setTxt] = useState("");
  const add = () => { const v = txt.trim(); if (v && !value.includes(v)) onChange([...value, v]); setTxt(""); };
  return (
    <div>
      <div className="tags">{value.map((v) => <span key={v} className="tag">{v}<button type="button" aria-label={`Ta bort ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>×</button></span>)}</div>
      <input value={txt} placeholder={placeholder} onChange={(e) => setTxt(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} onBlur={add} />
    </div>
  );
}

function ImageField({ step, onChange }: { step: Step; onChange: (s: Step) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const upload = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try { const url = await api.admin.upload(f); onChange({ ...step, image: url, hotspot: undefined, focus: undefined, annotated: false }); }
    catch (e) { alert((e as Error).message); }
    setBusy(false);
  };
  if (step.image) {
    return (
      <div>
        <HotspotEditor src={step.image} value={step.hotspot} onChange={(h) => onChange({ ...step, hotspot: h })} onRatio={(r) => !step.ratio && onChange({ ...step, ratio: r })} />
        <div className="row">
          <button type="button" className="btn small" onClick={() => input.current?.click()}>Byt bild</button>
          <button type="button" className="btn small ghost danger" onClick={() => onChange({ ...step, image: undefined, hotspot: undefined, focus: undefined, annotated: false })}>Ta bort bild</button>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </div>
      </div>
    );
  }
  return (
    <div className={over ? "drop over" : "drop"} onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files[0]); }}>
      {busy ? "Laddar upp…" : "＋ Skärmbild: dra hit, klistra in (Ctrl+V) eller klicka"}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => upload(e.target.files?.[0])} />
    </div>
  );
}

function Translations({ g, set, config }: { g: Guide; set: (g: Guide) => void; config: Config | null }) {
  const [lang, setLang] = useState<Lang>("en");
  const [busy, setBusy] = useState(false);
  const tr = g.translations[lang];
  const upd = (patch: Partial<NonNullable<typeof tr>>) =>
    set({ ...g, translations: { ...g.translations, [lang]: { title: "", summary: "", steps: {}, ...tr, ...patch, auto: false, updatedAt: new Date().toISOString() } } });
  return (
    <section className="panel">
      <h3>Språk</h3>
      <p className="muted small">Guiden skrivs på {LANG_NAMES[g.lang]}. Andra språk kan översättas av AI och granskas här. Användare kan också fråga på sitt eget språk.</p>
      <div className="chips">
        {LANGS.filter((l) => l !== g.lang).map((l) => <button key={l} type="button" className={l === lang ? "chip on" : "chip"} onClick={() => setLang(l)}>{LANG_NAMES[l]}{g.translations[l] ? (g.translations[l]!.auto ? " 🌐" : " ✓") : ""}</button>)}
      </div>
      <div className="row" style={{ alignItems: "center" }}>
        <button type="button" className="btn small" disabled={busy || !g.id || !config?.aiEnabled} title={!g.id ? "Spara guiden först" : !config?.aiEnabled ? "Kräver ANTHROPIC_API_KEY" : ""}
          onClick={async () => { setBusy(true); try { const saved = await api.admin.translate(g.id, lang); set({ ...g, translations: saved.translations }); } catch (e) { alert((e as Error).message); } setBusy(false); }}>
          🌐 Översätt till {LANG_NAMES[lang]} med AI
        </button>
        {tr?.auto && <span className="pill warn">Maskinöversatt – granska</span>}
        {tr && !tr.auto && <span className="pill pub">Granskad</span>}
      </div>
      <label>Titel<input value={tr?.title ?? ""} onChange={(e) => upd({ title: e.target.value })} /></label>
      <label>Kort svar<input value={tr?.summary ?? ""} onChange={(e) => upd({ summary: e.target.value })} /></label>
      {g.steps.map((s, i) => (
        <label key={s.id}>Steg {i + 1} <span className="muted" style={{ fontWeight: 400 }}>– {s.text.replace(/\*\*/g, "").slice(0, 60)}</span>
          <input value={tr?.steps[s.id] ?? ""} onChange={(e) => upd({ steps: { ...(tr?.steps ?? {}), [s.id]: e.target.value } })} />
        </label>
      ))}
      {g.tip && <label>Tips<input value={tr?.tip ?? ""} onChange={(e) => upd({ tip: e.target.value })} /></label>}
      {g.warning && <label>Varning<input value={tr?.warning ?? ""} onChange={(e) => upd({ warning: e.target.value })} /></label>}
    </section>
  );
}

export function GuideEditor() {
  const { id = "new" } = useParams();
  const nav = useNavigate();
  const isNew = id === "new";
  const [g, setG] = useState<Guide | null>(null);
  const [saved, setSaved] = useState("");
  const [config, setConfig] = useState<Config | null>(null);
  const [others, setOthers] = useState<AdminGuideRow[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => { api.config().then(setConfig); api.admin.guides().then(setOthers); }, []);
  useEffect(() => {
    if (isNew) {
      let base = blank();
      try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (raw) { const d = JSON.parse(raw); base = { ...base, ...d.guide, id: "" }; setNotes(d.notes ?? []); sessionStorage.removeItem(DRAFT_KEY); }
      } catch { /* */ }
      setG(base); setSaved("");
    } else {
      api.admin.guide(id).then((x) => { setG(x); setSaved(JSON.stringify(x)); }).catch((e) => setMsg(e.message));
    }
  }, [id, isNew]);

  const dirty = g !== null && JSON.stringify(g) !== saved;
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };
  const save = useCallback(async (status?: Guide["status"]) => {
    if (!g) return;
    const body = { ...g, status: status ?? g.status };
    if (body.status === "published") {
      if (!body.title.trim() || !body.summary.trim() || !body.steps.some((s) => s.text.trim())) { flash("Fyll i titel, kort svar och minst ett steg innan publicering."); return; }
    }
    try {
      const out = isNew ? await api.admin.create(body) : await api.admin.save(body);
      setG(out); setSaved(JSON.stringify(out));
      flash(out.status === "published" ? "Sparad och publicerad ✓" : "Sparad som utkast ✓");
      if (isNew) nav(`/admin/guides/${out.id}`, { replace: true });
    } catch (e) { flash((e as Error).message); }
  }, [g, isNew, nav]);

  // Klistra in en skärmbild var som helst → nytt steg med bilden
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (!f || !g) return;
      e.preventDefault();
      try { const url = await api.admin.upload(f); setG((cur) => cur && { ...cur, steps: [...cur.steps.filter((s) => s.text || s.image), { id: uid(), text: "", image: url }] }); flash("Skärmbild tillagd som nytt steg"); } catch (er) { flash((er as Error).message); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [g]);

  const set = (patch: Partial<Guide>) => setG((cur) => cur && { ...cur, ...patch });
  const setStep = (i: number, s: Step) => g && set({ steps: g.steps.map((x, j) => (j === i ? s : x)) });
  const move = (i: number, d: number) => { if (!g) return; const a = [...g.steps]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set({ steps: a }); };

  const preview = useMemo(() => g?.steps.filter((s) => s.text || s.image), [g?.steps]);
  if (!g) return <p className="muted">{msg || "Laddar…"}</p>;

  return (
    <>
      <div className="editor-bar">
        <div>
          <strong>{g.title || "Ny guide"}</strong>{" "}
          <span className={g.status === "published" ? "pill pub" : "pill"}>{g.status === "published" ? "Publicerad" : "Utkast"}</span>{" "}
          {dirty && <span className="pill warn">Osparade ändringar</span>}
          {g.updatedAt && <div className="muted small">Senast uppdaterad {ago(g.updatedAt)} ({new Date(g.updatedAt).toLocaleString("sv-SE")})</div>}
        </div>
        <div className="row" style={{ margin: 0, flex: "0 0 auto" }}>
          {!isNew && g.status === "published" && <a className="btn small ghost" href={`/g/${g.id}`} target="_blank" rel="noreferrer">Visa ↗</a>}
          <button className="btn small" onClick={() => save(g.status === "published" ? "published" : "draft")} disabled={!dirty && !isNew}>Spara</button>
          {g.status === "published"
            ? <button className="btn small ghost" onClick={() => save("draft")}>Avpublicera</button>
            : <button className="btn small primary" onClick={() => save("published")}>Publicera</button>}
          {!isNew && <button className="btn small ghost danger" onClick={async () => { if (confirm(`Ta bort "${g.title}" permanent?`)) { await api.admin.remove(g.id); nav("/admin"); } }}>Ta bort</button>}
        </div>
      </div>
      {msg && <div className="toast" role="status">{msg}</div>}
      {g.todo && <div className="note warn" style={{ marginBottom: 14 }}><strong>📝 Behöver innehåll</strong><p>{g.todo}</p></div>}
      {notes.length > 0 && <div className="note tip" style={{ marginBottom: 14 }}><strong>✨ AI-förslag – granska och justera</strong>{notes.map((n, i) => <p key={i}>Bild {i + 1}: {n}</p>)}</div>}

      <div className="editor">
        <div>
          <section className="panel">
            <h3>Grund</h3>
            <label>Titel (vad användaren vill göra)<input value={g.title} onChange={(e) => set({ title: e.target.value })} placeholder="Lägg till en bild i bildspelet" /></label>
            <label>Kort svar (en mening)<input value={g.summary} onChange={(e) => set({ summary: e.target.value })} placeholder="Dra in bilden i Bildhantering och spara." /></label>
            <div className="grid2">
              <label>Kategori
                <select value={g.category} onChange={(e) => set({ category: e.target.value })}>
                  {config?.categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.labels.sv}</option>)}
                </select>
              </label>
              <label>Sida/funktion i programmet (för kontextmedveten hjälp)
                <Tags value={g.pageKeys} onChange={(v) => set({ pageKeys: v })} placeholder="t.ex. slideshow – Enter" />
              </label>
            </div>
          </section>

          <section className="panel">
            <h3>Alternativa frågor</h3>
            <p className="muted small">Hur skulle en användare som inte kan funktionens namn fråga? Fler varianter = bättre träffar. Ingen exakt matchning krävs.</p>
            <Tags value={g.altQueries} onChange={(v) => set({ altQueries: v })} placeholder="Skriv en fråga och tryck Enter" />
            <div className="row" style={{ alignItems: "center" }}>
              <button type="button" className="btn small" disabled={suggesting || !g.title} onClick={async () => { setSuggesting(true); try { const r = await api.admin.suggestQueries(g); set({ altQueries: [...new Set([...g.altQueries, ...r.queries])] }); } catch (e) { flash((e as Error).message); } setSuggesting(false); }}>✨ Föreslå frågor</button>
              {g.altQueries.length < 5 && <span className="muted small">Tips: minst 5 varianter ger bra träffar.</span>}
            </div>
          </section>

          <section className="panel">
            <h3>Steg</h3>
            {g.steps.map((s, i) => (
              <div key={s.id} className="step-edit">
                <div className="head">
                  <span className="badge">{i + 1}</span>
                  <input value={s.text} onChange={(e) => setStep(i, { ...s, text: e.target.value })} placeholder="Klicka på **Lägg till bild**" aria-label={`Steg ${i + 1}`} />
                  <button type="button" className="btn small mini" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Flytta upp">↑</button>
                  <button type="button" className="btn small mini" onClick={() => move(i, 1)} disabled={i === g.steps.length - 1} aria-label="Flytta ner">↓</button>
                  <button type="button" className="btn small mini ghost danger" onClick={() => set({ steps: g.steps.filter((_, j) => j !== i) })} aria-label="Ta bort steg">🗑</button>
                </div>
                <ImageField step={s} onChange={(x) => setStep(i, x)} />
                {s.annotated && <span className="muted small">Bilden har redan inritade markeringar (importerad). Zoomen följer markeringen.</span>}
              </div>
            ))}
            <button type="button" className="btn" onClick={() => set({ steps: [...g.steps, { id: uid(), text: "" }] })}>＋ Lägg till steg</button>
            <p className="muted small">Tips: använd **fet text** för knappnamn. Klistra in en skärmbild (Ctrl+V) var som helst för att skapa ett nytt steg.</p>
          </section>

          <section className="panel">
            <h3>Så hittar du hit (valfritt)</h3>
            <p className="muted small">Var i programmet funktionen ligger. Visas som en kompakt rad med liten bild i stället för ett eget steg – så börjar guiden direkt med uppgiften.</p>
            <Tags value={g.location?.path ?? []} onChange={(v) => set({ location: v.length ? { ...g.location, path: v } : undefined })} placeholder="t.ex. Platsmenyn – Enter, sedan Hantera kapacitet" />
            {g.location && (
              <ImageField
                step={{ id: "loc", text: "", image: g.location.image, hotspot: g.location.hotspot, ratio: g.location.ratio }}
                onChange={(x) => set({ location: { ...g.location!, image: x.image, hotspot: x.hotspot, ratio: x.ratio } })}
              />
            )}
          </section>

          <section className="panel">
            <h3>Video (valfritt)</h3>
            <p className="muted small">10–60 sekunder. Videon startar direkt på rätt del. Saknas video visas skärmbilder och steg.</p>
            <label>Ladda upp (mp4/webm)<input type="file" accept="video/mp4,video/webm" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { flash("Laddar upp video…"); const url = await api.admin.upload(f); set({ video: { ...g.video, url } }); flash("Video uppladdad"); } catch (er) { flash((er as Error).message); } }} /></label>
            <label>…eller länk (egen fil, YouTube eller Loom)<input value={g.video?.url ?? ""} onChange={(e) => set({ video: e.target.value ? { ...g.video, url: e.target.value } : undefined })} placeholder="https://" /></label>
            {g.video && (
              <div className="grid2">
                <label>Starta vid (sek)<input type="number" min={0} value={g.video.start ?? ""} onChange={(e) => set({ video: { ...g.video!, start: e.target.value ? Number(e.target.value) : undefined } })} /></label>
                <label>Sluta vid (sek)<input type="number" min={0} value={g.video.end ?? ""} onChange={(e) => set({ video: { ...g.video!, end: e.target.value ? Number(e.target.value) : undefined } })} /></label>
              </div>
            )}
          </section>

          <section className="panel">
            <h3>Tips och varning</h3>
            <label>Tips<input value={g.tip ?? ""} onChange={(e) => set({ tip: e.target.value || undefined })} /></label>
            <label>Varning<input value={g.warning ?? ""} onChange={(e) => set({ warning: e.target.value || undefined })} /></label>
          </section>

          <section className="panel">
            <h3>Relaterade guider</h3>
            <div className="chips">
              {others.filter((o) => o.id !== g.id).map((o) => (
                <button type="button" key={o.id} className={g.related.includes(o.id) ? "chip on" : "chip"} onClick={() => set({ related: g.related.includes(o.id) ? g.related.filter((r) => r !== o.id) : [...g.related, o.id] })}>{o.title}</button>
              ))}
            </div>
          </section>

          <Translations g={g} set={setG as (g: Guide) => void} config={config} />

          <details className="panel">
            <summary><strong>Interaktiv walkthrough (avancerat)</strong></summary>
            <p className="muted small">Markerar knappar direkt i programmet. Kräver att elementen har <code>data-help="namn"</code>. Selektor: t.ex. <code>[data-help='menu-capacity']</code>.</p>
            {(g.walkthrough ?? []).map((w, i) => (
              <div key={i} className="step-edit">
                <div className="grid2">
                  <input value={w.selector} placeholder="[data-help='…']" onChange={(e) => set({ walkthrough: g.walkthrough!.map((x, j) => (j === i ? { ...x, selector: e.target.value } : x)) })} />
                  <select value={w.advanceOn} onChange={(e) => set({ walkthrough: g.walkthrough!.map((x, j) => (j === i ? { ...x, advanceOn: e.target.value as typeof w.advanceOn } : x)) })}>
                    <option value="click">Går vidare när användaren klickar</option><option value="input">…skriver</option><option value="next">…trycker Nästa</option>
                  </select>
                </div>
                <div className="head"><input value={w.text} placeholder="Klicka här" onChange={(e) => set({ walkthrough: g.walkthrough!.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} /><button type="button" className="btn small ghost danger" onClick={() => set({ walkthrough: g.walkthrough!.filter((_, j) => j !== i) })}>🗑</button></div>
              </div>
            ))}
            <button type="button" className="btn small" onClick={() => set({ walkthrough: [...(g.walkthrough ?? []), { selector: "", text: "", advanceOn: "click" }] })}>＋ Walkthrough-steg</button>
          </details>
        </div>

        <aside className="preview">
          <h3 className="section-title">Förhandsvisning (som användaren ser den)</h3>
          <div className="card guide">
            <header><h1>{g.title || "Titel"}</h1><p className="short">{g.summary || "Kort svar visas här."}</p></header>
            {g.location && <Where location={g.location} />}
            {preview && preview.length > 0 && <StepViewer steps={preview} />}
            {g.warning && <aside className="note warn"><strong>⚠ Var försiktig</strong><p><Markup text={g.warning} /></p></aside>}
            {g.tip && <aside className="note tip"><strong>💡 Tips</strong><p><Markup text={g.tip} /></p></aside>}
          </div>
        </aside>
      </div>
    </>
  );
}
