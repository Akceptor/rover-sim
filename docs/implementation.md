# Local Rover simulator design and implementation

The user's specification authorizes implementation without design approval checkpoints.
Node hosts Rapier WASM, UDP JSON lockstep and WebSocket snapshots. Three.js renders
only; its camera/canvas output is isolated for a later video producer.
Physics coordinates are right-handed north/up/east (X/Y/Z); chassis forward +X,
right +Z. NED maps [x,z,-y]. Body FRD maps [x,z,-y]. Body and earth basis use
the same proper rotation. Quaternions become [w,x,z,-y]. Accelerometer reports
specific force R^-1(a-g), including gravity compensation at rest.

1. Test binary 16/32 channel packets, PWM, coordinate transforms and frame clock.
2. Implement these primitives and validate malformed/duplicate/restart cases.
3. Build a four ray-wheel Rapier rover and flat ground; test forward/reverse/turn.
4. Add shared world obstacles, ramps and uneven ground, and collision tests.
5. Implement backend lockstep, paced replies, connection timeout and snapshots.
   Duplicates receive cached replies without stepping. Skipped frames hold last
   actuator state for bounded missing steps. Huge gaps resynchronise with one bounded step. Counter
   regression only resets after timeout or a new peer following timeout; other old packets
   are discarded. Reset in SITL requires restarting SITL, never teleport live EKF.
6. Build browser FPV/chase, HUD, standalone keyboard lease and local controls.
7. Add parameter allowlist import, launchers and documentation.
8. Build native ARM macOS SITL if possible, verify telemetry, RC control, mission.
   Report VM/browser checks that cannot be exercised.

No changes to existing projects; no remote publication or push.

## Simulator HUD (2026-11-20)

The approved continuation restyles this local simulator using the sibling rover
UI's dark panels, status pills, blue camera selector and corner telemetry.
Only visual conventions are reused; physics and JSON/MAVLink routing stay intact.

Implementation and validation sequence:
1. Extend `scripts/browser-smoke.mjs` for Settings, camera controls, focus safety
   and a 390px window; confirm failure on the missing Settings button.
2. Replace `web/index.html` and `web/style.css` with the framed responsive cockpit
   and modal camera drawer, preserving existing control IDs.
3. Update `web/app.js` to render at viewport dimensions, synchronize camera
   selectors, require viewport focus for standalone driving, and release keys
   on focus loss or opening settings. Keep SITL actuator authority unchanged.
4. Run `npm test` and `node scripts/browser-smoke.mjs`; inspect FPV, chase and
   narrow screenshots, then review the diff and document the controls.

Camera settings remain session-local. WebRTC statistics are not inferred.

## HUD MAVLink telemetry (2026-11-20)

Add arm state and flight mode badges beside JSON connection in the header.
Read SERIAL2's independent UDP heartbeat feed on 14560, validate MAVLink v1/v2
framing, HEARTBEAT CRC and source system/component/type, then expose an
`autopilot` snapshot over the existing HTTP/WebSocket path. Keep decoding in
`src/mavlink.js`, transport in `src/server.js` and presentation in `web/app.js`.
No MAVLink commands are sent and the two existing TCP endpoints stay available.

Missing/stale telemetry clears both badges to UNKNOWN after three seconds;
standalone hides them. Unrecognized custom modes retain their numeric value.
Both launchers add SERIAL2's UDP destination; its protocol defaults to MAVLink2.
Tests use independent pymavlink wire fixtures, malformed and stale data, Chrome
badge transitions and the real SITL integration's disarmed/armed/mode changes.
