# LUPNUMBER shorts – LinkedIn-klipp som serie

Återanvändbar pipeline för 20-sekunders LinkedIn-klipp (1080×1350, 4:5) åt LUP Technologies / LUPNUMBER.
Ett nytt klipp = **en JSON-fil** (text + ikon + voiceover) och, om utmaningen behöver en egen illustration, **en scenfil**.
Allt annat (intro, outro, färger, wordmark, typografi, flödesstil, tider) är låst i mallen.

## Stack och varför

| Del | Val | Varför |
| --- | --- | --- |
| Motion | HTML/CSS + frame-styrd JS (`brand/shell.js`) | Samma mall varje gång, texten är data. Ingen build-kedja, inga npm-beroenden i projektet. |
| Rendering | Headless Chromium via Playwright, en screenshot per frame | Deterministiskt: `__seek(frame)` ger exakt samma bild varje gång, oavsett maskin. |
| mp4 | FFmpeg (libx264, yuv420p, faststart) | LinkedIn-vänlig H.264. Voiceover-ljud kan muxas in med `--audio`. |
| Manus | Genereras ur samma JSON | On-screen-text, voiceover och SRT kan inte glida isär från videon. |

Remotion (som finns i `src/` för den äldre 30-sekundaren) hade varit det konventionella valet, men det kräver npm-registret vid installation och ger inget extra för en låst mall där bara text byts. Den här stacken behöver bara Chromium + FFmpeg.

## Kom igång

```bash
# Förutsättningar: Node ≥ 20, ffmpeg i PATH, Playwright med Chromium
npm i -g playwright && npx playwright install chromium   # eller: npm i -D playwright

npm run klipp -- 01-koer-vid-grinden          # renderar shorts/out/01-koer-vid-grinden/
npm run klipp -- 01-koer-vid-grinden --no-video   # bara manus + preview.html (snabbt)
npm run klipp -- 01-koer-vid-grinden --audio vo.mp3  # muxa in inläst voiceover
npm run klipp -- 01-koer-vid-grinden --square  # 1080×1080-variant
npm run klipp:alla                             # rendera hela serien
```

Per klipp hamnar detta i `shorts/out/<slug>/`:

| Fil | Innehåll |
| --- | --- |
| `<slug>.mp4` | Färdigt klipp, 20 s, 30 fps |
| `MANUS.md` | On-screen-text per beat + voiceover (helhet och per beat) + checklista |
| `undertexter.srt` | Voiceover som undertexter, tidsatta mot beatsen |
| `poster.jpg` | Stillbild ur lösningsfasen (omslag/thumbnail) |
| `preview.html` | Öppna direkt i webbläsaren: spela, scrubba, stega frame för frame (mellanslag, ←/→) |

Typsnitt: mallen använder **Inter**. Finns det inte på maskinen faller den tillbaka på system-sans, så installera Inter för identisk rendering.

## Struktur

```
shorts/
  brand/
    brand.json     # tagline, CTA, format, tidslinje, max antal voiceover-ord  (LÅST)
    brand.css      # färgtokens, wordmark, kort, chips, flöde, CTA            (LÅST)
    engine.js      # easing/hjälpfunktioner, wordmark-uppbyggnad
    icons.js       # ikonbibliotek (stroke-ikoner, refereras med namn)
    shell.js       # mallen: intro → hook → problem → lösning → outro          (LÅST)
  scenes/
    grind-ko.js    # scenvisual för "köer vid grinden" (problem + lösning)
  clips/
    01-koer-vid-grinden.json
  scripts/
    build.mjs      # bundla + manus + srt + rendera mp4
    new.mjs        # scaffolda nytt klipp-JSON (nästa avsnittsnummer)
    lib.mjs        # delad logik
  out/             # renderat (per klipp)
```

## Dramaturgi och tider (låsta i `brand.json`)

| Tid | Beat | Innehåll |
| --- | --- | --- |
| 0–3 s | Intro | Wordmark byggs upp bokstav för bokstav, accentlinje, tagline. Identisk varje gång. |
| 3–5,5 s | Hook | Stor ikon + 1–2 rader punchig text + underrad |
| 5,5–10,5 s | Problemet på siten | Rubrik + scenvisual (valfri) + max 3 smärtpunkts-chips |
| 10,5–16,5 s | LUPNUMBER-lösningen | Rubrik + scenvisual (valfri) + flöde med 3 numrerade steg + slutkläm |
| 16,5–20 s | Outro | Wordmark + tagline + CTA-pill + URL. Identisk varje gång. |

## Klipp-JSON (allt du byter per klipp)

```jsonc
{
  "slug": "02-vem-ar-pa-siten",
  "episode": 2,                       // visas som "KLIPP 02" i badgen
  "title": "Vem är på siten just nu?",
  "scene": "yard-overblick",          // namn på scenes/<scene>.js, eller null för standardlayout
  "icon": "eye",                      // hook-ikon, namn ur brand/icons.js
  "hook":     { "text": "Vem är på siten\njust nu?", "sub": "Ingen vet säkert." },
  "problem":  { "title": "Gissningar.\nRadio. Rundor.", "pains": ["Max 3 korta smärtpunkter", "…", "…"] },
  "solution": { "title": "Med LUPNUMBER ser du allt.",
                "steps": [ { "icon": "phone", "label": "Checka in", "sub": "Vid grinden" },
                           { "icon": "map",   "label": "Se yarden",  "sub": "I realtid" },
                           { "icon": "bell",  "label": "Agera",      "sub": "Direkt" } ],
                "kicker": "Full *koll.*" },  // *ord* blir accentfärgat
  "voiceover": { "hook": "…", "problem": "…", "solution": "…", "outro": "Boka en demo på lupnumber.com." }
}
```

Regler som `build.mjs` kontrollerar: exakt 3 steg, max 3 smärtpunkter, voiceover i fyra beats, skriv **"vid grinden"** (aldrig "i grinden"), scenfilen måste finnas. Voiceover över 45 ord ger varning i terminalen och i manuset.

## Egen scenvisual (valfritt)

En scenfil registrerar `LUP.scenes['<namn>']` med `problem.mount(root, clip, brand)` och `solution.mount(...)`.
`mount` bygger sin SVG/DOM i `root` en gång och returnerar en funktion `(l, t) => {}` som sätts per frame,
där `l` är sekunder in i fasen och `t` global tid. Använd `LUP.util` (`prog`, `easeOut`, `back`, `lerp` …) och `LUP.icon(namn)`.
Problem-visualer håller sig till `--muted`/`--border`, lösnings-visualer till `--accent`/`--tint-1`. Se `scenes/grind-ko.js`.

Hero-ytan är 936 px bred: problem 460 px hög (under rubriken, över chipsen), lösning 400 px hög (över flödet).
Utan scen centreras chips respektive flöde automatiskt.

## Säg bara: "gör nästa klipp om [utmaning]"

Repo-skillen i `.claude/skills/nytt-klipp/SKILL.md` beskriver hela proceduren för Claude Code: välja nästa avsnittsnummer,
skriva klipp-JSON i rätt röst, bygga scenvisual vid behov, rendera, kontrollera bildrutor och rapportera med mp4 + manus.
Exempel:

- "gör nästa klipp om vem som är på siten just nu"
- "gör nästa klipp om språkförbistring med chaufförer, utan egen scen"
- "gör klipp 4 om säkerhetsgenomgång vid grinden, hook: 'Pappret i handskfacket.'"

## Svagaste delen

Ljudet. Pipelinen levererar bild, manus och SRT men ingen inspelad röst eller musik. Voiceovern måste läsas in (eller TTS:as)
och muxas in med `--audio`. Timingen i manuset bygger på ~2,3 ord/sekund; läser du långsammare kan solution-beaten bli trång.
