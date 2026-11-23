# Reproducible weather and FPV graphics implementation plan

**Goal:** Independent persisted local time/weather controls, offline road textures, grounded foundations and a cached sky gradient, verified against the same Lviv route with and without MJPEG.

**Architecture:** Keep the live backend weather stream intact. Resolve browser preferences into effective time and conditions before the existing weather renderer; the same canvas feeds MJPEG. Pure local-date/time, sunset and preset functions get offline tests. Keep existing OSM triangles and material groups. Generate two shared deterministic road canvas textures, use metric UVs, add foundation dampness to cached textures, and cache the existing sphere's sky gradient. Preserve physics and MAVLink.

**Baseline:** origin/main a00ec24; clean archive at /private/tmp/rover-graphics-baseline. Existing terrain retry fix is preserved separately in the working tree. User subsequently authorized merge and push after final verification.

- [x] Weather: inspect src/weather-model.js, web/weather-view.js and cockpit markup. Add failing tests for independent modes, persistence, local timezone conversion, location changes and real sunset. Implement preference module and controls; retain auto defaults and UTC fallback. Extend weather browser smoke for offline manual use, reload and auto restoration.
- [x] Surfaces: add failing tests for metric UVs, unchanged vertices and shared texture count. Implement two offline road textures; omit tyre tracks if bends cannot retain continuous along-road UVs. Add foundation dampness and compare roof/base bump maps from the low FPV camera before removal.
- [x] Sky: use solar elevation/cloud cover for horizon and zenith palette, fog sharing horizon colour, and update the existing sphere gradient only past a palette threshold.
- [x] Comparison: deterministic Lviv bundled terrain/OSM, fixed date/clear weather, same route, MN168 camera, viewport and DPR. Save before/after screenshots; measure frame interval median/p95, render CPU duration and draw calls in repeated runs with MJPEG off/on. Compare bump toggles and simplify changes if a repeatable slowdown appears.
- [x] Integration: run npm test and relevant browser smokes, review diff, record settings, results and environment limits in docs. Merge and push after the final checks, as subsequently requested.
