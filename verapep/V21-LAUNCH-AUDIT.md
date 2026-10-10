# VERAPEP v21 – Lanseringsgranskning

Datum: 2026-10-10. Version: 21.0.0. Gren: `claude/verapep-v21`.

**Slutsats: inte redo för riktig försäljning.** Tekniken är i gott skick efter v21: säkerhet, prestanda, tillgänglighet och betalflöde har granskats och rättats. Det som återstår är framför allt juridik och affärsbeslut som bara du (och en jurist) kan fatta, plus drift som kostar pengar (beständig disk, e-post, backup). Ingen produkt har godkänts eller gjorts köpbar.

Granskningen gjordes av fyra oberoende delgranskningar: juridik, drift och betalningar, säkerhet samt SEO/prestanda/tillgänglighet. Alla fynd nedan har verifierats. Varje kodrättelse har ett test som misslyckas på den gamla koden.

---

## 1. Rättat i v21

### Betalflödet (Stripe)
Alla scenarier har reproducerats mot en lokal Stripe-attrapp. Inga riktiga Stripe-anrop gjordes. Testerna finns i `tests/v21-payments.test.mjs`. Sju av de åtta betaltesterna misslyckas på v20-koden. Det åttonde (samtidig webhook och bekräftelse) fungerade redan och finns kvar som skydd.

| # | Fel | Följd för kunden | Rättelse |
|---|---|---|---|
| P1a | En ny Stripe-session kunde öppnas för en redan betald order (Tillbaka-knappen eller ett andra "Betala"). | Ordern blev "pending" igen. När den oanvända sessionen gick ut avbröts den betalda ordern, och återbetalningen pekade på fel session. | Sessioner öppnas bara för obetalda, öppna ordrar. En öppen session återanvänds, och dubbelklick ger en session. |
| P1b | En betalning för en avbruten order gav 409. | Stripe försöker igen i tre dagar. Kunden har betalat och ordern står som avbruten, utan larm. | Betalningen tas emot (200) och ordern förblir avbruten. Betalningen registreras så att återbetalningsknappen fungerar. Ordern flaggas "Payment needs review" i admin och larm skickas till monitoring. |
| P1c | En gammal session som gick ut kunde avbryta en order som hade en nyare session. | En betald order kunde avbrytas. | Bara orderns aktuella session får avbryta den. |
| P1d | Webhooken kontrollerade inte belopp, valuta eller test/live-läge. | En signerad händelse med fel belopp markerade ordern som betald. | Belopp, valuta och läge jämförs med ordern. Avvikelser godkänns inte och flaggas för granskning. |
| P1e | En andra betalning för samma order ignorerades tyst. | Kunden betalade två gånger. | Den flaggas som "duplicate_payment" för återbetalning. |
| P2 | En lagerdragning som misslyckades ändrade lagret till hälften, och varje Stripe-försök tog bort fler reservationer. | Lagret blev fel. Andra kunders reserverade varor frigjordes. | Alla rader kontrolleras innan något ändras. En betald order dras alltid och flaggas som "oversold" om lagret inte räcker. Admin kan inte sätta lagret under det som är reserverat. |
| P3 | En Stripe-checkout vars utgångshändelse försvann reserverade lager för alltid. | Varor såg slutsålda ut. | Reservationen släpps två timmar efter att sessionen gått ut. |
| P4 | Samma idempotensnyckel som skickades samtidigt skapade två ordrar. En nyckel kunde återanvändas för en annan varukorg. | Dubbla ordrar och dubbel reservation. | En order per nyckel även vid samtidiga anrop. Ny varukorg med samma nyckel ger 422. |
| P5 | Admin kunde sätta vilken status som helst. | Obetalda ordrar kunde markeras "shipped", och betalda kunde avbrytas utan återbetalning. | En tabell styr övergångarna. Leveransstatus kräver en betald order. En betald order avbryts via återbetalning. Avbrutna och återbetalda ordrar är låsta. |
| P9 | Ingen hantering av SIGTERM, som Render skickar vid varje driftsättning. | Pågående webhooks klipptes av, låsfilen blev kvar och databasen checkpointades inte. | Servern stänger nu snyggt: pågående anrop avslutas, kön skrivs klart och databasen checkpointas och stängs. |

Betalningsproblem som kräver en människa visas som en röd ruta på ordern i admin. Kunden ser bara "Payment under review" och aldrig de interna anteckningarna.

### Övrigt rättat i v21
- **Demolås:**
  - Lösenordet måste ha minst 10 tecken.
  - Felaktiga försök begränsas (30 per 15 minuter).
  - `/api/health` visar bara "upp/ner" för den som inte loggat in.
  - Stripe-webhooks släpps igenom, eftersom de har en egen signatur. Det gör att en Stripe-repetition fungerar bakom låset.
- **Hälsokontroll:** frågar nu databasen. Om databasen inte svarar returneras 503, så att Render kan starta om tjänsten.
- **Privata sidor** (admin, kassa, order, mina sidor) indexeras aldrig av sökmotorer.
- **Länkförhandsvisning** (Open Graph/Twitter) för publika sidor.
- **Valuta:** alla reservvärden är nu EUR i stället för USD.
- **Admin:** bekräftelsen "texten är nu live" försvann direkt när panelen laddades om. Den visas nu. Felet gjorde också ett e2e-test instabilt.
- **Node-version:** låst till 22 (`render.yaml`, `.node-version`), samma som CI och Dockerfile. Render körde tidigare 26.

## 2. Testat utan anmärkning
- **Prestanda:**
  - LCP 0,8–2,2 s på långsam 4G med fyra gånger strypt CPU.
  - CLS under 0,06.
  - Cirka 300 kB per sida.
- **Tillgänglighet:** axe hittade 0 fel på 17 vyer.
- **Webhook-signatur:**
  - Rå body, HMAC-SHA256, tidskonstant jämförelse och ±300 s fönster.
  - Gamla och felaktiga signaturer avvisas.
- **Dubbletter:** dubbla webhook-händelser, samtidig webhook och bekräftelse samt trippelklick på betala ger alltid exakt en bekräftelse och ett mejl.
- **Belopp:** räknas på servern i heltal (cent).
- **Säkerhetshuvuden** finns på alla svar. Adminkakan är `HttpOnly` och `SameSite=Strict`, CSRF-token krävs och inloggning kräver JSON.
- **Backup och återställning:** fungerar (`integrity_check: ok`). Återställning vägrar köra medan servern är igång.
- **Testsviter:**
  - Enhetstester: 123/123 (Node 22).
  - E2e i webbläsare: 22/22, tre körningar i rad.

## 3. Juridisk checklista – att ta med till juristen

Detta är **inte juridisk rådgivning**, utan en lista över vad som saknas i sajten idag. "Dev" betyder att en utvecklare kan bygga det när juristen har levererat texten.

| Prio | Punkt | Status | Vad du/juristen måste ta fram |
|---|---|---|---|
| **P0** | **Receptbelagda läkemedel och dopningsklassade ämnen i katalogen.** Bland de 84 produkterna finns Semaglutide, Tirzepatide, Insulin, HGH/Somatropin, Botulinumtoxin, EPO, HCG, Triptorelin, Alprostadil, Melanotan 2, PT-141 och CJC/GHRP/Ipamorelin. | Spärren finns, men frågan är öppen. 0 produkter är godkända. | Ett beslut per produkt enligt läkemedelslagen (2015:315), dopningslagen (1991:1969) och narkotikareglerna: får den visas, och får den säljas? |
| **P0** | **Hälsopåståenden i menyer och produktguiden.** Exempel: "Weight & metabolism", "Healthy ageing", "Sexual health", "Fertility information" och sökord som "gå ner i vikt" och "rynkor". | Finns, och är en risk. | Granskning enligt läkemedelslagen kap. 12 och marknadsföringslagen. Kan kopplingen mellan mål och produkt göra produkterna till läkemedel "genom presentation"? |
| P0 | **Näringsidkarens identitet.** Bolagsnamn, organisationsnummer, adress, telefon, momsnummer och F-skatt. | Delvis | Uppgifterna. Dev lägger in dem. |
| P0 | **Köpvillkor** (distansavtalslagen 2 kap. 2 §) | Saknas | Fullständiga villkor |
| P0 | **Ångerrätt 14 dagar och standardformulär för ånger.** API:t finns, men inget formulär på sajten. | Delvis | Ångertext, eventuella undantag (t.ex. förseglade hälso- och hygienvaror) och vem som betalar returen |
| P0 | **Texten på köpknappen** ("Beställ med betalningsskyldighet") och en sammanfattning av villkoren ovanför knappen | Gäller inte så länge försäljningen är avstängd | Godkänd formulering |
| P0 | **Pris inklusive moms.** Idag läggs moms på ovanpå priset, och frakt är 0 ("pending"). | Saknas | Momssatser per land, beslut om OSS och riktiga fraktpriser |
| P1 | **Prisvisning.** "Reference price" har en särskild betydelse enligt prisinformationslagen 7a §. | Delvis | Ska priser visas för varor som inte säljs? Byt namn på "Reference price". |
| P1 | **Orderbekräftelse på varaktigt medium.** Idag är det ett enradsmejl utan villkor eller ångerinformation. | Delvis | Innehåll i bekräftelsen, val av e-postleverantör och personuppgiftsbiträdesavtal |
| P1 | **Reklamation 3 år, ARN och EU-tvistlösning** | Saknas | Text och beslut om ni följer ARN:s beslut |
| P1 | **Integritetspolicy (GDPR art. 13).** Personuppgiftsansvarig saknas, liksom ändamål, rättslig grund, lagringstider, rättigheter och biträden. | Delvis | Fullständig policy och en ansvarig person |
| P1 | **Registerförteckning och lagringstider** (mallar finns) | Delvis | Godkänd rättslig grund och godkända lagringstider |
| P1 | **Begäran om radering.** Export finns, men radering eller anonymisering saknas. | Delvis | Rutin. Dev bygger raderingen. |
| P1 | **Rutin vid personuppgiftsincident** (72 timmar till IMY) | Saknas | Rutin |
| P2 | **Kakor och lokal lagring.** Allt bedöms som nödvändigt och inga spårare används, men kakorna `vp_admin` och demolösenordet nämns inte i policyn. | Delvis | Bekräfta att ingen samtyckesbanner behövs |
| P2 | **Tillgänglighetsredogörelse** (lag 2023:254) | Saknas | Är ni ett mikroföretag? Om inte behövs en redogörelse och en kanal för återkoppling. |
| P2 | **Svenska.** Alla sidor är på engelska. | Saknas | Krävs svenska villkor för svenska konsumenter? Gäller samma fråga för de övriga 26 aktiverade länderna? |
| P2 | **Ålders- och receptkontroll** (finns inte) | Delvis | Behövs ålderskontroll, recept eller apotekstillstånd? |
| P3 | **Skatt och registrering, försäljning till andra länder** | Saknas | F-skatt, momsregistrering, OSS och regler per målland |
| P3 | **Produktsäkerhet (GPSR 2023/988).** Varningar, ansvarig ekonomisk aktör och märkning saknas. | Saknas | Ansvarig aktör i EU, tillverkare, varningar, spårbarhet och återkallelserutin |
| P3 | **Förtroendepåståenden.** "Lab reports where available" visas, men 0 labbrapporter är publicerade. | Risk | Marknadsföringsgranskning |

**En utvecklare kan bygga direkt** (med platshållartexter som stannar bakom spärren):
- sida och knapp för ångerformuläret;
- konfigurerbar text på köpknappen;
- "inkl. moms" och prismodell med moms inräknad;
- skelett för tillgänglighetsredogörelse;
- komplett kaktabell;
- fält för bolagsuppgifter;
- radering och anonymisering av kunddata;
- mall för orderbekräftelse;
- svenska sidversioner;
- fler spärrar i `productionReadiness()`.

## 4. Kvarstående risker (öppna)

| Risk | Allvar | Åtgärd |
|---|---|---|
| **Render free har ingen beständig disk.** Ordrar, admin-ändringar och dokument försvinner vid varje omstart och driftsättning. Admin loggas också ut. | Hög (vid riktig drift) | En betald instans med disk, eller Postgres. Sätt `APP_ENV=production` och `BASE_URL`. |
| **Backup schemaläggs inte och lagras på samma disk.** E-postkön ingår inte. | Hög | Ett cron-jobb, en kopia på annan plats och en dokumenterad återställningsövning |
| **E-post:** enradstexter, ingen automatisk omsändning (skriptet finns men körs inte) och inget larm vid fel | Hög | Riktiga mallar, en leverantör och en bakgrundsprocess för omsändning |
| **Moms och frakt:** moms läggs ovanpå priset, okända länder får standardsatsen och ett okänt fraktsätt faller tillbaka till det första | Hög (juridiskt) | Momstabell per land och priser med moms inräknad |
| **Återbetalningar och tvister gjorda i Stripes dashboard** uppdaterar inte ordern | Medel | Hantera `charge.refunded` och `charge.dispute.*` |
| **SQLite-dokumentmodellen:** alla ordrar skrivs om vid varje ändring (10 000 ordrar ≈ 220 ms per skrivning) och bara en instans kan köras | Medel (vid volym) | En rad per order, eller Postgres, innan volymen växer |
| **`/api/ready` visar hela blockeringslistan** publikt | Låg | Begränsa till admin. Befintliga tester bygger på listan, så ändringen kräver ett beslut. |
| **Dockerfile kör som root** | Låg | `USER node` när volymrättigheterna är verifierade |
| **Ask Vera** svarar olika för dolda och okända produktnamn | Låg | Känd sedan v20 |
| **GitHub-repot är publikt** (öppet sedan v18) | Hög | Ditt beslut: gör det privat |
| **Vercel lup-hjalp:** 19 hemligheter gäller fortfarande Preview | Medel | Ta bort Preview i Vercel |
| **Gamla audit-loggar i produktionen** har inte skrubbats | Medel | Kör `scripts/scrub-audit-log.mjs` mot produktionsdatabasen |

**Systemet beskrivs inte som produktionssäkert.**

## 5. Externa beslut som bara du kan fatta
1. Vilka produkter får överhuvudtaget visas eller säljas? (P0, jurist)
2. Bolagsuppgifter, villkor, ångerrätt, integritetspolicy och momsupplägg. (jurist och revisor)
3. Hosting för riktig drift: betald Render-instans med disk (cirka 7–25 USD/mån) eller Postgres.
4. E-postleverantör (t.ex. Postmark eller Resend) och personuppgiftsbiträdesavtal.
5. Stripe live-konto, och om Stripe godkänner produktkategorin. Stripe har egna förbud mot receptbelagda läkemedel.
6. Repo privat, Vercel Preview-hemligheter och skrubbning av gamla loggar.

## 6. Driftsättning av v21 på demon
Om v21 ska ut på `verapep-friends-test`:
- `SITE_ACCESS_PASSWORD` måste ha **minst 10 tecken**, annars startar tjänsten inte.
- `NODE_VERSION=22` följer med `render.yaml`.
- Demon förblir låst och utan beställningsmöjlighet.
