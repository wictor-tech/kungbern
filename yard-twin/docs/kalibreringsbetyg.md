# Tolka kalibreringsbetyget

Betyget beräknas genom att modellen kalibreras på de **första 70 % av dagarna**. Därefter körs den på de **sista 30 %**, som modellen
aldrig har sett, med de verkliga ankomsterna och samplade lossningstider. Simulerad väntan jämförs med verklig väntan dag för dag.

| Betyg | Krav (alla måste uppfyllas) | Vad du får säga |
| --- | --- | --- |
| **Hög** | ≥ 90 kalibreringsdagar, ≥ 500 besök, fel i medelväntan (wMAPE) ≤ 10 %, systematiskt fel ≤ 5 %, verkligheten inom modellens 10–90 %-intervall ≥ 70 % av dagarna | "Modellen träffar er verklighet inom ungefär X % på dagar den inte sett." |
| **Medel** | ≥ 60 dagar, ≥ 300 besök, wMAPE ≤ 20 % | Visa riktningar och intervall. Undvik punktsiffror. |
| **Låg** | Uppfyller inte Medel | Varning visas. Använd bara för att diskutera mekanismer, inte siffror. |
| **Otillräckligt underlag** | < 30 dagar, < 100 besök eller < 5 testdagar | Inga felmått visas. Modellen ska inte användas för kundens siffror. |

**Felmått:**
- **wMAPE** = Σ|simulerat − verkligt| / Σ verkligt. Används i stället för vanlig MAPE, som exploderar på dagar nästan utan väntan.
- **Systematiskt fel** = Σ(simulerat − verkligt) / Σ verkligt. Negativt betyder att modellen underskattar väntan.
- **Täckning** = andel testdagar där verkligheten låg inom modellens 10–90 %-intervall. Den bör ligga nära 80 %.
- **Replay-fel** = felet när även de verkliga lossningstiderna används. Det mäter bara kölogiken. Är replay-felet litet
  men det totala stort, kommer felet från fördelningen av lossningstider (t.ex. säsong eller förändrad personalstyrka).

**Två backtester, båda visas:**
1. **Verkliga ankomster** (replay av testdagarna, samplade lossningstider). Det ger betyget.
2. **Genererade ankomster** (Poisson enligt den kalibrerade timprofilen, skalad till dagens volym). Det är det
   What if, jämförelsen och ROI bygger på. Över 20 % fel eller 15 % systematiskt fel ger en varning även om betyget är bra.

**Demosajten** (syntetisk) får i dag betyget **Medel ⚠**:
- **Replay:** wMAPE 7,8 % och systematisk underskattning 4,6 %. Kölogiken ensam har 2,6 % fel.
- **Täckning:** 66,7 %, under gränsen 70 % för Hög.
- **Genererade ankomster:** 20 % fel och **överskattning med 8 %**. Det är precis över varningsgränsen.

Förklaringen är logistisk. 85 % av demosajtens bilar är redan bokade, så de verkliga ankomsterna är jämnare än
slumpmässiga (Poisson) ankomster. "Utan slottbokning" i jämförelsen är därför ett *hypotetiskt* utgångsläge, inte dagens
verklighet. För en kund som redan bokar mäter ROI värdet av bokningen jämfört med att inte ha den, inte nyttan av mer
bokning. Det ska sägas i mötet.
