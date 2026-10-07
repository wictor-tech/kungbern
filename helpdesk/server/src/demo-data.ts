// Fyller en DATA_DIR med SIMULERAD trafik så att analytics-sidan går att utvärdera.
// Kör mot en separat katalog:  DATA_DIR=/tmp/demo npm run demo-data && DATA_DIR=/tmp/demo PORT=8788 npm start
// Alla sessioner börjar på "demo-" så att de är lätta att känna igen.
import { randomUUID } from "node:crypto";
import { loadConfig } from "./config.js";
import { FileStore } from "./store.js";
import { SearchEngine, qualityOf } from "./search/engine.js";
import type { HelpEvent, Ticket } from "../../shared/types.js";

const cfg = loadConfig();
if (!process.env.DATA_DIR) throw new Error("Sätt DATA_DIR till en separat katalog (demo-data ska aldrig blandas med riktig data).");
const store = new FileStore(cfg);
const engine = new SearchEngine();
engine.build(store.listGuides());

// [fråga, antal, sida, andel som svarar Nej]
const TRAFFIC: [string, number, string | undefined, number][] = [
  ["Hur ändrar jag språk?", 37, "languages", 0.1],
  ["Hur lägger jag upp en bild?", 28, "images", 0.12],
  ["Byta bild", 11, "images", 0.1],
  ["Hur ändrar jag öppettider?", 22, "location-info", 0.15],
  ["Hur skickar jag ett SMS?", 19, "notifications", 0.2],
  ["ändra sms texten", 16, "sms", 0.55],
  ["Hur ändrar jag vilken port chauffören ska till?", 14, "gates", 0.4],
  ["Hur skriver jag ut QR-koder?", 9, "qr", 0.1],
  ["fler lastbilar per timme", 12, "capacity", 0.12],
  ["Hur skapar jag en bokning?", 17, undefined, 0],
  ["Hur lägger jag till en användare?", 13, undefined, 0],
  ["glömt lösenord", 6, undefined, 0],
];

const day = 86_400_000;
const rnd = (a: number) => Math.floor(Math.random() * a);
const events: HelpEvent[] = [];
const tickets: Ticket[] = [];
for (const [q, count, page, noRate] of TRAFFIC) {
  for (let i = 0; i < count; i++) {
    const ts = new Date(Date.now() - rnd(28 * day) - rnd(day)).toISOString();
    const sessionId = "demo-" + randomUUID().slice(0, 8);
    const hit = engine.search(q, { page })[0];
    const quality = hit ? qualityOf(hit.score) : "none";
    const queryId = randomUUID();
    const guideId = quality !== "none" ? hit?.guide.id : undefined;
    events.push({ id: randomUUID(), ts, type: "ask", queryId, sessionId, q, lang: "sv", page, guideId, quality, confidence: hit?.score });
    if (quality === "good") {
      events.push({ id: randomUUID(), ts, type: "view", queryId, sessionId, guideId, page });
      if (Math.random() < 0.7) {
        const no = Math.random() < noRate;
        events.push({ id: randomUUID(), ts, type: "feedback", queryId, sessionId, q, guideId, helped: !no, page, lang: "sv" });
        if (no && Math.random() < 0.5) tickets.push({ id: "T-" + randomUUID().slice(0, 6).toUpperCase(), createdAt: ts, status: "open", question: q, guideId, guideTitle: hit!.guide.title, page, stepsViewed: [0, 1], comment: "Hittar inte knappen", lang: "sv", deflectable: true });
      }
    } else if (Math.random() < 0.3) {
      tickets.push({ id: "T-" + randomUUID().slice(0, 6).toUpperCase(), createdAt: ts, status: Math.random() < 0.5 ? "closed" : "open", question: q, stepsViewed: [], lang: "sv", deflectable: false });
    }
  }
}
events.sort((a, b) => a.ts.localeCompare(b.ts)).forEach((e) => store.addEvent(e));
tickets.forEach((t) => store.saveTicket(t));
store.flush();
console.log(`Skapade ${events.length} simulerade händelser och ${tickets.length} supportärenden i ${cfg.dataDir}`);
