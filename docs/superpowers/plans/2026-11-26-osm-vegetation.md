# OSM vegetation implementation plan

- [x] Add failing importer, polygon lookup, deterministic scenery and offline tests.
- [x] Extract shared ring joining, implement `src/osm-landcover.js` processing and
  optional validation; expand the single Overpass query and readiness helper.
- [x] Implement `src/landcover.js` indexed semantics and
  `src/vegetation.js` placement; integrate with `terrainObjects` and contact lookup.
- [x] Add failing tint and browser regressions, then wire shared landcover metadata
  into terrain colouring, vegetation instancing, browser and FPV attribution.
- [x] Run the full suite and OSM/terrain/landcover browser checks, inspect visuals,
  review and resolve findings, update docs and roadmap, and open the phase 2 PR.

Design: `../specs/2026-11-26-osm-vegetation-design.md`. Use local fixtures and
retain existing snapshots; do not contact public Overpass during automated checks.

Validation (2026-11-26): `npm test` — 250 passed, 1 Windows-only skip;
`npm run test:landcover`, `npm run test:osm`, `npm run test:terrain`, and
`npm run test:vehicle-effects` passed. Land-cover overview visually inspected.
Review findings about row spacing and oversized polygons were reproduced in
failing regressions, fixed, and re-reviewed. No remaining important findings.
