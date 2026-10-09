# VERAPEP – lägg upp testversionen på Render

Den här mappen är för en enkel testmiljö som du kan dela med vänner.

## Viktigt
- Använd en **privat GitHub-repository**.
- Render Free somnar efter 15 min utan trafik och vaknar igen när någon öppnar länken.
- SQLite-filen på Render Free är tillfällig. Testordrar/adminändringar kan försvinna vid omstart, spin-down eller ny deploy.
- Sidan är märkt `noindex` och har `robots.txt` som ber sökmotorer att inte indexera testmiljön.
- Ingen riktig Stripe-betalning är aktiverad av denna deploy-konfiguration.

## 1. GitHub
1. Logga in på GitHub.
2. Skapa ett nytt repository, exempelvis `verapep-friends-test`.
3. Välj **Private**.
4. Ladda upp **innehållet i den här mappen** till repositoryts rot. `render.yaml` ska alltså ligga i repositoryts rot.
5. Commit changes.

## 2. Render
1. Logga in på Render.
2. Koppla ditt GitHub-konto när Render ber om det.
3. Skapa en ny **Blueprint** och välj GitHub-repositoryt.
4. Render hittar `render.yaml` automatiskt.
5. När Render ber om miljövariabler:
   - `ADMIN_EMAIL`: välj din admin-e-post.
   - `ADMIN_PASSWORD`: välj ett långt unikt lösenord. Använd INTE standardlösenordet.
6. Godkänn Free-planen och starta deployen.
7. När status blir Live får du en URL som liknar `https://verapep-friends-test.onrender.com`.

## Kontroll efter deploy
Öppna:
- `/` – startsidan
- `/api/health` – ska visa `"ok": true`
- `/admin.html` – admin, med uppgifterna du satte i Render

## När du skickar länken
Första besökaren efter mer än cirka 15 minuters inaktivitet kan få vänta ungefär en minut medan gratisinstansen startar.
