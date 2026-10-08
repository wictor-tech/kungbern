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

**Demosajten** får i dag betyget **Medel**. wMAPE är 9 %, men modellen underskattar väntan med 6,5 %, och täckningen är
69,7 %, strax under gränsen för Hög. Det är avsiktligt att det visas öppet.
