# LUPNUMBER Yard Twin

En digital tvilling av kundens gård och dockar, byggd på LUPNUMBER:s egen data (LPR, incheckning, slottbokning,
grindhändelser, lossningstider). Simuleringen är **kalibrerad och backtestad mot kundens verkliga dagar**, och felet visas öppet.

> **Status:** v0.1. Allt körs i dag mot en **syntetisk demosajt** ("Demo DC Nord"). Den riktiga källdatan är inte kopplad
> ännu (se `docs/fas0-kartlaggning` i repots `docs/yard-twin/`). Repot är publikt, så det får aldrig innehålla kunddata.

## Kom igång

```bash
npm install
npm run dev            # UI på http://localhost:5173
npm test               # alla enhets- och integrationstester (vitest)
npm run test:e2e       # UI-tester i Chromium + skärmbilder i test-results/screens
npm run ci             # typkontroll + tester + bygge
npm run scenario -- scenarios/demo-slot-booking.json --compare scenarios/demo-baseline.json
npm run demo-data      # bygg om det syntetiska demodatasetet (deterministiskt)
npm run server         # API (demoläge) på http://localhost:8787
```

## Vad finns

| Del | Var | Vad |
| --- | --- | --- |
| Motor | `src/engine/` | Diskret händelsesimulering (grind → uppställning → dörr → lossning → pappersarbete → avgång), 4 tilldelningsstrategier, 4 ankomstmönster, Monte Carlo med fast seed, scenario-JSON med schema och hash. Inga beroenden; körs i webbläsare och Node. |
| Datalager | `src/data/` | Datakontraktet `visits`, härledning, datakvalitetsrapport, kalibrering (`site_profile`), inspelade dagar, syntetisk demosajt, anonymisering (k-anonymitet, PII-kontroll), CSV-adapter. Idempotent. |
| Validering | `src/analysis/backtest.ts`, `grade.ts`, `calibrationSummary.ts` | Hold-out-backtest (kronologisk 70/30), MAE/MAPE/wMAPE/bias/täckning, kalibreringsbetyg. |
| Analys | `src/analysis/` | Dörrbehov, slotbehov, flaskhals med kaskad, kapacitetsgräns, slotdesign, ROI med intervall, tornado, insikter i klartext, begränsningar. |
| UI | `src/app/` | React + Vite. Gårdsvy 2D (SVG) och 3D (Three.js), uppspelning, KPI:er, Gantt, lastbilslista, jämförelse, analys, PDF/CSV, sv/en, ljust/mörkt tema, presentationsläge. |
| API | `src/server/` | `node:http` utan ramverk. Roller, tenant-isolering, körlogg. |
| Drift | `src/monitoring/`, `scripts/recalibrate.ts` | Schemalagd omkalibrering med cache och driftlarm. |

## Prestanda (uppmätt)

200 lastbilar × 300 repetitioner: **≈ 150–300 ms** i Node, se `test/perf.test.ts`. Kravet är "några sekunder".
Analyserna med standardinställningar tar 40–400 ms vardera.

## Dokumentation

- [Arkitektur](docs/arkitektur.md)
- [Datakontrakt](docs/datakontrakt.md)
- [Lägga till en ny sajt](docs/ny-sajt.md)
- [Tolka kalibreringsbetyget](docs/kalibreringsbetyg.md)
- [Säljguide: så använder du demon i ett möte](docs/saljguide.md)
- [Beslutslogg](docs/beslut.md)
