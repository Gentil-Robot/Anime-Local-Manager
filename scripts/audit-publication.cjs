'use strict';
// Safe, dependency-free gate to prevent high-confidence credentials and private
// files from entering a public source release. Never prints matched values.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'SOURCE-MANIFEST.json'), 'utf8'));
const prohibitedNames = [
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)(?:node_modules|\.git|dist|logs|\.release-work|\.vercel)(?:\/|$)/i,
  /\.(?:pfx|p12|pem|key|sqlite|sqlite3|db)(?:$)/i,
  /(^|\/)id_(?:rsa|ed25519)(?:\.|$)/i,
];
const patterns = [
  ['pem_private_key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
  ['github_token', /(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/g],
  ['supabase_private_key', /sb_secret_[A-Za-z0-9_-]{18,}/g],
  ['aws_access_key', /AKIA[0-9A-Z]{16}/g],
  ['stripe_private_key', /(?:sk_live_|rk_live_)[A-Za-z0-9]{20,}/g],
  ['resend_private_key', /re_[A-Za-z0-9]{30,}/g],
  ['jwt_token', /eyJ[A-Za-z0-9_-]{16,}\.eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g],
  ['embedded_http_credentials', /https?:\/\/[^\s/@:]{2,}:[^\s/@]{6,}@(?!example\.(?:test|invalid|com)\b)/g],
];
const binaryExt = /\.(?:mp4|mp3|ogg|wav|png|jpe?g|gif|webp|ico|gz|woff2?|ttf|otf|pdf|zip|7z|exe)$/i;
const issues = [];
let textFiles = 0;
let size = 0;
for (const entry of manifest.files) {
  const name = entry.path;
  if (prohibitedNames.some(p => p.test(name))) { issues.push({path:name, reason:'prohibited_path'}); continue; }
  const full = path.resolve(root, name);
  if (!full.startsWith(root + path.sep)) { issues.push({path:name, reason:'outside_project'}); continue; }
  if (!fs.existsSync(full)) { issues.push({path:name, reason:'missing'}); continue; }
  if (binaryExt.test(name)) continue;
  const data = fs.readFileSync(full);
  const digest = crypto.createHash('sha256').update(data).digest('hex');
  if (entry.sha256 !== digest || entry.bytes !== data.length) {
    issues.push({path:name, reason:'manifest_mismatch'});
    continue;
  }
  const content = data.toString('utf8');
  if (content.includes('\ufffd')) { issues.push({path:name, reason:'unexpected_binary_content'}); continue; }
  textFiles++;
  size += data.length;
  for (const [reason, pattern] of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) issues.push({path:name, reason});
  }
}
// The manifest itself is not listed among manifest.files.
const outcome = {
  schema:1,
  fileCount:manifest.files.length,
  scannedTextFiles:textFiles,
  scannedTextBytes:size,
  violations:issues,
  status:issues.length ? 'blocked' : 'passed',
  limitations:'High-confidence pattern scan, not a replacement for human rights and security review.'
};
console.log(JSON.stringify(outcome, null, 2));
if (issues.length) process.exitCode = 1;
