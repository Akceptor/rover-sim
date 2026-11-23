# Weather and local time

The backend requests current modelled weather at the loaded terrain's geographic
home using [Open-Meteo](https://open-meteo.com/en/docs). Each backend fetches once
at startup and every 15 minutes; browsers share its snapshots. There are no API
keys or new dependencies. The request has an eight-second timeout, never blocks
physics/startup, and is cancelled on shutdown.

The real system clock and coordinates drive approximate solar direction,
day/night brightness, and warm low-angle sunlight. This continues while physics
is paused. The calculation follows [NOAA's solar equations](https://gml.noaa.gov/grad/solcalc/solareqns.PDF),
with the simulator's north/up/east axes. Weather changes cloud cover, lighting,
fog distance, and nearby falling rain/snow particles. Both FPV and chase views,
including the background MJPEG camera, use this appearance. These effects do not
change traction, collision geometry, driving, or SITL sensor time; snow does not
accumulate on the ground.

The cockpit shows the local date/time, IANA timezone, conditions, temperature,
cloud percentage, data age, and freshness. Open-Meteo resolves the timezone from
coordinates. The bundled map and playground know `Europe/Kyiv` offline. For
custom terrain, optionally set the backend's top-level `timeZone` property (or
the terrain's `timeZone`) to an IANA name, e.g. `Europe/Kyiv`, for correct offline
startup including daylight saving time. Without a known zone and without a
successful request, the clock explicitly says it is using a UTC fallback.
Solar lighting still uses the correct coordinates, independently of timezone.

If a request fails, existing data is marked stale. Data older than 45 minutes is
also stale; after three hours it is discarded for visual purposes. With no usable
data, the simulator shows weather unavailable and uses clock-based lighting with
a neutral sky. Browser-side expiry also handles a disconnected backend. Weather
is cached only in memory, so restarting offline starts without weather data.

Weather is a regional model estimate, not a measurement at the rover. The free
Open-Meteo endpoint is for noncommercial use under its
[terms](https://open-meteo.com/en/terms); weather data requires CC BY 4.0
attribution. A linked credit appears below the viewport and a source credit is
included in recorded/streamed frames alongside terrain attribution.

Normally location is chosen by the loaded terrain before SITL starts. The optional
[`--mission-planner` mode](mission-planner-start.md) learns the Simulation map's
selected start over MAVLink and loads its terrain before enabling physics. The
JSON actuator connection itself does not carry geographic start coordinates.

Run `npm test` for clock, solar geometry, provider validation, refresh coalescing,
failure, expiry, and cancellation checks. `npm run test:weather` uses installed
Chrome and deterministic weather snapshots through a real backend connection to
check day/night rendering, clouds, precipitation, fog, stale/offline display,
timezone, narrow layout, and the background camera page. It reserves HTTP 8098.

The cockpit has independent **Time** and **Weather** Auto/Manual selectors.
Auto time follows the real clock in the selected location's timezone. Manual time
freezes a local minute, selected with the 00:00–23:59 slider or Morning (08:00),
Day (12:00), Sunset, and Night (00:00). Solar position still uses the selected
coordinates and that location's current local date, including when locations
change. Sunset finds the descending solar elevation crossing at approximately
−0.833° for that date and location; it is disabled when no sunset occurs, such
as polar day or night. The result is rounded to the nearest slider minute.
On a spring daylight saving transition, a nonexistent local minute resolves to
the next valid time using the offset before the transition.

Manual weather works offline and offers Clear (0% clouds), Cloudy (100% clouds),
Fog (85 m visibility), Rain (2 mm, 280 m visibility), and Snow (1.5 cm, 280 m
visibility). Clear and Cloudy use 650 m visibility. These presets use the same
lighting, fog, and particle renderer as live weather. Manual status shows the
preset instead of a model temperature or data age. Choosing Auto resumes the
existing provider conditions and freshness display. All four time/weather mode
combinations work independently.

Both modes and manual values persist in browser local storage. Invalid entries
fall back to defaults; blocked storage leaves controls usable for the current
page. Values belong to the browser rather than terrain saves or telemetry.
Changing location preserves the chosen local minute and recomputes sunlight.
The backend relays sanitized preferences over the existing WebSocket, so even
the dedicated MJPEG camera's separate browser profile inherits the same time and
weather and follows later changes. Relay state lasts until the backend stops;
the first regular cockpit seeds it from its persisted preferences. Camera-only
pages never seed or overwrite it at startup. Other tabs also follow local
storage events. Unsent cockpit edits remain authoritative during a disconnect and are relayed
on reconnection. No provider observations, physics state, or sensor time change.
