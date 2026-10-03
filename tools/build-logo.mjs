// Builds the shop's illuminated wall sign as outline-only SVG (no web fonts needed, so it
// renders the same in the header, the favicon and the 3D wall texture).
//   node build-logo.mjs  ->  index.html (inline header sign), favicon.svg, favicon-32/512.png, apple-touch-icon.png
// Fonts: Playfair Display + Montserrat (SIL OFL), via @fontsource.
import opentype from 'opentype.js';
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const font = (pkg, file) => opentype.parse(readFileSync(new URL(`node_modules/@fontsource/${pkg}/files/${file}`, import.meta.url)).buffer);
const serifBold = font('playfair-display', 'playfair-display-latin-800-normal.woff');
const serif = font('playfair-display', 'playfair-display-latin-500-normal.woff');
const sans = font('montserrat', 'montserrat-latin-300-normal.woff');

const f = (n) => +n.toFixed(2);
// path for `text`, scaled so its cap height is `cap` and its left/baseline sit at (x, y); returns {d, w}
function glyphs(fnt, text, cap, x, y, tracking = 0) {
  const s = cap / (fnt.tables.os2.sCapHeight || fnt.unitsPerEm * 0.7);
  let pen = 0, d = '', left = null, right = 0;
  for (const g of fnt.stringToGlyphs(text)) {
    const p = g.getPath(0, 0, fnt.unitsPerEm), bb = p.getBoundingBox();
    if (left === null) left = bb.x1;
    const ox = x + (pen - left) * s;
    p.commands.forEach((c) => { for (const k of ['x', 'x1', 'x2']) if (k in c) c[k] = c[k] * s + ox; for (const k of ['y', 'y1', 'y2']) if (k in c) c[k] = c[k] * s + y; });
    d += p.toPathData(2);
    right = pen + bb.x2;
    pen += g.advanceWidth + tracking / s;
  }
  return { d, w: (right - left) * s };
}

/* ---------- the wall sign: ~260 x 92 face, padded for the blue LED halo ---------- */
const H = 92, PAD = 36; let W;
const BOX = { x: 12, y: 12, h: 52 }, M = 9; // black panel; M = side margin around RATED
const rated = glyphs(serifBold, 'RATED', BOX.h * 0.62, BOX.x + M, BOX.y + BOX.h * 0.81);
BOX.w = rated.w + 2 * M;
const rCap = BOX.h + 4, rx = BOX.x + BOX.w + 7;
const bigR = glyphs(serif, 'R', rCap, rx, BOX.y + BOX.h);
W = Math.round(rx + bigR.w + 13);
const pCap = 7.6, pY = 80.5, pSpan = W - 56;
const perfW = glyphs(sans, 'PERFORMANCE', pCap, 0, 0).w;
const perf = glyphs(sans, 'PERFORMANCE', pCap, (W - pSpan) / 2, pY, (pSpan - perfW) / 10);
console.log(`RATED panel ${f(BOX.w)} wide, R ends at ${f(rx + bigR.w)} of ${W}, PERFORMANCE ${f(pSpan)} wide`);

const sign = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-PAD} ${-PAD} ${W + 2 * PAD} ${H + 2 * PAD}" role="img" aria-label="Rated R Performance">
<title>Rated R Performance</title>
<defs><filter id="rrHalo" filterUnits="userSpaceOnUse" x="${-PAD}" y="${-PAD}" width="${W + 2 * PAD}" height="${H + 2 * PAD}"><feGaussianBlur stdDeviation="11"/><feComponentTransfer><feFuncA type="linear" slope="2.2"/></feComponentTransfer></filter>
<filter id="rrHaloTight" filterUnits="userSpaceOnUse" x="${-PAD}" y="${-PAD}" width="${W + 2 * PAD}" height="${H + 2 * PAD}"><feGaussianBlur stdDeviation="3.5"/></filter></defs>
<rect x="-6" y="-4" width="${W + 12}" height="${H + 8}" rx="6" fill="#2f4dff" filter="url(#rrHalo)"/>
<rect x="-2" y="-1" width="${W + 4}" height="${H + 2}" rx="3" fill="#1e3cff" filter="url(#rrHaloTight)"/>
<rect width="${W}" height="${H}" rx="1.5" fill="#f8f8f4"/>
<rect x="4.5" y="4.5" width="${W - 9}" height="${H - 9}" fill="none" stroke="#0b0b0c" stroke-width="2.2"/>
<rect x="${BOX.x}" y="${BOX.y}" width="${f(BOX.w)}" height="${BOX.h}" fill="#0b0b0c"/>
<path fill="#f8f8f4" d="${rated.d}"/>
<path fill="#0b0b0c" d="${bigR.d}"/>
<path fill="#1a1a1c" d="${perf.d}"/>
</svg>`;

/* ---------- favicon: the sign's big R on its white face, ringed in the blue halo ---------- */
const favR = glyphs(serif, 'R', 40, 0, 0);
const fav = glyphs(serif, 'R', 40, 32 - favR.w / 2, 52);
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="12" fill="#1e3cff"/>
<rect x="4" y="4" width="56" height="56" rx="8" fill="#f8f8f4"/>
<rect x="8" y="8" width="48" height="48" rx="3" fill="none" stroke="#0b0b0c" stroke-width="1.6"/>
<path fill="#0b0b0c" d="${fav.d}"/>
</svg>`;

writeFileSync(new URL('favicon.svg', root), favicon + '\n');
for (const [file, size] of [['favicon-32.png', 32], ['favicon-512.png', 512], ['apple-touch-icon.png', 180]])
  await sharp(Buffer.from(favicon), { density: 72 * size / 64 }).resize(size, size).png().toFile(new URL(file, root).pathname.replace(/^\/(\w:)/, '$1'));

// header: replace everything between the sign markers in index.html
const htmlFile = new URL('index.html', root);
const html = readFileSync(htmlFile, 'utf8');
const re = /(<!--sign-->)[\s\S]*?(<!--\/sign-->)/;
if (!re.test(html)) throw new Error('<!--sign--> markers not found in index.html');
writeFileSync(htmlFile, html.replace(re, `$1${sign.replace(/\n/g, '')}$2`));
console.log('wrote sign into index.html, favicon.svg and PNG icons');
