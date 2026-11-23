# Mission Planner simulated camera

The recommended source is a **background camera**. It renders independently of
the visible HUD, so minimising, switching tabs or closing that window does not
stop video. The [one-terminal launcher](launcher.md) starts it automatically:
configure `config/launcher.local.json`, then run `npm.cmd run sim`. Wait for
`[launcher] READY`; Ctrl+C stops video, SITL and backend together.

For separate service terminals:

1. Update the repo and run `npm.cmd ci` in PowerShell once after updating.
2. Keep the backend and SITL running in their usual terminals.
3. In another terminal in the repo, run:

   ```powershell
   npm.cmd run video
   ```

   This launches an isolated headless instance of installed Chrome, or Microsoft
   Edge if Chrome is unavailable. It does not open a visible window or download
   another browser. Wait for **Background camera streaming**.
4. In Mission Planner, use the existing MJPEG URL `http://127.0.0.1:8090/camera.mjpg`
   with its MJPEG receiver, or right-click the Flight Data HUD → **Video →
   Set GStreamer Source** and paste the pipeline below. Mission Planner needs
   its GStreamer support only for that second receiver option.
5. Leave the camera terminal running. **Ctrl+C** stops it. The visible simulator
   browser can be closed. Do not also start the tab publisher in Settings.

On macOS/Linux use `npm` in place of `npm.cmd`. For another backend or view:

```powershell
npm.cmd run video -- --url http://127.0.0.1:8090 --camera chase --fov 85
# Choose an installed browser explicitly when necessary:
npm.cmd run video -- --browser msedge
```

`--camera` accepts `fpv` (default) or `chase`; `--fov` accepts 40–120 and affects
FPV. Background camera settings come from these arguments, independently of the
visible HUD's camera. Stop the existing tab publisher/background process before
starting a different one. If a publisher is already connected, the command
reports it rather than taking over. The background page reconnects its sockets
if the backend restarts; restart the receiver if its stream has already ended.

For the default all-Windows arrangement, the pipeline is:

```text
souphttpsrc location="http://127.0.0.1:8090/camera.mjpg" is-live=true do-timestamp=true ! multipartdemux ! jpegdec ! queue max-size-buffers=1 leaky=downstream ! videoconvert ! video/x-raw,format=BGRA ! appsink name=outsink sync=false max-buffers=1 drop=true wait-on-eos=false
```

The Settings read-only fields use the current browser's address and port. If Mission
Planner is on another machine/VM, replace the URL's host with an address it can
reach. Configure backend `httpHost` accordingly and allow that HTTP port through
the firewall. A loopback URL always refers to the machine running Mission Planner.

For a Mac backend and Windows Mission Planner in Parallels, copy
`config/default.json` to `config/local-video.json`, change `httpHost` to
`0.0.0.0` in that copy, then launch `node src/server.js --config
config/local-video.json` (add `--standalone` for keyboard mode). On Windows,
check reachability with:

```powershell
Test-NetConnection <MAC_IP> -Port 8090
```

Open `http://<MAC_IP>:8090` in the publishing browser so its generated pipeline
uses that reachable address, or replace `127.0.0.1` with `<MAC_IP>` in the copied
pipeline. Substitute your Mac's address; do not paste the angle-bracket placeholder.
For the user's all-Windows backend/browser/Mission Planner arrangement, the
loopback URL above already points to the correct machine.

The output is the camera image, without the browser's buttons or OSD; Mission
Planner draws its own telemetry. It uses the background command's selected view
(or the visible tab's selected view for manual publishing), fits
within **960 × 540** with letterboxing, and publishes up to **25 fps**. Browser
JPEG encoding and network speed determine the actual rate. Ground and sky
textures are included in the stream.

### Optional manual tab publisher

As an alternative to the background process, open the simulator in Chrome/Edge,
choose FPV/Chase, then use **Settings → Mission Planner video → Start video**.
This manual mode requires that tab to remain visible. A response such as
`{"state":"idle","frames":203,"ageMs":null}` means it sent frames and then
stopped publishing; use the background command if switching to Mission Planner
hides the browser.

Use **Stop video** to release the manual publisher. Hidden tabs pause the source and
resume publishing when visible. Closing/reloading the tab stops publishing;
reopen Settings and start it again after a reload. A backend interruption retries
publishing while the tab remains visible. If the receiver has ended after a
pause/stop, start the GStreamer source again in Mission Planner. Only one browser
tab may publish at once; up to four viewers can receive it. Slow viewers drop
frames rather than delaying the simulator. `/api/video` reports source state,
frame age and viewer count; no video is recorded on disk.

A **503** response from `/camera.mjpg` means no fresh camera frame is available
(or the viewer limit was reached). Check that video says Streaming, the browser
tab is visible, and the URL opens on the Mission Planner machine. A missing
`souphttpsrc`, `multipartdemux` or `jpegdec` error indicates an incomplete or
misconfigured GStreamer runtime. This stream is HTTP MJPEG, so use the supplied
pipeline rather than an RTSP or UDP H.264 preset.

Receiver references: [Mission Planner live video](https://ardupilot.org/planner/docs/live-video.html),
[GStreamer HTTP source](https://gstreamer.freedesktop.org/documentation/soup/souphttpsrc.html),
[multipart decoder](https://gstreamer.freedesktop.org/documentation/multipart/multipartdemux.html).

## Implementation and validation plan

Implementation plan: publish the selected Three.js camera as JPEG frames at
960 × 540, at most 25 fps, through a dedicated same-origin WebSocket. A Node
relay exposes `/camera.mjpg` as HTTP multipart MJPEG. Keep a single publisher,
limit each frame to 512 KiB, and drop output for slow receivers. Streaming is
optional, starts from Settings, and never sends MAVLink or changes physics.
Stop forwarding frames when the browser is hidden, closed, or disconnected.
Missing/stale sources close viewers rather than leaving a frozen live feed.

Files: `src/video.js` owns the relay and HTTP/WS lifecycle; `web/video.js` owns
browser capture and controls. `src/server.js` routes requests/upgrades and
shutdown. `web/app.js` calls capture immediately after rendering. Settings
provide start/stop, status, stream URL and the Mission Planner pipeline.

Validation: first exercise missing source, single publisher, origin rejection,
JPEG framing, publisher disconnect and staleness through real HTTP/WebSockets.
Then publish the real WebGL canvas in Chrome, decode the HTTP stream with
GStreamer, check image dimensions/content, and rerun existing backend/HUD tests. The
background regression closes the visible HUD and verifies fresh frames continue
for longer than the relay timeout, then stops the background process and verifies
that its publisher is released.
