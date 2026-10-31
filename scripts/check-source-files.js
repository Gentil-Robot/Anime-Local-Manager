'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FIXTURES = [
  'scripts/fixtures/karaoke-audio-review-beta38.json',
  'scripts/fixtures/tvmaze-captured-20261009.json',
];
const REQUIRED = ['scripts/release-workspace.js','scripts/build-cleanup.js','scripts/test-beta82-build.cjs','scripts/test-beta74-import.cjs','public/community-age.js','public/input-focus.js','scripts/test-beta72-age.cjs','scripts/test-beta72-ui.cjs','supabase/migrations/20261018105401_alm_beta72_age_sharing.sql','scripts/test-beta71-package.cjs','scripts/package-dependencies.js','scripts/test-beta70-windows-paths.cjs','scripts/package-local-modules.js','scripts/test-beta69-package.cjs','scripts/test-beta69-engine-electron.cjs','scripts/test-beta68-ui.cjs','scripts/test-beta68-release.cjs','lib/notebook-model.js','lib/notebook.js','lib/notebook-export.js','public/notebook-copy.js','public/notebook.js','public/notebook.css','scripts/test-beta67-notebook.cjs','scripts/test-beta67-ui.cjs','community/library-stats.js','community/content-policy.js','community/content-entry.js','data/database/community-content-policy.json','public/community-content.js','community/site/community-content.js','scripts/build-community-content-policy.cjs','scripts/test-beta66-ui.cjs','scripts/test-beta66-policy.cjs','supabase/migrations/20261017211127_alm_beta66_content_policy.sql','lib/community-snapshot.js','scripts/test-beta65-ui.cjs','scripts/test-beta65-sync.cjs','scripts/test-beta64-diagnostic.cjs','public/watch-status.js','community/site/watch-status.js','community/site/series-state.js','community/site/season-reference.js','scripts/test-beta64-ui.cjs','scripts/test-beta64-favorites.cjs','community/support-diagnostics.js','public/support-diagnostics.js','community/site/support-diagnostics.js','supabase/functions/alm-public/support-model.ts','supabase/migrations/20261017174703_alm_beta63_sessions_and_covers.sql','scripts/test-beta63-support.cjs','scripts/test-beta63-sql.cjs','scripts/test-beta63-ui.cjs','scripts/test-beta62-sync.cjs','scripts/test-beta62-sql.cjs','supabase/migrations/20261017123150_alm_beta62_social_limits.sql','release-version.json','public/release-version.js','community/site/release-version.js','scripts/sync-release-version.cjs','scripts/test-release-v200.cjs','scripts/test-release-console.cjs','scripts/refresh-release-manifests.cjs','README.md','public/clipboard.js','public/community-workspace.js','public/community-workspace.css','public/community-workspace-copy.js','public/legal-content.js','public/privacy-policy.html','public/legal-notice.html','supabase/migrations/20261016173601_alm_beta61_community_workspace.sql','scripts/test-beta61-runtime.cjs','scripts/test-beta61-ui.cjs','scripts/test-beta61-flows.cjs','scripts/test-beta61-scheduler.cjs','scripts/test-beta61-sql.cjs','scripts/test-beta61-public.cjs','lib/community-account.js','public/community-security.js','public/community-upgrade-copy.js','public/community-forms.js','public/community-ui-extra.js','community/web-client.js','supabase/functions/alm-public/index.ts','supabase/migrations/20261014183409_alm_beta60_minimal_payload.sql','scripts/test-beta60-runtime.cjs','scripts/test-beta60-sql.cjs','scripts/test-beta60-public.cjs','scripts/test-beta60-browser.cjs','community-config.json','lib/community.js','lib/maintenance.js','lib/os-maintenance.js','public/community-model.js','public/community-copy.js','public/community.js','public/community.css','public/maintenance.js','scripts/test-beta59-community.js','scripts/test-beta59-maintenance.js','scripts/test-beta59-http.js','build/installer.nsh','server.js', 'db.js', 'main.js', 'preload.js', 'csv-worker.js', 'package.json', 'package-lock.json', 'public/index.html', 'scripts/test-beta-stable.js', 'scripts/build-windows-retry.js', 'lib/library-automation.js', 'lib/catalogue-title-index.js', 'lib/catalogue-index-worker.js', 'lib/import-candidate-validation.js', 'public/beta56.js', 'public/beta56.css', 'scripts/test-beta56-runtime.js', 'scripts/test-beta56-restart.js', 'public/season-reference.js', 'public/beta57.js', 'public/beta57.css', 'lib/metadata-preferences.js', 'lib/media-link.js', 'lib/import-progress-evidence.js', 'scripts/test-beta57-runtime.js', 'scripts/test-beta57-browser.js',  'scripts/release-windows.js', 'scripts/release-utils.js', 'scripts/verify-project.js', 'scripts/verification-plan.json', 'scripts/smoke-windows.js', 'lib/release-smoke.js', 'scripts/test-beta58-release.js', 'scripts/test-beta58-smoke.js', 'scripts/test-beta58-tooling.js', '.github/workflows/windows-installer.yml', '.gitattributes', '.node-version', ...FIXTURES];

function checkSource(root) {
  const issues = [];
  for (const name of REQUIRED) {
    if (!fs.existsSync(path.join(root, name))) issues.push(`Fichier absent : ${name}`);
  }
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.join(root, 'SOURCE-MANIFEST.json'), 'utf8')); }
  catch { issues.push('SOURCE-MANIFEST.json absent ou illisible : extraction incomplete.'); }
  if (manifest) {
    if (manifest.schema !== 1 || !Array.isArray(manifest.files)) {
      issues.push('SOURCE-MANIFEST.json invalide.');
    } else {
      for (const name of REQUIRED) {
        if (!manifest.files.some(entry => entry?.path === name)) issues.push(`Fichier non reference dans le manifeste : ${name}`);
      }
      for (const entry of manifest.files) {
        if (!entry || typeof entry.path !== 'string' || entry.path.includes('\\') || entry.path.split('/').some(p => p === '..' || !p) || path.isAbsolute(entry.path) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
          issues.push('Entree invalide dans SOURCE-MANIFEST.json.');
          continue;
        }
        const target = path.join(root, entry.path);
        try {
          const bytes = fs.readFileSync(target);
          if (bytes.length !== entry.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== entry.sha256) issues.push(`Fichier incomplet ou modifie : ${entry.path}`);
        } catch {
          if (!issues.includes(`Fichier absent : ${entry.path}`)) issues.push(`Fichier absent ou illisible : ${entry.path}`);
        }
      }
    }
  }
  return { ok: issues.length === 0, issues, count: manifest?.files?.length || 0 };
}

function main() {
  const result = checkSource(path.resolve(__dirname, '..'));
  if (result.ok) {
    console.log(`[archive] OK : ${result.count} fichiers verifies par SHA-256.`);
    return 0;
  }
  console.error('[archive] Le dossier extrait est incomplet ou ne correspond pas a cette livraison.');
  for (const issue of result.issues.slice(0, 20)) console.error(` - ${issue}`);
  if (result.issues.length > 20) console.error(` - ... ${result.issues.length - 20} autre(s) anomalie(s).`);
  console.error('Telecharge la derniere archive complete, puis utilise Extraire tout dans un nouveau dossier.');
  console.error('Aucune installation de dependances ni construction n a ete lancee.');
  return 1;
}

module.exports = { checkSource, REQUIRED, FIXTURES };
if (require.main === module) process.exitCode = main();
