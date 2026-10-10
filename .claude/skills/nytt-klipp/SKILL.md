---
name: nytt-klipp
description: Gör nästa LinkedIn-klipp i LUPNUMBER-serien (scen + manus + mp4) när användaren säger "gör nästa klipp om [utmaning]", "nytt klipp om …", "klipp N om …" eller liknande. Använd alltid den här skillen för nya klipp i shorts/.
---

# Nytt klipp i LUPNUMBER-serien

Användaren beskriver en utmaning på en logistiksite (t.ex. "köer vid grinden", "vem är på siten", "språkförbistring").
Du levererar i ett svep: klipp-JSON, eventuell scenvisual, renderad mp4, MANUS.md, SRT och poster. Läs `shorts/README.md` först om du inte redan har den i kontext.

## Låst (ändra ALDRIG per klipp)

- `shorts/brand/brand.css`, `brand.json`, `shell.js`: färger, wordmark, typografi, tider, intro, outro, flödesstil.
- Dramaturgi: Hook (2,5 s) → Problemet på siten (5 s) → LUPNUMBER-lösningen (6 s) → CTA/outro. Intro 3 s före.
- Format 1080×1350, 20 s, 30 fps. Ren motion graphics: ikoner, former, flöden, text. Inga figurer/personer.

## Steg

1. **Avsnittsnummer och slug.** Nästa lediga nummer i `shorts/clips/` (`node shorts/scripts/new.mjs <slug> "<titel>" [--scene namn]` scaffoldar). Slug: `NN-kort-beskrivning` med små bokstäver och bindestreck, utan åäö.
2. **Skriv klipp-JSON** i `shorts/clips/NN-slug.json` enligt schemat i README. Röst och regler:
   - Svenska. Du-tilltal till den som driver siten. Korta meningar. Punkt, inte utropstecken.
   - Hook: max 2 rader, max 4 ord per rad, ska kännas igen av någon som stått vid grinden. Underrad valfri, max 5 ord.
   - Problem: rubrik max 2 rader, 2–3 smärtpunkter à max 4 ord. Konkret (minuter, papper, radio), inte abstrakt.
   - Lösning: rubrik börjar gärna med "Med LUPNUMBER …". Exakt 3 steg, verb först ("Boka slot", "Checka in", "Kör in"), underrad max 3 ord. Kicker: 2–3 ord, ett ord markerat med `*…*`.
   - Voiceover i fyra beats, totalt ≤ 45 ord. Samma budskap som rutan, inte en upprepning ord för ord. Outro-beaten är alltid "Boka en demo på lupnumber.com."
   - Skriv alltid **"vid grinden"**, aldrig "i grinden". Produktnamnet skrivs LUPNUMBER.
   - Ikoner väljs ur `shorts/brand/icons.js`. Saknas en passande ikon: lägg till en stroke-ikon (24×24, currentColor) där.
3. **Scenvisual?** Bygg en egen scen i `shorts/scenes/<namn>.js` när utmaningen vinner på en illustration av siten (kö, yard-karta, chattbubblor). Följ mönstret i `grind-ko.js`: problem i `--muted`, lösning i `--accent`, allt styrt av `l` (sekunder in i fasen), inga CSS-animationer eller klockberoenden. Sätt annars `"scene": null`, då används standardlayouten.
4. **Rendera:** `npm run klipp -- NN-slug`. Åtgärda valideringsfel. Varning om voiceover > 45 ord ska åtgärdas, inte ignoreras.
5. **Kontrollera bildrutorna.** Dra ut 5–6 frames med ffmpeg (t.ex. 1, 4.5, 8.5, 13, 16, 19 s), sätt ihop en remsa med `hstack` och titta: överlapp, text utanför marginal (72 px), element som klipps, chips/steg som inte hinner in i sin fas. Justera scenen, inte mallen.
6. **Rapportera** kort: sökväg till mp4, MANUS.md, poster. Skicka mp4:an till användaren om verktyg för det finns. Nämn om voiceover-ljud saknas (`--audio fil.mp3` muxar in det).

## Klart när

- `shorts/out/NN-slug/` innehåller `NN-slug.mp4`, `MANUS.md`, `undertexter.srt`, `poster.jpg`, `preview.html`.
- Bildkontrollen visar inga överlapp eller klippta element.
- Inget i `shorts/brand/` har ändrats (om användaren inte uttryckligen bett om en varumärkesändring för hela serien).
