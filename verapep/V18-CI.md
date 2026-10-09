# VERAPEP CI (v18)

Arbetsflödet finns i `.github/workflows/verapep-ci.yml` i repots rot. Det körs vid push till `claude/verapep-**`, vid pull requests som ändrar `verapep/**` och manuellt.

## Jobb

| Jobb | Steg |
| --- | --- |
| **checks** | 1. Kontroll att inga produktionsuppgifter finns i miljön. 2. Beroendekontroll: servern har 0 npm-beroenden, så `npm audit` har inget att granska; ett tillkommet beroende stoppar körningen. 3. `npm test`, alla enhets- och API-tester. 4. `npm run test:static`. 5. `npm run build:css -- --check`. 6. `scripts/secret-scan.mjs --history`, hemlighetsskanning av arbetskatalogen och **hela Git-historiken**. 7. `scripts/verify-release.mjs --zip … --run-tests`: manifestet kontrolleras (storlek och hash per fil, att varje fil är incheckad, att inga förbjudna filer finns), ZIP byggs, packas upp i en tom katalog, kontrolleras igen, hemlighetsskannas, och där körs enhetstester, statisk validering och CSS-kontroll. ZIP-gränsen är 30 MB. 8. ZIP-filen laddas upp som artefakt (7 dagar). |
| **e2e** | Playwright 1.56 och Chromium. `tests/e2e.py` innehåller 17 webbläsarflöden, axe WCAG 2.2 A/AA på 11 sidor × 2 bredder, alla publika produktsidor, publiceringsfiltret, Vera, mobilsökning, orderintegritet och admin. Därefter `tests/personas.py` (simulerade personor, informativt). |
| **release-gate** | Körs alltid. Blir röd om *något* av jobben ovan inte lyckats. Det är den kontrollen som ska göras obligatorisk. |

## Säkerhet i CI

- `permissions: contents: read`. Ingen skrivrätt, inga hemligheter, `persist-credentials: false`.
- Servern körs med `APP_ENV=test` mot temporära kopior av `verapep/data/`. Ingen Stripe-nyckel finns, handeln är i sandbox-läge och 0 produkter kan säljas. CI kan alltså inte genomföra betalningar eller nå någon produktionsdatabas; steget *Guard* avbryter om sådana variabler skulle sättas.
- Inga `pull_request_target`-triggers, så kod från forks får aldrig tillgång till repots behörigheter.

## Verifierade körningar

| Körning | Resultat | Kommentar |
| --- | --- | --- |
| [#1](https://github.com/wictor-tech/kungbern/actions/runs/37910024943) | ❌ failure | **Fann ett verkligt fel:** `data/orders.json` och `data/returns.json` var git-ignorerade, så en ren checkout saknade dem. Det gällde även v15–v17. Grinden blev röd som avsett. |
| [#2](https://github.com/wictor-tech/kungbern/actions/runs/37910138686) | avbruten | Ersatt av #3 (`cancel-in-progress`). Fann dessutom att seed-testet krävde Git inuti det uppackade paketet. |
| [#3](https://github.com/wictor-tech/kungbern/actions/runs/37910279559) | ✅ checks och e2e gröna | Första helt gröna körningen. |

Senare körningar syns i PR:ens checks.

## Rekommenderade inställningar (ägaren)

- Branch protection på VERAPEP:s huvudgren med obligatorisk kontroll `VERAPEP CI / Release gate`.
- GitHub Secret Scanning med Push Protection, och Dependabot för GitHub Actions.
- Lås actions till commit-SHA när repot blir privat. Taggarna `@v4`/`@v5` används i dag, och GitHub varnar för Node 20-utfasningen i dessa versioner.

## Köra samma kontroller lokalt

```bash
cd verapep
npm test && npm run test:static && npm run build:css -- --check
node scripts/secret-scan.mjs --history
node scripts/write-manifest.mjs            # efter att filer lagts till
node scripts/verify-release.mjs --zip /tmp/verapep.zip --run-tests
python3 tests/e2e.py
```
