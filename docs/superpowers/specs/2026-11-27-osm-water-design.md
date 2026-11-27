# Mapped water and crossing hazards — approved direction

User request: implement water next, ahead of the queued building-detail phase.
Base: `4887aaf` on `main`, after merged barrier/preset PR #13.
User accepted water work and specified that deep or unknown water sinks the
rover, replaces video with snow/static and disables driving controls.

## Approach

Use bounded OSM water geometry plus an explicit approximate contact model.
Rendering, vegetation exclusion, map display and physics consume one prepared
water footprint. Preserve terrain elevations and the selected geographic origin.

Alternatives considered:

1. **Mapped surfaces and approximate crossings (recommended):** visible water,
   shallow-water resistance and a deterministic unknown/deep-water hazard. Fits
   the roadmap while remaining usable with the coarse existing elevation model.
2. **Visuals only:** smaller change but leaves the roadmap's crossing behavior
   unimplemented and allows ordinary dry-ground driving through mapped lakes.
3. **Carved channels and simulated fluids:** needs terrain deformation, hydrology
   and vehicle buoyancy; too broad for this phase and conflicts with the current
   separation from road grading.

## Supported data and compatibility

Import closed `natural=water`, `landuse=reservoir` and legacy
`waterway=riverbank` ways and multipolygons, preserving island holes. Import
linear `waterway=river|stream|canal|drain|ditch`, splitting at missing nodes.
Exclude underground/tunnel/culvert segments, covered waterways and explicitly
dry features. Do not create water from `landuse=basin` alone: it need not be wet.
Retain intermittent/seasonal flags; use a documented static wet-state assumption
and label it rather than deriving current water presence from live weather.

Add optional schema-1 `water` features with stable IDs, polygon rings or line
points, normalized type, width, nullable mapped depth and seasonal flags.
Bounds: 1,024 features, 8,192 vertices per feature, and 65,536 vertices total.
Validate coordinates, topology fields and finite dimensions before cache use.
Reject malformed optional fields rather than silently stripping them.

Parse nonnegative `depth` in metres/feet, capped at 100 m; zero is valid and dry.
Invalid/missing depth remains unknown. Parse positive width up to 200 m.
Unmapped line widths use simulation defaults: river 8 m, canal 5 m, stream 2 m,
drain 1 m, ditch 0.6 m. They are inferred widths, never measured claims.

Preserve schema/cache keys, attribution and provenance. Old snapshots remain
usable without network access. When `water` is absent, normalize stored
land-cover polygons of kind `water` into unknown-depth water in memory. Old
processed cover has lost its original tags, so label that fallback as legacy
mapping; it cannot distinguish a formerly imported dry basin. An explicit empty
`water` array is authoritative and must not trigger that fallback.

Reuse the current OSM request and expand only the water selectors. Polygon data
takes precedence over a coincident waterway centreline, including within island
holes, to avoid a second line re-wetting a mapped island. Resolve other overlaps
by unknown/deep hazard first, then greatest mapped depth, then stable ID.

## Surface geometry

Keep lakes/ponds/reservoirs level. Derive a conservative surface level from the
lowest valid shoreline terrain sample plus 5 cm. Sample edges at intervals no
larger than half the terrain spacing, with a per-feature bound. Exclude samples
outside the terrain patch rather than treating clamped patch edges as surveyed
shoreline. If no shoreline is inside the patch, use the lowest valid interior
terrain sample plus 5 cm. This is a visual estimate, independent of mapped depth.

Triangulate polygon holes, clip to terrain triangles and the patch, and clip
away parts where terrain rises above the estimated level. No geometry is raised
to the top of a steep bank. Coarse elevations can therefore underfill a mapped
lake; report terrain/mapping mismatch instead of flooding the hillside.

Linear waterways use terrain-following ribbons split at terrain triangle edges,
offset 5 cm above their bed. River-area polygons may use the same terrain-following
treatment rather than imposing one lake level along a long river. These ribbons
are thin visual surfaces, without carved channels or surveyed bathymetry.

Cap the prepared mesh at 200,000 triangles across the patch. Deterministically
omit a feature that would exceed the remaining budget; do not publish partial
geometry with a larger invisible hazard footprint. Publish a visible count of
omitted/mismatched features. Spatially batch rendering for disposal and culling.

Physics indexes the prepared wet triangles, including their surface elevation.
All consumers use that same derived wet footprint; islands and clipped dry
banks remain dry. Road overlap never erases water or invents a causeway.
Water meshes are not solid road decks or collision boxes.

Use a blue/green translucent material with subtle procedural animated ripples,
bounded opacity and no external textures or reflection render pass. Keep
performance/Lambert mode supported. No real water level is inferred from colour.

## Crossing model and proposed defaults

Unknown depth is hazardous. Add validated `osm.water.maxCrossingDepth`, default
0.2 m and bounded to 0–2 m. Mapped depth at or below the threshold is shallow;
missing/invalid/deeper depth causes a latched sinking failure at actual supported
terrain wheel/track contacts. Depth zero is dry. Mapped depth is not live water data.

Shallow water multiplies contact grip by 0.6 and rolling resistance by 4;
suppress dry dust/marks and emit bounded surface ripples/splashes. Apply the same
policy to wheeled, multi-ray and tracked vehicles. Roads do not erase water.
Airborne or roof/obstacle contacts receive no water force from horizontal overlap.

On the first hazardous supported contact, latch the failure, clear drive demand
and ignore all further keyboard/SITL actuator propulsion. Disable suspension
support and chassis collisions for a controlled 0.4 m/s simulated descent, bounded
to two metres below the encountered surface. This explicitly approximates sinking
without carving bathymetry or claiming real underwater terrain. Keep position,
velocity and sensor outputs finite and consistent. Stop downward motion at the
bound. Preserve the failure until Reset vehicle or a new world/vehicle load.
Existing SITL reset/restart safeguards remain enforced.

Replace the rendered camera view with animated monochrome snow/static while
sinking/submerged. This must affect the actual captured canvas and MJPEG frames,
not just a CSS overlay; preserve attribution. Display the failure and recovery
action outside the lost video. Block driving keys and backend propulsion, but
retain Stop physics, Reset vehicle and safe world/vehicle selection controls.
Reset restores terrain collisions, clears the failure and restores normal video.

## Integration and persistence

Focused modules: `src/osm-water.js` for import/validation,
`src/water-geometry.js` for mesh generation, `src/water.js` for configuration,
spatial lookup and contact policy, and `web/water-view.js` for rendering/effects.
Keep glue in the existing OSM/cache/server/physics/map/vegetation modules small.
Install prepared water with terrain/OSM while physics is held, preserving stale
load guards and retry-after-start deferral.

Generated vegetation and generic rocks must avoid the shared wet footprint.
Keep mapped islands available for ordinary vegetation. Explicit mapped trees
conflicting with water are omitted consistently in rendering and physics.

Water-only patches count as supported/nonempty, show browser and FPV credit,
produce map polygons/lines and appear in feature counts. Show unknown-depth
and seasonal assumptions in the water legend before a crossing decision.

Saved locations preserve optional water features and effective water settings
using an optional validated manifest field, without changing manifest version 1.
Older saves use the documented defaults; new saves reproduce their water model
offline even when backend defaults later change. Apply saved settings on load
without overwriting the user's global backend configuration.

Refresh and commit OSM snapshots for all five bundled presets with the current
water query/importer, retaining their terrain, imagery, origins and attribution.
Record source timestamps and per-preset water counts. Leave saved favourites
unchanged. Update the roadmap to record the user-requested execution order;
building detail remains queued, road grading remains separate, bridges excluded.

## Verification

Use local fixtures for a pond with an island, split/reversed multipolygon rings,
river/stream widths, short/incomplete lines, covered/dry/seasonal water, invalid
dimensions, unknown versus zero depth, overlaps, slopes and patch boundaries.
Assert that hazards, vegetation exclusion and renderer share the wet geometry.

Drive both wheeled and tracked vehicles through shallow, deep and unknown water;
include a multi-ray partial-bank case and airborne/building-contact exclusions.
Check bounded resistance at tiny speeds, sensor consistency, deterministic
reload, old offline saves and saved-setting round trips. Test schema-1 legacy
cover fallback without a network request and explicit empty water arrays.

Run `npm test`, `npm run test:osm`, `npm run test:terrain`, a new water-specific
Chrome smoke check, and saved-location checks affected by the manifest extension.
The water browser fixture verifies attribution, map overlays, warning visibility,
material/effect placement, disposal, offline reload and mobile layout. Inspect
FPV/chase/overview screenshots and all five refreshed offline presets. Review
before opening the feature PR. Merge requires separate user authorization.

OSM tag reference: https://wiki.openstreetmap.org/wiki/Key:waterway
