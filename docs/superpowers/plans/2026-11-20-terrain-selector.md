# Terrain selector implementation plan

**Goal:** Select an offline preset or Custom (Mission Planner) beside terrain retry, without manually matching Mission Planner coordinates.

**Architecture:** Expose the existing catalogue in external Mission Planner mode. Presets supply absolute geographic sensor positions derived from the selected terrain origin and rover NED displacement. Custom retains validated Mission Planner start detection. Hold physics after a live region change until SITL restarts; never teleport an armed autopilot. Keep launcher-owned preset startup compatible.

**Tech stack:** Node, WebSocket, Rapier, Three, ArduPilot JSON SITL, Playwright.

## Execution

- [x] Add failing session tests for preset geographic output, displacement and unchanged Custom frames; run `node --test test/session.test.js`.
- [x] Add a browser/native SITL smoke scenario: external mode exposes six options; select Lima against an Australian SITL start; verify actual SIMSTATE/GPS, timezone, restart hold, wheel contacts and mobile layout. Verify Custom returns to Mission Planner start detection and stale/armed changes are refused.
- [x] Implement geographic sensor conversion in `src/session.js`, expose selection and safe restart handling in `src/server.js`, and reuse the picker next to retry in `web/index.html`, `web/app.js`, `web/style.css`.
- [x] Run `npm test`, the new browser/native smoke, and existing position, retry and location smokes. Review the diff and update `docs/locations.md` with the two modes and restart requirement.

The approved design is the inline selector with five offline presets and Custom; preset GPS overrides the external start. External SITL remains owned by Mission Planner, so a required restart is requested there rather than terminating an unrelated process. The user subsequently authorized pushing the completed, verified change.

Verification: `npm test` passed 58 tests with one Windows-only skip. Native Chrome selector smoke passed actual GPS/altitude override, restart holds, return to Custom, wheel contacts, and description placement on narrow screens. Existing location, terrain retry, and native Custom position smokes passed. Independent code review found one Custom-reload restart gap; the added regression failed before the fix and passed after it. Follow-up review found no remaining important issues.
