import * as THREE from 'three';
import { XRInteraction } from './interaction.js';

/**
 * Thin layer between the browser's WebXR API and XRInteraction: starts and ends the session,
 * wires the controller events, feeds hit-test results and restores the desktop state afterwards.
 *
 * NOT verified on a headset yet; the interaction logic below it is covered by headless tests with
 * simulated controllers (tests/xr.test.mjs).
 */
export class XRSessionManager {
  /**
   * @param {import('../viewer.js').Viewer} viewer
   * @param {import('../measure.js').MeasureTool} measure
   * @param {{getAppState: () => object, onAction: (id: string) => void, onChange: () => void}} app
   */
  constructor(viewer, measure, { getAppState, onAction, onChange }) {
    this.viewer = viewer;
    this.onChange = onChange;
    this.interaction = new XRInteraction(viewer, measure, { getAppState, onAction });
    this.session = null;
    this.kind = null;
    this.saved = null;
    this.setUpControllers();
  }

  get presenting() {
    return !!this.session;
  }

  /** Which immersive modes this browser offers: { ar, vr }. */
  async detect() {
    const out = { ar: false, vr: false };
    if (!navigator.xr?.isSessionSupported) return out;
    for (const [key, mode] of [['ar', 'immersive-ar'], ['vr', 'immersive-vr']]) {
      try {
        out[key] = await navigator.xr.isSessionSupported(mode);
      } catch {
        out[key] = false;
      }
    }
    return out;
  }

  setUpControllers() {
    const { renderer, scene } = this.viewer;
    for (let i = 0; i < 2; i++) {
      const ray = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      scene.add(ray, grip);
      const index = this.interaction.addController(ray, grip);
      ray.addEventListener('connected', (e) => {
        this.interaction.controllers[index].handedness = e.data.handedness;
        this.#openHitTest(index, e.data);
      });
      ray.addEventListener('disconnected', () => {
        const c = this.interaction.controllers[index];
        c.hitSource?.cancel?.();
        c.hitSource = null;
        c.hitTest = null;
      });
      ray.addEventListener('selectstart', () => this.interaction.select(index));
      ray.addEventListener('squeezestart', () => this.interaction.squeeze(index, true));
      ray.addEventListener('squeezeend', () => this.interaction.squeeze(index, false));
    }
    // hit-test results for "Ablegen": the controller ray against the detected room surfaces
    this.interaction.onFrame = (frame) => {
      const space = this.viewer.renderer.xr.getReferenceSpace();
      for (const c of this.interaction.controllers) {
        c.hitTest = null;
        if (!frame || !c.hitSource || !space) continue;
        const pose = frame.getHitTestResults(c.hitSource)[0]?.getPose(space);
        if (pose) c.hitTest = new THREE.Vector3().copy(pose.transform.position);
      }
    };
  }

  #openHitTest(index, inputSource) {
    const session = this.session;
    if (!session?.requestHitTestSource) return;
    session.requestHitTestSource({ space: inputSource.targetRaySpace })
      .then((source) => { this.interaction.controllers[index].hitSource = source; })
      .catch(() => { /* hit-test not granted: "Ablegen" then uses the controller height */ });
  }

  /** @param {'ar'|'vr'} kind */
  async start(kind) {
    if (this.session) return;
    const mode = kind === 'ar' ? 'immersive-ar' : 'immersive-vr';
    const session = await navigator.xr.requestSession(mode, {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hit-test'],
    });
    const { viewer } = this;
    const root = viewer.modelRoot;
    this.saved = { position: root.position.clone(), quaternion: root.quaternion.clone(), scale: root.scale.clone() };
    this.session = session;
    this.kind = kind;
    session.addEventListener('end', () => this.#cleanup());
    viewer.renderer.xr.setReferenceSpaceType('local-floor');
    await viewer.renderer.xr.setSession(session);
    viewer.setPassthrough(kind === 'ar');
    this.interaction.start({ waitForHeadPose: true });
    this.onChange();
  }

  end() {
    this.session?.end();
  }

  #cleanup() {
    const { viewer } = this;
    this.interaction.stop();
    this.session = null;
    this.kind = null;
    viewer.setPassthrough(false);
    if (this.saved) {
      viewer.modelRoot.position.copy(this.saved.position);
      viewer.modelRoot.quaternion.copy(this.saved.quaternion);
      viewer.modelRoot.scale.copy(this.saved.scale);
      this.saved = null;
    }
    viewer.requestRender();
    this.onChange();
  }
}
