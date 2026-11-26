# Rover Sim · Crawler Lab

A browser-based FPV simulator for an MN168-style RC crawler. ArduRover SITL runs the autopilot and exchanges actuator and sensor data with the Rapier physics backend through ArduPilot's JSON interface. The browser shows onboard FPV and chase views. Use Mission Planner to drive with a joystick or run waypoint missions. For a quick drive, standalone mode uses the keyboard and runs without SITL.

## Install

Install Git and **Node.js 22 or later** with npm. On Windows 11 ARM in Parallels, use the ARM64 Node.js installer. Install Chrome or Edge if you want the launcher's background camera stream.

```powershell
git clone https://github.com/Akceptor/rover-sim.git
cd rover-sim
npm.cmd ci
```

On macOS/Linux, use `npm` in place of `npm.cmd` throughout.

## Quick start · keyboard

```powershell
npm.cmd run standalone
```

Open [http://127.0.0.1:8090](http://127.0.0.1:8090). Click the view to focus it, then use **W/S** or **↑/↓** for forward, brake and reverse, and **A/D** or **←/→** to steer. Pick a starting location from the dropdown first, then press **Start physics**. To skip the picker and load the configured terrain, run `node src/server.js --standalone`.

## Start with ArduRover SITL

For an all-Windows setup, install Mission Planner and use its **Simulation** tab to download ArduRover SITL. Stop the Mission Planner simulation before starting the Rover Sim launcher. The executable must support the ArduPilot JSON backend.

In PowerShell, copy the example launcher config once and edit it.

```powershell
Copy-Item config/launcher.example.json config/launcher.local.json
notepad config/launcher.local.json
```

Set `sitlExe` to your executable's full path. For example, if Mission Planner stores SITL in the Parallels shared Documents folder:

```json
{
  "sitlExe": "C:/Mac/Home/Documents/Mission Planner/sitl/ArduRover.exe",
  "backendConfig": "./default.json"
}
```

Use forward slashes in Windows paths. Relative paths in this file resolve from `config/`. The file is local to each checkout and is ignored by Git.

```powershell
npm.cmd run sim
```

On Windows you can also double-click `start-simulator.cmd`. Once the launcher prints **READY**, open the browser cockpit and connect Mission Planner using **TCP**.

| Service | Default address |
| --- | --- |
| Browser cockpit | [http://127.0.0.1:8090](http://127.0.0.1:8090) |
| Mission Planner | TCP `127.0.0.1:5760` |
| Companion computer client | TCP `127.0.0.1:5762` |
| Background camera | [http://127.0.0.1:8090/camera.mjpg](http://127.0.0.1:8090/camera.mjpg) |

Wait for GPS and EKF readiness, then arm in **MANUAL** for joystick driving, or upload a mission for **AUTO**. The background MJPEG stream continues when you close the cockpit. Use the [GStreamer setup](docs/video.md) to view it in Mission Planner, or run `npm.cmd run sim -- --no-video` to skip the background stream.

**Ctrl+C** stops the launcher and its services. SITL parameters are saved in `.run/sitl-windows` on Windows or `.run/sitl` on macOS/Linux. Use `npm.cmd run sim -- --wipe` only when you want to reset the saved simulation parameters.

## Choose a location in Mission Planner

Run Rover Sim and Mission Planner on the same Windows machine.

```powershell
npm.cmd run sim -- --mission-planner
```

1. Open the simulator cockpit at `http://127.0.0.1:8090`. Under **Mission Planner · Extra command line**, click **Copy command**.
2. Open the **Simulation** tab in Mission Planner and paste the copied line into **Extra command line**. These arguments tell ArduRover SITL to use Rover Sim as its physics backend.
3. Choose the location in the browser. To pick directly on the square map beside FPV, click a start and then **Load location** (**Custom · browser map**). For **Custom · Mission Planner**, move the **H / home marker** on the Mission Planner map to the desired start. For a bundled map, select a preset in the browser and click **Load location**.
4. In Mission Planner, set heading to **0**, leave **Wipe** unchecked, and click **Rover** to launch SITL with the extra arguments.
5. Stay disarmed while the terrain loads. When the browser shows **Terrain ready**, click **Start physics**, then arm in Mission Planner.

The five bundled terrain presets work offline. A custom location downloads terrain on the first visit and reuses the cached patch on subsequent visits to the same coordinates. If loading fails, click **Retry terrain** in the browser.

If SITL is already connected when you change the location in the browser, disarm and restart SITL from Mission Planner with the same extra command line.

[Mission Planner setup and troubleshooting](docs/mission-planner-start.md) · [Bundled locations](docs/locations.md)

## Cockpit map

FPV now uses a 16:9 panel beside a square pan/zoom map showing the rover, heading, terrain boundary, roads and buildings. In location-selection modes, click the map and then **Load location** to choose a start. Presets and **Custom · Mission Planner** remain available. On small screens the map stacks below FPV; the background camera stream stays full size.

Run `npm.cmd ci` after updating to install the bundled map library. Basemap tiles need internet; loaded OSM roads/buildings remain visible offline. See [map picking, Mission Planner behavior and offline limits](docs/map.md).

## Terrain, weather and internet access

- **Elevation** comes from Google GEM-15, a 15 m bare-earth elevation model. The browser and physics use the same terrain mesh.
- **Ground colours** come from historical Copernicus Sentinel-2 imagery. The simulator generates trees, rocks and close-up surface detail.
- **Bundled presets work offline** after installation. A new custom start needs internet access and available source coverage. The importer fetches elevation from Google Cloud Storage and looks up Sentinel-2 scenes through Element 84 Earth Search. Valid patches are saved under `.run/terrain-cache/` for offline reuse at the same coordinates.
- **Weather** comes from Open-Meteo and updates every 15 minutes when available. Weather affects the camera view. Local time and sun position drive day/night lighting, which also works offline. The data requests require no API keys.

[Terrain sources, attribution and importer](docs/terrain.md) · [Weather and local time](docs/weather.md) · [Launcher options](docs/launcher.md)

## OpenStreetMap roads and buildings

Real terrain now loads mapped roads and flat-roof buildings automatically. Buildings have footprint colliders, including concave outlines and courtyard holes. Roads follow the terrain; wheel contact and traction stay unchanged. Generated trees and rocks keep clear of mapped buildings and roads.

The Mission Planner copy/paste workflow above is unchanged. OSM loads while physics is held. A timeout or server error leaves terrain usable and offers **Retry OSM**; after driving begins, retries are cached for the next world load. All five existing presets include OSM snapshots under **`assets/osm/`** and work offline in a fresh checkout. Custom overlays use **`.run/osm-cache/`**, independently of elevation and imagery. Set `"osm": false` in the backend config to disable overlays.

Data is **[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)** under **ODbL**; processed caches are derived OSM databases. Buildings have varied plaster, brick and concrete facades, windows, decorative doors and textured flat roofs; heights remain approximate. Newly downloaded road surface tags control material colours, grip, rolling resistance, dust and ground marks for wheeled and tracked vehicles. Existing offline snapshots retain their baseline physics and paved/unpaved classification. Bridges, tunnels and motorways are skipped; roads do not grade the terrain. Cusco has roads but no mapped buildings in its snapshot. See [setup, configuration, offline behavior, license and limits](docs/osm.md) and the [resumable enhancement roadmap](docs/osm-roadmap.md).

## Checks

Run `npm test` for the automated test suite (local OSM fixtures; no Overpass access). Run `npm run test:osm` for the Chrome road-alignment and building-collision check, and `npm run test:map` for layout, offline vectors and click-to-select checks. See [validation](docs/validation.md) for browser and native SITL integration checks.

## Vehicle profiles

Choose **Vehicle → Load vehicle** beside the location controls. The HUD shows the active vehicle. An ordinary launch still starts with MN168 and requires no selection. With `npm run sim -- --choose-location`, load your vehicle before loading the location; the launcher starts SITL after location readiness. In standalone mode, loading a vehicle resets it on the current map and holds physics until **Start physics**.

| Profile ID | Model | Mass | Wheelbase / track centres | Wheel / track radius | Speed limit |
| --- | --- | --- | --- | --- | --- |
| `mn168` | Small front-steered 4WD crawler (default) | 3 kg | 0.30 / 0.26 m | 0.065 m | 1.2 m/s |
| `heavy-crawler` | Larger front-steered expedition crawler | 9 kg | 0.46 / 0.38 m | 0.095 m | 1.5 m/s |
| `tracked-crawler` | Independently driven twin tracks | 7 kg | 0.34 m between tracks | 0.075 m | 0.85 m/s |

These are **starting estimates**, not measured manufacturer specifications. Dimensions, CoG, collision shells, camera mount, suspension, grip and drivetrain tuning live in `config/vehicles/<id>/vehicle.json`, in metres, kilograms, seconds, newtons and radians. Vehicle and location are independent. Bundled terrain works with `"osm": false`.

Wheeled profiles also take drivetrain fields: `steerRate` (rad/s servo slew, 0–100), `ackermannFactor` (0 parallel steer … 1 true Ackermann), `torqueSplit` (front-axle drive share, 0 RWD … 1 FWD) and `diff` (`{"front","rear"}`, each `"locked"` or `"open"`). `maxSteer` stays the centre (bicycle) angle. Tracked profiles carry but ignore them.

For SITL changes, **disarm first** and wait for the browser to show fresh disarmed telemetry. The simulator holds physics while switching. The managed launcher restarts only SITL, preserving its saved parameters. In `--mission-planner` mode, stop SITL, **Copy command** again, paste into **Simulation → Extra command line**, and start **Rover**. A changed command clears the copied indicator. Wait for output verification before starting physics. Unknown or armed telemetry blocks changes.

### Track outputs and saved parameters

ArduRover performs skid-steer mixing. Tracks consume **SERVO2_FUNCTION=73** (Throttle Left) and **SERVO4_FUNCTION=74** (Throttle Right) directly, using independently calibrated `leftTrack` and `rightTrack` outputs. Standalone keys mix throttle and steering in the simulator and allow counter-rotation at zero throttle. Wheeled defaults remain SERVO2_FUNCTION=26 (steering), SERVO4_FUNCTION=70 (throttle). These function IDs and the skid-steer mixer are checked against the repository's pinned ArduPilot commit `4ca1bc74fc088242931054cac963cdfd91589b51` in `.tools/ardupilot/libraries/SRV_Channel/SRV_Channel.h` and `libraries/AR_Motors/AP_MotorsUGV.cpp`.

The launcher/browser command composes base `config/rover.parm`, a profile `.parm`, generated output calibration under `.run/vehicle-defaults/`, and optional `--extra-params`, in that order. **Saved EEPROM settings override defaults.** The backend requests actual output parameters over MAVLink and holds incompatible settings with an explanation. Correct those parameters explicitly in Mission Planner, then restart. Use `--wipe` (or Mission Planner's Wipe checkbox) only if you intend to discard saved tuning. Changing vehicles never wipes parameters automatically.

### Custom profiles and calibration

Old configs containing inline `vehicle` numbers plus `steering` and `throttle` calibrations still work. Their custom channels, trim, asymmetric endpoints and reversal remain intact. To select a built-in at launch, replace `vehicle` in a copy of `config/default.json` with its ID, for example `"vehicle": "tracked-crawler"`, then pass `--config path/to/backend.json`.

For overrides, use an object with `profile` and the fields you want to change; unspecified values inherit that profile:

```json
{
  "vehicle": {
    "profile": "tracked-crawler",
    "id": "custom",
    "name": "My measured crawler",
    "mass": 8.2,
    "centerOfGravity": {"x": -0.01, "y": -0.02, "z": 0},
    "cameraMount": {"x": 0.13, "y": 0.21, "z": 0},
    "drive": {"deadband": 0.03, "riseRate": 1.2, "fallRate": 3, "neutralBrake": 0.4},
    "trackGeometry": {"length": 0.5, "width": 0.075, "radius": 0.075, "samples": 5, "lateralResistance": 7}
  },
  "leftTrack": {"channel": 2, "min": 1100, "trim": 1490, "max": 1900, "reversed": false},
  "rightTrack": {"channel": 4, "min": 1000, "trim": 1500, "max": 2000, "reversed": false}
}
```

This fragment belongs in a full backend config. For a permanent built-in, add a directory `config/vehicles/<id>/` with a complete `vehicle.json` and its `sitl.parm` SITL defaults (without `sitl.parm` the launcher falls back to the MN168 or tracked defaults), and validation/geometry/behavior tests. Keep IDs unique. The validator rejects unknown fields, invalid PWM calibration, nonfinite values, invalid contact dimensions and out-of-range tuning. Coordinates use **+X forward, +Y up, +Z right**, relative to the chassis origin; `track` is the left/right centre spacing, not the total outside width. `collisionBoxes` use `{size:[length,height,width], position:[x,y,z]}`; they define solid body parts and the newer models render those same shells.

Calibrate in this order:

1. Measure loaded mass, chassis envelopes, wheelbase, wheel/track centre spacing, contact radius/width and FPV mount. Estimate CoG from axle loads and a careful tilt measurement. Use `centerOfGravity` to set mass distribution rather than moving the visible body.
2. Measure static suspension sag, compression/extension travel and recovery after release. Tune `suspensionTuning` stiffness, compression/relaxation damping, travel and maximum force. Tracks distribute spring force across footprint samples; wheel springs use Rapier's mass-scaled controller units.
3. Record actual SERVO output PWM at neutral and at the first repeatable forward/reverse motion. Apply PWM calibration first, then normalized `drive.deadband`; excessive simulator deadband can conceal low ArduRover output demand. Adjust `engineForce`, `maxSpeed`, and demand slew (`riseRate`/`fallRate`, normalized demand per second) using level-ground low-speed starts.
4. Compare neutral roll-down, stopping distance and forward-to-reverse delay. Tune `rollingResistance`, `brakeImpulse`, `drive.neutralBrake` (zero coasts), `reverseBrake` and `reverseThreshold` (m/s). For compatibility, `brakeImpulse` means the impulse at the original 5 ms substep; the simulator scales it with timestep so changing actuator packet rate does not change braking force.
5. Compare a gentle slope, a small step and loose-ground turns. Tune grip and tracked `lateralResistance`; verify counter-rotation without excessive sliding. Recheck contact loss and rollover behavior after changing CoG or grip.

### Contact model limits and checks

Wheels retain Rapier's raycast vehicle controller for suspension, tire friction, steering, braking and rotation. Drive demand ramps gradually; reverse demand brakes before applying opposite torque. Ground traction is contact/load limited. Wheels are compact ray contacts, without individual rigid tire colliders, deformable tires or axle articulation. Body shells are compound boxes; the MN168's decorative body remains an approximation.

Set a wheeled profile's `contactModel` to `"multi-ray"` to try three bounded longitudinal samples along each lower tire arc. The default remains `"ray"`. On the repeatable 24 mm square-step test, the default MN168 stalls at this drive setting while the prototype crosses; both cross the smaller 16 mm step. Additional samples can change suspension feel and do not turn the tire into a full collision shape.

Tracks use five spring/damper contacts per side, independent longitudinal drive, and lateral skid resistance limited by local support and grip. Missing contacts provide no traction. Each side's visual tread motion follows its simulated movement. This omits individual physical links, belt tension, compliance and detailed slip/soil mechanics.

Run `node --test test/vehicles.test.js test/vehicle-physics.test.js test/vehicle-render.test.js test/vehicle-session.test.js test/vehicle-backend.test.js` for profile, calibration, low-speed start/stop/reverse, steering, pivot, step/slope and contact-loss checks. `npm run test:vehicles` verifies browser selection and animation in Chrome. The full `npm test` suite also covers terrain, location, weather and streaming behavior.
