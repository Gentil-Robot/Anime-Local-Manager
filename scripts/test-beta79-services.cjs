'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const site = path.join(root, 'community/site');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'alm79-services-'));
const readSite = file => fs.readFileSync(path.join(site, file), 'utf8');

// Run the actual browser version scripts, rather than looking for an obsolete
// hard-coded `const VERSION = '...';` declaration. The product intentionally
// derives the visible version from release-version.json via ALM_RELEASE.
function browserContext(releaseOverride) {
  const context = {
    window: {
      addEventListener() {},
      dispatchEvent() {},
      ...(releaseOverride ? {ALM_RELEASE: releaseOverride} : {})
    },
    document: {documentElement: {lang: 'fr', dataset: {}}},
    localStorage: {getItem() { return null; }, setItem() {}},
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
  };
  if (!releaseOverride) vm.runInNewContext(readSite('release-version.js'), context, {filename: 'release-version.js'});
  vm.runInNewContext(readSite('design-core.js'), context, {filename: 'design-core.js'});
  return context.window;
}

async function main() {
  try {
    const out = path.join(temp, 'function.cjs');
    require('esbuild').buildSync({
      entryPoints: [path.join(root, 'supabase/functions/alm-public/index.ts')],
      bundle: true, platform: 'node', format: 'cjs', outfile: out
    });
    const {handle} = require(out);
    const version = require('../package.json').version;
    const release = JSON.parse(fs.readFileSync(path.join(root, 'release-version.json'), 'utf8'));
    const deps = {
      env: key => key === 'ALM_TURNSTILE_SITE_KEY' ? 'fictional-public' : undefined,
      fetch: () => { throw Error('Unexpected network request'); },
      crypto: crypto.webcrypto
    };
    const response = await handle(new Request('https://fixture.invalid/functions/v1/alm-public/config', {
      headers: {Origin: 'https://animelocalmanager.com'}
    }), deps);
    const config = await response.json();
    assert.equal(response.status, 200);
    assert.equal(config.releaseVersion, version);
    assert.equal(config.ready, false);
    assert.equal(config.diagnosticVersion, 1);
    assert.equal(config.diagnosticSectionsVersion, 2);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const denied = await handle(new Request('https://fixture.invalid/functions/v1/alm-public/config', {
      headers: {Origin: 'https://untrusted.invalid'}
    }), deps);
    assert.equal(denied.status, 403);

    const manifest = JSON.parse(readSite('release-manifest.json'));
    assert.equal(manifest.version, config.releaseVersion);
    assert.equal(release.technicalVersion, version);
    assert.equal(release.distributionChannel, 'beta');
    assert.equal(release.githubPrerelease, true);
    const browser = browserContext();
    assert.equal(browser.ALM_RELEASE.technicalVersion, version);
    assert.equal(browser.ALM_RELEASE.publicVersion, release.publicVersion);
    assert.equal(browser.ALM_DESIGN.VERSION, version);
    assert.equal(browser.ALM_DESIGN.edition(), release.publicVersion);
    assert.equal(browser.ALM_RELEASE.distributionChannel, 'beta');

    // A later version must be resolved from release metadata, not frozen in UI code.
    const future = {...release, technicalVersion: '2.0.1', publicVersion: 'V2.0.1 Bêta stable'};
    const futureBrowser = browserContext(future);
    assert.equal(futureBrowser.ALM_DESIGN.VERSION, future.technicalVersion);
    assert.equal(futureBrowser.ALM_DESIGN.edition(), future.publicVersion);

    let checkedHtml = 0;
    for (const file of fs.readdirSync(site).filter(name => name.endsWith('.html'))) {
      const html = readSite(file);
      const releaseIndex = html.indexOf('src="/release-version.js"');
      const designIndex = html.indexOf('src="/design-core.js"');
      if (designIndex === -1) continue;
      assert(releaseIndex !== -1 && releaseIndex < designIndex, `${file}: release metadata must load before design-core`);
      checkedHtml++;
    }
    assert(checkedHtml >= 1, 'At least one public HTML entry point must load design-core');

    for (const record of manifest.files) {
      const bytes = fs.readFileSync(path.join(site, record.path));
      assert.equal(bytes.length, record.bytes, record.path);
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), record.sha256, record.path);
    }
    console.log(`OK Beta79: Edge config, beta release metadata, dynamic UI version, ${checkedHtml} HTML entry points, all website SHA-256 hashes, no-store and origin protections. No network or email.`);
  } finally {
    fs.rmSync(temp, {recursive: true, force: true});
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
