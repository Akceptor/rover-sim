# Surface-aware driving and effects

Phase 1 of `docs/osm-roadmap.md`. Approved direction: implement the roadmap one
feature PR at a time; bridges remain excluded.

Use a pure shared material module for normalized OSM tags and bounded simulation
presets, and a backend spatial index for road-corridor contact queries. Explicit
recognized surface wins over tracktype-derived material; unknown/missing tags
fall back to the existing paved flag. Smoothness affects rolling loss only; no
terrain deformation is introduced. Untagged legacy roads retain baseline physics.
At overlaps, higher material draw priority wins, with stable road ID tie-breaking.

Only contacts with the terrain collider receive road factors. Wheel/multi-ray and
track samples modify vehicle grip and rolling loss at their actual world contact
points. Airborne samples and contacts on buildings retain baseline behavior.
Telemetry carries grounded terrain contact positions and material IDs so browser
effects cannot disagree with backend classification or appear on building roofs.

Keep schema 1 and add optional validated surface/smoothness/tracktype fields.
Existing caches, five bundled snapshots and saved packages remain valid without
rewrites or network requests. New downloads preserve available tags. The browser
uses material-specific procedural road palettes and surface-specific dust/mark
strengths. Existing effect API fallback remains for scenes without OSM.

Validation covers parser preservation, invalid cache fields, offline reuse,
material precedence, corridor boundaries and overlap order, actual wheeled and
tracked acceleration/coasting, split contacts, airborne/roof exclusions, and live
Chrome road/effect rendering. Run the complete unit/backend suite plus OSM and
vehicle-effects browser checks before opening the feature PR.
