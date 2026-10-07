import { test } from "node:test";
import assert from "node:assert/strict";
import { SearchEngine, qualityOf } from "./search/engine.js";
import { seedGuides } from "./seed/guides.js";

const engine = new SearchEngine();
engine.build(seedGuides());
const top = (q: string, page?: string) => engine.search(q, { page })[0];

const CASES: [string, string][] = [
  // Samma avsikt – olika ord (krav 6)
  ["Hur lägger jag upp en bild?", "images-add"],
  ["Byta bild", "images-add"],
  ["Ny bild på skärmen", "images-add"],
  ["Ändra slideshow", "images-add"],
  ["Hur laddar jag upp foto?", "images-add"],
  ["how do i upload a picture", "images-add"],
  ["Bild hochladen", "images-add"],
  ["Hur skickar jag ett SMS?", "notifications"],
  ["ändra sms texten", "sms-templates"],
  ["hur ändrar jag språk", "languages"],
  ["lägga till språk", "languages"],
  ["fler lastbilar per timme", "capacity"],
  ["ändra öppettider", "opening-hours"],
  ["stänga över semestern", "closed-period"],
  ["hur skriver jag ut qr kod", "qr-codes"],
  ["förhandsgodkänna en entreprenör", "preapproved"],
  ["wie ändere ich die kapazität", "capacity"],
  ["opening hours change", "opening-hours"],
  ["ladda upp video", "video-add"],
  ["ladda ner lista på alla incheckade", "reports-signatures"],
  ["bildspelet lösenord", "slideshow-password"],
];

for (const [q, id] of CASES) {
  test(`"${q}" → ${id}`, () => {
    const h = top(q);
    assert.equal(h?.guide.id, id, `fick ${h?.guide.id} (${h?.score.toFixed(2)})`);
    assert.notEqual(qualityOf(h.score), "none");
  });
}

// Det finns ingen guide för detta – ska inte låtsas att det gör det.
for (const q of ["Hur ändrar jag vilken port chauffören ska till?", "Hur skapar jag en bokning?", "Hur lägger jag till en användare?", "vad är vädret", "asdfgh"]) {
  test(`inget säkert svar: "${q}"`, () => {
    const h = top(q);
    assert.notEqual(h ? qualityOf(h.score) : "none", "good", `fick ${h?.guide.id} (${h?.score.toFixed(2)})`);
  });
}

test("kontext: 'hur ändrar jag detta' på sidan capacity ger kapacitetsguiden", () => {
  const h = top("Hur ändrar jag detta?", "capacity");
  assert.equal(h?.guide.id, "capacity");
});

test("kontext ändrar inte en tydlig fråga", () => {
  assert.equal(top("hur ändrar jag språk", "capacity").guide.id, "languages");
});

test("flerspråkig översättning indexeras (engelska titlar)", () => {
  assert.equal(top("Add an image to the slideshow").guide.id, "images-add");
});

test("opublicerade guider syns inte", () => {
  const gs = seedGuides(); gs[0].status = "draft";
  const e = new SearchEngine(); e.build(gs);
  assert.ok(!e.search("öppna platsmenyn").some((h) => h.guide.id === gs[0].id));
});
