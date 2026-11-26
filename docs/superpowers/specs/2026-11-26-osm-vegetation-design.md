# OSM vegetation and land cover

Phase 2 of the approved `docs/osm-roadmap.md`, based on `main` after PR #10.

Add optional schema-1 `landcover` polygons and `trees` points. Import supported
landuse/natural ways and multipolygons, mapped tree nodes and tree rows. Reuse
joined-ring handling for reversed members and holes; skip incomplete rings.
Normalize row trees to points at six-metre spacing with bounded sampling. Mapped
nodes take precedence over row samples and generated vegetation.

Use one terrain-clipped polygon index for overlap decisions: water > farmland >
grass > scrub > forest, with stable ID ties. Generate jittered, seeded woodland
and low scrub on a bounded grid, with a total vegetation cap of 512. Preserve
existing generic scenery in unmapped regions. Suppress fallback trees/rocks in
mapped areas; keep field, grass and water polygons open apart from explicit
mapped trees. Deduplicate nearby trees and preserve road/building crown clearance,
patch boundaries and an eight-metre spawn exclusion. Backend world objects feed
both Rapier and Three.js. No independent browser scattering is added.

Blend land-cover colour by 12% into terrain vertex colours, preserving imagery
and source elevations. Grass supplies the grass contact preset; farmland supplies
an approximate dirt preset. Other cover retains baseline ground physics; roads
always override land-cover materials. Water only suppresses vegetation and adds
subtle tint here; water surfaces and hazards remain phase 5.

Preserve legacy keys and optional-field compatibility. Include landcover/tree-only
patches in readiness, attribution, FPV credit and saved-location behavior. Extend
existing rendering rather than generating images or adding texture dependencies.

Validate local fixtures for nodes/rows, reversed multipolygons, holes, overlaps,
open fields/water, deterministic caps, road/building/spawn clearance, old caches,
saved offline round trips, contact priority and shared colliders/render positions.
Run `npm test`, `npm run test:osm`, `npm run test:terrain`, and a dedicated
landcover-only Chrome fixture with reload/attribution/imagery assertions.
