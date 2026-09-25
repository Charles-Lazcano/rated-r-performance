// Prints the built car.glb in meters (scaled to 4.6 m long, rear = -z like the source)
// so wheel, light and exhaust positions can be checked by hand.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(new URL('../assets/car.glb', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const scene = doc.getRoot().listScenes()[0];
const b = getBounds(scene), L = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]), s = 4.6 / L;
const m = (v) => v.map((x, k) => +((x - (k === 1 ? b.min[1] : 0)) * s).toFixed(3));
console.log('scene min', m(b.min), 'max', m(b.max), 'scale', s.toFixed(2));

function pts(node, prim, fn) {
  const wm = node.getWorldMatrix(), a = prim.getAttribute('POSITION'), e = [];
  for (let i = 0; i < a.getCount(); i++) { a.getElement(i, e);
    const x = wm[0] * e[0] + wm[4] * e[1] + wm[8] * e[2] + wm[12], y = wm[1] * e[0] + wm[5] * e[1] + wm[9] * e[2] + wm[13], z = wm[2] * e[0] + wm[6] * e[1] + wm[10] * e[2] + wm[14];
    fn(x, y, z); }
}
for (const node of scene.listChildren()) {
  const nb = getBounds(node);
  console.log(node.getName(), 'min', m(nb.min), 'max', m(nb.max));
  for (const prim of node.getMesh().listPrimitives()) {
    const mat = prim.getMaterial()?.getName() || '-';
    if (!/light|glass|Base|Carbon1|Coloured|Engine/.test(mat)) continue;
    // split front/rear halves for light materials
    const halves = { front: [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9], 0], rear: [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9], 0] };
    pts(node, prim, (x, y, z) => { const h = halves[z > 0 ? 'front' : 'rear']; [x, y, z].forEach((v, k) => { h[0][k] = Math.min(h[0][k], v); h[1][k] = Math.max(h[1][k], v); }); h[2]++; });
    for (const [k, h] of Object.entries(halves)) if (h[2]) console.log('   ', mat.slice(0, 40), k, h[2], 'min', m(h[0]), 'max', m(h[1]));
  }
}

// Exhaust: rear-most geometry near the centerline, low on the car.
const rearZ = b.min[2], cand = [];
for (const node of scene.listChildren()) for (const prim of node.getMesh().listPrimitives())
  pts(node, prim, (x, y, z) => { if (Math.abs(x) * s < 0.5 && (y - b.min[1]) * s < 0.7 && (z - rearZ) * s < 0.45) cand.push([x, y, z, prim.getMaterial()?.getName()]); });
const grid = {};
for (const [x, y, z, mat] of cand) { const k = (Math.round(x * s / 0.04) * 0.04).toFixed(2) + ',' + (Math.round((y - b.min[1]) * s / 0.04) * 0.04).toFixed(2); const c = grid[k] ||= { n: 0, z: 1e9, mats: new Set() }; c.n++; c.z = Math.min(c.z, (z - rearZ) * s); c.mats.add(mat?.slice(0, 20)); }
console.log('rear-most cells within 12cm of the tail (x,y : count, depth-from-tail, materials):');
Object.entries(grid).sort((a, b) => a[1].z - b[1].z).slice(0, 40).forEach(([k, c]) => console.log('  ', k, c.n, c.z.toFixed(3), [...c.mats].join('/')));
