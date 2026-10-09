# VERAPEP v17 – översikt

Bygger på v16 (gren `claude/verapep-v16`, commit `7958b6c`). Målet var en stabilare, ärligare och säkrare webbplats, inte fler funktioner. **Webbplatsen är inte godkänd för lansering.** Se `V17-LAUNCH-READINESS.md`.

## Rapporter

| Dokument | Innehåll |
| --- | --- |
| `V17-LAUNCH-READINESS.md` | Status och blockerare, uppdelat på tekniskt färdigt, företagsinformation, juridisk granskning, externa dokument och beslut |
| `docs/v17/PRODUCT-COMPLIANCE-INVENTORY.md` / `.csv` | Inventering av alla 84 produkter (genereras med `npm run inventory:compliance`) |
| `V17-ASK-VERA.md` | Granskning av Vera i v16, ny svarsmotor, migrering av kunskapsbasen |
| `V17-SECURITY-REPORT.md` | Säkerhetsfynd och åtgärder, personuppgifter, återställningsövning |
| `V17-USER-TESTING-REPORT.md` | Simulerade personatester (inte verkliga användare) |
| `docs/v17-before-after/*.jpg` | Före/efter-bilder för de synliga ändringarna |

## 1. Verifiering av utgångsläget (v16)

| Kontroll | Resultat |
| --- | --- |
| Gren och historik | `claude/verapep-v16` är oförändrad sedan v16-leveransen; draft-PR `wictor-tech/kungbern#1` är öppen och inte sammanslagen |
| Enhetstester | 40/40 |
| E2E | 12/12 |
| 84 produktsidor | Alla svarade 200 (täcks av E2E `product_details`) |
| Köpbegränsningar | 0 produkter beställningsbara; `/api/ready` gav 503 |
| Backup | `npm run backup:sqlite` fungerade, `integrity_check` gav ok |
| Juridiska sidor | Visar "Pending legal review" |
| Ask Vera | Granskad i detalj, se `V17-ASK-VERA.md` |

Arbetsgren: `claude/verapep-v17`, skapad från v16. Återställningspunkter: v16 `7958b6c`, v15 `f7b9b10`, v14.1 `25b3c42`.

## 2. Viktigaste ändringarna

1. **Granskningsflöde och publiceringsfilter för produkter** (`lib/compliance.mjs`).
   - Statusarna är *Not reviewed*, *Needs evidence*, *In legal review*, *Approved for specific publication* och *Do not publish*.
   - AI-indikatorn föreslår bara en status. Godkännande görs av ägaren och kräver referens, granskare, omfattning, marknader och en bekräftelse.
   - 44 högriskprodukter är dolda överallt. I produktion visas ingenting som inte är godkänt.
   - Ingen försäljning, inte ens i sandbox, utan godkännande med omfattningen *sale*.
   - Det går inte att kringgå filtret genom att byta namn eller lägga till alias.
2. **Ask Vera**.
   - Säkerhetsspärr mot medicinska frågor och doseringsfrågor. I v16 hänvisades en doseringsfråga till ett viktfilter.
   - Förstår svenska, ger produktfakta utan att hitta på något, och har ett ärligt reservsvar.
   - Frågor lagras inte. Rate limiting, samt laddnings- och feltillstånd i gränssnittet.
3. **Versionsstyrd migrering av kunskapsbasen.**
   - Gör dry-run, backup, apply och rollback.
   - Är idempotent och bevarar admins egna texter.
   - Löser v16-problemet att gamla databaser behöll gamla svar.
4. **Säkerhet.**
   - Serverns källkod och interna dokument kunde laddas ner, och hela katalogen med priser låg i en statisk fil. Båda är stängda.
   - Lösenordshashar läckte i adminsvar och granskningslogg. Åtgärdat.
   - Rate limiting fungerade inte bakom proxy, och det fanns rättighetsutökningar via sidoeffekter. Åtgärdat.
   - Länkar valideras. Ett återställningsskript och en automatiserad återställningsövning har lagts till.
5. **Administration.**
   - Ny vy för systemstatus: lanseringsblockerare, publiceringsläge, status för kunskapsbasen och senaste serverfel.
   - Ny vy för compliance-granskning med filter, detaljvy, historik och skyddade massändringar.
   - Strukturerad redigerare för kunskapsbasen som bevarar id:n.
6. **Användbarhet** (upptäckt i personatester):
   - synlig kontaktsektion
   - mobilsökning från menyn rättad (resultaten doldes bakom menyn)
   - katalogens laddnings- och feltillstånd
   - siffror visar vad som faktiskt listas

## 3. Testresultat (slutkörning)

| Svit | v16 | v17 |
| --- | --- | --- |
| `npm test` (node:test, tester + deltester) | 40 | **73/73** |
| `npm run test:static` | godkänd | godkänd |
| `npm run build:css -- --check` | aktuell | aktuell |
| `npm run test:e2e` | 12/12 | **16/16**, varav 4 nya: publiceringsfilter, Vera, mobilsökning, compliance-admin |
| axe WCAG 2.2 A/AA (serious/critical), 11 sidor × 2 bredder | 0 | 0, efter att ett nytt fel i kontaktsektionen hittades och rättades |
| Simulerade personor (samma testprogram) | 12/16 | **16/16** |

**Befintliga tester som ändrats, med motivering:**
- `api`, `v9`, `v11` och `v14` förväntar sig nu 40 listade produkter i stället för 84, och registrerar ett ägargodkännande innan de testar försäljning. Det är en följd av det nya kravet att inget får säljas utan godkännande, inte en uppmjukning.
- Versionsnumret i hälsokontrollen är 17.0.0.
- I E2E används nu konstanten `VISIBLE_PRODUCTS`.

## 4. Prestanda

Ingen prestandaoptimering var planerad. De mätbara effekterna:

| | v16 | v17 |
| --- | --- | --- |
| `assets/catalogue-data.js` på startsidan | 27,3 KB (4,6 KB gzip) | 1,0 KB |
| `/api/storefront` (brotli) | 9,4 KB | 5,8 KB (färre publika produkter) |
| `bundle-storefront.css` (gzip) | 60,6 KB | 62,3 KB (+1,7 KB för v17-lagret) |

## 5. Vad som inte gjorts (och varför)

- **Ingen produkt har godkänts, publicerats eller låsts upp.** Det kräver juridiska beslut.
- **Inga juridiska texter, produktbeskrivningar, labbrapporter eller företagsuppgifter har skrivits.** De måste komma från ägaren eller från externa källor.
- **Produktionsdatabasen har inte ändrats.** Kunskapsmigreringen och rensningen av granskningsloggen väntar på godkännande.
- **Etiketten "Research Use Only" och produktfinderns hälsogrupper finns kvar.** Båda är flaggade för juridiskt beslut.
- **Ingen CI har lagts till.** Repot saknar CI-infrastruktur (ingen `.github/workflows`). Rekommendation: kör `npm test` och `npm run test:static` på varje PR, och E2E nattligen.
- **Ingenting har driftsatts eller slagits samman.**
