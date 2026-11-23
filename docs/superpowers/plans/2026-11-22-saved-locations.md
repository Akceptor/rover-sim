# Saved favorite locations implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Save complete, named map locations and reload them offline with the existing simulator selection and SITL safety behavior.

**Architecture:** A dedicated filesystem store owns validated favorite packages. The backend saves the currently loaded terrain/overlay pair and loads favorites through the existing world installation path. A small browser component owns save/remove controls and favorite options without rebuilding the world when the favorite list changes.

**Tech stack:** Existing Node ES modules, filesystem promises, WebSockets, vanilla browser JS and Playwright. No dependencies added.

**Approved spec:** `docs/superpowers/specs/2026-11-22-saved-locations-design.md` (approved in conversation).

## Task 1: Validated offline package store

Files: create `src/saved-locations.js`, `test/saved-locations.test.js`; modify `src/osm-cache.js`, `.gitignore`, `src/config.js` and config tests if needed.

- [ ] Write failing store tests covering round trip, two names at one origin, names/UUID validation, empty OSM, corrupt manifest/terrain/overlay exclusion, missing imagery, partial-write cleanup and removal isolation. Use temporary directories and the existing OSM fixture with synthetic RGB terrain colours. Never fetch network data.
- [ ] Extract the existing processed OSM validator into a reusable export, preserving its key and geometry checks. Its contract is `validateOsmOverlay(overlay, terrain, {defaultHeight=6}={})`, returning the original valid overlay and throwing on mismatch.
- [ ] Implement the store with these contracts:

```js
export class SavedLocations {
 constructor({directory,report=()=>{}}) { this.directory=directory;this.report=report; }
 // Full packages contain {manifest,terrain,overlay}.
 async list() {} // Valid package summaries, bad entries reported and omitted.
 async save({name,terrain,overlay,timeZone,defaultHeight=6}) {} // Summary.
 async read(id) {} // Full validated package.
 async remove(id) {} // Deletes only the UUID directory; rejects invalid IDs.
}
```

Manifest schema: `{version:1,id,name,createdAt,home,size,spacing,timeZone,defaultHeight}`. Summary adds `favorite:true`, `description:'Available offline'` and relief in metres for the existing selector. `id` exposed to the UI is `saved:<uuid>`; filesystem paths use only the validated UUID portion. `read()` accepts that public ID. Names are trimmed 1–80 characters and cannot contain control characters. UUIDs are server-generated with `randomUUID()`.

- [ ] Snapshot inputs before async disk work; validate terrain including RGB colours and OSM matching schema/key. A valid empty overlay is allowed. Save writes `manifest.json`, `terrain.json`, `overlay.json` under a temporary directory and renames it to the final UUID directory after all writes finish. Failure cleans the temporary directory. Use a directory operation injection only if needed to meaningfully test failed writes, otherwise a deliberately invalid filesystem destination suffices.
- [ ] Listing returns `[]` for a missing directory, reports corrupt entries via `report`, and preserves original files. Read validates manifest against terrain home, dimensions, IDs and stored default height. Include source/attribution metadata unchanged. Remove validates ID and deletes only its package, without touching caches or the current world.
- [ ] Add `saved-locations/` to `.gitignore`; validate optional `savedLocationsDir` as a nonempty string in `loadConfig()`.
- [ ] Run `node --test test/saved-locations.test.js test/osm.test.js`; review and commit only Task 1 files as Akceptor.

## Task 2: Backend save/list/remove and offline restore

Files: modify `src/server.js`; create `test/saved-locations-backend.test.js` using existing backend test patterns.

- [ ] Write failing backend tests using isolated ports/temp caches: load a custom exact-origin fixture, save, restart with ordinary terrain/OSM caches absent and importer/Overpass denied, select favorite and verify exact origin and overlay restored with physics held. Also test incomplete save, invalid name/ID, removal broadcast, armed/stale rejection and a list update preserving the current world revision. All test configs set `savedLocationsDir` to temporary storage and never create user favorites in the repository.
- [ ] Construct the store at startup using `config.savedLocationsDir ?? path.join(root,'saved-locations')`; load valid summaries before accepting clients. Report storage errors through existing logging without preventing cockpit startup. Maintain a list of favorites and the selected loaded favorite descriptor separately from builtin presets, so deleting a loaded entry does not break pending GPS verification.
- [ ] Define control messages and server responses:

```js
// browser -> backend
{type:'saveLocation',name,worldRevision}
{type:'removeLocation',id}
// backend -> all browsers after a completed save/removal (no world rebuild)
{type:'favorites',favorites:[/* summaries */],savedId,removedId}
// backend -> requesting browser on error
{type:'error',message:'...'}
```

Include `favorites` and `worldRevision` in `init`; include current `worldRevision` and `canSaveLocation`/`saveLocationHint` in state. Save checks expected revision and captures the currently loaded terrain plus actually installed processed overlay as a matching pair before awaiting writes. Require satellite colours, successful/empty installed OSM and no pending world load/error. Names/IDs are validated on backend. Saving never changes selected location, world, physics or the rover pose.

- [ ] Extend selection resolution for `saved:` IDs, retaining every existing selection guard. `loadPreset` reads the full saved package instead of terrain importer/Overpass when selecting a favorite, prepares the overlay mesh through shared existing logic, and applies the existing revision checks, physics hold and Mission Planner restart/GPS checks. Use saved timezone and original terrain home. Preserve the exact stored overlay even if current `osm.defaultHeight` differs. Explicit `osm:false` may hide overlay installation but must not cause a network request or corrupt the saved data; expose a clear save-disabled reason in that mode.
- [ ] Ensure favorites are available alongside presets in Mission Planner and startup pickers; normal startup can save its loaded world but retains its existing read-only map-selection mode. List update broadcasts must not use `broadcastWorld()` or reset unsent map selections. Deleting a selected but loaded favorite leaves the running world valid; subsequent loads of a deleted ID fail clearly.
- [ ] Run targeted backend tests, `npm test`, and commit Task 2 changes after review.

## Task 3: Favorite controls, browser validation and documentation

Files: create `web/saved-locations.js`, `scripts/saved-locations-smoke.mjs`; modify `web/app.js`, `web/index.html`, `web/style.css`, server static whitelist, `package.json`, `docs/map.md` and `docs/osm.md` as needed.

- [ ] Add a failing Chrome fixture smoke with temporary storage and no external Overpass requests. Verify name/save, Favorites optgroup, cross-page list broadcast without losing an unsubmitted map choice, backend restart/offline load, vectors/imagery retained, missing-data save guidance, remove confirmation/cancel/confirm and no horizontal overflow on mobile. Verify save does not reset world or move vehicle. Use isolated HTTP 8109/UDP9016/MAVLink14574 ports.
- [ ] Implement a small browser component accepting `{send,getState}` or equivalent. Add labelled name input (maxlength80), **Save location**, persistent save status and **Remove favorite** controls below the existing location picker. Use `textContent`/option labels for user names. Populate favorites in their own `<optgroup label="Favorites">` while preserving unsent selections, map coordinates and current world. Use a compact `<dialog>` for removal with the selected location name and cancel/remove buttons. Update save button disabled reason from backend completeness and connection state; disable it for an unsubmitted map pin until that origin has been loaded. Do not reset a user-edited name during state updates. Clear busy state on confirmation/error/reconnect so a failed operation can be retried.
- [ ] Add the component module to the static whitelist and load it from app.js. Handle `favorites` messages without calling `setup()` and without building terrain again. Camera-output mode creates no favorite UI work or map requests.
- [ ] Style the controls to wrap within the existing panel on desktop/mobile. Background camera output keeps its full viewport. Expose **Available offline** for favorites and loading/removal outcomes through existing or dedicated status regions.
- [ ] Add `test:saved-locations` to package scripts and document saving/loading, storage, offline completeness, missing OSM retry, cached imagery/attribution, independent basemap/weather, and deleting a favorite. Keep `saved-locations/` out of Git.
- [ ] Run new smoke, `npm test`, `node scripts/map-smoke.mjs`, `node scripts/video-smoke.mjs`; run terrain-selector native smoke from an available native SITL installation if configured. Restore generated tracked screenshots after verification. Obtain spec-compliance review then code-quality review; fix concrete findings.
- [ ] Commit reviewed feature, merge to main and push under the standing authorization. Report actual test results and any external Overpass availability limitation.

## Progress

- [x] Store implemented and reviewed (26 targeted tests; spec and quality reviews passed).
- [x] Backend integrated and reviewed (12 integration tests; spec and quality reviews passed).
- [ ] Browser flow implemented and reviewed.
- [ ] Final verification, integration and push complete.
