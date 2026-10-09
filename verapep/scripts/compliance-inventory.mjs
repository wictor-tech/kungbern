/* Internal product & compliance inventory (v17).

   Writes docs/v17/PRODUCT-COMPLIANCE-INVENTORY.csv and .md for all catalogue
   products: identifiers, verified content, stated use, publication status,
   approved documents, lab reports, markets, legal review state, flagged claims
   and the automated (non-binding) risk indicator.

   Usage: node scripts/compliance-inventory.mjs                 from the shipped seed data
          node scripts/compliance-inventory.mjs --data-dir DIR  from a live database (read-only)
          PUBLICATION_GATE=strict node scripts/…                 visibility as in production */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { inventoryRow, recordFor, resolveGateMode, REVIEW_STATUS_LABELS } from '../lib/compliance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dataDirIndex = args.indexOf('--data-dir');
const dataDir = dataDirIndex > -1 ? path.resolve(args[dataDirIndex + 1]) : null;
const readSeed = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8'));

let catalogue = readSeed('catalogue.json');
let content = readSeed('product-content.json');
let compliance = readSeed('product-compliance.json');
let policy = readSeed('commerce-policy.json');
let source = 'shipped seed data (data/*.json)';
if (dataDir) {
  const db = new DatabaseSync(path.join(dataDir, 'verapep.sqlite'), { readOnly: true });
  const doc = (key, fallback) => { const row = db.prepare('SELECT value_json FROM documents WHERE key = ?').get(key); return row ? JSON.parse(row.value_json) : fallback; };
  catalogue = doc('catalogue', catalogue); content = doc('productContent', content); compliance = doc('productCompliance', compliance); policy = doc('policy', policy);
  db.close();
  source = `database ${path.join(dataDir, 'verapep.sqlite')} (read-only)`;
}
const gate = resolveGateMode({ isProduction: false, configured: process.env.PUBLICATION_GATE });
const categories = Object.fromEntries(catalogue.categories.map(category => [category.id, category.label]));
const rows = catalogue.products.map(product => inventoryRow(product, content.products[product.id] || {}, recordFor(compliance, product.id), gate, policy.products?.[product.id] || {}));

const outDir = path.join(root, 'docs', 'v17');
fs.mkdirSync(outDir, { recursive: true });
const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
const header = ['id', 'name', 'category', 'catalogue_numbers', 'specifications', 'verified_content', 'stated_use', 'publication_flag', 'publicly_visible', 'visibility_reason', 'markets_shown', 'approved_documents', 'published_lab_reports', 'review_status', 'legal_classification_verified', 'legal_review_outstanding', 'flagged_claims', 'risk_indicator', 'risk_reasons', 'suggested_status', 'sandbox_sale', 'live_sale'];
const csv = [header.join(','), ...rows.map(row => [
  row.id, row.name, categories[row.category] || row.category, row.variants.map(v => v.catalogueNo).join(' '), row.variants.map(v => v.specification).join('; '),
  row.verifiedContentFields.join(' ') || 'none', row.statedUse || 'not stated', row.publicationStatus, row.publiclyVisible ? 'yes' : 'no', row.visibilityReason,
  row.marketsShown.join(' '), row.approvedDocuments, row.publishedLabReports, row.review.status, row.legalClassificationVerified ? 'yes' : 'no',
  row.legalReviewOutstanding ? 'yes' : 'no', row.unsupportedClaims.join('; ') || 'none', row.suggestion.level, row.suggestion.reasons.join(' | '), row.suggestion.suggestedStatus,
  row.commerce.sandboxEnabled ? 'yes' : 'no', row.commerce.liveEnabled ? 'yes' : 'no'
].map(csvCell).join(','))].join('\n');
fs.writeFileSync(path.join(outDir, 'PRODUCT-COMPLIANCE-INVENTORY.csv'), `${csv}\n`);

const count = (predicate) => rows.filter(predicate).length;
const md = [];
md.push('# Produkt- och granskningsinventering (v17)', '');
md.push(`Genererad ${new Date().toISOString().slice(0, 10)} från ${source} med \`node scripts/compliance-inventory.mjs\`. Publiceringsläge: **${gate}**. Fullständiga fält finns i \`PRODUCT-COMPLIANCE-INVENTORY.csv\`.`, '');
md.push(`> **Viktigt.** Risknivån är en automatisk, namnbaserad *indikator* som tagits fram av AI-assisterad kod. Den är inte en juridisk klassificering och kan aldrig godkänna något. Varje produkt kräver beslut av en behörig granskare. ${count(row => row.review.status === 'approved_for_publication') === 0 ? 'Ingen produkt har i dag ett registrerat godkännande.' : `${count(row => row.review.status === 'approved_for_publication')} produkt(er) har ett registrerat godkännande.`}`, '');
md.push('## Sammanfattning', '');
md.push('| | Antal |', '| --- | ---: |');
md.push(`| Produkter i katalogen | ${rows.length} |`);
md.push(`| Varianter | ${rows.reduce((sum, row) => sum + row.variants.length, 0)} |`);
md.push(`| Hög riskindikator (dold som standard) | ${count(row => row.suggestion.level === 'high')} |`);
md.push(`| Förhöjd riskindikator | ${count(row => row.suggestion.level === 'elevated')} |`);
md.push(`| Publikt synliga i detta läge | ${count(row => row.publiclyVisible)} |`);
md.push(`| Med verifierat innehåll (beskrivning, användning m.m.) | ${count(row => row.verifiedContentFields.length > 0)} |`);
md.push(`| Med angivet användningsområde | ${count(row => row.statedUse)} |`);
md.push(`| Med publicerad labbrapport | ${count(row => row.publishedLabReports > 0)} |`);
md.push(`| Med godkända dokument registrerade | ${count(row => row.approvedDocuments > 0)} |`);
md.push(`| Rättslig klassificering verifierad | ${count(row => row.legalClassificationVerified)} |`);
md.push(`| Juridisk granskning återstår | ${count(row => row.legalReviewOutstanding)} |`);
md.push(`| Flaggade påståenden i produkttext | ${count(row => row.unsupportedClaims.length > 0)} |`);
md.push(`| Köpbara (sandbox / live) | ${count(row => row.commerce.sandboxEnabled)} / ${count(row => row.commerce.liveEnabled)} |`, '');
md.push('Granskningsstatus:', '');
for (const [status, label] of Object.entries(REVIEW_STATUS_LABELS)) md.push(`- ${label}: ${count(row => row.review.status === status)}`);
md.push('', '## Per produkt', '');
md.push('Kolumner: risk = automatisk indikator · synlig = publikt i detta läge · innehåll = verifierade textfält · bruk = angivet användningsområde · rapporter/dokument = publicerade labbrapporter / godkända dokument · status = granskningsstatus · granskning kvar = juridisk granskning återstår.', '');
md.push('| Produkt | Id | Kategori | Varianter | Risk | Synlig | Innehåll | Bruk | Rapporter/dok. | Status | Granskning kvar |', '| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |');
for (const row of rows) {
  md.push(`| ${row.name.replaceAll('|', '/')} | \`${row.id}\` | ${categories[row.category] || row.category} | ${row.variants.length} | ${row.suggestion.level === 'high' ? '**hög**' : 'förhöjd'} | ${row.publiclyVisible ? 'ja' : 'nej'} | ${row.verifiedContentFields.length ? row.verifiedContentFields.join(', ') : 'saknas'} | ${row.statedUse ? 'angivet' : 'saknas'} | ${row.publishedLabReports}/${row.approvedDocuments} | ${REVIEW_STATUS_LABELS[row.review.status]} | ${row.legalReviewOutstanding ? 'ja' : 'nej'} |`);
}
md.push('', '## Skäl bakom riskindikatorn', '');
const reasons = new Map();
for (const row of rows) for (const reason of row.suggestion.reasons) reasons.set(reason, (reasons.get(reason) || 0) + 1);
for (const [reason, n] of [...reasons].sort((a, b) => b[1] - a[1])) md.push(`- ${reason} (${n} produkter)`);
md.push('', 'Produkter med hög indikator:', '');
md.push(rows.filter(row => row.suggestion.level === 'high').map(row => row.name).join(', ') + '.');
fs.writeFileSync(path.join(outDir, 'PRODUCT-COMPLIANCE-INVENTORY.md'), `${md.join('\n')}\n`);
console.log(`Wrote docs/v17/PRODUCT-COMPLIANCE-INVENTORY.{md,csv} for ${rows.length} products (gate: ${gate}, source: ${source}).`);
