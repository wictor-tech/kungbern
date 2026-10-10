# LUPNUMBER shorts – LinkedIn-serien "Vardag på siten"

Återanvändbar pipeline för 17,5-sekunders LinkedIn-klipp (1080×1350, 4:5) och längre flödesfilmer åt LUP Technologies / LUPNUMBER.
Ett nytt klipp = **en JSON-fil** (text + ikon + voiceover + CTA + hook-variant) och **en scenfil** komponerad av färdiga yard-primitiver.
Allt annat (badge, outro, färger, wordmark, typografi, flödesstil, tider) är låst i mallen.

Serien just nu: se [`SERIE.md`](SERIE.md) (10 klipp + flödesfilmen, alla manus på ett ställe). Klippen numreras inte i bild, badgen visar bara serienamnet.

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
npm run klipp -- 01-koer-vid-grinden                  # mp4 (undertexter inbrända) + manus + srt + poster + karusell + preview
npm run klipp -- 01-koer-vid-grinden --all-variants   # även hook B → <slug>-hook-b.mp4
npm run klipp -- 01-koer-vid-grinden --overlay        # hook-lagret med alfakanal (WebM + ProRes 4444 + PNG), mörk och ljus variant
npm run klipp -- 01-koer-vid-grinden --only-overlay   # bara overlayen
npm run klipp -- 01-koer-vid-grinden --workers 4      # fler parallella arbetare (standard: hälften av kärnorna, max 4)
npm run klipp -- 01-koer-vid-grinden --no-captions    # utan inbrända undertexter → <slug>-utan-undertexter.mp4
npm run klipp -- 01-koer-vid-grinden --no-video       # bara manus + preview.html (sekunder)
npm run klipp -- 01-koer-vid-grinden --audio vo.mp3   # muxa in inläst voiceover
npm run klipp:alla -- --all-variants                  # rendera hela serien
npm run film -- en-dag-pa-siten                       # flödesfilmen (idag överst, med LUPNUMBER nederst)
npm run klipp:serie                                   # uppdatera SERIE.md
npm run klipp:test                                    # snapshot-test mot test/snapshots.json
```

FFmpeg måste finnas i PATH. Formatet är låst till 4:5.

Per klipp hamnar detta i `shorts/out/<slug>/`:

| Fil | Innehåll |
| --- | --- |
| `<slug>.mp4` | Färdigt klipp, 17,5 s, 30 fps, undertexter inbrända, hook i första bildrutan |
| `<slug>-hook-b.mp4` | Samma klipp med alternativ hook (A/B-test), med `--all-variants` |
| `carousel.pdf` + `carousel-1..4.png` | Fyra sidor (hook, problem, lösning, CTA) att posta som dokumentinlägg |
| `hook-overlay.webm/.mov/.png`, `hook-overlay-ljus.*` | Badge + hook på transparent bakgrund (3 s), att lägga ovanpå egen film av er grind i CapCut, Premiere eller DaVinci. Mörk text för ljus film, vit text för mörk film. Med `--overlay`. |
| `MANUS.md` | On-screen-text per beat, voiceover, hook-varianter, förslag på inläggstext, checklista |
| `undertexter.srt` | Voiceover som korta cues (max 7 ord), för uppladdning om du använder `--no-captions` |
| `poster.jpg` | Stillbild ur lösningsfasen (översiktsark) |
| `preview.html` | Öppna direkt i webbläsaren: spela, scrubba, stega frame för frame (mellanslag, ←/→) |

Flödesfilmen hamnar i `shorts/out/film-<slug>/` med mp4, `MANUS.md`, `undertexter.srt`, `poster.jpg` och `preview.html`.

## Struktur

```
shorts/
  brand/
    brand.json     # tagline, CTA, format, tidslinje, maxord, undertextregler   (LÅST)
    brand.css      # färgtokens, wordmark, kort, chips, flöde, CTA, @font-face  (LÅST)
    shell.js       # klippmallen: hook (frame 0) → problem → lösning → outro       (LÅST)
    film.js        # flödesfilmen: hook → N steg (idag överst / LUPNUMBER nederst) → outro (LÅST)
    engine.js      # easing, färgblandning, wordmark-uppbyggnad
    icons.js       # ikonbibliotek (stroke-ikoner, refereras med namn)
    yard.js        # yard-primitiver: väg, bom, lastbil, karta, portar, telefon, bubblor, piller …
    captions.js    # cue-delning för SRT och inbrända undertexter (Node + webbläsare)
    fonts/         # Inter 500/600/700/800 (OFL)
  scenes/          # en fil per scenvisual, komponerad av yard-primitiver
  clips/           # en JSON per klipp
  films/           # en JSON per flödesfilm (steg som pekar på klippens scener)
  scripts/
    build.mjs      # klipp: bundla + manus + srt + karusell + rendera mp4 (A/B-varianter)
    film.mjs       # flödesfilm: bundla + manus + srt + rendera mp4
    render.mjs     # delad renderare (Playwright + FFmpeg)
    new.mjs        # scaffolda nytt klipp (nästa ordningsnummer)
    test.mjs       # snapshot-test av nyckelrutor
    overview.mjs   # SERIE.md
    lib.mjs        # delad logik
  test/snapshots.json
  out/             # renderat (per klipp)
```

## Dramaturgi och tider (låsta i `brand.json`)

| Tid | Beat | Innehåll |
| --- | --- | --- |
| 0–2,5 s | Hook | Första bildrutan: badge (wordmark + "Vardag på siten"), ikon och hooktexten. Ingen logga-först. |
| 2,5–7 s | Problemet på siten | Rubrik + hero-visual (grå, stillastående) + max 3 smärtpunkts-chips |
| 7–13,5 s | LUPNUMBER-lösningen | Samma hero tonar till sky och börjar rulla + flöde med 3 numrerade steg + slutkläm |
| 13,5–17,5 s | Outro | Wordmark byggs upp, tagline, CTA-fråga, handling, URL. Layouten identisk varje gång, frågan per klipp. |

Faserna överlappar 0,2 s så att nästa beat tonar in innan den förra är borta. Undertexter bränns in som standard (flödet spelar utan ljud).

## Klipp-JSON (allt du byter per klipp)

```jsonc
{
  "slug": "02-vem-ar-pa-siten",
  "episode": 2,                       // visas som "KLIPP 02" i badgen
  "title": "Vem är på siten just nu?",
  "scene": "yard-overblick",          // namn på scenes/<scene>.js, eller null för standardlayout
  "icon": "eye",                      // hook-ikon, namn ur brand/icons.js
  "hook":     { "text": "Vem är på siten\njust nu?", "sub": "Ingen vet säkert." },
  "variants": { "b": { "hook": { "text": "Elva bilar inne.\nEller tolv?", "sub": "Ingen vet säkert." }, "voiceover": { "hook": "Elva bilar inne. Eller tolv?" } } },
  "problem":  { "title": "Radio. Rundor.\nGissningar.", "pains": ["Max 3 korta smärtpunkter", "…", "…"] },
  "solution": { "title": "Med LUPNUMBER ser du allt.",
                "steps": [ { "icon": "phone", "label": "Checka in", "sub": "Vid grinden" },
                           { "icon": "map",   "label": "Se yarden",  "sub": "I realtid" },
                           { "icon": "check", "label": "Checka ut",  "sub": "Vid utfart" } ],
                "kicker": "Full *koll.*" },  // *ord* blir accentfärgat
  "cta":      { "question": "Vet ni hur många som är på siten *just nu*?", "label": "Svara i kommentarerna", "url": "lupnumber.com" },
  "voiceover": { "hook": "…", "problem": "…", "solution": "…", "outro": "Frågan igen. Skriv i kommentarerna." }
}
```

`episode` styr bara ordningen i SERIE.md och filnamnet; det visas inte i bild. `cta` utan `question` ger brandets standard ("Boka en demo").

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

Minsta textstorlek i en hero är 28 px (på en telefon visas videon runt 400 px bred, så 20 px blir 7 px). Tre, fyra stora element per hero, inga mikroetiketter.
Primitiverna i `brand/yard.js` returnerar `Item` med `.set({x, y, scale, rotate, opacity, color})`, `.tone(p)` (muted→accent), `.pop(t, start)`, `.fadeIn(t, start)`.
Finns: `road`, `truck`, `truckTop`, `gate`, `clock`, `icon`, `pill` (`.text`, `.icon`, `.swap(p, a, b)`, `.toneStyle(p)`), `bubble`, `card`, `label`, `qmark`, `check`, `dock`, `grid`, `path` (`.draw`, `.at`, `.angleAt`), `pin`, `phone` (`.screen`), `sheet`, `dot` (`.pulse`), `row`.
Problem-läget håller sig till `--muted`/`--border`, lösningen till `--accent`/`--tint-1`. Allt styrs av `s` – inga CSS-animationer, inga klockberoenden. Se `scenes/grind-ko.js` (kö vid bommen) och `scenes/hitta-ratt.js` (rutt på karta) som mönster.

Utan scen (`"scene": null`) centreras chips respektive flöde automatiskt.

## Hero-film och LinkedIn-version (`brand/hero.js`)

`LupnumberSiteDay` är en 60-sekunders film i ett sammanhängande bildrum (sidovy): infart, grind med bom och vaktbod, skylt, lastkaj med fyra portar. En lastbil, ABC 123, en morgon. Kameran åker och zoomar, telefonen lyfts ur hytten för den digitala delen, operatörsvyn glider upp under bilden. Beats och texter ligger i `films/lupnumber-site-day.json`; `films/lupnumber-linkedin-25.json` är en egen 25-sekundersklippning av samma mall.

```bash
npm run hero -- lupnumber-site-day        # 60 s: mp4 med ljudmix + tyst version, MANUS, SRT (sv/en), events.json, audio/
npm run hero -- lupnumber-linkedin-25     # 25 s LinkedIn-version
npm run hero -- lupnumber-site-day --vo-sv speaker.wav   # mixa in inspelad speaker (8 dB ducking)
npm run material                          # checklista + närvarolista (PDF) som klipp 04 och 09 lovar
npm run index                             # out/index.html med spelare för alla renderingar
npm run verify                            # ffprobe på alla mp4 → tabell i QUALITY.md
```

Ljudet är en **prototyp**: `audio/synth.py` syntetiserar originalmusik och ljudeffekter (inga licenser), mixar efter filmens händelser och normaliserar till −16 LUFS. Ingen röst finns i miljön; speakertexterna på svenska och engelska ligger tidkodade i `MANUS.md`. Kvalitetsrapporten med granskning, red team och verifierade filer: [`QUALITY.md`](QUALITY.md).

## Flödesfilm: idag överst, med LUPNUMBER nederst

`films/<slug>.json` listar steg i sitens flöde. Varje steg pekar på ett klipp (scenen hämtas därifrån) och har en rad för "idag" och en för "med LUPNUMBER", egen längd (`duration`) och voiceover.
Mallen visar samma scen två gånger: överst "Idag" i problemläge (grått, stillastående, mindre panel) som spelar ensamt i `stagger` sekunder (2 s), sedan glider den större LUPNUMBER-panelen in underifrån och löser bilden. Stegindikatorn i brandets flödesstil visar var i dagen man är.
Nya steg = nya rader i JSON; nya scener skrivs som vanligt i `scenes/`. Scenen måste fungera i båda lägena samtidigt: lösningsbeteenden styrs av `s.phase`/`s.l`, aldrig av `s.t` ensamt.

## Räknescen

`scenes/rakna.js` räknar upp kostnaden ur klippets `calc`-block: `trucks × minutes × days / 60` timmar i kö, och i lösningen samma räkning med `minutesAfter`.
Byt siffrorna i `clips/10-vad-kostar-kon.json` mot kundens egna. Så länge de är antaganden står "Räkneexempel" i bild (fältet `note`).

## CTA-typer

`cta` i klippets JSON styr outron: `question` (frågan), `options` (A/B/C-omröstning), `label` (knappen), `icon` (`chat`, `users` för "tagga", `clipboard` för giveaway), `url`.
Serien växlar mellan fråga, omröstning, tagga-någon och giveaway så att outron inte blir en vana att scrolla förbi. Giveaway-klippen (04, 09) lovar en checklista respektive en mall, så de filerna måste finnas innan de postas.

## Säg bara: "gör nästa klipp om [utmaning]"

Repo-skillen i `.claude/skills/nytt-klipp/SKILL.md` beskriver hela proceduren för Claude Code: välja nästa ordningsnummer,
skriva klipp-JSON i rätt röst (hook A och B, CTA-fråga), komponera scenvisual av primitiverna, rendera, kontrollera bildrutor, köra snapshot-testet,
lägga till steget i flödesfilmen om det hör hemma där, och rapportera.
Exempel:

- "gör nästa klipp om besökare och entreprenörer som dyker upp oanmälda"
- "gör nästa klipp om farligt gods, utan egen scen"
- "gör klipp 12 om nattleveranser, hook: 'Klockan tre. Vem öppnar?'"

## Svagaste delen

Ljudet och ansiktet. Pipelinen levererar bild, manus, undertexter och karusell men ingen inspelad röst och inget ansikte.
Voiceovern bör läsas in av någon hos er och muxas in med `--audio`. Ett två sekunders klipp med en person som säger hooken
före grafiken är det som skulle lyfta stoppkraften mest, och det måste filmas av er.
