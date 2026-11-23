# Vehicle profiles and crawler physics

## Scope and current architecture

Keep the JSON actuator/sensor protocol, Rapier world, browser renderer, location loading, weather, and video architecture. No physical track links or OSM dependency.

`loadConfig` currently validates positive inline vehicle numbers and separate steering/throttle PWM calibrations. `Session.receive` converts SERVO2/SERVO4 through `pwm`, then calls `Physics.step`. Physics uses a mass-bearing box and four Rapier raycast wheels, +X forward, +Y up, +Z right. Rapier already supplies suspension, braking, tire friction, contact flags, and suspension force. Current suspension constants are hard-coded; engine demand changes immediately, and reverse demand simultaneously applies braking and reverse engine force.

`createCrawler` builds the MN168 model from dimensions and wheel centres. Browser animation uses suspension length and wheel rotation but assumes four wheels and computes steering from input. FPV mount is currently supplied by browser controls independently of vehicle dimensions. The visual cabin extends beyond the current box collider.

Location selection holds both standalone and session stepping, builds replacement physics, swaps `session.physics`, and broadcasts init. Revision checks discard stale asynchronous loads. Mission Planner location changes require fresh disarmed telemetry and a detected SITL restart; GPS verification gates release. The launcher starts native SITL after startup location readiness. Reuse these boundaries for vehicles.

## Design choice

Use validated profiles with a shared chassis and drivetrain boundary, retain Rapier wheels, and add sampled track contacts. Replacing all wheel dynamics would discard an existing contact/suspension solver. Approximating tracks solely with steering wheels would not provide the requested distributed footprint or independently limited drive. Keep the two contact implementations behind the existing Physics lifecycle.

## Profiles and compatibility

Add a profile module with MN168 (default), a larger/heavier front-steered 4WD crawler, and a tracked crawler. Treat all built-in values as initial estimates. Store SI chassis dimensions, collision boxes, mass, centre of gravity, wheel/track geometry, camera mount, suspension and contact tuning, deadband, drive ramp, speed limits, neutral behavior, braking and reversal threshold in data.

Resolve profile identifiers plus optional explicit overrides into a complete validated vehicle. Preserve legacy inline vehicle numbers and all supplied steering/throttle channels, asymmetric PWM endpoints, trim, and reversal. Expose legacy inline configurations as a custom active choice. Validate finite values, ranges, geometry relationships, calibration channel uniqueness, and drivetrain-specific required settings before world construction. Never mutate profile templates.

## Physics

Wheels retain Rapier steering, suspension and tire friction. Move stiffness, compression/relaxation damping, travel, maximum support force and grip to profiles. Apply throttle deadband and bounded drive slew per physics substep. Neutral supports tunable braking/coasting. Opposite demand first brakes above a small speed threshold, then ramps reverse drive. Reset clears drivetrain history. Contact and support load bound traction; airborne wheels cannot produce ground drive. Publish actual steering and wheel travel for rendering.

Prototype a bounded wheel contact alternative on the same small-step, rock and slope course. Compare progress, chassis strikes, stability and query cost to the unchanged single-ray baseline. Keep single-ray contact as the default unless evidence supports enabling the alternative. Document its limits explicitly.

Tracks use a fixed small number of spring/damper contact samples along each left/right footprint. Apply normal support, independent longitudinal forces and damped lateral skid resistance at world contact points. Bound the combined tangential force by local normal load and grip; absent contacts supply no traction. Use actual point velocity and terrain normal, prevent friction from reversing velocity within a substep, and distribute total drive over the footprint without doubling available force as samples increase. Publish each track's integrated motion and contacts for separate tread animation.

## Selection and startup consistency

Place Vehicle and Load vehicle next to location controls and show the active vehicle in the HUD. Ordinary default launch continues immediately. Startup picker lets users load a vehicle before committing the location; readiness used by the launcher includes any vehicle transition. Standalone selection holds physics, clears key ownership, builds and resets the selected chassis on the existing map, then publishes one coherent revision. Do not reload terrain/weather merely to change vehicles.

Keep active and pending profile identity distinct. During a SITL session, reject selection while armed or telemetry is unknown. After disarmed selection, hold physics, publish restart instructions and updated Mission Planner command, and stage the pending vehicle. Apply only after the old session stops and a fresh restart is detected; discard old-profile actuator frames. Share revision guards with concurrent map/OSM replacement and prevent Start physics from bypassing either hold. The renderer, Physics and Session config switch together. Tag state/init with the vehicle revision so an older state cannot animate the new geometry.

For launcher-managed SITL, expose restart-required state and the selected startup settings to the launcher; stop the old process and restart it only after the disarmed selection request. Preserve its run directory and EEPROM. Mission Planner remains user-managed: Copy command → Extra command line → start Rover; invalidate the copied indicator whenever arguments change.

## SITL defaults and saved parameters

Keep default wheeled SERVO2_FUNCTION=26 and SERVO4_FUNCTION=70. Tracks explicitly map left/right PWM channels with functions 73/74 and consume those outputs directly, without simulator mixing. Only standalone keys mix steering/throttle into bounded left/right demands.

Verified locally against pinned ArduPilot commit `4ca1bc74fc088242931054cac963cdfd91589b51`: SRV_Channel declares throttleLeft=73 and throttleRight=74; AP_MotorsUGV detects skid steering when both functions are assigned and performs motor mixing itself. Native `ardurover` exists at `.tools/ardupilot/build/sitl/bin/ardurover`.

Compose base defaults, profile defaults and explicit user extra defaults in that order. Saved parameters retain precedence. Inspect relevant actual servo functions/calibration via the existing integration tooling; report conflicting saved settings and keep incompatible profile startup held. Explain corrective parameter changes and explicit --wipe; never silently wipe or overwrite saved tuning. Browser commands include the selected profile defaults and any custom calibration required to match the backend.

## Rendering

Keep the existing MN168 procedural appearance. Add profile-sized larger crawler and compact tracked chassis using existing Three.js conventions. Geometry, collision envelopes, suspension wheel centres, footprint and FPV mount use resolved profile data. Preserve user-adjustable camera controls, initializing mount defaults when the vehicle changes. Animate independent track tread offsets from simulated side motion. Dispose replaced geometry/materials on every swap and reconnect.

## Verification and performance

Add validation and legacy compatibility tests first, including non-default calibrations. Exercise deadband, gradual starting, neutral stopping/coasting, braking before reverse, turning direction, tracked straight travel, gradual turns and pivot turns. Use tolerances for displacement, heading, speed, finite state and support. A repeatable course covers small steps, rocks, slopes and partial contact loss. Add protocol/session checks that prove tracks consume left/right outputs independently and old sessions cannot apply a staged profile.

Browser smoke checks cover selector placement, HUD, default launch without extra clicks, startup picker, Mission Planner command invalidation, reconnect, wheeled suspension/steering alignment, track footprint and separate tread motion. Run bundled-map checks with OSM disabled. Native SITL MANUAL checks should verify actual output direction and vehicle movement for wheels and tracks.

Baseline command: create Physics with default config and playground, warm up 1,000 steps at dt=.01/throttle=.3/steering=.2, then time 10,000 identical steps. Initial measurement: 0.01616 ms/step on this machine. Repeat warmed runs for baseline and each contact model without concurrent test activity; report median and worst batch times and ensure comfortable margin within the 10 ms simulation budget.

Initial full suite before implementation: 154 tests, 151 pass, 2 fail, 1 skipped. Failures concern bundled terrain origin mismatch and browser-map load timeout. Existing uncommitted location edits and browser patch files must be preserved; record baseline failures separately from vehicle regressions.

README will list profiles, selector/startup/restart behavior, tracked servo configuration, EEPROM precedence, custom profile schema and measurement calibration. Calibration starts with measured mass/dimensions/CoG and camera height, then suspension sag/travel, neutral roll-down, minimum moving PWM, low-speed force response, reverse stopping and turn radius. Describe rigid-body, ray-wheel and sampled-track approximations and the contact prototype comparison.
