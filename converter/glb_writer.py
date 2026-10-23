"""Minimal glTF 2.0 binary (GLB) writer. Meshes can be shared by several nodes (instances)."""

from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np


def write_glb(path: Path, meshes, nodes, generator: str = "quest-cad-viewer converter", extras: dict | None = None):
    """
    meshes: list of (name, positions float array (n, 3) in metres, triangle indices int array (m, 3))
    nodes:  list of (name, mesh index, translation (3,) in metres, rotation quaternion [x, y, z, w])
    """
    binary = bytearray()
    views, accessors, gltf_meshes = [], [], []

    def add(data: np.ndarray, target: int) -> int:
        while len(binary) % 4:
            binary.append(0)
        views.append({"buffer": 0, "byteOffset": len(binary), "byteLength": data.nbytes, "target": target})
        binary.extend(data.tobytes())
        return len(views) - 1

    for name, positions, triangles in meshes:
        pos = np.ascontiguousarray(positions, dtype="<f4")
        idx = np.ascontiguousarray(triangles, dtype="<u4").reshape(-1)
        pos_view = add(pos, 34962)
        idx_view = add(idx, 34963)
        accessors.append({"bufferView": pos_view, "componentType": 5126, "count": len(pos), "type": "VEC3",
                          "min": pos.min(axis=0).tolist(), "max": pos.max(axis=0).tolist()})
        accessors.append({"bufferView": idx_view, "componentType": 5125, "count": len(idx), "type": "SCALAR"})
        gltf_meshes.append({"name": name, "primitives": [{"attributes": {"POSITION": len(accessors) - 2},
                                                          "indices": len(accessors) - 1, "material": 0}]})

    gltf_nodes = []
    for name, mesh, translation, rotation in nodes:
        node = {"name": name, "mesh": mesh}
        if any(abs(c) > 0 for c in translation):
            node["translation"] = [float(c) for c in translation]
        if rotation is not None and not np.allclose(rotation, [0, 0, 0, 1]):
            node["rotation"] = [float(c) for c in rotation]
        gltf_nodes.append(node)

    asset = {"version": "2.0", "generator": generator}
    if extras:
        asset["extras"] = extras
    document = {
        "asset": asset,
        "scene": 0,
        "scenes": [{"nodes": list(range(len(gltf_nodes)))}],
        "nodes": gltf_nodes, "meshes": gltf_meshes, "accessors": accessors, "bufferViews": views,
        "materials": [{"name": "Stahl", "pbrMetallicRoughness": {
            "baseColorFactor": [0.72, 0.74, 0.78, 1.0], "metallicFactor": 0.3, "roughnessFactor": 0.6}}],
        "buffers": [{"byteLength": len(binary)}],
    }
    json_bytes = json.dumps(document, separators=(",", ":")).encode()
    json_bytes += b" " * (-len(json_bytes) % 4)
    binary.extend(b"\0" * (-len(binary) % 4))
    total = 12 + 8 + len(json_bytes) + 8 + len(binary)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes)
        f.write(struct.pack("<II", len(binary), 0x004E4942) + bytes(binary))
