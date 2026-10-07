import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync, copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Guide, HelpEvent, Ticket } from "../../shared/types.js";
import type { Config } from "./config.js";
import { seedGuides } from "./seed/guides.js";

/**
 * Lagring bakom ett litet gränssnitt. MVP:n använder JSON-filer (noll drift, noll kostnad).
 * Byt ut klassen mot Postgres/SQLite när volymen kräver det – resten av koden berörs inte.
 */
export interface Store {
  listGuides(): Guide[];
  getGuide(id: string): Guide | undefined;
  saveGuide(g: Guide): void;
  deleteGuide(id: string): boolean;
  listTickets(): Ticket[];
  saveTicket(t: Ticket): void;
  listEvents(): HelpEvent[];
  addEvent(e: HelpEvent): void;
  flush(): void;
}

interface Db { guides: Guide[]; tickets: Ticket[] }

export class FileStore implements Store {
  private guides = new Map<string, Guide>();
  private tickets: Ticket[] = [];
  private events: HelpEvent[] = [];
  private dbFile: string;
  private eventsFile: string;
  private timer?: NodeJS.Timeout;

  constructor(private cfg: Config) {
    mkdirSync(cfg.dataDir, { recursive: true });
    mkdirSync(cfg.uploadDir, { recursive: true });
    this.dbFile = join(cfg.dataDir, "db.json");
    this.eventsFile = join(cfg.dataDir, "events.jsonl");
    if (existsSync(this.dbFile)) {
      const db = JSON.parse(readFileSync(this.dbFile, "utf8")) as Db;
      db.guides.forEach((g) => this.guides.set(g.id, g));
      this.tickets = db.tickets ?? [];
    } else {
      seedGuides().forEach((g) => this.guides.set(g.id, g));
      this.writeNow();
    }
    if (existsSync(this.eventsFile)) {
      for (const line of readFileSync(this.eventsFile, "utf8").split("\n")) {
        if (line.trim()) try { this.events.push(JSON.parse(line)); } catch { /* hoppa över trasig rad */ }
      }
    }
    this.copySeedMedia();
  }

  private copySeedMedia() {
    if (!existsSync(this.cfg.seedMediaDir)) return;
    for (const f of readdirSync(this.cfg.seedMediaDir)) {
      const dst = join(this.cfg.uploadDir, f);
      if (!existsSync(dst)) copyFileSync(join(this.cfg.seedMediaDir, f), dst);
    }
  }

  private writeNow() {
    const tmp = this.dbFile + ".tmp";
    writeFileSync(tmp, JSON.stringify({ guides: [...this.guides.values()], tickets: this.tickets } satisfies Db));
    renameSync(tmp, this.dbFile);
  }
  private saveSoon() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.writeNow(), 150);
  }
  flush() { clearTimeout(this.timer); this.writeNow(); }

  listGuides() { return [...this.guides.values()]; }
  getGuide(id: string) { return this.guides.get(id); }
  saveGuide(g: Guide) { this.guides.set(g.id, g); this.saveSoon(); }
  deleteGuide(id: string) { const ok = this.guides.delete(id); if (ok) this.saveSoon(); return ok; }
  listTickets() { return this.tickets; }
  saveTicket(t: Ticket) {
    const i = this.tickets.findIndex((x) => x.id === t.id);
    if (i >= 0) this.tickets[i] = t; else this.tickets.unshift(t);
    this.saveSoon();
  }
  listEvents() { return this.events; }
  addEvent(e: HelpEvent) {
    this.events.push(e);
    appendFileSync(this.eventsFile, JSON.stringify(e) + "\n");
  }
}
