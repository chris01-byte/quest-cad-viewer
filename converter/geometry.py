"""Mesh clean-up, splitting and detection of identical parts (instances)."""

from __future__ import annotations

import hashlib
import itertools
from dataclasses import dataclass

import numpy as np

WELD_TOLERANCE_MM = 1e-4     # vertices closer than this are one vertex
INSTANCE_TOLERANCE_MM = 0.01  # parts whose vertices differ less than this count as identical (float32 export noise)


def weld(vertices: np.ndarray, faces: np.ndarray, tolerance: float = WELD_TOLERANCE_MM):
    """Merge coincident vertices, drop degenerate triangles and unused vertices.

    Vertices are renumbered in order of first appearance in the face list. That order does not
    change when a part is moved or rotated, which is what makes identical parts comparable.
    """
    corner_points = vertices[faces.reshape(-1)]
    q = np.round(corner_points / tolerance).astype(np.int64)
    order = np.lexsort((q[:, 2], q[:, 1], q[:, 0]))
    sorted_q = q[order]
    starts = np.ones(len(sorted_q), dtype=bool)
    starts[1:] = (sorted_q[1:] != sorted_q[:-1]).any(axis=1)
    group = np.cumsum(starts) - 1                      # group id per sorted corner
    first_corner = np.minimum.reduceat(order, np.flatnonzero(starts))  # earliest corner index of each group
    rank = np.empty(len(first_corner), dtype=np.int64)
    rank[np.argsort(first_corner, kind="stable")] = np.arange(len(first_corner))
    new_id = np.empty(len(q), dtype=np.int64)
    new_id[order] = rank[group]
    new_vertices = corner_points[np.sort(first_corner)]
    new_faces = new_id.reshape(-1, 3)
    keep = (new_faces[:, 0] != new_faces[:, 1]) & (new_faces[:, 1] != new_faces[:, 2]) & (new_faces[:, 0] != new_faces[:, 2])
    new_faces = new_faces[keep]
    return compact(new_vertices, new_faces)


def compact(vertices: np.ndarray, faces: np.ndarray):
    """Drop unreferenced vertices, keeping first-appearance order."""
    flat = faces.reshape(-1)
    used = np.zeros(len(vertices), dtype=bool)
    used[flat] = True
    if used.all():
        return vertices, faces
    remap = np.cumsum(used) - 1
    return vertices[used], remap[faces]


def split_shells(vertices: np.ndarray, faces: np.ndarray):
    """Split a welded mesh into its connected components (e.g. the bodies of an assembly exported as one STL)."""
    n = len(vertices)
    label = np.arange(n, dtype=np.int64)
    a, b, c = faces[:, 0], faces[:, 1], faces[:, 2]
    while True:
        smallest = np.minimum(np.minimum(label[a], label[b]), label[c])
        before = label.copy()
        for corner in (a, b, c):
            np.minimum.at(label, corner, smallest)
        while True:  # pointer jumping
            jumped = label[label]
            if np.array_equal(jumped, label):
                break
            label = jumped
        if np.array_equal(label, before):
            break
    face_label = label[a]
    shells = []
    for value in np.unique(face_label):  # ascending = order of the lowest vertex index
        f = faces[face_label == value]
        v, f = compact(vertices, f)
        shells.append((v, f))
    return shells


def _rotations() -> list[np.ndarray]:
    """The 24 proper rotations of the cube (axis permutations with signs, determinant +1)."""
    out = []
    for perm in itertools.permutations(range(3)):
        for signs in itertools.product((1, -1), repeat=3):
            m = np.zeros((3, 3))
            for row, (col, s) in enumerate(zip(perm, signs)):
                m[row, col] = s
            if round(np.linalg.det(m)) == 1:
                out.append(m)
    # identity first: translated copies are by far the most common case
    out.sort(key=lambda m: -np.trace(m))
    return out


ROTATIONS = _rotations()


def rotation_to_quaternion(m: np.ndarray) -> list[float]:
    """3x3 rotation matrix -> quaternion [x, y, z, w] (glTF order)."""
    t = np.trace(m)
    if t > 0:
        s = np.sqrt(t + 1.0) * 2
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, 0.25 * s]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = [0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
    elif m[1, 1] > m[2, 2]:
        s = np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = [(m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
    else:
        s = np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s, (m[1, 0] - m[0, 1]) / s]
    return [float(x) for x in q]


@dataclass
class Instance:
    name: str
    geometry: int            # index into the list of unique geometries
    translation: np.ndarray  # mm, node position
    rotation: np.ndarray     # 3x3, maps the unique geometry to this part (identity for translated copies)


@dataclass
class Unique:
    vertices: np.ndarray  # centred on the part's centroid, in the orientation of its first occurrence
    faces: np.ndarray


def find_instances(parts, tolerance: float = INSTANCE_TOLERANCE_MM, detect: bool = True):
    """Group identical parts.

    Parts are identical when they have the same triangle connectivity and their centred vertices match
    within `tolerance`, either as they are or turned by one of the 24 axis-aligned rotations
    (screws lie in different orientations in an assembly). Mirrored copies are different parts.
    Returns (uniques, instances).
    """
    uniques: list[Unique] = []
    unique_key: list[tuple] = []
    by_signature: dict[tuple, list[int]] = {}
    instances: list[Instance] = []
    for name, vertices, faces in parts:
        centroid = vertices.mean(axis=0)
        centred = vertices - centroid
        match = None
        if detect:
            signature = (len(vertices), len(faces), hashlib.sha1(faces.astype(np.int32).tobytes()).hexdigest())
            for index in by_signature.get(signature, []):
                ref = uniques[index].vertices
                for rotation in ROTATIONS:
                    # centred @ rotation.T is the part turned into the orientation of the reference
                    if np.abs(centred @ rotation.T - ref).max() <= tolerance:
                        match = (index, rotation.T)  # reference -> this part: R^-1 = R^T
                        break
                if match:
                    break
        if match is None:
            index = len(uniques)
            uniques.append(Unique(centred, faces))
            if detect:
                by_signature.setdefault(signature, []).append(index)
            match = (index, np.eye(3))
        instances.append(Instance(name, match[0], centroid, match[1]))
    return uniques, instances
