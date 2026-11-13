'use strict';
// Security pin regression: this does not require the build machine to already
// use the recommended version; the app's historic >=22.12 engine remains.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8').trim();
const pkg=JSON.parse(read('package.json'));
assert.equal(read('.node-version'),'24.22.2');
assert.equal(read('.nvmrc'),read('.node-version'));
assert.equal(pkg.engines.node,'>=22.12.0');
assert.equal(pkg.devDependencies.electron,'45.3.1');
assert.equal(pkg.dependencies.multer,'2.5.0');
assert(read('README.md').includes('24.22.2'));
console.log('OK GAP82 toolchain: Node 24.22.2 CI pin, unchanged app engines and Electron 45.3.1 candidate.');
