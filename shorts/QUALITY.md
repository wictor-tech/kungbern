# LUPNUMBER – kvalitetsrapport (hero-film, "This is Sten.", LinkedIn-version, klippserie)

> Allt i den här rapporten är verifierat i den här sessionen genom rendering och bildkontroll, om inget annat sägs. Avsnittet "Verifierade filer" längst ner fylls i av `node shorts/scripts/verify.mjs` direkt ur de renderade filerna.

## 1. Produktionsgranskning (utgångsläge)

- **Commit:** `c160cb0` på `ccr-50b2a817-zrp5b9` fanns, arbetsträdet var rent och inga ändringar hade gjorts efter den.
- **60-sekundersbrief:** det har aldrig funnits ett 60-sekunders hero-filmmanus i projektet eller sessionen. Den ursprungliga briefen gällde 15–25-sekunders LinkedIn-klipp. Det som fanns var tio klipp (17,5 s) och en 49,5-sekunders processfilm med delad bild (idag/med LUPNUMBER). Hero-filmen `LupnumberSiteDay` är alltså nybyggd i den här rundan, inte en komplettering.
- **Processfilmen (49,5 s):** stegindikator, två paneler och en rubrik per steg. Läsbar på rubriknivå på mobil, men detaljerna inne i panelerna (tabeller, piller, slottider) är textur, inte information, vid 390 px bredd. Den känns som en presentation: ingen kamera, inget sammanhängande rum, ingen huvudperson. Behålls som kampanjtillgång (B2B-publik på desktop, säljmöten) men är inte hero-filmen.
- **Klippen (10 × 17,5 s):** hooken i första bildrutan fungerar, hero-grafiken läses på mobil efter läsbarhetspasset, CTA-typerna växlar. Två CTA:er lovade material som inte fanns (04 checklista, 09 mall).
- **Ljud:** saknades helt. Inga röstverktyg finns i miljön (espeak, flite, pico, piper, say saknas). Musik och effekter kunde bara göras genom syntes.
- **Mallkänsla:** de element som drog mot "SaaS-mall" var stegindikatorn, panelerna, likformiga piller överallt och avsaknaden av rörelse i bildrummet. Det är det hero-filmen bryter med.

## 2. Hero-filmen `LupnumberSiteDay` (60 s, 1080×1350, 30 fps, 1800 frames)

En lastbil, ABC 123, en morgon, ett sammanhängande bildrum i sidovy: infartsväg, grind med bom och vaktbod, skylt, lastkaj med fyra portar. Kameran rör sig (åkning, inzoomning mot hytten, utzoomning till helbild) i stället för att klippa mellan lösa skärmar. Den digitala delen visas som en telefon som "lyfts" ur hytten till närbild och sedan tillbaka, samt som en operatörsvy som glider upp under bilden.

| Tid | Beat | Vad som händer | Rubrik i bild (≥ 48 px) |
| --- | --- | --- | --- |
| 0–4 | Ankomst | Grå värld. ABC 123 kommer in nära kameran, åkning höger mot kön. | 06:58. En lastbil på väg till grinden. |
| 4–10 | Idag | Kö bakom bommen, vaktbod med papper och klocka, frågetecken. | Idag: kö, papper och ett språk som inte går fram. |
| 10–14 | Samma grind | Svep: världen tonar till sky, kön är borta, ABC 123 rullar fram till stopplinjen. | Samma grind. Med LUPNUMBER. |
| 14–22 | Incheckning | Kameran går in mot hytten, telefonen lyfts fram. Regnummer skrivs in, språk väljs (PL), gränssnittet byter till polska. | Chauffören checkar in i mobilen. På sitt språk. |
| 22–30 | Säkerhet | Fyra regler på polska bockas av, "Potwierdzam" → "Potwierdzono". Telefonen går tillbaka in i hytten. | Säkerhetsreglerna på polska. Kvitterade före infart. |
| 30–37 | Grinden | Operatörsvyn: ankomsten syns med status, operatören anvisar port 3 manuellt, bommen går upp, bilen kör in. | Operatören ser ankomsten och anvisar port 3. |
| 37–45 | Vägen | Kameran följer bilen förbi skylten och portarna, "Port 3 · 140 m →" följer med, bilen stannar vid port 3. | Rätt port. Första gången. |
| 45–51 | Överblick | Utzoomning till hela siten med flera fordon i flöde, operatörsvy med siffror. | Hela siten i realtid. |
| 51–55 | Utcheckning | Bilen lämnar, loggraden In 06:58 · Ut 07:41. | Utcheckad. Allt loggat. |
| 55–60 | Avslut | Wordmark byggs upp, tagline, "Se hur det fungerar på er site", Boka en demo, URL. | – |

Polska texter i bild: *Zameldowanie kierowcy · Numer rejestracyjny · Wybierz język · Zasady bezpieczeństwa · Kask i kamizelka odblaskowa · Maks. 20 km/h na terenie · Zatrzymaj się przy rampie · Zakaz palenia · Potwierdzam / Potwierdzono · Dalej · Jedź do rampy 3*. "Rampa" används för lastkaj (inte "brama" som i klipp 03, där det betyder grind).

Inga siffror om tidsbesparing eller ROI i hero-filmen. Värdet berättas genom resan.

## 3. Filmiska beslut

- **Kamera:** varje beat har en start- och slutposition (x, skala, marklinje) med mjuk easing; inga hårda klipp mellan fysiska scener. Närbild vid incheckning (skala 1,45), helbild vid överblick (0,56).
- **Parallax:** bakgrundsbyggnader och ljusmaster rör sig i halv hastighet mot förgrunden.
- **Fysiskt → digitalt:** telefonen växer ur hyttens position till bildens mitt medan världen tonas ned; tillbaka samma väg. Operatörsvyn glider upp underifrån när marklinjen höjs.
- **Typografi:** rubriker 56 px (minst 48 px efter automatisk anpassning till två rader), ordvis intoning, ingen rubrik under ett lager som dämpar den.
- **Återhållsamhet:** inga partiklar, inga blinkande pulser utom realtidspunkten i operatörsvyn. Allt som rör sig berättar något (bom, bil, telefon, bock).
- **Färg:** "idag" är grått (muted) med hjältebilen i rubrikfärg, LUPNUMBER-världen i varumärkets sky och toningar. Övergången är ett svep, inte en cut.

## 4. Ljud (prototyp)

- **Musik:** syntetiserad originalkomposition i `shorts/audio/synth.py` (A-moll → C-dur, 92 bpm): stilla intro, spänning under kön, lyft vid "Samma grind", driv under flödet, avslutande slag vid avslutet. Helt genererad, inga licenser. Den är en **temp-track**: ersätt med licensierad musik före publicering.
- **Ljuddesign:** 25 synkade händelser exporteras ur filmen (`events.json`): lastbil som passerar, luftbroms, tomgång, svep vid världsbytet, klick vid tryck, bekräftelseton, bommens motor, pip vid utcheckning. Nivåer −4 till −10 dB mot musiken.
- **Mix:** `audio/mix.wav` → `audio/mix.m4a` normaliserad till −16 LUFS integrerat, true peak −1,9 dBTP, LRA 2,1 LU. Ingen klippning (max −0,9 dBFS före normalisering).
- **Röst:** inga röstverktyg i miljön. Speakertext på svenska och engelska finns tidkodad i `MANUS.md` samt som `undertexter-sv.srt` och `subtitles-en.srt`. När en röst spelas in: `node shorts/scripts/hero.mjs lupnumber-site-day --vo-sv fil.wav` mixar in den med 8 dB ducking av musik och effekter.
- **Versioner:** `<slug>.mp4` (musik + effekter, inbrända svenska undertexter) och `<slug>-tyst.mp4` (helt utan ljud).

## 5. Produkttrohet

- Gränssnitten (telefon och operatörsvy) är **konceptuella visualiseringar** i varumärkets grafik, inte skärmdumpar av den driftsatta produkten. Det står i MANUS och i förhandsvisningen.
- Inga automatiska beslut visas: operatören anvisar porten med ett synligt tryck. Registreringsnumret skrivs in av chauffören (ingen kameraigenkänning påstås).
- Funktioner som visas: incheckning i mobilen, språkval, säkerhetsinstruktioner med kvittens, operatörsvy med ankomster, portanvisning, vägvisning i mobilen, överblick i realtid, in-/utcheckningslogg. Språkval, incheckning och säkerhet kommer från briefen; de övriga är rimliga för yard management men är **antaganden** tills LUP bekräftar dem. Stryk eller omformulera i `films/lupnumber-site-day.json` om något inte stämmer.

## 6. Kommersiell noggrannhet

- Räkneexemplet (12 × 35 × 22 = 154 h; 12 × 5 × 22 = 22 h; skillnad 132 h/månad) är korrekt och finns bara i klipp 10, märkt "Räkneexempel" i bild och "antaganden" i manuset. Det finns inte i hero-filmen eller LinkedIn-versionen.
- Inga kundnamn, inga påstådda kundresultat. Bolagsnamn i operatörsvyn (Nordfrakt AB, Transit AB, Linjetrafik) är påhittade exempel.

## 7. Klippserien (10 × 17,5 s) – kommersiell och kreativ granskning

| # | Första 2 s | En insikt | Läsbar på mobil | Utan ljud | CTA | Står ensamt | Professionellt | Korrekt | Åtgärd |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 Kö vid grinden | Ja, igenkänning | Ja | Ja | Ja | Fråga | Ja | Ja | Ja | – |
| 02 Vem är på siten | Ja | Ja | Ja | Ja | Omröstning | Ja | Ja | Ja | – |
| 03 Språk | Ja | Ja | Ja | Ja | Tagga | Ja | Ja | "bramy 4" = grind 4, avsiktligt | – |
| 04 Säkerhetsgenomgång | Ja | Ja | Ja | Ja | Giveaway | Ja | Ja | Ja | Checklistan skapad (`out/material`) |
| 05 Fel port | Ja | Ja | Ja | Ja | Fråga | Ja | Ja | Ja | – |
| 06 Pärmar | Ja | Ja | Ja | Ja | Omröstning | Ja | Ja | Ja | – |
| 07 När kommer bilen | Ja | Ja | Ja | Ja | Fråga | Ja | Ja | Slotbokning antagen | – |
| 08 Telefonen i vakten | Ja | Ja | Ja | Ja | Tagga | Ja | Ja | Notiser antagna | – |
| 09 Larmet går | Ja | Ja | Ja | Ja | Giveaway | Ja | Ja | Närvarolista antagen | Mallen skapad (`out/material`) |
| 10 Vad kostar kön | Ja, siffror | Ja | Ja | Ja | Fråga | Ja | Ja | Märkt räkneexempel | – |

Giveaway-CTA:erna behålls eftersom materialet nu finns, men de är de två svagaste för premiumpositionen; byt till fråga eller "Boka en demo" om ni hellre undviker "skriv ordet"-mekaniken. Ingen artificiell brådska används.

## 8. LinkedIn-versionen (25 s, 750 frames)

Egen klippning ur hero-filmens starkaste beats, inte en nedkortning: incheckning (6,5 s, börjar direkt vid grinden med rubriken "Så checkar en chaufför in. Utan kö, på sitt språk."), säkerhet på polska (6 s), operatören anvisar port och bommen går upp (5 s), rätt port (4 s), avslut med fråga och Boka en demo (3,5 s). Första bildrutan: bilen vid grinden, bommen nere, rubriken komplett. Fungerar utan ljud genom rubriker och inbrända undertexter.

## 9. Visningstester

Se "Verifierade filer" nedan (upplösning, frames, längd ur ffprobe) och bildkontrollerna i sessionen: första bildruta, 2-sekundershook, första produktinteraktion, säkerhetssekvens, bomöppning, övergång till flödet och avslut granskades ur den bundlade sidan och ur de renderade mp4-filerna. Mobilsimulering: bildrutor nedskalade till 390 px bredd. Rubriker (56 px → ~20 px) och telefonens primärtext (34–40 px → 12–14 px) läses; operatörsvyns taggar (20 px → 7 px) läses inte på mobil och är avsiktligt sekundära.

## 10. Red team – de tio viktigaste svagheterna

| # | Svaghet | Perspektiv | Status |
| --- | --- | --- | --- |
| 1 | Ingen mänsklig röst; temp-musiken är syntetisk och platt (LRA 2 LU) | Kreativ, kommersiell | Öppen: kräver inspelning och licensierad musik. Manus och mixväg klara. |
| 2 | Inget riktigt filmmaterial eller ansikte; hela filmen är vektorgrafik | Kreativ | Öppen: overlay med alfakanal finns för att lägga hooken på egen film. |
| 3 | Gränssnitten är koncept, inte produkten | Logistik, kommersiell | Öppen: kräver skärminspelningar eller UI-komponenter från LUP. Disclosat. |
| 4 | Fem funktioner är antaganden (portanvisning, vägvisning, överblick, logg, notiser) | Logistik | Öppen: måste bekräftas eller strykas av LUP. |
| 5 | Operatörsvyn och telefonens sekundärtext läses inte på mobil | Kreativ | Delvis: primärbudskapet bärs av rubriker ≥ 48 px; sekundärtexten är medvetet sekundär. |
| 6 | Bildrummet är rent men stiliserat; lastbilsmodellen är enkel | Kreativ | Åtgärdat delvis: ny dragbil+trailer-modell, parallax, skuggor. Fortfarande inte fotorealism, och ska inte vara det. |
| 7 | "Idag"-delen är kort (6 s) och smärtan hinner knappt kännas | Kommersiell | Medvetet: LinkedIn-publiken belönar inte lång friktion. Rubrik + kö + papper + "?" på 6 s. |
| 8 | Svepet vid "Samma grind" kan uppfattas som en omstart av tiden | Logistik | Åtgärdat med rubriken "Samma grind. Med LUPNUMBER." och samma bil. |
| 9 | 25-sekundersversionen börjar utan "idag"-kontrast | Kommersiell | Medvetet: hooken är lösningen i bild; kontrasten finns i rubriken "Utan kö". |
| 10 | Räkneexemplet bygger på antagna tal | Kommersiell | Hanterat: märkt i bild och manus, finns inte i hero-filmen. |

## 12. Före och efter

`shorts/out/jamforelse-fore-efter.jpg` ställer tre bilder ur den nya hero-filmen bredvid klipp 01 (första versionen, commit `40d5ab8`) och processfilmen (`0342bf9`).

| | Före | Efter |
| --- | --- | --- |
| Format | Tio fristående klipp + processfilm med två paneler och stegindikator | En sammanhängande 60-sekundersfilm med en huvudperson (ABC 123) och ett bildrum |
| Kamera | Ingen. Fasta layouter som tonar in och ut | Åkning, inzoomning mot hytten, utzoomning till helbild, parallax |
| Fysiskt → digitalt | Telefon och tabeller ritade i samma plan som allt annat | Telefonen lyfts ur hytten till närbild, operatörsvyn glider upp under bilden |
| Text | Minsta hero-text 18–22 px i första versionen, 28 px efter läsbarhetspasset | Rubriker 56 px (minst 48 px), telefonens primärtext 34–40 px |
| Produkt | Lösningssteg som tre kort | Chaufförens och operatörens faktiska handgrepp i ordning, med manuellt operatörsbeslut |
| Ljud | Inget | Syntetiserad musik + 25 synkade effekter, −16 LUFS, speakertext SV/EN klar att läsa in |
| Siffror | Räkneexempel i klipp 10 | Inga ROI-påståenden i hero-filmen |

## 13. Mobiltest (390 px)

Bildrutor ur den renderade hero-filmen nedskalade till 390 px bredd (motsvarar LinkedIn-flödet på en telefon): rubrikerna läses i varje beat, registreringsnumret och de polska reglerna läses i telefonnärbilden, bommen, kön och portarna läses som former. Operatörsvyns taggar och loggradens tider är under läsgränsen på mobil och bär inget primärbudskap. Inga element klipps av vid 72 px-marginalen; undertexterna ligger inom säkert område över LinkedIns egna kontroller.

## 11. Blockerare och manuellt arbete

1. Spela in speaker (SV och EN) efter `MANUS.md`; mixa med `--vo-sv`.
2. Välj och licensiera musik; byt ut `audio/music.wav` (samma mixkedja fungerar).
3. Bekräfta produktfunktioner i punkt 5 och justera `films/lupnumber-site-day.json`.
4. Filma två sekunder vid er egen grind och lägg `hook-overlay*.mov` ovanpå för en version med riktig miljö.
5. Granska polska texter med en polsktalande kollega (de är standardfraser, men kontrollera tonen).

## 14. "This is Sten." (60 s, 1080×1350, 30 fps, 1800 frames)

**Uppdrag:** producera komedifilmen ur `shorts/manus/this-is-sten.md` med samma produktionskedja och samma krav som hero-filmen (MASTERPROMPT V4): sammanhängande bildrum, läsbarhet på mobil, korrekt polska, inga påhittade produktfunktioner, ljudprototyp, verkliga visningstester, röd granskning, commit.

**Byggt så här.** `films/this-is-sten.json` kodar manusets 14 scener med exakta längder (3 + 5 + 3 + 5 + 4 + 5 + 6 + 4 + 3 + 6 + 4 + 4 + 5 + 3 = 60 s), speakerraderna (126 ord) och undertextcuer med manusets pauser (`beats[].cues`, max 7 ord per rad, tyst scen 5, en sekunds tystnad i frysbilden). `brand/sten.js` är mallen: den återanvänder hero-filmens värld (`LUP.heroParts`: väg, bom, bod, skylt, lastkaj nu med åtta portar, lastbilsmodell, telefon-UI med samma polska strängar som hero-filmen, kamera och parallax) och lägger till det manuset saknade: karaktärsriggar (Sten med mössa, läsglasögon i pannan, varselväst över marinblå fleece, grå skäggstubb och muggen "WORLD'S OKAYEST GATE"; Dariusz i röd väst; chefen i blå skjorta; två chaufförer till), tre vyer per karaktär (framifrån, profil, bakifrån) med tvåledsarmar, ansiktsuttryck (ögonbryn, blinkning, halvt leende, blickriktning), rekvisita (sladdtelefon, mobil, komradio, laminerad lapp med sju svenska regler, flip-klocka, kalkylarksskärm, live-skärm) och interiörerna. Ljudpipelinen fick tre musiksektioner (`silence`, `waltz`, `pulse`) och tio effekter. Undertexter ur manuset via `captions.cuesFromScript`. Allt är tidsstyrt per bildruta som förut.

**Scen för scen (verifierat i renderade bildrutor, helbild och 390 px):**

| Scen | Tid | I bild | Kontroll |
| --- | --- | --- | --- |
| 1 "This is Sten." | 0:00–0:03 | Extrem närbild, mugg på väg mot munnen, väggklocka 06:58 oskarp bakom, titelkort nere till vänster (64 px) | Muggen når läppen vid 2,9 s exakt när första signalen hörs; titelkortet bär texten, ingen dubbel undertext |
| 2 Flottan | 0:03–0:08 | Gryningsljus, kön med tända strålkastare rullar in som en front, bom, bod med Sten, stämpel 06:58 | Kön försvinner ur bild åt vänster; kameran åker bakåt (0,95→0,75) |
| 3 "Sten loves that." | 0:08–0:11 | Genom skjutfönstret: Sten, tre telefoner på disken (sladd, mobil, radio), kön speglad i glaset | Blick telefon→mugg→telefon, luren lyfts 10,0 s, muggen ställs ned 10,4 s, ögonbryn vid "loves", push-in sista 20 rutorna |
| 4 Trettio språk | 0:11–0:16 | Tre chaufförer (röd, orange, limegrön väst), bubblor "Dzień dobry, brama trzy?" · "Unde descarc?" · "Kur man važiuoti?", Sten med lur, mobil och radio under hakan | Stämpeln "according to management" slår i vid 14,2 s; sidoåkning stannar på Sten; han pekar ut vid 15,4 s |
| 5 Port 3 (tyst) | 0:16–0:20 | Stens rygg i förgrund med raka armar mot PORT 3, bil 1 backar in vid PORT 7, bil 2 följer efter till PORT 6, armarna sänks 18,6 s | Ingen undertext; skyltarna 3, 6 och 7 läsbara (42 px i världen) |
| 6 Siffrorna | 0:20–0:25 | Över axeln: gammal skärm med `siffror_v3_FINAL(2).xlsx`, kolumner IN/UT/REG/PORT/SPRÅK?, flikar som inte får plats, ett finger skriver, lur på axeln, chefens huvud i dörren med "Sten? The numbers by nine?", tumme upp 22,3 s, lastbil åt fel håll i fönstret, klocka 06:59 | Push-in mot skärmen; chefen försvinner 23,6 s |
| 7 Säkerheten | 0:25–0:31 | Tvåbild i profil, lappen SÄKERHETSREGLER med sju punkter, Sten pekar punkt för punkt, Dariusz nickar vid varje, truck tutar, besökare utan väst går förbi, radion sprakar; zoom ut sista två sekunderna | Punkt 7 vid 29,3 s med nick; bakgrunden avslöjas av utzoomningen |
| 8 Tio till. 07:01 | 0:31–0:35 | 8a kön växer i bakänden med tio bilar; 8b boden handhållet, tre ringande telefoner, chefens huvud, "Autosave failed"; 8c klockan slår om 07:00→07:01 (flip 33,95 s), ut/ned till Sten med muggen, Dariusz med telefon i fönstret | Tre bilder på fyra sekunder; "It is 7:01." 33,45–34,7 s |
| 9 Vändpunkten | 0:35–0:38 | Frysbild, färgen dras ur allt utom telefonen i Dariusz hand (glöd i sky), långsam push-in mot den, färgen rinner tillbaka 37,6–38,0 s | Tvärtyst i ljudet 35,0–37,6 s (nollat), pulsen startar 37,6 s |
| 10 Incheckning | 0:38–0:44 | Dagsljus, bilar med jämna mellanrum, Dariusz telefon ur hytten: Check-in · WGM 4521 → språkväljare (Polski, Română, Lietuvių, English, Svenska, Deutsch, Українська, Latviešu, +18) → Polski → Zameldowanie kierowcy, tumme upp; kameran glider till två hytter till (Română ✓, Lietuvių ✓); Sten i fönstret med muggen | Tre bekräftelsetoner; polskan är hero-filmens strängar |
| 11 Före bommen | 0:44–0:48 | Delad bild: vänster Dariusz telefon "Rampa 3 →" + Zasady bezpieczeństwa med fyra bockar → Potwierdzono; höger bommen upp, bilen rullar in och backar vid PORT 3, Sten i fönstret med armarna i kors | Inget backningspip i ljudet |
| 12 Siffrorna skriver sig själva | 0:48–0:52 | Samma vinkel som scen 6, platt skärm "Site · live": karta med åtta portar, fordon med regnummer, in/ut-logg som tickar in, "Report · today · ready ✓" vid 50,2 s med ett klick, chefens huvud nickar och försvinner, muggen och telefonerna stilla på bordet, klocka 07:03 | Spegling av scen 6 |
| 13 Stens riktiga jobb | 0:52–0:57 | Sten går över gården med muggen, kameran följer, stannar i tvåbild vid PORT 3 med Dariusz, pekar på en säkring på trailern, Dariusz rättar till, båda nickar; en bil passerar bakom | Steg, passerande bil, ett pip; pulsen tystnar 57 s |
| 14 "He's fine now." | 0:57–1:00 | Samma inramning som scen 1, muggen når fram, han dricker (ögonen slutna), kort rynkning (kallt), halvt leende, klocka 07:04; ton till slutkort: wordmark, "Every site has a Sten. Give yours LUPNUMBER.", Book a demo, lupnumber.com | Slutkortet är komplett från 59,1 s |

**Manustrohet, medvetna avvikelser:**

1. Skylten i bild är `PORT 1–8 →` och portarna heter `PORT n`, som i manusets scen 5, 11 och storyboard (och i hero-filmen). Miljöbeskrivningens "DOCKS 1–8 →" användes inte: siten är svensk (lappen heter SÄKERHETSREGLER) och en engelsk skylt bredvid svenska portnummer hade blivit inkonsekvent.
2. Scen 1: titelkortet bär orden "This is Sten."; undertextrutan visas inte parallellt (manuset: "Undertext samma rad"). Cuen finns i SRT-filen.
3. Scen 8a visar att kön växer vid dess bakände (samma sidovy, kameran längre ner längs vägen), eftersom köns slut ligger utanför bild från scen 2:s position.
4. Scen 10: den läsbara telefonen är Dariusz genom alla steg; hytt två och tre visar små bekräftelser när kameran glider förbi. Manusets "varje telefon fyller halva bilden" hade krävt tre fulla UI-sekvenser på sex sekunder.
5. Scen 14: slutkortet står helt i ≈0,9 s plus spelarens slutruta, eftersom manusets tre sekunder också rymmer närbilden och repliken. Vill ni ha två sekunders slutkort: sätt `fine` till 5 s i filmens JSON (filmen blir 62 s).
6. Karaktärerna använder färger utanför den låsta paletten (varselgult, röd och orange väst, blå skjorta, hudtoner). Manuset kräver dem (röd väst, varselväst). All grafik, UI och text håller paletten.
7. Repliker i ljudet (chaufförernas tre språk, "Hallo? Hallo?", "Tak… tak.", "Sten? Sten?", "Sten, ten more at the gate.") går inte att syntetisera här; de står i manuset för inspelningen. Ringsignaler, radiosprak, trucktuta, steg och backningspip finns i mixen.
8. Personernas skala mot lastbilarna är stiliserad (som bodens och bommens i hero-filmen), inte verklig.

**Ljud (prototyp).** Musik: tystnad 0–11 s, vals som växer från −27 till −16 dB 11–35 s och klipps mitt i takten vid 35,0 s, hård tystnad till 37,6 s (allt nollat, även efterklang), låg puls 37,6–57 s, tystnad till slut med ett ensamt backningspip och ett kort ljudmärke på wordmarken. Mätt på `audio/mix.m4a` efter loudnorm: integrerad ljudstyrka −15,7 LUFS, toppnivå −1,1 dBFS, LRA 5,0 LU. Nivåer per akt (RMS dBFS, medel per sekund): akt 1 −30, akt 2 (vals + telefoner) −22, frysbilden 35,0–37,6 s digital tystnad (−180 dBFS), akt 4 (puls + bekräftelsetoner) −21, slutet −34. Inga effekter sticker ut över frysningen; sista ringsignalerna slutar 34,95 s. Ingen röst: speakerraderna ligger tidkodade i `MANUS.md` och mixen har plats för dem (ingen musik under de första elva sekunderna, valsen under speakerns nivå).

**Undertexter.** 27 cuer, engelska, max 7 ord per rad, 31 px fet i vit ruta över LinkedIns kontroller; raderna följer speakerns pauser (0,4–1,0 s mellan replikerna).

**Visningstest.** Alla scener granskade som bildrutor i helbild och nedskalade till 390 px (mobilflöde): ansiktet, titelkortet, stämplarna, bubblorna, lappens rubrik, klockan, telefonens rubriker (Check-in, Polski, Zameldowanie kierowcy, Rampa 3) och slutkortet läses; kalkylarkets celler, live-skärmens logg och lappens sju punkter är textur på mobil och bär inget primärbudskap (rubrikerna gör det). Inga element klipps vid 72 px-marginalen.

**Röd granskning, de största riskerna:**

1. Speakern avgör allt. Utan den brittiskt lugna rösten är filmen bilder med undertexter; tajmingen i JSON är lagd för 2,4 ord/s.
2. Chaufförernas repliker (polska, rumänska, litauiska) och lappens svenska måste korrekturläsas av modersmålstalare innan publicering; polskan i telefonen är densamma som i hero-filmen (standardfraser, inte granskade).
3. "Twenty-six real ones" måste stämma vid publicering, annars byt raden.
4. Slutkortets korta hålltid (punkt 5 ovan).
5. Karaktärerna är nya för varumärket: besluta om Sten ska bli återkommande (serien i manusets del F) innan filmen publiceras.
6. Musiken är syntetisk temp; valsen måste bli riktig musik för att skämtet (artig musik mot kaos) ska landa.
7. Flip-klockans "07:01" läses på mobil, men den oskarpa klockan i scen 1 och 14 är stämning, inte information.
8. Scen 5 är filmens bästa poäng och helt tyst: om plattformen autoplayar utan ljud fungerar den, men den kräver att tittaren stannat i 16 s.

**Blockerare och manuellt arbete:** spela in speaker (EN) efter `MANUS.md` och mixa med `--vo-sv` (flaggan tar vilken röstfil som helst); licensiera musik; modersmålskontroll; beslut om 60 eller 62 s.

## Verifierade filer

Mätt med ffprobe (count_frames) 2026-10-10 17:06. ✓ = 1080×1350, 30 fps och frames = längd × 30.

| Fil | Upplösning | fps | Frames | Längd (s) | Ljud | Storlek | OK |
| --- | --- | --- | --- | --- | --- | --- | --- |
| hero-this-is-sten/this-is-sten.mp4 | 1080×1350 | 30 | 1800 | 60.0 | aac 48000 Hz | 10.9 MB | ✓ |
| hero-this-is-sten/this-is-sten-tyst.mp4 | 1080×1350 | 30 | 1800 | 60.0 | – | 9.8 MB | ✓ |
| hero-lupnumber-site-day/lupnumber-site-day.mp4 | 1080×1350 | 30 | 1800 | 60.0 | aac 48000 Hz | 8.8 MB | ✓ |
| hero-lupnumber-site-day/lupnumber-site-day-tyst.mp4 | 1080×1350 | 30 | 1800 | 60.0 | – | 7.6 MB | ✓ |
| hero-lupnumber-linkedin-25/lupnumber-linkedin-25.mp4 | 1080×1350 | 30 | 750 | 25.0 | aac 48000 Hz | 3.5 MB | ✓ |
| hero-lupnumber-linkedin-25/lupnumber-linkedin-25-tyst.mp4 | 1080×1350 | 30 | 750 | 25.0 | – | 3.0 MB | ✓ |
| 01-koer-vid-grinden/01-koer-vid-grinden-hook-b.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.5 MB | ✓ |
| 01-koer-vid-grinden/01-koer-vid-grinden.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.5 MB | ✓ |
| 02-vem-ar-pa-siten/02-vem-ar-pa-siten-hook-b.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.1 MB | ✓ |
| 02-vem-ar-pa-siten/02-vem-ar-pa-siten.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.1 MB | ✓ |
| 03-sprakforbistring/03-sprakforbistring-hook-b.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.1 MB | ✓ |
| 03-sprakforbistring/03-sprakforbistring.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.1 MB | ✓ |
| 04-sakerhetsgenomgang/04-sakerhetsgenomgang-hook-b.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.2 MB | ✓ |
| 04-sakerhetsgenomgang/04-sakerhetsgenomgang.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.2 MB | ✓ |
| 05-fel-port/05-fel-port-hook-b.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.0 MB | ✓ |
| 05-fel-port/05-fel-port.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.0 MB | ✓ |
| 06-parmar-och-papper/06-parmar-och-papper-hook-b.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.1 MB | ✓ |
| 06-parmar-och-papper/06-parmar-och-papper.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.1 MB | ✓ |
| 07-ingen-vet-nar-bilen-kommer/07-ingen-vet-nar-bilen-kommer-hook-b.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.3 MB | ✓ |
| 07-ingen-vet-nar-bilen-kommer/07-ingen-vet-nar-bilen-kommer.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.3 MB | ✓ |
| 08-telefonen-i-vakten/08-telefonen-i-vakten-hook-b.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.2 MB | ✓ |
| 08-telefonen-i-vakten/08-telefonen-i-vakten.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.2 MB | ✓ |
| 09-larmet-gar/09-larmet-gar-hook-b.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.0 MB | ✓ |
| 09-larmet-gar/09-larmet-gar.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.0 MB | ✓ |
| 10-vad-kostar-kon/10-vad-kostar-kon-hook-b.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.0 MB | ✓ |
| 10-vad-kostar-kon/10-vad-kostar-kon.mp4 | 1080×1350 | 30 | 525 | 17.5 | – | 2.0 MB | ✓ |
| film-en-dag-pa-siten/en-dag-pa-siten.mp4 | 1080×1350 | 30 | 1485 | 49.5 | – | 5.2 MB | ✓ |
