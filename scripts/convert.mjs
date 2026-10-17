// Converts the Figma export (token pusher JSON) into W3C design-token (DTCG) files,
// one file per collection and mode, ready for Style Dictionary.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sourceFile = path.join(root, 'source', 'homebase-tokens-exported.json');
const outDir = path.join(root, 'tokens');

const slug = (s) =>
  s.toLowerCase().replace(/%/g, 'pct').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// "{Font theme/Static/Font/Brand}" -> "{font-theme.static.font.brand}"
const toRef = (v) =>
  typeof v === 'string'
    ? v.replace(/\{([^}]+)\}/g, (_, p) => `{${p.split('/').map(slug).join('.')}}`)
    : v;

const DIMENSION_TAILS = new Set(['size', 'line-height', 'tracking']);

function tokenType(collection, segments, jsonType) {
  if (jsonType === 'color') return 'color';
  if (jsonType === 'number') {
    if (collection === 'shape') return 'dimension';
    if (collection === 'typescale' && DIMENSION_TAILS.has(segments.at(-1))) return 'dimension';
    return 'number';
  }
  if (collection === 'font-theme' && segments.includes('font')) return 'fontFamily';
  if (collection === 'typescale' && segments.at(-1) === 'font') return 'fontFamily';
  return 'string';
}

function setPath(tree, segments, leaf, label) {
  let node = tree;
  for (const s of segments.slice(0, -1)) {
    if (node[s] && node[s].$value !== undefined) throw new Error(`Token/group clash at "${label}"`);
    node = node[s] ??= {};
  }
  const last = segments.at(-1);
  if (node[last]) throw new Error(`Duplicate or clashing token name "${label}"`);
  node[last] = leaf;
}

const src = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let files = 0;
let tokens = 0;

for (const [name, set] of Object.entries(src)) {
  if (name.startsWith('$') || typeof set !== 'object' || Array.isArray(set)) continue;
  const collection = slug(set.$collection ?? name);
  const modes = set.$modes ?? [null];

  for (const mode of modes) {
    const tree = {};
    let count = 0;
    for (const [tokenName, t] of Object.entries(set)) {
      if (tokenName.startsWith('$')) continue;
      const segments = tokenName.split('/').map(slug);
      const raw = mode && t.$modes && mode in t.$modes ? t.$modes[mode] : t.value;
      const leaf = { $value: toRef(raw), $type: tokenType(collection, segments, t.type) };
      if (t.description) leaf.$description = t.description;
      setPath(tree, segments, leaf, `${collection}/${tokenName}`);
      count++;
    }
    const file = mode ? `${collection}.${slug(mode)}.json` : `${collection}.json`;
    fs.writeFileSync(path.join(outDir, file), JSON.stringify({ [collection]: tree }, null, 2) + '\n');
    console.log(`  ${file.padEnd(30)} ${String(count).padStart(4)} tokens`);
    files++;
    tokens += count;
  }
}

console.log(`Converted ${tokens} tokens into ${files} files in tokens/`);
