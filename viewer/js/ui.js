import { SUPPORTED_EXTENSIONS } from './config.js';
import { fmtBytes } from './format.js';

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

  showFileInfo(files) {
    $('info-name').textContent = files.map((f) => f.name).join(', ');
    $('info-size').textContent = fmtBytes(files.reduce((sum, f) => sum + f.size, 0));
    $('hint').hidden = true;
  }
}

function hasFiles(e) {
  return e.dataTransfer && [...e.dataTransfer.types].includes('Files');
}

export function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function isSupported(name) {
  return SUPPORTED_EXTENSIONS.includes(extensionOf(name));
}
