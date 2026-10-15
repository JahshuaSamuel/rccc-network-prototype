/* screens/governance.js — Meetings & Voting (Agent 8)
   Sub-routes: '' (Live meeting), 'ballots', 'proxies'.
   All simulation is deterministic: scripted joiners, seeded vote assignment, hash-based receipts. */
(function () {
  'use strict';
  if (!window.App) return;

  const U = App.util;
  const esc = U.esc;
  const I = (d, s) => `<svg width="${s || 20}" height="${s || 20}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = I('<path d="M4 8h12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M7 8V5h6v3M8.5 12h3"/>');
  const IC = {
    mic: I('<rect x="7.5" y="3" width="5" height="9" rx="2.5"/><path d="M5 10a5 5 0 0 0 10 0M10 15v2.5"/>'),
    micOff: I('<rect x="7.5" y="3" width="5" height="9" rx="2.5"/><path d="M5 10a5 5 0 0 0 10 0M10 15v2.5M3.5 3.5l13 13"/>'),
    cam: I('<rect x="2.5" y="5.5" width="10.5" height="9" rx="2"/><path d="M13 9l4.5-2.5v7L13 11"/>'),
    camOff: I('<rect x="2.5" y="5.5" width="10.5" height="9" rx="2"/><path d="M13 9l4.5-2.5v7L13 11M3 3l14 14"/>'),
    leave: I('<path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M12 6.5L15.5 10 12 13.5M15.5 10H8"/>'),
    check: I('<path d="M4.5 10.5l3.5 3.5 7.5-8"/>', 16),
    lock: I('<rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>', 16),
    shield: I('<path d="M10 2.5l6 2.5v4.5c0 4-2.6 6.8-6 8-3.4-1.2-6-4-6-8V5z"/><path d="M7.3 10l2 2 3.6-4"/>'),
    users: I('<circle cx="7" cy="7" r="2.5"/><circle cx="13.5" cy="8" r="2"/><path d="M2.5 16c.6-2.8 2.4-4.2 4.5-4.2s3.9 1.4 4.5 4.2M11.5 12.3c2.3-.4 4.2.8 5 3.7"/>', 18),
    clock: I('<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2"/>', 16),
  };

  /* ---------------- helpers ---------------- */
  function fnv(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function receiptCode(seed) {
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let h = fnv(seed), h2 = fnv(seed + '#2'), out = '';
    for (let i = 0; i < 10; i++) {
      const src = i < 5 ? h : h2;
      out += A[(src >>> ((i % 5) * 6)) % A.length];
    }
    return `RC-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
  }
  function clockLabel(min) {
    const h = 7 + Math.floor(min / 60), m = min % 60;
    return `${h}:${String(m).padStart(2, '0')} PM`;
  }
  function fmtDate(iso) {
    try {
      return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    } catch (e) { return iso; }
  }
  const fmtW = (n) => (Math.round(n * 10) / 10).toString();
  function seatedOf(t) { return (t.members || []).filter((m) => m.seated); }
  function secretaryOf(t) {
    const s = (t.members || []).find((m) => m.title === 'Secretary');
    return s ? s.name : (t.chair ? t.chair.name : 'the Secretary');
  }
  function shuffled(arr, seed) {
    const rng = U.seeded(seed);
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const canVote = (role) => role === 'board' || role === 'member';
  const canClose = (role) => role === 'board';

  /* ---------------- state (per tenant) ---------------- */
  function audit(slug) {
    App.state.gov_audit = App.state.gov_audit || {};
    return (App.state.gov_audit[slug] = App.state.gov_audit[slug] || []);
  }
  function addAudit(slug, S, text, kind, atMin) {
    if (atMin == null) { S.clock += 2; atMin = S.clock; } else S.clock = Math.max(S.clock, atMin);
    audit(slug).push({ tenant: slug, time: clockLabel(atMin), text, kind: kind || 'info' });
  }

  function initState(t) {
    const seated = seatedOf(t);
    const proxies = (t.proxies || []).map((p) => Object.assign({}, p));
    const grantors = new Set(proxies.map((p) => p.grantor));
    const holders = proxies.map((p) => p.holder);
    const pool = seated.filter((m) => !grantors.has(m.name));
    const execs = pool.filter((m) => m.role === 'EXEC_BOARD').map((m) => m.name);
    const initial = [];
    execs.concat(holders).forEach((n) => { if (!initial.includes(n) && pool.find((m) => m.name === n)) initial.push(n); });
    pool.forEach((m) => { if (initial.length < 9 && !initial.includes(m.name)) initial.push(m.name); });
    const rest = pool.map((m) => m.name).filter((n) => !initial.includes(n));
    const joiners = rest.slice(0, 6);

    const ballots = {};
    (t.ballots || []).forEach((b) => {
      ballots[b.id] = { status: b.status, tally: Object.assign({}, b.tally), voted: false, choice: null, sel: null, receipt: null, certified: false };
    });
    const S = {
      present: initial, joiners, joining: false, quorumAt: null,
      proxies, ballots, agendaIdx: 0, adjourned: false,
      muted: false, camOff: false, left: false, lastJoined: null, clock: 0,
    };
    const log = audit(t.slug);
    if (!log.length) {
      log.push({ tenant: t.slug, time: clockLabel(0), text: `Meeting opened by ${t.chair ? t.chair.name : 'the Chair'} (${t.meeting.provider || 'Zoom'} video, embedded)`, kind: 'info' });
      proxies.filter((p) => p.verified).forEach((p) => log.push({ tenant: t.slug, time: clockLabel(0), text: `Proxy on file and verified: ${p.grantor} → ${p.holder}`, kind: 'proxy' }));
    }
    return S;
  }
  function getState(t) {
    App.state.gov = App.state.gov || {};
    if (!App.state.gov[t.slug]) App.state.gov[t.slug] = initState(t);
    return App.state.gov[t.slug];
  }
  function resetState(t) {
    App.state.gov_audit = App.state.gov_audit || {};
    App.state.gov_audit[t.slug] = [];
    App.state.gov[t.slug] = initState(t);
  }

  function quorumInfo(t, S) {
    const seated = seatedOf(t).length;
    const need = Math.floor(seated / 2) + 1;
    const inRoom = S.present.length;
    const viaProxy = S.proxies.filter((p) => p.verified && S.present.includes(p.holder)).length;
    const present = inRoom + viaProxy;
    return { seated, need, inRoom, viaProxy, present, reached: present >= need };
  }
  function checkQuorum(t, S) {
    const q = quorumInfo(t, S);
    if (q.reached && !S.quorumAt) {
      const at = Math.max(4, S.clock + 1);
      S.quorumAt = clockLabel(at);
      addAudit(t.slug, S, `Quorum reached: ${q.present} of ${q.seated} seated members present (${q.need} needed)`, 'quorum', at);
      return true;
    }
    return false;
  }

  /* repaint only while this screen is showing */
  function repaint() { if (App.route.id === 'governance') App.rerender(); }

  function simulateJoin(t, ctx) {
    const S = getState(t);
    if (S.joining || !S.joiners.length) return;
    S.joining = true;
    repaint();
    const slug = t.slug;
    const step = () => {
      const st = App.state.gov && App.state.gov[slug];
      if (!st || st !== S) return; // reset happened
      const n = S.joiners.shift();
      if (n) { S.present.push(n); S.lastJoined = n; }
      const crossed = checkQuorum(t, S);
      if (crossed) App.toast(`Quorum reached at ${S.quorumAt}. The open ballots are unlocked.`, 'ok');
      if (S.joiners.length) { setTimeout(step, 500); } else { S.joining = false; S.lastJoined = null; }
      repaint();
    };
    setTimeout(step, 500);
  }

  /* deterministic per-member vote assignment from a tally */
  function assignVotes(t, b, tally) {
    const seated = shuffled(seatedOf(t), b.id);
    const halves = seated.filter((m) => m.weight === 0.5);
    let fulls = seated.filter((m) => m.weight !== 0.5);
    const out = {};
    b.options.forEach((o) => {
      let need = Number(tally[o.id] || 0);
      if (b.type === 'WEIGHTED' && need % 1 !== 0 && halves.length) { out[halves.shift().name] = o.id; need -= 0.5; }
      for (let i = 0; i < Math.round(need) && fulls.length; i++) out[fulls.shift().name] = o.id;
    });
    return out; // name -> optionId; missing = did not vote
  }

  /* ---------------- styles ---------------- */
  function injectStyles() {
    if (document.getElementById('gov-styles')) return;
    const s = document.createElement('style');
    s.id = 'gov-styles';
    s.textContent = `
.scr-gov .gov-tab-count { display:inline-block; margin-left:6px; font-size:12.5px; background:var(--surface-2); border:1px solid var(--line); border-radius:999px; padding:0 7px; color:var(--ink-2); }
.scr-gov .gov-live { display:grid; grid-template-columns: minmax(0,1.65fr) minmax(0,1fr); gap:20px; align-items:start; }
@media (max-width: 1000px) { .scr-gov .gov-live { grid-template-columns: minmax(0,1fr); } }
.scr-gov .gov-mhead { display:flex; flex-wrap:wrap; gap:10px 18px; align-items:center; }
.scr-gov .gov-mhead h2 { margin:0; font-size:1.3rem; }
.scr-gov .gov-meta { display:flex; flex-wrap:wrap; gap:6px 16px; color:var(--ink-2); font-size:15px; }
.scr-gov .gov-meta span { display:inline-flex; align-items:center; gap:6px; }
.scr-gov .gov-video { background:#0F1722; border-radius:var(--r-lg); overflow:hidden; color:#E8EDF3; }
.scr-gov .gov-vbar { display:flex; align-items:center; gap:8px; padding:10px 14px; font-size:13.5px; background:#0A111A; flex-wrap:wrap; }
.scr-gov .gov-live-dot { width:9px; height:9px; border-radius:50%; background:#E5484D; box-shadow:0 0 0 3px rgba(229,72,77,.25); }
.scr-gov .gov-vbar .gov-prov { margin-left:auto; opacity:.8; }
.scr-gov .gov-tiles { display:grid; grid-template-columns:repeat(auto-fill, minmax(118px, 1fr)); gap:8px; padding:12px; min-height:260px; align-content:start; }
.scr-gov .gov-tile { position:relative; background:#1C2736; border-radius:10px; aspect-ratio: 4 / 3; display:flex; align-items:center; justify-content:center; border:2px solid transparent; min-width:0; }
.scr-gov .gov-tile .avatar { width:44px; height:44px; }
.scr-gov .gov-tile.is-speaking { border-color:#5BD08A; animation: gov-pulse 1.4s ease-in-out infinite; }
.scr-gov .gov-tile.is-new { animation: gov-in .45s ease-out; }
.scr-gov .gov-tile.is-you { background:#243247; }
.scr-gov .gov-tname { position:absolute; left:6px; right:6px; bottom:5px; font-size:12.5px; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#E8EDF3; text-shadow:0 1px 2px rgba(0,0,0,.6); }
.scr-gov .gov-ttag { position:absolute; top:5px; left:6px; font-size:11.5px; font-weight:700; background:rgba(91,208,138,.18); color:#8DE0AE; border-radius:5px; padding:1px 6px; }
.scr-gov .gov-tile.more { font-weight:700; font-size:15px; color:#B9C4D2; }
@keyframes gov-pulse { 0%,100% { box-shadow:0 0 0 0 rgba(91,208,138,.55); } 50% { box-shadow:0 0 0 5px rgba(91,208,138,.12); } }
@keyframes gov-in { from { opacity:0; transform:scale(.85); } to { opacity:1; transform:none; } }
.scr-gov .gov-controls { display:flex; justify-content:center; gap:10px; padding:12px; background:#0A111A; flex-wrap:wrap; }
.scr-gov .gov-cbtn { display:inline-flex; align-items:center; gap:8px; min-height:42px; padding:8px 16px; border-radius:999px; border:1px solid #34445A; background:#1C2736; color:#E8EDF3; font:600 14.5px/1 var(--font-body); cursor:pointer; }
.scr-gov .gov-cbtn:hover { background:#26354A; }
.scr-gov .gov-cbtn.is-off { background:#3A2228; border-color:#6B2E38; color:#FFC9CF; }
.scr-gov .gov-cbtn.leave { background:#C93A3F; border-color:#C93A3F; color:#fff; }
.scr-gov .gov-cbtn.leave:hover { background:#A92F34; }
.scr-gov .gov-left { padding:56px 20px; text-align:center; }
.scr-gov .gov-left h3 { color:#fff; }
.scr-gov .gov-gauge { display:flex; gap:18px; align-items:center; flex-wrap:wrap; }
.scr-gov .gov-gauge svg { flex:none; }
.scr-gov .gov-gauge-txt { flex:1 1 160px; min-width:0; }
.scr-gov .gov-big { font-family:var(--font-head); font-stretch:80%; font-weight:800; font-size:1.3rem; line-height:1.15; }
.scr-gov .gov-qstate { margin-top:14px; padding:10px 12px; border-radius:var(--r); font-weight:600; font-size:15px; display:flex; gap:8px; align-items:center; }
.scr-gov .gov-qstate.ok { background:var(--ok-soft); color:var(--ok); }
.scr-gov .gov-qstate.warn { background:var(--warn-soft); color:var(--warn); }
.scr-gov .gov-agenda { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; }
.scr-gov .gov-agenda li { display:flex; gap:10px; align-items:flex-start; padding:9px 10px; border-radius:var(--r-sm); border:1px solid transparent; font-size:15px; }
.scr-gov .gov-agenda .gov-num { flex:none; width:24px; height:24px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; background:var(--surface-2); border:1px solid var(--line); color:var(--ink-2); }
.scr-gov .gov-agenda li.done { color:var(--ink-3); }
.scr-gov .gov-agenda li.done .gov-num { background:var(--ok-soft); color:var(--ok); border-color:transparent; }
.scr-gov .gov-agenda li.current { background:color-mix(in srgb, var(--brand) 8%, white); border-color:color-mix(in srgb, var(--brand) 30%, white); font-weight:600; color:var(--ink); }
.scr-gov .gov-agenda li.current .gov-num { background:var(--brand); color:var(--brand-ink); border-color:var(--brand); }
.scr-gov .gov-now { font-size:12px; font-weight:700; color:var(--accent); display:block; letter-spacing:.02em; }
.scr-gov .gov-opts { display:flex; flex-direction:column; gap:8px; }
.scr-gov .gov-opt { display:flex; align-items:center; gap:12px; width:100%; text-align:left; padding:12px 14px; min-height:48px; border:1.5px solid var(--line-strong); border-radius:var(--r); background:var(--surface); font:600 15.5px/1.3 var(--font-body); color:var(--ink); cursor:pointer; }
.scr-gov .gov-opt:hover { border-color:var(--brand); }
.scr-gov .gov-opt .gov-radio { width:20px; height:20px; border-radius:50%; border:2px solid var(--line-strong); flex:none; position:relative; }
.scr-gov .gov-opt.sel { border-color:var(--brand); background:color-mix(in srgb, var(--brand) 7%, white); }
.scr-gov .gov-opt.sel .gov-radio { border-color:var(--brand); }
.scr-gov .gov-opt.sel .gov-radio::after { content:''; position:absolute; inset:3px; border-radius:50%; background:var(--brand); }
.scr-gov .gov-opt[aria-disabled="true"] { opacity:.55; cursor:not-allowed; }
.scr-gov .gov-note { display:flex; gap:10px; align-items:flex-start; padding:12px 14px; border-radius:var(--r); background:var(--info-soft); color:var(--info); font-size:15px; font-weight:500; }
.scr-gov .gov-note.warn { background:var(--warn-soft); color:var(--warn); }
.scr-gov .gov-note svg { flex:none; margin-top:2px; }
.scr-gov .gov-turnout { height:10px; background:var(--surface-2); border:1px solid var(--line); border-radius:999px; overflow:hidden; }
.scr-gov .gov-turnout > span { display:block; height:100%; background:var(--brand); border-radius:999px; transition:width .4s ease; }
.scr-gov .gov-slot { border:2px dashed var(--line-strong); border-radius:var(--r-lg); padding:18px; background:var(--surface-2); color:var(--ink-3); }
.scr-gov .gov-slot.is-empty { opacity:.75; }
.scr-gov .gov-slot.is-filled { border-style:solid; background:var(--surface); color:var(--ink); }
.scr-gov .gov-slot.is-filled.receipt { border-color:color-mix(in srgb, var(--ok) 45%, white); background:var(--ok-soft); }
.scr-gov .gov-slot h4 { margin:0 0 6px; }
.scr-gov .gov-code { font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; font-size:1.25rem; font-weight:700; letter-spacing:.06em; background:var(--surface); border:1px solid var(--line); border-radius:var(--r-sm); padding:8px 12px; display:inline-block; color:var(--ink); word-break:break-all; }
.scr-gov .gov-bars { display:flex; flex-direction:column; gap:12px; margin:8px 0 6px; }
.scr-gov .gov-bar-row { display:grid; grid-template-columns: minmax(90px, 150px) minmax(0,1fr) 92px; gap:10px; align-items:center; font-size:15px; }
.scr-gov .gov-bar-track { position:relative; height:24px; background:var(--surface-2); border:1px solid var(--line); border-radius:6px; }
.scr-gov .gov-bar-fill { position:absolute; left:0; top:0; bottom:0; border-radius:5px 0 0 5px; background:var(--brand); }
.scr-gov .gov-bar-fill.alt { background:var(--line-strong); }
.scr-gov .gov-thresh { position:absolute; top:-5px; bottom:-5px; width:0; border-left:2px dashed var(--accent); }
.scr-gov .gov-bar-val { text-align:right; font-variant-numeric:tabular-nums; font-weight:700; }
.scr-gov .gov-legend { display:flex; align-items:flex-start; gap:8px; font-size:13.5px; color:var(--ink-2); }
.scr-gov .gov-legend i { flex:none; margin-top:3px; display:inline-block; width:0; height:14px; border-left:2px dashed var(--accent); }
.scr-gov .gov-result-badge { font-size:15px; padding:5px 12px; letter-spacing:.04em; }
.scr-gov .gov-ballot-grid { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); gap:20px; }
@media (max-width: 860px) { .scr-gov .gov-ballot-grid { grid-template-columns:minmax(0,1fr); } .scr-gov .gov-bar-row { grid-template-columns: 1fr 76px; } .scr-gov .gov-bar-row .gov-bar-track { grid-column: 1 / -1; grid-row: 2; } }
.scr-gov .gov-scroll { max-height:360px; overflow:auto; }
.scr-gov .gov-scroll .table th { position:sticky; top:0; z-index:1; }
.scr-gov .gov-audit { list-style:none; margin:0; padding:0; }
.scr-gov .gov-audit li { display:grid; grid-template-columns: 78px 14px minmax(0,1fr); gap:10px; padding:10px 0; border-bottom:1px solid var(--line); font-size:15px; align-items:start; }
.scr-gov .gov-audit li:last-child { border-bottom:0; }
.scr-gov .gov-audit time { font-variant-numeric:tabular-nums; color:var(--ink-3); font-weight:600; font-size:14px; }
.scr-gov .gov-audit .dot { width:10px; height:10px; border-radius:50%; margin-top:6px; background:var(--line-strong); }
.scr-gov .gov-audit .dot.quorum { background:var(--ok); } .scr-gov .gov-audit .dot.vote { background:var(--brand); }
.scr-gov .gov-audit .dot.proxy { background:var(--master); } .scr-gov .gov-audit .dot.close { background:var(--accent); }
.scr-gov .gov-audit li.is-new { animation: gov-in .4s ease-out; }
.scr-gov .gov-chk { display:flex; gap:10px; align-items:flex-start; padding:12px; border:1px solid var(--line); border-radius:var(--r); cursor:pointer; font-weight:600; }
.scr-gov .gov-chk input { width:20px; height:20px; margin-top:1px; flex:none; accent-color: var(--brand); }
@media (max-width: 560px) {
  .scr-gov .gov-tiles { grid-template-columns:repeat(3, minmax(0,1fr)); gap:6px; padding:8px; min-height:200px; }
  .scr-gov .gov-tile .avatar { width:34px; height:34px; }
  .scr-gov .gov-tname { font-size:11.5px; }
  .scr-gov .gov-cbtn { padding:8px 12px; }
  .scr-gov .gov-cbtn .lbl { display:none; }
  .scr-gov .gov-audit li { grid-template-columns: 66px 12px minmax(0,1fr); gap:8px; }
}
`;
    document.head.appendChild(s);
  }

  /* ---------------- shared pieces ---------------- */
  function tabs(sub, S, t) {
    const n = audit(t.slug).length;
    const tab = (id, label, extra) => `<a class="tab${sub === id ? ' active' : ''}" href="#/governance${id ? '/' + id : ''}">${label}${extra || ''}</a>`;
    return `<nav class="tabs" aria-label="Meetings and voting sections">
      ${tab('', 'Live meeting')}${tab('ballots', 'Ballots')}${tab('proxies', 'Proxies &amp; audit', `<span class="gov-tab-count">${n}</span>`)}
    </nav>`;
  }

  function gaugeSvg(q) {
    const r = 52, c = 2 * Math.PI * r, frac = Math.min(1, q.present / q.seated);
    const tAng = (q.need / q.seated) * 2 * Math.PI - Math.PI / 2;
    const tx1 = 64 + (r - 12) * Math.cos(tAng), ty1 = 64 + (r - 12) * Math.sin(tAng);
    const tx2 = 64 + (r + 12) * Math.cos(tAng), ty2 = 64 + (r + 12) * Math.sin(tAng);
    const col = q.reached ? 'var(--ok)' : 'var(--warn)';
    return `<svg width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="${q.present} of ${q.seated} seated members present; quorum needs ${q.need}">
      <circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="14"/>
      <circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--line)" stroke-width="14" stroke-opacity=".6"/>
      <circle cx="64" cy="64" r="${r}" fill="none" stroke="${col}" stroke-width="14" stroke-linecap="round"
        stroke-dasharray="${(c * frac).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 64 64)" style="transition:stroke-dasharray .45s ease"/>
      <line x1="${tx1.toFixed(1)}" y1="${ty1.toFixed(1)}" x2="${tx2.toFixed(1)}" y2="${ty2.toFixed(1)}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>
      <text x="64" y="62" text-anchor="middle" font-family="var(--font-head)" font-weight="800" font-size="30" fill="var(--ink)">${q.present}</text>
      <text x="64" y="82" text-anchor="middle" font-family="var(--font-body)" font-size="13" fill="var(--ink-3)">of ${q.seated} seated</text>
    </svg>`;
  }

  function resultsBlock(t, b, st) {
    const tally = st.tally;
    const opts = b.options.filter((o) => o.id !== 'abstain');
    const abst = b.options.find((o) => o.id === 'abstain');
    const decisive = opts.reduce((s, o) => s + Number(tally[o.id] || 0), 0) || 1;
    const first = opts[0];
    const firstPct = (Number(tally[first.id] || 0) / decisive) * 100;
    const passed = firstPct >= b.threshold - 0.0001;
    const unit = b.type === 'WEIGHTED' ? ' wt' : '';
    const thrLabel = b.threshold > 60 ? 'two-thirds (66.67%)' : 'a simple majority (more than 50%)';
    const bars = opts.map((o, i) => {
      const v = Number(tally[o.id] || 0), p = (v / decisive) * 100;
      return `<div class="gov-bar-row">
        <span>${esc(o.label)}</span>
        <span class="gov-bar-track"><span class="gov-bar-fill${i ? ' alt' : ''}" style="width:${p.toFixed(1)}%"></span><span class="gov-thresh" style="left:${b.threshold}%" title="Threshold ${b.threshold}%"></span></span>
        <span class="gov-bar-val">${p.toFixed(1)}% <span class="muted small">(${fmtW(v)}${unit})</span></span>
      </div>`;
    }).join('');
    const sec = secretaryOf(t);
    return `<div class="row" style="justify-content:space-between">
        <h4 style="margin:0">Results</h4>
        <span class="badge ${passed ? 'badge-ok' : 'badge-danger'} gov-result-badge">${passed ? 'PASSED' : 'FAILED'}</span>
      </div>
      <div class="gov-bars">${bars}</div>
      <div class="gov-legend"><i></i> Needed to pass: ${thrLabel} of ${b.type === 'WEIGHTED' ? 'weighted ' : ''}votes cast${abst ? `. Abstain: ${fmtW(tally.abstain || 0)}, counted for turnout and left out of the percentage` : ''}.</div>
      <div class="row" style="margin-top:12px">
        ${st.certified
          ? `<span class="badge badge-ok">${IC.check} Certified by ${esc(sec)}, Secretary</span>`
          : `<button class="btn btn-sm btn-primary" data-act="certify" data-b="${esc(b.id)}">${IC.shield} Certified by ${esc(sec)}</button><span class="small muted">Secretary signs off for the minutes</span>`}
      </div>`;
  }

  function votersCount(b, st) {
    return b.options.reduce((s, o) => s + Number(st.tally[o.id] || 0), 0);
  }

  /* ---------------- Live meeting ---------------- */
  function renderLive(t, S, ctx) {
    const m = t.meeting || {};
    const q = quorumInfo(t, S);
    const chairName = t.chair ? t.chair.name : '';
    const members = t.members || [];
    const titleOf = (n) => { const x = members.find((mm) => mm.name === n); return x ? x.title : ''; };

    // tiles: You + present members (chair first)
    const order = [chairName].concat(S.present.filter((n) => n !== chairName)).filter((n) => S.present.includes(n));
    const maxTiles = 14;
    const shown = order.slice(0, maxTiles);
    const more = order.length - shown.length;
    const youTile = `<div class="gov-tile is-you">${S.camOff ? `<span style="color:#B9C4D2">${IC.camOff}</span>` : U.avatar('You', 44)}<span class="gov-ttag" style="background:rgba(255,255,255,.12);color:#DDE5EE">You</span><span class="gov-tname">${S.muted ? 'Muted · ' : ''}You (${esc(App.roleLabel(ctx.role))})</span></div>`;
    const tiles = shown.map((n) => {
      const speaking = n === chairName;
      return `<div class="gov-tile${speaking ? ' is-speaking' : ''}${S.lastJoined === n ? ' is-new' : ''}" title="${esc(n)}">
        ${U.avatar(n, 44)}
        ${speaking ? '<span class="gov-ttag">Speaking</span>' : ''}
        <span class="gov-tname">${esc(n)}${titleOf(n) && titleOf(n) !== 'Committee Member' ? ' · ' + esc(titleOf(n)) : ''}</span>
      </div>`;
    }).join('') + (more > 0 ? `<div class="gov-tile more">+${more} more</div>` : '');

    const video = S.left
      ? `<div class="gov-left"><h3>You left the meeting</h3><p style="opacity:.85">The meeting continues for everyone else. Your seat stays saved.</p><button class="btn btn-primary" data-act="rejoin">Rejoin meeting</button></div>`
      : `<div class="gov-tiles">${youTile}${tiles}</div>
         <div class="gov-controls">
           <button class="gov-cbtn${S.muted ? ' is-off' : ''}" data-act="mute" aria-pressed="${S.muted}">${S.muted ? IC.micOff : IC.mic}<span class="lbl">${S.muted ? 'Unmute' : 'Mute'}</span></button>
           <button class="gov-cbtn${S.camOff ? ' is-off' : ''}" data-act="cam" aria-pressed="${S.camOff}">${S.camOff ? IC.camOff : IC.cam}<span class="lbl">${S.camOff ? 'Start camera' : 'Stop camera'}</span></button>
           <button class="gov-cbtn leave" data-act="leave">${IC.leave}<span class="lbl">Leave</span></button>
         </div>`;

    const agenda = (m.agenda || []).map((a, i) => {
      const cls = S.adjourned || i < S.agendaIdx ? 'done' : i === S.agendaIdx ? 'current' : '';
      const isBallot = /^Endorsement|^Approve election-night|^Bylaws/.test(a);
      return `<li class="${cls}"><span class="gov-num">${cls === 'done' ? IC.check : i + 1}</span>
        <span style="flex:1;min-width:0">${cls === 'current' ? '<span class="gov-now">NOW</span>' : ''}${esc(a)}</span>
        ${isBallot ? `<a class="chip" href="#/governance/ballots" style="min-height:28px;padding:2px 10px;font-size:13px">Ballot</a>` : ''}</li>`;
    }).join('');
    const last = (m.agenda || []).length - 1;

    const endorse = (t.ballots || []).find((b) => b.type === 'SECRET');
    const est = endorse ? S.ballots[endorse.id] : null;

    return `
    <div class="card" style="margin-bottom:20px"><div class="card-body gov-mhead">
      <div style="flex:1 1 320px;min-width:0">
        <h2>${esc(m.title || 'Committee meeting')}</h2>
        <div class="gov-meta">
          <span>${IC.clock} ${esc(fmtDate(m.date))} · ${esc(m.time || '')}</span>
          <span>Chair: ${esc(chairName)}</span>
          <span>Quorum rule: ${esc(m.quorumRule || 'majority of seated members')}</span>
        </div>
      </div>
      <div class="stack" style="gap:4px;align-items:flex-start">
        <span class="badge badge-local">Video by ${esc(m.provider || 'Zoom')} — embedded</span>
        <span class="small muted">Google Meet or Jitsi work too, right inside this page.</span>
      </div>
    </div></div>

    <div class="gov-live">
      <div class="stack">
        <div class="gov-video" data-tour="gov-meeting">
          <div class="gov-vbar"><span class="gov-live-dot"></span><strong>Live</strong> · ${q.inRoom + 1} on the call
            <span class="gov-prov">${esc(m.provider || 'Zoom')} · embedded in your county site</span></div>
          ${video}
        </div>
        <div class="card">
          <div class="card-head"><h3>Agenda</h3><span class="spacer"></span>
            ${S.adjourned
              ? `<span class="badge badge-ok">Meeting adjourned</span><button class="btn btn-sm btn-ghost" data-act="reset">Replay the demo</button>`
              : `<button class="btn btn-sm btn-primary" data-act="next">${S.agendaIdx >= last ? 'Adjourn meeting' : 'Next item'}</button>`}
          </div>
          <div class="card-body"><ol class="gov-agenda">${agenda}</ol></div>
        </div>
      </div>

      <div class="stack">
        <div class="card" data-tour="gov-quorum">
          <div class="card-head"><h3>Quorum</h3><span class="spacer"></span>
            <span class="badge ${q.reached ? 'badge-ok' : 'badge-warn'}">${q.reached ? 'Quorum met' : 'Waiting for quorum'}</span></div>
          <div class="card-body">
            <div class="gov-gauge">
              ${gaugeSvg(q)}
              <div class="gov-gauge-txt">
                <div class="gov-big">Present ${q.present} of ${q.seated} seated members</div>
                <div style="color:var(--ink-2);margin-top:2px">Quorum needs <strong>${q.need}</strong></div>
                <div class="small muted" style="margin-top:6px">${q.inRoom} on the call, ${q.viaProxy} by verified proxy. The dark tick marks the quorum line.</div>
              </div>
            </div>
            <div class="gov-qstate ${q.reached ? 'ok' : 'warn'}">${q.reached
              ? `${IC.check} Quorum reached at ${esc(S.quorumAt || '7:04 PM')}`
              : `${IC.users} ${q.need - q.present} more needed to open voting`}</div>
            <div class="row" style="margin-top:14px">
              ${q.reached
                ? `<button class="btn btn-sm btn-ghost" data-act="reset">Replay from the start</button>`
                : `<button class="btn btn-primary" data-act="join"${S.joining ? ' aria-disabled="true"' : ''}>${S.joining ? 'Members joining…' : 'Simulate members joining'}</button>`}
              <a class="btn btn-sm btn-ghost" href="#/governance/proxies">Proxies</a>
            </div>
          </div>
        </div>

        ${endorse ? `<div class="card">
          <div class="card-head"><h3>Open ballot</h3><span class="spacer"></span><span class="badge">Secret ballot</span></div>
          <div class="card-body stack" style="gap:12px">
            <strong>${esc(endorse.title)}</strong>
            ${q.reached
              ? `<div class="gov-note" style="background:var(--ok-soft);color:var(--ok)">${IC.check}<span>Voting is open. ${votersCount(endorse, est)} of ${q.seated} have voted.</span></div>
                 <div class="row"><button class="btn btn-primary" data-act="goballot">Go to ballot</button></div>`
              : `<div class="gov-note warn">${IC.lock}<span>Voting opens once quorum is reached.</span></div>`}
          </div>
        </div>` : ''}

        <div class="explain"><strong>Why this matters for your committee.</strong> Digital voting keeps your bylaws (quorum, thresholds, proxies) applied automatically and leaves a clean record for the secretary. Nobody has to count hands on a video call.</div>
      </div>
    </div>`;
  }

  /* ---------------- Ballots ---------------- */
  function voteBlock(t, b, st, ctx, q) {
    if (st.status === 'closed') return `<div class="gov-note">${IC.lock}<span>Voting is closed. ${fmtW(votersCount(b, st))} sealed ballots were counted; individual choices stay private for good.</span></div>
      <div class="gov-note" style="background:var(--surface-2);color:var(--ink-2)">${IC.shield}<span>Any member holding a receipt can confirm their ballot is in the count. The secretary's certification goes straight into the minutes.</span></div>`;
    const allowed = canVote(ctx.role);
    const optsHtml = b.options.map((o) => `<button class="gov-opt${st.sel === o.id && !st.voted ? ' sel' : ''}" data-act="pick" data-b="${esc(b.id)}" data-o="${esc(o.id)}"${(!allowed || !q.reached || st.voted) ? ' aria-disabled="true"' : ''}><span class="gov-radio"></span>${esc(o.label)}</button>`).join('');
    let foot;
    if (!allowed && !st.voted) {
      foot = `<div class="gov-note">${IC.users}<span>Only seated committee members vote. You're viewing as ${esc(App.roleLabel(ctx.role))}; switch "Viewing as" to Committee Member or Executive Board to cast a vote.</span></div>`;
    } else if (!q.reached) {
      foot = `<div class="gov-note warn">${IC.lock}<span>Voting opens once quorum is reached. <a href="#/governance">Open the live meeting</a> or <button class="btn btn-sm btn-ghost" data-act="joinfast" style="min-height:28px;padding:2px 8px">bring members in now</button></span></div>`;
    } else if (st.voted) {
      foot = `<div class="gov-note" style="background:var(--ok-soft);color:var(--ok)">${IC.check}<span>Your ballot is in. Thank you for voting.</span></div>`;
    } else if (!allowed) {
      foot = `<div class="gov-note">${IC.users}<span>Only seated committee members vote. You're viewing as ${esc(App.roleLabel(ctx.role))}; switch "Viewing as" to Committee Member or Executive Board to cast a vote.</span></div>`;
    } else {
      foot = `<div class="row"><button class="btn btn-primary" data-act="cast" data-b="${esc(b.id)}"${st.sel ? '' : ' aria-disabled="true"'}>Cast vote</button><span class="small muted">${st.sel ? 'One vote per seated member' : 'Choose an option first'}</span></div>`;
    }
    return `<div class="gov-opts">${optsHtml}</div>${foot}`;
  }

  function turnoutBlock(b, st, q, seatedWeight) {
    const isW = b.type === 'WEIGHTED';
    const v = votersCount(b, st), total = isW ? seatedWeight : q.seated;
    return `<div>
      <div class="row" style="justify-content:space-between;margin-bottom:6px"><strong>${isW ? 'Weighted turnout' : 'Turnout'}: ${fmtW(v)} of ${fmtW(total)} voted</strong>
      ${st.status === 'open' ? '<span class="small muted">Tally stays sealed until voting closes</span>' : ''}</div>
      <div class="gov-turnout"><span style="width:${Math.min(100, (v / total) * 100).toFixed(1)}%"></span></div>
    </div>`;
  }

  function closeBtn(b, st, ctx, q) {
    if (st.status !== 'open') return '';
    return `<button class="btn btn-sm" data-act="close" data-b="${esc(b.id)}"${(!canClose(ctx.role) || !q.reached) ? ' aria-disabled="true"' : ''}>Close voting</button>`;
  }

  function renderBallots(t, S, ctx) {
    const q = quorumInfo(t, S);
    const seated = seatedOf(t);
    const seatedWeight = seated.reduce((s, m) => s + (m.weight || 1), 0);
    const ballots = t.ballots || [];
    const typeBadge = { SECRET: 'Secret ballot', ROLL_CALL: 'Roll call vote', WEIGHTED: 'Weighted vote' };
    let html = '';

    ballots.forEach((b) => {
      const st = S.ballots[b.id];
      const thr = b.threshold > 60 ? 'Two-thirds needed' : 'Majority needed';
      const head = `<div class="card-head"><h3 style="flex:1 1 280px;min-width:0">${esc(b.title)}</h3>
        <span class="badge badge-local">${typeBadge[b.type] || b.type}</span><span class="badge">${thr}</span>
        ${st.status === 'open' ? '<span class="badge badge-ok">Open</span>' : '<span class="badge">Closed</span>'}
        ${closeBtn(b, st, ctx, q)}</div>`;

      if (b.type === 'SECRET') {
        const receipt = st.voted
          ? `<div class="gov-slot is-filled receipt" data-tour="gov-receipt">
              <h4>Your vote receipt</h4>
              <div class="gov-code">${esc(st.receipt)}</div>
              <p style="margin:12px 0 10px;color:var(--ink-2)">We record THAT you voted separately from WHAT you voted. Your receipt lets you confirm your vote was counted; no one, including the chair, can link it to you.</p>
              <button class="btn btn-sm" data-act="checkreceipt" data-b="${esc(b.id)}">Check my receipt</button>
            </div>`
          : `<div class="gov-slot is-empty" data-tour="gov-receipt"><h4>Your receipt appears here after you vote</h4>
              <p class="small" style="margin:0">A private code that proves your ballot was counted, without revealing your choice.</p></div>`;
        const results = st.status === 'closed'
          ? `<div class="gov-slot is-filled" data-tour="gov-results">${resultsBlock(t, b, st)}</div>`
          : `<div class="gov-slot is-empty" data-tour="gov-results"><h4>Results appear here when voting closes</h4>
              <p class="small" style="margin:0">The chair (Executive Board) closes voting; then bars, the two-thirds line and a PASSED or FAILED badge show here.</p></div>`;
        html += `<div class="card" data-tour="gov-ballot">${head}
          <div class="card-body gov-ballot-grid">
            <div class="stack">${turnoutBlock(b, st, q, seatedWeight)}${voteBlock(t, b, st, ctx, q)}</div>
            <div class="stack">${receipt}${results}</div>
          </div></div>`;
      } else if (b.type === 'ROLL_CALL') {
        const assign = assignVotes(t, b, st.tally);
        const label = (id) => { const o = b.options.find((x) => x.id === id); return o ? o.label : ''; };
        const cls = (id) => id === 'aye' || id === 'yes' ? 'badge-ok' : id === 'nay' || id === 'no' ? 'badge-danger' : '';
        const rows = seated.map((mm) => {
          const v = assign[mm.name];
          return `<tr><td><span style="display:inline-flex;align-items:center;gap:8px">${U.avatar(mm.name, 26)}<span>${esc(mm.name)}</span></span></td><td class="small">${esc(mm.title)}</td>
            <td>${v ? `<span class="badge ${cls(v)}">${esc(label(v))}</span>` : '<span class="muted small">Absent</span>'}</td></tr>`;
        }).join('');
        html += `<div class="card">${head}
          <div class="card-body gov-ballot-grid">
            <div class="stack">${turnoutBlock(b, st, q, seatedWeight)}<div class="gov-slot is-filled">${resultsBlock(t, b, st)}</div>
              <p class="small muted" style="margin:0">Roll call votes are public by design: each member's name and vote go into the minutes.</p></div>
            <div class="table-wrap gov-scroll"><table class="table"><thead><tr><th>Member</th><th>Title</th><th>Vote</th></tr></thead><tbody>${rows}</tbody></table></div>
          </div></div>`;
      } else if (b.type === 'WEIGHTED') {
        const assign = assignVotes(t, b, b.tally);
        const label = (id) => { const o = b.options.find((x) => x.id === id); return o ? o.label : ''; };
        const closed = st.status === 'closed';
        const yourRow = st.voted ? `<tr><td><strong>You (sample voter)</strong></td><td class="small">${esc(App.roleLabel(ctx.role))}</td><td class="num">1</td><td>${closed ? `<span class="badge">${esc(label(st.choice))}</span>` : '<span class="badge badge-ok">Voted</span>'}</td></tr>` : '';
        const wOrder = seated.filter((mm) => mm.weight === 0.5).concat(seated.filter((mm) => mm.weight !== 0.5));
        const rows = wOrder.map((mm) => {
          const v = assign[mm.name];
          const w = mm.weight || 1;
          return `<tr><td>${esc(mm.name)}</td><td class="small">${esc(mm.title)}</td><td class="num">${w === 0.5 ? '<strong>0.5</strong>' : '1'}</td>
            <td>${v ? (closed ? `<span class="badge ${v === 'yes' ? 'badge-ok' : 'badge-danger'}">${esc(label(v))}</span>` : '<span class="badge badge-ok">Voted</span>') : '<span class="muted small">Not yet</span>'}</td></tr>`;
        }).join('');
        const totals = b.options.map((o) => `<span class="badge">${esc(o.label)}: ${closed ? fmtW(st.tally[o.id] || 0) : 'sealed'}</span>`).join(' ');
        html += `<div class="card">${head}
          <div class="card-body gov-ballot-grid">
            <div class="stack">${turnoutBlock(b, st, q, seatedWeight)}
              <p class="small" style="margin:0;color:var(--ink-2)">Your bylaws give each seated member a weight of 1 and a seated alternate a weight of 0.5. Totals add up the weights automatically.</p>
              ${closed ? `<div class="gov-slot is-filled">${resultsBlock(t, b, st)}</div>` : voteBlock(t, b, st, ctx, q)}
              <div class="row"><strong class="small">Weighted totals:</strong> ${totals}</div>
            </div>
            <div class="table-wrap gov-scroll"><table class="table"><thead><tr><th>Member</th><th>Title</th><th class="num">Weight</th><th>${closed ? 'Vote' : 'Status'}</th></tr></thead><tbody>${yourRow}${rows}</tbody></table></div>
          </div></div>`;
      }
    });

    return `<div class="stack" style="gap:20px">
      ${q.reached ? '' : `<div class="gov-note warn">${IC.lock}<span>${q.present} of ${q.seated} seated members are present and quorum needs ${q.need}, so ballots are waiting. Voting opens once quorum is reached.</span></div>`}
      ${html}
      <div class="explain"><strong>Why this matters for your committee.</strong> Digital voting keeps your bylaws (quorum, thresholds, proxies) applied automatically and leaves a clean record for the secretary. Secret ballots stay secret, roll calls stay public, and weighted votes add up correctly every time.</div>
    </div>`;
  }

  /* ---------------- Proxies & audit ---------------- */
  function renderProxies(t, S, ctx) {
    const q = quorumInfo(t, S);
    const rows = S.proxies.map((p, i) => {
      const counts = p.verified && S.present.includes(p.holder);
      return `<tr>
        <td>${U.avatar(p.grantor, 26)} <span style="margin-left:6px">${esc(p.grantor)}</span></td>
        <td>${esc(p.holder)}</td>
        <td>${p.verified ? `<span class="badge badge-ok">${IC.check} Verified</span>` : '<span class="badge badge-warn">Awaiting signed form</span>'}</td>
        <td>${counts ? 'Yes' : p.verified ? 'When holder joins' : 'After verification'}</td>
        <td>${p.verified ? '<span class="small muted">On file</span>' : `<button class="btn btn-sm btn-primary" data-act="verify" data-i="${i}">Verify</button>`}</td>
      </tr>`;
    }).join('');
    const log = audit(t.slug).slice().reverse();
    const items = log.map((e, i) => `<li class="${i === 0 && S._fresh ? 'is-new' : ''}"><time>${esc(e.time)}</time><span class="dot ${esc(e.kind)}"></span><span>${esc(e.text)}</span></li>`).join('');
    S._fresh = false;
    return `<div class="stack" style="gap:20px">
      <div class="card" data-tour="gov-proxies">
        <div class="card-head"><h3>Proxies for ${esc((t.meeting || {}).title || 'this meeting')}</h3><span class="spacer"></span>
          <span class="badge">${q.viaProxy} counting toward quorum</span></div>
        <div class="card-body stack" style="gap:14px">
          <p style="margin:0;color:var(--ink-2)">A seated member who can't attend can sign a proxy giving their vote to another member. Once the secretary confirms the signed form, the proxy counts toward quorum automatically.</p>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Member giving proxy</th><th>Proxy holder</th><th>Status</th><th>Counts toward quorum</th><th></th></tr></thead>
            <tbody>${rows}</tbody></table></div>
          <div class="small muted">Quorum right now: ${q.present} of ${q.seated} seated members present, ${q.need} needed.</div>
        </div>
      </div>

      <div class="card" data-tour="gov-audit">
        <div class="card-head"><h3>Audit log</h3><span class="badge">${log.length} entries</span><span class="spacer"></span>
          <button class="btn btn-sm" data-act="export">Add to the minutes</button></div>
        <div class="card-body">
          <p class="small muted" style="margin-top:0">Every quorum change, proxy, vote and certification is time-stamped as it happens. Vote entries record that a ballot was received, never the choice.</p>
          <ul class="gov-audit">${items}</ul>
        </div>
      </div>

      <div class="explain"><strong>Why this matters for your committee.</strong> Digital voting keeps your bylaws (quorum, thresholds, proxies) applied automatically and leaves a clean record for the secretary. If a vote is ever challenged, the audit log answers the question in seconds.</div>
    </div>`;
  }

  /* ---------------- actions ---------------- */
  function onClick(e, t, S, ctx) {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    const ballot = a.dataset.b ? (t.ballots || []).find((b) => b.id === a.dataset.b) : null;
    const st = ballot ? S.ballots[ballot.id] : null;
    const q = quorumInfo(t, S);

    switch (act) {
      case 'join':
        if (S.joining) { ctx.toast('Members are joining now…', 'info'); return; }
        ctx.toast('Members are joining the call…', 'info');
        simulateJoin(t, ctx); return;
      case 'joinfast':
        ctx.navigate('governance');
        setTimeout(() => simulateJoin(t, ctx), 50); return;
      case 'reset':
        resetState(t); ctx.toast('Meeting reset to the start, ready to replay.', 'info'); repaint(); return;
      case 'mute':
        S.muted = !S.muted; ctx.toast(S.muted ? 'You are muted.' : 'You are unmuted.', 'info'); repaint(); return;
      case 'cam':
        S.camOff = !S.camOff; ctx.toast(S.camOff ? 'Camera off.' : 'Camera on.', 'info'); repaint(); return;
      case 'leave':
        S.left = true; ctx.toast('You left the meeting. Rejoin anytime from this page.', 'warn'); repaint(); return;
      case 'rejoin':
        S.left = false; ctx.toast('Welcome back to the meeting.', 'ok'); repaint(); return;
      case 'goballot':
        ctx.navigate('governance/ballots'); return;
      case 'next': {
        const ag = (t.meeting || {}).agenda || [];
        if (S.agendaIdx >= ag.length - 1) {
          S.adjourned = true; addAudit(t.slug, S, 'Meeting adjourned by the chair', 'info');
          ctx.toast('Meeting adjourned. The audit log is ready for the minutes.', 'ok');
        } else {
          S.agendaIdx++; addAudit(t.slug, S, `Agenda item ${S.agendaIdx + 1} opened: ${ag[S.agendaIdx]}`, 'info');
          ctx.toast(`Now on item ${S.agendaIdx + 1}: ${ag[S.agendaIdx]}`, 'info');
        }
        repaint(); return;
      }
      case 'pick':
        if (!q.reached) { ctx.toast('Voting opens once quorum is reached.', 'warn'); return; }
        if (!canVote(ctx.role)) { ctx.toast('Only seated committee members vote.', 'info'); return; }
        if (st.voted) { ctx.toast('Your ballot is already in. One vote per member.', 'info'); return; }
        st.sel = a.dataset.o; repaint(); return;
      case 'cast': {
        if (!st.sel) { ctx.toast('Choose an option first.', 'warn'); return; }
        st.voted = true; st.choice = st.sel;
        st.tally[st.sel] = Number(st.tally[st.sel] || 0) + 1;
        st.receipt = receiptCode(t.slug + '|' + ballot.id + '|' + ctx.role);
        addAudit(t.slug, S, `Ballot received on "${ballot.title}"${ballot.type === 'SECRET' ? ' (choice sealed)' : ' (weight 1)'}`, 'vote');
        S._fresh = true;
        ctx.toast(ballot.type === 'SECRET' ? 'Vote cast. Your receipt is ready.' : 'Weighted vote cast.', 'ok');
        repaint(); return;
      }
      case 'checkreceipt':
        ctx.modal({
          title: 'Receipt check',
          html: `<p>Receipt <strong style="font-family:ui-monospace,Menlo,monospace">${esc(st.receipt)}</strong> is in the sealed ballot box for:</p>
            <p><strong>${esc(ballot.title)}</strong></p>
            <p style="color:var(--ok);font-weight:600">${IC.check} Counted. Your choice stays sealed; only you know it.</p>`,
          actions: [{ label: 'Done', primary: true }],
        });
        return;
      case 'close':
        if (!q.reached) { ctx.toast('Voting opens once quorum is reached.', 'warn'); return; }
        if (!canClose(ctx.role)) { ctx.toast('The chair closes voting. Switch "Viewing as" to Executive Board to try it.', 'info'); return; }
        ctx.modal({
          title: 'Close voting?',
          html: `<p>Close voting on <strong>${esc(ballot.title)}</strong>. ${fmtW(votersCount(ballot, st))} ${ballot.type === 'WEIGHTED' ? 'weighted votes' : 'ballots'} are in. Results will show to the committee right away.</p>`,
          actions: [
            { label: 'Keep voting open' },
            { label: 'Close voting', primary: true, onClick: () => {
              st.status = 'closed';
              addAudit(t.slug, S, `Voting closed on "${ballot.title}" — ${fmtW(votersCount(ballot, st))} votes counted`, 'close');
              S._fresh = true;
              ctx.toast('Voting closed. Results are in.', 'ok'); repaint();
            } },
          ],
        });
        return;
      case 'certify': {
        const sec = secretaryOf(t);
        st.certified = true;
        addAudit(t.slug, S, `Result certified by ${sec}, Secretary: "${ballot.title}"`, 'close');
        S._fresh = true;
        ctx.toast(`Certified by ${sec}. Added to the minutes.`, 'ok'); repaint(); return;
      }
      case 'verify': {
        const p = S.proxies[Number(a.dataset.i)];
        if (!p) return;
        if (ctx.role !== 'board' && ctx.role !== 'master') { ctx.toast('The secretary verifies proxies. Switch "Viewing as" to Executive Board to try it.', 'info'); return; }
        ctx.modal({
          title: 'Verify proxy',
          html: `<p><strong>${esc(p.grantor)}</strong> gives their vote to <strong>${esc(p.holder)}</strong> for ${esc((t.meeting || {}).title || 'this meeting')}.</p>
            <label class="gov-chk scr-gov" style="display:flex"><input type="checkbox" id="gov-proxy-ok"> Confirm signed proxy form received</label>`,
          actions: [
            { label: 'Cancel' },
            { label: 'Mark verified', primary: true, onClick: (m) => {
              const cb = m.body.querySelector('#gov-proxy-ok');
              if (!cb || !cb.checked) { ctx.toast('Tick the box to confirm the signed form is on file.', 'warn'); return false; }
              p.verified = true;
              addAudit(t.slug, S, `Proxy verified: ${p.grantor} → ${p.holder} (signed form received)`, 'proxy');
              S._fresh = true;
              const crossed = checkQuorum(t, S);
              const nq = quorumInfo(t, S);
              ctx.toast(crossed ? `Proxy verified. Quorum reached at ${S.quorumAt}.` : `Proxy verified. Quorum now ${nq.present} of ${nq.seated} present.`, 'ok');
              repaint();
            } },
          ],
        });
        return;
      }
      case 'export':
        ctx.toast(`Audit log (${audit(t.slug).length} entries) added to ${secretaryOf(t)}'s minutes draft.`, 'ok'); return;
    }
  }

  /* ---------------- register ---------------- */
  App.register({
    id: 'governance',
    title: 'Meetings & Voting',
    group: 'Field & Governance',
    icon: ICON,
    blurb: 'Quorum checks, proxies and secret ballots for central committee meetings.',
    render(el, ctx) {
      injectStyles();
      const t = ctx.tenant;
      const S = getState(t);
      const sub = ['ballots', 'proxies'].includes(ctx.sub) ? ctx.sub : '';
      let body;
      if (sub === 'ballots') body = renderBallots(t, S, ctx);
      else if (sub === 'proxies') body = renderProxies(t, S, ctx);
      else body = renderLive(t, S, ctx);
      el.innerHTML = `<div class="page scr-gov">
        <div class="page-head"><div>
          <h1>Meetings &amp; Voting</h1>
          <p>Run ${esc(t.shortName || t.name)} central committee meetings online: live video, automatic quorum, secret ballots and a clean record for the minutes.</p>
        </div></div>
        ${tabs(sub, S, t)}
        ${body}
      </div>`;
      el.addEventListener('click', (e) => onClick(e, t, S, ctx));
    },
  });
})();
