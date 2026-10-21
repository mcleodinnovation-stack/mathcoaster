// Loads the browser-side engine files into a Node VM context for testing.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadEngine(files = ['00-util.js', '01-math.js', '02-analysis.js', '03-physics.js']) {
  const ctx = { console, Math, Date, JSON, Float64Array, Array, Number, Set, Map, Object, String, Error };
  vm.createContext(ctx);
  for (const f of files) {
    const p = path.join(root, 'src/js', f);
    if (!fs.existsSync(p)) continue;
    vm.runInContext(fs.readFileSync(p, 'utf8') + '\n;this.FC = FC; this.FCMath = typeof FCMath!=="undefined"?FCMath:undefined; this.FCAnalysis = typeof FCAnalysis!=="undefined"?FCAnalysis:undefined; this.FCPhysics = typeof FCPhysics!=="undefined"?FCPhysics:undefined;', ctx, { filename: f });
  }
  return ctx;
}

let failures = 0, passes = 0;
export function check(name, cond, detail) {
  if (cond) { passes++; }
  else { failures++; console.log('FAIL:', name, detail !== undefined ? detail : ''); }
}
export function near(a, b, tol = 1e-6) { return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)); }
export function summary() {
  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures) process.exitCode = 1;
}
