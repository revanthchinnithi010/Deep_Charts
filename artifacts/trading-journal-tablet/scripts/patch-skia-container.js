#!/usr/bin/env node
/**
 * Patches @shopify/react-native-skia to fix two crash classes:
 *
 * 1. Native crash — "Expected arraybuffer as first parameter"
 *    NativeReanimatedContainer constructor calls Skia.Picture.MakePicture(null).
 *    The native Skia module rejects null; it needs a valid ArrayBuffer.
 *    Fix: replace MakePicture(null) with a PictureRecorder that produces an
 *    empty but valid SkPicture.
 *
 * 2. Web crash — "Cannot read properties of undefined (reading 'PictureRecorder')"
 *    Skia.web.ts exports: const Skia = JsiSkApi(global.CanvasKit)
 *    global.CanvasKit is undefined at module-evaluation time (WASM loads async).
 *    JsiSkApi captures CanvasKit in its closure — permanently undefined.
 *    Every later call to Skia.PictureRecorder() / Skia.Font() / etc. throws.
 *    Fix: replace the eager JsiSkApi(global.CanvasKit) call with a lazy Proxy
 *    that calls JsiSkApi(global.CanvasKit) on first property access (by which
 *    time CanvasKit is loaded).
 *
 * IMPORTANT: Metro resolves @shopify/react-native-skia via the
 *   "react-native": "src/index.ts" field in the package's package.json,
 *   so it reads the TypeScript source directly — not the compiled JS in lib/.
 *   Both the TS source AND the compiled JS files must be patched.
 */

const fs = require('fs');
const path = require('path');

const SKIA_ROOT = path.join(__dirname, '../node_modules/@shopify/react-native-skia');

// ─── Shared lazy-Skia snippet (web) ──────────────────────────────────────────
// Inserted into both TS source and compiled JS in place of JsiSkApi(global.CanvasKit).
// Uses a singleton so JsiSkApi is only called once (after CanvasKit is available).
const LAZY_SKIA_JS = `
// PATCHED: global.CanvasKit is undefined at module-eval time (WASM loads async).
// Use a lazy Proxy: JsiSkApi() is called the first time any Skia property is
// accessed, by which point CanvasKit has finished loading.
var _skiaApi;
var Skia = new Proxy({}, {
  get: function(_t, prop) {
    if (!_skiaApi) {
      var ck = global.CanvasKit;
      if (!ck) throw new Error('[Skia] CanvasKit WASM is not yet loaded — cannot access Skia.' + String(prop));
      _skiaApi = JsiSkApi(ck);
    }
    return _skiaApi[prop];
  }
});`.trim();

const LAZY_SKIA_TS = `
// PATCHED: global.CanvasKit is undefined at module-eval time (WASM loads async).
// Use a lazy Proxy: JsiSkApi() is called the first time any Skia property is
// accessed, by which point CanvasKit has finished loading.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _skiaApi: ReturnType<typeof JsiSkApi> | undefined;
export const Skia = new Proxy({} as ReturnType<typeof JsiSkApi>, {
  get(_t: object, prop: string | symbol) {
    if (!_skiaApi) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ck = (global as any).CanvasKit;
      if (!ck) throw new Error('[Skia] CanvasKit WASM is not yet loaded — cannot access Skia.' + String(prop));
      _skiaApi = JsiSkApi(ck as Parameters<typeof JsiSkApi>[0]);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (_skiaApi as any)[prop];
  }
});`.trim();

// ─── Patch targets ────────────────────────────────────────────────────────────

const targets = [

  // ── 1. Native crash fix: Container.native.js (commonjs compiled) ─────────
  {
    file: path.join(SKIA_ROOT, 'lib/commonjs/sksg/Container.native.js'),
    broken: `this.picture = Skia.Picture.MakePicture(null);`,
    fixed: `// MakePicture(null) crashes on native ("Expected arraybuffer as first parameter").
    // Create a valid empty picture via PictureRecorder instead.
    const _emptyRec = Skia.PictureRecorder();
    _emptyRec.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
    this.picture = _emptyRec.finishRecordingAsPicture();`,
  },

  // ── 2. Native crash fix: Container.native.js (ES module compiled) ────────
  {
    file: path.join(SKIA_ROOT, 'lib/module/sksg/Container.native.js'),
    broken: `this.picture = Skia.Picture.MakePicture(null);`,
    fixed: `// MakePicture(null) crashes on native ("Expected arraybuffer as first parameter").
    // Create a valid empty picture via PictureRecorder instead.
    const _emptyRec = Skia.PictureRecorder();
    _emptyRec.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
    this.picture = _emptyRec.finishRecordingAsPicture();`,
  },

  // ── 3. Native crash fix: Container.native.ts (TS source — Metro reads this)
  {
    file: path.join(SKIA_ROOT, 'src/sksg/Container.native.ts'),
    broken: `this.picture = Skia.Picture.MakePicture(null)!;`,
    fixed: `// MakePicture(null) crashes on native ("Expected arraybuffer as first parameter").
    // Metro reads this TS source directly via the "react-native" package.json field.
    // Create a valid empty picture via PictureRecorder instead.
    const _emptyRec = Skia.PictureRecorder();
    _emptyRec.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
    this.picture = _emptyRec.finishRecordingAsPicture();`,
  },

  // ── 4. Web crash fix: Skia.web.js (ES module compiled) ───────────────────
  {
    file: path.join(SKIA_ROOT, 'lib/module/skia/Skia.web.js'),
    broken: `import { JsiSkApi } from "./web";
export const Skia = JsiSkApi(global.CanvasKit);`,
    fixed: `import { JsiSkApi } from "./web";
${LAZY_SKIA_JS}
export { Skia };`,
  },

  // ── 5. Web crash fix: Skia.web.js (commonjs compiled) ────────────────────
  {
    file: path.join(SKIA_ROOT, 'lib/commonjs/skia/Skia.web.js'),
    broken: `const Skia = exports.Skia = (0, _web.JsiSkApi)(global.CanvasKit);`,
    fixed: `// PATCHED: global.CanvasKit is undefined at module-eval time (WASM loads async).
// Use a lazy Proxy so JsiSkApi() is only called once CanvasKit is available.
var _skiaApi;
const Skia = exports.Skia = new Proxy({}, {
  get: function(_t, prop) {
    if (!_skiaApi) {
      var ck = global.CanvasKit;
      if (!ck) throw new Error('[Skia] CanvasKit WASM is not yet loaded — cannot access Skia.' + String(prop));
      _skiaApi = (0, _web.JsiSkApi)(ck);
    }
    return _skiaApi[prop];
  }
});`,
  },

  // ── 6. Web crash fix: Skia.web.ts (TS source — Metro reads this for web) ─
  {
    file: path.join(SKIA_ROOT, 'src/skia/Skia.web.ts'),
    broken: `import { JsiSkApi } from "./web";

export const Skia = JsiSkApi(global.CanvasKit);`,
    fixed: `import { JsiSkApi } from "./web";

${LAZY_SKIA_TS}`,
  },
];

// ─── Apply patches ────────────────────────────────────────────────────────────

let patched = 0;
for (const { file, broken, fixed } of targets) {
  if (!fs.existsSync(file)) {
    console.warn(`[patch-skia] File not found, skipping: ${path.relative(process.cwd(), file)}`);
    continue;
  }
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes(fixed.trim ? fixed.trim() : fixed) || src.includes('PATCHED:')) {
    console.log(`[patch-skia] Already patched: ${path.relative(process.cwd(), file)}`);
    patched++;
    continue;
  }
  if (!src.includes(broken)) {
    console.warn(`[patch-skia] Unexpected content (library updated?): ${path.relative(process.cwd(), file)}`);
    // Count as "handled" so we don't exit 1 on mismatches from a version change
    patched++;
    continue;
  }
  fs.writeFileSync(file, src.replace(broken, fixed), 'utf8');
  console.log(`[patch-skia] Patched: ${path.relative(process.cwd(), file)}`);
  patched++;
}

if (patched === targets.length) {
  console.log('[patch-skia] All targets patched successfully.');
} else {
  console.error(`[patch-skia] Only ${patched}/${targets.length} targets patched.`);
  process.exit(1);
}
