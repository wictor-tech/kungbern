# Lägga till en ny sajt

1. **Kontrollera underlaget.** Kör kvalitetsrapporten (`buildQualityReport` och `qualityReportToMarkdown`) på sajtens besök.
   Det krävs minst 90 dagar och 500 inkluderade besök för betyget Hög. `rankSitesForCalibration` rangordnar flera
   sajter mot varandra.
2. **Exportera** sajtens besök enligt [datakontraktet](datakontrakt.md) till `$YT_RAW_DIR/<tenant>/<site>.csv`.
   Exporten körs i plattformens miljö. Rådata lämnar aldrig den.
3. **Kalibrera:**
   `YT_RAW_DIR=… YT_DATA_DIR=… YT_OPEN=05:00 YT_CLOSE=15:00 npm run recalibrate`.
   Det skriver `$YT_DATA_DIR/<tenant>/<site>.json` med profiler, inspelade dagar och kalibreringsbetyg.
4. **Läs betyget** ([tolkning](kalibreringsbetyg.md)). Om det är Låg eller Otillräckligt: visa inte siffror för kunden. Ta
   reda på orsaken först (datakvalitet, tunt underlag, ett mönster modellen inte fångar).
5. **Ge behörighet** genom att lägga till kundens eller säljarens nyckel i `YT_API_KEYS` med `tenants` och `sites`.
6. **Schemalägg** omkalibrering (t.ex. nattligen). Om indatan är oförändrad används cachen. Driftlarm skrivs till
   `<site>.drift.json` och till stderr.
7. **För en demo till en ny prospekt:** använd *aldrig* en kunds dataset. Bygg i stället ett syntetiskt dataset ur
   k-anonymiserade fördelningar (`toDemoModel`, `assertNoPII`).
