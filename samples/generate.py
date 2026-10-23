#!/usr/bin/env python3
"""Erzeugt die Prüfkörper für die Abnahme (siehe ABNAHME.md, Abschnitt Prüfkörper).

Aufruf (nur numpy nötig):

    python3 samples/generate.py              # alle Dateien
    python3 samples/generate.py --ohne-last  # ohne last_2mio.stl (≈ 100 MB)

Einheiten: STL und OBJ in mm (wie der Fusion-Export), GLB in Metern (glTF-Definition).
Jedes Netz wird nach dem Erzeugen auf Wasserdichtheit und Volumen geprüft.
"""
import argparse
import json
import math
import struct
from pathlib import Path

import numpy as np

OUT_DIR = Path(__file__).resolve().parent


# ---------------------------------------------------------------- primitives

def box_mesh(size, origin=(0.0, 0.0, 0.0)):
    """Axis-aligned box, corner at `origin`, triangles counter-clockwise seen from outside."""
    sx, sy, sz = size
    ox, oy, oz = origin
    v = np.array([
        [0, 0, 0], [sx, 0, 0], [sx, sy, 0], [0, sy, 0],
        [0, 0, sz], [sx, 0, sz], [sx, sy, sz], [0, sy, sz],
    ], dtype=np.float64) + (ox, oy, oz)
    t = np.array([
        [0, 3, 2], [0, 2, 1],  # -Z
        [4, 5, 6], [4, 6, 7],  # +Z
        [0, 1, 5], [0, 5, 4],  # -Y
        [3, 7, 6], [3, 6, 2],  # +Y
        [0, 4, 7], [0, 7, 3],  # -X
        [1, 2, 6], [1, 6, 5],  # +X
    ], dtype=np.int64)
    return v, t


def plate_with_hole_mesh(width, height, thickness, hole_d, segments, origin=(0.0, 0.0, 0.0)):
    """Rectangle `width` x `height` (XY plane) with a centred round hole, extruded along +Z.

    The cap faces are built as sectors between a hole vertex pair and the rectangle
    boundary points on the same rays, so the side walls share every boundary vertex
    and the mesh stays watertight (no T-junctions).
    """
    cx, cy, r = width / 2, height / 2, hole_d / 2
    ang = 2 * math.pi * np.arange(segments) / segments

    def boundary_point(a):
        dx, dy = math.cos(a), math.sin(a)
        tx = (width / 2) / abs(dx) if abs(dx) > 1e-12 else math.inf
        ty = (height / 2) / abs(dy) if abs(dy) > 1e-12 else math.inf
        t = min(tx, ty)
        return (cx + t * dx, cy + t * dy)

    corner_ang = [math.atan2(sy * height / 2, sx * width / 2) % (2 * math.pi)
                  for sy in (-1, 1) for sx in (-1, 1)]
    # Perimeter points in counter-clockwise order: (angle, kind, circle index)
    entries = [(a, "ray", k) for k, a in enumerate(ang)]
    for ca in corner_ang:
        if not any(abs(ca - a) < 1e-9 for a in ang):
            entries.append((ca, "corner", -1))
    entries.sort(key=lambda e: e[0])

    verts2d = [(cx + r * math.cos(a), cy + r * math.sin(a)) for a in ang]  # hole ring: 0..segments-1
    perim_idx = []
    for a, _, _ in entries:
        perim_idx.append(len(verts2d))
        verts2d.append(boundary_point(a))
    ray_pos = {e[2]: i for i, e in enumerate(entries) if e[1] == "ray"}

    n2 = len(verts2d)
    verts = np.array([(x, y, z) for z in (0.0, thickness) for (x, y) in verts2d]) + origin
    back = lambda i: i            # z = 0 layer
    front = lambda i: i + n2      # z = thickness layer

    tris = []
    for k in range(segments):
        k2 = (k + 1) % segments
        i0 = ray_pos[k]
        i1 = ray_pos[k2]
        chain = [perim_idx[i0]]
        i = i0
        while i != i1:
            i = (i + 1) % len(perim_idx)
            chain.append(perim_idx[i])
        ck, ck2 = k, k2
        # CCW polygon: c_k, chain..., c_{k+1}; fan from c_k
        poly = [ck] + chain + [ck2]
        for a, b in zip(poly[1:-1], poly[2:]):
            tris.append((front(ck), front(a), front(b)))   # +Z cap
            tris.append((back(ck), back(b), back(a)))      # -Z cap
        # hole wall, normal pointing into the hole
        tris.append((back(ck), front(ck2), back(ck2)))
        tris.append((back(ck), front(ck), front(ck2)))
    # outer walls, normal pointing away from the part
    for j in range(len(perim_idx)):
        a, b = perim_idx[j], perim_idx[(j + 1) % len(perim_idx)]
        tris.append((back(a), back(b), front(b)))
        tris.append((back(a), front(b), front(a)))
    return verts, np.array(tris, dtype=np.int64)


def cylinder_mesh(radius, height, segments, base=(0.0, 0.0, 0.0)):
    """Closed cylinder along +Y, `base` is the centre of the bottom cap."""
    a = 2 * math.pi * np.arange(segments) / segments
    ring = np.stack([radius * np.cos(a), np.zeros(segments), radius * np.sin(a)], axis=1)
    verts = np.vstack([ring, ring + (0, height, 0), [0, 0, 0], [0, height, 0]]) + base
    bottom, top = 2 * segments, 2 * segments + 1
    tris = []
    for i in range(segments):
        j = (i + 1) % segments
        tris += [(i, j, segments + j), (i, segments + j, segments + i),  # side, outward
                 (bottom, j, i),                                            # bottom cap, faces -Y
                 (top, segments + i, segments + j)]                         # top cap, faces +Y
    # the ring runs clockwise seen from +Y, so reverse every triangle to point the normals outward
    return verts, np.array(tris, dtype=np.int64)[:, ::-1].copy()


def merge_meshes(*meshes):
    verts, tris, offset = [], [], 0
    for v, t in meshes:
        verts.append(v)
        tris.append(t + offset)
        offset += len(v)
    return np.vstack(verts), np.vstack(tris)


def screw_mesh(segments=32):
    """A bolt: shaft Ø6 x 20 mm and head Ø10 x 4 mm, axis along +Y, foot at the origin."""
    return merge_meshes(cylinder_mesh(3, 20, segments), cylinder_mesh(5, 4, segments, base=(0, 20, 0)))


def sphere_mesh(radius, rings, segments, center=(0.0, 0.0, 0.0)):
    """UV sphere with shared vertices. Triangle count = 2 * segments * (rings - 1)."""
    phi = math.pi * np.arange(1, rings) / rings
    theta = 2 * math.pi * np.arange(segments) / segments
    ring_xyz = np.stack([
        np.outer(np.sin(phi), np.cos(theta)),
        np.repeat(np.cos(phi)[:, None], segments, axis=1),
        np.outer(np.sin(phi), np.sin(theta)),
    ], axis=-1).reshape(-1, 3) * radius
    verts = np.vstack([[0, radius, 0], ring_xyz, [0, -radius, 0]]) + center
    south = len(verts) - 1
    seg = np.arange(segments)
    nxt = (seg + 1) % segments
    ring = lambda j: 1 + j * segments  # first vertex index of ring j (0-based)
    tris = [np.stack([np.zeros(segments, dtype=np.int64), ring(0) + nxt, ring(0) + seg], axis=1)]
    for j in range(rings - 2):
        a, b = ring(j) + seg, ring(j) + nxt
        c, d = ring(j + 1) + seg, ring(j + 1) + nxt
        tris.append(np.stack([a, b, d], axis=1))
        tris.append(np.stack([a, d, c], axis=1))
    last = ring(rings - 2)
    tris.append(np.stack([np.full(segments, south), last + seg, last + nxt], axis=1))
    return verts, np.vstack(tris).astype(np.int64)


# -------------------------------------------------------------------- checks

def check_mesh(name, verts, tris, expect_volume=None, tol=1e-3):
    """Fail loudly unless the mesh is closed, consistently oriented and has positive volume."""
    edges = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    fwd = edges[:, 0] * len(verts) + edges[:, 1]
    rev = edges[:, 1] * len(verts) + edges[:, 0]
    fwd_sorted = np.sort(fwd)
    if len(np.unique(fwd)) != len(fwd):
        raise AssertionError(f"{name}: Kante mehrfach in gleicher Richtung (Orientierung inkonsistent)")
    if not np.array_equal(fwd_sorted, np.sort(rev)):
        raise AssertionError(f"{name}: Netz nicht wasserdicht")
    p = verts[tris]
    volume = np.einsum("ij,ij->i", p[:, 0], np.cross(p[:, 1], p[:, 2])).sum() / 6
    if volume <= 0:
        raise AssertionError(f"{name}: Volumen {volume:.3f} <= 0 (Normalen zeigen nach innen)")
    if expect_volume is not None and abs(volume - expect_volume) > tol * expect_volume:
        raise AssertionError(f"{name}: Volumen {volume:.3f} statt {expect_volume:.3f}")
    return volume


# ------------------------------------------------------------------- writers

def triangle_normals(verts, tris):
    p = verts[tris]
    n = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])
    length = np.linalg.norm(n, axis=1, keepdims=True)
    return n / np.where(length == 0, 1, length)


def write_stl_binary(path, verts, tris, header=b"quest-cad-viewer sample, unit: mm"):
    rec = np.zeros(len(tris), dtype=[("n", "<f4", 3), ("v", "<f4", (3, 3)), ("attr", "<u2")])
    rec["n"] = triangle_normals(verts, tris)
    rec["v"] = verts[tris]
    with open(path, "wb") as f:
        f.write(header.ljust(80, b" ")[:80])
        f.write(struct.pack("<I", len(tris)))
        f.write(rec.tobytes())


def write_obj(path, name, verts, tris):
    lines = ["# quest-cad-viewer sample, unit: mm", f"o {name}"]
    lines += [f"v {x:.6f} {y:.6f} {z:.6f}" for x, y, z in verts]
    lines += [f"f {a + 1} {b + 1} {c + 1}" for a, b, c in tris]
    Path(path).write_text("\n".join(lines) + "\n")


def write_glb(path, parts, scale=1.0):
    """Minimal glTF 2.0 binary writer: one node + mesh per part, positions scaled by `scale`."""
    binary = bytearray()
    views, accessors, meshes, nodes = [], [], [], []
    for name, verts, tris in parts:
        pos = (verts * scale).astype("<f4")
        idx = tris.astype("<u4").reshape(-1)
        for data, target in ((pos, 34962), (idx, 34963)):
            while len(binary) % 4:
                binary.append(0)
            views.append({"buffer": 0, "byteOffset": len(binary), "byteLength": data.nbytes, "target": target})
            binary += data.tobytes()
        accessors.append({"bufferView": len(views) - 2, "componentType": 5126, "count": len(pos),
                          "type": "VEC3", "min": pos.min(axis=0).tolist(), "max": pos.max(axis=0).tolist()})
        accessors.append({"bufferView": len(views) - 1, "componentType": 5125, "count": len(idx), "type": "SCALAR"})
        meshes.append({"name": name, "primitives": [{"attributes": {"POSITION": len(accessors) - 2},
                                                     "indices": len(accessors) - 1, "material": 0}]})
        nodes.append({"name": name, "mesh": len(meshes) - 1})
    doc = {
        "asset": {"version": "2.0", "generator": "quest-cad-viewer samples/generate.py"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes, "meshes": meshes, "accessors": accessors, "bufferViews": views,
        "materials": [{"name": "Stahl", "pbrMetallicRoughness": {
            "baseColorFactor": [0.72, 0.74, 0.78, 1.0], "metallicFactor": 0.3, "roughnessFactor": 0.6}}],
        "buffers": [{"byteLength": len(binary)}],
    }
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(binary), 0x004E4942) + bytes(binary))


def write_obj_objects(path, objects):
    """OBJ with one `o` statement per part; `objects` = [(name, verts, tris)]."""
    lines = ["# quest-cad-viewer sample, unit: mm"]
    offset = 0
    for name, verts, tris in objects:
        lines.append(f"o {name}")
        lines += [f"v {x:.6f} {y:.6f} {z:.6f}" for x, y, z in verts]
        lines += [f"f {a + 1 + offset} {b + 1 + offset} {c + 1 + offset}" for a, b, c in tris]
        offset += len(verts)
    Path(path).write_text("\n".join(lines) + "\n")


# ----------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ohne-last", action="store_true", help="last_2mio.stl nicht erzeugen")
    args = ap.parse_args()

    # pruefquader: 100 x 50 x 20 mm
    v, t = box_mesh((100, 50, 20))
    check_mesh("pruefquader", v, t, expect_volume=100 * 50 * 20)
    write_stl_binary(OUT_DIR / "pruefquader.stl", v, t)
    write_obj(OUT_DIR / "pruefquader.obj", "pruefquader", v, t)
    print("pruefquader.stl / .obj  100 x 50 x 20 mm, 12 Dreiecke")

    # pruefwinkel: base plate 80 x 10 x 40 + upright leg 80 x 50 x 10 with a Ø10 hole (axis along Z)
    segments = 64
    base_v, base_t = box_mesh((80, 10, 40))
    leg_v, leg_t = plate_with_hole_mesh(80, 50, 10, 10, segments, origin=(0, 10, 0))
    hole_area = 0.5 * segments * 5**2 * math.sin(2 * math.pi / segments)
    check_mesh("Grundplatte", base_v, base_t, expect_volume=80 * 10 * 40)
    check_mesh("Schenkel", leg_v, leg_t, expect_volume=(80 * 50 - hole_area) * 10)
    write_glb(OUT_DIR / "pruefwinkel.glb",
              [("Grundplatte", base_v, base_t), ("Schenkel_mit_Bohrung", leg_v, leg_t)], scale=0.001)
    print(f"pruefwinkel.glb         80 x 60 x 40 mm, Bohrung Ø 10 mm ({segments} Segmente), "
          f"{len(base_t) + len(leg_t)} Dreiecke, Einheit m")

    # baugruppe: plate 200 x 10 x 100 mm with 24 identical bolts, 6 of them lying (turned by 90 degrees)
    objects = []
    plate_v, plate_t = box_mesh((200, 10, 100))
    check_mesh("Grundplatte", plate_v, plate_t, expect_volume=200 * 10 * 100)
    objects.append(("Grundplatte", plate_v, plate_t))
    bolt_v, bolt_t = screw_mesh()
    check_mesh("Schraube", bolt_v, bolt_t)
    standing = [(20 + 32 * i, 10, 20 + 20 * j) for j in range(3) for i in range(6)]
    lying = [(20 + 32 * i, 5, -15) for i in range(6)]
    for n, pos in enumerate(standing + lying, 1):
        v = bolt_v.copy()
        if n > len(standing):
            v = np.stack([v[:, 1], -v[:, 0], v[:, 2]], axis=1)  # rotation by 90 degrees about Z, exact
        objects.append((f"Schraube_{n:02d}", v + pos, bolt_t))
    write_obj_objects(OUT_DIR / "baugruppe.obj", objects)
    print(f"baugruppe.obj           Platte 200 x 10 x 100 mm + {len(standing) + len(lying)} gleiche Schrauben "
          f"({len(lying)} gedreht), {sum(len(t) for _, _, t in objects)} Dreiecke")

    if not args.ohne_last:
        # last_2mio: sphere Ø200 mm, rings * segments chosen for ≈ 2.0 Mio. triangles
        v, t = sphere_mesh(100, 708, 1416)
        vol = check_mesh("last_2mio", v, t)
        write_stl_binary(OUT_DIR / "last_2mio.stl", v, t)
        print(f"last_2mio.stl           Ø 200 mm, {len(t):,} Dreiecke, {(84 + 50 * len(t)) / 1e6:.0f} MB "
              f"(nicht im Repo, siehe .gitignore); Volumen {vol / 1e6:.3f} Liter")


if __name__ == "__main__":
    main()
