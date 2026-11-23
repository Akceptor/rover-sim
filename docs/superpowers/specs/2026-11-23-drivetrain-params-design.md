# Wheeled drivetrain parameters

## Intent

Real RC crawlers steer with the front wheels through a servo and drive 4×4, often with locked diffs. The simulator snaps the steering angle instantly, steers both front wheels in parallel, and splits drive equally with no diff model. Lost traction on a lifted wheel simply vanishes. Make these behaviours explicit per-profile so tuning done in SITL transfers to the real vehicle.

## Goals

- `steerRate` (rad/s): front wheel angle slews toward the target at this rate, per physics substep.
- `ackermannFactor` (0–1): blend between parallel steer (0) and true Ackermann (1). Inner and outer front wheels turn about a common turn centre on the rear-axle line.
- `torqueSplit` (0–1): fixed front-axle share of total drive force. 0 = RWD, 1 = FWD, 0.5 = 4×4.
- `diff: {front, rear}`, each `locked` or `open`.

## Non-goals

- Skid-steer wheeled vehicles, 4WS, crab steering (the user always steers with the front wheels; ArduRover has no native 4WS).
- Wheel spin/rotational inertia, centre diff modelling, batteries, GPS settings.
- Changes to the tracked drivetrain.

## Approaches

1. **Chosen:** extend `stepWheels` and the profile schema; put the axle force distribution in a pure, unit-testable function in `src/drivetrain.js`.
2. Rejected: a full rotational drivetrain model (wheel spin states, diff gear coupling). Far more work and stiffness problems for a 1.2 m/s crawler, with no visible benefit at these speeds.

## Behaviour

- **Steering:** the commanded centre (bicycle) angle is `steering*maxSteer` (Claude's call: `maxSteer` stays the centre angle so `wheelbase/tan(maxSteer)` remains the turn radius used for ArduRover `TURN_RADIUS`). A slewed centre angle is kept in physics state and cleared on `reset()`. Per front wheel, the Ackermann angle is `atan(L/(R∓track/2))` with `R=L/tan|δ|`, and the inner wheel turns more. The applied angle is `δ + ackermannFactor*(δ_ackermann − δ)`. All rays of a multi-ray wheel share their wheel's angle. Published `state.wheels[].steering` remains the actual applied angle.
- **Drive distribution** (per substep, before the existing per-ray friction circle with lateral force):
  - Axle force: `F_total*torqueSplit` front, `F_total*(1−torqueSplit)` rear, where `F_total = drive*engineForce*taper` (current formula).
  - Wheel longitudinal availability = sum over its contacting rays of `load*grip`.
  - `locked`: split the axle force equally between contacting wheels; any excess over a wheel's availability moves to the other wheel, up to its own availability. A lifted wheel's share goes to the other.
  - `open`: each wheel gets `F_axle/2`, capped at the smaller availability of the two wheels on the axle. A lifted wheel means 0 from that axle.
  - A wheel's force is split evenly over its contacting rays, then the existing friction circle with lateral force applies.
- **Defaults** for all three profiles: `steerRate` 6, `ackermannFactor` 1, `torqueSplit` 0.5, `diff` locked/locked. The tracked profile carries the fields (schema uniformity) and ignores them.
- **Validation:** `steerRate` in (0, 100], `ackermannFactor` and `torqueSplit` in [0, 1], `diff` must be an object with exactly `front` and `rear`, each `locked` or `open`. Partial `diff` overrides merge like the other nested objects.

## Verification

- Steering: after one 0.01 s step at full lock, the angle is ≤ `steerRate*0.01` (plus tolerance). It reaches the target after `maxSteer/steerRate` seconds.
- Ackermann: at a non-zero steer, the inner wheel angle is larger than the outer one, with matching values at `ackermannFactor` 0. The steady low-speed turn radius is within 15% of `wheelbase/tan(δ)`.
- `torqueSplit` 0: the front wheels get no engine force, and the vehicle still drives.
- Pure-function unit tests: locked and open with both wheels gripping, one wheel lifted, and one wheel low-grip.
- Full `npm test`: only the two known baseline failures (backend browser-map selection, locations preset terrain).
