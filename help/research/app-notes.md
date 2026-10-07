# LUPNUMBER-appen – vy för vy

> **Ej insamlat ännu** – `app.lupnumber.com` blockeras av miljöns nätverkspolicy (se `README.md`).
> Det gick inte ens att se om `/site` kräver inloggning. Nedan är **förväntad** struktur hämtad
> från PDF-manualens brödsmulor (`../content/guides.sv.json`); kolumnerna URL, knapptexter och
> avvikelser fylls i från skärmbilderna och `capture/capture-log.json` (som loggar URL, sidtitel
> och alla knapptexter per vy).

## URL-mönster (för sidkontext i hjälpen)

| Vy | Förväntat (känt) | Faktiskt URL-mönster |
|---|---|---|
| Inloggning | – | TODO |
| Site (start) | `https://app.lupnumber.com/site` | TODO (redirect?) |
| Site › Board / List / Matrix / Week | flikar i Site | TODO (egen sökväg, query eller bara klientstate?) |
| Location Admin | länk uppe i Site | TODO |
| Location Admin › plats (t.ex. DEMO LUP) | platsmeny | TODO (plats-id i URL?) |
| Undersidor | se tabell nedan | TODO |

Om flikar/dialoger inte syns i URL:en måste hjälpknappen få kontexten från appen själv
(t.ex. `data-help-context`-attribut eller en `postMessage` till hjälpen).

## Site (guide 30–38)

| Vy / dialog | Guide | Typ | URL | Knappar (exakt) | "?"-placering | Avvikelse mot PDF |
|---|---|---|---|---|---|---|
| Board | #30 | flik | TODO | TODO | TODO (förslag: topbaren, höger om flikarna) | TODO |
| List | #31 | flik | TODO | TODO | TODO | TODO |
| Matrix | #32 | flik | TODO | TODO | TODO | TODO |
| Week | #33 | flik | TODO | TODO | TODO | TODO |
| Add + | #34 | dialog | TODO | TODO | TODO (dialogrubrik) | TODO |
| SMS Alarm ⚠️ | #35 | dialog | TODO | TODO | TODO | TODO |
| Settings | #36 | dialog | TODO | TODO | TODO | TODO |
| Reglageikonen (larm) | #37 | meny | TODO | TODO | TODO | TODO |
| Allowed vehicles | #38 | dialog | TODO | TODO | TODO | TODO |

## Location Admin (guide 1–29)

Menygrupper enligt PDF: *Location details*, *Operations*, *Booking*, *People & communication*,
*Access & reporting*, *View reports*.

| Undersida | Grupp | Guide | URL | Knappar (exakt) | Avvikelse mot PDF |
|---|---|---|---|---|---|
| Platsmenyn (DEMO LUP) | – | #1 | TODO | TODO | TODO |
| Edit location information | Location details | #2–4 | TODO | TODO | TODO |
| Image management | Location details | #6 | TODO | TODO | TODO |
| Slideshow settings | Operations | #7–12 | TODO | TODO | TODO |
| Booking settings | Booking | #15 | TODO | TODO | TODO |
| Capacity & timeslots | Booking | #16 | TODO | TODO | TODO |
| Manage contacts | People & communication | #19 | TODO | TODO | TODO |
| Notification settings | People & communication | #20 | TODO | TODO | TODO |
| SMS template overrides | People & communication | #21 | TODO | TODO | TODO |
| Manage gates ⚠️ | Access & reporting | #23 | TODO | TODO | TODO |

Observation redan i PDF-datat: brödsmulorna är inte helt konsekventa – *Edit location information*
nås ibland via *Location details* (#2) och ibland direkt (#3, #4), och *View reports* är både ett
menyval under *Access & reporting* (#25) och en egen grupp (#26–29). Verifiera mot appen.
