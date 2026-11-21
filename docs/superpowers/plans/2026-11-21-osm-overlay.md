# OSM overlay implementation plan

**Goal:** Recognizable mapped roads and solid buildings on existing terrain, including Mission Planner selected starts.

**Design:** Keep version 1 terrain unchanged. Process Overpass ways and building multipolygons using the importer's WGS84 azimuthal equidistant projection. Cache local footprints, height estimates and road centre lines independently under `.run/osm-cache`, keyed by schema, origin and bounds. Build shared roof/wall geometry and triangular prism colliders without filling courtyard holes. Drape road polygons across individual terrain triangles; road surfaces do not affect traction. Filter generated scenery by its occupied radius.

**Lifecycle:** Fetch while the world is held. Failure allows terrain-only driving and exposes Retry OSM. Retrying after physics has run downloads to cache but defers installation to the next world load. A generation token prevents stale loads replacing newer locations. Standalone terrain worlds prepare overlays before starting; playgrounds retain their current behavior. Existing entry points and Mission Planner command remain unchanged.

**Execution:** Inline in this checkout; no push.

- [x] Add local fixtures and failing tests for projection, multipolygon stitching/holes, height precedence, road filtering, download failures and offline cache reuse.
- [x] Implement pure OSM processing, geometry generation and scenery exclusions, then cache/downloader with injected fetch.
- [x] Add failing collision and lifecycle tests; integrate fixed footprint colliders and renderer using shared geometry.
- [x] Integrate held startup/location loads, safe retry/defer behavior, status UI and linked attribution.
- [x] Run offline unit and browser checks, attempt a live village/town patch, inspect screenshots and verify wall collision.
- [x] Document setup, cache, ODbL, fallback and limits; inspect final diff and rerun relevant regression checks.

**Validation:** `npm test`; local-fixture browser smoke with network-independent Overpass server; existing terrain, location-selector and Mission Planner browser checks. Live Overpass checks are a separate manual operation, never part of automated tests.

Validation note: fixture Chrome check passed; live town download/visual check was attempted but blocked by Overpass HTTP 406/429 and missing Bohuslav elevation samples. See docs/osm.md for the exact limit.
