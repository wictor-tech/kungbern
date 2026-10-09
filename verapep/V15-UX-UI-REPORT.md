# VERAPEP v15 – Premium touch-up & UX/UI-optimering

Bygger på v14.1. Ingen affärslogik, inga API-kontrakt, inga behörigheter och ingen produkt-/commerce-gating har ändrats. Allt nedan är **genomfört och verifierat** om inget annat anges.

Före/efter-bilder: `docs/v15-before-after/` (home, catalogue, product, checkout, mypages, home-mobile, product-mobile, menu-mobile).

## 1. Navigering

| Problem (v14.1) | Åtgärd |
| --- | --- |
| Dubbla varukorgsikoner på desktop (mobilknappen syntes bredvid logotypen) | Mobilknappen döljs ≥ 901 px |
| Ikonetiketter i 7 px; sparade produkter var märkt "Account" på undersidor | Etiketterna borttagna; `title`/`aria-label` + tydliga hover-lägen. Räknare "0" döljs och animeras in vid ändring |
| "Shop" ledde till 6 utvalda produkter, inte butiken | "Shop" → hela katalogen (`#catalogue`) |
| "Science" ledde till tre små kort utan vetenskapligt innehåll | Omdöpt till "Quality" |
| Aktiv sida syntes knappt | Understrykningsindikator; på startsidan markeras aktiv sektion vid scroll (`aria-current="location"`) |
| Mobilmenyn var halvgenomskinlig – hero-texten lyste igenom | Solid helskärmspanel: sök överst, "My pages"/"Saved products" som tydliga knappar, stora tryckytor med pilar, Escape stänger, fokus hålls i menyn |
| Produktguidens steg 1 "Choose goals" hade inga val på desktop (återvändsgränd) | Målvalen visas nu direkt i steg 1 i kompakt rutnät |
| Fem olika footers med olika länkar (en länkade till Admin) | En gemensam footer: Shop / Help / Account + statusmärke för preview-miljön |
| Skip-länk och `id="main"` saknades på guide, Ask Vera och My pages | Tillagt |
| – | Ny genväg: tryck `/` för att söka från valfri sida (desktop) |

## 2. Visuella förbättringar

- **Typografi:** Inter och Georgia efterfrågades i CSS men levererades aldrig – besökare fick systemets typsnitt. Nu självhostade variabla typsnitt (Inter + Newsreader, SIL OFL, ingen tredjepartsförfrågan/GDPR-fråga). En enda rubrikskala på alla sidor (sidrubriker var 2,4–5,4 rem).
- Trust-bar och nav från 10–12 px till 12–14,5 px; enhetliga SVG-ikoner i stället för unicode-glyfer (⌁ ◇ ◎ ◌ ✦ ☰).
- Konsekventa tokens: färger, 12/18 px radier, tre skuggnivåer, knappar i sentence case (tidigare VERSALER i 10 px), fokusring.
- Produktkort: full kategoritext i stället för "MET/STR/SPC", borttagen meningslös "Product details"-pristext och dubblerad "Product information"-badge, jämn korthöjd, mjuk hover. Katalogen visar 4 kolumner på desktop, 2–3 på surfplatta och kompakta listkort på mobil (tidigare ~500 px per kort).
- Kvalitetskorten: text klipptes av; tecknade illustrationer (hand-"blob", Vera-figur) ersatta av ren ikon + text.
- Ask Vera-sektionen som mörk avslutande band; hero med bredare textkolumn och tydliga CTA:er.
- Kundtexter utan intern jargong ("approved in administration", "server-side Excel catalogue", "Everything in one vertical flow", "Not enabled" m.fl.).

## 3. Bilder

| Bild | Före | Efter |
| --- | --- | --- |
| Hero (bubbles) | PNG 1,9 MB | AVIF 42 KB / WebP 50–84 KB med `srcset` (PNG kvar som fallback) |
| Flaskbas (mask/bakgrund, alla produktkort) | PNG 569 KB | WebP 720 px, 36 KB (2× visningsstorlek) |
| Produktbild på produktsidan | **Tom vit ruta** (flaskan renderades 0×0 px) | Flaskan visas skarpt |
| Dekorativa SVG-illustrationer på kvalitetskort | Tecknade, generiska | Borttagna (filerna finns kvar) |

Inga produktbilder, logotyper eller gränssnitt har manipulerats. Inga nya screenshots av produkten behövdes – produktbilderna renderas från katalogdata.

## 4. Förenklade användarflöden

- Checkout tom varukorg: överlappande knappar + osynlig text → tydligt tomt läge med en CTA.
- Checkout: steg-etiketten "Cart" och "Order total"/"Total" var osynliga (vit/mörk på samma färg) → läsbara.
- My pages: "Personalise this view" var mörk text på mörk bakgrund → läsbar.
- Produktguide: steg 1 fungerar på desktop; "Clear all" visas bara när filter är aktiva.
- Sök från undersidor leder till filtrerad katalog (verifierat).

## 5. Tekniska problem som åtgärdades

- Stängda lådor (varukorg/sparade) låg precis utanför skärmen – deras skuggor gav en grå rand längs högerkanten på **varje sida**, och de var nåbara med tangentbordet. Nu `visibility: hidden` när de är stängda.
- `content-visibility: auto` på produktkort gjorde att kort blinkade tomma och sidan hoppade vid scroll.
- Reveal-animationen (threshold 0.1) kunde lämna höga sektioner osynliga; ny säker observer + deep links avslöjas direkt.
- Fokus efter stängd varukorg hamnade på en dold knapp på desktop.
- Serverns MIME-lista saknade `.woff2` och `.avif` (bara statisk filservering ändrad).
- Layoutskift (CLS) när produkt-/guidedata laddas: plats reserveras.
- WCAG AA-kontrast för små metatexter.

## 6. Tester och resultat

| Test | Resultat |
| --- | --- |
| `npm test` (31 tester) | 31/31 när filer som saknas i zip-paketet stubbas (se nedan). Utan stubbar: samma 2 fel som baslinjen |
| `npm run test:static` | Godkänd (med stubbar för de saknade juridiska sidorna) |
| `npm run test:e2e` | Hänger på `networkidle` p.g.a. SSE-strömmen – **likadant på oförändrad v14.1** (förexisterande) |
| Egna Playwright-flöden 375/1440 px | Varukorgslåda öppna/stäng/Escape/fokus, spara produkt, jämför, målval, `/`-sök, sök från undersida, mobilmeny öppna/Escape/länk, produktbild, skip-länk, inga JS-fel – alla godkända |
| Skärmbilder 375 / 430 / 768 / 1440 / 1920 px, 8 sidor | Ingen horisontell scroll, inga konsolfel/varningar |
| axe-core (WCAG 2.2 A/AA), 7 sidor × 2 bredder | **90 → 0** allvarliga fel |
| Sidvikt (14 sidvisningar) | **33,1 MB → 11,6 MB (−65 %)** |
| CLS produktsida mobil | **0,55 → 0** (guide 0,29 → 0, startsida 0,19 → 0) |

## 7. Kvar att göra / förslag (ej genomfört)

- **Zip-paketet är ofullständigt** jämfört med `FILE-MANIFEST.txt`: saknar bl.a. `privacy.html`, `terms.html`, `shipping-returns.html`, `assets/legal.js`, `data/withdrawals.json`, `scripts/backup-sqlite.mjs` och fyra V14-dokument. De finns troligen i ditt repo; jag har **inte** återskapat dem. När juridiska sidor finns bör de länkas i den nya footern.
- Konsolidera de 12 lagrade CSS-filerna (≈ 400 KB) till en stilmall – störst kvarvarande prestandavinst men större risk; bör göras som eget projekt med visuell regressionstest.
- E2E-sviten bör vänta på `load`/specifika element i stället för `networkidle`.
- Riktiga produktbeskrivningar, lab-rapporter och recensioner saknas – många sidor visar tomma lägen. Innehåll är nu den största begränsningen för premiumintrycket.
- Hela köpflödet (lägga i varukorg → betalning) kunde inte testas visuellt eftersom 0 produkter är köpbara i paketet, vilket jag medvetet inte ändrade.

## Installera (overlay)

`VERAPEP-v15-UX-UI-OVERLAY.zip` innehåller bara ändrade och nya filer. Packa upp ovanpå en **v14.1**-mapp och ersätt filer, som vid tidigare uppdateringar. Inga databas- eller miljöändringar krävs.
