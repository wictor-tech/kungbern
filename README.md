# lupnumber short

18-sekunders vertikalt (9:16, 1080×1920) reklamklipp för lupnumber.com, byggt med [Remotion](https://www.remotion.dev).

## Innehåll

| Tid | Scen | Budskap |
| --- | --- | --- |
| 0–3s | Intro | Logo-reveal + "Vem ringde dig?" |
| 3–8s | Search | Animerad sökfält + resultatkort |
| 8–13s | Features | Blixtsnabbt · Anonymt · Kommentarer |
| 13–18s | CTA | `lupnumber.com` + "Sök nu" |

Totalt: 540 frames @ 30 fps.

## Kom igång

```bash
npm install
npm start          # öppnar Remotion Studio för live-preview
npm run build      # renderar out/lupnumber-short.mp4
```

## Struktur

```
src/
  index.ts              # registerRoot
  Root.tsx              # Composition (1080x1920 @ 30fps, 540 frames)
  LupnumberShort.tsx    # huvudkomposition, sekvenserar scenerna
  components/
    Background.tsx      # animerad gradientbakgrund
  scenes/
    IntroScene.tsx
    SearchScene.tsx
    FeaturesScene.tsx
    CtaScene.tsx
```

## Anpassa

- **Text, färger, telefonnummer**: redigera respektive scen i `src/scenes/`.
- **Varaktighet**: justera `DURATION_IN_FRAMES` i `src/Root.tsx` och sekvenstiderna i `src/LupnumberShort.tsx`.
- **Musik/voiceover**: lägg ljudfil i `public/` och använd Remotions `<Audio>` i `LupnumberShort.tsx`.
- **Logo/bilder**: lägg i `public/` och importera via `staticFile("filnamn")` + `<Img>`.
