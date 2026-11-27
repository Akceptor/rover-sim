# OSM enhancement roadmap

Created: 2026-11-26. Baseline: `6abc155` on `main`.

This is the persistent execution and handoff record for extending the simulator's
OpenStreetMap support. Implement the phases below in order, with one feature PR
per phase. Each phase must leave a usable simulator that can be paused indefinitely.
Bridges are excluded. Road grading remains in scope as its own final phase.
Tunnel construction, traffic simulation and surveyed building interiors are not
part of this roadmap.

Execution-order update (2026-11-27): the user requested water next. Proceed
with phase 5 before phase 4; building detail remains queued. Phase numbering
stays unchanged, and road grading remains last.

## Progress and PR sequence

| Phase | Feature PR | Status | PR link |
| --- | --- | --- | --- |
| 1 | Surface-aware driving and effects | Merged | [#9](https://github.com/Akceptor/rover-sim/pull/9) |
| 2 | Mapped vegetation and land cover | Merged | [#11](https://github.com/Akceptor/rover-sim/pull/11) |
| 3 | Mapped barriers and obstacles | Merged | [#12](https://github.com/Akceptor/rover-sim/pull/12) |
| 4 | Richer building geometry and materials | Queued | Not opened |
| 5 | Water features and crossing hazards | In progress | Not opened |
| 6 | Road corridor grading | Queued | Not opened |

Use `Queued`, `In progress`, `PR open`, `Merged`, or `Paused` for status. Record
the actual PR URL and merge commit when available. An open PR is not a completed
phase. Start each feature branch from the preceding merged phase; if work is
stacked before review, document its base PR and dependencies explicitly. Do not
merge PRs merely to advance this roadmap without authorization to merge.

## Shared requirements

- Preserve the five bundled offline presets, custom location loading and saved
  offline locations. Missing new tags must produce deterministic defaults.
- Keep the current cache-first loading order, bounded requests, manual retry,
  cancellation and stale-world guards. Install geometry and physics together
  while held; retries after driving starts apply on the next world load.
- Extend processed data without silently losing existing offline data. Validate
  new optional fields, normalize older snapshots/saved locations in memory and
  preserve provenance. If a schema change is necessary, provide a tested migration
  or legacy fallback before changing cache keys. Never require a network download
  simply to open an existing offline location.
- Expand Overpass queries only for the phase being implemented. Keep standalone
  mapped nodes as well as ways/relations where required. Reuse existing requests,
  projection, multipolygon handling and cache behavior.
- Share semantic data and placement decisions between rendering and physics.
  Do not generate separate random obstacle arrangements in the browser.
- Use focused modules for new feature processing rather than putting every
  feature into `src/osm.js`, `src/physics.js`, or `web/app.js`.
- Preserve attribution in browser, FPV video, caches and saved-location exports.
  Patches containing only a newly supported feature must count as nonempty and
  show the OSM credit, even if there are no roads or buildings.
- Bound feature counts, geometry detail and lookup cost. Precompute spatial
  lookups for physics contacts; avoid scanning every feature on every substep.
- Document inferred dimensions, surface properties and elevations as simulation
  approximations. Missing measurements must not be presented as surveyed data.
- Use local fixtures for automated checks. Public Overpass availability must not
  determine whether the test suite passes.

## Phase 1 — Surface-aware driving and effects

**Outcome:** mapped road materials affect vehicle behavior and its visible tracks
and dust, with consistent classification across backend and browser.

Scope:

- Preserve and normalize `surface`, `smoothness`, and `tracktype` on roads.
  Distinguish asphalt/concrete, gravel/compacted ground, dirt, sand, mud and grass;
  retain class-based fallback when tags are absent or unsupported.
- Introduce documented, bounded surface presets for grip, rolling resistance,
  dust and ground-mark intensity. These are simulation parameters rather than
  friction measurements from OSM. Surface type, firmness and smoothness remain
  separate concepts; do not invent terrain bumps from a smoothness tag.
- Resolve materials at actual wheel/track contact positions, including roads
  meeting or overlapping, patch boundaries and airborne contacts. Apply them to
  wheeled, multi-ray and tracked vehicles without changing untagged fallback
  behavior. Keep vehicle tuning as the baseline that surface factors modify.
- Connect the same classification to road appearance and existing tire tracks
  and dust. Paved roads should not emit loose-earth dust; mud should not emit
  dry sand dust. Unknown/off-road areas retain existing behavior until phase 2.

Integration points: `src/osm.js`, `src/osm-cache.js`, `src/physics.js`,
`src/server.js`, `web/osm-view.js`, `web/road-surface.js`,
`web/vehicle-effects.js`, and `web/app.js`.

Acceptance: deterministic tag precedence and overlap rules; legacy offline data
still loads; real driving fixtures demonstrate different traction/resistance;
airborne vehicles receive no ground resistance; dust/marks match the material.
Run `npm test`, `npm run test:osm`, and `npm run test:vehicle-effects`, extending
their fixtures for the new behavior. Include representative wheeled and tracked
driving checks and document results in the PR.

## Phase 2 — Mapped vegetation and land cover

**Outcome:** forests, scrub, grass and farmland guide scenery instead of relying
only on generic scattering.

Scope:

- Import supported `landuse` and `natural` areas, including multipolygon holes,
  plus individually mapped trees and tree rows.
- Use deterministic, density-capped placement for wooded areas and scrub. Keep
  fields, grass areas and water-designated areas appropriately open. Explicitly
  mapped trees take precedence over generated ones and are deduplicated.
- Render suitable ground treatment without destroying satellite imagery detail.
  Extend phase 1's off-road material lookup where land cover supplies evidence.
- Preserve building/road clearance and safe spawn clearance for generated
  vegetation. Respect courtyard holes, overlapping polygons and patch edges.
- Use identical vegetation positions for rendering and colliders; preserve the
  existing fallback in areas with no supported land-cover mapping.

Integration points: OSM processing/cache, `src/terrain.js`,
`src/osm-footprints.js`, `web/scenery.js`, `web/instanced-scenery.js`,
`web/terrain-shading.js`, and shared phase 1 material lookup.

Acceptance: repeat loads produce identical scenery; forests have bounded density;
open fields stay open; holes and roads remain clear; mapped trees do not duplicate;
legacy presets still load offline. Run `npm test`, `npm run test:osm`, and
`npm run test:terrain`, with a browser fixture covering woodland beside farmland.

## Phase 3 — Mapped barriers and obstacles

**Outcome:** mapped walls, fences, gates and bollards visibly constrain rover travel.

Scope:

- Import supported linear and point `barrier` features. Use mapped height/width
  where valid and conservative, documented type defaults otherwise.
- Build terrain-following wall/fence sections and point obstacles with matching
  colliders. Keep gates/openings in barrier ways rather than closing them with
  an uninterrupted wall. Respect explicitly mapped open gates; unknown gate
  state uses a documented static default.
- Keep existing world boundary barriers separate from mapped barriers. Provide
  clear spawn-intersection feedback for mapped obstacles without silently moving
  the selected geographic origin.
- Update map display, feature counts, attribution, saved locations and disposal
  paths for patches containing barriers alone.

Integration points: OSM processing/cache and footprints, `src/physics.js`,
`src/map-data.js`, `src/server.js`, and focused browser barrier rendering.

Acceptance: rover collides with rendered walls/fences/bollards; mapped openings
remain passable; sloping ground has no drive-through gaps; invalid dimensions and
barrier-only patches work predictably. Run `npm test` and `npm run test:osm` with
collision and narrow-gate driving fixtures.

## Phase 4 — Richer building geometry and materials

**Outcome:** mapped building details improve shape, appearance and supported passages.

Scope:

- Support `building:part`, `min_height`/`building:min_level`, roof height and a
  bounded initial roof set: flat, gabled, hipped, pyramidal and skillion.
- Respect valid building/roof colours and supported material tags; retain the
  current stable generic facade style when tags are missing.
- Resolve whole-building outlines versus parts to avoid duplicate solid volumes.
  Define total-height/roof-height precedence and fall back for unsupported roofs.
- Match visible geometry with colliders, preserve concave footprints/courtyards,
  and allow passages only where mapped elevated geometry actually supports them.
  Decorative doors remain decorative; this phase does not invent interiors.

Integration points: OSM processing/query/cache, `src/osm-footprints.js`, building
geometry/colliders, `web/building-surfaces.js`, `web/building-textures.js`,
and `web/osm-view.js`.

Acceptance: fixtures cover mixed-height parts, raised sections, each supported
roof, colour/material fallbacks, courtyards and unsupported tags. Passages are
physically open and roofs physically solid. Run `npm test` and
`npm run test:osm`; visually inspect a mixed-building fixture in FPV and chase view.

## Phase 5 — Water features and crossing hazards

**Outcome:** mapped rivers, streams, ponds and lakes appear in the world and can
affect rover crossings through an explicit approximate hazard model.

Scope:

- Import supported water polygons and linear waterways, including islands and
  mapped widths. Use conservative width defaults where needed.
- Generate bounded water surfaces aligned with terrain and avoid planting
  generated vegetation in water. Keep islands dry and update map overlays.
- Support documented shallow-water resistance and deep/unknown-water hazard
  behavior using explicit simulation defaults/overrides; do not infer measured
  water depth from a polygon. Expose the approximation to the user wherever a
  crossing decision depends on it.
- Integrate contact/surface effects without adding bridge geometry. Full fluid
  dynamics and amphibious vehicle buoyancy are outside this phase.

Integration points: OSM processing/cache, phase 1 material lookup, terrain/scenery,
physics, map data, and dedicated water rendering.

Acceptance: island holes stay dry; water-only patches get attribution; polygon
and stream crossings behave consistently for wheeled and tracked vehicles;
missing depth has a deterministic documented result; no water surface floats up
steep hills. Run `npm test`, `npm run test:osm`, and `npm run test:terrain` with
pond, island, stream and sloping-bank fixtures.

## Phase 6 — Road corridor grading

**Outcome:** supported at-grade roads have smoother physical corridors rather
than merely painting the unchanged coarse terrain.

Scope:

- Add a configurable grading pass for supported at-grade roads, blending road
  corridors into the surrounding terrain with bounded cut/fill and slope change.
  Exclude bridges and tunnels throughout processing.
- Preserve the selected geographic home and zero-height spawn convention.
  Keep source terrain immutable; derive one effective terrain used by rendering,
  physics, height queries, building foundations, vegetation and effects.
- Define deterministic junction and overlapping-road handling. Respect water
  boundaries and avoid erasing hazards or creating accidental causeways.
- Persist grading settings with saved locations and include them in derived
  geometry/cache identity. Prevent cumulative grading on reload. Offer the
  original terrain behavior when grading is disabled.

Integration points: `src/terrain.js`, world preparation in `src/server.js`,
`src/start-terrain.js`, saved-location persistence, OSM road geometry,
`src/physics.js`, and `web/terrain-view.js`.

Acceptance: synthetic rough roads become physically drivable within configured
bounds; intersections have no steps; visible and collision heights match;
off-road elevations remain unchanged outside the blend corridor; reload does not
reapply deformation; saved locations reproduce the same world offline. Run
`npm test`, `npm run test:osm`, `npm run test:terrain`,
`npm run test:saved-locations`, and `npm run test:mission-planner-setup`.

## Per-PR completion and pause procedure

1. Read this roadmap and the latest phase's PR before editing. Write the focused
   phase design/implementation plan under `docs/superpowers/` using the repository's
   established conventions; settle feature-specific defaults there.
2. Implement only that phase on its own branch. Add meaningful parser, physics
   and browser regressions for the behavior changed. Update `docs/osm.md` and
   other affected user docs to describe shipped behavior and approximations.
3. Run the phase's checks and inspect representative visuals. Record commands,
   results and material limitations in the PR. Review the diff before opening it.
4. Update this roadmap in the feature PR: status, PR URL, validation evidence and
   next action. After merge, record the merge commit in the next update. Never
   mark later phases complete because supporting infrastructure was added early.
5. If interrupted, update the checkpoint below before handing off. Preserve work
   on its branch/PR and distinguish completed checks from checks not yet run.

## Resume checkpoint

- Last completed merged phase: phase 3, PR [#12](https://github.com/Akceptor/rover-sim/pull/12),
  merge commit `63a1f44e4b4c54e7cf5f3fff3e1dc5d309098263` (2026-11-26).
- Bundled preset maintenance: all five OSM snapshots refreshed on 2026-11-27,
  using the current importer for road tags, land cover, mapped trees and barriers.
  Source database timestamp: `2026-11-26T21:21:01Z`. Terrain/imagery remain tracked
  and complete; saved favourites remain unchanged.
- Active feature phase: phase 5 (water), implemented and verified on `feat/osm-water`
  at `.worktrees/osm-water`. User requested water before phase 4 buildings.
- User-selected behavior: deep/unknown water sinks the rover, replaces actual
  camera/video capture with snow and disables propulsion until Reset vehicle
  or a new world/vehicle. SITL reset safeguards remain in place.
- Base: `4887aaf` on `main`, after merged barrier/preset follow-up #13.
- Design/plan: `docs/superpowers/specs/2026-11-27-osm-water-design.md` and
  `docs/superpowers/plans/2026-11-27-osm-water.md`.
- Validation (2026-11-27): `npm test` — 293 passed, one Windows-only skip;
  `npm run test:water`, `npm run test:osm`, `npm run test:terrain` and
  `npm run test:saved-locations` passed. Water tests cover real wheeled/tracked
  sinking, multi-ray and unsupported/roof exclusions, shallow resistance,
  monotonic bounded descent, reset, island/overlap geometry, saved policies and
  backend control lockout. Stream-only Chrome fixture confirms encoded snow,
  credit, reset recovery, map legend and mobile layout.
- Independent spec/code review: no important issues remain. Island-loss,
  polygon precedence, zero-depth dryness, airborne tracked rays, upward sinking,
  stream-only attribution and saved-policy retry regressions are fixed.
- Presets: all five refreshed with current water importer/query; source timestamp
  `2026-11-26T21:21:01Z`. Water counts: Kyiv 4, Lviv 6, Lima 0, Cusco 4,
  Andes ravine 16. No water geometry was omitted from these presets. All five
  load offline in Chrome; their overview images were inspected. Terrain/imagery,
  origins and schema/cache keys are preserved; old saved favourites unchanged.
- Compatibility: schema-1 data remains valid. Missing water fields use explicitly
  labelled legacy water cover in memory; an empty water array stays authoritative.
  New saved locations preserve their effective crossing threshold offline.
- Separate follow-up: user reported standalone not opening a browser.
  `fix/standalone-browser` at `.worktrees/standalone-browser`, commit `beec2b6`,
  fixes npm standalone and opens the HUD before picker wait. Its independent
  full suite passed (273 passed, one platform skip); review found no important issues.
- Next action: publish/review the water feature and standalone startup PRs.
  Do not mark phase 5 merged before its actual PR merge. Phase 4 buildings remains
  queued and phase 6 grading last.
- Blocking decisions: none; new merges require authorization.

To resume in a new session: **“Continue the OSM roadmap in `docs/osm-roadmap.md`
from its checkpoint, one feature PR at a time. Bridges remain excluded.”**
