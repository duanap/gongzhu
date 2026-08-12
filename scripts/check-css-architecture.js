const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const entryFile = path.join(rootDir, 'src/client/src/styles/index.css');
const mainFile = path.join(rootDir, 'src/client/src/main.js');
const expectedImports = [
  './tokens.css',
  './foundation/base.css',
  './primitives/table-elements.css',
  './features/interactions.css',
  './features/trick-events.css',
  './motion/table-effects.css',
  './motion/canonical-keyframes.css',
  './layout/desktop-table.css',
  './features/hand.css',
  './primitives/modals-tools.css',
  './features/seats.css',
  './primitives/cards.css',
  './features/results-history.css',
  './layout/mobile-fallback.css',
  './layout/responsive.css',
  './compat/desktop-parity.css',
  './layout/mobile-table.css',
  './compat/mobile-parity.css'
];
const knownDuplicateKeyframes = new Set();
const maxImportantDeclarations = 4;
const maxModuleLines = 1600;
const minTokenDeclarations = 9;

function fail(message) {
  console.error(`CSS architecture check failed: ${message}`);
  process.exitCode = 1;
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function parseImports(css) {
  return [...css.matchAll(/@import\s+['"]([^'"]+)['"]\s*;/g)].map((match) => match[1]);
}

const entryCss = read(entryFile);
const imports = parseImports(entryCss);

if (JSON.stringify(imports) !== JSON.stringify(expectedImports)) {
  fail(`unexpected import order: ${imports.join(' -> ')}`);
}

const firstNonPreludeRule = entryCss
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/@import\s+['"][^'"]+['"]\s*;/g, '')
  .trim();

if (firstNonPreludeRule) {
  fail('styles/index.css must remain an import-only manifest');
}

const resolvedFiles = imports.map((importPath) => path.resolve(path.dirname(entryFile), importPath));
for (const file of resolvedFiles) {
  if (!fs.existsSync(file)) fail(`missing imported file: ${path.relative(rootDir, file)}`);
}

for (const retiredPath of [
  'src/client/src/styles.css',
  'src/client/src/styles/mobile-legacy.css',
  'src/client/src/styles/overrides'
]) {
  if (fs.existsSync(path.join(rootDir, retiredPath))) {
    fail(`retired CSS path returned: ${retiredPath}`);
  }
}

const mainCssImports = [...read(mainFile).matchAll(/import\s+['"](.+?\.css)['"];/g)]
  .map((match) => match[1]);
if (JSON.stringify(mainCssImports) !== JSON.stringify(['./styles/index.css'])) {
  fail(`main.js must import only ./styles/index.css, found: ${mainCssImports.join(', ')}`);
}

const keyframes = new Map();
let importantCount = 0;
let totalLines = 0;
let totalBytes = 0;

for (const file of resolvedFiles) {
  const css = read(file);
  const relativeFile = path.relative(rootDir, file);
  const lineCount = css.split('\n').length;
  totalLines += lineCount;
  totalBytes += Buffer.byteLength(css);
  importantCount += (css.match(/!important\b/g) || []).length;

  if (lineCount > maxModuleLines) {
    fail(`${relativeFile} has ${lineCount} lines; module limit is ${maxModuleLines}`);
  }

  for (const match of css.matchAll(/@(?:-webkit-)?keyframes\s+([A-Za-z0-9_-]+)/g)) {
    const locations = keyframes.get(match[1]) || [];
    locations.push(relativeFile);
    keyframes.set(match[1], locations);
  }
}

const duplicates = [...keyframes.entries()]
  .filter(([, locations]) => locations.length > 1)
  .map(([name]) => name)
  .sort();
const unexpectedDuplicates = duplicates.filter((name) => !knownDuplicateKeyframes.has(name));
const missingKnownDuplicates = [...knownDuplicateKeyframes].filter((name) => !duplicates.includes(name));

if (unexpectedDuplicates.length) {
  fail(`new duplicate keyframes: ${unexpectedDuplicates.join(', ')}`);
}
if (missingKnownDuplicates.length) {
  fail(
    `duplicate-keyframe baseline changed; tighten the gate for: ${missingKnownDuplicates.join(', ')}`
  );
}
if (importantCount > maxImportantDeclarations) {
  fail(`!important count grew from ${maxImportantDeclarations} to ${importantCount}`);
}

const tokenFile = path.join(rootDir, 'src/client/src/styles/tokens.css');
const tokenDeclarations = (read(tokenFile).match(/^\s*--[A-Za-z0-9_-]+\s*:/gm) || []).length;
if (tokenDeclarations < minTokenDeclarations) {
  fail(`semantic token baseline fell from ${minTokenDeclarations} to ${tokenDeclarations}`);
}

console.log(
  `CSS architecture: ${resolvedFiles.length} files, ${totalLines} lines, ${totalBytes} bytes, `
  + `${importantCount} !important, ${duplicates.length} duplicate keyframes, `
  + `${tokenDeclarations} root tokens`
);
