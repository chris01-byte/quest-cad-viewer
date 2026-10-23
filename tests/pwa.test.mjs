// Aufgabe 7: PWA – Manifest, Icons, Service Worker, Offline-Start, Update (V1-10).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { openViewer, check, finish, ROOT, VIEWER_DIR, SAMPLES_DIR } from './helpers.mjs';

// ------------------------------------------------------------------ manifest and icons (static)
const manifest = JSON.parse(fs.readFileSync(path.join(VIEWER_DIR, 'manifest.webmanifest'), 'utf8'));
const html = fs.readFileSync(path.join(VIEWER_DIR, 'index.html'), 'utf8');
check('Manifest: Name, Kurzname, standalone, Start und Scope relativ', manifest.name && manifest.short_name && manifest.display === 'standalone' && manifest.start_url === './' && manifest.scope === './');
check('Manifest ist in index.html verlinkt', /rel="manifest" href="manifest.webmanifest"/.test(html));
check('Manifest: Farben passen zum meta theme-color', html.includes(`content="${manifest.theme_color}"`));
const pngSize = (file) => { const b = fs.readFileSync(file); return b.toString('latin1', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };
for (const icon of manifest.icons) {
  const [w, h] = icon.sizes.split('x').map(Number);
  const size = pngSize(path.join(VIEWER_DIR, icon.src));
  check(`Icon ${icon.src} (${icon.purpose}) existiert und ist ${icon.sizes}`, size && size[0] === w && size[1] === h, JSON.stringify(size));
}
check('Icons: 192, 512 und ein „maskable“ vorhanden', ['192x192', '512x512'].every((s) => manifest.icons.some((i) => i.sizes === s && i.purpose === 'any')) && manifest.icons.some((i) => i.purpose === 'maskable'));
check('Apple-Touch-Icon 180x180', JSON.stringify(pngSize(path.join(VIEWER_DIR, 'icons/apple-touch-icon.png'))) === '[180,180]');

// ------------------------------------------------------------------ build + service worker
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'qcv-build-'));
const build = (id) => execFileSync(process.execPath, [path.join(ROOT, 'tools/build-pages.mjs'), out, id], { encoding: 'utf8' });
console.log(`       ${build('t1').trim()}`);
const assets = JSON.parse(fs.readFileSync(path.join(out, 'asset-manifest.json'), 'utf8'));
check('Build: sw.js trägt die Build-ID, kein Platzhalter mehr', /const BUILD = 't1'/.test(fs.readFileSync(path.join(out, 'sw.js'), 'utf8')));
check('Build: Dateiliste enthält Seite, Module, three.js, Icons, Manifest – aber nicht sw.js', ['./', 'index.html', 'js/main.js', 'js/xr/session.js', 'vendor/three/three.module.js', 'vendor/three/three.core.js', 'icons/icon-192.png', 'manifest.webmanifest', 'css/style.css'].every((f) => assets.files.includes(f)) && !assets.files.includes('sw.js'), `${assets.files.length} Dateien`);
// every module the app imports must be in the list: scan imports of all js files
{
  const missing = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    if (!p.endsWith('.js') || p.endsWith('sw.js')) return;
    for (const m of fs.readFileSync(p, 'utf8').matchAll(/from\s+'(\.{1,2}\/[^']+)'/g)) {
      const rel = path.relative(out, path.resolve(path.dirname(p), m[1])).split(path.sep).join('/');
      if (!assets.files.includes(rel)) missing.push(rel);
    }
  });
  walk(out);
  check('Build: jedes importierte Modul steht in der Dateiliste', missing.length === 0, missing.join(', '));
}

// like GitHub Pages: the site lives below /<repository>/, so every URL in the app must be relative
const t = await openViewer({ dir: out, prefix: '/quest-cad-viewer/' });
const { page, errors, context } = t;
await page.evaluate(() => navigator.serviceWorker.ready);
const cacheState = () => page.evaluate(async () => {
  const keys = await caches.keys();
  const cache = keys.length ? await caches.open(keys[0]) : null;
  return { keys, count: cache ? (await cache.keys()).length : 0 };
});
let c = await cacheState();
check('Unterpfad /quest-cad-viewer/: SW-Scope stimmt', await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope.endsWith('/quest-cad-viewer/')));
check('Service Worker aktiv, Cache „qcv-t1“ angelegt', c.keys.join() === 'qcv-t1', c.keys.join());
check('Cache enthält alle Dateien der Liste', c.count === assets.files.length, `${c.count} von ${assets.files.length}`);
await page.waitForFunction(() => navigator.serviceWorker.controller);

// ------------------------------------------------------------------ V1-10: start without internet
await context.setOffline(true);
await page.reload();
await page.waitForFunction(() => window.cadViewer);
check('V1-10 Offline-Start: Seite lädt ohne Netz', await page.locator('#hint').isVisible());
await page.setInputFiles('#file-input', path.join(SAMPLES_DIR, 'pruefquader.stl'));
await page.waitForFunction(() => window.cadViewer.model && document.getElementById('toast').hidden);
check('V1-10 Offline: Modell laden und Maße anzeigen', (await page.locator('#info-bbox').innerText()) === '100,0 × 50,0 × 20,0 mm');
await page.click('#btn-measure');
check('V1-10 Offline: Messmodus startet', await page.evaluate(() => window.cadViewer.measure.active));
// a path without file name and one with a query string are answered from the cache as well
const nav = await page.evaluate(async () => (await fetch('./?x=1')).ok);
check('Offline: Aufruf mit Suchparameter wird aus dem Cache bedient', nav);
await context.setOffline(false);

// ------------------------------------------------------------------ update to a new build
console.log(`       ${build('t2').trim()}`);
await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); });
for (let i = 0; i < 60 && (await cacheState()).keys.join() !== 'qcv-t2'; i++) await page.waitForTimeout(250); // waitForFunction cannot await a Promise
c = await cacheState();
check('Update: neuer Cache „qcv-t2“ ist gefüllt, alter Cache „qcv-t1“ gelöscht', c.keys.join() === 'qcv-t2' && c.count === assets.files.length, `${c.keys.join()} / ${c.count}`);
check('Update: neue Version übernimmt die Kontrolle ohne Neustart', await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).active.scriptURL.endsWith('sw.js') && !!navigator.serviceWorker.controller));

// ------------------------------------------------------------------ install button
await page.evaluate(() => {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = () => { window.__prompted = true; return Promise.resolve(); };
  e.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(e);
});
check('„App installieren“ erscheint, wenn der Browser die Installation anbietet', await page.locator('#btn-install').isVisible());
await page.click('#btn-install');
await page.waitForFunction(() => window.__prompted === true);
check('Klick öffnet den Installationsdialog, danach verschwindet der Button', await page.locator('#btn-install').isHidden());

check('keine Konsolenfehler (Offline-Läufe eingeschlossen)', errors.length === 0, errors.join(' | '));
await t.close();

// ------------------------------------------------------------------ development: unstamped sw.js must not cache
const dev = await openViewer();
await dev.page.evaluate(() => navigator.serviceWorker.ready);
await dev.page.waitForTimeout(300);
check('Entwicklung (ungestempelter SW): es wird nichts gecacht', (await dev.page.evaluate(async () => (await caches.keys()).length)) === 0);
await dev.close();
fs.rmSync(out, { recursive: true, force: true });
finish();
