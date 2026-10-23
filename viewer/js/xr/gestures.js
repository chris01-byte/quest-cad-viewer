import * as THREE from 'three';

const MIN_SCALE = 0.01;
const MAX_SCALE = 100;
const SNAP_TO_ONE = 0.02; // while scaling, land exactly on 1:1 when within 2 %

const _m = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * Grab / rotate / scale of the model root with the grip buttons (pure maths, no WebXR needed).
 *
 * - one hand gripping: the model follows the hand (move + rotate, scale unchanged)
 * - two hands gripping: scale = hand distance ratio, rotation = change of the hand-to-hand direction,
 *   and the point between the hands stays attached to the model
 * - releasing or adding a hand re-baselines, so there are no jumps
 */
export class GrabGesture {
  /** @param {THREE.Object3D} target the object that is moved (the viewer's modelRoot) */
  constructor(target) {
    this.target = target;
    this.mode = 'none'; // 'none' | 'one' | 'two'
    this.key = '';      // which hands are in the current gesture
    this.base = null;
  }

  /** True while any hand holds the model. */
  get holding() {
    return this.mode !== 'none';
  }

  /**
   * @param {{id: string, pressed: boolean, matrix: THREE.Matrix4}[]} hands grip poses in world space
   */
  update(hands) {
    const held = hands.filter((h) => h.pressed).sort((p, q) => (p.id < q.id ? -1 : 1)).slice(0, 2);
    const key = held.map((h) => h.id).join('+');
    if (key !== this.key) {
      this.key = key;
      this.mode = held.length === 2 ? 'two' : held.length === 1 ? 'one' : 'none';
      this.target.updateMatrix();
      this.base = this.#baseline(held);
    }
    if (this.mode === 'one') this.#followOne(held[0]);
    else if (this.mode === 'two') this.#followTwo(held[0], held[1]);
  }

  release() {
    this.mode = 'none';
    this.key = '';
    this.base = null;
  }

  #baseline(held) {
    const model = this.target.matrix.clone();
    if (held.length === 1) {
      return { offset: held[0].matrix.clone().invert().multiply(model) };
    }
    if (held.length === 2) {
      const pa = new THREE.Vector3().setFromMatrixPosition(held[0].matrix);
      const pb = new THREE.Vector3().setFromMatrixPosition(held[1].matrix);
      const v = pb.clone().sub(pa);
      return { model, mid: pa.clone().add(pb).multiplyScalar(0.5), v, distance: Math.max(v.length(), 1e-6) };
    }
    return null;
  }

  #followOne(hand) {
    _m.copy(hand.matrix).multiply(this.base.offset);
    this.#apply(_m);
  }

  #followTwo(ha, hb) {
    const { model, mid: mid0, v: v0, distance: d0 } = this.base;
    const pa = _a.setFromMatrixPosition(ha.matrix);
    const pb = _b.setFromMatrixPosition(hb.matrix);
    const v = pb.clone().sub(pa);
    const mid = pa.clone().add(pb).multiplyScalar(0.5);

    const startScale = new THREE.Vector3().setFromMatrixScale(model).x;
    let k = Math.max(v.length(), 1e-6) / d0;
    const scale = THREE.MathUtils.clamp(startScale * k, MIN_SCALE, MAX_SCALE);
    k = scale / startScale;
    if (Math.abs(scale - 1) < SNAP_TO_ONE) k = 1 / startScale;

    const rotation = new THREE.Quaternion().setFromUnitVectors(v0.clone().normalize(), v.clone().normalize());
    // T(mid) * R * S(k) * T(-mid0) * M0
    const out = new THREE.Matrix4().makeTranslation(mid.x, mid.y, mid.z)
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation))
      .multiply(new THREE.Matrix4().makeScale(k, k, k))
      .multiply(new THREE.Matrix4().makeTranslation(-mid0.x, -mid0.y, -mid0.z))
      .multiply(model);
    this.#apply(out);
  }

  #apply(matrix) {
    matrix.decompose(this.target.position, this.target.quaternion, this.target.scale);
    this.target.updateMatrix();
  }
}

/**
 * Scale the target to `scale` around a world-space pivot, so the model does not jump (used by the 1:1 button).
 */
export function setScaleAround(target, scale, pivotWorld) {
  const k = scale / target.scale.x;
  target.position.sub(pivotWorld).multiplyScalar(k).add(pivotWorld);
  target.scale.setScalar(scale);
  target.updateMatrix();
}

/**
 * Stand the model upright (keep only the heading) with the lowest point of its box on `surface`
 * and the box centre above `surface.x/z`, as if put down on a table.
 * @param {THREE.Object3D} target modelRoot
 * @param {THREE.Box3} box visible box in target space
 * @param {THREE.Vector3} surface world point on the table top
 */
export function placeOnSurface(target, box, surface) {
  // heading = direction of the model's local -Z axis projected on the floor plane
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(target.quaternion);
  forward.y = 0;
  if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);
  forward.normalize();
  const yaw = Math.atan2(-forward.x, -forward.z);
  target.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

  const s = target.scale.x;
  const anchor = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2).multiplyScalar(s);
  anchor.applyQuaternion(target.quaternion);
  target.position.copy(surface).sub(anchor);
  target.updateMatrix();
}
