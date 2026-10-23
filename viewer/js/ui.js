import { Vector3 } from 'three';
import { TRIANGLE_TARGET } from './config.js';
import { fmtBytes, fmtInt, fmtMm } from './format.js';

const $ = (id) => document.getElementById(id);

/** DOM glue: file selection (dialog + drag & drop), status messages and the info panel. */
export class UI {
  /** @param {{onFiles: (files: File[]) => void}} handlers */
  constructor({ onFiles }) {
    this.onFiles = onFiles;
    this.toastTimer = null;

    const input = $('file-input');
    for (const id of ['btn-open', 'btn-open-hint']) $(id).addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (input.files.length) this.onFiles([...input.files]);
      input.value = ''; // allow re-opening the same file
    });

    let dragDepth = 0;
    window.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth++;
      $('drop-overlay').hidden = false;
    });
    window.addEventListener('dragover', (e) => {
      if (hasFiles(e)) e.preventDefault();
    });
    window.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) $('drop-overlay').hidden = true;
    });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      $('drop-overlay').hidden = true;
      this.onFiles([...e.dataTransfer.files]);
    });
  }

  /** kind: 'error' | 'warn' | 'info'. Errors stay until the next action, others fade out. */
  toast(message, kind = 'error') {
    const el = $('toast');
    el.textContent = message;
    el.className = `toast ${kind === 'error' ? '' : kind}`;
    el.hidden = false;
    clearTimeout(this.toastTimer);
    if (kind !== 'error') this.toastTimer = setTimeout(() => (el.hidden = true), 8000);
  }

  clearToast() {
    clearTimeout(this.toastTimer);
    $('toast').hidden = true;
  }

  setGrid(cellMetres) {
    $('info-grid').textContent = `${cellMetres * 1000} mm`;
  }

  /** Show a freshly loaded model: file facts, unit, triangles, box. */
  showModel(model, files) {
    $('info-name').textContent = model.name;
    $('info-size').textContent = fmtBytes(files.reduce((sum, f) => sum + f.size, 0));
    $('info-unit').textContent = model.sourceUnit;
    $('hint').hidden = true;
    this.updateModelInfo(model);
  }

  /** Numbers that change with part visibility: triangles and bounding box. */
  updateModelInfo(model) {
    const visibleTris = model.triangleCount({ visibleOnly: true });
    const all = model.triangleCount();
    $('info-tris').textContent = visibleTris === all ? fmtInt(all) : `${fmtInt(visibleTris)} von ${fmtInt(all)}`;
    const box = model.visibleBox();
    if (box.isEmpty()) {
      $('info-bbox').textContent = 'keine sichtbaren Teile';
    } else {
      const s = box.getSize(new Vector3());
      $('info-bbox').textContent = `${fmtMm(s.x)} × ${fmtMm(s.y)} × ${fmtMm(s.z)} mm`;
    }
    const warn = $('info-warn');
    warn.hidden = visibleTris <= TRIANGLE_TARGET;
    warn.textContent = `Achtung: ${fmtInt(visibleTris)} Dreiecke liegen über dem Zielwert von ${fmtInt(TRIANGLE_TARGET)}. Auf der Quest kann das ruckeln – mit dem Konverter verkleinern.`;
  }

  clearModelInfo() {
    for (const id of ['info-name', 'info-size', 'info-unit', 'info-tris', 'info-bbox']) $(id).textContent = '–';
    $('info-warn').hidden = true;
    $('hint').hidden = false;
  }
}

function hasFiles(e) {
  return e.dataTransfer && [...e.dataTransfer.types].includes('Files');
}
