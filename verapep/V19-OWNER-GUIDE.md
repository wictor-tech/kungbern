# VERAPEP v19 – Ägarguide

En enkel steg-för-steg-guide till administrationen. Du behöver inga tekniska kunskaper.

> **Viktigt att veta först**
> - Inget i administrationen kan publicera en produkt eller öppna försäljning av misstag. Det kräver alltid ett separat juridiskt beslut per produkt under **Compliance review**, med namn på granskaren och en referens.
> - Att en produkttext är "klar" eller "godkänd" betyder bara att *texten* är granskad. Det betyder inte att produkten är juridiskt godkänd.
> - Översikten visar **teknisk status** och **juridisk lanseringsberedskap** var för sig. Det finns medvetet ingen samlad procentsats.

Administrationen är på engelska (som resten av webbplatsen). Nedan står knapparnas namn inom citattecken precis som de ser ut.

---

## 1. Logga in

1. Gå till `/admin.html` på webbplatsen.
2. Skriv e-post och lösenord. Om du har slagit på tvåstegsverifiering: skriv koden från din autentiseringsapp.
3. Du hamnar på **"Overview"** (översikten).

**Gör detta en gång:** gå till fliken **"Security"** och välj **"Set up authenticator"**. Översikten påminner dig tills det är gjort.

---

## 2. Översikten – vad är klart och vad saknas?

Överst ser du två rutor:

| Ruta | Vad den betyder |
| --- | --- |
| **Technical status** – "7 of 9 checks OK" | Databas, säkerhetskopior, säkerhetsinställningar. Säger ingenting om huruvida du får sälja. |
| **Legal launch readiness** – "Not approved for launch" | Juridiska och dokumentationsmässiga hinder. Bara du kan godkänna en lansering, efter juridisk granskning. |

Under dem:

- **"Do this next"** – de viktigaste nästa stegen i ordning, med vem som behöver göra dem. Tryck **"Open"** för att gå direkt dit.
- **"Product documentation"** – hur många produkter som saknar text, innehåll, förvaring, varningar, verifierad labbrapport eller leverantörsdokument. Knappen **"Show products without a lab report"** visar exakt vilka.
- **"Compliance review"** – hur många produkter som är publika respektive dolda, och vilka som är juridiskt godkända, för vilka marknader och med vilken referens.
- **"Content quality"** – sidor som saknar information (t.ex. villkor och företagsuppgifter) och bilder som behöver bytas.
- **"System health"** – databasens skick, senaste säkerhetskopia, serverfel och vilken version som körs.
- **"All launch blockers"** längst ned – hela listan, grupperad efter vem som kan lösa varje punkt.

---

## 3. Hitta produkter som saknar något

1. Välj fliken **"Products"**.
2. Använd filtren överst:
   - **"Missing"** – t.ex. "Verified lab report" visar alla produkter utan verifierad labbrapport.
   - **"Review status"** – den juridiska statusen.
   - **"Public"** – synliga eller dolda produkter.
   - **"Work in progress"** – produkter med öppna utkast, som behöver granskas igen, eller som ändrats utan granskning.
3. Under filtren står hur många produkter som visas, t.ex. "44 of 84 products shown".
4. Varje produkt i listan visar en stapel: **"Content 2/6 · Legal 0/2"**. Innehåll och juridik räknas separat.

---

## 4. Göra klart en produkt (steg för steg)

Tryck på produkten i listan. Till höger (på mobil: nedanför) öppnas produktens arbetsyta med fyra delar: **Checklist**, **Text & drafts**, **Documents**, **History**.

Överst står **"Next step"** – det enda du behöver göra härnäst.

### 4a. Ladda upp underlag

1. Gå till **"Documents"** → **"Upload a document"**.
2. Välj vad det är under **"What is it?"**: labbrapport, leverantörsdokument, juridisk bedömning, produktbild eller annat.
3. Ge den en tydlig titel, t.ex. *"COA batch 2406-A, Lab X, 2026-03-01"*.
4. Välj filen (PDF, PNG, JPEG eller WebP, högst 15 MB) och tryck **"Upload"**.

Dokument är **alltid privata**. Kunder ser dem aldrig. De sparas utanför webbplatsens publika filer och kan bara hämtas av inloggade administratörer.

### 4b. Kontrollera och verifiera underlaget

1. Tryck **"Download"** och läs dokumentet.
2. Kontrollera att produktnamn, batch, laboratorium och datum stämmer.
3. Tryck **"Mark verified"** och skriv kort vad du kontrollerade, t.ex. *"Batch och labb stämmer med etiketten; signerat COA"*.

Om dokumentet är fel: tryck **"Reject"** och skriv varför.

**Ny version av ett dokument?** Tryck **"Replace"** vid det gamla och ladda upp det nya. Det gamla sparas och kopplas till det nya. Alla godkända texter som byggde på det gamla dokumentet markeras automatiskt **"Needs review again"**.

### 4c. Skriv produkttexten i ett utkast

1. Gå till **"Text & drafts"** och tryck **"New draft"**.
2. Fyll bara i de fält du vill ändra. Under varje fält står vad som får stå där.
3. Välj för varje fält **var texten kommer ifrån** (ett uppladdat dokument, leverantörsinformation eller "Written by me").
4. Skriv en kort kommentar till granskaren.
5. Tryck **"Save draft"** om du vill fortsätta senare, eller **"Save and submit for review"**.

**Skriv bara fakta från verifierade dokument.** Inga effekter, ingen dosering, inga hälsopåståenden. Om texten ändå innehåller sådana formuleringar (t.ex. "heals", "clinically proven") varnar systemet och kräver en **extern granskning** (jurist) innan texten kan användas.

### 4d. Granska och godkänn texten

Se avsnitt 5.

### 4e. Gör texten synlig på produktsidan

När ett utkast är godkänt visas knappen **"Make this text live"**. Du får en bekräftelsefråga. Den tidigare texten sparas som en version under **History**.

Det här ändrar **bara texten**. En dold produkt förblir dold, och den juridiska statusen ändras inte.

### 4f. Produktfoto

1. Ladda upp fotot under **Documents** med typen "Product image". Bilden förminskas automatiskt i din webbläsare till högst 2400 pixlar och sparas som WebP. Om den är smalare än 800 pixlar får du en varning.
2. Kontrollera att det är ett foto av den verkliga produkten. Tryck sedan **"Mark verified"**.
3. Tryck **"Use as product photo"** och beskriv bilden kort för skärmläsare. Ett utkast skapas och skickas till granskning.
4. När det är godkänt trycker du **"Make this text live"**. Fotot visas bara om produkten är publik.

---

## 5. Granska en ändring

1. Välj fliken **"Changes to review"**. En siffra på fliken visar hur många som väntar.
2. Tryck **"Open proposal"**. Du ser exakt vad som ändras:
   - Grön, understruken text = läggs till.
   - Röd, överstruken text = tas bort.
3. Kontrollera källorna och eventuella varningar.
4. Välj:
   - **"Approve text"** – texten godkänns redaktionellt för produktsidan.
   - **"Ask for changes"** – skriv vad som behöver ändras. Utkastet går tillbaka till författaren.
5. Om texten innehåller påståenden kommer den efter ditt godkännande till steget **"External review"**. När juristen har svarat trycker du **"Record external review"** och anger namn, referens (t.ex. memo-nummer) och beslut.

**Granska helst inte din egen text.** Om du ändå måste (t.ex. för att du är ensam) frågar systemet en extra gång, och granskningen sparas som en egen granskning.

Det finns ingen funktion för att godkänna flera ändringar samtidigt. Det är medvetet: varje beslut fattas för sig.

---

## 6. Importera många texter på en gång

Använd detta när en leverantör skickar ett kalkylark med produktinformation.

1. **"Products"** → **"Import product text"**.
2. Välj en CSV- eller JSON-fil, eller klistra in innehållet. Första kolumnen ska heta `productId`. Andra tillåtna kolumner: `shortDescription`, `fullDescription`, `ingredients`, `storage`, `usage`, `warnings`, `displayName`, `imageAlt`, `source`.
3. Tryck **"Check and preview"**. Du ser varje rad, vad som ändras och eventuella fel (okänd produkt, otillåten kod, platshållartext). Kolumner som försöker publicera eller sälja ignoreras.
4. Tryck **"Create N draft(s)"** och bekräfta antalet.

Varje rad blir ett **utkast**. Ingenting blir synligt och ingenting godkänns. Utkasten granskas sedan som vanligt (avsnitt 5).

---

## 7. Juridiskt beslut för en produkt

Detta görs bara när en kvalificerad granskare (jurist eller regulatorisk expert) har bedömt produkten skriftligt.

1. Fliken **"Compliance review"** → tryck på produkten.
2. Välj status, scope (information eller försäljning) och marknader. Ange granskarens namn och referensen till det skriftliga beslutet.
3. Bekräfta med den obligatoriska bekräftelsefrasen.

Om produkttexten ändras efter ett godkännande markeras produkten **"Changed since approval"** i översikten, så att du kan låta granskaren titta igen.

---

## 8. Ask Vera på svenska

Vera svarar på svenska frågor på svenska, men **bara** med svar du har godkänt.

1. Fliken **"Guide & Ask Vera"** → **"Swedish answers (translations)"**.
2. Öppna ett svar. Jämför engelskan med den svenska texten. Rätta vid behov och tryck **"Save as proposal"**.
3. Tryck **"Approve translation"** när den svenska texten säger exakt samma sak som den engelska.

Översättningarna som följer med v19 är **förslag** och visas inte för besökare förrän du har godkänt dem. Om det engelska svaret ändras senare används inte den gamla översättningen, utan den markeras **"English changed — update needed"**.

---

## 9. På mobilen

Administrationen fungerar på telefon. Flikarna ligger direkt under sidhuvudet och följer med när du scrollar. Svep i flikraden för att se fler flikar.

---

## 10. Om något går fel

- **"Your session has ended"** – logga in igen.
- **"This page is out of date"** – ladda om sidan.
- **Felmeddelande när du sparar** – inget har ändrats. Meddelandet förklarar vad som saknas.
- **Allt du gör loggas** under **"Audit log"** och under produktens **History**. Där syns vem som gjorde vad och när.

## Vad du inte kan göra här (med avsikt)

- Publicera eller sälja en produkt utan ett juridiskt beslut.
- Godkänna flera texter eller produkter på en gång.
- Visa privata dokument för kunder.
- Låta systemet hitta på eller fylla i text. Allt måste komma från dina verifierade underlag.
