/* screens/outreach.js: Outreach (#/outreach), broadcasts, phone bank, petitions and surveys (CRM agent).
   Routes: #/outreach (broadcast history), #/outreach/compose[?list=&channel=&id=], #/outreach/calls,
   #/outreach/calls/<id> (calling screen), #/outreach/calls/edit/<id|new>, #/outreach/petitions,
   #/outreach/petitions/<id|new>, #/outreach/settings.
   Exports App.crmUI.mountOutreach(el, ctx, {owner}) for My Campaign. Viewing needs a committee member;
   sending, calling and editing need outreach.send (the Executive Board) or the campaign's own team.
   Until email and text delivery are connected, a send logs one interaction per recipient and says so plainly. */
(function () {
  'use strict';
  if (!window.App) return;
  const U = App.util;
  const esc = U.esc;
  const CRM = () => App.crm;
  const K = () => (App.crmUI && App.crmUI._kit) || null;

  const I = (d, s) => `<svg width="${s || 18}" height="${s || 18}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const SCREEN_ICON = I('<path d="M3 8.5v3a1 1 0 0 0 1 1h2l5 3.5V4L6 7.5H4a1 1 0 0 0-1 1z"/><path d="M14 7.2a4 4 0 0 1 0 5.6M16.2 5a7 7 0 0 1 0 10"/>', 20);
  const OI = {
    send: I('<path d="M3 10l14-6-5.5 13-2.3-5.2z"/><path d="M9.2 11.8L17 4"/>'),
    copy: I('<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M13 7V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3"/>', 16),
    left: I('<path d="M12.5 4.5L7 10l5.5 5.5"/>', 16),
    right: I('<path d="M7.5 4.5L13 10l-5.5 5.5"/>', 16),
    moon: I('<path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z"/>', 16),
    pause: I('<rect x="5.5" y="4.5" width="3" height="11" rx="1"/><rect x="11.5" y="4.5" width="3" height="11" rx="1"/>', 16),
    skip: I('<path d="M5 5l7 5-7 5zM14.5 5v10"/>', 16),
    trash: I('<path d="M4.5 6h11M8 6V4h4v2M6 6l.7 10h6.6L14 6"/>', 16),
    settings: I('<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1L4.7 4.7"/>', 16),
  };

  /* ---------------- styles ---------------- */
  function injectStyles() {
    if (document.getElementById('crm-out-styles')) return;
    const s = document.createElement('style');
    s.id = 'crm-out-styles';
    s.textContent = `
.crm .ob-hist { border:1px solid var(--line); border-radius:var(--r-lg); background:var(--surface); box-shadow:var(--shadow-1); overflow:hidden; }
.crm .ob-row { display:grid; grid-template-columns:40px minmax(0,1fr) 170px 120px 130px; gap:14px; align-items:center; padding:14px 16px; border-bottom:1px solid var(--line); }
.crm .ob-row:last-child { border-bottom:0; }
.crm .ob-row.head { padding:10px 16px; background:var(--surface-2); font:700 12.5px/1.2 var(--font-body); letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3); }
.crm .ob-ch { width:36px; height:36px; border-radius:10px; display:inline-flex; align-items:center; justify-content:center; background:var(--info-soft); color:var(--info); }
.crm .ob-ch.sms { background:var(--ok-soft); color:var(--ok); }
.crm .ob-t { min-width:0; }
.crm .ob-t b { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:650; }
.crm .ob-t small .crm-sample { margin:0 6px 0 0; vertical-align:1px; }
.crm .ob-t small { display:block; color:var(--ink-3); font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.crm .ob-n { font:800 1.3rem/1 var(--font-head); font-stretch:80%; font-variant-numeric:tabular-nums; }
.crm .ob-n small { display:block; font:500 12.5px var(--font-body); color:var(--ink-3); margin-top:3px; }
.crm .ob-sched { display:flex; flex-wrap:wrap; gap:10px 14px; align-items:center; padding:14px 16px; border:1px solid color-mix(in srgb, var(--info) 25%, white); background:var(--info-soft); border-radius:var(--r-lg); margin-bottom:14px; }
.crm .ob-sched .t { flex:1 1 260px; min-width:0; }
.crm .ob-sched .t b { display:block; }
.crm .ob-sched .t span { font-size:14px; color:var(--ink-2); }
@media (max-width: 899px) {
  .crm .ob-row { grid-template-columns:40px minmax(0,1fr) auto; }
  .crm .ob-row .c-from, .crm .ob-row .c-skip { display:none; }
  .crm .ob-row.head { display:none; }
}

/* compose */
.crm .oc { display:grid; grid-template-columns:minmax(0,1.05fr) minmax(0,1fr); gap:22px; align-items:start; }
.crm .oc-form { background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg); padding:20px; box-shadow:var(--shadow-1); }
.crm .oc-form .fld { margin-bottom:16px; }
.crm .oc-seg { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
.crm .oc-seg button { display:flex; align-items:center; justify-content:center; gap:8px; min-height:46px; border:1px solid var(--line-strong); border-radius:10px; background:var(--surface); font:600 15px var(--font-body); color:var(--ink-2); cursor:pointer; }
.crm .oc-seg button[aria-pressed="true"] { background:var(--brand); color:var(--brand-ink); border-color:var(--brand); }
.crm .oc-merge { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; align-items:center; font-size:13.5px; color:var(--ink-3); }
.crm .oc-merge button { font:600 13px var(--font-body); padding:5px 9px; min-height:32px; border:1px dashed var(--line-strong); border-radius:7px; background:var(--surface-2); color:var(--brand); cursor:pointer; }
.crm .oc-count { display:flex; justify-content:space-between; gap:8px; font-size:13px; color:var(--ink-3); margin-top:6px; font-variant-numeric:tabular-nums; }
.crm .oc-count .warn { color:var(--warn); font-weight:600; }
.crm .oc-when { display:flex; flex-direction:column; gap:6px; }
.crm .oc-when label { display:flex; align-items:center; gap:10px; min-height:40px; cursor:pointer; }
.crm .oc-when input[type="radio"] { width:18px; height:18px; accent-color:var(--brand); margin:0; }
.crm .oc-when .input { max-width:260px; margin-left:28px; }
.crm .oc-side { position:sticky; top:calc(var(--topbar-h) + 16px); display:flex; flex-direction:column; gap:14px; }
.crm .oc-pvh { display:flex; align-items:center; gap:6px; font-size:13.5px; color:var(--ink-3); }
.crm .oc-pvh .sp { flex:1; }
.crm .oc-mail { background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--shadow-2); overflow:hidden; }
.crm .oc-mail .hd { padding:14px 18px; border-bottom:1px solid var(--line); display:grid; grid-template-columns:auto minmax(0,1fr); gap:4px 12px; font-size:14px; }
.crm .oc-mail .hd span { color:var(--ink-3); }
.crm .oc-mail .hd b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
.crm .oc-mail .bd { padding:18px; font-size:15px; white-space:pre-wrap; overflow-wrap:anywhere; min-height:120px; max-height:320px; overflow:auto; }
.crm .oc-mail .ft { padding:12px 18px; background:var(--surface-2); border-top:1px solid var(--line); font-size:12.5px; color:var(--ink-3); white-space:pre-wrap; overflow-wrap:anywhere; }
.crm .oc-phone { width:280px; max-width:100%; margin:0 auto; border:10px solid #1C232D; border-radius:34px; background:#F2F3F5; padding:22px 12px 18px; box-shadow:var(--shadow-2); }
.crm .oc-phone .who { text-align:center; font:600 12px var(--font-body); color:#5A6676; margin-bottom:12px; }
.crm .oc-bub { background:#E5E7EB; color:#111; border-radius:18px 18px 18px 6px; padding:10px 12px; font-size:14.5px; line-height:1.4; white-space:pre-wrap; overflow-wrap:anywhere; max-height:300px; overflow:auto; }
.crm .oc-bub .ftx { color:#4B5563; }
.crm .oc-sum { background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg); padding:16px 18px; box-shadow:var(--shadow-1); }
.crm .oc-sum .big { display:flex; align-items:baseline; gap:10px; }
.crm .oc-sum .big b { font:800 2.4rem/1 var(--font-head); font-stretch:80%; color:var(--brand); font-variant-numeric:tabular-nums; transition:color .2s; }
.crm .oc-sum ul { list-style:none; margin:12px 0 0; padding:0; display:flex; flex-direction:column; gap:6px; font-size:14px; }
.crm .oc-sum li { display:flex; justify-content:space-between; gap:12px; color:var(--ink-2); }
.crm .oc-sum li b { font-variant-numeric:tabular-nums; }
.crm .oc-sum .acts { display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }
.crm .oc-sum .acts .btn-primary { flex:1 1 auto; }
.crm .oc-quiet { display:flex; gap:10px; align-items:flex-start; padding:10px 12px; border-radius:10px; background:var(--info-soft); color:#173F6A; font-size:14px; margin-top:12px; }
.crm .oc-quiet svg { flex:none; margin-top:2px; }
.crm .oc-err { color:var(--danger); font-size:14px; font-weight:600; margin-top:10px; }
.crm .oc-err a { color:inherit; }
@media (max-width: 1099px) { .crm .oc { grid-template-columns:minmax(0,1fr); } .crm .oc-side { position:static; } }

/* phone bank */
.crm .pb-cards { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:14px; }
.crm .pb-card { background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg); padding:18px; box-shadow:var(--shadow-1); display:flex; flex-direction:column; gap:10px; min-width:0; }
.crm .pb-card h3 { margin:0; font-size:1.15rem; }
.crm .pb-bar { height:10px; border-radius:10px; background:var(--surface-2); border:1px solid var(--line); overflow:hidden; display:flex; }
.crm .pb-bar i { display:block; height:100%; transition:width .4s ease; }
.crm .pb-bar .t { background:var(--ok); } .crm .pb-bar .o { background:color-mix(in srgb, var(--brand) 55%, white); }
.crm .pb-legend { display:flex; flex-wrap:wrap; gap:4px 12px; font-size:13px; color:var(--ink-3); }
.crm .pb-legend b { color:var(--ink-2); font-variant-numeric:tabular-nums; }
.crm .pb-card .acts { display:flex; gap:8px; flex-wrap:wrap; margin-top:auto; padding-top:8px; }
.crm .pc { max-width:620px; margin:0 auto; }
.crm .pc-top { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
.crm .pc-top .t { flex:1; min-width:0; }
.crm .pc-top .t b { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.crm .pc-top .t small { color:var(--ink-3); font-size:13.5px; }
.crm .pc-card { background:var(--surface); border:1px solid var(--line); border-radius:18px; box-shadow:var(--shadow-2); overflow:hidden; }
.crm .pc-card.in { animation: pc-in .28s ease-out both; }
@keyframes pc-in { from { opacity:0; transform:translateX(18px); } to { opacity:1; transform:none; } }
.crm .pc-who { display:flex; gap:12px; align-items:center; padding:18px 18px 12px; }
.crm .pc-who h2 { margin:0; font-size:1.5rem; overflow-wrap:anywhere; }
.crm .pc-who small { color:var(--ink-3); font-size:14px; }
.crm .pc-last { margin:0 18px 12px; font-size:14px; color:var(--ink-2); background:var(--surface-2); border-radius:10px; padding:8px 12px; }
.crm .pc-dial { display:flex; align-items:center; justify-content:center; gap:10px; margin:0 18px 16px; min-height:56px; border-radius:14px; background:var(--ok); color:#fff; font:700 18px var(--font-body); text-decoration:none; font-variant-numeric:tabular-nums; }
.crm .pc-dial:hover { background:color-mix(in srgb, var(--ok) 86%, black); color:#fff; }
.crm .pc-sec { padding:14px 18px; border-top:1px solid var(--line); }
.crm .pc-sec h3 { font:700 12.5px/1 var(--font-body); letter-spacing:.06em; text-transform:uppercase; color:var(--ink-3); margin:0 0 10px; }
.crm .pc-script { white-space:pre-wrap; font-size:15.5px; line-height:1.55; margin:0; }
.crm .pc-q { margin-bottom:14px; } .crm .pc-q:last-child { margin-bottom:0; }
.crm .pc-q p { margin:0 0 8px; font-weight:600; }
.crm .pc-opts { display:flex; flex-wrap:wrap; gap:6px; }
.crm .pc-opts button, .crm .pc-out button { min-height:44px; padding:8px 14px; border:1px solid var(--line-strong); border-radius:10px; background:var(--surface); font:600 14.5px var(--font-body); color:var(--ink); cursor:pointer; transition:background-color .12s, border-color .12s, transform .08s; }
.crm .pc-opts button:active, .crm .pc-out button:active { transform:scale(.97); }
.crm .pc-opts button[aria-pressed="true"] { background:var(--brand); border-color:var(--brand); color:var(--brand-ink); }
.crm .pc-out { display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:6px; }
.crm .pc-out button[aria-pressed="true"] { background:var(--brand); border-color:var(--brand); color:var(--brand-ink); }
.crm .pc-out button[data-v="do_not_call"][aria-pressed="true"] { background:var(--danger); border-color:var(--danger); }
.crm .pc-foot { position:sticky; bottom:0; display:flex; gap:8px; padding:12px 18px; background:color-mix(in srgb, var(--surface) 94%, transparent); backdrop-filter:blur(6px); border-top:1px solid var(--line); }
.crm .pc-foot .btn-primary { flex:1; min-height:50px; font-size:16px; }
.crm .pc-foot .btn { min-height:50px; }
.crm .pc-done { text-align:center; padding:36px 20px; }

/* petitions */
.crm .pt-list { display:flex; flex-direction:column; gap:12px; }
.crm .pt-card { display:grid; grid-template-columns:minmax(0,1fr) 220px; gap:14px 22px; background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg); padding:18px; box-shadow:var(--shadow-1); }
.crm .pt-card h3 { margin:6px 0 4px; font-size:1.12rem; line-height:1.3; }
.crm .pt-card p { margin:0; color:var(--ink-2); font-size:14.5px; }
.crm .pt-badges { display:flex; gap:6px; flex-wrap:wrap; }
.crm .pt-num { text-align:right; }
.crm .pt-num b { font:800 2rem/1 var(--font-head); font-stretch:80%; color:var(--brand); font-variant-numeric:tabular-nums; }
.crm .pt-num small { display:block; color:var(--ink-3); font-size:13px; margin:2px 0 8px; }
.crm .pt-link { display:flex; gap:6px; align-items:center; margin-top:10px; min-width:0; }
.crm .pt-link code { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12.5px; background:var(--surface-2); border:1px solid var(--line); border-radius:7px; padding:7px 9px; color:var(--ink-2); }
.crm .pt-acts { grid-column:1/-1; display:flex; gap:6px; flex-wrap:wrap; padding-top:10px; border-top:1px solid var(--line); }
.crm .pt-edit { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr); gap:22px; align-items:start; }
.crm .pt-q { border:1px solid var(--line); border-radius:10px; padding:12px; margin-bottom:8px; background:var(--surface-2); }
.crm .pt-q .row { gap:6px; }
.crm .pt-tally { margin:0 0 14px; }
.crm .pt-tally p { margin:0 0 6px; font-weight:600; font-size:14.5px; }
.crm .pt-tally .r { display:grid; grid-template-columns:minmax(0,1fr) 40px; gap:8px; align-items:center; font-size:13.5px; margin-bottom:4px; }
.crm .pt-tally .bar { position:relative; height:24px; border-radius:6px; background:var(--surface-2); overflow:hidden; }
.crm .pt-tally .bar i { position:absolute; inset:0 auto 0 0; background:color-mix(in srgb, var(--brand) 18%, white); }
.crm .pt-tally .bar span { position:relative; padding:0 8px; line-height:24px; white-space:nowrap; }
.crm .pt-sigs { list-style:none; margin:0; padding:0; }
.crm .pt-sigs li { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--line); font-size:14.5px; }
.crm .pt-sigs li:last-child { border-bottom:0; }
.crm .pt-sigs .t { flex:1; min-width:0; }
.crm .pt-sigs small { color:var(--ink-3); }
@media (max-width: 899px) { .crm .pt-card { grid-template-columns:minmax(0,1fr); } .crm .pt-num { text-align:left; } .crm .pt-edit { grid-template-columns:minmax(0,1fr); } }

/* settings */
.crm .os-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:18px; align-items:start; }
.crm .os-card { background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg); padding:20px; box-shadow:var(--shadow-1); }
.crm .os-card h3 { margin:0 0 4px; font-size:1.1rem; }
.crm .os-card > p { color:var(--ink-2); font-size:14.5px; margin:0 0 14px; }
.crm .os-sender { display:flex; gap:6px; margin-bottom:6px; }
.crm .os-sender .input { min-width:0; }
@media (max-width: 899px) { .crm .os-grid { grid-template-columns:minmax(0,1fr); } }
@media (max-width: 719px) {
  .crm .oc-form { padding:16px; }
  .crm .pc-foot { margin:0; }
  .crm .pc-who h2 { font-size:1.35rem; }
}
`;
    document.head.appendChild(s);
  }

  /* ---------------- memory ---------------- */
  const MEM = {};
  function mem(owner) { if (!MEM[owner]) MEM[owner] = { draft: null, pv: 0, skip: {}, answers: {}, outcome: null, notes: '' }; return MEM[owner]; }

  function mountOutreach(el, ctx, opts) {
    const kit = K();
    if (!kit) { el.innerHTML = '<div class="page"><p class="muted">Outreach is still loading. Reload the page in a moment.</p></div>'; return; }
    kit.injectStyles();
    injectStyles();
    const C = CRM();
    const o = opts || {};
    const owner = o.owner || 'committee';
    const R = kit.embedRoute('outreach', o, ctx);
    const base = R.base, peopleBase = R.peopleBase, embedded = R.embedded;
    const rawSub = String(R.sub || '');
    const qpos = rawSub.indexOf('?');
    const subPath = qpos >= 0 ? rawSub.slice(0, qpos) : rawSub;
    const query = new URLSearchParams(qpos >= 0 ? rawSub.slice(qpos + 1) : '');
    const parts = subPath.split('/').filter(Boolean);
    const section = ['compose', 'calls', 'petitions', 'settings'].indexOf(parts[0]) >= 0 ? parts[0] : 'broadcasts';
    const M = mem(owner);
    const { IC, emptyState, ART, sampleMark, plural, supportMeter, confirmModal, fmtDate, openMenu } = kit;
    el.classList.add('crm');

    if (!C.perms.view(owner)) {
      el.innerHTML = `<div class="${embedded ? '' : 'page '}crm-page"><div class="crm-notice crm-empty"><div class="crm-empty-art" aria-hidden="true">${ART.people}</div>
        <h3>${App.auth && App.auth.role === 'master' ? 'Each county runs its own outreach' : 'This outreach belongs to another team'}</h3>
        <p>${App.auth && App.auth.role === 'master' ? 'Master Network sees statewide totals in the Master Network console. Each county keeps its own lists and messages.' : 'A county party and a candidate committee keep their outreach separate.'}</p></div></div>`;
      return;
    }
    C.ensure();
    const canSend = C.perms.send(owner);
    const isCamp = C.isCampaign(owner);
    const href = (p) => base + (p ? '/' + p : '');
    const go = (p) => { location.hash = href(p).replace(/^#?/, '#'); };
    const page = document.createElement('div');
    page.className = embedded ? 'crm-page crm-embedded' : 'page crm-page';
    el.innerHTML = '';
    el.appendChild(page);

    function listName(id) { const l = C.getList(id); return l ? l.name : 'A deleted list'; }
    function headHtml() {
      const bs = C.broadcasts(owner);
      const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
      const sentMonth = bs.filter((b) => b.status === 'sent' && Date.parse(b.sentAt) >= month.getTime()).reduce((n, b) => n + ((b.counts && b.counts.sent) || 0), 0);
      const ppl = C.people(owner);
      const em = ppl.filter((p) => p.email && p.emailOptIn && !p.doNotContact).length;
      const sm = ppl.filter((p) => p.phone && p.smsOptIn && !p.doNotContact).length;
      const nav = [['', 'Broadcasts', bs.length], ['calls', 'Phone bank', C.callCampaigns(owner).length], ['petitions', 'Petitions & surveys', C.petitions(owner).length], ['settings', 'Sending settings', null]];
      const cur = section === 'compose' ? '' : section === 'broadcasts' ? '' : section;
      const H = embedded ? 'h2' : 'h1';
      return `<div class="crm-head"><div>
          ${isCamp ? `<div class="crm-owner">${esc(C.ownerLabel(owner))}</div>` : ''}
          <${H} class="crm-h1">Outreach</${H}>
          <p>${U.fmtNum(sentMonth)} messages sent this month. ${U.fmtNum(em)} people get email and ${U.fmtNum(sm)} get texts.</p></div>
          <div class="crm-head-actions">${canSend && section !== 'compose' ? `<a class="btn btn-primary" href="${esc(href('compose'))}">${OI.send} Write a broadcast</a>` : ''}</div></div>
        <nav class="crm-nav" aria-label="Outreach sections">${nav.map(([k, l, n]) => `<a href="${esc(href(k))}"${k === cur ? ' aria-current="page"' : ''}>${l}${n != null ? `<span class="n">${U.fmtNum(n)}</span>` : ''}</a>`).join('')}</nav>
        ${canSend ? '' : `<p class="crm-ro">${IC.user} You can see every message and result here. ${isCamp ? 'The campaign team' : 'Executive Board members'} send broadcasts and run phone banks.</p>`}`;
    }
    function draw() {
      const y = window.scrollY;
      page.innerHTML = headHtml() + '<div data-sec></div>';
      const sec = page.querySelector('[data-sec]');
      if (section === 'compose') { if (canSend) drawCompose(sec); else drawBroadcasts(sec); }
      else if (section === 'calls') drawCalls(sec);
      else if (section === 'petitions') drawPetitions(sec);
      else if (section === 'settings') drawSettings(sec);
      else drawBroadcasts(sec);
      window.scrollTo(0, y);
    }

    /* =================== BROADCASTS =================== */
    function countsLine(c) {
      if (!c) return '';
      const parts = [];
      if (c.skippedOptOut) parts.push(`${U.fmtNum(c.skippedOptOut)} opted out`);
      if (c.skippedNoContact) parts.push(`${U.fmtNum(c.skippedNoContact)} with no contact info`);
      if (c.skippedQuietHours) parts.push(`${U.fmtNum(c.skippedQuietHours)} held for quiet hours`);
      return parts.join(', ');
    }
    function drawBroadcasts(sec) {
      const bs = C.broadcasts(owner);
      const sched = bs.filter((b) => b.status === 'scheduled');
      const drafts = bs.filter((b) => b.status === 'draft');
      const sent = bs.filter((b) => b.status === 'sent');
      if (!bs.length) {
        sec.innerHTML = emptyState({ art: ART.lists, title: 'No broadcasts yet', body: 'Email or text a saved list. We add the "Paid for by" line and the opt-out line for you, and skip anyone who opted out.', action: canSend ? `<a class="btn btn-primary" href="${esc(href('compose'))}">${OI.send} Write a broadcast</a>` : '' });
        return;
      }
      const first = (b) => String(b.channel === 'sms' ? b.body : b.subject || b.body || '').split('\n')[0];
      sec.innerHTML = `
        ${sched.map((b) => `<div class="ob-sched"><span class="ob-ch${b.channel === 'sms' ? ' sms' : ''}">${b.channel === 'sms' ? IC.chat : IC.mail}</span>
          <div class="t"><b>${esc(first(b))}</b><span>${b.heldForQuietHours ? 'Held for quiet hours. ' : ''}Goes to ${esc(listName(b.listId))} on ${esc(C.util.fmtWhen(b.scheduledFor))} Pacific.</span></div>
          ${canSend ? `<a class="btn btn-sm" href="${esc(href('compose?id=' + b.id))}">Edit</a><button class="btn btn-sm btn-ghost" data-act="unschedule" data-id="${esc(b.id)}">${OI.pause} Cancel send</button>` : ''}</div>`).join('')}
        ${drafts.length ? `<h3 class="small muted" style="text-transform:uppercase;letter-spacing:.06em;margin:4px 0 8px">Drafts</h3><div class="ob-hist" style="margin-bottom:18px">${drafts.map((b) => `<div class="ob-row" style="grid-template-columns:40px minmax(0,1fr) auto"><span class="ob-ch${b.channel === 'sms' ? ' sms' : ''}">${b.channel === 'sms' ? IC.chat : IC.mail}</span><div class="ob-t"><b>${esc(first(b) || 'Untitled draft')}</b><small>To ${esc(listName(b.listId))} · saved ${esc(fmtDate(b.updatedAt || b.createdAt))}</small></div>${canSend ? `<a class="btn btn-sm" href="${esc(href('compose?id=' + b.id))}">Keep writing</a>` : ''}</div>`).join('')}</div>` : ''}
        <div class="ob-hist" role="table" aria-label="Sent broadcasts">
          <div class="ob-row head" role="row"><span></span><span>Message</span><span class="c-from">From</span><span>Sent to</span><span class="c-skip">Skipped</span></div>
          ${sent.map((b) => {
            const c = b.counts || {};
            const skipped = (c.skippedOptOut || 0) + (c.skippedNoContact || 0) + (c.skippedQuietHours || 0);
            return `<div class="ob-row" role="row"><span class="ob-ch${b.channel === 'sms' ? ' sms' : ''}" title="${b.channel === 'sms' ? 'Text' : 'Email'}">${b.channel === 'sms' ? IC.chat : IC.mail}</span>
              <div class="ob-t"><b>${esc(first(b))}</b><small>${b.sample ? sampleMark(b) : ''}${esc(listName(b.listId))} · ${esc(C.util.fmtWhen(b.sentAt))}</small></div>
              <div class="c-from ob-t"><small style="color:var(--ink-2)">${esc(b.sender ? b.sender.name : '')}</small><small>${esc(b.sender ? b.sender.title : '')}</small></div>
              <div class="ob-n">${U.fmtNum(c.sent || 0)}<small>${c.sent === 1 ? 'person' : 'people'}</small></div>
              <div class="c-skip ob-t"><small title="${esc(countsLine(c))}" style="white-space:normal">${skipped ? esc(countsLine(c)) : 'Nobody skipped'}</small></div></div>`;
          }).join('') || '<div class="ob-row"><span></span><span class="muted">Nothing sent yet.</span></div>'}
        </div>`;
    }

    /* =================== COMPOSE =================== */
    function newDraft() {
      const cfg = C.config(owner);
      const ls = C.lists(owner);
      return { id: null, channel: query.get('channel') === 'sms' ? 'sms' : 'email', listId: query.get('list') || (ls[0] ? ls[0].id : ''), sender: 0, subject: '', body: '', when: 'now', at: '', senders: cfg.senderIdentities };
    }
    function loadDraft() {
      const id = query.get('id');
      if (id) {
        const b = C.broadcasts(owner).find((x) => x.id === id);
        if (b) {
          const cfg = C.config(owner);
          const si = Math.max(0, (cfg.senderIdentities || []).findIndex((s) => b.sender && s.name === b.sender.name && s.title === b.sender.title));
          return { id: b.id, channel: b.channel, listId: b.listId, sender: si, subject: b.subject || '', body: b.body || '', when: b.status === 'scheduled' ? 'later' : 'now', at: b.scheduledFor ? toLocalInput(new Date(b.scheduledFor)) : '' };
        }
      }
      if (M.draft && !query.get('list') && !query.get('channel')) return M.draft;
      return newDraft();
    }
    function toLocalInput(d) { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
    let D = null;
    function drawCompose(sec) {
      D = loadDraft();
      M.draft = D;
      const cfg = C.config(owner);
      const ls = C.lists(owner);
      if (!ls.length) {
        sec.innerHTML = emptyState({ art: ART.lists, title: 'Save a list first', body: 'Broadcasts go to a saved list. Filter People by tag, support or place, then choose Save as list.', action: `<a class="btn btn-primary" href="${esc(peopleBase)}">Go to People</a>` });
        return;
      }
      sec.innerHTML = `<div class="oc">
        <form class="oc-form" data-form="compose" novalidate>
          <div class="fld"><span class="fld-label">Send as</span><div class="oc-seg" role="group" aria-label="Channel">
            <button type="button" data-act="ch" data-v="email" aria-pressed="${D.channel === 'email'}">${IC.mail} Email</button>
            <button type="button" data-act="ch" data-v="sms" aria-pressed="${D.channel === 'sms'}">${IC.chat} Text message</button></div></div>
          <div class="fld"><label class="fld-label" for="oc-list">To</label><select class="select" id="oc-list" name="listId">${ls.map((l) => `<option value="${esc(l.id)}"${l.id === D.listId ? ' selected' : ''}>${esc(l.name)} (${U.fmtNum(C.runList(l.id).length)})</option>`).join('')}</select></div>
          <div class="fld"><label class="fld-label" for="oc-from">From</label><select class="select" id="oc-from" name="sender">${(cfg.senderIdentities || []).map((s, i) => `<option value="${i}"${i === Number(D.sender) ? ' selected' : ''}>${esc(s.name)}${s.title ? ', ' + esc(s.title) : ''}</option>`).join('')}</select>
            <p class="fld-hint">Add senders in <a href="${esc(href('settings'))}">Sending settings</a>.</p></div>
          <div class="fld" data-subject${D.channel === 'sms' ? ' hidden' : ''}><label class="fld-label" for="oc-subj">Subject</label><input class="input" id="oc-subj" name="subject" maxlength="120" value="${esc(D.subject)}" placeholder="For example, Phone bank this Saturday at 10 AM"></div>
          <div class="fld"><label class="fld-label" for="oc-body">Message</label><textarea class="textarea" id="oc-body" name="body" rows="${D.channel === 'sms' ? 4 : 9}" placeholder="${D.channel === 'sms' ? 'Hi {first_name}, can you take a two-hour phone bank shift Saturday?' : 'Hi {first_name},'}">${esc(D.body)}</textarea>
            <div class="oc-merge"><span>Insert</span><button type="button" data-act="mf" data-v="{first_name}">{first_name}</button><button type="button" data-act="mf" data-v="{county}">{county}</button></div>
            <div class="oc-count" data-count></div></div>
          <div class="fld"><span class="fld-label">When</span><div class="oc-when">
            <label><input type="radio" name="when" value="now"${D.when === 'now' ? ' checked' : ''}> Send now</label>
            <label><input type="radio" name="when" value="later"${D.when === 'later' ? ' checked' : ''}> Schedule for later</label>
            <input class="input" type="datetime-local" name="at" value="${esc(D.at)}" aria-label="Send date and time"${D.when === 'later' ? '' : ' hidden'}></div></div>
        </form>
        <div class="oc-side">
          <div class="oc-pvh"><span data-pvwho></span><span class="sp"></span><button class="crm-ibtn" type="button" data-act="pv" data-v="-1" aria-label="Preview the previous person">${OI.left}</button><button class="crm-ibtn" type="button" data-act="pv" data-v="1" aria-label="Preview the next person">${OI.right}</button></div>
          <div data-preview aria-live="off"></div>
          <div class="oc-sum" data-summary aria-live="polite"></div>
        </div></div>`;
      paintCompose();
    }
    function readForm() {
      const f = page.querySelector('[data-form="compose"]');
      if (!f) return;
      D.listId = f.listId.value;
      D.sender = Number(f.sender.value) || 0;
      D.subject = f.subject.value;
      D.body = f.body.value;
      D.when = (f.querySelector('input[name="when"]:checked') || {}).value || 'now';
      D.at = f.at.value;
      M.draft = D;
    }
    function scheduledDate() { if (D.when !== 'later' || !D.at) return null; const d = new Date(D.at); return isNaN(d) ? null : d; }
    function paintCompose() {
      const cfg = C.config(owner);
      const sender = (cfg.senderIdentities || [])[D.sender] || { name: C.ownerLabel(owner), title: '' };
      const at = scheduledDate();
      const a = C.audience(owner, D.listId, D.channel, undefined, at || new Date());
      const pool = a.recipients.length ? a.recipients : a.skipped.quietHours.length ? a.skipped.quietHours : C.runList(D.listId);
      const pvP = pool.length ? pool[((M.pv % pool.length) + pool.length) % pool.length] : null;
      const who = page.querySelector('[data-pvwho]');
      if (who) who.textContent = pvP ? `Preview for ${pvP.name}${pool.length > 1 ? ` (${(((M.pv % pool.length) + pool.length) % pool.length) + 1} of ${U.fmtNum(pool.length)})` : ''}` : 'Nobody on this list yet';
      const body = C.mergeFields(D.body, pvP);
      const foot = C.footer(owner, D.channel);
      const pv = page.querySelector('[data-preview]');
      if (D.channel === 'email') {
        pv.innerHTML = `<div class="oc-mail"><div class="hd"><span>From</span><b>${esc(sender.name)}${sender.title ? `, ${esc(sender.title)}` : ''}</b><span>To</span><b>${esc(pvP ? (pvP.email || 'No email on file') : '')}</b><span>Subject</span><b>${esc(C.mergeFields(D.subject, pvP) || 'No subject yet')}</b></div>
          <div class="bd">${body ? esc(body) : '<span class="muted">Your message shows here as you type.</span>'}</div><div class="ft">${esc(foot)}</div></div>`;
      } else {
        const full = (body ? body + '\n\n' : '') + `${sender.name}: ` + foot;
        pv.innerHTML = `<div class="oc-phone"><div class="who">${esc(pvP ? C.util.fmtPhone(pvP.phone) : '')}</div><div class="oc-bub">${body ? esc(body) : '<span class="muted">Your text shows here.</span>'}\n\n<span class="ftx">${esc(sender.name)}: ${esc(foot)}</span></div></div>`;
        void full;
      }
      const cnt = page.querySelector('[data-count]');
      if (cnt) {
        if (D.channel === 'sms') {
          const seg = C.smsSegments(`${body}\n\n${sender.name}: ${foot}`);
          cnt.innerHTML = `<span>${U.fmtNum(seg.chars)} characters with the opt-out line${seg.encoding === 'Unicode' ? ' (emoji or special characters shorten each segment)' : ''}</span><span class="${seg.segments > 2 ? 'warn' : ''}">${seg.segments} ${seg.segments === 1 ? 'segment' : 'segments'}</span>`;
        } else cnt.innerHTML = `<span>The "Paid for by" line, your mailing address and an unsubscribe line are added at the bottom.</span>`;
      }
      // summary
      const sum = page.querySelector('[data-summary]');
      const sk = a.skipped;
      const quiet = D.channel === 'sms' && sk.quietHours.length;
      const n = quiet ? sk.quietHours.length : a.recipients.length;
      const errs = [];
      if (!cfg.paidForBy) errs.push(`Add the "Paid for by" disclaimer in <a href="${esc(href('settings'))}">Sending settings</a>.`);
      if (D.channel === 'email' && !cfg.mailingAddress) errs.push(`Add your mailing address in <a href="${esc(href('settings'))}">Sending settings</a>.`);
      let when;
      if (quiet) when = `at ${C.util.fmtWhen(a.quiet.next)}`;
      else if (at && at.getTime() > Date.now() + 30000) when = `on ${C.util.fmtWhen(at)}`;
      const label = !n ? 'Nobody to send to' : quiet || when ? `Schedule for ${plural(n, 'person', 'people')}` : `Send to ${plural(n, 'person', 'people')}`;
      sum.innerHTML = `<div class="big"><b>${U.fmtNum(n)}</b><span>${n === 1 ? 'person' : 'people'} ${quiet ? 'get this text at 8:00 AM Pacific' : when ? `get this ${when}` : `will get this ${D.channel === 'sms' ? 'text' : 'email'}`}</span></div>
        <ul>
          <li><span>On ${esc(listName(D.listId))}</span><b>${U.fmtNum(a.total)}</b></li>
          <li><span>Skipped: opted out or never opted in</span><b>${U.fmtNum(sk.optOut.length)}</b></li>
          <li><span>Skipped: no ${D.channel === 'sms' ? 'mobile number' : 'email address'}</span><b>${U.fmtNum(sk.noContact.length)}</b></li>
          <li><span>Skipped: do not contact</span><b>${U.fmtNum(sk.doNotContact.length)}</b></li>
          ${D.channel === 'sms' ? `<li><span>Held for quiet hours</span><b>${U.fmtNum(sk.quietHours.length)}</b></li>` : ''}
        </ul>
        ${quiet ? `<div class="oc-quiet">${OI.moon}<span>It's ${esc(a.quiet.localTime)} in California. Texts only go out from 8 AM to 9 PM in the recipient's time, so this one waits until ${esc(C.util.fmtWhen(a.quiet.next))}.</span></div>` : ''}
        ${errs.length ? `<p class="oc-err">${errs.join(' ')}</p>` : ''}
        <div class="acts"><button class="btn btn-ghost" type="button" data-act="save-draft">Save draft</button><button class="btn btn-primary" type="button" data-act="send"${!n || errs.length ? ' aria-disabled="true"' : ''}>${OI.send} ${esc(label)}</button></div>`;
    }
    function doSend() {
      readForm();
      const cfg = C.config(owner);
      if (!D.listId) { ctx.toast('Pick a list to send to.', 'warn'); return; }
      if (D.channel === 'email' && !D.subject.trim()) { ctx.toast('Add a subject line.', 'warn'); page.querySelector('#oc-subj').focus(); return; }
      if (!D.body.trim()) { ctx.toast('Write the message first.', 'warn'); page.querySelector('#oc-body').focus(); return; }
      if (D.when === 'later' && !scheduledDate()) { ctx.toast('Pick a date and time to send.', 'warn'); return; }
      const at = scheduledDate();
      const a = C.audience(owner, D.listId, D.channel, undefined, at || new Date());
      const quiet = D.channel === 'sms' && a.skipped.quietHours.length;
      const n = quiet ? a.skipped.quietHours.length : a.recipients.length;
      if (!n) { ctx.toast('Nobody on this list can get this message right now.', 'warn'); return; }
      const sender = (cfg.senderIdentities || [])[D.sender] || { name: C.ownerLabel(owner), title: '' };
      const kind = D.channel === 'sms' ? 'text' : 'email';
      const later = quiet || (at && at.getTime() > Date.now() + 30000);
      confirmModal({
        title: later ? `Schedule this ${kind} for ${plural(n, 'person', 'people')}?` : `Send this ${kind} to ${plural(n, 'person', 'people')}?`,
        html: `<p>It goes to ${esc(listName(D.listId))} from ${esc(sender.name)}${later ? ` on ${esc(C.util.fmtWhen(quiet ? a.quiet.next : at))} Pacific` : ' right away'}. A sent ${kind} can't be called back.</p>`,
        ok: later ? 'Schedule' : `Send ${kind}`,
        onOk: () => {
          try {
            const r = C.sendBroadcast({ id: D.id || undefined, owner, channel: D.channel, sender: { name: sender.name, title: sender.title }, listId: D.listId, subject: D.channel === 'email' ? D.subject.trim() : undefined, body: D.body.trim() }, undefined, { scheduleFor: later && !quiet ? at : null });
            const c = r.broadcast.counts || {};
            const skippedTxt = countsLine(c);
            const notQuiet = countsLine(Object.assign({}, c, { skippedQuietHours: 0 }));
            if (r.scheduled) ctx.toast(`Scheduled for ${C.util.fmtWhen(r.at)} Pacific to ${plural(n, 'person', 'people')}.${notQuiet ? ' Skipping ' + notQuiet + '.' : ''}`, 'ok', { duration: 6000 });
            else ctx.toast(`Sent to ${plural(c.sent, 'person', 'people')}.${skippedTxt ? ' Skipped ' + skippedTxt + '.' : ''} Each send is on their timeline.`, 'ok', { duration: 6000 });
            M.draft = null;
            go('');
          } catch (err) { ctx.toast(err.message || 'That didn\'t send. Try again.', 'error'); }
        },
      });
    }

    /* =================== PHONE BANK =================== */
    function drawCalls(sec) {
      if (parts[1] === 'edit') return drawCallEdit(sec, parts[2]);
      if (parts[1]) return drawCalling(sec, parts[1]);
      const cs = C.callCampaigns(owner);
      const newFor = query.get('new');
      if (newFor && canSend) { setTimeout(() => go('calls/edit/new?list=' + encodeURIComponent(newFor)), 0); }
      if (!cs.length) {
        sec.innerHTML = emptyState({ art: ART.path, title: 'No call campaigns yet', body: 'Pick a saved list and write a short script. Callers get one contact at a time on their phone, with tap-to-call.', action: canSend ? `<a class="btn btn-primary" href="${esc(href('calls/edit/new'))}">${IC.plus} New call campaign</a>` : '' });
        return;
      }
      sec.innerHTML = `${canSend ? `<div class="row" style="justify-content:flex-end;margin-bottom:12px"><a class="btn btn-sm" href="${esc(href('calls/edit/new'))}">${IC.plus} New call campaign</a></div>` : ''}
        <div class="pb-cards">${cs.map((c) => {
          const pr = C.callProgress(c.id);
          const pct = pr.total ? (pr.called / pr.total) * 100 : 0;
          const tal = pr.total ? (pr.outcomes.talked / pr.total) * 100 : 0;
          return `<article class="pb-card"><div class="row" style="justify-content:space-between"><span class="badge ${c.status === 'closed' ? '' : 'badge-ok'}">${c.status === 'closed' ? 'Closed' : 'Calling'}</span>${c.sample ? sampleMark(c) : ''}</div>
            <h3>${esc(c.name)}</h3><p class="small muted" style="margin:0">Calling ${esc(listName(c.listId))}</p>
            <div><div class="row" style="justify-content:space-between;font-size:14px;margin-bottom:6px"><b>${U.fmtNum(pr.called)} of ${U.fmtNum(pr.total)} called</b><span class="muted">${U.fmtNum(pr.left)} left</span></div>
              <div class="pb-bar" role="img" aria-label="${pr.called} of ${pr.total} called, ${pr.outcomes.talked} talked"><i class="t" style="width:${tal}%"></i><i class="o" style="width:${Math.max(0, pct - tal)}%"></i></div></div>
            <div class="pb-legend">${C.CALL_OUTCOMES.map((x) => `<span><b>${U.fmtNum(pr.outcomes[x.id] || 0)}</b> ${esc(x.label.toLowerCase())}</span>`).join('')}</div>
            <div class="acts">${canSend && c.status !== 'closed' ? `<a class="btn btn-primary" href="${esc(href('calls/' + c.id))}">${IC.phone} Start calling</a>` : ''}${canSend ? `<a class="btn btn-ghost" href="${esc(href('calls/edit/' + c.id))}">Edit</a>` : ''}</div></article>`;
        }).join('')}</div>`;
    }
    function drawCallEdit(sec, id) {
      if (!canSend) { go('calls'); return; }
      const c = id && id !== 'new' ? C.getCallCampaign(id) : null;
      const ls = C.lists(owner);
      if (!ls.length) { sec.innerHTML = emptyState({ art: ART.lists, title: 'Save a list first', body: 'A call campaign calls everyone on a saved list.', action: `<a class="btn btn-primary" href="${esc(peopleBase)}">Go to People</a>` }); return; }
      const qs = c ? c.questions : [{ id: 'q1', text: 'If the election were today, would you vote for our endorsed candidates?', short: 'Support', options: [{ label: 'Yes, for sure', support: 5 }, { label: 'Leaning yes', support: 4 }, { label: 'Not sure yet', support: 3 }, { label: 'Leaning no', support: 2 }, { label: 'No', support: 1 }] }];
      const kindOf = (q) => ((q.options || []).some((x) => x.support) ? 'support' : (q.options || []).some((x) => x.tag) ? 'yesno' : 'choice');
      const qRow = (q, i) => `<div class="pt-q" data-q><div class="row"><label class="sr-only" for="cq-${i}">Question ${i + 1}</label><input class="input" id="cq-${i}" data-qt value="${esc(q.text || '')}" placeholder="Question ${i + 1}" style="flex:1 1 260px">
          <select class="select" data-qk style="flex:0 1 210px" aria-label="Answer type"><option value="support"${kindOf(q) === 'support' ? ' selected' : ''}>Support, 1 to 5</option><option value="yesno"${kindOf(q) === 'yesno' ? ' selected' : ''}>Yes or no, tags a yes</option><option value="choice"${kindOf(q) === 'choice' ? ' selected' : ''}>Choices</option></select>
          <button type="button" class="crm-ibtn" data-act="q-rm" aria-label="Remove question">${OI.trash}</button></div>
          <input class="input" data-qx style="margin-top:6px" value="${esc(kindOf(q) === 'yesno' ? ((q.options || []).find((x) => x.tag) || {}).tag || '' : kindOf(q) === 'choice' ? (q.options || []).map((x) => x.label || x).join(', ') : '')}" placeholder="${kindOf(q) === 'yesno' ? 'Tag to add on a yes, like Yard sign' : 'Choices, separated by commas'}"${kindOf(q) === 'support' ? ' hidden' : ''} aria-label="Answer details"></div>`;
      sec.innerHTML = `<form class="oc-form" data-form="callcamp" style="max-width:760px" novalidate>
        <h2 style="font-size:1.3rem;margin:0 0 14px">${c ? 'Edit call campaign' : 'New call campaign'}</h2>
        <div class="fld"><label class="fld-label" for="cc-n">Name</label><input class="input" id="cc-n" name="name" value="${esc(c ? c.name : '')}" placeholder="For example, Undecided voters before Election Day"></div>
        <div class="fld"><label class="fld-label" for="cc-l">Who to call</label><select class="select" id="cc-l" name="listId">${ls.map((l) => `<option value="${esc(l.id)}"${(c ? c.listId : query.get('list')) === l.id ? ' selected' : ''}>${esc(l.name)} (${U.fmtNum(C.runList(l.id).filter((p) => p.phone && !p.doNotContact).length)} with a phone number)</option>`).join('')}</select><p class="fld-hint">We skip anyone marked do not contact.</p></div>
        <div class="fld"><label class="fld-label" for="cc-s">Script</label><textarea class="textarea" id="cc-s" name="script" rows="6" placeholder="Hi {first_name}, this is a volunteer with the {county} Republican Party.">${esc(c ? c.script : '')}</textarea><p class="fld-hint">{first_name} and {county} fill in for each call.</p></div>
        <div class="fld"><span class="fld-label">Questions</span><div data-qs>${qs.map(qRow).join('')}</div><button type="button" class="btn btn-sm btn-ghost" data-act="q-add">${IC.plus} Add a question</button>
          <p class="fld-hint">A support answer updates the person's support score. A yes on a tagging question adds the tag.</p></div>
        <div class="row">${c ? `<label class="toggle"><input type="checkbox" name="closed"${c.status === 'closed' ? ' checked' : ''}> Closed</label>` : ''}<span class="spacer"></span><a class="btn btn-ghost" href="${esc(href('calls'))}">Cancel</a><button class="btn btn-primary" type="submit">${c ? 'Save changes' : 'Create call campaign'}</button></div>
      </form>`;
      sec.dataset.qrow = '1';
      sec._qRow = qRow;
      sec._editing = c;
    }
    function readQuestions(form) {
      return Array.from(form.querySelectorAll('[data-q]')).map((row, i) => {
        const text = row.querySelector('[data-qt]').value.trim();
        if (!text) return null;
        const kind = row.querySelector('[data-qk]').value;
        const x = row.querySelector('[data-qx]').value.trim();
        let options;
        if (kind === 'support') options = [{ label: 'Yes, for sure', support: 5 }, { label: 'Leaning yes', support: 4 }, { label: 'Not sure yet', support: 3 }, { label: 'Leaning no', support: 2 }, { label: 'No', support: 1 }];
        else if (kind === 'yesno') options = [{ label: 'Yes', tag: x || text.slice(0, 30) }, { label: 'No' }];
        else options = x.split(',').map((s) => s.trim()).filter(Boolean).map((label) => ({ label }));
        return { id: 'q' + (i + 1), text, short: kind === 'support' ? 'Support' : text.length > 40 ? text.slice(0, 38) + '…' : text, options };
      }).filter((q) => q && q.options.length);
    }

    /* calling screen */
    function drawCalling(sec, id) {
      const c = C.getCallCampaign(id);
      if (!c) { sec.innerHTML = emptyState({ art: ART.path, title: 'That call campaign is gone', body: 'It may have been deleted.', action: `<a class="btn" href="${esc(href('calls'))}">Back to the phone bank</a>` }); return; }
      if (!canSend) { go('calls'); return; }
      const skipped = M.skip[id] || (M.skip[id] = []);
      let q = C.callQueue(id);
      q = q.filter((p) => skipped.indexOf(p.id) < 0).concat(q.filter((p) => skipped.indexOf(p.id) >= 0));
      const pr = C.callProgress(id);
      const pct = pr.total ? (pr.called / pr.total) * 100 : 0;
      const top = `<div class="pc-top"><a class="crm-ibtn" href="${esc(href('calls'))}" aria-label="Back to the phone bank">${OI.left}</a><div class="t"><b>${esc(c.name)}</b><small>${U.fmtNum(pr.called)} of ${U.fmtNum(pr.total)} called · ${U.fmtNum(pr.left)} left</small></div></div>
        <div class="pb-bar" style="margin-bottom:14px" role="progressbar" aria-valuemin="0" aria-valuemax="${pr.total}" aria-valuenow="${pr.called}" aria-label="Calls made"><i class="t" style="width:${pct}%"></i></div>`;
      const p = q[0];
      if (!p) {
        sec.innerHTML = `<div class="pc">${top}<div class="pc-card"><div class="pc-done"><div class="crm-empty-art" aria-hidden="true">${ART.tasks}</div><h2 style="font-size:1.4rem">Everyone on this list has a call logged</h2><p class="muted">${U.fmtNum(pr.outcomes.talked)} conversations so far. Thank you for calling.</p><a class="btn btn-primary" href="${esc(href('calls'))}">Back to the phone bank</a></div></div></div>`;
        return;
      }
      if (M.cur !== p.id) { M.cur = p.id; M.answers = {}; M.outcome = null; M.notes = ''; }
      const last = C.timeline(p.id).find((x) => x.type !== 'note');
      sec.innerHTML = `<div class="pc">${top}
        <article class="pc-card${M.anim ? ' in' : ''}" aria-label="Call ${esc(p.name)}">
          <div class="pc-who">${U.avatar(p.name, 52)}<div style="min-width:0"><h2>${esc(p.name)}${sampleMark(p)}</h2><small>${esc([p.city, p.zip].filter(Boolean).join(' '))}</small><div style="margin-top:4px">${supportMeter(p.support)}</div></div></div>
          ${last ? `<p class="pc-last"><b>Last time:</b> ${esc(last.summary)} <span class="muted">(${esc(fmtDate(last.at))})</span></p>` : ''}
          <a class="pc-dial" href="tel:+1${esc(p.phone)}">${IC.phone} Call ${esc(C.util.fmtPhone(p.phone))}</a>
          <div class="pc-sec"><h3>Script</h3><p class="pc-script">${esc(C.mergeFields(c.script, p))}</p></div>
          ${(c.questions || []).length ? `<div class="pc-sec"><h3>Questions</h3>${c.questions.map((qq) => `<div class="pc-q"><p>${esc(qq.text)}</p><div class="pc-opts" role="group" aria-label="${esc(qq.text)}">${(qq.options || []).map((op) => { const l = op.label || op; return `<button type="button" data-act="ans" data-q="${esc(qq.id)}" data-v="${esc(l)}" aria-pressed="${M.answers[qq.id] === l}">${esc(l)}</button>`; }).join('')}</div></div>`).join('')}</div>` : ''}
          <div class="pc-sec"><h3>How did it go?</h3><div class="pc-out" role="group" aria-label="Call outcome">${C.CALL_OUTCOMES.map((x) => `<button type="button" data-act="outcome" data-v="${x.id}" aria-pressed="${M.outcome === x.id}">${esc(x.label)}</button>`).join('')}</div>
            <label class="sr-only" for="pc-notes">Notes</label><textarea class="textarea" id="pc-notes" data-notes rows="2" style="margin-top:10px;min-height:64px" placeholder="Notes for the next caller">${esc(M.notes)}</textarea></div>
          <div class="pc-foot"><button class="btn btn-ghost" type="button" data-act="skip">${OI.skip} Skip</button><button class="btn btn-primary" type="button" data-act="save-call"${M.outcome ? '' : ' aria-disabled="true"'}>Save and next</button></div>
        </article></div>`;
      M.anim = false;
    }
    function saveCall(id) {
      const q = C.callQueue(id);
      const skipped = M.skip[id] || [];
      const order = q.filter((p) => skipped.indexOf(p.id) < 0).concat(q.filter((p) => skipped.indexOf(p.id) >= 0));
      const p = order[0];
      if (!p) return;
      if (!M.outcome) { ctx.toast('Pick how the call went first.', 'warn'); return; }
      const n = page.querySelector('[data-notes]');
      C.logCall(id, p.id, { outcome: M.outcome, answers: M.answers, notes: n ? n.value.trim() : '' });
      M.skip[id] = skipped.filter((x) => x !== p.id);
      const next = order[1];
      M.anim = true;
      ctx.toast(`Saved ${p.firstName || p.name}'s call.${next ? ` Next up: ${next.name}.` : ''}`, 'ok', { duration: 2200 });
      draw();
      window.scrollTo(0, 0);
    }

    /* =================== PETITIONS =================== */
    function drawPetitions(sec) {
      if (parts[1]) return drawPetitionEdit(sec, parts[1]);
      const ps = C.petitions(owner);
      if (!ps.length) {
        sec.innerHTML = emptyState({ art: ART.lists, title: 'No petitions or surveys yet', body: 'Each one gets its own public page. Everyone who signs lands in People with a petition tag.', action: canSend ? `<a class="btn btn-primary" href="${esc(href('petitions/new'))}">${IC.plus} New petition or survey</a>` : '' });
        return;
      }
      sec.innerHTML = `${canSend ? `<div class="row" style="justify-content:flex-end;margin-bottom:12px"><a class="btn btn-sm" href="${esc(href('petitions/new'))}">${IC.plus} New petition or survey</a></div>` : ''}
        <div class="pt-list">${ps.map((p) => {
          const n = C.petitionCount(p);
          const pct = p.goal ? Math.min(100, (n / p.goal) * 100) : 0;
          const url = C.petitionUrl(p);
          const st = { draft: ['', 'Draft'], live: ['badge-ok', 'Live'], closed: ['badge-warn', 'Closed'] }[p.status] || ['', p.status];
          return `<article class="pt-card"><div style="min-width:0"><div class="pt-badges"><span class="badge ${st[0]}">${st[1]}</span><span class="badge badge-local">${p.kind === 'survey' ? 'Survey' : 'Petition'}</span>${sampleMark(p)}</div>
              <h3>${esc(p.title)}</h3><p>${esc(p.ask)}</p>
              ${p.status === 'draft' ? '<p class="small muted" style="margin-top:10px">The public page opens when you make it live.</p>' : `<div class="pt-link"><code title="${esc(url)}">${esc(url)}</code><button class="btn btn-sm" type="button" data-act="copy" data-v="${esc(url)}">${OI.copy} Copy link</button></div>`}</div>
            <div class="pt-num"><b>${U.fmtNum(n)}</b><small>${p.kind === 'survey' ? 'responses' : 'signatures'} of ${U.fmtNum(p.goal || 0)}</small><div class="pb-bar" role="img" aria-label="${Math.round(pct)}% of the goal"><i class="t" style="width:${pct}%"></i></div></div>
            <div class="pt-acts"><a class="btn btn-sm" href="${esc(href('petitions/' + p.id))}">${canSend ? 'Edit and see signers' : 'See signers'}</a>
              <button class="btn btn-sm btn-ghost" type="button" data-act="pt-csv" data-id="${esc(p.id)}">${IC.download} Export CSV</button>
              ${canSend ? (p.status === 'live' ? `<button class="btn btn-sm btn-ghost" type="button" data-act="pt-status" data-id="${esc(p.id)}" data-v="closed">Close</button>` : `<button class="btn btn-sm btn-ghost" type="button" data-act="pt-status" data-id="${esc(p.id)}" data-v="live">${p.status === 'closed' ? 'Reopen' : 'Make live'}</button>`) : ''}</div></article>`;
        }).join('')}</div>`;
    }
    function drawPetitionEdit(sec, id) {
      const p = id === 'new' ? null : C.getPetition(id);
      if (id !== 'new' && !p) { go('petitions'); return; }
      if (!p && !canSend) { go('petitions'); return; }
      const d = p || { kind: query.get('kind') === 'survey' ? 'survey' : 'petition', title: '', slug: '', ask: '', goal: 250, questions: [], status: 'draft' };
      const sigs = p ? C.signatures(p.id) : [];
      const n = p ? C.petitionCount(p) : 0;
      const dis = canSend ? '' : ' disabled';
      const qRow = (q, i) => `<div class="pt-q" data-pq><div class="row"><input class="input" data-pqt value="${esc(q.text || '')}" placeholder="Question ${i + 1}" aria-label="Question ${i + 1}" style="flex:1 1 240px"${dis}>${canSend ? `<button type="button" class="crm-ibtn" data-act="pq-rm" aria-label="Remove question">${OI.trash}</button>` : ''}</div>
        <input class="input" data-pqo style="margin-top:6px" value="${esc((q.options || []).join(', '))}" placeholder="Choices, separated by commas" aria-label="Choices for question ${i + 1}"${dis}></div>`;
      const tallies = p && p.kind === 'survey' ? (p.questions || []).map((q) => {
        const counts = {}; (q.options || []).forEach((o) => { counts[o] = 0; });
        sigs.forEach((s) => { const a = s.answers && s.answers[q.id]; if (a != null) counts[a] = (counts[a] || 0) + 1; });
        const tot = Object.values(counts).reduce((x, y) => x + y, 0) || 1;
        return `<div class="pt-tally"><p>${esc(q.text)}</p>${Object.keys(counts).map((k) => `<div class="r"><div class="bar"><i style="width:${(counts[k] / tot) * 100}%"></i><span>${esc(k)}</span></div><b style="text-align:right;font-variant-numeric:tabular-nums">${counts[k]}</b></div>`).join('')}</div>`;
      }).join('') : '';
      sec.innerHTML = `<div class="pt-edit">
        <form class="oc-form" data-form="petition" novalidate>
          <div class="row" style="margin-bottom:12px"><a class="crm-ibtn" href="${esc(href('petitions'))}" aria-label="Back to petitions">${OI.left}</a><h2 style="font-size:1.3rem;margin:0;flex:1">${p ? (canSend ? 'Edit ' : '') + (p.kind === 'survey' ? 'survey' : 'petition') : 'New petition or survey'}</h2>${p && p.sample ? sampleMark(p) : ''}</div>
          <div class="fld"><span class="fld-label">Kind</span><div class="oc-seg" role="group" aria-label="Kind"><button type="button" data-act="pk" data-v="petition" aria-pressed="${d.kind === 'petition'}"${dis}>Petition</button><button type="button" data-act="pk" data-v="survey" aria-pressed="${d.kind === 'survey'}"${dis}>Survey</button></div></div>
          <div class="fld"><label class="fld-label" for="pt-t">Title</label><input class="input" id="pt-t" name="title" maxlength="140" value="${esc(d.title)}" placeholder="For example, Publish the county overtime report before the budget vote"${dis}></div>
          <div class="fld"><label class="fld-label" for="pt-a">The ask</label><textarea class="textarea" id="pt-a" name="ask" rows="4" placeholder="What signers are asking for, and of whom."${dis}>${esc(d.ask)}</textarea></div>
          <div class="grid-2" style="gap:12px"><div class="fld"><label class="fld-label" for="pt-g">Goal</label><input class="input" id="pt-g" name="goal" type="number" min="1" step="1" value="${esc(d.goal)}"${dis}></div>
            <div class="fld"><label class="fld-label" for="pt-s">Web address ending</label><input class="input" id="pt-s" name="slug" value="${esc(d.slug)}" placeholder="made from the title"${dis}></div></div>
          <div class="fld" data-qbox${d.kind === 'survey' ? '' : ' hidden'}><span class="fld-label">Survey questions</span><div data-pqs>${(d.questions && d.questions.length ? d.questions : [{ text: '', options: [] }]).map(qRow).join('')}</div>${canSend ? `<button type="button" class="btn btn-sm btn-ghost" data-act="pq-add">${IC.plus} Add a question</button>` : ''}</div>
          <div class="fld"><label class="fld-label" for="pt-st">Status</label><select class="select" id="pt-st" name="status"${dis}>${[['draft', 'Draft: only your team sees it'], ['live', 'Live: the public page takes signatures'], ['closed', 'Closed: the page shows the result and stops taking signatures']].map(([v, l]) => `<option value="${v}"${d.status === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
          ${p && p.status !== 'draft' ? `<div class="pt-link" style="margin-bottom:14px"><code>${esc(C.petitionUrl(p))}</code><button class="btn btn-sm" type="button" data-act="copy" data-v="${esc(C.petitionUrl(p))}">${OI.copy} Copy link</button></div>` : ''}
          ${canSend ? `<div class="row"><span class="spacer"></span><a class="btn btn-ghost" href="${esc(href('petitions'))}">Cancel</a><button class="btn btn-primary" type="submit">${p ? 'Save changes' : 'Create'}</button></div>` : ''}
        </form>
        <aside class="oc-form">${p ? `<div class="row" style="justify-content:space-between;margin-bottom:10px"><h3 style="margin:0;font-size:1.1rem">${U.fmtNum(n)} ${p.kind === 'survey' ? 'responses' : 'signatures'}</h3><button class="btn btn-sm btn-ghost" type="button" data-act="pt-csv" data-id="${esc(p.id)}">${IC.download} Export CSV</button></div>
          ${p.seedCount ? `<p class="small muted" style="margin:0 0 10px">${U.fmtNum(p.seedCount)} came in on paper before the page went online. The ${U.fmtNum(sigs.length)} below signed online and are in People with the tag petition:${esc(p.slug)}.</p>` : ''}
          ${tallies}
          ${sigs.length ? `<ul class="pt-sigs">${sigs.slice(0, 25).map((s) => `<li>${U.avatar(s.name, 28)}<div class="t"><b>${esc(s.name)}</b>${sampleMark(s)}<br><small>${esc([s.zip, s.optIn ? 'Wants updates' : 'No updates'].filter(Boolean).join(' · '))}</small></div><small>${esc(fmtDate(s.createdAt))}</small></li>`).join('')}</ul>${sigs.length > 25 ? `<p class="small muted">and ${U.fmtNum(sigs.length - 25)} more in the CSV.</p>` : ''}` : '<p class="muted small">No online signatures yet. Share the link to get the first ones.</p>'}`
        : '<h3 style="margin:0 0 6px;font-size:1.1rem">How it works</h3><p class="small muted" style="margin:0">Make it live to open its public page. Each signer becomes a person in People, tagged with this petition, so you can thank them and invite them to help.</p>'}</aside></div>`;
      sec._pqRow = qRow;
      sec._pkind = d.kind;
    }
    function petitionCsv(p) {
      const sigs = C.signatures(p.id);
      const qs = p.kind === 'survey' ? (p.questions || []) : [];
      const rows = [['Name', 'Email', 'Phone', 'ZIP', 'Wants updates', 'Signed'].concat(qs.map((q) => q.text))].concat(sigs.map((s) => [s.name, s.email, C.util.fmtPhone(s.phone), s.zip, s.optIn ? 'Yes' : 'No', String(s.createdAt || '').slice(0, 10)].concat(qs.map((q) => (s.answers && s.answers[q.id]) || ''))));
      const name = `${ctx.tenantSlug || 'county'}-${p.slug}-${C.util.isoDay(Date.now())}.csv`;
      C.download(name, C.csv(rows));
      ctx.toast(`Downloaded ${plural(sigs.length, 'online signature')} as ${name}.`, 'ok');
    }

    /* =================== SETTINGS =================== */
    function drawSettings(sec) {
      const cfg = C.config(owner);
      const dis = canSend ? '' : ' disabled';
      sec.innerHTML = `<form data-form="settings" novalidate><div class="os-grid">
        <section class="os-card"><h3>Who it's from</h3><p>Pick one of these when you write a broadcast. Use the name people know, like your chair.</p>
          <div data-senders>${(cfg.senderIdentities || []).map((s, i) => `<div class="os-sender"><input class="input" data-sn value="${esc(s.name)}" placeholder="Name" aria-label="Sender ${i + 1} name"${dis}><input class="input" data-st value="${esc(s.title || '')}" placeholder="Title" aria-label="Sender ${i + 1} title" style="max-width:160px"${dis}>${canSend ? `<button type="button" class="crm-ibtn" data-act="snd-rm" aria-label="Remove sender">${OI.trash}</button>` : ''}</div>`).join('')}</div>
          ${canSend ? `<button type="button" class="btn btn-sm btn-ghost" data-act="snd-add">${IC.plus} Add a sender</button>` : ''}</section>
        <section class="os-card"><h3>Required lines ${cfg.sample ? sampleMark(cfg) : ''}</h3><p>These go at the bottom of every message. Check them with your treasurer.</p>
          <div class="fld"><label class="fld-label" for="os-p">"Paid for by" disclaimer</label><input class="input" id="os-p" name="paidForBy" value="${esc(cfg.paidForBy || '')}" placeholder="Paid for by ..., FPPC ID #..."${dis}></div>
          <div class="fld"><label class="fld-label" for="os-a">Mailing address for email</label><input class="input" id="os-a" name="mailingAddress" value="${esc(cfg.mailingAddress || '')}" placeholder="Street or P.O. box, city, state and ZIP"${dis}></div>
          <p class="small muted" style="margin:0">Texts go out from 8 AM to 9 PM in the recipient's time (Pacific in California) and always end with "Reply STOP to opt out." Anyone who replies STOP stops getting texts right away.</p></section>
        <section class="os-card"><h3>Donor limit warning</h3><p>Your treasurer sets this number. When a donor's gifts this cycle pass it, their profile shows a warning and the treasurer gets a task. It doesn't check any law for you.</p>
          <div class="fld"><label class="fld-label" for="os-d">Per-election limit per donor (USD)</label><input class="input" id="os-d" name="donorLimit" type="number" min="0" step="1" value="${esc(cfg.donorLimit == null ? '' : cfg.donorLimit)}" placeholder="Leave empty for no warning"${dis}></div></section>
      </div>${canSend ? '<div class="row" style="margin-top:16px"><span class="spacer"></span><button class="btn btn-primary" type="submit">Save settings</button></div>' : ''}</form>`;
    }

    /* =================== events =================== */
    el.addEventListener('input', (e) => {
      if (section === 'compose' && e.target.closest('[data-form="compose"]')) { readForm(); paintCompose(); }
      if (e.target.matches('[data-notes]')) M.notes = e.target.value;
    });
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (section === 'compose' && t.closest('[data-form="compose"]') && (t.tagName === 'SELECT' || t.type === 'radio' || t.type === 'datetime-local')) {
        readForm();
        if (t.name === 'when') { const at = page.querySelector('input[name="at"]'); at.hidden = D.when !== 'later'; if (D.when === 'later' && !at.value) { const d = new Date(Date.now() + 86400000); d.setHours(10, 0, 0, 0); at.value = toLocalInput(d); readForm(); } }
        M.pv = 0;
        paintCompose();
      }
      if (t.matches('[data-qk]')) { const x = t.closest('[data-q]').querySelector('[data-qx]'); x.hidden = t.value === 'support'; x.placeholder = t.value === 'yesno' ? 'Tag to add on a yes, like Yard sign' : 'Choices, separated by commas'; }
    });
    el.addEventListener('submit', (e) => {
      const f = e.target;
      e.preventDefault();
      if (f.dataset.form === 'callcamp') {
        const name = f.name.value.trim();
        if (!name) { ctx.toast('Give the call campaign a name.', 'warn'); f.name.focus(); return; }
        const sec = page.querySelector('[data-sec]');
        const c = sec._editing;
        const saved = C.saveCallCampaign({ id: c ? c.id : undefined, owner, name, listId: f.listId.value, script: f.script.value.trim(), questions: readQuestions(f), status: f.closed && f.closed.checked ? 'closed' : 'active' });
        ctx.toast(c ? 'Call campaign saved.' : `Created "${name}". Callers can start now.`, 'ok');
        go(c ? 'calls' : 'calls');
        void saved;
      } else if (f.dataset.form === 'petition') {
        const title = f.title.value.trim();
        if (!title) { ctx.toast('Give it a title.', 'warn'); f.title.focus(); return; }
        const sec = page.querySelector('[data-sec]');
        const kind = sec._pkind || 'petition';
        const qs = kind === 'survey' ? Array.from(f.querySelectorAll('[data-pq]')).map((r, i) => ({ id: 'q' + (i + 1), text: r.querySelector('[data-pqt]').value.trim(), options: r.querySelector('[data-pqo]').value.split(',').map((s) => s.trim()).filter(Boolean) })).filter((q) => q.text && q.options.length) : [];
        if (kind === 'survey' && !qs.length) { ctx.toast('Add at least one question with choices.', 'warn'); return; }
        const id = parts[1] !== 'new' ? parts[1] : undefined;
        const saved = C.savePetition({ id, owner, kind, title, ask: f.ask.value.trim(), goal: Math.max(1, Number(f.goal.value) || 100), slug: f.slug.value.trim() || title, questions: qs, status: f.status.value });
        ctx.toast(id ? 'Saved.' : `Created. ${saved.status === 'live' ? 'The public page is open.' : 'Make it live when you are ready.'}`, 'ok');
        if (!id) go('petitions/' + saved.id);
      } else if (f.dataset.form === 'settings') {
        const senders = Array.from(f.querySelectorAll('.os-sender')).map((r) => ({ name: r.querySelector('[data-sn]').value.trim(), title: r.querySelector('[data-st]').value.trim() })).filter((s) => s.name);
        if (!senders.length) { ctx.toast('Keep at least one sender.', 'warn'); return; }
        const lim = f.donorLimit.value.trim();
        C.setConfig(owner, { senderIdentities: senders, paidForBy: f.paidForBy.value.trim(), mailingAddress: f.mailingAddress.value.trim(), donorLimit: lim === '' ? null : Math.max(0, Number(lim) || 0) });
        ctx.toast('Sending settings saved.', 'ok');
        draw();
      }
    });
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      if (a.getAttribute('aria-disabled') === 'true') {
        if (a.dataset.act === 'save-call') ctx.toast('Pick how the call went first.', 'warn');
        if (a.dataset.act === 'send') ctx.toast('Fix the items above the button first.', 'warn');
        return;
      }
      const act = a.dataset.act;
      switch (act) {
        case 'ch': readForm(); D.channel = a.dataset.v; M.draft = D; drawCompose(page.querySelector('[data-sec]')); break;
        case 'mf': {
          const t = page.querySelector('#oc-body');
          const s = t.selectionStart || t.value.length, en = t.selectionEnd || t.value.length;
          t.value = t.value.slice(0, s) + a.dataset.v + t.value.slice(en);
          t.focus(); t.selectionStart = t.selectionEnd = s + a.dataset.v.length;
          readForm(); paintCompose(); break;
        }
        case 'pv': M.pv += Number(a.dataset.v); paintCompose(); break;
        case 'save-draft': {
          readForm();
          const cfg = C.config(owner);
          const sender = (cfg.senderIdentities || [])[D.sender] || {};
          const b = C.saveBroadcast({ id: D.id || undefined, owner, channel: D.channel, sender: { name: sender.name, title: sender.title }, listId: D.listId, subject: D.subject, body: D.body, status: 'draft', scheduledFor: null });
          D.id = b.id;
          ctx.toast('Draft saved. Find it on the Broadcasts tab.', 'ok');
          break;
        }
        case 'send': doSend(); break;
        case 'unschedule': {
          const b = C.broadcasts(owner).find((x) => x.id === a.dataset.id);
          confirmModal({ title: 'Cancel this send?', html: '<p>It moves back to your drafts, so you can edit it or send it later.</p>', ok: 'Cancel send', cancel: 'Keep it scheduled', onOk: () => { C.cancelBroadcast(b.id); ctx.toast('Moved back to drafts.', 'info'); } });
          break;
        }
        case 'q-add': { const box = page.querySelector('[data-qs]'); const sec = page.querySelector('[data-sec]'); box.insertAdjacentHTML('beforeend', sec._qRow({ text: '', options: [{ label: 'Yes', tag: '' }, { label: 'No' }] }, box.children.length)); box.lastElementChild.querySelector('input').focus(); break; }
        case 'q-rm': a.closest('[data-q]').remove(); break;
        case 'ans': { const qid = a.dataset.q; M.answers[qid] = M.answers[qid] === a.dataset.v ? undefined : a.dataset.v; a.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(M.answers[qid] === b.dataset.v))); if (M.answers[qid] && !M.outcome) setOutcome('talked'); break; }
        case 'outcome': setOutcome(a.dataset.v); break;
        case 'skip': {
          const id = parts[1];
          const q = C.callQueue(id);
          const sk = M.skip[id] || (M.skip[id] = []);
          const cur = q.filter((p) => sk.indexOf(p.id) < 0)[0] || q[0];
          if (cur) { M.skip[id] = sk.filter((x) => x !== cur.id).concat([cur.id]); }
          M.cur = null; M.anim = true;
          draw(); window.scrollTo(0, 0);
          break;
        }
        case 'save-call': saveCall(parts[1]); break;
        case 'copy': {
          const v = a.dataset.v;
          const ok = () => ctx.toast('Link copied.', 'ok');
          try { navigator.clipboard.writeText(v).then(ok, () => ctx.toast(v, 'info', { duration: 8000 })); } catch (err) { ctx.toast(v, 'info', { duration: 8000 }); }
          break;
        }
        case 'pt-csv': petitionCsv(C.getPetition(a.dataset.id)); break;
        case 'pt-status': {
          const p = C.getPetition(a.dataset.id);
          C.savePetition(Object.assign({}, p, { status: a.dataset.v }));
          ctx.toast(a.dataset.v === 'live' ? 'Live. The public page takes signatures now.' : 'Closed. The public page stops taking signatures.', 'ok');
          break;
        }
        case 'pk': {
          const sec = page.querySelector('[data-sec]');
          sec._pkind = a.dataset.v;
          a.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === a)));
          page.querySelector('[data-qbox]').hidden = a.dataset.v !== 'survey';
          break;
        }
        case 'pq-add': { const box = page.querySelector('[data-pqs]'); const sec = page.querySelector('[data-sec]'); box.insertAdjacentHTML('beforeend', sec._pqRow({ text: '', options: [] }, box.children.length)); box.lastElementChild.querySelector('input').focus(); break; }
        case 'pq-rm': a.closest('[data-pq]').remove(); break;
        case 'snd-add': { const box = page.querySelector('[data-senders]'); const i = box.children.length; box.insertAdjacentHTML('beforeend', `<div class="os-sender"><input class="input" data-sn placeholder="Name" aria-label="Sender ${i + 1} name"><input class="input" data-st placeholder="Title" aria-label="Sender ${i + 1} title" style="max-width:160px"><button type="button" class="crm-ibtn" data-act="snd-rm" aria-label="Remove sender">${OI.trash}</button></div>`); box.lastElementChild.querySelector('input').focus(); break; }
        case 'snd-rm': a.closest('.os-sender').remove(); break;
        default:
      }
      void openMenu;
    });
    function setOutcome(v) {
      M.outcome = v;
      page.querySelectorAll('[data-act="outcome"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
      const s = page.querySelector('[data-act="save-call"]'); if (s) s.removeAttribute('aria-disabled');
    }

    /* live updates (not while writing a broadcast or mid-call, so typing is never lost) */
    let raf = 0;
    const unsubs = ['broadcasts', 'callCampaigns', 'petitions', 'signatures', 'lists', 'crmConfig'].concat(isCamp ? ['crmConfig:' + owner] : []).map((n) => Store.on(n, () => {
      if (!el.isConnected) { unsubs.forEach((u) => u()); return; }
      if (section === 'compose' || (section === 'calls' && parts[1]) || (section === 'petitions' && parts[1]) || section === 'settings') return;
      cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
    }));
    draw();
    return { el, owner };
  }

  App.crmUI = Object.assign(App.crmUI || {}, { mountOutreach });

  App.register({
    id: 'outreach',
    title: 'Outreach',
    group: 'People & Outreach',
    minRole: 'member',
    icon: SCREEN_ICON,
    blurb: 'Email and text your lists, run phone banks and collect petition signatures.',
    gateAbout: 'Central committee members see the party\'s emails, texts, phone banks and petitions here. The Executive Board sends them.',
    render(el, ctx) { mountOutreach(el, ctx, { owner: 'committee' }); },
  });
})();
