# LUPNUMBER Hjälp – Fas 1: analys, UX och MVP-plan

Underlag: *Användarguide LUPNUMBER* (40 sidor, 38 avsnitt, oktober 2026). Den har gjorts om till
strukturerad data i [`content/guides.sv.json`](content/guides.sv.json).

Status: **förslag att godkänna innan bygget börjar.** Beslut som behöver ditt svar finns sist i dokumentet.

---

## 1. Analys av produktidén och underlaget

**Vad vi har att bygga på**

Manualen är ovanligt välstrukturerad och passar mycket bra som grund för en AI-först-hjälp:

| Del i varje avsnitt | Blir i appen |
|---|---|
| Rubrik ("Lägga upp en bild") | Guidens titel, uppgiftsformulerad (inte funktionsnamn) ✅ |
| Blå ruta (menysökväg) | "Var hittar jag det" – brödsmulor + sidkontext för hjälpknappen i produkten |
| *Det här gör den* | Kort svar (en mening) |
| *Vad ni ser i bilden* + orangea siffror | Skärmbild med numrerade hotspots |
| *Gör så här* | Steg-för-steg |
| Tips / Var försiktig | Gröna/gula rutor |

38 guider fördelas på 8 kategorier och två delar av produkten: **Location Admin** (29 guider,
konfiguration) och **Site** (9 guider, daglig drift).

**Det viktigaste vi lärde oss**

1. **Användare och manual säger olika saker.** Användaren skriver *"Hur ändrar jag vilken port chauffören ska
   till?"*, medan manualen skriver *Loading bay*, *Unassigned* och *Gate*. Produkten är på engelska
   och manualen på svenska. Sökningen måste därför klara synonymer på två språk, till exempel
   port, brygga, bay, dock och lastkaj. Därför används semantisk sökning (embeddings) i stället för bara nyckelord.
2. **Några av dina exempelfrågor saknar guide.** Det är bra att se nu, för det är precis vad analysen ska fånga:
   - *"Hur lägger jag till en användare?"*: manualen täcker **kontaktpersoner** (#19) men inte användarkonton och inloggning.
   - *"Hur skapar jag en bokning?"*: finns bara indirekt (#34 *Lägga in ett fordon manuellt*, status Booking).
   - *"Hur ändrar jag vilken port chauffören ska till?"*: finns som en rad i #30 (Unassigned → tilldela brygga) och i #32, men inte som egen guide.
   → MVP:n bör ha ett ärligt "Vi har ingen guide för det än" och logga frågan.
3. **Flera guider hänger ihop i ett flöde.** Några exempel: bild (#6) → bildspel (#7), öppettider (#3) → kapacitet (#16),
   och "Ingen kan boka" (#16). Relaterade guider och problemformulerade frågor ("Ingen kan boka", "Föraren får inget SMS") är lika
   viktiga som "hur gör jag"-frågor.
4. **Det finns riskhandlingar.** *SMS Alarm*, *Call in*, *Open on call-in* (öppnar en fysisk grind) och *Delete location*
   får alltid sina varningar visade, även i ett kort svar.
5. **Skärmbilderna är redan annoterade.** Orangea siffror är inbrända i bilderna. I MVP:n visar vi bilden som
   den är, med siffrorna kopplade till listan. Klickbara hotspot-koordinater i stället för inbrända markeringar
   läggs till i admin i nästa steg. Datamodellen stöder det redan.

## 2. UX-flöde

Huvudidén är **en fråga in, en visuell guide ut**. Inga mellansidor.

```
┌────────────────────────────┐
│  Vad vill du ha hjälp med? │   ← stor ruta, autofokus, placeholder roterar exempel
│  [ Hur lägger jag upp en…] │
│                            │
│  Bilder · Bokning · SMS ·  │   ← 6–8 chips med vanliga ämnen (sekundärt)
│  Daglig drift · Grindar …  │
└────────────────────────────┘
            │ fråga
            ▼
┌────────────────────────────┐
│ "Så här lägger du upp en   │   ← 1 mening (AI), på användarens språk
│  bild." (Location Admin ›  │   ← var: brödsmulor
│  Location details › Image) │
│ ┌────────────────────────┐ │
│ │ [skärmbild, tryck=zoom]│ │   ← stor bild, numrerade markeringar
│ └────────────────────────┘ │
│ ① Öppna Image management   │   ← steg som stora kort, ett i taget på mobil
│ ② Tryck Välj fil …         │      (svep / "Nästa")
│ ⚠ Delete tar bort bilden…  │
│                            │
│ Löste detta problemet?     │
│   👍 Ja      👎 Nej        │
│                            │
│ Nästa steg: Ändra bildspel │   ← 1–3 relaterade guider
└────────────────────────────┘
       👎 → "Vad saknades?" (fritext eller snabbval)
          → AI försöker en gång till med den informationen
          → fortfarande nej → "Skapa supportärende" (förifyllt)
```

**Regler för svaret**

- **Säker träff:** gå direkt till guiden.
- **Osäker träff:** visa "Menade du…?" med 2–3 guidekort. Ingen lång AI-text.
- **Ingen träff:** "Vi har ingen guide för det än." Användaren får ett förslag på närmaste guide och en knapp för att kontakta support. Frågan loggas som *obesvarad*.
- AI:n **sammanfattar och väljer guide men hittar aldrig på steg.** Stegen kommer alltid från guide-databasen. Det skyddar mot felaktiga instruktioner, som är det värsta en supportapp kan ge.
- **5-sekundersregeln:** svaret har högst en mening text innan bilden.

**Kontext från produkten** (förberett i MVP:n, används fullt ut senare): hjälpen öppnas med
`?page=slideshow-settings&app=location-admin`. Guider som hör till sidan visas överst, och
"Hur ändrar jag detta?" tolkas mot den aktuella sidan.

## 3. MVP (version 1)

| # | Krav från briefen | Ingår i MVP |
|---|---|---|
| 1 | Användaren skriver en fråga | ✅ Startsida med frågeruta + chips |
| 2 | AI hittar rätt guide | ✅ Hybridsökning (embeddings + nyckelord) + AI som väljer och svarar kort |
| 3 | Guiden visas visuellt | ✅ Skärmbild med zoom, numrerade punkter, stegkort, tips/varningar |
| 4 | Screenshots | ✅ 38 skärmbilder från manualen, komprimerade till WebP |
| 5 | Admin skapar/redigerar guider | ✅ Enkel admin: lista, redigera text/steg/alternativa frågor, ladda upp bild, publicera |
| 6 | "Hjälpte det?" | ✅ 👍/👎 + "Vad saknades?" |
| 7 | Analytics loggar frågor | ✅ Loggning + enkel dashboard: vanligaste frågor, obesvarade frågor, guider med flest 👎 |
| – | Språk | Endast svenska i MVP. Sökningen förstår ändå produktens engelska termer (Loading bay, Slideshow …) |
| – | Sidkontext | ✅ Via URL-parametrar (grund för "?"-knappen i produkten) |

**Inte i MVP, men förberett i datamodell och API**

- Video per guide (fält `videoUrl` + `videoStartSec` finns)
- Interaktiv walkthrough (steg har fältet `target`, en CSS-selektor eller `data-help-id` i produkten)
- AI som skapar guider från skärmbilder
- Automatiska förslag på nya guider (klustring av obesvarade frågor)
- Riktig integration mot supportsystemet. I MVP:n sparas ärendet och skickas som e-post eller webhook.

## 4. Informationsarkitektur

Kategorierna kommer från manualen. Chips på startsidan använder användarnas ord, inte manualens:

| Chip på startsidan | Kategori i data | Guider |
|---|---|---|
| Kom igång | `kom-igang` | 1 |
| Öppettider & språk | `plats-och-tider` | 2–5 |
| Bilder & bildspel | `forarens-upplevelse` | 6–14 |
| Bokning & kapacitet | `bokning-och-kapacitet` | 15–18 |
| SMS & aviseringar | `personer-och-meddelanden` | 19–21 |
| Grindar & portar | `grindar-och-struktur` | 22–24 |
| Rapporter | `uppfoljning` | 25–29 |
| Daglig drift | `daglig-drift` | 30–38 |

Sidor i appen:

- `/`: fråga och svar (hela användarupplevelsen sker här)
- `/g/[id]`: en guide med delbar länk, för support och mejl
- `/admin`: guidelista → redigera guide
- `/admin/insights`: analytics

## 5. Datamodell

```
guide
  id (slug), number, category, app (location-admin|site),
  pageKeys[]          -- vilka produktsidor guiden gäller (kontext), t.ex. "image-management"
  roles[]             -- location-admin, site-staff …
  status (draft|published), updatedAt, updatedBy, version
  relatedGuideIds[]
  videoUrl?, videoStartSec?, videoEndSec?   -- framtid

guide_content            -- en rad per språk; bara 'sv' i MVP (fältet finns så att fler språk kan läggas till senare)
  guideId, lang, sourceVersion, isMachineTranslated
  title, summary, breadcrumb[], alternativeQueries[]
  steps[]   { n, text, mediaId?, hotspot?{x,y,w,h}, target? }   -- target = framtida walkthrough
  hotspots[] { n, label, text, x?, y?, w?, h? }
  notes[]   { type: tip|warning, text }

media
  id, kind (image|video|gif), url, width, height, alt, createdAt

guide_embedding
  guideId, chunk (titel+summary+alt-frågor | steg), vector

query_log                -- analytics, en rad per fråga
  id, sessionId, text, lang, pageContext, matchedGuideId?, confidence, outcome (answered|ambiguous|none), createdAt

guide_view
  id, sessionId, guideId, queryId?, stepsViewed[], durationMs, createdAt

feedback
  id, sessionId, guideId, queryId?, helpful (bool), comment?, createdAt

support_ticket
  id, sessionId, originalQuery, guideId?, pageContext, stepsViewed[], comment, contact, status, createdAt
```

MVP:n är bara på svenska. Uppdelningen mellan `guide` (struktur) och `guide_content` (text per språk) behålls
ändå, så att AI-översättning kan läggas till senare utan att datamodellen behöver göras om.

## 6. UI-principer

- Ett fält och ett svar. Inga menyer på startsidan förutom chips.
- Mobil först: tryckytor på minst 48 px, skärmbilden i full bredd med tryck för helskärm, pinch och zoom, och steg som svepbara kort.
- Färger och typsnitt från manualen (LUP-blå `#0EA5E9`, mörkblå rubriker, orange markeringar).
  Det känns igen från produkten.
- Gul varningsruta visas alltid, även på mobil, när guiden har en varning.
- Laddningstid: statiska skärmbilder (WebP, ~100–150 kB), sökningen svarar på under 1–2 s, med streaming av meningen om det behövs.

## 7. Teknisk arkitektur

```
 Webbläsare / widget i LUP-produkten
        │  HTTPS (JSON API)
 ┌──────▼────────────────────────────────────────┐
 │ Next.js-app (frontend + API-routes)           │
 │  /api/ask  /api/guides  /api/feedback          │
 │  /api/tickets  /api/admin/*  /api/analytics    │
 ├──────────┬───────────┬───────────┬────────────┤
 │ AI-lager │ Sök       │ Analytics │ Auth (admin)│
 │ (Claude) │ (pgvector │ (Postgres │ (lösenord/  │
 │          │ + FTS)    │  tabeller)│  SSO senare)│
 └────┬─────┴─────┬─────┴─────┬─────┴────────────┘
      │           │           │
  Claude API   Postgres + pgvector     S3-kompatibel lagring
  (Haiku: svar, Sonnet:                (bilder/video, t.ex. R2)
   översättning, admin-AI)
```

| Del | Val | Varför |
|---|---|---|
| Frontend + API | **Next.js (App Router) + TypeScript + Tailwind** | En kodbas, enkel drift, bra på mobil. API:t kan användas direkt av produkten. |
| Databas | **Postgres + pgvector**, via Drizzle ORM | Guider, analytics och vektorer i samma databas. Billigt (Neon/Supabase). I lokal utveckling och tester körs **PGlite** (Postgres i processen), utan Docker. |
| Sökning | Hybrid: vektorsökning + Postgres fulltext (trigram), slås ihop med RRF | Klarar både "slideshow" och "byta bild på skärmen" |
| Embeddings | Embeddingmodell som klarar svenska och engelska (t.ex. Voyage) | Svenska frågor mot guider där knapparna heter något på engelska |
| AI-svar | **Claude Haiku 5.5** väljer bland topp 5 och skriver en mening, med strukturerad JSON-utdata | Snabbt, billigt, bra på flerspråk |
| Admin-AI (senare) | **Claude Sonnet 5.5** (bildförståelse) | Kvalitet där det behövs, körs sällan |
| Media | S3-kompatibelt (Cloudflare R2), lokalt i `public/` under utveckling | Billig lagring, CDN |
| Auth | Admin bakom inloggning (enkel lösenords-/magic link i MVP), användarsidan öppen eller med token från produkten | Enkelt nu, SSO senare |

**Fallback utan API-nycklar:** appen fungerar fortfarande. Sökningen faller tillbaka på nyckelord plus synonymlista och
visar guiden utan AI-mening. Det gör också demo och tester gratis.

**Kostnad (uppskattning):** varje fråga kostar ungefär en embedding plus ett Haiku-anrop med cirka 2 000 tokens in, alltså
bråkdelar av en krona.

## 8. Plan för fas 2 (bygget)

1. Lägg upp Next.js-projektet i `help/`, datamodell, seed från `guides.sv.json` och skärmbilder (WebP).
2. Generera alternativa frågor (5–10 per guide, svenska plus produktens engelska termer) och relaterade guider med AI. Granskas av dig i admin.
3. Fråga och svar-flöde + guidevy (mobil först).
4. Feedback → ny fråga → supportärende.
5. Admin: lista, redigera, ladda upp bild, publicera.
6. Analytics-dashboard.
7. Testa flödet med en testsvit på cirka 40 riktiga frågor (bl.a. dina exempel) och mät träffsäkerheten.
   Rätta synonymer och alt-frågor tills träffsäkerheten är hög.
8. End-to-end-test i webbläsare på mobil och desktop, sedan förenkla det som känns krångligt.

## Beslut att ta (förslag i fetstil)

1. **Stack:** **Next.js + Postgres/pgvector + Claude**, enligt ovan.
2. **Hosting:** **Vercel + Neon + R2** (billigt och enkelt), eller er egen miljö?
3. **Embeddings:** **Voyage** (kräver en API-nyckel) eller OpenAI? Utan nyckel fungerar nyckelordsläget.
4. **Admininloggning i MVP:** **ett delat adminlösenord via miljövariabel**, med riktig inloggning senare.
5. **Saknade guider** (användare, skapa bokning, byta brygga): ska jag **skriva utkast** utifrån det som står i
   manualen, markerade som utkast, eller lämna dem tomma så att de syns i analytics?
