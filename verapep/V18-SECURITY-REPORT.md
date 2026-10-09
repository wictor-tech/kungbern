# VERAPEP v18 – säkerhetsrapport

**Granskat:**
- repot `wictor-tech/kungbern`: alla 9 fjärrgrenar, 60 commits och 705 filer som någon gång lagts till
- Vercel-projektet `lup-hjalp`
- VERAPEP-koden på grenen `claude/verapep-v17`

**Utgångspunkter för granskningen:**
- Inga hemlighetsvärden återges här.
- Repots synlighet är inte ändrad, Git-historiken är inte omskriven och inga hemligheter har roterats.
- Inga Vercel- eller Render-inställningar har ändrats.

## 1. Sammanfattning

| Fråga | Svar |
| --- | --- |
| Finns aktiva hemligheter i repot eller historiken? | **Nej.** Ingen träff på 15 mönster för nycklar, tokens, privata nycklar, databas-URL:er med lösenord, JWT eller lösenordshashar. Det gäller både arbetskatalogen och varje tillagd rad i hela historiken. Alla förekomster av `ADMIN_PASSWORD`, `SESSION_SECRET` och `LUP_DEMO_*` är platshållare (t.ex. `ChangeMe-123!`, `byt-…`, `…`). |
| Databaser, `.env`, nyckelfiler, Excel-källfiler? | **Inga** har någonsin committats. Det finns bara två `.env.example`-filer med platshållare. |
| Kunduppgifter? | **Inga verkliga.** `orders`, `returns`, `withdrawals`, `customers` och `reviews` har alltid varit tomma. E-postadresserna i historiken är projektadresser (`hello@`, `privacy@verapep.eu`, `admin@verapep.local`) eller exempeladresser (`example.com`/`example.se`). |
| Är dold produktinformation hämtbar från GitHub? | **Ja. Det är det allvarligaste fyndet.** Repot är publikt, och hela VERAPEP-katalogen finns i det, inklusive de 44 produkter som är dolda på webbplatsen. Se avsnitt 2. |
| Interna dokument? | **Ja, publika.** Säkerhets- och lanseringsrapporter, inventeringen, produktionschecklistor och den fullständiga serverkoden. |
| Akut blockerare? | Inga aktiva hemligheter, så ingen *hemlighetsincident*. Den publika exponeringen av konfidentiell katalog- och prisinformation är däremot en **blockerare som kräver ägarbeslut** (avsnitt 5). |

## 2. Vad som är publikt i dag och om det borde vara det

| Information | Var i repot | Avsikt | Bedömning |
| --- | --- | --- | --- |
| Produktnamn, specifikationer och varianter för alla 84 produkter, även de 44 dolda | `verapep/data/catalogue.json`, `scripts/source/catalogue-data.js`, `data/product-content.json`, `data/inventory.json` | Konfidentiellt tills produkterna godkänts | **Exponerat.** Spärren på webbplatsen gäller bara webbplatsen. |
| Leverantörens USD-priser (två priskolumner från en källarbetsbok) | `catalogue.json`, `scripts/source/catalogue-data.js`, `catalogue-audit.csv` | Kommersiellt känsligt | **Exponerat.** |
| Riskklassning och compliance-inventering, inklusive vilka produkter som bedöms motsvara receptbelagda läkemedel | `docs/v17/PRODUCT-COMPLIANCE-INVENTORY.*`, `lib/compliance.mjs` | Internt | **Exponerat.** |
| Säkerhetsrapporter, lanseringsblockerare, kända svagheter (de flesta åtgärdade) | `V17-*.md`, `SECURITY.md`, `PRODUCTION-CHECKLIST-V14.md` | Internt | **Exponerat.** |
| Serverkod, arkitektur, adminflöden, standardlösenordet `ChangeMe-123!` för lokal test | Hela `verapep/` | Kan vara öppen källkod om ägaren vill, men är inte avsett så | Standardlösenordet blockeras i produktion. Det är inte en hemlighet men underlättar attacker mot felkonfigurerade miljöer. |
| Butikskonfiguration: länder, frakt, varumärkestexter | `data/store-config.json` | Publikt på webbplatsen ändå | OK |
| CSS, bilder, sidmallar | `assets/`, `*.html` | Publikt | OK |
| Övriga projekt i samma repo (Remotion-video, `help/` för LUP Hjälp, `yard-twin`) | Andra grenar | Utanför VERAPEP | `help/` innehåller över 200 skärmbilder från ett *demokonto* i app.lupnumber.com. Stickprov visar demodata ("DEMO LUP", "Höganäs Test"). Ägaren bör granska alla bilder. |

**Slutsats:** Allt som döljs på webbplatsen går att läsa i repot. Det kan inte rättas i efterhand utan att skriva om historiken, och den som redan har klonat repot har informationen kvar. Det registrerade antalet forks är 0.

## 3. Åtgärdat i v18 (verifierat med tester)

| # | Fynd | Allvar | Åtgärd |
| --- | --- | --- | --- |
| A1 | **`TRUST_PROXY` gick att förfalska.** Servern tog den *vänstra* adressen i `X-Forwarded-For`, och den skriver klienten själv. En angripare kunde byta "IP" vid varje anrop och kringgå alla hastighetsgränser (inloggning, orderuppslag, Vera, recensioner). | Hög | `TRUST_PROXY` anger nu antal betrodda proxyled. Adressen tas från *höger* i kedjan och valideras som IP. Utan inställningen ignoreras headern helt. Test: roterad förfalskad header ger ändå 429. |
| A2 | **E-post i URL vid orderuppslag.** `GET /api/orders/:id?email=` hamnade i åtkomstloggar, webbläsarhistorik och referrers. Ordertoken låg också i URL:en efter kassan. | Medel | GET med `email` avvisas (400, `Deprecation`-header). Uppslag sker via `POST /api/orders/lookup` och token skickas som `X-Order-Token`-header. Klienterna (orderspårning, kassa, My pages, admin) lägger aldrig e-post eller token i URL:er. Gamla länkar fungerar fortfarande, men adressen tas bort från adressfältet. Hastighetsgräns på GET. |
| A3 | **Dolda produkter i statiska resurser.** `product-image-map.js` listade id:n för dolda produkter (t.ex. semaglutide, CJC-1295, MT-2), deras produktbilder kunde hämtas, och `app.js` hade en hårdkodad lista med dolda id:n. | Medel | Bildkartan genereras av servern och innehåller bara synliga produkter. Bilder för dolda produkter ger 404. Inga produkt-id:n finns hårdkodade i klientkoden. Test: inga dolda id:n i någon publik JS-, CSS- eller HTML-fil eller sida. |
| A4 | **Preview-miljön kunde visa ogranskade produkter publikt.** Render-tjänster är publika som standard. | Medel | En driftad miljö (`RENDER`, `VERCEL`, `FLY_APP_NAME`, `K_SERVICE` eller en https-`BASE_URL`) får automatiskt det strikta läget, där endast godkända produkter visas. `render.yaml` sätter `PUBLICATION_GATE=strict` och `TRUST_PROXY=1`. Bara ett uttryckligt `PUBLICATION_GATE=preview` visar ogranskade produkter. Det gäller inte produktion, som alltid är strikt. |
| A5 | **Rensning av gamla granskningsloggar.** v14–v16 skrev lösenordshashar och MFA-frön till granskningsloggen. | Hög före lansering | `scripts/scrub-audit-log.mjs`: dry-run som rapporterar rad, åtgärd och fältsökväg men aldrig värden; separat rapport om personuppgifter; `--apply --yes` med full SQLite-kopia och en ångrafil (0600); maskering; efterkontroll; `--restore`. **Inte kört mot produktion.** |
| A6 | **Lagringstider saknade tekniskt stöd.** | Medel | `data/retention-policy.json` (förslag, `approved:false`) och `scripts/retention.mjs`. Verktyget rapporterar alltid och vägrar agera tills policyn godkänts. Order raderas aldrig automatiskt. Se `RETENTION.md`. |
| A7 | **Ofullständig Git-checkout**, upptäckt av CI. `data/orders.json` och `data/returns.json` stod i `.gitignore`, så en ren klon av v15–v17 saknade dem. ZIP-paketen var kompletta, eftersom de byggdes från disk. | Medel (leverans) | Filerna (tomma seed-filer) är incheckade. Test säkerställer att order-, kund- och recensions-seeds förblir tomma. `verify-release` kontrollerar att varje manifestfil är incheckad. |
| A8 | **Ingen automatisk hemlighetsskanning.** | — | `scripts/secret-scan.mjs` körs i CI mot arbetskatalog och hela historiken. Den rapporterar fil, rad och mönster, aldrig värden. Test: planterade hemligheter upptäcks och projektet är rent. |

## 4. Vercel-projektet `lup-hjalp` (risk i samma repo, inte VERAPEP)

`lup-hjalp` hör till ett annat projekt: Next.js, Root Directory `help`, Neon/Postgres. Det är kopplat till **hela** repot och bygger previews för pull requests från alla grenar. Projektets produktionshemligheter (databas-URL:er och lösenord, `SESSION_SECRET`, `ADMIN_PASSWORD`) är markerade för både *production* och *preview*. **Det betyder att en preview-build av en gren som innehåller `help/` kör med produktionsdatabasens behörigheter.** Skyddet mot forks är aktiverat, vilket begränsar risken till personer med skrivrätt. Se `V18-REPOSITORY-AND-DEPLOYMENT.md`.

## 5. Åtgärder som kräver ägarens godkännande (inget av detta är gjort)

| Prio | Åtgärd | Varför |
| --- | --- | --- |
| 1 | **Gör repot privat**, eller flytta VERAPEP till ett eget privat repo. | Stoppar fortsatt exponering av dold katalog, leverantörspriser och interna rapporter. Det som redan publicerats ska betraktas som röjt. |
| 2 | Skilj `lup-hjalp`:s preview-miljö från produktionsdatabasen: egen Neon-gren eller egen databas för preview, och ta bort `preview` från produktionshemligheterna. | Annars kan förhandsversionskod nå produktionsdata. |
| 3 | Överväg att **byta lösenord och nycklar för `lup-hjalp`** om personer utanför teamet har haft skrivrätt. | Inga läckta värden hittades, så detta är förebyggande, inte akut. |
| 4 | Kör `scripts/scrub-audit-log.mjs` som dry-run mot en kopia av produktionsdatabasen, granska rapporten och godkänn `--apply`. | Gamla lösenordshashar i loggen. |
| 5 | Besluta om historikrensning, t.ex. med `git filter-repo`, av katalog och priser. | Påverkar alla kloner och gör historiken oåterkallelig. Bara meningsfullt i kombination med punkt 1. |
| 6 | Aktivera GitHub Secret Scanning, Push Protection och Dependabot i repot. Gör `VERAPEP CI / Release gate` till obligatorisk kontroll för VERAPEP-grenar. | Skydd i plattformen kompletterar CI-skanningen. |

## 6. Hur granskningen gjordes

- `git fetch` av alla grenar. Lista över alla filer som någonsin lagts till. Mönstersökning på varje tillagd rad i `git log --all -p`; därefter manuell klassning av träffar, där längd och om värdet är en platshållare kontrollerades utan att värdet visades.
- Vercels API, bara läsning: deployment `dpl_4bkd…` och projektinställningar för `lup-hjalp`. För miljövariabler lästes bara namn och mål, aldrig värden.
- Render-tjänsten gick inte att nå från granskningsmiljön på grund av nätverkspolicy. Därför behandlas den som publik.
