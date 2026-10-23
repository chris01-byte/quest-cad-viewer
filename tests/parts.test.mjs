// Aufgabe 4: Teileliste – ein-/ausblenden, Maße passen sich an, Rendern folgt (V1-05).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openViewer, check, finish, SAMPLES_DIR } from './helpers.mjs';

const t = await openViewer();
const { page, errors } = t;
const sample = (n) => path.join(SAMPLES_DIR, n);
const text = (sel) => page.locator(sel).innerText();

async function open(files) {
  await page.setInputFiles('#file-input', files);
  await page.waitForFunction(() => window.cadViewer.model && document.getElementById('toast').hidden);
}
/** Triangles the renderer really drew for the next frame. */
const drawnTriangles = () => page.evaluate(() => {
  const { viewer } = window.cadViewer;
  viewer.renderer.render(viewer.scene, viewer.camera);
  return viewer.renderer.info.render.triangles;
});

await open(sample('pruefwinkel.glb'));
check('Teileliste zeigt zwei Teile', (await page.locator('#part-list li').count()) === 2 && (await text('#parts-count')) === '(2)');
check('Ausgangsmaße 80,0 × 60,0 × 40,0 mm', (await text('#info-bbox')) === '80,0 × 60,0 × 40,0 mm');
const full = await drawnTriangles();

// V1-05: hide the upright leg, bbox shrinks to the base plate (80 x 10 x 40)
const leg = page.locator('#part-list li', { hasText: 'Schenkel' });
await leg.locator('input').uncheck();
check('V1-05 Schenkel aus: Maße 80,0 × 10,0 × 40,0 mm', (await text('#info-bbox')) === '80,0 × 10,0 × 40,0 mm', await text('#info-bbox'));
check('Dreiecke „12 von 540“', (await text('#info-tris')) === '12 von 540', await text('#info-tris'));
const hidden = await drawnTriangles();
check('Renderer zeichnet nur noch die Grundplatte (12 Dreiecke)', hidden === 12 && full === 540, `${full} -> ${hidden}`);
check('Zeile durchgestrichen markiert', await leg.evaluate((el) => el.classList.contains('off')));

await leg.locator('input').check();
check('V1-05 Schenkel wieder an: Maße 80,0 × 60,0 × 40,0 mm', (await text('#info-bbox')) === '80,0 × 60,0 × 40,0 mm');
check('Dreiecke wieder 540', (await text('#info-tris')) === '540');

// hide the base plate instead: leg only is 80 x 50 x 10
await page.locator('#part-list li', { hasText: 'Grundplatte' }).locator('input').uncheck();
check('Grundplatte aus: Maße 80,0 × 50,0 × 10,0 mm', (await text('#info-bbox')) === '80,0 × 50,0 × 10,0 mm', await text('#info-bbox'));

await page.click('#btn-parts-none');
check('„Alle aus“: keine sichtbaren Teile', (await text('#info-bbox')) === 'keine sichtbaren Teile' && (await drawnTriangles()) === 0);
check('„Alle aus“: alle Haken entfernt', (await page.locator('#part-list input:checked').count()) === 0);
await page.click('#btn-parts-all');
check('„Alle ein“: wieder 80,0 × 60,0 × 40,0 mm', (await text('#info-bbox')) === '80,0 × 60,0 × 40,0 mm');

// many parts: filter field appears and narrows the list
{
  let obj = '';
  for (let i = 1; i <= 15; i++) {
    const x = i * 10;
    obj += `o Schraube_${i}\nv ${x} 0 0\nv ${x + 5} 0 0\nv ${x} 5 0\nf ${(i - 1) * 3 + 1} ${(i - 1) * 3 + 2} ${(i - 1) * 3 + 3}\n`;
  }
  const f = path.join(os.tmpdir(), 'viele-teile.obj');
  fs.writeFileSync(f, obj);
  await open(f);
  check('OBJ mit 15 Objekten: 15 Teile', (await page.locator('#part-list li').count()) === 15);
  check('Filterfeld erscheint ab 12 Teilen', await page.locator('#parts-filter').isVisible());
  await page.fill('#parts-filter', 'schraube_1');
  const shown = await page.locator('#part-list li:visible').count();
  check('Filter „schraube_1“ zeigt 7 Teile (1, 10–15)', shown === 7, `${shown}`);
  await page.click('#btn-parts-none');
  const stillOn = await page.locator('#part-list li input:checked').count();
  check('„Alle aus“ betrifft nur gefilterte Zeilen (8 bleiben an)', stillOn === 8, `${stillOn}`);
}

check('keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await t.close();
finish();
