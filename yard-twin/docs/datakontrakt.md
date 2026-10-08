# Datakontrakt – `visits` v1

Definitionen finns i `src/data/contract.ts`. Det är Yard Twins egen tabell. Varje källsystem mappas hit med en adapter.

| Fält | Typ | Krav | Kommentar |
| --- | --- | --- | --- |
| visitId | string | ja | Pseudonym (saltad hash i källmiljön) |
| tenantId, siteId | string | ja | Pipelinen kastar fel om ett besök tillhör en annan tenant eller sajt |
| siteTimeZone | IANA | ja | t.ex. `Europe/Stockholm` |
| carrierKey | string? | | Pseudonym. Döps om till "Transportör A …" i demo |
| goodsType | string? | | t.ex. torr/kyl/frys |
| pallets | number? | | Används för korrelation med lossningstid |
| bookedAt, cancelledAt, slotStart, slotEnd | ISO UTC? | | |
| arrivedAt | ISO UTC? | **ja för kalibrering** | Första LPR-läsning vid grind (D1) |
| checkedInAt | ISO UTC? | | Reserv för ankomst |
| doorAssignedAt, doorId | | | |
| unloadStart, unloadEnd | ISO UTC? | **ja för kalibrering** | Utan dessa finns ingen lossningsfördelning |
| departedAt | ISO UTC? | | |
| status | completed / no_show / cancelled / in_progress / unknown | ja | |
| manuallyEdited | string[] | | Fält som ändrats manuellt enligt källans auditlogg |

**Tidsregler:** allt lagras i UTC. Lokal servicedag och minuter efter midnatt räknas med `Intl` i sajtens tidszon,
så dygn med sommartidsomställning (23 h eller 25 h) blir rätt.

**Datakvalitet** (`DEFAULT_QUALITY_RULES`). Exkluderas: dubbletter, saknad ankomst eller lossning, lossning under
1 min eller över 8 h, tider i fel ordning, negativa durationer. Flaggas men behålls: sommartidsdygn, misstänkt
manuella tider (exakt :00, :15, :30 eller :45 med sekund 0 på både lossningsstart och lossningsslut) och manuellt ändrade tider.

**Härledda mått:** väntan till dörr = lossningsstart − ankomst. Lossningstid. Grindtid = incheckning − ankomst.
Pappersarbete = utfart − lossningsslut. Tid på gården. Avvikelse mot slot = ankomst − slotstart.

**CSV:** `visitsToCsv` och `visitsFromCsv` använder fältnamnen ovan som kolumnrubriker. `manuallyEdited` separeras med `|`.
