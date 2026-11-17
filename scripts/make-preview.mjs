// Builds a self-contained preview of the game for sharing as a private page
// (for example a claude.ai artifact) before merging to main.
//
//   npm run build && node scripts/make-preview.mjs <out-dir> [--unlock <n>]
//
// Writes <out-dir>/blocked-up-preview.html with the CSS and JS inlined, and
// copies public/photos next to it (publish those as supporting files).
// --unlock <n> seeds a fresh browser with levels 1..n beaten, so later worlds
// can be tried without replaying everything. The preview has its own save data.
//
// Limits of such previews: no service worker, and no network access, so
// online two-player cannot connect there.
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir, ...rest] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: node scripts/make-preview.mjs <out-dir> [--unlock <n>]');
  process.exit(1);
}
const unlock = rest[0] === '--unlock' ? Number(rest[1]) : 0;

const assets = readdirSync('dist/assets');
const read = (re) =>
  readFileSync(
    join(
      'dist/assets',
      assets.find((f) => re.test(f)),
    ),
    'utf8',
  );
const css = read(/^index-.*\.css$/);
const js = read(/^index-.*\.js$/);
if (/<\/script/i.test(js) || /<\/style/i.test(css)) throw new Error('bundle cannot be inlined');

const seed = unlock
  ? `<script>
try {
  if (!localStorage.getItem('blockedup:v1')) {
    var levels = {};
    for (var i = 1; i <= ${unlock}; i++) levels['l' + (i < 10 ? '0' : '') + i] = { stars: 3, bestScore: 100 };
    localStorage.setItem('blockedup:v1', JSON.stringify({ v: 1, levels: levels }));
  }
} catch (e) {}
</script>`
  : '';

mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'blocked-up-preview.html'),
  `<title>Blocked Up Preview</title>
<meta name="theme-color" content="#1a1145">
<style>${css}</style>
<div id="app"></div>
${seed}
<script type="module">${js}</script>
`,
);
cpSync('public/photos', join(outDir, 'photos'), { recursive: true });
console.log(`preview written to ${outDir} (${readdirSync(join(outDir, 'photos')).length} photos)`);
