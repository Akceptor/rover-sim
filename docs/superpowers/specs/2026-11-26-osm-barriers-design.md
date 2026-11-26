# Mapped barriers

Phase 3 of the approved OSM roadmap. Support linear walls, retaining walls,
fences and gates/lift gates; point bollards, blocks, gates and entrances.
Keep optional schema-1 `barriers` data; old snapshots remain valid offline.

Normalize lines to bounded, patch-clipped segments and point obstacles. Cut
entrance/gate clear widths from their parent wall/fence using arclength intervals,
including gaps that cross multiple short segments. Infer a node gate's direction
from its parent barrier, otherwise perpendicular to its road, otherwise east/west.
Deduplicate a gate node already represented by a gate way. Gate ways preserve
their actual span. `open=yes` gates have posts only; unknown gate state is closed.
`locked=no` and legal access never imply open. Entrances have no colliders.

Generate one set of oriented boxes/cylinders for physics and rendering. Walls and
fences follow terrain in sections with embedded foundations and conservative
terrain extrema, so slopes cannot leave gaps underneath. Fences use a procedural
mesh pattern over a solid collision envelope; mesh holes are decorative. Gates
are static simplified panels, without interaction or opening-hours simulation.
Keep existing world-edge boundary barriers separate.

Use conservative dimensional defaults and bounded mapped dimensions: wall
height 2 m/thickness 0.2 m; fence 1.5/0.06 m; gate 1.2/0.08 m with a 3 m opening;
bollard 0.8 m high/0.15 m wide; block 0.6/0.6 m. Heights cap at 10 m, line
thickness at 2 m and opening widths at 20 m. Parse metres/feet, falling back for
invalid measurements. Bound processed segments and generated sections.

Include barriers in generated-vegetation clearance, map vectors, feature counts,
readiness, browser/FPV attribution, saved copies and disposal. Show persistent
spawn-overlap feedback without moving the selected geographic origin.

Local tests cover parsing, invalid dimensions, clipped/incomplete ways, short
segment and closed-way openings, open/closed gates, slopes, actual driving into
barriers and through narrow openings, offline copies and spawn warnings. Chrome
checks the same render/collider transforms, map vectors, attribution and disposal.
Run the full suite and OSM/barrier browser checks; open one feature PR.

Tag references: https://wiki.openstreetmap.org/wiki/Tag:barrier%3Dgate,
https://wiki.openstreetmap.org/wiki/Tag:barrier%3Dentrance,
https://wiki.openstreetmap.org/wiki/Key:locked.
