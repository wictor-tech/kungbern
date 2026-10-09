# VERAPEP homepage image & label QA — v12.6

Reviewed 84 catalogue vial instances plus the static homepage imagery.

## Findings fixed

- Vial names now use deterministic natural line breaks; arbitrary mid-word wrapping is disabled.
- Effect colours now use one dominant goal colour per vial; secondary goals are only a narrow label-band accent.
- The seven goal controls use the exact same palette as the vials.
- 13 catalogue names receive presentation-only punctuation/spacing normalisation. The stored database values remain unchanged.
- `CJC-1295 Whitout DAC` is shown as `CJC-1295 Without DAC` on the homepage; the source database typo is not mutated.
- Full-width closing parentheses in HGH/TB500 names are normalised for display.
- Strength units are formatted consistently (`mg`, `µg`, `IU`, `mL`) with a space between number and unit.
- Insulin has a non-Latin source specification (`1盒1支`), so the vial shows `See variants` rather than exposing an inconsistent label.

## Goal palette

- **Weight & metabolism** — #078995 — 18 products
- **Skin appearance** — #c35d98 — 9 products
- **Strength & recovery** — #238f63 — 25 products
- **Energy** — #bd8615 — 3 products
- **Sleep & focus** — #5b63bd — 9 products
- **Healthy ageing** — #318ab7 — 6 products
- **Hormonal & specialist** — #8253a7 — 14 products

## Presentation-normalised catalogue names

- `cagrilintide5mg+ semaglutide5mg` → `cagrilintide 5 mg + semaglutide 5 mg` — lines: cagrilintide | 5 mg + semaglutide | 5 mg
- `GLP-1, 5mg/vial` → `GLP-1, 5 mg/vial` — lines: GLP-1, | 5 mg/vial
- `Retatrutide5mg+cagrilintide5mg` → `Retatrutide 5 mg + cagrilintide 5 mg` — lines: Retatrutide | 5 mg + cagrilintide | 5 mg
- `BPC10mg+TB10mg` → `BPC 10 mg + TB 10 mg` — lines: BPC 10 mg + TB | 10 mg
- `BPC157-10mg+GHK-CU50mg +TB500 10mg` → `BPC157-10 mg + GHK-CU 50 mg + TB500 10 mg` — lines: BPC157-10 mg + GHK-CU | 50 mg + TB500 10 mg
- `BPC157-10mg+GHK-CU50mg +TB500 10mg+KPV10mg` → `BPC157-10 mg + GHK-CU 50 mg + TB500 10 mg + KPV 10 mg` — lines: BPC157-10 mg + GHK-CU | 50 mg + TB500 | 10 mg + KPV 10 mg
- `BPC2mg+TB2mg` → `BPC 2 mg + TB 2 mg` — lines: BPC 2 mg + TB | 2 mg
- `BPC5mg+TB5mg` → `BPC 5 mg + TB 5 mg` — lines: BPC 5 mg + TB | 5 mg
- `CJC-1295 Whitout DAC` → `CJC-1295 Without DAC` — lines: CJC-1295 | Without DAC
- `CJC-1295without DAC5mg+IPA 5mg` → `CJC-1295 Without DAC 5 mg + IPA 5 mg` — lines: CJC-1295 | Without DAC | 5 mg + IPA 5 mg
- `HGH 191AA(Somatropin）` → `HGH 191AA (Somatropin)` — lines: HGH 191AA | (Somatropin)
- `TB500 (FRAG）` → `TB500 (FRAG)` — lines: TB500 (FRAG)
- `TB500(Thymosin B4 Acetate）` → `TB500 (Thymosin B4 Acetate)` — lines: TB500 (Thymosin | B4 Acetate)

## Static homepage image review

- **Hero bubbles:** correct transparent 4K asset; colour restrained to cool aqua/teal so it does not compete with the headline.
- **Unified glass vial:** neutral photorealistic base; no baked-in product name or baked-in category colour.
- **Quality illustration:** cool teal laboratory palette; no conflicting product-specific name.
- **Europe/network illustration:** teal dot-map treatment matches the navigation/hero palette.
- **Ask Vera illustration:** white/teal styling remains consistent with the support card and does not reuse product category colours.

## Automated label checks

- Products checked: 84/84
- Labels above four lines: 0
- Labels with missing goal colour: 0
- Labels still containing full-width parentheses: 0
- Labels still containing “Whitout”: 0
- Non-standard source specifications replaced by “See variants”: 1