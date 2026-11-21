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

Open [http://127.0.0.1:8090](http://127.0.0.1:8090). Click the view to focus it, then use **W/S** or **↑/↓** for forward, brake and reverse, and **A/D** or **←/→** to steer.

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
3. Choose the location in the browser. For **Custom · Mission Planner**, move the **H / home marker** on the Mission Planner map to the desired start. For a bundled map, select a preset in the browser and click **Load location**.
4. In Mission Planner, set heading to **0**, leave **Wipe** unchecked, and click **Rover** to launch SITL with the extra arguments.
5. Stay disarmed while the terrain loads. When the browser shows **Terrain ready**, click **Start physics**, then arm in Mission Planner.

The five bundled terrain presets work offline. A custom location downloads terrain on the first visit and reuses the cached patch on subsequent visits to the same coordinates. If loading fails, click **Retry terrain** in the browser.

If SITL is already connected when you change the location in the browser, disarm and restart SITL from Mission Planner with the same extra command line.

[Mission Planner setup and troubleshooting](docs/mission-planner-start.md) · [Bundled locations](docs/locations.md)

## Terrain, weather and internet access

- **Elevation** comes from Google GEM-15, a 15 m bare-earth elevation model. The browser and physics use the same terrain mesh.
- **Ground colours** come from historical Copernicus Sentinel-2 imagery. The simulator generates trees, rocks and close-up surface detail.
- **Bundled presets work offline** after installation. A new custom start needs internet access and available source coverage. The importer fetches elevation from Google Cloud Storage and looks up Sentinel-2 scenes through Element 84 Earth Search. Valid patches are saved under `.run/terrain-cache/` for offline reuse at the same coordinates.
- **Weather** comes from Open-Meteo and updates every 15 minutes when available. Weather affects the camera view. Local time and sun position drive day/night lighting, which also works offline. The data requests require no API keys.

[Terrain sources, attribution and importer](docs/terrain.md) · [Weather and local time](docs/weather.md) · [Launcher options](docs/launcher.md)

## OpenStreetMap roads and buildings

Real terrain now loads mapped roads and flat-roof buildings automatically. Buildings have footprint colliders, including concave outlines and courtyard holes. Roads follow the terrain; wheel contact and traction stay unchanged. Generated trees and rocks keep clear of mapped buildings and roads.

The Mission Planner copy/paste workflow above is unchanged. OSM loads while physics is held. A timeout or server error leaves terrain usable and offers **Retry OSM**; after driving begins, retries are cached for the next world load. All five existing presets include OSM snapshots under **`assets/osm/`** and work offline in a fresh checkout. Custom overlays use **`.run/osm-cache/`**, independently of elevation and imagery. Set `"osm": false` in the backend config to disable overlays.

Data is **[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)** under **ODbL**; processed caches are derived OSM databases. This version has simple walls/roofs, approximate heights and paved/unpaved road colours. It skips bridges, tunnels and motorways and adds no road traction or grading. Cusco has roads but no mapped buildings in its snapshot; Lima’s existing start intersects a building, so choose a nearby Custom start there. See [setup, configuration, offline behavior, license and limits](docs/osm.md).

## Checks

Run `npm test` for the automated test suite (local OSM fixtures; no Overpass access). Run `npm run test:osm` for the Chrome road-alignment and building-collision check. See [validation](docs/validation.md) for browser and native SITL integration checks.
