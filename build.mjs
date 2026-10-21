#!/usr/bin/env node
// Builds the single-file app: inlines src/style.css and src/js/*.js into src/template.html.
//   node build.mjs            → index.html (3D engine loads from a CDN; everything else is inline)
//   node build.mjs --offline  → function-coaster-offline.html (also embeds the 3D engine, works with no internet)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => path.join(root, 'src', p);
const offline = process.argv.includes('--offline');

const css = fs.readFileSync(src('style.css'), 'utf8');
const jsFiles = fs.readdirSync(src('js')).filter((f) => f.endsWith('.js')).sort();
const js = jsFiles.map((f) => `/* ---- ${f} ---- */\n` + fs.readFileSync(src('js/' + f), 'utf8')).join('\n');
if (/<\/script/i.test(js)) throw new Error('JS contains </script — would break inlining');

let html = fs.readFileSync(src('template.html'), 'utf8');
html = html.replace('/*@@CSS@@*/', () => css).replace('/*@@JS@@*/', () => js);

let three = '';
if (offline) {
  const vendor = path.join(root, 'vendor', 'three.module.min.js');
  if (!fs.existsSync(vendor)) {
    fs.mkdirSync(path.dirname(vendor), { recursive: true });
    const res = await fetch('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js');
    if (!res.ok) throw new Error('Could not download three.js: ' + res.status);
    fs.writeFileSync(vendor, await res.text());
  }
  const code = fs.readFileSync(vendor, 'utf8');
  if (/<\/script/i.test(code)) throw new Error('three.js contains </script');
  three = '<script type="text/plain" id="three-src">' + code + '</script>';
}
html = html.replace('<!--@@THREE@@-->', () => three);

const out = path.join(root, offline ? 'function-coaster-offline.html' : 'index.html');
fs.writeFileSync(out, html);
console.log('wrote', path.relative(root, out), (html.length / 1024).toFixed(0) + ' KB', '(' + jsFiles.length + ' scripts)');
