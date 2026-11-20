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

2. Copy the line printed below **Mission Planner Simulation → Extra command
   line** into that box on Mission Planner's Simulation tab. It supplies the JSON
   backend, physics port, SERIAL2 telemetry destination, and this checkout's rover
   defaults. It deliberately leaves Mission Planner's map-selected home and its
   own GCS connection intact. For default ports it resembles:

   ```text
   --model JSON:127.0.0.1 --sim-port-out 9002 --rate 100 --speedup 1 --serial2 udpclient:127.0.0.1:14560 --defaults "C:\Users\volodymyr.ostapiv\rover-sim\config\rover.parm"
   ```

   Use the actual printed path for your checkout. Run the launcher and Mission
   Planner together in Windows for these loopback addresses to work.

3. Pick the start location on the Simulation map, set heading to **0**, choose
   Rover and start its simulation. Keep **Wipe unchecked** to preserve parameters.
   The downloaded ArduRover binary must support the JSON backend; its console
   should say `Starting SITL: JSON`.
4. Remain disarmed. The simulator cockpit reports waiting, loading, ready, or a
   download error below the view. The first download needs internet and can take
   up to three minutes. Exact cached starts and the bundled Feofaniya start work
   offline. The rover remains frozen while sensor time continues.
5. When **Terrain ready** appears, click **Start physics** in the browser, then
   arm/drive through Mission Planner as usual. The camera stream remains
   `http://127.0.0.1:8090/camera.mjpg`.

Existing EEPROM settings can override defaults. If start detection remains at
waiting, set `SERIAL2_PROTOCOL = 2`, `SR2_EXTRA1 = 2` and `SR2_POSITION = 2` in
Mission Planner, save and restart SITL. For camera control also retain
`SR2_RC_CHAN = 10`. Do not reset other RC assignments or wipe EEPROM.

Start selection is a startup operation. To choose a different start, stop SITL
in Mission Planner and restart the Node launcher before starting the next
simulation. Ctrl+C stops only the launcher's backend/camera in this mode; stop
Mission Planner's SITL separately. Live map clicks do not teleport the rover or
stream a new terrain while driving. `--flat`, `--playground`, `--standalone` and
`--wipe` cannot be combined with this mode.

## Data and verification

The receive-only decoder checks MAVLink CRC, vehicle/component identity, and
freshness for [SIMSTATE](https://mavlink.io/en/messages/ardupilotmega.html#SIMSTATE),
GLOBAL_POSITION_INT and disarmed HEARTBEAT. Simulation truth supplies latitude
and longitude, avoiding EKF startup positions; matching geographic telemetry
supplies altitude. The external SITL keeps Mission Planner's chosen home altitude.
Imported terrain heights remain relative to its level centre pad, so loading
does not move the held rover or change its local sensor origin. Source DTM
elevation is retained separately in terrain metadata.

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
Windows Mission Planner GUI clicks have not been automated here.

Mission Planner's [Simulation documentation](https://ardupilot.org/planner/docs/mission-planner-simulation.html)
and [SITL launcher source](https://github.com/ArduPilot/MissionPlanner/blob/master/GCSViews/SITL.cs)
describe how map home and the Extra command line are passed to SITL.
