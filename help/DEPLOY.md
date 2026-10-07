# Publicera LUP Hjälp på Vercel

Tar ungefär 15 minuter. Allt görs i webbläsaren, ingen kod behövs.

## 0. Innan du börjar

Koden måste ligga på grenen `main` i GitHub (slå ihop pull requesten för LUP Hjälp). Vercel publicerar `main`.

## 1. Skapa projektet

1. Logga in på [vercel.com](https://vercel.com) (logga in med GitHub).
2. **Add New… → Project** och välj repot **wictor-tech/kungbern** → **Import**.
3. Under **Root Directory**: klicka **Edit** och välj mappen **`help`**. (Viktigt – annars bygger Vercel fel projekt.)
4. Framework Preset ska stå på **Next.js**. Ändra inget annat än det.
5. Öppna **Environment Variables** och lägg till:

   | Name | Value |
   |---|---|
   | `ADMIN_PASSWORD` | ett långt lösenord för adminläget |
   | `SESSION_SECRET` | en lång slumpsträng (minst 32 tecken) |
   | `HELP_ALLOWED_ORIGINS` | `https://app.lupnumber.com` |

6. Klicka **Deploy**. Bygget går igenom, men sidan visar ett fel tills databasen är kopplad i nästa steg.

## 2. Koppla databas och bildlagring

1. I projektet: **Storage → Create Database → Neon (Postgres)** → välj region **Frankfurt (eu-central-1)** → Create → **Connect** till projektet.
   Det lägger till `DATABASE_URL` automatiskt.
2. **Storage → Create → Blob** → Connect till projektet. Det lägger till `BLOB_READ_WRITE_TOKEN` (för bilder du laddar upp i admin).
3. **Deployments → ⋯ på senaste → Redeploy.** Nu startar appen och de 40 guiderna läses in automatiskt första gången.

## 3. Slå på AI (rekommenderas)

1. Skapa ett konto på [console.anthropic.com](https://console.anthropic.com) med företagets e-post.
2. **Settings → Billing**: lägg in kort och köp t.ex. 10 USD i krediter. Sätt gärna en månadsgräns under **Limits**.
3. **Settings → API Keys → Create Key**, döp den till `lup-hjalp`, kopiera nyckeln.
4. I Vercel: **Settings → Environment Variables** → `ANTHROPIC_API_KEY` = nyckeln → Save → Redeploy.

Kostnad: under 0,01 kr per fråga med Claude Haiku. 10 000 frågor i månaden ≈ 30–50 kr.
Utan nyckel fungerar hjälpen ändå, men utan AI:ns hjälp med ovanliga formuleringar.

## 4. Koppla Zendesk

1. I Zendesk: **Admin Center → Apps and integrations → APIs → Zendesk API** → slå på **Token access** → **Add API token**, döp den till `lup-hjalp`, kopiera token.
2. I Vercel, lägg till:

   | Name | Value |
   |---|---|
   | `ZENDESK_SUBDOMAIN` | delen före `.zendesk.com`, t.ex. `lup` |
   | `ZENDESK_EMAIL` | e-posten för en agent i Zendesk |
   | `ZENDESK_API_TOKEN` | token från steg 1 |

3. Redeploy. Ärenden från hjälpen får taggen `lup_hjalp` och innehåller frågan, guiden, sidan och stegen.

## 5. Egen adress (valfritt)

**Settings → Domains → Add** `hjalp.lupnumber.com` och lägg in DNS-posten som Vercel visar hos er domänleverantör.

## 6. Kontrollera

- `https://<adress>/` – ställ en fråga.
- `https://<adress>/admin` – logga in med `ADMIN_PASSWORD`.
- `https://<adress>/widget-demo.html` – prova "?"-knappen.
- Skapa ett testärende och se att det dyker upp i Zendesk.

## Bra att veta

- Vercel bygger om automatiskt vid varje ändring i GitHub. Produktion följer grenen `main`.
- Servern körs i Frankfurt (`vercel.json`), nära användarna och inom EU.
- Uppladdningar via admin är begränsade till ca 4 MB per fil på Vercel. Längre videor: ladda upp till t.ex. YouTube
  (olistad) eller Vimeo och be utvecklare koppla in länken, tills uppladdning direkt till Blob är byggd.
- Lägg aldrig nycklar i koden eller i chatten – bara under Environment Variables i Vercel.
