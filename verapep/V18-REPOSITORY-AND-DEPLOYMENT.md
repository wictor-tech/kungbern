# Repository, Vercel och versionsgrenar (v18)

## 1. Den misslyckade Vercel-kontrollen på PR #2

| Kontroll | Resultat |
| --- | --- |
| Projekt | `lup-hjalp` (`prj_E2Ec…`), ramverk **Next.js**, Node 24 |
| Fel | `NOW_SANDBOX_WORKER_ROOTDIR_NOT_EXIST`: *The specified Root Directory "help" does not exist.* |
| Root directory | `help`. Katalogen finns bara på grenen `claude/fervent-goodall-3ka2h5`. |
| Build-, install- och output-kommando | Standard (ingen egen inställning) |
| Produktionsgren | `claude/fervent-goodall-3ka2h5` |
| Git-koppling | Hela repot `wictor-tech/kungbern`. Deployments skapas för alla grenar och PR-kommentarer är på. |
| Ignored build step | Ingen |
| Miljövariabler | 21 st (Neon/Postgres, `SESSION_SECRET`, `ADMIN_PASSWORD`, `HELP_ALLOWED_ORIGINS`). Alla gäller **production + preview**. |
| Fork-skydd | På |

**Slutsats:** Felet beror *inte* på VERAPEP-koden. Ett annat projekt i samma repo försöker bygga varje push, och grenar utan `help/` misslyckas direkt. Felet kommer därför på alla VERAPEP-PR:er, oavsett innehåll. Det blockerar inte VERAPEP, men det gör PR-statusen röd och förvirrande. VERAPEP har ingen egen Vercel-koppling; det är byggt för Render/Node (`render.yaml`, `Dockerfile`).

## 2. Föreslagen isolering (kräver ägarens godkännande, inget är ändrat)

**Rekommendation A (bäst):** ge varje produkt ett eget repo.

1. Skapa ett **privat** repo `verapep`. Flytta `verapep/` dit med historiken: `git subtree split -P verapep` eller `git filter-repo --subdirectory-filter verapep` på en kopia.
2. Flytta på samma sätt LUP Hjälp (`help/`) till ett eget repo och koppla `lup-hjalp` dit.
3. `kungbern` behåller då bara videoprojektet (standardgrenen `claude/create-video-clip-1UsrI`).

**Rekommendation B (minimal, om repot ska delas):**
- I Vercel → `lup-hjalp` → Settings → Git → *Ignored Build Step*, använd t.ex. `[ "$VERCEL_GIT_COMMIT_REF" = "claude/fervent-goodall-3ka2h5" ] || exit 0`, så byggs bara hjälpprojektets gren. Om rotkatalogen saknas kan Vercel avbryta innan kommandot körs; i så fall krävs att preview-deployments stängs av för övriga grenar, eller alternativ A.
- Ta bort *preview* som mål för produktionshemligheterna, och ge preview en egen Neon-gren.
- Byt standardgren till en neutral gren (t.ex. `main`) med en README som beskriver projekten.

## 3. Versionsgrenarna för VERAPEP

Nuvarande kedja (varje PR har föregående gren som bas):

```
claude/fervent-babbage-1a97st  (v14.1 → v15)
   └─ claude/verapep-v16   PR #1  (bas: fervent-babbage)
        └─ claude/verapep-v17   PR #2  (bas: v16)
             └─ claude/verapep-v18   PR #3  (bas: v17)
```

Det finns ingen dedikerad huvudgren för VERAPEP. Standardgrenen i repot hör till ett annat projekt.

**Föreslagen granskningsordning:**
1. Skapa en skyddad gren `verapep-main` från `claude/fervent-babbage-1a97st` (v15). Det kräver ägarbeslut.
2. Byt bas för PR #1 till `verapep-main`, granska och slå samman.
3. GitHub byter då automatiskt bas för PR #2 till `verapep-main`; granska och slå samman. Gör sedan samma sak för PR #3.
4. Alternativt granskas bara PR #3, eftersom den innehåller v16 + v17 + v18. Diffen blir då stor, och historiken i separata PR:er går förlorad i granskningen.
5. Gör `VERAPEP CI / Release gate` till obligatorisk statuskontroll på `verapep-main`.

Ingen gren har slagits samman och ingen bas har ändrats.

## 4. Render-miljön

`render.yaml` beskriver en gratis webbtjänst, `verapep-friends-test`. Sådana tjänster är publikt nåbara. v18 sätter `PUBLICATION_GATE=strict` och `TRUST_PROXY=1` i blueprinten, och servern väljer dessutom strikt läge automatiskt när `RENDER` finns. **Ändringen får effekt först när blueprinten synkas eller grenen driftsätts, och det har inte gjorts.** Om Render-tjänsten redan kör v16 eller v17 visar den ogranskade produkter tills dess. Rekommendation: sätt `PUBLICATION_GATE=strict` direkt i Render-panelen.
