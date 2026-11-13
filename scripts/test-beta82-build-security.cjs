'use strict';
// Beta 82: fail early if the security-patched npm lockfile regresses.
// No external network, credentials, user data or npm installation required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const wanted = new Map([
  ['node_modules/body-parser', ['1.20.9', 'sha512-FISIQxV5u91Y9gvuFq3q/tA/qTqLJn3AhRcEvyozyhJTh5OBFFtv827AdHU7Rbyct4r+Ba1/99oFa1Y3yuFsdw==']],
  ['node_modules/multer', ['2.5.0', 'sha512-BsqOzYGVq49JcW2IzoSAxeKYRevb+dGGPPWleOR8Lrlk4igwxu1/9pwSXlByhCb7MVZDrNJFC0IBP5/O5nLYRw==']],
  ['node_modules/fast-uri', ['3.1.9', 'sha512-hS/0Wt3Ya043oKXs0sIxrMpKQITXhMLIrVAKKXi4gozGC9v7YRWVnXIZzjNPTO02M9BdxLCWqK1yRXgNziVyJQ==']],
  ['node_modules/undici', ['7.30.1', 'sha512-03KrMbjIFDWQR5RNPrSw3bd1r12JpyFQl9/yxjUbJtqkjmllqC5lFjZh6ujeuJCKr8EOQvRW872Oy/az+nLYxg==']],
  ['node_modules/node-gyp/node_modules/undici', ['6.29.1', 'sha512-EvRlUt/QqAEvXdQeRMYUfwOQsfzpDztykrG2owGEE/rBOBoYv9uF39ZzsNDh4lTFHhTr2XOZjKkYgueD12ZmGA==']],
]);
assert.equal(pkg.version, '2.1.2');
assert.equal(lock.version, pkg.version);
assert.equal(lock.lockfileVersion, 3);
assert.equal(pkg.dependencies.multer, '2.5.0');
for (const group of ['dependencies', 'devDependencies']) {
  assert.deepEqual(lock.packages[''][group], pkg[group], 'Package roots must stay synchronized: ' + group);
}
for (const [loc, [version, integrity]] of wanted) {
  const dep = lock.packages[loc];
  assert.ok(dep, 'Missing dependency ' + loc);
  assert.equal(dep.version, version, 'Unexpected version for ' + loc);
  assert.equal(dep.integrity, integrity, 'Archive integrity changed for ' + loc);
  const name = loc.split('node_modules/').pop();
  assert.equal(dep.resolved, `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`, 'Unexpected registry for ' + loc);
  assert.equal(Buffer.from(integrity.substring(7), 'base64').length, 64, 'Invalid SHA-512 digest for ' + loc);
}
for (const [loc, dep] of Object.entries(lock.packages)) {
  if (/\/node_modules\/(?:body-parser|multer|fast-uri|undici)$/.test('/' + loc)) {
    assert.ok(wanted.has(loc), 'Unreviewed extra instance of vulnerable dependency: ' + loc);
  }
}
assert.equal(lock.packages['node_modules/express'].dependencies['body-parser'], '~1.20.5', 'Express-compatible fixed body-parser release must remain within its required range');
console.log('OK Beta82 security lock: five patched lock entries, SHA-512, compatible Express 4.22.3, exact multer 2.5.0, no unreviewed duplicates.');
