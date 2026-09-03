# Method decisions

Every methodological choice in `koeltekaart.ipynb`, what was rejected, and why. Written so
the analysis can be defended - or corrected - by someone who was not here when it was made.

Started 31 Aug 2026. Last updated 3 Sep 2026 (sections 1-15).

---

## 1. Inputs are a frozen snapshot, not a live feed

`data/raw/` holds a hand-copied snapshot from `Koeltekaart/koeltekaart-amsterdam`. No fetch
script, no automation, no dependency on the site repo.

**Rejected:** wiring the analysis to the production repo so inputs stay current.

**Why:** a moving input makes a result unreproducible, and coupling an exploratory analysis to
a deployed site risks the site. Provenance lives in `data/raw/SOURCES.md` instead of in code.

**Consequence:** results describe the city as of the snapshot, not as of today. Re-running
after a refresh will change numbers, and that is intended.

## 2. `data/raw/` is immutable

Nothing writes to `data/raw/`. Every derived artefact goes to `data/processed/`.

**Why:** with no version control on this project, an overwritten raw file is unrecoverable
except by re-downloading. This rule was broken once - the locations export was replaced in
place - which is how the reference coordinates for the original validation plan were lost.
A newer input should land as a new dated file with a `SOURCES.md` entry, never as a
replacement.

## 3. Coordinates are recomputed, not inherited

Addresses are geocoded via the PDOK Locatieserver, filtered to `type:adres`.

**Rejected:** using the coordinates already present in the production export.

**Why:** reproducing them is the point of the exercise, and it makes the geocoding step
auditable rather than inherited.

**Consequence:** there is **no independent ground truth** for the coordinates - every one
comes from the same geocoder, so comparing them against each other proves nothing. Validation
therefore checks the *match* (did PDOK return the address we asked for?) and the *geometry*
(does the point land in a plausible neighbourhood?), never the coordinate against a reference.

The `type:adres` filter matters: without it PDOK will happily return a postcode district or
the city itself, producing a well-formed coordinate for the wrong thing.

## 4. Suppressed CBS squares are dropped

CBS Vierkantstatistieken 100m marks withheld values as `-99997`. Squares whose population is
suppressed are excluded from the demand set.

**Rejected:** imputing 2 residents per suppressed square.

**Why:** CBS suppresses counts below 5 and publishes no zeros, so a suppressed square holds
**0-4 residents** - a bounded unknown, not an open one. The resulting demand total is 906,775
against 917,890 in `buurten.geojson`: a 1.2% gap covering both suppression and the vintage
mismatch between the two sources.

**Also note:** published counts are rounded to multiples of 5. Per square that is +/-2.5 and
meaningless; across ~7,000 squares the errors cancel to roughly +/-200 city-wide. Trust the
totals, never a single square.

**Consequence:** coverage percentages are computed over the population we can see. The
suppressed residents are neither served nor underserved in these figures.

## 5. Demand is clipped to Amsterdam; supply is not

Demand squares outside the `buurten.geojson` polygons are dropped. Cooling places outside them
- OBA Diemen, Jumbo Ouderkerk aan de Amstel - are kept.

**Why:** a resident of Zuidoost does not stop walking at the municipal boundary because the
polygon does. Clipping supply as well would invent a coverage hole along every border.

**Consequence:** the analysis is asymmetric by design. Coverage for border neighbourhoods
depends on facilities this project does not otherwise account for and cannot keep current.

## 6. Two organisations at one address count as one point

OBA Waterlandplein and Huis van de Wijk Waterlandplein share a building and a coordinate.

**Why:** for distance-to-nearest they are indistinguishable, so the duplicate is harmless.

**Superseded for counting, 2 Sep 2026** - see decision 20. The reasoning below was right about
what would break, and section 15 is exactly that case.

**Consequence:** this would matter for any metric that counts facilities or models capacity.
`sjoin_nearest` emits one row per tied facility, so the duplicate must be de-duplicated before
any population sum or those residents are counted twice.

## 7. Opening hours are excluded, deliberately

Coverage ignores the `heat_mon` ... `heat_sun` columns entirely.

**Rejected:** computing a second coverage figure using only places open on a Sunday afternoon.

**Why:** the hours change season to season, so a structural finding conditioned on them would
be stale on arrival. That question belongs in an operational tool reading live hours.

**Consequence:** every figure here describes a place as available if it exists, not if it is
open. Real availability during a heatwave is **lower** than these numbers - possibly much
lower on weekends. Recorded here so this is not mistaken for an oversight.

## 8. Distance is measured over the pedestrian network

Walking distance over the OSM `network_type="walk"` graph, computed with one multi-source
Dijkstra seeded from all facilities at once. Snap distances at **both** ends are included -
the facility end via a virtual node carrying its snap distance, since multi-source Dijkstra
starts every source at zero.

**Rejected:** straight-line distance, used in section 5 and superseded.

**Why:** Amsterdam is built on water, and straight-line distance systematically overstates
coverage - by up to **31 percentage points**. At 500 m it reports 50.9% of residents covered
where the true figure is 23.7%. That is not a refinement; it is the difference between two
conclusions. Median detour ratio is 1.55.

**Guardrail:** `assert near["detour"].min() >= 1`. No walking route can be shorter than the
straight line, so a ratio below 1 means a snap distance is missing at one end. This assertion
caught exactly that bug.

**Known limitation - ferries.** `network_type="walk"` excludes ferry routes, so the free and
frequent GVB crossings of the IJ are treated as impossible. This was expected to distort
Noord badly; measured, Noord's median detour is 1.57, in line with Oost (1.64) and Zuidoost
(1.60), because Noord residents' nearest facility is generally already in Noord. The real
outlier is Weesp at 2.98 - annexed in 2022, physically separate, and genuinely isolated.

## 9. Thresholds: 500 m headline, 1,000 m for zones

The coverage curve reports 300/400/500/750/1,000/1,500 m. The headline threshold is 500 m.
Zone clustering uses 1,000 m.

**Why 500 m for coverage:** standard walkability thresholds (400 m = 5 minutes) assume a
healthy adult at 5 km/h. The people who most need a cooling place in a heatwave - elderly,
chronically ill, mobility-limited - move at roughly half that, in the heat, which is precisely
why they need somewhere to go. 500 m is 10-12 minutes for them.

**Why 1,000 m for zones, and this is a genuine tension:** clusters are only useful if they are
smaller than the city. At 500 m the underserved area is a single connected blob of 27 km2
holding over 400,000 people - true, and useless as a recommendation. At 1,000 m the largest
zone is 3.7 km2, neighbourhood-sized and nameable.

This threshold was chosen for what it makes *visible*, not for what it makes the numbers say,
and both figures are reported. Note the direction of the bias: 1,000 m is generous for this
population, so the zones are the **conservative** set - places underserved even by a lenient
standard.

**Report the curve, not a single number.** Any one threshold is arbitrary; the curve shows how
sensitive the conclusion is to that arbitrariness. And with 80 facilities for ~900,000 people,
near-total undersupply at any walkable threshold is arithmetically inevitable - "77% of
Amsterdam is underserved" is true but close to uninformative, and invites the response that
the threshold was picked to produce it.

## 10. Output is areas, not buildings

Section 7 reports contiguous underserved zones, ranked by the population inside them, each
labelled with the neighbourhoods it spans.

**Rejected:** a greedy maximum-coverage search over candidate buildings from OSM (libraries,
community centres, churches, sports halls, supermarkets), which produced a ranked list of ten
named premises.

**Why:** it was making a *social* recommendation from *geometric* evidence. The model
optimised purely for population reached and knew nothing about whether a building is
available, suitable, or willing - yet named specific supermarkets, a restaurant and a mosque
as sites. Naming areas is the honest limit of what this data supports.

**Consequence:** the output says "this part of Zuidoost needs one, find a venue there" rather
than proposing premises. Siting judgement stays with people who have information this analysis
does not.

## 11. Vulnerability is measured by age, with suppression handled as bounds

Demand is additionally weighted by `aantal_inwoners_65_jaar_en_ouder`. Suppressed counts are
**not** imputed and **not** dropped: every figure is computed twice, once treating all
suppressed values as 0 and once as 4, and the interval is reported.

**Rejected:** dropping suppressed squares. Suppression is not random - it means "fewer than
5", so the withheld squares are systematically the *low*-elderly ones. Dropping them would
inflate every elderly share.

**Rejected:** imputing a midpoint. It invents data to avoid stating an uncertainty that can
simply be stated.

**Why age:** heat mortality concentrates sharply in the over-65s, and the same group walks
slowest - which is the assumption the 500 m threshold already rests on.

**Coverage:** 23% of populated squares are suppressed but they hold only 11% of residents, and
the bounds come out 5% apart (122,365-128,785 over-65s, 13.5-14.2% of the population). Every
conclusion below survives both extremes, so none of them depends on the choice.

**Finding, including the negative one:** city-wide there is **no age gradient** - 22.9-22.5%
of over-65s are within 500 m against 23.7% of everyone. The 80 existing places are neither
well- nor badly targeted at the vulnerable; they are distributed like the population. Locally
it does change the ranking: Holendrecht-Zuid / Gein moves from 4th by population to 1st by
elderly population, and Plan van Gool from 7th to 5th.

**Not covered, and why:** income proxies (54% suppressed, 71% of residents) and pre-1945
housing (71% suppressed) are too sparse at 100 m. Living alone - a documented heat-mortality
risk factor - is available at 26% suppressed and is the natural next axis.

## 12. Rank by absolute numbers, not share

Neighbourhood and zone tables sort by residents underserved, not by percentage.

**Why:** a buurt where 100% of 40 residents are underserved outranks one where 60% of 3,000
are - but the second is where a facility belongs. Both columns are shown; the sort is by
count.

---

## 13. Living alone is included; the age-isolation interaction is not

Single-person household counts are used as a second sensitivity axis (15% suppressed within the
demand squares, 96% of residents covered). The **interaction** - elderly people living alone -
is computed, reported as bounds, and then dropped.

**Why the interaction matters:** it is the strongest documented heat-mortality profile, and
stronger than either factor alone.

**Why it is dropped:** CBS publishes the two counts per square but not the cross-tabulation.
Bounding the overlap per square (at least `65+ + alone - residents`, at most the smaller of the
two) gives a city-wide range of **2,920 to 108,830** - a 37-fold spread. The data cannot answer
the question.

Note the contrast with decision 11: bounding worked there because suppression is a *narrow*
unknown (0-4 per square); an unobserved cross-tabulation is a *wide* one. The technique is the
same, the outcome opposite, and reporting the useless bound is the point - a weighted
"isolation-adjusted elderly" score would have looked plausible and meant nothing.

**Route if it becomes important:** a CBS StatLine table of household composition by age at
buurt level, applied as a conditional probability and labelled an assumption.

**Finding:** people living alone are slightly *better* served than average (26.1% within 500 m
against 23.7%), because single-person households concentrate in the well-served dense centre.
Second null in a row.

## 14. Exposure is vegetation cover from BGT, and it is a proxy, not PET

Green fraction per 100 m square - vegetation as a share of the square - computed from BGT
`begroeidterreindeel` via the PDOK bulk download API. `waterdeel` is still downloaded and still
computed, but only so that sections 12e and 13b can show why pooling it was wrong.

**Rejected:** the Klimaateffectatlas PET raster (behind a contact form) and the gemeente's
Klimaatrisicokaarten PET scores. Both are better measures. Neither was obtainable without
waiting, and the second would have meant inheriting a 1-5 ordinal score of undocumented
construction. Revisit if the gemeente responds.

**Rejected:** the OGC API. `pand` and `onbegroeidterreindeel` hit the 1,000-feature page cap
inside a 0.8 km2 box; Amsterdam would be a thousand-plus requests.

**Why this proxy:** stone stores heat, vegetation evaporates it. Surface cover is the physical
driver behind the urban heat island, and it is computable from a national, versioned, primary
source - the same base the municipal maps are built from.

**Three filters, all silent if omitted:** `eindRegistratie` null and `bgt-status == "bestaand"`
(only ~40% of vegetation records are current - 88,819 of 219,399); and
`relatieveHoogteligging == 0` (a bridge deck must not cover the canal beneath it).

**Limits, stated in the notebook:** no building height, albedo, wind or radiation, so a shaded
narrow street and an open plaza score alike; BGT is *ground* cover, so a paved street under full
tree canopy scores as stone.

**Amended 2 Sep 2026, resolved 3 Sep 2026 - the pooling was a defect, not a caveat.** This decision
originally pooled green and water, with a note that the correlation "holds for green alone (0.159
against 0.208)". Sections 12e and 13b measured what that footnote was hiding: dropping water
roughly doubles the agreement with TOjuli at square level (-0.096 to -0.222) and lifts zone-level
agreement from chance to fair (kappa +0.015 to +0.345). Water had been kept because it correlated
better with *distance* - selecting a proxy on its association with the independent variable rather
than on whether it measures the thing it names. **The measure is now vegetation alone throughout.**
See decision 19 for the evidence and for what moved.

**Finding, and it is the strongest in the analysis:** access and exposure run in **opposite**
directions. Vegetation cover rises monotonically with distance from a cooling place (11.6% in
the nearest quintile to 20.1% in the farthest), and the stoniest quartile of the city has the
best coverage (28.6% within 500 m) while the greenest has the worst (16.6%). Cooling places sit
where the libraries and supermarkets are, which is the dense stone centre. "Distance to cooling"
and "need for cooling" are different maps.

## 15. Axes are kept separate, and the filter-versus-weight choice was tested rather than asserted

Access, sensitivity and exposure are held as separate measured quantities. They are combined
two ways, both reported:

- **By filtering** (section 13) - a zone is "hot" or "elderly" if it exceeds the *city* median.
  Of 342,220 residents beyond 1 km, 185,835 are also in stonier-than-median squares; 120,990
  are in overheating-prone housing; 52,645 are also in above-median-elderly areas.
  *(The first figure was 198,850 under the pooled green-blue proxy; recomputed on vegetation alone
  per decision 19.)*
- **By weighting the people, not the criteria** (section 14) -
  `demand = residents x (1 + (RR-1) x elderly_share) x (TOjuli / city median)`.

**This decision was revised on 1 Sep 2026.** It previously forbade weighting outright. The
objection that overturned it is correct: a hard filter puts a cliff between a zone at 12.9%
elderly and one at 13.6%, and discards underserved areas for being young. That cliff has no
more justification than a weight does.

**What settled it was measurement, not argument.** Ranking candidate locations by unweighted
population and by population weighted 5x toward the elderly gives Spearman correlations of
**0.997 to 1.000**. The weighting does not matter. Geography dominates - how many people sit
beyond a kilometre and how many one location can reach vary far more across Amsterdam than
elderly share or overheating do.

**The rule that survives** is therefore not "never weight". It is: *if a combination rule is
arbitrary, run it across the plausible range and report whether the answer moves.* A weight
used with sensitivity analysis is defensible; a weight stated once is not. Four lines of code
replaced a methodological argument neither side could have won.

**Still rejected:** a single composite "vulnerability index" presented as one number. The
`build_hvi.py` in the older repo is the worked example - equal weights after min-max
normalisation, no exposure term at all, and a name inviting it to be read as heat risk. The
objection there was never the weighting; it was that no one could see it or test it.

## 16. Dwelling overheating uses TOjuli, an existing national indicator

Exposure at the dwelling is `Temperatuuroverschrijding` (TOjuli) from EP-Online: the NTA 8800
summer temperature-exceedance risk for a home without active cooling. Threshold 1.20.

**Why:** it is computed per dwelling by a national standard, so there is no proxy to justify
and no weights to defend. It is also closer to the mechanism than street heat - heat mortality
is driven substantially by indoor night-time temperature.

**Rejected:** a structural indicator built from BAG building year plus 3DBAG storeys and roof
type. Justified only if TOjuli coverage failed - and the structural intuition turned out to be
wrong anyway: corner position (median 2.06) matters more than top floor (1.73), which a
hand-built index would have reversed.

**Rejected:** a hybrid filling unlabelled dwellings with a structural estimate. Two measurement
methods in one variable, for no gain once coverage was shown to be adequate.

**Exclusions:** `TOjuli > 10` as data error (306 dwellings; the file's maximum is 324).
`TOjuli == 0` means *actively cooled*, not low risk - 21,065 dwellings held out as a separate
category rather than scored as the city's safest housing.

**Coverage argument, in three checks.** TOjuli exists only for dwellings labelled from 2021,
when NTA 8800 replaced the EI method, so 41.4% of 494,801 dwellings have one. (1) Coverage by
stadsdeel runs 37.7-46.2%, no spatial skew. (2) Within the same buurt, labelled dwellings are
3 m2 *smaller* and identical in construction year. (3) Reweighting the labelled set to the full
stock's floor-area profile moves the median from 1.700 to 1.680. A 0.02 shift is a footnote.

**Cost of the exclusion:** 2,137 squares hold fewer than five labelled dwellings and carry no
usable median - roughly 141,000 residents, 16% of the city, whose housing is unmeasured.

**A bug worth recording:** Amsterdam postcodes were filtered as 1000-1109, which silently
dropped Weesp (1380-1384, annexed 2022) - 8,413 labels, and one wrong coverage figure before it
was caught.

## 17. Underserved zones are classified, not ranked

Section 13 sorts the 42 zones with 500+ residents into *hot + elderly*, *hot only*, *elderly
only*, *neither*, against city-wide medians.

**Why city medians, not medians across the gaps:** comparing gaps only to other gaps would
guarantee half of them look fine by construction.

**Why a typology rather than a ranking:** the four groups need different responses, and the
largest group is not the one a single ranking surfaces. *Elderly only* holds 133,915 residents
and 23,165 over-65s - cool housing, but nowhere to walk to. *Hot + elderly* holds 34,455.
Collapsing those into one order hides the distinction that matters for what to actually do.

**Zones with no measurable exposure are marked `unknown`**, not counted as cool. Three are
industrial areas with no labelled housing at all.

**Amended 2 Sep 2026 - "hot" here means indoor heat.** The typology's hot axis is TOjuli alone.
Section 13b tested the alternative: defined from vegetation cover instead, four of these six zones
survive; defined from the pooled green-blue proxy, one does. The classification is therefore stable
against a *defensible* alternative and unstable against a *defective* one, which is a finding about
the proxy rather than about the typology - but the label should be read as "indoor-hot + elderly".

**Finding:** four of the six *hot + elderly* zones are central or near-central islands -
Oostenburg, the Westelijke eilanden, KNSM/Borneo. Dense converted-dock and pre-war stock,
elderly residents, and surrounded by water so the walking network makes them remote despite
short straight-line distances. De Aker, top of every population-based ranking, is *elderly
only* and drops out of the priority set.

## 18. The siting output is a continuous surface, not a shortlist

Section 14 scores every point on a 200 m grid by the unserved weighted demand a new cooling
place there would bring within 1 km network distance.

**Rejected:** greedy maximum-coverage over named buildings. It optimised for the wrong thing -
acquiring a cooling place is not the binding constraint, so "most coverage from fewest sites"
is not the question. It also made a social recommendation from geometric evidence, naming
specific supermarkets and a mosque.

**Why a surface:** nothing is excluded and no site is chosen. Low-elderly underserved areas
appear at lower intensity rather than vanishing. Naming premises stays a human step.

**Presentation:** the top ten points sit in one gap in West, so they are thinned greedily at
1,200 m separation to yield eight *distinct* areas. Lootsbuurt reaches 27,267 unserved
residents; Gein 2 reaches 11,865. That gradient is the actionable part.

**What it does not say:** the surface shows where a place reaches the most people, not where
risk is highest. Reaching 2,975 people in KNSM/Borneo will never outscore 27,000 in West, so
section 17's typology remains the record of small-but-severe need.


## 19. The two exposure measures were checked against each other, and the pooled proxy failed

Sections 11 and 12 each compared one exposure measure against distance and found the same
inversion. Section 12e asked the question neither had: do they agree *square by square*?

**Why it needed asking.** "Two unrelated measures, one conclusion" was the strongest claim in the
project, and agreeing about a distance gradient is much weaker evidence than it sounds - both
measures could be tracking density and nothing else, since dense squares are stony and their
housing is older and deeper. That would be one fact counted twice.

**What was measured.** Spearman rank correlation between the two, raw and with the population rank
residualised out; then at zone level, Cohen's kappa between the two possible definitions of
"hot", and the resulting typology crosstab.

**Result 1 - the pooled proxy is close to worthless for this.** Green-blue against TOjuli is
**-0.096** at square level (**-0.056** net of density), and at zone level **kappa = +0.015** against
a chance agreement of 0.541. Raw agreement of 55% looks like weak concordance and is in fact a
coin flip; kappa is the statistic to report, because both measures call most zones not-hot and the
marginals inflate everything else.

**Result 2 - the water term is the cause.** Dropping water: **-0.222** at square level (-0.199 net
of density) and **kappa = +0.345** at zone level. The mechanism is visible in the priority zones -
KNSM-eiland / Borneo is 53.8% green-blue of which 49.9 points is open water and 3.9 is vegetation.
The pooled proxy was scoring the stoniest converted dock islands in Amsterdam as among its greenest
places, and those are exactly the zones decision 17 leads with.

**The methodological error being corrected.** Decision 14 pooled green and water partly because the
pooled column correlated better with *distance to a cooling place* (0.208 against 0.159). That is
selecting a proxy on its association with the independent variable rather than on whether it
measures the thing it names. Cooling places sit inland in the dense centre, so the water term
encodes distance from the IJ and the canal belt; it made the headline correlation larger and the
measure worse. Open water has negligible evapotranspiration, releases stored heat overnight when
the risk peaks, and shades nothing.

**Result 3, and the one that matters most - there is still no convergent validity.** -0.222 is
five percent of variance. Ground cover and NTA 8800 exceedance are different mechanisms: TOjuli is
driven by glazing, orientation, insulation and ventilation, so a sealed new-build on a bare plaza
reads cool and a pre-war top-floor flat under a plane tree reads hot. They are two axes and neither
substitutes for the other. The claim that survives is about the **distance gradient** - both
measures invert against access - not about which square is hot.

**Resolved 3 Sep 2026.** All four dependent places now use `green_frac`: the section 11b gradient,
the section 11c intersection, the two exposure figures and the section 13 display column. Section
14's demand weighting never used surface cover (it weights by TOjuli) and section 15 uses no proxy
at all, so nothing else moved.

**What changed, and it is less than the diagnostic implied.** The distance gradient falls from
18.9%-33.0% to **11.6%-20.1%** and its correlation with distance from 0.208 to **0.159**. Coverage
by stoniness quartile barely moves: stoniest 28.5% -> **28.6%** within 500 m, greenest 14.8% ->
**16.6%**. The section 11c intersection falls from 198,850 to **185,835**, a 6.5% reduction. Every
conclusion in sections 11-13 survives unchanged - the direction, the ranking and the inversion are
all intact - and that is the point worth recording: **the defective proxy was not producing false
conclusions, it was producing overstated magnitudes and one badly wrong classification.**

**Where it did matter:** the zone table in section 11c. Oostenburg (mean vegetation 0.032) and the
Westelijke eilanden (0.014) now appear in the stonier-than-median list they were excluded from,
which is exactly the failure decision 19 predicted, showing up in the section that first used the
proxy.

**Still true:** vegetation cover and TOjuli agree at -0.222, five percent of variance. Repointing
the variable fixed a defect; it did not create convergent validity, and the paragraph below still
stands.

**What this costs the project, stated plainly.** Two proxies for the same construct disagree at
close to chance, and nothing in the data can adjudicate between them - no measurement of heat harm
exists at this resolution to check either against. That is the exact shape of the missing outcome
variable named in the README. The gap was always on the need side of the analysis, not the access
side; the coverage figures are geometry and need no external validation, while every statement
about *which* underserved areas matter rests on proxies that have now been shown to disagree.


## 20. Facilities are clustered into venues, and identity comes from the network

Section 6e makes two changes to what counts as one cooling place.

**Venues, not records.** The 80 active records collapse to **78 venues** by clustering anything
within 10 m. The threshold is read off the data, not chosen: the pairwise distances are
**0.0 m** (OBA Waterlandplein / Huis van de Wijk Waterlandplein, one address), **3.7 m** (OBA Banne
/ Huis van de Wijk De Banne, house numbers 249 and 243) and then **51.9 m** (AH Waterlandplein, a
supermarket on the same square). Any cut between 4 and 50 m gives the same clustering, so the
number is not doing any work.

**Rejected: matching on address.** It merges the Waterlandplein pair and misses the Banne pair -
two house numbers, one building, 3.7 m apart. Proximity is the property that matters; the address
is a proxy for it that fails here.

**What the clustering is for, and what it is not for.** Decision 6 is correct that
distance-to-nearest cannot tell two organisations in one building apart. Clustering matters the
moment a metric *sums* over venues: two records at an identical coordinate are exactly tied, so
the network argmin hands one of them the whole catchment and the other zero. Per-venue load would
show OBA Waterlandplein serving 1,785 residents and the Huis van de Wijk serving none, which is an
artefact of tie-breaking. That is the de-duplication guard decision 6 asked for, and it is the
*only* job clustering does here.

**Corrected 3 Sep 2026 - clustering is not a failure model.** This decision originally used venues
as the unit for criticality too, on the reasoning that a shared building fails as one. Nojus's
objection is right and overturns it: the failure that matters is **a venue leaving the scheme** -
an organisation withdrawing, losing funding, or changing what it offers - not a building being
demolished. These are voluntary participants in a programme that went live this summer;
participation is the volatile thing, masonry is not. Against *that* failure, two organisations in
one building are two independent chances of survival, and merging them understates redundancy.

**So the two metrics are counted in different units, deliberately:** load per building (a
tie-breaking guard), criticality per organisation (the modelled failure). Both are reported.

**What it changes, measured rather than asserted.** Residents whose only option is a single
organisation: **177,160** against **180,685** for a single building - 83% of the covered population
against 84%. Exactly two sites differ, which is the two merged pairs and nothing else: the Banne
falls from 3,135 sole-dependent residents to **0**, Waterlandplein from 390 to **0**, because in
each case the co-located neighbour survives the failure. Venues with no backup at all: 49 rather
than 50. The aggregate barely moves; the claim about those two sites reverses completely.

**The real lesson, and it is not about clustering.** The original merge rule was defensible and
still wrong, because the decision never said *which failure* it was modelling. A redundancy metric
is meaningless until the failure is named. It is named now, in section 15 and above.

**Identity from the network.** `sjoin_nearest` in section 5 named each square's **straight-line**
nearest facility; section 6 replaced the distance and never the name. `scipy.sparse.csgraph
.dijkstra(min_only=True)` settles every node once and reports which source reached it, so one pass
replaces 80 - and its distances must reproduce the section 6b multi-source result exactly.

**How wrong the straight line was: it names a different venue for 1,802 of 7,043 squares - 24.2% of
residents.** Concentrated in Oost, Centrum and Noord, which is the water again. No published figure
used that column; every figure in section 15 depends on it.

**Two implementation bugs, recorded because the second is the instructive one.**

1. The graph has been **undirected** since section 6a (`ox.convert.to_undirected`). Rebuilding it
   as a `DiGraph` for scipy made every edge one-way and left the entire city unreachable from every
   facility.
2. The assertion that should have caught it **passed vacuously**. It compared the two distance
   vectors on the intersection of their non-null indices - and with everything unreachable, that
   set was empty. `np.allclose` over an empty array is `True`. An assertion over a filtered set
   must also assert the size of the set, or it tests nothing precisely when everything is broken.
   The check now compares the count first.

## 21. Opening hours are an annotation on supply, and still not an input

Decision 7 excludes opening hours from coverage: they change season to season, and a structural
finding conditioned on them is stale on arrival. That argument still holds, and coverage is
unchanged.

It does not survive intact into section 15. "These residents have exactly one place to walk to" is
a claim about **reliability**, and **45 of the 78 venues are closed on Sunday** (42 of 80 records;
29 records are also closed on Saturday). Nine of the twelve largest single points of failure are
Sunday closures. A sole provider that is shut does not provide.

**The resolution:** hours stay out of the computation and appear as an **annotation** on the venue
chart. The structural claim stays hours-free and stays comparable with sections 1-14; the reader
can still see which single points of failure are also weekend gaps.

**Rejected: a Sunday-only coverage figure.** Same objection as decision 7 - it would be stale on
arrival - and worse here, because it would quietly redefine the denominator of every supply number
on the page.

**Not measured:** whether the venues that are open at weekends are the ones people would actually
use in a heatwave. That is a question about behaviour, and nothing in this data touches it.


## 22. This maps indoor shelter; the gemeente's map is outdoor cool space

The open question asked whether this duplicates the municipal product and told us to settle it
before claiming novelty. Settled 3 Sep 2026: it does not, and the difference is definitional
rather than methodological.

**The official layer.** "Afstand tot koelte" in the Klimaateffectatlas defines a *koele plek* as
outdoor public space of at least **200 m2**, with a **300 m** threshold from the WHO guideline
(sometimes 200 m for more vulnerable groups), measured over the **shortest walking route from a
building**. The methodology traces to the HvA report *De hittebestendige stad*.

**This project.** Indoor venues a person can sit inside during a heatwave - libraries, community
centres, supermarkets, hotels, churches - published on koeltekaartamsterdam.nl, live since the
summer of 2026 and not part of any published research.

**Same city, same verb, different object.** Both measure walking distance to the nearest cool
place; they disagree about what a cool place is. A resident with a shaded park 200 m away and no
indoor venue within a kilometre is covered on one map and uncovered on the other, and both are
correct. The maps are complementary, not competing.

**What this does to the framing, and it is the useful part.** The contribution here is not
methodological novelty - network distance to the nearest facility is exactly what the national
atlas already does. It is the **object**: what changes when "cooling place" means somewhere you can
sit indoors rather than a patch of green you can stand on. That belongs in the README's opening
rather than in a footnote, and no coverage figure from this project should ever be quoted without
saying which kind of koelteplek it counts.

**Deliberately not claimed yet.** Press coverage of the municipal heat plan reports roughly 87% of
residents within 1 km of a koelteplek and about half within 500 m, against 23.7% within 500 m here.
That contrast is striking and is **not yet evidence of anything** - the figure has not been checked
against the published layer, and the two numbers count different objects on possibly different
population bases. It becomes a finding only after the layer is downloaded and both are recomputed on
the same CBS grid. Until then it stays out of the README.

**Sources:** the Klimaateffectatlas bijsluiter
(`klimaatadaptatienederland.nl/stresstest/bijsluiter/bepalen-dreigingen/hitte/afstand-koelte/`) and
the Nationaal Georegister record for "Afstand tot koelte - koelteplekken"
(`776b8c7a-b382-402d-b157-6918c8c2d0d6`).


## 23. The three priority lists are reconciled into two decisions, not one ranking

Sections 13, 14 and 15 each end in a priority list and they name different places: Lootsbuurt by
reach, small central dock islands by need, OBA Bos en Lommer by fragility. Section 16 reconciles
them without collecting any new data.

**The move that does the work is noticing that one of the three is about different people.**
Sections 13 and 14 both describe the 692,175 residents with no cooling place within 500 m. Section
15 describes the 214,600 who have one and might stop. Those populations are disjoint *by
construction* - an underserved zone is defined as being far from every venue, so no venue's failure
can reach it. There are therefore two decisions, **expand** and **protect**, and reach and need are
commensurable only within the first.

**Rejected: a composite priority score.** Blending reach, severity and fragility into one ranked
list would be the `build_hvi.py` object of decision 15 with more inputs - a number nobody can see
inside or test. The output is a table with the axes kept apart plus a rule for reading it: reach
says how much a site buys, the typology says what kind of need it buys it for, fragility is a
different budget about different residents.

**Rejected: an exchange rate between expanding and protecting.** The best new site reaches 21,687
residents; the largest single point of failure holds 7,520. Converting one into the other requires
a judgement about gaining access versus losing it that is political, not measurable. Both are
reported and neither is netted off.

**Finding - reach and need barely overlap.** Exactly **one** of the eight high-effect areas sits in
a *hot + elderly* zone (Haarlemmerbuurt-West, fifth by reach). The rest split across every other
class. Siting on reach alone puts seven of eight venues outside the most severe category; siting on
severity alone forgoes the top four by reach.

**Finding - one site satisfies every criterion.** Zone 87, the Westelijke eilanden and
Haarlemmerbuurt-West: 11,160 residents, 21.3% over 65 against a city median of 13.5%, TOjuli 2.19
against 1.80, and the highest achievable reach of the six severe zones. This is the closest thing
to an unambiguous recommendation the analysis produces, and it does not depend on which section
you start from.

**Finding, and it is a limit of the method rather than of the data.** Hogewey-Zuid in Weesp is *hot
+ elderly* and contains no candidate point at all - too small and thin for the 200 m grid, and
physically separate from the city. No reach-based exercise will ever surface it. Recorded so that
its absence from the siting output is not read as its absence from the problem.

**A units error caught in the writing.** The section-14 gain is *weighted* demand and section 15's
criticality is a headcount; the first draft printed 27,267 beside 7,520 as though they were the
same quantity. The unweighted reach of that site is 21,687, and that is the number now compared.

---

## Open questions

- **Ferry routing.** Adding ferry ways via `custom_filter`, or a fixed crossing penalty, would
  make Noord's numbers exact rather than merely plausible.
- **Tree canopy.** BGT ground cover misses shade entirely. The tree register, or a shade model
  built from AHN heights plus BAG buildings and solar position, is the natural next step - and
  would be reproducible from primary data rather than inherited.
- **Real PET.** Ask the gemeente (`klimaatadaptatie@amsterdam.nl`) for the Klimaatrisicokaarten
  data and its methodology report. If it arrives, it replaces the surface-cover proxy and the
  proxy becomes the validation check.
- **Overlay the official layer.** Decision 22 settles what the gemeente's map *is* - outdoor space
  of 200 m2 or more, at a 300 m threshold - but not how the two compare in numbers. Download the
  "Afstand tot koelte" layer, recompute both on the same CBS grid, and report the two coverage
  figures side by side. Until that is done, the reported municipal figures stay out of the README.
- **Income and limited mobility.** Both named in the assignment brief. Income is too suppressed
  at 100 m; the Klimaatrisicokaarten carries `INWONERS_BEPERKT_MOBIEL` at buurt level. Neither
  needs 100 m resolution to be useful.
- ~~**Supply-side questions, entirely untouched.**~~ **Answered in section 15** for load and
  single-point dependency. **Capacity is struck as unanswerable:** every venue counts the same
  regardless of size - a library and a supermarket cafe are not equivalent shelter - but there is
  no floor area, occupancy limit or headcount in any available source, so "where demand exceeds
  what one place can hold" would have to be built on an invented proxy. It is not a to-do; it is
  out of reach until someone surveys the buildings.
- **Garden access.** In the municipal framework as adaptive capacity. Someone with a shaded
  garden does not need to walk anywhere - a demand-side correction this analysis lacks entirely.
