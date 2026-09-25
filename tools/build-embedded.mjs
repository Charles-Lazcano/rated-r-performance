// Single-file build for hosts that only take one HTML file (claude.ai artifacts):
// inlines assets/car.glb and logo.png as data URIs.
//   node build-embedded.mjs  ->  ../rated-r-performance.embedded.html  (must stay under 16 MB)
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root));
const uri = (f, type) => `data:${type};base64,${read(f).toString('base64')}`;

let html = read('index.html').toString('utf8');
const logo = uri('logo.png', 'image/png');
const n = html.split("'logo.png'").length + html.split('"logo.png"').length - 2;
html = html.replaceAll('"logo.png"', `"${logo}"`).replaceAll("'logo.png'", `'${logo}'`);
const three = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>';
if (!html.includes(three)) throw new Error('three.js script tag not found');
html = html.replace(three, `<script>window.CAR_GLB = '${uri('assets/car.glb', 'model/gltf-binary')}';</script>\n${three}`);

const out = new URL('rated-r-performance.embedded.html', root);
writeFileSync(out, html);
const mb = Buffer.byteLength(html) / 1048576;
console.log(`inlined car.glb + logo.png (${n} refs) -> rated-r-performance.embedded.html ${mb.toFixed(2)} MB`);
if (mb >= 16) { console.error('over the 16 MB single-file limit'); process.exit(1); }
