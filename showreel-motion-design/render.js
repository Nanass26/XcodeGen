#!/usr/bin/env node
// Rend le showreel image par image : Chromium (via Playwright) dessine chaque
// frame du canvas, ffmpeg l'encode. Plusieurs pages en parallèle, un segment chacune.
//
//   node render.js                              vidéo complète -> build/video.mp4
//   node render.js --sheet 8,22,12              planche contact : 12 images entre t=8 s et t=22 s -> build/sheet.png
//   node render.js --scene 03 --sheet 12        planche contact de la scène 03 (12 images réparties)
//   node render.js --scene 03 --stills 1.5,4    images pleine taille, temps locaux à la scène -> build/still_03_<t>.jpg
//   node render.js --stills 30.5,61             images pleine taille, temps globaux -> build/still_<t>.jpg
//   node render.js --scene 03 --bench           temps de dessin moyen par image (ms) sur la scène
//   (avec --scene, seule cette scène est chargée : ses temps locaux sont aussi les temps globaux)
//   options : --workers N, --out fichier
'use strict';
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = __dirname;
const BUILD = path.join(ROOT, 'build');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i < 0 ? def : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const WORKERS = Number(opt('workers', os.cpus().length));

async function openPage(browser, only) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.join(ROOT, 'index.html') + '?render=1' + (only ? '&only=' + only : ''));
  await page.waitForFunction(() => window.ready || window.loadError, null, { timeout: 60000 });
  if (await page.evaluate(() => window.loadError)) throw new Error(await page.evaluate(() => window.loadError) + '\n' + errors.join('\n'));
  await page.evaluate(() => window.ready);
  if (errors.length) throw new Error('Erreurs dans la page :\n' + errors.join('\n'));
  page.errors = errors;
  return page;
}

async function grab(page, t) {
  await page.evaluate(t => window.renderFrame(t), t);
  if (page.errors.length) throw new Error(`Erreur au rendu de t=${t} :\n` + page.errors.join('\n'));
  return page.screenshot({ type: 'jpeg', quality: 95 });
}

function encoder(out, fps) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg a échoué : ' + c)))));
  return { ff, done };
}

(async () => {
  fs.mkdirSync(BUILD, { recursive: true });
  const browser = await chromium.launch();
  const sceneId = opt('scene', null) ? String(opt('scene')).padStart(2, '0') : null;
  const first = await openPage(browser, sceneId);
  const meta = await first.evaluate(() => window.TIMELINE);
  const sc = sceneId ? meta.scenes.find(s => s.id === sceneId) : null;
  if (sceneId && !sc) throw new Error('Scène inconnue : ' + sceneId);
  const toGlobal = t => (sc ? sc.s + t : t);

  if (opt('sheet', null)) {
    const v = String(opt('sheet')).split(',').map(Number);
    let times;
    if (sc) { const n = v[0] || 12; times = Array.from({ length: n }, (_, k) => sc.s + ((k + 0.5) / n) * (sc.e - sc.s)); }
    else { const [a, b, n = 12] = v; times = Array.from({ length: n }, (_, k) => a + (n === 1 ? 0 : (k / (n - 1)) * (b - a))); }
    const url = await first.evaluate(ts => window.contactSheet(ts, 3), times);
    const out = opt('out', path.join(BUILD, sc ? `sheet_${sc.id}.png` : 'sheet.png'));
    fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
    if (first.errors.length) throw new Error(first.errors.join('\n'));
    console.log(out);
  } else if (opt('stills', null)) {
    for (const s of String(opt('stills')).split(',')) {
      const out = path.join(BUILD, sc ? `still_${sc.id}_${s}.jpg` : `still_${s}.jpg`);
      fs.writeFileSync(out, await grab(first, toGlobal(Number(s))));
      console.log(out);
    }
  } else if (opt('bench', null)) {
    const a = sc ? sc.s : 0, b = sc ? sc.e : meta.duration;
    const ms = await first.evaluate(([a, b]) => {
      const n = Math.max(1, Math.round((b - a) * 30)); let worst = 0; const t0 = performance.now();
      for (let k = 0; k < n; k++) { const s = performance.now(); window.renderFrame(a + k / 30); worst = Math.max(worst, performance.now() - s); }
      return [(performance.now() - t0) / n, worst];
    }, [a, b]);
    console.log(`dessin : ${ms[0].toFixed(1)} ms/image en moyenne, ${ms[1].toFixed(1)} ms au pire`);
  } else {
    if (sc) throw new Error('--scene sert aux aperçus (--sheet, --stills, --bench), pas au rendu complet');
    fs.writeFileSync(path.join(BUILD, 'events.json'), JSON.stringify(meta, null, 1));
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
        if (++done % 300 === 0) console.log(`${done}/${total} images (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      }
      enc.ff.stdin.end();
      await enc.done;
      return out;
    }));
    const list = path.join(BUILD, 'segments.txt');
    fs.writeFileSync(list, segments.map(s => `file '${s}'`).join('\n') + '\n');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', path.join(BUILD, 'video.mp4')], { stdio: 'inherit' });
    segments.forEach(s => fs.unlinkSync(s));
    console.log(`build/video.mp4 : ${total} images en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  await browser.close();
})().catch(e => { console.error(e.message || e); process.exit(1); });
