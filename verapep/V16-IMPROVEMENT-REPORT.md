# VERAPEP v16 – Premium experience, trust & production readiness

Bygger på v15. Återställningspunkter: commit `25b3c42` (v14.1-import) och `f7b9b10` (v15), båda på grenen `claude/fervent-babbage-1a97st`, samt arbetsgrenen `claude/verapep-v16`. Taggarna `verapep-v14.1`/`verapep-v15` finns lokalt men kunde inte pushas via sessionens git-proxy – skapa dem vid behov med `git tag verapep-v15 f7b9b10`.

**Oförändrat med avsikt:** inga produkter har låsts upp, ingen betalning eller beställning har aktiverats, inga behörigheter eller API-kontrakt har ändrats och inga produktfakta, lab-resultat, certifieringar eller recensioner har skapats. `/api/ready` rapporterar fortfarande `ready: false`, och det finns 0 beställningsbara produkter (verifieras av testerna).

Före/efter-bilder: `docs/v16-before-after/`.

---

## 1. Fas 1 – Fullständighet

| Fil i v14.1-manifestet | Fanns den? | Åtgärd |
| --- | --- | --- |
| `privacy.html`, `terms.html`, `shipping-returns.html` | Nej – varken i zip-paketet, i `verapep-friends-test`-repot eller i git-historiken | Skapade som **informationssidor**: de visar bara konfigurerade och verifierbara uppgifter och har en tydlig status "Pending legal review". Ingen juridisk text har hittats på |
| `assets/legal.js` | Nej | Ny: fyller sidorna från `/api/legal` och `/api/storefront` (företagsuppgifter, version, leveransmetoder, 27 länder) |
| `data/withdrawals.json` | Nej | Återställd som `[]` (samma format och storlek som i manifestet). Två enhetstester föll tidigare på detta |
| `scripts/backup-sqlite.mjs` | Nej (men `npm run backup:sqlite` pekade på den) | Implementerad enligt README: WAL-checkpoint, `VACUUM INTO` och `integrity_check`. Testad |
| `PRODUCTION-READINESS-AUDIT-V14.md`, `V14-PRODUCTION-READINESS.md`, `POSTGRES-MIGRATION-PLAN-V14.md` | Nej | **Inte** återskapade, eftersom de är ägarens dokument. README anger nu att de saknas |
| `bubbles-hero-v14.webp`, `product-vials/*-v14.webp` | Nej | Refereras inte av någon kod. Behövs inte |

Körningskontroll: 94 sidor (inklusive alla 84 produktsidor) och 186 interna länkar. Inga saknade resurser, inga JS-fel och inga trasiga länkar. Det enda undantaget är `/api/admin/export`, som korrekt kräver inloggning.

Det gamla `FILE-MANIFEST.txt` listade filer som aldrig levererades. Det genereras nu om med `node scripts/write-manifest.mjs` och motsvarar exakt leveranspaketet (192 filer).

## 2. Fas 2 – De 20 viktigaste bristerna (rangordnade efter effekt)

| # | Brist | Status |
| --- | --- | --- |
| 1 | Produktsidorna kändes ofärdiga: sju dragspelsrubriker visade "Not published." | **Åtgärdad.** Ny struktur, se fas 3 |
| 2 | **Vilseledande påståenden.** "Published lab reports" (trust-bar, hero, kvalitetskort), "Backed by science" och "High-quality peptides" stod på sajten, trots att 0 av 84 produkter har en publicerad lab-rapport eller beskrivning | **Åtgärdad.** Ärlig hero ("A catalogue built on transparency.") och trust-bar från adminkonfigurationen ("Lab reports where available"). Kvalitetskortet förklarar hur dokumentationen fungerar |
| 3 | Juridiska sidor saknades (404 från admin-footern och sitemap, och ett test föll) | **Åtgärdad**, se fas 1 |
| 4 | Okända adresser gav ren text: "Not found" | **Åtgärdad.** Egen 404-sida med sök och genvägar. Tillgångar och data får fortfarande en ren text-404 |
| 5 | `®` i logotypen utan verifierad varumärkesregistrering (och bara på vissa sidor) | **Borttaget överallt.** Återinför när registreringen är bekräftad |
| 6 | Hälsorelaterad målgruppering ("Weight & metabolism" m.fl.) utan förbehåll | **Delvis.** Förbehåll tillagt i produktguiden och på startsidan: "not health recommendations … no medical advice". Själva taxonomin är innehållsdata och kräver granskning av ägaren (se risker) |
| 7 | `/api/storefront` (152 KB) skickades okomprimerat på varje sida | **Åtgärdad.** Brotli/gzip ger 9,4 KB |
| 8 | 9–12 renderingsblockerande CSS-filer per sida | **Åtgärdad.** En ordnad bunt per sida, pixelverifierad |
| 9 | Font-preload konkurrerade med CSS:en om bandbredden på mobil (FCP +400 ms) | **Åtgärdad** |
| 10 | Scroll-hanterare skrev 14 CSS-variabler på `:root` varje frame, så hela dokumentet stylades om. Ingen av mottagarna fanns kvar i DOM:en | **Åtgärdad.** Körs bara om mottagarna finns |
| 11 | Spara/jämför byggde om hela katalogen: långsamt, och tangentbordsfokus tappades. `alert()` användes vid fler än tre jämförelser | **Åtgärdad.** Uppdatering på plats och icke-blockerande meddelanden |
| 12 | Live-uppdatering (SSE) laddade om produktsidan när man skickade en recension, så att bekräftelsen eller den ifyllda texten försvann | **Åtgärdad.** Egen inskickning ignoreras, och vid ifyllt formulär visas "Refresh" i stället för omladdning |
| 13 | Herobilden var för lågupplöst på 3x-mobiler och 2x-surfplattor (60–80 % av behovet) | **Åtgärdad.** `srcset` med 1 280/1 600/2 048 px i AVIF och WebP |
| 14 | Cache: alla tillgångar var `immutable` i 1 h (även oversionerade), versionerade bara 1 h | **Åtgärdad.** `?v=` ger 1 år `immutable`, oversionerade 1 h utan `immutable` |
| 15 | E2E-sviten fungerade inte (väntade på `networkidle` och sökte element som inte finns sedan v12) | **Åtgärdad**, se fas 7 |
| 16 | Tomt sökresultat var en återvändsgränd | **Åtgärdad.** Knappen "Clear search and filters" |
| 17 | Ask Vera svarade med adminjargong ("administration portal", "USD reference data") | **Åtgärdad** i kunskapsbasen (se risk om befintliga databaser) |
| 18 | Checkoutens steg saknade etiketter på mobil och surfplatta | **Åtgärdad** |
| 19 | Mina sidor hade utvecklartext ("demonstrates the intended frontend structure") | **Åtgärdad.** Hänvisar nu till Privacy-sidan |
| 20 | Juridiska sidor och fraktinformation var svåra att hitta | **Åtgärdad.** Legal-länkar i alla footers, "Shipping & returns" under Help, länk från varje produktsida |

## 3. Fas 3 – Produktsidor och innehåll

**Inventering av katalogen:** 84 produkter och 170 varianter.

| Fält | Antal produkter med innehåll |
| --- | --- |
| Namn, kategori, katalognummer, specifikation, referenspris, status, klassificering | 84 |
| Beskrivning, innehåll, förvaring, användning, varningar | 0 |
| Lab-rapporter | 0 |
| Recensioner | 0 |

**Ny produktsida** (`assets/product-commerce.js`, omskriven till läsbar kod med samma beteenden):

- **Hero:**
  - Statusetikett ("Information only").
  - Brödsmulor med kategori.
  - En saklig ingress som bara bygger på katalogdata ("BPC 157 is listed in the Strength & Recovery catalogue in 4 specifications. A detailed description has not been published yet.").
  - Fyra faktaceller (antal och spann av specifikationer, förpackning, tillgänglighet, dokumentation).
  - Förklaring av varför produkten inte kan beställas.
- **Bildtext:** "Illustration of the VERAPEP vial label. Not a photograph of a specific batch.", eftersom flaskan är en renderad illustration.
- **Sektionsnavigering:** sticky, med scrollspy (Specifications, Information, Documentation, Delivery, Reviews).
- **Specifikationstabell:** katalognummer, styrka, förpackning, referenspris och status. Leverantörens text "5mg *10vials" tolkas enbart för presentationen; okänt format visas oförändrat. Blir kort på mobil.
- **Information:** publicerade fält visas när de finns. Saknade fält listas under "Not yet published" med kontaktvägar. Klassificeringen är märkt "a catalogue grouping, not a claim about effects".
- **Dokumentation:** endast rapporter som är `published` och har en URL visas. Annars en tydlig förklaring.
- **Leverans:** från konfigurationen, med länk till Shipping & returns.
- **Recensioner:** "No reviews have been published yet". Formuläret ligger bakom "Write a review" och har validering, laddningsläge och bekräftelse.
- **Fler i kategorin:** 4 relaterade produkter ur samma kategori.
- **Återkoppling:** inline-toast i stället för `alert()`.

**Innehåll som har kompletterats** (bara omskrivning av befintlig information, inga nya fakta):

- Hero och kvalitetskort på startsidan.
- Svaren i Ask Vera-kunskapsbasen.
- Texter på Mina sidor.
- Förbehållet i produktguiden.
- 404-sidan.
- De tre informationssidorna, som bara innehåller uppgifter som kan verifieras:
  - konfigurerade företagsuppgifter, versioner, leveransmetod och länder;
  - vad sajten faktiskt lagrar i webbläsaren (nycklarna har verifierats i koden);
  - att inga analys- eller spårningsskript laddas (verifierat via CSP och koden);
  - att ordersidan har ett returformulär.

  Ingen ångerfrist och inga villkor anges, eftersom de inte är beslutade.

**Innehåll som fortfarande saknas** (kräver ägaren och juridisk granskning):

- Produktbeskrivningar, förvaring, hantering och varningar för 84 produkter.
- Lab-rapporter som hör till rätt produkt och är godkända.
- Godkänd integritetspolicy och godkända köpvillkor samt retur- och ångervillkor.
- Företagsnamn, organisationsnummer och adress (visas som "Pending").
- Riktiga produktfoton, om sådana ska användas (i dag visas renderade illustrationer).

## 4. Fas 4 – Kundresan

En ny besökares väg har simulerats: startsida → sök → katalog → produkt → spara → Mina sidor, samt produktguiden, Ask Vera, jämförelse, varukorg och checkout.

Åtgärder:
- **Tomt sökresultat:** har nu en väg tillbaka.
- **Jämförelsedialog och lådor:** rimliga rubriker (tidigare två rader i 4 rem).
- **Produktsidan:** leder vidare till produktguiden.
- **Brödsmulorna:** innehåller kategori, med länk till filtrerad katalog.
- **Förtroendesidor:** finns i varje footer.
- **Beteenden:**
  - Recensionsbekräftelsen bevaras.
  - Fokus behålls vid spara och jämför.
  - "/" fokuserar sökfältet. Fanns sedan v15 och är nu E2E-testat.

Köpbegränsningarna är oförändrade. Varukorgens tomma läge och "Preview checkout" är verifierade.

## 5. Fas 5 – Design

- **Produktsidan och de nya sidorna** (juridik, 404) följer v15:s designsystem: typskala, kort, radier, fokusringar.
- **Hero:** kortare rubrik på två rader och verkliga, dynamiska nyckeltal (84 produkter, 170 specifikationer, 27 EU-länder) i stället för påståenden.
- **Bilder:**
  - Herobilden har kontrollerats i faktisk visningsstorlek × DPR på 375@3x, 430@3x, 768@2x, 1440@2x, 1920@1x och 1920@2x. Alla får nu en tillräckligt stor källa, utom 1920@2x (70 %), där originalet bara är 2 048 px. Det har inte skalats upp.
  - Flaskornas bas (720 px) räcker för 300 px × 2 DPR.
- **Mobil:**
  - Kompakta produktkort, specifikationskort, åtgärdsknappar i två kolumner.
  - Stegindikator med etiketter.
  - Etiketten på flaskan klipps inte längre.
- **Tangentbord:** logisk tabbordning (skip-länk → logo → navigation → sök → ikoner → innehåll) och synlig fokusring på alla element.

## 6. Fas 6 – CSS

**Mätning före åtgärd:**
- 12 (startsidan) respektive 9 renderingsblockerande förfrågningar.
- 376 KB rå CSS, varav bara 15–42 % används på en enskild sida.
- 2 209 regler.

**Beslut:** ingen regel-för-regel-rensning. Den oanvända CSS:en består till stor del av responsiva lägen och tillstånd, och en rensning hade gett hög risk för små vinster.

I stället används `scripts/build-css.mjs` (inga beroenden). Det slår ihop lagren i **exakt samma kaskadordning** till tre buntar (storefront, pages, admin) med försiktig minifiering: bara kommentarer och blanksteg, aldrig i strängar eller `url()`.

**Verifiering:**
- 22 helsidesbilder (11 sidor × 2 bredder) jämfördes pixel för pixel. 18 var identiska.
- De 4 avvikelserna var kantutjämning på sub-pixelnivå eller körningsbrus (en upprepad körning gav samma brus).

**Resultat:**
- 1 CSS-förfrågan per sida.
- 333/271/281 KB rått, 54/44 KB överfört.
- `npm test` fäller om en bunt inte är ombyggd.

Källfilerna redigeras som tidigare, följt av `npm run build:css`.

## 7. Fas 7 – E2E

`tests/e2e.py` är omskriven. Den väntar på applikationstillstånd: produktkort, `aria-busy="false"`, ifyllda juridiska fält, URL-ändringar. Den använder aldrig `networkidle` och inga godtyckliga fördröjningar.

| Test | Täcker |
| --- | --- |
| navigation | Menytexter, `aria-current` per sida, legal-länkar, skip-länk och fokus, Shop till katalogen |
| search | "/" till sök, filtrering, tomt läge och återställning, sök från undersida |
| catalogue | 84 produkter, ladda fler, kategori via URL, jämförelse (dialog, Escape) |
| product_details | AICAR i detalj, ingen köpknapp, bildbredd, spara-toast, sektionsnavigering; **alla 84 produktsidor** renderar rätt antal varianter |
| cart_states | Låda öppna/Escape/fokus, tomt läge, inga köpbara varianter, tom checkout |
| mobile_menu | Öppna, Escape med fokus tillbaka, länk navigerar, ingen horisontell scroll |
| forms | Ask Vera-svar, recensionsvalidering och moderation, okänd order, produktguiden |
| key_journey | Mål → produkt → spara → Mina sidor |
| legal_pages | Status, ifyllda fakta, 27 länder, leveransmetod, 404 |
| broken_links | Alla interna länkar på 10 sidor |
| accessibility | axe-core (WCAG 2.2 A/AA, serious och critical) på 11 sidor × 2 bredder, exakt en h1 |
| admin | Inloggning, redigera och spara produkt |

**Konsolfel och JS-fel fäller testet.** Sviten har också verifierats med en avsiktlig regression: när lådskuggebuggen från v14 återinfördes föll `cart_states`. axe-core är vendorad under `tests/vendor/` (MPL-2.0), så produktionsdeployen påverkas inte.

## 8. Prestanda före och efter (v15 → v16)

| Mätning | v15 | v16 |
| --- | --- | --- |
| Överföring, 14 sidvisningar (375 och 1440 px) | 7,74 MB, 324 förfrågningar | **4,48 MB, 194 förfrågningar (−42 %)** |
| `/api/storefront` över nätet | 152 KB | **9,4 KB** |
| CSS-förfrågningar per sida | 9–12 | **1** |
| Startsidan FCP / LCP (median, mobil, 4G, 4× CPU) | 1 264 / 1 644 ms | 1 296 / **1 296 ms** |
| Produktsidan FCP / LCP | 1 128 / 4 192 ms | **936 / 2 328 ms** |
| Produktguiden FCP / LCP | 1 040 / 2 100 ms | **848 / 1 552 ms** |
| Interaktion: öppna meny | 416 ms | **80 ms** |
| Interaktion: jämför | 248 ms | **56 ms** |
| Interaktion: spara | 352 ms | ~300 ms |
| Interaktion: välj mål / ladda fler | ~190 / ~230 ms | oförändrat |
| CLS | ≤ 0,03 | ≤ 0,05 (produktsidan på mobil 0,048; fortfarande "good") |
| axe allvarliga fel (16 sidvisningar) | 4 | **0** |

Mobilmätningarna är medianer av 5 körningar i Chromium med 150 ms latens, 1,6 Mbit/s och 4× CPU-throttling. Interaktionerna mättes som Event Timing (motsvarar INP) under samma CPU-throttling.

## 9. Testresultat

| Test | Resultat |
| --- | --- |
| `npm test` | **40/40** (31 befintliga + 9 nya i `tests/v16.test.mjs`). Befintliga assertioner uppdaterade för medvetna ändringar: `v11` (ny hero-text, CSS via bunt) och `v9`/`v14` (version 16.0.0) |
| `npm run test:static` | Godkänd (12 HTML-mallar) |
| `npm run test:e2e` | **12/12** |
| Skärmbilder | 12 sidor × 375/430/768/1440/1920 px: ingen horisontell scroll, inga oväntade konsolfel |
| Ren miljö | Zip uppackat i tom mapp utan databas: `npm install`, 40/40, statisk, CSS-kontroll, manifestkontroll (alla 192 filer finns), E2E 12/12, färsk server version 16.0.0 |

## 10. Leverans

- **Kod:** grenen `claude/verapep-v16` och en draft-PR mot v15-grenen.
- **`VERAPEP-v16-COMPLETE.zip`:** ett komplett installationspaket på 18,4 MB. Inga databaser, cachar eller hemligheter. Uppdateringspaket behövs inte.

## 11. Kvarvarande risker och förslag (ej genomförda)

1. **Regelefterlevnad för katalogen.** Katalogen innehåller ämnen som i EU normalt är receptbelagda läkemedel (bl.a. semaglutide, tirzepatide, insulin, somatropin/HGH, EPO, botulinumtoxin och dermorphin). Det är en juridisk fråga, inte en designfråga, om dessa överhuvudtaget får visas, marknadsföras eller säljas till konsumenter och i vilka länder. Den befintliga spärren för live-handel måste kompletteras med denna granskning. Detsamma gäller hälsorelaterade målgrupper i produktguiden ("Weight & metabolism", "Skin appearance" osv.). Jag har lagt till förbehåll men inte ändrat taxonomin.
2. **Kunskapsbasen ligger i databasen.** Nya Ask Vera-svar gäller nya installationer och miljöer med tillfällig disk (Render free). En befintlig persistent databas behåller de gamla svaren tills de uppdateras i admin.
3. **Oversionerade JS-filer** (t.ex. `site.js`, `checkout.js`) cachas upp till en timme. Lägg till `?v=` när de ändras.
4. **CSS:** 58–85 % av reglerna är oanvända per sida. En stegvis rensning med visuella regressionstester kan ge ytterligare cirka 30–40 % mindre CSS.
5. **Typsnitt:** Newsreader (132 KB) kan subsettas till använda glyfer (cirka −50 %).
6. **Herobilden** på 1920 px @2x behöver ett källoriginal över 2 048 px för full skärpa.
7. **Admin** har fått typografi och CSS-bunt men ingen egen designgenomgång.
8. **E2E kräver** Python och Playwright (`pip install playwright==1.56.0`) samt Chromium.
