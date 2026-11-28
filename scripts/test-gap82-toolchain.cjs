'use strict';
// Security floors include both supported LTS branches; CI pins the validated Node 24 patch.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8').trim();
const pkg=JSON.parse(read('package.json'));
assert.equal(read('.node-version'),'24.22.3');
assert.equal(read('.nvmrc'),read('.node-version'));
assert.equal(pkg.engines.node,'^22.23.5 || ^24.22.3');
assert.equal(pkg.devDependencies.electron,'45.5.0');
assert.equal(pkg.dependencies.multer,'2.5.0');
assert(read('README.md').includes('24.22.3'));
console.log('OK toolchain: Node 24.22.3 CI pin, patched LTS engine floors and Electron 45.5.0 candidate.');
