# Validation record — 20 November 2026

## Exercised

- Apple M3, native arm64 macOS, Node 26.13.1, Python 3.12.9 and 3.15.2, Apple Clang 17.
- Official ArduPilot source `4ca1bc74fc088242931054cac963cdfd91589b51`,
  native `waf configure --board sitl` and `waf rover -j6` successful.
- Real JSON backend selected explicitly. SITL console confirmed timestamp,
  gyro, specific force, position, quaternion and velocity fields received.
- EKF3 active, both simulated IMUs initialised, GPS detected, absolute position
  ready; normal arming succeeded without disabling checks or truth-AHRS mode.
- Separate simultaneous SERIAL0/1 MAVLink TCP clients both received heartbeats.
- Manual RC overrides into ArduRover caused SERVO2/4 outputs and real physics:
  forward 2.53 m, reverse -2.51 m, right heading change +35.48° (about +37° in the preceding run).
- Mission protocol upload accepted and AUTO `MISSION_ITEM_REACHED` for waypoint 1.
- Real SITL process restart after timeout reconnected and reset physical pose.
- Installation/build script rerun successfully from the project directory using its
  pinned Python dependencies; native ARM64 binary is available under `.tools`.
- Stationary acceleration [0,0,-9.80665] m/s². Stationary velocity consistency
  and transformed attitude signs checked with tests.
- 17 focused automated tests: 16/32 channel packet layouts, bad lengths/magic/rate,
  PWM calibration/clipping/reversal, NED/body/quaternion signs, duplicate/gap/wrap/
  restart handling, pause timestamps, ground settling, forward/reverse/turn,
  collision barrier, ramp contact/tilt, neutral slowing, parameter import protection, MAVLink heartbeat CRC/source/freshness decoding, actual UDP/
  HTTP/WebSocket backend timeout/reconnect and standalone multi-client ownership.
- Chrome headless using the installed Chrome channel: actual WebGL rendering,
  screenshots of FPV/chase and 390px standalone/SITL layouts, viewport sizing,
  keyboard movement, pause and standalone reset. Settings drawer focus, Escape,
  FOV, camera selector synchronization, held-key release and stable connection
  live-region announcements checked. A real UDP actuator fixture verifies
  JSON state/PWM rendering and that browser keys retain SITL actuator authority.
  The full native ArduRover integration was also rerun: receive-only SERIAL2
  heartbeats reported disarmed, ARMED/MANUAL and AUTO in the backend while both
  MAVLink TCP clients, manual driving, mission completion and restart passed.
- JavaScript syntax checks, POSIX launcher syntax, Python compile check.
- npm production dependency audit: zero known vulnerabilities at validation time.
- Read-only review found a neutral-input ownership bug across standalone tabs;
  fixed with a reproducing backend WebSocket regression test.

See `integration-result.json`, `integration-sitl.log`, `integration-backend.log`,
`standalone.png`, `chase.png`, `mobile.png`, `sitl-mobile.png` and `sitl.png`. Test scripts regenerate these artifacts.

## Limits and remaining manual checks

- Mission Planner is in a running Windows 11 VM, but its UI was not automated or
  connected during this run. Parallels `prlctl exec` refused guest commands because
  this installation lacks the Pro/Business feature. Direct MAVLink endpoint tests
  establish SITL telemetry/commands and simultaneous clients; they do not establish
  that Mission Planner itself connected or that its joystick is configured.
- Windows ARM Node/backend, Windows/Cygwin SITL executables and PowerShell scripts
  were not executed. There is no evidence requiring WSL2 or nested virtualisation;
  the demonstrated arrangement keeps physics and SITL natively on Mac.
- VM network/firewall reachability and companion application's actual connection
  remain manual checks using the documented TCP ports/directions.
- Collision, ramp and terrain geometry are implemented. Barrier collisions and stationary ramp support/tilt are
  automated; a terrain mission and rollover recovery have not been validated.
  The closed-loop mission deliberately used flat ground to isolate integration.
- No WebRTC, server-side video encoder, calibrated MN168 handling model or tyre
  deformation. Camera output is currently the browser canvas.
- Browser-disconnected progression is tested via backend UDP without any browser.
  A long-duration endurance test, host sleep/resume, resource saturation and
  packet-fault injection against real SITL remain untested.
