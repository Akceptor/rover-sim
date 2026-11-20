# Mission Planner simulated camera

1. Update the repo and restart the Node backend. No extra Node dependencies or
   FFmpeg are required. SITL/MAVLink settings are unchanged by video streaming.
2. Open the simulator in Chrome or Edge. Choose FPV or Chase.
3. Open **Settings → Mission Planner video → Start video**.
4. Copy the **Mission Planner GStreamer source** text from Settings.
5. In Mission Planner, right-click the Flight Data HUD, select **Video →
   Set GStreamer Source**, and paste the pipeline. Mission Planner needs its
   GStreamer video support installed; follow any installation prompt.
6. Keep the simulator tab visible. The settings drawer can be closed while
   streaming; the selected camera and FOV continue to control the picture.

For the default all-Windows arrangement, the pipeline is:

```text
souphttpsrc location="http://127.0.0.1:8090/camera.mjpg" is-live=true do-timestamp=true ! multipartdemux ! jpegdec ! queue max-size-buffers=1 leaky=downstream ! videoconvert ! video/x-raw,format=BGRA ! appsink name=outsink sync=false max-buffers=1 drop=true wait-on-eos=false
```

The read-only fields use the current browser's address and port. If Mission
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
Planner draws its own telemetry. It follows the selected FPV/Chase view, fits
within **960 × 540** with letterboxing, and publishes up to **10 fps**. Browser
JPEG encoding and network speed determine the actual rate. Ground and sky
textures are included in the stream.

Use **Stop video** to release the publisher. Hidden tabs pause the source and
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
960 × 540, at most 10 fps, through a dedicated same-origin WebSocket. A Node
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
GStreamer, check image dimensions/content, and rerun existing backend/HUD tests.
