const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');

const root = resolve(
  __dirname,
  '../dist/remonm_front/browser'
);

const manifest = JSON.parse(
  readFileSync(resolve(root, 'ngsw.json'), 'utf8')
);

for (const [url, expected] of Object.entries(manifest.hashTable)) {
  const bytes = readFileSync(resolve(root, `.${url}`));
  const actual = createHash('sha1').update(bytes).digest('hex');

  if (actual !== expected) {
    throw new Error(`Service worker hash mismatch: ${url}`);
  }
}

console.log('Todos los hashes del build coinciden.');