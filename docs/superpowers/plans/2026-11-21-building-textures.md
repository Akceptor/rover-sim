# Building texture implementation plan

Approved approach: bundle realistic wall and roof materials and apply consistent
facade scale with windows and doors, stable building variation and offline use.
Keep OSM footprints, holes, terrain and collision geometry intact.

- [x] Generate and save an original plaster/brick/concrete/bitumen atlas.
- [x] Add tests for render-only UV layout, stable finishes, holes and unchanged input geometry.
- [x] Split rendering into windowed walls, bare foundations and roof materials; add decorative doors.
- [x] Verify texture loading, facade UVs and collision in Chrome; inspect a real bundled patch.
- [x] Run unit tests, review, document and commit/push.
