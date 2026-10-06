#!/usr/bin/env node
// Rend la vidéo image par image : Chromium (via Playwright) dessine chaque frame
// du canvas, ffmpeg l'encode. Plusieurs pages travaillent en parallèle, chacune
// sur son propre segment, puis les segments sont concaténés.
//
//   node render.js                    # vidéo complète -> build/video.mp4
//   node render.js --stills 3,20,50   # quelques images fixes -> build/still_<t>.jpg
//   node render.js --workers 2
'use strict';
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = __dirname;
const BUILD = path.join(ROOT, 'build');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const WORKERS = Number(opt('workers', os.cpus().length));
const STILLS = opt('stills', null);

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(ROOT, 'index.html') + '?render=1');
  await page.evaluate(() => window.ready);
  return page;
}

async function grab(page, t) {
  await page.evaluate(t => window.renderFrame(t), t);
  return page.screenshot({ type: 'jpeg', quality: 95 });
}

function encoder(out, fps) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg a échoué : ' + c)))));
  return { ff, done };
}

(async () => {
  fs.mkdirSync(BUILD, { recursive: true });
  const browser = await chromium.launch();
  const first = await openPage(browser);
  const meta = await first.evaluate(() => window.TIMELINE);
  fs.writeFileSync(path.join(BUILD, 'events.json'), JSON.stringify(meta, null, 1));

  if (STILLS) {
    for (const s of STILLS.split(',')) fs.writeFileSync(path.join(BUILD, `still_${s}.jpg`), await grab(first, Number(s)));
    await browser.close();
    return;
  }

  const total = meta.frames, per = Math.ceil(total / WORKERS);
  const pages = [first];
  for (let i = 1; i < WORKERS; i++) pages.push(await openPage(browser));
  let done = 0;
  const t0 = Date.now();
  const segments = await Promise.all(pages.map(async (page, w) => {
    const out = path.join(BUILD, `seg${w}.mp4`);
    const enc = encoder(out, meta.fps);
    for (let f = w * per; f < Math.min(total, (w + 1) * per); f++) {
      const buf = await grab(page, f / meta.fps);
      if (!enc.ff.stdin.write(buf)) await new Promise(r => enc.ff.stdin.once('drain', r));
      if (++done % 150 === 0) console.log(`${done}/${total} images (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
    enc.ff.stdin.end();
    await enc.done;
    return out;
  }));
  await browser.close();

  const list = path.join(BUILD, 'segments.txt');
  fs.writeFileSync(list, segments.map(s => `file '${s}'`).join('\n') + '\n');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', path.join(BUILD, 'video.mp4')], { stdio: 'inherit' });
  segments.forEach(s => fs.unlinkSync(s));
  console.log(`build/video.mp4 : ${total} images en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
})().catch(e => { console.error(e); process.exit(1); });
