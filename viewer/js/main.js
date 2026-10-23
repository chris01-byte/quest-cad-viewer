import { Viewer } from './viewer.js';
import { UI } from './ui.js';
import { loadFiles, LoadError } from './loaders.js';

const viewer = new Viewer(document.getElementById('view'));

const ui = new UI({
  async onFiles(files) {
    ui.clearToast();
    ui.toast(`Lade ${files.map((f) => f.name).join(', ')} …`, 'info');
    await new Promise((resolve) => setTimeout(resolve, 30)); // let the message paint before parsing blocks the thread
    try {
      const model = await loadFiles(files);
      viewer.setModel(model);
      ui.setGrid(viewer.gridCell);
      ui.showModel(model, files);
      ui.clearToast();
    } catch (e) {
      console.warn(e);
      ui.toast(e instanceof LoadError ? e.message : `Unerwarteter Fehler beim Laden: ${e?.message || e}`);
    }
  },
});

ui.setGrid(viewer.gridCell);

// Test hook for headless tests (tests/), not used by the app itself.
window.cadViewer = { viewer, ui, get model() { return viewer.model; } };
