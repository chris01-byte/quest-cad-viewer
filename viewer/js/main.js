import { Viewer } from './viewer.js';
import { UI } from './ui.js';
import { loadFiles, LoadError } from './loaders.js';
import { MeasureTool } from './measure.js';

const viewer = new Viewer(document.getElementById('view'));

const measure = new MeasureTool(viewer, {
  onChange: () => ui.renderMeasure(measure),
  onHint: (text) => ui.toast(text, 'warn'),
});

const ui = new UI({
  onMeasureToggle: () => toggleMeasure(),
  onMeasureClear: () => measure.clear(),
  onMeasureRemove: (id) => measure.remove(id),
  onOnlyVertices: (value) => measure.setOnlyVertices(value),
  onPartVisible(ids, visible) {
    const model = viewer.model;
    if (!model) return;
    for (const id of ids) model.setPartVisible(id, visible);
    ui.syncParts(model);
    ui.updateModelInfo(model);
    viewer.requestRender();
  },
  async onFiles(files) {
    ui.clearToast();
    ui.toast(`Lade ${files.map((f) => f.name).join(', ')} …`, 'info');
    await new Promise((resolve) => setTimeout(resolve, 30)); // let the message paint before parsing blocks the thread
    try {
      const model = await loadFiles(files);
      viewer.setModel(model);
      measure.reset();
      ui.setGrid(viewer.gridCell);
      ui.showModel(model, files);
      ui.showParts(model);
      ui.clearToast();
    } catch (e) {
      console.warn(e);
      ui.toast(e instanceof LoadError ? e.message : `Unerwarteter Fehler beim Laden: ${e?.message || e}`);
    }
  },
});

ui.setGrid(viewer.gridCell);

const BVH_NOTICE_FROM = 100_000; // triangles; building the pick structure takes noticeable time above this

async function toggleMeasure() {
  if (measure.active) return measure.setActive(false);
  if (!viewer.model) return;
  const slow = viewer.model.totalTriangles > BVH_NOTICE_FROM;
  if (slow) {
    ui.toast('Messen wird vorbereitet …', 'info');
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  measure.prepare();
  if (slow) ui.clearToast();
  measure.setActive(true);
}

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'm' || e.key === 'M') toggleMeasure();
});

// Test hook for headless tests (tests/), not used by the app itself.
window.cadViewer = { viewer, ui, measure, get model() { return viewer.model; } };
