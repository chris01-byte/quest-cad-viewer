import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MM } from './config.js';
import { Model } from './model.js';

/** Error with a message that is fit to show to the user as is. */
export class LoadError extends Error {}

const PALETTE = [0xaeb6c2, 0x8fa8c8, 0xc2a98a, 0x9fb59a, 0xb99aa8, 0xa4a0c8];

function partMaterial(index) {
  return new THREE.MeshStandardMaterial({ color: PALETTE[index % PALETTE.length], metalness: 0.15, roughness: 0.55 });
}

function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function baseName(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/**
 * Units: STL and OBJ carry none and are read as millimetres (Fusion export), converted to metres here.
 * GLB/glTF is metres by definition and is taken over unchanged.
 */
async function loadStl(file) {
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) throw new LoadError(`„${file.name}“ ist leer.`);
  let geometry;
  try {
    geometry = new STLLoader().parse(buffer);
  } catch (e) {
    console.warn('STL parse error', e);
    throw new LoadError(`„${file.name}“ ist keine gültige STL-Datei.`);
  }
  if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
    throw new LoadError(`„${file.name}“ enthält keine Dreiecke. Ist es eine gültige STL-Datei?`);
  }
  geometry.deleteAttribute('normal'); // some exporters write zero normals; flat normals from the triangles are reliable
  geometry.deleteAttribute('color');
  geometry.scale(MM, MM, MM);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, partMaterial(0));
  mesh.name = baseName(file.name);
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

async function loadObj(file) {
  const group = new OBJLoader().parse(await file.text());
  const meshes = [];
  group.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  if (!meshes.length) throw new LoadError(`„${file.name}“ enthält keine Flächen. Ist es eine gültige OBJ-Datei?`);
  // drop lines/points, keep only meshes
  group.traverse((o) => {
    if ((o.isLine || o.isPoints) && o.parent) o.parent.remove(o);
  });
  meshes.forEach((mesh, i) => {
    mesh.geometry.scale(MM, MM, MM);
    mesh.geometry.clearGroups();
    mesh.material = partMaterial(i);
    if (!mesh.name) mesh.name = meshes.length === 1 ? baseName(file.name) : `Teil ${i + 1}`;
  });
  return group;
}

async function loadGltf(file) {
  const data = file.name.toLowerCase().endsWith('.gltf') ? await file.text() : await file.arrayBuffer();
  if (data instanceof ArrayBuffer && new TextDecoder().decode(new Uint8Array(data, 0, 4)) !== 'glTF') {
    throw new LoadError(`„${file.name}“ ist keine gültige GLB-Datei (Kennung „glTF“ fehlt).`);
  }
  let gltf;
  try {
    gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(data, '', resolve, reject));
  } catch (e) {
    const msg = String(e?.message || e);
    if (/DRACOLoader|MeshoptDecoder|KTX2Loader/i.test(msg)) {
      throw new LoadError(`„${file.name}“ ist komprimiert (Draco/Meshopt/KTX2). Bitte unkomprimiert als GLB exportieren oder mit dem Konverter erzeugen.`);
    }
    throw e;
  }
  const scene = gltf.scene;
  if (!countMeshes(scene)) throw new LoadError(`„${file.name}“ enthält keine Geometrie.`);
  // cameras, lights and empty helper nodes are not parts
  const drop = [];
  scene.traverse((o) => {
    if (o.isCamera || o.isLight) drop.push(o);
  });
  drop.forEach((o) => o.parent?.remove(o));
  return scene;
}

function countMeshes(object) {
  let n = 0;
  object.traverse((o) => {
    if (o.isMesh) n++;
  });
  return n;
}

const LOADERS = { stl: loadStl, obj: loadObj, glb: loadGltf, gltf: loadGltf };
const UNIT_NOTE = { stl: 'mm (STL)', obj: 'mm (OBJ)', glb: 'm (GLB)', gltf: 'm (glTF)' };

/** Top-level nodes that carry geometry, unwrapping single-child wrapper groups. */
function findParts(root) {
  let container = root;
  while (container.children.length === 1 && !container.children[0].isMesh && container.children[0].children.length) {
    container = container.children[0];
  }
  return container.children.filter((c) => countMeshes(c) > 0);
}

/**
 * Load one or several files into a single Model. With several files each file becomes one part
 * (assemblies exported as one STL per body keep their absolute positions).
 * @param {File[]} files
 * @returns {Promise<Model>}
 */
export async function loadFiles(files) {
  const groups = [];
  for (const file of files) {
    const ext = extensionOf(file.name);
    const loader = LOADERS[ext];
    if (!loader) {
      const why = ext ? `Dateityp „.${ext}“ wird nicht unterstützt` : 'Die Datei hat keine Endung, der Typ ist nicht erkennbar';
      throw new LoadError(`„${file.name}“: ${why}. Bitte STL, OBJ oder GLB öffnen.`);
    }
    try {
      groups.push(await loader(file));
    } catch (e) {
      if (e instanceof LoadError) throw e;
      throw new LoadError(`„${file.name}“ konnte nicht gelesen werden: ${e?.message || e}`);
    }
  }

  let root;
  let parts;
  if (groups.length === 1) {
    root = groups[0];
    parts = findParts(root);
  } else {
    root = new THREE.Group();
    parts = groups.map((g, i) => {
      g.name = baseName(files[i].name);
      root.add(g);
      return g;
    });
  }
  root.name = 'content';

  const model = new Model({
    name: files.map((f) => f.name).join(', '),
    root,
    parts,
    sourceUnit: [...new Set(files.map((f) => UNIT_NOTE[extensionOf(f.name)]))].join(', '),
  });
  if (model.totalTriangles === 0) throw new LoadError('Das Modell enthält keine Dreiecke.');
  model.centreOnFloor();
  return model;
}
