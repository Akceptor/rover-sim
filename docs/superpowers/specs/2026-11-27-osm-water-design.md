# Mapped water and crossing hazards — proposed design

User request: implement water next, ahead of the queued building-detail phase.
Base: `4887aaf` on `main`, after merged barrier/preset PR #13.
This document proposes the behavior for review before implementation.

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

The proposed default for unknown depth is **hazardous**, pending user review.
Display "Water depth unknown — hazardous in this simulation" at affected
contacts and on the map legend. Mapped depth is labelled as OSM data, not a live
measurement. The model does not claim that a crossing is safe in the real world.

Add validated `osm.water` settings:

- `unknownDepth`: `hazard` (default) or `shallow`.
- `assumedDepth`: 0.1 m, used only for the explicitly selected shallow assumption.
- `maxCrossingDepth`: 0.2 m, a simulation threshold shared by all vehicle types.
  Both depths must be finite and within 0–2 m.

At actual supported terrain wheel/track contacts inside the prepared wet
footprint, mapped/assumed shallow depth multiplies grip by 0.6 and rolling
resistance by 4. Suppress dry dust and ground marks and emit small bounded
surface ripples/splashes at the prepared water elevation.

Unknown/deeper-than-threshold water removes propulsion at submerged terrain
contacts and applies bounded opposing resistance without reversing velocity.
Dry contacts retain their drive budget; a vehicle partly on the bank may still
back out. Do not disable suspension, teleport, auto-reset, invent motor damage,
or globally pause SITL. A fully stranded rover can use the existing Reset
vehicle action. Show a persistent hazard warning while contact persists.
Unsupported airborne contacts and contacts on buildings/obstacles receive no
water driving forces merely because they share horizontal coordinates.

Apply the same classification to wheeled, multi-ray and tracked contacts.
Wet contacts override ordinary road/land-cover materials, and dry contacts
retain all existing surface behavior. Warning state is backend-owned and appears
in browser and FPV output without changing sensor coordinate conventions.

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
