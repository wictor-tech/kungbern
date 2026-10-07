// Startinnehåll byggt på "Användarguide Location Admin" (PN TPL DEMO #46001).
// Skärmbilderna är de annoterade bilderna ur manualen; `n` pekar på numrerad markering i bilden
// så att steget kan zooma till rätt knapp.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Guide, Lang, Step, GuideTranslation, WalkthroughStep } from "../../../shared/types.js";

const here = dirname(fileURLToPath(import.meta.url));
type FocusMap = Record<string, { ratio: number; pins: Record<string, { x: number; y: number; fx: number; fy: number }> }>;
const FOCUS: FocusMap = JSON.parse(readFileSync(join(here, "focus.json"), "utf8"));

type S = [text: string, image?: string, pin?: number];

interface Def {
  id: string;
  category: string;
  title: string;
  summary: string;
  alt: string[];
  steps: S[];
  pages: string[];
  tip?: string;
  warning?: string;
  related?: string[];
  roles?: string[];
  walkthrough?: WalkthroughStep[];
  en?: { title: string; summary: string; steps: string[]; tip?: string; warning?: string; alt?: string[] };
  video?: Guide["video"];
}

function buildSteps(id: string, steps: S[]): Step[] {
  return steps.map(([text, imageIn, pinIn], i) => {
    // "Öppna X i platsmenyn" → visa platsmenyn (sida 3) så att även första steget är visuellt.
    const menuStep = !imageIn && /^Öppna \*\*.+\*\* i platsmenyn/.test(text);
    const image = menuStep ? "p3" : imageIn;
    const pin = menuStep ? 3 : pinIn;
    const step: Step = { id: `${id}-${i + 1}`, text };
    const menuName = menuStep ? text.match(/\*\*(.+?)\*\*/)?.[1] : undefined;
    if (image) {
      const f = FOCUS[image];
      step.image = `/media/${image}.jpg`;
      step.annotated = true;
      step.ratio = f?.ratio;
      const p = pin ? f?.pins[String(pin)] : undefined;
      if (menuName && MENU_Y[menuName] !== undefined) {
        // Markera exakt det menyval som steget gäller.
        const cy = MENU_Y[menuName];
        step.hotspot = { x: 0.775, y: cy - 0.022, w: 0.185, h: 0.044 };
        step.annotated = false;
      } else if (p) {
        // Zooma mot pilens spets och lite förbi den, så att hela målrutan syns.
        const dx = p.fx - p.x, dy = p.fy - p.y, len = Math.hypot(dx, dy) || 1;
        const reach = 0.08, r = step.ratio ?? 1.6;
        step.focus = { x: Math.min(0.97, Math.max(0.03, p.fx + (dx / len) * reach)), y: Math.min(0.97, Math.max(0.03, p.fy + (dy / len) * reach * r)) };
        step.pin = { x: p.x, y: p.y };
      }
    }
    return step;
  });
}

// Radernas lodräta mittpunkt (0–1) i platsmenybilden (sida 3), för att kunna markera exakt rätt menyval.
const MENU_Y: Record<string, number> = {
  "Språkhantering": 0.418, "Ändra platsinformation": 0.462, "Bildhantering": 0.506, "Konfigurera bildspel": 0.55, "Tillåten incheckning": 0.594,
  "Hantera kapacitet": 0.638, "Hantera grindar": 0.682, "Aviseringsinställningar": 0.726, "SMS-mallar": 0.768, "Ändra struktur": 0.812, "Visa rapporter": 0.856,
};

const NOW = new Date().toISOString();

const DEFS: Def[] = [
  {
    id: "open-location-menu", category: "start", pages: ["start"],
    title: "Öppna platsmenyn",
    summary: "Alla inställningar nås från platsmenyn. Klicka på platsen så öppnas den.",
    alt: ["var hittar jag inställningarna", "hur kommer jag till platsmenyn", "komma igång", "var börjar jag", "hitta meny", "öppna min plats", "visa plats", "hur ser föraren sidan", "where are the settings", "how do I open the location menu", "get started", "wo finde ich die einstellungen", "où trouver les paramètres"],
    steps: [
      ["Klicka på platsens namn i listan till vänster", "p3", 1],
      ["…eller på kartnålen på kartan", "p3", 2],
      ["Välj det du vill ändra i menyn", "p3", 3],
    ],
    tip: "**Visa plats** öppnar sidan som föraren ser (lupnumber.com/46001). Bra för att kontrollera dina ändringar.",
    warning: "Det röda valet **Ta bort plats** tar bort hela platsen. Använd det aldrig om du inte är helt säker.",
    related: ["location-info", "languages"],
  },
  {
    id: "languages", category: "settings", pages: ["languages"],
    title: "Lägg till eller ta bort språk",
    summary: "Välj vilka språk platsen stöder – bildspel, video och SMS finns på varje språk.",
    alt: ["lägga till språk", "ta bort språk", "ändra språk", "byta språk", "hur ändrar jag språk", "fler språk för föraren", "översätta bildspelet", "språkhantering", "ukrainska polska ryska språk", "add a language", "change language", "remove language", "translate slideshow", "sprog tilføje", "Sprache hinzufügen", "ajouter une langue", "taal toevoegen", "dodaj język", "lisää kieli"],
    steps: [
      ["Öppna **Språkhantering** i platsmenyn"],
      ["Klicka **Lägg till språk** (ett språk) eller **Lägg till alla språk**", "p4", 1],
      ["Klicka på den blå pennan för att ändra ett språk", "p4", 3],
      ["Klicka på det blå krysset för att ta bort ett språk", "p4", 4],
    ],
    tip: "Lägg bara till de språk dina förare behöver. Då blir det mindre att översätta.",
    warning: "Om du tar bort ett språk visas inte längre texter och filer för det språket. Kontrollera först om språket används.",
    related: ["images-add", "sms-templates"],
    en: { title: "Add or remove languages", summary: "Choose which languages the site supports – slideshow, video and SMS exist per language.", steps: ["Open **Språkhantering** (Language management) in the location menu", "Click **Lägg till språk** (one language) or **Lägg till alla språk** (all)", "Click the blue pencil to edit a language", "Click the blue cross to remove a language"], tip: "Only add the languages your drivers need – less to translate.", warning: "Removing a language hides its texts and files. Check that it isn't in use first." },
  },
  {
    id: "location-info", category: "settings", pages: ["location-info"],
    title: "Ändra platsnamn, adress och logotyp",
    summary: "Ändra grunduppgifterna om platsen under Ändra platsinformation.",
    alt: ["byta namn på platsen", "ändra adress", "ändra kontaktinformation", "byta logga", "ladda upp logotyp", "ny profilbild", "ta bort logga", "visa namn i bildspelet", "change site name", "change address", "upload logo", "change logo", "ändra platsinformation", "Firmenlogo ändern", "changer le logo"],
    steps: [
      ["Öppna **Ändra platsinformation** i platsmenyn"],
      ["Skriv **Platsnamn**, **Adress** och **Kontaktinformation**", "p5", 1],
      ["Ny logotyp: klicka **Välj fil**. Ta bort: **Ta bort profilbild**", "p5", 2],
      ["Bocka **Visa även platsnamn i bildspelet** om namnet ska synas", "p5", 3],
      ["Scrolla ner och klicka **Spara plats**"],
    ],
    tip: "Ändringarna gäller först när du har klickat på den orangea spara-knappen.",
    related: ["opening-hours", "closed-period"],
  },
  {
    id: "closed-period", category: "settings", pages: ["location-info"],
    title: "Stänga platsen en period (semester)",
    summary: "Ange när incheckning är stängd – alltid, utanför öppettider eller en viss period.",
    alt: ["stänga platsen", "semesterstängt", "stänga över semestern", "platsen är stängd", "tillfälligt stängt", "stängd från till datum", "stäng incheckning", "stängd utanför öppettider", "alltid stängd", "close the site for holidays", "temporarily closed", "closed period", "stängd bild popup", "Betriebsurlaub", "fermeture annuelle"],
    steps: [
      ["Öppna **Ändra platsinformation** i platsmenyn"],
      ["**Alltid stängd**: bocka i rutan tills du tar bort bocken", "p5", 4],
      ["**Stängd utanför öppettider**: bocka om incheckning bara ska gå inom öppettiderna", "p5", 5],
      ["**Stängd från / till**: välj datum för en period, t.ex. semester", "p5", 6],
      ["Klicka **Spara plats** längst ner"],
    ],
    tip: "Under **Closed Popup Image** väljer du en bild som visas för föraren när det är stängt.",
    related: ["opening-hours", "location-info"],
  },
  {
    id: "opening-hours", category: "bookings", pages: ["location-info", "opening-hours"],
    title: "Ändra öppettider",
    summary: "Ange en allmän öppettid och egna tider per veckodag, och spara.",
    alt: ["ändra öppettider", "nya öppettider", "kortare på fredagar", "stänga tidigare", "öppna senare", "när platsen öppnar", "lördag söndag stängt", "öppningstid stängningstid", "fill all opening hours", "change opening hours", "opening times", "set working hours", "Öffnungszeiten ändern", "heures d'ouverture", "åbningstider", "avoin", "godziny otwarcia", "openingstijden"],
    steps: [
      ["Öppna **Ändra platsinformation** och scrolla ner"],
      ["Skriv **Allmänt** öppnings- och stängningstid, t.ex. 07:00 och 17:00", "p6", 1],
      ["**Fill All…**-knapparna kopierar tiderna till alla veckodagar", "p6", 2],
      ["Ändra enskilda dagar vid behov. Tomt = stängt", "p6", 3],
      ["Klicka **Spara plats** längst ner", "p6", 4],
    ],
    tip: "Öppnar du tidigare eller stänger senare behöver du också ändra kapaciteten per timme.",
    related: ["capacity", "closed-period"],
    en: { title: "Change opening hours", summary: "Set a general opening time and individual times per weekday, then save.", steps: ["Open **Ändra platsinformation** (Edit location) and scroll down", "Enter the **Allmänt** (general) opening and closing time, e.g. 07:00 and 17:00", "The **Fill All…** buttons copy the times to every weekday", "Adjust single days if needed. Empty = closed", "Click **Spara plats** (Save location) at the bottom"], tip: "If you open earlier or close later, also update the capacity per hour." },
  },
  {
    id: "images-add", category: "slideshow", pages: ["images", "slideshow"],
    title: "Lägg till en bild i bildspelet",
    summary: "Dra in bilden i Bildhantering, skriv en rubrik och spara.",
    alt: ["hur lägger jag upp en bild", "ladda upp bild", "ladda upp foto", "lägga till bild", "byta bild", "ny bild på skärmen", "ändra slideshow", "ändra bildspel", "ny bild i bildspelet", "lägga in en bild", "slideshow image", "upload a picture", "upload an image", "add photo to slideshow", "change slideshow", "new picture on screen", "Bild hochladen", "Diashow ändern", "télécharger une image", "billede uploade", "afbeelding uploaden", "dodaj zdjęcie", "lataa kuva", "bilde laste opp", "säkerhetsinformation bild", "skyddsutrustning information"],
    steps: [
      ["Öppna **Bildhantering** i platsmenyn"],
      ["Dra in bilden i det grå fältet – eller klicka i fältet och välj fil", "p7", 1],
      ["Klicka i **rubriken** och **texten** och skriv över dem", "p7", 3],
      ["Använd pilarna upp/ner om bilden ska ligga på annan plats", "p7", 4],
      ["Klicka **Spara** längst ner till höger", "p7", 6],
    ],
    tip: "Vill du bara ha en ruta med text? Klicka **Lägg till tom bild**. Välj sedan vilka bilder som visas i **Konfigurera bildspel**.",
    related: ["slideshow-config", "images-remove"],
    en: { title: "Add an image to the slideshow", summary: "Drag the image into Bildhantering (Image management), write a heading and save.", steps: ["Open **Bildhantering** (Image management) in the location menu", "Drag the image into the grey field – or click the field and choose a file", "Click the **heading** and **text** and overwrite them", "Use the up/down arrows to change the order", "Click **Spara** (Save) at the bottom right"], tip: "Just want a text box? Click **Lägg till tom bild**. Then pick which images to show in **Konfigurera bildspel**." },
  },
  {
    id: "images-remove", category: "slideshow", pages: ["images", "slideshow"],
    title: "Ta bort eller flytta en bild",
    summary: "Ta bort en bild med papperskorgen eller ändra ordning med pilarna – och spara.",
    alt: ["ta bort bild", "radera bild", "ta bort foto från bildspelet", "ändra ordning på bilderna", "flytta bild", "byta plats på bilder", "dölj bild", "delete image", "remove picture", "reorder slideshow images", "move image up", "Bild löschen", "supprimer une image"],
    steps: [
      ["Öppna **Bildhantering** i platsmenyn"],
      ["Ändra ordning med pilarna upp/ner", "p7", 4],
      ["Ta bort en bild med den röda papperskorgen", "p7", 5],
      ["Klicka **Spara** (eller **Avbryt** för att ångra)", "p7", 6],
    ],
    tip: "Vill du bara dölja en bild tillfälligt? Ta bort bocken i **Konfigurera bildspel** istället.",
    related: ["images-add", "slideshow-config"],
  },
  {
    id: "slideshow-config", category: "slideshow", pages: ["slideshow"],
    title: "Välj vilka bilder som visas i bildspelet",
    summary: "Bocka i de bilder som ska visas för föraren, välj ordning i utskriften och uppdatera.",
    alt: ["konfigurera bildspel", "vilka bilder visas för föraren", "dölja en bild i bildspelet", "visa bild offentligt", "utskriftsposition", "utskriftstext", "bildspel inställningar", "ändra bildspelet", "säkerhetsinformationen föraren ser", "which images does the driver see", "configure slideshow", "hide image from slideshow", "slideshow settings", "Diashow konfigurieren", "configurer le diaporama"],
    steps: [
      ["Öppna **Konfigurera bildspel** i platsmenyn", "p8", 1],
      ["**Visa i bildspel**: bocka de bilder föraren ska se", "p8", 2],
      ["**Visa offentligt**: bocka bilder som ska synas på publika sidan", "p8", 3],
      ["**Utskriftsposition** och **Utskriftstext**: välj vad som kommer med på utskriften", "p8", 4],
      ["Klicka **Uppdatera bildspel**", "p8", 6],
    ],
    tip: "Själva bilderna och texterna lägger du in i **Bildhantering**. Här väljer du bara hur de visas.",
    related: ["images-add", "slideshow-password"],
  },
  {
    id: "slideshow-password", category: "slideshow", pages: ["slideshow"],
    title: "Skydda bildspelet med lösenord",
    summary: "Ställ in ett lösenord för bildspelet under Konfigurera bildspel.",
    alt: ["lösenord på bildspelet", "skydda bildspelet", "sätta lösenord", "password protect slideshow", "lösenordsskydd", "Passwort für Diashow", "mot de passe diaporama"],
    steps: [
      ["Öppna **Konfigurera bildspel** i platsmenyn"],
      ["Klicka **Konfigurera lösenord för bildspel** uppe till höger", "p8", 7],
    ],
    related: ["slideshow-config"],
  },
  {
    id: "video-add", category: "slideshow", pages: ["slideshow"],
    title: "Lägg in en video för föraren",
    summary: "Ladda upp en säkerhetsfilm – en standardvideo eller en per språk.",
    alt: ["ladda upp video", "lägga till film", "säkerhetsfilm", "spela upp film för föraren", "video per språk", "standardvideo", "upload video", "add safety video", "Video hochladen", "ajouter une vidéo", "video toevoegen"],
    steps: [
      ["Öppna **Konfigurera bildspel** och fliken **Konfigurera video**", "p9", 1],
      ["Välj **Språk** (standardvideo används om språket saknar egen)", "p9", 2],
      ["Klicka **Välj fil** och välj videofilen", "p9", 3],
      ["Klicka **Lägg till video**", "p9", 4],
    ],
    tip: "Välj en kort fil – videon laddas upp till LUPNUMBER.",
    related: ["slideshow-config", "documents-add"],
  },
  {
    id: "documents-add", category: "slideshow", pages: ["slideshow"],
    title: "Lägg in ett PDF-dokument för föraren",
    summary: "Ladda upp t.ex. trafikregler som PDF – en per språk.",
    alt: ["ladda upp pdf", "lägga till dokument", "trafikregler pdf", "säkerhetsinstruktion", "dokument på flera språk", "upload pdf", "add document", "PDF hochladen", "ajouter un document"],
    steps: [
      ["Öppna fliken **Konfigurera dokument**", "p10", 1],
      ["Välj **Språk** (SE, EN, DE …)", "p10", 2],
      ["Klicka **Välj filer** och välj PDF-filen. Bara PDF fungerar", "p10", 3],
      ["Klicka **Lägg till dokument**", "p10", 4],
    ],
    tip: "Gör en PDF per språk om föraren ska få dokumentet på sitt eget språk.",
    related: ["video-add"],
  },
  {
    id: "form-fields", category: "drivers", pages: ["form-fields"],
    title: "Välj vilka uppgifter föraren ska fylla i",
    summary: "Bocka i de fält som ska finnas i incheckningen och vilka som är obligatoriska.",
    alt: ["vilka uppgifter föraren fyller i", "formulärfält", "obligatoriska fält", "fråga efter telefonnummer", "PO-nummer", "trailernummer", "åkeri", "ADR", "tullgods", "dölj fält för föraren", "krav vid bokning", "form fields", "required fields for driver", "what does the driver fill in", "Pflichtfelder", "champs obligatoires"],
    steps: [
      ["Öppna fliken **Konfigurera formulärfält**"],
      ["**Välj fält**: bocka fälten som ska vara med", "p11", 1],
      ["**Obligatoriskt**: bocka om föraren måste fylla i fältet", "p11", 2],
      ["**Obligatoriskt för bokning**: bocka om fältet krävs vid bokning", "p11", 3],
      ["Scrolla längst ner och klicka **Spara**"],
    ],
    tip: "Välj få fält. Varje obligatoriskt fält gör incheckningen långsammare för föraren.",
    related: ["quiz-add", "qr-codes"],
  },
  {
    id: "quiz-add", category: "drivers", pages: ["quiz"],
    title: "Lägg in kontrollfrågor för föraren",
    summary: "Skapa flervalsfrågor som föraren svarar på i bildspelet.",
    alt: ["kontrollfrågor", "quiz för föraren", "fråga om säkerhetsregler", "testa att föraren läst reglerna", "frågor i bildspelet", "rätt svar fel svar", "safety quiz", "control questions", "add question for driver", "Kontrollfragen", "questions de contrôle"],
    steps: [
      ["Öppna fliken **Konfigurera kontrollfrågor**"],
      ["Välj **Språk** och skriv frågan", "p12", 1],
      ["Skriv **Rätt svar** och upp till tre felaktiga svar", "p12", 3],
      ["Klicka **Lägg till kontrollfråga och svar**", "p12", 4],
      ["Ange hur många frågor föraren får (0 = alla) och klicka **Spara**", "p12", 5],
    ],
    tip: "Lägg in frågorna på varje språk du använder.",
    related: ["form-fields"],
  },
  {
    id: "qr-codes", category: "drivers", pages: ["qr"],
    title: "Skriv ut QR-koder",
    summary: "Hämta QR-koderna för publik sida, bildspel och bokning och sätt upp dem vid grinden.",
    alt: ["skriva ut qr-kod", "qr-kod till grinden", "affisch", "a1 affisch", "föraren ska skanna", "qr för bokning", "ladda ner qr", "print qr code", "qr code for gate", "download poster", "QR-Code drucken", "imprimer le code QR"],
    steps: [
      ["Öppna fliken **QR-koder**"],
      ["Välj kod: publik sida, bildspel eller bokning", "p13", 1],
      ["Klicka **Ladda ner A1-PDF** för en färdig affisch", "p13", 3],
      ["Skriv ut och sätt upp vid grinden eller informationstavlan"],
    ],
    tip: "Testa alltid QR-koden med en mobil innan du skriver ut stora affischer.",
    related: ["slideshow-config"],
  },
  {
    id: "preapproved", category: "drivers", pages: ["preapproved"],
    title: "Förhandsgodkänn fordon eller entreprenör",
    summary: "Lägg in namn och registreringsnummer som får checka in under en viss tid.",
    alt: ["förhandsgodkänna fordon", "entreprenörer", "godkänna återkommande fordon", "tillåten incheckning", "registreringsnummer tillåta", "ge tillträde", "pre-approve vehicle", "allow contractor to check in", "approved vehicles", "Fahrzeug freigeben", "autoriser un véhicule"],
    steps: [
      ["Öppna **Tillåten incheckning** i platsmenyn"],
      ["Skriv **Namn** och **Registreringsnummer**", "p14", 1],
      ["Välj sista **Giltighet** (datum)", "p14", 3],
      ["Bocka **samma som platsens arbetstider** eller ange egna tider", "p14", 4],
      ["Klicka **Lägg till tillåten incheckning**", "p14", 6],
    ],
    tip: "Varje post får en egen QR-kod. Poster som gått ut hamnar under **Utgångna**.",
    warning: "Kontrollera datumet noga – en utgången post ger inte längre tillträde.",
    related: ["qr-codes"],
  },
  {
    id: "capacity", category: "bookings", pages: ["capacity"],
    title: "Ändra hur många lastbilar som får komma per timme",
    summary: "Ställ in max antal lastbilar per timme. Det styr hur många tider som går att boka.",
    alt: ["ändra kapacitet", "hur många lastbilar per timme", "max lastbilar", "fler lastbilar", "färre lastbilar", "kapacitet per timme", "ändra antal tider", "stänga en timme", "change capacity", "trucks per hour", "limit trucks per hour", "increase capacity", "Kapazität ändern", "capaciteit aanpassen", "kapasitet", "pojemność"],
    steps: [
      ["Öppna **Hantera kapacitet** i platsmenyn"],
      ["Skriv ett tal i **Max lastbilar/h** och klicka **Uppdatera** – gäller alla timmar", "p15", 1],
      ["Eller ändra en timme i taget i rutan intill klockslaget. 0 = ingen kan boka", "p15", 2],
      ["Klicka **Uppdatera kapacitet** längst ner till höger", "p15", 4],
    ],
    tip: "Håll kapaciteten i linje med öppettiderna. Ändringar gäller först när du har sparat.",
    related: ["opening-hours"],
    walkthrough: [
      { selector: "[data-help='location-item']", text: "Klicka på platsen", advanceOn: "click" },
      { selector: "[data-help='menu-capacity']", text: "Välj **Hantera kapacitet**", advanceOn: "click" },
      { selector: "[data-help='cap-input']", text: "Skriv antal lastbilar per timme", advanceOn: "input" },
      { selector: "[data-help='cap-save']", text: "Klicka **Uppdatera kapacitet** för att spara", advanceOn: "click" },
    ],
    en: { title: "Change how many trucks may arrive per hour", summary: "Set the maximum trucks per hour. It controls how many time slots can be booked.", steps: ["Open **Hantera kapacitet** (Manage capacity) in the location menu", "Type a number in **Max lastbilar/h** and click **Uppdatera** – applies to all hours", "Or change one hour at a time. 0 = nobody can book that hour", "Click **Uppdatera kapacitet** at the bottom right"], tip: "Keep capacity in line with opening hours. Changes only apply once saved." },
  },
  {
    id: "gates", category: "gates", pages: ["gates"],
    title: "Namnge och styra grindar",
    summary: "Namnge grindarna vakten kan öppna och låt dem öppnas automatiskt när en förare kallas in.",
    alt: ["styra grindar", "ändra vilken port chauffören ska till", "vilken grind ska föraren åka till", "öppna grinden automatiskt", "grind vid inkallning", "lägga till grind", "grind in och ut", "gatekeeper knapp", "styrenhet", "relä", "port för lastning", "change gate", "which gate should the driver use", "open gate automatically", "add a gate", "Tor steuern", "porte automatique", "poort openen"],
    steps: [
      ["Öppna **Hantera grindar** i platsmenyn"],
      ["Skriv ett namn i **Grindens namn**, t.ex. Grind 1", "p16", 1],
      ["Välj **In** eller **Ut** – två olika reläer", "p16", 2],
      ["Välj **Öppna vid inkallning** om grinden ska öppnas automatiskt", "p16", 5],
      ["Klicka **+ Grind** för fler grindar", "p16", 6],
      ["Klicka **Spara grindar** längst ner till höger", "p16", 7],
    ],
    warning: "Fel inställning kan göra att en grind öppnas utan att ett fordon är inkallat. Testa alltid på plats tillsammans med vakten.",
    related: ["structure"],
  },
  {
    id: "notifications", category: "sms", pages: ["notifications"],
    title: "Få SMS eller e-post när något händer",
    summary: "Välj händelse, metod och mottagare – t.ex. SMS när en förare checkar in.",
    alt: ["få sms när förare checkar in", "skicka sms", "hur skickar jag ett sms", "aviseringar", "meddelande vid bokning", "mejla vid incheckning", "ny mottagare för avisering", "notis när lastbil kallas in", "send me an SMS", "email notification on check-in", "notify me when driver arrives", "set up notifications", "Benachrichtigung einrichten", "recevoir un SMS", "tekstviesti kuljettajan saapuessa"],
    steps: [
      ["Öppna **Aviseringsinställningar** i platsmenyn"],
      ["**Typ**: välj händelse (Check-in, Booking, Called in …)", "p17", 1],
      ["**Metod**: SMS eller Email", "p17", 2],
      ["**Anslutning**: skriv e-postadress eller telefonnummer", "p17", 3],
      ["**Språk**, sedan **Lägg till aviseringsinställning**", "p17", 5],
    ],
    tip: "Skriv telefonnummer med landskod, t.ex. +46. Lägg till en rad per mottagare och händelse.",
    related: ["sms-templates"],
  },
  {
    id: "sms-templates", category: "sms", pages: ["sms"],
    title: "Ändra texten i SMS till förare",
    summary: "Skriv över standardtexterna i SMS som skickas till föraren, ett per språk.",
    alt: ["ändra sms-text", "skriva eget sms till föraren", "sms-mall", "texten i sms", "vad står i sms:et", "stänga av sms", "sms vid inkallning", "sms vid incheckning", "change sms text", "edit sms template", "customize the text message", "SMS-Text ändern", "modifier le SMS", "sms tekst wijzigen"],
    steps: [
      ["Öppna **SMS-mallar** i platsmenyn"],
      ["Välj vilken **SMS-mall** du vill skriva en egen text för", "p18", 1],
      ["Välj **Språk** – skriv en text per språk", "p18", 2],
      ["Skriv ditt **Meddelande**", "p18", 3],
      ["Välj **Aktiv: Ja** och klicka **Lägg till SMS-mall**", "p18", 5],
    ],
    tip: "Håll texten kort så att SMS:et inte delas upp.",
    warning: "Ett tomt meddelande stänger av det SMS:et helt.",
    related: ["notifications", "languages"],
    en: { title: "Change the text of SMS to drivers", summary: "Overwrite the default texts of SMS sent to the driver – one per language.", steps: ["Open **SMS-mallar** (SMS templates) in the location menu", "Pick which **SMS-mall** (template) to write your own text for", "Choose **Språk** (language) – one text per language", "Write your **Meddelande** (message)", "Set **Aktiv: Ja** and click **Lägg till SMS-mall**"], tip: "Keep it short so the SMS isn't split.", warning: "An empty message turns that SMS off completely." },
  },
  {
    id: "structure", category: "settings", pages: ["structure"],
    title: "Dela upp en plats i spår (lastning och lossning)",
    summary: "Organisera platser i en hierarki med underplatser och spår.",
    alt: ["ändra struktur", "lägga till spår", "lastning och lossning separat", "underplats", "koppla loss plats", "flytta plats", "hierarki", "dela upp platsen", "add track", "split location into loading and unloading", "sub-location", "Struktur ändern", "modifier la structure"],
    steps: [
      ["Öppna **Ändra struktur** i platsmenyn"],
      ["Välj roll: **Underplats** eller **Spår**", "p19", 1],
      ["Välj **Publik** eller **Dold** för ett spår", "p19", 2],
      ["**Lägg till plats**: sök upp platsen som ska läggas under", "p19", 4],
      ["Klicka **Spara ändringar**", "p19", 6],
    ],
    tip: "Strukturen avgör hur platsen presenteras för föraren.",
    related: ["gates"],
  },
  {
    id: "reports-overview", category: "reports", pages: ["reports"],
    title: "Var hittar jag rapporter och statistik?",
    summary: "Rapportsidan har tre flikar: signaturer, statistik och avvikelsekategorier.",
    alt: ["se rapporter", "hitta statistik", "visa rapporter", "vilka som checkat in", "var är rapporterna", "where are the reports", "show statistics", "Berichte anzeigen", "voir les rapports"],
    steps: [
      ["Öppna **Visa rapporter** i platsmenyn"],
      ["**Visa signaturer**: logg över incheckningar", "p20", 1],
      ["**Visa statistik**: diagram och nyckeltal", "p20", 2],
      ["**Hantera avvikelsesrapporter**: egna kategorier", "p20", 3],
    ],
    related: ["reports-signatures", "reports-stats"],
  },
  {
    id: "reports-signatures", category: "reports", pages: ["reports"],
    title: "Se och ladda ner vilka som checkat in",
    summary: "Signaturlistan visar alla incheckningar. Filtrera på period och ladda ner som fil.",
    alt: ["lista på incheckade", "ladda ner incheckningar", "signaturer", "vem har varit på området", "revision", "sök registreringsnummer", "exportera lista", "who checked in", "download check-in list", "search by plate", "Signaturen exportieren", "télécharger la liste"],
    steps: [
      ["Öppna **Visa rapporter** → **Visa signaturer**"],
      ["Sök på namn, registreringsnummer eller plats", "p21", 2],
      ["Välj **Start datum** och **Slutdatum**", "p21", 3],
      ["Klicka **Ladda ner** för att hämta listan som fil", "p21", 4],
    ],
    tip: "Har du valt ett datumintervall laddas just det intervallet ner.",
    related: ["reports-stats"],
  },
  {
    id: "reports-stats", category: "reports", pages: ["reports"],
    title: "Läsa statistiken och exportera till Excel",
    summary: "Se bokningar, incheckningar, kötider och hur väl förare håller sina tider.",
    alt: ["statistik", "exportera till excel", "kötid", "tid på området", "bokningsefterlevnad", "datakvalitet", "åkeripålitlighet", "skriva ut statistik pdf", "export statistics", "waiting time statistics", "excel export", "Statistik exportieren", "statistiques"],
    steps: [
      ["Öppna **Visa rapporter** → **Visa statistik**"],
      ["Välj period och klicka **Använd**", "p22", 1],
      ["Välj **Dag**, **Vecka** eller **Månad**", "p22", 2],
      ["**Skriv ut / PDF** eller **Exportera Excel**", "p22", 3],
    ],
    tip: "Hög datakvalitet förutsätter att förarna checkas in och kallas in i systemet.",
    related: ["reports-signatures"],
  },
  {
    id: "reports-categories", category: "reports", pages: ["reports"],
    title: "Ändra avvikelsekategorier",
    summary: "Bestäm vilka kategorier en avvikelse kan ha – byt namn, lägg till eller ta bort.",
    alt: ["avvikelsekategorier", "lägga till kategori för avvikelse", "byta namn på kategori", "ta bort avvikelsekategori", "deviation categories", "add incident category", "Abweichungskategorien"],
    steps: [
      ["Öppna **Visa rapporter** → **Hantera avvikelsesrapporter**"],
      ["Byt namn: skriv över ett kategorinamn", "p23", 2],
      ["Ny kategori: skriv i **Lägg till kategori**", "p23", 4],
      ["Klicka **Uppdatera kategorier**", "p23", 5],
    ],
    warning: "Tar du bort en kategori tas all data som hör till den också bort. Byt hellre namn.",
    related: ["deviations"],
  },
  {
    id: "deviations", category: "reports", pages: ["deviations"],
    title: "Se och arkivera avvikelser från förare",
    summary: "Förarnas rapporterade avvikelser finns under Avvikelserapporter i användarmenyn.",
    alt: ["avvikelserapporter från förare", "arkivera avvikelse", "ny avvikelse", "siffran vid användarnamnet", "trasig registreringsskylt", "see driver incident reports", "archive report", "Abweichung archivieren"],
    steps: [
      ["Klicka på ditt användarnamn uppe till vänster → **Avvikelserapporter**"],
      ["**Nya avvikelserapporter** ligger överst", "p24", 1],
      ["Klicka på den röda bocken under **Arkivera** när ärendet är hanterat", "p24", 2],
    ],
    tip: "Siffran bredvid användarnamnet visar hur många nya rapporter som väntar.",
    related: ["reports-categories"],
  },
];

export function seedGuides(): Guide[] {
  return DEFS.map((d) => {
    const steps = buildSteps(d.id, d.steps);
    const translations: Partial<Record<Lang, GuideTranslation>> = {};
    if (d.en) {
      translations.en = {
        title: d.en.title, summary: d.en.summary,
        steps: Object.fromEntries(steps.map((s, i) => [s.id, d.en!.steps[i] ?? s.text])),
        tip: d.en.tip, warning: d.en.warning, updatedAt: NOW,
      };
    }
    return {
      id: d.id, status: "published", title: d.title, summary: d.summary, category: d.category,
      altQueries: d.alt, steps, tip: d.tip, warning: d.warning, video: d.video, walkthrough: d.walkthrough,
      pageKeys: d.pages, roles: d.roles ?? [], lang: "sv", translations, related: d.related ?? [],
      createdAt: NOW, updatedAt: NOW, publishedAt: NOW,
    } satisfies Guide;
  });
}
