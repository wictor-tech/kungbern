# Lanseringsblockerare och ägarbeslut (v18)

`/api/ready` rapporterar **20 blockerare** när `DATA_DIR` saknas och **19** när `DATA_DIR` är satt, som i v17-mätningen. **Inga kontroller har tagits bort eller försvagats.** Från v18 får varje blockerare också en kategori och en åtgärd (`blockerDetails` i `/api/ready` och Admin → System status). En blockerare räknas som löst först när kravet bakom den faktiskt är uppfyllt.

## Kategorisering

| # | Blockerare | Kategori | Åtgärd |
| --- | --- | --- | --- |
| 1 | Persistent DATA_DIR saknas | Driftkonfiguration | Persistent disk + `DATA_DIR` |
| 2 | Kvittens på persistent lagring saknas | Driftkonfiguration | `PRODUCTION_PERSISTENCE_ACK=true` efter punkt 1 |
| 3 | Inget produktionslösenord för admin | Driftkonfiguration | Starkt `ADMIN_PASSWORD` som hemlighet |
| 4 | Ägar- eller adminkonto utan MFA | Ägaråtgärd | Logga in och registrera autentiserare |
| 5 | `MFA_ENCRYPTION_KEY` saknas eller är svag | Driftkonfiguration | Slumpad nyckel på minst 32 tecken, sedan ny MFA-registrering |
| 6 | `BASE_URL` är inte HTTPS | Driftkonfiguration | Slutlig https-adress |
| 7 | Skatt/moms inte godkänd | Ägarbeslut (med revisor) | Momshantering per land |
| 8 | E-post i lokalt utkorgsläge | Driftkonfiguration | E-postleverantör med biträdesavtal |
| 9 | Stripe live saknas | Driftkonfiguration, *efter juridiskt godkännande* | Live-nycklar som hemlighet |
| 10 | Stripe webhook-hemlighet saknas | Driftkonfiguration, *efter juridiskt godkännande* | Webhook-hemlighet |
| 11 | `COMMERCE_ALLOWLIST` tom | Ägarbeslut, sista steget | Godkända varianter |
| 12 | `ENABLE_LIVE_COMMERCE` av | Ägarbeslut, sista steget | — |
| 13 | Kvittens för live-handel saknas | Ägarbeslut, sista steget | — |
| 14 | Ingen produkt med komplett innehåll och livegodkännande | Externa dokument | Verifierade texter, labbrapporter, ägargodkännande |
| 15 | Ingen produkt med compliance-godkännande | Juridisk bedömning | Klassificering per produkt och marknad |
| 16 | Företagsidentitet ofullständig | Ägaråtgärd | Juridiskt namn, organisationsnummer, adress |
| 17 | Integritetsgranskning saknas | Juridisk bedömning | Integritetspolicy, register, konsekvensbedömning (DPIA) |
| 18 | Granskning av villkor/konsumenträtt saknas | Juridisk bedömning | Köpvillkor, ångerrätt, retur |
| 19 | Generalrepetition av produktionskassa saknas | Ägaråtgärd, sist | Testköp i produktion |
| 20 | Databasbeslut (hanterad DB eller SQLite-undantag) | Ägarbeslut, därefter tekniskt projekt | PostgreSQL-migrering eller dokumenterat undantag |

**Tekniskt lösbara nu, utan att kringgå en kontroll: 0.** Varje blockerare kräver konfiguration i hostingmiljön, ett beslut, ett dokument eller en juridisk bedömning. Databasmigreringen (#20) är ett tekniskt projekt, men den förutsätter ett beslut och en riktig databasinstans.

**Ytterligare blockerare utanför `/api/ready`** (från v17/v18-rapporterna):
- repot är publikt med konfidentiell katalog och priser
- `lup-hjalp`:s preview har produktionsdatabasens behörigheter
- etiketten "Research Use Only" och produktfinderns hälsogrupper har inte bedömts juridiskt
- gamla granskningsloggar har inte rensats
- ingen extern säkerhetsgranskning har gjorts

## Prioriterade ägarbeslut

| Prio | Beslut | Varför nu | Effekt |
| --- | --- | --- | --- |
| **1** | Gör repot `wictor-tech/kungbern` privat, eller flytta VERAPEP till ett eget privat repo | Dold katalog, leverantörspriser och interna rapporter är publika i dag | Stoppar fortsatt exponering |
| **2** | Sätt `PUBLICATION_GATE=strict` i den körande Render-tjänsten, eller driftsätt v18 där | En äldre version kan visa ogranskade produkter publikt | Bara godkända produkter syns |
| **3** | Isolera `lup-hjalp`: eget repo eller ignored build step, och ta bort *preview* som mål för produktionshemligheterna | Preview-byggen har produktionsdatabasens behörigheter; dessutom ger varje VERAPEP-PR ett rött Vercel-fel | Mindre risk, ren PR-status |
| **4** | Uppdra åt en jurist att klassificera de 84 produkterna (underlag: `docs/v17/PRODUCT-COMPLIANCE-INVENTORY.csv`) | Utan klassificering kan ingenting publiceras | Låser upp blockerare 14–15 |
| **5** | Lämna företagsuppgifter och kontaktpersoner | Krävs för villkor, integritet och Vera | Blockerare 16 |
| **6** | Godkänn att `scrub-audit-log` körs mot produktion (först dry-run på en kopia) | Gamla lösenordshashar i loggen | Mindre läckagerisk |
| **7** | Godkänn lagringstider (`RETENTION.md`) | Krävs för GDPR | Gallringsverktyget kan aktiveras |
| **8** | Granskningsordning och huvudgren för VERAPEP (`V18-REPOSITORY-AND-DEPLOYMENT.md` §3) | PR #1 → #2 → #3 bygger på varandra | Spårbar integration |
| **9** | Obligatorisk CI-kontroll, Secret Scanning och Push Protection | Hindrar regressioner och läckor | — |
| **10** | Beslut om "Research Use Only" och produktfinderns hälsogrupper | Regulatorisk risk i presentationen | — |
