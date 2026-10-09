# VERAPEP v20 – Säkerhetsrapport

Granskningen gjordes av en oberoende säkerhetsgranskare (en ny agent utan tidigare kännedom om koden) och verifierades därefter av huvudgranskningen. Varje fynd reproducerades mot temporära datakopior, aldrig mot produktion. Detaljer och tester finns i `V20-INDEPENDENT-AUDIT.md`.

## Sammanfattning

| Fynd | Allvar | Status |
| --- | --- | --- |
| S1 Sökvägsgenomgång via `%2F` (källkod, katalog, privata bilder) | Kritisk | **Åtgärdat i kod.** Öppen risk tills v20 driftsätts. |
| S2 Sessioner överlever att kontot inaktiveras, får ny roll eller nytt lösenord; inget absolut tak | Hög | Åtgärdat |
| S3 Den sista ägaren kan låsa ute ägarrollen; "lägg till användare" skriver över konton | Hög | Åtgärdat |
| S4 Redaktörer kringgår granskningen via direktredigering (externa bilder, påhittade labbrapporter, synlighet) | Hög | Åtgärdat |
| S5 Redaktörer kan upphäva ägarens "Do not publish" och godkännanden | Medel | Åtgärdat |
| S6 Fyraögonsprincipen gick att kringgå | Medel | Åtgärdat |
| S7 TOTP-koder kan återanvändas | Medel | Åtgärdat |
| S8 Login-CSRF via `text/plain` | Låg | Åtgärdat |
| S9 Felaktig kodning eller cookie ger 500 | Låg | Åtgärdat |
| S10 Svarstiden avslöjar vilka adminkonton som finns | Låg | Åtgärdat |
| S11 Supportrollen ser driftuppgifter i översikten | Låg | Åtgärdat |
| S12 Ask Vera avslöjar vilka produkter som är dolda | Låg | Delvis åtgärdat (se risker) |
| Ogranskad etikett "Research Use Only" på all produktgrafik | Hög (juridiskt) | Åtgärdat |
| Inaktuell cache-versionering (gammal JavaScript i upp till ett år) | Hög (drift) | Åtgärdat och kontrolleras i CI |

## Status för tidigare identifierade risker

| # | Risk | Status 2026-10-09 |
| --- | --- | --- |
| 1 | Publikt GitHub-repo med interna produktuppgifter | **Öppen.** Repot är fortfarande publikt. Kräver ditt beslut. |
| 2 | Vercel-preview med åtkomst till produktionshemligheter | **Öppen.** `DATABASE_URL` och `ADMIN_PASSWORD` gäller fortfarande `preview`. Inget Ignored Build Step. |
| 3 | Render och publiceringsfiltret | **Kan inte verifieras härifrån** (Render nås inte från den här miljön). Koden väljer strikt filter på hostade miljöer. Kontrollera efter driftsättning att `/api/health` visar `publicationGate: strict`. |
| 4 | Gamla audit-loggar | **Öppen.** Rensningsverktyget finns men har inte körts mot produktionen (kräver godkännande). |
| 5 | Behörigheter och sessioner | **Förbättrat i v20** (S2–S8, S11). |
| 6 | Dokumentlagring | **Förbättrat i v20.** Uppladdning görs nu i en transaktion, säkerhetskopiering och återställning omfattar dokumenten, och sökvägsgenomgången (S1) är stängd. Med standardinställningen `DATA_DIR=data/` låg privata dokument tidigare inom webbroten och gick att nå via S1. |

**Systemet beskrivs inte som produktionssäkert.** Punkterna 1–4 och driftsättningen av S1-rättelsen återstår.

## Kvarvarande lägre risker

- Ask Vera ger fortfarande olika svar på "<dolt namn> price" och "<okänt namn> price".
- Ingen gräns för antalet SSE-anslutningar per IP.
- Uppladdningar buffras i minnet (högst 15 MB per uppladdning, ingen global gräns). Kräver inloggning.
- Kontolåsningen kan utlösas av någon annan som gissar lösenord från många adresser.
- Ingen extern penetrationstest har gjorts.

## Testat utan anmärkning

- **Uppladdning:** storleksgräns, filtypskontroll och nedladdning som bilaga med sandlåda.
- **Behörighet:** CSRF på alla ändrande anrop; godkännande kräver ägare och bekräftelsefras; admin kan inte bli ägare.
- **Övrigt:** XSS-escapning i alla admin- och butiksvyer, ingen ReDoS i Ask Vera, dolda produkter finns inte i någon publik data.
