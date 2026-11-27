'use strict';
// Independent static publication and preview isolation gate.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),yaml=require('js-yaml');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=yaml.load(read('.github/workflows/source-review.yml'));
const release=yaml.load(read('.github/workflows/windows-installer.yml'));
assert.equal(source.permissions.contents,'read');
assert.equal(release.permissions.contents,'read');
assert(!release.jobs.publish);
assert(!release.on.push);
for(const job of Object.values(source.jobs)){
 assert(!job.permissions||job.permissions.contents==='read');
 assert(!JSON.stringify(job).includes('secrets.'));
}
for(const job of ['vm-preview-installer','linux-preview']){
 const j=source.jobs[job];assert(j);
 for(const dep of ['verify','security-review','electron-lock-candidate'])assert(j.needs.includes(dep));
 assert(j.if.includes("github.base_ref == 'release/v2.2.0'"));
}
assert(!JSON.stringify(release).includes('secrets.'));
assert.match(read('Preparer-GitHub-V2.ps1'),/if \(\$PublierBranche\) \{ throw 'ALM_V220_PUBLICATION_SUSPENDED'/);
assert.match(read('Publier-GitHub-V2.ps1'),/if \(\$Publier\) \{ throw 'ALM_V220_PUBLICATION_SUSPENDED'/);
const builder=read('scripts/build-v220-vm-preview.cjs');
assert.match(builder,/ALM_PREVIEW_HOOK_COUNT/);
assert.match(builder,/pkg\.build\.appId='fr\.gentilrobot\.animelocalmanager\.vmtest'/);
assert.match(builder,/pkg\.name='anime-local-manager-vm-test'/);
assert.match(builder,/'--publish','never'/);
assert.match(builder,/if\(removeMaintenance\)\{app\.quit\(\);return;\}/);
assert.match(read('scripts/v220-smoke-linux.cjs'),/assert\.equal\(process\.env\.GITHUB_ACTIONS,'true'\)/);
console.log('OK release isolation: read-only CI, no automatic or scripted publication, separate Windows/Linux package identity and gated artifacts.');
