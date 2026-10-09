# Användartester med simulerade personor (v17)

> **Detta är inte en verklig användarstudie.** Personorna nedan är AI-skriptade och simulerade. Varje persona är ett automatiserat "blint" navigeringsprogram (`tests/personas.py`) som styr en riktig Chromium-webbläsare mot en riktig server. Programmet känner inte till sajtens adresser. På varje sida läser det de synliga länkarna och knapparna, poängsätter texten mot de ord personan skulle leta efter och klickar på bästa träff.
>
> Metoden mäter alltså om etiketter och vägar går att *hitta*. Den mäter inte förståelse, känslor, förtroende eller läsbarhet på riktigt. Resultaten bör bekräftas med 5–8 verkliga användare före lansering.

## Personor och uppgifter

| Persona | Enhet | Ordförråd (exempel) | Uppgifter |
| --- | --- | --- | --- |
| A – Förstagångsbesökaren | Desktop 1440 px | shipping, delivery, contact, help | Hitta leverans- och returinformation; hitta en namngiven produkt (BPC 157); hitta kontaktuppgifter (en synlig e-postadress) |
| B – Mobilanvändaren | Mobil 375 px | delivery, track, order | Hitta leveranstiden; söka fram en produkt (GHK-Cu) via mobilmenyn; hitta orderspårning |
| C – Den tekniska användaren | Desktop | specification, documentation, lab report, privacy | Hitta specifikationen; förstå varför dokumentation saknas; hitta hur personuppgifter hanteras |
| D – Den skeptiska besökaren | Desktop | about, company, legal, verified, terms | Hitta vem som driver sajten; hitta hur information kontrolleras; hitta villkoren |
| E – Den ovana användaren | Mobil 430 px | Ask Vera, help | Fråga Vera om leverans; fråga på svenska hur man kontaktar dem; ställa en doseringsfråga (ska nekas säkert); ta sig tillbaka till startsidan från en trasig länk |

**Mått per uppgift:** slutförd ja/nej, antal steg (klick, sökningar, frågor), var personan fastnade, vilka texter som var synliga där samt JS- och konsolfel.

## Resultat

Båda versionerna kördes med *samma* version av testprogrammet, mot var sin färsk server.

| Persona | Uppgift | v16 | v17 |
| --- | --- | --- | --- |
| A | Leverans och retur | ✅ 1 steg | ✅ 1 steg |
| A | Hitta BPC 157 | ✅ 2 steg | ✅ 2 steg |
| A | **Kontaktuppgifter** | ❌ fastnade på startsidan: "Contact support" var en mailto-länk utan synlig adress | ✅ 1 steg ("Contact us" → kontaktsektion med e-post) |
| B | Leveranstid | ✅ 1 | ✅ 1 |
| B | **Sök produkt i mobilmenyn** | ❌ gav upp efter 6 steg: menyn stod kvar öppen och täckte resultaten, och klick på kort gick inte igenom | ✅ 3 steg |
| B | Orderspårning | ✅ 1 | ✅ 1 |
| C | Specifikation | ✅ 0 (synlig direkt) | ✅ 0 |
| C | Varför dokumentation saknas | ✅ 0 | ✅ 0 |
| C | Personuppgifter | ✅ 1 | ✅ 1 |
| D | Vem driver sajten | ✅ 1 (Terms), *men uppgiften är "pending"* | ✅ 1, *samma innehållsbrist* |
| D | Hur information kontrolleras | ✅ 0 | ✅ 0 |
| D | Villkor | ✅ 1 | ✅ 1 |
| E | Vera: leverans | ✅ | ✅ |
| E | **Vera på svenska: kontakt** | ❌ "I could not find a published answer" | ✅ svar med e-postadress |
| E | **Vera: doseringsfråga** | ❌ **osäkert**: Vera hänvisade till produktfiltret för viktminskning | ✅ tydligt nekande ("Not medical advice"), utan produktlänkar |
| E | Tillbaka från 404 | ✅ 1 | ✅ 1 |
| **Totalt** | | **12/16** | **16/16** |

Inga JS-fel uppstod. Enda konsolposten är den förväntade 404-statusen på den trasiga länken.

## Iakttagelser och åtgärder

| Iakttagelse | Typ | Åtgärd |
| --- | --- | --- |
| Ingen synlig e-postadress någonstans utom på juridiska sidor; "Contact support" öppnade e-postklienten utan att visa adressen | Navigation/text | Ny kontaktsektion på `/support.html#contact` med synlig e-post, integritetsadress, operatörsstatus och orderspårning. Footerlänken heter nu "Contact us" och leder dit. |
| Sökning från den öppna mobilmenyn filtrerade katalogen *bakom* menyn, så användaren såg ingenting hända | Tekniskt fel (verifierat manuellt) | Menyn stängs vid sökning och sidan scrollar till resultaten. Täcks av E2E-testet `mobile_search`. |
| Vera förstod inte svenska | Språk | Svenska synonymer i Vera. |
| Vera styrde en doseringsfråga till ett hälsofilter | **Säkerhet/regulatoriskt** | Säkerhetsspärr före all matchning. Snabbknapparna ställer vanliga frågor i stället för att sätta hälsofilter. |
| "Vem står bakom?" leder till en sida som säger "company details pending" | Innehåll | **Kan inte lösas tekniskt.** Kräver företagsuppgifter (se `V17-LAUNCH-READINESS.md`). Vera säger nu rakt ut att uppgifterna inte publicerats. |
| Hjärtknappar har produktnamnet i sin etikett, så en besökare som letar efter namnet kan träffa "spara" | Text | Behållen. Etiketten är korrekt för skärmläsare, och testprogrammet viktar nu knappar lägre än länkar. Ingen ändring. |
| Startsidan visade "84 products" fast hälften inte ska vara publika | Innehåll | Siffrorna kommer nu från API:t och visar det som faktiskt är listat. |

## Felkällor i testprogrammet (redovisas öppet)

Första körningen gav felaktiga misslyckanden för v17. Två brister i *testprogrammet* var orsaken:

- Det läste sista `<p>` i Veras svar, vilket är länkraden.
- Vid lika poäng valde det första elementet i dokumentet.

Båda rättades, och **båda versionerna kördes om** med den rättade versionen (resultaten ovan). Uppgifter med 0 steg (C1, C2, D2) betyder att informationen redan syntes på startsidan; de mäter alltså inte navigering.

## Kör själv

```bash
python3 tests/personas.py                                   # startar en egen server
PERSONA_ROOT=/path/to/v16/verapep python3 tests/personas.py # kör mot en annan version
PERSONA_OUT=result.json python3 tests/personas.py           # rådata
```
