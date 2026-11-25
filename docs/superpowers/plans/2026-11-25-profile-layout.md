# Vehicle Profile Layout Implementation Plan

**Goal:** Simplify profile editing and display the actual interactive vehicle model.
**Architecture:** Reuse the model factory in a dedicated preview module. Extract editor field metadata, share collision scaling between browser and API, retain existing persistence/live tuning.
**Tech stack:** JavaScript, Three.js, OrbitControls, Node test runner, Playwright.

1. Add regression tests for proportionally scaling existing collision templates and canonicalizing geometry on profile save. Run `node --test test/profile-api.test.js test/vehicles.test.js` and observe the missing behavior.
2. Add `src/vehicle-geometry.js` and call it for chassis dimension edits and existing-profile API saves. Preserve explicit inline geometry support and built-in shape proportions. Re-run targeted tests.
3. Extract grouped field metadata with friendly labels and meaningful help text into `web/profile-schema.js`. Render Camera, Chassis and SITL with advanced chassis disclosures and drivetrain-specific controls. Remove collision editor and per-field badges; explain apply timing in help text.
4. Add `web/profile-preview.js` using the existing createVehicle factory, OrbitControls, fitted camera, slow rotation, reduced-motion handling, resource disposal and graceful WebGL errors. Add preview HTML, responsive styles, import map and server routes.
5. Add `scripts/profiles-smoke.mjs` against a temporary config/profile directory. Verify actual rendering, rotation/orbit, tooltips, all profile selections, geometry resizing/persistence, duplication/revert, mobile overflow, and absence of page errors. Run `node scripts/profiles-smoke.mjs`.
6. Run `npm test`, existing vehicle browser smoke, and `git diff --check`. Inspect desktop/mobile screenshots and review changes against the approved design.

## Verification results

All six implementation tasks completed. Targeted profile API, collision geometry, model rendering and vehicle tests: 28 passed. `node scripts/profiles-smoke.mjs` passed, including rendered triangles, automatic rotation, mouse orbit, persisted pagehide, reduced motion, all profile selections, steering-type preview updates, focusable help, live FOV/revert, SITL persistence, geometry resizing, duplicate/save/revert, mobile tooltip bounds and overflow. Desktop/mobile screenshots visually inspected. `git diff --check` passed. Independent code review findings fixed and re-reviewed.

Full suite: 211 passed, 2 failed, 1 skipped. Both failures (map-selection terrain loading and bundled preset terrain origin mismatch) reproduce from unchanged HEAD in `/private/tmp/rover-profile-baseline`. Existing `scripts/vehicles-smoke.mjs` also fails on unchanged HEAD because it reads removed `#mountY`; the new profile browser smoke passes. No unrelated terrain or cockpit-test changes made.
