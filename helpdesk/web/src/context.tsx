import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LANGS, type Lang } from "../../shared/types";
import { api, type Config } from "./api";
import { STRINGS, detectLang, type Strings } from "./i18n";

const PAGE_LABELS: Record<string, Partial<Record<Lang, string>>> = {
  start: { sv: "Startsidan (kartan)", en: "Start page (map)" },
  languages: { sv: "Språkhantering", en: "Language management" },
  "location-info": { sv: "Ändra platsinformation", en: "Edit location" },
  images: { sv: "Bildhantering", en: "Image management" },
  slideshow: { sv: "Konfigurera bildspel", en: "Configure slideshow" },
  "form-fields": { sv: "Formulärfält", en: "Form fields" },
  quiz: { sv: "Kontrollfrågor", en: "Control questions" },
  qr: { sv: "QR-koder", en: "QR codes" },
  preapproved: { sv: "Tillåten incheckning", en: "Allowed check-in" },
  capacity: { sv: "Hantera kapacitet", en: "Manage capacity" },
  gates: { sv: "Hantera grindar", en: "Manage gates" },
  notifications: { sv: "Aviseringsinställningar", en: "Notification settings" },
  sms: { sv: "SMS-mallar", en: "SMS templates" },
  structure: { sv: "Ändra struktur", en: "Edit structure" },
  reports: { sv: "Rapporter", en: "Reports" },
  deviations: { sv: "Avvikelserapporter", en: "Deviation reports" },
};
export const pageLabel = (key: string, lang: Lang) =>
  PAGE_LABELS[key]?.[lang] ?? PAGE_LABELS[key]?.en ?? PAGE_LABELS[key]?.sv ?? key.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Strings;
  config: Config | null;
  /** Sidan i programmet som användaren står på (från värdappen). */
  page?: string;
  role?: string;
  embedded: boolean;
  sessionId: string;
  catLabel: (id: string) => string;
  catIcon: (id: string) => string;
  /** Skicka kommando till värdappen (t.ex. starta walkthrough). */
  toHost: (msg: Record<string, unknown>) => void;
}
const C = createContext<Ctx>(null as unknown as Ctx);
export const useHelp = () => useContext(C);

function sid() {
  try {
    let s = sessionStorage.getItem("lup-help-sid");
    if (!s) { s = crypto.randomUUID(); sessionStorage.setItem("lup-help-sid", s); }
    return s;
  } catch { return crypto.randomUUID(); }
}

export function HelpProvider({ children }: { children: ReactNode }) {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const urlLang = params.get("lang");
  const [lang, setLangState] = useState<Lang>(() => ((LANGS as readonly string[]).includes(urlLang ?? "") ? (urlLang as Lang) : detectLang()));
  const [config, setConfig] = useState<Config | null>(null);
  const [page, setPage] = useState<string | undefined>(params.get("page")?.slice(0, 60) || undefined);
  const [role, setRole] = useState<string | undefined>(params.get("role")?.slice(0, 40) || undefined);
  const embedded = params.get("embed") === "1" || window.parent !== window;
  const [sessionId] = useState(sid);

  useEffect(() => { api.config().then(setConfig).catch(() => {}); }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  // Kontext från värdappen (embed.js): { type: "lup-help:context", page, role, lang }
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window.parent || window.parent === window) return;
      const d = e.data;
      if (!d || d.type !== "lup-help:context") return;
      if (typeof d.page === "string") setPage(d.page.slice(0, 60) || undefined);
      if (typeof d.role === "string") setRole(d.role.slice(0, 40) || undefined);
      if ((LANGS as readonly string[]).includes(d.lang)) setLangState(d.lang);
    };
    window.addEventListener("message", onMsg);
    if (window.parent !== window) window.parent.postMessage({ type: "lup-help:ready" }, "*");
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("lup-help-lang", l); } catch { /* */ }
  }, []);
  const toHost = useCallback((msg: Record<string, unknown>) => { if (window.parent !== window) window.parent.postMessage({ source: "lup-help", ...msg }, "*"); }, []);

  const value: Ctx = {
    lang, setLang, t: STRINGS[lang], config, page, role, embedded, sessionId, toHost,
    catLabel: (id) => config?.categories.find((c) => c.id === id)?.labels[lang] ?? config?.categories.find((c) => c.id === id)?.labels.sv ?? id,
    catIcon: (id) => config?.categories.find((c) => c.id === id)?.icon ?? "📄",
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
