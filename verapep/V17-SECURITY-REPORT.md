# VERAPEP v17 – säkerhets- och integritetsrapport

**Omfattning.** Granskningen gäller koden i `server.mjs`, `database.mjs`, `lib/`, `assets/*.js`, skripten och konfigurationen i v16. Den gjordes genom kodgranskning och riktade tester mot en lokal server med testdatabas.

**Avgränsningar.** Ingen produktionsmiljö, verklig användardata eller betalleverantör har använts eller ändrats. Detta är inte ett penetrationstest av driftsmiljön (Render, DNS, TLS, hosting) och ersätter inte en extern säkerhetsgranskning före lansering.

**Allvarlighetsgrad:** Hög, Medel, Låg, Info.

## 1. Åtgärdade fynd

| # | Fynd | Allvar | Åtgärd i v17 | Verifiering |
| --- | --- | --- | --- | --- |
| S1 | **Serverns källkod och interna filer gick att ladda ner publikt.** Det gällde `/server.mjs`, `/database.mjs`, `/package.json`, `/scripts/*`, `/tests/*`, `/sql/*`, interna `*.md`- och `*.csv`-rapporter samt `docs/`. Bara `data/` och punktfiler var blockerade. | Hög | Den statiska serveringen är nu en tillåtelselista: toppnivåns `*.html`, `/assets/**`, `/product/…`, `robots.txt` och `sitemap.xml`. Allt annat ger 404. | `v17.test.mjs` (14 sökvägar) och E2E `publication_gate` |
| S2 | **Hela katalogen låg i en statisk fil.** `assets/catalogue-data.js` innehöll alla 84 produkter med varianter och USD-källpriser. Den laddades på startsidan, oberoende av publicering. | Hög | Källfilen är flyttad till `scripts/source/` och serveras inte. Den publika filen innehåller bara kategorinamn. Produkter kommer enbart från `/api/storefront`, som tillämpar publiceringsreglerna. Katalogen har nu laddnings- och feltillstånd. | Unit och E2E |
| S3 | **Opublicerat innehåll exponerades via API.** `/api/product-content` returnerade innehåll för *alla* produkter, även utkast och arkiverade. | Medel | Endast publikt synliga produkter returneras, och samma sak gäller godkända recensioner. | `v17.test.mjs` |
| S4 | **Lösenordshashar och MFA-hemligheter läckte.** Hasharna fanns i svaret när en adminanvändare skapades eller uppdaterades, och de skrevs till granskningsloggen (som också ingår i exporten). Om MFA var aktiverad följde även MFA-fröet med. | Hög | Svar och logg saneras nu (`sanitiseAdminUser`); loggen visar bara `passwordChanged: true/false`. **Befintliga loggrader från tidigare versioner kan fortfarande innehålla hashar.** Se R2. | `v17.test.mjs` |
| S5 | **Rate limiting fungerade inte bakom proxy.** Alla anrop kom från proxyns adress, så gränserna blev globala: en användare kunde låsa ute alla. | Medel | `TRUST_PROXY=true` gör att klientadressen läses från `X-Forwarded-For`. Inställningen är dokumenterad i `.env.example`. | Kodgranskning |
| S6 | **Hastighetsbegränsning saknades** för Ask Vera, recensioner, guiden och orderåtkomst via e-post. | Medel | Nya gränser: Vera 30/min, recensioner 5/15 min, guiden 120/min, `GET /api/orders/:id?email=` 30/15 min. Dessutom en gräns på 10/15 min för inloggning per *konto*, utöver den per IP. Utgångna buckets rensas, så minnet inte kan växa obegränsat. | `v17.test.mjs` (Vera 429) |
| S7 | **Lagrad XSS via länkar som admin anger.** `javascript:`-länkar i kunskapsbasen, labbrapporter och bild-URL:er renderades för besökare. CSP:n `script-src 'self'` stoppar körningen i moderna webbläsare, men data ska inte vara osäker. | Medel | `safePublicUrl()` tillåter bara sidvägar, `https:` och (för kunskapsbasen) `mailto:`. Vera-klienten validerar också länkar innan de renderas. | `v17.test.mjs` |
| S8 | **Rättighetsutökning via sidoeffekt.** Rollen *editor* (utan rättigheten `settings`) kunde slå på butiksgemensam kassa genom snabbknappen "Enable webshop". Statusen `live_approved` kunde också sättas via `PATCH /api/admin/products/:id`. | Medel | Kassaläget ändras bara av roller med `settings`. Commerce-statusen är begränsad till en tillåtelselista. Liveförsäljning krävde redan liveEnabled och ägarbeslut, och gör det fortfarande. | `v17.test.mjs` |
| S9 | **Försäljning utan juridiskt godkännande.** Sandbox-försäljning kunde slås på för vilken produkt som helst. | Hög (regulatoriskt) | All försäljning (sandbox och live), varukorg, order och Stripe kräver nu ett registrerat ägargodkännande med omfattningen *sale* för det aktuella landet. Se `V17-LAUNCH-READINESS.md`. | `v17.test.mjs` |
| S10 | **Personuppgifter i publicerade recensioner.** Fritext publiceras efter moderering. | Låg | E-postadresser och telefonnummer i recensioner avvisas med en förklaring. Datum avvisas inte. | `v17.test.mjs` |

## 2. Kontrollerade områden utan nya fynd

| Område | Bedömning |
| --- | --- |
| Autentisering | scrypt med salt och tidskonstant jämförelse. TOTP-MFA per användare, krypterat frö (AES-256-GCM) när `MFA_ENCRYPTION_KEY` är satt, och engångs-återställningskoder som bara lagras som hashar. I produktion krävs MFA och ett starkt lösenord, annars startar inte servern. |
| Sessionshantering | 32 bytes slumpmässig token i minnet. 8 timmar glidande giltighetstid. Cookien är `HttpOnly; SameSite=Strict`, och `Secure` sätts vid HTTPS via `x-forwarded-proto`. Sessioner försvinner vid omstart (acceptabelt). Ingen samtidighetsgräns per användare. |
| Behörigheter | Rollkontroll på serversidan i varje admin-endpoint (`requireRole`). Ägarbeslut (liveförsäljning, publiceringsgodkännande, användare) kontrolleras separat. |
| CSRF | Alla muterande admin-anrop kräver `X-CSRF-Token`, som jämförs med sessionen i konstant tid. Cookien är `SameSite=Strict`. Utloggning saknar token, men det är ofarligt. |
| XSS | Strikt CSP: `script-src 'self'`, `frame-ancestors 'none'`, inga inline-skript. Klientkoden escapar dynamiskt innehåll. `style-src 'unsafe-inline'` finns kvar (låg risk). |
| SQL-injektion | Alla frågor är förberedda (prepared statements). Den enda strängsammansatta satsen är `VACUUM INTO`, med servergenererad sökväg och escapade citattecken. |
| Hemligheter | Läses från miljövariabler. `.env` serveras inte och ignoreras av git. Inga hemligheter i repot. Standardlösenordet `ChangeMe-123!` blockeras i produktion. |
| Loggning | `console.error` bara vid 5xx (stacktrace, utan request-body). Monitorering skickar metod, sökväg och felkod. Nytt: admin visar de senaste 50 serverfelen (metod, sökväg, kod), utan personuppgifter. |
| Beroenden | `package.json` har **inga** npm-beroenden, så det finns inga kända sårbarheter att rapportera från `npm audit`. Körmiljön är Node 22 (`node:sqlite` är experimentellt i Node 22). Testverktygen (Playwright, axe-core 4.10 vendored) körs inte i produktion. |
| Filuppladdning | Det finns ingen uppladdningsfunktion; bilder och rapporter anges som URL:er. Sökvägar till statiska filer normaliseras och kontrolleras mot rotkatalogen. |
| Betalningar | Stripe-webhooken verifieras med HMAC och 5 minuters tolerans, och händelser dedupliceras. Kortdata hanteras aldrig av VERAPEP. Mock-betalning är spärrad i live-läge. |

## 3. Kvarstående risker och rekommendationer

| # | Risk | Rekommendation | Prioritet |
| --- | --- | --- | --- |
| R1 | Orderåtkomst med ordernummer och e-post via `GET …?email=` gör att e-postadressen hamnar i åtkomstloggar och webbläsarhistorik. | Flytta till POST (finns redan: `/api/orders/lookup`) och fasa ut GET-varianten. Det är en API-ändring och kräver beslut. | Medel |
| R2 | Granskningsloggen i befintliga databaser kan innehålla lösenordshashar från versioner före v17. Den innehåller också hela orderobjekt med personuppgifter, utan gallring. | Kör en engångsrensning efter backup (`UPDATE audit_log …` på `admin_user.*`-rader) och inför gallring/pseudonymisering efter beslutad lagringstid. **Inte gjort**, eftersom produktionsdata inte ska ändras utan godkännande. | Hög före lansering |
| R3 | SQLite med en instans och sessioner i minnet. | Se `PRODUCTION-CHECKLIST-V14.md`: hanterad databas eller ett uttryckligt SQLite-undantag, och regelbundet återställningstest. | Medel |
| R4 | Inget skydd mot automatiserad inloggning utöver rate limiting (ingen CAPTCHA eller låsning med avisering). | MFA krävs i produktion. Överväg avisering vid många misslyckade försök. | Låg |
| R5 | `style-src 'unsafe-inline'` i CSP. | Flytta inline-stilar till klasser när designen stabiliserats. | Låg |
| R6 | Utgående e-post sparas som JSON-filer i `outbox/` utan gallring. | Gallra efter beslutad tid, t.ex. 90 dagar. | Medel |
| R7 | Ingen extern säkerhetsgranskning eller penetrationstest av driftsmiljön. | Genomför före publik lansering. | Hög före lansering |

## 4. Personuppgifter som behandlas

| Flöde | Uppgifter | Var | Känslighet | Skydd i v17 | Föreslagen lagring |
| --- | --- | --- | --- | --- | --- |
| Order (när beställning är möjlig) | Namn, e-post, telefon, adress, varor | SQLite `orders` | Normal, men varorna kan avslöja hälsa (se nedan) | Åtkomst med token eller e-post plus ordernummer, rate limiting, export för registerutdrag | Räkenskapsinformation sparas enligt bokföringsregler (i Sverige normalt 7 år; bekräfta med revisor/jurist), övrigt kortare |
| Retur och ånger | Ordernummer, e-post, fritext | SQLite | Fritext kan innehålla hälsouppgifter | Sparas bara efter betald order | Som order |
| Recensioner | Visningsnamn, betyg, fritext | SQLite (publiceras efter moderering) | **Risk för hälsouppgifter** | Kontaktuppgifter blockeras, uppmaning att inte ange hälsodetaljer, moderering före publicering | Tills borttagning; avvisade recensioner 90 dagar |
| Ask Vera | Fritextfråga | **Behandlas bara i minnet** | **Hög risk för hälsouppgifter** | Lagras inte och loggas inte (verifierat i test). Varning om personuppgifter. Hälsofrågor besvaras inte. Anonyma räknare. | Ingen lagring |
| Produktguide och "My pages" | Valda intresseområden, sparade produkter | Besökarens webbläsare (localStorage); guideval skickas till servern utan att sparas | Intresseområden som "Weight & metabolism" kan avslöja hälsointressen | Stannar lokalt | Användaren rensar själv |
| E-postutkorg | Mottagare, ämne, innehåll | `outbox/*.json` | Normal | Ingen hälsoinformation i ämnesrader | 90 dagar (föreslås) |
| Granskningslogg | Admins e-post, ändringar, orderobjekt | SQLite `audit_log` | Innehåller kunduppgifter | Hemligheter sanerade från v17 | 2 år, med pseudonymisering av kunduppgifter (föreslås) |
| Admin | E-post, roll, hash, MFA | SQLite | Säkerhetskritisk | scrypt, krypterat MFA-frö, sanerade svar | Under anställning/åtkomst |
| Driftloggar | IP, sökväg, felkod | Hosting | Normal | Inga bodies loggas | 30 dagar (föreslås) |

**Hälsouppgifter (artikel 9 i GDPR).** Själva sortimentet kan göra en order eller recension till en indirekt hälsouppgift, eftersom den avslöjar vad någon köper eller använder. Det kräver en juridisk bedömning av rättslig grund och skyddsåtgärder innan beställningar öppnas. Vera och recensionerna är utformade för att *inte* samla in sådana uppgifter. Dataminimeringen i v17 är tekniskt verifierad, men bedömningen är inte gjord.

## 5. Återställningsövning (utförd)

Övningen gjordes på en testdatabas, aldrig på produktion. Den är automatiserad i `tests/v17.test.mjs` ("backup and restore drill") och körs vid varje `npm test`:

1. Servern startades och butiksnamnet ändrades till "Before backup".
2. `npm run backup:sqlite` skapade en kopia med `VACUUM INTO`, och `integrity_check` gav `ok`.
3. Butiksnamnet ändrades till "After backup", och servern stoppades.
4. `node scripts/restore-sqlite.mjs <backup>` (dry-run) validerade kopian.
5. `node scripts/restore-sqlite.mjs <backup> --yes` sparade först den aktuella databasen som `pre-restore-*.sqlite`, tog bort WAL/SHM-filerna och återställde.
6. Efter omstart var butiksnamnet "Before backup" och admininloggningen fungerade.
7. En korrupt fil avvisades (integritets- och schemakontroll).

**Tid:** hela övningen inklusive två serverstarter tar cirka en sekund på testdatabasen. **Rekommendation:** upprepa övningen månadsvis på en kopia av produktionsbackupen och dokumentera tid och resultat.
