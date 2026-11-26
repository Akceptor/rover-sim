# Mapped barriers implementation plan

- [ ] Add failing local parser, opening, terrain geometry, collision and offline tests.
- [ ] Implement bounded `src/osm-barriers.js` parsing and
  `src/barrier-geometry.js` shared shapes; extend optional cache fields/query.
- [ ] Integrate shapes into physics, procedural barrier rendering, scenery
  clearance, map data, counts, spawn feedback and attribution.
- [ ] Run `npm test`, `npm run test:osm`, `npm run test:barriers` and inspect
  representative visuals; review and resolve findings.
- [ ] Update docs and roadmap checkpoint, commit/push, and open the phase 3 PR.

Separate requested follow-up: modest view-distance reduction in its own
performance PR after barriers; distinguish GPU/render savings from full-world
backend memory. Preserve the complete physics and mission area.
