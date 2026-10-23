// Minimal triangle BVH for ray picking. three's Raycaster tests every triangle, which is far too slow
// for 1-2 million triangles (hover every frame, controller ray in XR). Built once per geometry.

const LEAF_SIZE = 8;
const STACK_SIZE = 96;

export class MeshBVH {
  /** @param {import('three').BufferGeometry} geometry positions are read, never modified */
  constructor(geometry) {
    const attr = geometry.attributes.position;
    this.pos = toFloat32(attr);
    this.index = geometry.index ? Uint32Array.from(geometry.index.array) : null;
    this.triCount = (this.index ? this.index.length : attr.count) / 3;
    this.order = new Uint32Array(this.triCount); // triangle ids, reordered so every leaf is a contiguous range
    for (let i = 0; i < this.triCount; i++) this.order[i] = i;
    this.#build();
  }

  #vertex(tri, k) {
    return this.index ? this.index[tri * 3 + k] : tri * 3 + k;
  }

  /** Corner positions of triangle `tri` as [x0,y0,z0, x1,y1,z1, x2,y2,z2] (mesh-local). */
  triangle(tri, out = new Array(9)) {
    for (let k = 0; k < 3; k++) {
      const v = this.#vertex(tri, k) * 3;
      out[k * 3] = this.pos[v];
      out[k * 3 + 1] = this.pos[v + 1];
      out[k * 3 + 2] = this.pos[v + 2];
    }
    return out;
  }

  #build() {
    const { pos, order, triCount } = this;
    const centroids = new Float32Array(triCount * 3);
    for (let t = 0; t < triCount; t++) {
      const a = this.#vertex(t, 0) * 3, b = this.#vertex(t, 1) * 3, c = this.#vertex(t, 2) * 3;
      for (let k = 0; k < 3; k++) centroids[t * 3 + k] = (pos[a + k] + pos[b + k] + pos[c + k]) / 3;
    }

    let capacity = Math.max(16, Math.ceil(triCount / 2));
    this.bounds = new Float32Array(capacity * 6);
    this.meta = new Int32Array(capacity * 3); // [left | start, right, count]; count > 0 marks a leaf
    let nodeCount = 0;
    const alloc = () => {
      if (nodeCount === capacity) {
        capacity *= 2;
        const b = new Float32Array(capacity * 6); b.set(this.bounds); this.bounds = b;
        const m = new Int32Array(capacity * 3); m.set(this.meta); this.meta = m;
      }
      return nodeCount++;
    };

    const stack = [[alloc(), 0, triCount]];
    const lo = [0, 0, 0], hi = [0, 0, 0], clo = [0, 0, 0], chi = [0, 0, 0];
    while (stack.length) {
      const [node, start, end] = stack.pop();
      lo.fill(Infinity); hi.fill(-Infinity); clo.fill(Infinity); chi.fill(-Infinity);
      for (let i = start; i < end; i++) {
        const t = order[i];
        for (let k = 0; k < 3; k++) {
          const c = centroids[t * 3 + k];
          if (c < clo[k]) clo[k] = c;
          if (c > chi[k]) chi[k] = c;
          for (let corner = 0; corner < 3; corner++) {
            const v = pos[this.#vertex(t, corner) * 3 + k];
            if (v < lo[k]) lo[k] = v;
            if (v > hi[k]) hi[k] = v;
          }
        }
      }
      const b = node * 6;
      for (let k = 0; k < 3; k++) { this.bounds[b + k] = lo[k]; this.bounds[b + 3 + k] = hi[k]; }

      const count = end - start;
      let axis = 0;
      for (let k = 1; k < 3; k++) if (chi[k] - clo[k] > chi[axis] - clo[axis]) axis = k;
      if (count <= LEAF_SIZE || chi[axis] - clo[axis] <= 0) {
        this.meta[node * 3] = start; this.meta[node * 3 + 1] = 0; this.meta[node * 3 + 2] = count;
        continue;
      }

      // partition at the spatial midpoint of the centroids; fall back to a count split if one side stays empty
      const mid = (clo[axis] + chi[axis]) / 2;
      let i = start, j = end - 1;
      while (i <= j) {
        if (centroids[order[i] * 3 + axis] < mid) i++;
        else { const tmp = order[i]; order[i] = order[j]; order[j] = tmp; j--; }
      }
      let split = i;
      if (split === start || split === end) split = (start + end) >> 1;

      const left = alloc(), right = alloc();
      this.meta[node * 3] = left; this.meta[node * 3 + 1] = right; this.meta[node * 3 + 2] = 0;
      stack.push([left, start, split], [right, split, end]);
    }
    this.nodeCount = nodeCount;
  }

  /**
   * Closest hit along the ray (mesh-local space, `dir` need not be normalised; t is in units of `dir`).
   * Double-sided. Returns { t, tri } or null.
   */
  raycast(ox, oy, oz, dx, dy, dz, tMax = Infinity) {
    const TINY = 1e-30; // an exactly axis-parallel ray would give 0 * Infinity = NaN in the slab test
    const ix = 1 / (dx === 0 ? TINY : dx), iy = 1 / (dy === 0 ? TINY : dy), iz = 1 / (dz === 0 ? TINY : dz);
    const { bounds, meta, order, pos } = this;
    const stack = new Int32Array(STACK_SIZE);
    let sp = 0;
    let best = tMax, bestTri = -1;

    const boxT = (n) => { // entry distance of the ray into node n's box, Infinity if missed or beyond best
      const b = n * 6;
      let t1 = (bounds[b] - ox) * ix, t2 = (bounds[b + 3] - ox) * ix;
      let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
      t1 = (bounds[b + 1] - oy) * iy; t2 = (bounds[b + 4] - oy) * iy;
      tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
      t1 = (bounds[b + 2] - oz) * iz; t2 = (bounds[b + 5] - oz) * iz;
      tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
      return tmax >= Math.max(tmin, 0) && tmin <= best ? Math.max(tmin, 0) : Infinity;
    };

    if (boxT(0) === Infinity) return null;
    stack[sp++] = 0;
    while (sp) {
      const node = stack[--sp];
      const count = meta[node * 3 + 2];
      if (count > 0) {
        const start = meta[node * 3];
        for (let i = start; i < start + count; i++) {
          const tri = order[i];
          const t = this.#intersect(tri, ox, oy, oz, dx, dy, dz);
          if (t >= 0 && t < best) { best = t; bestTri = tri; }
        }
        continue;
      }
      const l = meta[node * 3], r = meta[node * 3 + 1];
      const tl = boxT(l), tr = boxT(r);
      if (tl === Infinity && tr === Infinity) continue;
      if (tr === Infinity) stack[sp++] = l;
      else if (tl === Infinity) stack[sp++] = r;
      else if (tl <= tr) { stack[sp++] = r; stack[sp++] = l; } else { stack[sp++] = l; stack[sp++] = r; }
    }
    return bestTri < 0 ? null : { t: best, tri: bestTri };
  }

  // Moeller-Trumbore, double-sided; returns t or -1
  #intersect(tri, ox, oy, oz, dx, dy, dz) {
    const pos = this.pos;
    const a = this.#vertex(tri, 0) * 3, b = this.#vertex(tri, 1) * 3, c = this.#vertex(tri, 2) * 3;
    const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
    const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-30) return -1;
    const inv = 1 / det;
    const tx = ox - pos[a], ty = oy - pos[a + 1], tz = oz - pos[a + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) return -1;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) return -1;
    return (e2x * qx + e2y * qy + e2z * qz) * inv;
  }
}

/** Float32Array view of a position attribute; copies when it is interleaved or not float32. */
function toFloat32(attr) {
  if (!attr.isInterleavedBufferAttribute && attr.array instanceof Float32Array && attr.itemSize === 3) return attr.array;
  const out = new Float32Array(attr.count * 3);
  for (let i = 0; i < attr.count; i++) {
    out[i * 3] = attr.getX(i);
    out[i * 3 + 1] = attr.getY(i);
    out[i * 3 + 2] = attr.getZ(i);
  }
  return out;
}
