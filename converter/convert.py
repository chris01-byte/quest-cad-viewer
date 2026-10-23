#!/usr/bin/env python3
"""Konverter: STL/OBJ aus Fusion -> optimierte GLB für den Quest CAD Viewer.

Beispiele:
    python3 converter/convert.py roboterarm.stl -o roboterarm.glb
    python3 converter/convert.py baugruppe.obj --ziel 300000
    python3 converter/convert.py bauteil.stl --unvereinfacht

Eingabe in Millimetern (Fusion-Export), Ausgabe in Metern (glTF-Definition).
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np

from geometry import find_instances, rotation_to_quaternion, split_shells, weld
from glb_writer import write_glb
from readers import ConvertError, read_mesh

MM_TO_M = 0.001
DEFAULT_TARGET = 500_000        # working hypothesis for the Quest (< 1 million per scene), to be measured on the device
KEEP_WHOLE_BELOW = 64           # parts with so few triangles are never simplified
EXTENTS = ("X", "Y", "Z")


def de(number: float, decimals: int = 0) -> str:
    """German number format: 1.234.567,8"""
    text = f"{number:,.{decimals}f}"
    return text.replace(",", "\0").replace(".", ",").replace("\0", ".")


def size_text(n_bytes: int) -> str:
    """Decimal units like the macOS Finder (1 MB = 1000 kB)."""
    if n_bytes < 1000:
        return f"{n_bytes} B"
    if n_bytes < 1000 ** 2:
        return f"{de(n_bytes / 1000, 1)} kB"
    return f"{de(n_bytes / 1000 ** 2, 1)} MB"


def simplify(vertices: np.ndarray, faces: np.ndarray, target: int):
    """Quadric edge-collapse down to about `target` triangles; returns the input if it cannot be simplified."""
    if len(faces) <= target:
        return vertices, faces
    import fast_simplification  # imported late so --unvereinfacht works without it

    try:
        new_vertices, new_faces = fast_simplification.simplify(
            vertices.astype(np.float32), faces.astype(np.int32), target_count=int(target), agg=5)
    except Exception as e:  # noqa: BLE001 - the library raises plain RuntimeErrors for broken meshes
        print(f"  Warnung: Vereinfachung eines Teils fehlgeschlagen ({e}), das Teil bleibt unvereinfacht.", file=sys.stderr)
        return vertices, faces
    if len(new_faces) == 0:
        return vertices, faces
    return new_vertices.astype(np.float64), new_faces.astype(np.int64)


def plan_targets(uniques, counts, target_total: int | None):
    """Triangle budget per unique geometry. Instances count towards the total; small parts stay whole."""
    tris = np.array([len(u.faces) for u in uniques])
    counts = np.array(counts)
    if target_total is None or (tris * counts).sum() <= target_total:
        return list(tris)
    fixed = tris <= KEEP_WHOLE_BELOW
    budget = target_total - int((tris * counts)[fixed].sum())
    reducible = int((tris * counts)[~fixed].sum())
    ratio = max(budget, 0) / reducible if reducible else 1.0
    return [int(t) if fixed[i] else max(KEEP_WHOLE_BELOW, int(t * ratio)) for i, t in enumerate(tris)]


def bounding_box_mm(uniques, instances):
    low = np.full(3, np.inf)
    high = np.full(3, -np.inf)
    for inst in instances:
        v = uniques[inst.geometry].vertices @ inst.rotation.T + inst.translation
        low = np.minimum(low, v.min(axis=0))
        high = np.maximum(high, v.max(axis=0))
    return high - low


def convert(source: Path, target_path: Path, target_triangles: int | None, instancing: bool, split: bool, log=print):
    started = time.time()
    log(f"Lese {source.name} ({size_text(source.stat().st_size)}) …")
    raw_parts = read_mesh(source)
    triangles_in = sum(len(p.faces) for p in raw_parts)
    log(f"  {de(triangles_in)} Dreiecke in {len(raw_parts)} Teil(en), Einheit: Millimeter")

    log("Bereinige Netze (Eckpunkte verschweißen, degenerierte Dreiecke entfernen) …")
    parts = []
    dropped = 0
    for part in raw_parts:
        vertices, faces = weld(part.vertices, part.faces)
        if len(faces) == 0:
            dropped += 1
            continue
        if split:
            shells = split_shells(vertices, faces)
            for i, (v, f) in enumerate(shells, 1):
                parts.append((f"{part.name}_{i:03d}" if len(shells) > 1 else part.name, v, f))
        else:
            parts.append((part.name, vertices, faces))
    if dropped:
        log(f"  {dropped} Teil(e) ohne gültige Dreiecke übersprungen")
    if not parts:
        raise ConvertError("Nach der Bereinigung sind keine Dreiecke übrig.")
    triangles_clean = sum(len(f) for _, _, f in parts)

    uniques, instances = find_instances(parts, detect=instancing)
    counts = np.bincount([i.geometry for i in instances], minlength=len(uniques))
    box_before = bounding_box_mm(uniques, instances)
    if instancing:
        log(f"  {len(parts)} Teile -> {len(uniques)} einzigartige Geometrien, {len(parts) - len(uniques)} davon als Instanz wiederverwendet")

    if target_triangles is None:
        log("Keine Vereinfachung (unvereinfacht).")
    else:
        goals = plan_targets(uniques, counts, target_triangles)
        total_before = int(sum(len(u.faces) * c for u, c in zip(uniques, counts)))
        if total_before > target_triangles:
            log(f"Vereinfache auf ca. {de(target_triangles)} Dreiecke …")
        for u, goal in zip(uniques, goals):
            if goal < len(u.faces):
                u.vertices, u.faces = simplify(u.vertices, u.faces, goal)

    triangles_out = int(sum(len(u.faces) * c for u, c in zip(uniques, counts)))
    meshes = [(f"Geometrie_{i + 1}", u.vertices * MM_TO_M, u.faces) for i, u in enumerate(uniques)]
    nodes = [(inst.name, inst.geometry, inst.translation * MM_TO_M,
              None if np.allclose(inst.rotation, np.eye(3)) else rotation_to_quaternion(inst.rotation)) for inst in instances]
    box_after = bounding_box_mm(uniques, instances)
    write_glb(target_path, meshes, nodes, extras={"source": source.name, "unit": "mm -> m", "triangles": triangles_out})

    in_size = source.stat().st_size
    out_size = target_path.stat().st_size
    log("")
    log("Ergebnis")
    log(f"  Dreiecke vorher:   {de(triangles_in)}" + (f"  (nach Bereinigung {de(triangles_clean)})" if triangles_clean != triangles_in else ""))
    log(f"  Dreiecke nachher:  {de(triangles_out)}  ({de(100 * triangles_out / triangles_in, 1)} %, Instanzen mitgezählt)")
    log(f"  Teile / Geometrien: {len(instances)} Knoten, {len(uniques)} Meshes")
    log(f"  Dateigröße:        {size_text(in_size)} -> {size_text(out_size)}")
    log("  Bounding-Box (mm): " + " × ".join(de(x, 1) for x in box_after) + "   (X × Y × Z)")
    if target_triangles is not None:
        drift = np.abs(box_after - box_before).max()
        log(f"  Abweichung der Bounding-Box durch die Vereinfachung: {de(drift, 3)} mm")
        if triangles_out > target_triangles:
            log(f"  Hinweis: Das Ziel von {de(target_triangles)} Dreiecken wurde nicht erreicht (kleine Teile werden nicht vereinfacht).")
    log(f"  Dauer: {de(time.time() - started, 1)} s")
    log(f"Geschrieben: {target_path}")
    return {"triangles_in": triangles_in, "triangles_out": triangles_out, "nodes": len(instances), "meshes": len(uniques),
            "bytes_in": in_size, "bytes_out": out_size, "box_mm": box_after.tolist()}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="STL/OBJ (Millimeter) -> GLB (Meter) für den Quest CAD Viewer.",
                                 epilog="Gemessen wird später am Dreiecksnetz. Fusion bleibt die Referenz für exakte Maße; "
                                        "für Teile, an denen gemessen werden soll, --unvereinfacht verwenden.")
    ap.add_argument("eingabe", type=Path, help="STL- oder OBJ-Datei")
    ap.add_argument("-o", "--ausgabe", type=Path, help="Ausgabedatei (Standard: <Eingabe>.glb neben der Eingabe)")
    ap.add_argument("--ziel", type=int, default=DEFAULT_TARGET, metavar="DREIECKE",
                    help=f"Zielwert für die Gesamtzahl der Dreiecke inkl. Instanzen (Standard {de(DEFAULT_TARGET)})")
    ap.add_argument("--unvereinfacht", action="store_true", help="Geometrie nicht verändern (nur verschweißen, Instanzen bilden, mm -> m)")
    ap.add_argument("--keine-instanzen", action="store_true", help="gleiche Teile nicht als Instanzen ablegen")
    ap.add_argument("--schalen-trennen", action="store_true",
                    help="zusammenhängende Körper einer Datei als getrennte Teile ablegen (nützlich für Baugruppen als eine STL)")
    args = ap.parse_args(argv)

    if args.ziel < 12:
        ap.error("--ziel muss mindestens 12 sein.")
    output = args.ausgabe or args.eingabe.with_suffix(".glb")
    if not args.eingabe.is_file():
        print(f"Fehler: „{args.eingabe}“ nicht gefunden.", file=sys.stderr)
        return 1
    if output.resolve() == args.eingabe.resolve():
        print("Fehler: Ein- und Ausgabedatei sind identisch.", file=sys.stderr)
        return 1
    try:
        convert(args.eingabe, output, None if args.unvereinfacht else args.ziel, not args.keine_instanzen, args.schalen_trennen)
    except ConvertError as e:
        print(f"Fehler: {e}", file=sys.stderr)
        return 1
    except MemoryError:
        print("Fehler: Nicht genug Arbeitsspeicher. Mit einer kleineren Datei oder auf einem Rechner mit mehr RAM versuchen.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
