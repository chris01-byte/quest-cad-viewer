// Desktop-Ansicht: „1:1 (ca.)“ und „Ansicht zurücksetzen“ (V1-23).
import path from 'node:path';
import { openViewer, check, near, finish, SAMPLES_DIR } from './helpers.mjs';

const t = await openViewer();
const { page, errors } = t;
await page.setInputFiles('#file-input', path.join(SAMPLES_DIR, 'pruefquader.stl'));
await page.waitForFunction(() => window.cadViewer.model && document.getElementById('toast').hidden);

check('Ansicht-Bereich erscheint nach dem Laden', await page.locator('#sec-view').isVisible());

const initial = await page.evaluate(() => window.cadViewer.viewer.camera.position.toArray());
// orbit away, then reset
await page.mouse.move(700, 400); await page.mouse.down(); await page.mouse.move(500, 300, { steps: 6 }); await page.mouse.up();
const moved = await page.evaluate(() => window.cadViewer.viewer.camera.position.toArray());
check('Orbit verändert die Kamera', moved.some((v, i) => Math.abs(v - initial[i]) > 0.01));
await page.click('#btn-reset-view');
const reset = await page.evaluate(() => window.cadViewer.viewer.camera.position.toArray());
check('„Ansicht zurücksetzen“ stellt die Ausgangsansicht wieder her', reset.every((v, i) => near(v, initial[i], 1e-6)));

// 1:1 (ca.): 100 mm in the plane of the target must measure 100 / 0.2646 = 378 px on screen
await page.click('#btn-actual-size');
const px = await page.evaluate(async () => {
  const THREE = await import('three');
  const { viewer } = window.cadViewer;
  viewer.camera.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(viewer.camera.matrixWorld, 0);
  const a = viewer.worldToScreen(viewer.controls.target.clone().addScaledVector(right, -0.05));
  const b = viewer.worldToScreen(viewer.controls.target.clone().addScaledVector(right, 0.05));
  return Math.hypot(b.x - a.x, b.y - a.y);
});
check('1:1 (ca.): 100 mm erscheinen als 378 px (96 dpi)', near(px, 100 / (25.4 / 96), 1.5), `${px.toFixed(1)} px`);
check('Button weist auf die Näherung hin', /ca\./.test(await page.locator('#btn-actual-size').innerText()) && /Näherung/.test(await page.locator('#btn-actual-size').getAttribute('title')));

check('keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await t.close();
finish();
