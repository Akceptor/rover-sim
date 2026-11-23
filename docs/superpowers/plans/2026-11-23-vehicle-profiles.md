# Vehicle Profiles Implementation Plan

**Goal:** Implement the approved vehicle profile design with legacy config compatibility and coordinated physics/render/SITL selection.

**Architecture:** Resolve validated profiles before Physics construction; retain Rapier wheel controller and add sampled track contacts. Publish a single active config and revision through existing initialization and state messages. Stage SITL changes behind disarm/restart holds.

**Tech Stack:** Node.js, Rapier 0.19.3, Three.js, Playwright, pinned ArduRover.

- [ ] Profile/config contract: add `src/vehicles.js`, validation tests in `test/vehicles.test.js`, and resolve legacy inline config in `src/config.js`. Run `node --test test/vehicles.test.js` red then green.
- [ ] Physics: add drivetrain slew/deadband/reversal, profile suspension/load limits, sampled tracks, and repeatable course tests in `test/vehicle-physics.test.js`; retain public Physics API and sensor frames. Run new and existing physics tests.
- [ ] Renderer/UI: add profile geometry factory, Vehicle selector/HUD, actual wheel steering and independent tread animation. Verify geometry tests and browser smoke for wheeled/tracked selection.
- [ ] Startup integration: profile-specific defaults and calibration files, pending/active state, restart/disarm gates, launcher and Mission Planner command updates. Test session decoding, backend transitions and launcher arguments.
- [ ] Contact experiment: implement opt-in multi-sample wheel prototype using existing Rapier wheels; run same step/slope/rock course and warmed timing benchmark against ray default.
- [ ] Verification: full tests, browser checks, native SITL MANUAL movement checks for both drivetrains; review requirements and quality independently.
- [ ] README: profile selection, custom schema, measured tuning, defaults/EEPROM precedence, track motor functions, approximations and verification report. Leave changes reviewable locally; do not push.
