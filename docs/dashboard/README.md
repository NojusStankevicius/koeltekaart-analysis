# The published dashboard

Published at <https://nojusstankevicius.github.io/koeltekaart-analysis/> by
`.github/workflows/pages.yml`, on every push to `main` that touches this folder or
`data/processed/dashboard.json`. Also published as a private claude.ai Artifact at
<https://claude.ai/code/artifact/b9f8d3a9-05e2-4d6d-855a-abb6cf190a9b>.

| file | what it is |
|---|---|
| `style.html` | `<title>`, the font link and the whole stylesheet |
| `markup.html` | the page structure, with every value filled in by script |
| `app.js` | the model, rendering, interaction and copy |
| `build.py` | inlines `data/processed/dashboard.json` and writes `index.html` |

```bash
python docs/dashboard/build.py --standalone   # open standalone.html in a browser
python docs/dashboard/build.py                # index.html, the file published as the Artifact
```

Build outputs (`index.html`, `standalone.html`, QA `*.png` and `*.mjs`) are gitignored.

**The page holds no data of its own.** Everything comes from `dashboard.json`, written by notebook
section 19, so a figure here can never disagree with the notebook. Change the analysis, re-run
section 19, rebuild, republish.

## Layout

- **Header** — title, walking distance (which drives every number on the page), the two
  decisions (*Coverage*, *Backup*) and the theme switch.
- **Summary** — three figures for the active decision, each showing the plan's effect as a
  delta once anything has been added, plus a Plan tile that opens the plan.
- **Map** — who is out of reach (Coverage) or who has only one place (Backup). Legend bottom left,
  the hover preview for a candidate top left, *Show covered areas* top right.
  The map is read in **neighbourhoods**: hovering outlines the buurt under the cursor and reports
  it (coverage, 65+ and frailty in Coverage; single-option and two-or-more in Backup), and
  clicking opens it. The 100 m square is the grid the analysis measures on, never a unit shown.
- **Side panel** — tabs: *Candidates*, *Neighbourhoods* or *Existing places*, and *Plan*. A list
  has search and a sort; selecting a row replaces the list with its detail, and `←` or Escape
  goes back. The panel scrolls inside itself, so the map sets the height of the shell.

**One screen, no page scroll** at 1101 px wide and 640 px tall or more: the page is exactly the
window's height, the map box takes what is left and the city is fitted inside it, centred, and the
side panel scrolls on its own. `FIT` in `app.js` and the stylesheet's fit block share one media
query, and must stay in step. Below that size the page is an ordinary scrolling document.

Neighbourhoods carry no heat x age label and there is no heat-against-age chart (decision 29):
a neighbourhood is compared with the city on seven indicators side by side. The one chart left is
residents served against residents with no backup, in an existing place's detail.

## Measures name the population they count

| sort | counts |
|---|---|
| Newly reached | residents with nothing within the walk today |
| Newly reached, 300–1,500 m average | the same, averaged over the distance curve (below) |
| Newly reached, frailty-weighted | each square scaled by its buurt's frail-health rate against the city |
| Newly reached, aged 65+ | of those newly reached |
| Gain a second option | residents with exactly one place today |
| Everyone in reach | all residents within the walk, whether or not they already have a place |

*Everyone in reach* is not the default for a reason: at 1,000 m it shares only 3 of its top 20
with *Newly reached*, and leads with a venue whose catchment is 87% already covered.

A candidate's detail shows the arithmetic: newly reached + gain a second option + already have
two or more = everyone in reach.

## Across distances, not at one

Decision 9 refuses to pick one threshold. Each candidate and neighbourhood carries its curve
across 300 / 500 / 750 / 1,000 / 1,500 m, and the *average* sort is the area under that curve
divided by the span (trapezoidal, as the thresholds are unevenly spaced). A neighbourhood that is
short at every walk, such as De Aker-Oost, is a structural gap; one short only at 300 m is a
question about where the line is drawn.

## The map shades by people, not by distance

Among unserved squares, distance to the nearest place and population correlate at **−0.211**, so
distance shading made the emptiest squares the darkest. The gap is shaded by residents per 100 m
square, with breaks at quantiles of unserved-square population (50 / 90 / 140 / 205 / 275).
Covered squares are neutral unless *Show covered areas* is on; squares covered by the plan are
painted at low opacity so progress never out-shouts the remaining gap.

## Candidates

4,317 named OSM venues: every one that would newly reach someone, or give someone a second
option, at some walk up to 1.5 km (decision 27). There is no shortlist, because most will be
unsuitable or refuse; the list filters by district and venue type, and pages 100 at a time.
A candidate's detail lists **alternatives within 300 m**, the fallback when one says no.

Catchments ship packed: `reach.off` / `reach.cell` (uint16 grid index) / `reach.d10` (uint8, walk
in tens of metres rounded up), decoded once on load. Plain JSON arrays would be over 10 MB.

The top of the *Newly reached* ranking is still dense West and Zuid: one venue there reaches more
people, while Nieuw-West's larger need is spread thin. The district filter, the frailty sort and the
neighbourhood list are the ways into the thinner gaps.

Candidates appear on the map only on demand (hover, selection, or in the plan), as rings. An
existing place is a filled dot. Clicking either opens its detail; nothing joins or leaves the plan from a map
click, only from the detail's button or a list's +.

## The plan

Global state, shown in its own tab. Each row shows what that place alone holds up, meaning people it
covers that nothing else does, because its marginal gain is zero once it is in the plan. For the same
reason a planned place's detail is read like an existing place's: residents in reach, those reached by
no other place, those for whom it is the second option, and the neighbourhoods that rely on it. The
map then paints what it holds up rather than what it would add. Those figures
sum to the plan's *Newly reached* when places do not overlap.

Only listed candidates can be added: a point the notebook never measured has no network
distances.

## Removing an existing place

An existing place's detail has *Remove this place*, which models it leaving the scheme (the failure
decision 20 counts options for). It is part of the plan alongside the added candidates, drawn on the
map as a dashed ring, and listed in the Plan tab with the residents it leaves with no place at all.
Every figure on the page, the summary deltas included, is then measured against today.

This needs `orgs` in `dashboard.json`: each organisation's catchment, packed like the candidates'.
The nearest-four distances in `grid` cannot answer it, because once one of the four is gone the page
cannot know who was fifth. Only the squares a removed site reaches are recounted; everywhere else the
nearest-four path still gives the count, and with nothing removed the two agree on every square at
every threshold. Walks are rounded to 0.1 m before the ceil to tens, so a square counts at a threshold
in `orgs` exactly when `net`/`d2`–`d4` say it does. Without `orgs` the button is not shown.

Candidates are still the ones section 14b listed against today's network. A venue that would only
matter once a place is removed is not in the list.

## Zoom

Wheel to zoom (pinch, or ctrl/cmd with the wheel, where the page scrolls as a document), drag to pan,
or the buttons bottom right. Up to 8x, and the centre is held inside the whole-city frame. A press that
moves under 4 px is still a click on a neighbourhood.

## A neighbourhood's candidates

Computed live from each catchment, so the venues offered are the ones that reach *it*, wherever
they stand. Both sorts, *Reach here* and *Second option*, count only residents of that
neighbourhood.

## Things that are the way they are for a reason

- **City baselines.** 65+ is the city *share* (13.6%); TOjuli is the city *median* across squares
  (1.80), as in notebook section 13. PET and mean walk are not in the payload; the page computes
  them population-weighted from the grid.
- **Places with no overlap** counts sites that serve someone and share none of them with another
  place, out of the sites that serve anyone (72 at 500 m). The notebook's chart title uses the
  same rule; it used to publish 49 by counting the five sites nearest to nobody.
- **`build.py --standalone` mirrors the Artifact host's skeleton**, including
  `[hidden]{display:none!important}`, without which a `display:flex` rule beats `hidden`.
- **Hit-testing floors rather than rounds**; square centres sit at `…50`.
- **The palette resolves once per render**, not per square.
- **Attribution is mandatory.** Klimaateffectatlas (CC BY 4.0, `Klimaateffectatlas, 2025`) and
  OpenStreetMap (ODbL, `© OpenStreetMap contributors`) are both credited in the footer.

## Everything recomputes at the chosen threshold

`dashboard.json` carries per square: distance to the nearest four organisations (`net`, `d2`–`d4`),
the nearest site (`vi`), and its buurt (`bu`). That is what lets the page recompute coverage,
redundancy, per-venue load and per-neighbourhood totals at any threshold.

Validated against the notebook at 500 m: 254,020 served, 207,125 with one option (after decision
30, 29 Sep 2026; previously 214,600 and 177,160). If those stop matching, the page is wrong.
