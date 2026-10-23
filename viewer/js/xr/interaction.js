import * as THREE from 'three';
import { GrabGesture, placeOnSurface, setScaleAround } from './gestures.js';
import { XRPanel } from './panel.js';

const XR_SNAP_TAN = 0.03;      // capture radius = 3 % of the distance (about 12 mm at arm's length)
const RAY_LENGTH = 1.2;        // metres, when nothing is hit
const TABLE_HEIGHT = 0.75;     // default surface height for small models
const FLOOR_STANDING_FROM = 0.7; // models taller than this (metres, current scale) stand on the floor
const SIT_DISTANCE = 0.7;      // distance in front of the head when centring
const PANEL_DISTANCE = 0.6;

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * Everything the user does with the controllers: rays, trigger (press buttons, place measuring points,
 * put the model down), grips (grab, rotate, scale) and the floating panel.
 *
 * It only needs Object3Ds that follow the controllers, so it runs the same with real WebXR controllers
 * (xr/session.js) and with simulated ones in the headless tests.
 */
export class XRInteraction {
  /**
   * @param {import('../viewer.js').Viewer} viewer
   * @param {import('../measure.js').MeasureTool} measure
   * @param {{getAppState: () => object, onAction: (id: string) => void}} app
   */
  constructor(viewer, measure, { getAppState, onAction }) {
    this.viewer = viewer;
    this.measure = measure;
    this.getAppState = getAppState;
    this.onAppAction = onAction;
    this.controllers = [];
    this.active = false;
    this.placing = false;
    this.gesture = new GrabGesture(viewer.modelRoot);
    this.panelGrab = null;
    this.lastScaleShown = NaN;

    this.panel = new XRPanel({
      getState: () => ({
        ...this.getAppState(),
        scalePercent: Math.round(viewer.modelRoot.scale.x * 1000) / 10,
        placing: this.placing,
      }),
      onAction: (id) => this.#action(id),
    });

    this.reticle = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 }),
    );
    this.reticle.renderOrder = 1500;
    this.reticle.visible = false;

    viewer.onBeforeRender((frame) => this.update(frame));
  }

  /** Register a controller: `ray` follows the aiming pose, `grip` the hand. Returns its index. */
  addController(ray, grip, handedness = 'none') {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: 0x9cc2ff }),
    );
    line.scale.z = RAY_LENGTH;
    line.visible = false;
    ray.add(line);
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.018, 0.1, 12).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x3a4252, roughness: 0.6 }),
    );
    body.position.z = 0.04;
    grip.add(body);
    // where this controller would put the model down (shown while "Ablegen" is active)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.035, 0.05, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xf5b942, depthTest: false, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    ring.renderOrder = 1500;
    ring.visible = false;
    this.controllers.push({ ray, grip, handedness, line, body, ring, squeezing: false, hitTest: null });
    return this.controllers.length - 1;
  }

  /**
   * Enter XR mode: show the panel in front of the head, put the model 1:1 in front of the user.
   * In a real session there is no head pose before the first XR frame, so the session layer passes
   * `waitForHeadPose` and the placement happens in the first update().
   */
  start({ waitForHeadPose = false } = {}) {
    this.active = true;
    this.viewer.scene.add(this.panel.mesh, this.reticle, ...this.controllers.map((c) => c.ring));
    for (const c of this.controllers) c.line.visible = true;
    this.viewer.modelRoot.scale.setScalar(1);
    this.panel.invalidate();
    if (waitForHeadPose) this.placementPending = true;
    else this.#placeInFrontOfUser();
  }

  #placeInFrontOfUser() {
    this.placementPending = false;
    this.center();
    this.#placePanel();
  }

  stop() {
    this.active = false;
    this.placing = false;
    this.placementPending = false;
    this.gesture.release();
    this.panelGrab = null;
    this.viewer.scene.remove(this.panel.mesh, this.reticle, ...this.controllers.map((c) => c.ring));
    this.reticle.visible = false;
    for (const c of this.controllers) {
      c.line.visible = false;
      c.ring.visible = false;
    }
    this.measure.setHover(null);
  }

  // ------------------------------------------------------------------ model placement

  /** Stand the model on the floor or on table height, 0.7 m in front of the head, facing the user. */
  center() {
    const { head, forward } = this.#head();
    const root = this.viewer.modelRoot;
    const box = this.viewer.model.visibleBox();
    const height = (box.max.y - box.min.y) * root.scale.x;
    const surface = new THREE.Vector3(head.x + forward.x * SIT_DISTANCE, height > FLOOR_STANDING_FROM ? 0 : TABLE_HEIGHT, head.z + forward.z * SIT_DISTANCE);
    root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-forward.x, -forward.z));
    placeOnSurface(root, box, surface);
    this.viewer.requestRender();
  }

  scaleToOneToOne() {
    const root = this.viewer.modelRoot;
    const box = this.viewer.model.visibleBox();
    const pivot = box.getCenter(new THREE.Vector3()).applyMatrix4(root.matrix);
    setScaleAround(root, 1, pivot);
    this.viewer.requestRender();
  }

  #head() {
    const cam = this.viewer.activeCamera();
    const head = cam.getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(_q));
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    return { head, forward: forward.normalize() };
  }

  #placePanel() {
    const { head, forward } = this.#head();
    const left = new THREE.Vector3(forward.z, 0, -forward.x); // forward rotated 90° to the left (y up)
    const m = this.panel.mesh;
    m.position.copy(head).addScaledVector(forward, PANEL_DISTANCE).addScaledVector(left, 0.28);
    m.position.y = head.y - 0.1;
    m.lookAt(head.x, m.position.y, head.z);
    m.updateMatrixWorld(true);
  }

  // ------------------------------------------------------------------ input

  #rayOf(c) {
    c.ray.updateMatrixWorld(true);
    return {
      origin: c.ray.getWorldPosition(new THREE.Vector3()),
      direction: new THREE.Vector3(0, 0, -1).applyQuaternion(c.ray.getWorldQuaternion(_q)).normalize(),
    };
  }

  /** Trigger pressed on controller `index`. */
  select(index) {
    const c = this.controllers[index];
    if (!c || !this.active) return;
    const { origin, direction } = this.#rayOf(c);
    const onPanel = this.panel.pick(origin, direction);
    if (onPanel) {
      this.panel.press(onPanel.id);
      return;
    }
    if (this.placing) {
      this.#putDown(c);
      return;
    }
    if (this.measure.active) {
      this.measure.place(this.measure.pickRay(origin, direction, { snapTan: XR_SNAP_TAN }));
      this.panel.invalidate();
    }
  }

  /** Grip pressed / released on controller `index`. Gripping the panel moves the panel instead of the model. */
  squeeze(index, pressed) {
    const c = this.controllers[index];
    if (!c || !this.active) return;
    if (!pressed) {
      c.squeezing = false;
      if (this.panelGrab?.index === index) this.panelGrab = null;
      return;
    }
    const { origin, direction } = this.#rayOf(c);
    if (this.panel.pick(origin, direction)) {
      c.grip.updateMatrixWorld(true);
      this.panelGrab = { index, offset: c.grip.matrixWorld.clone().invert().multiply(this.panel.mesh.matrixWorld) };
      return;
    }
    c.squeezing = true;
  }

  #action(id) {
    if (id === 'scale1') this.scaleToOneToOne();
    else if (id === 'center') this.center();
    else if (id === 'place') this.placing = !this.placing;
    else this.onAppAction(id);
    this.panel.invalidate();
  }

  #putDown(c) {
    c.grip.updateMatrixWorld(true);
    const surface = c.hitTest ?? c.grip.getWorldPosition(new THREE.Vector3());
    placeOnSurface(this.viewer.modelRoot, this.viewer.model.visibleBox(), surface);
    this.placing = false;
    this.panel.invalidate();
    this.viewer.requestRender();
  }

  // ------------------------------------------------------------------ per frame

  update(frame) {
    if (!this.active) return;
    this.onFrame?.(frame); // the XR session layer feeds hit-test results here
    if (this.placementPending && frame) this.#placeInFrontOfUser(); // first XR frame: the head pose is known now
    const root = this.viewer.modelRoot;

    if (this.panelGrab) {
      const c = this.controllers[this.panelGrab.index];
      c.grip.updateMatrixWorld(true);
      const m = c.grip.matrixWorld.clone().multiply(this.panelGrab.offset);
      m.decompose(this.panel.mesh.position, this.panel.mesh.quaternion, this.panel.mesh.scale);
      this.panel.mesh.updateMatrixWorld(true);
    } else {
      const hands = this.controllers.map((c, i) => {
        c.grip.updateMatrixWorld(true);
        return { id: String(i), pressed: c.squeezing, matrix: c.grip.matrixWorld };
      });
      this.gesture.update(hands);
    }
    root.updateMatrixWorld(true);

    const scale = Math.round(root.scale.x * 1000) / 10;
    if (scale !== this.lastScaleShown) {
      this.lastScaleShown = scale;
      this.panel.invalidate();
    }

    let panelHover = null;
    let hoverHit = null;
    this.reticle.visible = false;

    for (const c of this.controllers) {
      c.ring.visible = false;
      const { origin, direction } = this.#rayOf(c);
      let length = RAY_LENGTH;
      const onPanel = this.panel.pick(origin, direction);
      if (onPanel) {
        if (onPanel.id) panelHover = panelHover ?? onPanel.id;
        length = onPanel.distance;
        this.#showReticle(onPanel.point, length);
      } else if (this.placing) {
        c.ring.position.copy(c.hitTest ?? c.grip.getWorldPosition(_o));
        c.ring.visible = true;
      } else if (this.measure.active && !this.gesture.holding) {
        const hit = this.measure.pickRay(origin, direction, { snapTan: XR_SNAP_TAN });
        if (hit) {
          length = hit.distance;
          if (!hoverHit || hit.distance < hoverHit.distance) hoverHit = hit; // the hand that aims at the model shows the marker
        }
      }
      c.line.scale.z = Math.min(length, RAY_LENGTH * 2);
    }

    this.panel.setHover(panelHover);
    this.measure.setHover(hoverHit);
    this.panel.refresh();
  }

  #showReticle(point, distance) {
    this.reticle.position.copy(point);
    this.reticle.scale.setScalar(0.006 * Math.max(distance, 0.3) * 0.7);
    this.reticle.visible = true;
  }
}
