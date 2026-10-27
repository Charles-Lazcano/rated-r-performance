// Layout check for the booking page. node check-booking.mjs file.html outdir
import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
const [file, outDir] = process.argv.slice(2);
const sizes = [[320,640],[360,740],[390,844],[600,900],[768,1024],[1280,800],[1440,900]];
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [w, h] of sizes) {
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h, isMobile: w < 700, hasTouch: w < 700, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.log('pageerror', e.message));
  await p.evaluateOnNewDocument(() => { window.CAR_GLB = 'assets/missing.glb'; });
  await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const tap = async (sel) => { await p.$eval(sel, (e) => e.scrollIntoView({ block: 'center' })); await wait(150); await p.click(sel); };
  await p.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await wait(400);
  const res = [];
  const probe = async (label) => res.push(await p.evaluate((label) => {
    const vw = document.documentElement.clientWidth, out = [];
    const sw = document.documentElement.scrollWidth;
    if (sw > vw) out.push('PAGE OVERFLOW ' + sw + '>' + vw);
    document.querySelectorAll('header *, #book *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || getComputedStyle(el).visibility === 'hidden') return;
      if (el.closest('[hidden]') || el.closest('.days')) return;
      if (r.right > vw + 0.5 || r.left < -0.5) out.push('overflow ' + el.tagName + '.' + el.className + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
    });
    const bar = document.querySelector('.bar').getBoundingClientRect();
    const pane = document.querySelector('.bk-pane:not([hidden])'), nav = pane.querySelector('.bk-nav').getBoundingClientRect();
    const small = [...pane.querySelectorAll('button:not(.day),input:not([type=checkbox]),select')].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44).length;
    const prog = getComputedStyle(document.querySelector('.bk-prog')).display !== 'none' ? ' prog="' + document.querySelector('.bk-prog').textContent + '"' : '';
    return label + ' header=' + Math.round(bar.height) + ' nav.bottom=' + Math.round(nav.bottom) + '/' + innerHeight + ' small-targets=' + small + prog + ' ' + out.slice(0, 6).join(' | ');
  }, label));
  // gap
  res.push(await p.evaluate(() => {
    const es = document.querySelector('#book .espanol').getBoundingClientRect(), h2 = document.querySelector('#book h2').getBoundingClientRect();
    const prev = document.querySelector('#book').previousElementSibling.getBoundingClientRect();
    return 'espanol.bottom->h2.top=' + Math.round(h2.top - es.bottom) + ' prevSection.bottom->espanol.top=' + Math.round(es.top - prev.bottom);
  }));
  await p.click('.call.book'); await wait(900);
  res.push(await p.evaluate(() => 'after #book anchor: espanol.top=' + Math.round(document.querySelector('#book .espanol').getBoundingClientRect().top) + ' header.bottom=' + Math.round(document.querySelector('.bar').getBoundingClientRect().bottom)));
  await p.screenshot({ path: `${outDir}/${w}-0-anchor.png` });
  await probe('step1');
  await p.evaluate(() => scrollBy(0, 200)); await wait(150);
  res.push(await p.evaluate(() => { const n = document.querySelector('.bk-pane:not([hidden]) .bk-nav').getBoundingClientRect(); return 'step1 mid-scroll nav.bottom=' + Math.round(n.bottom) + '/' + innerHeight; }));
  await tap('.pkg:nth-child(2)'); await wait(100);
  const nextBtn = () => p.$('.bk-pane:not([hidden]) [data-next]');
  await p.screenshot({ path: `${outDir}/${w}-1.png`, fullPage: false });
  await (await nextBtn()).click(); await wait(900);
  res.push(await p.evaluate(() => 'step2 booker.top=' + Math.round(document.querySelector('#booker').getBoundingClientRect().top) + ' header.bottom=' + Math.round(document.querySelector('.bar').getBoundingClientRect().bottom) + ' solid=' + document.querySelector('.bar').classList.contains('solid')));
  await probe('step2');
  await p.screenshot({ path: `${outDir}/${w}-2.png` });
  await tap('.slot:not(:disabled)'); await wait(100);
  await (await nextBtn()).click(); await wait(900);
  res.push('step3 next disabled before fill=' + await p.$eval('[data-pane="3"] [data-next]', (b) => b.disabled));
  await p.type('[name=name]', 'Test Driver'); await p.type('[name=phone]', '2105550142'); await p.type('[name=email]', 't@example.com');
  if (await p.$('[name=year]')) { await p.type('[name=year]', '2019'); await p.type('[name=car]', 'Camaro SS'); } else await p.type('[name=car]', '2019 Camaro SS');
  await tap('[name=policy]');
  await probe('step3');
  res.push(await p.evaluate(() => 'input font=' + [...document.querySelectorAll('#carForm input:not([type=checkbox]),#carForm select,#carForm textarea')].map((e) => parseFloat(getComputedStyle(e).fontSize)).join(',')));
  await p.screenshot({ path: `${outDir}/${w}-3.png` });
  res.push('step3 next disabled after fill=' + await p.$eval('[data-pane="3"] [data-next]', (b) => b.disabled));
  await (await nextBtn()).click(); await wait(900);
  await probe('step4');
  res.push(await p.evaluate(() => 'receipt car=' + [...document.querySelectorAll('#receipt .line')].find((l) => l.textContent.startsWith('Car')).textContent));
  await p.screenshot({ path: `${outDir}/${w}-4.png` });
  await tap('#payBtn'); await wait(300); await p.screenshot({ path: `${outDir}/${w}-4b-checkout.png` });
  await p.click('#ckPay'); await wait(2200);
  await probe('step5');
  await p.screenshot({ path: `${outDir}/${w}-5.png` });
  console.log(`== ${w}x${h}\n  ` + res.join('\n  '));
  await p.close();
}
await b.close();
