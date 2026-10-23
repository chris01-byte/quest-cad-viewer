// Renders viewer/icons/*.svg to the PNG sizes the PWA manifest needs, using Playwright's Chromium.
//   node tools/make-icons.mjs        (needs playwright, see tests/README.md)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'viewer', 'icons');

const jobs = [
  ['icon.svg', 'icon-192.png', 192],
  ['icon.svg', 'icon-512.png', 512],
  ['icon-maskable.svg', 'icon-maskable-512.png', 512],
  ['icon-maskable.svg', 'apple-touch-icon.png', 180], // iOS rounds the corners itself
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [svg, png, size] of jobs) {
  const markup = fs.readFileSync(path.join(dir, svg), 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`);
  await page.screenshot({ path: path.join(dir, png), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`${png}  ${size}x${size}`);
}
await browser.close();
