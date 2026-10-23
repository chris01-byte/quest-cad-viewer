// Aufgabe 2: Viewer-Grundgerüst – Seite lädt fehlerfrei, Hinweis sichtbar, Rendern, ungültige Datei.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { openViewer, check, finish, countDrawnPixels } from './helpers.mjs';

const t = await openViewer();
const { page, errors } = t;

check('V1-01 Hinweis „Datei öffnen“ sichtbar', await page.locator('#hint').isVisible() && (await page.locator('.hint-title').innerText()) === 'Datei öffnen');
check('Raster zeigt 100 mm', (await page.locator('#info-grid').innerText()) === '100 mm');

const drawCalls = await page.evaluate(() => {
  const { viewer } = window.cadViewer;
  viewer.requestRender();
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
    resolve(viewer.renderer.info.render.calls);
  })));
});
check('Szene wird gezeichnet (Draw-Calls > 0)', drawCalls > 0, `calls=${drawCalls}`);
const drawn = await countDrawnPixels(page);
check('Raster ist sichtbar (> 2000 Pixel)', drawn > 2000, `pixel=${drawn}`);

// invalid file: .txt
const txt = path.join(os.tmpdir(), 'kein-modell.txt');
fs.writeFileSync(txt, 'das ist kein Modell');
await page.setInputFiles('#file-input', txt);
await page.waitForFunction(() => !document.getElementById('toast').classList.contains('info')); // loading is async
const toast = await page.locator('#toast').innerText();
check('V1-09 .txt: verständliche Fehlermeldung', /nicht unterstützt/.test(toast) && /STL, OBJ oder GLB/.test(toast), toast);
check('App bleibt bedienbar (Button aktiv)', await page.locator('#btn-open').isEnabled());

check('keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await t.close();
finish();
