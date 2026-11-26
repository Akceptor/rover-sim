# OSM surfaces implementation plan

Goal: complete roadmap phase 1 in a separate PR without invalidating offline data.

- [x] Add failing material/index tests covering tag precedence, independent
  smoothness/firmness, legacy factors, overlapping roads and terrain bounds.
- [x] Implement `src/road-materials.js` and `src/road-index.js`; preserve optional
  normalized tags in `src/osm.js` and validate them in `src/osm-cache.js`.
- [x] Add actual driving regressions in `test/road-physics.test.js`; apply contact
  grip/rolling factors to wheels, multi-ray wheels and tracks in `src/physics.js`.
  Include terrain-only material queries and bounded contact telemetry.
- [x] Extend the Chrome vehicle-effects fixture before changing effects. Use
  authoritative contact telemetry in `web/app.js` and `web/vehicle-effects.js`;
  retain existing no-OSM fallback behavior.
- [x] Pass material IDs through road geometry and add procedural material palettes
  using `web/road-textures.js`, `web/road-surface.js`, and `web/osm-view.js`.
  Serve the shared module from `src/server.js`.
- [x] Run `npm test`, `npm run test:osm`, and `npm run test:vehicle-effects`.
  Inspect screenshots; review and resolve important findings. Update user docs,
  this checklist and roadmap checkpoint. Commit/push/open the phase 1 PR as the
  final delivery step.

The design in `../specs/2026-11-26-osm-surfaces-design.md` defines defaults and
compatibility. Tests use local fixtures and real Rapier/Chrome; no live Overpass.

Validation: 2026-11-26 — `npm test`: 237 passed, 1 Windows-only skip;
`npm run test:osm` and `npm run test:vehicle-effects`: passed. Reviewed the
material overview screenshot. Code review found two issues; both were reproduced
with failing tests, fixed and re-reviewed with no remaining important findings.
