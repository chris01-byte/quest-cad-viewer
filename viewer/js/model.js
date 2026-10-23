import * as THREE from 'three';

/**
 * A loaded model: content group in metres plus a flat list of toggleable parts.
 * `root` is the child of the viewer's modelRoot; its position centres the model on the grid.
 */
export class Model {
  /**
   * @param {{name: string, root: THREE.Group, parts: THREE.Object3D[], sourceUnit: string}} init
   */
  constructor({ name, root, parts, sourceUnit }) {
    this.name = name;
    this.root = root;
    this.sourceUnit = sourceUnit; // human-readable note, e.g. "mm (STL/OBJ)"
    this.parts = parts.map((object, i) => ({
      id: i,
      name: object.name || `Teil ${i + 1}`,
      object,
      triangles: countTriangles(object),
    }));
    this.totalTriangles = this.parts.reduce((sum, p) => sum + p.triangles, 0);
  }

  setPartVisible(id, visible) {
    this.parts[id].object.visible = visible;
  }

  triangleCount({ visibleOnly = false } = {}) {
    if (!visibleOnly) return this.totalTriangles;
    return this.parts.reduce((sum, p) => sum + (p.object.visible ? p.triangles : 0), 0);
  }

  /** Bounding box of all visible parts in modelRoot space (metres), exact down to the vertices. */
  visibleBox() {
    const box = new THREE.Box3();
    const walk = (obj, parentMatrix) => {
      if (!obj.visible) return;
      obj.updateMatrix();
      const m = parentMatrix.clone().multiply(obj.matrix);
      if (obj.isMesh && obj.geometry) expandBox(box, obj.geometry, m);
      for (const child of obj.children) walk(child, m);
    };
    walk(this.root, new THREE.Matrix4());
    return box;
  }

  /** Move the content so that its (currently visible) box is centred on x/z and rests on y = 0. */
  centreOnFloor() {
    const box = this.visibleBox();
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    this.root.position.add(new THREE.Vector3(-c.x, -box.min.y, -c.z));
    this.root.updateMatrix();
  }

  dispose() {
    const geometries = new Set();
    const materials = new Set();
    this.root.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      for (const m of [].concat(o.material || [])) materials.add(m);
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  }
}

export function countTriangles(object) {
  let n = 0;
  object.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.floor(n);
}

const _v = new THREE.Vector3();

function expandBox(box, geometry, matrix) {
  if (!geometry.attributes.position) return;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const e = matrix.elements;
  const axisAligned = [1, 2, 4, 6, 8, 9].every((i) => Math.abs(e[i]) < 1e-12);
  if (axisAligned) {
    box.union(geometry.boundingBox.clone().applyMatrix4(matrix));
    return;
  }
  // rotated node: the transformed box would be too large, so walk the vertices
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) box.expandByPoint(_v.fromBufferAttribute(pos, i).applyMatrix4(matrix));
}
