// Begreppslexikon: ord på alla stödda språk → ett gemensamt begrepp.
// Alla ord är redan "vikta" (gemener, utan diakritiska tecken). Gör det enkelt att utöka:
// lägg till ett ord i rätt grupp så förstår sökningen det direkt.

type Group = { id: string; weight: number; words: string[] };

export const GROUPS: Group[] = [
  // ----- Objekt / funktioner (hög vikt) -----
  { id: "image", weight: 1, words: "bild bilder bilden bilderna foto foton fotot fotografi illustration grafik skarmbild image images picture pictures photo photos pic pics billede billeder bilde bilder kuva kuvan kuvat kuvia valokuva bild abbildung bilder foto fotos afbeelding afbeeldingen plaatje zdjecie zdjecia obraz obrazek grafika photographie imagen".split(" ") },
  { id: "slideshow", weight: 1.2, words: "bildspel bildspelet slideshow slide slides diashow diaporama diavoorstelling presentation praesentation prezentacja pokaz slajdow esitys diaesitys kuvaesitys lysbildefremvisning slideshowet visningen diasshow".split(" ") },
  { id: "video", weight: 1.2, words: "video videor videon videos film filmen filmer movie videofilm videoklipp clip wideo vidéo vidéos videoer elokuva".split(" ") },
  { id: "document", weight: 1.1, words: "dokument dokumentet pdf pdfer document documents dokumente documenten dokumentti dokumentit dokumenty".split(" ") },
  { id: "user", weight: 1.2, words: "anvandare anvandarna anvandaren user users konto account brugere bruger bruker brukere kayttaja kayttajat benutzer nutzer utilisateur gebruiker uzytkownik uzytkownika administrator admin behorighet rattighet roll role".split(" ") },
  { id: "driver", weight: 1.2, words: "forare foraren chauffor chaufforen chauffor sjafor driver drivers truckdriver chauffeur chauffeure fahrer forer kuljettaja kuljettajat bestuurder bestuurders kierowca kierowcy conducteur".split(" ") },
  { id: "gate", weight: 1.3, words: "grind grindar grinden port porten portar gate gates barrier bom bommen tor schranke barriere poort brama bramy portti porte relay rele".split(" ") },
  { id: "sms", weight: 1.3, words: "sms textmeddelande textmeddelanden sms-mall smsmall smsmallar text textbesked meddelande meddelanden message messages tekstviesti tekstiviesti nachricht bericht wiadomosc".split(" ") },
  { id: "email", weight: 1, words: "epost e-post email mail mejl mejla mejl e-mail courriel".split(" ") },
  { id: "notify", weight: 1.2, words: "avisering aviseringar aviseringsinstallningar notis notiser notifiering notifieringar notification notifications alert alerts varsel varsling meddelande underratta underrattelse benachrichtigung notificatie powiadomienie ilmoitus".split(" ") },
  { id: "booking", weight: 1.3, words: "bokning bokningar boka bokad boka tidsbokning tid bokat booking bookings book reservation reservering reserver buchung buchen reservierung reserveren boeking varaus varata rezerwacja rezerwacje slot tidslucka".split(" ") },
  { id: "capacity", weight: 1.3, words: "kapacitet kapaciteten capacity kapazitat capaciteit kapasitet kapasiteit pojemnosc lastbilar lastbil trucks truck lastwagen vrachtwagen camions ciezarowki per timme hour timme".split(" ") },
  { id: "hours", weight: 1.3, words: "oppettider oppettid oppet oppna stang stangd stangt stanga stangning stangningstid closing closed opening open hours oeffnungszeiten offnungszeiten ouverture ferme fermeture openingstijden gesloten aukioloajat suljettu godziny otwarcia zamkniete semester holiday vacation lukket abningstider apningstider".split(" ") },
  { id: "language", weight: 1.3, words: "sprak spraket sprakhantering language languages sprog sprak kieli kielet sprache sprachen langue langues taal talen jezyk jezyki oversatta translate translation".split(" ") },
  { id: "qr", weight: 1.3, words: "qr qr-kod qrkod qrkoder qr-koder qr-kode qrcode qr-code skanna scan scanning affisch poster plakat".split(" ") },
  { id: "report", weight: 1.1, words: "rapport rapporter report reports statistik statistics stats bericht berichte raport raporty rapportti tilastot diagram".split(" ") },
  { id: "deviation", weight: 1.3, words: "avvikelse avvikelser avvikelserapport avvikelserapporter deviation deviations incident incidents skade skader problem fel avvik abweichung afwijking odchylenie poikkeama".split(" ") },
  { id: "checkin", weight: 1.2, words: "incheckning incheckningar checka checkin check-in checkat signatur signaturer checkout utcheckning anmeldung inchecken enregistrement rejestracja sisaankirjautuminen".split(" ") },
  { id: "allow", weight: 1.2, words: "forhandsgodkann forhandsgodkanna godkann godkanna tillaten tillat tillatelse entreprenor entreprenorer fordon fordonet registreringsnummer regnr nummerplat approve approved allowed preapprove contractor contractors vehicle vehicles plate licence license".split(" ") },
  { id: "form", weight: 1.1, words: "formular formularfalt falt fält field fields obligatoriskt obligatorisk uppgifter uppgift information telefonnummer telefon phone feld felder champ champs veld velden pole pola kentta kentat ordernummer".split(" ") },
  { id: "quiz", weight: 1.2, words: "kontrollfraga kontrollfragor fraga fragor quiz question questions test kontroll flervalsfragor frage fragen vraag vragen pytanie pytania kysymys kysymykset".split(" ") },
  { id: "structure", weight: 1.2, words: "struktur andra-struktur underplats underplatser spar hierarki lastning lossning track tracks loading unloading struktuur sporen".split(" ") },
  { id: "location", weight: 0.8, words: "plats platsen platser platsmeny platsmenyn anlaggning anlaggningen location locations site sites sted steder sijainti standort ort lokalisatie lokacja miejsce emplacement".split(" ") },
  { id: "password", weight: 1.2, words: "losenord losen password passwort wachtwoord haslo salasana mot-de-passe adgangskode passord kodeord".split(" ") },
  { id: "print", weight: 1, words: "skriv skriva skrivut utskrift print printing drucken imprimer afdrukken drukuj tulosta pdf-utskrift".split(" ") },
  { id: "logo", weight: 1.1, words: "logga logotyp logo profilbild profilbilden varumarke".split(" ") },
  { id: "export", weight: 1, words: "exportera export ladda-ner download nedladdning excel csv fil hamta herunterladen telecharger downloaden pobierz lataa".split(" ") },
  { id: "popup", weight: 1, words: "popup pop-up closed-popup stangningsbild".split(" ") },
  { id: "map", weight: 1, words: "karta kartan kartnal pin placera placering map karte carte kaart mapa kartta".split(" ") },

  // ----- Handlingar (lägre vikt: användare byter ofta verb för samma sak) -----
  { id: "v_add", weight: 0.45, words: "lagg lagger lagga laddar ladda skapa skapar skapat ny nytt nya lagg-till add adds create creating upload uploading new insert tilfoj tilfoje opret legg lagre lisaa luo hinzufugen hinzufuegen erstellen hochladen ajouter creer telecharger toevoegen maken aanmaken uploaden dodaj utworz".split(" ") },
  { id: "v_edit", weight: 0.45, words: "andra andrar byta byter bytte redigera redigerar ersatta uppdatera uppdaterar justera change changing edit editing replace update modify adjust swap aendern andern bearbeiten modifier changer wijzigen aanpassen zmien edytuj muokkaa muuta endre aendre rediger".split(" ") },
  { id: "v_remove", weight: 0.45, words: "radera raderar ta-bort bort delete remove removing loschen entfernen supprimer verwijderen usun poista slett fjern".split(" ") },
  { id: "v_show", weight: 0.35, words: "visa visar se ser show view see anzeigen voir bekijken pokaz nayta vis".split(" ") },
  { id: "v_send", weight: 0.5, words: "skicka skickar skickas send sending senden envoyer versturen wyslij laheta sende".split(" ") },
  { id: "v_save", weight: 0.4, words: "spara sparar save speichern enregistrer opslaan zapisz tallenna gem lagre".split(" ") },
];

export const STOPWORDS = new Set(
  ("hur jag vill kan man ska maste far en ett ar att pa i av for med och eller det den de som har hade till fran om mig min mitt mina vad var nar varfor vilken vilket vilka kanske gor gora goras " +
    "how do i can to the a an of for on in is it my me and or what where when why which want need should would please " +
    "hvordan jeg kan hvad hvor vil gerne min mit " +
    "wie ich kann ein eine der die das und oder was wo wann mochte moechte " +
    "comment je peux le la les un une et ou que quoi ou veux " +
    "hoe ik kan een het de en of wat waar wil " +
    "jak moge chce czy sie na w z do ktory " +
    "miten voin haluan mita missa ja tai " +
    "pa paa upp ut ner in ifran sa bara skulle jag-vill sig").split(" "),
);

// Ord där en bokstavsnära "ords-prefix"-träff är rimlig (sammansättningar på svenska/tyska/nederländska).
export const CONCEPT_PREFIX_MIN = 4;
