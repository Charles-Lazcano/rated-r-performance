// Bakes the Sketchfab Corvette into a small, phone-friendly GLB for the dyno scene.
//   node build-model.mjs [source.glb]   ->  ../assets/car.glb
//
// The source has 652 meshes (~650 draw calls). We bake every node transform into
// its vertices and join primitives by material into six nodes:
//   body, calipers, wheel_FL, wheel_FR, wheel_RL, wheel_RR
// Each wheel node is re-pivoted so its origin is the wheel's own center, which
// lets the page spin it with a single rotation. Then: dedup, weld, WebP textures
// capped at 1024px, and KHR_mesh_quantization. No Draco (decoder host is blocked).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, textureCompress, transformPrimitive, joinPrimitives } from '@gltf-transform/functions';
import sharp from 'sharp';
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SRC = process.argv[2] || join(homedir(), 'Downloads', '2019_chevrolet_corvette_zr1.glb');
const OUT = new URL('../assets/car.glb', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(SRC);
const root = doc.getRoot();
const scene = root.getDefaultScene() || root.listScenes()[0];

const WHEELS = { '3DWheel Front L': 'wheel_FL', '3DWheel Front R': 'wheel_FR', '3DWheel Rear L': 'wheel_RL', '3DWheel Rear R': 'wheel_RR' };
function groupOf(node) {
  for (let n = node; n; n = n.getParentNode()) {
    const name = n.getName();
    if (WHEELS[name]) return WHEELS[name];
    if (/^Calliper /.test(name) || name === 'Common') return 'calipers';
  }
  return 'body';
}

// Deep-copy a primitive so baking one instance doesn't move shared accessors.
function detach(prim) {
  const p = prim.clone();
  for (const sem of p.listSemantics()) p.setAttribute(sem, p.getAttribute(sem).clone());
  if (p.getIndices()) p.setIndices(p.getIndices().clone());
  for (const t of p.listTargets()) for (const sem of t.listSemantics()) t.setAttribute(sem, t.getAttribute(sem).clone());
  return p;
}

// 1. bake world transforms, bucket by group
const groups = {};
const meshNodes = [];
scene.traverse((n) => { if (n.getMesh()) meshNodes.push(n); });
for (const node of meshNodes) {
  const g = groupOf(node), m = node.getWorldMatrix();
  for (const prim of node.getMesh().listPrimitives()) {
    const p = detach(prim);
    transformPrimitive(p, m);
    (groups[g] ||= []).push(p);
  }
}

// The source uses one material for headlights and taillights. Split its
// triangles front/back (+z is the nose in the source) into two materials.
const lightMat = root.listMaterials().find((m) => /LightA_Material/.test(m.getName()));
if (lightMat) {
  const headMat = lightMat.setName('headlight').setEmissiveFactor([0.87, 0.91, 1]);
  const tailMat = lightMat.clone().setName('taillight').setEmissiveFactor([0.89, 0.15, 0.18]);
  const buffer = root.listBuffers()[0];
  groups.body = groups.body.flatMap((p) => {
    if (p.getMaterial() !== lightMat || !p.getIndices()) return [p];
    const idx = p.getIndices().getArray(), pos = p.getAttribute('POSITION').getArray(), front = [], rear = [];
    for (let t = 0; t < idx.length; t += 3) {
      const z = pos[idx[t] * 3 + 2] + pos[idx[t + 1] * 3 + 2] + pos[idx[t + 2] * 3 + 2];
      (z > 0 ? front : rear).push(idx[t], idx[t + 1], idx[t + 2]);
    }
    const rp = detach(p);
    p.setIndices(doc.createAccessor().setType('SCALAR').setBuffer(buffer).setArray(new Uint32Array(front)));
    rp.setIndices(doc.createAccessor().setType('SCALAR').setBuffer(buffer).setArray(new Uint32Array(rear))).setMaterial(tailMat);
    return [p, rp];
  });
}

// 2. bounds helpers (float positions after baking)
function bounds(prims) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) { const a = p.getAttribute('POSITION').getArray();
    for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], a[i + k]); mx[k] = Math.max(mx[k], a[i + k]); } }
  return { min: mn, max: mx, center: mn.map((v, k) => (v + mx[k]) / 2) };
}
function shift(prims, d) {
  for (const p of prims) { const acc = p.getAttribute('POSITION'), a = acc.getArray();
    for (let i = 0; i < a.length; i += 3) { a[i] -= d[0]; a[i + 1] -= d[1]; a[i + 2] -= d[2]; } acc.setArray(a); }
}

// 3. join by material/mode/attribute layout
function keyOf(p) {
  return [p.getMaterial() ? root.listMaterials().indexOf(p.getMaterial()) : -1, p.getMode(), !!p.getIndices(),
    p.listSemantics().sort().map((s) => s + ':' + p.getAttribute(s).getComponentType() + ':' + p.getAttribute(s).getElementSize()).join(',')].join('|');
}
function joined(prims) {
  const buckets = new Map();
  for (const p of prims) { const k = keyOf(p); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(p); }
  const out = [];
  for (const list of buckets.values()) {
    if (list.length === 1) { out.push(list[0]); continue; }
    out.push(joinPrimitives(list)); list.forEach((p) => p.dispose());
  }
  return out;
}

// 4. rebuild the scene as six flat nodes
for (const child of scene.listChildren()) scene.removeChild(child);
const report = {};
for (const [name, prims] of Object.entries(groups)) {
  const b = bounds(prims);
  const pivot = name.startsWith('wheel_') ? b.center : [0, 0, 0];
  shift(prims, pivot);
  const mesh = doc.createMesh(name);
  for (const p of joined(prims)) mesh.addPrimitive(p);
  scene.addChild(doc.createNode(name).setMesh(mesh).setTranslation(pivot));
  report[name] = { prims: mesh.listPrimitives().length, min: b.min.map((v) => +v.toFixed(3)), max: b.max.map((v) => +v.toFixed(3)) };
}
for (const n of meshNodes) n.dispose();

// Friendly names the page looks for.
for (const mat of root.listMaterials()) {
  const n = mat.getName();
  if (n === 'red_glass') mat.setName('taillight_glass');
  else if (n === 'orange_glass') mat.setName('indicator_glass');
  else if (/Paint_Material/.test(n)) mat.setName('paint');
}

await doc.transform(
  prune(), dedup(), weld(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
  quantize(),
  prune(),
);
await io.write(OUT, doc);

console.log(JSON.stringify(report, null, 1));
console.log('draw calls:', root.listMeshes().reduce((s, m) => s + m.listPrimitives().length, 0),
  ' size:', (statSync(OUT).size / 1048576).toFixed(2), 'MB ->', OUT);
