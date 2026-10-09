import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'assets', 'catalogue-data.js'), 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'catalogue-data.js' });
const catalogue = sandbox.window.VERAPEP_CATALOGUE;
if (!catalogue || !Array.isArray(catalogue.products)) {
  throw new Error('Could not parse VERAPEP_CATALOGUE from assets/catalogue-data.js');
}

const normalised = {
  ...catalogue,
  generatedAt: new Date().toISOString(),
  products: catalogue.products.map(product => ({
    ...product,
    variants: product.variants.map(variant => ({
      ...variant,
      variantId: `${product.id}--row-${variant.sourceRow}`
    }))
  }))
};

const policy = {
  version: 1,
  mode: 'sandbox-only',
  defaultStatus: 'catalogue_only',
  explanation: 'All catalogue products are blocked from live checkout by default. Sandbox checkout is for local QA only and does not represent legal or commercial approval.',
  products: Object.fromEntries(normalised.products.map(product => [product.id, {
    status: 'catalogue_only',
    sandboxEnabled: true,
    liveEnabled: false,
    reviewReference: null,
    note: 'Requires explicit product-by-product legal, regulatory, safety and commercial review before any live sale.'
  }]))
};

const inventory = {
  version: 1,
  updatedAt: new Date().toISOString(),
  note: 'Synthetic sandbox stock for testing only. Not real inventory.',
  variants: Object.fromEntries(normalised.products.flatMap(product => product.variants.map(variant => [variant.variantId, {
    productId: product.id,
    productName: product.name,
    catalogueNo: variant.catalogueNo,
    specification: variant.specification,
    onHand: 25,
    reserved: 0,
    reorderPoint: 5,
    synthetic: true
  }])) )
};

const storeConfig = {
  version: 1,
  storeName: 'VERAPEP',
  currency: 'USD',
  priceSource: 'priceUsd1',
  priceSourceLabel: 'Excel Column D',
  checkoutMode: 'sandbox',
  tax: {
    configured: false,
    rate: 0,
    label: 'Tax configuration required before launch'
  },
  shippingMethods: [
    {
      id: 'sandbox-standard',
      name: 'Sandbox standard delivery',
      description: 'Test-only delivery option. No carrier booking is created.',
      price: 15,
      freeThreshold: 250,
      estimatedDays: '3–7 test business days'
    },
    {
      id: 'sandbox-express',
      name: 'Sandbox express delivery',
      description: 'Test-only express option. No carrier booking is created.',
      price: 30,
      freeThreshold: null,
      estimatedDays: '1–3 test business days'
    }
  ],
  allowedCountries: [
    { code: 'MT', name: 'Malta' },
    { code: 'SE', name: 'Sweden' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'ES', name: 'Spain' },
    { code: 'IT', name: 'Italy' },
    { code: 'IE', name: 'Ireland' }
  ]
};

fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'catalogue.json'), `${JSON.stringify(normalised, null, 2)}\n`);
fs.writeFileSync(path.join(root, 'data', 'commerce-policy.json'), `${JSON.stringify(policy, null, 2)}\n`);
fs.writeFileSync(path.join(root, 'data', 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
fs.writeFileSync(path.join(root, 'data', 'store-config.json'), `${JSON.stringify(storeConfig, null, 2)}\n`);
for (const [file, initial] of [['orders.json', []], ['returns.json', []]]) {
  const target = path.join(root, 'data', file);
  if (!fs.existsSync(target)) fs.writeFileSync(target, `${JSON.stringify(initial, null, 2)}\n`);
}
console.log(`Generated storefront data for ${normalised.productCount} products and ${normalised.variantCount} variants.`);
