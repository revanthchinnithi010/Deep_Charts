#!/usr/bin/env node
/**
 * Patches @shopify/react-native-skia's Container.native.js to fix:
 *   "Expected arraybuffer as first parameter"
 *
 * Root cause: NativeReanimatedContainer constructor calls
 *   Skia.Picture.MakePicture(null) to init a placeholder picture.
 *   The native Skia module rejects null — it requires a valid ArrayBuffer.
 *
 * Fix: replace MakePicture(null) with an empty picture created via
 *   PictureRecorder, which the native module accepts correctly.
 */

const fs = require('fs');
const path = require('path');

const targets = [
  path.join(__dirname, '../node_modules/@shopify/react-native-skia/lib/commonjs/sksg/Container.native.js'),
  path.join(__dirname, '../node_modules/@shopify/react-native-skia/lib/module/sksg/Container.native.js'),
];

const BROKEN = `this.picture = Skia.Picture.MakePicture(null);`;
const FIXED = `// MakePicture(null) crashes on native ("Expected arraybuffer as first parameter").
    // Create a valid empty picture via PictureRecorder instead.
    const _emptyRec = Skia.PictureRecorder();
    _emptyRec.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
    this.picture = _emptyRec.finishRecordingAsPicture();`;

let patched = 0;
for (const target of targets) {
  if (!fs.existsSync(target)) {
    console.warn(`[patch-skia] File not found, skipping: ${target}`);
    continue;
  }
  const src = fs.readFileSync(target, 'utf8');
  if (src.includes(FIXED)) {
    console.log(`[patch-skia] Already patched: ${path.relative(process.cwd(), target)}`);
    patched++;
    continue;
  }
  if (!src.includes(BROKEN)) {
    console.warn(`[patch-skia] Unexpected content (library updated?): ${path.relative(process.cwd(), target)}`);
    continue;
  }
  fs.writeFileSync(target, src.replace(BROKEN, FIXED), 'utf8');
  console.log(`[patch-skia] Patched: ${path.relative(process.cwd(), target)}`);
  patched++;
}

if (patched === targets.length) {
  console.log('[patch-skia] All targets patched successfully.');
} else {
  console.error(`[patch-skia] Only ${patched}/${targets.length} targets patched.`);
  process.exit(1);
}
