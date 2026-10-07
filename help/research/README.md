# Research – LUPNUMBER varumärke och app

**Status (2026-10-07): blockerad.** Molnmiljöns nätverkspolicy nekar alla anrop till
`www.lupnumber.com`, `lupnumber.com` och `app.lupnumber.com` (proxyn svarar 403 på CONNECT,
även via WebFetch). Inga färger, typsnitt, loggor eller skärmbilder har därför kunnat hämtas.
Ingenting i `brand.md` eller `app-notes.md` är gissat – tomma fält är markerade **TODO**.

## Så låser du upp det

1. Öppna miljöns inställningar (molnmiljö-menyn i sessionens titelrad → *Edit*) och lägg till
   `lupnumber.com`, `www.lupnumber.com` och `app.lupnumber.com` under *Allowed domains*
   (eller välj en bredare nätverksnivå). Se https://code.claude.com/docs/en/cloud-environments#network-access
2. Lägg till hemligheterna `LUP_DEMO_USER` och `LUP_DEMO_PASSWORD` i miljön om appen ska
   fotograferas inloggad.
3. Starta en ny session och kör:

   ```bash
   npm i --no-save playwright@1.56.1
   node help/research/capture/capture.mjs
   ```

## Innehåll

| Fil | Vad |
|---|---|
| `brand.md` | Färger, typsnitt, logga (fylls i från `capture/brand-raw.json`) |
| `app-notes.md` | Vy för vy: URL-mönster, knapptexter, plats för "?"-knapp, skillnader mot PDF |
| `capture/capture.mjs` | Playwright-skript (1440×900) som tar alla skärmbilder |
| `screens/` | Skärmbilderna hamnar här |

### Säkerhetsräcken i skriptet
- Alla icke-GET-anrop till `*.lupnumber.com` **avbryts i nätverkslagret** – utom den enda
  inloggnings-POST:en. Även en felklickad Save/Send/Call in/Open gate når alltså aldrig servern.
- Dialoger stängs med Close/Cancel/Escape.
- Saknas inloggningsuppgifter stannar skriptet på inloggningssidan.
