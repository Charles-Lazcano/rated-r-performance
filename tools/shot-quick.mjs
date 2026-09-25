// One screenshot after the walk-in. node shot-quick.mjs url out.png [noModel] [angleBackend]
import puppeteer from 'puppeteer-core';
const [url, out, noModel, angle = 'd3d11'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=' + angle, '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 760 });
p.on('pageerror', (e) => console.log('pageerror', e.message));
if (noModel) await p.evaluateOnNewDocument(() => { window.CAR_GLB = 'assets/missing.glb'; });
await p.goto(url, { waitUntil: 'networkidle0' }); await p.click('#enterBtn'); await new Promise((r) => setTimeout(r, 6500));
console.log(await p.evaluate(() => { const g = document.createElement('canvas').getContext('webgl'); const d = g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'n/a'; }));
await p.screenshot({ path: out }); await b.close();
