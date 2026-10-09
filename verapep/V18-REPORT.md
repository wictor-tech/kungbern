# VERAPEP v18 – teknisk rapport

Bygger på v17 (`claude/verapep-v17`, `331cf4e`). Gren: `claude/verapep-v18`. **Inte lanseringsgodkänd.** Inga spärrar har tagits bort, ingen produkt har godkänts, köp är inte aktiverat och ingen produktionsdata eller produktionsinställning har ändrats.

| Dokument | Innehåll |
| --- | --- |
| `V18-EXECUTIVE-SUMMARY.md` | Sammanfattning på enkel svenska |
| `V18-SECURITY-REPORT.md` | Granskning av GitHub-historiken, vad som är publikt, åtgärdade fynd |
| `V18-REPOSITORY-AND-DEPLOYMENT.md` | Vercel-felet, isolering av projekten, ordning för versionsgrenarna, Render |
| `V18-CI.md` | Arbetsflödet, säkerhet i CI, verifierade körningar |
| `V18-LAUNCH-BLOCKERS.md` | De 20 blockerarna i kategorier, prioriterade ägarbeslut |
| `RETENTION.md` | Lagringstider (förslag), verktyg för gallring och rensning |

## Ändringar

| Område | Ändring |
| --- | --- |
| CI | `.github/workflows/verapep-ci.yml` med jobben checks, e2e och release gate; bara läsbehörighet, inga hemligheter |
| Leveranskontroll | `scripts/secret-scan.mjs` (arbetskatalog och historik) och `scripts/verify-release.mjs` (manifest, incheckade filer, ZIP, ren uppackning, tester i paketet) |
| Proxy | `TRUST_PROXY` = antal betrodda led; adressen tas från höger i `X-Forwarded-For` och valideras som IP |
| Orderuppslag | E-post bara via POST; token som header; inga personuppgifter i URL:er; gamla länkar fungerar och rensas ur adressfältet |
| Granskningslogg | `scripts/scrub-audit-log.mjs` (dry-run, backup, ångrafil, efterkontroll, återställning) |
| Lagringstider | `data/retention-policy.json` (förslag) och `scripts/retention.mjs` (bara rapport tills policyn godkänts) |
| Publiceringsfilter | Driftad miljö blir automatiskt strikt; `render.yaml` sätter strikt läge; bildkartan genereras av servern med bara synliga produkter; foton för dolda produkter ger 404; inga produkt-id:n hårdkodade i klientkod |
| Seed-data | `orders.json` och `returns.json` är incheckade (en ren checkout saknade dem tidigare) |
| Lanseringsstatus | `blockerDetails` med kategori och åtgärd; admin grupperar blockerarna |
| Ask Vera | Stavfelstolerans (redigeringsavstånd inklusive bokstavsbyten), felstavade produktnamn ("I assume you mean …"), läkemedelsvarumärken behandlas som okända, effektfrågor ("does X help wrinkles", "hjälper X mot …") nekas, nya nyckelord (klagomål, avbeställning), kunskapsbas 18.0 |
| Korrekt beskrivning av Vera | Webbplatsen säger att Vera väljer bland godkända svar och inte är generativ AI. Etiketterna "AI support" är borttagna. Startsidans påstående att Vera "uses the same filters as the product finder" var felaktigt sedan v17 och är rättat. |

## Testresultat (slutkörning)

| Svit | v17 | v18 |
| --- | --- | --- |
| `npm test` (tester och deltester) | 73/73 | **87/87** (14 nya i `tests/v18.test.mjs`) |
| Statisk validering | ✅ | ✅ (den genererade bildkartan undantagen) |
| CSS-kontroll | ✅ | ✅ |
| E2E (inklusive axe WCAG 2.2 AA, 0 allvarliga eller kritiska fel) | 16/16 | **17/17** (nytt: `order_privacy`) |
| Hemlighetsskanning, arbetskatalog och hela historiken | — | ✅ inga fynd |
| Releaseverifiering (ren uppackning och tester i paketet) | manuell | ✅ automatisk |
| Simulerade personor | 16/16 | 16/16 |
| **GitHub Actions** | ingen CI | ✅ [körning #3](https://github.com/wictor-tech/kungbern/actions/runs/37910279559) grön; #1 röd på ett verkligt fel |

## Kvalitetsgranskning v17 → v18

Mätt med Playwright på 9 sidor × 3 bredder (1440, 820, 390 px), mot servrar med samma testdata:
- **JS- och konsolfel:** 0 i båda versionerna.
- **Horisontell scroll:** ingen.
- **Överförd mängd per sida:** oförändrad (±1 KB).
- **Visuella skillnader:** bara där de var avsedda.
  - Startsidan: utvalda produkter väljs nu bland synliga produkter med foto i stället för en hårdkodad lista, så ordningen skiljer sig, och Vera-avsnittets text är ny.
  - Supportsidan: ny beskrivning av Vera.
  - Checkout vid 820 px skiljer sig bara på subpixelnivå (kantutjämning).
- **Admin:** systemstatus grupperar blockerarna (skärmbild granskad).
- **Försämringar:** inga funna. Den enda funktionella skillnaden är att `GET /api/orders/:id?email=` avvisas med 400. Det var avsiktligt; de egna klienterna använder POST.

## Kända begränsningar

- Actions är låsta till taggar, inte till commit-SHA. GitHub varnar för utfasningen av Node 20 i `checkout@v4`/`setup-node@v4`/`setup-python@v5`.
- Det publika repot och dess historik innehåller fortfarande den konfidentiella katalogen. Det kräver ägarbeslut.
- `TRUST_PROXY=1` förutsätter exakt en proxy framför servern, vilket gäller Render. Andra uppsättningar behöver rätt antal.
