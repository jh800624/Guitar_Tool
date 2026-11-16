# Guitar Tool

Teaching-focused guitar fretboard, chord snapshot, TAB, playback, and PDF tool.

## Development

```sh
npm install
npm run dev
```

Build a distributable static site with `npm run build`. The output is in `dist/`.

## Architecture

- `src/music/`: testable music-theory and TAB-duration rules.
- `src/core/`: browser storage and Web Audio boundaries.
- `src/main.js`: application dependency boundary exposed to feature code during the incremental migration.
- `index.html`: current UI and feature controllers. Its dependencies now come from the local Vite bundle instead of remote runtime CDN scripts.
- `test/`: regression tests for musical rules.

Existing browser data uses the stable `guitar-tool-tab-v1` and `guitar-tool-snapshots-v1` keys, so the migration preserves saved lessons.
