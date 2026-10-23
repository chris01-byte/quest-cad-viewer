"""Readers for STL (binary and ASCII) and OBJ. Units are not stored in these formats; the values are millimetres."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np


class ConvertError(Exception):
    """An error whose message is meant to be shown to the user as is."""


@dataclass
class Part:
    name: str
    vertices: np.ndarray  # (n, 3) float64, mm
    faces: np.ndarray     # (m, 3) int64, indices into vertices


_STL_RECORD = np.dtype([("normal", "<f4", 3), ("v", "<f4", (3, 3)), ("attr", "<u2")])


def read_stl(path: Path) -> list[Part]:
    data = path.read_bytes()
    if not data:
        raise ConvertError(f"„{path.name}“ ist leer.")
    if len(data) >= 84:
        count = int.from_bytes(data[80:84], "little")
        if len(data) == 84 + 50 * count:  # exact size match = binary, even if the header starts with "solid"
            if count == 0:
                raise ConvertError(f"„{path.name}“ enthält keine Dreiecke.")
            records = np.frombuffer(data, dtype=_STL_RECORD, count=count, offset=84)
            vertices = records["v"].reshape(-1, 3).astype(np.float64)
            return [Part(path.stem, vertices, np.arange(len(vertices), dtype=np.int64).reshape(-1, 3))]
    return _read_stl_ascii(path, data)


_SOLID = re.compile(rb"^\s*solid\b(.*)$", re.MULTILINE | re.IGNORECASE)
_VERTEX = re.compile(rb"vertex\s+(\S+)\s+(\S+)\s+(\S+)", re.IGNORECASE)


def _read_stl_ascii(path: Path, data: bytes) -> list[Part]:
    if not data.lstrip().lower().startswith(b"solid"):
        raise ConvertError(f"„{path.name}“ ist keine gültige STL-Datei (weder binär noch ASCII).")
    starts = [(m.start(), m.group(1).decode("utf-8", "replace").strip()) for m in _SOLID.finditer(data)]
    parts = []
    for i, (start, name) in enumerate(starts):
        end = starts[i + 1][0] if i + 1 < len(starts) else len(data)
        try:
            coords = np.array(_VERTEX.findall(data[start:end]), dtype=np.float64)
        except ValueError as e:
            raise ConvertError(f"„{path.name}“: ungültige Zahl in einer STL-ASCII-Datei ({e}).") from e
        if len(coords) == 0:
            continue
        if len(coords) % 3:
            raise ConvertError(f"„{path.name}“: Die Zahl der Eckpunkte ist nicht durch 3 teilbar, die Datei ist beschädigt.")
        parts.append(Part(name or f"{path.stem}_{len(parts) + 1}", coords, np.arange(len(coords), dtype=np.int64).reshape(-1, 3)))
    if not parts:
        raise ConvertError(f"„{path.name}“ enthält keine Dreiecke.")
    return parts


def read_obj(path: Path) -> list[Part]:
    """Every `o` or `g` statement starts a new part. Polygons are fanned into triangles."""
    vertices: list[tuple[float, float, float]] = []
    parts: list[tuple[str, list[list[int]]]] = []
    current: list[list[int]] | None = None
    seen: dict[str, int] = {}

    def start(name: str):
        nonlocal current
        count = seen.get(name, 0) + 1
        seen[name] = count
        current = []
        parts.append((name if count == 1 else f"{name} ({count})", current))

    with open(path, "r", errors="replace") as f:
        for number, line in enumerate(f, 1):
            if line.startswith("v "):
                fields = line.split()
                try:
                    vertices.append((float(fields[1]), float(fields[2]), float(fields[3])))
                except (ValueError, IndexError) as e:
                    raise ConvertError(f"„{path.name}“, Zeile {number}: ungültiger Eckpunkt.") from e
            elif line.startswith("f "):
                if current is None:
                    start(path.stem)
                try:
                    idx = [int(tok.split("/")[0]) for tok in line.split()[1:]]
                except ValueError as e:
                    raise ConvertError(f"„{path.name}“, Zeile {number}: ungültige Fläche.") from e
                if len(idx) < 3:
                    continue
                n = len(vertices)
                idx = [i - 1 if i > 0 else n + i for i in idx]  # negative indices count from the end
                if any(i < 0 or i >= n for i in idx):
                    raise ConvertError(f"„{path.name}“, Zeile {number}: Fläche verweist auf einen nicht vorhandenen Eckpunkt.")
                for k in range(1, len(idx) - 1):  # fan triangulation
                    current.append([idx[0], idx[k], idx[k + 1]])
            elif line.startswith(("o ", "g ")):
                start(line[2:].strip() or path.stem)

    if not vertices or not any(faces for _, faces in parts):
        raise ConvertError(f"„{path.name}“ enthält keine Flächen. Ist es eine gültige OBJ-Datei?")
    all_vertices = np.array(vertices, dtype=np.float64)
    result = []
    for name, faces in parts:
        if not faces:
            continue
        f = np.array(faces, dtype=np.int64)
        used, inverse = np.unique(f, return_inverse=True)
        result.append(Part(name, all_vertices[used], inverse.reshape(-1, 3).astype(np.int64)))
    return result


def read_mesh(path: Path) -> list[Part]:
    suffix = path.suffix.lower()
    if suffix == ".stl":
        return read_stl(path)
    if suffix == ".obj":
        return read_obj(path)
    raise ConvertError(f"Dateityp „{path.suffix}“ wird nicht unterstützt. Der Konverter liest STL und OBJ.")
