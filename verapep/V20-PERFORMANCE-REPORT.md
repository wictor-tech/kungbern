# VERAPEP v20 – Prestanda under belastning

Testet körs med `node tests/load/load-test.mjs` (snabb variant: `LOAD_QUICK=1`). Det startar en egen server på en temporär kopia av `data/`, i testläge med `TRUST_PROXY=1`, och rör aldrig produktionen. Mätmiljön är en molnbehållare med en processor, Node 22.22, och server och lastgenerator körs på samma maskin. Siffrorna är därför försiktiga.

## Resultat (v20)

| Scenario | Anrop | Samtidiga | p50 | p95 | Kapacitet | Svar |
| --- | --- | --- | --- | --- | --- | --- |
| Butiksdata `/api/storefront` (76 KB, brotli) | 400 | 40 | 68–150 ms | 180–240 ms* | ~260/s | 200 |
| Produktsida (HTML) | 400 | 40 | 31 ms | 50 ms | ~1 200/s | 200 |
| Ask Vera, 80 olika besökare | 400 | 50 | 107–136 ms | 253–316 ms | ~300/s | 200 |
| Ask Vera, en besökare som spammar | 60 | 10 | 12 ms | 36 ms | – | 30×200, 30×429 (spärr fungerar) |
| Admin översikt (84 produkter) | 100 | 10 | 71 ms | 142 ms | ~130/s | 200 |
| Admin produktlista | 100 | 10 | 32 ms | 64 ms | ~260/s | 200 |
| Admin produktarbetsyta | 100 | 10 | 9 ms | 19 ms | ~1 100/s | 200 |
| Admin dashboard | 50 | 5 | 29 ms | 51 ms | – | 200 |
| Samtidiga inloggningar (samma adress) | 30 | 10 | 51 ms | 310 ms | – | 7×200, 23×429 (spärr fungerar) |
| Dokumentuppladdning 5 MB | 12 | 4 | 140 ms | 169 ms | – | 201 |
| Importförhandsgranskning, 200 rader | 5 | 1 | 8 ms | 11 ms | – | 200 |
| Import, 84 utkast | 1 | 1 | 8 ms | – | – | 201 |
| Produktlista med 84 öppna utkast | 50 | 10 | 48 ms | 93 ms | – | 200 |
| Granskningskö med 84 utkast | 50 | 10 | 4 ms | 5 ms | – | 200 |

\* En enstaka körning gav p95 760 ms. Tre omkörningar gav 180–240 ms, så den bedöms som tillfälligt brus i behållaren.

**Övriga mätningar:**
- **Avbruten uppladdning** (nätverket bryts efter 1 MB): ingen kvarlämnad fil, och servern svarar normalt efteråt.
- **Minne (RSS):** 84 MB vid start och 147 MB efter hela körningen. Ökningen beror på uppladdningsbuffertar. Ingen tillväxt mellan omkörningar tyder på läckor.
- **Databaslåsning:** vid ett externt lås väntar servern nu upp till 5 s. Låser någon längre får användaren 503 "Nothing was saved", och minnet hålls korrekt. Det testas i `v20 A2`.

## Beslut om optimering

Vi optimerade bara där mätningen visade ett faktiskt behov:

- **Översiktens hälsokontroll** (`PRAGMA quick_check` och antal audit-rader) växer med databasen. Arkitekturgranskaren mätte 249 ms med 300 000 audit-rader, och under den tiden väntar alla andra anrop. **Åtgärd:** resultatet återanvänds i 60 s, och manifest och bildrapport läses en gång.
- **Butiksdata och Vera** kostar 3–4 ms processortid per anrop, vilket ger cirka 260–300 anrop/s på en kärna. Det räcker gott för butikens storlek, så de är inte optimerade. Om trafiken växer kan svaret cachas per revision (enkelt och mätbart).
- **Produktsidans omladdningar** minskar belastningen: tidigare laddades varje öppen produktsida om vid varje händelse i butiken. Nu görs högst en hämtning per händelseföljd, och bara när just den produkten ändrats.

## Jämförelse med v19

Det första lasttestet kördes mot v19-koden innan rättelserna. Svarstiderna var i samma storleksordning. Skillnaderna i v20 gäller korrekthet, inte hastighet: transaktioner, lås och felhantering. Inget scenario blev mätbart långsammare.
