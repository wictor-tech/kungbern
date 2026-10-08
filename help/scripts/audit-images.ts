/** Kontroll: har varje guide en bild från appen, finns filen, och har alla markeringar en position? */
import fs from "node:fs";
import path from "node:path";
import { allSeedGuides } from "../src/lib/seed";

let problems = 0;
const rows: string[] = [];
for (const g of allSeedGuides()) {
  const issues: string[] = [];
  if (!g.screenshot) issues.push("ingen bild");
  else {
    const file = path.join("public", g.screenshot);
    if (!fs.existsSync(file)) issues.push(`filen saknas: ${g.screenshot}`);
    if (!g.screenshot.startsWith("/screens/app/")) issues.push("gammal bild från manualen");
    if (!g.screenshotSize) issues.push("bildstorlek saknas");
  }
  const noPos = g.hotspots.filter((h) => h.x === undefined);
  if (noPos.length) issues.push(`${noPos.length}/${g.hotspots.length} markeringar utan position: ${noPos.map((h) => `${h.n} "${h.label}"`).join(", ")}`);
  const badStep = g.steps.filter((s) => s.hotspot && !g.hotspots.some((h) => h.n === s.hotspot));
  if (badStep.length) issues.push(`steg pekar på saknad markering: ${badStep.map((s) => s.n).join(", ")}`);
  if (issues.length) problems++;
  rows.push(`${issues.length ? "✗" : "✓"} ${g.status === "published" ? "" : "[utkast] "}${g.id}${issues.length ? "\n    - " + issues.join("\n    - ") : ""}`);
}
console.log(rows.join("\n"));
console.log(`\n${allSeedGuides().length} guider, ${problems} med anmärkningar`);
