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

**Superseded 29 Sep 2026** by `walk_network_amsterdam_city.graphml` below. This bbox was the
*facilities'* extent and ends at x ≈ 129.8 km (RD), so most of Weesp had no network (decision 30).
Kept, not deleted: `data/raw/` is immutable (decision 2).

## `walk_network_amsterdam_city.graphml` — pedestrian network, whole study area

| | |
|---|---|
| Source | OpenStreetMap via `osmnx.graph_from_bbox`, `network_type="walk"`, osmnx 2.1.1 |
| Retrieved | 29 Sep 2026, 14:10 |
| **OSM state** | **`2026-08-31T23:35:01Z`** — pinned with an Overpass attic query, `[date:"2026-08-31T23:35:01Z"]` |
| BBox (WGS84) | `4.70877, 52.25798, 5.12770, 52.45107` (union of `buurten.geojson` and locations bboxes + 0.02°) |
| Contents | 108,063 nodes, 297,442 edges, 132 MB |

**Why the date pin.** The timestamp is the `timestamp_osm_base` of the original 1 Sep response
(still in the osmnx cache): the 01:36 above is local time, 23:35 UTC. Pinning to it means the only
difference between the two graphs is their extent, not four weeks of OSM edits.

**How close the pin is, measured.** The pinned query over the *old* bbox returns all 429,244
elements of the original response, unchanged, plus one: `way/1317378238` (a `highway=track`
bridge) and its node — an edit within seconds of the base timestamp that attic resolution places on
the other side of it. The resulting graph is 92,048 nodes / 254,558 edges against 92,047 / 254,554.

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

## `kea/` — Klimaateffectatlas layers

Ten national layers from the Klimaateffectatlas (KEA), retrieved 14 Sep 2026. Filenames are the
publisher's own and carry their vintage, so they are kept verbatim rather than re-dated; the
per-layer publication dates below differ from each other by up to five years and are the thing to
cite, not the download date.

| | |
|---|---|
| Source | Klimaateffectatlas download service, `klimaateffectatlas.nl` |
| Catalogue | `docs/MetadataKlimaateffectatlas_KEA_2026_08_v5.xlsx` (v5, August 2026) — tracked in git |
| WMS | `https://cas.cloud.sogelink.com/public/data/org/gws/YWFMLMWERURF/kea_public/wms?service=wms&request=getcapabilities` |
| Licence | **CC BY 4.0 — attribution mandatory.** Required citation string: `Klimaateffectatlas, 2025` |
| Retrieved | 14 Sep 2026 |
| CRS | EPSG:28992 throughout — no reprojection needed |

| File | Layer | Published | Bronhouder | Resolution |
|---|---|---|---|---|
| `GevoelstemperatuurBuurt_2022.gpkg` | PET zonal stats per buurt | 2024 | Nelen & Schuurmans | CBS buurt 2024 |
| `Gevoelstemperatuur2022_Raster/` | perceived temperature (PET), 50 tiles + `.vrt` | 2024 | Nelen & Schuurmans | 2 x 2 m |
| `Monitoring_Boomkroonbedekking_AHN5.tif` | tree canopy mask (AHN5) | 2026 | Friedenau | 25 x 25 cm |
| `Afstand tot koelte.gpkg` | distance to outdoor cool place | 2021 | TAUW & Hogeschool van Amsterdam | buildings + cool places |
| `Hittestress door warme nachten Huidig.tif` | warm-night heat stress | 2016 | Wageningen Environmental Research | 100 x 100 m |
| `Wijktypen buurten.gpkg` | neighbourhood typology | 2023 | Hogeschool van Amsterdam | CBS buurt 2023 |
| `nl_broze_gezondheid_buurt_v20260722.gpkg` | frail health % | 2026-07-22 | RIVM, 2024 | CBS buurt |
| `nl_sterk_eenzaam_buurt_v20260722.gpkg` | severe loneliness % | 2026-07-22 | RIVM, 2024 | CBS buurt |
| `nl_sociaal_economische_status_buurt_v20260722.gpkg` | SES-WOA score | 2026-07-22 | CBS, 2024 | CBS buurt |
| `nl_percentage_huurwoningen_buurt_v20260722.gpkg` | rental dwellings % | 2026-07-22 | CBS, 2024 | CBS buurt |

### `-99997` is the CBS suppression sentinel, unflagged

All four socio-economic layers store suppressed values as a literal `-99997` in a plain numeric
column — no null, no flag. An unmasked population-weighted mean of `broze_gezondheid` comes out at
**-2012.77**. Mask the sentinel and nothing else:

```python
g[col] = g[col].replace(-99997, np.nan)
```

**Do not filter on `< 0`.** `ses_woa` is a standardised score with genuine negatives from -1.632;
dropping them would discard half of Amsterdam. See decision 24.

Suppression is mild measured the right way: 307 of 517 Amsterdam buurten are suppressed for
`ses_woa`, but those buurten hold only **1.3% of residents** (frail health 2.2%, loneliness 1.1%,
rental 1.2%). Report suppression as a share of residents, never of buurten.

### `Gevoelstemperatuur2022_Raster/` — the PET tiles

`PET_ahn4.vrt` is 24 KB of XML indexing 50 tiles (`tile_0_clipped.tif` … `tile_49_clipped.tif`,
1.8 GB total) that sit beside it in this folder. **Open the `.vrt` inside the folder** — the copy
that ships loose alongside it resolves no tiles and reads as empty. Header: `UInt16`, NoData
`55537`, values 31–51 degrees C, 140001 x 157501 at 2 m, `STATISTICS_VALID_PERCENT` 36.01.

### `Monitoring_Boomkroonbedekking_AHN5.tif` — tree canopy

10.8 GB, 857823 x 1241007 at **25 cm**, `uint8`, values `{0, 1}`, no NoData — `1 = boomkroon`,
derived from AHN5 (2023–24) by Friedenau, published on KEA in 2026. The Amsterdam bbox alone is
7.1 billion pixels, so **nothing may read this file whole**: section 17 reads it in horizontal
strips of one CBS row and block-reduces as it goes, which takes about five seconds.

### Both rasters nest exactly inside the CBS 100 m grid

PET at 2 m and canopy at 25 cm both sit on integer offsets from the CBS square boundaries — 50 x 50
and 400 x 400 pixels per square respectively. Aggregation is therefore a block reduction with **no
resampling and no interpolation**. Section 17 asserts the alignment rather than assuming it; if a
future vintage ships on a shifted origin, that assertion is what will catch it.

Note the contrast with `Hittestress door warme nachten Huidig.tif`, which is *also* 100 m but whose
origin sits at x=13588.81, y=612693.82 — offset 88.8 m and 93.8 m from the CBS grid and not even on
whole metres. Every CBS square straddles four of its cells, so that layer needs area-weighted
resampling before it can be used at all.

### The buurt-level PET means cannot be compared against `green_frac`

PET is not modelled on buildings, so each buurt's `_mean` is an average over a non-random subset of
its area, and that subset correlates with vegetation at **rho = +0.741**. Green vs PET therefore
reads -0.016 at buurt level and -0.316 among buurten where PET covers 70%+ of the ground. Use
`_mean` (continuous) over `RIVMClass` (only five bands across Amsterdam), always alongside
`_count * 4 / area` as a coverage weight. See decision 25.

### Amsterdam extents

`Afstand tot koelte.gpkg` is 2.77 GB and 6,274,431 polygons nationally; read it with a bbox filter
(`110189, 476709, 135933, 493894`), which returns 199,519 features in under a second — 190,482
buildings in five distance bands plus 9,023 `Koele plek` polygons. The buurt layers hold 14,574
features nationally, 517 of them Amsterdam, keyed on `buurtcode` (`BU########`).
`Wijktypen buurten.gpkg` is a different vintage — 10,397 features keyed on `BU_CODE` — so expect
unmatched buurten.

`buurten.geojson` carries **no buurtcode** (`name`, `wijk`, `stadsdeel`, `pop` only) and holds 518
buurten against KEA's 517. Join KEA attributes by spatially joining the 100 m square centroids into
the KEA polygons — not by code, and not by name.

---

---

## Not in this directory

- `cache/` — osmnx HTTP cache (46 MB), regenerated automatically, gitignored.
- `data/processed/` — everything derived. Safe to delete; each step regenerates it, though the
  BGT and TOjuli steps need the raw inputs above.
