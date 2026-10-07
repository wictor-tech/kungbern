/**
 * Svensk textbehandling för sökningen: normalisering, fraser, stoppord, enkel stemming och synonymer.
 * Målet är att "Hur laddar jag upp foto?", "byta bild" och "ny bild på skärmen" ska landa på samma guide,
 * och att produktens engelska ord (Loading bay, Slideshow …) matchar användarens svenska ord.
 */

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[éè]/g, "e")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Flerordsuttryck som betyder en sak. Körs på normaliserad text innan ordsplittring. */
const PHRASES: [RegExp, string][] = [
  [/\b(checka|checkar|checkade|checkat) ut\b/g, "checkout"],
  [/\b(checka|checkar|checkade|checkat|check) in\b/g, "checkin"],
  [/\b(kalla|kallar|kallade|ropa|ropar) in\b/g, "callin"],
  [/\bcall in\b/g, "callin"],
  [/\b(ladda|laddar|laddade|lagga|lagger|la) upp\b/g, "upload"],
  [/\b(ladda|laddar) (ner|ned)\b/g, "download"],
  [/\b(skriva|skriver|skriv) ut\b/g, "print"],
  [/\b(ta|tar|tog) bort\b/g, "delete"],
  [/\b(lagga|lagger|lagg|la) (till|in)\b/g, "add"],
  [/\b(stang|stanga|stanger|stangt) av\b/g, "turnoff"],
  [/\bqr ?kod(er|en|erna)?\b/g, "qr"],
  [/\brod(a)? dag(ar|arna)?\b/g, "helgdag"],
  [/\bloading bay(s)?\b/g, "brygga"],
  [/\bopening hours\b/g, "oppettid"],
  [/\bsms et\b/g, "sms"],
  // Vanliga problemformuleringar
  [/\b(kan|gar|gick|far) (inte|ej) (att )?boka\b|\bingen kan boka\b|\binga (lediga )?tider\b/g, "bokningsproblem"],
  // "logga ut/in" handlar om konton, inte om logotypen
  [/\blogg(a|ar|ade|at) (ut|in)\b/g, "inloggning"],
  [/\b(igar|gardagens|forrgar)\b/g, "tidigare"],
  // "användare" och "används" får annars samma ordstam.
  [/\banvandar(e|en|na|nas|es)?\b/g, "anvandarkonto"],
  [/\b(i (gar|forrgar|mandags|tisdags|onsdags|torsdags|fredags|lordags|sondags)|forra veckan|forra manaden)\b/g, "tidigare"],
  [/\bvem (var|har varit|kom|besokte)\b/g, "vem besokte"],
];

const STOPWORDS = new Set(
  (
    "hur jag vi man en ett den det de dem att och i pa for till av med som ar kan vill ska skall gor gora gjorde " +
    "min mitt mina var vart vad vilken vilket vilka har hos om eller sa mig dig sig ut in upp ner ned under fran efter " +
    "nagon nagot nagra sin sitt sina era er ni du han hon hen dom fa far fick bara ocksa aven nu da nar dar varfor " +
    "behover behova vill ville kunna ma mar fel ratt the a an to of in on for my how do i can is it at this that please tack hej"
  ).split(" "),
);

/** Ord som syftar på "det jag tittar på nu" – då väger sidkontexten tyngre. */
const DEICTIC = new Set(["detta", "denna", "det har", "har", "sidan", "sida", "den har", "this", "here"]);

const SUFFIXES = [
  "heterna", "arnas", "ernas", "ornas", "andet", "heten", "heter", "arna", "erna", "orna", "ande", "ende",
  "ade", "are", "ast", "het", "en", "et", "er", "ar", "or", "na", "s", "a", "e",
];

export function stem(w: string): string {
  if (w.length <= 3 || /\d/.test(w)) return w;
  for (const suf of SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) return w.slice(0, -suf.length);
  }
  return w;
}

/**
 * Synonymgrupper. Första ordet är kanoniskt. Alla ord stemmas när tabellen byggs,
 * så böjningar (bilder, bilden, bilderna) behöver inte listas.
 */
const SYNONYM_GROUPS: string[][] = [
  ["bild", "foto", "fotografi", "image", "picture", "pic", "bildfil", "jpg", "png"],
  ["bildspel", "slideshow", "skarm", "tv", "display", "monitor", "visning"],
  ["upload", "uppladdning", "ladda"],
  ["forare", "chauffor", "chauffer", "chaffis", "driver", "lastbilsforare", "chaufor", "forar"],
  ["fordon", "lastbil", "bil", "truck", "vehicle", "ekipage", "trailer", "bilar"],
  ["brygga", "lastbrygga", "port", "kaj", "lastkaj", "dock", "bay", "portar", "lastport", "ramp"],
  ["grind", "bom", "barrier", "gate", "grindar", "infart", "utfart"],
  ["sms", "textmeddelande", "sm", "smsa", "sms:a", "textmeddelanden"],
  ["anvandarkonto", "konto", "inloggning", "login"],
  ["losenord", "password"],
  ["bokning", "boka", "booking", "bokad", "tidsbokning", "reservation", "boking", "bokningar", "bokat"],
  ["kapacitet", "capacity"],
  ["oppettid", "oppettider", "oppet", "oppna", "oppnar", "opening"],
  ["stang", "stangt", "stangd", "stanga", "closed", "stanger"],
  ["sprak", "language", "oversattning", "oversatta", "engelska", "polska", "tyska", "danska", "norska", "finska", "franska", "nederlandska", "spanska"],
  ["callin", "inkallning", "inkalla"],
  ["checkout", "utcheckning", "utcheck"],
  ["checkin", "incheckning", "incheck"],
  ["avisering", "notis", "notifiering", "notification", "notifikation", "aviser", "underrattelse"],
  ["epost", "mejl", "mail", "email", "e"],
  ["larm", "alert", "ljud", "pling", "signal", "alarm"],
  ["rapport", "report", "reports"],
  ["statistik", "statistics", "nyckeltal", "kpi"],
  ["avvikelse", "deviation", "avvikelserapport", "incident"],
  ["export", "exportera", "excel", "xlsx"],
  ["video", "film", "movie", "klipp"],
  ["dokument", "pdf", "document"],
  ["kontaktperson", "kontakt", "contact", "mottagare"],
  ["falt", "field", "formular", "form", "formfalt"],
  ["checklista", "kontrollfraga", "checklist", "kontrollfragor"],
  ["struktur", "structure", "underplats", "sublocation", "niva"],
  ["ko", "queue", "koa", "kon"],
  ["vecka", "week", "veckovy"],
  ["tidslucka", "timeslot", "slot", "lucka", "tidsluckor"],
  ["andra", "byta", "byt", "uppdatera", "redigera", "edit", "change", "justera", "modifiera"],
  ["delete", "radera", "tabort"],
  ["add", "skapa", "ny", "nytt", "nya", "create", "lagga", "lagg"],
  ["helgdag", "holiday", "julafton", "midsommar", "jul", "pask", "semester"],
  ["print", "utskrift", "skriva"],
  ["download", "nedladdning"],
  ["registreringsnummer", "regnr", "regnummer", "plate", "registrering", "nummerplat"],
  ["signatur", "signature", "signera", "underskrift"],
  ["omrade", "area", "anlaggning", "platsen", "site"],
  ["logotyp", "logga", "logo"],
  ["adress", "address", "koordinat", "karta", "kartan", "kartnal"],
  ["sok", "soka", "search", "hitta", "filtrera", "filter"],
  ["tillat", "tillaten", "tillatna", "allowed", "godkand", "forhandsgodkann", "vitlista"],
  ["mall", "template", "standardtext"],
];

const SYNONYMS = new Map<string, string>();
for (const group of SYNONYM_GROUPS) {
  const canon = stem(normalize(group[0]).replace(/ /g, ""));
  for (const w of group) {
    const key = stem(normalize(w).replace(/ /g, ""));
    if (!SYNONYMS.has(key)) SYNONYMS.set(key, canon);
  }
}

function applyPhrases(s: string): string {
  // Frågeordföljd: "loggar jag ut", "checkar vi in" → "loggar ut", "checkar in".
  let out = s.replace(/\b(\w+) (jag|vi|man|du|ni|hen|han|hon|den|det) (ut|in|upp|till|bort|ner|ned|av)\b/g, "$1 $3");
  for (const [re, rep] of PHRASES) out = out.replace(re, rep);
  return out;
}

/** Text → lista av kanoniska termer (för index och fråga). */
/** Alla ord som synonymtabellen känner till (för stavfelsrättning), med sitt kanoniska ord. */
export function synonymEntries(): [string, string][] {
  return [...SYNONYMS.entries()];
}

export function terms(s: string): string[] {
  const words = applyPhrases(normalize(s)).split(" ").filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    const st = stem(w);
    // Böjda former kan behöva kortas två gånger för att hitta synonymen ("chauffören" → "chauffor" → "chauff").
    out.push(SYNONYMS.get(st) ?? SYNONYMS.get(w) ?? SYNONYMS.get(stem(st)) ?? st);
  }
  return out;
}

export function isDeictic(s: string): boolean {
  const n = normalize(s);
  for (const d of DEICTIC) if (new RegExp(`\\b${d}\\b`).test(n)) return true;
  return false;
}

export function levenshtein(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
