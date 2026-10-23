import * as THREE from 'three';

const W = 640;   // canvas px
const H = 960;
const WORLD_W = 0.4; // metres
const WORLD_H = 0.6;
const PARTS_PER_PAGE = 4;
const MEASUREMENTS_SHOWN = 4;

const COLOR = {
  bg: 'rgba(24, 29, 37, 0.94)', border: '#2c3542', text: '#e4e9f0', muted: '#8d99aa',
  button: '#2a3341', hover: '#3e4c63', active: '#3d8bfd', danger: '#7a2f38', warn: '#f5b942',
};

/**
 * Floating control panel for XR, drawn into a canvas. Everything the desktop sidebar can do
 * (hide parts, measure, 1:1) is reachable here with the controller ray, because file dialogs
 * and DOM widgets do not exist inside an immersive session.
 *
 * `getState()` returns { modelName, scalePercent, measureActive, onlyVertices, placing,
 * measurements: [{id, text}], parts: [{id, name, visible}] }; `onAction(id)` receives button ids
 * ('scale1', 'center', 'place', 'measure', 'clear', 'vertices', 'exit', 'part:<id>', 'del:<id>').
 */
export class XRPanel {
  constructor({ getState, onAction }) {
    this.getState = getState;
    this.onAction = onAction;
    this.page = 0;
    this.hoverId = null;
    this.buttons = [];
    this.dirty = true;

    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_W, WORLD_H),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, toneMapped: false }),
    );
    this.mesh.name = 'xr-panel';
    this.mesh.renderOrder = 2000;
  }

  invalidate() {
    this.dirty = true;
  }

  setHover(id) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.dirty = true;
  }

  /** Redraw when something changed. Call once per frame. */
  refresh() {
    if (!this.dirty) return;
    this.dirty = false;
    this.#draw(this.getState());
    this.texture.needsUpdate = true;
  }

  /**
   * Ray against the panel plane. Returns null when the ray misses the panel, otherwise
   * { id (button or null), distance, point (world) }.
   */
  pick(origin, direction) {
    this.mesh.updateMatrixWorld();
    const inv = new THREE.Matrix4().copy(this.mesh.matrixWorld).invert();
    const o = origin.clone().applyMatrix4(inv);
    const d = origin.clone().add(direction).applyMatrix4(inv).sub(o);
    if (Math.abs(d.z) < 1e-9) return null;
    const t = -o.z / d.z;
    if (t <= 0) return null;
    const x = o.x + d.x * t;
    const y = o.y + d.y * t;
    if (Math.abs(x) > WORLD_W / 2 || Math.abs(y) > WORLD_H / 2) return null;
    const px = ((x + WORLD_W / 2) / WORLD_W) * W;
    const py = ((WORLD_H / 2 - y) / WORLD_H) * H;
    const button = this.buttons.find((b) => !b.disabled && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
    return { id: button ? button.id : null, distance: t, point: origin.clone().addScaledVector(direction, t) };
  }

  /** Trigger pressed on a button id (paging is handled here, everything else goes to the app). */
  press(id) {
    if (!id) return;
    if (id === 'parts:prev') this.page = Math.max(0, this.page - 1);
    else if (id === 'parts:next') this.page += 1;
    else this.onAction(id);
    this.dirty = true;
  }

  /** Centre of a button in world space (for tests and for pointing hints). */
  buttonCentre(id) {
    const b = this.buttons.find((x) => x.id === id);
    if (!b) return null;
    this.mesh.updateMatrixWorld();
    const local = new THREE.Vector3(((b.x + b.w / 2) / W - 0.5) * WORLD_W, (0.5 - (b.y + b.h / 2) / H) * WORLD_H, 0);
    return local.applyMatrix4(this.mesh.matrixWorld);
  }

  dispose() {
    this.texture.dispose();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }

  // ------------------------------------------------------------------ drawing

  #draw(state) {
    const ctx = this.canvas.getContext('2d');
    this.buttons = [];
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COLOR.bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 36);
    ctx.fill();
    ctx.strokeStyle = COLOR.border;
    ctx.lineWidth = 4;
    ctx.stroke();

    this.#text(ctx, 'Quest CAD Viewer', 28, 52, { size: 36, weight: 700 });
    this.#text(ctx, state.modelName || '', 28, 84, { size: 24, color: COLOR.muted, maxWidth: W - 56 });

    const col = (i) => 28 + i * 196;
    this.#button(ctx, 'scale1', '1:1', col(0), 100, 184, 80, { active: Math.abs(state.scalePercent - 100) < 0.05 });
    this.#button(ctx, 'center', 'Zentrieren', col(1), 100, 184, 80, { size: 26 });
    this.#button(ctx, 'place', state.placing ? 'Ablegen …' : 'Ablegen', col(2), 100, 184, 80, { active: state.placing, size: 26 });
    const scaleText = `Maßstab ${state.scalePercent.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
    this.#text(ctx, state.placing ? 'Controller auf den Tisch, Abzug drücken' : scaleText, 28, 212, {
      size: 24, color: state.placing ? COLOR.warn : COLOR.muted, maxWidth: W - 56,
    });

    this.#button(ctx, 'measure', state.measureActive ? 'Messen: an' : 'Messen: aus', col(0), 236, 184, 80, { active: state.measureActive, size: 24 });
    this.#button(ctx, 'clear', 'Alle löschen', col(1), 236, 184, 80, { disabled: state.measurements.length === 0, size: 24 });
    this.#button(ctx, 'vertices', state.onlyVertices ? '✓ Nur Ecken' : 'Nur Ecken', col(2), 236, 184, 80, { active: state.onlyVertices, size: 24 });

    // measurements: the most recent ones
    const shown = state.measurements.slice(-MEASUREMENTS_SHOWN);
    const hidden = state.measurements.length - shown.length;
    this.#text(ctx, `Messungen (${state.measurements.length})${hidden ? `, ältere ${hidden} ausgeblendet` : ''}`, 28, 350, { size: 24, color: COLOR.muted });
    shown.forEach((m, i) => {
      const y = 366 + i * 52;
      this.#text(ctx, m.text, 40, y + 34, { size: 30, weight: 600, maxWidth: 440 });
      this.#button(ctx, `del:${m.id}`, '✕', W - 28 - 72, y + 2, 72, 44, { danger: true, size: 26 });
    });
    if (state.measureActive) {
      this.#text(ctx, state.pending ? 'Zweiten Punkt wählen' : 'Ersten Punkt wählen', 28, 588, { size: 24, color: COLOR.warn });
    }

    // parts, paged
    const pages = Math.max(1, Math.ceil(state.parts.length / PARTS_PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    this.#text(ctx, `Teile (${state.parts.length})`, 28, 628, { size: 24, color: COLOR.muted });
    if (pages > 1) {
      this.#text(ctx, `${this.page + 1}/${pages}`, W - 28 - 150 - 8 - 60, 628, { size: 24, color: COLOR.muted, align: 'right', width: 60 });
      this.#button(ctx, 'parts:prev', '▲', W - 28 - 150, 604, 72, 36, { disabled: this.page === 0, size: 22 });
      this.#button(ctx, 'parts:next', '▼', W - 28 - 72, 604, 72, 36, { disabled: this.page >= pages - 1, size: 22 });
    }
    state.parts.slice(this.page * PARTS_PER_PAGE, (this.page + 1) * PARTS_PER_PAGE).forEach((p, i) => {
      const y = 646 + i * 48;
      this.#button(ctx, `part:${p.id}`, `${p.visible ? '☑' : '☐'}  ${p.name}`, 28, y, W - 56, 44, { align: 'left', size: 26, dim: !p.visible });
    });

    this.#button(ctx, 'exit', 'XR beenden', 28, 860, W - 56, 56, { danger: true, size: 28 });
    this.#text(ctx, 'Dateien lassen sich nur vor dem Start im Browser öffnen', 28, 944, { size: 20, color: COLOR.muted, maxWidth: W - 56 });
  }

  #button(ctx, id, label, x, y, w, h, { active = false, disabled = false, danger = false, dim = false, size = 30, align = 'center' } = {}) {
    this.buttons.push({ id, x, y, w, h, disabled });
    const hover = this.hoverId === id && !disabled;
    ctx.fillStyle = disabled ? '#1f2630' : active ? COLOR.active : danger ? (hover ? '#a03a46' : COLOR.danger) : hover ? COLOR.hover : COLOR.button;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.fill();
    if (hover) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.fillStyle = disabled || dim ? COLOR.muted : '#ffffff';
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = align;
    const tx = align === 'left' ? x + 16 : x + w / 2;
    ctx.fillText(this.#fit(ctx, label, w - 24), tx, y + h / 2 + 1);
  }

  #text(ctx, text, x, y, { size = 28, weight = 400, color = COLOR.text, maxWidth = W, align = 'left', width = 0 } = {}) {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px system-ui, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = align;
    ctx.fillText(this.#fit(ctx, text, maxWidth), align === 'right' ? x + width : x, y);
  }

  /** Shorten with an ellipsis so the text fits `maxWidth` (the canvas font must already be set). */
  #fit(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
    return `${s}…`;
  }
}
