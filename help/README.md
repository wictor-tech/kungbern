# LUP Hjälp

AI-först hjälp för LUPNUMBER: användaren skriver en vanlig fråga och får direkt rätt guide med skärmbild,
markeringar och steg. Uppdelad på **Location Admin** (inställningar) och **Site** (daglig drift).

Bakgrund, UX-beslut och arkitektur: [PLAN.md](PLAN.md).

## Kom igång

```bash
cd help
npm install
cp .env.example .env.local   # sätt minst ADMIN_PASSWORD
npm run dev                  # http://localhost:3100
```

Ingen databas eller API-nyckel behövs för att köra lokalt. Utan `DATABASE_URL` används inbyggd Postgres (PGlite)
i `.data/pglite`, och de 38 guiderna från användarguiden läses in automatiskt första gången.

| Sida | Vad |
|---|---|
| `/` | Fråga och svar |
| `/g/<id>` | En guide (delbar länk) |
| `/k/<kategori>` | Bläddra i en kategori |
| `/admin` | Skapa och redigera guider (lösenord: `ADMIN_PASSWORD`) |
| `/admin/insights` | Vanligaste frågor, frågor utan svar, guider med många 👎, ärenden, förbättringsförslag |

## Så fungerar sökningen

1. **Svensk textbehandling** (`src/lib/text.ts`): böjningar, synonymer (port = lastbrygga = bay, chaufför = förare,
   bildspel = slideshow …), frasverb ("checka ut", "kalla in", "ladda upp"), stavfel.
2. **Ranking** (`src/lib/search.ts`) över titel, alternativa frågor, menysökväg, beskrivning, steg och markeringar.
   Sidkontext väger in när användaren frågar om "detta".
3. **Säkerhetsbedömning**: säkert svar visas direkt, osäkert ger "Menade du…?", och saknas guide sägs det ärligt
   och frågan loggas.
4. **Valfritt AI-lager** (`ANTHROPIC_API_KEY`): Claude Haiku väljer bland de 5 bästa kandidaterna och skriver en
   kort mening. AI:n skriver aldrig egna steg, för de kommer alltid från guide-databasen.
5. **Valfria embeddings** (`VOYAGE_API_KEY`) för semantisk sökning.

Mät träffsäkerheten efter ändringar:

```bash
npm run eval:search          # 58 testfrågor (briefens exempel, vardagsspråk, stavfel, sidkontext, saknade guider)
npx tsx scripts/eval-holdout.ts   # kontrollfrågor som inte används vid finjustering
```

Nuvarande resultat utan AI: 54/54 rätt guide först, 0 säkra svar med fel guide och 4/4 saknade guider korrekt
hanterade. Kontrollfrågorna ger 16/17 rätt.

## Tester

```bash
npm run typecheck
npm test          # enhets- och flödestester (PGlite i minnet)
npm run e2e       # Playwright: hela användar- och adminflödet, widgeten, desktop + mobil
```

GitHub Actions (`.github/workflows/help.yml`) kör allt detta vid varje push som rör `help/`.

**Klickbar demo** (en HTML-fil, sökningen körs i webbläsaren): `node scripts/build-demo.mjs ut.html`.

## Koppla in i LUPNUMBER

**"?"-knappen (färdig widget).** Lägg in en rad på varje sida i produkten:

```html
<script src="https://<hjälp-domän>/widget.js" data-page="capacity-timeslots" data-app="location-admin" defer></script>
```

Den ger en knapp "Behöver du hjälp?" som öppnar hjälpen i en sidopanel, med sidans guider överst. Vid sidbyte
utan omladdning: `LupHelp.setPage("site-board", "site")`. Med en färdig fråga: `LupHelp.open("Hur …?")`.
Prova på `/widget-demo.html`. Sätt `HELP_ALLOWED_ORIGINS` så att produkten får visa panelen och anropa API:t.

**Utan widget** kan hjälpen öppnas i en egen panel eller iframe:

```
https://<hjälp-domän>/?page=slideshow-settings&app=location-admin&embed=1
```

`embed=1` döljer sidhuvudet. `page` gör att sidans guider visas först och att "Hur ändrar jag detta?" förstås.
Sidnycklarna står på varje guide (`pageKey`) och kan ändras i admin.

**API** (CORS öppnas för origins i `HELP_ALLOWED_ORIGINS`):

| Metod | Sökväg | Vad |
|---|---|---|
| `POST` | `/api/ask` | `{ q, page?, app?, sessionId? }` → bästa guide, kort svar, alternativ |
| `GET` | `/api/context?page=…` | Guider för en sida i produkten |
| `GET` | `/api/guides`, `/api/guides/:id` | Publicerade guider |
| `POST` | `/api/feedback` | 👍/👎 med kommentar. Vid 👎 kommer ett nytt försök tillbaka |
| `POST` | `/api/tickets` | Supportärende med fråga, guide, sida och visade steg |
| `POST` | `/api/events` | Visning av guide och vilka steg användaren bockat av |

Supportärenden skickas till `SUPPORT_WEBHOOK_URL` (Zendesk, Freshdesk, Slack …) om den är satt.

## Inzoomade steg

Varje steg som nämner en knapp ("Tryck **Save capacity**") visar ett inzoomat utsnitt av skärmbilden med knappen
markerad. Positionerna räknades fram automatiskt ur de orangea markeringarna (`scripts/hotspots/`) och kan
justeras i admin med "Rita". Vilket steg som hör till vilken markering väljs per steg i admin.

## Guider som saknades i manualen

`content/drafts.sv.json`: *Skapa en bokning* (publicerad, bygger helt på manualens avsnitt 34), samt
*Byta port för en förare* och *Lägga till en användare* som **utkast** med öppna frågor `[Fyll i: …]`.
Utkasten syns bara i admin.

## Säkerhet

- Admin bakom lösenord, signerad cookie, får inte bäddas in i andra sajter.
- Begränsat antal anrop per minut på de publika API:erna (frågor, feedback, ärenden, inloggning).
- Uppladdningar: bara bild- och videoformat, max 50 MB.

## Förberett för senare

- **Video:** varje guide kan ha en kort video med starttid (laddas upp i admin).
- **Interaktiv walkthrough:** varje steg har fältet `target` (CSS-selektor eller `data-help-id` i produkten), så att
  en produkt-tour kan markera rätt knapp direkt i gränssnittet.
- **Klickbara markeringar:** rita en ruta på skärmbilden i admin så blir markeringen klickbar för användaren.
- **Fler språk:** datamodellen har språkfält. Guiderna kan översättas med AI utan separata kopior.
- **AI som skapar guider från skärmbilder:** admin-API:t och datamodellen tar emot förslag i samma format.

## Produktion

- `DATABASE_URL` → Postgres (t.ex. Neon). Samma tabeller skapas automatiskt.
- Uppladdningar sparas lokalt i `UPLOAD_DIR`. Byt `saveUpload` i `src/lib/media.ts` mot S3/R2.
- Sätt `ADMIN_PASSWORD`, `SESSION_SECRET` och gärna `ANTHROPIC_API_KEY`.

## Struktur

```
content/guides.sv.json   38 guider tolkade från PDF:en (källa)
content/enrich.sv.json   alternativa frågor, relaterade guider, sidnycklar
public/screens/          skärmbilder från PDF:en (WebP)
src/lib/                 sökning, AI, databas, analytics, auth, media
src/app/                 sidor och API
src/components/          GuideView, Feedback, TicketForm, SearchBox, admin/
scripts/                 träffsäkerhetsmätning
tests/, e2e/             vitest och Playwright
```
