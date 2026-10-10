---
name: nytt-klipp
description: Gör nästa LinkedIn-klipp i LUPNUMBER-serien (scen + manus + mp4) när användaren säger "gör nästa klipp om [utmaning]", "nytt klipp om …", "klipp N om …" eller liknande. Använd alltid den här skillen för nya klipp i shorts/.
---

# Nytt klipp i LUPNUMBER-serien

Användaren beskriver en utmaning i en logistiksites vardag (kö vid grinden, fel port, språk, larm …).
Du levererar i ett svep: klipp-JSON, scenvisual, renderad mp4, MANUS.md, SRT och poster. Läs `shorts/README.md` först om den inte redan är i kontext.

## Låst (ändra ALDRIG per klipp)

- `shorts/brand/`: färger, wordmark, typografi, tider, intro, outro, flödesstil, typsnitt.
- Dramaturgi: Intro 2 s → Hook 3 s → Problemet på siten 4,5 s → LUPNUMBER-lösningen 6,5 s → Outro 3,5 s.
- Format 1080×1350, 30 fps. Ren motion graphics: ikoner, former, flöden, text. Inga figurer/personer.

## Steg

1. **Avsnittsnummer och slug.** `node shorts/scripts/new.mjs <slug> "<titel>" --scene <scennamn>` ger nästa lediga nummer, ett JSON-skelett och en scen-stub. Slug: små bokstäver, bindestreck, utan åäö.
2. **Skriv klipp-JSON** i `shorts/clips/NN-slug.json` enligt schemat i README. Röst och regler:
   - Svenska. Du-tilltal till den som driver siten. Korta meningar. Punkt, inte utropstecken.
   - Hook: max 2 rader, max 4 ord per rad, igenkänning för den som stått vid grinden. Underrad valfri, max 5 ord.
   - Problem: rubrik max 2 rader (≈ 28 tecken per rad), 2–3 smärtpunkter à max 4 ord. Konkret (minuter, papper, radio), inte abstrakt.
   - Lösning: rubrik "Med LUPNUMBER …", max ≈ 32 tecken så den ryms på en rad. Exakt 3 steg, verb först ("Boka slot", "Checka in", "Kör in"), underrad max 3 ord. Kicker: 2–4 ord, ett ord markerat med `*…*`.
   - Voiceover i fyra beats, totalt ≤ 45 ord. Samma budskap som rutan, inte ordagrant. Outro-beaten är alltid "Boka en demo på lupnumber.com."
   - Skriv alltid **"vid grinden"**, aldrig "i grinden". Produktnamnet skrivs LUPNUMBER.
   - Påstå bara funktioner som LUPNUMBER har. Osäker: håll steget generellt ("Checka in", "Se yarden") hellre än specifikt.
   - Ikoner väljs ur `shorts/brand/icons.js`. Saknas en passande: lägg till en stroke-ikon (24×24, currentColor) där.
3. **Scenvisual.** Komponera `shorts/scenes/<namn>.js` av primitiverna i `brand/yard.js`: EN komposition ("samma kamera") som är grå och stillastående i problemet och tonar till sky och börjar röra sig i lösningen, styrt av `s.p`, `s.t`, `s.l`, `s.phase`. Återanvänd mönster från befintliga scener (kö vid bom, karta med rutt, kort med tabell, telefon med bubblor, tavla med slottar). Behövs en ny primitiv: lägg den i `yard.js` så nästa scen kan använda den. Ytan är 936×400; håll 20 px marginal, inget får krocka med rubriken ovanför (slutar vid y≈300 i stage) eller chips/flöde nedanför.
4. **Snabbkontroll utan video:** `node shorts/scripts/build.mjs NN-slug --no-video` validerar JSON. Fånga sedan nyckelrutor (t.ex. 7,2 / 9,3 / 11,2 / 14,6 s) via Playwright eller rendera och dra ut frames med ffmpeg + `hstack`. Titta efter: överlapp, text utanför 72 px-marginalen, element som klipps, piller som byter text men inte bredd, saker som "hoppar" vid bytet problem→lösning, ikoner som är för små för mobilskärm.
5. **Rendera:** `npm run klipp -- NN-slug`. Åtgärda varningar (voiceover > 45 ord är ett fel, inte en notis).
6. **Snapshot:** `node shorts/scripts/test.mjs NN-slug --update` för det nya klippet, och `node shorts/scripts/test.mjs` utan flagga för att se att inget gammalt drev om du rört `brand/` eller `yard.js`.
7. **SERIE.md:** `npm run klipp:serie`.
8. **Rapportera** kort: sökväg till mp4, MANUS.md, poster. Skicka mp4:an till användaren om verktyg för det finns. Nämn att voiceover-ljud saknas (`--audio fil.mp3` muxar in det) och om du antagit någon produktfunktion.

## Klart när

- `shorts/out/NN-slug/` innehåller `NN-slug.mp4`, `MANUS.md`, `undertexter.srt`, `poster.jpg`, `preview.html`.
- Bildkontrollen visar inga överlapp eller klippta element, och övergången problem→lösning är kontinuerlig.
- Inget i `shorts/brand/` har ändrats för klippets skull (nya primitiver i `yard.js` och nya ikoner är okej).
