"""Tests des Konverters. Aufruf aus dem Repo-Hauptordner:  python3 -m unittest discover -s converter/tests -v"""
import contextlib
import io
import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "samples"))

import convert  # noqa: E402
import geometry  # noqa: E402
import readers  # noqa: E402
from generate import box_mesh, screw_mesh, sphere_mesh, write_obj, write_stl_binary  # noqa: E402

try:
    import fast_simplification  # noqa: F401
    HAVE_SIMPLIFY = True
except ImportError:
    HAVE_SIMPLIFY = False


def read_glb(path):
    """Parse a GLB without any library: returns (document, binary chunk)."""
    data = Path(path).read_bytes()
    magic, version, length = struct.unpack("<III", data[:12])
    assert magic == 0x46546C67 and version == 2 and length == len(data)
    json_len = struct.unpack("<I", data[12:16])[0]
    doc = json.loads(data[20:20 + json_len])
    return doc, data[20 + json_len + 8:]


def glb_positions(doc, blob, mesh_index):
    acc = doc["accessors"][doc["meshes"][mesh_index]["primitives"][0]["attributes"]["POSITION"]]
    view = doc["bufferViews"][acc["bufferView"]]
    return np.frombuffer(blob, dtype="<f4", count=acc["count"] * 3, offset=view["byteOffset"]).reshape(-1, 3)


def quat_to_matrix(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def run_cli(*args):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            code = convert.main([str(a) for a in args])
        except SystemExit as e:
            code = e.code
    return code, out.getvalue(), err.getvalue()


class ReaderTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())

    def test_binary_stl(self):
        v, t = box_mesh((100, 50, 20))
        write_stl_binary(self.dir / "q.stl", v, t)
        (part,) = readers.read_stl(self.dir / "q.stl")
        self.assertEqual(len(part.faces), 12)
        self.assertEqual(np.ptp(part.vertices, axis=0).tolist(), [100, 50, 20])

    def test_binary_stl_with_solid_header(self):
        v, t = box_mesh((10, 10, 10))
        write_stl_binary(self.dir / "s.stl", v, t, header=b"solid exported by something")
        (part,) = readers.read_stl(self.dir / "s.stl")  # must be recognised as binary by its size
        self.assertEqual(len(part.faces), 12)

    def test_ascii_stl_with_two_solids(self):
        def solid(name, x):
            return (f"solid {name}\n facet normal 0 0 1\n  outer loop\n   vertex {x} 0 0\n   vertex {x + 1} 0 0\n   vertex {x} 1 0\n"
                    f"  endloop\n endfacet\nendsolid {name}\n")
        (self.dir / "a.stl").write_text(solid("A", 0) + solid("B", 5))
        parts = readers.read_stl(self.dir / "a.stl")
        self.assertEqual([p.name for p in parts], ["A", "B"])

    def test_obj_groups_negative_indices_and_quads(self):
        (self.dir / "g.obj").write_text("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\no Platte\nf 1 2 3 4\ng Deckel\nf -4 -3 -2/1/1\n")
        parts = readers.read_obj(self.dir / "g.obj")
        self.assertEqual([p.name for p in parts], ["Platte", "Deckel"])
        self.assertEqual(len(parts[0].faces), 2)  # the quad became two triangles
        self.assertEqual(len(parts[1].faces), 1)

    def test_obj_duplicate_names_stay_separate(self):
        (self.dir / "d.obj").write_text("v 0 0 0\nv 1 0 0\nv 0 1 0\ng S\nf 1 2 3\ng S\nf 1 2 3\n")
        self.assertEqual([p.name for p in readers.read_obj(self.dir / "d.obj")], ["S", "S (2)"])

    def test_errors_are_readable(self):
        (self.dir / "leer.stl").write_bytes(b"")
        (self.dir / "mull.stl").write_bytes(b"\x00" * 100)
        (self.dir / "kein.obj").write_text("# nur Kommentar\n")
        (self.dir / "x.txt").write_text("x")
        for name, text in [("leer.stl", "leer"), ("mull.stl", "keine gültige STL"), ("kein.obj", "keine Flächen"), ("x.txt", "nicht unterstützt")]:
            with self.assertRaises(readers.ConvertError) as ctx:
                readers.read_mesh(self.dir / name)
            self.assertIn(text, str(ctx.exception))


class GeometryTests(unittest.TestCase):
    def soup(self, size=(10, 20, 30), origin=(0, 0, 0)):
        v, t = box_mesh(size, origin)
        return v[t.reshape(-1)], np.arange(36).reshape(-1, 3)  # triangle soup like an STL

    def test_weld_cube(self):
        v, f = geometry.weld(*self.soup())
        self.assertEqual((len(v), len(f)), (8, 12))

    def test_weld_drops_degenerate_triangles(self):
        v = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 0], [1, 0, 0], [1, 0, 0]], dtype=float)
        _, f = geometry.weld(v, np.array([[0, 1, 2], [3, 4, 5]]))
        self.assertEqual(len(f), 1)

    def test_weld_order_is_stable_under_translation(self):
        v1, f1 = geometry.weld(*self.soup())
        v2, f2 = geometry.weld(*self.soup(origin=(100.3, -7.1, 55.5)))
        np.testing.assert_array_equal(f1, f2)
        np.testing.assert_allclose(v2 - v1, np.tile([100.3, -7.1, 55.5], (8, 1)), atol=1e-9)

    def test_split_shells(self):
        v1, f1 = geometry.weld(*self.soup())
        v2, f2 = geometry.weld(*self.soup(origin=(50, 0, 0)))
        shells = geometry.split_shells(np.vstack([v1, v2]), np.vstack([f1, f2 + len(v1)]))
        self.assertEqual([len(f) for _, f in shells], [12, 12])

    def test_rotations_and_quaternions(self):
        self.assertEqual(len(geometry.ROTATIONS), 24)
        for m in geometry.ROTATIONS:
            self.assertAlmostEqual(np.linalg.det(m), 1.0)
            np.testing.assert_allclose(quat_to_matrix(geometry.rotation_to_quaternion(m)), m, atol=1e-12)

    def parts_of(self, meshes):
        out = []
        for i, (v, t) in enumerate(meshes):
            w, f = geometry.weld(v[t.reshape(-1)], np.arange(len(t) * 3).reshape(-1, 3))
            out.append((f"P{i}", w, f))
        return out

    def test_translated_and_rotated_copies_are_instances(self):
        bolt_v, bolt_t = screw_mesh()
        rot = geometry.ROTATIONS[5]  # some non-trivial rotation
        meshes = [(bolt_v + (10, 0, 0), bolt_t), (bolt_v + (0, 40, 7), bolt_t), (bolt_v @ rot.T + (3, 3, 3), bolt_t)]
        uniques, instances = geometry.find_instances(self.parts_of(meshes))
        self.assertEqual(len(uniques), 1)
        for (v, t), inst in zip(meshes, instances):
            rebuilt = uniques[inst.geometry].vertices @ inst.rotation.T + inst.translation
            original = geometry.weld(v[t.reshape(-1)], np.arange(len(t) * 3).reshape(-1, 3))[0]
            np.testing.assert_allclose(rebuilt, original, atol=1e-6)

    def test_float32_noise_does_not_break_instancing(self):
        bolt_v, bolt_t = screw_mesh()
        far = (bolt_v + (1234.5678, 987.6543, -321.1234)).astype(np.float32).astype(np.float64)  # like an STL export
        uniques, _ = geometry.find_instances(self.parts_of([(bolt_v, bolt_t), (far, bolt_t)]))
        self.assertEqual(len(uniques), 1)

    @staticmethod
    def chiral():
        """Three bars of different length along x, y and z: no rotation turns it into its mirror image."""
        bars = [box_mesh((30, 4, 4)), box_mesh((4, 20, 4)), box_mesh((4, 4, 10))]
        verts, tris, offset = [], [], 0
        for v, t in bars:
            verts.append(v)
            tris.append(t + offset)
            offset += len(v)
        return np.vstack(verts), np.vstack(tris)

    def test_mirror_images_and_different_parts_are_not_merged(self):
        v, t = self.chiral()
        mirrored_flipped = (v * (-1, 1, 1), t[:, ::-1])  # a real mirrored part: winding flipped to keep normals outward
        mirrored_same_index = (v * (-1, 1, 1), t)         # same connectivity, mirrored coordinates
        other = (v * (1, 1.01, 1), t)
        uniques, _ = geometry.find_instances(self.parts_of([(v, t), mirrored_flipped, mirrored_same_index, other]))
        self.assertEqual(len(uniques), 4)
        # sanity: a rotated (not mirrored) copy of the same chiral part IS found
        rotated = (v @ geometry.ROTATIONS[7].T, t)
        uniques, _ = geometry.find_instances(self.parts_of([(v, t), rotated]))
        self.assertEqual(len(uniques), 1)

    def test_instancing_can_be_switched_off(self):
        bolt_v, bolt_t = screw_mesh()
        uniques, _ = geometry.find_instances(self.parts_of([(bolt_v, bolt_t), (bolt_v + 5, bolt_t)]), detect=False)
        self.assertEqual(len(uniques), 2)


class PlanTests(unittest.TestCase):
    def U(self, n):
        return geometry.Unique(np.zeros((3, 3)), np.zeros((n, 3), dtype=int))

    def test_budget_counts_instances_and_keeps_small_parts(self):
        uniques = [self.U(100_000), self.U(40)]
        goals = convert.plan_targets(uniques, [1, 10], 50_000)
        self.assertEqual(goals[1], 40)               # small part untouched
        self.assertLessEqual(goals[0] * 1 + goals[1] * 10, 50_000)
        self.assertGreater(goals[0], 40_000)

    def test_no_reduction_needed(self):
        self.assertEqual(convert.plan_targets([self.U(100)], [2], 1000), [100])
        self.assertEqual(convert.plan_targets([self.U(100)], [2], None), [100])


class EndToEndTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())

    def test_box_stl_to_glb_keeps_the_dimensions_in_metres(self):
        v, t = box_mesh((100, 50, 20))
        write_stl_binary(self.dir / "q.stl", v, t)
        code, out, _ = run_cli(self.dir / "q.stl", "-o", self.dir / "q.glb")
        self.assertEqual(code, 0)
        doc, blob = read_glb(self.dir / "q.glb")
        pos = glb_positions(doc, blob, 0)
        node = doc["nodes"][0]
        world = pos + node.get("translation", [0, 0, 0])
        np.testing.assert_allclose(np.ptp(world, axis=0), [0.1, 0.05, 0.02], atol=1e-7)  # 100 x 50 x 20 mm in metres
        self.assertIn("100,0 × 50,0 × 20,0", out)
        self.assertIn("Dreiecke vorher:   12", out)

    def test_unsimplified_keeps_the_triangle_count(self):
        v, t = sphere_mesh(50, 120, 240)
        write_stl_binary(self.dir / "s.stl", v, t)
        code, out, _ = run_cli(self.dir / "s.stl", "-o", self.dir / "s.glb", "--unvereinfacht")
        self.assertEqual(code, 0)
        doc, _ = read_glb(self.dir / "s.glb")
        indices = doc["accessors"][doc["meshes"][0]["primitives"][0]["indices"]]["count"]
        self.assertEqual(indices // 3, len(t))

    @unittest.skipUnless(HAVE_SIMPLIFY, "fast-simplification nicht installiert")
    def test_target_is_respected_and_shape_kept(self):
        v, t = sphere_mesh(50, 300, 600)
        write_stl_binary(self.dir / "s.stl", v, t)
        code, out, _ = run_cli(self.dir / "s.stl", "-o", self.dir / "s.glb", "--ziel", 20000)
        self.assertEqual(code, 0)
        doc, blob = read_glb(self.dir / "s.glb")
        tris = doc["accessors"][doc["meshes"][0]["primitives"][0]["indices"]]["count"] // 3
        self.assertLessEqual(tris, 20000)
        self.assertGreater(tris, 15000)
        pos = glb_positions(doc, blob, 0)
        np.testing.assert_allclose(np.ptp(pos, axis=0), 0.1, atol=2e-4)  # Ø 100 mm sphere, shape and size kept
        self.assertEqual(doc["asset"]["extras"]["unit"], "mm -> m")

    def test_assembly_keeps_parts_and_shares_geometry(self):
        v, t = screw_mesh()
        objects = [(f"Schraube_{i}", v + (20 * i, 0, 0), t) for i in range(10)]
        from generate import write_obj_objects
        write_obj_objects(self.dir / "b.obj", objects)
        code, out, _ = run_cli(self.dir / "b.obj", "-o", self.dir / "b.glb", "--unvereinfacht")
        self.assertEqual(code, 0)
        doc, _ = read_glb(self.dir / "b.glb")
        self.assertEqual(len(doc["nodes"]), 10)                         # parts stay separate nodes
        self.assertEqual(len(doc["meshes"]), 1)                         # one shared mesh
        self.assertEqual({n["mesh"] for n in doc["nodes"]}, {0})
        self.assertEqual([n["name"] for n in doc["nodes"]][:2], ["Schraube_0", "Schraube_1"])
        code, out, _ = run_cli(self.dir / "b.obj", "-o", self.dir / "b2.glb", "--unvereinfacht", "--keine-instanzen")
        doc2, _ = read_glb(self.dir / "b2.glb")
        self.assertEqual(len(doc2["meshes"]), 10)
        self.assertLess((self.dir / "b.glb").stat().st_size, (self.dir / "b2.glb").stat().st_size / 3)  # K1-06

    def test_shells_option_splits_a_single_stl(self):
        a, ta = box_mesh((10, 10, 10))
        b, tb = box_mesh((10, 10, 10), origin=(40, 0, 0))
        write_stl_binary(self.dir / "m.stl", np.vstack([a, b]), np.vstack([ta, tb + len(a)]))
        run_cli(self.dir / "m.stl", "-o", self.dir / "m1.glb", "--unvereinfacht")
        run_cli(self.dir / "m.stl", "-o", self.dir / "m2.glb", "--unvereinfacht", "--schalen-trennen")
        self.assertEqual(len(read_glb(self.dir / "m1.glb")[0]["nodes"]), 1)
        doc, _ = read_glb(self.dir / "m2.glb")
        self.assertEqual(len(doc["nodes"]), 2)
        self.assertEqual(len(doc["meshes"]), 1)  # identical bodies -> one instanced mesh

    def test_cli_errors(self):
        code, _, err = run_cli(self.dir / "gibt-es-nicht.stl")
        self.assertEqual(code, 1)
        self.assertIn("nicht gefunden", err)
        (self.dir / "x.txt").write_text("hallo")
        code, _, err = run_cli(self.dir / "x.txt")
        self.assertEqual(code, 1)
        self.assertIn("nicht unterstützt", err)
        self.assertNotIn("Traceback", err)
        v, t = box_mesh((1, 1, 1))
        write_stl_binary(self.dir / "a.stl", v, t)
        code, _, err = run_cli(self.dir / "a.stl", "-o", self.dir / "a.stl")
        self.assertEqual(code, 1)
        self.assertIn("identisch", err)
        code, _, _ = run_cli(self.dir / "a.stl", "--ziel", 3)
        self.assertEqual(code, 2)


if __name__ == "__main__":
    unittest.main()
