# VERAPEP v17 – lanseringsberedskap

## Status: **INTE GODKÄND FÖR LANSERING**

Det finns blockerande juridiska och säkerhetsmässiga frågor som inte kan lösas tekniskt. Etiketten "Pending legal review" på sajten är ingen granskning, bara en markering om att granskningen återstår.

Systemet visar själv samma bedömning:
- `GET /api/ready` svarar `503` och `ready: false`.
- Admin → **System status** listar 19 blockerare i en förhandsmiljö.

### Blockerande innan något publiceras eller säljs

1. **Ingen av de 84 produkterna har en juridisk klassificering eller ett publiceringsgodkännande.**
   - 44 produkter har namn som pekar på receptbelagda läkemedel, hormoner, toxiner eller substanser i klinisk prövning.
   - Övriga 40 är farmakologiskt aktiva substanser vars status inte är verifierad.
   - 81 av 84 säljs i injektionsflaskor och saknar angivet användningsområde.
   - Se `docs/v17/PRODUCT-COMPLIANCE-INVENTORY.md`.
2. **Villkor, integritetspolicy samt leverans- och returvillkor är inte skrivna eller godkända.**
3. **Företagsidentitet saknas.** Juridiskt namn, organisationsnummer och adress är inte angivna.
4. **Rättslig grund för behandling av uppgifter som kan avslöja hälsa (GDPR art. 9)** via order och recensioner är inte bedömd.
5. **Ingen extern säkerhetsgranskning** av driftsmiljön har gjorts.
6. **Driftkrav i `/api/ready`** saknas: HTTPS-adress, MFA för alla ägare och administratörer, krypteringsnyckel, e-postleverantör, skattekonfiguration, Stripe live samt beslut om databas.
7. **Granskningsloggen i befintliga databaser** kan innehålla lösenordshashar och kunduppgifter från tidigare versioner. Den behöver rensas efter backup, med godkännande (`V17-SECURITY-REPORT.md` R2).

---

## 1. Tekniskt färdigt (implementerat och verifierat)

| Område | Vad | Verifiering |
| --- | --- | --- |
| Granskningsflöde | Statusarna *Not reviewed*, *Needs evidence*, *In legal review*, *Approved for specific publication* och *Do not publish*. Godkännande kan bara göras av ägaren och kräver extern granskningsreferens, namngiven granskare, omfattning (endast information, eller information och försäljning), marknader och en skriven bekräftelse. Historiken bevaras och allt loggas. | `tests/v17.test.mjs`, E2E `admin_compliance` |
| AI-förslag är aldrig beslut | En namnbaserad riskindikator föreslår en status och förklarar varför. Den kan inte sätta en status. Massändringar kan aldrig godkänna, och de kräver bekräftelse av antal samt en motivering. | Unit |
| Säker standard | Produkter med hög indikator är dolda tills de godkänts. I produktion (strikt läge) visas bara godkända produkter. Det gäller sidor, sökning, guiden, sitemap, API:er, recensioner, Ask Vera och varukorg. | Unit och E2E `publication_gate` |
| Inga genvägar | Att döpa om en produkt eller lägga till ett alias som "semaglutide alternative" döljer produkten i stället för att kringgå filtret. Statusen `live_approved` kan inte sättas direkt. Försäljning kräver godkännande med omfattningen *sale* för rätt land. | Unit |
| Betalning och order avstängda | 0 produkter kan beställas. Sandbox-försäljning kräver numera också ett godkännande. Om ett godkännande återkallas stängs försäljningen automatiskt. | Unit och E2E `cart_states` |
| Ask Vera | Säkerhetsspärr mot medicinska frågor och doseringsfrågor, svenska synonymer, produktfakta, ärligt reservsvar, ingen lagring av frågor, rate limiting, laddnings- och feltillstånd. | `V17-ASK-VERA.md`, unit och E2E `vera` |
| Migrering av kunskapsbasen | Dry-run, backup, apply, idempotens och rollback. Egna och låsta svar bevaras. | Unit och CLI |
| Säkerhet | Stängd publik filyta, ingen statisk katalogläcka, sanerade adminsvar och logg, proxymedveten rate limiting, länkvalidering, inga rättighetsutökningar via sidoeffekter. | `V17-SECURITY-REPORT.md` |
| Backup och återställning | `npm run backup:sqlite` och `npm run restore:sqlite`; återställningsövningen är automatiserad. | Unit |
| Admin | Nya vyer för systemstatus, compliance-granskning och strukturerad redigering av Veras kunskap; senaste serverfel visas. | E2E |
| Användbarhet | Synlig kontaktsektion; mobilsökning i menyn rättad; katalogen visar laddnings- och feltillstånd; siffror visar det som faktiskt listas. | Personor 16/16 (simulerade) |
| Tester | Unit 73/73, E2E 16/16 (inklusive axe WCAG 2.2 AA: 0 allvarliga eller kritiska fel), statisk validering och CSS-kontroll godkända. | `npm run test:all` |

## 2. Kräver företagsinformation (från ägaren)

| Uppgift | Var den används | Hur den anges |
| --- | --- | --- |
| Juridiskt bolagsnamn, organisationsnummer, adress | Villkor, integritet, kontakt, Vera ("who is behind") | `COMPANY_LEGAL_NAME`, `COMPANY_REGISTRATION_NUMBER`, `COMPANY_ADDRESS` |
| Supportadress och adress för integritetsfrågor (bekräftade, bevakade) | Kontaktsektion, Vera, juridiska sidor | `SUPPORT_EMAIL`, `PRIVACY_EMAIL` |
| Ansvarig för integritetsfrågor (personuppgiftsansvarig och kontaktperson) | Integritetspolicy, `PRIVACY-DATA-REGISTER-V14.1.md` | Dokument |
| Leverantörer (hosting, e-post, betalning, frakt) och personuppgiftsbiträdesavtal | Integritetspolicy | Dokument |
| Verklig leveranstid, fraktkostnad, länder och returadress | Leverans och retur, Vera | Admin → Store settings / `store-config.json` |
| Moms- och skattekonfiguration | Kassa | `store-config.json` (`tax.configured`) |

## 3. Kräver juridisk granskning

| Fråga | Varför |
| --- | --- |
| **Klassificering av varje produkt** (läkemedel, medicinteknik, kosmetika, kemikalie, narkotika- eller dopningsklassad) per marknad | Avgör om produkten får visas, marknadsföras eller säljas alls. Underlag finns i inventeringen. |
| **Etiketten "Research Use Only" på produktbilderna** (`assets/vial-renderer.js`) | En sådan etikett ändrar inte en produkts rättsliga status. Om den används för att sälja till privatpersoner kan den uppfattas som ett försök att kringgå regelverk. **Jag har inte tagit bort den**, eftersom det är ett beslut om produktpresentationen, men den ska granskas. |
| **Produktfindern och guiden grupperar efter hälsomål** ("Weight & metabolism", "Strength & recovery", "Sleep & focus", "Healthy ageing", "Hormonal & specialist") | Gruppering efter hälsoeffekt kan räknas som medicinsk presentation, även med friskrivning. Vera använder inte längre dessa filter, men startsidan och guiden gör det. |
| Allmänna villkor, ångerrätt och retur, integritetspolicy, cookie- och lagringsinformation | Får inte publiceras som godkända innan de granskats. Sidorna visar i dag endast konfigurerade fakta. |
| Marknadsföringstexter: hero, trust bar ("Lab reports where available" när 0 rapporter finns), produktkort | Påståenden måste vara belagda. Några överdrivna texter är borttagna i v16 och v17; trust bar styrs från admin och bör ses över. |
| Personuppgifter som kan avslöja hälsa (GDPR art. 9) via order och recensioner | Rättslig grund, konsekvensbedömning (DPIA) och lagringstider. |
| Recensioner av produkter som kan vara läkemedel | Kundomdömen om effekt kan utgöra otillåten marknadsföring. Överväg att stänga av recensioner för vissa produkter. |
| Exportkontroll och tull, mottagarkrav (B2B/B2C) | Beror på klassificeringen. |

## 4. Kräver externa dokument

| Dokument | För vilka produkter | Status |
| --- | --- | --- |
| Analysintyg (COA) per batch från ackrediterat laboratorium | Alla som ska publiceras | 0 av 84 publicerade |
| Leverantörsdokumentation: tillverkare, GMP/ISO, ursprung, säkerhetsdatablad | Alla | Saknas |
| Godkänd produkttext: beskrivning, avsett användningsområde, förvaring, varningar | Alla | 0 av 84 har verifierat innehåll |
| Juridiskt utlåtande per produkt och marknad (referens anges vid godkännande) | Alla | Saknas |
| Godkända villkor och policyer | Sajten | Saknas |
| Rapport från penetrationstest eller extern säkerhetsgranskning | Driftsmiljön | Saknas |

Inget av detta har skapats eller fyllts i med påhittat innehåll.

## 5. Kräver beslut (bör inte avgöras automatiskt)

| Beslut | Alternativ och rekommendation |
| --- | --- |
| Ska preview-miljön visa ogranskade produkter med lägre risk? | I dag visas 40 med märkningen "Information only". **Rekommendation:** sätt `PUBLICATION_GATE=strict` om preview-adressen delas utanför teamet. |
| Vilka produkter ska få "Do not publish" direkt? | Inventeringen föreslår "Needs evidence" för alla. Ett snabbt ägarbeslut om att dölja t.ex. insulin, EPO, botulinumtoxin och opioidpeptider minskar risken även i preview. |
| Hälsogrupperingen i finder och guide | Behåll med juridisk granskning, ersätt med neutrala kategorier (substansklass) eller ta bort. |
| "Research Use Only"-etiketten | Juridisk bedömning först, se ovan. |
| Ska obesvarade Vera-frågor sparas för förbättring? | I dag sparas bara räknare. Att spara text kräver samtycke, filtrering av personuppgifter och en lagringstid. Rekommendation: inte före lansering. |
| Lagringstider för order, utkorg, granskningslogg och backuper | Förslag finns i `V17-SECURITY-REPORT.md` §4. |
| Rensning av gamla granskningsloggar (hashar och kunddata) | Godkänn engångsrensning efter backup. |
| GET-orderåtkomst med e-post i URL | Fasa ut till förmån för POST-uppslag (API-ändring). |
| Databas i produktion | Hanterad databas eller uttryckligt SQLite-undantag (`ALLOW_SQLITE_PRODUCTION`). |
| Uppdatering av kunskapsbasen i befintlig databas | Kör dry-run, granska planen och tillämpa via Admin → Guide & AI → Knowledge updates. Görs aldrig automatiskt. |
| `TRUST_PROXY=true` på Render | Krävs för att rate limiting ska fungera per klient bakom Renders proxy. Ändra i Render-miljön. |

## Driftsättning

Inget har driftsatts eller slagits samman. v17 ligger på en egen gren med ett draft-PR. **Ingen produktionsdata har ändrats.**
