# Vehicle profile editor

## Intent

The user wants to create vehicle profiles and tune them while driving, without hand-editing JSON and restarting. Physics tuning (grip, suspension, drive, steering, diffs) should take effect instantly on the running rover. Neither its position nor the SITL/Mission Planner session is disturbed.

## Goals

- A separate page, `/profiles.html`, linked from the cockpit, to edit any profile in `config/vehicles/<id>/`.
- Create a profile by duplicating an existing one under a new id.
- Physics fields apply live to the running vehicle when the edited profile is the active one.
- Save writes `vehicle.json` (and `sitl.parm`) to disk. New and changed profiles appear in the cockpit vehicle dropdown without a backend restart.

## Non-goals / anti-goals

- No delete (remove the folder by hand), no authentication, no undo history beyond Revert to the saved file.
- Geometry changes are never applied live: a half-rebuilt vehicle mid-drive is worse than an explicit reload.
- A live tweak must never move, reset or re-spawn the rover, restart SITL, or disarm anything.
- Never write outside `config/vehicles/`.

## Approaches

1. **Chosen:** a form page generated from the profile's structure, plus a small HTTP JSON API on the existing backend. Physics fields apply live via a dedicated endpoint.
2. Rejected: a raw JSON textarea. Easy to break, and live tweaking per keystroke doesn't fit.
3. Rejected: client-only editing with file download. It cannot apply anything live.

## Field classes

- **Live** (apply instantly): `mass`, `centerOfGravity`, `maxSteer`, `steerRate`, `ackermannFactor`, `torqueSplit`, `diff`, `engineForce`, `maxSpeed`, `rollingResistance`, `brakeImpulse`, `drive.*`, `suspensionTuning.*`, `trackGeometry.lateralResistance`.
- **Reload** (saved, apply via cockpit **Load vehicle**): `id`, `name`, `drivetrain`, `length`, `width`, `height`, `wheelbase`, `track`, `wheelRadius`, `wheelWidth`, `suspension`, `contactModel`, `cameraMount`, `collisionBoxes`, `trackGeometry.*` except `lateralResistance`.
- The field class list lives in one shared module (`src/profile-fields.js`), imported by the server and served to the page, so the two cannot drift.

## Backend

- `vehicles.js` gains `reloadProfiles()`. It re-reads `config/vehicles/*` and replaces the exported profile list, so `resolveVehicle` and `vehicleChoices` see the new data. The server's cached `choices` is recomputed and `broadcastWorld()` is called, so open cockpits refresh the dropdown.
- `GET /api/vehicles` → `{active:id, profiles:[{id, profile (raw vehicle.json object), sitlParm (string|null)}]}`.
- `PUT /api/vehicles/<id>` with body `{profile, sitlParm?}`:
  - `profile.id` must equal `<id>`. The body is validated with `resolveVehicle(profile)`, which must succeed as a complete profile (no fields missing relative to mn168).
  - Write `vehicle.json` (2-space JSON) and, if given, `sitl.parm`, each via temp file + rename. Creates the directory for a new id.
  - Then `reloadProfiles()`. If `<id>` is active, apply its live fields (same as the live endpoint).
  - Response: `{ok:true, reloadNeeded:boolean}`. `reloadNeeded` is true when the id is active and any reload-class field differs from the active vehicle.
- `POST /api/vehicles/<id>/live` with body `{profile}`: validated the same way. If `<id>` is not the active vehicle → 409. Otherwise it calls `physics.applyTuning(resolved)` and updates the server's active `config.vehicle` live fields. Nothing is written to disk.
- Request rules:
  - id must match `^[a-z0-9][a-z0-9-]{0,40}$`;
  - JSON bodies up to 64 KB;
  - `PUT`/`POST` require an `Origin` header equal to `http://<Host>`, like the websocket check, so other web pages can't write profiles;
  - validation errors → 400 `{error}`.
- Live tuning is allowed in any state (armed or not, SITL or standalone), because it only changes physics constants.

## Physics

`Physics.applyTuning(vehicle)`:
- Replaces the live fields of `this.c`.
- Updates every Rapier wheel ray's suspension stiffness, compression, relaxation, travel, max force and friction slip, keeping the existing `/n` multi-ray division.
- Re-applies mass properties (mass, CoG, box inertia from the current dimensions) using the same calls as the constructor.
- Must not touch position, velocity, `driveDemand` or `steerAngle`.
- The tracked path reads `this.c` each step, so it needs no extra work.

## Page

- Profile dropdown and **Duplicate as…** (prompts for a new id, copies profile and `sitl.parm`, sets `name` to "<name> (copy)").
- **Save**, **Revert**, and a status line showing saved / unsaved / validation error / "Reload vehicle in cockpit to apply geometry".
- Form sections: Identity, Body, Wheels & steering, Drivetrain, Drive response, Suspension & tyres, Tracks, Camera, Collision boxes (JSON textarea), SITL defaults (`sitl.parm` textarea).
- Numbers use number inputs with unit labels. `drivetrain`, `contactModel` and `diff.*` use selects. Each field shows a "live" or "reload" badge.
- When the edited profile is active, a changed live field posts to `/live` (debounced about 150 ms). Inputs stay editable while the request is in flight. A 400 shows its error by the field.
- Same styling tokens as the cockpit (`web/style.css`). Plain ES module, no framework, like the rest of `web/`.

## Decisions from the builder check (Claude's calls)

- **Active profile identity.** `config/default.json` currently carries an inline `vehicle` object equal to mn168. Change it to `"vehicle":"mn168"` so file edits stay effective. Legacy inline configs (id `custom`) keep working but are read-only in the editor: the page shows "Active vehicle is an inline config override; edit its profile file and select it". `/live` returns 409. `selectVehicle` must re-resolve from the profile files on every load, not reuse `initialConfig` for the startup id. Otherwise Load vehicle would bring back stale startup values.
- **Running vs saved.** The page tracks whether the rover runs unsaved live values ("Rover running unsaved tuning" in the status line). **Revert** restores the form to the file and posts the saved live fields to `/live`, so rover and file agree again. Switching the edited profile or leaving the page keeps the rover's values. `beforeunload` warns while unsaved live tuning is active.
- **During a vehicle transition** (`vehicleStatus.status` not `ready`, including a staged SITL restart), `/live` returns 409 with "Vehicle change in progress". The page shows that and does not queue edits.
- **SITL defaults.** `reloadProfiles()` also refreshes the launcher's list of profiles that have a `sitl.parm`. `ROVER_VEHICLES_DIR` overrides the directory for both `vehicles.js` and `launcher.js`. Saving a changed `sitl.parm` on the active profile shows "SITL defaults apply on next SITL start; values saved in SITL EEPROM still take precedence". It does not set `reloadNeeded`.

## Left to the builder

Exact layout and CSS, debounce details, how the page learns the active vehicle changed (re-fetch on focus is enough), and the number input step sizes.

## Verification

- Unit: `reloadProfiles` picks up a new directory. Field class lists cover every profile key exactly once.
- Physics: `applyTuning` with changed grip and mass takes effect (different acceleration) with unchanged position, velocity and steerAngle at the moment of the call.
- HTTP (backend test harness):
  - bad id / path traversal → 400;
  - cross-origin `PUT` → 403;
  - invalid profile → 400 and no file written;
  - valid `PUT` writes the file and the cockpit init's `vehicles` lists the new id;
  - `/live` on a non-active id → 409;
  - `/live` on the active id changes `physics.c`.
  - Tests write to a temp copy of `config/vehicles`, never the real one: `vehicles.js` accepts a `ROVER_VEHICLES_DIR` env override.
- Full `npm test`: only the two known failures.
