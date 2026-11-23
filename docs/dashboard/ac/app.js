/* AC-grant page. Which buurthuizen and OBA libraries should get air conditioning?
   A site is worth what it adds: residents within walking distance who have no air-conditioned
   cooling place in reach, after the sites already in the plan (decision 31).
   D is dashboard.json, DA is ac_grant.json. */
const T = D.totals, G = D.grid, N = G.x.length, BU = D.buurten, VEN = D.venues;

function packed(R){
  const b = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
  const cb = b(R.cell);
  return {cell: new Uint16Array(cb.buffer, 0, cb.length / 2), d10: b(R.d10)};
}
function unpack(R, k, P){
  const a = R.off[k], z = R.off[k+1], d = new Uint16Array(z - a);
  for(let j = 0; j < d.length; j++) d[j] = P.d10[a + j] * 10;
  return {cells: P.cell.subarray(a, z), d};
}
const PO = packed(D.orgs), PR = packed(D.reach);
/* Spelling fixes for names as they come from the koeltekaart (data/raw stays as it was). */
const NAME_FIX = {"OBA Next lab Kraainnest": "OBA Next Lab Kraaiennest", "OBA Ijburg": "OBA IJburg",
  "OBA De Staatsliedenbuurt": "OBA Staatsliedenbuurt"};
const fixName = n => NAME_FIX[n] || n;
const ORGS = D.orgs.site.map((site, k) => ({...DA.orgs[k], name: fixName(DA.orgs[k].name), site, x: VEN[site].x, y: VEN[site].y, ...unpack(D.orgs, k, PO)}));

/* Frailty-weighted residents: each square scaled by its buurt's frail-health rate against the city. */
const FW = new Float64Array(N);
for(let i = 0; i < N; i++){ const f = BU[G.bu[i]] && BU[G.bu[i]].frail; FW[i] = G.pop[i] * (f == null ? 1 : f / T.city_frail); }
/* ---- language: English or Dutch, from ?lang=, else the last choice in this browser ------------ */
const LANG_KEY = "ac-grant-lang";
let LANG = (() => { const q = new URLSearchParams(location.search).get("lang");
  if(q === "nl" || q === "en") return q;
  try { return localStorage.getItem(LANG_KEY) === "nl" ? "nl" : "en"; } catch(e) { return "en"; } })();
const t = (en, nl) => LANG === "nl" ? nl : en;
const LOC = () => t("en-GB", "nl-NL");
const KIND_T = {OBA: () => "OBA", Buurthuis: () => "Buurthuis", "Community centre": () => t("Community centre", "Buurtcentrum")};

const METRIC = {people: {s: () => t("residents", "inwoners")}, eld: {s: () => t("residents aged 65+", "65-plussers")},
                frail: {s: () => t("frailty-weighted residents", "kwetsbaarheidsgewogen inwoners")}};

const SITES = [];
ORGS.forEach((o, k) => { if(o.eligible) SITES.push({id: "n" + k, org: k, name: o.name,
  kind: o.type === "library" ? "OBA" : "Buurthuis", pool: "network", x: o.x, y: o.y, cells: o.cells, d: o.d}); });
const addCand = (k, kind, pool) => { const c = D.candidates[k];
  SITES.push({id: "c" + k, cand: k, name: c.name, kind, pool, x: c.x, y: c.y, ...unpack(D.reach, k, PR)}); };
/* OBA branches not on the koeltekaart, from OBA's own list, each with its own catchment (notebook 20b). */
const PB = packed(DA.oba_reach);
DA.oba.forEach((b, k) => SITES.push({id: "b" + k, name: b.name, kind: "OBA", pool: "outside", x: b.x, y: b.y, ...unpack(DA.oba_reach, k, PB)}));
DA.osm_cc.forEach(k => addCand(k, "Community centre", "osm"));
const SITE = new Map(SITES.map(s => [s.id, s]));
const subOf = s => KIND_T[s.kind]();

/* Square -> network organisations, for naming what already covers a site. */
const AT = (() => {
  const off = new Int32Array(N + 1);
  for(const o of ORGS) for(const i of o.cells) off[i + 1]++;
  for(let i = 0; i < N; i++) off[i + 1] += off[i];
  const at = off.slice(0, N), org = new Uint16Array(off[N]), d = new Uint16Array(off[N]);
  ORGS.forEach((o, k) => { for(let j = 0; j < o.cells.length; j++){ const p = at[o.cells[j]]++; org[p] = k; d[p] = o.d[j]; } });
  return {off, org, d};
})();

const fmt = n => Math.round(n).toLocaleString(LOC());
const dec1 = v => v.toLocaleString(LOC(), {minimumFractionDigits: 1, maximumFractionDigits: 1});
const pct = v => dec1(v * 100) + "%";
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const km = m => m >= 1000 ? (m/1000).toLocaleString(LOC()) + " km" : m + " m";
/* The walk-averaged value: area under value-against-distance, divided by the span (trapezoidal,
   because the distances are uneven), as in the coverage dashboard. */
const ROBUST_T = [300, 500, 750, 1000, 1500];
const trapz = v => { let a = 0;
  for(let i = 0; i < ROBUST_T.length - 1; i++) a += (v[i] + v[i+1]) / 2 * (ROBUST_T[i+1] - ROBUST_T[i]);
  return a / (ROBUST_T[ROBUST_T.length-1] - ROBUST_T[0]); };

/* ---- state, remembered in this browser ----------------------------------------------------- */
const STORE = "ac-grant-v2";
/* Which sites the grant may fund. Existing AC of every type still counts as coverage either way.
   OSM community centres are buurthuis-like, so they go with the buurthuizen. */
const KINDS = {all: {t: () => t("Both", "Beide"), f: () => true}, oba: {t: () => t("OBA branches", "OBA-vestigingen"), f: s => s.kind === "OBA"},
               buurt: {t: () => "Buurthuizen", f: s => s.kind !== "OBA"}};
const state = {thr: T.threshold, metric: "people", sort: "at", plan: [], autoN: 10,
  tab: "cands", sel: null, hover: null, acSet: {}, excl: new Set(), osm: false, kind: "all"};
try { const s = JSON.parse(localStorage.getItem(STORE) || "null");
  if(s){ Object.assign(state, {acSet: s.acSet || {}, excl: new Set(s.excl || []), osm: !!s.osm,
    plan: (s.plan || []).filter(id => SITE.has(id)), autoN: s.autoN || 10,
    sort: s.sort === "avg" ? "avg" : "at",
    kind: KINDS[s.kind] ? s.kind : "all"}); } } catch(e) {}
function save(){ try { localStorage.setItem(STORE, JSON.stringify({acSet: state.acSet, excl: [...state.excl],
  osm: state.osm, plan: state.plan, autoN: state.autoN, sort: state.sort, kind: state.kind})); } catch(e) {} }

const orgAC = k => { const v = state.acSet["n" + k]; return v === undefined ? ORGS[k].airco : v; };
const hasAC = s => s.pool === "network" ? orgAC(s.org) : !!state.acSet[s.id];
const acDefault = s => s.pool === "network" ? ORGS[s.org].airco : false;
const inPool = s => (s.pool !== "osm" || state.osm) && KINDS[state.kind].f(s);
const isCandidate = s => inPool(s) && !hasAC(s) && !state.excl.has(s.id);
const inPlan = id => state.plan.includes(id);
/* Corrections can make a planned site ineligible; it leaves the plan rather than lingering. */
const prunePlan = () => { state.plan = state.plan.filter(id => isCandidate(SITE.get(id))); };

/* ---- the model ----------------------------------------------------------------------------- */
const memo = new Map();
const statusKey = () => JSON.stringify([state.acSet, [...state.excl].sort(), state.osm, state.kind]);
function coolAt(t){
  const k = "cool|" + t + "|" + statusKey();
  if(memo.has(k)) return memo.get(k);
  const c = new Uint8Array(N);
  ORGS.forEach((o, j) => { if(orgAC(j)) for(let q = 0; q < o.cells.length; q++) if(o.d[q] <= t) c[o.cells[q]] = 1; });
  memo.set(k, c); return c;
}
function coverAt(t, plan = state.plan){
  const k = "cover|" + t + "|" + statusKey() + "|" + plan.join(",");
  if(memo.has(k)) return memo.get(k);
  const c = Uint8Array.from(coolAt(t));
  for(const id of plan){ const s = SITE.get(id); for(let j = 0; j < s.cells.length; j++) if(s.d[j] <= t) c[s.cells[j]] = 1; }
  memo.set(k, c); return c;
}
function gainOf(s, t, got){
  let people = 0, eld = 0, frail = 0;
  for(let j = 0; j < s.cells.length; j++){
    if(s.d[j] > t) continue;
    const i = s.cells[j]; if(got[i]) continue;
    people += G.pop[i]; eld += G.eld[i]; frail += FW[i];
  }
  return {people, eld, frail};
}
const val = (g, m = state.metric) => m === "people" ? g.people : m === "eld" ? g.eld : g.frail;

/* Every candidate outside the plan, valued against the plan as it stands. */
function rows(plan = state.plan){
  const k = "rows|" + state.thr + "|" + state.metric + "|" + state.sort + "|" + statusKey() + "|" + plan.join(",");
  if(memo.has(k)) return memo.get(k);
  const cover = coverAt(state.thr, plan), cool = coolAt(state.thr);
  const r = SITES.filter(s => isCandidate(s) && !plan.includes(s.id)).map(s => {
    const at = gainOf(s, state.thr, cover), per = ROBUST_T.map(t => val(gainOf(s, t, coverAt(t, plan))));
    return {s, at, per, avg: trapz(per), alone: gainOf(s, state.thr, cool)};
  });
  r.forEach(x => x.v = state.sort === "avg" ? x.avg : val(x.at));
  r.sort((a, b) => b.v - a.v || b.at.people - a.at.people);
  memo.set(k, r); return r;
}
/* The plan in the order it was built: what each site added when it was added. */
function planStats(){
  const k = "plan|" + state.thr + "|" + statusKey() + "|" + state.plan.join(",");
  if(memo.has(k)) return memo.get(k);
  const got = Uint8Array.from(coolAt(state.thr)), steps = [];
  for(const id of state.plan){ const s = SITE.get(id); steps.push({s, gain: gainOf(s, state.thr, got)});
    for(let j = 0; j < s.cells.length; j++) if(s.d[j] <= state.thr) got[s.cells[j]] = 1; }
  let base = 0, after = 0, tot = 0;
  const cool = coolAt(state.thr);
  for(let i = 0; i < N; i++){ tot += G.pop[i]; if(cool[i]) base += G.pop[i]; if(got[i]) after += G.pop[i]; }
  const sum = steps.reduce((a, x) => ({people: a.people + x.gain.people, eld: a.eld + x.gain.eld, frail: a.frail + x.gain.frail}), {people: 0, eld: 0, frail: 0});
  const v = {steps, base, after, tot, sum};
  memo.set(k, v); return v;
}
/* Secondary: fill the plan greedily, by the active ranking, up to n sites. */
function autoPick(n){
  const plan = [];
  while(plan.length < n){ const r = rows(plan); if(!r.length || r[0].v <= 0) break; plan.push(r[0].s.id); }
  state.plan = plan;
}

function coveredBy(s){
  const by = new Map();
  for(let j = 0; j < s.cells.length; j++){
    if(s.d[j] > state.thr) continue;
    const i = s.cells[j];
    for(let p = AT.off[i]; p < AT.off[i+1]; p++){ const o = AT.org[p];
      if(AT.d[p] <= state.thr && orgAC(o) && o !== s.org) by.set(ORGS[o].name, (by.get(ORGS[o].name) || 0) + G.pop[i]); }
  }
  return [...by.entries()].sort((a, b) => b[1] - a[1]);
}
function overlapWithPlan(s){
  const cool = coolAt(state.thr); let best = null;
  for(const id of state.plan){ const f = SITE.get(id), set = new Set();
    for(let j = 0; j < f.cells.length; j++) if(f.d[j] <= state.thr) set.add(f.cells[j]);
    let p = 0; for(let j = 0; j < s.cells.length; j++){ const i = s.cells[j]; if(s.d[j] <= state.thr && set.has(i) && !cool[i]) p += G.pop[i]; }
    if(p > 0 && (!best || p > best.p)) best = {name: f.name, p}; }
  return best;
}
/* One line on why a site is where it is. */
function reason(s, r){
  if(hasAC(s)) return acDefault(s) ? (s.pool === "network" && ORGS[s.org].corrected ? t("Has AC (corrected)", "Heeft airco (gecorrigeerd)") : t("Has AC", "Heeft airco")) : t("Marked as having AC", "Gemarkeerd als met airco");
  if(state.excl.has(s.id)) return t("Excluded", "Uitgesloten");
  if(!r) return "";
  if(r.alone.people === 0 && gainOf(s, state.thr, new Uint8Array(N)).people === 0)
    return t(`No Amsterdam residents within ${km(state.thr)}`, `Geen Amsterdamse inwoners binnen ${km(state.thr)}`);
  if(r.alone.people === 0){ const by = coveredBy(s); return by.length ? t(`Already covered by ${by[0][0]}`, `Al gedekt door ${by[0][0]}`) : t("Already covered by AC", "Al gedekt door airco"); }
  const ov = overlapWithPlan(s);
  if(ov && r.at.people < 0.8 * r.alone.people) return t(`Overlaps ${ov.name}`, `Overlapt met ${ov.name}`);
  return "";
}

/* ---- palette ------------------------------------------------------------------------------- */
const TOKENS = ["--ground","--panel","--sunk","--ink","--ink-2","--ink-3","--line","--line-2","--blue","--orange","--mute","--grid-base","--plan"];
let P = {};
const hex = c => { c = c.replace("#",""); if(c.length === 3) c = c.split("").map(x => x+x).join("");
  return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)]; };
const mix = (a,b,t) => "#" + hex(a).map((v,i) => Math.round(v + (hex(b)[i]-v)*t).toString(16).padStart(2,"0")).join("");
function palette(){ const cs = getComputedStyle(document.documentElement); P = {}; for(const t of TOKENS) P[t] = cs.getPropertyValue(t).trim(); }

/* ---- map ----------------------------------------------------------------------------------- */
const cv = document.getElementById("cv"), ov = document.getElementById("ov"), ctx = cv.getContext("2d"), tip = document.getElementById("tip");
const PAD = 250, ZMAX = 8;
let W = 900, H = 600, sc = 1, ox = 0, oy = 0, base = {sc:1, ox:0, oy:0};
const view = {z:1, cx:null, cy:null};
const FIT = matchMedia("(min-width:1101px) and (min-height:640px)");
function fit(){
  const box = document.getElementById("mapbox").getBoundingClientRect();
  W = Math.max(320, Math.round(box.width));
  const [x0,y0,x1,y1] = D.bbox, w = (x1-x0) + PAD*2, h = (y1-y0) + PAD*2;
  if(FIT.matches){ H = Math.max(240, Math.round(box.height)); const s0 = Math.min(W/w, H/h);
    base = {sc:s0, ox:x0 - PAD - (W/s0 - w)/2, oy:y1 + PAD + (H/s0 - h)/2}; }
  else { H = Math.round(W * h / w); base = {sc:W/w, ox:x0 - PAD, oy:y1 + PAD}; }
  applyView();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W*dpr; cv.height = H*dpr; cv.style.height = H + "px";
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ov.setAttribute("viewBox", `0 0 ${W} ${H}`); ov.style.height = H + "px";
}
function applyView(){
  view.z = Math.min(ZMAX, Math.max(1, view.z)); sc = base.sc * view.z;
  const fx0 = base.ox, fx1 = base.ox + W/base.sc, fy1 = base.oy, fy0 = base.oy - H/base.sc, hw = W/2/sc, hh = H/2/sc;
  const cx = view.cx ?? (fx0+fx1)/2, cy = view.cy ?? (fy0+fy1)/2;
  view.cx = Math.min(fx1 - hw, Math.max(fx0 + hw, cx)); view.cy = Math.min(fy1 - hh, Math.max(fy0 + hh, cy));
  if(view.z === 1){ view.cx = (fx0+fx1)/2; view.cy = (fy0+fy1)/2; }
  ox = view.cx - hw; oy = view.cy + hh;
  ov.style.overflow = view.z > 1 ? "hidden" : "visible";
  document.getElementById("zin").disabled = view.z >= ZMAX;
  document.getElementById("zout").disabled = document.getElementById("zfit").disabled = view.z <= 1;
}
const px = x => (x - ox) * sc, py = y => (oy - y) * sc;

function drawGrid(){
  ctx.clearRect(0,0,W,H);
  const s = Math.max(1.15, 100*sc), cool = coolAt(state.thr), cover = coverAt(state.thr);
  const ground = mix(P["--grid-base"], P["--ground"], .35), coolC = mix(P["--blue"], P["--ground"], .72);
  const focus = state.hover || state.sel, f = focus ? SITE.get(focus) : null;
  const sq = i => ctx.fillRect(px(G.x[i]) - s/2, py(G.y[i]) - s/2, s, s);
  for(let i = 0; i < N; i++){ if(!G.pop[i]) continue; ctx.fillStyle = cool[i] ? coolC : ground; sq(i); }
  ctx.fillStyle = P["--plan"]; ctx.globalAlpha = f ? .35 : .8;
  for(let i = 0; i < N; i++) if(G.pop[i] && cover[i] && !cool[i]) sq(i);
  ctx.globalAlpha = 1;
  if(f){
    const on = inPlan(f.id), got = on ? cool : cover;
    ctx.fillStyle = on ? P["--plan"] : P["--orange"];
    for(let j = 0; j < f.cells.length; j++){ const i = f.cells[j]; if(f.d[j] <= state.thr && G.pop[i] && !got[i]) sq(i); }
  }
}
const svgPath = rings => rings.map(r => "M" + r.map(p => px(p[0]).toFixed(1)+" "+py(p[1]).toFixed(1)).join("L") + "Z").join(" ");
function drawOverlay(){
  const parts = [`<path d="${svgPath(D.city)}" fill="none" stroke="${P["--line"]}" stroke-width="1"/>`];
  const seen = new Set();
  ORGS.forEach((o, k) => {
    if(seen.has(o.site)) return; seen.add(o.site);
    const same = ORGS.map((x, j) => x.site === o.site ? j : -1).filter(j => j >= 0);
    if(same.some(j => { const s = SITE.get("n" + j); return s && isCandidate(s); })) return;
    parts.push(`<circle class="site" data-org="${k}" cx="${px(o.x).toFixed(1)}" cy="${py(o.y).toFixed(1)}" r="2.3"
      fill="${same.some(orgAC) ? P["--blue"] : P["--mute"]}" stroke="${P["--panel"]}" stroke-width=".8"/>`);
  });
  const R = rows(), byId = new Map(R.map(r => [r.s.id, r]));
  for(const r of R){
    const s = r.s, hot = state.hover === s.id || state.sel === s.id, zero = r.v <= 0;
    const x = px(s.x).toFixed(1), y = py(s.y).toFixed(1);
    if(s.pool === "osm" && !hot){ parts.push(`<circle class="site" data-s="${s.id}" cx="${x}" cy="${y}" r="2" fill="none" stroke="${P["--orange"]}" stroke-width="1" opacity=".55"/>`); continue; }
    parts.push(`<circle class="site" data-s="${s.id}" cx="${x}" cy="${y}" r="${hot ? 6 : 4.2}" fill="${P["--panel"]}"
      stroke="${zero ? P["--mute"] : P["--orange"]}" stroke-width="${hot ? 2.4 : 1.8}"/>`);
  }
  state.plan.forEach((id, i) => { const s = SITE.get(id), hot = state.hover === id || state.sel === id;
    const x = px(s.x).toFixed(1), y = py(s.y).toFixed(1);
    parts.push(`<circle class="site" data-s="${id}" cx="${x}" cy="${y}" r="${hot ? 9 : 7.5}" fill="${P["--plan"]}"
      stroke="${hot ? P["--ink"] : P["--panel"]}" stroke-width="${hot ? 2 : 1.2}"/><text x="${x}" y="${(+y + 3).toFixed(1)}" text-anchor="middle" fill="#fff">${i + 1}</text>`); });
  ov.innerHTML = parts.join("");
  ov.querySelectorAll("[data-s]").forEach(el => { const id = el.dataset.s;
    el.onclick = () => select(id);
    el.onmouseenter = () => { state.hover = id; drawGrid(); };
    el.onmousemove = e => { const s = SITE.get(id), r = byId.get(id), st = planStats().steps.find(x => x.s.id === id);
      showTip(`<div class="t">${esc(s.name)}</div>` + (st ? trow(t("In plan, adds", "In plan, voegt toe"), fmt(val(st.gain)))
        : r ? trow(state.sort === "avg" ? t("Adds, walk average", "Voegt toe, loopgemiddelde") : t(`Adds within ${km(state.thr)}`, `Voegt toe binnen ${km(state.thr)}`), fmt(r.v)) : ""), e); };
    el.onmouseleave = () => { state.hover = null; tip.style.opacity = 0; drawGrid(); }; });
  ov.querySelectorAll("[data-org]").forEach(el => { const o = ORGS[+el.dataset.org];
    el.onmousemove = e => showTip(`<div class="t">${esc(fixName(VEN[o.site].name))}</div>` + trow(t("AC", "Airco"), ORGS.some((x, j) => x.site === o.site && orgAC(j)) ? t("Yes", "Ja") : t("No", "Nee")), e);
    el.onmouseleave = () => tip.style.opacity = 0; });
}
const trow = (k, v) => `<div class="r"><span>${k}</span><b>${v}</b></div>`;
function showTip(html, e){
  const b = cv.getBoundingClientRect(), cx = e.clientX - b.left, cy = e.clientY - b.top;
  tip.innerHTML = html; tip.style.opacity = 1;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(W-w-6, Math.max(6, cx+14)) + "px";
  tip.style.top = (cy-h-10 < 6 ? cy+16 : cy-h-10) + "px";
}
function legend(){
  const sw = (st, l, c = "") => `<span class="lg"><span class="sw${c}" style="${st}"></span>${l}</span>`;
  document.getElementById("legend").innerHTML = `<div class="keys">
    ${sw(`background:${mix(P["--blue"], P["--ground"], .72)}`, t("AC in reach", "Airco binnen bereik"))}
    ${sw(`background:${mix(P["--plan"], P["--panel"], .2)}`, t("Gained by plan", "Erbij door plan"))}
    ${sw(`border-color:${P["--orange"]}`, t("Candidate", "Kandidaat"), " ring")}
    ${sw(`background:${P["--blue"]}`, t("Has AC", "Heeft airco"), " dot")}</div>`;
}

/* ---- summary ------------------------------------------------------------------------------- */
function kpis(){
  const p = planStats(), n = state.plan.length;
  const tile = (l, v, d, s) => `<div class="kpi"><div class="kl">${l}</div><div class="kv">${v}${d ? `<span class="kd">${d}</span>` : ""}</div>${s ? `<div class="ks">${s}</div>` : ""}</div>`;
  document.getElementById("kpis").innerHTML = [
    tile(t(`AC place within ${km(state.thr)}`, `Airco-plek binnen ${km(state.thr)}`), pct(p.after / p.tot), n ? `+${dec1((p.after - p.base) / p.tot * 100)} ${t("pts", "pp")}` : "", t(`of ${fmt(p.tot)} residents`, `van ${fmt(p.tot)} inwoners`)),
    tile(t("Newly reached", "Nieuw bereikt"), fmt(p.sum.people), "", t(`${fmt(p.sum.eld)} aged 65+`, `${fmt(p.sum.eld)} 65-plussers`)),
    tile(t("Frailty-weighted", "Kwetsbaarheidsgewogen"), fmt(p.sum.frail), "", t("Newly reached", "Nieuw bereikt")),
    `<button type="button" class="kpi" id="kpiplan"><div class="kl">Plan</div><div class="kv">${n} ${n === 1 ? t("site", "locatie") : t("sites", "locaties")}</div><div class="ks">${n ? t("Open plan", "Plan openen") : t("Add candidates", "Kandidaten toevoegen")}</div></button>`
  ].join("");
  document.getElementById("kpiplan").onclick = () => { state.tab = "plan"; state.sel = null; render(); };
}

/* ---- side panel ---------------------------------------------------------------------------- */
const ICON = {
  plus:`<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  check:`<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.3l2.6 2.6L10 3.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  moon:`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  sun:`<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9L13 13M3 13l1.1-1.1M11.9 4.1L13 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`
};
const addBtn = id => { const on = inPlan(id);
  return `<button type="button" class="addbtn${on ? " on" : ""}" data-add="${id}" aria-pressed="${on}" title="${on ? t("Remove from plan", "Uit plan halen") : t("Add to plan", "Aan plan toevoegen")}">${on ? ICON.check : ICON.plus}</button>`; };
const TABS = [["cands", () => t("Candidates", "Kandidaten")], ["plan", () => "Plan"], ["status", () => t("Sites & AC", "Locaties & airco")]];
function inspector(){
  const el = document.getElementById("inspector");
  el.style.setProperty("--accent", P["--plan"]);
  el.innerHTML = `<div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${l()}${
      k === "plan" && state.plan.length ? `<span class="badge">${state.plan.length}</span>` : ""}</button>`).join("")}</div>`
    + (state.sel ? detailHTML() : state.tab === "cands" ? candHTML() : state.tab === "plan" ? planHTML() : statusHTML());
  bindPanel(el);
}
const avgLabel = () => t(`Walk average, 300 m–${km(1500)}`, `Loopgemiddelde, 300 m–${km(1500)}`);
const sortLabel = () => state.sort === "avg" ? avgLabel() : t(`Within ${km(state.thr)}`, `Binnen ${km(state.thr)}`);
function candHTML(){
  const R = rows(), top = Math.max(1, ...R.map(r => r.v));
  return `<div class="listhead"><span>${R.length} ${t("candidates", "kandidaten")}</span>
      <label class="sortby">${t("Rank by", "Rangschik op")} <select id="sort">
        <option value="at"${state.sort === "at" ? " selected" : ""}>${t("Within", "Binnen")} ${km(state.thr)}</option>
        <option value="avg"${state.sort === "avg" ? " selected" : ""}>${avgLabel()}</option></select></label></div>
    <div class="scroll">${R.length ? R.map(r => { const why = reason(r.s, r);
      return `<div class="row${r.v > 0 ? "" : " nogain"}" data-s="${r.s.id}" tabindex="0" role="button">${addBtn(r.s.id)}
        <div><div class="rn">${esc(r.s.name)}</div><div class="rm">${esc(why || subOf(r.s))}</div></div>
        <div><div class="rv">${r.v > 0 ? fmt(r.v) : "—"}</div><div class="rb"><i style="width:${(Math.max(0, r.v) / top * 100).toFixed(1)}%"></i></div></div></div>`; }).join("")
      : `<p class="empty">${t("No candidates left.", "Geen kandidaten meer.")}</p>`}</div>`;
}
function planHTML(){
  const p = planStats(), kv = (k, v, c = "") => `<tr${c ? ` class="${c}"` : ""}><td>${k}</td><td>${v}</td></tr>`;
  return `<div class="plansum"><table class="kvt"><tbody>
      ${kv(t(`AC place within ${km(state.thr)}`, `Airco-plek binnen ${km(state.thr)}`), `${pct(p.base / p.tot)} → ${pct(p.after / p.tot)}`, "strong")}
      ${kv(t("Newly reached", "Nieuw bereikt"), fmt(p.sum.people))}${kv(t("Aged 65+", "65-plussers"), fmt(p.sum.eld))}${kv(t("Frailty-weighted", "Kwetsbaarheidsgewogen"), fmt(p.sum.frail))}</tbody></table>
      <div class="autopick"><span>${t("Auto-pick", "Automatisch kiezen")}</span>
        <button type="button" class="textbtn" id="nminus" aria-label="${t("Fewer", "Minder")}">−</button><b>${state.autoN}</b>
        <button type="button" class="textbtn" id="nplus" aria-label="${t("More", "Meer")}">+</button>
        <span class="muted">${t("by ", "")}${sortLabel().toLowerCase()}</span><button type="button" class="btn" id="auto">${t("Pick", "Kies")}</button></div></div>
    <div class="planhead"><span>${t(`In order added · adds within ${km(state.thr)}`, `Op volgorde · erbij binnen ${km(state.thr)}`)}</span><span>
      ${state.plan.length ? `<button type="button" class="textbtn" id="copy">${t("Copy summary", "Kopiëren")}</button><button type="button" class="textbtn" id="clear">${t("Clear", "Wissen")}</button>` : ""}
      <span id="copied" class="muted"></span></span></div>
    <div class="scroll">${p.steps.length ? p.steps.map((x, i) => `<div class="row in-plan" data-s="${x.s.id}" tabindex="0" role="button">
        <span class="rk">${i + 1}</span><div><div class="rn">${esc(x.s.name)}</div><div class="rm">${esc(subOf(x.s))}</div></div>
        <div class="rv">+${fmt(val(x.gain))}</div></div>`).join("")
      : `<p class="empty">${t("Add sites from Candidates, or auto-pick.", "Voeg locaties toe uit Kandidaten, of kies automatisch.")}</p>`}</div>`;
}
function detailHTML(){
  const s = SITE.get(state.sel), r = rows().find(x => x.s.id === s.id), st = planStats().steps.find(x => x.s.id === s.id);
  const kv = (k, v, c = "") => `<tr${c ? ` class="${c}"` : ""}><td>${k}</td><td>${v}</td></tr>`;
  const reach = gainOf(s, state.thr, new Uint8Array(N)).people, alone = gainOf(s, state.thr, coolAt(state.thr));
  const back = TABS.find(x => x[0] === state.tab)[1](), why = reason(s, r), ok = isCandidate(s);
  const per = ROBUST_T.map(t => val(gainOf(s, t, inPlan(s.id) ? coverAt(t, state.plan.filter(id => id !== s.id)) : coverAt(t))));
  const mx = Math.max(1, ...per);
  return `<button class="back" type="button" id="back">← ${back}</button><div class="scroll"><div class="detail">
    <h2>${esc(s.name)}</h2><div class="meta">${esc(subOf(s))}${why ? ` · ${esc(why)}` : ""}</div>
    ${ok ? `<button type="button" class="primary${inPlan(s.id) ? " on" : ""}" data-add="${s.id}">${inPlan(s.id) ? t("Remove from plan", "Uit plan halen") : t("Add to plan", "Aan plan toevoegen")}</button>` : ""}
    <div class="sec"><h3>${t("Within", "Binnen")} ${km(state.thr)}</h3><table class="kvt"><tbody>
      ${kv(t("Residents in reach", "Inwoners binnen bereik"), fmt(reach))}${kv(t("Already have AC in reach", "Hebben al airco binnen bereik"), fmt(reach - alone.people))}
      ${kv(t("Gain AC if funded alone", "Erbij als enige locatie"), fmt(alone.people), "strong")}${kv(t("Aged 65+", "65-plussers"), fmt(alone.eld), "sub")}${kv(t("Frailty-weighted", "Kwetsbaarheidsgewogen"), fmt(alone.frail), "sub")}
      ${ok ? kv(st ? t("Added to the plan", "Toegevoegd aan het plan") : t("Adds to the current plan", "Voegt toe aan het huidige plan"), fmt(val(st ? st.gain : r.at))) : ""}</tbody></table></div>
    ${ok ? `<div class="sec"><h3>${inPlan(s.id) ? t("Lost if removed, by walking distance", "Verlies bij verwijderen, per loopafstand") : t("Adds, by walking distance", "Voegt toe, per loopafstand")}</h3><table class="curve"><tbody>${ROBUST_T.map((t, i) =>
      `<tr${t === state.thr ? ' class="now"' : ""}><th scope="row">${km(t)}</th><td class="b"><i style="width:${(per[i] / mx * 100).toFixed(1)}%"></i></td><td class="n">${fmt(per[i])}</td></tr>`).join("")}
      <tr class="avg"><th scope="row" colspan="2">${t("Average", "Gemiddelde")}</th><td class="n">${fmt(trapz(per))}</td></tr></tbody></table></div>` : ""}
    <div class="sec"><h3>${t("Status", "Status")}</h3><div class="toggles">
      <label class="toggle"><input type="checkbox" data-ac="${s.id}"${hasAC(s) ? " checked" : ""}> ${t("Has AC", "Heeft airco")}</label>
      <label class="toggle"><input type="checkbox" data-ex="${s.id}"${state.excl.has(s.id) ? " checked" : ""}> ${t("Exclude", "Uitsluiten")}</label></div></div>
  </div></div>`;
}
function statusHTML(){
  const changed = s => hasAC(s) !== acDefault(s) || state.excl.has(s.id);
  const row = s => `<div class="statusrow${changed(s) ? " changed" : ""}"><div class="rn" data-open="${s.id}">${esc(s.name)}</div>
    <label><input type="checkbox" data-ac="${s.id}"${hasAC(s) ? " checked" : ""}> ${t("AC", "Airco")}</label>
    <label><input type="checkbox" data-ex="${s.id}"${state.excl.has(s.id) ? " checked" : ""}> ${t("Exclude", "Uitsluiten")}</label></div>`;
  const grp = (t, l) => `<div class="grouphead">${t}</div>` + l.sort((a, b) => hasAC(a) - hasAC(b) || a.name.localeCompare(b.name)).map(row).join("");
  const n = SITES.filter(changed).length;
  return `<div class="listhead"><label class="toggle"><input type="checkbox" id="osm"${state.osm ? " checked" : ""}> ${t("OSM community centres", "OSM-buurtcentra")} (${DA.osm_cc.length})</label>
      ${n ? `<button type="button" class="textbtn" id="reset">${t("Reset", "Herstel")} ${n}</button>` : ""}</div>
    <div class="scroll">${grp(t("On the koeltekaart", "Op de koeltekaart"), SITES.filter(s => s.pool === "network"))}
      ${grp(t("OBA, not on the koeltekaart", "OBA, niet op de koeltekaart"), SITES.filter(s => s.pool === "outside"))}
      ${state.osm ? grp(t("OSM community centres", "OSM-buurtcentra"), SITES.filter(s => s.pool === "osm")) : ""}</div>`;
}

/* The plan as Markdown, for a proposal: what was funded, and why each other site was not. */
function summaryMarkdown(){
  const p = planStats(), thr = km(state.thr), M = METRIC[state.metric];
  const R = rows(), minAdd = Math.min(...p.steps.map(x => val(x.gain)));
  const out = R.filter(r => r.s.pool !== "osm").map(r => `| ${r.s.name} | ${fmt(r.alone.people)} | ${fmt(r.at.people)} | ${reason(r.s, r) || (val(r.at) < minAdd ? t("Adds less than every funded site", "Voegt minder toe dan elke gefinancierde locatie") : t("Not chosen", "Niet gekozen"))} |`);
  const only = state.kind === "oba" ? KINDS.oba.t() : "buurthuizen";
  return [t(`## AC grant: ${p.steps.length} sites`, `## Airco-subsidie: ${p.steps.length} locaties`), ``,
    t(`${fmt(p.sum.people)} residents (${fmt(p.sum.eld)} aged 65+) gain an air-conditioned cooling place within ${thr} on foot. Coverage: ${pct(p.base / p.tot)} → ${pct(p.after / p.tot)}.`,
      `${fmt(p.sum.people)} inwoners (${fmt(p.sum.eld)} 65-plussers) krijgen een koelteplek met airco binnen ${thr} lopen. Dekking: ${pct(p.base / p.tot)} → ${pct(p.after / p.tot)}.`), ``,
    ...(state.kind !== "all" ? [t(`Funding restricted to ${only}; existing AC at every site type still counts as coverage.`,
      `Alleen ${only} komen in aanmerking; bestaande airco op alle typen locaties telt mee als dekking.`), ``] : []),
    t(`Each site counts the ${M.s()} within ${thr} with no air-conditioned place in reach, after the sites before it.`,
      `Elke locatie telt de ${M.s()} binnen ${thr} zonder koelteplek met airco binnen bereik, na de locaties ervoor.`), ``,
    t(`| # | Site | Adds | 65+ |`, `| # | Locatie | Erbij | 65+ |`), `|---:|---|---:|---:|`,
    ...p.steps.map((x, i) => `| ${i + 1} | ${x.s.name} | ${fmt(x.gain.people)} | ${fmt(x.gain.eld)} |`), ``,
    t(`### Not funded`, `### Niet gefinancierd`), ``, t(`| Site | Alone | On top of plan | Reason |`, `| Locatie | Alleen | Bovenop plan | Reden |`), `|---|---:|---:|---|`, ...out, ``,
    t(`AC status from koeltekaartamsterdam.nl with corrections; OBA branches not on the koeltekaart assumed without AC. Equal cost per site assumed.`,
      `Airco-status van koeltekaartamsterdam.nl, met correcties; OBA-vestigingen die niet op de koeltekaart staan zijn aangenomen zonder airco. Gelijke kosten per locatie aangenomen.`)].join("\n");
}

function bindPanel(el){
  el.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { state.tab = b.dataset.tab; state.sel = null; render(); });
  const on = (sel, f) => { const x = el.querySelector(sel); if(x) x.onclick = f; };
  on("#back", () => { state.sel = null; render(); });
  el.querySelectorAll(".row[data-s]").forEach(rw => {
    rw.onclick = e => { if(!e.target.closest("[data-add]")) select(rw.dataset.s); };
    rw.onkeydown = e => { if(e.key === "Enter"){ e.preventDefault(); select(rw.dataset.s); } };
    rw.onmouseenter = () => { state.hover = rw.dataset.s; drawGrid(); drawOverlay(); };
    rw.onmouseleave = () => { state.hover = null; drawGrid(); drawOverlay(); };
  });
  el.querySelectorAll("[data-add]").forEach(b => b.onclick = e => { e.stopPropagation(); const id = b.dataset.add;
    state.plan = inPlan(id) ? state.plan.filter(x => x !== id) : [...state.plan, id]; state.hover = null; save(); render(); });
  el.querySelectorAll("[data-open]").forEach(b => b.onclick = () => select(b.dataset.open));
  el.querySelectorAll("[data-ac]").forEach(cb => cb.onchange = () => { const s = SITE.get(cb.dataset.ac);
    if(cb.checked === acDefault(s)) delete state.acSet[s.id]; else state.acSet[s.id] = cb.checked; prunePlan(); save(); render(); });
  el.querySelectorAll("[data-ex]").forEach(cb => cb.onchange = () => {
    cb.checked ? state.excl.add(cb.dataset.ex) : state.excl.delete(cb.dataset.ex); prunePlan(); save(); render(); });
  const osm = el.querySelector("#osm"); if(osm) osm.onchange = () => { state.osm = osm.checked; prunePlan(); save(); render(); };
  const sort = el.querySelector("#sort"); if(sort) sort.onchange = () => { state.sort = sort.value; save(); render(); };
  on("#reset", () => { state.acSet = {}; state.excl.clear(); prunePlan(); save(); render(); });
  on("#nminus", () => { state.autoN = Math.max(1, state.autoN - 1); save(); render(); });
  on("#nplus", () => { state.autoN = Math.min(40, state.autoN + 1); save(); render(); });
  on("#auto", () => { autoPick(state.autoN); save(); render(); });
  on("#clear", () => { state.plan = []; save(); render(); });
  on("#copy", async () => { const txt = summaryMarkdown(), m = el.querySelector("#copied");
    try { await navigator.clipboard.writeText(txt); m.textContent = t("Copied", "Gekopieerd"); }
    catch(e) { const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); m.textContent = t("Copied", "Gekopieerd"); } catch(_) { m.textContent = t("Copy failed", "Kopiëren mislukt"); } ta.remove(); } });
}
function select(id){ state.sel = id; state.hover = null; tip.style.opacity = 0; render(); }

/* ---- header -------------------------------------------------------------------------------- */
const THR_MARKS = [300, 500, 750, 1000, 1500];
function toolbar(){
  document.getElementById("thrv").textContent = km(state.thr);
  const el = document.getElementById("ticks");
  el.innerHTML = THR_MARKS.map(v => `<button type="button" data-t="${v}" style="left:${((v-200)/1300*100).toFixed(2)}%"
    aria-current="${state.thr === v}" aria-label="${km(v)}">${v >= 1000 ? (v/1000).toLocaleString(LOC()) + "k" : v}</button>`).join("");
  el.querySelectorAll("button").forEach(b => b.onclick = () => setThr(+b.dataset.t));
  document.querySelectorAll("[data-kind]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.kind === state.kind)));
  staticText();
}
/* The text that lives in markup.html, set here so it follows the language. */
function staticText(){
  const $ = q => document.querySelector(q), set = (q, v) => { const e = $(q); if(e) e.textContent = v; };
  const lab = (q, v) => { const e = $(q); if(e){ e.setAttribute("aria-label", v); e.title = v; } };
  document.documentElement.lang = LANG;
  set(".top h1", t("Koelteplekken network - AC", "Koelteplekkennetwerk - airco"));
  $(".top p").innerHTML = t("Buurthuizen and OBA branches by walking distance", "Buurthuizen en OBA-vestigingen op loopafstand")
    + ` · <a href="../">${t("Coverage", "Dekking")}</a>`;
  set('label[for="thr"]', t("Walking distance", "Loopafstand"));
  set(".segrow .ranklabel", t("Fund", "Financieren"));
  $('.seg[aria-label]').setAttribute("aria-label", t("Site type", "Type locatie"));
  set('[data-kind="all"]', KINDS.all.t()); set('[data-kind="oba"]', t("OBAs", "OBA's")); set('[data-kind="buurt"]', "Buurthuizen");
  $("#kpis").setAttribute("aria-label", t("Summary", "Samenvatting"));
  $(".zoomctl").setAttribute("aria-label", t("Map zoom", "Kaartzoom"));
  lab("#zin", t("Zoom in", "Inzoomen")); lab("#zout", t("Zoom out", "Uitzoomen")); lab("#zfit", t("Show the whole city", "Hele stad tonen"));
  const lb = $("#lang"); lb.textContent = t("NL", "EN"); lab("#lang", t("Nederlands", "English"));
  document.getElementById("foot").innerHTML = `<p>${t(
    "Residents: CBS 100 m grid, 2025 · Venues: © OpenStreetMap contributors · AC status: koeltekaartamsterdam.nl, with corrections · Frail health: Klimaateffectatlas (CC BY 4.0)",
    "Inwoners: CBS 100m-raster, 2025 · Locaties: © OpenStreetMap-bijdragers · Airco-status: koeltekaartamsterdam.nl, met correcties · Kwetsbare gezondheid: Klimaateffectatlas (CC BY 4.0)")}</p>`;
}
function setThr(v){ state.thr = v; document.getElementById("thr").value = v; render(); }
function render(){ palette(); drawGrid(); drawOverlay(); legend(); kpis(); inspector(); toolbar(); }

/* ---- wiring -------------------------------------------------------------------------------- */
const thrIn = document.getElementById("thr");
thrIn.value = state.thr; thrIn.addEventListener("input", () => setThr(+thrIn.value));
document.querySelectorAll("[data-kind]").forEach(b => b.onclick = () => { state.kind = b.dataset.kind; prunePlan(); save(); render(); });
addEventListener("keydown", e => { if(e.key === "Escape" && state.sel){ state.sel = null; render(); } });

let zf = 0;
function redrawMap(){ if(zf) return; zf = requestAnimationFrame(() => { zf = 0; applyView(); drawGrid(); drawOverlay(); }); }
function zoomAt(f, mx = W/2, my = H/2){
  const wx = ox + mx/sc, wy = oy - my/sc;
  view.z = Math.min(ZMAX, Math.max(1, view.z * f));
  const s1 = base.sc * view.z;
  view.cx = wx - mx/s1 + W/2/s1; view.cy = wy + my/s1 - H/2/s1;
  tip.style.opacity = 0; redrawMap();
}
const mapbox = document.getElementById("mapbox");
mapbox.addEventListener("wheel", e => {
  if(e.target.closest(".maplegend,.zoomctl")) return;
  if(!FIT.matches && !e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  const b = cv.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.04 : 0.0015)), e.clientX - b.left, e.clientY - b.top);
}, {passive:false});
let drag = null;
cv.addEventListener("pointerdown", e => { if(e.button !== 0 || view.z <= 1) return;
  drag = {x:e.clientX, y:e.clientY, cx:view.cx, cy:view.cy, id:e.pointerId}; cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing"; });
addEventListener("pointermove", e => { if(!drag || e.pointerId !== drag.id) return;
  view.cx = drag.cx - (e.clientX - drag.x)/sc; view.cy = drag.cy + (e.clientY - drag.y)/sc; redrawMap(); });
const endDrag = () => { if(drag){ drag = null; cv.style.cursor = ""; } };
addEventListener("pointerup", endDrag); addEventListener("pointercancel", endDrag);
document.getElementById("zin").onclick = () => zoomAt(2);
document.getElementById("zout").onclick = () => zoomAt(.5);
document.getElementById("zfit").onclick = () => { view.z = 1; view.cx = view.cy = null; redrawMap(); };

const themeBtn = document.getElementById("theme");
const isDark = () => { const m = document.documentElement.getAttribute("data-theme");
  return m ? m === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };
function applyTheme(mode){
  if(mode) document.documentElement.setAttribute("data-theme", mode); else document.documentElement.removeAttribute("data-theme");
  themeBtn.innerHTML = isDark() ? ICON.sun : ICON.moon;
  themeBtn.setAttribute("aria-label", isDark() ? t("Switch to light theme", "Naar licht thema") : t("Switch to dark theme", "Naar donker thema"));
  render();
}
themeBtn.onclick = () => applyTheme(isDark() ? "light" : "dark");
/* Switching language keeps everything else; the URL follows so the link can be shared. */
document.getElementById("lang").onclick = () => {
  LANG = LANG === "nl" ? "en" : "nl";
  try { localStorage.setItem(LANG_KEY, LANG); } catch(e) {}
  try { const u = new URL(location.href); u.searchParams.set("lang", LANG); history.replaceState(null, "", u); } catch(e) {}
  applyTheme(document.documentElement.getAttribute("data-theme"));
};

prunePlan();
fit(); applyTheme(null);
requestAnimationFrame(() => { fit(); render(); });
let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { fit(); render(); }, 120); });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if(!document.documentElement.getAttribute("data-theme")) applyTheme(null); });
