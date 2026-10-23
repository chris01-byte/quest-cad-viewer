import * as THREE from 'three';
import { MeshBVH } from './bvh.js';
import { fmtMm } from './format.js';

const COLOR_SNAP = 0x3ddc84; // snapped to a vertex
const COLOR_FREE = 0xffb020; // free surface point (less exact)
const COLOR_LINE = 0xffd54a;
const COLOR_HOVER = 0xffffff;

const SNAP_PX = 14;          // desktop: capture radius around the cursor
const TOLERANCE_PX = [5, 10]; // desktop: extra rays on these rings when the centre ray misses the silhouette
const MARKER_K = 0.006;      // sizes as a fraction of the camera distance, so they look the same at any scale
const LINE_K = 0.0014;
const LABEL_K = 0.035;

const sphereGeometry = new THREE.SphereGeometry(1, 16, 12);
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
const overlayMaterial = (color, extra = {}) =>
  new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, ...extra });
const MATERIALS = {
  snap: overlayMaterial(COLOR_SNAP),
  free: overlayMaterial(COLOR_FREE),
  line: overlayMaterial(COLOR_LINE, { opacity: 0.9 }),
  hover: overlayMaterial(COLOR_HOVER, { opacity: 0.8 }),
};
const OVERLAY_ORDER = 1000; // draw after the model, on top of it

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

/** One dimension: two markers, a line and a distance label. Positions are in modelRoot space. */
class Dimension extends THREE.Group {
  constructor() {
    super();
    this.a = this.#overlay(new THREE.Mesh(sphereGeometry, MATERIALS.snap));
    this.b = this.#overlay(new THREE.Mesh(sphereGeometry, MATERIALS.snap));
    this.line = this.#overlay(new THREE.Mesh(cylinderGeometry, MATERIALS.line));
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 80;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.label = this.#overlay(new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.texture, depthTest: false, depthWrite: false, transparent: true,
    })));
    this.label.renderOrder = OVERLAY_ORDER + 1;
    this.add(this.line, this.a, this.b, this.label);
    this.pa = new THREE.Vector3();
    this.pb = new THREE.Vector3();
    this.text = '';
  }

  #overlay(obj) {
    obj.renderOrder = OVERLAY_ORDER;
    obj.frustumCulled = false;
    return obj;
  }

  set(pa, pb, snapA, snapB) {
    this.pa.copy(pa);
    this.pb.copy(pb);
    this.a.material = snapA ? MATERIALS.snap : MATERIALS.free;
    this.b.material = snapB ? MATERIALS.snap : MATERIALS.free;
  }

  setText(text) {
    this.label.visible = text !== '';
    if (text === this.text) return;
    this.text = text;
    const ctx = this.canvas.getContext('2d');
    const { width: w, height: h } = this.canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(16, 20, 26, 0.88)';
    ctx.beginPath();
    ctx.roundRect(2, 2, w - 4, h - 4, 18);
    ctx.fill();
    ctx.strokeStyle = '#ffd54a';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
    this.texture.needsUpdate = true;
  }

  /** Re-size for the viewer position (all in modelRoot space) and orient the line. */
  update(camLocal, upLocal) {
    this.a.scale.setScalar(MARKER_K * camLocal.distanceTo(this.pa));
    this.b.scale.setScalar(MARKER_K * camLocal.distanceTo(this.pb));
    this.a.position.copy(this.pa);
    this.b.position.copy(this.pb);

    _v.subVectors(this.pb, this.pa);
    const length = _v.length();
    const mid = _w.addVectors(this.pa, this.pb).multiplyScalar(0.5);
    const dist = camLocal.distanceTo(mid);
    this.line.visible = length > 1e-9;
    this.line.position.copy(mid);
    this.line.quaternion.copy(_q.setFromUnitVectors(_up, length > 1e-9 ? _v.divideScalar(length) : _up));
    const r = LINE_K * dist;
    this.line.scale.set(r, length, r);

    const h = LABEL_K * dist;
    this.label.scale.set(h * 4, h, 1);
    this.label.position.copy(mid).addScaledVector(upLocal, h * 0.9);
  }

  dispose() {
    this.texture.dispose();
    this.label.material.dispose();
  }
}

function isVisible(obj) {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/**
 * Point-to-point measuring with vertex snapping. Works with rays (origin + direction in world space),
 * so mouse and XR controller use the same picking. Points live in modelRoot space: they stay attached
 * to the model and the displayed length is the model's true length, whatever the XR scale is.
 */
export class MeasureTool {
  /**
   * @param {import('./viewer.js').Viewer} viewer
   * @param {{onChange: () => void, onHint: (text: string) => void}} handlers
   */
  constructor(viewer, { onChange, onHint }) {
    this.viewer = viewer;
    this.onChange = onChange;
    this.onHint = onHint;
    this.active = false;
    this.onlyVertices = false;
    this.measurements = [];
    this.lastId = 0;
    this.pending = null; // { point: Vector3 (modelRoot space), snapped }
    this.hover = null;

    this.bvhs = new WeakMap();
    this.meshes = null;
    this.raycaster = new THREE.Raycaster();

    this.group = new THREE.Group();
    this.group.name = 'measurements';
    viewer.modelRoot.add(this.group);
    this.preview = new Dimension();
    this.preview.visible = false;
    this.hoverMarker = new THREE.Mesh(sphereGeometry, MATERIALS.hover);
    this.hoverMarker.renderOrder = OVERLAY_ORDER;
    this.hoverMarker.visible = false;
    this.hoverMarker.frustumCulled = false;
    this.group.add(this.preview, this.hoverMarker);

    viewer.onBeforeRender(() => this.#updateViews());
    this.#bindPointer();
    this.#bindKeys();
  }

  get status() {
    if (!this.active) return '';
    return this.pending ? 'Zweiten Punkt wählen (Esc bricht ab).' : 'Ersten Punkt wählen.';
  }

  setActive(active) {
    this.active = active;
    this.viewer.canvas.style.cursor = active ? 'crosshair' : '';
    if (!active) this.cancelPending();
    this.#clearHover();
    this.onChange();
  }

  setOnlyVertices(value) {
    this.onlyVertices = value;
    this.onChange();
  }

  /** Build the acceleration structures for the current model now (they are otherwise built on first use). */
  prepare() {
    for (const mesh of this.#collectMeshes()) this.#bvh(mesh);
  }

  /** The model was replaced: drop everything that belonged to the old one. */
  reset() {
    this.clear();
    this.cancelPending();
    this.meshes = null;
    this.#clearHover();
  }

  clear() {
    for (const m of this.measurements) this.#disposeMeasurement(m);
    this.measurements = [];
    this.onChange();
    this.viewer.requestRender();
  }

  remove(id) {
    const i = this.measurements.findIndex((m) => m.id === id);
    if (i < 0) return;
    this.#disposeMeasurement(this.measurements[i]);
    this.measurements.splice(i, 1);
    this.onChange();
    this.viewer.requestRender();
  }

  cancelPending() {
    if (!this.pending) return;
    this.pending = null;
    this.preview.visible = false;
    this.onChange();
    this.viewer.requestRender();
  }

  // ------------------------------------------------------------------ picking

  /**
   * Closest surface hit along a world-space ray, snapped to the nearest vertex of the hit triangle
   * if that vertex is within `snapTan * distance` of the ray `snapRay` (default: the ray itself).
   * @returns {{point: THREE.Vector3, snapped: boolean, distance: number} | null} point in modelRoot space
   */
  pickRay(origin, direction, { snapTan, snapRay = { origin, direction } }) {
    this.viewer.modelRoot.updateMatrixWorld(true);
    const raw = this.#cast(origin, direction);
    return raw && this.#snap(raw, origin, direction, snapTan, snapRay);
  }

  /** Desktop picking at a client position, with a capture radius in pixels and silhouette tolerance. */
  pickScreen(clientX, clientY) {
    const { camera, canvas } = this.viewer;
    const rect = canvas.getBoundingClientRect();
    const rayAt = (dx, dy) => {
      this.raycaster.setFromCamera(new THREE.Vector2(
        ((clientX + dx - rect.left) / rect.width) * 2 - 1,
        -((clientY + dy - rect.top) / rect.height) * 2 + 1), camera);
      return { origin: this.raycaster.ray.origin.clone(), direction: this.raycaster.ray.direction.clone() };
    };
    const centre = rayAt(0, 0);
    const snapTan = (SNAP_PX * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / rect.height;
    this.viewer.modelRoot.updateMatrixWorld(true);

    let raw = this.#cast(centre.origin, centre.direction);
    for (const radius of raw ? [] : TOLERANCE_PX) {
      for (let k = 0; k < 8 && !raw; k++) {
        const a = (k / 8) * Math.PI * 2;
        const ray = rayAt(Math.cos(a) * radius, Math.sin(a) * radius);
        raw = this.#cast(ray.origin, ray.direction);
      }
    }
    return raw && this.#snap(raw, centre.origin, centre.direction, snapTan, centre);
  }

  #collectMeshes() {
    if (!this.meshes) {
      this.meshes = [];
      this.viewer.model?.root.traverse((o) => {
        if (o.isMesh && o.geometry?.attributes.position) this.meshes.push(o);
      });
    }
    return this.meshes;
  }

  #bvh(mesh) {
    let bvh = this.bvhs.get(mesh.geometry);
    if (!bvh) {
      bvh = new MeshBVH(mesh.geometry);
      this.bvhs.set(mesh.geometry, bvh);
    }
    return bvh;
  }

  #cast(origin, direction) {
    const inverse = new THREE.Matrix4();
    const lo = new THREE.Vector3();
    const ld = new THREE.Vector3();
    let best = null;
    for (const mesh of this.#collectMeshes()) {
      if (!isVisible(mesh)) continue;
      inverse.copy(mesh.matrixWorld).invert();
      lo.copy(origin).applyMatrix4(inverse);
      ld.copy(origin).add(direction).applyMatrix4(inverse).sub(lo); // linear part only, keeps t in world units
      const bvh = this.#bvh(mesh);
      const hit = bvh.raycast(lo.x, lo.y, lo.z, ld.x, ld.y, ld.z, best ? best.t : Infinity);
      if (hit && (!best || hit.t < best.t)) best = { t: hit.t, mesh, bvh, tri: hit.tri };
    }
    return best;
  }

  #snap(raw, origin, direction, snapTan, snapRay) {
    const corners = raw.bvh.triangle(raw.tri);
    const sd = snapRay.direction.clone().normalize();
    let nearest = null;
    let nearestDistance = Infinity;
    for (let k = 0; k < 3; k++) {
      const v = new THREE.Vector3(corners[k * 3], corners[k * 3 + 1], corners[k * 3 + 2]).applyMatrix4(raw.mesh.matrixWorld);
      const perpendicular = _v.subVectors(v, snapRay.origin).cross(sd).length();
      if (perpendicular < nearestDistance) { nearestDistance = perpendicular; nearest = v; }
    }
    const snapped = nearestDistance <= snapTan * raw.t;
    const world = snapped ? nearest : origin.clone().addScaledVector(direction, raw.t);
    return { point: this.viewer.modelRoot.worldToLocal(world), snapped, distance: raw.t };
  }

  // ------------------------------------------------------------------ placing

  /** Place a measuring point at a pick result (from pickRay / pickScreen). Returns the finished measurement or null. */
  place(hit) {
    if (!hit) return null;
    if (this.onlyVertices && !hit.snapped) {
      this.onHint('Kein Eckpunkt in der Nähe. Näher an eine Ecke gehen oder „Nur Eckpunkte“ ausschalten.');
      return null;
    }
    if (!this.pending) {
      this.pending = { point: hit.point.clone(), snapped: hit.snapped };
      this.onChange();
      this.viewer.requestRender();
      return null;
    }
    const a = this.pending;
    this.pending = null;
    this.preview.visible = false;
    return this.#addMeasurement(a, { point: hit.point.clone(), snapped: hit.snapped });
  }

  #addMeasurement(a, b) {
    const delta = new THREE.Vector3().subVectors(b.point, a.point);
    const view = new Dimension();
    view.set(a.point, b.point, a.snapped, b.snapped);
    const m = {
      id: ++this.lastId,
      a: a.point, b: b.point, snapA: a.snapped, snapB: b.snapped,
      delta, distance: delta.length(), distanceMm: delta.length() * 1000,
      view,
    };
    view.setText(`${fmtMm(m.distance)} mm`);
    this.group.add(view);
    this.measurements.push(m);
    this.onChange();
    this.viewer.requestRender();
    return m;
  }

  #disposeMeasurement(m) {
    this.group.remove(m.view);
    m.view.dispose();
  }

  // ------------------------------------------------------------------ hover preview + input

  #setHover(hit) {
    if (!hit) return this.#clearHover();
    this.hover = hit;
    this.viewer.requestRender();
  }

  #clearHover() {
    if (!this.hover) return;
    this.hover = null;
    this.viewer.requestRender();
  }

  /** Show the pending point, the hover marker and the rubber-band line for the current state. */
  #syncPreview() {
    const hover = this.active ? this.hover : null;
    this.hoverMarker.visible = !!hover;
    if (hover) {
      this.hoverMarker.material = hover.snapped ? MATERIALS.snap : MATERIALS.hover;
      this.hoverMarker.position.copy(hover.point);
    }
    this.preview.visible = !!this.pending;
    if (this.pending) {
      const to = hover ? hover.point : this.pending.point;
      this.preview.set(this.pending.point, to, this.pending.snapped, hover ? hover.snapped : this.pending.snapped);
      this.preview.setText(hover ? `${fmtMm(to.distanceTo(this.pending.point))} mm` : '');
    }
  }

  #updateViews() {
    const camera = this.viewer.activeCamera();
    const root = this.viewer.modelRoot;
    root.updateMatrixWorld();
    const camLocal = root.worldToLocal(camera.getWorldPosition(new THREE.Vector3()));
    const upLocal = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(_q))
      .transformDirection(new THREE.Matrix4().copy(root.matrixWorld).invert());
    this.#syncPreview();
    for (const m of this.measurements) m.view.update(camLocal, upLocal);
    if (this.preview.visible) this.preview.update(camLocal, upLocal);
    if (this.hoverMarker.visible) {
      this.hoverMarker.scale.setScalar(MARKER_K * 0.8 * camLocal.distanceTo(this.hoverMarker.position));
    }
  }

  #bindPointer() {
    const canvas = this.viewer.canvas;
    let down = null;
    let hoverQueued = false;
    canvas.addEventListener('pointerdown', (e) => {
      down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!this.active || !down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 5) return; // it was an orbit drag, not a click
      this.place(this.pickScreen(e.clientX, e.clientY));
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.active || e.buttons || hoverQueued) return;
      hoverQueued = true;
      const { clientX, clientY } = e;
      requestAnimationFrame(() => {
        hoverQueued = false;
        if (this.active) this.#setHover(this.pickScreen(clientX, clientY));
      });
    });
    canvas.addEventListener('pointerleave', () => this.#clearHover());
  }

  #bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape' && this.active) {
        if (this.pending) this.cancelPending();
        else this.setActive(false);
      }
    });
  }
}
