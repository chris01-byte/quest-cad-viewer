// Aufgabe 3: Loader STL / OBJ / GLB, Einheiten, Bounding-Box in mm (V1-02, V1-03, V1-04, Lasttest).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openViewer, check, near, finish, SAMPLES_DIR } from './helpers.mjs';

const t = await openViewer();
const { page, errors } = t;
const sample = (n) => path.join(SAMPLES_DIR, n);

/** Opens files through the real file input and waits until the load ended (model shown or error toast). */
async function open(files, timeout = 120000) {
  await page.setInputFiles('#file-input', files);
  await page.waitForFunction(() => {
    const toast = document.getElementById('toast');
    return toast.hidden || !toast.classList.contains('info');
  }, null, { timeout });
  return page.evaluate(() => {
    const toast = document.getElementById('toast');
    const m = window.cadViewer.model;
    const box = m && m.visibleBox();
    return {
      error: toast.hidden ? null : toast.textContent,
      bbox: document.getElementById('info-bbox').textContent,
      tris: document.getElementById('info-tris').textContent,
      unit: document.getElementById('info-unit').textContent,
      warn: document.getElementById('info-warn').hidden ? null : document.getElementById('info-warn').textContent,
      parts: m ? m.parts.map((p) => p.name) : [],
      sizeMm: box ? box.max.clone().sub(box.min).multiplyScalar(1000).toArray() : null,
      minY: box ? box.min.y : null,
      centre: box ? [(box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2] : null,
    };
  });
}
const sizeOk = (r, [x, y, z], tol = 0.1) => r.sizeMm && near(r.sizeMm[0], x, tol) && near(r.sizeMm[1], y, tol) && near(r.sizeMm[2], z, tol);

// --- V1-02 binary STL
let r = await open(sample('pruefquader.stl'));
check('V1-02 STL binär: Anzeige 100,0 × 50,0 × 20,0 mm', r.bbox === '100,0 × 50,0 × 20,0 mm', r.bbox);
check('V1-02 STL binär: Maße im Modell ±0,1 mm', sizeOk(r, [100, 50, 20]), JSON.stringify(r.sizeMm));
check('STL: 12 Dreiecke, Einheit mm', r.tris === '12' && /mm/.test(r.unit), `${r.tris} / ${r.unit}`);
check('Modell steht auf dem Raster (y=0) und ist zentriert', near(r.minY, 0, 1e-9) && near(r.centre[0], 0, 1e-6) && near(r.centre[1], 0, 1e-6));
check('Teileliste: ein Teil „pruefquader“', r.parts.join() === 'pruefquader', r.parts.join());

// --- ASCII STL (same box)
{
  const d = fs.readFileSync(sample('pruefquader.stl'));
  const n = d.readUInt32LE(80);
  let txt = 'solid box\n';
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50;
    txt += `facet normal ${d.readFloatLE(o)} ${d.readFloatLE(o + 4)} ${d.readFloatLE(o + 8)}\n outer loop\n`;
    for (let v = 0; v < 3; v++) txt += `  vertex ${d.readFloatLE(o + 12 + v * 12)} ${d.readFloatLE(o + 16 + v * 12)} ${d.readFloatLE(o + 20 + v * 12)}\n`;
    txt += ' endloop\nendfacet\n';
  }
  txt += 'endsolid box\n';
  const f = path.join(os.tmpdir(), 'quader-ascii.stl');
  fs.writeFileSync(f, txt);
  r = await open(f);
  check('STL ASCII: 100,0 × 50,0 × 20,0 mm', r.bbox === '100,0 × 50,0 × 20,0 mm', r.bbox);
}

// --- V1-03 OBJ
r = await open(sample('pruefquader.obj'));
check('V1-03 OBJ: Anzeige 100,0 × 50,0 × 20,0 mm', r.bbox === '100,0 × 50,0 × 20,0 mm', r.bbox);
check('V1-03 OBJ: Maße im Modell ±0,1 mm', sizeOk(r, [100, 50, 20]), JSON.stringify(r.sizeMm));

// --- V1-04 GLB, two parts, metres
r = await open(sample('pruefwinkel.glb'));
check('V1-04 GLB: Anzeige 80,0 × 60,0 × 40,0 mm', r.bbox === '80,0 × 60,0 × 40,0 mm', r.bbox);
check('V1-04 GLB: zwei Bauteile in der Teileliste', r.parts.length === 2 && /Grundplatte/.test(r.parts[0]) && /Schenkel/.test(r.parts[1]), r.parts.join());
check('GLB: 540 Dreiecke, Einheit m', r.tris === '540' && /m \(GLB\)/.test(r.unit), `${r.tris} / ${r.unit}`);

// --- several files at once: each file one part, absolute positions kept
r = await open([sample('pruefquader.stl'), sample('pruefwinkel.glb')]);
check('Mehrere Dateien: zwei Teile (je Datei)', r.parts.join() === 'pruefquader,pruefwinkel', r.parts.join());

// --- errors keep the app usable
const empty = path.join(os.tmpdir(), 'leer.stl'); fs.writeFileSync(empty, '');
r = await open(empty);
check('Leere STL: verständliche Meldung', r.error && /leer\.stl/.test(r.error) && /leer/.test(r.error.replace('leer.stl', '')), r.error);
const junk = path.join(os.tmpdir(), 'muell.stl'); fs.writeFileSync(junk, Buffer.alloc(40, 7));
r = await open(junk);
check('Zu kurze/ungültige STL: Meldung ohne technische Details', r.error && /muell\.stl/.test(r.error) && !/DataView/.test(r.error), r.error);
const bad = path.join(os.tmpdir(), 'kaputt.glb'); fs.writeFileSync(bad, Buffer.from('das ist kein glb, nur Text'));
r = await open(bad);
check('Kaputte GLB: verständliche Meldung', r.error && /kaputt\.glb/.test(r.error) && /GLB/.test(r.error), r.error);
const noext = path.join(os.tmpdir(), 'README'); fs.writeFileSync(noext, 'x');
r = await open(noext);
check('Datei ohne Endung: verständliche Meldung', r.error && /keine Endung/.test(r.error), r.error);
const txt = path.join(os.tmpdir(), 'notizen.txt'); fs.writeFileSync(txt, 'x');
r = await open(txt);
check('V1-09 .txt: Meldung nennt Dateityp und erlaubte Formate', r.error && /„\.txt“/.test(r.error) && /STL, OBJ oder GLB/.test(r.error), r.error);
r = await open(sample('pruefquader.stl'));
check('V1-09 App lädt danach wieder normal', r.error === null && r.bbox === '100,0 × 50,0 × 20,0 mm');

// --- load test (file is generated by samples/generate.py and not in the repo)
if (fs.existsSync(sample('last_2mio.stl'))) {
  const t0 = Date.now();
  r = await open(sample('last_2mio.stl'));
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  check('Lasttest: 2.002.224 Dreiecke angezeigt', r.tris === '2.002.224', `${r.tris}, Laden ${sec} s`);
  check('Lasttest: Kugel Ø 200 mm', sizeOk(r, [200, 200, 200], 0.1), JSON.stringify(r.sizeMm));
  check('Lasttest: Warnung oberhalb des Zielwerts', r.warn && /Zielwert/.test(r.warn), r.warn);
} else {
  console.log('  --   last_2mio.stl fehlt (python3 samples/generate.py) – Lasttest übersprungen');
}

check('keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await t.close();
finish();
