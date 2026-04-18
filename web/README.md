# LUPNUMBER · 30s explainer (web)

Animated React component för LUPNUMBER®, byggd med **Vite + React + TypeScript + Framer Motion**. Exakt 30-sekunders timeline, auto-play, loop-klar och responsiv (mobil + desktop).

## Timeline

| Tid | Scen | Innehåll |
| --- | --- | --- |
| 0–5s | `LogoScene` | Shield-logo + "LUPNUMBER" letter-by-letter reveal |
| 5–10s | `ProblemScene` | Köande lastbilar, kaos-klocka, frustrerad person m. klippbräda |
| 10–15s | `SolutionScene` | Lastbil kör in, digital kiosk tänds, dataflöde till cloud |
| 15–22s | `BenefitsScene` | ✓ Safety first · Real-time info · Faster processing · Data-driven |
| 22–28s | `CustomersScene` | Kundlogotyp-karusell + "Trusted by industry leaders" |
| 28–30s | `CtaScene` | "Put safety first!" + CTA-knapp |

## Dev

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build i dist/
npm run preview   # serverar byggd version
```

## Embed i befintlig sajt

Kopiera `src/LupnumberExplainer/` in i ditt React-projekt och importera:

```tsx
import { LupnumberExplainer } from "./LupnumberExplainer";

<LupnumberExplainer loop showProgress />
```

Props:
- `loop` (default `true`) – spelar om från 0s efter 30s
- `showProgress` (default `true`) – progressbar i botten
- `className`, `style` – standard React-props på container

Komponenten har `aspectRatio: 16 / 9` och `width: 100%`, så den skalar automatiskt.

## Anpassa

- **Brand colors**: redigera `BRAND` i `src/LupnumberExplainer/timeline.ts`
- **Timing**: justera `TIMELINE.scenes` i samma fil – alla scener läser därifrån
- **Text / kundnamn**: redigera respektive scen i `src/LupnumberExplainer/scenes/`
- **Ikoner**: `src/LupnumberExplainer/icons.tsx` – rena SVG, lätt att byta stroke/fyll
- **Nya scener**: lägg till i `timeline.ts`, skapa komponent i `scenes/`, lägg till i `SCENE_MAP` i `index.tsx`

## Teknik

- Inga externa bild- eller video-filer – allt är SVG + CSS
- `useTimeline` hook driver tiden via `requestAnimationFrame`
- `AnimatePresence` fadar mjukt mellan scener
- Scener använder `motion`-varianter med `delay` för sekvenserade element
