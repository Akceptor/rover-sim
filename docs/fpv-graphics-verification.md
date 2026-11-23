# FPV graphics and reproducible environment verification

Verified on 2026-11-23 against origin/main `a00ec24a7bf127302e9a62c6f4f8a150e9fcff70`, fetched before implementation.

## Changes

Time and weather have independent Auto/Manual selectors. Local time can be frozen to a minute, with Morning, Day, actual local-date Sunset, and Night buttons. Solar position uses the selected coordinates, current local date and timezone; UTC fallback remains visible. Sunset solves the descending −0.833° crossing and is disabled for dates without one. Five offline presets define clouds, visibility and precipitation through the existing renderer. Preferences persist in localStorage, and a volatile WebSocket relay keeps separate Mission Planner camera profiles synchronized. Offline edits are published on reconnect before accepting older relay settings. Open-Meteo observations, physics time and MAVLink are unaffected.

Roads use two deterministic shared canvas textures, four metres per repeat, and world-coordinate UVs. Existing triangles and material groups remain intact. Tyre tracks were omitted: the independent OSM road triangles have no continuous longitudinal parameterization, and world-aligned tracks would point incorrectly around bends. Foundation textures have a subtle uneven moisture band. Their blank-wall V coordinate spans the building height once, avoiding repeated wet bands and clamped edge streaks; photographic grain on these blank areas consequently stretches with building height. Facade windows retain their existing storey scale.

The existing sky sphere now has distinct horizon/zenith colours for day, sunset and night. Its cached gradient updates only when a palette channel changes by more than 1/255; fog and renderer clear colour use the same cached horizon. No postprocessing, new render pass or separate MJPEG renderer was added.

The earlier terrain issue is included: at most 5% source voids can be estimated, each within two source cells of original measured elevations. The cockpit shows the actual fraction, with one warning sign below 4%, two from 4%, three at 5%. Broad holes are still rejected. Map/preset retries work before SITL starts, while active-SITL and Custom telemetry guards remain enforced. The exact reported Ivano-Frankivsk coordinate imported successfully with imagery: 49/4624 cells estimated, altitude 248.37 m EGM96.

## Matched Lviv comparison

Run `node scripts/graphics-comparison.mjs /path/to/baseline-checkout` with baseline dependencies installed. The local baseline was a `git archive` of the commit above, with the same installed node_modules. The harness blocks external data requests and replays render-only state; it does not change physics or stored terrain. It uses the bundled Lviv terrain/OSM snapshot and road `way/170142831/3`, replaying the same 30 m portion from distance 10 to 40 m. A fixed checkpoint and nearby building views use identical coordinates in both versions.

- Chrome 157 headless, ANGLE Metal on Apple M3 Max; hardware acceleration available.
- 1440×900 canvas, devicePixelRatio 1, MN168 FPV 85° FOV; mount forward 0.15 m, height 0.16 m above the chassis, no lateral offset.
- Clear weather, 0% clouds, 2026-06-21 13:00 Europe/Kyiv, injected into both versions through the same weather fixture.
- Three interleaved rounds; each case warms for 2 s and measures 6 s (359 frame intervals per case). MJPEG off/on measured separately, same 960×540/10 fps capture path.
- Frame times are measured intervals between actual renders, including application/capture work and display scheduling. Render CPU time measures the renderer call; it is not isolated GPU execution time. Display synchronization limits conclusions about small GPU differences.

Medians of the three runs' median/p95 values, milliseconds:

| MJPEG | Version | Frame median | Frame p95 | Render CPU median | Render CPU p95 | Draw calls median / p95 |
|---|---|---:|---:|---:|---:|---:|
| Off | Before | 16.7 | 17.4 | 3.5 | 5.6 | 805 / 832 |
| Off | After | 16.7 | 17.6 | 3.5 | 5.6 | 805 / 832 |
| On | Before | 16.7 | 17.5 | 3.3 | 5.4 | 805 / 832 |
| On | After | 16.7 | 17.5 | 3.3 | 5.6 | 805 / 832 |

Per-round frame p95 values: off before 17.4,16.9,17.4; off after 17.0,18.4,17.6. On before 17.5,17.5,17.5; on after 17.5,17.7,17.4. Changes are not consistently slower across rounds. No repeatable frame-time regression was established on this machine. The same fixed checkpoint has exactly 805 draw calls before and after. MJPEG publishes 73–74 total frames over each streaming case’s warm-up plus sample (about eight seconds).

Roof/foundation bump on/off comparisons at 4 m and 12 m from a real Lviv building showed a maximum difference of 1/255 per colour channel, no pixels differing by more than 2/255, and mean full-frame channel differences below 0.002/255. These bump maps were removed; facade window bump remains. Nearby FPV images were inspected, and the initial clamped upper-wall texture streaks were corrected before final measurement.

Local artifacts (git-ignored): `.run/graphics-comparison/results.json`, `before-current.png`, `after-current.png`, `{before,after}-building-{4,12}m-{off,on}.png`. Cockpit desktop/mobile screenshots are in `.run/weather-controls/`.

## Checks

Final `npm test`: 147 total, 146 passed, one Windows-only skip, zero failures. Final weather, video, OSM, seven map-startup fault scenarios, and map-retry browser smokes passed, including separate-profile camera synchronization and actual FPV wall collision. Focused regressions cover all four time/weather combinations, storage failures and persistence, DST and UTC+14 local dates, unavailable polar sunset, actual sunset elevation, location changes preserving the local minute, passive camera startup, separate-profile synchronization, and offline edits on reconnect. Surface tests cover seamless tiles, metric UVs, unchanged footprint geometry and moisture/sky caching bounds. Existing browser checks exercise video publishing and actual FPV collisions against unchanged OSM geometry.
