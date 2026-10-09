# VERAPEP v19 – Information och dokument som behövs från ägaren

Detta kan inte tas fram av en utvecklare eller av ett AI-verktyg. Allt nedan måste komma från dig, din leverantör, ditt laboratorium eller din jurist. Översikten i admin ("Overview") visar hela tiden hur mycket som återstår.

## A. Per produkt (alla 84)

Läget i den levererade datan: ingen produkt har verifierade underlag eller granskad text.

| Underlag | Varifrån | Var det läggs in | Behövs för |
| --- | --- | --- | --- |
| Certifikat/analysintyg (COA) per batch: produktnamn, batch, laboratorium, datum, metod, renhet | Laboratorium eller leverantör | Products → Documents → "Lab report" | Checklistpunkten "Verified lab report" och eventuell publicerad labbrapport |
| Leverantörens eller tillverkarens produktblad | Leverantör | Documents → "Supplier document" | Innehåll/sammansättning, förvaring och produkttext |
| Exakt sammansättning (salt, form, mängd per flaska) | COA/produktblad | Utkast → "Contents / composition" | Produktsidan |
| Förvaringsvillkor | Produktblad | Utkast → "Storage" | Produktsidan |
| Avsett användningsområde **så som det står i dokumenten** | Produktblad, juridisk bedömning | Utkast → "Intended use" | Produktsidan (kräver ofta extern granskning) |
| Varningar och begränsningar | Jurist eller leverantör | Utkast → "Warnings" | Produktsidan |
| Riktiga produktfoton, minst 800 px breda (helst 2000 px eller mer), av den faktiska förpackningen | Fotograf eller du | Documents → "Product image" | Ersätter illustrationen |
| Skriftlig juridisk klassificering av produkten och tillåtna marknader | Jurist eller regulatorisk konsult | Documents → "Legal assessment" + Compliance review | Publicering och försäljning |

**Snabbast:** be leverantören om ett kalkylark med kolumnerna `productId, shortDescription, fullDescription, ingredients, storage, warnings, source`. Importera det under **Products → Import product text**. Varje rad blir ett utkast som granskas.

## B. Företag och villkor

1. Företagets juridiska namn, organisationsnummer och adress (`COMPANY_LEGAL_NAME`, `COMPANY_REGISTRATION_NUMBER` m.fl.).
2. Supportens och dataskyddets e-postadresser.
3. Köpvillkor, integritetspolicy samt leverans- och returvillkor, skrivna eller granskade av jurist. Sätt därefter `LEGAL_TERMS_REVIEW_ACK` och `PRIVACY_REVIEW_ACK`.
4. Fraktpartner, leveranstider och kostnader per land.
5. Beslut om förtroenderaden: den nämner "Lab reports where available" trots att ingen labbrapport är publicerad. Behåll den bara om rapporter publiceras, annars bör texten ändras (redaktionellt beslut).

## C. Bilder

1. Ett högupplöst original av hero-bilden (minst 2400 px brett).
2. Godkännande att ta bort oanvända bildfiler ur releasen:
   - 5 mockupfoton med "Research Use Only" (8,5 MB)
   - 3 oanvända PNG-flaskbaser (3,4 MB)
   - oanvänd hero-video och poster
   - 3 dolda SVG-illustrationer
3. Beslut om de 5 mockupfotona får användas alls. Etiketten "Research Use Only" är ett påstående som behöver juridisk bedömning.

## D. Ask Vera

1. Granska och godkänn de 28 svenska översättningsförslagen under **Guide & Ask Vera → Swedish answers**. Inget visas för besökare innan dess.
2. Bestäm om fler språk behövs. Varje språk kräver granskade översättningar.

## E. Personer och roller

1. Vem som ska vara andra granskare (admin), så att du inte behöver granska din egen text.
2. Vilken jurist eller konsult som gör de externa granskningarna, och hur referenser ska anges (t.ex. memo-nummer).
