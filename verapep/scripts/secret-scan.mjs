/* Secret and sensitive-file scanner (v18). Used by CI and runnable locally.

   node scripts/secret-scan.mjs                 scan the working tree of this project
   node scripts/secret-scan.mjs --dir <path>    scan another directory (e.g. an unpacked release)
   node scripts/secret-scan.mjs --history       also scan every added line in the git history

   Reports file, line and pattern name only — never the matched value. Exit code 1 on findings. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PATTERNS = [
  ['Stripe live/test secret key', /\b[sr]k_(live|test)_[A-Za-z0-9]{16,}/],
  ['Stripe webhook secret', /\bwhsec_[A-Za-z0-9]{16,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Anthropic/OpenAI key', /\bsk-(ant-)?[A-Za-z0-9_-]{32,}/],
  ['Private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Database URL with password', /\b(postgres(ql)?|mysql|mongodb(\+srv)?):\/\/[^\s:@/'"]+:[^\s@/'"]{4,}@/],
  ['Neon password', /\bnpg_[A-Za-z0-9]{12,}/],
  ['Vercel token', /\bvercel_[A-Za-z0-9]{20,}/],
  ['JSON web token', /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/],
  ['scrypt password hash', /\bscrypt\$[0-9a-f]{32}\$[0-9a-f]{64,}/],
  ['Encrypted MFA seed', /\benc:v1:[A-Za-z0-9_-]{8,}:[A-Za-z0-9_-]{8,}:/],
  ['Secret assignment', /(^|[\s;{(,])(export\s+)?([A-Z0-9]+_)*(SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|ACCESS_TOKEN|AUTH_TOKEN|ENCRYPTION_KEY|SECRET_KEY)\s*[=:]\s*["'`]?(?!(ChangeMe-123!|change-?me|byt-|your|example|replace|placeholder|xxx|\$\{|<|\.\.\.|…|process\.env|false|true|null|undefined))[A-Za-z0-9+/=_\-!@#%^&*.]{12,}/]
];

// Files that must never be committed or shipped, whatever their content.
export const FORBIDDEN_FILES = [/(^|\/)\.env$/, /(^|\/)\.env\.(local|production|development)$/, /\.sqlite(-wal|-shm)?$/, /\.db$/, /(^|\/)backups\//, /(^|\/)outbox\/.+\.json$/, /\.(pem|key|p12|pfx)$/, /(^|\/)id_(rsa|ed25519)/, /\.xlsm?$/];

const SKIP_DIRS = new Set(['node_modules', '.git', 'previews', '__pycache__']);
const SKIP_FILES = [/^tests\/vendor\//, /\.(png|jpe?g|webp|avif|gif|ico|woff2?|mp4|webm|zip)$/i];
// Deliberate test fixtures that must look like secrets; the scanner's own tests rely on them.
const ALLOW_LINE = /secret-scan:allow/;

export function scanText(text, file) {
  const findings = [];
  text.split('\n').forEach((line, index) => {
    if (ALLOW_LINE.test(line)) return;
    for (const [name, pattern] of PATTERNS) if (pattern.test(line)) findings.push({ file, line: index + 1, pattern: name });
  });
  return findings;
}

export function scanDirectory(root) {
  const findings = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(rel); continue; }
      if (FORBIDDEN_FILES.some(rule => rule.test(rel)) && !rel.startsWith('data/verapep.sqlite') && !/^data\/(backups|outbox)\//.test(rel)) findings.push({ file: rel, line: 0, pattern: 'Forbidden file type' });
      if (SKIP_FILES.some(rule => rule.test(rel))) continue;
      const stat = fs.statSync(path.join(root, rel));
      if (stat.size > 5_000_000) continue;
      findings.push(...scanText(fs.readFileSync(path.join(root, rel), 'utf8'), rel));
    }
  };
  walk('');
  return findings;
}

export function scanHistory(cwd) {
  const log = execFileSync('git', ['log', '--all', '-p', '-U0', '--no-color', '--format=commit %h'], { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
  const findings = [];
  let commit = '';
  let file = '';
  for (const line of log.split('\n')) {
    if (line.startsWith('commit ')) commit = line.slice(7);
    else if (line.startsWith('+++ b/')) {
      file = line.slice(6);
      if (FORBIDDEN_FILES.some(rule => rule.test(file))) findings.push({ file: `${commit}:${file}`, line: 0, pattern: 'Forbidden file type committed' });
    } else if (line.startsWith('+') && !line.startsWith('+++') && !SKIP_FILES.some(rule => rule.test(file))) {
      for (const finding of scanText(line.slice(1), `${commit}:${file}`)) findings.push({ ...finding, line: 0 });
    }
  }
  return findings;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const dirIndex = args.indexOf('--dir');
  const root = path.resolve(dirIndex > -1 ? args[dirIndex + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const findings = scanDirectory(root);
  if (args.includes('--history')) findings.push(...scanHistory(root));
  if (!findings.length) {
    console.log(`Secret scan: no secrets or forbidden files found in ${args.includes('--history') ? 'working tree and git history' : 'working tree'} (${root}).`);
  } else {
    console.error(`Secret scan: ${findings.length} finding(s) (values not shown):`);
    for (const item of findings) console.error(`  ${item.file}${item.line ? `:${item.line}` : ''}  ${item.pattern}`);
    process.exit(1);
  }
}
