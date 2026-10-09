import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VerapepDatabase } from '../database.mjs';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const legacyDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!legacyDir || !fs.existsSync(legacyDir)) {
  console.error('Usage: node scripts/import-v8-data.mjs <path-to-old-data-folder>');
  process.exit(1);
}

const mappings = {
  catalogue: 'catalogue.json',
  config: 'store-config.json',
  policy: 'commerce-policy.json',
  inventory: 'inventory.json',
  orders: 'orders.json',
  returns: 'returns.json',
  productContent: 'product-content.json',
  reviews: 'reviews.json',
  guide: 'guide-config.json',
  supportKb: 'support-kb.json',
  customers: 'customers.json'
};

const targetDataDir = path.resolve(process.env.DATA_DIR || path.join(rootDir, 'data'));
const seedFiles = Object.fromEntries(Object.entries(mappings).map(([key, file]) => [key, path.join(targetDataDir, file)]));
const database = new VerapepDatabase({
  dataDir: targetDataDir,
  seedFiles,
  defaultAdmin: {
    email: process.env.ADMIN_EMAIL || 'admin@verapep.local',
    password: process.env.ADMIN_PASSWORD || 'ChangeMe-123!',
    displayName: 'VERAPEP owner',
    role: 'owner'
  }
});

let imported = 0;
for (const [documentKey, fileName] of Object.entries(mappings)) {
  const source = path.join(legacyDir, fileName);
  if (!fs.existsSync(source)) continue;
  const value = JSON.parse(fs.readFileSync(source, 'utf8'));
  database.writeDocument(documentKey, value);
  imported += 1;
  console.log(`Imported ${fileName}`);
}

database.addAudit({
  actorEmail: 'system',
  actorRole: 'system',
  action: 'legacy_data.imported',
  entityType: 'database',
  entityId: legacyDir,
  after: { importedDocuments: imported }
});
database.close();
console.log(`Done. Imported ${imported} document(s) into ${path.join(targetDataDir, 'verapep.sqlite')}.`);
