// Aufgabe 6: echte WebXR-Session-Strecke mit emuliertem Meta Quest 3 (IWER, npm "iwer").
// Durchläuft requestSession → three.js XR → Controller-Events → Panel → Messen → Greifen → Beenden.
// Das ist ein Emulator: Die echte Quest (Passthrough-Qualität, Tracking, Hit-Test, Leistung) bleibt offen
// und wird mit den Quest-Abnahmeschritten V1-11 bis V1-19 geprüft.
import path from 'node:path';
import { openViewer, check, near, finish, SAMPLES_DIR } from './helpers.mjs';

const t = await openViewer({ emulateQuest: true });
const { page, errors } = t;
const sample = (n) => path.join(SAMPLES_DIR, n);

// helpers living in the page
await page.evaluate(async () => {
  const THREE = await import('three');
  const { xr, viewer, measure } = window.cadViewer;
  const device = window.__iwer;
  const it = xr.interaction;
  const frames = (n = 3) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const hand = (name) => device.controllers[name];
  // controller ray = pose; -Z is the pointing direction
  const aim = async (name, origin, target) => {
    const dir = target.clone().sub(origin).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    hand(name).position.set(origin.x, origin.y, origin.z);
    hand(name).quaternion.set(q.x, q.y, q.z, q.w);
    await frames(3);
  };
  const aimAtButton = async (name, id) => {
    const target = it.panel.buttonCentre(id);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(it.panel.mesh.quaternion);
    await aim(name, target.clone().addScaledVector(normal, 0.35), target);
  };
  const click = async (name) => { hand(name).updateButtonValue('trigger', 1); await frames(3); hand(name).updateButtonValue('trigger', 0); await frames(3); };
  const pressButton = async (name, id) => { await aimAtButton(name, id); await click(name); await frames(2); };
  window.__x = { THREE, xr, viewer, measure, device, it, frames, hand, aim, aimAtButton, click, pressButton };
});
const ev = (fn, arg) => page.evaluate(fn, arg);

// ------------------------------------------------------------------ availability
await page.waitForFunction(() => document.getElementById('xr-note').textContent !== '');
check('Emuliertes WebXR: AR- und VR-Button erscheinen', await page.locator('#btn-ar').isVisible() && await page.locator('#btn-vr').isVisible());
check('Buttons sind ohne Modell gesperrt', await page.locator('#btn-ar').isDisabled());
await page.setInputFiles('#file-input', sample('pruefquader.stl'));
await page.waitForFunction(() => window.cadViewer.model && document.getElementById('toast').hidden);
check('Buttons sind mit Modell aktiv', await page.locator('#btn-ar').isEnabled());

// ------------------------------------------------------------------ V1-11 (emuliert): AR starten
await page.click('#btn-ar');
await page.waitForFunction(() => window.cadViewer.xr.presenting, null, { timeout: 20000 });
await ev(() => window.__x.frames(5));
const s0 = await ev(() => {
  const { xr, viewer, device, it, THREE } = window.__x;
  const head = viewer.activeCamera().getWorldPosition(new THREE.Vector3());
  viewer.modelRoot.updateMatrixWorld(true);
  const box = viewer.model.visibleBox().clone().applyMatrix4(viewer.modelRoot.matrixWorld);
  const c = box.getCenter(new THREE.Vector3());
  return {
    presenting: viewer.renderer.xr.isPresenting, kind: xr.kind, blend: xr.session.environmentBlendMode,
    alpha: viewer.renderer.getClearAlpha(), grid: viewer.grid.visible,
    handed: it.controllers.map((c) => c.handedness).sort().join(),
    scale: viewer.modelRoot.scale.x, minY: box.min.y, modelDist: Math.hypot(c.x - head.x, c.z - head.z),
    panelDy: it.panel.mesh.position.y - head.y, panelDist: it.panel.mesh.position.distanceTo(head), head: head.toArray(),
    frame: viewer.renderer.info.render.frame,
  };
});
check('V1-11 AR-Session läuft, Modus „immersive-ar“ mit Passthrough (alpha-blend)', s0.presenting && s0.kind === 'ar' && s0.blend === 'alpha-blend', `${s0.kind} ${s0.blend}`);
check('Passthrough: Hintergrund transparent, Raster aus', s0.alpha === 0 && s0.grid === false);
check('Beide Controller erkannt (links/rechts aus den XR-Events)', s0.handed === 'left,right', s0.handed);
check('Modell steht 1:1 auf Tischhöhe 0,75 m, 0,7 m vor dem Kopf (Kopfhöhe 1,6 m)', s0.scale === 1 && near(s0.minY, 0.75, 1e-4) && near(s0.modelDist, 0.7, 0.06), `scale=${s0.scale} minY=${s0.minY} dist=${s0.modelDist.toFixed(3)}`);
check('Panel auf Kopfhöhe (−0,1 m) und ca. 0,65 m entfernt', near(s0.panelDy, -0.1, 0.02) && near(s0.panelDist, 0.65, 0.15), `dy=${s0.panelDy.toFixed(3)} dist=${s0.panelDist.toFixed(2)}`);
check('XR-Frames werden gerendert', s0.frame > 3, `frame=${s0.frame}`);

// ------------------------------------------------------------------ panel with the real trigger event
const hover = await ev(async () => { await window.__x.aimAtButton('right', 'measure'); return window.__x.it.panel.hoverId; });
check('Controller-Strahl (emuliert) markiert den Panel-Button', hover === 'measure', `${hover}`);
await ev(() => window.__x.click('right'));
await page.waitForFunction(() => window.cadViewer.measure.active);
check('Trigger auf „Messen“: Messmodus an', await ev(() => window.__x.measure.active));

// V1-16 (emuliert): measure the long edge with the ray
const m1 = await ev(async () => {
  const { THREE, viewer, it, measure, aim, click } = window.__x;
  const root = viewer.modelRoot; root.updateMatrixWorld(true);
  const b = viewer.model.visibleBox();
  const centre = b.getCenter(new THREE.Vector3()).applyMatrix4(root.matrix);
  const front = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion);
  const corner = (x) => root.localToWorld(new THREE.Vector3(x, b.max.y, b.max.z));
  const shoot = async (p, side) => aim('right', p.clone().add(front.clone().multiplyScalar(0.35)).add(new THREE.Vector3(side * 0.05, 0.1, 0)), p.clone().add(centre.clone().sub(p).normalize().multiplyScalar(0.001)));
  await shoot(corner(b.min.x), 1);
  const hoverSnapped = measure.hover?.snapped;
  await click('right');
  const pending = !!measure.pending;
  await shoot(corner(b.max.x), -1);
  await click('right');
  const m = measure.measurements.at(-1);
  return { hoverSnapped, pending, mm: m?.distanceMm, snaps: m && m.snapA && m.snapB, count: measure.measurements.length };
});
check('V1-16 (emuliert) Hover rastet auf den Eckpunkt ein', m1.hoverSnapped === true);
check('V1-16 (emuliert) zwei Trigger-Klicks messen 100,0 mm (±0,1), eingerastet', m1.count === 1 && near(m1.mm, 100, 0.1) && m1.snaps === true, `${m1.mm}`);

// panel buttons: delete, hide a part
const del = await ev(async () => {
  const { measure, pressButton } = window.__x;
  const id = measure.measurements[0].id;
  await pressButton('left', `del:${id}`);
  return measure.measurements.length;
});
check('Panel ✕: Messung gelöscht', del === 0, `${del}`);
const part = await ev(async () => {
  const { viewer, pressButton } = window.__x;
  await pressButton('left', 'part:0');
  const hidden = viewer.model.parts[0].object.visible === false;
  await pressButton('left', 'part:0');
  return { hidden, shown: viewer.model.parts[0].object.visible === true };
});
check('Panel: Teil aus- und wieder einblenden', part.hidden && part.shown);

// ------------------------------------------------------------------ V1-13 / V1-14 (emuliert): grab, scale, 1:1
const grab = await ev(async () => {
  const { THREE, viewer, it, hand, aim, frames } = window.__x;
  const root = viewer.modelRoot;
  // aim both controllers at free space below the panel (it spans y 1.2 .. 1.8): gripping the panel would grab the panel
  await aim('left', new THREE.Vector3(-0.3, 0.9, -0.2), new THREE.Vector3(-0.3, 0.9, -3));
  await aim('right', new THREE.Vector3(0.3, 0.9, -0.2), new THREE.Vector3(0.3, 0.9, -3));
  const out = {};
  hand('left').updateButtonValue('squeeze', 1); await frames(3);
  out.holding = it.gesture.holding && it.gesture.mode === 'one';
  const p0 = root.position.clone();
  hand('left').position.set(-0.3 + 0.12, 0.9 + 0.05, -0.2); await frames(3);
  out.move = root.position.clone().sub(p0).toArray().map((v) => +v.toFixed(4));
  hand('right').updateButtonValue('squeeze', 1); await frames(3);
  out.two = it.gesture.mode === 'two';
  const s0 = root.scale.x;
  hand('right').position.set(0.3 + 0.3, 0.9, -0.2); await frames(3);
  out.scaled = root.scale.x / s0;
  hand('left').updateButtonValue('squeeze', 0); hand('right').updateButtonValue('squeeze', 0); await frames(3);
  out.released = !it.gesture.holding;
  return out;
});
check('V1-13 (emuliert) Grip links: Modell wird gehalten', grab.holding);
check('V1-13 (emuliert) Modell folgt der Hand (+0,12 / +0,05 / 0)', near(grab.move[0], 0.12, 0.002) && near(grab.move[1], 0.05, 0.002) && near(grab.move[2], 0, 0.002), grab.move.join());
check('V1-14 (emuliert) zweiter Grip: Zwei-Hand-Modus, Maßstab wächst mit dem Handabstand', grab.two && grab.scaled > 1.4, `Faktor ${grab.scaled.toFixed(3)}`);
check('Grips los: nichts wird gehalten', grab.released);
const one = await ev(async () => {
  const { viewer, pressButton } = window.__x;
  const before = viewer.modelRoot.scale.x;
  await pressButton('left', 'scale1');
  return { before, after: viewer.modelRoot.scale.x };
});
check('V1-14 (emuliert) Panel „1:1“ setzt exakt auf Originalgröße', one.before !== 1 && one.after === 1, `${one.before.toFixed(3)} -> ${one.after}`);

// ------------------------------------------------------------------ end the session from the panel
await ev(() => window.__x.pressButton('right', 'exit'));
await page.waitForFunction(() => !window.cadViewer.xr.presenting, null, { timeout: 10000 });
const s1 = await ev(() => {
  const { viewer, it, THREE } = window.__x;
  return {
    alpha: viewer.renderer.getClearAlpha(), grid: viewer.grid.visible, presenting: viewer.renderer.xr.isPresenting,
    pos: viewer.modelRoot.position.toArray(), scale: viewer.modelRoot.scale.x, active: it.active,
    panelInScene: !!it.panel.mesh.parent, lines: it.controllers.some((c) => c.line.visible),
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(viewer.modelRoot.quaternion).y,
  };
});
check('Panel „XR beenden“ beendet die Session', s1.presenting === false && s1.active === false);
check('Danach wieder Desktop: undurchsichtiger Hintergrund, Raster sichtbar', s1.alpha === 1 && s1.grid === true);
check('Danach: Modell zurück am Ursprung, Maßstab 1, Panel und Strahlen weg', s1.pos.every((v) => v === 0) && s1.scale === 1 && !s1.panelInScene && !s1.lines, `${s1.pos}`);
check('Desktop-Messen funktioniert nach der Session weiter', await ev(() => { const { measure } = window.__x; return measure.measurements.length === 0 && measure.active; }));

// ------------------------------------------------------------------ second session as VR (opaque, floor grid kept)
await page.click('#btn-vr');
await page.waitForFunction(() => window.cadViewer.xr.presenting, null, { timeout: 20000 });
await ev(() => window.__x.frames(5));
const vr = await ev(() => { const { xr, viewer } = window.__x; return { kind: xr.kind, mode: xr.session.environmentBlendMode, alpha: viewer.renderer.getClearAlpha(), grid: viewer.grid.visible }; });
check('VR-Session: undurchsichtig, Bodenraster sichtbar', vr.kind === 'vr' && vr.mode === 'opaque' && vr.alpha === 1 && vr.grid === true, JSON.stringify(vr));
await ev(() => window.__x.xr.end());
await page.waitForFunction(() => !window.cadViewer.xr.presenting, null, { timeout: 10000 });
check('VR-Session lässt sich beenden', await ev(() => !window.__x.xr.presenting && !window.__x.viewer.renderer.xr.isPresenting));

// ------------------------------------------------------------------ session start must work again and be clean
await page.click('#btn-ar');
await page.waitForFunction(() => window.cadViewer.xr.presenting, null, { timeout: 20000 });
await ev(() => window.__x.frames(5));
const again = await ev(() => { const { viewer } = window.__x; return { scale: viewer.modelRoot.scale.x, alpha: viewer.renderer.getClearAlpha() }; });
check('Dritte Session (AR) startet wieder sauber', again.scale === 1 && again.alpha === 0);
await ev(() => window.__x.xr.end());
await page.waitForFunction(() => !window.cadViewer.xr.presenting, null, { timeout: 10000 });

check('keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await t.close();
finish();
