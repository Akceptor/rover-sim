# Start the simulator in one terminal

The backend, ArduRover SITL and background camera use the existing `rover-sim`
npm package. Install dependencies once with `npm ci` (`npm.cmd ci` in Windows
PowerShell). Install Chrome or Edge for background video, and obtain a runnable
ArduRover SITL executable separately; the launcher does not download firmware.

## Configure once

Copy `config/launcher.example.json` to `config/launcher.local.json`. In Windows
PowerShell:

```powershell
Copy-Item config/launcher.example.json config/launcher.local.json
notepad config/launcher.local.json
```

Set `sitlExe` to your actual executable, for example:

```json
{
  "sitlExe": "C:/Mac/Home/Documents/Mission Planner/sitl/ArduRover.exe",
  "backendConfig": "./default.json"
}
```

Forward slashes work on Windows and avoid JSON backslash escaping. Paths with
spaces work without adding extra quotes inside the value. Relative paths in this
file resolve against the file's directory. For the native Mac build, use
`"sitlExe": "../.tools/ardupilot/build/sitl/bin/ardurover"`.

The local config is ignored by Git and is never rewritten by the launcher.
Create it separately in each checkout: a config in a Mac checkout is not copied
into a Windows clone by `git pull`. Run the setup commands from the same checkout
where you will run `npm.cmd run sim`. If startup reports `ENOENT`, create the
config at the exact path printed in that error. Keep your existing local config
when updating; copying the example again replaces it.
There is no automatic path detection or interactive prompt. The old experimental
`.run/launcher.json` is not read. Backend ports, vehicle settings and channel
calibration stay in the file selected by `backendConfig`.

## Run

```powershell
npm.cmd run sim
```

On Mac/Linux, use `npm run sim`. On Windows you can also double-click
`start-simulator.cmd`; Node must be on PATH. This calls Node directly, so no
PowerShell execution-policy change is needed.

Wait for `[launcher] READY`. Open **http://127.0.0.1:8090** for the HUD. Connect
Mission Planner to TCP **127.0.0.1:5760** when running on the same machine;
companion TCP **5762** remains available. The background camera publishes
**http://127.0.0.1:8090/camera.mjpg** even with the visible HUD closed. See
[video setup](video.md) for Mission Planner's GStreamer pipeline.

Ctrl+C stops camera, SITL, then backend. Unexpected service exits stop the session
and report failure. Busy ports fail before any service is started; the launcher
never takes over another session's processes. It runs SITL inside `.run/sitl-windows`
on Windows or `.run/sitl` on Mac/Linux, preserving the existing simulation EEPROM,
including `RC5_OPTION`. `--wipe` resets that EEPROM only when explicitly requested
for that run; it cannot be stored in the launcher config.

## Options

Append options after `--`:

```sh
npm run sim -- --no-video
npm run sim -- --standalone
npm run sim -- --flat
npm run sim -- --launcher-config config/another-machine.json
npm run sim -- --wipe
npm run sim -- --help
```

`--standalone` starts the backend and camera for keyboard driving without SITL
and does not require a local launcher config. `--no-video` skips the browser.
`--sitl` and `--config` temporarily override executable and backend paths.
`--extra-params` adds a defaults file; existing EEPROM values still take precedence.
`--mavlink-port` changes the base TCP port (companion uses base + 2).
`--run-dir` selects a different SITL EEPROM/log directory. Command-line paths
resolve against the current directory. Camera options are `--camera fpv|chase`,
`--fov 40..120`, and `--browser auto|chrome|msedge`.

## Verification

```sh
npm test
npm run test:launcher
# Backend/SITL only, without a browser:
npm run test:launcher -- --no-video
# Select a different native executable:
npm run test:launcher -- --sitl /path/to/ardurover
```

Launcher smoke uses HTTP 8095, UDP 9005/14563, TCP 5774/5776 and a disposable
EEPROM directory. It checks real services, MJPEG delivery, IPC and Ctrl+C cleanup,
port release, missing-executable and busy-port refusal, startup cancellation and
config preservation. Native macOS is exercised; the Windows wrapper and tree
termination still require verification in Windows. Normal Windows shutdown uses
IPC for Node services and `taskkill /T /F` for native SITL. If a Windows root
process has already crashed, its descendants cannot reliably be found by
`taskkill`; full crash containment would require Windows Job Objects.
