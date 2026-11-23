# OSM Settings Implementation Plan

**Goal:** Change and persist OSM connection preferences from the existing Settings dialog, with automatic regional routing.

**Architecture:** A shared pure settings model validates the form and resolves regional endpoints from terrain bounds. A backend store atomically saves local preferences beside the selected config; WebSocket messages apply settings and reuse the existing safe retry path. A small browser controller manages the form without rebuilding the world.

**Tech stack:** Node.js, native WebSocket browser controls, existing Playwright and node:test.

### 1. Settings model and persistence

- [x] Add `test/osm-settings.test.js`: table-driven assertions for Kyiv, Lviv, Lima, Cusco, North/Central America, Africa, Asia, Oceania, ambiguous borders and explicit overrides; reject invalid URL, timeout and extra keys. Persist and reload preferences in a temporary directory; verify failed writes preserve the previous file.
- [x] Run `node --test test/osm-settings.test.js`, expect missing exports before implementation.
- [x] Create `src/osm-settings-model.js` with `validateOsmSettings`, `settingsFromConfig`, `resolveOsmEndpoint` and server choices; create `src/osm-settings.js` with atomic load/save and serialized writes. Ignore `*.osm-settings.local.json`.
- [x] Re-run focused tests, expect all pass.

### 2. Backend integration

- [x] Extend `test/osm-backend.test.js` with save acknowledgment, invalid input, persistence/restart and Save & retry using a different local fixture endpoint; verify original config and world revision remain unchanged and retry defers once physics starts. Verify updates during loads fail explicitly.
- [x] Run `node --test test/osm-backend.test.js`, expect new protocol assertions to fail before server changes.
- [x] Modify `src/server.js`: load local preferences, publish `osmSettings` in init and state, expose model/controller assets, handle `saveOsmSettings` with request correlation, reject loading/disabled updates, invoke existing retry only after successful persistence. Resolve actual endpoint per terrain bounds in `prepareOverlay`.
- [x] Run focused backend and OSM tests, expect all pass.

### 3. Browser controls and verification

- [x] Add a local-fixture Playwright smoke in `scripts/osm-settings-smoke.mjs` exercising visible controls, save/retry, restart, multi-tab edits, loading guards, offline feedback and narrow screen layout. Run before adding UI; expect missing selector failure.
- [x] Add OpenStreetMap form and Configure OSM shortcut in `web/index.html`, scoped styles in `web/style.css`, and controller `web/osm-settings.js`; wire init/state/message/disconnect in `web/app.js`.
- [x] Add package script and update `docs/osm.md` with region policy, persistence and live retry behavior.
- [x] Run `npm test`, `npm run test:osm-settings`, `npm run test:osm` and `git diff --check`. Review final diff and resolve important findings. Leave branch changes local.

Verification: 153 tests passed, one Windows-only skip. OSM settings and OSM rendering/collision Chrome smokes passed. Independent code review found no blocking or important issues. Regional routing uses bundled Geofabrik extract outlines, replacing the preliminary boxes during boundary review.
