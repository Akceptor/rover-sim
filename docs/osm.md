# OpenStreetMap roads and buildings

Planned enhancements and resumable PR checkpoints are tracked in the
[OSM enhancement roadmap](osm-roadmap.md).

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
offline, even in a fresh checkout without `.run/`. All five were refreshed on
2026-11-26 with detailed road tags, land cover and mapped tree/row points.
See the [snapshot dates,
feature counts and license](../assets/osm/README.md). Cusco has mapped roads but
no mapped buildings in this snapshot.

For other starts, the backend queries Overpass for buildings, highways, supported
land-cover areas, mapped trees and tree rows over the terrain patch. Requests have a 30-second default client timeout and a
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

### Browser connection settings

Open **Settings → OpenStreetMap connection**, or **Configure OSM** beside a failed
download. Choose **Automatic by region**, a fixed regional/global server, or a
custom HTTP/HTTPS URL; the form previews the actual endpoint. Timeout is entered
in seconds (0.001–120). **Save** changes subsequent requests. **Save & retry OSM**
also retries the loaded terrain immediately using the existing installation
guards: after physics starts, downloaded geometry is deferred to the next location
load. Saving cannot interrupt an active terrain/OSM download. Cached and bundled
data still take precedence, regardless of server choice.

Automatic is the default when the backend has no explicit `osm.endpoint`. It uses
the [Dresel regional instances](https://ovp.dresel.systems/) for Europe, North
America, Central America, South America, Asia, Africa and Oceania. The whole patch
must fit inside exactly one regional extract; overlapping coverage, boundary
crossings, missing coverage and unselected locations use the global Overpass
endpoint. Selection uses the bundled `src/osm-regions.js` extract outlines from
the [Geofabrik index](https://download.geofabrik.de/technical.html), retrieved
2026-11-23, without a network lookup. These are extract boundaries rather than
political continent boundaries. Regional coverage data is © Geofabrik GmbH and
OpenStreetMap contributors, under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
There is no automatic retry loop or endpoint rotation after a failure.

An existing explicit backend endpoint stays selected as Custom until changed
through the form. Browser preferences override only endpoint selection and
timeout. They persist in `<backend-config-path>.osm-settings.local.json`, beside
the config selected by the launcher, and are shared by all tabs connected to that
backend. This file and temporary write files are ignored by Git. The original
config, including cache paths and default height, is preserved. Invalid saved
preferences fall back to the backend config and show a warning in Settings;
failed writes show an error without applying the change. To revert to backend
defaults, stop the simulator and remove its local settings file. `"osm": false`
still disables OSM and makes these controls unavailable.

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
terrain heights clamped. Start outside solid footprints. Lima's terrain, satellite
colours and OSM overlay were refreshed at -12.0259746, -77.0282052 to start outside buildings. The bundled Lima spawn
is checked for 0.6 m of clearance from building footprints.

Roads include primary, secondary, tertiary, unclassified, residential, living
streets, service roads, tracks, paths, footways, cycleways and pedestrian streets.
Motorways, construction, steps, area highways, bridges and tunnels are skipped.
Road width uses a valid `width` in metres/feet or a class default (1.5–9 m).
`surface` chooses a material-specific road palette. Round joins/caps overlap at
intersections without gaps; overlapping road materials have a deterministic draw
order. Polygons are split at terrain triangle edges and offset 3.5 cm to avoid
terrain fighting. Wheels still contact the terrain collider; material presets
modify grip and rolling resistance at wheel/track contact points. No bridge decks, kerbs, lane markings,
road cutting/grading or traffic are provided. Mapped vegetation is approximate.

Generated trees and rocks (including their colliders and crown clearance) are
excluded from building footprints and road corridors. An absent or empty overlay
preserves the existing generated scenery. OSM coverage, aerial imagery dates and
coarse GEM-15 terrain may disagree; roads can still be too steep or rough to drive.
Dense patches can be expensive because building colliders and draped road meshes
are generated at load time; there is no streaming or level of detail yet.

### Road materials, driving and effects

New downloads retain normalized `surface`, `smoothness` and `tracktype` tags.
Recognized surfaces select the following simulation presets; grip and rolling
loss multiply the vehicle's existing tuning. Dust and mark strengths are bounded
relative values (marks vary in size). They are approximate defaults rather than
measurements supplied by OSM.

| Surface | Grip factor | Rolling loss factor | Dust | Marks |
| --- | ---: | ---: | ---: | ---: |
| Asphalt, concrete, other supported paving | 1 | 1 | 0 | 0 |
| Gravel | 0.85 | 1.4 | 0.65 | 0.4 |
| Compacted | 0.95 | 1.15 | 0.3 | 0.2 |
| Dirt/earth/ground | 0.8 | 1.7 | 1 | 0.85 |
| Sand | 0.55 | 2.5 | 1 | 0.9 |
| Mud | 0.28 | 2.8 | 0 | 1 |
| Grass | 0.7 | 1.6 | 0.08 | 0.7 |

Concrete plates/lanes use concrete; paving stones, sett, cobblestone, metal and
wood use generic paving; fine gravel/pebblestone use gravel; unpaved/woodchips
use dirt; grass pavers use grass. Unknown surfaces fall back to the existing
paved/unpaved classification. Off-road areas without mapped grass/farmland cover retain the previous ground behavior.

When surface is missing or unsupported, `tracktype` grades 1, 2 and 3–5 select
compacted, gravel and dirt respectively. For loose surfaces, grades 1–5 further
multiply grip by 1, 0.98, 0.94, 0.88 and 0.8, and rolling loss by 1, 1.05, 1.15,
1.3 and 1.5. A conflicting tracktype never changes a recognized paved surface.
`smoothness` changes rolling loss only: excellent/good 1, intermediate 1.08,
bad 1.2, very_bad 1.35, horrible 1.5, very_horrible 1.7 and impassable 2.
These tags do not generate bumps, grade roads or guarantee that a route is passable.

At overlaps, material priority matches the draw order, from highest to lowest:
asphalt, concrete, generic paving, compacted, gravel, dirt, legacy unpaved, sand,
mud, grass. Same-material ties use stable road IDs. Road queries use a spatial
index rather than scanning the whole patch on every physics substep.

Both wheeled and tracked vehicles apply these factors at actual terrain contacts.
Optional multi-ray wheels resolve each of their three samples independently.
Contacts on roofs/obstacles use the original tuning, and unsupported/airborne
contacts generate no terrain marks or dust. Browser and FPV effects use backend
terrain contact positions and material IDs; paved roads produce no earth dust,
and mud produces no dry dust. No rut deformation or wet-weather traction model
is added here.

Older processed caches and saved locations remain schema 1 and load offline
unchanged. Their missing surface tags cannot be recovered from
the old processed data: legacy roads keep baseline grip/rolling loss, with dust
and marks selected by their existing paved flag. Detailed materials apply to new
downloads; use the refresh procedure above if you want newer mapping for an
existing cached location. Saving/loading a newly downloaded location preserves
its detailed road tags without requiring another download.

### Vegetation and land cover

New downloads retain supported land-cover polygons (including multipolygon holes),
individual `natural=tree` nodes and `natural=tree_row` ways. Tree rows are sampled
at six-metre intervals along complete paths, even across short segments. Missing
nodes split a row rather than connecting across a gap.

| OSM mapping | Simulator treatment |
| --- | --- |
| `landuse=forest`, `natural=wood` | Seeded woodland trees, 3–7 m tall |
| `natural=scrub` | Seeded low vegetation, 0.7–1.5 m tall |
| `landuse=grass` or `meadow`, `natural=grassland` | Open ground, grass material |
| `landuse=farmland` | Open ground, approximate dirt material |
| `natural=water`, `landuse=reservoir` or `basin` | Open ground reserved for later water rendering |
| Mapped trees/rows | Valid mapped height up to 40 m, otherwise 8 m |

Cover priority at overlaps is water, farmland, grass, scrub, then forest;
same-kind ties use stable feature IDs. Mapped roads override land-cover contact
materials. Forest, scrub and water-designated ground keep baseline physics;
this phase adds no water surface, depth model or crossing hazard. Farmland's
dirt material is an inferred simulation default, not a measured soil condition.

Placement is deterministic and capped at 512 trees/shrubs per patch, including
the unmapped fallback. Explicit tree nodes take priority over row samples and
generated trees. Points within 0.8 m are deduplicated; distinct mapped trees can
have overlapping crowns. Generated trees avoid nearby trees. All new vegetation
preserves road/building crown clearance, an eight-metre spawn exclusion plus
crown margin, and patch boundaries. Conflicting mapped trees can therefore be
omitted rather than blocking the initial drive.

Supported cover replaces generic tree/rock scattering inside its polygons.
Fields, grass and water areas stay open apart from explicit mapped trees.
Unmapped ground, including holes with no other cover, retains the existing
fallback scenery. Tree trunks have matching backend colliders and browser
instances; crowns are decorative. No species-specific tree models are inferred.

Land-cover colours contribute a subtle 12% tint to terrain vertex colours.
Satellite colour variation, source elevations and collision terrain are
preserved. Off-road effects sit at terrain height; mapped-road effects retain
their road-surface offset. Browser, FPV and physics share world placements and
contact classifications.

Processed data is bounded to 1,024 cover polygons with at most 8,192 total
vertices each, and 2,048 mapped tree/row points before placement. Excess or
oversized supported features are omitted. Polygon lookup is spatially indexed
within the terrain patch. Existing schema-1 caches and saved locations remain
valid without downloads; their missing land-cover information requires a mapping
refresh. The five bundled presets include this data as of 2026-11-26. New saved
locations preserve additional fields for offline reuse. Land-cover-only and tree-only patches show OSM credit in the
browser and video, and count as complete nonempty OSM data.

## Attribution and license

Overlay data is **© OpenStreetMap contributors**, licensed under the
[Open Data Commons Open Database License (ODbL)](https://www.openstreetmap.org/copyright).
The browser displays this linked credit whenever an overlay is visible, and camera
video includes the credit and copyright URL. Processed overlay caches are derived
OSM databases under ODbL; preserve attribution and the applicable ODbL obligations
when sharing them. Generated scenery is separate from the OSM data.

## Checks

`npm run test:landcover` uses a local land-cover-only fixture to verify shared
tree instances, preserved terrain/imagery, browser and video attribution,
deterministic reload and mobile layout. Screenshots go to `.run/landcover/`.

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

`npm run test:osm-settings` checks server selection, endpoint preview, save/retry,
two-tab edit preservation, restart persistence, offline feedback and mobile layout
against a local fixture server. Model/backend tests also cover regional coasts
and boundaries, custom endpoint overrides, validation and failed persistence.

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
