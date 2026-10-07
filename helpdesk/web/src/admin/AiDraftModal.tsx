import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export const DRAFT_KEY = "lup-help-draft";

/** "Skapa en guide för hur man laddar upp en bild" + valfria skärmbilder → första förslaget i editorn. */
export function AiDraftModal({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const [prompt, setPrompt] = useState(() => { try { const p = sessionStorage.getItem("lup-help-ai-prompt"); sessionStorage.removeItem("lup-help-ai-prompt"); return p ?? ""; } catch { return ""; } });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => { const fs = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/")); if (fs.length) setFiles((x) => [...x, ...fs].slice(0, 8)); };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="AI-skapa guide">
        <h2>✨ Skapa guide med AI</h2>
        <p className="muted small">Beskriv vad guiden ska visa och/eller klistra in skärmbilder (Ctrl+V). AI föreslår titel, steg, knappar att markera och vanliga frågor. Du redigerar innan något publiceras.</p>
        <label>Vad ska guiden handla om?
          <textarea rows={3} autoFocus value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Skapa en guide för hur man laddar upp en bild." />
        </label>
        <div className="drop" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setFiles((x) => [...x, ...[...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"))].slice(0, 8)); }} style={{ marginTop: 12 }}>
          Dra in skärmbilder, klistra in eller klicka för att välja
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => setFiles((x) => [...x, ...(e.target.files ? [...e.target.files] : [])].slice(0, 8))} />
        </div>
        {files.length > 0 && <div className="thumbs">{files.map((f, i) => <img key={i} src={URL.createObjectURL(f)} alt={f.name} onClick={() => setFiles(files.filter((_, j) => j !== i))} title="Klicka för att ta bort" />)}</div>}
        {err && <p className="error">{err}</p>}
        <div className="row">
          <button className="btn primary" disabled={busy || (!prompt.trim() && !files.length)} onClick={async () => {
            setBusy(true); setErr("");
            try {
              const urls = await Promise.all(files.map((f) => api.admin.upload(f)));
              const r = await api.admin.draft(prompt, urls);
              // Rita upp bildernas storlek så att steg kan zooma rätt direkt.
              const withRatio = await Promise.all(r.draft.steps.map(async (s) => s.image ? { ...s, ratio: await new Promise<number>((res) => { const i = new Image(); i.onload = () => res(i.naturalWidth / i.naturalHeight); i.onerror = () => res(1.6); i.src = s.image!; }) } : s));
              sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ guide: { ...r.draft, steps: withRatio }, notes: r.imageNotes, provider: r.provider }));
              onClose(); nav("/admin/guides/new");
            } catch (e) { setErr((e as Error).message); setBusy(false); }
          }}>{busy ? "AI jobbar…" : "Skapa förslag"}</button>
          <button className="btn ghost" onClick={onClose}>Avbryt</button>
        </div>
      </div>
    </div>
  );
}
