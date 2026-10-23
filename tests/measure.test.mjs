// Aufgabe 5: Messen Punkt–Punkt mit Eckpunkt-Fang (V1-06, V1-07, V1-08, V1-20, V1-21).
// Klickt mit der echten Maus auf Bildschirmpositionen, die aus Modellkoordinaten projiziert werden.
import path from 'node:path';
import { openViewer, check, near, finish, countColor, SAMPLES_DIR } from './helpers.mjs';

const t = await openViewer();
const { page, errors } = t;
const sample = (n) => path.join(SAMPLES_DIR, n);
const text = (sel) => page.locator(sel).innerText();

async function open(file) {
  await page.setInputFiles('#file-input', file);
  await page.waitForFunction(() => window.cadViewer.model && document.getElementById('toast').hidden);
}
/** Client position of a point given in modelRoot space. */
const screenOf = (p) => page.evaluate(async ([x, y, z]) => {
  const THREE = await import('three');
  const { viewer } = window.cadViewer;
  return viewer.worldToScreen(viewer.modelRoot.localToWorld(new THREE.Vector3(x, y, z)));
}, p);
const boxOf = () => page.evaluate(() => {
  const b = window.cadViewer.model.visibleBox();
  return { min: b.min.toArray(), max: b.max.toArray() };
});
async function clickModel(p, dx = 0, dy = 0) {
  const s = await screenOf(p);
  await page.mouse.click(s.x + dx, s.y + dy);
}
const state = () => page.evaluate(() => {
  const { measure } = window.cadViewer;
  return {
    count: measure.measurements.length,
    pending: !!measure.pending,
    last: measure.measurements.at(-1) && {
      mm: measure.measurements.at(-1).distanceMm, snapA: measure.measurements.at(-1).snapA, snapB: measure.measurements.at(-1).snapB,
    },
  };
});

// ------------------------------------------------------------------ V1-06 box, long edge
await open(sample('pruefquader.stl'));
check('Messen-Bereich erscheint nach dem Laden', await page.locator('#sec-measure').isVisible());
await page.click('#btn-measure');
check('Messmodus aktiv (Taste hervorgehoben)', (await page.locator('#btn-measure').getAttribute('aria-pressed')) === 'true' && (await text('#measure-status')) === 'Ersten Punkt wählen.');

let box = await boxOf();
const topFront = (x) => [x, box.max[1], box.max[2]]; // long edge between the +Y and +Z faces, fully visible from the default view
await clickModel(topFront(box.min[0]), 3, 3); // a few px off, like a human
check('Erster Punkt gesetzt, Status wechselt', (await state()).pending && /Zweiten Punkt/.test(await text('#measure-status')));
await page.mouse.move((await screenOf(topFront(box.max[0]))).x - 3, (await screenOf(topFront(box.max[0]))).y + 3);
await page.waitForTimeout(150);
const green1 = await countColor(page, [61, 220, 132]);
check('Eckpunkt rastet sichtbar ein (grüner Marker gezeichnet)', green1 > 15, `grüne Pixel=${green1}`);
await clickModel(topFront(box.max[0]), -3, 3);
let st = await state();
check('V1-06 Anzeige 100,0 mm (±0,1)', st.count === 1 && near(st.last.mm, 100, 0.1), `${st.last?.mm}`);
check('V1-06 beide Punkte auf Eckpunkten eingerastet', st.last.snapA && st.last.snapB);
check('V1-06 Messliste zeigt „100,0 mm“ und Δ-Werte', (await text('#measure-list li .val')) === '100,0 mm' && /Δ 100,0 · 0,0 · 0,0|Δ -100,0 · 0,0 · 0,0/.test(await text('#measure-list li .delta')), await text('#measure-list li .delta'));
check('Messung ohne Flächenpunkt-Hinweis', (await page.locator('#measure-list .flag').count()) === 0);

// exact pixel, other two edges
await clickModel([box.max[0], box.max[1], box.max[2]]);
await clickModel([box.max[0], box.min[1], box.max[2]]);
st = await state();
check('Höhe 50,0 mm (±0,1) mit Klick exakt auf die Ecke', st.count === 2 && near(st.last.mm, 50, 0.1), `${st.last?.mm}`);
await clickModel([box.max[0], box.max[1], box.min[2]]);
await clickModel([box.max[0], box.max[1], box.max[2]]);
st = await state();
check('Tiefe 20,0 mm (±0,1)', st.count === 3 && near(st.last.mm, 20, 0.1), `${st.last?.mm}`);

// ------------------------------------------------------------------ V1-08 several, delete one, delete all
check('V1-08 drei Messungen bleiben nach Moduswechsel sichtbar', await (async () => {
  await page.click('#btn-measure'); // off
  const off = (await page.locator('#measure-list li').count()) === 3;
  await page.click('#btn-measure'); // on again
  return off && (await state()).count === 3;
})());
const visibleViews = () => page.evaluate(() => window.cadViewer.measure.group.children.filter((c) => c.visible).length);
const before = await visibleViews();
await page.locator('#measure-list li').nth(1).locator('.del').click();
const left = await page.locator('#measure-list li .val').allInnerTexts();
check('V1-08 einzeln löschen: Messung 2 weg, 1 und 3 bleiben', left.join() === '100,0 mm,20,0 mm', left.join());
check('Gelöschte Messung verschwindet auch aus der Szene', (await visibleViews()) === before - 1, `${before} -> ${await visibleViews()}`);
await page.click('#btn-measure-clear');
st = await state();
check('V1-08 „Alle löschen“: Liste leer, Szene leer', st.count === 0 && (await page.locator('#measure-list li').count()) === 0 && (await visibleViews()) === 0);

// ------------------------------------------------------------------ V1-20 / V1-21 free surface point
const faceCentre = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, box.max[2]];
await clickModel(faceCentre);
await clickModel(topFront(box.max[0]), -3, 3);
st = await state();
check('V1-20 Punkt mitten auf der Fläche: nicht eingerastet (orange)', st.count === 1 && !st.last.snapA && st.last.snapB);
check('V1-20 Messliste kennzeichnet Flächenpunkt', /Flächenpunkt/.test(await text('#measure-list .flag')));
await page.click('#btn-measure-clear');

await page.check('#chk-vertices');
await clickModel(faceCentre);
st = await state();
check('V1-21 „Nur Eckpunkte“: Klick auf die Fläche setzt keinen Punkt', !st.pending && st.count === 0);
check('V1-21 Hinweis erscheint', /Kein Eckpunkt/.test(await text('#toast')), await text('#toast'));
await clickModel(topFront(box.min[0]), 3, 3);
check('V1-21 nahe an einer Ecke funktioniert es', (await state()).pending);
await page.keyboard.press('Escape');
check('Esc bricht den ersten Punkt ab', !(await state()).pending);
await page.uncheck('#chk-vertices');

// ------------------------------------------------------------------ drag = orbit, not a click
{
  const s = await screenOf(faceCentre);
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.mouse.move(s.x + 60, s.y + 20, { steps: 5 });
  await page.mouse.up();
  const drag = await state();
  check('Drehen mit gedrückter Maustaste setzt keinen Punkt', !drag.pending && drag.count === 0);
}

// ------------------------------------------------------------------ true size independent of the XR scale
{
  await page.evaluate(() => { window.cadViewer.viewer.modelRoot.scale.setScalar(0.5); window.cadViewer.viewer.requestRender(); });
  box = await boxOf(); // modelRoot-local box is unchanged by scaling
  await clickModel(topFront(box.min[0]), 2, 2);
  await clickModel(topFront(box.max[0]), -2, 2);
  st = await state();
  check('Modell auf 50 % skaliert: Messung zeigt weiter 100,0 mm', st.count === 1 && near(st.last.mm, 100, 0.1), `${st.last?.mm}`);
  await page.evaluate(() => { window.cadViewer.viewer.modelRoot.scale.setScalar(1); });
  await page.click('#btn-measure-clear');
}

// ------------------------------------------------------------------ V1-07 bore Ø10 in the angle bracket
await open(sample('pruefwinkel.glb'));
check('Neues Modell: alte Messungen sind weg', (await state()).count === 0);
const isActive = () => page.evaluate(() => window.cadViewer.measure.active);
const wasActive = await isActive();
await page.keyboard.press('m');
const afterOne = await isActive();
await page.keyboard.press('m');
check('Taste M schaltet den Messmodus um (an → aus → an)', afterOne === !wasActive && (await isActive()) === wasActive, `${wasActive} -> ${afterOne} -> ${await isActive()}`);
if (!(await isActive())) await page.keyboard.press('m');
const ring = await page.evaluate(async () => {
  const THREE = await import('three');
  const mesh = window.cadViewer.model.parts[1].object; // Schenkel_mit_Bohrung
  const pos = mesh.geometry.attributes.position;
  let zMax = -Infinity;
  for (let i = 0; i < pos.count; i++) zMax = Math.max(zMax, pos.getZ(i));
  const pts = [];
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i) - 0.04, pos.getY(i) - 0.035);
    if (Math.abs(pos.getZ(i) - zMax) < 1e-9 && Math.abs(r - 0.005) < 1e-7) pts.push({ a: Math.atan2(pos.getY(i) - 0.035, pos.getX(i) - 0.04), v: new THREE.Vector3().fromBufferAttribute(pos, i) });
  }
  pts.sort((p, q) => p.a - q.a);
  const toWorld = (p) => mesh.localToWorld(p.v.clone());
  return { count: pts.length, p0: toWorld(pts[0]).toArray(), p1: toWorld(pts[pts.length / 2]).toArray() };
});
check('Bohrungsring auf der Vorderseite: 64 Eckpunkte', ring.count === 64, `${ring.count}`);
await clickModel(ring.p0);
await clickModel(ring.p1);
st = await state();
check('V1-07 Bohrung Ø ≈ 10 mm (Abweichung durch Tesselierung notieren)', st.count === 1 && near(st.last.mm, 10, 0.1), `${st.last?.mm?.toFixed(3)} mm`);
console.log(`       Agent-Test V1-07: gemessen ${st.last?.mm?.toFixed(3)} mm, beide Punkte eingerastet: ${st.last?.snapA && st.last?.snapB}`);

check('keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await t.close();
finish();
