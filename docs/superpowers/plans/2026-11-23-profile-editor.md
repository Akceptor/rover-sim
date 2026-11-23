# Vehicle Profile Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/profiles.html` page to create and edit `config/vehicles/<id>/` profiles. Physics fields apply live to the running rover.

**Architecture:**
- `src/vehicles.js` gains a reloadable profile list and a configurable directory.
- `src/profile-fields.js` classifies fields as live or reload.
- `src/profile-api.js` handles the HTTP API, mounted by `src/server.js`.
- `Physics.applyTuning` applies live fields.
- The page is a plain ES module, `web/profiles.js`.

**Tech Stack:** Node ≥22 ESM, `ws`, Rapier 0.19.3, vanilla browser JS, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-23-profile-editor-design.md` (read the "Decisions from the builder check" section too).

## Global Constraints

- Id regex `^[a-z0-9][a-z0-9-]{0,40}$`. JSON bodies ≤ 64 KB. `PUT`/`POST` require `Origin === 'http://'+req.headers.host`, else 403. Validation failure → 400 `{error}`. Non-active id or vehicle transition on `/live` → 409 `{error}`.
- Never write outside the vehicles directory. Writes go through temp file + `fs.rename`, with `vehicle.json` as `JSON.stringify(profile,null,2)+'\n'`.
- `ROVER_VEHICLES_DIR` env var overrides the vehicles directory for `vehicles.js` and `launcher.js`. Tests must use a temp copy, never the real `config/vehicles`.
- Live tuning never changes position, velocity, `driveDemand` or `steerAngle`, and never touches SITL.
- Code style: dense one-liners, comments only for traps, no new dependencies.
- Full `npm test`: only the two known failures (backend "browser map selection…", locations "all preset terrain…").

## Review Focus

- A profile saved with a reload-class change while it is active: the rover keeps running the old geometry, and the response says `reloadNeeded:true`. Pinned in Task 4.
- Path traversal in the id (`..%2Fx`, `a/b`, uppercase) → 400, and nothing is written. Pinned in Task 4.
- `PUT` with `profile.id` ≠ URL id → 400. Pinned in Task 4.
- Live edit during a vehicle transition → 409, and physics is unchanged. Pinned in Task 4.
- Invalid profile `PUT` leaves the existing file byte-identical. Pinned in Task 4.

---

### Task 1: Reloadable profiles, field classes, configurable directory

**Files:**
- Modify: `src/vehicles.js`, `src/launcher.js`
- Create: `src/profile-fields.js`
- Test: `test/vehicles.test.js`, `test/launcher.test.js`

**Interfaces:**
- Produces:
  - `vehicles.js` exports:
    - `vehiclesDir():string` (absolute path; `ROVER_VEHICLES_DIR` or `config/vehicles`);
    - `export let vehicleProfiles` (ESM live binding);
    - `reloadProfiles():void`;
    - `readProfileFiles(id):{profile:object, sitlParm:string|null}`.
  - `profile-fields.js` exports `LIVE_FIELDS:string[]` and `RELOAD_FIELDS:string[]`. Dotted paths go as deep as the spec lists, for example `'drive'` covers all `drive.*` and `'trackGeometry.lateralResistance'` is separate from the other `trackGeometry.*` keys. Also exports `fieldClass(path):'live'|'reload'`.
  - `launcher.js` reads the profiles with `sitl.parm` from `vehiclesDir()` at each `vehicleDefaults` call, not at import.

- [ ] **Step 1: Failing tests**
  - `reloadProfiles picks up a new profile directory`: copy `config/vehicles` to a temp dir and set `process.env.ROVER_VEHICLES_DIR` before a dynamic `import()` with a cache-busting query. Write `<tmp>/test-rig/vehicle.json` (mn168 with `id:'test-rig'`), call `reloadProfiles()`, and expect `resolveVehicle('test-rig').id==='test-rig'`.
  - `field classes cover every profile key exactly once`: every leaf path of mn168 and tracked-crawler resolves via `fieldClass` to exactly one class. `'suspensionTuning.grip'` → live, `'wheelbase'` → reload, `'trackGeometry.samples'` → reload, `'trackGeometry.lateralResistance'` → live, `'diff.front'` → live.
  - `vehicleDefaults sees sitl.parm added after import`: in the temp dir, add `test-rig/sitl.parm`. `vehicleDefaults({vehicle:{id:'test-rig',drivetrain:'wheeled'}},{root:'/sim'})` then contains `test-rig/sitl.parm` (path built from `vehiclesDir()`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `node --test test/vehicles.test.js test/launcher.test.js test/vehicle-*.test.js` → PASS.
- [ ] **Step 5:** Commit `feat(vehicles): reloadable profiles, field classes, ROVER_VEHICLES_DIR`.

### Task 2: Startup vehicle by id; selectVehicle re-reads files

**Files:**
- Modify: `config/default.json` (`"vehicle":"mn168"`), `src/server.js` `selectVehicle` (drop the `id===initialConfig.vehicle.id?initialConfig:` shortcut and always `resolveVehicleConfig(config,id)`)
- Test: `test/vehicles.test.js` or `test/vehicle-backend.test.js` (follow the existing backend harness)

- [ ] **Step 1: Failing test** `default config resolves mn168 by id`: `loadConfig()` (default file) → `config.vehicle.id==='mn168'` and `vehicleChoices(config)` contains no `custom` entry. Also check that existing legacy inline tests still pass. They load inline objects explicitly; if any read `default.json`'s inline vehicle, update them to use an explicit inline fixture.
- [ ] **Step 2:** Run → FAIL (if it already passes because the values match, keep the test as a guard, note it, and continue).
- [ ] **Step 3:** Implement both changes. Before relying on `resolveVehicleConfig(config,id)` with `config.vehicle` already resolved, check that it accepts that shape.
- [ ] **Step 4:** `npm test` → only the known failures.
- [ ] **Step 5:** Commit `fix(config): reference startup vehicle by id; reload profile files on vehicle select`.

### Task 3: Physics.applyTuning

**Files:**
- Modify: `src/physics.js`
- Test: `test/vehicle-physics.test.js`

**Interfaces:**
- Consumes: `LIVE_FIELDS`/`fieldClass` (Task 1).
- Produces: `Physics#applyTuning(vehicle:resolvedVehicle):void`. It copies only live-class values into `this.c`, updates each wheel ray's suspension stiffness, compression, relaxation, travel, max force and friction slip (divided by the ray count `n` as in the constructor), and re-applies mass properties as in the constructor.

- [ ] **Step 1: Failing tests**
  - `applyTuning changes behaviour without disturbing state`: mn168, drive 1 s at throttle 1. Snapshot position, linvel, `driveDemand` and `steerAngle`, then call `applyTuning({...p.c,engineForce:p.c.engineForce*3,mass:6,wheelbase:9})`. Immediately after: position, velocity, driveDemand and steerAngle are unchanged, `p.c.engineForce` is tripled, `p.c.wheelbase` is unchanged (reload field ignored), and `Math.abs(p.body.mass()-6)<1e-4`.
  - Comparison run: from the same start, 1 s with tripled engine force accelerates more than a control run without the change.
  - `applyTuning grip reaches Rapier`: after `applyTuning` with `suspensionTuning.grip:0.1`, a full-throttle start from rest at 1 s is slower than the default.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `node --test test/vehicle-physics.test.js` → PASS.
- [ ] **Step 5:** Commit `feat(physics): applyTuning for live profile fields`.

### Task 4: Profile HTTP API

**Files:**
- Create: `src/profile-api.js`
- Modify: `src/server.js` (route `/api/vehicles*` to the handler before the static file map; recompute `choices` after save and call `broadcastWorld()`)
- Test: `test/profile-api.test.js` (new). Prefer testing the handler with a fake context; add one backend test if the harness makes it cheap.

**Interfaces:**
- Produces: `export function createProfileApi(ctx):(req,res,url)=>Promise<boolean>`. It returns true when it handled the request. `ctx` provides:
  - `activeId():string`
  - `transitioning():boolean`
  - `applyLive(resolved):void` (calls `physics.applyTuning` and updates the server's `config.vehicle` live fields)
  - `afterSave(id):void` (`reloadProfiles()`, recompute choices, broadcast; applies live fields if active)
  - `activeVehicle():resolvedVehicle`
- Routes:
  - `GET /api/vehicles` → `{active, profiles:[{id,profile,sitlParm}]}`
  - `PUT /api/vehicles/<id>` → `{ok:true,reloadNeeded}`
  - `POST /api/vehicles/<id>/live` → `{ok:true}`

- [ ] **Step 1: Failing tests** (temp `ROVER_VEHICLES_DIR`; drive the handler with minimal fake req/res, or a real `http.createServer` on port 0):
  - `GET` lists the three profiles with `sitlParm` strings and the `active` id.
  - `PUT` of a duplicate `test-rig` creates `<tmp>/test-rig/vehicle.json` + `sitl.parm`, and `afterSave` is called with `'test-rig'`.
  - `PUT` with bad ids `'..'`, `'A'`, `'a/b'` and the URL-encoded `'..%2Fetc'` → 400, and no new entries in the temp dir.
  - `PUT` with `profile.id!=='mn168'` to `/api/vehicles/mn168` → 400.
  - `PUT` of an invalid profile (`mass:-1`) → 400, with the existing file byte-identical.
  - Cross-origin `PUT` (`Origin: http://evil`) → 403, and a missing Origin → 403.
  - Body over 64 KB → 413.
  - `PUT` to the active id changing `wheelbase` → `reloadNeeded:true` and `applyLive` called. Changing only `engineForce` → `reloadNeeded:false`.
  - `POST /live` on a non-active id → 409, and while `transitioning()` → 409, with `applyLive` not called in either case. On the active id with a valid profile → 200 and `applyLive` called with the resolved vehicle.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement and wire into `server.js`. `transitioning()` = `vehicleStatus.status!=='ready'`. `activeId()` returns `config.vehicle.id`, and for `'custom'`, `/live` always returns 409 with the inline-override message from the spec.
- [ ] **Step 4:** Run → PASS. Then `npm test` → only the known failures.
- [ ] **Step 5:** Commit `feat(api): vehicle profile read/save/live endpoints`.

### Task 5: Editor page

**Files:**
- Create: `web/profiles.html`, `web/profiles.js`
- Modify: `src/server.js` file map (`/profiles.html`, `/profiles.js`, `/profile-fields.js` → `src/profile-fields.js`), `web/index.html` (a "Profiles" link next to Load vehicle that opens in a new tab), `web/style.css` (reuse the existing tokens; add only what the form needs)
- Test: `test/profile-api.test.js` (static routes) plus a manual run

**Interfaces:**
- Consumes: the HTTP API (Task 4) and `fieldClass` (Task 1, served as `/profile-fields.js`).

- [ ] **Step 1: Failing test** `editor page and modules are served`: `GET /profiles.html` returns 200 `text/html` containing `<script type="module" src="/profiles.js">`. `GET /profile-fields.js` returns 200 `text/javascript`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement the page per the spec's "Page" section and its decisions:
  - profile select;
  - Duplicate as… (prompt for the id, check it against the id regex client-side, copy the profile and `sitl.parm`, set name to `"<name> (copy)"`);
  - Save and Revert (Revert posts the saved live fields to `/live` when active);
  - status line: saved / unsaved / error / reload needed / "Rover running unsaved tuning" / inline-override read-only / vehicle change in progress;
  - sections: Identity, Body, Wheels & steering, Drivetrain, Drive response, Suspension & tyres, Tracks, Camera, Collision boxes (JSON textarea), SITL defaults (textarea);
  - a live or reload badge per field;
  - live fields debounced about 150 ms and posted to `/live` when the edited id is active;
  - `beforeunload` warning while unsaved live tuning is active;
  - re-fetch `/api/vehicles` on window focus.
- [ ] **Step 4:** Run the test → PASS. Then start `node src/server.js --standalone` and check by hand (or with the `run` skill if available):
  - the page loads and lists the profiles;
  - editing `engineForce` while driving with keys in the cockpit changes acceleration immediately;
  - Duplicate + Save makes the new profile appear in the cockpit dropdown.
  Report what was checked.
- [ ] **Step 5:** Commit `feat(web): vehicle profile editor page`.
