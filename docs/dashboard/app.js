
const T = D.totals, G = D.grid, N = G.x.length, BU = D.buurten, VEN = D.venues;
/* Catchments ship packed (see notebook section 19): candidate k owns off[k]..off[k+1] of a
   uint16 array of grid indices and a uint8 array of walks in tens of metres, rounded up. */
const CAND = (() => {
  const R = D.reach, bytes = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
  const cb = bytes(R.cell), cell = new Uint16Array(cb.buffer, 0, cb.length / 2), d10 = bytes(R.d10);
  return D.candidates.map((c, k) => {
    const a = R.off[k], z = R.off[k+1], d = new Uint16Array(z - a);
    for(let j = 0; j < d.length; j++) d[j] = d10[a + j] * 10;
    return {...c, cells: cell.subarray(a, z), d};
  });
})();
const DISTRICTS = [...new Set(BU.map(b => b.stadsdeel).filter(Boolean))].sort();
const KINDS = [...new Set(CAND.map(c => c.kind))].sort();
const NB = BU.length, NV = VEN.length;

/* Every organisation's catchment, packed the same way. The nearest-four distances in the grid
   count options only while those four stay put; once an existing place is removed the page
   needs to know who was fifth, so it recounts the squares that place reaches from these.
   AT inverts them (square -> organisations), SITE folds them per site (the nearer member). */
const ORGS = D.orgs ? (() => {
  const R = D.orgs, bytes = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
  const cb = bytes(R.cell), cell = new Uint16Array(cb.buffer, 0, cb.length / 2), d10 = bytes(R.d10);
  return R.site.map((site, k) => {
    const a = R.off[k], z = R.off[k+1], d = new Uint16Array(z - a);
    for(let j = 0; j < d.length; j++) d[j] = d10[a + j] * 10;
    return {site, cells: cell.subarray(a, z), d};
  });
})() : null;
const AT = ORGS && (() => {
  const off = new Int32Array(N + 1);
  for(const o of ORGS) for(const i of o.cells) off[i + 1]++;
  for(let i = 0; i < N; i++) off[i + 1] += off[i];
  const at = off.slice(0, N), site = new Uint16Array(off[N]), d = new Uint16Array(off[N]);
  for(const o of ORGS) for(let j = 0; j < o.cells.length; j++){
    const p = at[o.cells[j]]++; site[p] = o.site; d[p] = o.d[j]; }
  return {off, site, d};
})();
const SITE = ORGS && Array.from({length:NV}, (_, v) => {
  const best = new Map();
  for(const o of ORGS) if(o.site === v)
    for(let j = 0; j < o.cells.length; j++){
      const i = o.cells[j], had = best.get(i);
      if(had === undefined || o.d[j] < had) best.set(i, o.d[j]);
    }
  return {cells: Int32Array.from(best.keys()), d: Uint16Array.from(best.values())};
});
/* The squares whose count can change once these sites are gone: the ones they reach. */
function touchedBy(removed){
  const out = new Set();
  for(const v of removed) for(const i of SITE[v].cells) out.add(i);
  return out;
}
/* A square recounted without the removed sites: options within thr, and the nearest site left. */
function recount(i, thr, gone){
  let n = 0, best = Infinity, site = -1;
  for(let p = AT.off[i]; p < AT.off[i + 1]; p++){
    if(gone[AT.site[p]]) continue;
    const d = AT.d[p];
    if(d <= thr) n++;
    if(d < best){ best = d; site = AT.site[p]; }
  }
  return {n, site, walk: site < 0 ? -1 : best};
}
const goneMask = removed => { const g = new Uint8Array(NV); for(const v of removed) g[v] = 1; return g; };

const fmt  = n => Math.round(n).toLocaleString("en-GB");
const pct  = v => (v*100).toFixed(1) + "%";
const signed = n => (n >= 0 ? "+" : "−") + fmt(Math.abs(n));
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : "";
const km = m => m >= 1000 ? (m/1000).toLocaleString("en-GB") + " km" : m + " m";

const ICON = {
  plus:`<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  check:`<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.3l2.6 2.6L10 3.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  close:`<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  moon:`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  sun:`<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9L13 13M3 13l1.1-1.1M11.9 4.1L13 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`
};

const TOKENS = ["--ground","--panel","--sunk","--ink","--ink-2","--ink-3","--line","--line-2",
  "--blue","--orange","--aqua","--mute","--faint","--grid-base","--plan",
  "--r1","--r2","--r3","--r4","--r5","--r6","--o1","--o2","--o3","--o4","--o5","--o6"];
let P = {};
function palette(){
  const cs = getComputedStyle(document.documentElement);
  P = {}; for(const t of TOKENS) P[t] = cs.getPropertyValue(t).trim();
  P.rampD = ["--r1","--r2","--r3","--r4","--r5","--r6"].map(t => P[t]);
  P.rampO = ["--o1","--o2","--o3","--o4","--o5","--o6"].map(t => P[t]);
  P.dimD = P.rampD.map(c => mix(c, P["--ground"], .68));
  P.dimBase = mix(P["--grid-base"], P["--ground"], .6);
}
const hex = c => { c = c.replace("#","");
  if(c.length === 3) c = c.split("").map(x => x+x).join("");
  return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)]; };
const mix = (a,b,t) => "#" + hex(a).map((v,i) =>
  Math.round(v + (hex(b)[i]-v)*t).toString(16).padStart(2,"0")).join("");

const state = {mode:"expand", thr:T.threshold, showCovered:false,
               tab:{expand:"places", protect:"venues"}, sel:null, added:[], removed:[],
               hover:null, hoverBu:null, q:"", fsd:"", fkind:"", limit:100, buLimit:10,
               rank:{places:"people", placesProtect:"secondPeople", buurten:"unserved", venues:"sole"},
               candRank:"people"};
const tab = () => state.tab[state.mode];

/* ---- the model --------------------------------------------------------- */
const cache = new Map();
const planKey = (added = state.added, removed = state.removed) => added.join(",") + "/" + removed.join(",");
function model(added = state.added, removed = state.removed){
  const key = state.thr + "|" + planKey(added, removed);
  if(cache.has(key)) return cache.get(key);
  const thr = state.thr;
  const realOpts = new Uint8Array(N), addOpts = new Uint8Array(N);
  for(let i=0;i<N;i++){
    let n = 0;
    if(G.net[i] >= 0 && G.net[i] <= thr){
      n = 1;
      if(G.d2[i] >= 0 && G.d2[i] <= thr) n++;
      if(G.d3[i] >= 0 && G.d3[i] <= thr) n++;
      if(G.d4[i] >= 0 && G.d4[i] <= thr) n++;
    }
    realOpts[i] = n;
  }
  // With nothing removed, the nearest-four path above is the notebook's own count. Removing a
  // site recounts only the squares it reaches; elsewhere nothing it did can change. A square
  // keeps its nearest site and walk unless that site is the one removed.
  let vi = G.vi, walk = G.net;
  if(removed.length){
    const gone = goneMask(removed);
    vi = Int32Array.from(G.vi); walk = Float64Array.from(G.net);
    for(const i of touchedBy(removed)){
      const r = recount(i, thr, gone);
      realOpts[i] = Math.min(r.n, 255);
      if(gone[G.vi[i]]){ vi[i] = r.site; walk[i] = r.walk; }
    }
  }
  // addBy is the plan place covering a square; where addOpts is 1 it is the only one.
  const addBy = new Int32Array(N).fill(-1);
  for(const k of added){
    const c = CAND[k];
    for(let j=0;j<c.cells.length;j++) if(c.d[j] <= thr){ addOpts[c.cells[j]]++; addBy[c.cells[j]] = k; }
  }
  const buPop = new Float64Array(NB), buOut = new Float64Array(NB),
        buOne = new Float64Array(NB), buTwo = new Float64Array(NB);
  const serves = new Float64Array(NV), sole = new Float64Array(NV), planSole = new Map();
  const byOpts = [0,0,0,0];
  let served = 0, one = 0, total = 0, base = 0;
  for(let i=0;i<N;i++){
    const p = G.pop[i], opts = realOpts[i] + addOpts[i];
    total += p;
    const b = G.bu[i]; buPop[b] += p;
    if(!opts) buOut[b] += p;
    if(realOpts[i] > 0) base += p;
    byOpts[Math.min(opts,3)] += p;
    if(!opts) continue;
    served += p;
    // Someone whose only option is a plan place relies on one place just as much as someone
    // whose only option is an existing one, so both count.
    if(opts === 1){ one += p; buOne[b] += p; }
    else if(opts > 1) buTwo[b] += p;
    if(realOpts[i] > 0){
      serves[vi[i]] += p;
      if(opts === 1) sole[vi[i]] += p;
    }else if(opts === 1){
      planSole.set(addBy[i], (planSole.get(addBy[i]) || 0) + p);
    }
  }
  let orphans = 0, inUse = 0;
  for(let v=0;v<NV;v++){ if(serves[v] > 0) inUse++; if(serves[v] > 0 && serves[v] === sole[v]) orphans++; }
  const out = {realOpts, addOpts, addBy, planSole, vi, walk, buPop, buOut, buOne, buTwo, serves, sole, served, base, one, total, orphans, inUse, byOpts};
  cache.set(key, out); return out;
}
const optsAt = (m,i) => m.realOpts[i] + m.addOpts[i];

/* What a candidate would do for one neighbourhood, derived live from its catchment. */
function effectIn(k, bu){
  const m = model(), c = CAND[k];
  let people = 0, second = 0;
  for(let j=0;j<c.cells.length;j++){
    const i = c.cells[j];
    if(c.d[j] > state.thr || G.bu[i] !== bu) continue;
    const o = optsAt(m,i);
    if(o === 0) people += G.pop[i]; else if(o === 1) second += G.pop[i];
  }
  return {people, second};
}
/* Every neighbourhood a candidate's catchment reaches, largest first. */
function servesBuurten(k){
  const m = model(), c = CAND[k], by = new Map();
  for(let j=0;j<c.cells.length;j++){
    const i = c.cells[j];
    if(c.d[j] <= state.thr && optsAt(m,i) === 0)
      by.set(G.bu[i], (by.get(G.bu[i]) || 0) + G.pop[i]);
  }
  return [...by.entries()].filter(([,p]) => p > 0).sort((a,b) => b[1]-a[1]);
}
/* What a place in the plan is holding up: people it covers that nothing else does. Its marginal
   gain is zero once it is in the plan, which is why the plan shows this instead. */
function contribution(k){
  const m = model(), c = CAND[k];
  let people = 0;
  for(let j=0;j<c.cells.length;j++){
    const i = c.cells[j];
    if(c.d[j] <= state.thr && m.realOpts[i] === 0 && m.addOpts[i] === 1) people += G.pop[i];
  }
  return people;
}
/* A place already in the plan, read like an existing one: everyone within its walk, those it alone
   reaches, and those for whom it is the second option beside one existing place. */
function held(k){
  const m = model(), c = CAND[k], soleCells = [], secondCells = [], byBu = new Map();
  let total = 0, sole = 0, second = 0;
  for(let j=0;j<c.cells.length;j++){
    if(c.d[j] > state.thr) continue;
    const i = c.cells[j], p = G.pop[i];
    total += p;
    if(m.realOpts[i] === 0 && m.addOpts[i] === 1){
      sole += p; soleCells.push(i); byBu.set(G.bu[i], (byBu.get(G.bu[i]) || 0) + p);
    }else if(m.realOpts[i] === 1 && m.addOpts[i] === 1){ second += p; secondCells.push(i); }
  }
  const bu = [...byBu.entries()].filter(([,p]) => p > 0).sort((a,b) => b[1]-a[1]);
  return {total, sole, second, soleCells, secondCells, bu};
}
function effect(k){
  const m = model(), c = CAND[k], cells = [], second = [];
  let people = 0, eld = 0, secondPeople = 0;
  for(let j=0;j<c.cells.length;j++){
    const i = c.cells[j];
    if(c.d[j] > state.thr) continue;
    const o = optsAt(m,i);
    // One new place does two jobs: it reaches people who had nothing, and it hands a second
    // option to people who had exactly one.
    if(o === 0){ cells.push(i); people += G.pop[i]; eld += G.eld[i]; }
    else if(o === 1){ second.push(i); secondPeople += G.pop[i]; }
  }
  // Each newly covered square counted in proportion to its neighbourhood's frail-health rate
  // against the city. Missing rates count as the city rate.
  let frailW = 0;
  for(const i of cells){
    const f = BU[G.bu[i]].frail;
    frailW += G.pop[i] * (f == null ? 1 : f / T.city_frail);
  }
  let total = 0;
  for(let j=0;j<c.cells.length;j++) if(c.d[j] <= state.thr) total += G.pop[c.cells[j]];
  return {cells, people, eld, frailW, second, secondPeople, total, km2: cells.length * 0.01};
}
function medianWalkUnserved(m){
  const rows = [];
  for(let i=0;i<N;i++) if(optsAt(m,i) === 0 && G.pop[i] > 0 && m.walk[i] >= 0) rows.push([m.walk[i], G.pop[i]]);
  if(!rows.length) return 0;
  rows.sort((a,b) => a[0]-b[0]);
  const half = rows.reduce((a,r) => a + r[1], 0)/2;
  let run = 0;
  for(const [d,p] of rows){ run += p; if(run >= half) return d; }
  return rows[rows.length-1][0];
}

/* City baselines the payload does not carry, population-weighted from the grid. */
const CITY = (() => {
  let pw = 0, pp = 0, ww = 0, wp = 0;
  for(let i=0;i<N;i++){
    if(G.pet[i] != null){ pw += G.pet[i]*G.pop[i]; pp += G.pop[i]; }
    if(G.net[i] >= 0){ ww += G.net[i]*G.pop[i]; wp += G.pop[i]; }
  }
  return {pet: pw/pp, walk: ww/wp};
})();

/* ---- robustness across thresholds -------------------------------------- */
/* Decision 9 refuses to pick one threshold. The area under the value-against-distance curve,
   divided by the span, is the average across every walk from 300 m to 1,500 m. Trapezoidal,
   because the thresholds are not evenly spaced. */
const ROBUST_T = [300,500,750,1000,1500];
function trapz(per){
  let a = 0;
  for(let i=0;i<ROBUST_T.length-1;i++){
    const t0 = ROBUST_T[i], t1 = ROBUST_T[i+1];
    a += ((per[t0] ?? 0) + (per[t1] ?? 0)) / 2 * (t1 - t0);
  }
  return a / (ROBUST_T[ROBUST_T.length-1] - ROBUST_T[0]);
}
function coveredAt(thr){
  const cov = new Uint8Array(N);
  for(let i=0;i<N;i++) if(G.net[i] >= 0 && G.net[i] <= thr) cov[i] = 1;
  if(state.removed.length){
    const gone = goneMask(state.removed);
    for(const i of touchedBy(state.removed)) cov[i] = recount(i, thr, gone).n > 0 ? 1 : 0;
  }
  for(const k of state.added){
    const c = CAND[k];
    for(let j=0;j<c.cells.length;j++) if(c.d[j] <= thr) cov[c.cells[j]] = 1;
  }
  return cov;
}
let _robBu = null;
function robustBu(){
  const key = planKey();
  if(_robBu && _robBu.key === key) return _robBu.v;
  const per = Array.from({length:NB}, () => ({}));
  for(const t of ROBUST_T){
    const cov = coveredAt(t), out = new Float64Array(NB);
    for(let i=0;i<N;i++) if(!cov[i]) out[G.bu[i]] += G.pop[i];
    out.forEach((v,k) => { per[k][t] = v; });
  }
  const v = {per, auc: per.map(p => trapz(p))};
  _robBu = {key, v};
  return v;
}
let _rob = null;
function robust(){
  const key = planKey();
  if(_rob && _rob.key === key) return _rob.v;
  const per = CAND.map(() => ({}));
  for(const t of ROBUST_T){
    const cov = coveredAt(t);
    CAND.forEach((c,k) => {
      let p = 0;
      for(let j=0;j<c.cells.length;j++) if(c.d[j] <= t && !cov[c.cells[j]]) p += G.pop[c.cells[j]];
      per[k][t] = p;
    });
  }
  const v = {per, auc: per.map(p => trapz(p))};
  _rob = {key, v};
  return v;
}

/* ---- rows and measures ------------------------------------------------- */
let _pr = null;
function placeRows(){
  const key = state.thr + "|" + planKey();
  if(_pr && _pr.key === key) return _pr.v;
  const rb = robust();
  const v = CAND.map((c,k) => {
    const e = effect(k);
    return {key:"p"+k, id:k, kind:"p", name:c.name,
      sub:[cap(c.kind), c.where || c.stadsdeel].filter(Boolean).join(" · "),
      people:e.people, eld:e.eld, frailW:e.frailW, secondPeople:e.secondPeople, total:e.total,
      km2:e.km2, robust:rb.auc[k], perT:rb.per[k], stadsdeel:c.stadsdeel, vkind:c.kind};
  });
  _pr = {key, v};
  return v;
}
function buurtRows(){
  const m = model(), rb = robustBu();
  return BU.map((b,i) => ({...b, key:"b"+i, id:i, kind:"bu", sub:b.stadsdeel,
    unserved:m.buOut[i], livePop:m.buPop[i], robustBu:rb.auc[i], perT:rb.per[i]}));
}
function venueRows(){
  const m = model();
  return VEN.map((v,i) => ({...v, key:"v"+i, id:i, kind:"v",
    sub: v.sunday ? "" : "Closed on Sundays",
    serves:m.serves[i], sole:m.sole[i], backed:m.serves[i]-m.sole[i]}));
}
const M = {
  unserved:{t:"Beyond reach", g:r=>r.unserved, f:fmt},
  robustBu:{t:"Beyond reach, 300–1,500 m average", g:r=>r.robustBu, f:fmt},
  residents:{t:"Residents", g:r=>r.residents, f:fmt},
  eld_share:{t:"Aged 65+", g:r=>r.eld_share*100, f:v=>v.toFixed(1)+"%", city:()=>T.city_eld*100, worse:"high"},
  frail:{t:"Frail health", g:r=>r.frail, f:v=>v.toFixed(1)+"%", city:()=>T.city_frail, worse:"high"},
  lonely:{t:"Severely lonely", g:r=>r.lonely, f:v=>v.toFixed(1)+"%", city:()=>T.city_lonely, worse:"high"},
  tojuli:{t:"Indoor overheating", g:r=>r.tojuli, f:v=>v.toFixed(2), city:()=>T.city_tojuli, worse:"high"},
  pet:{t:"Outdoor heat (PET)", g:r=>r.pet, f:v=>v.toFixed(1)+"°", city:()=>CITY.pet, worse:"high"},
  canopy:{t:"Tree canopy", g:r=>r.canopy*100, f:v=>v.toFixed(1)+"%", city:()=>T.city_canopy*100, worse:"low"},
  mean_m:{t:"Mean walk", g:r=>r.mean_m, f:v=>fmt(v)+" m", city:()=>CITY.walk, worse:"high", df:v=>fmt(v)},
  people:{t:"Newly reached", g:r=>r.people, f:fmt},
  totalReach:{t:"Everyone in reach", g:r=>r.total, f:fmt},
  robust:{t:"Newly reached, 300–1,500 m average", g:r=>r.robust, f:fmt},
  eldReached:{t:"Newly reached, aged 65+", g:r=>r.eld, f:fmt},
  frailW:{t:"Newly reached, frailty-weighted", g:r=>r.frailW, f:fmt},
  secondPeople:{t:"Gain a second option", g:r=>r.secondPeople, f:fmt},
  serves:{t:"Residents served", g:r=>r.serves, f:fmt},
  sole:{t:"No alternative", g:r=>r.sole, f:fmt},
  backed:{t:"Have an alternative", g:r=>r.backed, f:fmt}
};
const RANKS = {places:["people","robust","frailW","eldReached","secondPeople","totalReach"],
               placesProtect:["secondPeople","people","totalReach"],
               buurten:["unserved","robustBu","residents","eld_share","frail","tojuli","mean_m"],
               venues:["sole","serves","backed"]};
const rankBucket = () => tab() === "places" && state.mode === "protect" ? "placesProtect" : tab();
const COMPARE = ["eld_share","frail","lonely","tojuli","pet","canopy","mean_m"];
const TABS = {expand:[["places","Candidates"],["buurten","Neighbourhoods"],["plan","Plan"]],
              protect:[["venues","Existing places"],["places","Candidates"],["plan","Plan"]]};
const LIST_NOUN = {places:["candidate","candidates"], buurten:["neighbourhood","neighbourhoods"],
                   venues:["place","places"]};

/* ---- map --------------------------------------------------------------- */
const cv = document.getElementById("cv"), ov = document.getElementById("ov"),
      ctx = cv.getContext("2d"), tip = document.getElementById("tip");
const PAD = 250;
let W = 900, H = 600, sc = 1, ox = 0, oy = 0;
/* fit() frames the whole city; the view zooms into that frame. z is the zoom factor and cx, cy
   the world point at the centre of the box, null meaning the city's centre. */
let base = {sc:1, ox:0, oy:0};
const view = {z:1, cx:null, cy:null};
const ZMAX = 8;
/* Same query as the stylesheet's fit-the-window block. There the box has a height of its own and
   the city is fitted inside it, centred; elsewhere the box takes its height from the city. */
const FIT = matchMedia("(min-width:1101px) and (min-height:640px)");
function fit(){
  const box = document.getElementById("mapbox").getBoundingClientRect();
  W = Math.max(320, Math.round(box.width));
  const [x0,y0,x1,y1] = D.bbox;
  const w = (x1-x0) + PAD*2, h = (y1-y0) + PAD*2;
  if(FIT.matches){
    H = Math.max(240, Math.round(box.height));
    const s0 = Math.min(W / w, H / h);
    base = {sc:s0, ox:x0 - PAD - (W/s0 - w)/2, oy:y1 + PAD + (H/s0 - h)/2};
  }else{
    H = Math.round(W * h / w);
    base = {sc:W / w, ox:x0 - PAD, oy:y1 + PAD};
  }
  applyView();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W*dpr; cv.height = H*dpr; cv.style.height = H + "px";
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ov.setAttribute("viewBox", `0 0 ${W} ${H}`); ov.style.height = H + "px";
}
/* The centre is held inside the whole-city frame, so the city can never be panned out of sight. */
function applyView(){
  view.z = Math.min(ZMAX, Math.max(1, view.z));
  sc = base.sc * view.z;
  const fx0 = base.ox, fx1 = base.ox + W/base.sc, fy1 = base.oy, fy0 = base.oy - H/base.sc;
  const hw = W/2/sc, hh = H/2/sc;
  const cx = view.cx ?? (fx0 + fx1)/2, cy = view.cy ?? (fy0 + fy1)/2;
  view.cx = Math.min(fx1 - hw, Math.max(fx0 + hw, cx));
  view.cy = Math.min(fy1 - hh, Math.max(fy0 + hh, cy));
  if(view.z === 1){ view.cx = (fx0 + fx1)/2; view.cy = (fy0 + fy1)/2; }
  ox = view.cx - hw; oy = view.cy + hh;
  cv.style.touchAction = view.z > 1 ? "none" : "";
  // Whole city: markers at the edge may overhang the box. Zoomed: clip what is off the map.
  ov.style.overflow = view.z > 1 ? "hidden" : "visible";
  const zin = document.getElementById("zin"), zout = document.getElementById("zout"), zfit = document.getElementById("zfit");
  if(zin){ zin.disabled = view.z >= ZMAX; zout.disabled = zfit.disabled = view.z <= 1; }
}
const px = x => (x - ox) * sc, py = y => (oy - y) * sc;
const RELY_BANDS = [250,750,1500,3000,5000];
/* The gap is shaded by residents per square, not by distance: among unserved squares the two
   correlate at -0.211, so distance shading made the emptiest squares the darkest. Breaks are
   quantiles of unserved-square population. */
const POP_BANDS = [50, 90, 140, 205, 275];
const band = (v,b) => { let i = 0; while(i < b.length && v > b[i]) i++; return i; };

function drawGrid(){
  ctx.clearRect(0,0,W,H);
  const s = Math.max(1.15, 100*sc), m = model();
  const prev = state.hover != null || !!(state.sel && state.sel.kind === "p");
  const ground = mix(P["--grid-base"], P["--ground"], .55);

  for(let i=0;i<N;i++){
    const opts = optsAt(m,i), real = m.realOpts[i];
    let col;
    if(state.mode === "protect"){
      // Shaded by how many residents rely on that one place alone, whether it exists or is planned.
      col = opts !== 1 ? P.dimBase
        : P.rampO[band(real ? m.sole[m.vi[i]] : m.planSole.get(m.addBy[i]), RELY_BANDS)];
    }else if(opts === 0){
      col = P.rampD[band(G.pop[i], POP_BANDS)];
    }else if(real === 0){
      col = ground;                       // covered only by the plan; painted below
    }else{
      col = state.showCovered ? P.dimD[band(G.pop[i], POP_BANDS)] : ground;
    }
    ctx.fillStyle = col;
    ctx.fillRect(px(G.x[i]) - s/2, py(G.y[i]) - s/2, s, s);
  }

  const paint = (cells, colour, alpha) => {
    ctx.fillStyle = colour; ctx.globalAlpha = alpha;
    for(const i of cells) ctx.fillRect(px(G.x[i]) - s/2, py(G.y[i]) - s/2, s, s);
    ctx.globalAlpha = 1;
  };
  // Closed by the plan: visible as progress, quieter than the gap that remains.
  if(state.added.length && state.mode === "expand"){
    const done = [];
    for(let i=0;i<N;i++) if(m.realOpts[i] === 0 && m.addOpts[i] > 0) done.push(i);
    paint(done, P["--plan"], prev ? .25 : .6);
  }
  // Reduce reliance: residents who had exactly one place and now have a second, from the plan.
  if(state.added.length && state.mode === "protect"){
    const backed = [];
    for(let i=0;i<N;i++) if(m.realOpts[i] === 1 && m.addOpts[i] > 0) backed.push(i);
    paint(backed, P["--aqua"], prev ? .3 : .75);
  }
  const target = state.hover != null ? state.hover
    : (state.sel && state.sel.kind === "p" ? state.sel.id : null);
  if(target != null){
    if(state.added.includes(target)){
      const h = held(target);
      paint(h.secondCells, P["--aqua"], .8);
      paint(h.soleCells, P["--plan"], .95);
    }else{
      const e = effect(target);
      paint(e.second, P["--aqua"], .8);
      paint(e.cells, P["--plan"], .95);
    }
  }
  if(state.sel && state.sel.kind === "v"){
    const hit = [];
    for(let i=0;i<N;i++) if(m.vi[i] === state.sel.id && optsAt(m,i) === 1 && m.realOpts[i] === 1) hit.push(i);
    paint(hit, P["--orange"], 1);
  }
  const buMark = state.hoverBu != null ? state.hoverBu
    : (state.sel && state.sel.kind === "bu" ? state.sel.id : null);
  if(buMark != null){
    const id = buMark, hit = [];
    for(let i=0;i<N;i++) if(G.bu[i] === id) hit.push(i);
    paint(hit, P["--ink"], .18);
    // Stroke only the outward-facing edges, so the neighbourhood reads as one shape.
    const inSame = (x,y) => { const j = index.get(key(x,y)); return j !== undefined && G.bu[j] === id; };
    ctx.strokeStyle = P["--ink"]; ctx.lineWidth = 2; ctx.beginPath();
    for(const i of hit){
      const x = G.x[i], y = G.y[i];
      const l = px(x) - s/2, t = py(y) - s/2, r = l + s, bm = t + s;
      if(!inSame(x, y+100)){ ctx.moveTo(l,t); ctx.lineTo(r,t); }
      if(!inSame(x, y-100)){ ctx.moveTo(l,bm); ctx.lineTo(r,bm); }
      if(!inSame(x-100, y)){ ctx.moveTo(l,t); ctx.lineTo(l,bm); }
      if(!inSame(x+100, y)){ ctx.moveTo(r,t); ctx.lineTo(r,bm); }
    }
    ctx.stroke();
  }
}

const svgPath = rings =>
  rings.map(r => "M" + r.map(p => px(p[0]).toFixed(1)+" "+py(p[1]).toFixed(1)).join("L") + "Z").join(" ");

function drawOverlay(){
  const parts = [`<path d="${svgPath(D.city)}" fill="none" stroke="${P["--line"]}" stroke-width="1"/>`];
  const m = model();
  for(let i=0;i<NV;i++){
    const v = VEN[i];
    const on = state.sel && state.sel.kind === "v" && state.sel.id === i;
    if(state.removed.includes(i)){
      // Still on the map, hollow, so it can be found and restored.
      parts.push(`<circle class="venue" data-v="${i}" cx="${px(v.x).toFixed(1)}" cy="${py(v.y).toFixed(1)}"
        r="${on ? 5 : 3.6}" fill="${P["--panel"]}" stroke="${P["--ink-2"]}" stroke-width="1.3"
        stroke-dasharray="2 1.6" style="cursor:pointer"/>`);
      continue;
    }
    const r = state.mode === "protect" ? 2 + Math.sqrt(Math.max(m.sole[i],1))/26 : 2.2;
    parts.push(`<circle class="venue" data-v="${i}" cx="${px(v.x).toFixed(1)}" cy="${py(v.y).toFixed(1)}"
      r="${(on ? r + 1.5 : r).toFixed(1)}" fill="${P["--ink"]}" stroke="${on ? P["--ink"] : P["--panel"]}"
      stroke-width="${on ? 0 : .8}" style="cursor:pointer"/>`);
    if(on) parts.push(`<circle cx="${px(v.x).toFixed(1)}" cy="${py(v.y).toFixed(1)}" r="${(r + 5).toFixed(1)}"
      fill="none" stroke="${P["--ink"]}" stroke-width="1.5"/>`);
  }
  const shown = new Set(state.added);
  if(state.sel && state.sel.kind === "p") shown.add(state.sel.id);
  if(state.hover != null) shown.add(state.hover);
  for(const k of shown){
    const c = CAND[k], on = state.added.includes(k), hot = state.hover === k;
    const r = hot ? 6 : on ? 5 : 4.5;
    parts.push(`<circle class="cand" data-c="${k}" cx="${px(c.x).toFixed(1)}"
      cy="${py(c.y).toFixed(1)}" r="${r}"
      fill="${on ? P["--plan"] : "none"}"
      stroke="${on ? P["--panel"] : P["--plan"]}" stroke-width="${hot ? 2.4 : 1.8}"
      style="cursor:pointer"/>`);
  }
  ov.innerHTML = parts.join("");
  bindMap();
}

function render(){
  palette(); drawGrid(); drawOverlay(); legend(); kpis(); inspector(); preview(); toolbar();
  document.querySelectorAll("[data-mode]").forEach(b =>
    b.setAttribute("aria-selected", String(b.dataset.mode === state.mode)));
}

function legend(){
  const el = document.getElementById("legend");
  const scale = (title, cols, marks, lead, tail) => `<div class="scale">
      <div class="st">${title}</div>
      <div class="ramp">${cols.map(c => `<i style="background:${c}"></i>`).join("")}</div>
      <div class="scalek"><span>${lead}</span>${marks.map(x => `<span>${fmt(x)}</span>`).join("")}<span>${tail}</span></div></div>`;
  const key = (sw, label) => `<span class="lg">${sw}${label}</span>`;
  const dot = key(`<span class="sw dot" style="background:${P["--ink"]}"></span>`, "Cooling place")
    + (state.removed.length ? key(`<span class="sw dot" style="border:1.3px dashed ${P["--ink-2"]}"></span>`, "Removed") : "");
  if(state.mode === "protect"){
    el.innerHTML = scale("Residents relying on one place", P.rampO, RELY_BANDS.slice(0,4), "1", "5,000+")
      + `<div class="keys">${dot}
        ${key(`<span class="sw ring" style="border-color:${P["--plan"]}"></span>`, "Candidate")}
        ${state.added.length ? key(`<span class="sw" style="background:${mix(P["--aqua"], P["--panel"], .25)}"></span>`, "Second option from plan") : ""}
      </div>`;
  }else{
    el.innerHTML = scale("Uncovered residents per 100 m square", P.rampD, POP_BANDS.slice(0,4), "1", "275+")
      + `<div class="keys">${dot}
        ${key(`<span class="sw ring" style="border-color:${P["--plan"]}"></span>`, "Candidate")}
        ${state.added.length ? key(`<span class="sw" style="background:${mix(P["--plan"], P["--panel"], .4)}"></span>`, "Covered by plan") : ""}
      </div>`;
  }
}

/* ---- summary ------------------------------------------------------------ */
function kpis(){
  const m = model(), b = model([], []), has = planSize() > 0;
  const tile = (label, value, delta, sub) => `<div class="kpi"><div class="kl">${label}</div>
    <div class="kv">${value}${has && delta ? `<span class="kd">${delta}</span>` : ""}</div>
    ${sub ? `<div class="ks">${sub}</div>` : ""}</div>`;
  const d = (a, z) => a === z ? "" : signed(a - z);
  const tiles = state.mode === "expand" ? [
    tile(`No cooling place within ${km(state.thr)}`, fmt(m.total - m.served),
      d(m.total - m.served, b.total - b.served), `of ${fmt(m.total)} residents`),
    tile("Residents covered", pct(m.served/m.total),
      m.served === b.served ? "" : `${m.served > b.served ? "+" : "−"}${(Math.abs(m.served - b.served)/m.total*100).toFixed(1)} pts`),
    tile("Median walk for the uncovered", fmt(medianWalkUnserved(m)) + " m")
  ] : [
    tile("Rely on a single place", fmt(m.one), d(m.one, b.one), `within ${km(state.thr)}`),
    tile("Have two or more places", fmt(m.byOpts[2] + m.byOpts[3]),
      d(m.byOpts[2] + m.byOpts[3], b.byOpts[2] + b.byOpts[3]), `within ${km(state.thr)}`),
    tile("Sites without redundancy", `${m.orphans} of ${m.inUse}`, "", "No resident served has an alternative")
  ];
  const n = state.added.length, r = state.removed.length;
  tiles.push(`<button type="button" class="kpi" id="kpiplan"><div class="kl">Plan</div>
    <div class="kv">${r ? (n ? `+${n} <span class="kvs">·</span> ` : "") + `−${r}` : `${n} ${n === 1 ? "place" : "places"}`}</div>
    <div class="ks">${r ? `${n} added, ${r} removed` : n ? `${n} added` : "No changes"}</div></button>`);
  const el = document.getElementById("kpis");
  el.innerHTML = tiles.join("");
  document.getElementById("kpiplan").onclick = () => {
    state.tab[state.mode] = "plan"; state.sel = null; render(); };
}

/* ---- side panel -------------------------------------------------------- */
const planSize = () => state.added.length + state.removed.length;
function inspector(){
  const el = document.getElementById("inspector");
  el.style.setProperty("--accent", state.mode === "protect" ? P["--orange"] : P["--blue"]);
  const tabs = `<div class="tabs" role="tablist">${TABS[state.mode].map(([k, label]) =>
    `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab() === k}">${label}${
      k === "plan" && planSize() ? `<span class="badge">${planSize()}</span>` : ""}</button>`).join("")}</div>`;
  el.innerHTML = tabs + (state.sel ? detailHTML() : tab() === "plan" ? planHTML() : listHTML());
  bindInspector();
  if(!state.sel && tab() !== "plan") fillList();
  chart();
}

function sortedRows(){
  const t = tab();
  const data = t === "places" ? placeRows() : t === "buurten" ? buurtRows() : venueRows();
  const set = RANKS[rankBucket()];
  const rk = set.includes(state.rank[rankBucket()]) ? state.rank[rankBucket()] : set[0];
  state.rank[rankBucket()] = rk;
  const mm = M[rk];
  const sorted = data.filter(r => !(r.kind === "p" && state.added.includes(r.id))
      && !(r.kind === "v" && state.removed.includes(r.id))).sort((a,b) => {
    const va = mm.g(a), vb = mm.g(b);
    const na = va == null || !isFinite(va), nb = vb == null || !isFinite(vb);
    if(na || nb) return na && nb ? 0 : na ? 1 : -1;
    return vb - va;
  });
  return {sorted, rk, mm, set};
}
const opts = (all, cur, none) => `<option value="">${none}</option>` + all.map(v =>
  `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(cap(v))}</option>`).join("");
function listHTML(){
  const {rk, set} = sortedRows(), t = tab();
  return `<div class="filters">
      <input class="search" id="q" type="search" placeholder="Search" aria-label="Search by name"
        value="${esc(state.q)}" autocomplete="off">
      ${t !== "venues" ? `<select id="fsd" aria-label="District">${opts(DISTRICTS, state.fsd, "All districts")}</select>` : ""}
      ${t === "places" ? `<select id="fkind" aria-label="Venue type">${opts(KINDS, state.fkind, "All types")}</select>` : ""}
    </div>
    <div class="listhead"><span id="listcount"></span>
      <label class="sortby">Sort by <select id="rank">${set.map(k =>
        `<option value="${k}"${rk === k ? " selected" : ""}>${M[k].t}</option>`).join("")}</select></label></div>
    <div class="scroll" id="listbody"></div>`;
}
function rowHTML(r, v, top, f, lead){
  const ok = v != null && isFinite(v);
  return `<div class="row" data-k="${r.key}" tabindex="0" role="button">
    ${lead}
    <div><div class="rn">${esc(r.name)}</div>${r.sub ? `<div class="rm">${esc(r.sub)}</div>` : ""}</div>
    <div><div class="rv">${ok ? f(v) : "—"}</div>
      <div class="rb"><i style="width:${ok && top ? Math.max(0, v/top*100).toFixed(1) : 0}%"></i></div></div>
  </div>`;
}
const addBtn = (k, extra = "") => { const on = state.added.includes(k);
  return `<button type="button" class="addbtn${on ? " on" : ""}" data-add="${k}" aria-pressed="${on}"
    aria-label="${on ? "Remove from plan" : "Add to plan"}" title="${on ? "Remove from plan" : "Add to plan"}"${extra}>${on ? ICON.check : ICON.plus}</button>`; };

/* Only the list body re-renders while typing, so the search box keeps focus. */
function fillList(){
  const body = document.getElementById("listbody");
  if(!body) return;
  const {sorted, mm} = sortedRows();
  const top = Math.max(...sorted.map(r => mm.g(r)).filter(v => v != null && isFinite(v)), 1);
  const q = state.q.trim().toLowerCase();
  const shown = sorted.map((r, i) => [r, i + 1]).filter(([r]) =>
    (!q || (r.name + " " + (r.sub || "")).toLowerCase().includes(q))
    && (!state.fsd || r.stadsdeel === state.fsd)
    && (!state.fkind || r.vkind === state.fkind));
  const noun = LIST_NOUN[tab()], page = shown.slice(0, state.limit), rest = shown.length - page.length;
  document.getElementById("listcount").textContent =
    `${fmt(shown.length)} ${shown.length === 1 ? noun[0] : noun[1]}`;
  body.innerHTML = shown.length ? page.map(([r, i]) => rowHTML(r, mm.g(r), top, mm.f,
      r.kind === "p" ? addBtn(r.id) : `<span class="rk">${i}</span>`)).join("")
      + (rest ? `<button type="button" class="showmore" id="more">Show ${Math.min(100, rest)} more · ${fmt(rest)} left</button>` : "")
    : `<p class="empty">No matches.</p>`;
  const more = document.getElementById("more");
  if(more) more.onclick = () => { state.limit += 100; fillList(); };
  bindRows(body);
}

function compareRow(mk, r){
  const m = M[mk], v = m.g(r);
  if(v == null || !isFinite(v)) return "";
  const vals = BU.map(b => m.g(b)).filter(x => x != null && isFinite(x));
  const lo = Math.min(0, ...vals), hi = Math.max(...vals);
  const city = m.city();
  const w = x => hi > lo ? ((x - lo)/(hi - lo)*100).toFixed(1) : 0;
  const diff = v - city, worse = m.worse === "high" ? diff > 0 : diff < 0;
  const dv = m.df ? m.df(Math.abs(diff)) : Math.abs(diff).toFixed(1);
  return `<div class="cmprow"><span class="l" title="${m.t}">${m.t}</span>
    <span class="track"><i class="f" style="width:${w(v)}%"></i><i class="c" style="left:${w(city)}%"></i></span>
    <span class="v">${m.f(v)}</span>
    <span class="d${worse ? " worse" : ""}">${diff >= 0 ? "+" : "−"}${dv}</span></div>`;
}
function curveHTML(perT, avg, label){
  const mx = Math.max(...ROBUST_T.map(x => perT[x] ?? 0), 1);
  return `<table class="curve"><tbody>${ROBUST_T.map(t => { const v = perT[t] ?? 0;
      return `<tr${t === state.thr ? ' class="now"' : ""}><th scope="row">${km(t)}</th>
        <td class="b"><i style="width:${(v/mx*100).toFixed(1)}%"></i></td><td class="n">${fmt(v)}</td></tr>`;
    }).join("")}
    <tr class="avg"><th scope="row" colspan="2">${label}</th><td class="n">${fmt(avg)}</td></tr></tbody></table>`;
}
const kvRow = (k, v, cls = "") => `<tr${cls ? ` class="${cls}"` : ""}><td>${k}</td><td>${v}</td></tr>`;
const chartSec = title => `<div class="sec"><h3>${title}</h3>
  <svg id="chart" viewBox="0 0 380 234" role="img" aria-labelledby="chartdesc"></svg>
  <div class="chartkeys" id="chartkeys"></div></div>`;

function detailHTML(){
  const s = state.sel;
  const back = TABS[state.mode].find(([k]) => k === tab())[1];
  const backBtn = `<button class="back" type="button" id="back">← ${back}</button>`;
  let body = "";
  if(s.kind === "p" && state.added.includes(s.id)){
    // Its marginal gain is zero once it is in the plan, so it is read the way an existing place is.
    const r = placeRows()[s.id], h = held(s.id), shown = h.bu.slice(0, 6);
    body = `<h2>${esc(r.name)}</h2><div class="meta">${esc(r.sub)} · in the plan</div>
      <button type="button" class="primary on" data-add="${s.id}">Remove from plan</button>
      <div class="sec"><h3>Within ${km(state.thr)}</h3><table class="kvt"><tbody>
        ${kvRow("Residents in reach", fmt(h.total))}
        ${kvRow("Reached by no other place", fmt(h.sole), "strong")}
        ${kvRow("Second option for", fmt(h.second))}
        ${kvRow("Have other options", fmt(Math.max(h.total - h.sole - h.second, 0)))}
      </tbody></table></div>
      ${h.bu.length ? `<div class="sec"><h3>Neighbourhoods reached by no other place</h3><div class="links">${shown.map(([bu,p]) =>
        `<button type="button" class="link" data-goto="${bu}"><span>${esc(BU[bu].name)}</span><span>${fmt(p)}</span></button>`).join("")}</div>
        ${h.bu.length > shown.length ? `<div class="more">${h.bu.length - shown.length} more</div>` : ""}</div>` : ""}`;
  }else if(s.kind === "p"){
    const r = placeRows()[s.id], on = false;
    const already = Math.max(r.total - r.people - r.secondPeople, 0);
    const sb = servesBuurten(s.id), shown = sb.slice(0, 6), C = CAND[s.id], rows = placeRows();
    // If this one says no, the venues next door reach nearly the same people.
    const alts = CAND.map((c, k) => ({k, dist: Math.hypot(c.x - C.x, c.y - C.y)}))
      .filter(o => o.k !== s.id && o.dist <= 300 && !state.added.includes(o.k))
      .sort((a, b) => rows[b.k].people - rows[a.k].people).slice(0, 8);
    const altTop = Math.max(1, ...alts.map(o => rows[o.k].people));
    body = `<h2>${esc(r.name)}</h2><div class="meta">${esc(r.sub)}</div>
      <button type="button" class="primary${on ? " on" : ""}" data-add="${s.id}">${on ? "Remove from plan" : "Add to plan"}</button>
      <div class="sec"><h3>Within ${km(state.thr)}</h3><table class="kvt"><tbody>
        ${kvRow("Newly reached", fmt(r.people), "strong")}
        ${kvRow("Aged 65+", fmt(r.eld), "sub")}
        ${kvRow("Frailty-weighted", fmt(r.frailW), "sub")}
        ${kvRow("Gain a second option", fmt(r.secondPeople))}
        ${kvRow("Already have two or more", fmt(already))}
        ${kvRow("Everyone in reach", fmt(r.total))}
        ${kvRow("Area newly covered", r.km2.toFixed(2) + " km²")}
      </tbody></table></div>
      <div class="sec"><h3>Newly reached by walking distance</h3>${curveHTML(r.perT, r.robust, "Average, 300 m–1.5 km")}</div>
      ${sb.length ? `<div class="sec"><h3>Neighbourhoods reached</h3><div class="links">${shown.map(([bu,p]) =>
        `<button type="button" class="link" data-goto="${bu}"><span>${esc(BU[bu].name)}</span><span>${fmt(p)}</span></button>`).join("")}</div>
        ${sb.length > shown.length ? `<div class="more">${sb.length - shown.length} more</div>` : ""}</div>` : ""}
      ${alts.length ? `<div class="sec"><h3>Alternatives within 300 m</h3><div class="cands">${alts.map(o =>
        rowHTML({key:"p"+o.k, name:CAND[o.k].name, sub:`${cap(CAND[o.k].kind)} · ${Math.round(o.dist / 10) * 10} m away`},
          rows[o.k].people, altTop, fmt, addBtn(o.k))).join("")}</div></div>` : ""}`;
  }else if(s.kind === "bu"){
    const r = buurtRows()[s.id];
    const cov = r.livePop ? 1 - r.unserved/r.livePop : 0;
    const cr = state.candRank;
    // Scoped to this neighbourhood for both sorts: a venue's city-wide second-option gain says
    // nothing about what it does here.
    const val = o => cr === "people" ? o.e.people : o.e.second;
    const all = CAND.map((c,k) => ({k, e: effectIn(k, r.id)}))
      .filter(o => !state.added.includes(o.k) && val(o) > 0)
      .sort((a,b) => val(b) - val(a));
    const hits = all.slice(0, state.buLimit), rest = all.length - hits.length;
    const top = Math.max(1, ...hits.map(val));
    body = `<h2>${esc(r.name)}</h2>
      <div class="meta">${esc(r.stadsdeel)}</div>
      <div class="sec"><h3>Within ${km(state.thr)}</h3><table class="kvt"><tbody>
        ${kvRow("Residents", fmt(r.residents))}
        ${kvRow("Covered", `${fmt(r.livePop - r.unserved)} (${pct(cov)})`)}
        ${kvRow("Beyond reach", fmt(r.unserved), state.mode === "expand" ? "strong" : "")}
        ${kvRow("Rely on a single place", fmt(model().buOne[r.id]), state.mode === "protect" ? "strong" : "")}
      </tbody></table></div>
      <div class="sec"><h3>Compared with the city</h3><div class="cmp">
        <div class="cmphead"><span></span><span></span><span>Here</span><span>vs city</span></div>
        ${COMPARE.map(k => compareRow(k, r)).join("")}</div></div>
      <div class="sec"><h3>Beyond reach by walking distance</h3>${curveHTML(r.perT, r.robustBu, "Average, 300 m–1.5 km")}</div>
      <div class="sec"><h3>Candidates that reach it
          <span class="seg" role="group" aria-label="Sort candidates by">
            <button type="button" data-crank="people" aria-pressed="${cr === "people"}">Reach here</button>
            <button type="button" data-crank="second" aria-pressed="${cr === "second"}">Second option</button>
          </span></h3>
        ${hits.length ? `<div class="cands">${hits.map(o => {
            const n = servesBuurten(o.k).length;
            return rowHTML({key:"p"+o.k, name:CAND[o.k].name,
                sub:`${cap(CAND[o.k].kind)} · ${n > 1 ? `reaches ${n} neighbourhoods` : "reaches only this one"}`},
              val(o), top, fmt, addBtn(o.k));
          }).join("")}</div>${rest ? `<button type="button" class="showmore" id="bumore">Show ${Math.min(20, rest)} more · ${fmt(rest)} left</button>` : ""}`
          : `<p class="more">No candidate ${cr === "people" ? "newly reaches residents" : "adds a second option"} within ${km(state.thr)}.</p>`}</div>
`;
  }else{
    const rows = venueRows(), r = rows[s.id], out = state.removed.includes(s.id);
    const btn = ORGS ? `<button type="button" class="primary drop${out ? " on" : ""}" data-drop="${s.id}">${
      out ? "Restore place" : "Remove place"}</button>` : "";
    if(out){
      const b = model([], []), lost = cutOff(s.id);
      body = `<h2>${esc(r.name)}</h2><div class="meta">Cooling place · removed</div>${btn}
        <div class="sec"><h3>Within ${km(state.thr)}</h3><table class="kvt"><tbody>
          ${kvRow("Served today", fmt(b.serves[s.id]))}
          ${kvRow("No alternative today", fmt(b.sole[s.id]))}
          ${kvRow("Lose access", fmt(lost), "strong")}
        </tbody></table></div>`;
    }else{
      const rank = rows.filter(x => !state.removed.includes(x.id) && x.sole > r.sole).length + 1;
      body = `<h2>${esc(r.name)}</h2><div class="meta">Cooling place${r.sunday ? "" : " · closed on Sundays"}</div>${btn}
        <div class="sec"><h3>Within ${km(state.thr)}</h3><table class="kvt"><tbody>
          ${kvRow("Residents served", fmt(r.serves))}
          ${kvRow("No alternative", fmt(r.sole), "strong")}
          ${kvRow("Have an alternative", fmt(r.backed))}
          ${kvRow("Rank by no alternative", `${rank} of ${NV - state.removed.length}`)}
        </tbody></table></div>
        ${chartSec("Load against reliance, all places")}`;
    }
  }
  return backBtn + `<div class="scroll"><div class="detail">${body}</div></div>`;
}

/* Residents a removed place leaves with nothing: it reached them today, and nothing in the plan
   does now. Where two removed places shared someone, both count them. */
function cutOff(v){
  const m = model(), b = model([], []), S = SITE[v];
  let p = 0;
  for(let j=0;j<S.cells.length;j++){
    const i = S.cells[j];
    if(S.d[j] <= state.thr && b.realOpts[i] > 0 && optsAt(m,i) === 0) p += G.pop[i];
  }
  return p;
}
function planHTML(){
  if(!planSize()) return `<p class="empty">No changes.</p>`;
  const m = model(), b = model([], []);
  let second = 0;
  for(let i=0;i<N;i++) if(m.realOpts[i] === 1 && m.addOpts[i] > 0) second += G.pop[i];
  const A = state.added.length, R = state.removed.length;
  return `<div class="plansum"><table class="kvt"><tbody>
      ${kvRow(`Coverage within ${km(state.thr)}`, `${pct(b.served/m.total)} → ${pct(m.served/m.total)}`, "strong")}
      ${R ? kvRow("Lose access", signed(m.base - b.served)) : ""}
      ${A ? kvRow("Newly reached", signed(m.served - m.base)) : ""}
      ${A ? kvRow("Gain a second option", signed(second)) : ""}
    </tbody></table></div>
    <div class="planhead"><span>${A ? `${A} added · reached by no other` : R ? `${R} removed · lose access` : ""}</span>
      <button type="button" class="textbtn" id="clearplan">Clear all</button></div>
    <div class="scroll">${state.added.map(k => { const c = CAND[k];
      return `<div class="row" data-k="p${k}" tabindex="0" role="button">
        <button type="button" class="addbtn" data-add="${k}" aria-label="Remove from plan" title="Remove from plan">${ICON.close}</button>
        <div><div class="rn">${esc(c.name)}</div><div class="rm">${esc([cap(c.kind), c.where || c.stadsdeel].filter(Boolean).join(" · "))}</div></div>
        <div class="rv">${fmt(contribution(k))}</div></div>`; }).join("")}
      ${R && A ? `<div class="planhead sub"><span>${R} removed · lose access</span></div>` : ""}
      ${state.removed.map(v => `<div class="row out" data-k="v${v}" tabindex="0" role="button">
        <button type="button" class="addbtn" data-drop="${v}" aria-label="Restore place" title="Restore place">${ICON.close}</button>
        <div><div class="rn">${esc(VEN[v].name)}</div><div class="rm">Existing place, removed</div></div>
        <div class="rv">${signed(-cutOff(v))}</div></div>`).join("")}</div>`;
}

function bindRows(root){
  root.querySelectorAll(".row[data-k]").forEach(x => {
    const go = () => select(x.dataset.k);
    x.onclick = go;
    x.onkeydown = e => { if(e.target === x && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); go(); } };
    const k = x.dataset.k;
    if(k[0] === "b"){
      x.onmouseenter = () => { state.hoverBu = +k.slice(1); hoverRender(); };
      x.onmouseleave = () => { state.hoverBu = null; hoverRender(); };
    }
    if(k[0] === "p"){
      x.onmouseenter = () => { state.hover = +k.slice(1); hoverRender(); };
      x.onmouseleave = () => { state.hover = null; hoverRender(); };
    }
  });
  root.querySelectorAll("[data-add]").forEach(b => b.onclick = e => {
    e.stopPropagation(); toggleAdd(+b.dataset.add); });
  root.querySelectorAll("[data-drop]").forEach(b => b.onclick = e => {
    e.stopPropagation(); toggleDrop(+b.dataset.drop); });
}
function bindInspector(){
  const el = document.getElementById("inspector");
  el.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => {
    state.tab[state.mode] = b.dataset.tab; state.sel = null; state.q = ""; state.limit = 100;
    state.hover = null; render(); });
  const back = document.getElementById("back");
  if(back) back.onclick = () => { state.sel = null; state.hover = null; render(); };
  const rk = document.getElementById("rank");
  if(rk) rk.onchange = e => { state.rank[rankBucket()] = e.target.value; state.limit = 100; fillList(); };
  const q = document.getElementById("q");
  if(q) q.oninput = e => { state.q = e.target.value; state.limit = 100; fillList(); };
  for(const id of ["fsd", "fkind"]){
    const f = document.getElementById(id);
    if(f) f.onchange = e => { state[id] = e.target.value; state.limit = 100; fillList(); };
  }
  const bumore = document.getElementById("bumore");
  if(bumore) bumore.onclick = () => { state.buLimit += 20; const sc = el.querySelector(".scroll"), y = sc.scrollTop;
    render(); document.querySelector("#inspector .scroll").scrollTop = y; };
  const clear = document.getElementById("clearplan");
  if(clear) clear.onclick = () => { state.added = []; state.removed = []; render(); };
  el.querySelectorAll("[data-goto]").forEach(b => b.onclick = () => {
    if(state.mode !== "expand") state.mode = "expand";
    state.tab.expand = "buurten"; select("b" + b.dataset.goto); });
  el.querySelectorAll("[data-crank]").forEach(b => b.onclick = () => {
    state.candRank = b.dataset.crank; render(); });
  bindRows(el);
}
function select(k){
  const kind = k[0] === "b" ? "bu" : k[0];
  state.buLimit = 10;
  state.sel = {kind, id:+k.slice(1)};
  if(kind === "bu") state.tab.expand = "buurten";
  state.hover = null; state.hoverBu = null;
  render();
}
function toggleDrop(v){
  const i = state.removed.indexOf(v);
  if(i >= 0) state.removed.splice(i,1); else state.removed.push(v);
  render();
}
function toggleAdd(k){
  const i = state.added.indexOf(k);
  if(i >= 0) state.added.splice(i,1); else state.added.push(k);
  state.hover = null;
  render();
}

/* ---- the effect readout ------------------------------------------------ */
function preview(){
  const el = document.getElementById("preview");
  const k = state.hover != null ? state.hover
    : (state.sel && state.sel.kind === "p" ? state.sel.id : null);
  if(k == null || state.added.includes(k)){ el.hidden = true; return; }
  const c = CAND[k], e = effect(k), m = model();
  el.hidden = false;
  el.innerHTML = `<div class="pt">${esc(c.name)}</div>
    <div class="pm">${esc([cap(c.kind), c.where || c.stadsdeel].filter(Boolean).join(" · "))}</div>
    <div class="pg"><div><div class="pv a">${signed(e.people)}</div><div class="pl">newly reached</div></div>
      <div><div class="pv b">${signed(e.secondPeople)}</div><div class="pl">gain a second option</div></div></div>
    <div class="pf">Coverage <b>${pct(m.served/m.total)} → ${pct((m.served+e.people)/m.total)}</b></div>`;
}

/* ---- context chart ------------------------------------------------------ */
function hoverRender(fromMap){
  drawGrid();
  if(!fromMap) drawOverlay();
  preview(); chart();
}
function niceTicks(lo, hi, n = 4){
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), e = raw / mag;
  const step = (e < 1.5 ? 1 : e < 3 ? 2 : e < 7 ? 5 : 10) * mag;
  const out = [];
  for(let v = Math.ceil(lo/step)*step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
/* Existing places, load against reliance. Distance below the diagonal is the backup. */
function chart(){
  const svg = document.getElementById("chart");
  if(!svg) return;
  const w = 380, h = 234, ml = 38, mr = 8, mt = 18, mb = 26, m = model();
  const sel = state.sel && state.sel.kind === "v" ? "v" + state.sel.id : null;
  const data = VEN.map((v,i) => ({key:"v"+i, name:v.name, x:m.serves[i], y:m.sole[i], hollow:!v.sunday}))
    .filter((d,i) => !state.removed.includes(i));
  const top = Math.max(...data.map(d => Math.max(d.x, d.y)), 1) * 1.05;
  const X = v => ml + v/top*(w-ml-mr), Y = v => mt + (1-v/top)*(h-mt-mb);
  const f = v => v >= 1000 ? v/1000 + "k" : v;
  const ink3 = P["--ink-3"], line2 = P["--line-2"], col = P["--orange"], tk = niceTicks(0, top);
  const grid = tk.map(v => `<line x1="${X(v)}" y1="${mt}" x2="${X(v)}" y2="${h-mb}" stroke="${line2}"/>
      <text x="${X(v)}" y="${h-mb+13}" text-anchor="middle" font-size="10.5" fill="${ink3}">${f(v)}</text>
      <line x1="${ml}" y1="${Y(v)}" x2="${w-mr}" y2="${Y(v)}" stroke="${line2}"/>
      <text x="${ml-6}" y="${Y(v)+3}" text-anchor="end" font-size="10.5" fill="${ink3}">${f(v)}</text>`).join("");
  const dots = data.slice().sort((a,b) => (a.key === sel) - (b.key === sel)).map(d => {
    const on = d.key === sel, ghost = sel && !on;
    return `<circle class="pt" data-k="${d.key}" cx="${X(d.x).toFixed(1)}" cy="${Y(d.y).toFixed(1)}"
      r="${on ? 5 : 3.5}" fill="${d.hollow ? "none" : col}" fill-opacity="${ghost ? .25 : .85}"
      stroke="${on ? P["--ink"] : d.hollow ? col : P["--panel"]}" stroke-opacity="${ghost ? .35 : 1}"
      stroke-width="${on ? 1.6 : d.hollow ? 1.2 : .6}" style="cursor:pointer"><title>${esc(d.name)}</title></circle>`;
  }).join("");
  svg.innerHTML = `${grid}<line x1="${X(0)}" y1="${Y(0)}" x2="${X(top)}" y2="${Y(top)}" stroke="${ink3}" stroke-dasharray="3 3"/>${dots}
    <text x="${ml}" y="10" font-size="11" fill="${P["--ink-2"]}">No alternative</text>
    <text x="${w-mr}" y="${h-1}" text-anchor="end" font-size="11" fill="${P["--ink-2"]}">Residents served</text>
    <desc id="chartdesc">Cooling places by residents served against residents with no alternative.</desc>`;
  svg.querySelectorAll(".pt").forEach(el => el.onclick = () => select(el.dataset.k));
  const sw = hollow => `<span class="sw dot" style="${hollow ? `border:1.2px solid ${col}` : `background:${col}`}"></span>`;
  document.getElementById("chartkeys").innerHTML =
    `<span class="lg">${sw(false)}Open on Sundays</span><span class="lg">${sw(true)}Closed on Sundays</span>
     <span class="lg">Diagonal: no alternative for any resident served</span>`;
}

/* ---- toolbar ------------------------------------------------------------ */
const THR_MARKS = [300,500,750,1000,1500];
function toolbar(){
  document.getElementById("dimwrap").hidden = state.mode === "protect";
  document.getElementById("thrv").textContent = km(state.thr);
  const el = document.getElementById("ticks");
  el.innerHTML = THR_MARKS.map(v =>
    `<button type="button" data-t="${v}" style="left:${((v-200)/1300*100).toFixed(2)}%"
      aria-current="${state.thr === v}" aria-label="${km(v)}">${v >= 1000 ? (v/1000) + "k" : v}</button>`).join("");
  el.querySelectorAll("button").forEach(b => b.onclick = () => setThr(+b.dataset.t));
}
function setThr(v){
  state.thr = v;
  document.getElementById("thr").value = v;
  render();
}

/* ---- map interaction --------------------------------------------------- */
const key = (x,y) => Math.floor(x/100)+":"+Math.floor(y/100);
const index = new Map();
for(let i=0;i<N;i++) index.set(key(G.x[i], G.y[i]), i);
function showTip(html, cx, cy){
  tip.innerHTML = html; tip.style.opacity = 1;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(W-w-6, Math.max(6, cx+14)) + "px";
  tip.style.top = (cy-h-10 < 6 ? cy+16 : cy-h-10) + "px";
}
const trow = (k,v) => `<div class="r"><span>${k}</span><b>${v}</b></div>`;
/* The map is read in neighbourhoods: the 100 m square is the grid the analysis measures on, not
   a unit anyone plans for. Hover outlines the whole buurt and reports it; click opens it. */
const buAt = e => { const r = cv.getBoundingClientRect();
  const i = index.get(key(ox + (e.clientX-r.left)/sc, oy - (e.clientY-r.top)/sc));
  return i === undefined ? null : G.bu[i]; };
function setHoverBu(bu){
  if(state.hoverBu === bu) return;
  state.hoverBu = bu; drawGrid();
}
/* ---- zoom and pan ------------------------------------------------------ */
/* Zoom keeps the world point under (mx, my) where it is. Redraws are batched to one per frame. */
let zf = 0;
function redrawMap(){
  if(zf) return;
  zf = requestAnimationFrame(() => { zf = 0; applyView(); drawGrid(); drawOverlay(); });
}
function zoomAt(f, mx = W/2, my = H/2){
  const wx = ox + mx/sc, wy = oy - my/sc;
  view.z = Math.min(ZMAX, Math.max(1, view.z * f));
  const s1 = base.sc * view.z;
  view.cx = wx - mx/s1 + W/2/s1; view.cy = wy + my/s1 - H/2/s1;
  tip.style.opacity = 0;
  redrawMap();
}
const mapbox = document.getElementById("mapbox");
/* A plain wheel zooms only when the page is one screen; where the page scrolls, a wheel over the
   map has to keep scrolling it, so zoom there needs a pinch or ctrl/cmd. */
mapbox.addEventListener("wheel", e => {
  if(e.target.closest(".maplegend,.preview,.mapctl,.zoomctl")) return;
  if(!FIT.matches && !e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  const r = cv.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.04 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
}, {passive:false});
/* Dragging pans; a press that moves less than 4 px is still a click on a neighbourhood. */
let drag = null, dragged = false;
cv.addEventListener("pointerdown", e => {
  if(e.button !== 0 || view.z <= 1) return;
  drag = {x:e.clientX, y:e.clientY, cx:view.cx, cy:view.cy, id:e.pointerId}; dragged = false;
});
addEventListener("pointermove", e => {
  if(!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if(!dragged && Math.hypot(dx, dy) < 4) return;
  if(!dragged){ dragged = true; cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing";
    tip.style.opacity = 0; setHoverBu(null); }
  view.cx = drag.cx - dx/sc; view.cy = drag.cy + dy/sc;
  redrawMap();
});
const endDrag = () => { if(drag){ drag = null; cv.style.cursor = ""; } };
addEventListener("pointerup", endDrag); addEventListener("pointercancel", endDrag);
document.getElementById("zin").onclick = () => zoomAt(2);
document.getElementById("zout").onclick = () => zoomAt(.5);
document.getElementById("zfit").onclick = () => { view.z = 1; view.cx = view.cy = null; tip.style.opacity = 0; redrawMap(); };

cv.addEventListener("mousemove", e => {
  if(drag && dragged) return;
  const bu = buAt(e);
  setHoverBu(bu);
  cv.style.cursor = bu == null ? "" : "pointer";
  if(bu == null){ tip.style.opacity = 0; return; }
  const m = model(), b = BU[bu], pop = m.buPop[bu], share = v => pop ? ` (${pct(v/pop)})` : "";
  const rows = state.mode === "expand"
    ? trow(`Within ${km(state.thr)}`, fmt(pop - m.buOut[bu]) + share(pop - m.buOut[bu]))
      + trow("Beyond reach", fmt(m.buOut[bu]))
      + trow("Aged 65+", pct(b.eld_share))
      + (b.frail == null ? "" : trow("Frail health", b.frail.toFixed(1) + "%"))
    : trow("Rely on a single place", fmt(m.buOne[bu]) + share(m.buOne[bu]))
      + trow("Two or more places", fmt(m.buTwo[bu]) + share(m.buTwo[bu]))
      + trow("Beyond reach", fmt(m.buOut[bu]));
  const r = cv.getBoundingClientRect();
  showTip(`<div class="t">${esc(b.name)} <span>· ${esc(b.stadsdeel)}</span></div>`
    + trow("Residents", fmt(pop)) + rows, e.clientX - r.left, e.clientY - r.top);
});
cv.addEventListener("mouseleave", () => { tip.style.opacity = 0; setHoverBu(null); });
cv.addEventListener("click", e => { if(dragged){ dragged = false; return; }
  const bu = buAt(e); if(bu == null) return;
  tip.style.opacity = 0; state.hoverBu = null; select("b" + bu); });
function bindMap(){
  ov.querySelectorAll(".venue").forEach(el => {
    el.onclick = () => { state.mode = "protect"; state.tab.protect = "venues"; select("v" + el.dataset.v); };
    el.onmousemove = e => { const r = cv.getBoundingClientRect(), i = +el.dataset.v, m = model();
      showTip(`<div class="t">${esc(VEN[i].name)}</div>` + (state.removed.includes(i)
          ? trow("Status", "Removed") + trow("Lose access", fmt(cutOff(i)))
          : trow("Residents served", fmt(m.serves[i])) + trow("No alternative", fmt(m.sole[i]))),
        e.clientX-r.left, e.clientY-r.top); };
    el.onmouseleave = () => tip.style.opacity = 0;
  });
  ov.querySelectorAll(".cand").forEach(el => {
    const k = +el.dataset.c;
    el.onclick = e => { e.stopPropagation(); select("p" + k); };
    el.onmouseenter = () => { state.hover = k; hoverRender(true); };
    el.onmouseleave = () => { state.hover = null; hoverRender(true); };
  });
}

/* ---- wiring ------------------------------------------------------------ */
const thr = document.getElementById("thr");
thr.value = state.thr;
thr.addEventListener("input", () => setThr(+thr.value));
document.getElementById("dim").onchange = e => { state.showCovered = e.target.checked; render(); };
document.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => {
  if(state.mode === b.dataset.mode) return;
  state.mode = b.dataset.mode; state.sel = null; state.hover = null; state.hoverBu = null; state.q = "";
  render(); });
addEventListener("keydown", e => { if(e.key === "Escape" && state.sel){ state.sel = null; render(); } });

const themeBtn = document.getElementById("theme");
const isDark = () => { const t = document.documentElement.getAttribute("data-theme");
  return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };
function applyTheme(t){
  if(t) document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
  themeBtn.innerHTML = isDark() ? ICON.sun : ICON.moon;
  themeBtn.setAttribute("aria-label", isDark() ? "Switch to light theme" : "Switch to dark theme");
  render();
}
themeBtn.onclick = () => applyTheme(isDark() ? "light" : "dark");
const SOURCES = `Residents: CBS 100 m grid, 2025 · Network and venues: © OpenStreetMap contributors ·
  Overheating: EP-Online · Heat, canopy, health: Klimaateffectatlas, 2025 (CC BY 4.0)`;
document.getElementById("foot").innerHTML = `<p title="${SOURCES.replace(/\s+/g, " ")}">${SOURCES}</p>`;

fit(); applyTheme(null);
// The first fit() runs before layout has settled; measure again once it has.
requestAnimationFrame(() => { fit(); render(); });
let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { fit(); render(); }, 120); });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if(!document.documentElement.getAttribute("data-theme")) applyTheme(null);
});
