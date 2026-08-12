'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readJsonFile, writeJsonAtomic } = require('./jsonPersistence');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearts-json-'));
const dataFile = path.join(tempDir, 'state.json');

writeJsonAtomic(dataFile, { version: 1, rows: [1, 2, 3] });
assert.deepStrictEqual(JSON.parse(fs.readFileSync(dataFile, 'utf8')), { version: 1, rows: [1, 2, 3] });
assert.strictEqual(fs.readdirSync(tempDir).some(name => name.endsWith('.tmp')), false);

fs.writeFileSync(dataFile, '{invalid', 'utf8');
const warnings = [];
const fallback = readJsonFile(dataFile, {
  fallback: () => ({ rows: [] }),
  label: 'test state',
  logger: { warn: message => warnings.push(message) }
});
assert.deepStrictEqual(fallback, { rows: [] });
assert.strictEqual(warnings.length, 1);
assert.strictEqual(fs.readdirSync(tempDir).some(name => name.startsWith('state.json.corrupt-')), true);

fs.rmSync(tempDir, { recursive: true, force: true });
console.log('JSON persistence tests passed');
