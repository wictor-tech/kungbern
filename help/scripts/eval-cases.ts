/**
 * Testfrågor för sökningen: hur riktiga användare skriver, inklusive stavfel och vardagsord.
 * expect = guide-id som ska komma först (eller någon av flera godkända). null = det finns ingen guide,
 * då ska svaret vara "ingen guide" eller "menade du…", aldrig en säker träff på fel guide.
 */
export const EVAL_CASES: { q: string; expect: string | string[] | null; page?: string }[] = [
  // Briefens exempel
  { q: "Hur lägger jag upp en bild?", expect: "lagga-upp-en-bild" },
  { q: "Hur ändrar jag ett bildspel?", expect: "andra-bildspelet" },
  { q: "Hur lägger jag till en användare?", expect: "lagga-till-en-anvandare" },
  { q: "Hur skickar jag ett SMS?", expect: ["skicka-sms-till-alla-pa-omradet", "andra-texten-i-ett-sms"] },
  { q: "Hur ändrar jag vilken port chauffören ska till?", expect: ["kalla-in-en-forare", "se-lastbryggorna-over-tid"] },
  { q: "Hur skapar jag en bokning?", expect: ["skapa-en-bokning", "lagga-in-ett-fordon-manuellt"] },
  { q: "Byta bild", expect: "lagga-upp-en-bild" },
  { q: "Ny bild på skärmen", expect: "lagga-upp-en-bild" },
  { q: "Ändra slideshow", expect: "andra-bildspelet" },
  { q: "Hur laddar jag upp foto?", expect: "lagga-upp-en-bild" },
  // Plats och tider
  { q: "vi har stängt på midsommar", expect: "stanga-en-dag-eller-period" },
  { q: "ändra öppettiderna på lördagar", expect: "andra-oppettider" },
  { q: "röda dagar", expect: "stanga-en-dag-eller-period" },
  { q: "förarna förstår inte svenska", expect: "lagga-till-sprak" },
  { q: "byta logga", expect: "andra-platsinformation" },
  { q: "fel adress på kartan", expect: "andra-platsinformation" },
  // Förarens upplevelse
  { q: "lägga upp en säkerhetsfilm", expect: "lagga-till-en-video" },
  { q: "pdf med ordningsregler", expect: "lagga-till-ett-dokument" },
  { q: "göra registreringsnummer obligatoriskt", expect: "valja-vad-foraren-fyller-i" },
  { q: "skriva ut qr kod", expect: "skriva-ut-qr-koder" },
  { q: "ny lastkaj", expect: "lagga-till-en-lastbrygga" },
  { q: "släppa in entreprenörer utan bokning", expect: "forhandsgodkanna-ett-fordon" },
  { q: "checklista med säkerhetsfrågor", expect: "lagga-in-kontrollfragor" },
  // Bokning
  { q: "ingen kan boka", expect: "andra-kapacitet-per-timme" },
  { q: "det går inte att boka några tider", expect: "andra-kapacitet-per-timme" },
  { q: "hur många bokningar per timme", expect: "andra-kapacitet-per-timme" },
  { q: "fast leverans varje tisdag", expect: "skapa-aterkommande-bokningar" },
  { q: "bokningarna ska vara 60 minuter", expect: "andra-bokningsinstallningar" },
  // Personer och meddelanden
  { q: "få ett mejl när en lastbil checkar in", expect: "stalla-in-aviseringar-till-personal" },
  { q: "ändra texten i sms:et som går till föraren", expect: "andra-texten-i-ett-sms" },
  { q: "stänga av sms", expect: "andra-texten-i-ett-sms" },
  { q: "lägga till mottagare", expect: "lagga-till-en-kontaktperson" },
  // Grindar
  { q: "grinden ska öppnas automatiskt", expect: "lagga-till-en-grind" },
  { q: "lägga till en bom", expect: "lagga-till-en-grind" },
  { q: "dela upp platsen i lossning och lastning", expect: "andra-platsstrukturen" },
  // Uppföljning
  { q: "vem var här i tisdags", expect: "se-signaturer" },
  { q: "exportera statistik till excel", expect: "lasa-statistiken" },
  { q: "avvikelser export", expect: "hantera-avvikelserapporter" },
  { q: "data quality är låg", expect: "lasa-statistiken" },
  // Daglig drift
  { q: "kalla in chauffören", expect: "kalla-in-en-forare" },
  { q: "checka ut en lastbil", expect: "kalla-in-en-forare" },
  { q: "söka på regnr", expect: "soka-och-filtrera-fordon" },
  { q: "vilken port är ledig", expect: "se-lastbryggorna-over-tid" },
  { q: "se nästa veckas bokningar", expect: "se-veckan" },
  { q: "lägga in en lastbil manuellt", expect: "lagga-in-ett-fordon-manuellt" },
  { q: "skicka sms till alla förare", expect: "skicka-sms-till-alla-pa-omradet" },
  { q: "brandlarm meddela alla på området", expect: "skicka-sms-till-alla-pa-omradet" },
  { q: "stänga av ljudet", expect: "valja-vilka-larm-du-far" },
  { q: "automatisk incheckning", expect: "stalla-in-ko-och-lastbryggor" },
  // Stavfel
  { q: "bildpsel", expect: "andra-bildspelet" },
  { q: "kappacitet", expect: "andra-kapacitet-per-timme" },
  { q: "chaufför inkalning", expect: "kalla-in-en-forare" },
  // Sidkontext
  { q: "Hur ändrar jag detta?", expect: "andra-kapacitet-per-timme", page: "capacity-timeslots" },
  { q: "vad gör den här sidan", expect: "kalla-in-en-forare", page: "site-board" },
  // Utanför manualen
  { q: "jag har glömt mitt lösenord till kontot", expect: null },
  { q: "hur ändrar jag lösenordet för bildspelet", expect: "andra-bildspelet" },
  { q: "faktura", expect: null },
  { q: "vad kostar lup", expect: null },
];
