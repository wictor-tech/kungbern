import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'data/catalogue.json'), 'utf8'));
const content = JSON.parse(fs.readFileSync(path.join(root, 'data/product-content.json'), 'utf8')).products;
const rows = catalogue.products.map(product => {
  const item = content[product.id] || {};
  return {
    productId: product.id,
    name: item.displayName || product.name,
    imageUrl: item.imageUrl || '',
    imageAlt: item.imageAlt || '',
    srcset: item.imageSrcset || '',
    status: item.imageUrl ? (item.imageAlt ? 'ready' : 'missing_alt') : 'missing_image'
  };
});
const escape = value => `"${String(value ?? '').replaceAll('"','""')}"`;
const csv = ['productId,name,imageUrl,imageAlt,srcset,status', ...rows.map(row => Object.values(row).map(escape).join(','))].join('\n');
const output = path.join(root, 'product-image-audit.csv');
fs.writeFileSync(output, `${csv}\n`);
const ready = rows.filter(row => row.status === 'ready').length;
console.log(`Product image audit: ${ready}/${rows.length} products have an image and alt text.`);
console.log(`Created ${output}`);
