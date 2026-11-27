# Mapped barriers implementation plan

- [x] Add local parser, opening, terrain geometry, collision and offline tests.
- [x] Implement bounded `src/osm-barriers.js` parsing and
  `src/barrier-geometry.js` shared shapes; extend optional cache fields/query.
- [x] Integrate shapes into physics, procedural barrier rendering, scenery
  clearance, map data, counts, spawn feedback and attribution.
- [x] Run `npm test`, `npm run test:osm`, `npm run test:barriers` and inspect
  representative visuals; review and resolve findings.
- [x] Update user docs and roadmap checkpoint.
- [ ] Publish reviewed follow-up and create/update the phase 3 PR when GitHub is available.

Resume verification, 2026-11-27: 262 tests passed, one Windows-only skip;
OSM and barriers Chrome checks passed. Overview and gate-driving screenshots
visually inspected. Independent review found no important issues; the gate-way
state edge case was fixed with a failing-then-passing regression. Explicit way
state now overrides node state, and unrelated node `open` tags are ignored.
Added an explicit barrier-only FPV credit check. GitHub reads returned `EOF`,
so existing remote PR status remains unverified. Initial code is at `dd174b2`.

Separate requested follow-up: modest view-distance reduction in its own
performance PR after barriers; distinguish GPU/render savings from full-world
backend memory. Preserve the complete physics and mission area.
