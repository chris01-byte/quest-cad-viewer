import { Viewer } from './viewer.js';
import { UI } from './ui.js';
import { loadFiles, LoadError } from './loaders.js';
import { MeasureTool } from './measure.js';
import { XRSessionManager } from './xr/session.js';
import { fmtMm } from './format.js';

const viewer = new Viewer(document.getElementById('view'));

const measure = new MeasureTool(viewer, {
  onChange: () => {
    ui.renderMeasure(measure);
    xr.interaction.panel.invalidate();
  },
  onHint: (text) => ui.toast(text, 'warn'),
});

const BVH_NOTICE_FROM = 100_000; // triangles; building the pick structure takes noticeable time above this

/** Build the picking structure up front, with a visible notice for big models. */
async function prepareMeasuring() {
  const slow = viewer.model.totalTriangles > BVH_NOTICE_FROM;
  if (slow) {
    ui.toast('Messen wird vorbereitet …', 'info');
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  measure.prepare();
  if (slow) ui.clearToast();
}

async function toggleMeasure() {
  if (measure.active) return measure.setActive(false);
  if (!viewer.model) return;
  await prepareMeasuring();
  measure.setActive(true);
}

/** One place for part visibility, used by the sidebar and the XR panel. */
function setPartsVisible(ids, visible) {
  const model = viewer.model;
  if (!model) return;
  for (const id of ids) model.setPartVisible(id, visible);
  ui.syncParts(model);
  ui.updateModelInfo(model);
  xr.interaction.panel.invalidate();
  viewer.requestRender();
}

const xr = new XRSessionManager(viewer, measure, {
  getAppState: () => ({
    modelName: viewer.model?.name ?? '',
    measureActive: measure.active,
    onlyVertices: measure.onlyVertices,
    pending: !!measure.pending,
    measurements: measure.measurements.map((m, i) => ({
      id: m.id,
      text: `${i + 1}  ${fmtMm(m.distance)} mm${m.snapA && m.snapB ? '' : '  (Fläche)'}`,
    })),
    parts: viewer.model ? viewer.model.parts.map((p) => ({ id: p.id, name: p.name, visible: p.object.visible })) : [],
  }),
  onAction(id) {
    if (id === 'measure') toggleMeasure();
    else if (id === 'clear') measure.clear();
    else if (id === 'vertices') measure.setOnlyVertices(!measure.onlyVertices);
    else if (id === 'exit') xr.end();
    else if (id.startsWith('part:')) {
      const part = viewer.model.parts[Number(id.slice(5))];
      setPartsVisible([part.id], !part.object.visible);
    } else if (id.startsWith('del:')) measure.remove(Number(id.slice(4)));
  },
  onChange: () => ui.renderMeasure(measure),
});

const ui = new UI({
  onMeasureToggle: toggleMeasure,
  onMeasureClear: () => measure.clear(),
  onMeasureRemove: (id) => measure.remove(id),
  onOnlyVertices: (value) => measure.setOnlyVertices(value),
  onPartVisible: setPartsVisible,
  onResetView: () => viewer.frameModel(),
  onActualSize: () => viewer.viewActualSize(),
  async onStartXR(kind) {
    if (!viewer.model || xr.presenting) return;
    try {
      await prepareMeasuring(); // not inside the session: it would freeze the headset
      await xr.start(kind);
    } catch (e) {
      console.warn(e);
      ui.toast(`${kind === 'ar' ? 'AR' : 'VR'} konnte nicht gestartet werden: ${e?.message || e}`);
    }
  },
  async onFiles(files) {
    if (xr.presenting) return;
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

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'm' || e.key === 'M') toggleMeasure();
});

ui.setGrid(viewer.gridCell);
xr.detect().then((support) => ui.setXRSupport(support));

// Test hook for headless tests (tests/), not used by the app itself.
window.cadViewer = { viewer, ui, measure, xr, get model() { return viewer.model; } };
