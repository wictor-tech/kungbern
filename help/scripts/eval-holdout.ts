/**
 * Kontrollfrågor som INTE används vid finjustering – för att se att sökningen generaliserar.
 * Kör: npx tsx scripts/eval-holdout.ts
 */
import { buildSeedGuides } from "../src/lib/seed";
import { buildIndex, judge, search } from "../src/lib/search";

const CASES: [string, string | null][] = [
  ["hur får jag in en ny bild i bildspelet", "lagga-upp-en-bild"],
  ["kan man ha olika öppettider på helgen", "andra-oppettider"],
  ["lastbilarna kan inte boka någon tid", "andra-kapacitet-per-timme"],
  ["ta bort en bild", "lagga-upp-en-bild"],
  ["hur lägger jag till engelska", "lagga-till-sprak"],
  ["kan personalen få sms när någon checkar in", "stalla-in-aviseringar-till-personal"],
  ["ny grind vid utfarten", "lagga-till-en-grind"],
  ["hur ser jag gårdagens besökare", "se-signaturer"],
  ["chauffören har åkt, hur checkar jag ut honom", "kalla-in-en-forare"],
  ["meddela alla förare att vi stänger", "skicka-sms-till-alla-pa-omradet"],
  ["vi har en ny port 7", "lagga-till-en-lastbrygga"],
  ["stängt mellan jul och nyår", "stanga-en-dag-eller-period"],
  ["förare ska bekräfta säkerhetsregler", "lagga-in-kontrollfragor"],
  ["hur exporterar jag avvikelser till word", "hantera-avvikelserapporter"],
  ["filma en instruktion till förarna", "lagga-till-en-video"],
  ["koppla vår kamera", null],
  ["hur loggar jag ut", null],
];
const index = buildIndex(buildSeedGuides());
let ok = 0;
let wrongSure = 0;
for (const [q, exp] of CASES) {
  const { hits } = search(index, q);
  const { verdict } = judge(hits);
  const first = hits[0]?.guide.id ?? null;
  const good = exp === null ? verdict !== "answered" : first === exp;
  if (good) ok++;
  if (verdict === "answered" && first !== exp) wrongSure++;
  console.log(`${good ? "OK " : "FEL"} [${verdict}] ${q} → ${first}${exp && !good ? ` (väntat ${exp})` : ""}`);
}
console.log(`\nRätt: ${ok}/${CASES.length}, säkert men fel: ${wrongSure}`);
