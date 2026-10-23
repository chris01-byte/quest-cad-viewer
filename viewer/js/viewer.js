import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BACKGROUND = 0x1b2028;

/**
 * Owns renderer, scene, camera and the model container.
 *
 * Scene graph:  scene > modelRoot (user transform: move / rotate / scale) > model.root (content)
 * modelRoot.scale === 1 means 1:1.
 */
export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(BACKGROUND, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 50);
    this.camera.position.set(0.4, 0.3, 0.6);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false; // render on demand, no continuous loop needed
    this.controls.addEventListener('change', () => this.requestRender());

    this.modelRoot = new THREE.Group();
    this.modelRoot.name = 'modelRoot';
    this.scene.add(this.modelRoot);

    this.model = null;
    this.gridCell = 0.1;
    this.#addLights();
    this.#buildGrid(0.1, 10);

    this.listeners = new Set(); // called after every rendered frame request, e.g. to update overlays
    this.renderRequested = true;
    this.renderer.setAnimationLoop(() => this.#tick());
    new ResizeObserver(() => this.#resize()).observe(canvas);
    this.#resize();
  }

  /** Register a callback that runs right before each rendered frame. */
  onBeforeRender(fn) {
    this.listeners.add(fn);
  }

  requestRender() {
    this.renderRequested = true;
  }

  #tick() {
    if (!this.renderRequested && !this.renderer.xr.isPresenting) return;
    this.renderRequested = false;
    for (const fn of this.listeners) fn();
    this.renderer.render(this.scene, this.camera);
  }

  #resize() {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  #addLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x404858, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(2, 4, 3);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xbfd2ff, 0.8);
    fill.position.set(-3, 1.5, -2);
    this.scene.add(fill);
  }

  /** Grid on the floor (y = 0). `cell` and half-extent in metres. */
  #buildGrid(cell, halfCells) {
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      this.grid.material.dispose();
    }
    const size = cell * halfCells * 2;
    this.grid = new THREE.GridHelper(size, halfCells * 2, 0x6b7a90, 0x3a4453);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.75;
    this.grid.material.depthWrite = false;
    this.scene.add(this.grid);
    this.gridCell = cell;
  }

  /** Largest 1-2-5 step that gives at least ~5 cells across the model. */
  static niceCell(extent) {
    const target = Math.max(extent, 0.01) / 5;
    const decade = 10 ** Math.floor(Math.log10(target));
    for (const m of [5, 2, 1]) if (m * decade <= target) return m * decade;
    return decade;
  }

  /** Replace the displayed model (a Model from model.js) or clear it with null. */
  setModel(model) {
    if (this.model) {
      this.modelRoot.remove(this.model.root);
      this.model.dispose();
    }
    this.model = model;
    this.modelRoot.scale.setScalar(1);
    this.modelRoot.position.set(0, 0, 0);
    this.modelRoot.quaternion.identity();
    if (model) {
      this.modelRoot.add(model.root);
      this.frameModel();
    } else {
      this.#buildGrid(0.1, 10);
      this.resetCamera();
    }
    this.requestRender();
  }

  /** Fit camera and grid to the current model. */
  frameModel() {
    if (!this.model) return;
    const box = this.model.visibleBox();
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const extent = Math.max(size.x, size.y, size.z, 0.001);

    const cell = Viewer.niceCell(extent);
    this.#buildGrid(cell, Math.max(10, Math.ceil((extent * 1.6) / cell / 2)));

    const radius = size.length() / 2;
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov) / 2)) * 1.15;
    const dir = new THREE.Vector3(0.9, 0.6, 1.1).normalize();
    // modelRoot is at the origin with scale 1 after setModel, so model space equals world space here
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.near = Math.max(dist / 500, 0.0005);
    this.camera.far = dist * 200;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.requestRender();
  }

  resetCamera() {
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(0.4, 0.3, 0.6);
    this.camera.near = 0.01;
    this.camera.far = 50;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
}
