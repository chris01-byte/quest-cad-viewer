// Prepares the viewer for deployment (GitHub Pages): copies viewer/ to <outDir>, writes
// asset-manifest.json (all files, for the service worker's cache) and stamps the build id into sw.js.
//   node tools/build-pages.mjs <outDir> [buildId]
// The build id defaults to the short commit hash (GITHUB_SHA) or a timestamp.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'viewer');
const out = path.resolve(process.argv[2] ?? '');
const build = process.argv[3] ?? (process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 10) : new Date().toISOString().replace(/\D/g, '').slice(0, 14));
if (!process.argv[2]) {
  console.error('Aufruf: node tools/build-pages.mjs <Zielordner> [Build-ID]');
  process.exit(2);
}
if (!/^[\w.-]+$/.test(build)) throw new Error(`Ungültige Build-ID: ${build}`);
if (out === src || out.startsWith(src + path.sep)) throw new Error('Der Zielordner darf nicht in viewer/ liegen.');

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true, filter: (p) => !['.DS_Store'].includes(path.basename(p)) });

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(path.relative(out, full).split(path.sep).join('/'));
  }
})(out);
const precache = files.filter((f) => f !== 'sw.js').sort();
// "./" is what the browser requests when the app is opened without a file name
fs.writeFileSync(path.join(out, 'asset-manifest.json'), `${JSON.stringify({ build, files: ['./', ...precache] }, null, 2)}\n`);

const swPath = path.join(out, 'sw.js');
const sw = fs.readFileSync(swPath, 'utf8');
if (!sw.includes("'__BUILD__'")) throw new Error("sw.js enthält den Platzhalter '__BUILD__' nicht");
fs.writeFileSync(swPath, sw.replace("'__BUILD__'", `'${build}'`));

console.log(`Build ${build}: ${precache.length} Dateien nach ${out}`);
