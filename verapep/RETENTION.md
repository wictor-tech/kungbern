# Lagringstider, gallring och dataminimering (v18)

**Status: FÖRSLAG. Inte juridiskt godkänt.** Ingen produktionsdata har rensats.

## Föreslagna lagringstider (`data/retention-policy.json`)

| Data | Var | Förslag | Motivering / beroende |
| --- | --- | --- | --- |
| Betalda och återbetalda order | SQLite `orders` | 7 år, sedan manuellt beslut | Räkenskapsinformation; i Sverige normalt 7 år enligt bokföringslagen. **Bekräfta med revisor eller jurist.** Raderas aldrig automatiskt av verktyget. |
| Obetalda, avbrutna order | SQLite `orders` | 365 dagar | Utgör inte räkenskapsinformation om ingen betalning skett. Verktyget rapporterar dem för manuellt beslut. |
| Utgående e-post | `DATA_DIR/outbox/*.json` | 90 dagar | Bara för felsökning av leverans. |
| Säkerhetskopior | `DATA_DIR/backups/` | 30 dagar | Innehåller allt; gamla kopior förlänger annars lagringen av raderad data. |
| Avvisade eller dolda recensioner | SQLite `reviews` | 90 dagar efter moderering | Kan innehålla hälsorelaterad fritext. |
| Kunduppgifter i granskningsloggens ordersnapshots | SQLite `audit_log` | 2 år, därefter pseudonymiseras de | Spårbarhet behövs; identitet behövs inte efter 2 år. |
| Lösenordshashar och MFA-frön i gamla loggrader | SQLite `audit_log` | Tas bort | Ska aldrig ha lagrats (v14–v16). Använd `scripts/scrub-audit-log.mjs`. |
| Ask Vera-frågor | — | Lagras inte | Endast anonyma räknare i minnet. |
| Driftloggar hos hostingleverantören | Render/Vercel | 30 dagar | Ställs in hos leverantören. |

## Verktyg

```bash
node scripts/retention.mjs [--data-dir DIR]           # rapport, ändrar inget
node scripts/retention.mjs --apply --yes              # vägras tills policyn är godkänd
node scripts/scrub-audit-log.mjs                      # dry-run: rader med hemligheter, utan värden
node scripts/scrub-audit-log.mjs --apply --yes        # backup + ångrafil, maskering, efterkontroll
node scripts/scrub-audit-log.mjs --restore <fil> --yes
```

`retention.mjs --apply` gör följande, och bara när `approved: true`, `approvedBy` och `approvedAt` är satta i policyn:
1. tar en SQLite-kopia
2. raderar utgående e-post och säkerhetskopior som passerat sin tid
3. tar bort avvisade recensioner som passerat sin tid
4. pseudonymiserar kunduppgifter i gamla loggrader (kunden ersätts med en hash-pseudonym och adressen med bara landet)
5. loggar åtgärden

## Dataminimering som redan gäller

- Vera lagrar inga frågor och varnar när en fråga innehåller kontaktuppgifter.
- Recensioner får inte innehålla e-postadresser eller telefonnummer.
- E-post skickas aldrig i URL:er (v18).
- Sparade produkter, jämförelser och guideval stannar i webbläsaren.

## Beslut som behövs

1. Lagringstid per kategori, godkänd av personuppgiftsansvarig efter juridisk bedömning.
2. Om obetalda order ska raderas automatiskt eller manuellt.
3. När rensningen av gamla loggrader ska köras i produktion.
