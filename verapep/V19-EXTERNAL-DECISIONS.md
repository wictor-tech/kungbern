# VERAPEP v19 – Externa säkerhets- och juridikbeslut

Dessa beslut kräver ditt uttryckliga godkännande och har **inte** genomförts. Inga inställningar har ändrats i v19. Läget kontrollerades 2026-10-09.

## Säkerhetskritiska (åtgärda först)

| # | Läge | Varför det är kritiskt | Rekommenderad åtgärd | Vem |
| --- | --- | --- | --- | --- |
| 1 | **GitHub-repot `wictor-tech/kungbern` är publikt.** | All kod, historik, data och dokumentation kan läsas av vem som helst. v18-granskningen hittade inga aktiva hemligheter i historiken, men affärsinformation och arkitektur är exponerade. | Gör repot privat (Settings → General → Danger Zone → Change visibility). Det är reversibelt. | Du, som repo-ägare |
| 2 | **Vercel-projektet `lup-hjalp`:** `DATABASE_URL` och `ADMIN_PASSWORD` gäller både *production* och *preview*. Inget "Ignored Build Step" finns. | Varje preview-bygge, t.ex. från en gren, kör mot produktionsdatabasen med produktionslösenordet. | Begränsa båda variablerna till Production. Ge preview en separat databas. Lägg till ett Ignored Build Step så att ändringar utanför `help/` inte bygger. Rotera `ADMIN_PASSWORD` efteråt. | Du, eller den som administrerar Vercel |
| 3 | **Render:** kan inte verifieras härifrån. | Om tjänsten kör äldre kod än v18, eller har `PUBLICATION_GATE=preview`, kan ogranskade produkter visas publikt. | Kontrollera i Render att `PUBLICATION_GATE` inte är satt till `preview`, att `TRUST_PROXY=1` är satt och att `/api/health` svarar med version 18 eller 19. | Du |

## Juridiska beslut (före lansering)

| # | Beslut | Kommentar |
| --- | --- | --- |
| 4 | Juridisk klassificering av alla 84 produkter, per marknad | Ingen produkt har ett godkännande. 44 produkter döljs redan automatiskt (namn som tyder på läkemedel, hormoner eller toxiner). |
| 5 | Köpvillkor, integritetspolicy, leverans/retur och ångerrätt | Måste skrivas eller granskas av jurist. Sidorna säger i dag ärligt att villkoren inte är klara. |
| 6 | Formuleringar på produktsidor ("intended use", varningar) | Text med påståenden kräver extern granskning i det nya flödet. |
| 7 | Etiketten "Research Use Only" på bildmaterial | Ändrar inte produktens rättsliga status och får inte användas som ett sätt att kringgå regler. |
| 8 | Lagringstider (`data/retention-policy.json`, `approved: false`) | Behöver ditt och juristens godkännande innan rensning körs mot riktiga data. |
| 9 | Eventuell generativ AI i Ask Vera | Ska inte införas utan konsekvensbedömning. Se `V19-VERA-GENERATIVE-AI.md`. |

## Drift och sammanslagning

| # | Beslut |
| --- | --- |
| 10 | Granska och eventuellt slå samman PR #3 (v18) och därefter v19-PR:en. Inget har slagits samman. |
| 11 | Driftsättning av v19. Den nya dokumentlagringen kräver en persistent disk för `DATA_DIR/documents/` (samma disk som SQLite) och att den ingår i säkerhetskopieringen. |
| 12 | MFA för alla admin-konton (krävs i produktion). |
