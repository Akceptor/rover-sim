# Real terrain implementation plan

Goal: bundle an offline, approximately 960 m square real landscape while retaining
one npm package and the existing launcher. User approved the proposed terrain,
satellite colour and local-detail design with “do it”. Default location pending
optional preference: Feofaniya near Kyiv (50.3375, 30.4750).

Architecture: validated terrain JSON contains an odd-sized north/east grid,
relative elevations with zero at spawn, RGB satellite colour, geographic home and
source/licence metadata. A shared pure module builds triangle positions/indices
and samples the same triangles for spawn/detail placement. Rapier and Three.js
consume exactly that geometry. Existing Physics.create callers remain playground
by default; server selects bundled terrain unless --flat or --playground is set.
Launcher forwards the world selection and sets SITL home from the selected map.

- [x] Add failing tests for grid validation, winding, triangle interpolation,
  geographic home and actual wheel contacts on a non-flat mesh.
- [x] Implement shared terrain module and optional Physics terrain geometry.
- [x] Implement Node GeoTIFF range-read importer with proj4 transformations;
  reject nodata/cross-tile patches, require small bounds, record sources, write
  output only after the complete patch is validated. Bundle a real GEM-15 patch
  and Sentinel-2 RGB sampled from a pinned scene.
- [x] Integrate server, launcher, reset/spawn, world boundaries, renderer,
  local detail and visible attribution. Keep original playground and flat modes.
- [x] Add browser/launcher checks for real terrain and run existing tests,
  real SITL readiness and stationary gravity/GPS sanity. Review changes, document
  controls/data limits/import workflow, commit and push under existing permission.

Satellite colours describe broad land cover, not centimetre-scale driving detail.
No runtime download, credentials, fabricated satellite data or replacement of
saved SITL parameters. Relative vertical origin is removed from elevation data;
SITL home altitude uses the stored EGM96 elevation at origin. Local frame is
north/up/east, with geographic coordinate transforms aligned to true north.
