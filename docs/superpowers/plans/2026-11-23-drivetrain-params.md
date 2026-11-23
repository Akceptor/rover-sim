# Wheeled Drivetrain Parameters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-profile steering servo rate, Ackermann geometry, front/rear torque split and locked/open axle diffs for wheeled vehicles.

**Architecture:** New fields in `config/vehicles/<id>/vehicle.json`, validated in `src/vehicles.js`. A pure axle force distribution function lives in `src/drivetrain.js`. `Physics.stepWheels` in `src/physics.js` slews the steering, applies Ackermann angles and feeds per-wheel engine force through the distribution before the existing per-ray friction circle.

**Tech Stack:** Node ≥22 ESM, `@dimforge/rapier3d-compat` 0.19.3, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-23-drivetrain-params-design.md`

## Global Constraints

- Defaults in all three profiles: `steerRate` 6, `ackermannFactor` 1, `torqueSplit` 0.5, `diff` `{"front":"locked","rear":"locked"}`.
- `maxSteer` stays the centre (bicycle) angle. Turn radius = `wheelbase/tan(δ)`.
- Tracked path (`stepTracks`) unchanged.
- Code style: dense one-liners and the existing helpers (`dot`, `scale`, `add`, `clamp`). Comments only for non-obvious traps.
- Full `npm test`: only the two known failures (backend "browser map selection…", locations "all preset terrain…").
- Wheel group order in `Physics`: g0 front-left (z=−track/2), g1 front-right, g2 rear-left, g3 rear-right. +Z is right, and positive `steering` turns right (heading increases, +z travel).

## Review Focus

- Steering reversal mid-slew (full left → full right): the angle passes smoothly through 0 at `steerRate`, with no jump. Pinned in Task 3.
- `reset()` mid-turn: the slewed steering angle returns to 0. Pinned in Task 3.
- Locked diff with both wheels on an axle lifted: zero force, no NaN. Pinned in Task 2.
- Partial `diff` override (`{diff:{rear:'open'}}`) keeps `front:'locked'`. Pinned in Task 1.
- `ackermannFactor` 1 at exactly zero steer: no division by zero, both angles 0. Pinned in Task 3.

---

### Task 1: Profile schema and validation

**Files:**
- Modify: `config/vehicles/{mn168,heavy-crawler,tracked-crawler}/vehicle.json` (add the four fields with the defaults)
- Modify: `src/vehicles.js` (nested merge list in `resolveVehicle` gets `'diff'`; add validation)
- Modify: `README.md` (one line on the new fields in the vehicle profile section)
- Test: `test/vehicles.test.js`

**Interfaces:**
- Produces: resolved vehicle `v.steerRate:number`, `v.ackermannFactor:number`, `v.torqueSplit:number`, `v.diff:{front:'locked'|'open',rear:'locked'|'open'}`.

- [ ] **Step 1: Write failing test** `drivetrain fields default, merge and validate`:
  - `resolveVehicle('mn168')` has `steerRate===6`, `ackermannFactor===1`, `torqueSplit===.5`, `diff` deepEqual `{front:'locked',rear:'locked'}`.
  - `resolveVehicle({profile:'mn168',diff:{rear:'open'}}).diff` deepEqual `{front:'locked',rear:'open'}`.
  - Throws for each of: `{steerRate:0}`, `{steerRate:101}`, `{ackermannFactor:-.1}`, `{ackermannFactor:1.1}`, `{torqueSplit:1.5}`, `{diff:{front:'welded'}}`, `{diff:{middle:'open'}}`.
  - Accepts `{torqueSplit:0}` and `{ackermannFactor:0}`.
- [ ] **Step 2:** `node --test test/vehicles.test.js` → FAIL.
- [ ] **Step 3:** Implement. Ranges: `steerRate` in (0,100], `ackermannFactor` and `torqueSplit` in [0,1] (inclusive). `diff` values must be in `['locked','open']`. Unknown `diff` keys are already rejected by the nested-object loop once `'diff'` is in its list.
- [ ] **Step 4:** `node --test test/vehicles.test.js test/vehicle-*.test.js test/launcher.test.js` → all pass.
- [ ] **Step 5:** Commit `feat(vehicles): steerRate, ackermannFactor, torqueSplit, diff profile fields`.

### Task 2: Axle force distribution (pure)

**Files:**
- Modify: `src/drivetrain.js`
- Test: `test/drivetrain.test.js` (new)

**Interfaces:**
- Produces: `export function axleForces(force:number, available:[number,number], mode:'locked'|'open'):[number,number]`. `force` is the signed axle longitudinal force. `available` holds each wheel's non-negative longitudinal grip budget (0 = lifted). Returns signed per-wheel forces, each with `|f| ≤ available[i]`.

- [ ] **Step 1: Write failing tests** (`assert` with 1e-9 tolerance):
  - `axleForces(4,[10,10],'locked')` → `[2,2]`; same for `'open'`.
  - Locked, one lifted: `axleForces(4,[0,10],'locked')` → `[0,4]`.
  - Locked, low grip: `axleForces(4,[1,10],'locked')` → `[1,3]`.
  - Locked, both capped: `axleForces(30,[5,10],'locked')` → `[5,10]`.
  - Open, one lifted: `axleForces(4,[0,10],'open')` → `[0,0]`.
  - Open, low grip: `axleForces(4,[1,10],'open')` → `[1,1]`.
  - Negative force: `axleForces(-4,[0,10],'locked')` → `[0,-4]`.
  - Both lifted: `axleForces(4,[0,0],mode)` → `[0,0]` for both modes, and every value is finite.
- [ ] **Step 2:** `node --test test/drivetrain.test.js` → FAIL (not exported).
- [ ] **Step 3:** Implement.
  - Locked: give each wheel `min(|F|/2, avail)`, then hand the remainder to the wheel with spare budget, up to its budget, keeping the sign.
  - Open: each wheel gets `sign*min(|F|/2, min(avail))`.
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5:** Commit `feat(drivetrain): locked/open axle force distribution`.

### Task 3: Physics: steering slew, Ackermann, split and diffs

**Files:**
- Modify: `src/physics.js` (constructor/`reset()` state, `stepWheels`)
- Test: `test/vehicle-physics.test.js` (existing helpers `run`, `using`)

**Interfaces:**
- Consumes: `axleForces` (Task 2) and the Task 1 fields.
- Produces: `this.steerAngle:number` (slewed centre angle, rad, Rapier sign convention), reset to 0 in the constructor and in `reset()`.

- [ ] **Step 1: Write failing tests:**
  - `steering slews at steerRate`: mn168 after warm-up, one `p.step(.01,0,1)`. Assert the centre angle `|p.steerAngle| ≤ 6*.01+1e-6`. After 0.2 s at steering 1, `|p.steerAngle|` ≈ `maxSteer` within 1e-6. Then `run(p,.05,0,-1)`: `p.steerAngle` changed by ≤ `6*.05+1e-6` (no jump through the reversal). After `p.reset()`, `p.steerAngle===0`.
  - `ackermann inner wheel turns more`: mn168, `run(p,.5,0,.5)`. With right turn as the reference, `|wheels[1].steering| > |wheels[0].steering|`, and both are within 25% of `.5*maxSteer`. With `resolveVehicle({profile:'mn168',ackermannFactor:0})`, both angles are equal within 1e-6. At steering 0 with factor 1, both are exactly 0.
  - `ackermann turn radius matches geometry`: mn168, throttle .3, steering .5, settle 3 s. `speed/|yaw rate|` is within 15% of `wheelbase/tan(.5*maxSteer)`.
  - `torqueSplit 0 drives only rear`: `resolveVehicle({profile:'mn168',torqueSplit:0})`, then `run(p,1,1,0)`. For front rays, `p.car.wheelEngineForce?.(i)` must be 0 if Rapier exposes the getter. Otherwise record the forces passed to `setWheelEngineForce` by wrapping it in the test. The vehicle still moves `x > .2` in 2 s.
  - `locked diff drives with a lifted wheel, open diff stalls that axle`: mn168 with `torqueSplit:1` (front only). Add a narrow fixed block under the left wheels only, tall enough that the right wheels hang. Assert `!s.wheels[1].contact` and `s.wheels[0].contact` after settling. Over 1 s at throttle 1, recorded front engine force sums ≠ 0 with locked and ≈ 0 with `diff:{front:'open'}`.
- [ ] **Step 2:** `node --test test/vehicle-physics.test.js` → new tests FAIL.
- [ ] **Step 3:** Implement in `stepWheels`:
  - Steering: target `-steering*c.maxSteer`. `this.steerAngle` moves toward it by at most `c.steerRate*h` per substep. Per front wheel, `δ_ack=sign(δ)*atan(L/(L/tan|δ| ∓ track/2))`, with the inner side (the wheel on the turn-centre side) using `−` and the outer `+`, guarding `δ===0`. Applied angle is `δ+ackermannFactor*(δ_ack−δ)`.
  - Drive: `F_total=drive.value*c.engineForce*taper`. Axle forces are `F_total*torqueSplit` (front) and `F_total*(1−torqueSplit)` (rear). Per wheel, `available = Σ contacting rays load*grip`. Call `axleForces(F_axle,[availL,availR],c.diff.front|rear)`, split each wheel's force evenly over its contacting rays, and feed it to the existing per-ray friction circle as `requested` (replacing `drive.value*c.engineForce*taper/(4*n)`).
- [ ] **Step 4:** `node --test test/vehicle-physics.test.js` → all pass. Then full `npm test` → only the two known failures.
- [ ] **Step 5:** Commit `feat(physics): steering slew, Ackermann geometry, torque split and axle diffs`.
