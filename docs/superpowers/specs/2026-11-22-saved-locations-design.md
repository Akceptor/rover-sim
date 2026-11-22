# Saved favorite locations

Status: approved by the user on 2026-11-22; implementation in progress.

## User flow

After loading a location, the user can enter a name beside the map and click
**Save location**. Saving retains the exact loaded origin and patch, including
elevation, satellite ground colours and OpenStreetMap buildings/roads. A newly
clicked pin must be loaded before it can be saved. The name field starts with
the current location name and remains editable.

Saved entries appear in a **Favorites** group in the existing location dropdown,
with an **Available offline** indication. Selecting a favorite previews its
coordinates; **Load location** loads its saved patch. Favorites survive page
reloads, backend restarts and browser changes on the same simulator installation.
The same favorites appear for Mission Planner and the startup location picker.

**Remove favorite** removes the stored favorite and its dedicated data after an
explicit click in a small confirmation dialog showing the location name. It does
not change the running world or unrelated terrain/OSM caches. Users can save the
same coordinates under different names; names are labels, not filesystem paths.
Editing a label later is outside this first version; removing and resaving is
available.

## Approaches and recommendation

Recommended: keep named favorites with dedicated terrain and OSM copies on the
simulator backend. This works across browsers and keeps saved locations usable
after ordinary runtime cache cleanup.

An alternative is portable exported bundles with import/export controls. That
also supports transfer between computers, but adds file handling and validation
flows. This first version uses backend favorites; the stored per-location folder
remains suitable for a future export feature.

## Offline completeness

Save becomes available when the loaded terrain contains satellite colours and
the corresponding validated OSM overlay is ready or explicitly empty. A failed
OSM download keeps Save disabled with a clear instruction to use **Retry OSM**.
An empty successful OSM result is valid offline data. Flat playgrounds and
procedural-only terrain without satellite colours cannot be saved as complete
offline favorites in this version.

Favorites preserve the full terrain JSON and processed OSM geometry, including
source metadata, estimated-elevation metadata, copyright and licenses. The offline
map renders saved roads, building footprints, the boundary and rover marker.
Online basemap tiles and live weather remain optional and are not downloaded in
bulk or represented as part of the offline package.

## Storage and backend behavior

Use a git-ignored `saved-locations/` folder at the repository root, separate from
`.run/` caches. Optional `savedLocationsDir` configuration allows another local
directory. Each favorite has a server-generated UUID directory containing a
versioned manifest, terrain JSON and processed overlay JSON. The manifest records
name, UUID, exact origin, patch dimensions, timezone and save time.

Validate names (trimmed, 1–80 characters, no control characters), UUIDs, terrain
and overlay schema/key on writes and reads. Filesystem paths always derive from
validated UUIDs. Write a complete folder under a temporary name and atomically
rename it into place; failed saves publish no partial favorite. A corrupt entry
is reported and excluded from loadable choices without preventing startup.
Restore validates each package independently of current overlay default-height
settings and does not contact terrain, imagery or Overpass services.

Add same-origin WebSocket save/remove actions beside the existing location
actions. Saving snapshots the loaded terrain/overlay pair and its world revision;
a concurrent world change cannot pair data from two locations. Successful writes
broadcast an updated list without rebuilding the current world or resetting the
user's unsent map choice. Save/remove failures produce an actionable message.

Favorite loading goes through the existing held-world installation and SITL GPS
restart path. Existing armed/stale-telemetry restrictions, startup selection
locking, deferred OSM installation, camera output and physics authority remain in
effect. Loaded favorites use their dedicated overlay rather than querying
Overpass, even when the ordinary cache is absent. Saving does not move the rover.
Remove does not permit arbitrary deletion paths.

## Validation

Unit tests cover complete package round trips, invalid names/IDs, corrupt data,
failed atomic writes, empty OSM results, removal isolation and restore without
ordinary caches. Backend tests save a loaded custom world, restart, then load the
favorite with terrain/Overpass network access denied; check exact origin and
existing SITL safeguards. A browser smoke test covers name/save/dropdown/load,
persistent favorites, offline vectors, incomplete-save messages, removal and
mobile layout. Automated tests use local fixtures and never contact Overpass.
