# Lanseringsblockerare (v20)

**VERAPEP är inte produktionssäkert och inte godkänt för lansering.** v20 har åtgärdat de tekniska fel som granskningen hittade (se `V20-INDEPENDENT-AUDIT.md`). De återstående blockerarna kräver driftsättning, konfiguration, ägarbeslut eller juridisk bedömning. Inga kontroller har tagits bort eller försvagats. Ingen produkt har godkänts eller blivit köpbar.

## A. Akut, före allt annat (säkerhet)

| # | Blockerare | Läge 2026-10-09 | Vem |
| --- | --- | --- | --- |
| A1 | **Den driftsatta versionen saknar rättelsen för sökvägsgenomgång (S1).** Källkod och hela katalogen, inklusive dolda produkter, kan hämtas via `/assets%2F..%2F…`. | Rättat i v20, inte driftsatt. Render gick inte att nå härifrån för kontroll. | Du (godkänn driftsättning av v20, eller stäng tjänsten tills dess) |
| A2 | **GitHub-repot är publikt** | Oförändrat (oautentiserad läsning ger 200) | Du |
| A3 | **Vercel `lup-hjalp`:** produktionsdatabasens `DATABASE_URL` och `ADMIN_PASSWORD` gäller även preview-byggen | Oförändrat | Du / Vercel-administratör |
| A4 | Gamla audit-loggar kan innehålla lösenordshashar | Verktyget finns (v18) men har inte körts mot produktionen | Du + teknisk ansvarig |
| A5 | Ingen extern säkerhetsgranskning (penetrationstest) | – | Extern part |

## B. `/api/ready` (oförändrat från v18: 19–20 blockerare)

Alla 20 punkter i `V18-LAUNCH-BLOCKERS.md` gäller fortfarande:
- driftkonfiguration: DATA_DIR, adminlösenord, MFA-nyckel, HTTPS, e-post, Stripe;
- juridiska bedömningar: produkter, integritet, villkor;
- ägarbeslut: moms, företagsuppgifter, allowlist, aktivering av live-handel;
- databasbeslutet: PostgreSQL eller dokumenterat SQLite-undantag.

**Nytt i v20 och relevant för driften:**
- En tom persistent disk startar nu, så DATA_DIR går att sätta upp.
- Säkerhetskopior innehåller dokumenten, och återställning tar tillbaka dem.
- Underhållsskript vägrar köra medan servern är igång. Stoppa servern före KB-migrering, retention eller återställning.

## C. Innehåll och juridik (ägarbeslut)

| # | Beslut |
| --- | --- |
| C1 | Juridisk klassificering av alla 84 produkter per marknad (inga godkännanden finns). |
| C2 | Köpvillkor, integritetspolicy, leverans/retur och ångerrätt (juristgranskade). |
| C3 | Företagsuppgifter (namn, organisationsnummer, adress). |
| C4 | Verifierade underlag per produkt (se `V19-OWNER-INPUT-NEEDED.md`). |
| C5 | Referenspriser visas för produkter som inte kan beställas, men Veras godkända svar säger motsatsen. Välj vilket som gäller. |
| C6 | Förtroenderaden "Lab reports where available" när ingen rapport är publicerad. |
| C7 | "Research Use Only" är nu borttaget från grafiken. Om etiketten ska användas någonstans krävs juridisk bedömning. |
| C8 | Godkänn eller avvisa de 28 svenska översättningsförslagen för Ask Vera. |
| C9 | Riktiga användartester med 2–3 personer (alla tester hittills är simulerade). |

## D. Sammanslagning och driftsättning

PR #3 (v18), #4 (v19) och v20-PR:en är utkast. Inget har slagits samman eller driftsatts. Rekommenderad ordning: granska → slå samman v18 → v19 → v20 → driftsätt v20 på en isolerad testmiljö → kontrollera `/api/health` (version 20.0.0) och `/assets%2F..%2Fserver.mjs` (ska ge 404) → produktion.
