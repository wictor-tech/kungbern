# Skärmbilder och knappnamn från app.lupnumber.com

Guiderna visar aktuella **svenska** skärmbilder från appen, med appens egna knappnamn och exakta markeringar.
Allt det här tas fram automatiskt, så att det går att göra om när appen ändras.

## Så körs det

```bash
cd help
export LUP_DEMO_USER=…  LUP_DEMO_PASSWORD=…        # demokontot – lägg aldrig in i koden
mkdir -p /tmp/cap
node scripts/capture/login.mjs /tmp/cap/state.json   # loggar in
node scripts/capture/capture.mjs /tmp/cap /tmp/cap/state.json scripts/capture/recipes.json
python3 scripts/capture/transform.py /tmp/cap content/guides.sv.json content public/screens/app
python3 scripts/capture/localize.py /tmp/cap content
npm test && npm run eval:search                       # kontrollera att inget gick sönder
```

Kräver nätverksåtkomst till `app.lupnumber.com` och Python med Pillow.
Tavlan, Lista, Matris och Vecka blir bäst om det finns minst ett fordon i kön på demoplatsen.

## Vad stegen gör

| Steg | Resultat |
|---|---|
| `capture.mjs` | Navigerar till varje guides vy (`recipes.json`) på engelska och svenska. Sparar skärmbild + alla synliga texter med position. |
| `transform.py` | Parar ihop engelska och svenska element. Skriver svenska skärmbilder (`public/screens/app/`), ordlistan `content/ui-terms.json` och markeringarnas positioner `content/app-capture.sv.json`. |
| `localize.py` | Byter engelska knappnamn i guidetexterna mot appens svenska (per vy). Skriver `content/localized.sv.json`. |

Hjälpfiler som skrivs för hand:

- `content/ui-nav.json`: menyernas namn (går före dialogrubriker i "Öppna …").
- `content/ui-terms-fixes.json`: rättelser där den automatiska parningen blev fel.
- `content/hotspot-anchors.json`: vilket element en markering pekar på när namnet inte står i appen, eller en fast ruta.
- `content/localized-overrides.json`: enstaka steg som skrivits om för hand.

`src/lib/seed.ts` (`applyAppCapture`) lägger ihop allt när databasen fylls första gången.
Engelska knappnamn sparas som dolda sökord, så att användare med engelsk app också hittar rätt.
