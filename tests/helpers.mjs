// Shared test helpers: static server for viewer/, headless Chromium with software WebGL.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url); // honours NODE_PATH, unlike ESM imports
const { chromium } = require('playwright');

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VIEWER_DIR = path.join(ROOT, 'viewer');
export const SAMPLES_DIR = path.join(ROOT, 'samples');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary',
};

/** Static server for `dir`. With `prefix` (e.g. '/quest-cad-viewer/') the site lives in a sub-path like on GitHub Pages. */
export function startServer(dir = VIEWER_DIR, prefix = '/') {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const requested = decodeURIComponent(url.pathname);
    if (!requested.startsWith(prefix)) { res.writeHead(404).end('not found'); return; }
    let file = path.join(dir, requested.slice(prefix.length));
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    resolve({ server, url: `http://127.0.0.1:${server.address().port}${prefix}`, close: () => server.close() });
  }));
}

/** Opens the viewer (or another build of it via `dir`, optionally below a URL `prefix`); collects console errors and page errors in `errors`. With `emulateQuest` a Meta Quest 3 is emulated by IWER (window.__iwer = the XRDevice). */
export async function openViewer({ viewport = { width: 1280, height: 800 }, emulateQuest = false, dir = VIEWER_DIR, prefix = '/' } = {}) {
  const srv = await startServer(dir, prefix);
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
  });
  const context = await browser.newContext({ viewport, locale: 'de-DE' });
  if (emulateQuest) {
    // Meta's Immersive Web Emulation Runtime (npm "iwer", dev dependency): a JS implementation of the WebXR API
    const iwer = fs.readFileSync(require.resolve('iwer/build/iwer.js'), 'utf8');
    await context.addInitScript(`${iwer}\n;(() => { const { XRDevice, metaQuest3 } = window.IWER; const d = new XRDevice(metaQuest3); d.installRuntime({ forceInstall: true }); window.__iwer = d; })();`);
  }
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(srv.url);
  await page.waitForFunction(() => window.cadViewer);
  return { page, errors, browser, context, srv, close: async () => { await browser.close(); srv.close(); } };
}

/** Renders one frame and counts pixels that differ from the clear colour (proves something is drawn). */
export function countDrawnPixels(page) {
  return page.evaluate(() => {
    const { viewer } = window.cadViewer;
    const gl = viewer.renderer.getContext();
    viewer.renderer.render(viewer.scene, viewer.camera); // same task as readPixels, buffer still valid
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(4 * w * h);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const bg = [px[0], px[1], px[2]];
    let n = 0;
    for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) > 6) n++;
    return n;
  });
}

/** Counts rendered pixels close to an RGB colour (overlay markers are unlit, so their colour is exact). */
export function countColor(page, [r, g, b], tolerance = 24) {
  return page.evaluate(([r, g, b, tol]) => {
    const { viewer } = window.cadViewer;
    const gl = viewer.renderer.getContext();
    viewer.renderer.render(viewer.scene, viewer.camera);
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(4 * w * h);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let n = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (Math.abs(px[i] - r) < tol && Math.abs(px[i + 1] - g) < tol && Math.abs(px[i + 2] - b) < tol) n++;
    }
    return n;
  }, [r, g, b, tolerance]);
}

let failures = 0;
export function check(name, ok, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}
export function near(a, b, tol) { return Math.abs(a - b) <= tol; }
export function finish() {
  console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
  process.exit(failures ? 1 : 0);
}
