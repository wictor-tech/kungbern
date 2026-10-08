# Scenarier

Ett scenario är en versionerad JSON-fil (`schemaVersion: 1`) som innehåller allt som behövs för att återskapa
en körning exakt, inklusive Monte Carlo-seed. Hashen (`scenarioHash`) fungerar som versions-id i körloggen.

Kör ett scenario från kommandoraden (mot demosajten):

```bash
npm run scenario -- scenarios/demo-baseline.json
npm run scenario -- scenarios/demo-slot-booking.json --compare scenarios/demo-baseline.json
```

Alla kostnader har ett obligatoriskt fält `costs.source`. I demoscenarierna är kostnaderna märkta som antaganden.
