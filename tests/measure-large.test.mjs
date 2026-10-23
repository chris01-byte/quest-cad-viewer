// Messen am Lasttest (2 Mio. Dreiecke): Vorbereitung, Klick-Genauigkeit, Reaktionszeit.
import fs from 'node:fs';
import path from 'node:path';
import { openViewer, check, near, finish, SAMPLES_DIR } from './helpers.mjs';

const file = path.join(SAMPLES_DIR, 'last_2mio.stl');
if (!fs.existsSync(file)) {
  console.log('  --   last_2mio.stl fehlt (python3 samples/generate.py) – Test übersprungen');
  process.exit(0);
}

const t = await openViewer();
const { page, errors } = t;
await page.setInputFiles('#file-input', file);
await page.waitForFunction(() => window.cadViewer.model && document.getElementById('toast').hidden, null, { timeout: 120000 });

const t0 = Date.now();
await page.click('#btn-measure');
const sawNotice = await page.evaluate(() => document.getElementById('toast').textContent);
await page.waitForFunction(() => window.cadViewer.measure.active, null, { timeout: 60000 });
const prep = ((Date.now() - t0) / 1000).toFixed(1);
check('Vorbereitung zeigt „Messen wird vorbereitet“', /vorbereitet/.test(sawNotice), sawNotice);
check('Messmodus nach der Vorbereitung in unter 30 s aktiv', Number(prep) < 30, `${prep} s`);

// two equator vertices 90° apart: (r,0,0) and (0,0,r) -> r*sqrt(2) = 141.42 mm
const screenOf = (p) => page.evaluate(async ([x, y, z]) => {
  const THREE = await import('three');
  const { viewer } = window.cadViewer;
  return viewer.worldToScreen(viewer.modelRoot.localToWorld(new THREE.Vector3(x, y, z)));
}, p);
const centre = await page.evaluate(async () => {
  const THREE = await import('three');
  const c = window.cadViewer.model.visibleBox().getCenter(new THREE.Vector3());
  return { x: c.x, y: c.y, z: c.z };
});
const r = 0.1;
const a = await screenOf([centre.x + r, centre.y, centre.z]);
const b = await screenOf([centre.x, centre.y, centre.z + r]);
const tHover = Date.now();
await page.mouse.move(a.x, a.y);
await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
const hoverMs = Date.now() - tHover;
await page.mouse.click(a.x, a.y);
await page.mouse.click(b.x, b.y);
const m = await page.evaluate(() => { const x = window.cadViewer.measure.measurements[0]; return x && { mm: x.distanceMm, snap: x.snapA && x.snapB }; });
check('Kugelpunkte 90° auseinander: 141,4 mm (±1,5 mm, Netzdichte 0,4 mm)', m && near(m.mm, 141.42, 1.5), `${m?.mm?.toFixed(2)} mm`);
check('Beide Punkte rasten auf Eckpunkten ein', m?.snap === true);
check('Hover-Pick auf 2 Mio. Dreiecken in unter 250 ms (inkl. Frame)', hoverMs < 250, `${hoverMs} ms`);
console.log(`       Agent-Test Lasttest: Vorbereitung ${prep} s (Software-WebGL, Desktop-CPU)`);

check('keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await t.close();
finish();
