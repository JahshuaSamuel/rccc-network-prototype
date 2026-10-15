/* screens/field.js — Field Organizer (Agent 7)
   Sub-routes: '' turf map · 'list' walk lists · 'canvass' volunteer phone view.
   Everything is deterministic: no Math.random, seeded helpers only. */
(function () {
  'use strict';
  if (!window.App) return;

  const U = App.util;
  const esc = (s) => U.esc(s);
  const W = 1000, H = 620; // map world units

  const I = (d) => `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON = I('<path d="M10 17s5-4.4 5-8.5a5 5 0 0 0-10 0C5 12.6 10 17 10 17z"/><circle cx="10" cy="8.5" r="1.8"/>');

  /* Party colors: distinct hues plus grey, each with enough contrast on the light map. */
  const PARTY = {
    REP: { label: 'Republican', short: 'REP', color: '#C0262D' },
    NPP: { label: 'No party preference (NPP)', short: 'NPP', color: '#6F7986' },
    DEM: { label: 'Democrat', short: 'DEM', color: '#2457C5' },
    OTHER: { label: 'Other party', short: 'Other', color: '#C98208' },
  };
  const PARTY_ORDER = ['REP', 'NPP', 'DEM', 'OTHER'];
  /* Turf palette avoids the party hues so blobs and dots never get confused. */
  const TURF_COLORS = ['#0F766E', '#7C3AED', '#4D7C0F', '#BE185D', '#8B5A2B', '#0E7490'];

  const OUTCOMES = [
    { id: 'talked', label: 'Talked', icon: '<path d="M4 5h12v8H9l-4 3v-3H4z"/>' },
    { id: 'nothome', label: 'Not home', icon: '<path d="M3 9.5L10 4l7 5.5V16H3z"/><path d="M8 12l4 4M12 12l-4 4"/>' },
    { id: 'refused', label: 'Refused', icon: '<circle cx="10" cy="10" r="6.5"/><path d="M5.5 14.5l9-9"/>' },
    { id: 'moved', label: 'Moved', icon: '<path d="M3 10h11M10 6l4 4-4 4"/><path d="M17 4v12"/>' },
    { id: 'lit', label: 'Left literature', icon: '<rect x="5" y="3" width="10" height="14" rx="1.5"/><path d="M8 7h4M8 10h4M8 13h2"/>' },
  ];
  const OUT_LABEL = Object.fromEntries(OUTCOMES.map((o) => [o.id, o.label]));

  const SURVEY = [
    { id: 'q1', options: [['yes', 'Strong yes'], ['lean', 'Leaning yes'], ['undecided', 'Undecided'], ['no', 'No']] },
    { id: 'q2', q: 'Would you like a yard sign?', options: [['yes', 'Yes, please'], ['no', 'No thanks']] },
    { id: 'q3', q: 'Interested in volunteering?', options: [['yes', 'Yes'], ['maybe', 'Maybe later'], ['no', 'No']] },
  ];

  /* ---------------- state ---------------- */
  function S() {
    const st = App.state;
    st.field_filters = st.field_filters || { parties: PARTY_ORDER.slice(), minProp: 0, uncontacted: false };
    st.field_lists = st.field_lists || [];
    st.field_selTurf = st.field_selTurf || {};
    st.field_builder = st.field_builder || {};
    st.field_active = st.field_active || {};
    st.field_canvass = st.field_canvass || {};
    return st;
  }

  /* ---------------- data helpers ---------------- */
  function turfIndex(t, turfId) { return t.turfs.findIndex((x) => x.id === turfId); }
  function turfColor(t, turfId) { const i = turfIndex(t, turfId); return TURF_COLORS[(i < 0 ? 0 : i) % TURF_COLORS.length]; }
  function turfById(t, id) { return t.turfs.find((x) => x.id === id) || t.turfs[0]; }
  function volById(t, id) { return t.volunteers.find((v) => v.id === id) || { id, name: 'Volunteer', doors: 0, shifts: 0 }; }
  function candidate(t) {
    const c = t.candidates || [];
    return c.find((x) => x.status === 'ENDORSED') || c.find((x) => x.status === 'ACTIVE_CAMPAIGN') || c[0] || { name: 'our endorsed candidate', office: 'local office' };
  }
  /* The volunteer persona used for "Viewing as Volunteer": the first turf's assigned walker. */
  function volunteerTurf(ctx) { return ctx.role === 'volunteer' ? ctx.tenant.turfs[0] : null; }

  const baseCache = {};
  function baseContacted(t, v) {
    const k = v.id;
    if (k in baseCache) return baseCache[k];
    const turf = turfById(t, v.turfId);
    return (baseCache[k] = U.seeded(v.id + ':c')() < turf.done / turf.doors);
  }
  function canvassFor(slug) { return S().field_canvass[slug] || null; }
  function syncedResults(slug) {
    const cs = canvassFor(slug);
    if (!cs) return [];
    return Object.entries(cs.results).filter(([, r]) => r.synced).map(([vid, r]) => Object.assign({ vid }, r));
  }
  function contacted(ctx, v) {
    if (baseContacted(ctx.tenant, v)) return true;
    const cs = canvassFor(ctx.tenantSlug);
    return !!(cs && cs.results[v.id] && cs.results[v.id].synced);
  }
  function matches(ctx, v) {
    const f = S().field_filters;
    return f.parties.includes(v.party) && v.propensity >= f.minProp && (!f.uncontacted || !contacted(ctx, v));
  }
  function extraDoorsForTurf(ctx, turfId) {
    const t = ctx.tenant;
    return syncedResults(ctx.tenantSlug).filter((r) => { const v = t.voters.find((x) => x.id === r.vid); return v && v.turfId === turfId; }).length;
  }
  function extraDoorsForVolunteer(ctx, volId) {
    const cs = canvassFor(ctx.tenantSlug);
    if (!cs || cs.volunteerId !== volId) return 0;
    return syncedResults(ctx.tenantSlug).length;
  }

  /* Nearest-neighbor walking order, starting from the west-most door. Deterministic. */
  function orderRoute(voters) {
    if (!voters.length) return [];
    const left = voters.slice().sort((a, b) => a.x - b.x || a.y - b.y || (a.id < b.id ? -1 : 1));
    const route = [left[0]];
    const rest = new Set(left.slice(1));
    while (rest.size) {
      const cur = route[route.length - 1];
      let best = null, bd = Infinity;
      rest.forEach((v) => {
        const d = (v.x - cur.x) ** 2 + ((v.y - cur.y) * (H / W)) ** 2;
        if (d < bd - 1e-12 || (Math.abs(d - bd) <= 1e-12 && best && v.id < best.id)) { bd = d; best = v; }
      });
      route.push(best);
      rest.delete(best);
    }
    return route;
  }
  function routeMiles(route) {
    let len = 0;
    for (let i = 1; i < route.length; i++) len += Math.hypot(route[i].x - route[i - 1].x, (route[i].y - route[i - 1].y) * (H / W));
    return len * 3.5;
  }

  /* ---------------- geometry ---------------- */
  function convexHull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    p.forEach((q) => { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); });
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
    upper.pop(); lower.pop();
    return lower.concat(upper);
  }
  /* Padded convex hull drawn as a smooth closed blob (quadratic curves through edge midpoints). */
  function blobPath(pts, pad) {
    const hull = convexHull(pts);
    const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
    const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;
    const ex = hull.map(([x, y]) => { const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1; return [x + dx / d * pad, y + dy / d * pad]; });
    const n = ex.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const f = (p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    let d = 'M' + f(mid(ex[n - 1], ex[0]));
    for (let i = 0; i < n; i++) d += ' Q' + f(ex[i]) + ' ' + f(mid(ex[i], ex[(i + 1) % n]));
    return { d: d + 'Z', top: Math.min(...ex.map((p) => p[1])), cx };
  }

  /* Abstract street-grid backdrop, seeded per county so each looks different. */
  function baseLayer(slug) {
    const r = U.seeded('map:' + slug);
    let s = `<rect x="-200" y="-200" width="${W + 400}" height="${H + 400}" fill="#F4F6F2"/>`;
    for (let i = 0; i < 4; i++) {
      const x = r() * (W - 160), y = r() * (H - 120);
      s += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${(70 + r() * 90).toFixed(0)}" height="${(40 + r() * 60).toFixed(0)}" rx="14" fill="#E2EEDD"/>`;
    }
    const rot = (r() * 16 - 8).toFixed(1);
    let minor = '', major = '';
    for (let x = -300; x <= W + 300; x += 38) minor += `M${x} -300V${H + 300}`;
    for (let y = -300; y <= H + 300; y += 38) minor += `M-300 ${y}H${W + 300}`;
    for (let x = -300 + 38 * 5; x <= W + 300; x += 38 * 6) major += `M${x} -300V${H + 300}`;
    for (let y = -300 + 38 * 4; y <= H + 300; y += 38 * 5) major += `M-300 ${y}H${W + 300}`;
    s += `<g transform="rotate(${rot} ${W / 2} ${H / 2})">
      <path d="${minor}" stroke="#E3E7EC" stroke-width="1.2" fill="none"/>
      <path d="${major}" stroke="#D6DCE3" stroke-width="7" fill="none"/>
      <path d="${major}" stroke="#FFFFFF" stroke-width="4.5" fill="none"/>
    </g>`;
    const y0 = 80 + r() * 140, y1 = 300 + r() * 200;
    const fwy = `M-20 ${y0.toFixed(0)} C ${W * 0.3} ${(y0 + 160).toFixed(0)}, ${W * 0.6} ${(y1 - 160).toFixed(0)}, ${W + 20} ${y1.toFixed(0)}`;
    s += `<path d="${fwy}" stroke="#E2C88E" stroke-width="13" fill="none"/><path d="${fwy}" stroke="#F6E2B3" stroke-width="9" fill="none"/>`;
    const cx0 = 200 + r() * 500;
    s += `<path d="M${cx0.toFixed(0)} -20 C ${cx0 + 120} ${H * 0.3}, ${cx0 - 140} ${H * 0.6}, ${(cx0 + 60).toFixed(0)} ${H + 20}" stroke="#C4DDF0" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    return s;
  }

  /* ---------------- shared style ---------------- */
  function injectStyle() {
    if (document.getElementById('scr-field-style')) return;
    const st = document.createElement('style');
    st.id = 'scr-field-style';
    st.textContent = `
.scr-field .f-main { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 20px; align-items: start; }
.scr-field .f-side { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.scr-field .f-map { display: block; width: 100%; height: auto; border-radius: 0 0 var(--r) var(--r); }
.scr-field .f-mapwrap { position: relative; background: #F4F6F2; border-radius: 0 0 var(--r-lg) var(--r-lg); overflow: hidden; }
.scr-field .f-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 14px 20px; border-bottom: 1px solid var(--line); }
.scr-field .f-filters .f-flabel { font-size: 13.5px; font-weight: 700; color: var(--ink-2); }
.scr-field .f-chipset { display: flex; flex-wrap: wrap; gap: 6px; }
.scr-field .chip .f-sw { width: 10px; height: 10px; border-radius: 50%; flex: none; border: 1.5px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.15); }
.scr-field .f-range { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: var(--ink-2); }
.scr-field .f-range input { accent-color: var(--brand); width: 130px; }
.scr-field .f-count { margin-left: auto; font-weight: 700; color: var(--brand); font-size: 15px; white-space: nowrap; }
.scr-field .f-count b { font-family: var(--font-head); font-size: 1.25rem; }
.scr-field .f-dot { transition: opacity .2s ease; }
.scr-field .f-dot.is-off { opacity: .13; }
.scr-field .f-blob { cursor: pointer; transition: fill-opacity .2s ease, stroke-width .2s ease, opacity .2s ease; }
.scr-field .f-blob:hover { fill-opacity: .2; }
.scr-field .f-blob:focus { outline: none; box-shadow: none; }
.scr-field .f-blob:focus-visible { stroke-width: 5; }
.scr-field svg.has-sel .f-blob:not(.is-sel), .scr-field svg.has-sel .f-tlabel:not(.is-sel) { opacity: .35; }
.scr-field svg.has-sel .f-dot.out-sel { opacity: .1; }
.scr-field .f-blob.is-sel { fill-opacity: .22; stroke-width: 3.5; stroke-dasharray: none; }
.scr-field .f-tlabel { font: 700 25px var(--font-head); paint-order: stroke; stroke: #fff; stroke-width: 5px; stroke-linejoin: round; pointer-events: none; transition: opacity .2s ease; }
.scr-field .f-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 12px 20px; font-size: 13.5px; color: var(--ink-2); border-top: 1px solid var(--line); background: var(--surface); }
.scr-field .f-legend span { display: inline-flex; align-items: center; gap: 6px; }
.scr-field .f-legend i { width: 12px; height: 12px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.18); display: inline-block; }
.scr-field .f-banner { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: var(--r); background: color-mix(in srgb, var(--brand) 9%, white); border: 1px solid color-mix(in srgb, var(--brand) 25%, white); color: var(--brand); font-weight: 600; margin-bottom: 16px; }
.scr-field .f-prog { display: grid; grid-template-columns: 12px minmax(0,1fr) auto; gap: 4px 10px; align-items: center; padding: 9px 8px; border-radius: var(--r-sm); cursor: pointer; border: 1px solid transparent; background: none; width: 100%; text-align: left; font: inherit; color: inherit; }
.scr-field .f-prog:hover { background: var(--surface-2); }
.scr-field .f-prog.is-sel { border-color: var(--line-strong); background: var(--surface-2); }
.scr-field .f-prog .f-pname { font-weight: 600; font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scr-field .f-prog .f-pnum { font-size: 13.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.scr-field .f-bar { grid-column: 2 / 4; height: 7px; border-radius: 99px; background: var(--line); overflow: hidden; }
.scr-field .f-bar > i { display: block; height: 100%; border-radius: 99px; transition: width .4s ease; }
.scr-field .f-sq { width: 12px; height: 12px; border-radius: 4px; }
.scr-field .f-lb { list-style: none; margin: 0; padding: 0; }
.scr-field .f-lb li { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--line); font-size: 14.5px; }
.scr-field .f-lb li:last-child { border-bottom: 0; }
.scr-field .f-rank { width: 22px; font-weight: 800; font-family: var(--font-head); color: var(--ink-3); text-align: center; }
.scr-field .f-lb .f-lbname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.scr-field .f-lb .f-lbdoors { font-variant-numeric: tabular-nums; font-weight: 700; }
.scr-field .f-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.scr-field .f-stat { background: var(--surface-2); border-radius: var(--r-sm); padding: 10px 12px; }
.scr-field .f-stat b { display: block; font-family: var(--font-head); font-size: 1.4rem; line-height: 1.1; }
.scr-field .f-stat span { font-size: 13px; color: var(--ink-3); }
.scr-field .f-mix { display: flex; height: 12px; border-radius: 99px; overflow: hidden; margin: 6px 0 4px; }
.scr-field .f-roles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.scr-field .f-role { border: 1px solid var(--line); border-radius: var(--r); padding: 14px; display: flex; flex-direction: column; gap: 8px; background: var(--surface); }
.scr-field .f-role.is-me { border: 2px solid var(--brand); background: color-mix(in srgb, var(--brand) 5%, white); }
.scr-field .f-role h4 { margin: 0; font-size: 1.02rem; }
.scr-field .f-role p { font-size: 14px; color: var(--ink-2); margin: 0; flex: 1; }
.scr-field .f-scope { display: flex; gap: 3px; height: 26px; }
.scr-field .f-scope i { flex: 1; border-radius: 4px; background: var(--line); }
.scr-field .f-scope i.on { background: var(--brand); }
.scr-field .f-scope i.part { background: color-mix(in srgb, var(--brand) 45%, white); }
.scr-field .f-num { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; background: var(--brand); color: var(--brand-ink); font-weight: 700; font-size: 13px; flex: none; }
.scr-field .f-pbadge { display: inline-block; font-weight: 700; font-size: 12.5px; padding: 2px 8px; border-radius: 99px; color: #fff; white-space: nowrap; }
.scr-field .f-pm { display: inline-flex; align-items: center; gap: 8px; }
.scr-field .f-pm i { display: block; width: 54px; height: 6px; border-radius: 99px; background: var(--line); overflow: hidden; }
.scr-field .f-pm i > u { display: block; height: 100%; background: var(--brand); }
.scr-field .f-builder { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 20px; align-items: start; }
.scr-field .f-field { display: flex; flex-direction: column; gap: 6px; }
.scr-field .f-field > label, .scr-field .f-field > .f-flabel { font-weight: 700; font-size: 14px; color: var(--ink-2); }
.scr-field .f-minimap { display: block; width: 100%; height: auto; max-height: 380px; background: #F4F6F2; border-radius: var(--r); border: 1px solid var(--line); }
.scr-field .f-empty { text-align: center; padding: 40px 20px; color: var(--ink-3); }
.scr-field .f-empty svg { color: var(--line-strong); margin-bottom: 8px; }
.scr-field .f-doors td { vertical-align: middle; }
/* canvass */
.scr-field .f-canvass { display: grid; grid-template-columns: 390px minmax(0, 1fr); gap: 28px; align-items: start; }
.scr-field .f-right { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.scr-field .phone { margin: 0; }
.scr-field .phone-screen { background: #F3F5F8; padding-top: 0; position: relative; }
.scr-field .ph-status { display: flex; justify-content: space-between; padding: 12px 24px 6px; font: 600 13px var(--font-body); color: var(--ink); background: var(--surface); }
.scr-field .ph-head { display: flex; align-items: center; gap: 12px; padding: 10px 16px 12px; background: var(--brand); color: var(--brand-ink); }
.scr-field .ph-head h3 { color: inherit; margin: 0; font-size: 1.08rem; }
.scr-field .ph-head .small { opacity: .88; }
.scr-field .ph-ring { flex: none; }
.scr-field .ph-off { display: flex; align-items: center; gap: 10px; padding: 9px 14px; background: var(--surface); border-bottom: 1px solid var(--line); font-size: 14px; font-weight: 600; }
.scr-field .ph-offbanner { padding: 10px 14px; background: var(--warn-soft); color: #6E4100; font-size: 14px; font-weight: 600; border-bottom: 1px solid color-mix(in srgb, var(--warn) 25%, white); display: flex; gap: 8px; align-items: flex-start; }
.scr-field .ph-syncbanner { padding: 10px 14px; background: var(--info-soft); color: var(--info); font-size: 14px; font-weight: 600; display: flex; gap: 8px; align-items: center; }
.scr-field .ph-syncbanner .spinner { width: 16px; height: 16px; margin: 0; border-width: 2px; border-top-color: var(--info); }
.scr-field .ph-body { padding: 14px 14px 0; display: flex; flex-direction: column; gap: 12px; }
.scr-field .ph-card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px; }
.scr-field .ph-card h4 { margin: 0 0 2px; font-size: 1.15rem; }
.scr-field .ph-q { font-weight: 700; font-size: 14.5px; margin: 0 0 8px; }
.scr-field .ph-opts { display: flex; flex-wrap: wrap; gap: 6px; }
.scr-field .ph-opts .chip { min-height: 38px; }
.scr-field .ph-outs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.scr-field .ph-out { display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 8px 12px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface); font: 600 15px var(--font-body); color: var(--ink); cursor: pointer; text-align: left; }
.scr-field .ph-out:hover { border-color: var(--ink-3); }
.scr-field .ph-out.is-on { background: var(--brand); color: var(--brand-ink); border-color: var(--brand); }
.scr-field .ph-out:last-child { grid-column: 1 / -1; }
.scr-field .ph-out svg { flex: none; }
.scr-field .ph-nav { display: flex; gap: 8px; position: sticky; bottom: 0; z-index: 2; margin: 0 -14px; padding: 10px 14px; background: color-mix(in srgb, #F3F5F8 92%, transparent); border-top: 1px solid var(--line); backdrop-filter: blur(4px); }
.scr-field .ph-body > .f-minimap { order: 0; }
.scr-field .ph-nav .btn-primary { flex: 1; min-height: 50px; font-size: 16px; }
.scr-field .ph-saved { font-size: 13.5px; font-weight: 600; color: var(--ok); display: flex; align-items: center; gap: 6px; }
.scr-field .ph-saved.is-wait { color: var(--warn); }
.scr-field .ph-done { text-align: center; padding: 30px 18px; display: flex; flex-direction: column; gap: 14px; align-items: center; }
.scr-field .ph-done .f-stats { width: 100%; }
.scr-field .hq-head { display: flex; align-items: center; gap: 10px; }
.scr-field .hq-live { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: var(--ok); }
.scr-field .hq-live::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 0 3px var(--ok-soft); }
.scr-field .hq-live.is-wait { color: var(--warn); }
.scr-field .hq-live.is-wait::before { background: var(--warn); box-shadow: 0 0 0 3px var(--warn-soft); }
.scr-field .hq-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.scr-field .hq-kpi { background: var(--surface-2); border-radius: var(--r-sm); padding: 10px 12px; transition: background-color .6s ease, box-shadow .6s ease; }
.scr-field .hq-kpi b { display: block; font-family: var(--font-head); font-stretch: 80%; font-size: 1.8rem; line-height: 1.05; font-variant-numeric: tabular-nums; }
.scr-field .hq-kpi span { font-size: 13px; color: var(--ink-2); }
.scr-field .hq-kpi.flash { background: var(--ok-soft); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ok) 45%, white); }
.scr-field .hq-feed { list-style: none; margin: 0; padding: 0; }
.scr-field .hq-feed li { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 14px; align-items: flex-start; }
.scr-field .hq-feed li:last-child { border-bottom: 0; }
.scr-field .hq-feed li.is-new { animation: fFeedIn .7s ease; }
.scr-field .hq-feed .muted { white-space: nowrap; }
.scr-field .hq-pending { padding: 10px 12px; border-radius: var(--r-sm); background: var(--warn-soft); color: #6E4100; font-size: 14px; font-weight: 600; }
@keyframes fFeedIn { from { background: var(--ok-soft); } to { background: transparent; } }
.scr-field .f-tp li { margin-bottom: 6px; }
@media (max-width: 1100px) {
  .scr-field .f-roles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 1000px) {
  .scr-field .f-main, .scr-field .f-builder { grid-template-columns: minmax(0, 1fr); }
  .scr-field .f-canvass { grid-template-columns: minmax(0, 1fr); }
  .scr-field .f-canvass .phone { margin: 0 auto; }
}
@media (max-width: 600px) {
  .scr-field .f-roles { grid-template-columns: minmax(0, 1fr); }
  .scr-field .f-filters { padding: 12px 14px; }
  .scr-field .f-count { margin-left: 0; width: 100%; }
  .scr-field .f-range input { width: 110px; }
  .scr-field .f-legend { padding: 10px 14px; }
  .scr-field .phone { width: 100%; height: auto; border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--shadow-1); overflow: hidden; }
  .scr-field .phone::before, .scr-field .ph-status { display: none; }
  .scr-field .phone-screen { overflow: visible; }
  .scr-field .hq-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .scr-field .f-hide-m { display: none; }
  .scr-field .f-doors thead { display: none; }
  .scr-field .f-doors tr { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; column-gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
  .scr-field .f-doors td { padding: 0; border: 0; background: none !important; }
  .scr-field .f-doors td:nth-child(1) { grid-row: 1 / 4; }
  .scr-field .f-doors td:nth-child(2) { grid-column: 2; }
  .scr-field .f-doors td:nth-child(3) { grid-column: 2 / 4; grid-row: 2; }
  .scr-field .f-doors td:nth-child(4) { grid-column: 3; grid-row: 1; }
  .scr-field .f-doors td:nth-child(5) { grid-column: 2 / 4; grid-row: 3; }
}`;
    document.head.appendChild(st);
  }

  /* ---------------- small renderers ---------------- */
  const partyBadge = (p) => `<span class="f-pbadge" style="background:${PARTY[p].color}" title="${esc(PARTY[p].label)}">${esc(PARTY[p].short)}</span>`;
  const propMeter = (n) => `<span class="f-pm" title="Turnout score ${n} of 100"><i><u style="width:${n}%"></u></i><span class="small">${n}</span></span>`;

  function countyName(t) { const c = t.county || t.name || ''; return /county/i.test(c) ? c : c + ' County'; }
  function pageHead(ctx) {
    const t = ctx.tenant;
    const tabs = [['', 'Turf map'], ['list', 'Walk lists'], ['canvass', 'Volunteer phone']];
    return `<div class="page-head">
        <div>
          <h1>Field Organizer</h1>
          <p>Cut precinct turf, hand out walk lists and watch doors get knocked in real time across ${esc(countyName(t))}.</p>
        </div>
        <div class="row">
          <span class="badge badge-local">Your county</span>
        </div>
      </div>
      <nav class="tabs" aria-label="Field Organizer sections">
        ${tabs.map(([s, l]) => `<a class="tab${ctx.sub === s ? ' active' : ''}" href="#/field${s ? '/' + s : ''}"${ctx.sub === s ? ' aria-current="page"' : ''}>${l}</a>`).join('')}
      </nav>`;
  }

  function volunteerBanner(ctx) {
    const vt = volunteerTurf(ctx);
    if (!vt) return '';
    return `<div class="f-banner" role="status">
      <svg style="flex:none" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"/><circle cx="10" cy="10" r="2.3"/></svg>
      <span>Viewing as a volunteer: only your assigned doors (${esc(vt.name)}, walked by ${esc(volById(ctx.tenant, vt.volunteerId).name)}).</span></div>`;
  }

  /* =========================================================
     TURF MAP
     ========================================================= */
  function mapSVG(ctx) {
    const t = ctx.tenant;
    const vt = volunteerTurf(ctx);
    const turfs = vt ? [vt] : t.turfs;
    const ids = new Set(turfs.map((x) => x.id));
    const voters = t.voters.filter((v) => ids.has(v.turfId));
    let blobs = '', labels = '';
    turfs.forEach((tf) => {
      const pts = voters.filter((v) => v.turfId === tf.id).map((v) => [v.x * W, v.y * H]);
      if (pts.length < 3) return;
      const b = blobPath(pts, 38);
      const c = turfColor(t, tf.id);
      blobs += `<path class="f-blob" data-turf="${esc(tf.id)}" d="${b.d}" fill="${c}" fill-opacity=".12" stroke="${c}" stroke-width="2" stroke-dasharray="7 5" role="button" tabindex="0" aria-label="${esc(tf.name)} turf: ${tf.done} of ${tf.doors} doors done"><title>${esc(tf.name)}</title></path>`;
      labels += `<text class="f-tlabel" data-turf="${esc(tf.id)}" x="${b.cx.toFixed(0)}" y="${(b.top - 8).toFixed(0)}" text-anchor="middle" fill="${c}">${esc(tf.name)}</text>`;
    });
    const dots = voters.map((v) => `<circle class="f-dot" data-v="${esc(v.id)}" data-turf="${esc(v.turfId)}" cx="${(v.x * W).toFixed(1)}" cy="${(v.y * H).toFixed(1)}" r="9.5" fill="${PARTY[v.party].color}" stroke="#fff" stroke-width="2.5"><title>${esc(v.first + ' ' + v.last)} · ${esc(PARTY[v.party].label)} · turnout score ${v.propensity}</title></circle>`).join('');
    // When a volunteer sees one turf, zoom the view to it.
    let vb = `0 0 ${W} ${H}`;
    if (vt) {
      const xs = voters.map((v) => v.x * W), ys = voters.map((v) => v.y * H);
      const x0 = Math.min(...xs) - 90, x1 = Math.max(...xs) + 90, y0 = Math.min(...ys) - 80, y1 = Math.max(...ys) + 60;
      const w = Math.max(x1 - x0, (y1 - y0) * W / H), h = w * H / W;
      vb = `${((x0 + x1) / 2 - w / 2).toFixed(0)} ${((y0 + y1) / 2 - h / 2).toFixed(0)} ${w.toFixed(0)} ${h.toFixed(0)}`;
    }
    return `<svg class="f-map" viewBox="${vb}" role="img" aria-labelledby="f-map-t">
      <title id="f-map-t">Map of ${esc(countyName(t))} turf areas with each sample voter household shown as a dot colored by party.</title>
      ${baseLayer(ctx.tenantSlug)}
      <g>${blobs}</g><g>${dots}</g><g>${labels}</g>
    </svg>`;
  }

  function filterBar() {
    const f = S().field_filters;
    return `<div class="f-filters" data-tour="field-filters">
      <span class="f-flabel">Party</span>
      <div class="f-chipset" role="group" aria-label="Party filter">
        ${PARTY_ORDER.map((p) => `<button class="chip${f.parties.includes(p) ? ' active' : ''}" data-party="${p}" aria-pressed="${f.parties.includes(p)}"><span class="f-sw" style="background:${PARTY[p].color}"></span>${esc(PARTY[p].short)}</button>`).join('')}
      </div>
      <label class="f-range"><span class="f-flabel">Turnout score at least</span>
        <input type="range" min="0" max="90" step="10" value="${f.minProp}" data-prop aria-label="Minimum turnout score">
        <b data-propval>${f.minProp}</b></label>
      <button class="chip${f.uncontacted ? ' active' : ''}" data-uncontacted aria-pressed="${f.uncontacted}">Not yet contacted</button>
      <span class="f-count" aria-live="polite" data-count></span>
    </div>`;
  }

  function turfProgress(ctx) {
    const t = ctx.tenant;
    const vt = volunteerTurf(ctx);
    const sel = S().field_selTurf[ctx.tenantSlug];
    const turfs = vt ? [vt] : t.turfs;
    let totD = 0, totN = 0;
    const rows = turfs.map((tf) => {
      const done = Math.min(tf.doors, tf.done + extraDoorsForTurf(ctx, tf.id));
      totD += done; totN += tf.doors;
      const pct = Math.round(done / tf.doors * 100);
      return `<button class="f-prog${sel === tf.id ? ' is-sel' : ''}" data-turf="${esc(tf.id)}" aria-pressed="${sel === tf.id}">
        <span class="f-sq" style="background:${turfColor(t, tf.id)}"></span>
        <span class="f-pname">${esc(tf.name)}</span>
        <span class="f-pnum">${done}/${tf.doors} · ${pct}%</span>
        <span class="f-bar"><i style="width:${pct}%;background:${turfColor(t, tf.id)}"></i></span>
      </button>`;
    }).join('');
    return `<div class="card">
      <div class="card-head"><h3>Turf progress</h3><span class="spacer"></span><span class="small muted">${U.fmtNum(totD)} of ${U.fmtNum(totN)} doors</span></div>
      <div class="card-body" style="padding:10px 12px">${rows}</div>
    </div>`;
  }

  function leaderboard(ctx) {
    const t = ctx.tenant;
    const vt = volunteerTurf(ctx);
    const list = t.volunteers.map((v) => ({ v, doors: v.doors + extraDoorsForVolunteer(ctx, v.id) }))
      .sort((a, b) => b.doors - a.doors);
    const top = list[0] ? list[0].doors : 1;
    const rows = list.slice(0, 6).map((r, i) => `<li${vt && vt.volunteerId === r.v.id ? ' style="font-weight:700"' : ''}>
        <span class="f-rank">${i + 1}</span>${U.avatar(r.v.name, 28)}
        <span class="f-lbname">${esc(r.v.name)}<br><span class="f-bar" style="display:block;margin-top:4px;height:5px"><i style="width:${Math.round(r.doors / top * 100)}%;background:var(--accent)"></i></span></span>
        <span class="f-lbdoors">${U.fmtNum(r.doors)}</span>
      </li>`).join('');
    return `<div class="card">
      <div class="card-head"><h3>Volunteer leaderboard</h3><span class="spacer"></span><span class="small muted">Doors this cycle</span></div>
      <div class="card-body" style="padding:6px 16px 10px"><ul class="f-lb">${rows}</ul></div>
    </div>`;
  }

  function turfStats(ctx) {
    const t = ctx.tenant;
    const sel = S().field_selTurf[ctx.tenantSlug];
    const tf = sel && t.turfs.find((x) => x.id === sel);
    if (!tf) {
      const vt = volunteerTurf(ctx);
      return `<div class="card"><div class="card-body">
        <h3 style="margin-bottom:6px">${vt ? 'Your route' : 'Pick a turf'}</h3>
        <p class="small muted">${vt ? 'Tap your turf on the map to see its doors, party mix and progress.' : 'Click any shaded turf on the map, or a row under Turf progress, to see its doors, party mix and assigned volunteer.'}</p>
      </div></div>`;
    }
    const vs = t.voters.filter((v) => v.turfId === tf.id);
    const mix = PARTY_ORDER.map((p) => [p, vs.filter((v) => v.party === p).length]);
    const avg = Math.round(vs.reduce((s, v) => s + v.propensity, 0) / vs.length);
    const done = Math.min(tf.doors, tf.done + extraDoorsForTurf(ctx, tf.id));
    const vol = volById(t, tf.volunteerId);
    return `<div class="card" style="border-top:4px solid ${turfColor(t, tf.id)}">
      <div class="card-head"><h3>${esc(tf.name)}</h3><span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" data-clear aria-label="Clear turf selection">Clear</button></div>
      <div class="card-body stack" style="gap:12px">
        <div class="f-stats">
          <div class="f-stat"><b>${done}/${tf.doors}</b><span>Doors knocked</span></div>
          <div class="f-stat"><b>${avg}</b><span>Average turnout score</span></div>
        </div>
        <div>
          <div class="small" style="font-weight:700">Party mix of sample households</div>
          <div class="f-mix">${mix.map(([p, n]) => `<i style="flex:${n};background:${PARTY[p].color}" title="${esc(PARTY[p].label)}: ${n}"></i>`).join('')}</div>
          <div class="small muted">${mix.map(([p, n]) => `${PARTY[p].short} ${n}`).join(' · ')}</div>
        </div>
        <div class="small">Precincts ${esc(tf.precincts.join(', '))} · Walked by <b>${esc(vol.name)}</b></div>
        <button class="btn btn-primary btn-sm" data-buildfor="${esc(tf.id)}">Build a walk list for this turf</button>
      </div></div>`;
  }

  function privacyPanel(ctx) {
    const roles = [
      { id: 'board', title: 'Executive Board', text: 'The whole county voter file: every turf, every door, every result.', scope: ['on', 'on', 'on', 'on', 'on', 'on'] },
      { id: 'member', title: 'Committee Member', text: 'Their own district: its turfs, walk lists and progress.', scope: ['on', 'on', '', '', '', ''] },
      { id: 'volunteer', title: 'Volunteer', text: 'Only the doors on their assigned route, on their phone, for that shift.', scope: ['part', '', '', '', '', ''] },
      { id: 'master', title: 'Network Admin', text: 'County totals only, such as doors knocked. Names and addresses stay with the county.', scope: ['', '', '', '', '', ''] },
    ];
    return `<section class="card" data-tour="field-privacy" style="margin-top:20px">
      <div class="card-head"><h3>Who sees what</h3><span class="spacer"></span><span class="small muted">Access follows each person’s role</span></div>
      <div class="card-body stack">
        <div class="f-roles">
          ${roles.map((r) => `<div class="f-role${ctx.role === r.id ? ' is-me' : ''}">
            <div class="row" style="gap:6px"><h4>${r.title}</h4>${ctx.role === r.id ? '<span class="badge badge-local">Viewing now</span>' : ''}</div>
            <div class="f-scope" aria-hidden="true">${r.scope.map((s) => `<i class="${s}"></i>`).join('')}</div>
            <p>${r.text}</p>
            ${ctx.role === r.id ? '' : `<button class="btn btn-sm" data-asrole="${r.id}">Preview this view</button>`}
          </div>`).join('')}
        </div>
        <p class="small muted" style="margin:0">Public visitors see none of the voter file. Each bar above stands for the county’s six turfs.</p>
        <div class="explain"><strong>Your voter file stays inside your county.</strong> Each county’s data lives in its own protected space, and every volunteer sees just the doors on their own route, so lists stay accurate and private.</div>
      </div>
    </section>`;
  }

  function renderMap(el, ctx) {
    const t = ctx.tenant;
    const st = S();
    const vt = volunteerTurf(ctx);
    if (vt && st.field_selTurf[ctx.tenantSlug] !== vt.id) st.field_selTurf[ctx.tenantSlug] = null;
    if (st.field_selTurf[ctx.tenantSlug] && !t.turfs.some((x) => x.id === st.field_selTurf[ctx.tenantSlug])) st.field_selTurf[ctx.tenantSlug] = null;

    el.innerHTML = `<div class="page">
      ${pageHead(ctx)}
      ${volunteerBanner(ctx)}
      <div class="f-main">
        <section class="card" data-tour="field-map">
          <div class="card-head"><h3>Turf map</h3><span class="small muted f-hide-m">Each dot is one household in the sample voter file</span><span class="spacer"></span>
            <button class="btn btn-primary btn-sm" data-go="field/list">Build walk list</button></div>
          ${filterBar()}
          <div class="f-mapwrap" data-mapwrap>${mapSVG(ctx)}</div>
          <div class="f-legend">
            ${PARTY_ORDER.map((p) => `<span><i style="background:${PARTY[p].color}"></i>${esc(PARTY[p].label)}</span>`).join('')}
            <span><svg width="22" height="14" aria-hidden="true"><rect x="1" y="1" width="20" height="12" rx="6" fill="#7C3AED" fill-opacity=".14" stroke="#7C3AED" stroke-dasharray="4 3"/></svg>Turf (click to select)</span>
          </div>
        </section>
        <aside class="f-side">
          <div data-stats>${turfStats(ctx)}</div>
          <div data-progress>${turfProgress(ctx)}</div>
          ${leaderboard(ctx)}
        </aside>
      </div>
      ${privacyPanel(ctx)}
    </div>`;

    const svg = el.querySelector('.f-map');
    function update() {
      const sel = st.field_selTurf[ctx.tenantSlug];
      let n = 0;
      el.querySelectorAll('.f-dot').forEach((d) => {
        const v = t.voters.find((x) => x.id === d.dataset.v);
        const ok = matches(ctx, v);
        d.classList.toggle('is-off', !ok);
        d.classList.toggle('out-sel', !!sel && v.turfId !== sel);
        if (ok && (!sel || v.turfId === sel)) n++;
      });
      svg.classList.toggle('has-sel', !!sel);
      el.querySelectorAll('.f-blob, .f-tlabel').forEach((b) => b.classList.toggle('is-sel', b.dataset.turf === sel));
      const tf = sel && t.turfs.find((x) => x.id === sel);
      el.querySelector('[data-count]').innerHTML = `<b>${n}</b> door${n === 1 ? '' : 's'} match${n === 1 ? 'es' : ''}${tf ? ' in ' + esc(tf.name) : ''}`;
      el.querySelector('[data-stats]').innerHTML = turfStats(ctx);
      el.querySelector('[data-progress]').innerHTML = turfProgress(ctx);
    }
    function selectTurf(id) {
      st.field_selTurf[ctx.tenantSlug] = st.field_selTurf[ctx.tenantSlug] === id ? null : id;
      update();
    }
    update();

    const f = st.field_filters;
    el.addEventListener('click', (e) => {
      const party = e.target.closest('[data-party]');
      if (party) {
        const p = party.dataset.party;
        f.parties = f.parties.includes(p) ? f.parties.filter((x) => x !== p) : f.parties.concat(p);
        party.classList.toggle('active', f.parties.includes(p));
        party.setAttribute('aria-pressed', f.parties.includes(p));
        update(); return;
      }
      const un = e.target.closest('[data-uncontacted]');
      if (un) { f.uncontacted = !f.uncontacted; un.classList.toggle('active', f.uncontacted); un.setAttribute('aria-pressed', f.uncontacted); update(); return; }
      const tb = e.target.closest('[data-turf]');
      if (tb && (tb.classList.contains('f-blob') || tb.classList.contains('f-prog'))) { selectTurf(tb.dataset.turf); return; }
      if (e.target.closest('[data-clear]')) { st.field_selTurf[ctx.tenantSlug] = null; update(); return; }
      const bf = e.target.closest('[data-buildfor]');
      if (bf) { st.field_builder[ctx.tenantSlug] = { turfId: bf.dataset.buildfor, built: null }; ctx.navigate('field/list'); return; }
      const go = e.target.closest('[data-go]');
      if (go) { ctx.navigate(go.dataset.go); return; }
      const ar = e.target.closest('[data-asrole]');
      if (ar) { App.setRole(ar.dataset.asrole); return; }
      if (e.target.closest('.f-map') && !e.target.closest('.f-blob, .f-dot') && st.field_selTurf[ctx.tenantSlug]) { st.field_selTurf[ctx.tenantSlug] = null; update(); }
    });
    el.addEventListener('keydown', (e) => {
      const b = e.target.closest && e.target.closest('.f-blob');
      if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectTurf(b.dataset.turf); }
    });
    el.addEventListener('input', (e) => {
      if (e.target.matches('[data-prop]')) {
        f.minProp = Number(e.target.value);
        el.querySelector('[data-propval]').textContent = f.minProp;
        update();
      }
    });
  }

  /* =========================================================
     WALK LISTS
     ========================================================= */
  function routeMap(ctx, route, opts) {
    opts = opts || {};
    if (!route.length) return '';
    const xs = route.map((v) => v.x * W), ys = route.map((v) => v.y * H);
    const pad = 34;
    let x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
    const aspect = opts.aspect || 1.5;
    let w = x1 - x0, h = y1 - y0;
    if (w / h < aspect) { const nw = h * aspect; x0 -= (nw - w) / 2; w = nw; } else { const nh = w / aspect; y0 -= (nh - h) / 2; h = nh; }
    const s = w / 600;
    const pts = route.map((v) => `${(v.x * W).toFixed(1)},${(v.y * H).toFixed(1)}`).join(' ');
    const col = turfColor(ctx.tenant, route[0].turfId);
    const cur = opts.current;
    const marks = route.map((v, i) => {
      const cx = (v.x * W).toFixed(1), cy = (v.y * H).toFixed(1);
      const isCur = cur === i, isDone = opts.doneIdx != null && i < opts.doneIdx;
      const r = (isCur ? 15 : 11) * s;
      const fill = isCur ? 'var(--accent)' : isDone ? '#9AA3AE' : 'var(--brand)';
      return `<g><circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="${fill}" stroke="#fff" stroke-width="${(2.5 * s).toFixed(1)}"/>
        <text x="${cx}" y="${cy}" dy=".35em" text-anchor="middle" font-family="var(--font-body)" font-weight="700" font-size="${((isCur ? 13 : 11) * s).toFixed(1)}" fill="#fff">${i + 1}</text></g>`;
    }).join('');
    return `<svg class="f-minimap" viewBox="${x0.toFixed(1)} ${y0.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" role="img" aria-label="Walking route through ${route.length} doors in order">
      ${baseLayer(ctx.tenantSlug)}
      <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="${(5 * s).toFixed(1)}" stroke-linejoin="round" stroke-linecap="round" stroke-opacity=".85"/>
      <polyline points="${pts}" fill="none" stroke="#fff" stroke-width="${(1.4 * s).toFixed(1)}" stroke-dasharray="${(4 * s).toFixed(1)} ${(6 * s).toFixed(1)}"/>
      ${marks}
    </svg>`;
  }

  function filterRowCompact() {
    const f = S().field_filters;
    return `<div class="f-field"><span class="f-flabel">Party</span>
        <div class="f-chipset">${PARTY_ORDER.map((p) => `<button class="chip${f.parties.includes(p) ? ' active' : ''}" data-party="${p}" aria-pressed="${f.parties.includes(p)}"><span class="f-sw" style="background:${PARTY[p].color}"></span>${esc(PARTY[p].short)}</button>`).join('')}</div></div>
      <div class="f-field"><label for="f-minprop">Turnout score (how often they vote, 0 to 100)</label>
        <select class="select" id="f-minprop" data-minprop>${[0, 30, 50, 70].map((n) => `<option value="${n}"${f.minProp === n ? ' selected' : ''}>${n ? n + ' or higher' : 'Any score'}</option>`).join('')}${[0, 30, 50, 70].includes(f.minProp) ? '' : `<option value="${f.minProp}" selected>${f.minProp} or higher</option>`}</select></div>
      <label class="toggle"><input type="checkbox" data-unc ${f.uncontacted ? 'checked' : ''}> Only doors not yet contacted</label>`;
  }

  function renderList(el, ctx) {
    const t = ctx.tenant;
    const st = S();
    const slug = ctx.tenantSlug;
    const vt = volunteerTurf(ctx);
    const b = st.field_builder[slug] = st.field_builder[slug] || { turfId: (vt || t.turfs[0]).id, built: null };
    if (vt) b.turfId = vt.id;
    if (!t.turfs.some((x) => x.id === b.turfId)) { b.turfId = t.turfs[0].id; b.built = null; }
    const turf = turfById(t, b.turfId);
    const pool = t.voters.filter((v) => v.turfId === turf.id && matches(ctx, v));
    const turfOpts = (vt ? [vt] : t.turfs).map((x) => `<option value="${esc(x.id)}"${x.id === turf.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
    const route = b.built ? b.built.voterIds.map((id) => t.voters.find((v) => v.id === id)).filter(Boolean) : [];
    const assignee = b.assignee || turf.volunteerId;
    const lists = st.field_lists.filter((l) => l.tenant === slug);

    let result;
    if (!route.length) {
      result = `<div class="card"><div class="f-empty">
        <svg width="54" height="54" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5l4-2 6 2 4-2v12l-4 2-6-2-4 2z"/><path d="M7 3v12M13 5v12"/></svg>
        <h3 style="color:var(--ink-2)">Your route appears here</h3>
        <p>Pick a turf and filters, then press <b>Build walk list</b>. The platform orders the doors into the shortest walking loop it can find.</p>
      </div></div>`;
    } else {
      const miles = routeMiles(route);
      const mins = Math.round(route.length * 4 + miles * 20);
      result = `<div class="card">
        <div class="card-head"><h3>${esc(turf.name)} · ${route.length} doors</h3><span class="spacer"></span>
          <span class="badge badge-ok">About ${miles.toFixed(1)} miles · ${mins} minutes</span></div>
        <div class="card-body stack">
          ${routeMap(ctx, route)}
          <div class="row" style="align-items:flex-end">
            <div class="f-field" style="flex:1 1 220px"><label for="f-assign">Assign to volunteer</label>
              <select class="select" id="f-assign" data-assign>${t.volunteers.map((v) => `<option value="${esc(v.id)}"${v.id === assignee ? ' selected' : ''}>${esc(v.name)}${v.id === turf.volunteerId ? ' (usual walker)' : ''}</option>`).join('')}</select></div>
            <button class="btn btn-primary" data-send>Send to phone</button>
          </div>
        </div>
        <div class="table-wrap" style="border-radius:0 0 var(--r-lg) var(--r-lg);border-width:1px 0 0">
          <table class="table f-doors"><thead><tr><th>Stop</th><th>Voter</th><th>Address</th><th>Party</th><th>Turnout score</th></tr></thead>
          <tbody>${route.map((v, i) => `<tr><td><span class="f-num">${i + 1}</span></td><td style="font-weight:600">${esc(v.first + ' ' + v.last)}</td><td>${esc(v.address)}<div class="small muted">${esc(v.city)} · Precinct ${esc(v.precinct)}</div></td><td>${partyBadge(v.party)}</td><td>${propMeter(v.propensity)}</td></tr>`).join('')}</tbody></table>
        </div>
      </div>`;
    }

    el.innerHTML = `<div class="page">
      ${pageHead(ctx)}
      ${volunteerBanner(ctx)}
      <div class="f-builder">
        <div class="stack">
          <div class="card">
            <div class="card-head"><h3>Walk list builder</h3></div>
            <div class="card-body stack">
              <div class="f-field"><label for="f-turf">Turf</label>
                <select class="select" id="f-turf" data-turfsel ${vt ? 'disabled' : ''}>${turfOpts}</select></div>
              ${filterRowCompact()}
              <div class="row" style="justify-content:space-between"><span class="small"><b style="font-size:1.1rem;color:var(--brand)">${pool.length}</b> of 20 sample households match</span></div>
              <button class="btn btn-primary" data-tour="field-build" data-build ${pool.length ? '' : 'disabled'}>Build walk list</button>
              ${pool.length ? '' : '<p class="small" style="color:var(--warn);margin:0">Widen the filters to include more doors.</p>'}
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Sent walk lists</h3><span class="spacer"></span><span class="badge">${lists.length}</span></div>
            <div class="card-body" style="padding:${lists.length ? '8px 16px' : '16px 20px'}">
              ${lists.length ? `<ul class="f-lb">${lists.map((l) => `<li><span class="f-sq" style="background:${turfColor(t, l.turfId)}"></span>
                <span class="f-lbname">${esc(turfById(t, l.turfId).name)}<br><span class="small muted" style="font-weight:400">${l.voterIds.length} doors · ${esc(volById(t, l.volunteerId).name)}</span></span>
                <button class="btn btn-ghost btn-sm" data-open="${esc(l.id)}">Open phone</button></li>`).join('')}</ul>`
                : '<p class="small muted" style="margin:0">Lists you send show up here, ready to open in the volunteer phone view.</p>'}
            </div>
          </div>
          <div class="explain"><strong>Hours saved every weekend.</strong> Cutting and printing walk lists used to take a precinct captain an evening. Here it takes one click, and the route lands on the volunteer’s phone.</div>
        </div>
        <div data-result>${result}</div>
      </div>
    </div>`;

    const rerender = () => renderList(el, ctx);
    el.onclick = (e) => {
      const party = e.target.closest('[data-party]');
      if (party) {
        const f = st.field_filters, p = party.dataset.party;
        f.parties = f.parties.includes(p) ? f.parties.filter((x) => x !== p) : f.parties.concat(p);
        rerender(); return;
      }
      if (e.target.closest('[data-build]')) {
        const ordered = orderRoute(pool);
        b.built = { turfId: turf.id, voterIds: ordered.map((v) => v.id) };
        b.assignee = turf.volunteerId;
        rerender();
        ctx.toast(`Walk list ready: ${ordered.length} doors in walking order.`, 'ok');
        const r = el.querySelector('[data-result]');
        if (r && window.innerWidth < 1000) r.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (e.target.closest('[data-send]')) {
        const vol = volById(t, b.assignee || turf.volunteerId);
        const id = 'wl-' + slug + '-' + (st.field_lists.length + 1);
        st.field_lists.unshift({ id, tenant: slug, turfId: b.built.turfId, voterIds: b.built.voterIds.slice(), volunteerId: vol.id });
        st.field_active[slug] = id;
        rerender();
        ctx.toast(`Sent to ${vol.name}’s phone`, 'ok');
        return;
      }
      const op = e.target.closest('[data-open]');
      if (op) { st.field_active[slug] = op.dataset.open; ctx.navigate('field/canvass'); }
    };
    el.onchange = (e) => {
      if (e.target.matches('[data-turfsel]')) { b.turfId = e.target.value; b.built = null; b.assignee = null; rerender(); }
      else if (e.target.matches('[data-minprop]')) { st.field_filters.minProp = Number(e.target.value); rerender(); }
      else if (e.target.matches('[data-unc]')) { st.field_filters.uncontacted = e.target.checked; rerender(); }
      else if (e.target.matches('[data-assign]')) { b.assignee = e.target.value; }
    };
  }

  /* =========================================================
     VOLUNTEER PHONE VIEW
     ========================================================= */
  function activeList(ctx) {
    const t = ctx.tenant, slug = ctx.tenantSlug, st = S();
    const vt = volunteerTurf(ctx);
    let l = st.field_lists.find((x) => x.id === st.field_active[slug] && x.tenant === slug);
    if (l && vt && l.turfId !== vt.id) l = null;
    if (l) return l;
    const turf = vt || t.turfs[0];
    const fresh = t.voters.filter((v) => v.turfId === turf.id && !baseContacted(t, v));
    const pick = (fresh.length >= 6 ? fresh : t.voters.filter((v) => v.turfId === turf.id));
    return { id: 'default-' + slug, tenant: slug, turfId: turf.id, voterIds: orderRoute(pick).slice(0, 8).map((v) => v.id), volunteerId: turf.volunteerId };
  }

  function canvassState(ctx, list) {
    const st = S();
    let cs = st.field_canvass[ctx.tenantSlug];
    if (!cs || cs.listId !== list.id) {
      cs = st.field_canvass[ctx.tenantSlug] = { listId: list.id, volunteerId: list.volunteerId, idx: 0, results: {}, draft: {}, offline: false, syncing: false, done: false, seq: 0, flash: false };
    }
    return cs;
  }

  function doorHistory(t, v) {
    const r = U.seeded(v.id + ':h');
    const voted = Math.max(0, Math.min(4, Math.round(v.propensity / 25 + r() - 0.5)));
    const since = 2008 + Math.floor(r() * 16);
    const prior = baseContacted(t, v) ? 'Visited in September: left literature' : 'First visit from the committee';
    return [`Voted in ${voted} of the last 4 elections`, `At this address since ${since}`, prior];
  }

  function ring(done, total) {
    const r = 19, c = 2 * Math.PI * r, pct = total ? done / total : 0;
    return `<svg class="ph-ring" width="52" height="52" viewBox="0 0 52 52" role="img" aria-label="${done} of ${total} doors done">
      <circle cx="26" cy="26" r="${r}" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="6"/>
      <circle cx="26" cy="26" r="${r}" fill="none" stroke="var(--brand-ink)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 26 26)"/>
      <text x="26" y="26" dy=".36em" text-anchor="middle" font-family="var(--font-head)" font-weight="800" font-size="${pct >= 1 ? 11.5 : 13}" fill="var(--brand-ink)">${Math.round(pct * 100)}%</text></svg>`;
  }

  function tally(results) {
    const rs = Object.values(results);
    return {
      knocked: rs.length,
      talked: rs.filter((r) => r.outcome === 'talked').length,
      supporters: rs.filter((r) => r.outcome === 'talked' && (r.q1 === 'yes' || r.q1 === 'lean')).length,
      signs: rs.filter((r) => r.outcome === 'talked' && r.q2 === 'yes').length,
      vols: rs.filter((r) => r.outcome === 'talked' && r.q3 === 'yes').length,
    };
  }

  function phoneHTML(ctx, list, cs) {
    const t = ctx.tenant;
    const turf = turfById(t, list.turfId);
    const vol = volById(t, list.volunteerId);
    const route = list.voterIds.map((id) => t.voters.find((v) => v.id === id)).filter(Boolean);
    const total = route.length;
    const knocked = Object.keys(cs.results).filter((k) => list.voterIds.includes(k)).length;
    const unsynced = Object.values(cs.results).filter((r) => !r.synced).length;
    const cand = candidate(t);

    const status = `<div class="ph-status" aria-hidden="true"><span>5:42 PM</span><span>${cs.offline ? 'No signal' : '5G'} · 82%</span></div>`;
    const head = `<div class="ph-head">${ring(knocked, total)}
      <div style="min-width:0"><h3>${esc(turf.name)}</h3>
      <div class="small">${esc(vol.name)} · ${cs.done ? (knocked >= total ? 'Route complete' : 'Shift ended') : `${total - knocked} door${total - knocked === 1 ? '' : 's'} left`}</div></div></div>`;
    const off = `<label class="ph-off" data-tour="field-offline"><input type="checkbox" class="toggle" data-offline ${cs.offline ? 'checked' : ''}>
      <span>Offline mode <span class="small muted" style="font-weight:400">(try it: no signal on the block)</span></span></label>
      ${cs.offline ? `<div class="ph-offbanner" role="status"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="flex:none;margin-top:2px"><path d="M2 7.5a12 12 0 0 1 16 0M5 10.5a8 8 0 0 1 10 0M8 13.5a4 4 0 0 1 4 0M3 3l14 14"/></svg><span>Offline — saved on this phone, sends when back online.${unsynced ? ` ${unsynced} result${unsynced === 1 ? '' : 's'} waiting.` : ''}</span></div>` : ''}
      ${cs.syncing ? `<div class="ph-syncbanner" role="status"><span class="spinner" aria-hidden="true"></span>Back online. Sending ${cs.syncing} saved result${cs.syncing === 1 ? '' : 's'}…</div>` : ''}`;

    if (cs.done) {
      const s = tally(cs.results);
      return `${status}${head}${off}<div class="ph-done">
        <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="var(--ok-soft)"/><path d="M20 33l8 8 16-17" fill="none" stroke="var(--ok)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <h3 style="margin:0">Shift complete. Thank you, ${esc(vol.name.split(' ')[0])}!</h3>
        <div class="f-stats">
          <div class="f-stat"><b>${s.knocked}</b><span>Doors knocked</span></div>
          <div class="f-stat"><b>${s.talked}</b><span>Conversations</span></div>
          <div class="f-stat"><b>${s.supporters}</b><span>Supporters found</span></div>
          <div class="f-stat"><b>${s.signs}</b><span>Yard signs requested</span></div>
        </div>
        ${unsynced ? `<p class="small" style="color:var(--warn);margin:0">${unsynced} result${unsynced === 1 ? '' : 's'} saved on this phone. Turn off offline mode to send them.</p>` : '<p class="small muted" style="margin:0">Every result is already at headquarters.</p>'}
        <button class="btn btn-primary" data-restart style="width:100%">Walk this route again</button>
        <button class="btn" data-go="field/list" style="width:100%">Build another walk list</button>
      </div>`;
    }

    const v = route[cs.idx];
    const res = cs.results[v.id];
    const draft = Object.assign({}, cs.draft[v.id] || {}, res || {});
    const hist = doorHistory(t, v);
    const survey = SURVEY.map((q) => {
      const label = q.id === 'q1' ? `Will you support ${cand.name} for ${cand.office}?` : q.q;
      return `<div><p class="ph-q">${esc(label)}</p><div class="ph-opts">${q.options.map(([val, l]) => `<button class="chip${draft[q.id] === val ? ' active' : ''}" data-q="${q.id}" data-val="${val}" aria-pressed="${draft[q.id] === val}">${esc(l)}</button>`).join('')}</div></div>`;
    }).join('');
    return `${status}${head}${off}
      <div class="ph-body">
        <div class="ph-card">
          <div class="row" style="gap:8px;margin-bottom:6px"><span class="f-num">${cs.idx + 1}</span><span class="small muted">Door ${cs.idx + 1} of ${total}</span><span class="spacer"></span>${partyBadge(v.party)}</div>
          <h4>${esc(v.first + ' ' + v.last)}</h4>
          <div style="font-weight:600">${esc(v.address)}</div>
          <div class="small muted">${esc(v.city)} · Precinct ${esc(v.precinct)} · Turnout score ${v.propensity}</div>
          <ul class="small" style="margin:6px 0 0;padding-left:18px;color:var(--ink-2)">${hist.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
        </div>
        <div class="ph-card">
          <p class="ph-q">How did this door go?</p>
          <div class="ph-outs">${OUTCOMES.map((o) => `<button class="ph-out${res && res.outcome === o.id ? ' is-on' : ''}" data-outcome="${o.id}" aria-pressed="${!!(res && res.outcome === o.id)}">${I(o.icon)}${o.label}</button>`).join('')}</div>
          ${res ? `<div class="ph-saved${res.synced ? '' : ' is-wait'}" style="margin-top:10px">${res.synced ? '✓ Sent to headquarters' : '● Saved on this phone'}</div>` : ''}
        </div>
        <div class="ph-card stack" style="gap:12px">
          <div class="small muted" style="font-weight:600">Survey: ask when you talk with them</div>
          ${survey}
        </div>
        <div class="small muted" style="font-weight:600;margin-bottom:-4px">Your route</div>
        ${routeMap(ctx, route, { current: cs.idx, doneIdx: cs.idx, aspect: 1.6 })}
        <button class="btn btn-ghost btn-sm" data-finish style="align-self:center">End shift early</button>
        <div class="ph-nav">
          <button class="btn" data-prev ${cs.idx === 0 ? 'disabled' : ''} aria-label="Previous door">Back</button>
          <button class="btn btn-primary" data-next>${cs.idx === total - 1 ? 'Finish route' : 'Next door →'}</button>
        </div>
      </div>`;
  }

  function hqHTML(ctx, list, cs) {
    const t = ctx.tenant;
    const turf = turfById(t, list.turfId);
    const syn = {};
    Object.entries(cs.results).forEach(([k, r]) => { if (r.synced) syn[k] = r; });
    const s = tally(syn);
    const r = U.seeded('hq:' + ctx.tenantSlug);
    const sumDone = t.turfs.reduce((a, x) => a + x.done, 0);
    const base = { knocked: Math.round(sumDone * 0.07), talked: 0, supporters: 0, signs: 3 + Math.floor(r() * 4), vols: 1 + Math.floor(r() * 3) };
    base.talked = Math.round(base.knocked * 0.41);
    base.supporters = Math.round(base.talked * 0.52);
    const unsynced = Object.values(cs.results).filter((x) => !x.synced).length;
    const doneTurf = Math.min(turf.doors, turf.done + extraDoorsForTurf(ctx, turf.id));
    const pct = Math.round(doneTurf / turf.doors * 100);
    const k = (key, label) => `<div class="hq-kpi${cs.flash ? ' flash' : ''}" data-k="${key}"><b>${U.fmtNum(base[key] + s[key])}</b><span>${label}</span></div>`;

    // live feed: newest phone results first, then seeded activity from other walkers
    const fresh = Object.entries(syn).sort((a, b) => b[1].at - a[1].at).slice(0, 4).map(([vid, res], i) => {
      const v = t.voters.find((x) => x.id === vid);
      const extra = res.outcome === 'talked' && res.q1 ? ` · ${SURVEY[0].options.find((o) => o[0] === res.q1)[1]}` : '';
      return `<li class="${i === 0 && cs.flash ? 'is-new' : ''}">${U.avatar(volById(t, list.volunteerId).name, 26)}<div style="flex:1;min-width:0"><b>${esc(volById(t, list.volunteerId).name.split(' ')[0])}</b> · ${esc(v ? v.address : '')}<br><span class="small">${esc(OUT_LABEL[res.outcome])}${esc(extra)}</span></div><span class="small muted">just now</span></li>`;
    });
    const others = t.volunteers.filter((v) => v.id !== list.volunteerId).slice(0, 3).map((v, i) => {
      const tf = t.turfs.find((x) => x.volunteerId === v.id) || t.turfs[(i + 1) % t.turfs.length];
      const out = ['Talked · Strong yes', 'Not home', 'Left literature'][i];
      return `<li>${U.avatar(v.name, 26)}<div style="flex:1;min-width:0"><b>${esc(v.name.split(' ')[0])}</b> · ${esc(tf.name)}<br><span class="small">${out}</span></div><span class="small muted">${U.timeAgo(3 + i * 5)}</span></li>`;
    });
    return `<div class="card">
      <div class="card-head hq-head"><h3>Headquarters dashboard</h3><span class="spacer"></span>
        <span class="hq-live${cs.offline || cs.syncing ? ' is-wait' : ''}">${cs.syncing ? 'Receiving…' : cs.offline ? 'Waiting for phone' : 'Live'}</span></div>
      <div class="card-body stack" style="gap:14px">
        <p class="small muted" style="margin:0">What the county chair sees at the office tonight, updating as ${esc(volById(t, list.volunteerId).name)} records each door.</p>
        <div class="hq-kpis">
          ${k('knocked', 'Doors knocked today')}${k('talked', 'Conversations')}${k('supporters', 'Supporters found')}
          ${k('signs', 'Yard signs requested')}${k('vols', 'New volunteer leads')}
          <div class="hq-kpi"><b>${pct}%</b><span>${esc(turf.name)} done</span></div>
        </div>
        ${unsynced ? `<div class="hq-pending">${unsynced} result${unsynced === 1 ? ' is' : 's are'} saved on ${esc(volById(t, list.volunteerId).name.split(' ')[0])}’s phone, ready to send the moment it reconnects.</div>` : ''}
        <div><div class="small" style="font-weight:700;margin-bottom:2px">Live activity</div>
          <ul class="hq-feed">${fresh.concat(others).join('')}</ul></div>
      </div>
    </div>`;
  }

  function renderCanvass(el, ctx) {
    const t = ctx.tenant;
    const list = activeList(ctx);
    const cs = canvassState(ctx, list);
    const cand = candidate(t);
    const isCustom = !list.id.startsWith('default-');

    el.innerHTML = `<div class="page">
      ${pageHead(ctx)}
      ${volunteerBanner(ctx)}
      <div class="f-canvass">
        <div class="phone" data-tour="field-phone"><div class="phone-screen" data-phone></div></div>
        <div class="f-right">
          <div data-hq></div>
          <div class="card">
            <div class="card-head"><h3>Talking points for tonight</h3></div>
            <div class="card-body">
              <ul class="f-tp" style="margin:0;padding-left:20px">
                <li>Introduce yourself as a neighbor volunteering with ${esc(t.shortName || t.name)}.</li>
                <li>${esc(cand.name)} is running for ${esc(cand.office)}${cand.slogan ? `: “${esc(cand.slogan)}”` : '.'}</li>
                ${(cand.issues || []).slice(0, 2).map((x) => `<li>${esc(x)}</li>`).join('')}
                <li>Ask the three survey questions, thank them, and leave a door hanger.</li>
              </ul>
              <p class="small muted" style="margin:12px 0 0">${isCustom ? 'Route from the walk list you sent.' : 'Sample route. Build your own on the Walk lists tab and it opens here.'}</p>
            </div>
          </div>
          <div class="explain"><strong>Works where the signal drops.</strong> Volunteers keep knocking with no bars. Results save on the phone and reach headquarters on their own once it reconnects, so no clipboard data entry on Sunday night.</div>
        </div>
      </div>
    </div>`;

    const phone = el.querySelector('[data-phone]');
    const hq = el.querySelector('[data-hq]');
    function paint(scrollTop) {
      const keep = scrollTop == null ? phone.scrollTop : scrollTop;
      phone.innerHTML = phoneHTML(ctx, list, cs);
      hq.innerHTML = hqHTML(ctx, list, cs);
      phone.scrollTop = keep;
      if (cs.flash) {
        cs.flash = false;
        setTimeout(() => { hq.querySelectorAll('.hq-kpi.flash').forEach((k) => k.classList.remove('flash')); }, 900);
      }
    }
    paint(0);

    function currentVoter() { return list.voterIds[cs.idx]; }
    function record(vid, patch) {
      const prev = cs.results[vid] || {};
      cs.results[vid] = Object.assign({}, cs.draft[vid] || {}, prev, patch, { synced: !cs.offline && !cs.syncing, at: ++cs.seq });
      if (!cs.offline && !cs.syncing) cs.flash = true;
    }

    phone.addEventListener('click', (e) => {
      const q = e.target.closest('[data-q]');
      if (q) {
        const vid = currentVoter();
        cs.draft[vid] = cs.draft[vid] || {};
        cs.draft[vid][q.dataset.q] = q.dataset.val;
        if (cs.results[vid]) record(vid, { [q.dataset.q]: q.dataset.val, outcome: cs.results[vid].outcome });
        paint(); return;
      }
      const o = e.target.closest('[data-outcome]');
      if (o) {
        const vid = currentVoter();
        record(vid, { outcome: o.dataset.outcome });
        paint();
        if (!cs.offline) ctx.toast(`${OUT_LABEL[o.dataset.outcome]} recorded. Headquarters updated.`, 'ok');
        return;
      }
      if (e.target.closest('[data-next]')) {
        if (!cs.results[currentVoter()]) { ctx.toast('Tap how this door went first, so headquarters knows.', 'warn'); return; }
        if (cs.idx >= list.voterIds.length - 1) { cs.done = true; } else cs.idx++;
        paint(0); return;
      }
      if (e.target.closest('[data-prev]')) { if (cs.idx > 0) cs.idx--; paint(0); return; }
      if (e.target.closest('[data-finish]')) { cs.done = true; paint(0); ctx.toast('Shift ended. Results are saved.', 'info'); return; }
      if (e.target.closest('[data-restart]')) {
        Object.assign(cs, { idx: 0, results: {}, draft: {}, done: false, offline: false, syncing: false });
        paint(0); ctx.toast('Route reset for another walk.', 'info'); return;
      }
      const go = e.target.closest('[data-go]');
      if (go) ctx.navigate(go.dataset.go);
    });
    phone.addEventListener('change', (e) => {
      if (!e.target.matches('[data-offline]')) return;
      cs.offline = e.target.checked;
      if (cs.offline) { paint(); ctx.toast('Offline: results now save on the phone.', 'warn'); return; }
      const waiting = Object.values(cs.results).filter((r) => !r.synced);
      if (!waiting.length) { paint(); ctx.toast('Back online.', 'info'); return; }
      cs.syncing = waiting.length;
      paint();
      const slug = ctx.tenantSlug;
      setTimeout(() => {
        waiting.forEach((r) => { r.synced = true; });
        cs.syncing = false;
        cs.flash = true;
        if (phone.isConnected && App.ctx.tenantSlug === slug) paint();
        ctx.toast(`${waiting.length} saved result${waiting.length === 1 ? '' : 's'} reached headquarters.`, 'ok');
      }, 1400);
    });
  }

  /* ---------------- register ---------------- */
  App.register({
    id: 'field',
    title: 'Field Organizer',
    group: 'Field & Governance',
    icon: ICON,
    blurb: 'Cut precinct turf, hand out walk lists and track doors knocked.',
    render(el, ctx) {
      injectStyle();
      el.classList.add('scr-field');
      const t = ctx.tenant;
      if (!t || !t.turfs || !t.voters) { el.innerHTML = '<div class="page"><div class="card"><div class="card-body">Field data is loading.</div></div></div>'; return; }
      if (ctx.sub === 'list') renderList(el, ctx);
      else if (ctx.sub === 'canvass') renderCanvass(el, ctx);
      else renderMap(el, Object.assign({}, ctx, { sub: '' }));
    },
  });
})();
