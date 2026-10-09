# Starta VERAPEP v9 lokalt

## 1. Packa upp i en ny mapp

Exempel:

```text
C:\verapep\ver9\verapep-webshop-test
```

Använd en ny mapp så att gamla JavaScript- och CSS-filer inte blandas med v9.

## 2. Öppna PowerShell i projektmappen

```powershell
cd C:\verapep\ver9\verapep-webshop-test
```

## 3. Installera och starta

```powershell
npm install
node server.mjs
```

Låt PowerShell-fönstret vara öppet.

Öppna:

- Startsida: `http://localhost:3000`
- Admin: `http://localhost:3000/admin.html`
- Checkout: `http://localhost:3000/checkout.html`
- Ask Vera: `http://localhost:3000/support.html`

Lokal ägarinloggning:

- E-post: `admin@verapep.local`
- Lösenord: `ChangeMe-123!`

## Viktigt om databasen

Första starten skapar:

```text
data\verapep.sqlite
```

Därefter är databasen den gemensamma informationskällan för hemsidan och admin.

### Behåll ändringar från din gamla v8.1-mapp

Stoppa båda servrarna och kör detta **innan du börjar redigera v9**:

```powershell
npm run import:v8 -- "C:\verapep\ver8-1\verapep-webshop-test\data"
```

Starta sedan v9 igen:

```powershell
node server.mjs
```

## Produktstatus i admin

Varje produkt har en tydlig status:

- Draft
- Information only
- Available for sale
- Archived

När du väljer **Available for sale** visar readiness-rutan exakt om pris, lager, variant, land eller annan nödvändig butiksinställning saknas.

## Adminroller

- Owner: full åtkomst och hantering av administratörer.
- Admin: butik, produkter, order, returer, recensioner och återbetalningar.
- Editor: produkter, lager, recensioner och guideinnehåll.
- Support: order, returer och recensioner.

Ändringar registreras under **Audit log**.

## Testa

```powershell
npm test
npm run test:static
npm run audit:images
```

V9 använder fortfarande lokal/mock-checkout som standard. Riktig betalning, e-postleverans och produktionsdrift kräver externa leverantörskonton.
