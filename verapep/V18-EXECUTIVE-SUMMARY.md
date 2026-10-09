# VERAPEP v18 – sammanfattning för ägaren

## Kort svar

**Webbplatsen är tekniskt redo för nästa granskningssteg, men inte för lansering.** Koden testas nu automatiskt vid varje ändring. Kvarvarande hinder är beslut, juridik och konfiguration, inte programmering. Det mest akuta är att GitHub-repot är publikt.

## 1. Vad som förbättrats

- **Automatisk kontroll av varje ändring (CI).** Den kör alla tester, söker efter läckta lösenord och nycklar i hela historiken, bygger leveranspaketet och provar det i en tom miljö. Om något fallerar blir resultatet rött och versionen räknas inte som godkänd. Kontrollen fann redan första gången ett verkligt fel: två filer saknades i Git sedan v15.
- **Förfalskade avsändaradresser kringgår inte längre spärrarna.** Tidigare kunde någon låtsas komma från en ny adress vid varje försök och på så sätt kringgå gränserna för inloggningsförsök och liknande.
- **E-postadresser hamnar inte längre i webbadresser** vid orderspårning, och därmed inte heller i loggar eller webbläsarhistorik.
- **Dolda produkter syns inte längre i sajtens filer.** Tidigare gick vissa namn och produktbilder att hämta direkt.
- **En publik testmiljö visar bara godkända produkter** som standard.
- **Verktyg för att rensa gamla loggar**, där lösenordshashar kunde ligga kvar, och för lagringstider. Båda provar först utan att ändra något och kan ångras. Inget har körts mot riktiga data.
- **Ask Vera tål stavfel och svenska**, känner igen felstavade produktnamn och nekar fler hälsofrågor. Sajten beskriver nu ärligt att Vera inte är en AI som skriver egna svar.

## 2. Vilka risker som minskat

| Risk | Före | Efter |
| --- | --- | --- |
| Någon kringgår spärrarna mot upprepade försök | Möjligt | Stoppat och testat |
| Personuppgifter i webbadresser | Ja | Nej |
| Dolda produkter syns via sajtens filer | Delvis | Nej, testat |
| Ogranskade produkter syns i en publik testmiljö | Ja (Render) | Nej, efter att v18 driftsatts eller inställningen ändrats |
| Fel upptäcks inte före leverans | Manuellt | Automatiskt i GitHub |
| Ofullständig kod i Git | Ja, oupptäckt | Åtgärdat och kontrolleras |

## 3. Vad som faktiskt testats

- 87 automatiska enhets- och API-tester och 17 webbläsartester, inklusive tillgänglighet. Alla passerar, både lokalt och på GitHubs egna maskiner.
- Sökning efter lösenord, nycklar, databaser och kunddata i **alla 60 versioner av repot**. **Inget aktivt lösenord eller kunddata hittades.**
- Leveranspaketet packades upp i en tom katalog och testades där.
- En jämförelse av v17 och v18 på dator, surfplatta och mobil visade inga försämringar.
- De simulerade "användartesterna" är automatiska skript, inte riktiga människor.

## 4. Vad som fortfarande saknas

- **Repot är publikt.** Hela produktkatalogen, inklusive de 44 dolda produkterna och leverantörspriserna, samt interna rapporter kan läsas av vem som helst på GitHub.
- Juridisk klassificering av alla 84 produkter. Ingen är godkänd.
- Villkor, integritetspolicy, företagsuppgifter, labbrapporter och produkttexter.
- Driftinställningar för en riktig lansering: lagring, lösenord, e-post och betalning.
- Ett annat projekt i samma repo (`lup-hjalp`) har en felkonfiguration som ger röda kontroller på VERAPEP och ger testversioner tillgång till dess produktionsdatabas.

## 5. Vad ägaren behöver göra (i den här ordningen)

1. **Gör GitHub-repot privat**, eller flytta VERAPEP till ett eget privat repo.
2. Sätt `PUBLICATION_GATE=strict` i Render, så att testmiljön inte visar ogranskade produkter.
3. Separera `lup-hjalp` från detta repo, eller begränsa vilka grenar det bygger. Ge dess testversioner en egen databas.
4. Låt en jurist klassificera produkterna. Underlaget finns i `docs/v17/PRODUCT-COMPLIANCE-INVENTORY.csv`.
5. Lämna företagsuppgifter och godkänn lagringstider (`RETENTION.md`).
6. Godkänn att gamla loggar rensas, efter en provkörning på en kopia.
7. Bestäm i vilken ordning PR #1, #2 och #3 ska granskas, och gör CI-kontrollen obligatorisk.

Detaljer finns i `V18-LAUNCH-BLOCKERS.md`.

## 6. Redo för nästa steg?

**Ja, för kodgranskning och juridisk granskning.** Koden är testad, kontrolleras automatiskt och har tydligt dokumenterade gränser.

**Nej, för lansering.** `/api/ready` rapporterar 20 blockerare; ingen av dem har dolts eller kringgåtts, och ingen kan lösas med kod utan beslut från dig, en jurist eller konfiguration i driftmiljön.
