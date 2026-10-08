# LUPNUMBER Yard Twin – Fas 0: Kartläggning, fasplan och öppna frågor

Status: **utkast, väntar på beslut.** Ingen simulatorkod är skriven.
Datum: 2026-10-08

---

## 1. Huvudfynd: källdatan finns inte där jag kan nå den

Jag har sökt igenom allt som den här sessionen har åtkomst till:

| Källa | Innehåll | Relevant för Yard Twin? |
| --- | --- | --- |
| `wictor-tech/kungbern` (detta repo) | Remotion-projekt (18 s och 30 s reklamfilm) + Vite/React-explainer i `web/`. 43 filer. Ingen backend, ingen databas, inget schema, inga API-anrop, inga migrationer. | Nej, bara varumärkesmaterial (färger, logotyp). |
| `wictor-tech/outreah` | Privat repo (namnet tyder på outreach) | Inte undersökt, troligen inte plattformen. Säg till om jag ska läsa det. |
| `wictor-tech/verapep-friends-test` | Privat repo | Troligen inte relevant. |
| Vercel (via anslutningen) | Ett projekt, `lup-hjalp` (Next.js), kopplat till just detta repo. | Nej, ingen databas eller plattform. |

**Slutsats:** LUPNUMBER-plattformen (incheckning, LPR, slottbokning, grindhändelser och lossningstider) ligger i ett repo eller en databas som den här sessionen inte kan nå. Därför kan jag **inte** leverera punkt 1–4 i Fas 0 med verkliga tabell- och kolumnnamn, nullandelar eller datamängder per sajt. Instruktionen är att aldrig gissa fältnamn, och det gör jag inte heller. Tabellen nedan är en mall som jag fyller i så fort jag får åtkomst.

**Säkerhetsflagga:** `wictor-tech/kungbern` är ett **publikt** repo. Inga kunddata, kalibreringsprofiler, schemadumpar, anslutningssträngar eller exempelutdrag får hamna här. Yard Twin bör ligga i plattformsrepot eller i ett nytt **privat** repo (se fråga Q1).

---

## 2. Kartläggningsmall: önskad indata → källa

Kolumnerna "Tabell/kolumn" och "Kvalitet" fylls i när jag får åtkomst. Kolumnen "Varför den behövs" visar vilka delar av modellen som blir blockerade om fältet saknas.

| # | Önskad indata | Tabell/kolumn | Finns? | Kvalitet (null %, orimliga, TZ/DST, dubbletter) | Varför den behövs |
| --- | --- | --- | --- | --- | --- |
| 1 | Ankomsttid (första LPR-läsning vid grind) | ? | osäker | ? | Ankomstmönstret "As recorded" och backtest |
| 2 | Incheckningstid (kiosk/manuell) | ? | osäker | ? | Uppehållstid vid grind |
| 3 | LPR-händelser (alla läsningar, kamera-ID, konfidens) | ? | osäker | ? | Dubblettrensning, gårdsrörelser, utfart |
| 4 | Bokad slot (start, slut, skapad, ändrad) | ? | osäker | ? | Slot adherence, scenariot "Booked slots" |
| 5 | Kötid vid grind | ? (troligen härledd: incheckning − ankomst) | osäker | ? | Grindresurs |
| 6 | Tilldelad dörr/ramp/plats + tidpunkt för tilldelning | ? | osäker | ? | Väntan till dörr, dörrbeläggning |
| 7 | Start och slut på lossning | ? | osäker | ? | **Kritiskt.** Utan detta finns ingen lossningsfördelning. |
| 8 | Utcheckning/utfart | ? | osäker | ? | Tid på gården, tid till tom gård |
| 9 | Sajt / terminal / tenant | ? | osäker | ? | Segmentering och **isolering** |
| 10 | Antal pallar/kollin | ? | osäker | ? | Korrelation lossningstid ~ volym |
| 11 | Transportör | ? | osäker | ? | Segment och prioritetsstrategi (pseudonymiseras i demo) |
| 12 | Godstyp (kyl/torr/farligt gods …) | ? | osäker | ? | Segment och dörrspecialisering |
| 13 | Avbokningar (tidpunkt) | ? | osäker | ? | Avbokningsandel, sena avbokningar |
| 14 | No-shows | ? (troligen härledd: bokad utan ankomst) | osäker | ? | No-show-andel |
| 15 | Manuella ändringar av tider (audit log, vem/när) | ? | osäker | ? | Flagga misstänkt manuellt satta tider |
| 16 | Dörrregister (antal, typ, öppettider, avstängningar) | ? | osäker | ? | Resurskapacitet per dag |
| 17 | Sajtens öppettider och helgdagar | ? | osäker | ? | Tidsfönster och "tid till tom gård" |
| 18 | Tidszon per sajt och lagringsformat (UTC/lokal) | ? | osäker | ? | Fel kring sommartid är vanliga, särskilt om lokal tid lagras utan offset |

Det här kör jag per sajt när jag har läsåtkomst (endast aggregat, aldrig rådata ut ur källmiljön):

- antal besök, antal unika dagar, första och sista datum, besök per dag (median, P10, P90)
- nullandel per fält och andel orimliga sekvenser (t.ex. lossning före ankomst, lossning < 1 min eller > 8 h, negativ tid på gården)
- dubbletter (samma regnr och sajt inom N min, flera LPR-läsningar), där N är en parameter
- avvikelser kring sommartid (vecka 13 och 43: besök kl. 02–03, dygn med 23 eller 25 timmar)
- "runda" tider (exakt :00/:30, sekunder = 0) som indikator på manuellt satta tider
- rangordning för kalibrering: ≥ 90 dagar **och** ≥ N besök (förslag N = 500), samt andel besök där fält 1, 6 och 7 är kompletta

---

## 3. Multi-tenant-isolering

**Nuläge:** kan inte verifieras, eftersom plattformens kod och databas inte är åtkomliga.

**Förslag (oberoende av hur plattformen gör i dag):**

1. **Läsning:** pipelinen läser bara via en tenant-scopad vy eller roll (t.ex. Postgres RLS med `tenant_id` från sessionen). Den har ingen superuser-anslutning.
2. **Lagring:** all härledd data (`visits`, `site_profile`, kalibreringsresultat) har `tenant_id` som obligatorisk del av nyckeln. Alla läsfunktioner kräver ett tenant-argument, och det finns inga "hämta allt"-funktioner.
3. **Demoläget är fysiskt separerat:** demon körs mot ett eget dataset (en separat fil eller ett eget schema) som genereras ur *aggregerade fördelningar*. Det innehåller aldrig rader från källan. Demobygget saknar databasanslutning helt, så demon *kan* inte nå kunddata, oavsett om någon klickar fel.
4. **Exporttröskel från kunddata till demo:** bara fördelningsparametrar och kvantiler får lämna kundmiljön, med k-anonymitet (inga segment med < k besök, förslag k = 20). Transportörer och godstyper byter namn till "Transportör A/B/C".
5. **Tester (Fas 6):** negativa tester som försöker läsa tenant B med tenant A:s kontext, plus ett test som säkerställer att demobygget inte innehåller några strängar som liknar registreringsnummer.

---

## 4. Det som saknas för en full dockmodell: förslag per komponent

(a) = mätt i data, (b) = inställbart antagande med tydlig märkning, (c) = uteslutet i v1.

| Komponent | Förslag | Motivering |
| --- | --- | --- |
| Antal dörrar och deras öppettider | (a) om dörrregister finns, annars (b) | Krävs. Utan dörrantal finns ingen modell. |
| Dörrspecialisering (kyl/torr, sidolossning) | (b) | Sällan strukturerat i data. Säljaren eller kunden anger det. |
| Truckar/truckförare | (b), avstängt som standard | Lossningstiden i data *innehåller* redan trucktiden. Att modellera truckar separat dubbelräknar, om man inte specifikt vill testa truckbrist. |
| Personal per skift | (c) i v1 | Data saknas troligen. Fångas indirekt via lossningstid per timme på dygnet. |
| Pappersarbete/fraktsedel efter lossning | (a) om utcheckning − lossningsslut går att mäta, annars (b) | Kan mätas som restid efter lossning. |
| Parkeringsplatser/köutrymme | (b) | Fysiskt mått från kunden. Behövs för att se när kön "spiller ut på vägen". |
| Grindkapacitet (antal filer, incheckningstid) | (a) uppehållstid vid grind, (b) antal filer | |
| Lagerkapacitet inomhus (buffertyta, mottagning) | (c) i v1, flaggat i "Begränsningar" | Kräver WMS-data som vi inte har. |
| Väder, trafik och personalbrist | (c), visas i "Begränsningar" | Fångas bara som brus i den empiriska fördelningen. |
| Förare som hamnar vid fel dörr | (c), visas i "Begränsningar" | |
| Kostnader (detention, personal, transportörsavgift) | (b), alltid indata från kunden med källa | Får aldrig ha dolda standardvärden. Fältet är tomt tills någon fyller i det. |

---

## 5. Arkitekturförslag

Repot har i dag ingen app-stack, bara Vite + React + TypeScript för explainern. Förslaget nedan utgår från den stacken och gäller med förbehåll för plattformens egen stack (Q2).

```
yard-twin/                       (privat repo eller katalog i plattformsrepot)
  packages/
    engine/        Ren TS: DES-motor, strategier, ankomstmodeller, Monte Carlo, seedad PRNG.
                   Inga beroenden, körs i både browser och Node. Vitest.
    calibration/   Härledning av visits → site_profile, parameterskattning, backtest, betyg.
    scenario/      JSON-schema för scenarier (zod) + versionering.
  pipeline/        Idempotent extraktion från källa → visits (vy/SQL i källmiljön), körs per tenant.
  api/             Tunn HTTP-tjänst: kör scenario, hämta resultat, auth/roller, körlogg.
  app/             Vite + React + TS. 2D gårdsvy i SVG, därefter Three.js. Fungerar mot API eller demo-dataset.
  demo-data/       Syntetiska dataset genererade ur aggregerade fördelningar (aldrig rådata).
```

Viktiga val och varför:

- **Motorn i TypeScript, inte Python.** Den kan köras i webbläsaren, så "varje ändring kör om hela dagen" blir omedelbar utan servertur, och den kan flyttas in i plattformen som modul. 200 lastbilar × 300 repetitioner är ungefär 60 000 lastbilsflöden och bör klara sig under 1 s i en Web Worker. Det mäts i Fas 2.
- **Pipelinen körs nära källan** (SQL/vyer i plattformens databas). Rådata och registreringsnummer flyttas aldrig. Bara `visits` (pseudonymiserade) och aggregat lämnar.
- **Seedad PRNG** (t.ex. en egen xoshiro128 eller sfc32, cirka 20 rader). Det gör tester och Monte Carlo reproducerbara utan något nytt beroende.
- **Möjliga nya beroenden** (motiveras när de införs): `vitest` (tester), `zod` (scenarioschema), `three` (3D-läge i Fas 5), `playwright` (screenshottester, redan installerad i miljön) och ett PDF-bibliotek i Fas 5.

---

## 6. Fasplan med tidsuppskattning

Uppskattningarna förutsätter att jag har läsåtkomst till källdatan och snabba svar på frågorna. Kalenderdagar beror mest på beslutsrundorna.

| Fas | Innehåll | Uppskattning | Blockeras av |
| --- | --- | --- | --- |
| 0b | Fyll kartläggningstabellen med verkliga kolumner, kvalitet och datamängd per sajt, plus rangordning | 0,5–1 dag | Q1–Q4 (åtkomst) |
| 1 | Pipeline → `visits` och `site_profile`, datakvalitetsrapport, parameterskattning, demo-dataset | 3–5 dagar | 0b och Q5–Q8 (affärsregler) |
| 2 | DES-motor, strategier, ankomstmodeller, scenario-JSON, Monte Carlo, prestandamätning | 3–4 dagar | Kan starta parallellt med Fas 1 mot syntetiska fixtures |
| 3 | Backtest, hold-out 70/30, MAE/MAPE/bias, betyg, tornado, begränsningstext | 2–3 dagar | Fas 1 och 2, Q9 |
| 4 | Dörr- och slotoptimering, flaskhals, kapacitetsgräns, slotdesign, ROI med intervall | 2–3 dagar | Fas 3, Q10 |
| 5 | UI (2D → 3D), uppspelning, Gantt, insikter, jämförelse, PDF/CSV, sv/en, presentationsläge | 6–9 dagar | Fas 2 (motor), Fas 3 (betyg) |
| 6 | Tenant-tester, roller, API, cache, omkalibrering, driftsövervakning, dokumentation och säljguide | 3–5 dagar | Q2, Q11 |

Totalt cirka 20–30 arbetsdagar. Subagenter körs parallellt där det går (Fas 1 ∥ Fas 2, UI-skelett ∥ Fas 3), och varje fas avslutas med en separat granskningsagent och grön CI.

---

## 7. Öppna frågor till dig (beslut som behövs)

**Åtkomst och placering (blockerar allt)**

- **Q1.** Var ska Yard Twin ligga? Förslag: i plattformsrepot eller ett nytt **privat** repo, *inte* i `kungbern` som är publikt.
- **Q2.** Vilket repo innehåller LUPNUMBER-plattformen, och vilken stack har den (språk, ramverk, databas, auth)? Lägg till repot i sessionen.
- **Q3.** Hur får jag läsåtkomst till data? Alternativ: (a) read-only-roll mot en replika/staging, (b) ett schema-dump + anonymiserat utdrag, (c) du kör mina profileringsfrågor och skickar tillbaka aggregaten. (c) är säkrast om det gäller produktionsdata.
- **Q4.** Vilka kunder och sajter får användas för kalibrering, och finns avtalsstöd (DPA) för att använda deras data så här?

**Affärsregler (får inte gissas)**

- **Q5.** Vad räknas som "ankomst": första LPR-läsningen, incheckning i kiosk eller grindpassage?
- **Q6.** Hur definieras no-show och sen avbokning (tidsgräns)?
- **Q7.** Vilka tolerances gäller för "i tid" mot bokad slot (t.ex. ±15 min)? Är det per kund?
- **Q8.** Hur loggas lossningsstart och lossningsslut: av personal, av system eller via dörrsensor? Det avgör hur mycket manuella tider vi ska förvänta oss.

**Validering och ROI**

- **Q9.** Är betygsgränserna OK? Förslag: Hög = MAPE ≤ 10 % på hold-out och ≥ 90 dagar, Medel = ≤ 20 %, Låg/varning = > 20 % eller tunn data.
- **Q10.** Vilken valuta ska vara standard (SEK eller EUR), och vem levererar detention- och personalkostnader: kunden i mötet eller säljaren i förväg?

**Produkt**

- **Q11.** Vilka roller finns (säljare, kundadmin, intern analytiker), och ska kunder själva kunna logga in i Yard Twin, eller visas den bara av oss?
- **Q12.** Ska demon fungera offline (säljmöte utan nät)? Det talar för att köra motorn i webbläsaren med inbäddat demo-dataset, vilket jag föreslår.
