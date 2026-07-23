/**
 * Native (Android / iOS) — no-op.
 *
 * @shopify/react-native-skia initialises itself through its native module at
 * JSI install time.  Nothing extra is needed here and canvaskit-wasm must
 * never be imported on native (it pulls in Node.js built-ins like "fs" that
 * Metro cannot resolve for Android/iOS targets).
 */
export async function initSkia(): Promise<void> {
  // intentionally empty
}
