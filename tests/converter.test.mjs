// Aufgabe 9: Konverter → Viewer. Der Konverter erzeugt GLBs, der Viewer lädt sie (K1-02 bis K1-06).
// Braucht Python mit numpy und fast-simplification (CONVERTER_PYTHON=<python>, Standard: python3).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { openViewer, check, near, finish, ROOT, SAMPLES_DIR } from './helpers.mjs';

const python = process.env.CONVERTER_PYTHON || 'python3';
if (spawnSync(python, ['-c', 'import numpy, fast_simplification']).status !== 0) {
  console.log(`  --   ${python} hat numpy/fast-simplification nicht (pip install -r converter/requirements.txt) – Konverter-Test übersprungen`);
  process.exit(0);
}
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'qcv-conv-'));
const convert = (input, name, ...args) => {
  const target = path.join(out, name);
  const r = spawnSync(python, [path.join(ROOT, 'converter/convert.py'), path.join(SAMPLES_DIR, input), '-o', target, ...args], { encoding: 'utf8' });
  if (r.status !== 0) console.log(r.stdout, r.stderr);
  return { ok: r.status === 0, target, stdout: r.stdout, size: r.status === 0 ? fs.statSync(target).size : 0 };
};

const t = await openViewer();
const { page, errors } = t;
async function open(file) {
  await page.setInputFiles('#file-input', file);
  await page.waitForFunction(() => window.cadViewer.model && document.getElementById('toast').hidden, null, { timeout: 120000 });
  return page.evaluate(() => {
    const m = window.cadViewer.model;
    const b = m.visibleBox();
    return {
      bbox: document.getElementById('info-bbox').textContent, tris: m.totalTriangles, parts: m.parts.map((p) => p.name),
      sizeMm: [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => v * 1000),
      unit: document.getElementById('info-unit').textContent,
    };
  });
}

// K1-02: box, default settings
let r = convert('pruefquader.stl', 'pq.glb');
check('K1-02 Konverter läuft', r.ok);
let v = await open(r.target);
check('K1-02 GLB im Viewer: 100,0 × 50,0 × 20,0 mm (unverändert)', v.bbox === '100,0 × 50,0 × 20,0 mm' && /GLB/.test(v.unit), v.bbox);
check('K1-02 Statistik nennt Dreiecke, Dateigröße und Bounding-Box', /Dreiecke vorher/.test(r.stdout) && /Dateigröße/.test(r.stdout) && /Bounding-Box \(mm\): 100,0 × 50,0 × 20,0/.test(r.stdout));
// measure the long edge on the converted file (same flow as the desktop test)
await page.click('#btn-measure');
const mm = await page.evaluate(async () => {
  const THREE = await import('three');
  const { viewer, measure } = window.cadViewer;
  const b = viewer.model.visibleBox();
  const pt = (x) => viewer.worldToScreen(new THREE.Vector3(x, b.max.y, b.max.z));
  return { a: pt(b.min.x), b: pt(b.max.x) };
});
await page.mouse.click(mm.a.x + 3, mm.a.y + 3);
await page.mouse.click(mm.b.x - 3, mm.b.y + 3);
const measured = await page.evaluate(() => window.cadViewer.measure.measurements.at(-1)?.distanceMm);
check('K1-02 Messen am konvertierten Quader: 100,0 mm (±0,1)', near(measured, 100, 0.1), `${measured}`);

// K1-04 / K1-05 / K1-06: assembly with 24 identical bolts (6 turned by 90°)
const input = await open(path.join(SAMPLES_DIR, 'baugruppe.obj'));
r = convert('baugruppe.obj', 'bg.glb', '--unvereinfacht');
const asm = await open(r.target);
check('K1-04 Bauteile bleiben getrennt: 25 Teile, Namen erhalten', asm.parts.length === 25 && asm.parts[0] === 'Grundplatte' && asm.parts.includes('Schraube_24'), `${asm.parts.length}`);
check('K1-04 Maße wie beim OBJ (inkl. um 90° gedrehter Schrauben als Instanzen)', input.sizeMm.every((x, i) => near(x, asm.sizeMm[i], 0.01)) && asm.bbox === input.bbox, `${input.bbox} | ${asm.bbox}`);
check('K1-05 „unvereinfacht“: Dreiecksanzahl identisch zur Eingabe', asm.tris === input.tris && asm.tris === 6156, `${input.tris} -> ${asm.tris}`);
await page.evaluate(() => { const m = window.cadViewer.model; const i = m.parts.findIndex((p) => p.name === 'Schraube_01'); window.__i = i; });
await page.locator('#part-list li', { hasText: 'Schraube_01' }).locator('input').uncheck();
const hidden = await page.evaluate(() => window.cadViewer.model.parts[window.__i].object.visible);
const trisAfter = await page.locator('#info-tris').innerText();
check('K1-04 einzelnes Teil im Viewer ausblenden: Dreiecke sinken um die 256 der Schraube (6.156 → 5.900)', hidden === false && /5\.900 von 6\.156/.test(trisAfter), trisAfter);
const noInst = convert('baugruppe.obj', 'bg-noinst.glb', '--unvereinfacht', '--keine-instanzen');
check('K1-06 Instanzen: Datei deutlich kleiner als ohne', r.size > 0 && r.size < noInst.size / 3, `${r.size} B statt ${noInst.size} B (Faktor ${(noInst.size / r.size).toFixed(1)})`);
console.log(`       Agent-Test K1-06: ${(input && fs.statSync(path.join(SAMPLES_DIR, 'baugruppe.obj')).size)} B OBJ -> ${r.size} B mit Instanzen, ${noInst.size} B ohne`);
check('K1-06 Statistik meldet die wiederverwendeten Instanzen', /23 davon als Instanz wiederverwendet/.test(r.stdout));

// K1-03: load test
if (fs.existsSync(path.join(SAMPLES_DIR, 'last_2mio.stl'))) {
  r = convert('last_2mio.stl', 'last.glb', '--ziel', '200000');
  const big = await open(r.target);
  check('K1-03 Ausgabe ≤ 200 000 Dreiecke', r.ok && big.tris <= 200000 && big.tris > 150000, `${big.tris}`);
  check('K1-03 Form bleibt erhalten: Kugel Ø 200 mm (±0,1 mm)', big.sizeMm.every((x) => near(x, 200, 0.1)), big.sizeMm.map((x) => x.toFixed(3)).join(' × '));
  check('K1-03 Statistik wird ausgegeben', /Dreiecke nachher:\s+200\.000/.test(r.stdout));
  check('K1-03 Datei deutlich kleiner als die STL', r.size < 5e6, `${(r.size / 1e6).toFixed(1)} MB`);
  check('K1-03 Viewer warnt nicht mehr (unter 1 Mio. Dreiecken)', await page.locator('#info-warn').isHidden());
}

check('keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await t.close();
fs.rmSync(out, { recursive: true, force: true });
finish();
