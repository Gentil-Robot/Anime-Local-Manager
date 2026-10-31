'use strict';
// Security pin regression: this does not require the build machine to already
// use the recommended version; the app's historic >=22.12 engine remains.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8').trim();
const pkg=JSON.parse(read('package.json'));
assert.equal(read('.node-version'),'22.23.4');
assert.equal(read('.nvmrc'),read('.node-version'));
assert.equal(pkg.engines.node,'>=22.12.0');
assert.equal(pkg.devDependencies.electron,'45.2.1');
assert.equal(pkg.dependencies.multer,'2.5.0');
assert(read('README.md').includes('22.23.4'));
console.log('OK GAP82 toolchain: verified security release Node 22.23.4 for builds, unchanged app engines and Electron 45.2.1 candidate.');
