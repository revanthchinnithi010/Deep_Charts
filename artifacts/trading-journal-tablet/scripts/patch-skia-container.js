#!/usr/bin/env node
/**
 * Patches @shopify/react-native-skia's Container.native files to fix:
 *   "Expected arraybuffer as first parameter"
 *
 * Root cause: NativeReanimatedContainer constructor calls
 *   Skia.Picture.MakePicture(null) to init a placeholder picture.
 *   The native Skia module rejects null — it requires a valid ArrayBuffer.
 *
 * Fix: replace MakePicture(null) with an empty picture created via
 *   PictureRecorder, which the native module accepts correctly.
 *
 * IMPORTANT: Metro resolves @shopify/react-native-skia via the
 *   "react-native": "src/index.ts" field in the package's package.json,
 *   so it reads the TypeScript source directly — not the compiled JS in lib/.
 *   The TS source file must be patched, otherwise the fix has no effect.
 */

const fs = require('fs');
const path = require('path');

// ── JS compiled files (used by Node.js / non-Metro consumers) ─────────────────
const jsTargets = [
  {
    file: path.join(__dirname, '../node_modules/@shopify/react-native-skia/lib/commonjs/sksg/Container.native.js'),
    broken: `this.picture = Skia.Picture.MakePicture(null);`,
    fixed: `// MakePicture(null) crashes on native ("Expected arraybuffer as first parameter").
    // Create a valid empty picture via PictureRecorder instead.
    const _emptyRec = Skia.PictureRecorder();
    _emptyRec.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
    this.picture = _emptyRec.finishRecordingAsPicture();`,
  },
  {
    file: path.join(__dirname, '../node_modules/@shopify/react-native-skia/lib/module/sksg/Container.native.js'),
    broken: `this.picture = Skia.Picture.MakePicture(null);`,
    fixed: `// MakePicture(null) crashes on native ("Expected arraybuffer as first parameter").
    // Create a valid empty picture via PictureRecorder instead.
    const _emptyRec = Skia.PictureRecorder();
    _emptyRec.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
    this.picture = _emptyRec.finishRecordingAsPicture();`,
  },
  // ── TS source file — Metro reads THIS via "react-native": "src/index.ts" ──
  // Metro resolves @shopify/react-native-skia to src/index.ts (the react-native
  // field in package.json), so the compiled JS in lib/ is never bundled by Metro.
  // Patching only the JS files has no effect at runtime; this TS file must also
  // be patched.
  {
    file: path.join(__dirname, '../node_modules/@shopify/react-native-skia/src/sksg/Container.native.ts'),
    broken: `this.picture = Skia.Picture.MakePicture(null)!;`,
    fixed: `// MakePicture(null) crashes on native ("Expected arraybuffer as first parameter").
    // Metro reads this TS source directly via the "react-native" package.json field.
    // Create a valid empty picture via PictureRecorder instead.
    const _emptyRec = Skia.PictureRecorder();
    _emptyRec.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
    this.picture = _emptyRec.finishRecordingAsPicture();`,
  },
];

const targets = jsTargets;

let patched = 0;
for (const { file, broken, fixed } of targets) {
  if (!fs.existsSync(file)) {
    console.warn(`[patch-skia] File not found, skipping: ${file}`);
    continue;
  }
  const src = fs.readFileSync(file, 'utf8');
  if (src.includes(fixed)) {
    console.log(`[patch-skia] Already patched: ${path.relative(process.cwd(), file)}`);
    patched++;
    continue;
  }
  if (!src.includes(broken)) {
    console.warn(`[patch-skia] Unexpected content (library updated?): ${path.relative(process.cwd(), file)}`);
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
