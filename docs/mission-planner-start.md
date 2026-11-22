# Pick the starting location in Mission Planner

This optional mode lets **Mission Planner's Simulation tab** own SITL and select
the start on its map. The Node launcher runs the physics backend and background
camera. It learns the chosen start from SITL telemetry, downloads a 960 m terrain
patch when needed, and caches it in `.run/terrain-cache/`. Weather and local time
then follow that location. The normal `npm run sim` bundled-map workflow is unchanged.

## Windows setup

1. Stop the previous simulator and SITL. In the Windows checkout run:

   ```powershell
   npm.cmd run sim -- --mission-planner
   ```

2. Open `http://localhost:8090` (or the URL printed by your launcher). Below the
   camera/map panels, find **Mission Planner · Extra command line** and click
   **Copy command**. Paste it into **Extra command line** on Mission Planner's
   Simulation tab. The read-only field includes your actual ports, checkout path
   and any `--extra-params` file. If clipboard access is denied, the command is
   selected for manual copying with Ctrl+C. The same command is also printed in
   the terminal below **Mission Planner Simulation → Extra command line**.
   It supplies the JSON
   backend, physics port, SERIAL2 telemetry destination, and this checkout's rover
   defaults. It deliberately leaves Mission Planner's map-selected home and its
   own GCS connection intact. For default ports it resembles:

   ```text
   --model JSON:127.0.0.1 --sim-port-out 9002 --rate 100 --speedup 1 --serial2 udpclient:127.0.0.1:14560 --defaults "C:\Users\volodymyr.ostapiv\rover-sim\config\rover.parm"
   ```

   Use the actual printed path for your checkout. Run the launcher and Mission
   Planner together in Windows for these loopback addresses to work.

3. Drag the **H / home marker** to the desired start on the Simulation map;
   panning the map alone does not move the start. Set heading to **0**, choose
   Rover and start its simulation. Keep **Wipe unchecked** to preserve parameters.
   The downloaded ArduRover binary must support the JSON backend; its console
   should say `Starting SITL: JSON`.
4. Remain disarmed. The simulator cockpit reports waiting, loading, ready, or a
   download error below the view. The first download needs internet and can take
   up to three minutes. Exact cached starts and all five bundled presets work
   offline. The rover remains frozen while sensor time continues. If a download
   fails, use **Retry terrain** below the view after fixing the connection or
   telemetry issue. The backend and SITL stay running; no restart is needed for
   retries. The button is disabled while loading or without disarmed telemetry.
5. When **Terrain ready** appears, click **Start physics** in the browser, then
   arm/drive through Mission Planner as usual. The camera stream remains
   `http://127.0.0.1:8090/camera.mjpg`.

Existing EEPROM settings can override defaults. If start detection remains at
waiting, set `SERIAL2_PROTOCOL = 2`, `SR2_EXTRA1 = 2` and `SR2_POSITION = 2` in
Mission Planner, save and restart SITL. For camera control also retain
`SR2_RC_CHAN = 10`. Do not reset other RC assignments or wipe EEPROM.
On newer builds (including Rover 4.8-dev), those SERIAL2 stream parameters are
named `MAV3_EXTRA1`, `MAV3_POSITION` and `MAV3_RC_CHAN` respectively; use the names
present in your parameter list. See [ArduPilot parameter renames](https://docs.ardupilot.org/rover/docs/common-param-name-changes.html).

Mission Planner owns a separate simulation EEPROM from the normal launcher's
`.run/sitl-windows` directory. Switching to this mode therefore does not carry
over that directory's saved RC assignments. Fresh simulator defaults assign
`RC5_OPTION = 153` (ArmDisarm). If RC5 no longer arms after switching modes, read
that parameter in Mission Planner and write `153` if it is `0` (unassigned).
Keep the throttle centred, use MANUAL mode, and move the switch low before high.
The actual RC5 PWM must go below 1200 µs for low and **above** 1800 µs for high;
exactly 1800 µs is still the middle position. Use 1100/1900 or 1000/2000 switch
outputs. Adjust the transmitter/joystick output endpoints, not just `RC5_MAX`.
Check the actual input on Mission Planner's Radio Calibration screen.
An existing EEPROM value overrides the defaults file; updating the repo alone
does not change that saved value. Do not wipe EEPROM to restore one assignment.

To choose a different browser start, disarm, select and load it, then stop and
restart SITL in Mission Planner to apply GPS. The Node launcher and browser can
stay open. **Custom · Mission Planner** reads its H marker on the next SITL start. Ctrl+C stops only the launcher's backend/camera in this mode; stop
Mission Planner's SITL separately. Live map clicks do not teleport the rover or
stream a new terrain while driving. `--flat`, `--playground`, `--standalone` and
`--wipe` cannot be combined with this mode.

## Choose on the browser map instead

The cockpit now has a square location map beside FPV. Click a point, then
**Load location** to select **Custom · browser map**. This uses the same held
loading and GPS override as a browser preset. If SITL is already connected,
disarm and restart it after loading; Start physics remains blocked until GPS
matches. The copied Extra command line is unchanged, and you do not need to move
Mission Planner's H marker for this selection. To return to its map-selected
home, choose **Custom · Mission Planner**. See [map and offline details](map.md).

## Data and verification

The receive-only decoder checks MAVLink CRC, vehicle/component identity, and
freshness for [SIMSTATE](https://mavlink.io/en/messages/ardupilotmega.html#SIMSTATE),
GLOBAL_POSITION_INT and disarmed HEARTBEAT. Simulation truth supplies latitude
and longitude, avoiding EKF startup positions; matching geographic telemetry
supplies altitude. The external SITL keeps Mission Planner's chosen home altitude.
Imported terrain heights remain relative to its level centre pad, so loading
does not move the held rover or change its local sensor origin. Source DTM
elevation is retained separately in terrain metadata.

Successful patches are cached by exact latitude/longitude at seven decimal places;
returning to that start reuses the validated file offline. Failed or incomplete
downloads are removed, so Retry makes a fresh attempt. It does not force a
redownload of an already valid cached patch.

The loader validates the exact origin and mesh before publishing the cache or
replacing the held physics world. Failed downloads, invalid patches, a changed
start or lost disarmed telemetry keep physics held and report an error. Existing
terrain-source coverage and tile-edge limitations still apply; see
[terrain data and attribution](terrain.md). Satellite imagery is historical,
not a live aerial image.

`npm test` covers decoding, invalid origins, cache reuse, disarmed startup, and
held state. With native SITL built, `npm run test:position` runs an external SITL
with a selected home through the new launcher mode and verifies terrain, sensor
clock, and wheel contacts. It reserves HTTP 8100, UDP 9007/14565 and TCP 5786/5788.
`npm run test:terrain-retry` uses Chrome on HTTP 8102, UDP 9009/14567 to verify
the error display and Retry button through a real backend without restarting it.
Windows Mission Planner GUI clicks have not been automated here.

Mission Planner's [Simulation documentation](https://ardupilot.org/planner/docs/mission-planner-simulation.html)
and [SITL launcher source](https://github.com/ArduPilot/MissionPlanner/blob/master/GCSViews/SITL.cs)
describe how map home and the Extra command line are passed to SITL.
