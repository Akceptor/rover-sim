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
