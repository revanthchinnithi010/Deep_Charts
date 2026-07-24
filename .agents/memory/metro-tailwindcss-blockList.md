---
name: Metro FallbackWatcher + tailwindcss temp dirs
description: Metro crashes with ENOENT when watching tailwindcss_tmp_* directories that get deleted during compilation; fix is to add the pattern to metro.config.js blockList.
---

## Rule

Any package that creates and immediately deletes temporary directories under the monorepo `node_modules` tree will crash Metro's `FallbackWatcher` with `ENOENT: no such file or directory, watch …`. Add a regex for the temp-dir name to `config.resolver.blockList` in `metro.config.js`.

**Why:** Metro watches the entire monorepo root (`watchFolders: [monorepoRoot]`). When a directory it started watching is removed mid-watch, `FallbackWatcher` throws `ENOENT` and kills the bundler process.

**How to apply:** In `artifacts/trading-journal-tablet/metro.config.js`, append the pattern to the existing `blockList` array alongside `/\/\.local\/.*/`.

Example fix applied:
```js
config.resolver.blockList = [
  /\/\.local\/.*/,
  /tailwindcss_tmp/,   // ← tailwindcss deletes these mid-watch
];
```

If another package causes the same crash, check the `path` field in the ENOENT error and add its pattern here.
