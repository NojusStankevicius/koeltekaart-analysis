# Koeltekaart Amsterdam — coverage, exposure and vulnerability analysis

Where in Amsterdam are people underserved by the city's ~80 indoor cooling places
(*koelteplekken*), and where does that lack of access coincide with genuine need?

**These are indoor places you can sit in.** That is the whole distinction from the national
*Afstand tot koelte* layer, which maps outdoor public space of 200 m² or more at a 300 m threshold.
Both measure walking distance to the nearest cool place and disagree only about what a cool place
is — so the two maps are complementary, and no figure below should be read as a claim about
outdoor green space. See [decision 22](docs/decisions.md).

The analysis works at **100 m resolution** using CBS population squares, measures **walking
distance over the OpenStreetMap pedestrian network** rather than straight lines, and
characterises need along three independent axes: **outdoor exposure** (measured perceived
temperature and tree canopy from the Klimaateffectatlas, superseding the BGT vegetation proxy),
**indoor exposure** (dwelling overheating from NTA 8800 TOjuli) and **vulnerability** (age and
household composition from CBS, plus frail health, loneliness and socio-economic status at buurt
level). Section 15 turns the question around and asks what the existing supply is made of:
how many residents each venue carries, and how many of them have no second option. Section 16
reconciles the three priority lists that come out of all this into two decisions — where to
**expand** and what to **protect** — which turn out to concern disjoint populations.

## Headline results

- Measured over the street network, **27.3%** of residents are within 500 m of a cooling place —
  not the **49.6%** straight-line distance suggests.
- **Weesp has no cooling place, and until 29 Sep 2026 it was barely in the analysis.** Its 26,100
  residents are a median **5.8 km** walk from the nearest one and none is within 1.5 km. The
  study area had been cut to the facilities' bounding box, and osmnx's walking network drops
  every cycle path — including the only non-motorway link between Weesp and Amsterdam. Both are
  fixed (decision 30); cycle paths are walkable under Dutch law where there is no footway.
- Access and **indoor** heat exposure run in **opposite** directions: the hottest-housed quarter
  of the city is among the best served (31.1% within 500 m against 21.2% for the coolest-housed).
- **Outdoor** heat shows no such gradient, and finding that out cost the project a headline.
  Section 17 replaces the vegetation proxy with measured perceived temperature (PET, 2 m) and tree
  canopy (25 cm). Canopy predicts PET at **−0.690**; ground vegetation manages **−0.101**. And
  where the vegetation proxy correlated with walking distance at +0.210, canopy correlates at
  **−0.074** and PET at **+0.097**. The apparent outdoor gradient was reading population density —
  see decision 24.
- Neither age nor living alone predicts access. The existing places track population density.
- **Age is not the same axis as frailty.** Across the 40 underserved zones, frail health correlates
  with elderly share at **−0.212** and severe loneliness at **−0.394**. Two zones the typology
  classes `neither` — Hakfort/Huigenbos and Venserpolder-Oost — are among the most health-vulnerable
  in the city at 49.5% and 44.3% frail against a city 36.7%. See decision 25.
- 40 underserved zones hold 267,795 residents. A heat x age typology describes them, but it is not
  a priority rule: its heat axis misses 16% of housing and its age axis runs against frailty
  (decision 29). Only **two of eight** high-effect siting areas sit in a *hot + elderly* zone —
  Lootsbuurt (first by reach) and Haarlemmerbuurt-West — and the second-best site is in Weesp.
- The dashboard lists **4,317 named venues** that would newly reach someone or give someone a
  second option, because most will be unsuitable or say no. The list used to hold one branch of
  every chain - one Albert Heijn for the city - through a de-duplication bug (decision 27).
- **Adding places barely moves the total.** The twelve highest-effect areas, ordered by marginal
  gain so overlap is subtracted, took coverage from 23.7% to **28.5%** at 500 m — a 15% larger
  network for under five percentage points. *(Pre-decision-30 figures; not yet recomputed.)* Siting decides *which* underserved people get
  reached, not whether the gap closes — see decision 26.
- Coverage is not only thin, it is **single-threaded**: of the 254,020 residents within 500 m of a
  cooling place, **207,125 (82%) can reach exactly one**, and 37 of the 72 sites that serve anyone have
  no backup at all — everyone they serve has nowhere else to walk. The modelled failure is a venue *leaving the
  scheme*, not a building closing; both figures are reported.

Full reasoning, including every rejected alternative, is in **[`docs/decisions.md`](docs/decisions.md)**
(30 entries). An honest audit of what the analysis can and cannot support is in
[`docs/review.html`](docs/review.html).

## Running it

```bash
uv sync
uv run jupyter lab koeltekaart.ipynb
```

Raw inputs are **not** in this repository — see [`data/raw/SOURCES.md`](data/raw/SOURCES.md) for
what to download and from where (~26 GB; CBS, PDOK BGT, PDOK BAG, EP-Online, OSM, Klimaateffectatlas).
Klimaateffectatlas layers are CC BY 4.0 and require the attribution `Klimaateffectatlas, 2025`. Everything in
`data/processed/` is derived and regenerates from those inputs.

Each expensive step caches to `data/processed/`. **Changing an upstream filter does nothing until
the relevant cache file is deleted** — that has already caused one stale run.

`scipy` is used directly in sections 6e and 15 (`csgraph.dijkstra`, `connected_components`), and
`osmnx.distance.nearest_nodes` needs it to snap points against a projected graph regardless.

## Layout

```
koeltekaart.ipynb     the analysis, sections 1–19, run top to bottom
data/raw/             immutable inputs (gitignored) + SOURCES.md
data/processed/       derived outputs, safe to delete
docs/decisions.md     every methodological choice and what was rejected
docs/figures/         fifteen figures, regenerated by the notebook
docs/assignment-brief.pdf  the brief this started from
```

## Status

Exploratory and unpublished. Known limitations — no outcome variable, ferries missing from the
walking graph, 16% of residents in squares too sparse to measure housing, and buurt-level social
data carrying an ecological-inference limit — are documented rather than fixed. Read `docs/review.html` before
citing any figure.
