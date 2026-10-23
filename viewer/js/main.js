import { Viewer } from './viewer.js';
import { UI, isSupported, extensionOf } from './ui.js';

const viewer = new Viewer(document.getElementById('view'));

const ui = new UI({
  onFiles(files) {
    ui.clearToast();
    const bad = files.filter((f) => !isSupported(f.name));
    if (bad.length) {
      const exts = [...new Set(bad.map((f) => (extensionOf(f.name) ? `„.${extensionOf(f.name)}“` : 'ohne Endung')))];
      ui.toast(`Dateityp ${exts.join(', ')} wird nicht unterstützt. Bitte STL, OBJ oder GLB öffnen (${bad.map((f) => f.name).join(', ')}).`);
      return;
    }
    ui.showFileInfo(files);
    ui.toast('Loader folgt im nächsten Schritt.', 'info');
  },
});

ui.setGrid(viewer.gridCell);

// Test hook for headless tests (tests/), not used by the app itself.
window.cadViewer = { viewer, ui };
