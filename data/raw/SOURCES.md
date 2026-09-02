# Raw input provenance

Every file in `data/raw/`: where it came from, when, and what version. This directory is
**gitignored and immutable** — nothing in the analysis writes here, and provenance lives in this
file rather than in version control (decisions 1 and 2 in `docs/decisions.md`).

Total: ~11 GB. All of it is re-downloadable from the sources below.

---

## `locations.csv` — cooling places

| | |
|---|---|
| Source | `Koeltekaart/koeltekaart-amsterdam`, `data/locations.csv` |
| Retrieved | 1 Sep 2026 |
| Contents | 80 cooling places, 25 columns, **no coordinates** |

Coordinates are deliberately absent and reproduced by geocoding in notebook §2.

> **Incomplete provenance.** An earlier snapshot (repo commit `e2c3c9facf`, 26 Aug 2026) was
> replaced in place by a newer export on 1 Sep 2026. The source commit for the current file was
> not recorded, and the overwrite is how the original geocoder validation set was lost. Nojus to
> fill in the commit hash. Do not overwrite this file again — land a new export as a new dated
> filename.

## `buurten.geojson` — neighbourhood boundaries

| | |
|---|---|
| Source | `Koeltekaart/koeltekaart-amsterdam`, `data/geo/buurten.geojson`, commit `e2c3c9facf` |
| Retrieved | 31 Aug 2026 |
| Contents | 518 buurten, EPSG:4326, with `wijk`, `stadsdeel`, `pop` (917,890 total) |

Population vintage is not stated in the source and does not match the CBS grid exactly; the
two reconcile to within 1.2%.

## `2026-cbs_vk100_2025_v1.zip` → `cbs_vk100_2025_v1.gpkg` — population grid

| | |
|---|---|
| Source | `https://download.cbs.nl/vierkant/100/2026-cbs_vk100_2025_v1.zip` |
| Retrieved | 1 Sep 2026 |
| Reference date | 1 January 2025 (published 2026) |
| Size | 38 MB zipped, 448 MB GeoPackage, EPSG:28992 |

CBS Vierkantstatistieken, 100 × 100 m. Counts are rounded to multiples of 5; `-99997` marks a
suppressed value (fewer than 5). The GeoPackage keeps the archive's internal mtime (18 Aug
2026), which is not the retrieval date.

## `walk_network_amsterdam.graphml` — pedestrian network

| | |
|---|---|
| Source | OpenStreetMap via `osmnx.graph_from_bbox`, `network_type="walk"` |
| Retrieved | 1 Sep 2026, 01:36 |
| BBox (WGS84) | `4.75474, 52.27233, 5.01685, 52.43781` (locations bbox + 0.02°) |
| Contents | 92,047 nodes, 254,554 edges, 113 MB |

**OSM has no version number** — this is the one input that cannot be pinned, only dated. Ferry
routes are excluded by `network_type="walk"` (see decision 8).

## `bgt/` and `bgt_*.zip` — surface cover

| | |
|---|---|
| Source | PDOK BGT bulk download API, `https://api.pdok.nl/lv/bgt/download/v1_0/full/custom` |
| Retrieved | 1 Sep 2026, 12:09 |
| Data currency | 31 Aug 2026 (per the API's `timeliness` endpoint) |
| Featuretypes | `begroeidterreindeel`, `waterdeel` |
| Format | CityGML |

Two requests, because the API rejects MultiPolygon geofilters and Amsterdam is not contiguous:

- `bgt_3046ad13-…` — mainland, single-ring polygon, 211.1 km²
- `bgt_7097c8c4-…` — Weesp, single-ring polygon, 54.5 km²

Both derived from `buurten.geojson` union, buffered 200 m and simplified to 100 m tolerance.
Extracts **include superseded records** — filter `eindRegistratie` null, `bgt-status ==
"bestaand"`, `relatieveHoogteligging == 0`. The `.gfs` sidecars in `bgt/*/` were hand-edited to
set `<GeometryType>3</GeometryType>`; without that pyogrio refuses the files.

## `bag-light.gpkg` — addresses and dwellings

| | |
|---|---|
| Source | `https://service.pdok.nl/kadaster/bag/atom/downloads/bag-light.gpkg` |
| Retrieved | 1 Sep 2026, 16:03 |
| Size | 7.81 GB, EPSG:28992 |
| Layers | `pand`, `verblijfsobject`, `ligplaats`, `standplaats`, `woonplaats` |

National, no Amsterdam-only extract exists. Read with a bbox filter; the GeoPackage is spatially
indexed so this is fast. 9,982,580 dwellings nationally, 494,801 in Amsterdam + Weesp after
filtering to `status` containing "in gebruik" and `gebruiksdoel` containing "woonfunctie".

## `v20260901_v4_csv.csv` — energy labels

| | |
|---|---|
| Source | EP-Online public data (RVO), monthly full file |
| Publication date | 1 Sep 2026 (stated in the file's own header row) |
| Retrieved | 1 Sep 2026 |
| Size | 1.59 GB, 6,218,192 rows, `;`-delimited, decimal comma |
| Access | Free API key from `apikey.ep-online.nl` — shown **once** on the confirmation page, never emailed, active ~5–10 min after issue |

First two lines are metadata; the header is line 3. `Temperatuuroverschrijding` is TOjuli.
Amsterdam is postcodes 1000–1109 **plus 1380–1384** (Weesp, annexed 2022).

---

## Not in this directory

- `cache/` — osmnx HTTP cache (46 MB), regenerated automatically, gitignored.
- `data/processed/` — everything derived. Safe to delete; each step regenerates it, though the
  BGT and TOjuli steps need the raw inputs above.
