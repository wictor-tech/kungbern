# VERAPEP v20 – Oberoende kvalitetsgranskning

Utgångspunkt: `claude/verapep-v19` (PR #4). Arbetsgren: `claude/verapep-v20`. Granskad 2026-10-09.

## Hur granskningen gjordes

Tre spår kördes parallellt, oberoende av tidigare rapporter:

1. En säkerhetsgranskare och en arkitekturgranskare. Båda var nya agenter som inte hade sett koden tidigare. De fick bara läsa koden och reproducera fel på temporära datakopior.
2. Egna tester i webbläsaren:
   - tolv realistiska användarscenarier;
   - tre skärmbredder (390, 820 och 1440 px);
   - tangentbordsnavigering;
   - fyrtio formuleringar av medicinska frågor och doseringsfrågor till Ask Vera på fyra språk.
3. Ett nytt, reproducerbart lasttest (`tests/load/load-test.mjs`).

Varje fel reproducerades innan koden ändrades. Varje rättelse har ett regressionstest. Alla elva nya API-tester i `tests/v20.test.mjs` **fallerar mot v19-koden och går igenom mot v20**, och samma gäller de två nya webbläsartesterna. Resultatet är alltså bevisat, inte antaget.

> **Viktigast:** Ett allvarligt säkerhetsfel (S1) fanns sannolikt redan från v14 och finns troligen i den version som körs i produktion i dag. Det gör att vem som helst kan hämta serverns källkod och hela produktkatalogen, inklusive de 44 dolda produkterna, med en enkel webbadress. Felet är rättat i v20, men rättelsen skyddar först när v20 är driftsatt.

---

## 1. Verifierade fel som har åtgärdats

### Säkerhet

| # | Allvar | Fel | Åtgärd | Test |
| --- | --- | --- | --- | --- |
| S1 | **Kritisk** | `GET /assets%2F..%2Fserver.mjs` returnerade serverns källkod, och `…%2Fdata%2Fcatalogue.json` hela katalogen inklusive dolda produkter. Med standardinställningen för `DATA_DIR` gick även privata uppladdade dokument att hämta. Orsak: sökvägen avkodades i sin helhet *före* kontrollen av första mappnamnet. | Uttryck med `..`, bakåtsnedstreck och NUL avvisas efter avkodning. Alla kontroller görs på sökvägen *efter* normalisering. | v20 S1 |
| S2 | Hög | En inaktiverad användare, eller en användare som fått ny roll eller nytt lösenord, behöll sin inloggning och sin gamla roll i upp till 8 timmars aktivitet, utan absolut tak. | Kontot läses om vid varje anrop: inaktiverad eller nytt lösenord ger utloggning, och en ändrad roll gäller direkt. En session lever högst 12 timmar. | v20 S2/S3 |
| S3 | Hög | Den enda ägaren kunde degradera eller inaktivera sig själv, och då gick ägarbeslut aldrig att fatta igen. "Lägg till användare" med en befintlig e-postadress skrev över kontot och kunde degradera ägaren. | Den sista aktiva ägaren skyddas (409). "Lägg till" vägrar om kontot redan finns. | v20 S2/S3 |
| S4 | Hög | Redaktörer kunde via den gamla direktredigeringen publicera en extern bild, en påhittad labbrapport ("COA 99.9 %"), alt-text och förvaringstext, och ändra synlighet. Allt syntes direkt för kunder. | Redaktörer kan inte ändra något kunden ser direkt. Sökalias, guidetaggar och srcset, med bara webbplatsens egna filer, är fortfarande tillåtna. | v20 S4/S5 |
| S5 | Medel | Redaktörer kunde ändra ägarens beslut "Do not publish", vilket visar produkten igen i förhandsläget, och ta bort ägarens godkännanden. Det gick även via massändring. | Bara ägare eller admin kan ändra en produkt som är "Do not publish" eller godkänd. | v20 S4/S5 |
| S6 | Medel | Fyraögonsprincipen gick att kringgå. En admin kunde skriva om en redaktörs utkast, skicka in det och godkänna sin egen text. | Alla som skapat, redigerat eller skickat in ett utkast räknas som författare. | v20 S6 |
| S7 | Medel | En TOTP-kod gick att använda flera gånger inom sitt tidsfönster. | Koder kan bara användas en gång per konto. Ett befintligt v14.1-test byggde på återanvändning och har justerats (se nedan). | v14.1 |
| S8 | Låg | Inloggningen tog emot `text/plain`, så en annan webbplats kunde logga in besökaren på en främmande admin-session (login-CSRF). | Inloggningen kräver `application/json`. | v20 S2/S3 |
| S9 | Låg | Felaktig %-kodning i adress eller cookie gav 500, fyllde fellistan och färgade översikten. En trasig cookie gav 500 på *varje* sida. | Ger 400. Trasiga cookievärden ignoreras. Avbrutna anrop räknas inte som serverfel. | v20 S1 |
| S10 | Låg | Svarstiden avslöjade vilka e-postadresser som har adminkonto (2 ms mot 59 ms). | Okända konton kontrolleras mot en dummy-hash så att svarstiden blir densamma. | – |
| S11 | Låg | Supportrollen såg översikten med fellogg, säkerhetskopior och godkännandereferenser. | Översikten kräver produktbehörighet. | v20 D1 |
| S12 | Låg | Ask Vera avslöjade att ett namn tillhör en dold produkt: "tell me about <dold>" gav ett annat svar än "tell me about <påhittat namn>". | Korta produktfrågor om okända namn får samma svar. Detta är bara delvis åtgärdat, se Risker. | v20 V1 |

### Dataintegritet

| # | Allvar | Fel | Åtgärd | Test |
| --- | --- | --- | --- | --- |
| A1 | **Kritisk** | Ett *nekat* "Make this text live" (bilden hade avvisats) skrev ändå in den ogranskade texten i minnet. Nästa orelaterade sparning lade den i databasen, utan version och utan audit. | `apply` kontrollerar allt först. Livetext, version, utkaststatus och compliance-flagga skrivs därefter i **en** SQLite-transaktion, och minnet uppdateras först när transaktionen lyckats. | v20 A1 |
| A2 | Hög | En misslyckad skrivning, t.ex. när ett underhållsskript låste databasen eller disken var full, lämnade minnet ändrat. Nästa skrivning sparade ändå den misslyckade ändringen. Även inloggning gav 500 under låsningen. | Väntar upp till 5 s på lås (busy timeout). Vid fel laddas dokumentet om från databasen, och svaret blir 503 med "Nothing was saved". | v20 A2 |
| A3 | Hög | Underhållsskript (KB-migrering, retention, restore) som kördes medan servern var igång skrevs tyst över av serverns nästa sparning. | Servern skriver `DATA_DIR/.server.pid`. Skripten vägrar skriva medan servern körs. | v20 A3/A4 |
| A4 | Hög | Första start med en tom `DATA_DIR` kraschade. Produktion kräver `DATA_DIR`, så en ny persistent disk kunde inte starta. | Startdata hämtas från den medföljande `data/`-mappen om den saknas i `DATA_DIR`. | v20 A3/A4 |
| A5 | Hög | Återställning tog inte tillbaka uppladdade dokument, och en saknad fil gav 500. | `restore-sqlite.mjs` återställer `<backup>-documents` och sparar den nuvarande mappen som `pre-restore-…`. En saknad fil ger ett tydligt 404. Retention städar även dokumentkopior. | v20 A3/A4 |
| A6 | Medel | Dokumentuppladdning gjorde flera separata skrivningar. Ett fel mitt i kunde lämna en fil utan post eller omgranskningsflaggor utan dokument. | Allt sparas i en transaktion. Vid fel tas den lagrade filen bort. | v20 D1 |
| A7 | Låg | Samma dokument kunde ersättas två gånger, vilket gav två "aktuella" versioner. | Bara den nyaste versionen kan ersättas (409). | v20 D1 |

### Innehåll och användarupplevelse

| # | Allvar | Fel | Åtgärd | Test |
| --- | --- | --- | --- | --- |
| C1 | **Hög (juridiskt)** | Den genererade flaskillustrationen skrev **"Research Use Only"** på *varje* produktkort och produktsida. Det är ett ogranskat juridiskt påstående. Texten fanns sedan v14.1-baslinjen. v19 flaggade samma etikett i oanvända PNG-filer men missade den i den publika grafiken. | Etiketten är borttagen. Att ta bort ett påstående ökar ingen risk. Bilder: `previews/v20/v19-vial-label.png` och `v20-vial-label.png`. | v20 C1 |
| C2 | Hög | Filer med `?v=` cachas som *immutable* i ett år, men versionerna sattes för hand och hade inte uppdaterats. `app.js`, `product-commerce.js` och `vera-client.js` ändrades i v19 men refererades som `?v=17.0`, och `vial-renderer.js` som `?v=12.6`. Återkommande besökare körde alltså gammal kod. | `scripts/asset-versions.mjs` sätter `?v` till filens innehållshash (56 referenser). En `--check` körs i CI. | v20 C1 + CI |
| C3 | Medel | Produktsidan laddades om vid *varje* händelse i hela butiken, även när en annan kund lade en order. En läsande besökare kastades då tillbaka till sidans topp. | Händelser i en följd kontrolleras en gång, och bara en ändring av just den produkten erbjuder "Refresh". | E2E `product_live_updates` |
| C4 | Medel | När sessionen gick ut mitt i ett utkast kom ett meddelande, men det gick inte att logga in utan att ladda om sidan, och då försvann texten. | Inloggningen visas direkt. Efter inloggning finns texten kvar och kan sparas. Bilder: `previews/v20/v19/v20-admin-session-expired.png`. | E2E `session_expiry` |
| C5 | Medel | Ask Vera nekade inte tydligt doseringsfrågor på svenska ("hur doserar jag", "hur ofta ska man ta"), tyska, spanska eller i leetspeak ("d0sage", "inj3ct"), och inte heller frågor om blandning eller bakteriostatiskt vatten. De fick reservsvaret. Inget medicinskt råd gavs, men vägran var otydlig. | Fler mönster och en kontroll mot "avmaskerad" text. 14 nya fall nekas, utan felaktiga vägringar bland vanliga frågor. | v20 V1 |
| C6 | Låg | Svenska frågor med stavfel ("leverns tid", "retrunera", "betalnig") fick inget svar. | Stavfelstolerans för den svenska ordlistan. | v20 V1 |
| C7 | Låg | En importrad utan produkt fick även felet "The draft does not change anything". | Bara det relevanta felet visas. | v20 I1 |
| C8 | Låg | Admin-rubriken hänvisade till "Review queue", men fliken heter "Changes to review". | Texten är rättad. | – |

### Justerat befintligt test

`tests/v141.test.mjs` loggade in två gånger med *samma* TOTP-kod inom samma 30-sekundersfönster. Det är precis den återanvändning som S7 stoppar. Testet kontrollerar nu dessutom att återanvändningen **nekas** och loggar in med nästa giltiga kod. Testets syfte, att återinloggning med TOTP fungerar, är oförändrat.

---

## 2. Identifierade risker som återstår

| Risk | Allvar | Varför den inte åtgärdats här |
| --- | --- | --- |
| **Produktionen kör troligen fortfarande kod med S1** (källkod och dolda produkter går att hämta) | Kritisk tills v20 driftsätts | Driftsättning kräver ditt godkännande. Repot är dessutom publikt, så samma uppgifter finns redan på GitHub. |
| Ändrade startfiler (t.ex. katalog och översättningar) når aldrig en befintlig databas, eftersom de bara används som startdata | Medel | Kräver ett migreringsbeslut per datatyp. Bara kunskapsbasen har en migrering i dag. Rekommendation: visa "levererad data skiljer sig från databasen" i översikten och erbjud en granskad migrering. |
| Ask Vera: "<dolt namn> price" och "<påhittat namn> price" ger olika svar | Låg | Fullständig utjämning skulle kräva att v18-testerna för läkemedelsnamn ändras. Namnen finns ändå i det publika repot. |
| Två SSE-anslutningar per sida (`cart.js` + sidans skript). Ingen gräns per IP. | Låg | Kräver omstrukturering av klientskripten. Rekommenderas till nästa version. |
| Uppladdningar buffras helt i minnet (15 MB vardera, inget tak för samtidiga) | Låg | Kräver inloggning. Mätt: 4 samtidiga uppladdningar på 5 MB fungerar bra. |
| Kontolåsning (10 försök per 15 min per konto) kan missbrukas från många IP-adresser | Låg | En avvägning mellan skydd mot gissning och tillgänglighet. Bör ses över när MFA är obligatoriskt. |
| Referenspris (€) visas för produkter som inte kan beställas, medan Veras godkända svar säger att priset visas "när den kan beställas" | Innehåll | Ägarbeslut: dölj referenspriset eller ändra Vera-svaret. |
| Förtroenderaden säger "Lab reports where available", men ingen rapport är publicerad | Innehåll | Ägarbeslut (fanns redan i v19-listan). |

---

## 3. Förbättringsförslag (inte genomförda)

- **Döda delar att ta bort efter ditt OK:**
  - `assets/guide-fallback.js` (refereras inte någonstans).
  - API-vägar utan anropare: `/api/admin/audit`, `/api/admin/me/mfa/disable`, `/api/admin/me/mfa/recovery-codes` och `/api/product-content`.
  - CSS-källfilerna `v7.css`–`v19.css` serveras publikt fast bara buntarna används.
- **En gemensam live-anslutning per sida** med fördröjd uppdatering. Det minskar belastningen när många har sidan öppen.
- **Storefront-svaret kan cachas** per revision. Mätt kapacitet är cirka 260 anrop/s. Det behövs inte nu, men är enkelt om trafiken växer.
- **Bekräfta borttagning av oanvända bildfiler** (cirka 3,9 MB, se v19).
- **Footerlänkar på mobil** är 22 px höga. De klarar WCAG via avstånd, men 44 px vore bekvämare.

---

## 4. Externa beslut som krävs

Se `V20-SECURITY-REPORT.md` och `V20-LAUNCH-BLOCKERS.md`. I prioritetsordning:

1. **Driftsätt en version med S1-rättelsen**, eller stäng den publika tjänsten tills dess. Kräver ditt godkännande.
2. **Gör GitHub-repot privat.** Det är fortfarande publikt (kontrollerat i dag).
3. **Vercel `lup-hjalp`:** `DATABASE_URL` och `ADMIN_PASSWORD` gäller fortfarande även preview-byggen. Begränsa dem till production och rotera lösenordet.
4. **Render:** kunde inte nås härifrån. Kontrollera `PUBLICATION_GATE` och `TRUST_PROXY=1`, och att versionen är ≥ 20 efter driftsättning.
5. **Gamla audit-loggar:** rensningsverktyget (v18) har aldrig körts mot produktionsdatabasen.

---

## 5. Funktioner som testats utan att problem hittats

- **Uppladdning:**
  - Gränsen på 15 MB upprätthålls medan filen strömmar in (17 MB ger 413).
  - Filtypen kontrolleras på innehållet.
  - En polyglot-fil (PNG/HTML) är ofarlig: den laddas ned som bilaga med `nosniff` och `CSP sandbox`.
  - Filnamnen genereras av servern.
  - Ett annat produkts dokument ger 404.
  - Ett avbrutet anrop lämnar ingen fil kvar (lasttestet).
- **Roller:**
  - CSRF kontrolleras på alla ändrande anrop.
  - Godkännande för publicering och försäljning kräver ägare och bekräftelsefras.
  - Admin kan inte nå användarhanteringen.
  - Import skapar bara utkast.
- **Stored XSS:** alla HTML-insättningar i admin- och butiksskripten escapar värdena (granskat).
- **Ask Vera:**
  - Ingen ReDoS (värsta inmatningen på 500 tecken tog cirka 3 ms).
  - Dolda produkter syns inte i någon publik data.
  - Inga medicinska råd ges i något av de 40+ testade fallen.
- **Lager:** reservationen görs synkront, så två samtidiga ordrar kan inte överboka. Ordrar och lager sparas i en transaktion.
- **Säkerhetskopiering:** konsekvent kopia, integritetskontroll och dokumentmappen kommer med.
- **Mobil, surfplatta och desktop:** ingen horisontell scroll på tio publika sidor i tre bredder, inga suddiga bilder, synlig fokusring vid tangentbordsnavigering (25/25 stopp).
- **Scenarier** (simulerade, se nedan): sökning och sparande på mobil, Vera, köpförsök, produktguide på surfplatta, orderspårning, tangentbord, gammalt formulär i en andra flik (rätt felmeddelande), fel filtyp, redaktörens vy, felaktig import, granskning på mobil.

## Om de simulerade testerna

Användarscenarierna och "personerna" är **skriptade simuleringar**, inte riktiga användare. De hittar tekniska och strukturella hinder, som knappar som inte går att trycka på, förlorad text och vilseledande meddelanden. De säger inget om hur verkliga kunder eller administratörer upplever sidan. En kort test med två eller tre riktiga personer rekommenderas innan lansering.

## Testresultat v20

| Svit | v19 | v20 |
| --- | --- | --- |
| Enhets- och API-tester | 97 | **108** (alla gröna; 11 nya, alla fallerar mot v19) |
| Webbläsartester inkl. axe | 20 | **22** (alla gröna; 2 nya, båda fallerar mot v19) |
| Statisk validering, CSS-buntar, cache-versioner, hemlighetsskanning | grön | grön |
| Lasttest | – | se `V20-PERFORMANCE-REPORT.md` |
