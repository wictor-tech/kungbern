# LUP Hjälp – AI-first visuell hjälp

Användaren skriver en vanlig fråga ("Hur lägger jag upp en bild?") och får direkt en visuell steg-för-steg-guide.
Mål: färre supportärenden.

## Snabbstart
```bash
npm install
npm run dev        # API :8787 + webb :5173 (admin-token i dev: "admin")
npm test           # 41 enhets-/API-tester
npm run build && npm start   # produktion: API serverar den byggda webben på :8787
npm run e2e        # webbläsartest mot en körande server (BASE=…, ADMIN=…, CHROMIUM=…)
```

## Miljövariabler
| Variabel | Syfte |
| --- | --- |
| `ADMIN_TOKEN` | **Obligatorisk i produktion.** Åtkomstkod till `/admin`. |
| `ANTHROPIC_API_KEY` | Slår på AI: förstå frågor, AI-utkast av guider, översättning. Utan nyckel används lokal sökning. |
| `ANTHROPIC_MODEL` | Standard `claude-sonnet-5-5`. |
| `DATA_DIR` | Var db.json, events.jsonl och uppladdningar lagras (lägg på en beständig volym). |
| `ALLOWED_ORIGINS` | Kommaseparerade origins för CORS, standard `*`. |
| `TICKET_WEBHOOK_URL` | Varje supportärende POST:as hit som JSON (Zendesk/Slack/etc.). |
| `RECURRING_THRESHOLD`, `BAD_GUIDE_RATE`, `BAD_GUIDE_MIN_VIEWS` | Gränser för "återkommande problem" och "dålig guide". |

## Arkitektur
```
shared/types.ts        datamodell (Guide, Step, Ticket, events)
server/src/search/     lokal semantisk sökning (begreppslexikon 9 språk + trigram)
server/src/ai/         AiProvider: Claude (fetch) eller lokal reserv
server/src/store.ts    Store-gränssnitt, JSON-filer (byt mot Postgres vid behov)
server/src/analytics.ts rapporter + förbättringsförslag
server/src/media.ts    uppladdning (magic bytes-kontroll) + Range-streaming
server/src/app.ts      Hono-API: publikt /api/*, admin /api/admin/* (Bearer)
web/                   React + Vite, mobil först, admin lazy-laddad
web/public/embed.js    inbäddning + interaktiv walkthrough
```

## Bädda in i er produkt
```html
<script src="https://HJALP/embed.js"></script>
<script>
  LupHelp.init({ page: "slideshow", lang: "sv" });
  LupHelp.setContext({ page: "capacity" });   // vid sidbyte
</script>
```
Hjälpen använder sidan som kontext ("Hur ändrar jag detta?"). Guidens `pageKeys` styr vilka guider som hör till en sida.

**Walkthrough:** sätt `data-help="namn"` på knappar i produkten och lägg in steg i guidens
walkthrough-sektion (`[data-help='menu-capacity']`, klick/skriv/nästa). Se `web/public/demo-host.html`.

## Innehåll
Första start seedar 25 guider ur manualen "Användarguide Location Admin". För att seeda om: stoppa servern och ta bort `server/data/db.json`.
Lägg in video per guide i admin (mp4/webm, YouTube eller Loom) – ingen kodändring behövs.

## Säkerhet
Admin kräver Bearer-token (jämförs tidskonstant), uppladdningar valideras på innehåll och storlek, text renderas aldrig som HTML,
publika endpoints är rate-limitade. Sätt `ALLOWED_ORIGINS` och kör bakom HTTPS i produktion.

## Nästa steg
Embeddings (bakom `SearchEngine`), SSO för admin, Postgres, automatisk guideförbättring från analytics.

## Demo-data för analytics
`DATA_DIR=/tmp/demo npm run demo-data -w server` fyller en **separat** katalog med simulerad trafik (sessioner märkta `demo-`).
Starta sedan en andra server: `DATA_DIR=/tmp/demo PORT=8788 ADMIN_TOKEN=demo npm start`. Blanda aldrig med riktig data.
