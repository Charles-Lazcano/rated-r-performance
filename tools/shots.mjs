// Screenshots of the dyno scene for checking the car fit.
//   node shots.mjs [url] [outdir]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL_ = process.argv[2] || 'http://127.0.0.1:8766/';
const OUT = process.argv[3] || 'shots';
mkdirSync(OUT, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 760 });
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto(URL_, { waitUntil: 'networkidle0', timeout: 90000 });
const loaded = await page.waitForFunction(() => window.__car, { timeout: 60000 }).then(() => true, () => false);
console.log('model loaded:', loaded);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.click('#enterBtn');
await wait(6500);
await page.screenshot({ path: `${OUT}/1-walkin-end.png` });

// full rev: hold the throttle through the limiter, then lift for the overrun pops
const rev = await page.$('#rev');
const box = await rev.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await wait(1500);
await page.screenshot({ path: `${OUT}/2-rev-limiter.png` });
await wait(700);
await page.screenshot({ path: `${OUT}/3-rev-limiter-b.png` });
await page.mouse.up();
await wait(120);
await page.screenshot({ path: `${OUT}/4-lift-pops.png` });

// close-ups: force the camera in the render loop (tick sets position, then calls lookAt)
async function cam(name, pos, look, rev) {
  await page.evaluate((pos, look) => {
    const c = window.__car.camera, T = window.THREE;
    c.lookAt = function () { this.position.set(...pos); T.Object3D.prototype.lookAt.call(this, new T.Vector3(...look)); };
  }, pos, look);
  if (rev) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await wait(2000); }
  else await wait(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  if (rev) await page.mouse.up();
}
const z = await page.evaluate(() => window.__car.car.position.z);
if(process.env.ONLY_HEAD){ await cam('9-headlights', [-1.3, 0.75, z + 4.6], [0, 0.5, z + 1.6]); await browser.close(); process.exit(0);}
await cam('5-side', [6.2, 0.7, z - 0.2], [0, 0.45, z - 0.2]);
await cam('6-rear-wheel', [2.6, 0.45, z - 1.5], [0, 0.35, z - 1.5]);
await cam('7-rear-exhaust', [0.9, 0.55, z - 5.2], [0, 0.4, z - 2.5], true);
await cam('8-front', [2.5, 1.1, z + 5.5], [0, 0.5, z]);
await cam('9-headlights', [-1.3, 0.75, z + 4.6], [0, 0.5, z + 1.6]);

const info = await page.evaluate(() => {
  const c = window.__car, T = window.THREE, v = new T.Vector3();
  return { tips: c.tips.map((t) => t.getWorldPosition(v).toArray().map((n) => +n.toFixed(3))),
    wheels: c.wheels.map((w) => ({ rear: w.rear, pos: w.g.getWorldPosition(v).toArray().map((n) => +n.toFixed(3)) })) };
});
console.log(JSON.stringify(info));
console.log(logs.filter((l) => !/nodes:/.test(l)).slice(0, 20).join('\n'));
console.log((logs.find((l) => /nodes:/.test(l)) || 'no node list').slice(0, 400));
await browser.close();
