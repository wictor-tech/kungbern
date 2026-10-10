---
name: nytt-klipp
description: Gör nästa LinkedIn-klipp i LUPNUMBER-serien (scen + manus + mp4) när användaren säger "gör nästa klipp om [utmaning]", "nytt klipp om …", "klipp N om …" eller liknande. Använd alltid den här skillen för nya klipp i shorts/.
---

# Nytt klipp i LUPNUMBER-serien

Användaren beskriver en utmaning i en logistiksites vardag (kö vid grinden, fel port, språk, larm …).
Du levererar i ett svep: klipp-JSON, scenvisual, renderad mp4, MANUS.md, SRT och poster. Läs `shorts/README.md` först om den inte redan är i kontext.

## Låst (ändra ALDRIG per klipp)

- `shorts/brand/`: färger, wordmark, typografi, tider, badge, outro, flödesstil, typsnitt.
- Dramaturgi: Hook 2,5 s (synlig i första bildrutan) → Problemet på siten 4,5 s → LUPNUMBER-lösningen 6,5 s → Outro 4 s (wordmark byggs upp, CTA-fråga).
- Format 1080×1350, 30 fps, undertexter inbrända som standard. Ren motion graphics: ikoner, former, flöden, text. Inga figurer/personer.
- Klippen numreras inte i bild. Badgen visar serienamnet ur `brand.json`.

## Steg

1. **Ordningsnummer och slug.** `node shorts/scripts/new.mjs <slug> "<titel>" --scene <scennamn>` ger nästa lediga nummer (bara för filordning), ett JSON-skelett och en scen-stub. Slug: små bokstäver, bindestreck, utan åäö.
2. **Skriv klipp-JSON** i `shorts/clips/NN-slug.json` enligt schemat i README. Röst och regler:
   - Svenska. Du-tilltal till den som driver siten. Korta meningar. Punkt, inte utropstecken.
   - Hook A: max 2 rader, max 4 ord per rad, igenkänning för den som stått vid grinden. Underrad valfri, max 5 ord. Den syns i första bildrutan, så den måste bära sig själv utan animation.
   - Hook B (`variants.b`): en annan vinkel på samma utmaning, gärna tidsstämplad mikroberättelse ("08:42. Fjärde bilen i kö."). Egen voiceover-rad för hooken.
   - CTA (`cta.question`): en fråga som får en sitechef att svara i kommentarerna, max 2 rader. `cta.label` är "Svara i kommentarerna". Outro-voiceovern upprepar frågan kort och slutar "Skriv i kommentarerna."

   - Problem: rubrik max 2 rader (≈ 28 tecken per rad), 2–3 smärtpunkter à max 4 ord. Konkret (minuter, papper, radio), inte abstrakt.
   - Lösning: rubrik "Med LUPNUMBER …", max ≈ 32 tecken så den ryms på en rad. Exakt 3 steg, verb först ("Boka slot", "Checka in", "Kör in"), underrad max 3 ord. Kicker: 2–4 ord, ett ord markerat med `*…*`.
   - Voiceover i fyra beats, totalt ≤ 45 ord inklusive outro-frågan. Samma budskap som rutan, inte ordagrant.
   - Skriv alltid **"vid grinden"**, aldrig "i grinden". Produktnamnet skrivs LUPNUMBER.
   - Påstå bara funktioner som LUPNUMBER har. Osäker: håll steget generellt ("Checka in", "Se yarden") hellre än specifikt.
   - Ikoner väljs ur `shorts/brand/icons.js`. Saknas en passande: lägg till en stroke-ikon (24×24, currentColor) där.
3. **Scenvisual.** Komponera `shorts/scenes/<namn>.js` av primitiverna i `brand/yard.js`: EN komposition ("samma kamera") som är grå och stillastående i problemet och tonar till sky och börjar röra sig i lösningen, styrt av `s.p`, `s.t`, `s.l`, `s.phase`. Återanvänd mönster från befintliga scener (kö vid bom, karta med rutt, kort med tabell, telefon med bubblor, tavla med slottar). Behövs en ny primitiv: lägg den i `yard.js` så nästa scen kan använda den. Ytan är 936×400; håll 20 px marginal, inget får krocka med rubriken ovanför (slutar vid y≈300 i stage) eller chips/flöde nedanför.
4. **Snabbkontroll utan video:** `node shorts/scripts/build.mjs NN-slug --no-video` validerar JSON. Fånga sedan nyckelrutor (t.ex. 7,2 / 9,3 / 11,2 / 14,6 s) via Playwright eller rendera och dra ut frames med ffmpeg + `hstack`. Titta efter: överlapp, text utanför 72 px-marginalen, element som klipps, piller som byter text men inte bredd, saker som "hoppar" vid bytet problem→lösning, ikoner som är för små för mobilskärm.
5. **Rendera:** `npm run klipp -- NN-slug --all-variants` (ger A, B och karusellen). Åtgärda varningar (voiceover > 45 ord är ett fel, inte en notis). Kontrollera att första bildrutan (t = 0) visar hooken komplett.
6. **Snapshot:** `node shorts/scripts/test.mjs NN-slug --update` för det nya klippet, och `node shorts/scripts/test.mjs` utan flagga för att se att inget gammalt drev om du rört `brand/` eller `yard.js`.
7. **Flödesfilmen:** hör utmaningen hemma i sitens dagsflöde, lägg till ett steg i `shorts/films/en-dag-pa-siten.json` (clip, label, today, lup, voiceover) och rendera om med `npm run film -- en-dag-pa-siten`. Scenen måste fungera i båda lägena samtidigt: problemläget får inte "lösa sig" när tiden går (styr lösningsbeteenden på `s.phase`/`s.p`, inte på `s.t` ensamt).
8. **SERIE.md:** `npm run klipp:serie`.
9. **Rapportera** kort: sökväg till mp4 (A och B), karusell, MANUS.md. Skicka filerna till användaren om verktyg för det finns. Nämn att voiceover-ljud saknas (`--audio fil.mp3` muxar in det) och om du antagit någon produktfunktion.

## Klart när

- `shorts/out/NN-slug/` innehåller `NN-slug.mp4`, `NN-slug-hook-b.mp4`, `carousel.pdf`, `MANUS.md`, `undertexter.srt`, `poster.jpg`, `preview.html`.
- Bildkontrollen visar inga överlapp eller klippta element, första bildrutan är hooken, och övergången problem→lösning är kontinuerlig.
- Inget i `shorts/brand/` har ändrats för klippets skull (nya primitiver i `yard.js` och nya ikoner är okej).
