# Bundled OpenStreetMap snapshots

**© OpenStreetMap contributors.** These processed databases are available under
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
See [OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright).
The surrounding simulator code is separate from these derived databases.

Downloaded on **2026-11-21 UTC** from the public [Dresel Overpass
instances](https://ovp.dresel.systems/), using Europe (`/api/interpreter`) and
South America (`/api-sa/interpreter`) as appropriate. Source database timestamp:
**2026-11-20T21:21:21Z**. Each JSON includes source URL, download time, database
timestamp, license and attribution metadata. Lima was refreshed on **2026-11-26 UTC**
for origin **-12.0259746, -77.0282052**, with source database timestamp
**2026-11-24T21:21:23Z**.

| Existing terrain preset | JSON filename | Building footprints | Road features |
| --- | --- | ---: | ---: |
| Kyiv · Feofaniya | `79192726180d74dc7a89719cf33c7feb2a5f344dc0e60df2707e0e6ccaa0d30c.json` | 242 | 120 |
| Lviv · northern hills | `1cc287a2a26119411238fb1112e9cf7d48d08cd0cbc0f01b4fe205f513cc8960.json` | 258 | 82 |
| Lima · Rímac hills | `9154fcc2645f6faed840953435bd9c723b6a3909bdd893865256ec1c8f45db3f.json` | 460 | 384 |
| Cusco · Andes | `8ce6767b1da190e449d143e26ee83c8f8900d13a392f2f38f1fbcbacebfbe865.json` | 0 | 20 |
| Andes · mountain ravine | `e0cf8b4ced3814b1aa6babadf45b5285e8224e2320f08a95bb5f17c7bb0e4233.json` | 35 | 23 |

Files are keyed by SHA-256 of `overlayKey(terrain)` (schema, origin, bounds and
6 m fallback building height). The loader validates the key and geometry before
using a snapshot. A valid `.run/osm-cache/` entry takes priority. Without one,
these files load directly, with no Overpass request or cache write. Other
origins/bounds/default heights use the existing download-and-cache workflow.

Counts describe processed features, including complete ways that cross the patch
boundary. Road segments entirely outside the rendered patch are clipped away.
Cusco's existing patch contains no mapped building footprints in this snapshot;
its mapped roads are still bundled. Lima's terrain, imagery and overlay were
regenerated at the selected start outside buildings; a regression checks
0.6 m of building clearance around its spawn.
