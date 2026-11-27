# Mapped barriers implementation plan

- [x] Add local parser, opening, terrain geometry, collision and offline tests.
- [x] Implement bounded `src/osm-barriers.js` parsing and
  `src/barrier-geometry.js` shared shapes; extend optional cache fields/query.
- [x] Integrate shapes into physics, procedural barrier rendering, scenery
  clearance, map data, counts, spawn feedback and attribution.
- [x] Run `npm test`, `npm run test:osm`, `npm run test:barriers` and inspect
  representative visuals; review and resolve findings.
- [x] Update user docs and roadmap checkpoint.
- [x] Initial phase 3 PR #12 merged at `63a1f44` (2026-11-26).
- [ ] Publish reviewed gate-state/preset follow-up on `fix/osm-barrier-assets`.

Resume verification, 2026-11-27: 262 tests passed, one Windows-only skip;
OSM and barriers Chrome checks passed. Overview and gate-driving screenshots
visually inspected. Independent review found no important issues; the gate-way
state edge case was fixed with a failing-then-passing regression. Explicit way
state now overrides node state, and unrelated node `open` tags are ignored.
Added an explicit barrier-only FPV credit check. GitHub connectivity was restored and PR #12 confirmed merged on 2026-11-27.
Initial code is at `dd174b2`; follow-up gate fix is at `6b85d89`.
All five preset OSM snapshots were downloaded again on 2026-11-27; source
timestamp `2026-11-26T21:21:01Z`. Terrain and satellite colour assets are tracked.

Separate requested follow-up: modest view-distance reduction in its own
performance PR after barriers; distinguish GPU/render savings from full-world
backend memory. Preserve the complete physics and mission area.
