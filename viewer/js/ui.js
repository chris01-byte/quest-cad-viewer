import { Vector3 } from 'three';
import { TRIANGLE_TARGET } from './config.js';
import { fmtBytes, fmtInt, fmtMm } from './format.js';

const $ = (id) => document.getElementById(id);
const FILTER_FROM = 12; // show the filter field for lists longer than this

/** DOM glue: file selection (dialog + drag & drop), status messages and the info panel. */
export class UI {
  /** @param {Object} handlers callbacks into the app, see the assignments below */
  constructor({ onFiles, onPartVisible, onMeasureToggle, onMeasureClear, onMeasureRemove, onOnlyVertices }) {
    this.onFiles = onFiles;
    this.onPartVisible = onPartVisible;
    this.onMeasureRemove = onMeasureRemove;
    $('btn-measure').addEventListener('click', onMeasureToggle);
    $('btn-measure-clear').addEventListener('click', onMeasureClear);
    $('chk-vertices').addEventListener('change', (e) => onOnlyVertices(e.target.checked));
    this.toastTimer = null;

    const input = $('file-input');
    for (const id of ['btn-open', 'btn-open-hint']) $(id).addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (input.files.length) this.onFiles([...input.files]);
      input.value = ''; // allow re-opening the same file
    });

    $('btn-parts-all').addEventListener('click', () => this.#setAllParts(true));
    $('btn-parts-none').addEventListener('click', () => this.#setAllParts(false));
    $('parts-filter').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      for (const li of $('part-list').children) li.hidden = q !== '' && !li.dataset.name.includes(q);
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
    $('sec-measure').hidden = false;
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

  /** Measure section: mode button, status line and the list of finished measurements. */
  renderMeasure(tool) {
    const button = $('btn-measure');
    button.classList.toggle('active', tool.active);
    button.setAttribute('aria-pressed', String(tool.active));
    $('measure-status').textContent = tool.status;
    $('btn-measure-clear').disabled = tool.measurements.length === 0;
    $('measure-count').textContent = tool.measurements.length ? `(${tool.measurements.length})` : '';

    const list = $('measure-list');
    list.replaceChildren();
    tool.measurements.forEach((m, i) => {
      const li = document.createElement('li');
      li.dataset.id = m.id;
      const idx = el('span', 'idx', String(i + 1));
      const val = el('span', 'val', `${fmtMm(m.distance)} mm`);
      const del = el('button', 'del', '✕');
      del.type = 'button';
      del.title = `Messung ${i + 1} löschen`;
      del.setAttribute('aria-label', del.title);
      del.addEventListener('click', () => this.onMeasureRemove(m.id));
      const delta = el('span', 'delta', `Δ ${fmtMm(m.delta.x)} · ${fmtMm(m.delta.y)} · ${fmtMm(m.delta.z)}`);
      li.append(idx, val, del, delta);
      if (!m.snapA || !m.snapB) li.append(el('span', 'flag', 'Flächenpunkt, nicht eingerastet'));
      list.append(li);
    });
  }

  /** Build the part list for a model. Toggling calls onPartVisible; the list stays in sync with `visible`. */
  showParts(model) {
    const list = $('part-list');
    list.replaceChildren();
    $('sec-parts').hidden = false;
    $('parts-count').textContent = `(${model.parts.length})`;
    $('parts-filter').hidden = model.parts.length <= FILTER_FROM;
    $('parts-filter').value = '';
    for (const part of model.parts) {
      const li = document.createElement('li');
      li.dataset.name = part.name.toLowerCase();
      li.dataset.id = part.id;
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = part.object.visible;
      box.addEventListener('change', () => this.onPartVisible([part.id], box.checked));
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = part.name;
      name.title = part.name;
      const tris = document.createElement('span');
      tris.className = 'tris';
      tris.textContent = fmtInt(part.triangles);
      label.append(box, name, tris);
      li.append(label);
      list.append(li);
      li.classList.toggle('off', !box.checked);
    }
    this.partModel = model;
  }

  /** Reflect the model's visibility flags in the checkboxes (after bulk changes). */
  syncParts(model) {
    for (const li of $('part-list').children) {
      const visible = model.parts[Number(li.dataset.id)].object.visible;
      li.querySelector('input').checked = visible;
      li.classList.toggle('off', !visible);
    }
  }

  #setAllParts(visible) {
    if (!this.partModel) return;
    // respect the filter: only touch rows that are currently shown
    const ids = [...$('part-list').children].filter((li) => !li.hidden).map((li) => Number(li.dataset.id));
    this.onPartVisible(ids, visible);
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function hasFiles(e) {
  return e.dataTransfer && [...e.dataTransfer.types].includes('Files');
}
