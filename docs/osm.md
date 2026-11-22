# OpenStreetMap roads and buildings

OSM overlays load automatically on real terrain in standalone, normal SITL,
location-picker and Mission Planner modes. No key or additional installation is
required. The original playground and flat mode do not request OSM.

For Mission Planner, run `npm.cmd run sim -- --mission-planner`, copy **Extra
command line** from the browser, paste it into Mission Planner's Simulation tab,
choose the start and launch Rover. **Custom · Mission Planner** uses exactly the
same selected geographic origin as the terrain loader. Stay disarmed while
loading; **Load location** and **Start physics** retain their existing meanings.
Terrain and OSM finish before a selected location becomes ready. OSM failures do
not prevent starting physics on the terrain. Choose a start on an open road or
open ground: the importer does not move a start that lies inside a building.

## Online, offline and retry

All five existing terrain presets include matching OSM snapshots under
`assets/osm/`: Kyiv, Lviv, Lima, Cusco and the Andes ravine. They load directly
offline, even in a fresh checkout without `.run/`. See the [snapshot dates,
feature counts and license](../assets/osm/README.md). Cusco has mapped roads but
no mapped buildings in this snapshot.

For other starts, the backend queries Overpass for building ways, building
multipolygons and highway ways over the terrain patch. Requests have a 30-second client timeout and a
25-second Overpass execution timeout. Server errors, rate limits, malformed or
partial responses produce a visible error and **Retry OSM**; there is no automatic
retry loop. A valid empty response is displayed and cached as an empty patch.

Requests identify the application as
`RoverSim/0.1.0 (+https://github.com/Akceptor/rover-sim)` in the `User-Agent`
header, as required by the public endpoint's
[operator guidance](https://github.com/drolbr/Overpass-API/issues/791).
HTTP 406 means access was rejected; HTTP 502/503/504 indicates a temporary server
or gateway failure. For HTTP 429, wait at least 30 seconds before **Retry OSM**.
The simulator sends one request per load/retry and reuses successful cached data.

Processed overlays are cached separately under **`.run/osm-cache/`**, as hashed
JSON files keyed by schema version, exact terrain latitude/longitude, local patch
bounds and configured default building height. Elevation/imagery files and
`.run/terrain-cache/` keep their existing format and behavior. Successful cached
OSM data is reused without contacting Overpass, including offline. A valid local
cache takes priority over the bundled snapshot; otherwise a matching bundled
snapshot takes priority over downloading. Neither expires automatically. To
refresh mapping, stop the backend, remove the corresponding runtime cache file
and temporarily set `osm.bundledDir` to `null` to bypass bundled data. Restore the
default afterwards. To transfer custom offline locations, copy both terrain and
OSM cache directories to the other checkout; the five presets need no such copy.

Overlay geometry and colliders are installed together while physics is held.
Before the first **Start physics**, a successful retry can install immediately.
After physics has started, a retry only downloads to cache and reports that it is
deferred until the next location load or backend restart. Stopping physics or
resetting the rover does not insert new buildings into an existing drive. Stale
requests cannot replace a more recently selected world. Ordinary standalone and
SITL starts resume automatically after the initial bounded download attempt.

Optional backend configuration (merge into your existing config):

```json
{
  "osm": {
    "defaultHeight": 6,
    "timeoutMs": 30000,
    "endpoint": "https://overpass-api.de/api/interpreter"
  }
}
```

Set `"osm": false` to disable OSM entirely, including downloads and cache use.
`cacheDir` can override the cache directory; relative paths resolve from the
backend's working directory. A different default height uses a different cache
and does not match the bundled 6 m snapshots.

If the default server is temporarily unavailable, a custom endpoint can be set
in the backend config selected by the launcher. For European locations, the
[Dresel Europe instance](https://ovp.dresel.systems/) uses
`"endpoint": "https://ovp.dresel.systems/api/interpreter"`. That endpoint is
regional; the operator lists separate endpoints for other continents. It returned
the custom Kyiv patch successfully during validation. The simulator uses the
configured endpoint directly and does not rotate servers or retry automatically.

## Geometry and current limits

Coordinates use the terrain importer's WGS84 azimuthal equidistant projection:
+X north, +Y up, +Z east. Rendering and physics share processed footprints and
triangulation. Concave outlines and multipolygon holes remain open. Relation
member ways are joined in either direction; incomplete rings are skipped rather
than artificially closed. Invalid/unavailable map data never replaces terrain.

Buildings use bundled plaster, brick and concrete textures, window frames and
sills, decorative doors and textured flat roofs. Styles are stable per building
and vary across a patch. These are plausible generic facades, not photographs of
the mapped buildings. The material atlas is included under `assets/textures/`
and requires no downloads. Render-only UVs preserve the footprint and courtyard
geometry; windows and doors add no physical openings. Heights use a positive `height` in
metres (or feet), then `building:levels × 3 m`, then `osm.defaultHeight` (6 m).
Invalid heights and values above 500 m fall back to the next source. Foundations
extend below the lowest surrounding terrain cell; roofs sit above the highest
surrounding cell. This avoids wall gaps on slopes, but exaggerates wall height on
steep sites. Fixed triangular prism colliders cover the solid footprint, including
roofs, without covering courtyard holes or concave gaps. Mapped openings in the
footprint stay accessible; unmapped doors, archways and building interiors are not
modeled. Buildings crossing the patch edge retain complete footprints with edge
terrain heights clamped. Start outside solid footprints. The existing Lima
preset origin falls inside a mapped building in the bundled snapshot; use a
nearby Custom start outside buildings there. Other bundled origins are clear of
building footprints. Terrain origins are preserved.

Roads include primary, secondary, tertiary, unclassified, residential, living
streets, service roads, tracks, paths, footways, cycleways and pedestrian streets.
Motorways, construction, steps, area highways, bridges and tunnels are skipped.
Road width uses a valid `width` in metres/feet or a class default (1.5–9 m).
`surface` chooses paved grey or unpaved earth tones. Round joins/caps overlap at
intersections without gaps; overlapping road materials have a deterministic draw
order. Polygons are split at terrain triangle edges and offset 3.5 cm to avoid
terrain fighting. Roads are visual only: wheels still contact the unchanged
terrain collider, with unchanged traction. No bridge decks, kerbs, lane markings,
road cutting/grading, traffic or surveyed vegetation are provided.

Generated trees and rocks (including their colliders and crown clearance) are
excluded from building footprints and road corridors. An absent or empty overlay
preserves the existing generated scenery. OSM coverage, aerial imagery dates and
coarse GEM-15 terrain may disagree; roads can still be too steep or rough to drive.
Dense patches can be expensive because building colliders and draped road meshes
are generated at load time; there is no streaming or level of detail yet.

## Attribution and license

Overlay data is **© OpenStreetMap contributors**, licensed under the
[Open Data Commons Open Database License (ODbL)](https://www.openstreetmap.org/copyright).
The browser displays this linked credit whenever an overlay is visible, and camera
video includes the credit and copyright URL. Processed overlay caches are derived
OSM databases under ODbL; preserve attribution and the applicable ODbL obligations
when sharing them. Generated scenery is separate from the OSM data.

## Checks

`npm test` exercises local fixtures and a local HTTP Overpass stand-in, including
projection alignment, height precedence, split multipolygons with courtyards,
concave gaps, actual vehicle/wall collision, road filtering, sloping terrain
alignment, scenery clearance, offline cache reuse, timeouts, HTTP errors and held
startup/retry/defer behavior. Every bundled preset is also loaded with a fetcher
that refuses all network calls; its road alignment and Rapier geometry are checked. Automated checks never contact Overpass.

`npm run test:osm` uses installed Chrome, a local fixture server and temporary
caches to check rendered roads against terrain heights, linked attribution,
bundled facade texture loading and UVs, and FPV driving into a rendered building. Screenshots go to `.run/osm-fixture-*.png`.
Existing browser regression scripts explicitly disable OSM downloads.

Validation during implementation: `npm test` passed (75 passed, one Windows-only skip). The synthetic village Chrome check, existing terrain Chrome check, Mission Planner command-copy browser check, and terrain-selector browser/native-SITL check passed. An OSM-enabled Custom Mission Planner fixture test also confirmed that arming during a delayed download prevents installation and that a subsequent safe retry reuses the cached overlay.
The initial default-server requests returned HTTP 406/429. A later download via
the Dresel regional instances succeeded for all five presets; their OSM snapshots
are now bundled. The real Lviv overlay (258 buildings, 82 road features) passed
the Chrome terrain-alignment and attribution check and was visually inspected.
Bohuslav elevation still had missing samples; that separate test patch is not bundled.

Building texture verification: 80 unit/backend tests passed (one Windows-only
skip). Chrome verified the bundled atlas, facade UVs, wall collision and the
258-building Lviv patch. The atlas generation prompt and runtime material notes
are in [assets/textures/README.md](../assets/textures/README.md).
