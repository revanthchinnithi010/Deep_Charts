/**
 * Web — loads CanvasKit WASM via CDN before any <Canvas> can mount.
 *
 * Metro's web dev server has no WASM MIME-type handler: fetching canvaskit.wasm
 * from localhost returns the HTML index page, causing WebAssembly.instantiate()
 * to abort with "expected magic word 00 61 73 6d, found 3c 21 44 4f".
 *
 * The locateFile override redirects WASM loading to the CDN so the browser
 * fetches the real binary directly (version pinned to canvaskit-wasm@0.41.0
 * which is what @shopify/react-native-skia@2.9.0 ships).
 *
 * This file is ONLY bundled on web.  Metro resolves .web.ts over .ts, so the
 * native bundle never sees this import — and never pulls in canvaskit-wasm.
 */
import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/commonjs/web/LoadSkiaWeb";

export async function initSkia(): Promise<void> {
  await LoadSkiaWeb({
    locateFile: (file: string) =>
      `https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.41.0/bin/full/${file}`,
  });
}
