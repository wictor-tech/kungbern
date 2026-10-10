# LUPNUMBER shorts – LinkedIn-klipp som serie

Återanvändbar pipeline för 19,5-sekunders LinkedIn-klipp (1080×1350, 4:5) åt LUP Technologies / LUPNUMBER.
Ett nytt klipp = **en JSON-fil** (text + ikon + voiceover) och, om utmaningen vinner på en illustration, **en scenfil** komponerad av färdiga yard-primitiver.
Allt annat (intro, outro, färger, wordmark, typografi, flödesstil, tider) är låst i mallen.

Serien just nu: se [`SERIE.md`](SERIE.md) (9 klipp, alla manus på ett ställe).

## Stack och varför

| Del | Val | Varför |
| --- | --- | --- |
| Motion | HTML/CSS + frame-styrd JS (`brand/shell.js`) | Samma mall varje gång, texten är data. Inga byggsteg, inga ramverk. |
| Rendering | Headless Chromium via Playwright, en bild per frame | Deterministiskt: `__seek(frame)` ger exakt samma bild varje gång, på vilken maskin som helst. |
| mp4 | FFmpeg (libx264, yuv420p, faststart) | LinkedIn-vänlig H.264. Voiceover-ljud muxas in med `--audio`. |
| Typsnitt | Inter levereras i `brand/fonts/` (OFL) | Klipp 20 ser ut exakt som klipp 1, oavsett vad som finns installerat. |
| Manus/undertexter | Genereras ur samma JSON | On-screen-text, voiceover och SRT kan inte glida isär från videon. |

Remotion (som finns i `src/` för den äldre 30-sekundaren) hade varit det konventionella valet, men det kräver npm-registret och ger inget extra för en låst mall där bara text byts.

## Kom igång

```bash
cd shorts && npm install        # pinnad Playwright 1.56.1 + Chromium (engångs)
cd ..
npm run klipp -- 01-koer-vid-grinden                 # mp4 + manus + srt + poster + preview
npm run klipp -- 01-koer-vid-grinden --no-video      # bara manus + preview.html (sekunder)
npm run klipp -- 01-koer-vid-grinden --captions      # inbrända undertexter → <slug>-undertextad.mp4
npm run klipp -- 01-koer-vid-grinden --audio vo.mp3  # muxa in inläst voiceover
npm run klipp:alla                                   # rendera hela serien
npm run klipp:serie                                  # uppdatera SERIE.md
npm run klipp:test                                   # snapshot-test mot test/snapshots.json
```

FFmpeg måste finnas i PATH. Formatet är låst till 4:5; en 1:1-variant kräver en egen layout och finns inte.

Per klipp hamnar detta i `shorts/out/<slug>/`:

| Fil | Innehåll |
| --- | --- |
| `<slug>.mp4` | Färdigt klipp, 19,5 s, 30 fps |
| `MANUS.md` | On-screen-text per beat + voiceover (helhet och per beat) + checklista |
| `undertexter.srt` | Voiceover som korta cues (max 7 ord), tidsatta mot beatsen |
| `poster.jpg` | Stillbild ur lösningsfasen (omslag/thumbnail) |
| `preview.html` | Öppna direkt i webbläsaren: spela, scrubba, stega frame för frame (mellanslag, ←/→) |

## Struktur

```
shorts/
  brand/
    brand.json     # tagline, CTA, format, tidslinje, maxord, undertextregler   (LÅST)
    brand.css      # färgtokens, wordmark, kort, chips, flöde, CTA, @font-face  (LÅST)
    shell.js       # mallen: intro → hook → problem → lösning → outro            (LÅST)
    engine.js      # easing, färgblandning, wordmark-uppbyggnad
    icons.js       # ikonbibliotek (stroke-ikoner, refereras med namn)
    yard.js        # yard-primitiver: väg, bom, lastbil, karta, portar, telefon, bubblor, piller …
    captions.js    # cue-delning för SRT och inbrända undertexter (Node + webbläsare)
    fonts/         # Inter 500/600/700/800 (OFL)
  scenes/          # en fil per scenvisual, komponerad av yard-primitiver
  clips/           # en JSON per klipp
  scripts/
    build.mjs      # bundla + manus + srt + rendera mp4
    new.mjs        # scaffolda nytt klipp (nästa avsnittsnummer)
    test.mjs       # snapshot-test av nyckelrutor
    overview.mjs   # SERIE.md
    lib.mjs        # delad logik
  test/snapshots.json
  out/             # renderat (per klipp)
```

## Dramaturgi och tider (låsta i `brand.json`)

| Tid | Beat | Innehåll |
| --- | --- | --- |
| 0–2 s | Intro | Wordmark byggs upp bokstav för bokstav, accentlinje, tagline. Krymper sedan upp i badgen uppe till vänster. Identisk varje gång. |
| 2–5 s | Hook | Stor ikon + 1–2 rader punchig text + underrad. Syns från sekund 2,3. |
| 5–9,5 s | Problemet på siten | Rubrik + hero-visual (grå, stillastående) + max 3 smärtpunkts-chips |
| 9,5–16 s | LUPNUMBER-lösningen | Samma hero tonar till sky och börjar rulla + flöde med 3 numrerade steg + slutkläm |
| 16–19,5 s | Outro | Wordmark + tagline + CTA-pill + URL. Identisk varje gång. |

Faserna överlappar 0,2 s så att nästa beat tonar in innan den förra är borta.

## Klipp-JSON (allt du byter per klipp)

```jsonc
{
  "slug": "02-vem-ar-pa-siten",
  "episode": 2,                       // visas som "KLIPP 02" i badgen
  "title": "Vem är på siten just nu?",
  "scene": "yard-overblick",          // namn på scenes/<scene>.js, eller null för standardlayout
  "icon": "eye",                      // hook-ikon, namn ur brand/icons.js
  "hook":     { "text": "Vem är på siten\njust nu?", "sub": "Ingen vet säkert." },
  "problem":  { "title": "Radio. Rundor.\nGissningar.", "pains": ["Max 3 korta smärtpunkter", "…", "…"] },
  "solution": { "title": "Med LUPNUMBER ser du allt.",
                "steps": [ { "icon": "phone", "label": "Checka in", "sub": "Vid grinden" },
                           { "icon": "map",   "label": "Se yarden",  "sub": "I realtid" },
                           { "icon": "check", "label": "Checka ut",  "sub": "Vid utfart" } ],
                "kicker": "Full *koll.*" },  // *ord* blir accentfärgat
  "voiceover": { "hook": "…", "problem": "…", "solution": "…", "outro": "Boka en demo på lupnumber.com." }
}
```

Regler som `build.mjs` kontrollerar: exakt 3 steg, max 3 smärtpunkter, voiceover i fyra beats, skriv **"vid grinden"** (aldrig "i grinden"), scenfilen måste finnas. Voiceover över 45 ord ger varning i terminalen och i manuset. Rubriker ska rymmas på två rader (≈ 28 tecken per rad).

## Scenvisual: samma kamera, grått → sky

En scen är **en** komposition som visas under både problem och lösning. Den registrerar sig så här:

```js
LUP.scenes['min-scen'] = {
  mount(root, clip, brand) {
    const Y = LUP.yard, U = LUP.util;
    const svg = Y.svg(root);                 // 936×400 px
    Y.road(svg, { y: 300 });
    const gate = Y.gate(svg, { x: 640, y: 176 });
    const truck = Y.truck(svg, { x: 100, y: 237 });
    return (s) => {                          // körs varje frame
      // s.t = sek sedan problemfasen började, s.l = sek in i aktuell fas,
      // s.phase = 'problem' | 'solution', s.p = 0..1 (toning problem→lösning), s.P/s.S = fasernas längd
      gate.tone(s.p).open(s.p);
      truck.tone(s.p).set({ x: 100 + Math.max(0, s.l - 1) * 200 * (s.phase === 'solution') });
    };
  },
};
```

Primitiverna i `brand/yard.js` returnerar `Item` med `.set({x, y, scale, rotate, opacity, color})`, `.tone(p)` (muted→accent), `.pop(t, start)`, `.fadeIn(t, start)`.
Finns: `road`, `truck`, `truckTop`, `gate`, `clock`, `icon`, `pill` (`.text`, `.icon`, `.swap(p, a, b)`, `.toneStyle(p)`), `bubble`, `card`, `label`, `qmark`, `check`, `dock`, `grid`, `path` (`.draw`, `.at`, `.angleAt`), `pin`, `phone` (`.screen`), `sheet`, `dot` (`.pulse`), `row`.
Problem-läget håller sig till `--muted`/`--border`, lösningen till `--accent`/`--tint-1`. Allt styrs av `s` – inga CSS-animationer, inga klockberoenden. Se `scenes/grind-ko.js` (kö vid bommen) och `scenes/hitta-ratt.js` (rutt på karta) som mönster.

Utan scen (`"scene": null`) centreras chips respektive flöde automatiskt.

## Säg bara: "gör nästa klipp om [utmaning]"

Repo-skillen i `.claude/skills/nytt-klipp/SKILL.md` beskriver hela proceduren för Claude Code: välja nästa avsnittsnummer,
skriva klipp-JSON i rätt röst, komponera scenvisual av primitiverna, rendera, kontrollera bildrutor, köra snapshot-testet och rapportera.
Exempel:

- "gör nästa klipp om besökare och entreprenörer som dyker upp oanmälda"
- "gör nästa klipp om farligt gods, utan egen scen"
- "gör klipp 12 om nattleveranser, hook: 'Klockan tre. Vem öppnar?'"

## Svagaste delen

Ljudet. Pipelinen levererar bild, manus och SRT men ingen inspelad röst eller musik. Voiceovern måste läsas in (eller TTS:as)
och muxas in med `--audio`. Timingen i manuset bygger på ~2,3 ord/sekund; läser du långsammare kan solution-beaten bli trång.
