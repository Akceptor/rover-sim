# Crawler Lab — local ArduRover FPV simulator

A four-wheel yellow crawler driven by **real ArduRover SITL** through its JSON
external physics interface. Node runs Rapier WASM; Three.js displays the onboard
camera and chase view. Browser rendering never advances physics. No WebRTC in v1.

Validated on Apple M3/macOS with native ARM64 SITL: manual forward/reverse/steering,
EKF3/GPS, two simultaneous MAVLink TCP clients, and an AUTO waypoint mission.
Windows ARM execution and Mission Planner's actual UI connection remain unverified.
See [validation](docs/validation.md) and the recorded [integration result](docs/integration-result.json).

## Quick start: standalone

Install Node.js 22 or later (ARM64 on the M3; ARM64 or emulated x64 on Windows).

On **Windows 11 ARM in Parallels**, install Node.js LTS and npm together from
PowerShell using WinGet:

```powershell
winget install --id OpenJS.NodeJS.LTS --exact --architecture arm64 --source winget
```

The [WinGet package](https://github.com/microsoft/winget-pkgs/tree/master/manifests/o/OpenJS/NodeJS/LTS)
includes the ARM64 installer. Alternatively, use the Windows ARM64 `.msi` from
the [official Node.js download page](https://nodejs.org/en/download/).

Close and reopen PowerShell after installation so the updated PATH takes effect,
then verify both commands:

```powershell
node --version
npm.cmd --version
```

Use `npm.cmd` in PowerShell to avoid script execution-policy restrictions on
`npm.ps1`; no execution-policy change is needed.

From the cloned `rover-sim` directory:

```sh
npm ci
npm run standalone
```

Open **http://127.0.0.1:8090**. W/S or arrows drive forward/brake/reverse; A/D or
arrows steer. Neutral applies a brake; an opposite command brakes and then reverses.
Blur, hidden tab, disconnected WebSocket, or a 300 ms expired input lease releases
keyboard controls. Standalone mode is prominently labelled and has no autopilot.

Windows PowerShell:

```powershell
npm.cmd ci
.\scripts\start-backend.ps1 -Standalone
```

The first release models a small generic crawler; dimensions are starting values,
not measured MN168 specifications. Obstacles are fixed objects; wheel contact uses
ray casts, not tyre meshes. This is not an MN168 performance calibration.

## Recommended deployment: native Mac SITL and backend, Windows Mission Planner

This avoids any assumption about Windows ARM SITL packages, WSL2 or nested
virtualisation. Rapier is WebAssembly with no platform-specific physics addon.
Three.js and ws are JavaScript. Windows ARM backend compatibility is expected
from this arrangement but has **not** been tested on the VM.

### Build native SITL once

Install Apple's command line tools (`xcode-select --install` if absent), Git and
Python 3.12 (or 3.15, both exercised here). The script clones the official source at the tested commit
`4ca1bc74fc088242931054cac963cdfd91589b51`, installs Python dependencies in
`.venv-sitl`, and builds `.tools/ardupilot/build/sitl/bin/ardurover`. It does not
modify system Python or install an embedded ARM compiler.

```sh
PYTHON=python3.12 sh scripts/build-sitl.sh
```

If your `python3` already is Python 3.12, omit `PYTHON=python3.12`. Waf's code
generation must use the venv Python; merely invoking waf with a venv interpreter
while `python` resolves elsewhere can produce an erroneous missing-empy failure.
The pinned source is a development commit tested here, not a stable release claim.

### Start backend, then SITL

Terminal 1:

```sh
npm ci
npm start
```

Terminal 2 (first run, or whenever changing defaults):

```sh
sh scripts/start-sitl.sh --wipe
```

The script starts a separate simulation EEPROM/log directory under `.run/sitl`.
`--wipe` resets **only that simulation's** saved parameters. Subsequent runs can
omit it; existing saved parameter values override defaults. The exact underlying
command is:

```sh
/path/to/ardupilot/build/sitl/bin/ardurover \
  --model JSON:127.0.0.1 --sim-port-out 9002 --rate 100 --speedup 1 \
  --home 50.4501,30.5234,100,0 --defaults /absolute/path/rover-sim/config/rover.parm \
  --serial0 tcp:5760 --serial1 tcp:5762 --wipe
```

For an already configured official source tree, an alternative is:

```sh
/path/to/ardupilot/Tools/autotest/sim_vehicle.py -v Rover -f rover \
  --model JSON:127.0.0.1 --no-mavproxy \
  --add-param-file=/absolute/path/rover-sim/config/rover.parm \
  -A '--sim-port-out 9002 --rate 100 --serial0 tcp:5760 --serial1 tcp:5762' -w
```

`-v Rover` matches the current source vehicle directory. Older trees may use
`APMrover2`; inspect that checkout's `sim_vehicle.py --help`. **An ordinary Mission
Planner Simulation launch does not select this backend.** Do not run its default
rover physics alongside this one. Confirm SITL prints `Starting SITL: JSON` and
`JSON control interface set to 127.0.0.1:9002`, then the received sensor fields.
The HUD must say JSON connected and sim seconds must advance.

### Mission Planner in Parallels

1. In Windows, determine the Mac's reachable IPv4 address on the Parallels shared
   network, or the Mac's LAN IPv4 with bridged networking. Do not use Windows
   `127.0.0.1` to reach a Mac process. On this Mac the Parallels shared host adapter is currently `10.211.55.2`;
   try that address first for the default shared network. Check the Windows adapter's gateway and the
   Mac's adapter addresses; the gateway may be the Parallels router, so verify it
   rather than assuming a fixed address. `ifconfig` on Mac helps identify the host.
2. Check from Windows PowerShell:
   `Test-NetConnection <MAC_IP> -Port 5760`.
3. Select **TCP** in Mission Planner, click Connect, enter `<MAC_IP>` and **5760**.
   Windows Mission Planner is the **TCP client**; SITL on Mac is the **listener**.
   Baud rate is irrelevant. Allow incoming TCP on macOS firewall if prompted.
4. Wait for EKF/GPS readiness (typically 30–60 seconds). Select MANUAL and arm.
   Configure Mission Planner joystick/RC override for RC1 steering and RC3
   reversible throttle (centre 1500). Those RC inputs are distinct from SERVO2
   steering and SERVO4 throttle outputs. Observe both actuator PWM and movement.
5. For AUTO, upload a short mission within the flat area, select AUTO and arm.
   Use roughly 1.2 m/s and 0.5 m waypoint radius. The compact playground contains
   obstacles; this is a contact simulation, not obstacle avoidance. A waypoint
   through a wall will not succeed. `node src/server.js --flat` removes obstacles
   for initial navigation tests.

**Simultaneous companion:** connect it as a separate TCP client to
`tcp:<MAC_IP>:5762` (or `tcp:127.0.0.1:5762` on Mac). Both links allow inbound
commands and outbound telemetry. SERIAL0 and SERIAL1 default to MAVLink in the
validated binary. If previously saved settings changed them, wipe the simulation
or set their protocols to MAVLink2. Do not connect two clients to one UART port.

| Purpose | Listener | Initiator / direction |
| --- | --- | --- |
| Physics | Backend UDP 127.0.0.1:9002 | SITL sends binary actuators; backend replies to sender's ephemeral UDP port |
| Mission Planner MAVLink | SITL TCP 0.0.0.0:5760 | Windows MP connects to Mac |
| Companion MAVLink | SITL TCP 0.0.0.0:5762 | Companion connects to Mac |
| Browser/HUD | Backend HTTP + WebSocket 127.0.0.1:8090 | Browser connects to backend |

To use a companion that requires UDP endpoints, run MAVProxy against one SITL UART
and fan out bidirectional links, for example (install MAVProxy separately):

```sh
mavproxy.py --master=tcp:127.0.0.1:5760 \
  --out=udp:<WINDOWS_IP>:14550 --out=udp:127.0.0.1:14551
```

Then Mission Planner selects **UDP** and listens on **14550**; companion listens
on **14551**. MAVProxy initiates traffic toward those listeners and routes replies.
Keep `mavfwd` enabled for commands from its output links. Direct TCP is the tested,
simpler option. UDP fanout and Mission Planner UI were not tested here.

### Optional Windows backend / SITL

```powershell
.\scripts\start-backend.ps1
# Only with an actual runnable JSON-capable Windows SITL executable:
.\scripts\start-sitl.ps1 -SitlExe C:\path\to\ardurover.exe -Wipe
```

The script does not download or assume an ARM Windows SITL binary exists.
Cygwin runtime requirements and x64 emulation must be checked for that executable.
For Mac SITL + Windows backend, set backend `udpHost` to `0.0.0.0`, allow inbound
Windows UDP 9002, and run Mac with `BACKEND_HOST=<WINDOWS_IP>`; leave JSON and
MAVLink port numbers separate. This mixed variant is untested; colocating backend
and SITL on Mac is recommended and was exercised without nested virtualisation.

## Configuration, controls and reset

Copy `config/default.json` and launch:

```sh
node src/server.js --config config/my-rover.json
# Add --standalone for keyboard test mode, or --flat for an empty flat world.
```

`steering` and `throttle` use **one-based output channel numbers**, `min`, `trim`,
`max` in microseconds, and `reversed` booleans. Defaults support SERVO2 and SERVO4.
PWM 0/outside 800–2200 is neutral. Values within that envelope clip to calibrated
limits; each side is normalised separately around trim. Invalid calibrations fail
at startup. `vehicle` sets metres, kilograms, radians, newtons and m/s: dimensions,
wheelbase/track, suspension, steering limit, engine force, speed and resistance.
`brakeImpulse` is per-wheel impulse per physics substep. Adjust both servo
calibration in SITL and the physical mapping intentionally to avoid accidental
double reversal. Configuration changes require backend and SITL restart.

- **FPV / Chase:** choose camera. FPV field of view 40–120°, mount forward/height/right
  offsets in metres from chassis centre. Mount height is above the chassis origin,
  not ground. Camera values affect rendering only.
- **Stop / Start physics:** holds pose while stopped. In SITL, sensor timestamp
  continues, velocity/gyro are zero and gravity is transformed to the held attitude.
  This is a simulation hold, not an RC emergency stop. ArduRover continues computing
  actuators, so switch HOLD/disarm before resuming if a mission was active.
- **Standalone reset:** resets position, attitude and velocity immediately.
- **SITL reset:** stop the SITL process, wait at least 2 seconds for timeout, click
  Reset, then restart SITL. Reset while JSON is live is refused. Restart resets
  ArduRover's EKF and physics together; backend starts a new session on new source
  port or counter regression after timeout. Do not restart only the backend while
  an armed SITL process is running; restart both to keep estimator state valid.
- In SITL mode browser keys never directly affect physics. Your existing browser
  keyboard companion must send MAVLink RC overrides/manual commands to ArduRover.
  The resulting SERVO outputs alone move this backend.

### Import selected real-rover tuning

Never load the entire Cube parameter dump into SITL. Select named, allowlisted
navigation/controller tuning values and review the generated file:

```sh
node scripts/import-params.mjs /path/to/real-rover.param \
  CRUISE_SPEED,CRUISE_THROTTLE,ATC_ACCEL_MAX > config/selected.parm
EXTRA_PARAMS="$PWD/config/selected.parm" sh scripts/start-sitl.sh --wipe
```

The importer cannot copy sensor calibration, EKF, GPS, serial, SIM or servo
assignments. Edit the simulator's channel/PWM settings explicitly. The allowed
parameters are listed in `src/parameters.js`; selected unavailable parameters
are not silently invented. `start-sitl.ps1 -ExtraParams ...` provides the same
additional defaults-file mechanism. This does not calibrate the physics model.

## Architecture and protocol

`src/physics.js` owns Rapier and four suspension ray wheels, front steering,
reversible four-wheel traction, speed-limited engine force, neutral/opposite-input
braking, rolling resistance and rigid chassis contacts. `src/world.js` shares
obstacle dimensions with the renderer. Terrain is fixed boxes, ramps and bumps;
cones use cone geometry. This is a compact first implementation with no drivetrain
gearing, articulated axles, tyre deformation or movable obstacles.

`src/protocol.js` validates official little-endian UDP layouts: 40 bytes with
magic 18458 and 16 channels, or 72 bytes with magic 29569 and 32 channels. Both
contain uint16 rate, uint32 counter and uint16 PWM array. Rates 50–2000 Hz are
accepted. Each frame advances 1/rate seconds, subdivided to at most 5 ms, and replies
with one `\n{JSON}\n` containing absolute physics seconds, IMU gyro (rad/s), body
specific force (m/s²), NED position (m), NED velocity (m/s), quaternion `[w,x,y,z]`.

The **right-handed** physics basis is X north/forward, Y up, Z east/right.
NED and body FRD both map `[x,y,z] -> [x,z,-y]`. The attitude quaternion maps
`[w,x,y,z] -> [w,x,z,-y]`. Sensors rotate world acceleration minus gravity into
body axes. Level stationary IMU reads `[0,0,-9.80665]`, gyro zero. Pose derivatives
provide mutually consistent velocity/acceleration (Rapier's end-of-step support
velocity otherwise has a small downward bias even when pose is stationary).
GPS uses the launch home and local position; the renderer does not handle geodesy.

`src/session.js` tracks source endpoint and uint32 counter wrap. Duplicates get
cached sensor bytes without advancing time. Up to one second / 500 missing frames
are integrated with previous actuators before the newest output. Larger forward
gaps resynchronise the counter with one bounded step and a diagnostic, avoiding an
unbounded catch-up. Live out-of-order packets are discarded. A regressed counter
requires timeout before resetting; new endpoints cannot replace an active peer.
SITL retries when a reply is lost; the backend answers cached duplicates. Some
older JSON documentation says 10 seconds; the tested source retries around 1 second.

The backend paces replies to wall time and does not depend on requestAnimationFrame.
At timeout, SITL physics freezes; it never free-runs stale throttle. Browser
snapshots are 20 Hz, with backpressure limits. Standalone runs fixed 100 Hz steps
from a server timer and drops excess wall-time backlog after stalls; system sleep
and CPU overload cannot guarantee real time. HUD RTF and packet age show this.
Close/minimise the browser: SITL and physics continue. Disable host sleep during
long missions. Browser disconnect has no effect on SITL actuator authority.

`web/app.js` isolates `fpvOutput` (scene/camera/renderer/canvas) as a future camera
capture seam. No WebRTC, video encoding, server rendering or headless video
capture pipeline is implemented. Displaying video still requires an open browser.

Official references verified before implementation:

- [JSON protocol and launch example](https://github.com/ArduPilot/ardupilot/blob/master/libraries/SITL/examples/JSON/readme.md)
- [JSON implementation](https://github.com/ArduPilot/ardupilot/blob/4ca1bc74fc088242931054cac963cdfd91589b51/libraries/SITL/SIM_JSON.cpp)
- [SITL startup options](https://github.com/ArduPilot/ardupilot/blob/4ca1bc74fc088242931054cac963cdfd91589b51/libraries/AP_HAL_SITL/SITL_cmdline.cpp)
- [Native macOS build setup](https://ardupilot.org/dev/docs/building-setup-mac.html)
- [Rapier vehicle controller](https://rapier.rs/docs/user_guides/javascript/character_controller/)

## Tests

```sh
npm test
# Installed Chrome needed, no downloaded Playwright browser required:
npm run test:browser
# After build; no browser needed, starts its own backend/SITL on isolated ports:
.venv-sitl/bin/python scripts/integration.py \
  --sitl .tools/ardupilot/build/sitl/bin/ardurover
```

Integration reserves HTTP 8091, UDP 9003, TCP 5770/5772 and uses a temporary EEPROM
and log directory. It checks stationary IMU, two MAVLink clients, EKF readiness,
normal arm, manual forward/reverse/right steering, mission upload and waypoint
reach. Artifacts go to `docs/integration-result.json` and `docs/integration-*.log`.
Browser smoke reserves 8092 and checks real Chrome WebGL rendering, keys, pause
and reset, producing screenshots. No tests contact a real flight controller.

## Troubleshooting

- **SITL exits immediately only inside an agent sandbox:** the tested firmware
  probes its parent with `kill(parent_pid, 0)` each frame and exits if denied.
  Launch from a normal terminal or grant the launcher normal local process
  permissions. The physics integration does not require administrator privileges.
- **Port busy:** change `httpPort` (default 8090; 8080 was already occupied here)
  or stop your previous backend. Stop only processes belonging to this simulator.
  Match physics port in config and `--sim-port-out`/`PHYSICS_PORT`.
- **Waiting for SITL / no JSON sensors:** check `--model JSON:<backend IP>`, UDP
  bind/interface/firewall and the SITL console. MAVLink connectivity alone does
  not prove the external physics backend is selected.
- **SITL stuck after backend interruption:** wait for its actuator retry, or restart
  SITL for a clean estimator reset. Never use a live backend-only reset as a teleport.
- **Prearm/mode failure:** wait for GPS and EKF absolute position. Do not bypass
  checks with truth AHRS or disabled arming checks; use the console diagnostics.
  Real parameter dumps often disable the very simulated sensors SITL needs.
- **No motion:** confirm armed MANUAL, non-neutral SERVO2/4 PWM in HUD, mapping and
  min/trim/max. RC1/3 inputs are not the same as output channels 2/4.
- **Wrong steering:** verify PWM reversal once and actuator sign. Positive steering
  is right and increases compass heading. Check orientation and body/NED mapping.
- **Unstable navigation:** use flat mode, default params, normal speedup, check RTF,
  confirm stationary acceleration and rerun integration. Sharp impacts can upset
  the EKF just as large acceleration transients do on a real vehicle.
- **MP cannot connect from VM:** test TCP connectivity first. Shared/bridged network
  changes the host address. The backend HTTP bind does not control SITL MAVLink's
  TCP listener. A successful socket test does not confirm MP joystick configuration.
- **Chrome software graphics:** enable browser hardware acceleration; a slow WebGL
  renderer does not slow authoritative physics. Browser smoke requires local Chrome.
