# Ask Vera – granskning och förbättringar (v17)

## 1. Så fungerade Vera i v16 (granskning)

| Fråga | Svar i v16 |
| --- | --- |
| Hur hanteras frågor? | `POST /api/support/ask`. Frågan gjordes om till gemener, och för varje kunskapspost räknades hur många ord i postens `question`-fält som fanns *som delsträng* i frågan. Högst poäng vann. |
| Hur genereras svar? | Postens färdiga `answer`-text returnerades oförändrad. Ingen AI-modell och ingen textgenerering. |
| Var lagras svaren? | `data/support-kb.json` seedas in i SQLite-tabellen `documents` (nyckel `supportKb`) **endast första gången** servern startar (`INSERT OR IGNORE`). Därefter läses och skrivs bara databasen. |
| Vad var hårdkodat? | Supportadressen `hello@verapep.eu` i reservsvaret och i klientens länkar, välkomsttexter och snabbknappar i HTML, samt att produkt-id:t lades till i frågetexten på produktsidan. |
| Hur påverkar databasen innehållet? | Helt: efter första start styr databasen. Ändringar i `support-kb.json` når inte befintliga installationer. Det var problemet som kvarstod från v16. |
| Frågor utan svar? | Ett enda reservsvar med e-postadress. Inga förslag och ingen förklaring. |
| Avvikelser mellan installationer | Gamla databaser behöll svaren från v14.1. Admin-editorn (en textruta, `fråga | svar | länk` per rad) döpte dessutom om alla id:n till `kb-1`, `kb-2` … vid varje sparning, så posterna gick inte att spåra. |

**Allvarliga brister som hittades**

1. **Osäker vägledning.** "How much semaglutide should I inject to lose weight?" matchade ordet *weight* och skickade besökaren till produktfiltret för viktminskning. Det är i praktiken en produktrekommendation för ett hälsomål.
2. **Delsträngsmatchning.** Kort nyckelord matchade inuti andra ord, och lika poäng avgjordes av postordningen.
3. **Svenska frågor** gav reservsvaret (t.ex. "hur kontaktar jag er?").
4. **Ingen hastighetsbegränsning** på endpointen.
5. **Inga laddnings- eller feltillstånd** i gränssnittet. Fel visades som en generisk text, utan möjlighet att försöka igen.
6. **Ingen produktkunskap.** Vera kunde inte svara på "finns det labbrapport för X?" trots att uppgiften fanns i katalogen.

## 2. Nytt i v17

### Svarsmotor (`lib/vera.mjs`)

Vera är fortfarande **retrieval-only och deterministisk**. Hon kan bara returnera något av följande:

1. **Säkerhetssvar** vid frågor om dosering, administrering, biverkningar, behandling, sjukdomar, graviditet, eller rekommendationer för hälsomål som viktnedgång och muskler. Detektionen fungerar på engelska och svenska och körs *före* all annan matchning. Svaret är fast, märkt "Not medical advice", innehåller inga produktlänkar och kan inte redigeras i admin.
2. **Godkända kunskapssvar** från kunskapsbasen. Matchningen sker på hela ord och fraser, med enkel stamning, plus svenska synonymer (t.ex. *leverans*, *frakt*, *kontakt*, *retur*, *ångerrätt*, *villkor*, *spåra*, *beställning*, *företag*, *står bakom*). Platshållare fylls från konfigurationen: `{supportEmail}`, `{deliveryEstimate}`, `{deliveryCountries}`, `{orderingStatus}`, `{labReportStatus}`, `{companyLine}`. Okända platshållare visas aldrig.
3. **Produktfakta** för *publikt synliga* produkter: kategori, specifikationer, om en beskrivning eller labbrapport är publicerad, och om produkten kan beställas. Saknas något säger Vera det. Produkter som är dolda av publiceringsfiltret behandlas som okända ("I don't have published information about that product"), så Vera avslöjar inte att de finns.
4. **Ärligt reservsvar** med förslag på närliggande frågor och supportadressen.

Övrigt:

- **Integritet.** Frågor lagras inte och loggas inte. Ett test verifierar att frågetexten inte hamnar i databasen. Innehåller frågan en e-postadress, ett telefonnummer eller ett personnummer visas en uppmaning att inte dela personuppgifter. Admin ser bara anonyma räknare per svarstyp sedan senaste omstart.
- **Hastighetsbegränsning:** 30 frågor per minut och IP-adress. Bakom proxy kräver det `TRUST_PROXY=true`.
- **API:t är bakåtkompatibelt.** Svaret innehåller fortfarande `answered`, `answer`, `url` och `liveSupport`. Nya fält: `kind`, `source`, `links`, `suggestions`, `notice`. Produktsammanhang skickas som `productId` i stället för att klistras in i frågan.

### Kunskapsbas v3 (`data/support-kb.json`)

21 svar med id, revision, titel, nyckelord, svar och länk.

**Nya ämnen:** retur och ånger, betalning, saknad information, tillgänglighet, jämförelse, sök, kontakt, vem som driver sajten, integritet, villkor, orderspårning, hur information kontrolleras, och om Vera.

Svaren påstår bara det som är verifierat i koden eller konfigurationen. Exempel:
- "No real payments can be made at the moment."
- "The final terms of sale have not been approved."
- Labbrapportstatus räknas fram ur faktisk data.

### Gränssnitt (`assets/vera-client.js`)

Gäller både supportsidan och flytpanelen på startsidan:

- **Väntetillstånd:** skrivindikator, knappen inaktiv och `aria-busy`. Loggen har `role="log"` och `aria-live`.
- **Svarsbubblor** med länkar och följdfrågor som knappar.
- **Felmeddelanden i klartext** för timeout (8 s), nätverksfel, serverfel och för många frågor, med en "Try again"-knapp.
- **Tangentbord:** Enter skickar, Shift+Enter ger ny rad, Escape stänger panelen.
- **Snabbknappar** ställer vanliga frågor (leverans, retur, labbrapporter, kontakt). Tidigare satte de hälsofilter som "Weight & metabolism".
- **Supportsidan** har bytt namn till "Questions and contact". Den har en integritetsrad under fältet och en ny sektion **Contact** (`/support.html#contact`) med synlig e-postadress, adress för integritetsfrågor, operatörsstatus och orderspårning. Footerns "Contact support" (en mailto-länk) heter nu "Contact us" och leder dit.
- **Mobil:** snabbknapparna scrollar horisontellt, ingen horisontell sidscroll vid 375–430 px, och tryckytorna är minst 36–40 px.

### Administration av kunskapen (Admin → Guide & AI)

- **Strukturerad redigerare:** en hopfällbar post per svar, med titel, länk, nyckelord, svar och "Keep my wording during knowledge updates". **Id:n bevaras.**
- **Länkvalidering:** endast sidvägar, `https://` och `mailto:` godkänns. `javascript:` och liknande avvisas.
- **Skydd mot massborttagning:** att ta bort fler än två svar kräver en bekräftelse som visar antal och namn. Borttagna standardsvar registreras i `removedShippedIds` och läggs inte tillbaka vid uppdateringar.
- **Panelen "Knowledge updates"** visar status, en lista över planerade ändringar, "Back up and apply" och återställning från säkerhetskopior.
- **Panelen "Ask Vera usage"** visar anonyma räknare, inklusive antal obesvarade frågor.

## 3. Migrering av befintliga databaser

Problemet: nya svar nådde bara nya installationer. Lösningen består av `lib/support-kb-migration.mjs`, `scripts/migrate-support-kb.mjs` och admin-API:t.

| Krav | Hur det uppfylls |
| --- | --- |
| Upptäcka föråldrat innehåll | `data/support-kb-history.json` innehåller innehållshashar för varje svar som levererats i v14.1, v16 och v17. En post räknas som föråldrad bara om dess text **exakt** motsvarar ett tidigare levererat svar. Det fungerar även om den gamla editorn döpt om id:t till `kb-N`. |
| Visa exakt vad som ändras | Dry-run (standard) listar varje post som UPDATE, ADD, RENAME, KEEP, KEEP* eller SKIP, med skäl. `--verbose` visar text före och efter. I admin visas samma plan. |
| Bevara anpassningar | En redigerad text (KEEP*), ett eget svar (KEEP) och ett låst svar (LOCKED) ändras aldrig. Ett redigerat standardsvar känns igen på sina nyckelord, så v17-versionen läggs inte till som dubblett. |
| Idempotent | Andra körningen ger "Nothing to change". Planen deduplicerar id:n. |
| Backup före ändring | En JSON-ögonblicksbild av kunskapsbasen och en full SQLite-kopia (`VACUUM INTO`) skrivs till `DATA_DIR/backups/` före varje apply. |
| Rollback | `--rollback <snapshot>` eller "Restore" i admin. Nuvarande läge sparas först. Snapshot-namn valideras mot ett strikt mönster, vilket skyddar mot sökvägsattacker. |
| Dry-run | Standardläge i CLI. I admin krävs bekräftelse av antal ändringar. |
| Ingen automatisk uppdatering | Servern rapporterar bara "N updates available" i admin och i systemstatus. Inget skrivs förrän en behörig person godkänner. |

```bash
node scripts/migrate-support-kb.mjs                 # dry run
node scripts/migrate-support-kb.mjs --apply         # backup + apply (stoppa servern först, eller använd admin)
node scripts/migrate-support-kb.mjs --list          # ögonblicksbilder
node scripts/migrate-support-kb.mjs --rollback support-kb-…json
node scripts/record-kb-release.mjs 17.1             # underhåll: registrera nästa versions svar
```

**Testat** mot en databas i v16-läge med omdöpta id:n, ett redigerat prissvar, ett eget svar och v14.1-text. Resultat: 21 ändringar, egna svar bevarade, inga dubbletter. Andra körningen ändrade ingenting, och rollback återställde de 4 ursprungliga posterna. Se `tests/v17.test.mjs`.

**Produktionsdatabasen har inte uppdaterats.** Kör dry-run mot en kopia, granska planen och tillämpa via admin.

## 4. Begränsningar och vad som inte gjorts

- Vera förstår inte fritt språk som en språkmodell. Hon känner igen nyckelord, fraser och synonymer. Det är ett medvetet val: hon ska inte kunna hitta på något. Om en språkmodell införs senare bör den bara få formulera om godkända svar (retrieval), och säkerhetsspärren ska ligga kvar före modellen.
- Svaren är på engelska, eftersom sajten är på engelska. Svenska frågor förstås, men besvaras på engelska.
- Obesvarade frågor sparas inte som text (dataminimering). För att se *vad* besökare frågar om krävs ett beslut om samtycke och lagringstid; se `V17-LAUNCH-READINESS.md`.
