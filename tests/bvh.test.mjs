// BVH: gleiche Treffer wie three's Raycaster (Referenz), Leistung auf dem 2-Mio-Netz.
import fs from 'node:fs';
import path from 'node:path';
import { openViewer, check, finish, SAMPLES_DIR } from './helpers.mjs';

const t = await openViewer();
const { page, errors } = t;

const cmp = await page.evaluate(async () => {
  const THREE = await import('three');
  const { MeshBVH } = await import('/js/bvh.js');
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const results = {};
  const shapes = {
    'indiziert (Kugel 128x64)': new THREE.SphereGeometry(0.1, 128, 64),
    'nicht indiziert (Torus)': new THREE.TorusKnotGeometry(0.08, 0.02, 200, 24).toNonIndexed(),
    'indiziert, Box': new THREE.BoxGeometry(0.1, 0.05, 0.02),
  };
  for (const [name, geometry] of Object.entries(shapes)) {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const bvh = new MeshBVH(geometry);
    const raycaster = new THREE.Raycaster();
    let mismatches = 0, hits = 0, misses = 0, worst = 0;
    for (let i = 0; i < 1500; i++) {
      const o = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.8);
      const target = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.2);
      const d = target.sub(o).normalize();
      raycaster.set(o, d);
      const ref = raycaster.intersectObject(mesh)[0];
      const got = bvh.raycast(o.x, o.y, o.z, d.x, d.y, d.z);
      if (!ref && !got) { misses++; continue; }
      if (!ref || !got) { mismatches++; continue; }
      hits++;
      worst = Math.max(worst, Math.abs(ref.distance - got.t));
      if (Math.abs(ref.distance - got.t) > 1e-6) mismatches++;
    }
    results[name] = { tris: bvh.triCount, hits, misses, mismatches, worst };
  }
  // exactly axis-parallel rays must not turn into NaN misses
  const box = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const b = new MeshBVH(box);
  const axis = b.raycast(0, 0, 1, 0, 0, -1);
  results.axis = axis && Math.abs(axis.t - 0.95) < 1e-9;
  return results;
});
for (const [name, r] of Object.entries(cmp)) {
  if (name === 'axis') { check('Achsparalleler Strahl trifft (kein NaN)', r === true); continue; }
  check(`${name}: ${r.tris} Dreiecke, ${r.hits} Treffer / ${r.misses} Fehlschüsse stimmen mit Raycaster überein`, r.mismatches === 0 && r.hits > 100, `Abweichungen=${r.mismatches}, max Δt=${r.worst.toExponential(1)}`);
}

if (fs.existsSync(path.join(SAMPLES_DIR, 'last_2mio.stl'))) {
  await page.setInputFiles('#file-input', path.join(SAMPLES_DIR, 'last_2mio.stl'));
  await page.waitForFunction(() => window.cadViewer.model && document.getElementById('toast').hidden, null, { timeout: 120000 });
  const perf = await page.evaluate(async () => {
    const { MeshBVH } = await import('/js/bvh.js');
    const mesh = window.cadViewer.model.parts[0].object;
    const t0 = performance.now();
    const bvh = new MeshBVH(mesh.geometry);
    const build = performance.now() - t0;
    const t1 = performance.now();
    let hits = 0;
    for (let i = 0; i < 2000; i++) {
      const a = (i / 2000) * Math.PI * 2;
      const r = bvh.raycast(Math.cos(a) * 0.5, 0.02 * Math.sin(a * 7), Math.sin(a) * 0.5, -Math.cos(a), 0, -Math.sin(a));
      if (r) hits++;
    }
    return { build, perRay: (performance.now() - t1) / 2000, hits, tris: bvh.triCount, nodes: bvh.nodeCount };
  });
  check('2 Mio. Dreiecke: BVH-Aufbau unter 10 s', perf.build < 10000, `${(perf.build / 1000).toFixed(1)} s, ${perf.nodes} Knoten`);
  check('2 Mio. Dreiecke: Strahl unter 1 ms', perf.perRay < 1, `${perf.perRay.toFixed(3)} ms pro Strahl`);
  check('2 Mio. Dreiecke: alle Strahlen auf die Kugel treffen', perf.hits === 2000, `${perf.hits}/2000`);
}

check('keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await t.close();
finish();
