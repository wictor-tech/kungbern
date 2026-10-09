import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VerapepDatabase, verifyPassword } from './database.mjs';
import { REVIEW_STATUSES, NON_APPROVAL_STATUSES, APPROVAL_SCOPES, APPROVAL_CONFIRMATION, recordFor, resolveGateMode, publicVisibility, saleApproved, inventoryRow, suggestRisk } from './lib/compliance.mjs';

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadDotEnv(path.join(APP_ROOT, '.env'));

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

const ORDER_STATUSES = new Set(['awaiting_payment', 'processing', 'packed', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled', 'refunded']);
const RETURN_STATUSES = new Set(['requested', 'approved', 'rejected', 'received', 'refunded']);
const MAX_BODY_BYTES = 1_000_000;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const APP_ENV = String(process.env.APP_ENV || process.env.NODE_ENV || 'development').trim().toLowerCase();
const IS_PRODUCTION = APP_ENV === 'production';
const LIVE_COMMERCE_REQUESTED = String(process.env.ENABLE_LIVE_COMMERCE || '').toLowerCase() === 'true';
const LIVE_COMMERCE_ACK = String(process.env.LIVE_COMMERCE_ACK || '');
const LIVE_COMMERCE_ACK_VALUE = 'I_UNDERSTAND_LIVE_COMMERCE_REQUIRES_LEGAL_APPROVAL';

function readJsonSync(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw new Error(`Could not read ${filePath}: ${error.message}`);
  }
}

async function writeJsonAtomic(filePath, value) {
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fsp.rename(temp, filePath);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function makeOrderId() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  // 48 bits of random entropy makes order identifiers substantially harder to guess.
  return `VP-${date}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

function makeReturnId() {
  return `RET-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

function moneyToCents(value) {
  return Math.round(Number(value) * 100);
}

function centsToMoney(value) {
  return Math.round(Number(value)) / 100;
}

function clampInt(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function cleanText(value, maxLength = 200) {
  return String(value ?? '').trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, maxLength);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim()) && String(value).length <= 254;
}

/* v17: links stored by admins are rendered for visitors. Allow site paths and https:// only
   (optionally mailto:), never javascript:, data: or protocol-relative URLs. */
export function safePublicUrl(value, { allowMailto = false } = {}) {
  const url = String(value ?? '').trim();
  if (!url) return false;
  if (/^https:\/\/[^\s]+$/i.test(url)) return true;
  if (allowMailto && /^mailto:[^\s@]+@[^\s@]+$/i.test(url)) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//') || url.includes('\\')) return false;
  return /^[\w\-./#?=&%~]+$/.test(url);
}

/* v17: admin user records returned to clients or written to the audit log never include secrets. */
function sanitiseAdminUser(user) {
  if (!user) return user;
  const { passwordHash, mfaSecret, recoveryCodeHashes, ...safe } = user;
  return { ...safe, recoveryCodesRemaining: Array.isArray(recoveryCodeHashes) ? recoveryCodeHashes.length : 0 };
}

/* v17: behind a reverse proxy (Render, nginx) every request arrives from the proxy address,
   which made per-IP rate limits global. Trust X-Forwarded-For only when explicitly configured. */
function clientIp(req) {
  if (String(process.env.TRUST_PROXY || '').toLowerCase() === 'true') {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || 'unknown';
}

export function containsContactDetails(value) {
  const text = String(value || '');
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text)) return true;
  // Phone numbers: a run of 9+ digits with common separators (dates such as 2025-10-09 have 8).
  return (text.match(/\+?\d[\d\s().-]{6,}\d/g) || []).some(run => run.replace(/\D/g, '').length >= 9);
}

function validAdminPassword(value) {
  const password = String(value || '');
  return password.length >= 12 && password.length <= 200;
}

function decodeBase32(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(value || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function encodeBase32(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let output = '';
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, '0');
    output += alphabet[Number.parseInt(chunk, 2)];
  }
  return output;
}

function generateTotpSecret() {
  return encodeBase32(crypto.randomBytes(20));
}

function generateRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `VP-${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

function normaliseRecoveryCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function mfaEncryptionKey() {
  const material = String(process.env.MFA_ENCRYPTION_KEY || '');
  if (!material) return null;
  return crypto.createHash('sha256').update(material).digest();
}

function encryptMfaSecret(secret) {
  const key = mfaEncryptionKey();
  if (!key) return String(secret || '');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(secret || ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

function decryptMfaSecret(value) {
  const stored = String(value || '');
  if (!stored.startsWith('enc:v1:')) return stored;
  const key = mfaEncryptionKey();
  if (!key) return '';
  const [, , ivText, tagText, encryptedText] = stored.split(':');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function verifyTotp(code, secret, now = Date.now()) {
  const candidate = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(candidate) || !secret) return false;
  const key = decodeBase32(secret);
  if (!key.length) return false;
  const counter = Math.floor(now / 30000);
  for (const offset of [-1, 0, 1]) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter + offset));
    const digest = crypto.createHmac('sha1', key).update(buffer).digest();
    const position = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[position] & 0x7f) << 24) | (digest[position + 1] << 16) | (digest[position + 2] << 8) | digest[position + 3];
    const expected = String(binary % 1_000_000).padStart(6, '0');
    if (safeEqual(candidate, expected)) return true;
  }
  return false;
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf('=');
    return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

function publicOrder(order, includeCustomer = true) {
  const copy = structuredClone(order);
  delete copy.accessTokenHash;
  if (!includeCustomer) {
    delete copy.customer;
    delete copy.shippingAddress;
  }
  return copy;
}

function nowIso() {
  return new Date().toISOString();
}

function securityHeaders(contentType = '', requestIsHttps = false) {
  return {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.stripe.com; frame-src https://checkout.stripe.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com",
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(self)',
    ...(IS_PRODUCTION ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
    ...(contentType ? { 'Content-Type': contentType } : {})
  };
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  // Transport compression for larger responses (the storefront payload is ~150 KB).
  // The JSON contract is unchanged; clients negotiate via Accept-Encoding.
  const accepted = String(res.vpAcceptEncoding || '');
  let responseBody = body;
  let encoding = null;
  if (Buffer.byteLength(body) > 2048 && !extraHeaders['Content-Encoding']) {
    if (accepted.includes('br')) { responseBody = zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }); encoding = 'br'; }
    else if (accepted.includes('gzip')) { responseBody = zlib.gzipSync(body, { level: 6 }); encoding = 'gzip'; }
  }
  res.writeHead(status, {
    ...securityHeaders('application/json; charset=utf-8'),
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(responseBody),
    Vary: 'Accept-Encoding',
    ...(encoding ? { 'Content-Encoding': encoding } : {}),
    ...extraHeaders
  });
  res.end(responseBody);
}

function sendText(res, status, body, contentType = 'text/plain; charset=utf-8', extraHeaders = {}) {
  res.writeHead(status, {
    ...securityHeaders(contentType),
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
}

async function readBodyBuffer(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('Request body is too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  const buffer = await readBodyBuffer(req);
  if (!buffer.length) return {};
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    const error = new Error('Invalid JSON body.');
    error.status = 400;
    throw error;
  }
}

function errorPayload(error) {
  return {
    error: error.code || 'request_failed',
    message: error.expose === false ? 'The request could not be completed.' : error.message
  };
}

function createRateLimiter() {
  const buckets = new Map();
  return function rateLimit(key, max, windowMs) {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: max - 1 };
    }
    bucket.count += 1;
    return { allowed: bucket.count <= max, remaining: Math.max(0, max - bucket.count), retryAfterMs: bucket.resetAt - now };
  };
}

function buildStripeForm(order, baseUrl) {
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', `${baseUrl}/order.html?order=${encodeURIComponent(order.id)}&token=${encodeURIComponent(order.accessTokenForRedirect)}&stripe_session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${baseUrl}/checkout.html?order=${encodeURIComponent(order.id)}&token=${encodeURIComponent(order.accessTokenForRedirect)}&payment=cancelled`);
  params.set('customer_email', order.customer.email);
  params.set('client_reference_id', order.id);
  params.set('metadata[order_id]', order.id);
  params.set('metadata[test_mode]', order.testMode ? 'true' : 'false');
  params.set('expires_at', String(Math.floor(Date.now() / 1000) + 30 * 60));
  let index = 0;
  for (const item of order.items) {
    params.set(`line_items[${index}][quantity]`, String(item.quantity));
    params.set(`line_items[${index}][price_data][currency]`, order.currency.toLowerCase());
    params.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitPriceCents));
    params.set(`line_items[${index}][price_data][product_data][name]`, `${item.productName} — ${item.specification}`.slice(0, 200));
    params.set(`line_items[${index}][price_data][product_data][metadata][product_id]`, item.productId);
    params.set(`line_items[${index}][price_data][product_data][metadata][variant_id]`, item.variantId);
    index += 1;
  }
  if (order.shippingCents > 0) {
    params.set(`line_items[${index}][quantity]`, '1');
    params.set(`line_items[${index}][price_data][currency]`, order.currency.toLowerCase());
    params.set(`line_items[${index}][price_data][unit_amount]`, String(order.shippingCents));
    params.set(`line_items[${index}][price_data][product_data][name]`, order.shippingMethod.name);
    index += 1;
  }
  if (order.taxCents > 0) {
    params.set(`line_items[${index}][quantity]`, '1');
    params.set(`line_items[${index}][price_data][currency]`, order.currency.toLowerCase());
    params.set(`line_items[${index}][price_data][unit_amount]`, String(order.taxCents));
    params.set(`line_items[${index}][price_data][product_data][name]`, 'Tax');
  }
  return params;
}

function parseStripeSignature(header) {
  const output = {};
  for (const part of String(header ?? '').split(',')) {
    const [key, value] = part.split('=', 2);
    if (!key || !value) continue;
    if (!output[key]) output[key] = [];
    output[key].push(value);
  }
  return output;
}

function verifyStripeSignature(payload, signatureHeader, secret, toleranceSeconds = 300) {
  const parsed = parseStripeSignature(signatureHeader);
  const timestamp = Number(parsed.t?.[0]);
  if (!timestamp || !parsed.v1?.length) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return parsed.v1.some(candidate => safeEqual(candidate, expected));
}

export function createVerapepServer(options = {}) {
  const rootDir = path.resolve(options.rootDir || APP_ROOT);
  const dataDir = path.resolve(options.dataDir || process.env.DATA_DIR || path.join(rootDir, 'data'));
  if (IS_PRODUCTION && !options.skipProductionGuards) {
    if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'ChangeMe-123!') throw new Error('Production startup blocked: set a strong ADMIN_PASSWORD secret.');
    if (!process.env.DATA_DIR) throw new Error('Production startup blocked: configure DATA_DIR on persistent storage or migrate to a managed transactional database.');
    if (LIVE_COMMERCE_REQUESTED && LIVE_COMMERCE_ACK !== LIVE_COMMERCE_ACK_VALUE) throw new Error('Production startup blocked: live commerce acknowledgement is missing.');
  }
  const outboxDir = path.join(dataDir, 'outbox');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(outboxDir, { recursive: true });

  const paths = {
    catalogue: path.join(dataDir, 'catalogue.json'),
    policy: path.join(dataDir, 'commerce-policy.json'),
    inventory: path.join(dataDir, 'inventory.json'),
    config: path.join(dataDir, 'store-config.json'),
    orders: path.join(dataDir, 'orders.json'),
    returns: path.join(dataDir, 'returns.json'),
    withdrawals: path.join(dataDir, 'withdrawals.json'),
    productContent: path.join(dataDir, 'product-content.json'),
    reviews: path.join(dataDir, 'reviews.json'),
    guide: path.join(dataDir, 'guide-config.json'),
    supportKb: path.join(dataDir, 'support-kb.json'),
    customers: path.join(dataDir, 'customers.json'),
    productCompliance: path.join(dataDir, 'product-compliance.json')
  };

  const database = new VerapepDatabase({
    dataDir,
    seedFiles: {
      catalogue: paths.catalogue,
      config: paths.config,
      policy: paths.policy,
      inventory: paths.inventory,
      orders: paths.orders,
      returns: paths.returns,
      withdrawals: paths.withdrawals,
      productContent: paths.productContent,
      reviews: paths.reviews,
      guide: paths.guide,
      supportKb: paths.supportKb,
      customers: paths.customers,
      productCompliance: paths.productCompliance
    },
    defaultAdmin: {
      email: process.env.ADMIN_EMAIL || 'admin@verapep.local',
      password: process.env.ADMIN_PASSWORD || 'ChangeMe-123!',
      displayName: 'VERAPEP owner',
      role: 'owner'
    }
  });

  const catalogue = database.readDocument('catalogue');
  const config = database.readDocument('config');
  let policy = database.readDocument('policy');
  let inventory = database.readDocument('inventory');
  let orders = database.readDocument('orders', []);
  let returns = database.readDocument('returns', []);
  let withdrawals = database.readDocument('withdrawals', []);
  let productContent = database.readDocument('productContent', { version: 1, products: {} });
  let reviews = database.readDocument('reviews', { version: 1, reviews: [] });
  let guide = database.readDocument('guide', { version: 1, enabled: false, questions: [], rules: [] });
  let supportKb = database.readDocument('supportKb', { version: 1, entries: [], fallback: 'Please contact support.' });
  let customers = database.readDocument('customers', { version: 1, customers: [] });
  // v17: human compliance decisions per product. Absent record = "not reviewed".
  let compliance = database.readDocument('productCompliance', { version: 1, products: {} });
  if (!compliance.products) compliance.products = {};
  const gateMode = resolveGateMode({ isProduction: IS_PRODUCTION, configured: process.env.PUBLICATION_GATE });

  const productsById = new Map(catalogue.products.map(product => [product.id, product]));
  const variantsById = new Map();
  for (const product of catalogue.products) {
    for (const variant of product.variants) variantsById.set(variant.variantId, { product, variant });
  }

  const sessions = new Map();
  const rateLimit = createRateLimiter();
  let writeChain = Promise.resolve();
  let storefrontRevision = 1;
  const storefrontClients = new Set();

  function broadcastStorefront(reason = 'updated') {
    storefrontRevision += 1;
    const event = `event: storefront\ndata: ${JSON.stringify({ revision: storefrontRevision, reason, at: nowIso() })}\n\n`;
    for (const response of [...storefrontClients]) {
      try { response.write(event); } catch { storefrontClients.delete(response); }
    }
  }

  function enqueueWrite(operation) {
    writeChain = writeChain.then(operation, operation);
    return writeChain;
  }

  function liveEnvironmentConfigured() {
    return IS_PRODUCTION
      && LIVE_COMMERCE_REQUESTED
      && LIVE_COMMERCE_ACK === LIVE_COMMERCE_ACK_VALUE
      && Boolean(process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_'))
      && Boolean(process.env.STRIPE_WEBHOOK_SECRET)
      && Boolean(process.env.DATA_DIR)
      && String(process.env.PRODUCTION_PERSISTENCE_ACK || '').toLowerCase() === 'true';
  }

  function getMode() {
    if (config.checkoutMode === 'catalogue_only') return 'catalogue-only';
    if (IS_PRODUCTION) return liveEnvironmentConfigured() ? 'live' : 'catalogue-only';
    return process.env.TEST_COMMERCE_MODE === 'false' ? 'catalogue-only' : 'sandbox';
  }

  function stripeTestConfigured() {
    return Boolean(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'));
  }

  function stripeLiveConfigured() {
    return Boolean(process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_'));
  }

  function stripeConfigured() {
    return getMode() === 'live' ? stripeLiveConfigured() : stripeTestConfigured();
  }

  function liveAllowlist() {
    return new Set(String(process.env.COMMERCE_ALLOWLIST || '').split(',').map(value => value.trim()).filter(Boolean));
  }

  function stripeEligibility(item) {
    const allowlist = liveAllowlist();
    const commerce = policy.products[item.productId] || {};
    if (!complianceSaleApproved(item.productId)) return false;
    if (getMode() === 'live') {
      return stripeLiveConfigured()
        && commerce.liveEnabled === true
        && commerce.status === 'live_approved'
        && Boolean(commerce.reviewReference)
        && allowlist.has(item.variantId);
    }
    return stripeTestConfigured()
      && process.env.LEGAL_REVIEW_ACK === 'true'
      && allowlist.has(item.variantId)
      && commerce.sandboxEnabled === true;
  }

  const ROLE_ACCESS = {
    owner: new Set(['settings','products','inventory','orders','returns','reviews','guide','users','audit','refunds','privacy']),
    admin: new Set(['settings','products','inventory','orders','returns','reviews','guide','audit','refunds','privacy']),
    editor: new Set(['products','inventory','reviews','guide']),
    support: new Set(['orders','returns','reviews'])
  };

  function requireRole(session, permission) {
    if (!ROLE_ACCESS[session.role]?.has(permission)) {
      const error = new Error('Your admin role does not have permission for this action.');
      error.status = 403;
      error.code = 'admin_permission_denied';
      throw error;
    }
  }

  function audit(session, action, entityType, entityId, before, after) {
    database.addAudit({
      actorEmail: session?.email || 'system',
      actorRole: session?.role || 'system',
      action,
      entityType,
      entityId,
      before,
      after
    });
  }

  function derivePublicStatus(content = {}) {
    if (content.archived === true || content.stockStatus === 'archived') return 'archived';
    if (content.published === false) return 'draft';
    if (content.availableForSale === true && content.informationOnly === false) return 'available_for_sale';
    return 'information_only';
  }

  function complianceRecord(productId) {
    return recordFor(compliance, productId);
  }

  /* v17 single source of truth for public exposure: the editor's publish/archive flags AND the
     compliance gate. Everything public (storefront, product pages, guide, sitemap, reviews,
     product content, Ask Vera, cart) goes through this. */
  function isPubliclyVisible(productOrId) {
    const product = typeof productOrId === 'string' ? productsById.get(productOrId) : productOrId;
    if (!product) return false;
    const content = productContent.products[product.id] || {};
    if (content.published === false || content.archived === true || content.stockStatus === 'archived') return false;
    return publicVisibility(product, content, complianceRecord(product.id), gateMode).visible;
  }

  function visibleCatalogueProducts() {
    return catalogue.products.filter(product => isPubliclyVisible(product));
  }

  function complianceSaleApproved(productId, country = null) {
    return saleApproved(complianceRecord(productId), country);
  }

  function complianceBlocked(message) {
    const error = new Error(message);
    error.status = 409;
    error.code = 'compliance_approval_required';
    return error;
  }

  async function persistCompliance() {
    compliance.updatedAt = nowIso();
    await enqueueWrite(() => database.writeDocument('productCompliance', compliance));
    broadcastStorefront('compliance');
  }

  function productReadiness(productId) {
    const product = productsById.get(productId);
    const content = productContent.products[productId] || {};
    const missing = [];
    if (!content.displayName && !product?.name) missing.push('Product name');
    if (!content.imageUrl) missing.push('Product image');
    if (!content.shortDescription) missing.push('Short description');
    if (!content.published) missing.push('Published status');
    if (!Array.isArray(content.allowedCountries) || content.allowedCountries.length === 0) missing.push('Allowed countries');
    const eligibleVariants = (product?.variants || []).filter(variant => {
      const stock = inventory.variants[variant.variantId];
      return stock?.saleEnabled === true && Number.isInteger(stock.retailPriceCents) && stock.retailPriceCents > 0 && Number(stock.onHand) > Number(stock.reserved || 0);
    });
    if (eligibleVariants.length === 0) missing.push('At least one enabled variant with EUR price and available stock');
    if (!complianceSaleApproved(productId)) missing.push('Compliance approval for sale (owner decision with review reference)');
    return {
      ready: missing.length === 0,
      missing,
      eligibleVariants: eligibleVariants.map(variant => variant.variantId),
      status: derivePublicStatus(content)
    };
  }

  function productionReadiness() {
    const blockers = [];
    const warnings = [];
    const liveApprovedProducts = catalogue.products.filter(product => {
      const commerce = policy.products[product.id] || {};
      const content = productContent.products[product.id] || {};
      const complete = [content.shortDescription, content.fullDescription, content.warnings, content.ingredients, content.imageUrl].every(value => String(value || '').trim().length > 0);
      const countries = Array.isArray(content.allowedCountries) ? content.allowedCountries : [];
      return commerce.liveEnabled === true && commerce.status === 'live_approved' && Boolean(commerce.reviewReference) && complete && countries.length > 0;
    });

    if (!process.env.DATA_DIR) blockers.push('Persistent DATA_DIR is not configured.');
    if (String(process.env.PRODUCTION_PERSISTENCE_ACK || '').toLowerCase() !== 'true') blockers.push('Persistent-storage acknowledgement is missing.');
    if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'ChangeMe-123!') blockers.push('A production admin password is not configured.');
    const privilegedAdmins = database.listUsers().filter(user => user.enabled && ['owner','admin'].includes(user.role));
    const privilegedWithoutMfa = privilegedAdmins.filter(user => user.mfaEnabled !== true);
    if (privilegedAdmins.length === 0) blockers.push('No enabled owner/admin account exists.');
    if (privilegedWithoutMfa.length > 0) blockers.push(`${privilegedWithoutMfa.length} enabled owner/admin account(s) do not have per-user MFA enabled.`);
    if (!process.env.MFA_ENCRYPTION_KEY || String(process.env.MFA_ENCRYPTION_KEY).length < 32) blockers.push('MFA_ENCRYPTION_KEY must be a strong production secret of at least 32 characters.');
    const privilegedWithPlaintextMfa = privilegedAdmins.filter(user => { const record = database.findUser(user.email); return record?.mfaEnabled && !String(record.mfaSecret || '').startsWith('enc:v1:'); });
    if (privilegedWithPlaintextMfa.length > 0) blockers.push(`${privilegedWithPlaintextMfa.length} privileged admin MFA seed(s) are not encrypted at rest; re-enroll them after MFA_ENCRYPTION_KEY is configured.`);
    if (privilegedWithoutMfa.length > 0 && process.env.ADMIN_TOTP_SECRET) warnings.push('Bootstrap ADMIN_TOTP_SECRET is configured, but per-user MFA is still required before launch.');
    if (!String(process.env.BASE_URL || '').startsWith('https://')) blockers.push('BASE_URL must use HTTPS.');
    if (config.tax?.configured !== true) blockers.push('Tax configuration is not approved.');
    if (!Array.isArray(config.shippingMethods) || config.shippingMethods.length === 0) blockers.push('No shipping method is configured.');
    const emailMode = String(process.env.EMAIL_DELIVERY_MODE || 'outbox').toLowerCase();
    if (emailMode === 'outbox') blockers.push('Transactional email delivery is still in local outbox mode.');
    if (emailMode === 'webhook' && !process.env.EMAIL_WEBHOOK_URL) blockers.push('Transactional email webhook mode is selected but EMAIL_WEBHOOK_URL is missing.');
    if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')) blockers.push('Stripe live credentials are not configured.');
    if (!process.env.STRIPE_WEBHOOK_SECRET) blockers.push('Stripe webhook secret is not configured.');
    if (liveAllowlist().size === 0) blockers.push('COMMERCE_ALLOWLIST contains no explicitly approved live variants.');
    if (!LIVE_COMMERCE_REQUESTED) blockers.push('ENABLE_LIVE_COMMERCE is not enabled.');
    if (LIVE_COMMERCE_ACK !== LIVE_COMMERCE_ACK_VALUE) blockers.push('Live-commerce acknowledgement is not present.');
    if (liveApprovedProducts.length === 0) blockers.push('No product has complete content plus an explicit live legal/compliance approval.');
    const complianceRecords = catalogue.products.map(product => complianceRecord(product.id));
    const approvedForPublication = complianceRecords.filter(record => record.status === 'approved_for_publication').length;
    const undecided = complianceRecords.filter(record => !['approved_for_publication', 'do_not_publish'].includes(record.status)).length;
    if (approvedForPublication === 0) blockers.push('No product has a recorded compliance approval for publication (qualified legal review).');
    if (undecided > 0) warnings.push(`${undecided} of ${catalogue.products.length} products have no final compliance decision; they stay hidden in production.`);
    const changedAfterApproval = complianceRecords.filter(record => record.status === 'approved_for_publication' && record.contentChangedAfterApproval).length;
    if (changedAfterApproval > 0) blockers.push(`${changedAfterApproval} approved product(s) changed after approval and need re-review.`);
    if (gateMode !== 'strict') warnings.push('Publication gate is in preview mode: unreviewed lower-risk products are visible. Production always uses the strict gate.');
    if (!process.env.COMPANY_LEGAL_NAME || !process.env.COMPANY_REGISTRATION_NUMBER || !process.env.COMPANY_ADDRESS) blockers.push('Required company identity details are incomplete.');
    if (String(process.env.PRIVACY_REVIEW_ACK || '').toLowerCase() !== 'true') blockers.push('Privacy/GDPR review acknowledgement is missing.');
    if (String(process.env.LEGAL_TERMS_REVIEW_ACK || '').toLowerCase() !== 'true') blockers.push('Terms/consumer-law review acknowledgement is missing.');
    if (String(process.env.PRODUCTION_CHECKOUT_TEST_ACK || '').toLowerCase() !== 'true') blockers.push('End-to-end production checkout rehearsal acknowledgement is missing.');
    if (!process.env.MONITORING_WEBHOOK_URL) warnings.push('No external monitoring/alert endpoint is configured.');
    if (String(process.env.PRODUCTION_SEO_INDEXING || '').toLowerCase() !== 'true') warnings.push('Search-engine indexing remains disabled. Enable it only after legal/product content is final.');
    if (database.filePath && String(process.env.ALLOW_SQLITE_PRODUCTION || '').toLowerCase() !== 'true') blockers.push('Managed transactional database migration is not complete. SQLite production requires an explicit ALLOW_SQLITE_PRODUCTION=true exception plus persistent storage.');
    else if (database.filePath) warnings.push('SQLite production exception is enabled. Keep the service single-instance and test backup/restore procedures regularly.');

    return {
      ready: blockers.length === 0,
      environment: APP_ENV,
      blockers,
      warnings,
      liveApprovedProducts: liveApprovedProducts.length,
      publicationGate: gateMode,
      complianceApproved: approvedForPublication,
      totalProducts: catalogue.productCount,
      checkedAt: nowIso()
    };
  }

  function productPublic(product) {
    const storedContent = productContent.products[product.id] || {};
    const readiness = productReadiness(product.id);
    const content = { ...storedContent, publicStatus: derivePublicStatus(storedContent), readiness };
    const productPolicy = policy.products[product.id] || { status: policy.defaultStatus, sandboxEnabled: false, liveEnabled: false };
    const baseSaleReady = content?.published !== false
      && content?.stockStatus !== 'archived'
      && content?.availableForSale === true
      && content?.informationOnly === false
      && Array.isArray(content?.allowedCountries) && content.allowedCountries.length > 0;
    const completeForLive = [content.shortDescription, content.fullDescription, content.warnings, content.ingredients, content.imageUrl]
      .every(value => String(value || '').trim().length > 0);
    const sandboxSaleEnabled = getMode() === 'sandbox' && baseSaleReady && productPolicy.sandboxEnabled === true;
    const liveSaleEnabled = getMode() === 'live'
      && baseSaleReady
      && completeForLive
      && productPolicy.liveEnabled === true
      && productPolicy.status === 'live_approved'
      && Boolean(productPolicy.reviewReference);
    // v17: no sale of any kind without a recorded compliance approval whose scope includes sale.
    const productSaleEnabled = (sandboxSaleEnabled || liveSaleEnabled) && complianceSaleApproved(product.id);
    return {
      ...product,
      content,
      reviews: (() => { const approved = reviews.reviews.filter(review => review.productId === product.id && review.status === 'approved'); return { count: approved.length, average: approved.length ? approved.reduce((sum, review) => sum + Number(review.rating || 0), 0) / approved.length : 0 }; })(),
      commerce: {
        status: productPolicy.status,
        sandboxEnabled: sandboxSaleEnabled,
        checkoutEnabled: productSaleEnabled,
        liveEnabled: liveSaleEnabled,
        mode: getMode(),
        reviewReference: productPolicy.reviewReference || null,
        note: productPolicy.note || null
      },
      variants: product.variants.map(variant => {
        const stock = inventory.variants[variant.variantId];
        const available = stock ? Math.max(0, stock.onHand - stock.reserved) : 0;
        const retailPriceCents = Number.isInteger(stock?.retailPriceCents) && stock.retailPriceCents > 0 ? stock.retailPriceCents : null;
        const checkoutEnabled = productSaleEnabled && stock?.saleEnabled === true && retailPriceCents !== null && available > 0;
        return {
          ...variant,
          retailPriceCents,
          saleEnabled: stock?.saleEnabled === true,
          checkoutEnabled,
          sandboxStock: available,
          availableStock: available,
          stockIsSynthetic: getMode() !== 'live'
        };
      })
    };
  }

  function storefrontPayload() {
    const visible = visibleCatalogueProducts();
    return {
      mode: getMode(),
      environment: APP_ENV,
      revision: storefrontRevision,
      warning: getMode() === 'sandbox'
        ? 'Preview webshop. Products become purchasable only after explicit admin approval, EUR price, stock and country settings.'
        : getMode() === 'live'
          ? 'Live checkout is enabled only for explicitly approved products and destinations.'
          : 'Catalogue mode. Checkout is disabled.',
      paymentMode: getMode() === 'live' ? 'stripe_live' : getMode() === 'sandbox' ? 'sandbox' : 'disabled',
      stripeConfigured: stripeConfigured(),
      stripeTestConfigured: stripeTestConfigured(),
      stripeTestEligible: getMode() === 'sandbox' && stripeTestConfigured() && process.env.LEGAL_REVIEW_ACK === 'true' && liveAllowlist().size > 0,
      stripeLiveConfigured: stripeLiveConfigured(),
      config: {
        storeName: config.storeName,
        currency: config.currency,
        priceSource: config.priceSource,
        priceSourceLabel: config.priceSourceLabel,
        tax: config.tax,
        shippingMethods: config.shippingMethods,
        allowedCountries: config.allowedCountries,
        brand: { name: config.storeName, positioning: 'Clear catalogue information for European markets' },
        trustSignals: Array.isArray(config.trustSignals) ? config.trustSignals : [],
        assistantName: config.assistantName || 'Ask Vera',
        checkoutMode: config.checkoutMode || 'catalogue_only'
      },
      guide: { enabled: guide.enabled === true, disclaimer: guide.disclaimer || '', focusAreas: guide.focusAreas || [], priorities: guide.priorities || [] },
      categories: catalogue.categories.map(category => {
        const inCategory = visible.filter(product => product.category === category.id);
        return { ...category, count: inCategory.length, variantCount: inCategory.reduce((sum, product) => sum + product.variants.length, 0) };
      }),
      // v17: counts describe what is publicly listed, not the internal catalogue.
      productCount: visible.length,
      variantCount: visible.reduce((sum, product) => sum + product.variants.length, 0),
      publication: { gate: gateMode },
      products: visible.map(productPublic)
    };
  }

  function normaliseCartItems(rawItems) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      const error = new Error('Your cart is empty.');
      error.status = 400;
      error.code = 'empty_cart';
      throw error;
    }
    if (rawItems.length > 50) {
      const error = new Error('The cart contains too many line items.');
      error.status = 400;
      error.code = 'cart_too_large';
      throw error;
    }
    const merged = new Map();
    for (const raw of rawItems) {
      const variantId = cleanText(raw.variantId, 160);
      const quantity = clampInt(raw.quantity, 1, 99);
      const found = variantsById.get(variantId);
      if (!found) {
        const error = new Error(`Unknown product variant: ${variantId || 'missing ID'}.`);
        error.status = 400;
        error.code = 'unknown_variant';
        throw error;
      }
      if (!isPubliclyVisible(found.product)) {
        const error = new Error(`Unknown product variant: ${variantId}.`);
        error.status = 400;
        error.code = 'unknown_variant';
        throw error;
      }
      const publicProduct = productPublic(found.product);
      const publicVariant = publicProduct.variants.find(item => item.variantId === variantId);
      if (!publicProduct.commerce.checkoutEnabled || !publicVariant?.checkoutEnabled) {
        const error = new Error(`${found.product.name} is not enabled for webshop checkout. Check publication, sale approval, variant price and stock in admin.`);
        error.status = 403;
        error.code = 'product_not_checkout_enabled';
        throw error;
      }
      const existing = merged.get(variantId) || 0;
      merged.set(variantId, Math.min(99, existing + quantity));
    }
    return [...merged.entries()].map(([variantId, quantity]) => ({ variantId, quantity }));
  }

  function quote(rawItems, shippingMethodId = 'sandbox-standard', destinationCountry = '') {
    const items = normaliseCartItems(rawItems);
    const country = cleanText(destinationCountry, 2).toUpperCase();
    const eligibleShippingMethods = (config.shippingMethods || []).filter(method => {
      const allowed = Array.isArray(method.allowedCountries) ? method.allowedCountries : [];
      return !country || allowed.length === 0 || allowed.includes(country);
    });
    const shippingMethod = eligibleShippingMethods.find(method => method.id === shippingMethodId) || eligibleShippingMethods[0] || config.shippingMethods?.[0];
    if (!shippingMethod) {
      const error = new Error('No delivery method is configured for the selected destination.');
      error.status = 409;
      error.code = 'shipping_not_configured';
      throw error;
    }
    const lines = items.map(item => {
      const { product, variant } = variantsById.get(item.variantId);
      const stock = inventory.variants[variant.variantId];
      const available = stock ? Math.max(0, stock.onHand - stock.reserved) : 0;
      if (available < item.quantity) {
        const error = new Error(`Only ${available} units are available for ${product.name} (${variant.specification}).`);
        error.status = 409;
        error.code = 'insufficient_stock';
        throw error;
      }
      const retailPriceCents = stock?.retailPriceCents;
      if (!Number.isInteger(retailPriceCents) || retailPriceCents <= 0) {
        const error = new Error(`${product.name} (${variant.specification}) has no valid EUR retail price.`);
        error.status = 409;
        error.code = 'missing_price';
        throw error;
      }
      const unitPriceCents = retailPriceCents;
      return {
        productId: product.id,
        productName: product.name,
        category: product.category,
        variantId: variant.variantId,
        catalogueNo: variant.catalogueNo,
        specification: variant.specification,
        sourceRow: variant.sourceRow,
        quantity: item.quantity,
        unitPriceCents,
        unitPrice: centsToMoney(unitPriceCents),
        lineTotalCents: unitPriceCents * item.quantity,
        lineTotal: centsToMoney(unitPriceCents * item.quantity),
        available
      };
    });
    const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
    const methodBasePrice = Number(shippingMethod.countryPrices?.[country] ?? shippingMethod.price ?? 0);
    const methodFreeThreshold = shippingMethod.countryFreeThresholds?.[country] ?? shippingMethod.freeThreshold;
    const shippingCents = methodFreeThreshold && subtotalCents >= moneyToCents(methodFreeThreshold)
      ? 0
      : moneyToCents(methodBasePrice);
    const configuredRate = country && config.tax?.ratesByCountry && Object.hasOwn(config.tax.ratesByCountry, country)
      ? Number(config.tax.ratesByCountry[country])
      : Number(config.tax?.rate || 0);
    const taxConfigured = config.tax?.configured === true && Number.isFinite(configuredRate) && configuredRate >= 0;
    const taxCents = taxConfigured ? Math.round((subtotalCents + shippingCents) * configuredRate) : 0;
    const totalCents = subtotalCents + shippingCents + taxCents;
    return {
      mode: getMode(),
      currency: config.currency,
      priceSourceLabel: config.priceSourceLabel,
      destinationCountry: country || null,
      lines,
      subtotalCents,
      subtotal: centsToMoney(subtotalCents),
      shippingMethod,
      shippingCents,
      shipping: centsToMoney(shippingCents),
      taxConfigured,
      taxRate: taxConfigured ? configuredRate : null,
      taxLabel: config.tax?.label || 'VAT',
      taxCents,
      tax: centsToMoney(taxCents),
      totalCents,
      total: centsToMoney(totalCents),
      shippingOptions: eligibleShippingMethods.map(method => {
        const basePrice = Number(method.countryPrices?.[country] ?? method.price ?? 0);
        const freeThreshold = method.countryFreeThresholds?.[country] ?? method.freeThreshold;
        const cents = freeThreshold && subtotalCents >= moneyToCents(freeThreshold) ? 0 : moneyToCents(basePrice);
        return { ...method, quotedPriceCents: cents, quotedPrice: centsToMoney(cents) };
      })
    };
  }

  function validateCustomer(body) {
    const customer = {
      name: cleanText(body.customer?.name, 120),
      email: cleanText(body.customer?.email, 254).toLowerCase(),
      phone: cleanText(body.customer?.phone, 40)
    };
    const shippingAddress = {
      line1: cleanText(body.shippingAddress?.line1, 160),
      line2: cleanText(body.shippingAddress?.line2, 160),
      city: cleanText(body.shippingAddress?.city, 100),
      postalCode: cleanText(body.shippingAddress?.postalCode, 30),
      country: cleanText(body.shippingAddress?.country, 2).toUpperCase()
    };
    const errors = [];
    if (customer.name.length < 2) errors.push('Enter the customer name.');
    if (!validEmail(customer.email)) errors.push('Enter a valid email address.');
    if (shippingAddress.line1.length < 3) errors.push('Enter the delivery address.');
    if (shippingAddress.city.length < 2) errors.push('Enter the city.');
    if (shippingAddress.postalCode.length < 2) errors.push('Enter the postal code.');
    if (!config.allowedCountries.some(country => country.code === shippingAddress.country)) errors.push('Choose a supported delivery country.');
    if (body.acceptTerms !== true) errors.push(getMode() === 'live' ? 'Accept the terms and conditions.' : 'Accept the preview checkout terms.');
    if (getMode() === 'sandbox' && body.acceptSandboxNotice !== true) errors.push('Confirm that this is a non-commercial preview order.');
    if (errors.length) {
      const error = new Error(errors.join(' '));
      error.status = 400;
      error.code = 'invalid_checkout_details';
      throw error;
    }
    return { customer, shippingAddress };
  }

  function findOrder(orderId) {
    return orders.find(order => order.id === orderId);
  }

  function verifyOrderAccess(order, token, email) {
    if (!order) return false;
    if (token && safeEqual(sha256(token), order.accessTokenHash)) return true;
    return Boolean(email && safeEqual(String(email).trim().toLowerCase(), order.customer.email.toLowerCase()));
  }

  async function persistOrders() {
    await enqueueWrite(() => database.writeDocument('orders', orders));
  }

  async function persistInventory() {
    inventory.updatedAt = nowIso();
    await enqueueWrite(() => database.writeDocument('inventory', inventory));
    broadcastStorefront('inventory');
  }

  async function persistOrdersAndInventory(reason = 'commerce') {
    inventory.updatedAt = nowIso();
    await enqueueWrite(() => database.writeDocuments({ orders, inventory }));
    broadcastStorefront(reason);
  }

  async function persistPolicy() {
    await enqueueWrite(() => database.writeDocument('policy', policy));
    broadcastStorefront('commerce');
  }

  async function persistReturns() {
    await enqueueWrite(() => database.writeDocument('returns', returns));
  }

  async function persistWithdrawals() {
    await enqueueWrite(() => database.writeDocument('withdrawals', withdrawals));
  }

  async function persistProductContent() {
    productContent.updatedAt = nowIso();
    await enqueueWrite(() => database.writeDocument('productContent', productContent));
    broadcastStorefront('product');
  }

  async function persistReviews() {
    await enqueueWrite(() => database.writeDocument('reviews', reviews));
    broadcastStorefront('reviews');
  }

  async function persistGuide() {
    await enqueueWrite(() => database.writeDocument('guide', guide));
    broadcastStorefront('guide');
  }

  async function persistSupportKb() {
    await enqueueWrite(() => database.writeDocument('supportKb', supportKb));
    broadcastStorefront('support');
  }

  async function persistConfig() {
    await enqueueWrite(() => database.writeDocument('config', config));
    broadcastStorefront('settings');
  }

  async function notifyMonitoring(event) {
    const url = process.env.MONITORING_WEBHOOK_URL;
    if (!url) return;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: 'verapep', environment: APP_ENV, at: nowIso(), ...event }),
        signal: controller.signal
      });
      clearTimeout(timer);
    } catch {
      // Monitoring must never break the customer request path.
    }
  }

  async function queueEmail({ to, subject, type, orderId, content }) {
    const createdAt = nowIso();
    const deliveryMode = String(process.env.EMAIL_DELIVERY_MODE || 'outbox').toLowerCase();
    const message = {
      id: `mail_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      createdAt,
      to,
      from: process.env.EMAIL_FROM || 'VERAPEP <no-reply@verapep.invalid>',
      subject,
      type,
      orderId,
      delivery: deliveryMode,
      deliveryStatus: 'queued',
      content
    };

    if (deliveryMode === 'webhook' && process.env.EMAIL_WEBHOOK_URL) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(process.env.EMAIL_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.EMAIL_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.EMAIL_WEBHOOK_TOKEN}` } : {})
          },
          body: JSON.stringify(message),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`Email webhook returned HTTP ${response.status}`);
        message.deliveryStatus = 'accepted';
        message.deliveredAt = nowIso();
      } catch (error) {
        message.deliveryStatus = 'failed';
        message.deliveryError = cleanText(error.message, 300);
      }
    } else {
      message.delivery = 'outbox';
      message.deliveryStatus = 'stored';
    }

    const fileName = `${createdAt.replaceAll(':', '-')}-${message.id}.json`;
    await fsp.writeFile(path.join(outboxDir, fileName), `${JSON.stringify(message, null, 2)}\n`, 'utf8');
    return message;
  }

  async function createOrder(body) {
    const { customer, shippingAddress } = validateCustomer(body);
    const orderQuote = quote(body.items, body.shippingMethodId, shippingAddress.country);
    for (const line of orderQuote.lines) {
      const allowed = productContent.products[line.productId]?.allowedCountries || [];
      if (!complianceSaleApproved(line.productId, shippingAddress.country)) {
        const error = new Error(`${line.productName} is not approved for sale to the selected country.`);
        error.status = 403; error.code = 'country_not_approved'; throw error;
      }
      if (allowed.length && !allowed.includes(shippingAddress.country)) {
        const error = new Error(`${line.productName} is not enabled for delivery to the selected country.`);
        error.status = 403; error.code = 'country_not_allowed'; throw error;
      }
    }
    const accessToken = randomToken(32);
    const createdAt = nowIso();
    const order = {
      id: makeOrderId(),
      testMode: getMode() !== 'live',
      createdAt,
      updatedAt: createdAt,
      customer,
      shippingAddress,
      items: orderQuote.lines,
      currency: orderQuote.currency,
      priceSourceLabel: orderQuote.priceSourceLabel,
      subtotalCents: orderQuote.subtotalCents,
      shippingMethod: orderQuote.shippingMethod,
      shippingCents: orderQuote.shippingCents,
      taxConfigured: orderQuote.taxConfigured,
      taxLabel: orderQuote.taxLabel,
      taxCents: orderQuote.taxCents,
      totalCents: orderQuote.totalCents,
      termsVersion: process.env.TERMS_VERSION || 'preview-v14.1',
      privacyVersion: process.env.PRIVACY_VERSION || 'preview-v14.1',
      legalAcceptedAt: createdAt,
      paymentStatus: 'unpaid',
      paymentProvider: null,
      paymentReference: null,
      orderStatus: 'awaiting_payment',
      trackingNumber: null,
      carrier: null,
      accessTokenHash: sha256(accessToken),
      inventoryReserved: true,
      inventoryApplied: false,
      refundApplied: false,
      reservationExpiresAt: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
      timeline: [
        { status: 'order_created', label: getMode() === 'live' ? 'Order created' : 'Preview order created', at: createdAt, note: getMode() === 'live' ? 'Awaiting payment.' : 'Awaiting preview payment.' },
        { status: 'inventory_reserved', label: 'Inventory reserved', at: createdAt, note: 'Stock is reserved while payment is completed.' }
      ]
    };
    await reserveInventory(order.items, false);
    orders.unshift(order);
    await persistOrdersAndInventory('order_reserved');
    database.addAudit({ actorEmail: customer.email, actorRole: 'customer', action: 'order.created', entityType: 'order', entityId: order.id, after: publicOrder(order) });
    await queueEmail({
      to: customer.email,
      subject: `${order.id} — ${order.testMode ? 'preview order created' : 'order received'}`,
      type: 'order_created',
      orderId: order.id,
      content: order.testMode ? `Your VERAPEP preview order ${order.id} has been created. No real payment or shipment has occurred.` : `Your VERAPEP order ${order.id} has been received and is awaiting payment confirmation.`
    });
    return { order, accessToken };
  }

  async function reserveInventory(lines, persist = true) {
    for (const item of lines) {
      const stock = inventory.variants[item.variantId];
      if (!stock) continue;
      const available = Math.max(0, Number(stock.onHand || 0) - Number(stock.reserved || 0));
      if (available < item.quantity) {
        const error = new Error(`Inventory changed and no longer covers ${item.productName}.`);
        error.status = 409;
        error.code = 'inventory_changed';
        throw error;
      }
    }
    for (const item of lines) {
      const stock = inventory.variants[item.variantId];
      if (stock) stock.reserved = Number(stock.reserved || 0) + item.quantity;
    }
    if (persist) await persistInventory();
  }

  async function releaseReservation(order, persist = true) {
    if (!order.inventoryReserved || order.inventoryApplied) return;
    for (const item of order.items) {
      const stock = inventory.variants[item.variantId];
      if (stock) stock.reserved = Math.max(0, Number(stock.reserved || 0) - item.quantity);
    }
    order.inventoryReserved = false;
    if (persist) await persistInventory();
  }

  async function settleReservation(order, persist = true) {
    if (order.inventoryApplied) return;
    for (const item of order.items) {
      const stock = inventory.variants[item.variantId];
      if (!stock) continue;
      if (order.inventoryReserved) stock.reserved = Math.max(0, Number(stock.reserved || 0) - item.quantity);
      if (Number(stock.onHand || 0) < item.quantity) {
        const error = new Error(`Inventory changed and no longer covers ${item.productName}.`);
        error.status = 409;
        error.code = 'inventory_changed';
        throw error;
      }
      stock.onHand = Math.max(0, Number(stock.onHand || 0) - item.quantity);
    }
    order.inventoryReserved = false;
    order.inventoryApplied = true;
    if (persist) await persistInventory();
  }

  async function restockOrder(order, persist = true) {
    if (!order.inventoryApplied || order.refundApplied) return;
    for (const item of order.items) {
      const stock = inventory.variants[item.variantId];
      if (stock) stock.onHand = Number(stock.onHand || 0) + item.quantity;
    }
    order.refundApplied = true;
    if (persist) await persistInventory();
  }

  async function releaseExpiredReservations() {
    const cutoff = Date.now() - 30 * 60 * 1000;
    let changed = false;
    for (const order of orders) {
      if (order.paymentStatus === 'unpaid' && order.inventoryReserved && Date.parse(order.createdAt) < cutoff) {
        await releaseReservation(order, false);
        order.orderStatus = 'cancelled';
        order.updatedAt = nowIso();
        order.timeline.push({ status: 'reservation_expired', label: 'Inventory reservation expired', at: order.updatedAt, note: 'The unpaid checkout reservation expired after 30 minutes.' });
        changed = true;
      }
    }
    if (changed) await persistOrdersAndInventory('reservation_expired');
  }

  async function markOrderPaid(order, provider, reference) {
    if (order.paymentStatus === 'paid') return order;
    if (order.orderStatus === 'cancelled') { const error = new Error('This order reservation has expired or was cancelled.'); error.status = 409; error.code = 'order_cancelled'; throw error; }
    if (!order.inventoryApplied) await settleReservation(order, false);
    const at = nowIso();
    order.paymentStatus = 'paid';
    order.paymentProvider = provider;
    order.paymentReference = reference;
    order.orderStatus = 'processing';
    order.updatedAt = at;
    order.timeline.push({ status: 'payment_confirmed', label: order.testMode ? 'Preview payment confirmed' : 'Payment confirmed', at, note: `${provider} payment reference: ${reference}` });
    order.timeline.push({ status: 'processing', label: order.testMode ? 'Preparing preview order' : 'Preparing order', at, note: order.testMode ? 'Preview inventory has been adjusted.' : 'Inventory has been adjusted.' });
    await persistOrdersAndInventory('payment_confirmed');
    database.addAudit({ actorEmail: order.customer.email, actorRole: 'customer', action: 'order.payment_confirmed', entityType: 'order', entityId: order.id, after: publicOrder(order) });
    await queueEmail({
      to: order.customer.email,
      subject: `${order.id} — ${order.testMode ? 'preview payment confirmed' : 'payment confirmed'}`,
      type: 'payment_confirmed',
      orderId: order.id,
      content: order.testMode ? `The preview payment for ${order.id} is confirmed. No real shipment will occur.` : `Payment for ${order.id} is confirmed. The order is now being processed.`
    });
    return order;
  }

  async function createStripeRefund(order) {
    const expectedLive = order.paymentProvider === 'stripe_live';
    const key = process.env.STRIPE_SECRET_KEY || '';
    if (expectedLive ? !key.startsWith('sk_live_') : !key.startsWith('sk_test_')) {
      const error = new Error('The Stripe credential for this payment environment is not configured.');
      error.status = 503;
      error.code = 'stripe_refund_not_configured';
      throw error;
    }
    const sessionId = cleanText(order.paymentReference, 200);
    if (!sessionId.startsWith(expectedLive ? 'cs_live_' : 'cs_test_')) {
      const error = new Error('The order does not contain a valid Stripe Checkout reference.');
      error.status = 409;
      error.code = 'stripe_payment_reference_invalid';
      throw error;
    }
    const sessionResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent`, { headers: { Authorization: `Bearer ${key}` } });
    const session = await sessionResponse.json();
    if (!sessionResponse.ok) {
      const error = new Error(session.error?.message || 'Stripe payment details could not be retrieved for refund.');
      error.status = 502; error.code = 'stripe_error'; throw error;
    }
    const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!paymentIntent) {
      const error = new Error('Stripe has no refundable PaymentIntent for this order.');
      error.status = 409; error.code = 'stripe_payment_intent_missing'; throw error;
    }
    const form = new URLSearchParams();
    form.set('payment_intent', paymentIntent);
    form.set('metadata[order_id]', order.id);
    const response = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `verapep-refund-${order.id}`
      },
      body: form
    });
    const refund = await response.json();
    if (!response.ok) {
      const error = new Error(refund.error?.message || 'Stripe could not create the refund.');
      error.status = 502; error.code = 'stripe_refund_failed'; throw error;
    }
    return refund;
  }

  async function refundOrder(order, reason = 'Admin refund') {
    if (order.paymentStatus !== 'paid') {
      const error = new Error('Only a paid order can be refunded.');
      error.status = 409;
      error.code = 'order_not_paid';
      throw error;
    }
    const isStripe = ['stripe_live', 'stripe_test'].includes(order.paymentProvider);
    let providerRefund = null;
    if (isStripe) providerRefund = await createStripeRefund(order);
    if (!order.refundApplied && order.inventoryApplied) await restockOrder(order, false);
    const at = nowIso();
    order.paymentStatus = 'refunded';
    order.orderStatus = 'refunded';
    order.refundReference = providerRefund?.id || `mock_refund_${randomToken(8)}`;
    order.refundProviderStatus = providerRefund?.status || (order.testMode ? 'preview' : 'recorded');
    order.refundedAt = at;
    order.updatedAt = at;
    order.timeline.push({ status: 'refunded', label: order.testMode ? 'Preview refund recorded' : 'Refund recorded', at, note: cleanText(reason, 300) });
    await persistOrdersAndInventory('refund');
    await queueEmail({
      to: order.customer.email,
      subject: `${order.id} — ${order.testMode ? 'preview refund recorded' : 'refund confirmed'}`,
      type: 'refund_recorded',
      orderId: order.id,
      content: order.testMode ? `A preview refund has been recorded for ${order.id}.` : `A refund has been recorded for ${order.id}. Reference: ${order.refundReference}.`
    });
    return order;
  }

  function adminSession(req) {
    const token = parseCookies(req.headers.cookie).vp_admin;
    if (!token) return null;
    const session = sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      if (token) sessions.delete(token);
      return null;
    }
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    return session;
  }

  function requireAdmin(req) {
    const session = adminSession(req);
    if (!session) {
      const error = new Error('Admin authentication is required.');
      error.status = 401;
      error.code = 'admin_auth_required';
      throw error;
    }
    return session;
  }

  function requireCsrf(req, session) {
    if (!safeEqual(req.headers['x-csrf-token'] || '', session.csrf)) {
      const error = new Error('Invalid CSRF token.');
      error.status = 403;
      error.code = 'invalid_csrf';
      throw error;
    }
  }

  async function listOutbox() {
    const files = (await fsp.readdir(outboxDir)).filter(file => file.endsWith('.json')).sort().reverse().slice(0, 100);
    const messages = [];
    for (const file of files) {
      try {
        messages.push(JSON.parse(await fsp.readFile(path.join(outboxDir, file), 'utf8')));
      } catch {
        // Ignore a malformed local test message rather than breaking the admin view.
      }
    }
    return messages;
  }

  async function handleApi(req, res, url) {
    const method = req.method || 'GET';
    const pathname = url.pathname;
    const ip = clientIp(req);

    if (method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, version: '17.0.0', mode: getMode(), environment: APP_ENV, database: 'SQLite', publicationGate: gateMode, products: visibleCatalogueProducts().length, variants: visibleCatalogueProducts().reduce((sum, product) => sum + product.variants.length, 0), timestamp: nowIso() });
    }

    if (method === 'GET' && pathname === '/api/ready') {
      const readiness = productionReadiness();
      return sendJson(res, readiness.ready ? 200 : 503, readiness);
    }

    if (method === 'GET' && pathname === '/api/legal') {
      return sendJson(res, 200, {
        companyLegalName: process.env.COMPANY_LEGAL_NAME || 'VERAPEP operator — company details pending',
        companyRegistrationNumber: process.env.COMPANY_REGISTRATION_NUMBER || 'pending',
        companyAddress: process.env.COMPANY_ADDRESS || 'pending',
        supportEmail: process.env.SUPPORT_EMAIL || 'hello@verapep.eu',
        privacyEmail: process.env.PRIVACY_EMAIL || process.env.SUPPORT_EMAIL || 'privacy@verapep.eu',
        termsVersion: process.env.TERMS_VERSION || 'preview-v14.1',
        privacyVersion: process.env.PRIVACY_VERSION || 'preview-v14.1',
        environment: APP_ENV
      });
    }

    if (method === 'GET' && pathname === '/api/storefront') {
      return sendJson(res, 200, storefrontPayload());
    }

    if (method === 'GET' && pathname === '/api/storefront/events') {
      res.writeHead(200, { ...securityHeaders('text/event-stream; charset=utf-8'), 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`event: storefront\ndata: ${JSON.stringify({ revision: storefrontRevision, reason: 'connected', at: nowIso() })}\n\n`);
      storefrontClients.add(res);
      const keepAlive = setInterval(() => { try { res.write(': keep-alive\n\n'); } catch {} }, 20000);
      req.on('close', () => { clearInterval(keepAlive); storefrontClients.delete(res); });
      return;
    }


    if (method === 'GET' && pathname === '/api/product-content') {
      // v17: only content for publicly listed products (drafts and gated products stay internal).
      const visibleIds = new Set(visibleCatalogueProducts().map(product => product.id));
      const products = Object.fromEntries(Object.entries(productContent.products).filter(([id]) => visibleIds.has(id)));
      return sendJson(res, 200, { products, reviews: reviews.reviews.filter(review => review.status === 'approved' && visibleIds.has(review.productId)) });
    }

    if (method === 'POST' && pathname === '/api/guide/recommendations') {
      const limit = rateLimit(`guide:${ip}`, 120, 60 * 1000);
      if (!limit.allowed) return sendJson(res, 429, { error: 'rate_limited', message: 'Too many requests. Please wait a moment.' }, { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) });
      const body = await readJsonBody(req);
      const requestedCategory = cleanText(body.category, 40);
      const focuses = (Array.isArray(body.focuses) ? body.focuses : [body.focus]).map(value => cleanText(value, 80)).filter(Boolean);
      const needsSelected = (Array.isArray(body.needs) ? body.needs : [body.need]).map(value => cleanText(value, 80)).filter(Boolean);
      const priorities = Array.isArray(body.priorities) ? body.priorities.map(value => cleanText(value, 80)).filter(Boolean) : [];
      let products = visibleCatalogueProducts().map(productPublic).filter(product => {
        const goals = product.content?.discoveryGoals || [];
        const needs = product.content?.discoveryNeeds || [];
        if (requestedCategory && product.category !== requestedCategory) return false;
        if (focuses.length && !focuses.some(value => goals.includes(value))) return false;
        if (needsSelected.length && !needsSelected.some(value => needs.includes(value))) return false;
        if (priorities.includes('lab-report') && !(product.content?.labReports || []).some(report => report.published && report.url)) return false;
        if (priorities.includes('non-specialist') && product.content?.specialistOnly === true) return false;
        return product.content?.published !== false && product.content?.stockStatus !== 'archived';
      });
      const informationScore = product => [product.content?.shortDescription, product.content?.fullDescription, product.content?.ingredients, product.content?.storage, product.content?.warnings].filter(Boolean).length * 4 + ((product.content?.labReports || []).some(report => report.published && report.url) ? 6 : 0) + Math.min(4, product.variants.length);
      const relevance = product => focuses.filter(value => (product.content?.discoveryGoals || []).includes(value)).length * 40 + needsSelected.filter(value => (product.content?.discoveryNeeds || []).includes(value)).length * 25;
      if (priorities.includes('highest-rated')) products.sort((a,b) => b.reviews.average - a.reviews.average || b.reviews.count - a.reviews.count);
      else if (priorities.includes('most-reviewed')) products.sort((a,b) => b.reviews.count - a.reviews.count || b.reviews.average - a.reviews.average);
      else if (priorities.includes('complete-information')) products.sort((a,b) => informationScore(b) - informationScore(a) || relevance(b)-relevance(a));
      else products.sort((a,b) => relevance(b)-relevance(a) || (a.content?.displayName || a.name).localeCompare(b.content?.displayName || b.name));
      return sendJson(res, 200, { category: requestedCategory || null, focuses, needs: needsSelected, priorities, products, explanation: guide.disclaimer || 'Results are informational and do not constitute medical advice.' });
    }

    if (method === 'POST' && pathname === '/api/support/ask') {
      const body = await readJsonBody(req);
      const question = cleanText(body.question, 500).toLowerCase();
      const scored = supportKb.entries.map(entry => ({ entry, score: String(entry.question || '').toLowerCase().split(/\s+/).filter(word => word && question.includes(word)).length })).sort((a,b) => b.score-a.score);
      const best = scored[0];
      return sendJson(res, 200, best && best.score > 0 ? { answered: true, answer: best.entry.answer, url: best.entry.url || null } : { answered: false, answer: supportKb.fallback, liveSupport: 'mailto:hello@verapep.eu' });
    }

    if (method === 'GET' && pathname === '/api/reviews') {
      const productId = cleanText(url.searchParams.get('productId'), 160);
      return sendJson(res, 200, { reviews: reviews.reviews.filter(review => review.status === 'approved' && isPubliclyVisible(review.productId) && (!productId || review.productId === productId)) });
    }

    if (method === 'POST' && pathname === '/api/reviews') {
      const limit = rateLimit(`review:${ip}`, 5, 15 * 60 * 1000);
      if (!limit.allowed) return sendJson(res, 429, { error: 'rate_limited', message: 'You have sent several reviews in a short time. Please try again later.' }, { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) });
      const body = await readJsonBody(req);
      const productId = cleanText(body.productId, 160);
      if (!isPubliclyVisible(productId)) return sendJson(res, 404, { error: 'product_not_found', message: 'Product not found.' });
      const rating = clampInt(body.rating, 1, 5);
      const text = cleanText(body.text, 1200);
      const name = cleanText(body.name, 80) || 'Customer';
      if (text.length < 10) return sendJson(res, 400, { error: 'review_too_short', message: 'Please add a little more detail.' });
      // v17 data minimisation: reviews are published, so contact details must not be in them.
      if (containsContactDetails(`${text} ${name}`)) return sendJson(res, 400, { error: 'review_contains_personal_data', message: 'Please remove email addresses and phone numbers. Reviews are published, so they should not contain contact details.' });
      const review = { id: `review_${Date.now()}_${randomToken(4)}`, productId, rating, text, name, status: 'pending', verifiedPurchase: false, createdAt: nowIso() };
      reviews.reviews.unshift(review);
      await persistReviews();
      return sendJson(res, 201, { review, message: 'Thank you. Your review is awaiting moderation.' });
    }

    if (method === 'POST' && pathname === '/api/quote') {
      await releaseExpiredReservations();
      const body = await readJsonBody(req);
      return sendJson(res, 200, quote(body.items, body.shippingMethodId, body.country));
    }

    if (method === 'POST' && pathname === '/api/orders') {
      const limit = rateLimit(`order:${ip}`, 20, 60 * 60 * 1000);
      if (!limit.allowed) return sendJson(res, 429, { error: 'rate_limited', message: getMode() === 'live' ? 'Too many order attempts from this address.' : 'Too many preview orders from this address.' }, { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) });
      await releaseExpiredReservations();
      const body = await readJsonBody(req);
      const idempotencyKey = cleanText(req.headers['idempotency-key'] || body.idempotencyKey, 120);
      if (idempotencyKey) {
        const existing = database.getIdempotent('create_order', idempotencyKey);
        if (existing) return sendJson(res, 200, existing);
      }
      const { order, accessToken } = await createOrder(body);
      const response = { order: publicOrder(order), accessToken };
      if (idempotencyKey) database.putIdempotent('create_order', idempotencyKey, response);
      return sendJson(res, 201, response);
    }

    if (method === 'POST' && pathname === '/api/orders/lookup') {
      const limit = rateLimit(`order-lookup:${ip}`, 12, 15 * 60 * 1000);
      if (!limit.allowed) return sendJson(res, 429, { error: 'rate_limited', message: 'Too many order lookup attempts from this address.' }, { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) });
      const body = await readJsonBody(req);
      const order = findOrder(cleanText(body.orderId, 60));
      if (!order || !verifyOrderAccess(order, null, body.email)) return sendJson(res, 404, { error: 'order_not_found', message: 'No order matched that order number and email.' });
      return sendJson(res, 200, { order: publicOrder(order) });
    }

    const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (method === 'GET' && orderMatch) {
      const order = findOrder(decodeURIComponent(orderMatch[1]));
      const token = url.searchParams.get('token') || req.headers['x-order-token'];
      const email = url.searchParams.get('email');
      const isAdmin = Boolean(adminSession(req));
      if (!order || (!isAdmin && !verifyOrderAccess(order, token, email))) return sendJson(res, 404, { error: 'order_not_found', message: 'The order could not be found or accessed.' });
      return sendJson(res, 200, { order: publicOrder(order, true) });
    }

    const mockPaymentMatch = pathname.match(/^\/api\/orders\/([^/]+)\/payments\/mock$/);
    if (method === 'POST' && mockPaymentMatch) {
      if (getMode() === 'live') return sendJson(res, 403, { error: 'mock_payment_disabled', message: 'Mock payments are disabled in live commerce mode.' });
      const body = await readJsonBody(req);
      const order = findOrder(decodeURIComponent(mockPaymentMatch[1]));
      const token = body.token || req.headers['x-order-token'];
      if (!order || !verifyOrderAccess(order, token, null)) return sendJson(res, 404, { error: 'order_not_found', message: 'The order could not be found or accessed.' });
      await markOrderPaid(order, 'mock', `mock_${randomToken(10)}`);
      return sendJson(res, 200, { order: publicOrder(order) });
    }

    const returnMatch = pathname.match(/^\/api\/orders\/([^/]+)\/returns$/);
    if (method === 'POST' && returnMatch) {
      const limit = rateLimit(`return:${ip}`, 10, 15 * 60 * 1000);
      if (!limit.allowed) return sendJson(res, 429, { error: 'rate_limited', message: 'Too many return requests from this address.' }, { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) });
      const body = await readJsonBody(req);
      const order = findOrder(decodeURIComponent(returnMatch[1]));
      if (!order || !verifyOrderAccess(order, body.token || req.headers['x-order-token'], body.email)) return sendJson(res, 404, { error: 'order_not_found', message: 'The order could not be found or accessed.' });
      if (!['paid', 'refunded'].includes(order.paymentStatus)) return sendJson(res, 409, { error: 'return_not_available', message: 'A return can only be requested after payment has been confirmed.' });
      const reason = cleanText(body.reason, 500);
      if (reason.length < 5) return sendJson(res, 400, { error: 'return_reason_required', message: 'Add a short reason for the return request.' });
      const existing = returns.find(item => item.orderId === order.id && !['rejected', 'refunded'].includes(item.status));
      if (existing) return sendJson(res, 409, { error: 'return_exists', message: 'An open return request already exists for this order.' });
      const createdAt = nowIso();
      const request = { id: makeReturnId(), orderId: order.id, createdAt, updatedAt: createdAt, status: 'requested', reason, items: order.items.map(item => ({ variantId: item.variantId, quantity: item.quantity })) };
      returns.unshift(request);
      order.timeline.push({ status: 'return_requested', label: 'Return requested', at: createdAt, note: reason });
      order.updatedAt = createdAt;
      await persistReturns();
      await persistOrders();
      await queueEmail({ to: order.customer.email, subject: `${order.id} — return request received`, type: 'return_requested', orderId: order.id, content: order.testMode ? `The preview return request ${request.id} has been recorded.` : `Return request ${request.id} has been received for review.` });
      return sendJson(res, 201, { returnRequest: request, order: publicOrder(order) });
    }

    const withdrawalMatch = pathname.match(/^\/api\/orders\/([^/]+)\/withdrawal$/);
    if (method === 'POST' && withdrawalMatch) {
      const limit = rateLimit(`withdrawal:${ip}`, 10, 15 * 60 * 1000);
      if (!limit.allowed) return sendJson(res, 429, { error: 'rate_limited', message: 'Too many withdrawal requests from this address.' }, { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) });
      const body = await readJsonBody(req);
      const order = findOrder(decodeURIComponent(withdrawalMatch[1]));
      if (!order || !verifyOrderAccess(order, body.token || req.headers['x-order-token'], body.email)) return sendJson(res, 404, { error: 'order_not_found', message: 'The order could not be found or accessed.' });
      if (body.confirm !== true) return sendJson(res, 400, { error: 'withdrawal_confirmation_required', message: 'Confirm that you want to submit a withdrawal notice.' });
      const existing = withdrawals.find(item => item.orderId === order.id && item.status !== 'withdrawn');
      if (existing) return sendJson(res, 200, { withdrawal: existing, order: publicOrder(order), duplicate: true });
      const createdAt = nowIso();
      const withdrawal = {
        id: `WD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        orderId: order.id,
        customerEmail: order.customer.email,
        createdAt,
        updatedAt: createdAt,
        status: 'received',
        channel: 'website',
        note: cleanText(body.note, 500),
        statement: 'Customer submitted a withdrawal notice through the website.'
      };
      withdrawals.unshift(withdrawal);
      order.timeline.push({ status: 'withdrawal_received', label: 'Withdrawal notice received', at: createdAt, note: 'The request has been recorded for review.' });
      order.updatedAt = createdAt;
      await persistWithdrawals();
      await persistOrders();
      await queueEmail({ to: order.customer.email, subject: `${order.id} — withdrawal notice received`, type: 'withdrawal_received', orderId: order.id, content: `We received your withdrawal notice ${withdrawal.id} for ${order.id}. Eligibility, fulfilment and any refund are reviewed separately.` });
      database.addAudit({ actorEmail: order.customer.email, actorRole: 'customer', action: 'withdrawal.received', entityType: 'withdrawal', entityId: withdrawal.id, after: withdrawal });
      return sendJson(res, 201, { withdrawal, order: publicOrder(order) });
    }

    if (method === 'POST' && pathname === '/api/payments/stripe/session') {
      const body = await readJsonBody(req);
      const order = findOrder(cleanText(body.orderId, 60));
      if (!order || !verifyOrderAccess(order, body.token, null)) return sendJson(res, 404, { error: 'order_not_found', message: 'The order could not be found or accessed.' });
      if (!stripeConfigured()) return sendJson(res, 503, { error: 'stripe_not_configured', message: getMode() === 'live' ? 'Stripe live mode is not configured.' : 'Stripe test mode is not configured. Use mock payment or add an sk_test_ key.' });
      if (!order.items.every(stripeEligibility)) return sendJson(res, 403, { error: 'stripe_product_blocked', message: getMode() === 'live' ? 'Live checkout is blocked until every variant is explicitly allowlisted and legally/commercially approved.' : 'Stripe test checkout is blocked until every variant is explicitly allowlisted and legally reviewed.' });
      const token = body.token;
      order.accessTokenForRedirect = token;
      const baseUrl = String(process.env.BASE_URL || `http://${req.headers.host || 'localhost:3000'}`).replace(/\/$/, '');
      const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: buildStripeForm(order, baseUrl)
      });
      delete order.accessTokenForRedirect;
      const stripePayload = await stripeResponse.json();
      if (!stripeResponse.ok) return sendJson(res, 502, { error: 'stripe_error', message: stripePayload.error?.message || 'Stripe checkout session could not be created.' });
      order.paymentProvider = getMode() === 'live' ? 'stripe_live' : 'stripe_test';
      order.paymentStatus = 'pending';
      order.paymentReference = stripePayload.id;
      order.updatedAt = nowIso();
      order.timeline.push({ status: 'payment_pending', label: getMode() === 'live' ? 'Stripe checkout opened' : 'Stripe test checkout opened', at: order.updatedAt, note: stripePayload.id });
      await persistOrders();
      return sendJson(res, 200, { url: stripePayload.url, sessionId: stripePayload.id });
    }

    if (method === 'POST' && pathname === '/api/payments/stripe/confirm') {
      const body = await readJsonBody(req);
      const order = findOrder(cleanText(body.orderId, 60));
      if (!order || !verifyOrderAccess(order, body.token, null)) return sendJson(res, 404, { error: 'order_not_found', message: 'The order could not be found or accessed.' });
      const sessionId = cleanText(body.sessionId, 200);
      const expectedPrefix = getMode() === 'live' ? 'cs_live_' : 'cs_test_';
      if (!stripeConfigured() || !sessionId.startsWith(expectedPrefix)) return sendJson(res, 400, { error: 'invalid_stripe_session', message: 'A valid Stripe checkout session is required.' });
      const stripeResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } });
      const stripePayload = await stripeResponse.json();
      if (!stripeResponse.ok) return sendJson(res, 502, { error: 'stripe_error', message: stripePayload.error?.message || 'Stripe checkout session could not be verified.' });
      if (stripePayload.client_reference_id !== order.id || stripePayload.payment_status !== 'paid') return sendJson(res, 409, { error: 'stripe_not_paid', message: 'Stripe has not confirmed this payment.' });
      await markOrderPaid(order, stripePayload.livemode ? 'stripe_live' : 'stripe_test', sessionId);
      return sendJson(res, 200, { order: publicOrder(order) });
    }

    if (method === 'POST' && pathname === '/api/webhooks/stripe') {
      const rawBody = await readBodyBuffer(req);
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret || !verifyStripeSignature(rawBody.toString('utf8'), req.headers['stripe-signature'], secret)) return sendJson(res, 400, { error: 'invalid_signature', message: 'Invalid Stripe webhook signature.' });
      const event = JSON.parse(rawBody.toString('utf8'));
      const eventId = cleanText(event.id, 200) || sha256(rawBody);
      if (database.hasPaymentEvent('stripe', eventId)) return sendJson(res, 200, { received: true, duplicate: true });
      const session = event.data?.object;
      const orderId = session?.metadata?.order_id || session?.client_reference_id;
      const order = findOrder(orderId);
      if (order && ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type) && session.payment_status === 'paid') {
        await markOrderPaid(order, session.livemode ? 'stripe_live' : 'stripe_test', session.id);
      } else if (order && event.type === 'checkout.session.expired' && order.paymentStatus !== 'paid') {
        const at = nowIso();
        if (order.inventoryReserved) await releaseReservation(order, false);
        order.paymentStatus = order.paymentStatus === 'pending' ? 'expired' : order.paymentStatus;
        order.orderStatus = 'cancelled';
        order.updatedAt = at;
        order.timeline.push({ status: 'cancelled', label: 'Checkout expired', at, note: 'The payment session expired and reserved stock was released.' });
        await persistOrdersAndInventory('checkout_expired');
      } else if (order && event.type === 'checkout.session.async_payment_failed' && order.paymentStatus !== 'paid') {
        const at = nowIso();
        if (order.inventoryReserved) await releaseReservation(order, false);
        order.paymentStatus = 'failed';
        order.orderStatus = 'cancelled';
        order.updatedAt = at;
        order.timeline.push({ status: 'payment_failed', label: 'Payment failed', at, note: 'The payment provider reported that the payment did not complete.' });
        await persistOrdersAndInventory('payment_failed');
      }
      database.recordPaymentEvent('stripe', eventId, event);
      return sendJson(res, 200, { received: true });
    }

    if (method === 'GET' && pathname === '/api/admin/auth-config') {
      return sendJson(res, 200, { mfaRequired: IS_PRODUCTION, mfaSupported: true, perUserMfa: true, environment: APP_ENV });
    }

    if (method === 'POST' && pathname === '/api/admin/login') {
      const limit = rateLimit(`admin-login:${ip}`, 8, 15 * 60 * 1000);
      if (!limit.allowed) return sendJson(res, 429, { error: 'rate_limited', message: 'Too many login attempts.' }, { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) });
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      // v17: per-account limit as well, so distributed guessing against one account is slowed down.
      const accountLimit = rateLimit(`admin-login-account:${sha256(email)}`, 10, 15 * 60 * 1000);
      if (!accountLimit.allowed) return sendJson(res, 429, { error: 'rate_limited', message: 'Too many login attempts for this account. Try again later.' }, { 'Retry-After': String(Math.ceil(accountLimit.retryAfterMs / 1000)) });
      const user = database.findUser(email);
      if (!user || !user.enabled || !verifyPassword(String(body.password || ''), user.passwordHash)) return sendJson(res, 401, { error: 'invalid_credentials', message: 'Invalid admin credentials.' });
      let mfaMethod = 'none';
      if (user.mfaEnabled) {
        const candidate = String(body.mfaCode || '').trim();
        if (verifyTotp(candidate, decryptMfaSecret(user.mfaSecret))) {
          mfaMethod = 'totp';
        } else {
          const recoveryCode = normaliseRecoveryCode(candidate);
          const recoveryOk = recoveryCode.startsWith('VP-') && database.consumeRecoveryCode(user.email, sha256(recoveryCode));
          if (!recoveryOk) return sendJson(res, 401, { error: 'invalid_mfa', message: 'Enter a valid authenticator or recovery code.' });
          mfaMethod = 'recovery_code';
        }
      } else if (IS_PRODUCTION) {
        if (user.role !== 'owner' || !process.env.ADMIN_TOTP_SECRET) return sendJson(res, 503, { error: 'admin_mfa_not_enrolled', message: 'This production admin account must enroll per-user MFA before it can be used.' });
        if (!verifyTotp(body.mfaCode, process.env.ADMIN_TOTP_SECRET)) return sendJson(res, 401, { error: 'invalid_mfa', message: 'Enter the bootstrap owner authenticator code.' });
        mfaMethod = 'bootstrap_totp';
      }
      const token = randomToken(32);
      const session = { email: user.email, displayName: user.displayName, role: user.role, csrf: randomToken(24), mfaMethod, expiresAt: Date.now() + SESSION_TTL_MS };
      sessions.set(token, session);
      audit(session, 'admin.login', 'admin_user', user.email, null, { role: user.role, mfaMethod });
      const secure = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' ? '; Secure' : '';
      return sendJson(res, 200, { authenticated: true, email: user.email, displayName: user.displayName, role: user.role, mfaEnabled: user.mfaEnabled, mfaMethod, csrf: session.csrf }, {
        'Set-Cookie': `vp_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`
      });
    }

    if (method === 'POST' && pathname === '/api/admin/logout') {
      const token = parseCookies(req.headers.cookie).vp_admin;
      if (token) sessions.delete(token);
      return sendJson(res, 200, { authenticated: false }, { 'Set-Cookie': 'vp_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
    }

    if (method === 'GET' && pathname === '/api/admin/session') {
      const session = adminSession(req);
      const user = session ? database.findUser(session.email) : null;
      return sendJson(res, 200, session ? { authenticated: true, email: session.email, displayName: session.displayName, role: session.role, mfaEnabled: user?.mfaEnabled === true, mfaMethod: session.mfaMethod || 'none', csrf: session.csrf } : { authenticated: false });
    }

    if (method === 'GET' && pathname === '/api/admin/dashboard') {
      const session = requireAdmin(req);
      const paidOrders = orders.filter(order => order.paymentStatus === 'paid');
      const lowStock = Object.entries(inventory.variants).filter(([, item]) => item.onHand <= item.reorderPoint).length;
      return sendJson(res, 200, {
        stats: {
          orders: orders.length,
          paidOrders: paidOrders.length,
          testRevenue: centsToMoney(paidOrders.reduce((sum, order) => sum + order.totalCents, 0)),
          openOrders: orders.filter(order => !['delivered', 'cancelled', 'refunded'].includes(order.orderStatus)).length,
          lowStock,
          returns: returns.length,
          reviews: reviews.reviews.length,
          pendingReviews: reviews.reviews.filter(review => review.status === 'pending').length,
          approvedReviews: reviews.reviews.filter(review => review.status === 'approved').length
        },
        orders: ROLE_ACCESS[session.role]?.has('orders') ? orders.map(order => publicOrder(order, true)) : [],
        returns: ROLE_ACCESS[session.role]?.has('returns') ? returns : [],
        withdrawals: ROLE_ACCESS[session.role]?.has('returns') ? withdrawals : [],
        inventory: ROLE_ACCESS[session.role]?.has('inventory') ? Object.entries(inventory.variants).map(([variantId, item]) => ({ variantId, ...item })) : [],
        products: ROLE_ACCESS[session.role]?.has('products') ? catalogue.products.map(product => { const raw = productContent.products[product.id] || {}; return { id: product.id, name: product.name, category: product.category, commerce: policy.products[product.id] || null, content: { ...raw, publicStatus: derivePublicStatus(raw), readiness: productReadiness(product.id) } }; }) : [],
        config,
        reviews: ROLE_ACCESS[session.role]?.has('reviews') ? reviews.reviews : [],
        guide: ROLE_ACCESS[session.role]?.has('guide') ? guide : { enabled:false, focusAreas:[], priorities:[], rules:[] },
        supportKb: ROLE_ACCESS[session.role]?.has('guide') ? supportKb : { entries:[], fallback:'' },
        outbox: ROLE_ACCESS[session.role]?.has('orders') ? await listOutbox() : [],
        mode: getMode(),
        productionReadiness: productionReadiness(),
        publication: { gate: gateMode, visibleProducts: visibleCatalogueProducts().length, totalProducts: catalogue.products.length },
        orderQueues: {
          awaitingPayment: orders.filter(order => order.paymentStatus === 'unpaid' && order.orderStatus === 'awaiting_payment').length,
          toPack: orders.filter(order => order.paymentStatus === 'paid' && order.orderStatus === 'processing').length,
          readyToShip: orders.filter(order => order.paymentStatus === 'paid' && order.orderStatus === 'packed').length,
          inTransit: orders.filter(order => ['shipped','in_transit','out_for_delivery'].includes(order.orderStatus)).length,
          completed: orders.filter(order => order.orderStatus === 'delivered').length,
          attention: orders.filter(order => ['failed','refunded'].includes(order.paymentStatus) || ['cancelled','refunded'].includes(order.orderStatus)).length
        },
        currentUser: (() => { const user = database.findUser(session.email); return { email: session.email, displayName: session.displayName, role: session.role, mfaEnabled: user?.mfaEnabled === true, mfaMethod: session.mfaMethod || 'none' }; })(),
        permissions: [...(ROLE_ACCESS[session.role] || [])],
        users: session.role === 'owner' ? database.listUsers() : [],
        audit: ['owner','admin'].includes(session.role) ? database.listAudit(200) : [],
        database: { engine: 'SQLite', file: path.basename(database.filePath) }
      });
    }


    if (method === 'POST' && pathname === '/api/admin/me/mfa/setup') {
      const session = requireAdmin(req); requireCsrf(req, session);
      const secret = generateTotpSecret();
      session.pendingMfaSecret = secret;
      session.pendingMfaExpiresAt = Date.now() + 10 * 60 * 1000;
      const issuer = encodeURIComponent('VERAPEP');
      const account = encodeURIComponent(session.email);
      const otpauthUri = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
      audit(session, 'admin_mfa.setup_started', 'admin_user', session.email, null, { expiresAt: new Date(session.pendingMfaExpiresAt).toISOString() });
      return sendJson(res, 200, { secret, otpauthUri, expiresInSeconds: 600 });
    }

    if (method === 'POST' && pathname === '/api/admin/me/mfa/confirm') {
      const session = requireAdmin(req); requireCsrf(req, session);
      const body = await readJsonBody(req);
      if (!session.pendingMfaSecret || !session.pendingMfaExpiresAt || session.pendingMfaExpiresAt < Date.now()) {
        return sendJson(res, 409, { error: 'mfa_setup_expired', message: 'Start MFA setup again.' });
      }
      if (!verifyTotp(body.code, session.pendingMfaSecret)) return sendJson(res, 400, { error: 'invalid_mfa', message: 'The authenticator code did not verify.' });
      const recoveryCodes = generateRecoveryCodes();
      const recoveryCodeHashes = recoveryCodes.map(code => sha256(normaliseRecoveryCode(code)));
      database.setUserMfa(session.email, { secret: encryptMfaSecret(session.pendingMfaSecret), enabled: true, recoveryCodeHashes });
      delete session.pendingMfaSecret; delete session.pendingMfaExpiresAt;
      session.mfaMethod = 'totp';
      audit(session, 'admin_mfa.enabled', 'admin_user', session.email, null, { recoveryCodesIssued: recoveryCodes.length });
      return sendJson(res, 200, { enabled: true, recoveryCodes });
    }

    if (method === 'POST' && pathname === '/api/admin/me/mfa/recovery-codes') {
      const session = requireAdmin(req); requireCsrf(req, session);
      const body = await readJsonBody(req);
      const user = database.findUser(session.email);
      if (!user?.mfaEnabled || !verifyTotp(body.code, decryptMfaSecret(user.mfaSecret))) return sendJson(res, 401, { error: 'invalid_mfa', message: 'Enter a valid authenticator code.' });
      const recoveryCodes = generateRecoveryCodes();
      database.setUserMfa(session.email, { secret: user.mfaSecret, enabled: true, recoveryCodeHashes: recoveryCodes.map(code => sha256(normaliseRecoveryCode(code))) });
      audit(session, 'admin_mfa.recovery_codes_rotated', 'admin_user', session.email, null, { recoveryCodesIssued: recoveryCodes.length });
      return sendJson(res, 200, { recoveryCodes });
    }

    if (method === 'POST' && pathname === '/api/admin/me/mfa/disable') {
      const session = requireAdmin(req); requireCsrf(req, session);
      if (IS_PRODUCTION) return sendJson(res, 409, { error: 'production_mfa_required', message: 'Per-user MFA cannot be disabled in production.' });
      const body = await readJsonBody(req);
      const user = database.findUser(session.email);
      if (!user?.mfaEnabled || !verifyTotp(body.code, decryptMfaSecret(user.mfaSecret))) return sendJson(res, 401, { error: 'invalid_mfa', message: 'Enter a valid authenticator code.' });
      database.setUserMfa(session.email, { secret: null, enabled: false, recoveryCodeHashes: [] });
      session.mfaMethod = 'none';
      audit(session, 'admin_mfa.disabled', 'admin_user', session.email, null, { enabled: false });
      return sendJson(res, 200, { enabled: false });
    }

    if (method === 'GET' && pathname === '/api/admin/privacy/customer-export') {
      const session = requireAdmin(req); requireRole(session, 'privacy');
      const email = cleanText(url.searchParams.get('email'), 254).toLowerCase();
      if (!validEmail(email)) return sendJson(res, 400, { error: 'invalid_email', message: 'Enter a valid customer email.' });
      const matchingOrders = orders.filter(order => String(order.customer?.email || '').toLowerCase() === email);
      const orderIds = new Set(matchingOrders.map(order => order.id));
      const matchingReturns = returns.filter(item => orderIds.has(item.orderId));
      const matchingWithdrawals = withdrawals.filter(item => orderIds.has(item.orderId) || String(item.customerEmail || '').toLowerCase() === email);
      const customerRecords = Array.isArray(customers?.customers) ? customers.customers.filter(item => String(item.email || '').toLowerCase() === email) : [];
      const outbox = (await listOutbox()).filter(item => String(item.to || '').toLowerCase() === email);
      const payload = {
        generatedAt: nowIso(),
        subject: email,
        customerRecords,
        orders: matchingOrders.map(order => publicOrder(order, true)),
        returns: matchingReturns,
        withdrawals: matchingWithdrawals,
        transactionalMessages: outbox
      };
      audit(session, 'privacy.customer_export', 'customer', email, null, { orderCount: matchingOrders.length, returnCount: matchingReturns.length, withdrawalCount: matchingWithdrawals.length, messageCount: outbox.length });
      return sendJson(res, 200, payload, { 'Content-Disposition': `attachment; filename="verapep-customer-export-${sha256(email).slice(0,12)}.json"` });
    }


    if (method === 'GET' && pathname === '/api/admin/audit') {
      const session = requireAdmin(req);
      requireRole(session, 'audit');
      return sendJson(res, 200, { audit: database.listAudit(clampInt(url.searchParams.get('limit') || 200, 1, 1000)) });
    }

    if (method === 'GET' && pathname === '/api/admin/users') {
      const session = requireAdmin(req);
      requireRole(session, 'users');
      return sendJson(res, 200, { users: database.listUsers() });
    }

    if (method === 'POST' && pathname === '/api/admin/users') {
      const session = requireAdmin(req); requireCsrf(req, session); requireRole(session, 'users');
      const body = await readJsonBody(req);
      const email = cleanText(body.email, 254).toLowerCase();
      const role = cleanText(body.role, 20);
      if (!validEmail(email) || !['owner','admin','editor','support'].includes(role)) return sendJson(res, 400, { error: 'invalid_admin_user', message: 'Enter a valid email and role.' });
      if (!validAdminPassword(body.password)) return sendJson(res, 400, { error: 'weak_password', message: 'Use an admin password of at least 12 characters.' });
      const user = sanitiseAdminUser(database.upsertUser({ email, displayName: cleanText(body.displayName, 100) || email, role, password: String(body.password), enabled: body.enabled !== false }));
      audit(session, 'admin_user.created', 'admin_user', email, null, user);
      return sendJson(res, 201, { user });
    }

    const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (method === 'PATCH' && adminUserMatch) {
      const session = requireAdmin(req); requireCsrf(req, session); requireRole(session, 'users');
      const email = decodeURIComponent(adminUserMatch[1]).toLowerCase();
      const before = database.findUser(email);
      if (!before) return sendJson(res, 404, { error: 'admin_user_not_found', message: 'Admin user not found.' });
      const body = await readJsonBody(req);
      const role = body.role === undefined ? before.role : cleanText(body.role, 20);
      if (!['owner','admin','editor','support'].includes(role)) return sendJson(res, 400, { error: 'invalid_role', message: 'Invalid admin role.' });
      if (body.password && !validAdminPassword(body.password)) return sendJson(res, 400, { error: 'weak_password', message: 'Use an admin password of at least 12 characters.' });
      const user = sanitiseAdminUser(database.upsertUser({ email, displayName: cleanText(body.displayName, 100) || before.displayName, role, password: body.password ? String(body.password) : undefined, enabled: body.enabled === undefined ? before.enabled : body.enabled === true }));
      audit(session, 'admin_user.updated', 'admin_user', email, { displayName: before.displayName, role: before.role, enabled: before.enabled }, { ...user, passwordChanged: Boolean(body.password) });
      return sendJson(res, 200, { user });
    }

    if (method === 'GET' && pathname === '/api/admin/export') {
      const session = requireAdmin(req); requireRole(session, 'audit');
      return sendJson(res, 200, {
        exportedAt: nowIso(),
        config, catalogue, policy, inventory, orders, returns, withdrawals, productContent, reviews, guide, supportKb, customers,
        audit: database.listAudit(1000)
      }, { 'Content-Disposition': `attachment; filename="verapep-export-${new Date().toISOString().slice(0,10)}.json"` });
    }

    if (method === 'PATCH' && pathname === '/api/admin/settings') {
      const session = requireAdmin(req); requireCsrf(req, session); requireRole(session, 'settings');
      const before = structuredClone(config);
      const body = await readJsonBody(req);
      if (body.storeName !== undefined) config.storeName = cleanText(body.storeName, 80) || 'VERAPEP';
      if (body.currency !== undefined) config.currency = cleanText(body.currency, 3).toUpperCase() || 'EUR';
      if (body.priceSource !== undefined && ['priceUsd1','priceUsd2'].includes(body.priceSource)) config.priceSource = body.priceSource;
      if (body.priceSourceLabel !== undefined) config.priceSourceLabel = cleanText(body.priceSourceLabel, 120);
      if (body.defaultDelivery !== undefined) config.shippingMethods[0].estimatedDays = cleanText(body.defaultDelivery, 80) || '7–10 days';
      if (Array.isArray(body.trustSignals)) config.trustSignals = body.trustSignals.slice(0, 8).map(value => cleanText(value, 120)).filter(Boolean);
      if (body.assistantName !== undefined) config.assistantName = cleanText(body.assistantName, 80) || 'Ask Vera';
      if (body.checkoutMode !== undefined && ['catalogue_only','sandbox'].includes(body.checkoutMode)) config.checkoutMode = body.checkoutMode;
      await persistConfig();
      audit(session, 'settings.updated', 'store', 'store-config', before, config);
      return sendJson(res, 200, { config });
    }

    const contentMatch = pathname.match(/^\/api\/admin\/product-content\/([^/]+)$/);
    if (method === 'PATCH' && contentMatch) {
      const session = requireAdmin(req); requireCsrf(req, session); requireRole(session, 'products');
      const body = await readJsonBody(req);
      const productId = decodeURIComponent(contentMatch[1]);
      if (!productsById.has(productId)) return sendJson(res, 404, { error: 'product_not_found', message: 'Product not found.' });
      const current = productContent.products[productId] || { productId };
      const before = structuredClone(current);
      if (body.availableForSale === true && !complianceSaleApproved(productId)) throw complianceBlocked('This product has no compliance approval for sale. Sale cannot be switched on.');
      for (const field of ['labReports']) if (Array.isArray(body[field])) body[field] = body[field].filter(item => item && (!item.url || safePublicUrl(item.url)));
      if (body.imageUrl !== undefined && body.imageUrl && !safePublicUrl(body.imageUrl)) return sendJson(res, 400, { error: 'invalid_url', message: 'Image URL must be a site path (/assets/…) or an https:// address.' });
      for (const field of ['displayName','shortDescription','fullDescription','ingredients','storage','usage','warnings','deliveryEstimate','imageUrl','imageAlt','imageSrcset','imageSizes','imageFocalPoint','stockStatus']) {
        if (body[field] !== undefined) current[field] = cleanText(body[field], field.includes('Description') ? 4000 : 1000);
      }
      for (const field of ['published','informationOnly','availableForSale','specialistOnly','archived']) if (typeof body[field] === 'boolean') current[field] = body[field];
      for (const field of ['discoveryGoals','discoveryNeeds','searchAliases']) if (Array.isArray(body[field])) current[field] = body[field].slice(0, 20).map(value => cleanText(value, 80)).filter(Boolean);
      if (body.informationCompleteness !== undefined && ['basic','complete'].includes(body.informationCompleteness)) current.informationCompleteness = body.informationCompleteness;
      if (Array.isArray(body.allowedCountries)) current.allowedCountries = body.allowedCountries.map(value => cleanText(value, 2).toUpperCase()).filter(Boolean);
      if (Array.isArray(body.labReports)) current.labReports = body.labReports.slice(0, 20).map(item => ({ title: cleanText(item.title, 160), url: cleanText(item.url, 500), date: cleanText(item.date, 40), batch: cleanText(item.batch, 120), published: item.published === true }));
      if (current.archived === true || current.stockStatus === 'archived') { current.published = false; current.availableForSale = false; current.informationOnly = true; }
      if (current.availableForSale === true) { current.informationOnly = false; current.archived = false; if (current.stockStatus === 'information_only') current.stockStatus = 'available'; }
      const productPolicy = policy.products[productId] || {};
      productPolicy.sandboxEnabled = current.availableForSale === true && current.published !== false && current.archived !== true;
      productPolicy.liveEnabled = false;
      productPolicy.status = productPolicy.sandboxEnabled ? 'sandbox_sale_enabled' : (current.archived ? 'archived' : 'information_only');
      productPolicy.note = productPolicy.sandboxEnabled ? 'Enabled for local test webshop by admin.' : 'Not enabled for webshop checkout.';
      policy.products[productId] = productPolicy;
      current.updatedAt = nowIso();
      productContent.products[productId] = current;
      // v17: content shown to customers changed after approval → flag for re-review (does not auto-publish anything).
      const reviewed = complianceRecord(productId);
      const claimFields = ['displayName','shortDescription','fullDescription','ingredients','usage','warnings','labReports','searchAliases'];
      if (reviewed.status === 'approved_for_publication' && claimFields.some(field => JSON.stringify(before[field] ?? null) !== JSON.stringify(current[field] ?? null))) {
        compliance.products[productId] = { ...reviewed, contentChangedAfterApproval: true, history: [...(reviewed.history || []), { at: nowIso(), by: session.email, event: 'content_changed_after_approval' }] };
        await persistCompliance();
      }
      await persistProductContent();
      await persistPolicy();
      audit(session, 'product.updated', 'product', productId, before, current);
      return sendJson(res, 200, { productId, content: { ...current, publicStatus: derivePublicStatus(current), readiness: productReadiness(productId) }, commerce: productPolicy });
    }

    const reviewMatch = pathname.match(/^\/api\/admin\/reviews\/([^/]+)$/);
    if (method === 'PATCH' && reviewMatch) {
      const session = requireAdmin(req); requireCsrf(req, session); requireRole(session, 'reviews');
      const body = await readJsonBody(req);
      const review = reviews.reviews.find(item => item.id === decodeURIComponent(reviewMatch[1]));
      if (!review) return sendJson(res, 404, { error: 'review_not_found', message: 'Review not found.' });
      const before = structuredClone(review);
      if (['pending','approved','rejected','hidden'].includes(body.status)) review.status = body.status;
      review.moderatedAt = nowIso();
      await persistReviews();
      audit(session, 'review.moderated', 'review', review.id, before, review);
      return sendJson(res, 200, { review });
    }

    if (method === 'PATCH' && pathname === '/api/admin/guide') {
      const session = requireAdmin(req); requireCsrf(req, session); requireRole(session, 'guide');
      const before = structuredClone(guide);
      const body = await readJsonBody(req);
      if (typeof body.enabled === 'boolean') guide.enabled = body.enabled;
      if (Array.isArray(body.rules)) guide.rules = body.rules;
      await persistGuide();
      audit(session, 'guide.updated', 'guide', 'product-guide', before, guide);
      return sendJson(res, 200, { guide });
    }

    if (method === 'PATCH' && pathname === '/api/admin/support-kb') {
      const session = requireAdmin(req); requireCsrf(req, session); requireRole(session, 'guide');
      const before = structuredClone(supportKb);
      const body = await readJsonBody(req);
      if (Array.isArray(body.entries)) supportKb.entries = body.entries.slice(0,100).map(item => ({ id: cleanText(item.id,80)||randomToken(6), question: cleanText(item.question,500), answer: cleanText(item.answer,3000), url: cleanText(item.url,500) }));
      if (body.fallback !== undefined) supportKb.fallback = cleanText(body.fallback,1000);
      await persistSupportKb();
      audit(session, 'support_kb.updated', 'support_kb', 'vera', before, supportKb);
      return sendJson(res, 200, { supportKb });
    }

    /* ---------- v17 compliance review workflow ---------- */
    if (method === 'GET' && pathname === '/api/admin/compliance') {
      const session = requireAdmin(req); requireRole(session, 'products');
      const rows = catalogue.products.map(product => inventoryRow(product, productContent.products[product.id] || {}, complianceRecord(product.id), gateMode, policy.products[product.id] || {}));
      const summary = Object.fromEntries(REVIEW_STATUSES.map(status => [status, rows.filter(row => row.review.status === status).length]));
      return sendJson(res, 200, {
        gate: gateMode,
        statuses: REVIEW_STATUSES,
        scopes: APPROVAL_SCOPES,
        approvalConfirmation: APPROVAL_CONFIRMATION,
        canApprove: session.role === 'owner',
        summary: { ...summary, total: rows.length, publiclyVisible: rows.filter(row => row.publiclyVisible).length, highRisk: rows.filter(row => row.suggestion.level === 'high').length, flaggedClaims: rows.filter(row => row.unsupportedClaims.length).length },
        rows
      });
    }

    const complianceMatch = pathname.match(/^\/api\/admin\/compliance\/([^/]+)$/);
    if (method === 'GET' && complianceMatch && complianceMatch[1] !== 'bulk') {
      const session = requireAdmin(req); requireRole(session, 'products');
      const productId = decodeURIComponent(complianceMatch[1]);
      const product = productsById.get(productId);
      if (!product) return sendJson(res, 404, { error: 'product_not_found', message: 'Product not found.' });
      const record = complianceRecord(productId);
      return sendJson(res, 200, { row: inventoryRow(product, productContent.products[productId] || {}, record, gateMode, policy.products[productId] || {}), history: record.history || [] });
    }

    async function revokeCommerce(productId, reason) {
      const product = productsById.get(productId);
      const content = productContent.products[productId] || { productId };
      const productPolicy = policy.products[productId] || {};
      const wasSelling = content.availableForSale === true || productPolicy.sandboxEnabled === true || productPolicy.liveEnabled === true;
      content.availableForSale = false; content.informationOnly = true;
      if (content.stockStatus !== 'archived') content.stockStatus = 'information_only';
      productPolicy.sandboxEnabled = false; productPolicy.liveEnabled = false;
      if (productPolicy.status === 'live_approved' || productPolicy.status === 'sandbox_sale_enabled') productPolicy.status = 'information_only';
      productPolicy.note = reason;
      for (const variant of product?.variants || []) if (inventory.variants[variant.variantId]) inventory.variants[variant.variantId].saleEnabled = false;
      productContent.products[productId] = content; policy.products[productId] = productPolicy;
      return wasSelling;
    }

    if (method === 'PATCH' && complianceMatch) {
      const session = requireAdmin(req); requireCsrf(req, session); requireRole(session, 'products');
      const productId = decodeURIComponent(complianceMatch[1]);
      const product = productsById.get(productId);
      if (!product) return sendJson(res, 404, { error: 'product_not_found', message: 'Product not found.' });
      const body = await readJsonBody(req);
      const status = cleanText(body.status, 40);
      if (!REVIEW_STATUSES.includes(status)) return sendJson(res, 400, { error: 'invalid_review_status', message: 'Choose a valid review status.' });
      const before = complianceRecord(productId);
      const note = cleanText(body.note, 1000);
      const next = { ...before, status, note, contentChangedAfterApproval: false, decidedBy: session.email, decidedAt: nowIso() };
      if (Array.isArray(body.evidence)) {
        const evidence = body.evidence.slice(0, 20).map(item => ({ title: cleanText(item.title, 160), url: cleanText(item.url, 500), date: cleanText(item.date, 40) })).filter(item => item.title);
        if (evidence.some(item => item.url && !safePublicUrl(item.url))) return sendJson(res, 400, { error: 'invalid_url', message: 'Evidence links must be site paths or https:// addresses.' });
        next.evidence = evidence;
      }
      if (status === 'approved_for_publication') {
        // Final publication approval is a human, owner-level decision backed by an external review.
        if (session.role !== 'owner') return sendJson(res, 403, { error: 'owner_required', message: 'Only the owner can record an approval for publication.' });
        if (cleanText(body.confirmation, 120) !== APPROVAL_CONFIRMATION) return sendJson(res, 400, { error: 'approval_confirmation_required', message: 'Type the exact approval confirmation to record a reviewed approval.' });
        const reviewReference = cleanText(body.reviewReference, 240);
        const reviewer = cleanText(body.reviewer, 160);
        if (reviewReference.length < 5) return sendJson(res, 400, { error: 'review_reference_required', message: 'Add a traceable review reference (for example a legal memo or case number).' });
        if (reviewer.length < 3) return sendJson(res, 400, { error: 'reviewer_required', message: 'Name the qualified reviewer or firm responsible for the decision.' });
        const scope = cleanText(body.scope, 20);
        if (!APPROVAL_SCOPES.includes(scope)) return sendJson(res, 400, { error: 'approval_scope_required', message: 'Choose what is approved: information only, or information and sale.' });
        const allowed = new Set((config.allowedCountries || []).map(item => item.code));
        const markets = [...new Set((Array.isArray(body.markets) ? body.markets : []).map(value => cleanText(value, 2).toUpperCase()).filter(code => allowed.has(code)))];
        if (!markets.length) return sendJson(res, 400, { error: 'approval_markets_required', message: 'Select the specific markets the approval covers.' });
        Object.assign(next, { reviewReference, reviewer, scope, markets });
      } else {
        Object.assign(next, { scope: null, markets: [], reviewReference: before.status === 'approved_for_publication' ? null : before.reviewReference, reviewer: before.status === 'approved_for_publication' ? null : before.reviewer });
      }
      let commerceRevoked = false;
      if (before.status === 'approved_for_publication' && (status !== 'approved_for_publication' || next.scope !== 'sale')) {
        commerceRevoked = await revokeCommerce(productId, `Sale switched off: compliance status changed to ${status}.`);
      }
      next.history = [...(before.history || []), { at: next.decidedAt, by: session.email, role: session.role, from: before.status, to: status, note, scope: next.scope, markets: next.markets, reviewReference: next.reviewReference }].slice(-200);
      compliance.products[productId] = next;
      await persistCompliance();
      if (commerceRevoked) { await persistProductContent(); await persistPolicy(); await persistInventory(); }
      audit(session, 'compliance.status_changed', 'product', productId, { status: before.status, scope: before.scope, markets: before.markets }, { status, scope: next.scope, markets: next.markets, reviewReference: next.reviewReference, reviewer: next.reviewer, note, commerceRevoked });
      return sendJson(res, 200, { row: inventoryRow(product, productContent.products[productId] || {}, next, gateMode, policy.products[productId] || {}), commerceRevoked });
    }

    if (method === 'POST' && pathname === '/api/admin/compliance/bulk') {
      const session = requireAdmin(req); requireCsrf(req, session); requireRole(session, 'products');
      const body = await readJsonBody(req);
      const status = cleanText(body.status, 40);
      // Approvals are never bulk actions: each one needs its own reference, scope and markets.
      if (!NON_APPROVAL_STATUSES.includes(status)) return sendJson(res, 400, { error: 'invalid_bulk_status', message: 'Bulk changes can only set Not reviewed, Needs evidence, In legal review or Do not publish.' });
      const productIds = [...new Set((Array.isArray(body.productIds) ? body.productIds : []).map(value => cleanText(value, 160)))].filter(id => productsById.has(id));
      if (!productIds.length) return sendJson(res, 400, { error: 'no_products_selected', message: 'Select at least one product.' });
      const note = cleanText(body.note, 1000);
      if (note.length < 3) return sendJson(res, 400, { error: 'note_required', message: 'Add a short note explaining the bulk change.' });
      const affectedApproved = productIds.filter(id => complianceRecord(id).status === 'approved_for_publication');
      if (Number(body.confirmCount) !== productIds.length) {
        return sendJson(res, 409, { error: 'bulk_confirmation_required', message: `This changes ${productIds.length} products${affectedApproved.length ? `, including ${affectedApproved.length} approved product(s) that will lose their approval and any sale` : ''}. Confirm the number of products to continue.`, count: productIds.length, affectsApproved: affectedApproved.length });
      }
      const at = nowIso();
      let revoked = 0;
      for (const productId of productIds) {
        const before = complianceRecord(productId);
        if (before.status === 'approved_for_publication' && await revokeCommerce(productId, `Sale switched off: bulk status change to ${status}.`)) revoked += 1;
        compliance.products[productId] = { ...before, status, note, scope: null, markets: [], decidedBy: session.email, decidedAt: at, contentChangedAfterApproval: false, history: [...(before.history || []), { at, by: session.email, role: session.role, from: before.status, to: status, note, bulk: true }].slice(-200) };
      }
      await persistCompliance();
      if (affectedApproved.length) { await persistProductContent(); await persistPolicy(); await persistInventory(); }
      audit(session, 'compliance.bulk_status_changed', 'product', `${productIds.length} products`, null, { status, note, productIds, revokedSales: revoked });
      return sendJson(res, 200, { updated: productIds.length, status, revokedSales: revoked });
    }

    const adminOrderMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
    if (method === 'PATCH' && adminOrderMatch) {
      const session = requireAdmin(req);
      requireCsrf(req, session); requireRole(session, 'orders');
      const body = await readJsonBody(req);
      const order = findOrder(decodeURIComponent(adminOrderMatch[1]));
      if (!order) return sendJson(res, 404, { error: 'order_not_found', message: 'Order not found.' });
      const status = cleanText(body.status, 40);
      if (!ORDER_STATUSES.has(status)) return sendJson(res, 400, { error: 'invalid_status', message: 'Invalid order status.' });
      if (status === 'refunded' && order.paymentStatus !== 'refunded') {
        return sendJson(res, 409, { error: 'refund_action_required', message: 'Use the dedicated refund action so inventory and payment state stay consistent.' });
      }
      const before = structuredClone(order);
      const at = nowIso();
      const releasedReservation = status === 'cancelled' && order.paymentStatus === 'unpaid' && order.inventoryReserved;
      if (releasedReservation) await releaseReservation(order, false);
      order.orderStatus = status;
      order.updatedAt = at;
      if (body.trackingNumber !== undefined) order.trackingNumber = cleanText(body.trackingNumber, 100) || null;
      if (body.carrier !== undefined) order.carrier = cleanText(body.carrier, 100) || null;
      order.timeline.push({ status, label: status.replaceAll('_', ' '), at, note: cleanText(body.note, 300) || (order.testMode ? 'Updated in preview admin.' : 'Updated in admin.') });
      if (releasedReservation) await persistOrdersAndInventory('order_cancelled'); else await persistOrders();
      audit(session, 'order.status_updated', 'order', order.id, before, order);
      await queueEmail({ to: order.customer.email, subject: `${order.id} — status updated`, type: 'status_updated', orderId: order.id, content: order.testMode ? `Preview order status: ${status.replaceAll('_', ' ')}.` : `Order status: ${status.replaceAll('_', ' ')}.` });
      return sendJson(res, 200, { order: publicOrder(order) });
    }

    const adminRefundMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/refund$/);
    if (method === 'POST' && adminRefundMatch) {
      const session = requireAdmin(req);
      requireCsrf(req, session); requireRole(session, 'refunds');
      const body = await readJsonBody(req);
      const order = findOrder(decodeURIComponent(adminRefundMatch[1]));
      if (!order) return sendJson(res, 404, { error: 'order_not_found', message: 'Order not found.' });
      const before = structuredClone(order);
      await refundOrder(order, body.reason);
      audit(session, 'order.refunded', 'order', order.id, before, order);
      return sendJson(res, 200, { order: publicOrder(order) });
    }

    if (method === 'PATCH' && pathname === '/api/admin/inventory') {
      const session = requireAdmin(req);
      requireCsrf(req, session); requireRole(session, 'inventory');
      const body = await readJsonBody(req);
      const variantId = cleanText(body.variantId, 180);
      const record = inventory.variants[variantId];
      if (!record) return sendJson(res, 404, { error: 'variant_not_found', message: 'Inventory variant not found.' });
      const before = structuredClone(record);
      if (body.onHand !== undefined) record.onHand = clampInt(body.onHand, 0, 1_000_000);
      if (body.retailPrice !== undefined) { const cents = moneyToCents(body.retailPrice); record.retailPriceCents = cents > 0 ? cents : null; }
      if (typeof body.saleEnabled === 'boolean') record.saleEnabled = body.saleEnabled;
      await persistInventory();
      audit(session, 'inventory.updated', 'variant', variantId, before, record);
      return sendJson(res, 200, { variantId, inventory: record });
    }

    const adminWebshopMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)\/webshop$/);
    if (method === 'POST' && adminWebshopMatch) {
      const session = requireAdmin(req);
      requireCsrf(req, session); requireRole(session, 'products');
      const body = await readJsonBody(req);
      const productId = decodeURIComponent(adminWebshopMatch[1]);
      const product = productsById.get(productId);
      if (!product) return sendJson(res, 404, { error: 'product_not_found', message: 'Product not found.' });
      const enabled = body.enabled === true;
      const current = productContent.products[productId] || { productId };
      const before = { content: structuredClone(current), policy: structuredClone(policy.products[productId] || {}), inventory: Object.fromEntries(product.variants.map(variant => [variant.variantId, structuredClone(inventory.variants[variant.variantId] || null)])) };
      const productPolicy = policy.products[productId] || {};
      const changedVariants = [];
      const blockedVariants = [];

      if (enabled && !complianceSaleApproved(productId)) throw complianceBlocked('This product has no compliance approval for sale. Record a reviewed approval (scope: sale) before enabling the webshop.');
      // v17: switching the store-wide checkout mode is a settings change; editors may not do it as a side effect.
      if (enabled && config.checkoutMode !== 'sandbox' && !ROLE_ACCESS[session.role]?.has('settings')) {
        return sendJson(res, 403, { error: 'admin_permission_denied', message: 'Checkout is switched off store-wide. Ask an owner or admin to enable sandbox checkout in Settings first.' });
      }
      if (enabled) {
        config.checkoutMode = 'sandbox';
        current.published = true;
        current.archived = false;
        current.informationOnly = false;
        current.availableForSale = true;
        current.stockStatus = 'available';
        if (!Array.isArray(current.allowedCountries) || current.allowedCountries.length === 0) {
          current.allowedCountries = (config.allowedCountries || []).map(item => item.code).filter(Boolean);
        }
        productPolicy.sandboxEnabled = true;
        productPolicy.liveEnabled = false;
        productPolicy.status = 'sandbox_sale_enabled';
        productPolicy.note = 'Enabled for local test webshop by admin quick action.';
        for (const variant of product.variants) {
          const record = inventory.variants[variant.variantId];
          if (!record) {
            blockedVariants.push({ variantId: variant.variantId, reason: 'Missing inventory record' });
            continue;
          }
          const hasPrice = Number.isInteger(record.retailPriceCents) && record.retailPriceCents > 0;
          const hasStock = Number(record.onHand) > Number(record.reserved || 0);
          if (hasPrice && hasStock) {
            record.saleEnabled = true;
            changedVariants.push(variant.variantId);
          } else {
            record.saleEnabled = false;
            blockedVariants.push({ variantId: variant.variantId, reason: !hasPrice ? 'Missing EUR price' : 'No available stock' });
          }
        }
      } else {
        current.availableForSale = false;
        current.informationOnly = true;
        if (current.stockStatus !== 'archived') current.stockStatus = 'information_only';
        productPolicy.sandboxEnabled = false;
        productPolicy.liveEnabled = false;
        productPolicy.status = current.archived ? 'archived' : 'information_only';
        productPolicy.note = 'Disabled from local webshop by admin.';
        for (const variant of product.variants) {
          const record = inventory.variants[variant.variantId];
          if (record) {
            record.saleEnabled = false;
            changedVariants.push(variant.variantId);
          }
        }
      }

      current.updatedAt = nowIso();
      productContent.products[productId] = current;
      policy.products[productId] = productPolicy;
      await persistProductContent();
      await persistPolicy();
      await persistInventory();
      if (enabled) await persistConfig();
      const publicProduct = productPublic(product);
      audit(session, enabled ? 'product.webshop_enabled' : 'product.webshop_disabled', 'product', productId, before, { content: current, policy: productPolicy, readiness: productReadiness(productId) });
      return sendJson(res, 200, {
        productId,
        enabled,
        content: current,
        commerce: productPolicy,
        enabledVariants: publicProduct.variants.filter(item => item.checkoutEnabled).map(item => item.variantId),
        blockedVariants,
        product: publicProduct
      });
    }

    const adminLiveReviewMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)\/live-review$/);
    if (method === 'POST' && adminLiveReviewMatch) {
      const session = requireAdmin(req);
      requireCsrf(req, session);
      if (session.role !== 'owner') return sendJson(res, 403, { error: 'owner_required', message: 'Only the owner role can record or revoke live product approval.' });
      const body = await readJsonBody(req);
      const productId = decodeURIComponent(adminLiveReviewMatch[1]);
      const product = productsById.get(productId);
      if (!product) return sendJson(res, 404, { error: 'product_not_found', message: 'Product not found.' });
      const current = productContent.products[productId] || { productId };
      const productPolicy = policy.products[productId] || {};
      const before = { content: structuredClone(current), policy: structuredClone(productPolicy) };
      const approved = body.approved === true;
      if (approved) {
        const confirmation = cleanText(body.approvalConfirmation, 120);
        if (confirmation !== 'I_CONFIRM_THIS_PRODUCT_IS_LEGALLY_APPROVED_FOR_THE_LISTED_COUNTRIES') {
          return sendJson(res, 400, { error: 'live_approval_confirmation_required', message: 'The exact product legal-approval confirmation is required.' });
        }
        const reviewReference = cleanText(body.reviewReference, 240);
        if (reviewReference.length < 5) return sendJson(res, 400, { error: 'review_reference_required', message: 'Add a traceable legal/compliance review reference.' });
        const reviewed = complianceRecord(productId);
        if (!saleApproved(reviewed)) throw complianceBlocked('Record a compliance approval with scope "sale" before live approval.');
        const allowedCountrySet = new Set((config.allowedCountries || []).map(item => item.code).filter(code => reviewed.markets.includes(code)));
        const countries = (Array.isArray(body.allowedCountries) ? body.allowedCountries : []).map(value => cleanText(value, 2).toUpperCase()).filter(code => allowedCountrySet.has(code));
        if (!countries.length) return sendJson(res, 400, { error: 'approved_countries_required', message: 'Select at least one specifically approved destination country.' });
        const completeFields = ['shortDescription','fullDescription','warnings','ingredients','imageUrl'];
        const missing = completeFields.filter(field => !String(current[field] || '').trim());
        if (current.published === false || current.archived === true) missing.push('published/non-archived status');
        if (missing.length) return sendJson(res, 409, { error: 'product_content_incomplete', message: `Live approval is blocked until these requirements are complete: ${missing.join(', ')}.` });
        const requestedVariants = new Set((Array.isArray(body.variantIds) ? body.variantIds : []).map(value => cleanText(value, 180)));
        const enabledVariants = [];
        for (const variant of product.variants) {
          const record = inventory.variants[variant.variantId];
          const selected = requestedVariants.has(variant.variantId);
          if (record) record.saleEnabled = selected && Number.isInteger(record.retailPriceCents) && record.retailPriceCents > 0 && Number(record.onHand || 0) > Number(record.reserved || 0);
          if (record?.saleEnabled) enabledVariants.push(variant.variantId);
        }
        if (!enabledVariants.length) return sendJson(res, 409, { error: 'live_variant_required', message: 'Select at least one in-stock variant with a valid retail price.' });
        current.published = true;
        current.archived = false;
        current.informationOnly = false;
        current.availableForSale = true;
        current.stockStatus = 'available';
        current.allowedCountries = countries;
        current.updatedAt = nowIso();
        productPolicy.sandboxEnabled = false;
        productPolicy.liveEnabled = true;
        productPolicy.status = 'live_approved';
        productPolicy.reviewReference = reviewReference;
        productPolicy.reviewedBy = session.email;
        productPolicy.reviewedAt = nowIso();
        productPolicy.approvedCountries = countries;
        productPolicy.note = cleanText(body.note, 500) || 'Live product approval recorded by owner after external legal/compliance review.';
      } else {
        productPolicy.liveEnabled = false;
        productPolicy.status = current.archived ? 'archived' : 'information_only';
        productPolicy.reviewReference = null;
        productPolicy.reviewedBy = session.email;
        productPolicy.reviewedAt = nowIso();
        productPolicy.approvedCountries = [];
        productPolicy.note = cleanText(body.note, 500) || 'Live product approval revoked.';
        current.availableForSale = false;
        current.informationOnly = true;
        for (const variant of product.variants) if (inventory.variants[variant.variantId]) inventory.variants[variant.variantId].saleEnabled = false;
      }
      productContent.products[productId] = current;
      policy.products[productId] = productPolicy;
      await persistProductContent();
      await persistPolicy();
      await persistInventory();
      audit(session, approved ? 'product.live_approved' : 'product.live_revoked', 'product', productId, before, { content: current, policy: productPolicy });
      return sendJson(res, 200, { productId, approved, content: current, commerce: productPolicy, readiness: productReadiness(productId) });
    }

    const adminProductMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
    if (method === 'DELETE' && adminProductMatch) {
      const session = requireAdmin(req); requireCsrf(req, session); requireRole(session, 'products');
      const productId = decodeURIComponent(adminProductMatch[1]);
      if (!productsById.has(productId)) return sendJson(res, 404, { error: 'product_not_found', message: 'Product not found.' });
      const current = productContent.products[productId] || { productId };
      const before = structuredClone(current);
      current.archived = true; current.published = false; current.availableForSale = false; current.informationOnly = true; current.stockStatus = 'archived'; current.updatedAt = nowIso();
      productContent.products[productId] = current;
      const productPolicy = policy.products[productId] || {}; productPolicy.sandboxEnabled = false; productPolicy.liveEnabled = false; productPolicy.status = 'archived'; productPolicy.note = 'Archived from storefront by admin.'; policy.products[productId] = productPolicy;
      await persistProductContent(); await persistPolicy();
      audit(session, 'product.archived', 'product', productId, before, current);
      return sendJson(res, 200, { productId, archived: true });
    }
    if (method === 'PATCH' && adminProductMatch) {
      const session = requireAdmin(req);
      requireCsrf(req, session); requireRole(session, 'products');
      const body = await readJsonBody(req);
      const productId = decodeURIComponent(adminProductMatch[1]);
      if (!productsById.has(productId)) return sendJson(res, 404, { error: 'product_not_found', message: 'Product not found.' });
      const productPolicy = policy.products[productId] || {};
      const before = structuredClone(productPolicy);
      if (body.sandboxEnabled === true && !complianceSaleApproved(productId)) throw complianceBlocked('This product has no compliance approval for sale.');
      if (typeof body.sandboxEnabled === 'boolean') productPolicy.sandboxEnabled = body.sandboxEnabled;
      productPolicy.liveEnabled = false;
      const requestedStatus = cleanText(body.status || productPolicy.status || 'catalogue_only', 60);
      // v17: the commerce status is descriptive; 'live_approved' can only be set by the owner live-review action.
      if (!['catalogue_only','information_only','sandbox_sale_enabled','archived'].includes(requestedStatus)) return sendJson(res, 400, { error: 'invalid_status', message: 'Invalid commerce status.' });
      productPolicy.status = requestedStatus;
      productPolicy.note = cleanText(body.note || productPolicy.note || '', 500);
      policy.products[productId] = productPolicy;
      await persistPolicy();
      audit(session, 'product.commerce_updated', 'product', productId, before, productPolicy);
      return sendJson(res, 200, { productId, commerce: productPolicy });
    }

    const adminReturnMatch = pathname.match(/^\/api\/admin\/returns\/([^/]+)$/);
    if (method === 'PATCH' && adminReturnMatch) {
      const session = requireAdmin(req);
      requireCsrf(req, session); requireRole(session, 'returns');
      const body = await readJsonBody(req);
      const request = returns.find(item => item.id === decodeURIComponent(adminReturnMatch[1]));
      if (!request) return sendJson(res, 404, { error: 'return_not_found', message: 'Return request not found.' });
      const status = cleanText(body.status, 40);
      if (!RETURN_STATUSES.has(status)) return sendJson(res, 400, { error: 'invalid_status', message: 'Invalid return status.' });
      const before = structuredClone(request);
      request.status = status;
      request.updatedAt = nowIso();
      request.adminNote = cleanText(body.note, 500);
      await persistReturns();
      audit(session, 'return.updated', 'return', request.id, before, request);
      return sendJson(res, 200, { returnRequest: request });
    }

    return sendJson(res, 404, { error: 'not_found', message: 'API route not found.' });
  }

  async function sendNotFound(req, res, pathname, message = 'Not found') {
    // Page requests get the branded 404 page; assets and data keep a plain-text 404.
    const extension = path.extname(pathname).toLowerCase();
    if (req.method === 'GET' && (!extension || extension === '.html')) {
      try {
        const body = await fsp.readFile(path.join(rootDir, '404.html'));
        return sendText(res, 404, body.toString('utf8'), 'text/html; charset=utf-8');
      } catch { /* fall through to plain text */ }
    }
    return sendText(res, 404, message);
  }

  async function serveStatic(req, res, url) {
    let pathname = decodeURIComponent(url.pathname);
    const searchIndexingEnabled = IS_PRODUCTION && String(process.env.PRODUCTION_SEO_INDEXING || '').toLowerCase() === 'true';
    if (pathname === '/robots.txt') {
      const baseUrl = String(process.env.BASE_URL || '').replace(/\/$/, '');
      const body = searchIndexingEnabled
        ? `User-agent: *\nAllow: /\n${baseUrl ? `Sitemap: ${baseUrl}/sitemap.xml\n` : ''}`
        : 'User-agent: *\nDisallow: /\n';
      return sendText(res, 200, body, 'text/plain; charset=utf-8');
    }
    if (pathname === '/sitemap.xml') {
      if (!searchIndexingEnabled) return sendText(res, 404, 'Not found');
      const baseUrl = String(process.env.BASE_URL || '').replace(/\/$/, '');
      if (!baseUrl) return sendText(res, 503, 'BASE_URL is required for sitemap generation.');
      const pages = ['/', '/guide.html', '/support.html', '/privacy.html', '/terms.html', '/shipping-returns.html'];
      for (const product of visibleCatalogueProducts()) pages.push(`/product/${encodeURIComponent(product.id)}`);
      const escapeXml = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;').replaceAll("'",'&apos;');
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(item => `  <url><loc>${escapeXml(`${baseUrl}${item}`)}</loc></url>`).join('\n')}\n</urlset>\n`;
      return sendText(res, 200, xml, 'application/xml; charset=utf-8');
    }
    const productRoute = pathname.match(/^\/product\/([^/]+)\/?$/) || pathname.match(/^\/shop\/([^/]+)\.html$/);
    const dynamicProductId = productRoute ? decodeURIComponent(productRoute[1]) : null;
    if (pathname === '/') pathname = '/index.html';
    if (dynamicProductId) pathname = '/product.html';
    if (pathname.endsWith('/')) pathname += 'index.html';
    const relative = pathname.replace(/^\/+/, '');
    const resolved = path.resolve(rootDir, relative);
    if (!resolved.startsWith(`${rootDir}${path.sep}`) && resolved !== rootDir) return sendText(res, 403, 'Forbidden');
    const extension = path.extname(resolved).toLowerCase();
    const firstSegment = relative.split(/[\\/]/)[0];
    if (!MIME_TYPES[extension] && !extension) return sendNotFound(req, res, pathname);
    if (!MIME_TYPES[extension] || firstSegment === 'data' || firstSegment === 'outbox' || path.basename(resolved).startsWith('.')) return sendText(res, 404, 'Not found');
    // v17: explicit public surface. Only top-level pages and /assets are web content; server code,
    // scripts, tests, SQL, internal reports (*.md, *.csv) and package metadata are never served.
    const isPublicPage = !relative.includes('/') && extension === '.html';
    if (!isPublicPage && firstSegment !== 'assets') return sendNotFound(req, res, pathname);
    try {
      const stat = await fsp.stat(resolved);
      if (!stat.isFile()) return sendNotFound(req, res, pathname);
      let body = await fsp.readFile(resolved);
      if (dynamicProductId && path.basename(resolved) === 'product.html') {
        const product = productsById.get(dynamicProductId);
        const publicProduct = product ? productPublic(product) : null;
        if (!publicProduct || !isPubliclyVisible(product)) return sendNotFound(req, res, '/product.html', 'Product not found');
        const name = publicProduct.content?.displayName || publicProduct.name;
        const description = publicProduct.content?.shortDescription || `View ${name} variants and published product information.`;
        const canonicalPath = `/product/${encodeURIComponent(publicProduct.id)}`;
        const purchasable = publicProduct.variants.filter(variant => variant.checkoutEnabled && variant.retailPriceCents);
        const structured = {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name,
          description,
          sku: publicProduct.variants[0]?.catalogueNo || publicProduct.id,
          url: canonicalPath,
          ...(publicProduct.content?.imageUrl ? { image: [publicProduct.content.imageUrl] } : {}),
          ...(publicProduct.reviews?.count ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(publicProduct.reviews.average.toFixed(2)), reviewCount: publicProduct.reviews.count } } : {}),
          ...(purchasable.length ? { offers: { '@type': 'AggregateOffer', priceCurrency: config.currency, lowPrice: Math.min(...purchasable.map(variant => variant.retailPriceCents)) / 100, highPrice: Math.max(...purchasable.map(variant => variant.retailPriceCents)) / 100, offerCount: purchasable.length, availability: 'https://schema.org/InStock' } } : {})
        };
        let html = body.toString('utf8');
        const escapeMeta = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
        html = html.replace('<title>Product — VERAPEP</title>', `<title>${escapeMeta(name)} — VERAPEP</title>`)
          .replace('content="VERAPEP product details, variants, availability and published documentation."', `content="${escapeMeta(description)}"`)
          .replace('</head>', `<link rel="canonical" href="${canonicalPath}"><script type="application/ld+json">${JSON.stringify(structured).replaceAll('<','\u003c')}</script></head>`)
          .replace('<body class="', `<body data-product-id="${escapeMeta(publicProduct.id)}" class="`);
        body = Buffer.from(html);
      }
      if (extension === '.html' && searchIndexingEnabled) {
        let html = body.toString('utf8');
        html = html.replace(/<meta\s+name=["']robots["']\s+content=["']noindex, nofollow, noarchive["']\s*\/?>(?:\s*)/i, '');
        body = Buffer.from(html);
      }
      const isAsset = ['/assets/'].some(segment => pathname.startsWith(segment));
      const compressible = ['.html','.css','.js','.mjs','.json','.csv','.svg','.txt','.md'].includes(extension) && body.length > 1024;
      const acceptedEncoding = String(req.headers['accept-encoding'] || '');
      let responseBody = body;
      let contentEncoding = null;
      if (compressible && acceptedEncoding.includes('br')) {
        responseBody = zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
        contentEncoding = 'br';
      } else if (compressible && acceptedEncoding.includes('gzip')) {
        responseBody = zlib.gzipSync(body, { level: 6 });
        contentEncoding = 'gzip';
      }
      res.writeHead(200, {
        ...securityHeaders(MIME_TYPES[extension]),
        // Versioned assets (?v=) never change at that URL; unversioned ones are cached for at most an hour.
        'Cache-Control': isAsset ? (url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600, must-revalidate') : 'no-cache',
        ...(compressible ? { Vary: 'Accept-Encoding' } : {}),
        ...(contentEncoding ? { 'Content-Encoding': contentEncoding } : {}),
        'Content-Length': responseBody.length
      });
      if (req.method === 'HEAD') res.end(); else res.end(responseBody);
    } catch (error) {
      if (error.code === 'ENOENT') return sendNotFound(req, res, pathname);
      throw error;
    }
  }

  const server = http.createServer(async (req, res) => {
    res.vpAcceptEncoding = req.headers['accept-encoding'] || '';
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else if (['GET', 'HEAD'].includes(req.method || 'GET')) await serveStatic(req, res, url);
      else sendJson(res, 405, { error: 'method_not_allowed', message: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
    } catch (error) {
      const status = Number(error.status) || 500;
      if (status >= 500) {
        console.error(error);
        void notifyMonitoring({ type: 'server_error', method: req.method || 'GET', path: String(req.url || '').split('?')[0], status, code: error.code || 'request_failed' });
      }
      if (!res.headersSent) sendJson(res, status, errorPayload(error));
      else res.end();
    }
  });

  server.verapep = {
    rootDir,
    dataDir,
    databasePath: database.filePath,
    getState: () => ({ catalogue, config, policy, inventory, orders, returns, withdrawals }),
    getMode: () => getMode(),
    resetSessions: () => sessions.clear()
  };
  server.on('close', () => { try { database.close(); } catch {} });
  return server;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const port = clampInt(process.env.PORT || 3000, 1, 65535);
  const server = createVerapepServer();
  server.listen(port, '0.0.0.0', () => {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@verapep.local';
    const usingDefaultPassword = !process.env.ADMIN_PASSWORD;
    console.log(`VERAPEP information platform running at http://localhost:${port}`);
    console.log(`Mode: ${server.verapep.getMode ? server.verapep.getMode() : 'configured'}`);
    console.log(`Admin: ${adminEmail}${usingDefaultPassword ? ' / ChangeMe-123! (local test default — change before sharing)' : ''}`);
    console.log(`Storage: SQLite (${server.verapep.databasePath})`);
    console.log('Product publication, prices, inventory and commerce approvals are controlled server-side. Live checkout remains blocked until production readiness requirements pass.');
  });
}
