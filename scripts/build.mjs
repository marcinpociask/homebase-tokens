// Builds code outputs from the DTCG token files with Style Dictionary.
//   build/css/base.css            shape, typescale and the baseline font theme   (:root)
//   build/css/theme-light.css     light colour tokens                              (:root)
//   build/css/theme-dark.css      dark colour tokens                               ([data-theme="dark"])
//   build/css/font-wireframe.css  wireframe font theme override                    ([data-font-theme="wireframe"])
//   build/android/values*/colors.xml   Android colour resources (light and night)
//   build/json/{light,dark}.json       resolved colour values, used by the contrast check
import path from 'node:path';
import StyleDictionary from 'style-dictionary';

const root = path.resolve(import.meta.dirname, '..');
const tokenFile = (f) => path.join(root, 'tokens', f);
const outDir = (p) => path.join(root, 'build', p) + path.sep;

const FONT_WEIGHTS = { regular: 400, medium: 500, semibold: 600, bold: 700 };

StyleDictionary.registerTransform({
  name: 'hb/px',
  type: 'value',
  filter: (token) => token.$type === 'dimension' && typeof token.$value === 'number',
  transform: (token) => `${token.$value}px`,
});

StyleDictionary.registerTransform({
  name: 'hb/font-weight',
  type: 'value',
  filter: (token) =>
    token.path[0] === 'font-theme' && token.path.includes('weight') && typeof token.$value === 'string',
  transform: (token) => {
    const key = token.$value.toLowerCase().replace(/\s+/g, '');
    if (!(key in FONT_WEIGHTS)) throw new Error(`Unknown font weight "${token.$value}" in ${token.path.join('.')}`);
    return FONT_WEIGHTS[key];
  },
});

StyleDictionary.registerTransform({
  name: 'hb/css-font-family',
  type: 'value',
  filter: (token) => token.$type === 'fontFamily',
  transform: (token) => `"${token.$value}"`,
});

const cssPlatform = (destination, selector) => ({
  transforms: ['name/kebab', 'hb/px', 'hb/font-weight', 'hb/css-font-family'],
  buildPath: outDir('css'),
  files: [{ destination, format: 'css/variables', options: { selector, outputReferences: true } }],
});

const androidPlatform = (valuesDir) => ({
  transforms: ['name/snake', 'color/hex8android'],
  buildPath: outDir(`android/${valuesDir}`),
  files: [
    {
      destination: 'colors.xml',
      format: 'android/resources',
      filter: (token) => token.$type === 'color',
    },
  ],
});

const jsonPlatform = (destination) => ({
  transforms: ['name/kebab'],
  buildPath: outDir('json'),
  files: [{ destination, format: 'json/flat' }],
});

const builds = [
  {
    name: 'base',
    source: [tokenFile('shape.json'), tokenFile('font-theme.baseline.json'), tokenFile('typescale.json')],
    platforms: { css: cssPlatform('base.css', ':root') },
  },
  {
    name: 'light',
    source: [tokenFile('m3.light.json'), tokenFile('home-base.light.json')],
    platforms: {
      css: cssPlatform('theme-light.css', ':root'),
      android: androidPlatform('values'),
      json: jsonPlatform('light.json'),
    },
  },
  {
    name: 'dark',
    source: [tokenFile('m3.dark.json'), tokenFile('home-base.dark.json')],
    platforms: {
      css: cssPlatform('theme-dark.css', '[data-theme="dark"]'),
      android: androidPlatform('values-night'),
      json: jsonPlatform('dark.json'),
    },
  },
  {
    name: 'wireframe font',
    source: [tokenFile('font-theme.wireframe.json')],
    platforms: { css: cssPlatform('font-wireframe.css', '[data-font-theme="wireframe"]') },
  },
];

for (const b of builds) {
  console.log(`\n> ${b.name}`);
  const sd = new StyleDictionary({
    usesDtcg: true,
    source: b.source,
    log: { verbosity: 'default', warnings: 'warn' },
    platforms: b.platforms,
  });
  await sd.buildAllPlatforms();
}
console.log('\nBuild complete.');
