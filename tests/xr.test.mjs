// Aufgabe 6: XR-Logik mit simulierten Controllern (Headless-Chromium hat kein WebXR).
// Geprüft wird die Interaktion (Greifen, Skalieren, 1:1, Ablegen, Panel, Strahl-Messen), NICHT die
// WebXR-Plattform selbst: Session-Start, Passthrough und echte Controller-Events brauchen die Quest
// oder den Immersive Web Emulator.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openViewer, check, near, finish, SAMPLES_DIR } from './helpers.mjs';

const t = await openViewer();
const { page, errors } = t;
const sample = (n) => path.join(SAMPLES_DIR, n);
async function open(file) {
  await page.setInputFiles('#file-input', file);
  await page.waitForFunction(() => window.cadViewer.model && document.getElementById('toast').hidden);
}

// ------------------------------------------------------------ pure gestures
const g = await page.evaluate(async () => {
  const THREE = await import('three');
  const { GrabGesture, setScaleAround, placeOnSurface } = await import('/js/xr/gestures.js');
  const out = {};
  const hand = (id, pressed, x, y, z, qy = 0) => ({ id, pressed, matrix: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), qy), new THREE.Vector3(1, 1, 1)) });
  const fresh = () => { const o = new THREE.Object3D(); o.position.set(0.2, 0.8, -0.5); o.updateMatrix(); return o; };

  // one hand: translation and rotation follow the hand
  let m = fresh(); let gest = new GrabGesture(m);
  gest.update([hand('0', true, 0, 1, 0)]);
  gest.update([hand('0', true, 0.1, 1.05, 0)]);
  out.oneMove = m.position.toArray().map((v) => +v.toFixed(6));
  m = fresh(); gest = new GrabGesture(m);
  gest.update([hand('0', true, 0, 1, 0)]);
  gest.update([hand('0', true, 0, 1, 0, Math.PI / 2)]);
  const probe = new THREE.Vector3(0, 0, 0).applyMatrix4(m.matrix); // model origin orbits the hand
  out.oneRotate = probe.toArray().map((v) => +v.toFixed(6));
  out.oneScaleKept = m.scale.x;

  // two hands: scale by distance, mid point stays on the model
  m = fresh(); gest = new GrabGesture(m);
  const midLocal = new THREE.Vector3(0, 1, 0).applyMatrix4(m.matrix.clone().invert());
  gest.update([hand('0', true, -0.1, 1, 0), hand('1', true, 0.1, 1, 0)]);
  gest.update([hand('0', true, -0.2, 1, 0), hand('1', true, 0.2, 1, 0)]);
  out.twoScale = m.scale.x;
  out.twoMid = midLocal.clone().applyMatrix4(m.matrix).toArray().map((v) => +v.toFixed(6));
  // 90° turn of the hand axis (x -> z) rotates the model by 90° about y
  m = fresh(); gest = new GrabGesture(m);
  gest.update([hand('0', true, -0.1, 1, 0), hand('1', true, 0.1, 1, 0)]);
  gest.update([hand('0', true, 0, 1, 0.1), hand('1', true, 0, 1, -0.1)]);
  const ex = new THREE.Vector3(1, 0, 0).applyQuaternion(m.quaternion);
  out.twoTurn = ex.toArray().map((v) => +v.toFixed(4));
  // snap to 1:1
  m = fresh(); gest = new GrabGesture(m);
  gest.update([hand('0', true, -0.1, 1, 0), hand('1', true, 0.1, 1, 0)]);
  gest.update([hand('0', true, -0.1015, 1, 0), hand('1', true, 0.1015, 1, 0)]);
  out.snap = m.scale.x;
  // clamp
  m = fresh(); gest = new GrabGesture(m);
  gest.update([hand('0', true, -0.01, 1, 0), hand('1', true, 0.01, 1, 0)]);
  gest.update([hand('0', true, -5, 1, 0), hand('1', true, 5, 1, 0)]);
  out.clampMax = m.scale.x;
  // release one hand: no jump, then the remaining hand carries the model
  m = fresh(); gest = new GrabGesture(m);
  gest.update([hand('0', true, -0.1, 1, 0), hand('1', true, 0.1, 1, 0)]);
  gest.update([hand('0', true, -0.2, 1, 0), hand('1', true, 0.2, 1, 0)]);
  const before = m.position.clone(); const sBefore = m.scale.x;
  gest.update([hand('0', true, -0.2, 1, 0), hand('1', false, 0.2, 1, 0)]);
  out.releaseJump = m.position.distanceTo(before) + Math.abs(m.scale.x - sBefore);
  gest.update([hand('0', true, -0.2, 1.1, 0), hand('1', false, 0.2, 1, 0)]);
  out.releaseFollow = +(m.position.y - before.y).toFixed(6);
  out.holdingAfterAllReleased = (gest.update([hand('0', false, 0, 0, 0)]), gest.holding);

  // setScaleAround keeps the pivot fixed
  m = fresh(); m.scale.setScalar(2.5); m.updateMatrix();
  const pivot = new THREE.Vector3(0.5, 1, 0);
  const local = pivot.clone().applyMatrix4(m.matrix.clone().invert());
  setScaleAround(m, 1, pivot);
  out.pivotDrift = local.applyMatrix4(m.matrix).distanceTo(pivot);
  out.pivotScale = m.scale.x;

  // placeOnSurface: upright, heading kept, lowest point on the surface
  m = new THREE.Object3D();
  m.quaternion.setFromEuler(new THREE.Euler(0.4, 0.7, -0.3, 'YXZ')); m.scale.setScalar(2); m.updateMatrix();
  const headingBefore = new THREE.Vector3(0, 0, -1).applyQuaternion(m.quaternion); headingBefore.y = 0; headingBefore.normalize();
  const box = new THREE.Box3(new THREE.Vector3(-0.1, 0, -0.05), new THREE.Vector3(0.3, 0.2, 0.15));
  placeOnSurface(m, box, new THREE.Vector3(1, 0.9, -2));
  m.updateMatrixWorld(true);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(m.quaternion);
  const headingAfter = new THREE.Vector3(0, 0, -1).applyQuaternion(m.quaternion);
  const bottomCentre = new THREE.Vector3(0.1, 0, 0.05).applyMatrix4(m.matrix);
  out.upright = +up.y.toFixed(6);
  out.heading = +headingBefore.dot(headingAfter).toFixed(6);
  out.bottomCentre = bottomCentre.toArray().map((v) => +v.toFixed(6));
  return out;
});
const arr = (a, b, tol = 1e-5) => a.every((v, i) => near(v, b[i], tol));
check('Greifen (eine Hand): Verschiebung folgt der Hand', arr(g.oneMove, [0.3, 0.85, -0.5]), g.oneMove.join(','));
// model starts at hand + (0.2, -0.2, -0.5); a 90° turn about y maps that offset to (-0.5, -0.2, -0.2)
check('Greifen (eine Hand): Drehung der Hand dreht das Modell um die Hand', arr(g.oneRotate, [-0.5, 0.8, -0.2]), g.oneRotate.join(','));
check('Greifen (eine Hand): Maßstab bleibt', near(g.oneScaleKept, 1, 1e-9));
check('Skalieren (zwei Hände): doppelter Abstand = Maßstab 2', near(g.twoScale, 2, 1e-6), `${g.twoScale}`);
check('Skalieren: Punkt zwischen den Händen bleibt am Modell', arr(g.twoMid, [0, 1, 0]), g.twoMid.join(','));
check('Zwei Hände: Achse um 90° gedreht dreht das Modell um 90°', arr(g.twoTurn, [0, 0, 1]) || arr(g.twoTurn, [0, 0, -1]), g.twoTurn.join(','));
check('Skalieren rastet bei ±2 % exakt auf 1:1 ein', g.snap === 1, `${g.snap}`);
check('Skalieren ist nach oben begrenzt (100)', g.clampMax === 100, `${g.clampMax}`);
check('Eine Hand loslassen: kein Sprung', g.releaseJump < 1e-9, `${g.releaseJump}`);
check('Danach trägt die übrige Hand das Modell', near(g.releaseFollow, 0.1, 1e-6), `${g.releaseFollow}`);
check('Alle Hände los: nichts wird gehalten', g.holdingAfterAllReleased === false);
check('setScaleAround: Drehpunkt bleibt fest, Maßstab exakt 1', g.pivotDrift < 1e-9 && g.pivotScale === 1, `${g.pivotDrift}`);
check('Ablegen: Modell steht aufrecht, Blickrichtung bleibt', near(g.upright, 1, 1e-6) && near(g.heading, 1, 1e-6), `up=${g.upright} heading=${g.heading}`);
check('Ablegen: Unterseite (Mitte) liegt exakt auf dem Tisch', arr(g.bottomCentre, [1, 0.9, -2]), g.bottomCentre.join(','));

// ------------------------------------------------------------ interaction with simulated controllers
await open(sample('pruefquader.stl'));
const setup = await page.evaluate(async () => {
  const THREE = await import('three');
  const { xr, viewer, measure } = window.cadViewer;
  const it = xr.interaction;
  window.__t = { THREE, it, viewer, measure, panel: it.panel };
  it.start();
  it.panel.refresh();
  viewer.modelRoot.updateMatrixWorld(true);
  const box = viewer.model.visibleBox().clone().applyMatrix4(viewer.modelRoot.matrixWorld);
  const head = viewer.camera.getWorldPosition(new THREE.Vector3());
  const toPanel = it.panel.mesh.position.clone().sub(head);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(it.panel.mesh.quaternion);
  return {
    scale: viewer.modelRoot.scale.x, minY: box.min.y, up: new THREE.Vector3(0, 1, 0).applyQuaternion(viewer.modelRoot.quaternion).y,
    centreDistance: Math.hypot(box.getCenter(new THREE.Vector3()).x - head.x, box.getCenter(new THREE.Vector3()).z - head.z),
    panelDistance: toPanel.length(), panelFacesHead: normal.dot(toPanel.clone().normalize()) < -0.9, panelInScene: !!it.panel.mesh.parent,
    buttons: it.panel.buttons.map((b) => b.id),
  };
});
check('XR-Start: Modell 1:1', setup.scale === 1);
check('XR-Start: kleines Modell steht auf Tischhöhe (0,75 m), aufrecht', near(setup.minY, 0.75, 1e-6) && near(setup.up, 1, 1e-6), `minY=${setup.minY}`);
check('XR-Start: Modell ca. 0,7 m vor dem Kopf', near(setup.centreDistance, 0.7, 0.06), `${setup.centreDistance.toFixed(3)} m`);
check('XR-Start: Panel ca. 0,6 m vor dem Kopf und zum Nutzer gedreht', near(setup.panelDistance, 0.65, 0.15) && setup.panelFacesHead && setup.panelInScene, `${setup.panelDistance.toFixed(2)} m`);
check('Panel hat alle Funktionen: 1:1, Zentrieren, Ablegen, Messen, Löschen, Nur Ecken, Teile, Beenden',
  ['scale1', 'center', 'place', 'measure', 'clear', 'vertices', 'part:0', 'exit'].every((id) => setup.buttons.includes(id)), setup.buttons.join());

// helper in page: aim controller i from `origin` at `target` (ray = -Z axis)
await page.evaluate(() => {
  const { THREE, it } = window.__t;
  window.__aim = (i, origin, target) => {
    const c = it.controllers[i];
    c.ray.position.copy(origin);
    const dir = target.clone().sub(origin).normalize();
    c.ray.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    c.grip.position.copy(origin);
    c.grip.quaternion.copy(c.ray.quaternion);
    window.__sync(c.ray); window.__sync(c.grip);
  };
  // three's XR controller groups have matrixAutoUpdate = false and get their matrix from the session each frame
  window.__sync = (o) => { o.matrix.compose(o.position, o.quaternion, o.scale); o.updateMatrixWorld(true); };
  window.__aimAtButton = (i, id) => {
    const target = it.panel.buttonCentre(id);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(it.panel.mesh.quaternion);
    window.__aim(i, target.clone().addScaledVector(normal, 0.35), target);
  };
});

// panel: hover, 1:1 with pivot, centre, measure toggle, parts, delete
const panelRun = await page.evaluate(async () => {
  const tick = () => new Promise((r) => setTimeout(r, 0)); // the measure toggle is async (BVH preparation)
  const { THREE, it, viewer, measure, panel } = window.__t;
  const out = {};
  const root = viewer.modelRoot;
  const worldCentre = () => viewer.model.visibleBox().getCenter(new THREE.Vector3()).applyMatrix4(root.matrix);

  window.__aimAtButton(0, 'scale1'); it.update();
  out.hover = panel.hoverId;
  out.rayLength = it.controllers[0].line.scale.z;
  root.scale.setScalar(2.2); root.updateMatrix();
  const c0 = worldCentre();
  it.select(0);
  out.scale1 = root.scale.x;
  out.scale1Drift = worldCentre().distanceTo(c0);

  // centre: model back in front of the head
  root.position.add(new THREE.Vector3(2, 1, 0)); root.updateMatrix();
  window.__aimAtButton(0, 'center'); it.select(0);
  const head = viewer.camera.getWorldPosition(new THREE.Vector3());
  out.centreDist = Math.hypot(worldCentre().x - head.x, worldCentre().z - head.z);

  window.__aimAtButton(0, 'measure'); it.select(0); await tick();
  out.measureOn = measure.active;
  window.__aimAtButton(0, 'vertices'); it.select(0);
  out.vertices = measure.onlyVertices;
  window.__aimAtButton(0, 'vertices'); it.select(0);

  window.__aimAtButton(1, 'part:0'); it.select(1);
  out.partHidden = viewer.model.parts[0].object.visible === false;
  it.select(1);
  out.partShown = viewer.model.parts[0].object.visible === true;

  // a ray that misses the panel must not press anything
  window.__aim(0, new THREE.Vector3(3, 1, 3), new THREE.Vector3(3, 1, 0));
  window.__aim(1, new THREE.Vector3(3.5, 1, 3), new THREE.Vector3(3.5, 1, 0)); it.update();
  out.missHover = panel.hoverId;
  return out;
});
check('Panel: Controller-Strahl markiert den Button (Hover)', panelRun.hover === 'scale1', `${panelRun.hover}`);
check('Panel: Strahl endet auf dem Panel (0,35 m)', near(panelRun.rayLength, 0.35, 0.01), `${panelRun.rayLength}`);
check('Panel „1:1“: Maßstab exakt 1, Modell springt nicht', panelRun.scale1 === 1 && panelRun.scale1Drift < 1e-6, `drift=${panelRun.scale1Drift}`);
check('Panel „Zentrieren“: Modell wieder 0,7 m vor dem Kopf', near(panelRun.centreDist, 0.7, 0.06), `${panelRun.centreDist.toFixed(3)}`);
check('Panel „Messen“ schaltet den Messmodus', panelRun.measureOn === true);
check('Panel „Nur Ecken“ schaltet um', panelRun.vertices === true);
check('Panel Teile: ausblenden und wieder einblenden', panelRun.partHidden && panelRun.partShown);
check('Strahl daneben: kein Hover', panelRun.missHover === null, `${panelRun.missHover}`);

// ray measuring: two corners of the long edge, trigger on each
const rayMeasure = await page.evaluate(() => {
  const { THREE, it, viewer, measure } = window.__t;
  const root = viewer.modelRoot;
  root.updateMatrixWorld(true);
  const b = viewer.model.visibleBox();
  const corner = (x) => root.localToWorld(new THREE.Vector3(x, b.max.y, b.max.z));
  const a = corner(b.min.x), c = corner(b.max.x);
  const out = {};
  const front = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion); // the face that looks at the user
  const centre = viewer.model.visibleBox().getCenter(new THREE.Vector3()).applyMatrix4(root.matrix);
  // aim 1 mm off the vertex towards the middle of the part, like a human who is not perfectly exact
  const aimAt = (p, offset) => window.__aim(1, p.clone().add(offset), p.clone().add(centre.clone().sub(p).normalize().multiplyScalar(0.001)));
  const from = (side) => front.clone().multiplyScalar(0.35).add(new THREE.Vector3(side * 0.05, 0.1, 0));
  aimAt(a, from(1)); it.update();
  out.hoverSnapped = measure.hover?.snapped;
  it.select(1);
  out.pending = !!measure.pending;
  aimAt(c, from(-1)); it.update();
  it.select(1);
  const m = measure.measurements.at(-1);
  out.mm = m?.distanceMm; out.snaps = m && m.snapA && m.snapB;
  // trigger on the panel while measuring must not place a point
  const before = measure.measurements.length;
  window.__aimAtButton(1, 'scale1'); it.select(1);
  out.noPointOnPanel = measure.measurements.length === before && !measure.pending;
  return out;
});
check('Strahl-Messen: Hover rastet auf Eckpunkt ein', rayMeasure.hoverSnapped === true);
check('Strahl-Messen: erster Abzug setzt den Punkt', rayMeasure.pending === true);
check('V1-16 (simuliert) Strahl-Messen: 100,0 mm (±0,1), eingerastet', near(rayMeasure.mm, 100, 0.1) && rayMeasure.snaps === true, `${rayMeasure.mm}`);
check('Abzug auf dem Panel setzt keinen Messpunkt', rayMeasure.noPointOnPanel);

// grips: one hand moves the model, two hands scale, gripping the panel moves the panel only
const gripRun = await page.evaluate(() => {
  const { THREE, it, viewer, panel } = window.__t;
  const root = viewer.modelRoot;
  const out = {};
  // aim at free space, away from the panel
  const free = (i, x) => window.__aim(i, new THREE.Vector3(x, 1.2, 0.5), new THREE.Vector3(x, 1.2, -3));
  free(0, -0.3); free(1, 0.3);
  it.squeeze(0, true); it.update();
  const p0 = root.position.clone();
  it.controllers[0].grip.position.add(new THREE.Vector3(0.1, 0.05, 0)); window.__sync(it.controllers[0].grip); it.update();
  out.oneMove = root.position.clone().sub(p0).toArray().map((v) => +v.toFixed(6));
  it.squeeze(1, true); it.update();
  const s0 = root.scale.x;
  const d0 = it.controllers[1].grip.position.distanceTo(it.controllers[0].grip.position);
  it.controllers[1].grip.position.x += 0.2; window.__sync(it.controllers[1].grip); it.update();
  out.scaleRatio = root.scale.x / s0;
  out.scaleExpected = it.controllers[1].grip.position.distanceTo(it.controllers[0].grip.position) / d0;
  it.squeeze(0, false); it.squeeze(1, false); it.update();
  out.released = !it.gesture.holding;

  // panel grab
  const panelPos = panel.mesh.position.clone();
  const modelPos = root.position.clone();
  window.__aimAtButton(0, 'scale1');
  it.squeeze(0, true);
  out.panelGrabbed = !!it.panelGrab && !it.controllers[0].squeezing;
  it.controllers[0].grip.position.add(new THREE.Vector3(0, 0.2, 0)); window.__sync(it.controllers[0].grip); it.update();
  out.panelMoved = +(panel.mesh.position.y - panelPos.y).toFixed(6);
  out.modelStayed = root.position.distanceTo(modelPos) < 1e-9;
  it.squeeze(0, false);
  out.panelReleased = it.panelGrab === null;
  return out;
});
check('Grip: Modell folgt der Hand (0,1 / 0,05 / 0)', arr(gripRun.oneMove, [0.1, 0.05, 0]), gripRun.oneMove.join());
check('Beide Grips: Maßstab folgt dem Handabstand', near(gripRun.scaleRatio, gripRun.scaleExpected, 1e-3), `${gripRun.scaleRatio.toFixed(4)} / ${gripRun.scaleExpected.toFixed(4)}`);
check('Grips los: nichts mehr gehalten', gripRun.released);
check('Grip auf dem Panel: bewegt das Panel, nicht das Modell', gripRun.panelGrabbed && near(gripRun.panelMoved, 0.2, 1e-6) && gripRun.modelStayed, `${gripRun.panelMoved}`);
check('Grip loslassen gibt das Panel frei', gripRun.panelReleased);

// putting the model down
const putDown = await page.evaluate(() => {
  const { THREE, it, viewer } = window.__t;
  const root = viewer.modelRoot;
  const out = {};
  it.stop(); it.start(); // panel back in front of the head
  window.__aim(1, new THREE.Vector3(3.5, 1, 3), new THREE.Vector3(3.5, 1, 0));
  root.quaternion.setFromEuler(new THREE.Euler(0.5, 0.3, 0.2)); root.updateMatrix();
  window.__aimAtButton(0, 'place'); it.select(0);
  out.placing = it.placing;
  // table surface at 0.9 m, controller tip on it; no hit-test available -> controller height
  window.__aim(0, new THREE.Vector3(0.2, 0.9, -0.5), new THREE.Vector3(0.2, 0.9, -3));
  it.update();
  out.ring = it.controllers[0].ring.visible && Math.abs(it.controllers[0].ring.position.y - 0.9) < 1e-6;
  out.ringOther = it.controllers[1].ring.visible; // the second controller shows its own ring
  it.select(0);
  const box = viewer.model.visibleBox().clone().applyMatrix4(root.matrixWorld);
  root.updateMatrixWorld(true);
  const bottom = viewer.model.visibleBox();
  const bc = new THREE.Vector3((bottom.min.x + bottom.max.x) / 2, bottom.min.y, (bottom.min.z + bottom.max.z) / 2).applyMatrix4(root.matrixWorld);
  out.bottom = bc.toArray().map((v) => +v.toFixed(5));
  out.up = +new THREE.Vector3(0, 1, 0).applyQuaternion(root.quaternion).y.toFixed(6);
  out.done = it.placing === false;
  // with a hit-test result the surface comes from the room detection
  it.placing = true;
  it.controllers[0].hitTest = new THREE.Vector3(-0.4, 1.05, -0.6);
  it.select(0);
  root.updateMatrixWorld(true);
  const bc2 = new THREE.Vector3((bottom.min.x + bottom.max.x) / 2, bottom.min.y, (bottom.min.z + bottom.max.z) / 2).applyMatrix4(root.matrixWorld);
  out.hit = bc2.toArray().map((v) => +v.toFixed(5));
  it.controllers[0].hitTest = null;
  return out;
});
check('Panel „Ablegen“ schaltet den Ablegemodus', putDown.placing === true);
check('Ablegemodus zeigt je Controller einen Ring, auf Controller-Höhe', putDown.ring === true && putDown.ringOther === true);
check('Abzug im Ablegemodus: Unterseite liegt auf Controller-Höhe (0,9 m), aufrecht', arr(putDown.bottom, [0.2, 0.9, -0.5], 1e-4) && near(putDown.up, 1, 1e-5) && putDown.done, `${putDown.bottom.join()} up=${putDown.up}`);
check('Mit Hit-Test-Ergebnis: Unterseite auf der erkannten Fläche', arr(putDown.hit, [-0.4, 1.05, -0.6], 1e-4), putDown.hit.join());

// big model stands on the floor, paging in the parts list
await open(sample('pruefwinkel.glb'));
const pages = await page.evaluate(async () => {
  const { THREE, it, viewer } = window.__t;
  it.stop(); it.start();
  viewer.modelRoot.updateMatrixWorld(true);
  return { minY: viewer.model.visibleBox().clone().applyMatrix4(viewer.modelRoot.matrixWorld).min.y };
});
check('Neues Modell: nach XR-Start wieder auf Tischhöhe', near(pages.minY, 0.75, 1e-6), `${pages.minY}`);
{
  let obj = '';
  for (let i = 1; i <= 9; i++) obj += `o Teil_${i}\nv ${i} 0 0\nv ${i + 0.5} 0 0\nv ${i} 0.5 0\nf ${(i - 1) * 3 + 1} ${(i - 1) * 3 + 2} ${(i - 1) * 3 + 3}\n`;
  const f = path.join(os.tmpdir(), 'xr-viele.obj'); fs.writeFileSync(f, obj);
  await open(f);
}
const paging = await page.evaluate(() => {
  const { it, panel } = window.__t;
  it.stop(); it.start(); panel.refresh();
  const first = panel.buttons.filter((b) => b.id.startsWith('part:')).map((b) => b.id);
  panel.press('parts:next'); panel.refresh();
  const second = panel.buttons.filter((b) => b.id.startsWith('part:')).map((b) => b.id);
  return { first, second, page: panel.page };
});
check('Teileliste im Panel blättert (4 pro Seite, 9 Teile)', paging.first.join() === 'part:0,part:1,part:2,part:3' && paging.second.join() === 'part:4,part:5,part:6,part:7' && paging.page === 1, `${paging.first} | ${paging.second}`);

// stop restores a clean state
const stopped = await page.evaluate(() => {
  const { it, panel } = window.__t;
  it.stop();
  return { panelGone: !panel.mesh.parent, active: it.active, ray: it.controllers[0].line.visible };
});
check('XR beenden: Panel und Strahlen verschwinden', stopped.panelGone && !stopped.active && !stopped.ray);

// panel picture for a visual check
const png = await page.evaluate(() => { const { panel } = window.__t; panel.invalidate(); panel.refresh(); return panel.canvas.toDataURL('image/png'); });
if (process.env.PANEL_PNG) fs.writeFileSync(process.env.PANEL_PNG, Buffer.from(png.split(',')[1], 'base64'));

check('Ohne WebXR: AR/VR-Buttons bleiben versteckt, Hinweis erklärt es', await page.locator('#btn-ar').isHidden() && await page.locator('#btn-vr').isHidden() && /nicht verfügbar/.test(await page.locator('#xr-note').innerText()));
check('keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await t.close();
finish();
