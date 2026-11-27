# Bundled OpenStreetMap snapshots

**© OpenStreetMap contributors.** These processed databases are available under
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
See [OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright).
The surrounding simulator code is separate from these derived databases.

All five snapshots were refreshed on **2026-11-26 UTC** from the public
[Dresel Overpass instances](https://ovp.dresel.systems/), using Europe
(`/api/interpreter`) and South America (`/api-sa/interpreter`) as appropriate.
Source database timestamp: **2026-11-24T21:21:23Z**. Each JSON records the exact
endpoint, download time, database timestamp, license and attribution.

The refresh includes detailed road surface/smoothness/tracktype tags, supported
land-cover polygons, mapped tree/row points and barriers using the current importer.
Terrain elevations, imagery, geographic origins, schema and cache filenames are
unchanged. The five presets therefore include the new vegetation/land-cover and
surface behavior offline in a fresh checkout.

Barrier data was added on the phase 3 branch from the same source snapshot.
Processed barrier counts are Kyiv 122, Lviv 3, Lima 32, Cusco 0 and Andes ravine 5.
Counts include clipped wall/fence segments and point obstacles; an empty barrier
list does not imply that a real-world route is clear.

| Preset | JSON filename | Buildings | Roads | Tagged roads | Cover areas | Mapped tree/row points |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Kyiv · Feofaniya | `79192726180d74dc7a89719cf33c7feb2a5f344dc0e60df2707e0e6ccaa0d30c.json` | 242 | 120 | 43 | 18 | 2 |
| Lviv · northern hills | `1cc287a2a26119411238fb1112e9cf7d48d08cd0cbc0f01b4fe205f513cc8960.json` | 258 | 82 | 40 | 6 | 0 |
| Lima · Rímac hills | `9154fcc2645f6faed840953435bd9c723b6a3909bdd893865256ec1c8f45db3f.json` | 460 | 384 | 142 | 14 | 54 |
| Cusco · Andes | `8ce6767b1da190e449d143e26ee83c8f8900d13a392f2f38f1fbcbacebfbe865.json` | 0 | 20 | 2 | 8 | 0 |
| Andes · mountain ravine | `e0cf8b4ced3814b1aa6babadf45b5285e8224e2320f08a95bb5f17c7bb0e4233.json` | 35 | 23 | 9 | 1 | 0 |

Files are keyed by SHA-256 of `overlayKey(terrain)` (schema, origin, bounds and
6 m fallback building height). The loader validates the key and geometry before
using a snapshot. A valid `.run/osm-cache/` entry still takes priority; an older
runtime entry can therefore mask this bundled refresh. Without a runtime entry,
these files load directly with no Overpass request or cache write. Other origins,
bounds or default heights use the existing download-and-cache workflow.

Saved favourites remain exact offline copies and are not rewritten by this
refresh. Loading an older favourite continues to use its stored OSM data. Load
the refreshed preset and save a new copy to create an updated favourite.

Counts include complete ways crossing patch boundaries. Roads are clipped at
render time; mapped tree/row points are deduplicated and filtered during scenery
placement, with the documented 512-tree/shrub cap. Zero mapped points does not
mean zero scenery: mapped woodland/scrub generates deterministic vegetation.
Cusco has no mapped building footprints in this snapshot. Lima retains origin
**-12.0259746, -77.0282052** and its checked 0.6 m building clearance at spawn.

`test/osm-presets.test.js` loads all five snapshots with a fetcher that refuses
network access, checks their new fields and road tags, verifies road alignment,
and creates working Rapier collision worlds.
