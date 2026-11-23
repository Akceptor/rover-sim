# Cockpit map and location picker

The cockpit places a **16:9 camera** beside a **square map** on desktop. On narrow
screens, the map stacks below FPV. The background camera/MJPEG output remains a
full camera view and does not create a map or request map tiles.

The blue arrow shows the rover's current physics position and heading. The dashed
blue outline marks the loaded terrain patch. Roads and building footprints,
including courtyards, use the same geographic projection as the terrain and
physics. **Recenter rover** brings the current vehicle position back into view;
you can otherwise pan/zoom freely without the map snapping back as you drive.

## Choose a start

Start with `npm run sim -- --mission-planner` or `npm run sim -- --choose-location`
(use `npm.cmd` on Windows). For keyboard driving with startup selection, use
`npm run sim -- --standalone --choose-location`.

1. Drag the map and zoom to the desired area, or select a bundled preset to
   preview that region.
2. Click the map. An orange marker and coordinates show the proposed start, and
   the dropdown changes to **Custom · browser map**. A click alone does not move
   the rover or load a world.
3. Click **Load location**. The existing terrain and OSM loaders fetch or reuse
   the patch at those exact coordinates, with physics held. A failed terrain
   load keeps the selected coordinates for **Retry terrain**.
4. In Mission Planner mode, remain disarmed. If SITL is already connected, stop
   and start it after loading; the browser waits for GPS at the selected origin
   before enabling **Start physics**. The existing copied Extra command line
   stays valid. There is no need to move Mission Planner's H marker when using
   a browser-map selection.

The five bundled presets remain available. **Custom · Mission Planner** still
reads the H/home marker selected in Mission Planner, rather than the browser
map. Choosing a new start while SITL is armed (or telemetry is stale) is refused
by the backend. The normal launcher picker locks after its initial selection,
as before; restart it to choose another start. Without a location-selection
startup flag, the map provides a live preview and shows how to enable picking.

## Save a location for offline use

After **Load location** completes, enter a **Location name** and click **Save
location**. Saving requires the loaded terrain, satellite RGB colours and a
successful OpenStreetMap overlay load (an empty overlay is valid). The status
below the controls explains incomplete data, a missing name, or a disconnected
backend. A newly selected preset or map pin must be loaded before saving.
Saving is available while waiting for SITL restart or GPS verification.

Saved entries appear under **Favorites**, marked **Available offline**. Select
one and click **Load location** to restore its exact terrain, colours, roads and
buildings without terrain or OSM downloads. The normal startup mode without a
picker still allows saving the loaded terrain; location selection remains
read-only. Use the startup flags above to load favorites.

Select a favorite and click **Remove favorite**, then confirm its name in the
small dialog. Cancel keeps it. Removal deletes that saved copy while leaving
the current world and rover pose intact; the loaded world can be saved again.
Saving and removal update other open cockpits without replacing their current
world or pending map choice.

Each favorite has a dedicated package under the gitignored **`saved-locations/`**
folder, separate from `.run/` and ordinary terrain/OSM caches. Packages survive
browser/backend restarts and ordinary cache cleanup. The optional backend
`savedLocationsDir` setting overrides this folder; relative paths resolve from
the backend working directory. Keep this folder when moving or backing up your
saved locations. Source terrain and imagery attribution and OpenStreetMap
licensing remain attached to the saved data; saving does not change those
licenses. Weather and the online basemap remain optional live services.

## Online and offline

Leaflet 1.9.4 is installed locally with npm and served by the backend, not a CDN.
After updating an existing checkout, run **`npm ci`** (`npm.cmd ci` on Windows).
The local roads, buildings, patch boundary and rover marker remain usable even
if basemap tiles fail. The map displays a basemap-unavailable message in that
case; terrain loading and physics do not depend on tile availability.

If the map library fails to load or initialize, the map panel shows **Map
unavailable** and the camera, video stream, controls and preset location picker
keep working. Reload the page to retry. For HTTP 500 errors on `/leaflet.js` or
`/leaflet.css`, the backend terminal logs an `asset-error` with the affected file
path and filesystem error (such as `ENOENT` for a missing file).

The contextual basemap uses browser requests for visible tiles from
`https://tile.openstreetmap.org/`, with normal browser caching and a visible
[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright) credit.
The simulator does not bulk-download or bundle basemap tiles. See the
[OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
The OSM feature overlay cache and the map tile cache are separate.

A newly clicked coordinate generally needs a new terrain patch, even if it lies
inside the currently displayed patch. Exact cached starts and bundled preset
origins work offline; arbitrary new starts need terrain source access. The
optional backend `terrainCacheDir` overrides `.run/terrain-cache/` (relative paths
resolve from the backend working directory). Existing cache formats are unchanged.
Choose starts on open ground, outside mapped building footprints.

## Verification

`npm test` includes projection/coordinate validation, invalid map selections,
held loading, armed-change rejection and recovery from a failed map load through
an offline terrain cache. `npm run test:map` runs Chrome with basemap requests
blocked and temporary terrain/OSM fixtures: desktop and mobile geometry, real map
clicks, exact selected coordinates, offline vectors, reload restoration, and
full-size headless camera output. No automated check needs Overpass.

`npm run test:map-startup` checks real camera streaming and cockpit controls
with failed Leaflet asset requests and errors during map initialization, world
setup, selection and live updates. `npm test` also checks server diagnostics for
unreadable Leaflet files without changing the installed dependencies.

`npm run test:terrain-selector` also runs native SITL and verifies a browser-map
selection takes effect only after restart, with matching GPS, and that returning
to Mission Planner's selected start still works.

`npm run test:saved-locations` checks saving, correlated failures, safe names,
two-tab updates, pending-choice preservation, compact removal confirmation,
mobile layout, normal startup and empty OSM. It restores synthetic RGB terrain
and roads/buildings after backend restart with ordinary caches deleted, while
refusing remote fetches other than optional weather. Review screenshots are
written to `.run/saved-locations-check/`.
