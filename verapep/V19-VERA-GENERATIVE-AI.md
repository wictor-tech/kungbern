# Ask Vera – bedömning av generativ AI (ej införd)

**Status:** Inget har implementerats. Vera är fortfarande deterministisk: hon väljer bland godkända svar och läser publicerade produktfakta. Detta dokument beskriver vad som måste vara på plats *innan* en generativ modell eventuellt införs.

## Möjlig nytta

- Svar på fler formuleringar och språk utan att varje variant skrivs för hand.
- Bättre hjälp att hitta rätt på webbplatsen, t.ex. "var hittar jag…".
- Sammanfattning av *publicerade* produktfakta.

Med 21 godkända svar, synonymer, stavfelstolerans och granskade översättningar täcks redan de vanligaste frågorna. Den extra nyttan är måttlig så länge produktinformationen är tunn. **Rekommendation:** prioritera att få fram verifierat innehåll först.

## Risker

| Risk | Konsekvens |
| --- | --- |
| Modellen hittar på fakta (hallucination), t.ex. renhet, effekter eller lagstatus | Vilseledande marknadsföring och i värsta fall medicinska påståenden om produkter som inte får ha sådana |
| Medicinska frågor och doseringsfrågor besvaras | Direkt i strid med webbplatsens grundregel |
| Besökare skriver personuppgifter eller hälsodata | Frågorna skickas till en tredje part (AI-leverantör), med GDPR-ansvar, personuppgiftsbiträdesavtal och tredjelandsöverföring |
| Prompt injection via produkttext eller frågor | Modellen kan förmås att ignorera sina regler |
| Kostnad och tillgänglighet | Beroende av en extern tjänst |

## Minsta säkerhetsarkitektur om det införs

1. **Säkerhetsfiltret först, utan AI.** Dagens `isSafetyQuestion` och personuppgiftsdetektering körs före modellen. Nekade frågor når aldrig modellen.
2. **Endast hämtning från godkänt material.** Modellen får bara godkända KB-svar och publicerade produktfält som underlag (retrieval). Den får inte använda allmän kunskap om peptider.
3. **Citat krävs.** Varje svar måste hänvisa till de underlag det bygger på. Svar utan underlag ersätts med dagens ärliga reservsvar.
4. **Efterkontroll.** Svaret kontrolleras med `unsupportedClaims` och säkerhetsmönstren. Vid träff används det fasta svaret i stället.
5. **Ingen lagring.** Frågor sparas inte. Leverantören måste avtalsmässigt avstå från träning och lagring. Personuppgiftsbiträdesavtal och EU-hosting krävs.
6. **Märkning.** Besökaren informeras om att svaret är AI-genererat och kan välja det deterministiska läget.
7. **Avstängningsknapp** i admin och automatisk reserv till deterministiskt läge vid fel.

## Tester som måste finnas innan aktivering

- Alla befintliga Vera-tester (säkerhet, dolda produkter, okända läkemedelsnamn, personuppgifter) passerar oförändrade med AI aktiverad.
- En adversariell testsvit (minst 200 frågor): dosering, effekter, behandling, dolda produkter, prompt injection och påhittade labbresultat. Godkänt först vid 0 otillåtna svar.
- Ett test som visar att varje svar har citat till godkänt underlag.
- Ett test som visar att inga frågor loggas eller lagras.
- Mätning av svarstid, kostnad och reserv vid avbrott.

## Beslut som krävs

Konsekvensbedömning (DPIA), val av leverantör och avtal, samt juridiskt godkännande av märkningen. Fram till dess ska Vera förbli deterministisk.
