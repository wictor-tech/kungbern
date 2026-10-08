/**
 * Skriver src/app/demo/demo-dataset.json (syntetisk demosajt – inga kunddata).
 * Kör: node --experimental-strip-types scripts/build-demo-data.ts [seed]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_SEED, demoDatasetJson } from "../src/data/demoDataset.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "src/app/demo/demo-dataset.json");
const json = demoDatasetJson(process.argv[2] ?? DEMO_SEED);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, json);
console.log(`Skrev ${out} (${(Buffer.byteLength(json) / 1024).toFixed(0)} kB)`);
