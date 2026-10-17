// WCAG 2.x contrast check for the token pairs in config/contrast-pairs.json.
// Reads the resolved colours from build/json. Known, documented failures live in
// config/known-issues.json; any other failure (or a "known" issue that now passes) fails the run.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

const { pairs } = read('config/contrast-pairs.json');
const knownList = fs.existsSync(path.join(root, 'config/known-issues.json'))
  ? read('config/known-issues.json').issues
  : [];
const known = new Map(knownList.map((i) => [`${i.pair}:${i.mode}`, i]));
const themes = { light: read('build/json/light.json'), dark: read('build/json/dark.json') };

function parseHex(hex) {
  const h = hex.replace('#', '');
  if (![6, 8].includes(h.length)) throw new Error(`Unsupported colour "${hex}"`);
  const n = (i) => parseInt(h.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
}

const over = (fg, bg) => ({
  r: fg.r * fg.a + bg.r * (1 - fg.a),
  g: fg.g * fg.a + bg.g * (1 - fg.a),
  b: fg.b * fg.a + bg.b * (1 - fg.a),
  a: 1,
});

const channel = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ({ r, g, b }) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const get = (theme, name) => {
  const v = themes[theme][name];
  if (!v) throw new Error(`Token "${name}" not found in ${theme} theme`);
  return parseHex(v);
};

let failed = 0;
let knownCount = 0;
let passed = 0;
const rows = [];

for (const theme of Object.keys(themes)) {
  for (const p of pairs) {
    let bg = get(theme, p.bg);
    if (bg.a < 1) bg = over(bg, p.over ? get(theme, p.over) : { r: 255, g: 255, b: 255, a: 1 });
    let fg = get(theme, p.fg);
    if (fg.a < 1) fg = over(fg, bg);
    const r = ratio(fg, bg);
    const ok = r >= p.min;
    const key = `${p.id}:${theme}`;
    let status;
    if (ok && known.has(key)) {
      status = 'FIXED?';
      failed++;
    } else if (ok) {
      status = 'pass';
      passed++;
    } else if (known.has(key)) {
      status = 'known';
      knownCount++;
    } else {
      status = 'FAIL';
      failed++;
    }
    rows.push({ theme, id: p.id, ratio: r.toFixed(2), min: p.min, status });
  }
}

const widest = Math.max(...rows.map((r) => r.id.length));
for (const r of rows) {
  const note = known.get(`${r.id}:${r.theme}`)?.ref ? `  (${known.get(`${r.id}:${r.theme}`).ref})` : '';
  console.log(
    `${r.status.padEnd(6)} ${r.theme.padEnd(5)} ${r.id.padEnd(widest)}  ${r.ratio.padStart(5)} : 1  (min ${r.min})${r.status === 'known' ? note : ''}`,
  );
}
console.log(`\n${passed} passed, ${knownCount} known issues, ${failed} to fix`);
if (failed) {
  console.log('Fix the tokens, or record the issue in config/known-issues.json. A "FIXED?" row means a known issue now passes: remove it from the list.');
  process.exit(1);
}
