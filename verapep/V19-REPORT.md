# VERAPEP v19 – Owner Control Center & Content Readiness

Rapport för ägaren. Bas: verifierad v18 (`claude/verapep-v18`, PR #3). Arbetsgren: `claude/verapep-v19`.

**Kort svar:** Administrationen visar nu på en sida vad som är klart, vad som saknas och vad som ska göras härnäst. Varje produkt har en egen arbetsyta med checklista, privata dokument, utkast, granskning och historik. Inga befintliga spärrar har tagits bort. Webbplatsen är fortfarande **inte** godkänd för lansering. De kvarvarande hindren är juridiska beslut, underlag från dig och externa inställningar (se `V19-EXTERNAL-DECISIONS.md` och `V19-OWNER-INPUT-NEEDED.md`).

Steg-för-steg-instruktioner för ägaren finns i **`V19-OWNER-GUIDE.md`**.

---

## Fas 1 – Verifiering av v18 och externa åtgärder

| Kontroll | Resultat (2026-10-09) |
| --- | --- |
| v18 CI på head `6023a06` | Grön (checks, e2e, release gate) |
| GitHub-repot privat? | **Nej, fortfarande publikt.** Kontrollerat med en oautentiserad API-läsning (HTTP 200). |
| Vercel `lup-hjalp` isolerad från produktionsdatabasen? | **Nej.** `DATABASE_URL` och `ADMIN_PASSWORD` gäller fortfarande både production och preview. Inget "ignored build step" finns. |
| Render med strikt publiceringsspärr? | Kan inte verifieras härifrån (nätverket blockerar Render). Koden väljer strikt läge automatiskt på hostade miljöer. |
| Gamla PR-versioner som återställningspunkter | Finns: `claude/fervent-babbage-1a97st` (v15), `claude/verapep-v16`, `-v17`, `-v18`. |

Inga inställningar har ändrats. Allt v19-arbete har gjorts i en isolerad behållare med temporära datakopior. Ingen produktionsdata, inga uppladdade dokument och inga riktiga produkttexter har lagts in i repot.

## Fas 2 – Owner Control Center ("Overview")

Admin öppnar nu på fliken **Overview** (`/api/admin/overview`, `lib/admin-v19.mjs`):

- **Teknisk status** som antal godkända kontroller (t.ex. "7 of 9 checks OK"): databasintegritet (`PRAGMA quick_check`), säkerhetskopia de senaste 7 dagarna, publiceringsspärr, `TRUST_PROXY`, Veras kunskapsbas, serverfel, release-manifest, MFA på ditt konto, och om livetext ändrats utan granskning.
- **Juridisk lanseringsberedskap**, separat: "Not approved for launch", antal juridiska och dokumentationsmässiga hinder, och hela blockerlistan grupperad efter vem som kan lösa den. **Det finns ingen samlad procentsats** – ett test säkerställer att API:t inte returnerar någon.
- **Produktdokumentation:** hur många produkter som saknar text, innehåll, förvaring, varningar, verifierad labbrapport eller leverantörsdokument, plus dokument som väntar på verifiering.
- **Compliance review:** publika och dolda produkter, antal per granskningsstatus, och godkännanden med scope, marknader, referens, granskare och datum. Godkännanden där texten ändrats efteråt markeras.
- **Innehållskvalitet:** juridiska sidor, förtroenderaden (som nämner labbrapporter trots att ingen är publicerad), produktsidor utan text, Vera, och bildgranskningen.
- **Systemhälsa:** version, Node, drifttid, säkerhetskopior, fel.
- **"Do this next":** rangordnade prioriteringar med vem som ansvarar och en knapp direkt till rätt ställe.

## Fas 3 – Produkthantering för alla 84 produkter

**Produktlista** med sökning och filter:
- **"Missing":** text, innehåll, förvaring, varningar, labbrapport, leverantörsdokument eller juridiskt godkännande.
- **Granskningsstatus**, **synlighet** och **pågående arbete:** öppna utkast, behöver granskas igen, eller ändrad utan granskning.
- Varje rad visar "Content x/6 · Legal y/2".

**Produktarbetsyta** (`/api/admin/products/:id/workspace`):
- **Checklista** med nästa steg för varje punkt. Innehåll och juridik räknas separat.
- **Utkast** med källa per fält (dokument, leverantör, egen text), ordvis jämförelse mot livetexten, valideringsvarningar och granskningshistorik.
- **Dokument:**
  - Uppladdning av PDF, PNG, JPEG och WebP (max 15 MB). Filtypen kontrolleras på innehållet (magic bytes), inte på filnamnet.
  - Verifiering kräver en anteckning om vad som kontrollerats. Avvisning stöds också.
  - Vid ersättning sparas den gamla versionen och kopplas till den nya, och allt som byggde på den gamla flaggas för omgranskning.
- **Historik:** numrerade versioner av livetexten (inklusive "direktändring, ej granskad"), juridiska beslut och aktivitetslogg.

**Import** (`/api/admin/import/preview` och `/apply`):
- Tar emot CSV eller JSON med upp till 200 rader.
- Förhandsgranskningen visar fel per rad: okänd produkt, dubblett, kod, platshållartext, och kolumner som ignoreras (t.ex. `published`).
- Importen skapar **endast utkast**, och först efter att du bekräftat exakt antal.

**Åtkomstkontroll för dokument:**
- Dokument lagras i `DATA_DIR/documents/` med filrättighet 0600. Mappen serveras aldrig, ignoreras av Git och kopieras med av `npm run backup:sqlite`.
- Nedladdning kräver admin med produktbehörighet och sker som bilaga med `CSP: sandbox`.
- Supportrollen får 403.
- Produktfoton exponeras via `/product-media/…` först när de är verifierade, granskade, tillämpade och produkten är publik. Döljs produkten igen ger samma adress 404.

**AI och fakta:** Ingen AI genererar eller kompletterar text. Systemet hittar inte på något: varje fält kommer från en angiven källa, och "förslag" (utkast), "källa" (dokument) och "godkänd information" (livetext efter granskning) hålls isär. Text med terapeutiska påståenden, doseringspåståenden eller absoluta påståenden kan inte godkännas redaktionellt ensam, utan kräver en extern granskning med namn och referens.

## Fas 4 – Bildgranskning

`scripts/audit-site-images.mjs` skriver `data/image-audit.json`. Rapporten visas under Overview → Content quality, och ett test kontrollerar att den är aktuell.

| Fynd | Filer | Åtgärd |
| --- | --- | --- |
| Produktfoton (`assets/media/product-vials/`) är renderade mockups med etiketten **"Research Use Only"** – ett obekräftat produktpåstående. Proportionerna varierar mellan filerna. De finns bara i fotokartan och sidorna visar den genererade illustrationen. | 5 PNG, 1,6–1,8 MB styck (8,5 MB) | Visas inte. **Rekommendation:** ta bort dem ur releasen efter ditt OK, och ersätt dem med riktiga foton via det nya bildflödet. |
| Generiska flaskbaser (`vial-bases/`) gör att alla produktkort ser likadana ut. | 3 oanvända PNG (3,4 MB) + 1 använd WebP | Oanvända PNG kan tas bort. Illustrationen ersätts när riktiga foton finns. |
| Generiska SVG-illustrationer som fortfarande finns i HTML men döljs med CSS. | 3 | Kan tas bort (rekommenderas, liten påverkan). |
| Hero-bilden saknar högupplöst original: bredaste *använda* källan är 2048 px, rekommenderat är ≥2400 px. | Hero-filerna i `index.html` | Behöver ett original från fotografen. |
| Gammal hero-video och -poster (`liquid-hero.*`) används inte. | 4 filer (≈0,5 MB) | Kan tas bort. |

Totalt: 24 filer, 20 flaggade (varav 8 är hero-varianter med samma fynd), cirka 3,9 MB helt oanvända.

**Bildbyte i admin:** Ladda upp, verifiera, välj "Use as product photo", granska, gör live. Bilden förminskas automatiskt i webbläsaren till högst 2400 px och sparas som WebP. Under 800 px bred ger en varning.

**Mätt optimering:** `product-vials/bpc-157.png` (1318×2048) gick från **1 760 KB till 66 KB (−96 %)** med samma upplösning när den skickades genom uppladdningsflödet i Chromium.

Uppladdade foton har nu företräde framför den genererade flaskillustrationen (`assets/app.js`, `assets/product-commerce.js`) och märks "Product photograph approved by VERAPEP". Tidigare skulle ett uppladdat foto aldrig ha visats.

Ingen generell omdesign har gjorts.

## Fas 5 – Innehållsprocess

**Utkast → Intern granskning → Extern granskning vid behov → Godkänd för angivet ändamål → Live** (`lib/content-workflow.mjs`).

| Krav | Lösning |
| --- | --- |
| Versioner sparas | Varje ändring av livetext blir en numrerad version (upp till 200 per produkt). Före första ändringen sparas även en baslinje. |
| Ändringar jämförbara | Ordvis diff i granskningsvyn och på varje utkast. |
| Spårbara godkännanden | Varje granskning sparar person, roll, beslut, anteckning och tid. Extern granskning sparar även granskarens namn och referens. Allt loggas också i audit-loggen. |
| Inga godkännanden via massuppdatering | Det finns ingen massroute: `/api/admin/drafts/bulk` ger 404, vilket ett test kontrollerar. Varje beslut gäller ett utkast. |
| Ingen automatisk publicering | Att tillämpa godkänd text ändrar inte synlighet, försäljning eller juridisk status (testat med en dold produkt). Utkast kan inte bära flaggor som `published` eller `availableForSale`. |
| Juridiska godkännanden separata från redaktionella | Redaktionella godkännanden ligger på utkastet, juridiska på produktens compliance-post. När påståendetext ändras efter ett juridiskt godkännande sätts `contentChangedAfterApproval`. |
| Omgranskning vid ny dokumentversion | Ersätts ett dokument flaggas utkast och godkännanden som byggde på det. Ett flaggat utkast kan inte tillämpas. |
| Ingen självgranskning av misstag | Författaren kan inte granska sitt eget utkast. Ägaren kan göra det, men bara med uttrycklig bekräftelse, och det sparas som självgranskning. |
| Redaktörer | Kan skapa och skicka in utkast men inte godkänna. Den gamla direkta redigeringen av påståendefält ger 403 för redaktörer. För ägare och admin sparas den som "direct edit (not reviewed)" och syns i översikten. |

## Fas 6 – Admin-UX och simulerade administratörer

**Förbättringar:**
- Overview är startfliken.
- Flikordningen följer arbetsflödet: Overview, Products, Changes to review, Compliance review, Orders …
- "Reviews" har bytt namn till "Customer reviews".
- Hjälptexter vid varje fält.
- Bekräftelser vid alla beslut.
- Felmeddelanden på vanlig engelska ("Your session has ended", "This page is out of date"…).
- Påståendefält i den gamla redigeraren är skrivskyddade och hänvisar till utkast.

**Mobil:**
- Problemet i v18: flikarna låg långt ned och tryck på dem fångades av andra element. Det reproducerades: Playwright kunde inte trycka på "Products" på 390 px.
- I v19 ligger flikarna direkt under sidhuvudet, är klistrade och scrollbara i sidled, och sidan har ingen horisontell scroll (testat).

**Simulerade förstagångsadministratörer** (`tests/admin-personas.py`, AI-styrd navigering – **inte riktiga användare**):

| Uppgift | v18 | v19 |
| --- | --- | --- |
| F: Hitta hur många produkter som saknar dokumentation | Misslyckades | Klar direkt på Overview (0 klick) |
| F: Göra klart KPV och skicka för granskning | Misslyckades (inget arbetsflöde) | Klar (6 steg) |
| G: Granska en föreslagen ändring och se vad som ändrats | Misslyckades | Klar (2 steg) |
| H (mobil): Hitta vad som hindrar lansering | Misslyckades (fliken gick inte att trycka på) | Klar (0 klick) |
| H (mobil): Hitta dolda produkter och varför | Misslyckades | Klar (1 steg) |
| **Totalt** | **0/5** | **5/5** |

**Förbättringar som infördes på grund av testerna:**
1. Persona G gick först till kundrecensioner, eftersom fliken hette "Reviews". Fliken bytte namn till "Customer reviews" och granskningskön till "Changes to review", vilket gav 4 → 2 steg.
2. Mobilfliken som inte gick att trycka på åtgärdades.
3. Antal saknade underlag står nu i klartext på översikten.

Personorna körs i CI (informativt).

## Fas 7 – Ask Vera

- **Besökarens språk:** Svenska frågor upptäcks (`lib/vera-language.mjs`). Ett svar ges på svenska **bara** om översättningen är godkänd av ägare eller admin och den engelska källan inte har ändrats sedan godkännandet (hashkontroll).
  - Annars svarar Vera på engelska och säger ärligt att en granskad svensk översättning saknas.
  - Platshållare fylls på svenska: dagar, landsnamn via `Intl.DisplayNames`, beställningsstatus.
  - Produktfakta visas som publicerade.
- **Översättningar:**
  - 28 svenska förslag följer med (`data/vera-translations.json`). Alla har status **"proposed"** och visas inte för besökare förrän du godkänner dem under Guide & Ask Vera.
  - Godkännande kräver roll ägare eller admin och en bekräftelse.
  - Redaktörer kan bara föreslå.
  - Platshållarna måste vara desamma som i källan.
- **Tydligare länkar:** Länkar i godkända svenska svar får svenska etiketter.
- **Säkerhet:** Medicinska frågor och doseringsfrågor nekas fortfarande först, på alla språk (testat med en svensk doseringsfråga).
- **Ingen generativ AI har införts.** En bedömning av om och hur det skulle kunna göras finns i `V19-VERA-GENERATIVE-AI.md`. Den beskriver nytta, integritetsrisker, säkerhetsarkitektur och de tester som måste finnas först.

## Fas 8 – Tester

| Svit | v18 | v19 |
| --- | --- | --- |
| Enhets- och API-tester (`npm test`) | 87 | **97** (alla gröna) |
| Webbläsartester inkl. axe (`tests/e2e.py`) | 17 | **20** (alla gröna) |
| Statisk validering, CSS-buntar, hemlighetsskanning | grön | grön |
| Simulerade besökare (`personas.py`) och administratörer (`admin-personas.py`) | informativt | informativt, båda i CI |

**Nya tester (`tests/v19.test.mjs`)** täcker:
- utkastflödet och att tillämpning inte publicerar;
- påståenden som kräver extern granskning, samt självgranskning;
- dokument: privata, typkontrollerade, åtkomst per roll, ersättning som ger omgranskning;
- produktfoton som serveras först efter verifiering, granskning, tillämpning och synlighet;
- import som bara skapar utkast;
- översikten utan procentsats;
- att nya funktioner inte kringgår den juridiska spärren (dold produkt förblir dold, ingen massgodkännande-route, inga anonyma anrop);
- att bildrapporten är aktuell;
- Veras språkregler.

**Nya E2E-tester:** `admin_overview`, `admin_workflow` (utkast → granskning → diff → live) och `admin_mobile` (390 px utan horisontell scroll).

`admin` uppdaterades medvetet: ändring av kort beskrivning sker nu via utkast, och den skrivskyddade påståendetexten i den gamla redigeraren kontrolleras.

## Före och efter

Bilderna finns i `previews/v19/`:

| Vy | v18 | v19 |
| --- | --- | --- |
| Admin start, dator | `v18-admin-start-desktop.png` | `v19-admin-start-desktop.png` |
| Admin start, mobil | `v18-admin-start-mobile.png` | `v19-admin-start-mobile.png` |
| Produkt, dator | `v18-admin-product-desktop.png` | `v19-admin-product-desktop.png` |
| Produkt, mobil | `v18-admin-product-mobile.png` | `v19-admin-product-mobile.png` |

Helsidesbilder finns i `previews/information-platform/`: `v19-admin-overview.png`, `v19-product-workspace.png` och `v19-admin-mobile.png`.

## Det här har inte gjorts (med avsikt)

- Ingen produkt har godkänts, publicerats eller fått försäljning aktiverad.
- Ingen produktionsdata har ändrats och ingen driftsättning har gjorts.
- Inget har slagits samman.
- Repots synlighet, Vercel- och Render-inställningar och hemligheter är oförändrade.
- Inga bildfiler har raderats. Borttagning av de oanvända filerna kräver ditt OK.
- Inga översättningar har godkänts.
