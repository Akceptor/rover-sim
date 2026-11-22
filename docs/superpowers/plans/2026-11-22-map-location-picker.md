# Map location picker implementation plan

Approved design: 16:9 camera at left, square pan/zoom location map at right; stack
on narrow screens. Show loaded bounds, roads/buildings, rover position and heading.
Click to propose a start, then Load location. Preserve presets, Mission Planner
selected starts, safe disarm/restart, held terrain/OSM loading and camera output.

- [x] Add projection-aligned geographic map data and validated map selections with unit tests.
- [x] Bundle Leaflet locally; add responsive layout and an offline vector overlay.
- [x] Route map selections through existing location load and retry logic.
- [x] Test map clicks, hold/restart safety, offline state, desktop/mobile layout and camera output.
- [x] Review, document, commit, merge to main and push as requested.
