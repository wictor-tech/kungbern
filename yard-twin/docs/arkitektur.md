# Arkitektur

```
 Plattformens källdata (okänt schema)
        │  adapter per källa (skrivs när schemat är verifierat)
        ▼
 visits (datakontrakt v1, UTC + IANA-tidszon, pseudonymer)          src/data/contract.ts
        │  deriveVisits → kvalitetsflaggor, lokal tid, härledda tider    src/data/derive.ts
        ▼
 DerivedVisit[] ──► kvalitetsrapport                                src/data/quality.ts
        │
        ├─► calibrateSite → SiteModel (site_profile) + statistik     src/data/calibrate.ts
        └─► recordedDays  → RecordedDay[] (replay/backtest)           src/data/recorded.ts
                 │
                 ▼
 holdoutBacktest (70/30 kronologiskt) → gradeCalibration             src/analysis/
                 │
                 ▼
 Dataset { profiles, days, calibration, quality }  ──►  UI (demo: inbyggd JSON)
                                                    ──►  API (tenant: <dir>/<tenant>/<site>.json)
```

## Motorn (`src/engine`)

- **Deterministisk kärna.** `simulateDay(trucks, site, strategy, cost)` saknar slump. All slump dras när lastbilarna
  skapas (`generateDay`) ur seedade strömmar: `arrivals` och `attributes`.
- **Common random numbers.** Lastbil nr k drar alltid exakt fyra attribut-slumptal. Därför får den samma
  lossningstid, godstyp och transportör oavsett dörrantal, strategi eller ankomstmönster. Det gör jämförelser
  rättvisa och intervallen för deltan smala och ärliga.
- **Resurser:** grindfiler (FIFO), uppställningsplatser (fulla ger overflow, alltså väntan utanför), dörrar (med valfri
  godstypsbehörighet) och öppettider (övertid valbar).
- **Nyckeltal per körning:** medel- och P90-väntan till dörr, max kö, bilar över detention-gräns, detention-kostnad,
  dörr- och grindbeläggning, max uppställning, overflow, tid till tom gård, övertid, lossade före stängning.
- **Monte Carlo:** `runMonteCarlo` returnerar median, P10, P90 och medel per nyckeltal plus alla repetitioner (för
  parvisa deltan och CSV-export).

## UI (`src/app`)

- Motorn och analyserna körs i en **Web Worker** (`sim.worker.ts`), så UI:t fryser inte.
- Detaljvyn visar alltid repetition 0. Därför ger varje reglageändring samma ankomster, och det enda som ändras är
  effekten av ändringen.
- Gårdslayouten (`yardLayout.ts`) delas mellan 2D (SVG) och 3D (Three.js, laddas lat).
- PDF = webbläsarens utskrift av en dold rapportvy (`Report.tsx`, `@media print`). Det kräver inget extra beroende.
- Dela-länk = reglagen kodade i URL-hashen. Ingen data följer med.

## Säkerhet

- **Demobygget** importerar bara `src/app/demo/demo-dataset.json`. Det gör inga nätverksanrop och importerar ingen
  serverkod, vilket kontrolleras statiskt i `test/isolation.test.ts`.
- **API:t** körs antingen som demoserver (`DemoStore`, som inte känner till några tenants) eller som tenantserver
  (`TenantStore`). Behörigheten kontrolleras innan något läses. Okända och obehöriga resurser ger båda 404, så att
  servern inte avslöjar vilka tenants som finns. Id:n valideras mot `^[a-z0-9][a-z0-9_-]{0,63}$`, och
  datasetfilen måste själv deklarera rätt `tenantId`.
- **Nycklar** lagras bara som SHA-256 i miljövariabeln `YT_API_KEYS`. Körloggen (JSONL) innehåller vem, vad, när och
  scenariohash, men aldrig data.
