/* screens/people.js: People (#/people), the CRM screens (CRM agent).
   Routes: #/people (list), #/people/<personId> (profile drawer), #/people/lists, #/people/paths[/<pathId>], #/people/tasks.
   Exports App.crmUI.mountPeople(el, ctx, {owner, base, sub, outreachBase}) so My Campaign can mount the same screens
   scoped to 'campaign:<slug>'. Mounted inside another screen with only {owner}, the base comes from that screen's
   route (for example #/mycampaign/people). Records come from App.crm (crm.js); this file only draws and edits them.
   Shared bits for screens/outreach.js live on App.crmUI._kit. */
(function () {
  'use strict';
  if (!window.App) return;
  const U = App.util;
  const esc = U.esc;
  const CRM = () => App.crm;
  const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const isPhone = () => !!(window.matchMedia && window.matchMedia('(max-width: 719px)').matches);

  /* ---------------- icons ---------------- */
  const I = (d, s) => `<svg width="${s || 18}" height="${s || 18}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const IC = {
    people: I('<circle cx="7.5" cy="7" r="2.8"/><path d="M2.5 16.5c.6-3 2.6-4.6 5-4.6s4.4 1.6 5 4.6"/><circle cx="14" cy="7.8" r="2.1"/><path d="M13.6 11.9c2 .1 3.4 1.5 3.9 4"/>', 20),
    search: I('<circle cx="9" cy="9" r="5.5"/><path d="M13.2 13.2L17 17"/>'),
    x: I('<path d="M5 5l10 10M15 5L5 15"/>'),
    back: I('<path d="M12.5 4.5L7 10l5.5 5.5"/>'),
    chev: I('<path d="M5.5 7.5l4.5 4.5 4.5-4.5"/>', 14),
    plus: I('<path d="M10 4.5v11M4.5 10h11"/>'),
    check: I('<path d="M4.5 10.5l3.5 3.5 7.5-8"/>', 16),
    dots: I('<circle cx="5" cy="10" r=".9" fill="currentColor"/><circle cx="10" cy="10" r=".9" fill="currentColor"/><circle cx="15" cy="10" r=".9" fill="currentColor"/>'),
    grip: I('<circle cx="7.5" cy="5.5" r=".8" fill="currentColor"/><circle cx="12.5" cy="5.5" r=".8" fill="currentColor"/><circle cx="7.5" cy="10" r=".8" fill="currentColor"/><circle cx="12.5" cy="10" r=".8" fill="currentColor"/><circle cx="7.5" cy="14.5" r=".8" fill="currentColor"/><circle cx="12.5" cy="14.5" r=".8" fill="currentColor"/>', 16),
    download: I('<path d="M10 3.5v9M6.5 9l3.5 3.5L13.5 9M4 15.5h12"/>'),
    list: I('<path d="M7.5 5.5h9M7.5 10h9M7.5 14.5h9"/><circle cx="4" cy="5.5" r=".9" fill="currentColor"/><circle cx="4" cy="10" r=".9" fill="currentColor"/><circle cx="4" cy="14.5" r=".9" fill="currentColor"/>'),
    path: I('<circle cx="4.5" cy="10" r="2"/><circle cx="15.5" cy="5" r="2"/><circle cx="15.5" cy="15" r="2"/><path d="M6.5 10h3l4-4.2M9.5 10l4 4.2"/>'),
    task: I('<rect x="3.5" y="3.5" width="13" height="13" rx="3"/><path d="M7 10.2l2.2 2.2L13.5 8"/>'),
    tag: I('<path d="M3.5 3.5h6l7 7-6 6-7-7z"/><circle cx="7" cy="7" r="1.1" fill="currentColor"/>', 16),
    share: I('<circle cx="5" cy="10" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="15" cy="15" r="2"/><path d="M6.8 9l6.4-3M6.8 11l6.4 3"/>', 16),
    user: I('<circle cx="10" cy="7" r="3"/><path d="M4 17c.9-3.1 3.2-4.8 6-4.8s5.1 1.7 6 4.8"/>', 16),
    warn: I('<path d="M10 3l7.5 13.5h-15z"/><path d="M10 8.5v3.5M10 14.3v.2"/>', 16),
    merge: I('<path d="M5 3.5v4c0 2.5 5 3 5 6v3M15 3.5v4c0 2.5-5 3-5 6"/><path d="M7.5 14l2.5 2.5 2.5-2.5"/>', 16),
    ext: I('<path d="M11 4h5v5M16 4l-7 7M14 11.5V15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3.5"/>', 15),
    phone: I('<path d="M5.5 3h2.6l1.3 3.6-1.8 1.2a9 9 0 0 0 4.6 4.6l1.2-1.8 3.6 1.3v2.6a1.5 1.5 0 0 1-1.6 1.5A13.5 13.5 0 0 1 4 4.6 1.5 1.5 0 0 1 5.5 3z"/>', 16),
    mail: I('<rect x="2.5" y="4.5" width="15" height="11" rx="2"/><path d="M3.5 6l6.5 5 6.5-5"/>', 16),
    chat: I('<path d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3H4A1.5 1.5 0 0 1 2.5 13V6A1.5 1.5 0 0 1 4 4.5z"/>', 16),
    note: I('<path d="M13.5 3.5l3 3L8 15H5v-3z"/><path d="M11.5 5.5l3 3"/>', 16),
    meet: I('<circle cx="7" cy="7.5" r="2.3"/><circle cx="13.5" cy="7.5" r="2.3"/><path d="M3 16c.5-2.5 2-3.8 4-3.8s3.5 1.3 4 3.8M10.5 13c.8-.6 1.8-.9 3-.9 2 0 3.5 1.3 4 3.9"/>', 16),
    cal: I('<rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8.5h14M7 2.8v3.4M13 2.8v3.4M7.5 12.5l1.8 1.8 3.4-3.4"/>', 16),
    hand: I('<path d="M10 17s-6-3.6-6-8.3A3.4 3.4 0 0 1 10 6.6a3.4 3.4 0 0 1 6 2.1C16 13.4 10 17 10 17z"/>', 16),
    coin: I('<circle cx="10" cy="10" r="7"/><path d="M12.3 7.6c-.4-.8-1.3-1.2-2.3-1.2-1.3 0-2.3.7-2.3 1.7 0 2.4 4.8 1.3 4.8 3.8 0 1-1.1 1.8-2.5 1.8-1.1 0-2.1-.5-2.5-1.3M10 5v1.4M10 13.6V15"/>', 16),
    card: I('<rect x="2.5" y="5" width="15" height="10.5" rx="2"/><circle cx="7" cy="10" r="1.8"/><path d="M11 8.5h4M11 11.5h3"/>', 16),
    door: I('<path d="M5 17V3.5h8.5V17M3 17h14"/><circle cx="11" cy="10.5" r=".8" fill="currentColor"/>', 16),
    pen: I('<path d="M3 16.5c2-1 3.5-3.5 5-3.5s.5 3.5 2.5 3.5 2.5-2 4-2.5M12.5 3.5l3 3-6 6H6.5v-3z"/>', 16),
    clock: I('<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.6 1.8"/>', 15),
    cap: I('<path d="M2.5 8L10 4.5 17.5 8 10 11.5z"/><path d="M5.5 9.5v3.5c1.3 1.2 2.8 1.8 4.5 1.8s3.2-.6 4.5-1.8V9.5"/>', 16),
  };
  const TYPE_IC = { note: IC.note, call: IC.phone, email: IC.mail, text: IC.chat, meeting: IC.meet, rsvp: IC.cal, volunteer: IC.hand, donation: IC.coin, membership: IC.card, walk: IC.door, signature: IC.pen, share: IC.share };
  const SCREEN_ICON = IC.people;

  /* ---------------- formatting ---------------- */
  function fmtRel(iso) {
    const t = Date.parse(iso || '');
    if (isNaN(t)) return 'No activity yet';
    const m = (Date.now() - t) / 60000;
    if (m < 0) return 'Scheduled';
    return U.timeAgo(m);
  }
  function fmtDate(iso, opts) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(iso)) ? new Date(iso + 'T12:00:00') : new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('en-US', Object.assign({ month: 'short', day: 'numeric' }, opts || {}));
  }
  function dueInfo(due) {
    if (!due) return { cls: '', label: 'No due date' };
    const today = CRM().util.isoDay(Date.now());
    if (due < today) {
      const days = Math.round((Date.parse(today) - Date.parse(due)) / 86400000);
      return { cls: 'is-overdue', label: days === 1 ? '1 day overdue' : `${days} days overdue`, overdue: true };
    }
    if (due === today) return { cls: 'is-today', label: 'Due today' };
    const days = Math.round((Date.parse(due) - Date.parse(today)) / 86400000);
    return { cls: days <= 2 ? 'is-soon' : '', label: days === 1 ? 'Due tomorrow' : `Due ${fmtDate(due)}` };
  }
  const plural = (n, one, many) => `${U.fmtNum(n)} ${n === 1 ? one : (many || one + 's')}`;
  const sampleMark = (p) => (p && p.sample ? '<span class="crm-sample" title="Sample record">Sample</span>' : '');
  function supportMeter(s) {
    const S = CRM().SUPPORT;
    if (!s) return '<span class="crm-sup s-0" title="Support not known yet"><span class="crm-sup-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><span class="crm-sup-l">Not known</span></span>';
    return `<span class="crm-sup s-${s}" title="Support ${s} of 5: ${esc(S[s])}"><span class="crm-sup-bars" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= s ? 'on' : ''}"></i>`).join('')}</span><span class="crm-sup-l">${esc(S[s])}</span></span>`;
  }
  function roleChips(roles, max) {
    const L = CRM().ROLE_LABEL;
    const r = (roles || []).filter((x) => x !== 'supporter' || roles.length === 1);
    const shown = r.slice(0, max || 3);
    return shown.map((x) => `<span class="crm-role r-${esc(x)}">${esc(L[x] || x)}</span>`).join('') + (r.length > shown.length ? `<span class="crm-more">+${r.length - shown.length}</span>` : '');
  }
  /* System tags like petition:<slug> read as "Signed: <title>"; the raw tag stays the filter value. */
  const isSysTag = (t) => /^[a-z][a-z0-9-]*:/i.test(String(t || ''));
  function tagText(x, short) { return CRM().tagLabel ? CRM().tagLabel(x, undefined, short) : x; }
  function tagChips(tags, max, short) {
    const t = tags || [];
    const shown = t.slice(0, max || 2);
    return shown.map((x) => `<span class="crm-tag${isSysTag(x) ? ' sys' : ''}" title="${esc(tagText(x, false))}">${esc(tagText(x, short !== false))}</span>`).join('') + (t.length > shown.length ? `<span class="crm-more">+${t.length - shown.length}</span>` : '');
  }
  function emptyState(o) {
    return `<div class="crm-empty">
      <div class="crm-empty-art" aria-hidden="true">${o.art || ''}</div>
      <h3>${esc(o.title)}</h3>
      ${o.body ? `<p>${esc(o.body)}</p>` : ''}
      ${o.action || ''}
    </div>`;
  }
  const ART = {
    lists: '<svg width="120" height="84" viewBox="0 0 120 84"><rect x="14" y="10" width="80" height="58" rx="10" fill="var(--surface)" stroke="var(--line-strong)"/><rect x="26" y="22" width="44" height="6" rx="3" fill="var(--line-strong)"/><rect x="26" y="35" width="56" height="5" rx="2.5" fill="var(--line)"/><rect x="26" y="46" width="36" height="5" rx="2.5" fill="var(--line)"/><circle cx="92" cy="62" r="16" fill="var(--brand)"/><path d="M92 55v14M85 62h14" stroke="var(--brand-ink)" stroke-width="3" stroke-linecap="round"/></svg>',
    people: '<svg width="120" height="84" viewBox="0 0 120 84"><circle cx="44" cy="32" r="14" fill="var(--line)"/><path d="M18 74c3-16 13-24 26-24s23 8 26 24" fill="var(--line)"/><circle cx="80" cy="36" r="11" fill="var(--line-strong)"/><path d="M60 74c2-12 10-18 20-18s18 6 20 18" fill="var(--line-strong)"/><circle cx="96" cy="16" r="9" fill="none" stroke="var(--brand)" stroke-width="3"/><path d="M103 23l7 7" stroke="var(--brand)" stroke-width="3" stroke-linecap="round"/></svg>',
    tasks: '<svg width="120" height="84" viewBox="0 0 120 84"><rect x="22" y="12" width="76" height="62" rx="10" fill="var(--surface)" stroke="var(--line-strong)"/><circle cx="38" cy="32" r="6" fill="var(--ok)"/><path d="M35 32l2 2 4-4" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="50" y="29" width="34" height="6" rx="3" fill="var(--line)"/><circle cx="38" cy="54" r="6" fill="var(--ok)"/><path d="M35 54l2 2 4-4" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="50" y="51" width="26" height="6" rx="3" fill="var(--line)"/></svg>',
    path: '<svg width="120" height="84" viewBox="0 0 120 84"><rect x="8" y="16" width="30" height="56" rx="7" fill="var(--surface-2)" stroke="var(--line)"/><rect x="45" y="16" width="30" height="56" rx="7" fill="var(--surface-2)" stroke="var(--line)"/><rect x="82" y="16" width="30" height="56" rx="7" fill="var(--surface-2)" stroke="var(--line)"/><rect x="13" y="24" width="20" height="12" rx="3" fill="var(--line-strong)"/><rect x="50" y="24" width="20" height="12" rx="3" fill="var(--brand)"/><path d="M34 30h12" stroke="var(--brand)" stroke-width="2" stroke-dasharray="3 3"/></svg>',
  };
  function skeleton(n) {
    return `<div class="crm-skel" aria-busy="true" aria-label="Loading people">${Array.from({ length: n || 8 }, (_, i) => `<div class="crm-skel-row" style="--d:${i * 60}ms"><i class="c"></i><i class="a"></i><i class="b"></i><i class="s"></i></div>`).join('')}</div>`;
  }

  /* ---------------- styles ---------------- */
  function injectStyles() {
    if (document.getElementById('crm-styles')) return;
    const s = document.createElement('style');
    s.id = 'crm-styles';
    s.textContent = `
.crm .crm-page { padding-top: 26px; }
.crm .crm-page.crm-embedded { padding:0; }
.crm .crm-head { display:flex; flex-wrap:wrap; align-items:flex-end; gap:12px 16px; margin-bottom:14px; }
.crm .crm-head > div:first-child { flex:1 1 320px; min-width:0; }
.crm .crm-head .crm-h1 { margin:0 0 4px; }
.crm .crm-embedded .crm-head .crm-h1 { font-size:1.6rem; }
.crm .crm-head p { margin:0; color:var(--ink-2); max-width:64ch; }
.crm .crm-head .crm-head-actions { display:flex; gap:8px; flex-wrap:wrap; }
.crm .crm-owner { display:inline-flex; align-items:center; gap:6px; font:700 12.5px/1 var(--font-body); letter-spacing:.06em; text-transform:uppercase; color:var(--accent); margin-bottom:8px; }
.crm .crm-owner::before { content:''; width:16px; height:2px; background:currentColor; border-radius:2px; }
.crm .crm-nav { display:flex; gap:2px; border-bottom:1px solid var(--line); margin-bottom:18px; overflow-x:auto; scrollbar-width:none; }
.crm .crm-nav::-webkit-scrollbar { display:none; }
.crm .crm-nav a { display:inline-flex; align-items:center; gap:8px; min-height:44px; padding:10px 14px 9px; font:600 15px/1.2 var(--font-body); color:var(--ink-3); text-decoration:none; border-bottom:3px solid transparent; margin-bottom:-1px; white-space:nowrap; transition:color .15s; }
.crm .crm-nav a:hover { color:var(--ink); }
.crm .crm-nav a[aria-current="page"] { color:var(--brand); border-bottom-color:var(--accent); }
.crm .crm-nav .n { font:600 12px/1 var(--font-body); padding:3px 7px; border-radius:999px; background:var(--surface-2); border:1px solid var(--line); color:var(--ink-2); font-variant-numeric:tabular-nums; }
.crm .crm-ro { display:flex; align-items:center; gap:8px; font-size:14px; color:var(--ink-3); margin:-6px 0 14px; }

/* toolbar */
.crm .crm-tools { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:12px; position:relative; }
.crm .crm-search { position:relative; flex:1 1 280px; min-width:0; max-width:420px; }
.crm .crm-search svg { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--ink-3); pointer-events:none; }
.crm .crm-search .input { padding-left:38px; padding-right:40px; }
.crm .crm-search kbd { position:absolute; right:10px; top:50%; transform:translateY(-50%); font:600 12px/1 var(--font-body); color:var(--ink-3); border:1px solid var(--line-strong); border-bottom-width:2px; border-radius:5px; padding:3px 6px; background:var(--surface-2); }
.crm .crm-chips { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.crm .crm-fchip { display:inline-flex; align-items:center; gap:6px; min-height:36px; padding:6px 10px 6px 12px; font:500 14px/1.2 var(--font-body); color:var(--ink-2); background:var(--surface); border:1px dashed var(--line-strong); border-radius:999px; cursor:pointer; transition:border-color .15s, background-color .15s, color .15s; max-width:260px; }
.crm .crm-fchip:hover { border-color:var(--ink-3); color:var(--ink); }
.crm .crm-fchip.on { border-style:solid; border-color:color-mix(in srgb, var(--brand) 40%, white); background:color-mix(in srgb, var(--brand) 7%, white); color:var(--brand); font-weight:600; }
.crm .crm-fchip .v { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.crm .crm-fchip[aria-expanded="true"] { border-style:solid; border-color:var(--brand); box-shadow:var(--focus); }
.crm .crm-clear { font:600 14px var(--font-body); color:var(--brand); background:none; border:0; cursor:pointer; padding:8px 6px; min-height:36px; }
.crm .crm-pop { position:absolute; z-index:40; top:calc(100% + 6px); left:0; width:300px; max-width:calc(100vw - 32px); background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--shadow-2); padding:12px; animation:crm-pop .16s ease-out; }
.crm .crm-pop h4 { margin:0 0 8px; font-size:14px; color:var(--ink-2); }
.crm .crm-pop-list { max-height:280px; overflow:auto; display:flex; flex-direction:column; gap:2px; margin:0 -4px; padding:0 4px; }
.crm .crm-opt { display:flex; align-items:center; gap:10px; min-height:38px; padding:4px 8px; border-radius:8px; cursor:pointer; font-size:15px; }
.crm .crm-opt:hover { background:var(--surface-2); }
.crm .crm-opt input { margin:0; width:18px; height:18px; accent-color:var(--brand); flex:none; }
.crm .crm-opt .c { margin-left:auto; color:var(--ink-3); font-size:13px; font-variant-numeric:tabular-nums; }
.crm .crm-pop .input { margin-bottom:8px; min-height:40px; }
.crm .crm-pop-foot { display:flex; justify-content:space-between; gap:8px; margin-top:10px; padding-top:10px; border-top:1px solid var(--line); }
@keyframes crm-pop { from { opacity:0; transform:translateY(-4px) scale(.98); } to { opacity:1; transform:none; } }

.crm .crm-sumline { display:flex; flex-wrap:wrap; align-items:center; gap:6px 16px; font-size:14px; color:var(--ink-3); margin:0 0 10px; }
.crm .crm-sumline b { color:var(--ink); font-variant-numeric:tabular-nums; }
.crm .crm-sumline .sp { flex:1; }

/* table */
.crm .crm-grid { border:1px solid var(--line); border-radius:var(--r-lg); background:var(--surface); overflow:auto; max-height:calc(100vh - var(--topbar-h) - 280px); min-height:380px; box-shadow:var(--shadow-1); }
.crm table.crm-t { width:100%; border-collapse:separate; border-spacing:0; font-size:14.5px; }
.crm .crm-t th { position:sticky; top:0; z-index:2; background:var(--surface-2); text-align:left; font:700 12.5px/1.2 var(--font-body); letter-spacing:.04em; text-transform:uppercase; color:var(--ink-3); padding:10px 12px; border-bottom:1px solid var(--line); white-space:nowrap; }
.crm .crm-t td { padding:9px 12px; border-bottom:1px solid var(--line); vertical-align:middle; white-space:nowrap; }
.crm .crm-t tbody tr { cursor:pointer; transition:background-color .12s; }
.crm .crm-t tbody tr:hover td { background:color-mix(in srgb, var(--brand) 4%, white); }
.crm .crm-t tbody tr.is-sel td { background:color-mix(in srgb, var(--brand) 8%, white); }
.crm .crm-t tbody tr.is-open td { background:color-mix(in srgb, var(--accent) 7%, white); }
.crm .crm-t tbody tr.is-open td:first-child { box-shadow:inset 3px 0 0 var(--accent); }
.crm .crm-t tbody tr:last-child td { border-bottom:0; }
.crm .crm-t .cb { width:44px; padding:0 0 0 8px; }
.crm .crm-cb { display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; border-radius:8px; cursor:pointer; }
.crm .crm-cb:hover { background:color-mix(in srgb, var(--brand) 8%, transparent); }
.crm .crm-cb input { width:18px; height:18px; margin:0; accent-color:var(--brand); cursor:pointer; }
.crm .crm-nm { display:flex; align-items:center; gap:10px; min-width:0; }
.crm .crm-nm .avatar { flex:none; }
.crm .crm-nm b { font-weight:650; color:var(--ink); }
.crm .crm-nm small { display:block; color:var(--ink-3); font-size:13px; overflow:hidden; text-overflow:ellipsis; max-width:220px; }
.crm .crm-nm .t { min-width:0; }
.crm .crm-t .muted-cell { color:var(--ink-3); }
.crm .crm-last { display:inline-flex; align-items:center; gap:8px; }
.crm .crm-ppa { display:inline-flex; }
.crm .crm-pp { display:inline-flex; align-items:center; gap:6px; color:var(--ink-2); }
.crm .crm-more-rows { display:flex; justify-content:center; padding:12px; border-top:1px solid var(--line); }
.crm .crm-grid.is-x, .crm .crm-kan.is-x { -webkit-mask-image:linear-gradient(to right, #000 calc(100% - 36px), transparent); mask-image:linear-gradient(to right, #000 calc(100% - 36px), transparent); }
.crm .crm-grid.is-x.at-end, .crm .crm-kan.is-x.at-end { -webkit-mask-image:none; mask-image:none; }
.crm .crm-nm .pl { display:none; }
@media (max-width: 1359px) { .crm .col-place { display:none; } .crm .crm-nm .pl { display:inline; } }
@media (max-width: 1099px) { .crm .col-tags { display:none; } }
.crm [data-results] { overflow:hidden; padding:1px 1px 3px; margin:-1px; }
@media (max-width: 899px) { .crm .col-roles { display:none; } }

/* chips */
.crm .crm-sample { display:inline-flex; align-items:center; font:600 11px/1 var(--font-body); letter-spacing:.04em; color:var(--ink-3); border:1px solid var(--line); border-radius:999px; padding:3px 6px; margin-left:6px; vertical-align:2px; background:var(--surface); white-space:nowrap; }
.crm .crm-role { display:inline-flex; align-items:center; font:600 12.5px/1 var(--font-body); padding:4px 8px; border-radius:6px; margin-right:4px; background:var(--surface-2); color:var(--ink-2); border:1px solid var(--line); white-space:nowrap; }
.crm .crm-role.r-volunteer { background:var(--ok-soft); color:var(--ok); border-color:color-mix(in srgb, var(--ok) 22%, white); }
.crm .crm-role.r-donor { background:var(--warn-soft); color:var(--warn); border-color:color-mix(in srgb, var(--warn) 22%, white); }
.crm .crm-role.r-member { background:color-mix(in srgb, var(--brand) 9%, white); color:var(--brand); border-color:color-mix(in srgb, var(--brand) 25%, white); }
.crm .crm-role.r-candidate, .crm .crm-role.r-elected { background:color-mix(in srgb, var(--accent) 9%, white); color:var(--accent); border-color:color-mix(in srgb, var(--accent) 25%, white); }
.crm .crm-role.r-press { background:var(--info-soft); color:var(--info); border-color:color-mix(in srgb, var(--info) 22%, white); }
.crm .crm-tag { display:inline-flex; align-items:center; font:500 12.5px/1 var(--font-body); padding:4px 8px; border-radius:999px; margin-right:4px; background:var(--surface); color:var(--ink-2); border:1px solid var(--line-strong); white-space:nowrap; max-width:150px; overflow:hidden; text-overflow:ellipsis; }
.crm .crm-tag.sys { background:color-mix(in srgb, var(--brand) 6%, white); border-color:color-mix(in srgb, var(--brand) 22%, white); color:var(--brand); }
.crm .crm-more { font:600 12.5px var(--font-body); color:var(--ink-3); }
.crm .crm-sup { display:inline-flex; align-items:center; gap:8px; }
.crm .crm-sup-bars { display:inline-flex; gap:2px; align-items:flex-end; height:14px; }
.crm .crm-sup-bars i { width:4px; border-radius:1.5px; background:var(--line); }
.crm .crm-sup-bars i:nth-child(1) { height:5px; } .crm .crm-sup-bars i:nth-child(2) { height:7px; } .crm .crm-sup-bars i:nth-child(3) { height:9px; } .crm .crm-sup-bars i:nth-child(4) { height:11px; } .crm .crm-sup-bars i:nth-child(5) { height:14px; }
.crm .s-1 .crm-sup-bars i.on { background:var(--danger); } .crm .s-2 .crm-sup-bars i.on { background:#C2620A; } .crm .s-3 .crm-sup-bars i.on { background:var(--ink-3); } .crm .s-4 .crm-sup-bars i.on { background:#2F8F5B; } .crm .s-5 .crm-sup-bars i.on { background:var(--ok); }
.crm .crm-sup-l { font-size:13.5px; color:var(--ink-2); }
.crm .s-0 .crm-sup-l { color:var(--ink-3); }

/* phone cards */
.crm .crm-cards { display:flex; flex-direction:column; gap:8px; }
.crm .crm-card { display:flex; gap:10px; align-items:flex-start; padding:12px 12px 12px 4px; background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--shadow-1); cursor:pointer; min-width:0; }
.crm .crm-card.is-sel { border-color:color-mix(in srgb, var(--brand) 45%, white); background:color-mix(in srgb, var(--brand) 5%, white); }
.crm .crm-card .crm-cb { width:44px; height:44px; flex:none; margin-top:-4px; }
.crm .crm-card .body { flex:1; min-width:0; }
.crm .crm-card .top { display:flex; align-items:center; gap:8px; min-width:0; }
.crm .crm-card .top b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:650; }
.crm .crm-card .meta { display:flex; flex-wrap:wrap; gap:6px 10px; align-items:center; margin-top:6px; font-size:13.5px; color:var(--ink-3); }
.crm .crm-card .chips { display:flex; flex-wrap:wrap; gap:4px; margin-top:8px; }

.crm .is-new { animation: crm-in .5s ease-out both; }
.crm tr.is-new td { animation: crm-flash 1.6s ease-out; }
@keyframes crm-in { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:none; } }
@keyframes crm-flash { 0% { background:color-mix(in srgb, var(--accent) 14%, white); } 100% { background:transparent; } }

/* bulk bar (lives on <body>) */
.crm-bulk { position:fixed; z-index:46; left:50%; bottom:20px; transform:translate(-50%, 0); display:flex; align-items:center; gap:6px; flex-wrap:wrap; justify-content:center; max-width:calc(100vw - 32px); padding:8px 8px 8px 16px; background:var(--ink); color:#fff; border-radius:14px; box-shadow:0 18px 40px -12px rgba(0,0,0,.45); animation: crm-up .2s ease-out; }
.crm-bulk b { font-variant-numeric:tabular-nums; margin-right:6px; white-space:nowrap; }
.crm-bulk .btn { background:transparent; color:#fff; border-color:rgba(255,255,255,.22); min-height:38px; }
.crm-bulk .btn:hover { background:rgba(255,255,255,.12); color:#fff; border-color:rgba(255,255,255,.4); }
.crm-bulk .btn.x { border-color:transparent; padding:6px 10px; }
@keyframes crm-up { from { opacity:0; transform:translate(-50%, 12px); } to { opacity:1; transform:translate(-50%, 0); } }
@media (min-width: 901px) { .crm-bulk { left:calc(50% + var(--sidebar-w) / 2); } }

/* drawer (lives on <body>, outside the screen's stacking context) */
.crm-drawer { position:fixed; z-index:45; top:var(--topbar-h); right:0; bottom:0; width:min(var(--crm-dw, 500px), 100vw); background:var(--surface); border-left:1px solid var(--line); box-shadow:-24px 0 48px -24px rgba(21,32,46,.32); transform:translateX(100%); transition:transform .26s cubic-bezier(.2,.8,.2,1); display:flex; flex-direction:column; visibility:hidden; }
.crm-drawer.open { transform:none; visibility:visible; }
.crm-drawer .crm-rsz { position:absolute; left:-5px; top:0; bottom:0; width:10px; cursor:col-resize; z-index:3; background:transparent; border:0; padding:0; }
.crm-drawer .crm-rsz::after { content:''; position:absolute; left:4px; top:50%; width:3px; height:44px; margin-top:-22px; border-radius:3px; background:var(--line-strong); opacity:0; transition:opacity .15s; }
.crm-drawer:hover .crm-rsz::after, .crm-drawer .crm-rsz:focus-visible::after { opacity:1; }
.crm-drawer .crm-dbar { display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid var(--line); background:var(--surface); }
.crm-drawer .crm-dbar .sp { flex:1; }
.crm-drawer .crm-dbody { flex:1; overflow:auto; overscroll-behavior:contain; }
.crm-ibtn { display:inline-flex; align-items:center; justify-content:center; gap:6px; width:40px; height:40px; border-radius:10px; border:1px solid transparent; background:transparent; color:var(--ink-2); cursor:pointer; flex:none; }
.crm-ibtn:hover { background:var(--surface-2); color:var(--ink); }
.crm-ibtn:disabled { opacity:.35; cursor:default; }
@media (max-width: 719px) {
  .crm-drawer { top:0; z-index:70; width:100vw; border-left:0; box-shadow:none; transform:translateX(24px); opacity:0; transition:transform .22s ease-out, opacity .18s; }
  .crm-drawer.open { transform:none; opacity:1; }
  .crm-drawer .crm-rsz { display:none; }
  .crm-ibtn { width:44px; height:44px; }
  .crm-bulk { left:12px; right:12px; transform:none; bottom:12px; max-width:none; justify-content:flex-start; animation:none; }
  .crm-bulk b { width:100%; margin:0 0 2px; }
}

/* profile */
.crm-pf { padding:18px 22px 40px; }
.crm-pf-head { display:flex; gap:14px; align-items:center; margin-bottom:14px; }
.crm-pf-head h2 { margin:0; font-size:1.55rem; line-height:1.1; overflow-wrap:anywhere; }
.crm-pf-head .sub { color:var(--ink-3); font-size:14px; margin-top:4px; }
.crm-pf-quick { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 16px; }
.crm-pf-quick .btn { min-height:40px; }
.crm-pf-sec { padding:16px 0; border-top:1px solid var(--line); }
.crm-pf-sec > h3 { display:flex; align-items:center; gap:8px; font-size:13px; letter-spacing:.06em; text-transform:uppercase; color:var(--ink-3); font-family:var(--font-body); font-weight:700; margin:0 0 10px; }
.crm-pf-sec > h3 .sp { flex:1; }
.crm-pf-sec > h3 .btn { text-transform:none; letter-spacing:0; }
.crm-alert { display:flex; gap:10px; align-items:flex-start; padding:12px 14px; border-radius:var(--r); margin-bottom:10px; font-size:14.5px; border:1px solid; }
.crm-alert svg { flex:none; margin-top:2px; }
.crm-alert p { margin:0 0 8px; } .crm-alert p:last-child { margin:0; }
.crm-alert .row { gap:6px; }
.crm-alert.warn { background:var(--warn-soft); border-color:color-mix(in srgb, var(--warn) 25%, white); color:#6B4000; }
.crm-alert.info { background:var(--info-soft); border-color:color-mix(in srgb, var(--info) 22%, white); color:#173F6A; }
.crm-alert.danger { background:var(--danger-soft); border-color:color-mix(in srgb, var(--danger) 25%, white); color:#7A1A12; }
.crm-supp { display:grid; grid-template-columns:repeat(5, minmax(0,1fr)); gap:4px; }
.crm-supp button { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; min-height:52px; padding:6px 2px; border:1px solid var(--line-strong); border-radius:10px; background:var(--surface); cursor:pointer; font:800 17px/1 var(--font-head); color:var(--ink-2); transition:background-color .15s, border-color .15s, color .15s, transform .1s; }
.crm-supp button small { font:500 11.5px/1.15 var(--font-body); color:var(--ink-3); text-align:center; }
.crm-supp button:hover { border-color:var(--ink-3); }
.crm-supp button:active { transform:scale(.97); }
.crm-supp button[aria-pressed="true"] { color:#fff; border-color:transparent; }
.crm-supp button[aria-pressed="true"] small { color:rgba(255,255,255,.88); }
.crm-supp button[data-v="1"][aria-pressed="true"] { background:var(--danger); } .crm-supp button[data-v="2"][aria-pressed="true"] { background:#B4590A; } .crm-supp button[data-v="3"][aria-pressed="true"] { background:var(--ink-3); } .crm-supp button[data-v="4"][aria-pressed="true"] { background:#2F8F5B; } .crm-supp button[data-v="5"][aria-pressed="true"] { background:var(--ok); }
.crm-dl { display:grid; grid-template-columns:110px minmax(0,1fr); gap:8px 12px; margin:0; font-size:15px; }
.crm-dl dt { color:var(--ink-3); font-size:14px; }
.crm-dl dd { margin:0; min-width:0; overflow-wrap:anywhere; }
.crm-toggles { display:flex; flex-direction:column; gap:2px; margin-top:12px; }
.crm-toggles label { display:flex; align-items:center; gap:12px; min-height:44px; cursor:pointer; font-size:15px; }
.crm-toggles label small { display:block; color:var(--ink-3); font-size:13px; }
.crm-toggles .toggle { flex:none; }
.crm-toggles input.toggle { width:44px !important; height:26px !important; min-height:0; margin:0 !important; border-radius:999px; }
.crm-rolepick { display:flex; flex-wrap:wrap; gap:6px; }
.crm-rolepick button { min-height:36px; padding:6px 12px; border-radius:999px; border:1px solid var(--line-strong); background:var(--surface); font:500 14px var(--font-body); color:var(--ink-2); cursor:pointer; }
.crm-rolepick button[aria-pressed="true"] { background:var(--brand); border-color:var(--brand); color:var(--brand-ink); }
.crm-tagedit { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.crm-tagedit .crm-tag { padding-right:2px; max-width:100%; white-space:normal; line-height:1.3; }
.crm-tagedit .crm-tag button { border:0; background:none; color:var(--ink-3); width:24px; height:22px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; border-radius:999px; flex:none; }
.crm-tagedit .crm-tag button:hover { color:var(--danger); background:var(--danger-soft); }
.crm-tagedit form { display:flex; gap:6px; flex:1 1 180px; min-width:0; }
.crm-tagedit .input { min-height:36px; padding:6px 10px; font-size:14.5px; }
.crm-log { border:1px solid var(--line); border-radius:var(--r-lg); background:var(--surface-2); padding:10px; }
.crm-log-tabs { display:flex; gap:4px; flex-wrap:wrap; margin-bottom:8px; }
.crm-log-tabs button { display:inline-flex; align-items:center; gap:6px; min-height:36px; padding:6px 10px; border:1px solid transparent; border-radius:8px; background:transparent; font:600 14px var(--font-body); color:var(--ink-3); cursor:pointer; }
.crm-log-tabs button[aria-pressed="true"] { background:var(--surface); border-color:var(--line); color:var(--ink); box-shadow:var(--shadow-1); }
.crm-log .textarea { min-height:76px; background:var(--surface); }
.crm-log .row { margin-top:8px; }
.crm-log .select { width:auto; min-height:40px; }
.crm-tl { list-style:none; margin:0; padding:0; position:relative; }
.crm-tl::before { content:''; position:absolute; left:15px; top:6px; bottom:6px; width:2px; background:var(--line); border-radius:2px; }
.crm-tl li { position:relative; display:flex; gap:12px; padding:6px 0 10px; }
.crm-tl li.mo { display:block; padding:10px 0 6px 44px; font:700 12px/1 var(--font-body); letter-spacing:.06em; text-transform:uppercase; color:var(--ink-3); }
.crm-tl .ic { position:relative; z-index:1; flex:none; width:32px; height:32px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; background:var(--surface); border:1px solid var(--line-strong); color:var(--ink-2); }
.crm-tl .t-call .ic, .crm-tl .t-text .ic, .crm-tl .t-email .ic { color:var(--info); border-color:color-mix(in srgb, var(--info) 35%, white); background:var(--info-soft); }
.crm-tl .t-donation .ic, .crm-tl .t-membership .ic { color:var(--warn); border-color:color-mix(in srgb, var(--warn) 35%, white); background:var(--warn-soft); }
.crm-tl .t-volunteer .ic, .crm-tl .t-walk .ic, .crm-tl .t-rsvp .ic { color:var(--ok); border-color:color-mix(in srgb, var(--ok) 30%, white); background:var(--ok-soft); }
.crm-tl .t-signature .ic, .crm-tl .t-share .ic, .crm-tl .t-meeting .ic { color:var(--brand); border-color:color-mix(in srgb, var(--brand) 30%, white); background:color-mix(in srgb, var(--brand) 7%, white); }
.crm-tl .b { min-width:0; flex:1; font-size:14.5px; padding-top:5px; }
.crm-tl .b p { margin:0; overflow-wrap:anywhere; }
.crm-tl .b small { color:var(--ink-3); font-size:13px; }
.crm-pathrow { display:flex; flex-direction:column; gap:8px; padding:12px; border:1px solid var(--line); border-radius:var(--r); margin-bottom:8px; }
.crm-pathrow .top { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.crm-pathrow .top b { flex:1; min-width:0; }
.crm-steps { display:flex; gap:4px; }
.crm-steps i { flex:1; height:6px; border-radius:6px; background:var(--line); }
.crm-steps i.done { background:var(--ok); } .crm-steps i.cur { background:var(--brand); }
.crm-due svg { flex:none; width:13px; height:13px; }
.crm-due { display:inline-flex; align-items:center; gap:4px; font:600 12.5px/1 var(--font-body); color:var(--ink-3); white-space:nowrap; }
.crm-due.is-overdue { color:var(--danger); } .crm-due.is-today, .crm-due.is-soon { color:var(--warn); }
.crm-task { display:flex; align-items:flex-start; gap:6px; padding:4px 0; }
.crm-task .crm-cb { flex:none; width:40px; height:40px; display:inline-flex; align-items:center; justify-content:center; }
.crm-task .crm-cb input { width:18px; height:18px; margin:0; accent-color:var(--brand); }
.crm-task .b { flex:1; min-width:0; padding-top:8px; font-size:15px; }
.crm-task.done .b > span:first-child { text-decoration:line-through; color:var(--ink-3); }
.crm-task .b small { display:flex; flex-wrap:wrap; gap:4px 10px; color:var(--ink-3); font-size:13px; margin-top:2px; }
.crm-addtask { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
.crm-addtask .input { flex:1 1 180px; min-height:40px; }
.crm-addtask input[type="date"] { flex:0 0 160px; }

/* lists */
.crm .crm-lists { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:14px; }
.crm .crm-lcard { background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg); box-shadow:var(--shadow-1); padding:18px 18px 14px; display:flex; flex-direction:column; gap:10px; min-width:0; transition:box-shadow .2s; }
.crm .crm-lcard:hover { box-shadow:var(--shadow-2); }
.crm .crm-lcard .h { display:flex; align-items:flex-start; gap:12px; }
.crm .crm-lcard h3 { margin:0; font-size:1.15rem; flex:1; min-width:0; overflow-wrap:anywhere; }
.crm .crm-lcard .num { font:800 2rem/1 var(--font-head); font-stretch:80%; color:var(--brand); font-variant-numeric:tabular-nums; text-align:right; }
.crm .crm-lcard .num small { display:block; font:500 12.5px var(--font-body); color:var(--ink-3); margin-top:2px; }
.crm .crm-lcard .desc { font-size:14px; color:var(--ink-2); margin:0; }
.crm .crm-lcard .reach { display:flex; flex-wrap:wrap; gap:4px 14px; font-size:13px; color:var(--ink-3); }
.crm .crm-lcard .reach b { color:var(--ink-2); font-variant-numeric:tabular-nums; }
.crm .crm-lcard .acts { display:flex; flex-wrap:wrap; gap:6px; margin-top:auto; padding-top:10px; border-top:1px solid var(--line); }

/* paths */
.crm .crm-pathbar { display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:14px; }
.crm .crm-pathpill { display:inline-flex; align-items:center; gap:8px; min-height:40px; padding:8px 14px; border-radius:999px; border:1px solid var(--line-strong); background:var(--surface); font:600 14.5px var(--font-body); color:var(--ink-2); cursor:pointer; text-decoration:none; }
.crm .crm-pathpill .n { font-size:12.5px; color:var(--ink-3); font-variant-numeric:tabular-nums; }
.crm .crm-pathpill[aria-current="page"] { background:var(--brand); border-color:var(--brand); color:var(--brand-ink); }
.crm .crm-pathpill[aria-current="page"] .n { color:color-mix(in srgb, var(--brand-ink) 75%, transparent); }
.crm .crm-pathhead { display:flex; flex-wrap:wrap; gap:10px 16px; align-items:flex-end; margin-bottom:14px; }
.crm .crm-pathhead > div:first-child { flex:1 1 300px; min-width:0; }
.crm .crm-pathhead h2 { margin:0 0 2px; font-size:1.35rem; }
.crm .crm-pathhead p { margin:0; color:var(--ink-2); font-size:15px; }
.crm .crm-steptabs { display:none; gap:6px; overflow-x:auto; scrollbar-width:none; margin:0 -16px 10px; padding:2px 16px; }
.crm .crm-steptabs::-webkit-scrollbar { display:none; }
.crm .crm-steptabs button { flex:none; min-height:44px; padding:8px 14px; border-radius:10px; border:1px solid var(--line-strong); background:var(--surface); font:600 14px var(--font-body); color:var(--ink-2); cursor:pointer; white-space:nowrap; }
.crm .crm-steptabs button[aria-selected="true"] { background:var(--brand); border-color:var(--brand); color:var(--brand-ink); }
.crm .crm-steptabs .n { font-weight:500; opacity:.8; margin-left:6px; }
.crm .crm-kan { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(188px, 1fr); gap:10px; overflow-x:auto; padding-bottom:8px; scroll-snap-type:x proximity; }
.crm .crm-col { background:var(--surface-2); border:1px solid var(--line); border-radius:var(--r-lg); display:flex; flex-direction:column; min-height:260px; scroll-snap-align:start; transition:background-color .15s, border-color .15s, box-shadow .15s; min-width:0; }
.crm .crm-col.drop { background:color-mix(in srgb, var(--brand) 7%, white); border-color:var(--brand); box-shadow:inset 0 0 0 1px var(--brand); }
.crm .crm-col-h { display:flex; align-items:center; gap:8px; padding:12px 12px 8px; }
.crm .crm-col-h .step { font:700 11.5px/1 var(--font-body); color:var(--ink-3); letter-spacing:.05em; }
.crm .crm-col-h h3 { margin:0; font-size:15px; font-family:var(--font-body); font-weight:700; line-height:1.25; flex:1; min-width:0; }
.crm .crm-col-h .n { font:600 12.5px var(--font-body); color:var(--ink-2); background:var(--surface); border:1px solid var(--line); border-radius:999px; padding:2px 8px; font-variant-numeric:tabular-nums; }
.crm .crm-col-own { display:flex; align-items:center; gap:6px; padding:0 12px 10px; font-size:13px; color:var(--ink-3); min-height:30px; min-width:0; }
.crm .crm-col-own .select { min-height:30px; padding:2px 26px 2px 6px; font-size:13px; width:auto; min-width:0; max-width:100%; border-color:transparent; background-color:transparent; background-position:right 6px center; color:var(--ink-2); text-overflow:ellipsis; }
.crm .crm-col-own .select:hover { border-color:var(--line-strong); }
.crm .crm-col-b { display:flex; flex-direction:column; gap:8px; padding:0 8px 10px; flex:1; }
.crm .crm-kc { position:relative; display:flex; align-items:center; gap:8px; padding:10px 4px 10px 10px; background:var(--surface); border:1px solid var(--line); border-radius:10px; box-shadow:var(--shadow-1); cursor:grab; user-select:none; touch-action:auto; transition:box-shadow .15s, opacity .15s; }
.crm .crm-kc:hover { box-shadow:0 6px 16px -10px rgba(21,32,46,.4); }
.crm .crm-kc.dragging { opacity:.35; }
.crm .crm-kc .b { flex:1; min-width:0; }
.crm .crm-kc .b b { display:block; font-size:14.5px; font-weight:650; line-height:1.3; overflow-wrap:anywhere; }
.crm .crm-kc .b small { display:flex; flex-wrap:wrap; gap:4px 8px; align-items:center; margin-top:3px; }
.crm .crm-kc .crm-grip { color:var(--ink-3); display:none; touch-action:none; }
.crm .crm-kc .crm-ibtn { width:36px; height:36px; }
.crm .crm-kc .cta { display:inline-flex; align-items:center; gap:4px; font:600 12.5px var(--font-body); }
.crm .crm-col.fin { background:transparent; border-style:dashed; }
.crm .crm-col.fin .crm-kc { box-shadow:none; opacity:.8; cursor:default; }
.crm .crm-col-empty { font-size:13.5px; color:var(--ink-3); text-align:center; padding:18px 8px; border:1px dashed var(--line-strong); border-radius:10px; }
.crm-ghost { position:fixed; z-index:1200; pointer-events:none; width:240px; transform:rotate(2deg); opacity:.96; }
.crm-ghost .crm-kc { box-shadow:0 18px 30px -12px rgba(21,32,46,.45); cursor:grabbing; }
.crm .crm-sugg { border:1px solid color-mix(in srgb, var(--accent) 25%, white); background:linear-gradient(180deg, color-mix(in srgb, var(--accent) 5%, white), var(--surface)); border-radius:var(--r-lg); padding:14px 16px; margin-bottom:14px; }
.crm .crm-sugg .h { display:flex; flex-wrap:wrap; gap:8px 14px; align-items:center; margin-bottom:10px; }
.crm .crm-sugg .h h3 { margin:0; font-size:1.05rem; flex:1 1 260px; }
.crm .crm-sugg .h p { margin:2px 0 0; font-size:14px; color:var(--ink-2); font-family:var(--font-body); font-weight:400; }
.crm .crm-sugg ul { list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:8px; }
.crm .crm-sugg li { display:flex; align-items:center; gap:8px; padding:6px 6px 6px 8px; border:1px solid var(--line); border-radius:999px; background:var(--surface); font-size:14px; }
.crm .crm-sugg li small { color:var(--ink-3); }
.crm-menu { position:fixed; z-index:960; min-width:220px; max-width:calc(100vw - 24px); background:var(--surface); border:1px solid var(--line); border-radius:12px; box-shadow:var(--shadow-2); padding:6px; animation:crm-pop .14s ease-out; }
.crm-menu button, .crm-menu a { display:flex; align-items:center; gap:8px; width:100%; min-height:40px; padding:8px 10px; border:0; background:none; border-radius:8px; font:500 14.5px var(--font-body); color:var(--ink); cursor:pointer; text-align:left; text-decoration:none; }
.crm-menu button:hover, .crm-menu a:hover, .crm-menu button:focus-visible { background:var(--surface-2); }
.crm-menu .sep { height:1px; background:var(--line); margin:4px 2px; }
.crm-menu .lbl { font:700 11.5px var(--font-body); letter-spacing:.05em; text-transform:uppercase; color:var(--ink-3); padding:8px 10px 4px; }
.crm-menu .danger { color:var(--danger); }

/* tasks page */
.crm .crm-tgroup { margin-bottom:18px; }
.crm .crm-tgroup h3 { display:flex; align-items:center; gap:8px; font:700 13px/1 var(--font-body); letter-spacing:.06em; text-transform:uppercase; color:var(--ink-3); margin:0 0 6px; }
.crm .crm-tgroup.over h3 { color:var(--danger); }
.crm .crm-tbox { background:var(--surface); border:1px solid var(--line); border-radius:var(--r-lg); padding:4px 14px 4px 6px; box-shadow:var(--shadow-1); }
.crm .crm-tbox .crm-task + .crm-task { border-top:1px solid var(--line); }
.crm .crm-seg { display:inline-flex; border:1px solid var(--line-strong); border-radius:10px; padding:3px; background:var(--surface); }
.crm .crm-seg button { min-height:36px; padding:6px 14px; border:0; border-radius:7px; background:none; font:600 14px var(--font-body); color:var(--ink-3); cursor:pointer; }
.crm .crm-seg button[aria-pressed="true"] { background:var(--brand); color:var(--brand-ink); }

/* empty, skeleton, notice */
.crm .crm-empty, .crm-pf .crm-empty { text-align:center; padding:44px 20px; border:1px dashed var(--line-strong); border-radius:var(--r-lg); background:var(--surface); }
.crm .crm-empty h3 { margin:10px 0 6px; }
.crm .crm-empty p { color:var(--ink-2); max-width:46ch; margin:0 auto 16px; }
.crm .crm-skel { border:1px solid var(--line); border-radius:var(--r-lg); background:var(--surface); overflow:hidden; }
.crm .crm-skel-row { display:flex; align-items:center; gap:14px; padding:14px 16px; border-bottom:1px solid var(--line); }
.crm .crm-skel-row i { display:block; height:12px; border-radius:6px; background:linear-gradient(90deg, var(--surface-2), #E9EDF2, var(--surface-2)); background-size:200% 100%; animation:crm-sh 1.2s ease-in-out infinite; animation-delay:var(--d); }
.crm .crm-skel-row .c { width:28px; height:28px; border-radius:50%; } .crm .crm-skel-row .a { width:28%; } .crm .crm-skel-row .b { width:18%; } .crm .crm-skel-row .s { width:12%; margin-left:auto; }
@keyframes crm-sh { from { background-position:200% 0; } to { background-position:-200% 0; } }
.crm .crm-notice { max-width:560px; margin:40px auto; text-align:center; }

@media (max-width: 719px) {
  .crm .crm-page { padding:18px 16px 96px; }
  .crm .crm-page.crm-embedded { padding:0 0 96px; }
  .crm .crm-head .crm-h1 { font-size:1.9rem; }
  .crm .crm-search { max-width:none; flex-basis:100%; }
  .crm .crm-search kbd { display:none; }
  .crm .crm-chips { flex-wrap:nowrap; overflow-x:auto; margin:0 -16px; padding:2px 16px; scrollbar-width:none; width:calc(100% + 32px); }
  .crm .crm-chips::-webkit-scrollbar { display:none; }
  .crm .crm-fchip { min-height:40px; flex:none; }
  .crm .crm-pop { position:fixed; left:12px; right:12px; top:auto; bottom:12px; width:auto; max-width:none; z-index:75; }
  .crm .crm-steptabs { display:flex; }
  .crm .crm-kan { grid-auto-columns:100%; gap:16px; scroll-snap-type:x mandatory; scrollbar-width:none; -webkit-mask-image:none !important; mask-image:none !important; }
  .crm .crm-kan::-webkit-scrollbar { display:none; }
  .crm .crm-col { scroll-snap-stop:always; }
  .crm .crm-kc .crm-grip { display:inline-flex; width:28px; height:44px; align-items:center; justify-content:center; margin-left:-6px; }
  .crm .crm-kc { cursor:default; }
  .crm .crm-kc .crm-ibtn { width:44px; height:44px; }
  .crm .crm-lists { grid-template-columns:minmax(0,1fr); }
  .crm-pf { padding:14px 16px 48px; }
  .crm-dl { grid-template-columns:96px minmax(0,1fr); }
  .crm-addtask input[type="date"] { flex:1 1 140px; }
  .crm .crm-tbox { padding-right:10px; }
}
@media (prefers-reduced-motion: reduce) {
  .crm *, .crm-drawer, .crm-bulk, .crm-menu, .crm-ghost { animation:none !important; transition:none !important; }
  .crm .crm-kan { scroll-behavior:auto; }
}
@media (max-width: 640px), (pointer: coarse) {
.crm .crm-fchip, .crm .crm-pathpill, .crm .crm-seg button, .crm .crm-rolepick button, .crm .crm-log-tabs button, .crm .crm-pf-quick .btn { min-height: 44px; min-width: 44px; }
.crm .crm-task .b a, .crm .crm-kc .b a, .crm .crm-dl a { display: inline-flex; align-items: center; min-height: 44px; }
.crm .crm-col-own .select { min-height: 44px; }
}
`;
    document.head.appendChild(s);
  }

  /* ---------------- shared bits ---------------- */
  function closeMenus() { document.querySelectorAll('.crm-menu').forEach((m) => m.remove()); }
  /* A small floating menu next to a button. items: [{label, icon, onClick, href, danger}] | 'sep' | {heading} */
  function openMenu(anchor, items) {
    closeMenus();
    const m = document.createElement('div');
    m.className = 'crm-menu';
    m.setAttribute('role', 'menu');
    items.forEach((it) => {
      if (it === 'sep') { const d = document.createElement('div'); d.className = 'sep'; m.appendChild(d); return; }
      if (it.heading) { const d = document.createElement('div'); d.className = 'lbl'; d.textContent = it.heading; m.appendChild(d); return; }
      const b = document.createElement(it.href ? 'a' : 'button');
      if (it.href) b.href = it.href; else b.type = 'button';
      b.setAttribute('role', 'menuitem');
      if (it.danger) b.className = 'danger';
      b.innerHTML = (it.icon || '') + `<span>${esc(it.label)}</span>`;
      b.addEventListener('click', (e) => { closeMenus(); cleanup(); if (it.onClick) { e.preventDefault(); it.onClick(); } });
      m.appendChild(b);
    });
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    const w = m.offsetWidth, h = m.offsetHeight;
    let left = Math.min(r.right - w, window.innerWidth - w - 12); left = Math.max(12, left);
    let top = r.bottom + 6; if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 6);
    m.style.left = left + 'px'; m.style.top = top + 'px';
    const first = m.querySelector('button,a'); if (first) first.focus();
    const off = (e) => { if (!m.contains(e.target) && e.target !== anchor) { closeMenus(); cleanup(); } };
    const key = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeMenus(); cleanup(); anchor.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const all = Array.from(m.querySelectorAll('button,a')); const i = all.indexOf(document.activeElement);
        const n = all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]; if (n) { e.preventDefault(); n.focus(); }
      }
    };
    const sc = (e) => { if (m.contains(e.target)) return; closeMenus(); cleanup(); };
    function cleanup() { document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', key, true); window.removeEventListener('scroll', sc, true); }
    setTimeout(() => { document.addEventListener('pointerdown', off, true); document.addEventListener('keydown', key, true); window.addEventListener('scroll', sc, true); }, 0);
    return m;
  }
  function personOptions(owner, selected, emptyLabel) {
    return `<option value="">${esc(emptyLabel || 'Nobody yet')}</option>` + CRM().team(owner).map((p) => `<option value="${esc(p.id)}"${p.id === selected ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  }
  function filterSummary(f) {
    const L = CRM().ROLE_LABEL, S = CRM().SUPPORT;
    const parts = [];
    if (f.q) parts.push(`matching "${f.q}"`);
    if (f.roles && f.roles.length) parts.push(f.roles.map((r) => (L[r] || r).toLowerCase() + 's').join(' or '));
    if (f.support && f.support.length) parts.push('support ' + f.support.map((s) => (s === 'unknown' ? 'not known' : `${s} (${S[s].toLowerCase()})`)).join(', '));
    if (f.tags && f.tags.length) parts.push('tagged ' + f.tags.map((t) => `"${tagText(t, false)}"`).join(' and '));
    const places = (f.city || []).concat(f.zip || []);
    if (places.length) parts.push('in ' + places.join(', '));
    if (f.optIn) parts.push({ email: 'who get email', sms: 'who get texts', none: 'with no opt-in', dnc: 'marked do not contact' }[f.optIn]);
    if (f.lastActivityDays) parts.push(Number(f.lastActivityDays) > 0 ? `active in the last ${f.lastActivityDays} days` : `quiet for ${-f.lastActivityDays} days or more`);
    if (!parts.length) return 'Everyone in your people database.';
    const s = 'People ' + parts.join(', ') + '.';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function hasFilter(f) { return !!(f && (f.q || (f.tags || []).length || (f.roles || []).length || (f.support || []).length || (f.city || []).length || (f.zip || []).length || f.optIn || f.lastActivityDays)); }
  function confirmModal(o) {
    return App.modal({ title: o.title, html: o.html, actions: [{ label: o.cancel || 'Cancel' }, { label: o.ok, primary: true, onClick: o.onOk }] });
  }

  /* Where a mount lives. On its own screen: #/people and #/outreach. Inside another screen (My Campaign mounts
     with only {owner}), the base is that screen's route plus the segment it used, e.g. #/mycampaign/people. */
  function embedRoute(kind, o, ctx) {
    const r = App.route || { id: kind, sub: ctx.sub || '' };
    const own = r.id === kind && !o.base;
    const other = kind === 'people' ? 'outreach' : 'people';
    let base, sub, root;
    if (o.base) {
      base = o.base.replace(/\/$/, '');
      sub = String(o.sub != null ? o.sub : '');
      root = base.replace(/\/[^/]*$/, '');
    } else if (own) {
      base = '#/' + kind; sub = String(r.sub || ''); root = '';
    } else {
      const segs = String(o.sub != null ? o.sub : (r.sub || ctx.sub || '')).split('/');
      const seg = segs[0] === kind ? segs.shift() : kind;
      root = '#/' + r.id;
      base = root + '/' + seg;
      sub = segs.join('/');
    }
    const otherBase = (o[other + 'Base'] || (own || !root ? '#/' + other : root + '/' + other)).replace(/\/$/, '');
    return {
      base, sub, embedded: !own && !o.base ? true : !!o.embedded,
      outBase: kind === 'people' ? otherBase : base,
      peopleBase: kind === 'outreach' ? otherBase : base,
    };
  }

  /* ---------------- per-owner UI memory ---------------- */
  const UIM = {};
  function mem(owner) {
    if (!UIM[owner]) UIM[owner] = { q: '', f: {}, sel: new Set(), known: null, shown: 150, gridTop: 0, winY: 0, taskMine: true, logType: 'call', pathId: null };
    return UIM[owner];
  }
  let firstMount = true;
  let drawerW = null;
  function getDrawerW() {
    if (drawerW == null) { try { drawerW = Number(Store.global.get('crmDrawerWidth', 500)) || 500; } catch (e) { drawerW = 500; } }
    return drawerW;
  }

  /* =====================================================================
     mountPeople
     ===================================================================== */
  /* If a screen mounts before crm.js has loaded (a different script order, a slow phone), show the
     skeleton and mount as soon as the engine is there. Nobody sees a loading message. */
  function whenEngine(el, fn) {
    if (window.App.crm && (!window.DATA ? false : true)) return false;
    injectStyles();
    el.classList.add('crm');
    el.innerHTML = '<div class="page crm-page">' + skeleton(8) + '</div>';
    let tries = 0;
    const retry = () => {
      if (!el.isConnected) return;
      if (window.App.crm && window.DATA) { fn(); return; }
      if (++tries < 300) setTimeout(retry, 100);
    };
    window.addEventListener('crm:ready', () => { if (el.isConnected && tries < 300) { tries = 300; fn(); } }, { once: true });
    setTimeout(retry, 100);
    return true;
  }
  function mountPeople(el, ctx, opts) {
    if (whenEngine(el, () => mountPeople(el, ctx, opts))) return { el, owner: (opts || {}).owner || 'committee' };
    injectStyles();
    const o = opts || {};
    const owner = o.owner || 'committee';
    const R = embedRoute('people', o, ctx);
    const base = R.base, outBase = R.outBase, sub = R.sub, embedded = R.embedded;
    const parts = sub.split('/');
    const section = ['lists', 'paths', 'tasks'].indexOf(parts[0]) >= 0 ? parts[0] : 'people';
    const openId = section === 'people' && parts[0] ? parts[0] : null;
    const M = mem(owner);
    const C = CRM();
    el.classList.add('crm');

    if (!C.perms.view(owner)) {
      const master = App.auth && App.auth.role === 'master';
      el.innerHTML = `<div class="${embedded ? '' : 'page '}crm-page"><div class="crm-notice crm-empty"><div class="crm-empty-art" aria-hidden="true">${ART.people}</div>
        <h3>${master ? 'County people records stay with each county' : 'These records belong to another team'}</h3>
        <p>${master ? 'Master Network sees statewide totals in the Master Network console. Each county keeps its own supporter records.' : 'A county party and a candidate committee keep separate supporter records. Ask the record owner to share people with you.'}</p></div></div>`;
      return;
    }
    const canEdit = C.perms.edit(owner);
    const canSend = C.perms.send(owner);
    const canShare = owner === 'committee' && C.perms.share();
    const isCamp = C.isCampaign(owner);

    const page = document.createElement('div');
    page.className = embedded ? 'crm-page crm-embedded' : 'page crm-page';
    el.innerHTML = '';
    el.appendChild(page);
    // The drawer and bulk bar live on <body> so no screen transform traps their fixed position.
    document.querySelectorAll('body > .crm-drawer, body > .crm-bulk').forEach((x) => x.remove());
    const drawer = document.createElement('aside');
    drawer.className = 'crm crm-drawer';
    drawer.setAttribute('aria-label', 'Person profile');
    drawer.setAttribute('data-tour', 'people-profile');
    drawer.innerHTML = '<button class="crm-rsz" type="button" aria-label="Resize profile panel. Use the left and right arrow keys."></button><div class="crm-dbar"></div><div class="crm-dbody"></div>';
    drawer.style.setProperty('--crm-dw', getDrawerW() + 'px');
    document.body.appendChild(drawer);
    let bulkEl = null;
    let openPerson = null;
    let drag = null;

    const go = (p) => { location.hash = (base + (p ? '/' + p : '')).replace(/^#?/, '#'); };
    const href = (p) => base + (p ? '/' + p : '');

    function headHtml() {
      const all = C.people(owner);
      const vols = all.filter((p) => (p.roles || []).indexOf('volunteer') >= 0).length;
      const donors = all.filter((p) => (p.roles || []).indexOf('donor') >= 0).length;
      const mine = C.me(owner);
      const openTasks = C.tasks(owner, { done: false, assigneeId: mine ? mine.id : undefined }).length;
      const listsN = C.lists(owner).length;
      const pathsN = C.paths(owner).reduce((n, p) => n + C.pathEntries(p.id).length, 0);
      const title = isCamp ? 'Supporters' : 'People';
      const H = embedded ? 'h2' : 'h1';
      const lead = isCamp
        ? `Everyone who has signed up, given or volunteered for ${esc(C.ownerLabel(owner))}. These records stay with the campaign.`
        : `${U.fmtNum(all.length)} people, including ${plural(vols, 'volunteer')} and ${plural(donors, 'donor')}. RSVPs, volunteer sign-ups, gifts and door knocks land here on their own.`;
      const nav = [['', 'People', all.length], ['lists', 'Lists', listsN], ['paths', 'Paths', pathsN], ['tasks', mine ? 'My tasks' : 'Tasks', openTasks]];
      return `<div class="crm-head"><div>
          ${isCamp ? `<div class="crm-owner">${esc(C.ownerLabel(owner))}</div>` : ''}
          <${H} class="crm-h1">${title}</${H}><p>${lead}</p></div>
          <div class="crm-head-actions">
            ${section === 'people' ? `<button class="btn btn-ghost" data-act="export">${IC.download} Export CSV</button>` : ''}
            ${canEdit && section === 'people' ? `<button class="btn btn-primary" data-act="add-person">${IC.plus} Add a person</button>` : ''}
          </div></div>
        <nav class="crm-nav" aria-label="${title} sections">${nav.map(([k, l, n]) => `<a href="${esc(href(k))}"${(k || 'people') === section ? ' aria-current="page"' : ''}>${l}<span class="n">${U.fmtNum(n)}</span></a>`).join('')}</nav>
        ${canEdit ? '' : `<p class="crm-ro">${IC.user} You can look up anyone here. ${isCamp ? 'The campaign team' : 'Executive Board members'} make changes.</p>`}`;
    }

    /* -------- draw -------- */
    function draw() {
      const y = window.scrollY;
      page.innerHTML = headHtml() + '<div class="crm-sec" data-sec></div>';
      const sec = page.querySelector('[data-sec]');
      if (section === 'people') drawPeople(sec);
      else if (section === 'lists') drawLists(sec);
      else if (section === 'paths') drawPaths(sec);
      else drawTasks(sec);
      window.scrollTo(0, y);
    }
    let raf = 0;
    function redraw() {
      if (!el.isConnected) { unsub(); return; }
      if (drag && drag.started) { setTimeout(redraw, 250); return; }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (section === 'people') {
          refreshHeadCounts();
          renderResults();
        } else {
          const sec = page.querySelector('[data-sec]');
          const y = window.scrollY;
          const kan = page.querySelector('.crm-kan'); const kx = kan ? kan.scrollLeft : 0;
          refreshHeadCounts();
          if (section === 'lists') drawLists(sec); else if (section === 'paths') drawPaths(sec); else drawTasks(sec);
          const k2 = page.querySelector('.crm-kan'); if (k2) k2.scrollLeft = kx;
          window.scrollTo(0, y);
        }
        if (openPerson) renderProfile(true);
      });
    }
    function refreshHeadCounts() {
      const tmp = document.createElement('div'); tmp.innerHTML = headHtml();
      const nav = page.querySelector('.crm-nav'); const nn = tmp.querySelector('.crm-nav');
      if (nav && nn) nav.innerHTML = nn.innerHTML;
      const p = page.querySelector('.crm-head p'); const np = tmp.querySelector('.crm-head p');
      if (p && np) p.innerHTML = np.innerHTML;
    }

    /* Edge fade on anything that scrolls sideways; on phones the step tabs follow the kanban. */
    function wireScroller(box) {
      if (!box) return;
      const upd = () => {
        const x = box.scrollWidth - box.clientWidth > 2;
        box.classList.toggle('is-x', x);
        box.classList.toggle('at-end', x && box.scrollLeft >= box.scrollWidth - box.clientWidth - 4);
        if (box.matches('[data-kan]')) {
          const i = Math.round(box.scrollLeft / Math.max(1, box.clientWidth));
          page.querySelectorAll('[data-steptab]').forEach((t) => {
            const on = Number(t.dataset.steptab) === i;
            if (on && t.getAttribute('aria-selected') !== 'true' && t.parentElement) {
              const bar = t.parentElement;
              bar.scrollTo({ left: Math.max(0, t.offsetLeft - 16), behavior: reduceMotion() ? 'auto' : 'smooth' });
            }
            t.setAttribute('aria-selected', String(on));
          });
        }
      };
      box.addEventListener('scroll', upd, { passive: true });
      requestAnimationFrame(upd);
    }

    /* =================== PEOPLE LIST =================== */
    const FILTERS = [['tags', 'Tags'], ['roles', 'Roles'], ['support', 'Support'], ['place', 'ZIP or city'], ['optIn', 'Opt-in'], ['activity', 'Last activity']];
    function chipValue(k) {
      const f = M.f;
      const L = C.ROLE_LABEL;
      if (k === 'tags' && (f.tags || []).length) return f.tags.map((t) => tagText(t, true)).join(', ');
      if (k === 'roles' && (f.roles || []).length) return f.roles.map((r) => L[r]).join(', ');
      if (k === 'support' && (f.support || []).length) return f.support.map((s) => (s === 'unknown' ? 'Not known' : s)).join(', ');
      if (k === 'place' && ((f.city || []).length || (f.zip || []).length)) return (f.city || []).concat(f.zip || []).join(', ');
      if (k === 'optIn' && f.optIn) return { email: 'Gets email', sms: 'Gets texts', none: 'No opt-in', dnc: 'Do not contact' }[f.optIn];
      if (k === 'activity' && f.lastActivityDays) return Number(f.lastActivityDays) > 0 ? `Last ${f.lastActivityDays} days` : `Quiet ${-f.lastActivityDays}+ days`;
      return '';
    }
    function chipsHtml() {
      return FILTERS.map(([k, l]) => {
        const v = chipValue(k);
        return `<button type="button" class="crm-fchip${v ? ' on' : ''}" data-filter="${k}" aria-expanded="false" aria-haspopup="true">${v ? `<span class="v">${esc(l)}: ${esc(v)}</span>` : esc(l)}${IC.chev}</button>`;
      }).join('') + (hasFilter(currentFilter()) ? `<button type="button" class="crm-clear" data-act="clear-filters">Clear</button>` : '');
    }
    function drawPeople(sec) {
      sec.innerHTML = `
        <div class="crm-tools">
          <label class="crm-search">${IC.search}<span class="sr-only">Search people</span>
            <input class="input" type="search" data-q placeholder="Search name, email, phone, city or tag" value="${esc(M.q)}" autocomplete="off"><kbd aria-hidden="true">/</kbd></label>
          <div class="crm-chips" data-chips>${chipsHtml()}</div>
        </div>
        <div class="crm-sumline" data-sum></div>
        <div data-results data-tour="people-table"></div>`;
      renderResults(true);
      const grid = sec.querySelector('.crm-grid');
      if (grid && M.gridTop) grid.scrollTop = M.gridTop;
    }
    function currentFilter() { return Object.assign({}, M.f, { q: M.q }); }
    let lastRows = [];
    function renderResults(first) {
      const box = page.querySelector('[data-results]');
      if (!box) return;
      const grid0 = box.querySelector('.crm-grid'); const gtop = grid0 ? grid0.scrollTop : M.gridTop;
      const rows = C.people(owner, currentFilter());
      lastRows = rows;
      const ids = new Set(C.people(owner).map((p) => p.id));
      const fresh = M.known ? new Set(Array.from(ids).filter((id) => !M.known.has(id))) : new Set();
      M.known = ids;
      Array.from(M.sel).forEach((id) => { if (!ids.has(id)) M.sel.delete(id); });
      const sum = page.querySelector('[data-sum]');
      const filtered = hasFilter(currentFilter());
      if (sum) {
        sum.innerHTML = `<span><b>${U.fmtNum(rows.length)}</b> ${filtered ? `of ${U.fmtNum(ids.size)} people match` : rows.length === 1 ? 'person' : 'people'}</span>
          <span class="sp"></span>
          ${filtered && canEdit ? `<button class="btn btn-sm" data-act="save-list">${IC.list} Save as list</button>` : ''}`;
      }
      if (!rows.length) {
        box.innerHTML = filtered
          ? emptyState({ art: ART.people, title: 'Nobody matches these filters', body: 'Try fewer filters or a shorter search. Searching a phone number works with any three digits in a row.', action: '<button class="btn" data-act="clear-filters">Clear filters</button>' })
          : emptyState({ art: ART.people, title: 'No people yet', body: 'People appear here when someone RSVPs, volunteers, gives or signs a petition. You can also add someone by hand.', action: canEdit ? `<button class="btn btn-primary" data-act="add-person">${IC.plus} Add a person</button>` : '' });
        drawBulk();
        return;
      }
      const shown = rows.slice(0, M.shown);
      const pname = (id) => { const p = id && C.person(id); return p ? p.name : ''; };
      if (isPhone()) {
        box.innerHTML = `<div class="crm-cards" role="list">${shown.map((p) => `
          <div class="crm-card${M.sel.has(p.id) ? ' is-sel' : ''}${fresh.has(p.id) ? ' is-new' : ''}" role="listitem" data-open="${esc(p.id)}">
            ${canEdit ? `<label class="crm-cb" data-stop><input type="checkbox" data-sel="${esc(p.id)}"${M.sel.has(p.id) ? ' checked' : ''} aria-label="Select ${esc(p.name)}"></label>` : '<span style="width:8px"></span>'}
            <div class="body">
              <div class="top">${U.avatar(p.name, 30)}<b>${esc(p.name || 'No name')}</b>${sampleMark(p)}</div>
              <div class="meta">${supportMeter(p.support)}<span>${esc([p.city, p.zip].filter(Boolean).join(' '))}</span><span>${esc(fmtRel(p.lastActivityAt))}</span></div>
              ${(p.roles || []).length || (p.tags || []).length ? `<div class="chips">${roleChips(p.roles, 2)}${tagChips(p.tags, 2, true)}</div>` : ''}
            </div></div>`).join('')}</div>
          ${rows.length > shown.length ? `<div class="crm-more-rows"><button class="btn" data-act="more">Show ${U.fmtNum(Math.min(150, rows.length - shown.length))} more</button></div>` : ''}`;
      } else {
        const allSel = shown.length && shown.every((p) => M.sel.has(p.id));
        box.innerHTML = `<div class="crm-grid" tabindex="-1"><table class="crm-t">
          <thead><tr>
            ${canEdit ? `<th class="cb"><label class="crm-cb"><input type="checkbox" data-selall${allSel ? ' checked' : ''} aria-label="Select all ${shown.length} shown"></label></th>` : ''}
            <th>Name</th><th>Support</th><th class="col-roles">Roles</th><th class="col-tags">Tags</th><th class="col-place">Place</th><th>Last activity</th>
          </tr></thead>
          <tbody>${shown.map((p) => `<tr data-open="${esc(p.id)}" class="${M.sel.has(p.id) ? 'is-sel' : ''}${openPerson === p.id ? ' is-open' : ''}${fresh.has(p.id) ? ' is-new' : ''}">
            ${canEdit ? `<td class="cb" data-stop><label class="crm-cb"><input type="checkbox" data-sel="${esc(p.id)}"${M.sel.has(p.id) ? ' checked' : ''} aria-label="Select ${esc(p.name)}"></label></td>` : ''}
            <td><div class="crm-nm">${U.avatar(p.name, 30)}<div class="t"><b><a href="${esc(href(p.id))}" data-open-link="${esc(p.id)}" style="color:inherit;text-decoration:none">${esc(p.name || 'No name')}</a></b>${sampleMark(p)}<small>${esc(p.email || (p.phone ? C.util.fmtPhone(p.phone) : 'No contact info'))}${p.city ? `<span class="pl"> · ${esc(p.city)}</span>` : ''}</small></div></div></td>
            <td>${supportMeter(p.support)}</td>
            <td class="col-roles">${roleChips(p.roles, 2)}</td>
            <td class="col-tags">${tagChips(p.tags, 1, true)}</td>
            <td class="muted-cell col-place">${esc([p.city, p.zip].filter(Boolean).join(' · '))}</td>
            <td class="muted-cell"><span class="crm-last">${esc(fmtRel(p.lastActivityAt))}${p.pointPersonId ? `<span class="crm-ppa" title="Point person: ${esc(pname(p.pointPersonId))}"><span class="sr-only">Point person: ${esc(pname(p.pointPersonId))}</span>${U.avatar(pname(p.pointPersonId), 22)}</span>` : ''}</span></td>
          </tr>`).join('')}</tbody></table>
          ${rows.length > shown.length ? `<div class="crm-more-rows"><button class="btn" data-act="more">Show ${U.fmtNum(Math.min(150, rows.length - shown.length))} more</button></div>` : ''}</div>`;
        const grid = box.querySelector('.crm-grid');
        if (!first && grid) grid.scrollTop = gtop;
        if (grid) { grid.addEventListener('scroll', () => { M.gridTop = grid.scrollTop; }, { passive: true }); wireScroller(grid); }
      }
      drawBulk();
    }

    /* filter popovers */
    let pop = null;
    function closePop() { if (pop) { pop.remove(); pop = null; page.querySelectorAll('.crm-fchip[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false')); } }
    function counts(fn) { const m = new Map(); C.people(owner).forEach((p) => fn(p).forEach((v) => { if (v) m.set(v, (m.get(v) || 0) + 1); })); return m; }
    function openPop(btn) {
      const k = btn.dataset.filter;
      if (pop && pop.dataset.k === k) { closePop(); return; }
      closePop();
      const f = M.f;
      const opt = (name, value, label, checked, count, type) => `<label class="crm-opt"><input type="${type || 'checkbox'}" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}><span>${esc(label)}</span>${count != null ? `<span class="c">${U.fmtNum(count)}</span>` : ''}</label>`;
      let body = '';
      if (k === 'tags') {
        const m = counts((p) => p.tags || []);
        const tags = Array.from(m.keys()).sort((a, b) => m.get(b) - m.get(a) || a.localeCompare(b));
        body = `<h4>People with every tag you pick</h4><input class="input" type="search" placeholder="Find a tag" data-popq aria-label="Find a tag"><div class="crm-pop-list">${tags.map((t) => opt('tags', t, tagText(t, false), (f.tags || []).indexOf(t) >= 0, m.get(t))).join('')}</div>`;
      } else if (k === 'roles') {
        const m = counts((p) => p.roles || []);
        body = `<h4>People with any of these roles</h4><div class="crm-pop-list">${C.ROLES.map((r) => opt('roles', r, C.ROLE_LABEL[r], (f.roles || []).indexOf(r) >= 0, m.get(r) || 0)).join('')}</div>`;
      } else if (k === 'support') {
        const m = counts((p) => [p.support ? String(p.support) : 'unknown']);
        body = `<h4>Support score</h4><div class="crm-pop-list">${[5, 4, 3, 2, 1].map((s) => opt('support', s, `${s}: ${C.SUPPORT[s]}`, (f.support || []).map(String).indexOf(String(s)) >= 0, m.get(String(s)) || 0)).join('')}${opt('support', 'unknown', 'Not known yet', (f.support || []).indexOf('unknown') >= 0, m.get('unknown') || 0)}</div>`;
      } else if (k === 'place') {
        const mc = counts((p) => [p.city]); const mz = counts((p) => [p.zip]);
        body = `<h4>Cities</h4><div class="crm-pop-list" style="max-height:160px">${Array.from(mc.keys()).sort().map((c) => opt('city', c, c, (f.city || []).indexOf(c) >= 0, mc.get(c))).join('')}</div>
          <h4 style="margin-top:10px">ZIP codes</h4><div class="crm-pop-list" style="max-height:140px">${Array.from(mz.keys()).sort().map((z) => opt('zip', z, z, (f.zip || []).indexOf(z) >= 0, mz.get(z))).join('')}</div>`;
      } else if (k === 'optIn') {
        body = `<h4>Who can we reach</h4><div class="crm-pop-list">${[['', 'Anyone'], ['email', 'Gets email'], ['sms', 'Gets texts'], ['none', 'No opt-in yet'], ['dnc', 'Marked do not contact']].map(([v, l]) => opt('optIn', v, l, (f.optIn || '') === v, null, 'radio')).join('')}</div>`;
      } else if (k === 'activity') {
        body = `<h4>Last activity</h4><div class="crm-pop-list">${[['', 'Any time'], ['7', 'In the last 7 days'], ['30', 'In the last 30 days'], ['90', 'In the last 90 days'], ['-90', 'Quiet for 90 days or more']].map(([v, l]) => opt('act', v, l, String(f.lastActivityDays || '') === v, null, 'radio')).join('')}</div>`;
      }
      pop = document.createElement('div');
      pop.className = 'crm-pop';
      pop.dataset.k = k;
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', btn.textContent.trim() + ' filter');
      pop.innerHTML = body + `<div class="crm-pop-foot"><button type="button" class="btn btn-sm btn-ghost" data-popclear>Clear</button><button type="button" class="btn btn-sm btn-primary" data-popdone>Done</button></div>`;
      const tools = page.querySelector('.crm-tools');
      tools.appendChild(pop);
      if (!isPhone()) {
        const tr = tools.getBoundingClientRect(), br = btn.getBoundingClientRect();
        pop.style.left = Math.max(0, Math.min(br.left - tr.left, tr.width - pop.offsetWidth)) + 'px';
      }
      btn.setAttribute('aria-expanded', 'true');
      const first = pop.querySelector('input'); if (first && !isPhone()) first.focus();
      pop.addEventListener('change', (e) => {
        const i = e.target;
        if (i.name === 'optIn') M.f.optIn = i.value || undefined;
        else if (i.name === 'act') M.f.lastActivityDays = i.value ? Number(i.value) : undefined;
        else if (['tags', 'roles', 'support', 'city', 'zip'].indexOf(i.name) >= 0) {
          M.f[i.name] = Array.from(pop.querySelectorAll(`input[name="${i.name}"]:checked`)).map((x) => (i.name === 'support' && x.value !== 'unknown' ? Number(x.value) : x.value));
        }
        M.shown = 150; renderResults(); refreshChipsKeep();
      });
      pop.addEventListener('input', (e) => {
        if (!e.target.matches('[data-popq]')) return;
        const q = e.target.value.trim().toLowerCase();
        pop.querySelectorAll('.crm-opt').forEach((l) => { l.style.display = !q || l.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none'; });
      });
      pop.addEventListener('click', (e) => {
        if (e.target.closest('[data-popdone]')) { closePop(); btn.focus(); }
        if (e.target.closest('[data-popclear]')) {
          ({ tags: ['tags'], roles: ['roles'], support: ['support'], place: ['city', 'zip'], optIn: ['optIn'], activity: ['lastActivityDays'] })[k].forEach((x) => { delete M.f[x]; });
          pop.querySelectorAll('input').forEach((x) => { if (x.type !== 'search') x.checked = x.type === 'radio' && x.value === ''; });
          renderResults(); refreshChipsKeep();
        }
      });
    }
    function refreshChipsKeep() {
      const k = pop && pop.dataset.k;
      page.querySelectorAll('[data-chips] .crm-fchip').forEach((b) => {
        const kk = b.dataset.filter; const v = chipValue(kk); const l = (FILTERS.find((x) => x[0] === kk) || [])[1];
        b.classList.toggle('on', !!v);
        b.innerHTML = (v ? `<span class="v">${esc(l)}: ${esc(v)}</span>` : esc(l)) + IC.chev;
        b.setAttribute('aria-expanded', String(kk === k));
      });
      const chips = page.querySelector('[data-chips]');
      if (!chips) return;
      const clr = chips.querySelector('.crm-clear');
      const want = hasFilter(currentFilter());
      if (want && !clr) chips.insertAdjacentHTML('beforeend', '<button type="button" class="crm-clear" data-act="clear-filters">Clear</button>');
      if (!want && clr) clr.remove();
    }

    /* bulk bar */
    function drawBulk() {
      const n = M.sel.size;
      if (!canEdit || !n || section !== 'people') { if (bulkEl) { bulkEl.remove(); bulkEl = null; } return; }
      if (!bulkEl) {
        bulkEl = document.createElement('div');
        bulkEl.className = 'crm crm-bulk';
        bulkEl.setAttribute('role', 'region');
        bulkEl.setAttribute('aria-label', 'Actions for selected people');
        document.body.appendChild(bulkEl);
        bulkEl.addEventListener('click', (e) => { const x = e.target.closest('[data-bulk]'); if (x) bulk(x.dataset.bulk); });
      }
      bulkEl.innerHTML = `<b>${plural(n, 'person', 'people')} selected</b>
        <button class="btn btn-sm" data-bulk="tag">${IC.tag} Tag</button>
        <button class="btn btn-sm" data-bulk="path">${IC.path} Add to path</button>
        <button class="btn btn-sm" data-bulk="point">${IC.user} Point person</button>
        ${canShare ? `<button class="btn btn-sm" data-bulk="share">${IC.share} Share to a campaign</button>` : ''}
        <button class="btn btn-sm x" data-bulk="clear" aria-label="Clear selection">${IC.x}</button>`;
    }
    function bulk(kind) {
      const ids = Array.from(M.sel);
      const n = ids.length;
      if (kind === 'clear') { M.sel.clear(); renderResults(); return; }
      if (kind === 'tag') {
        const tags = Array.from(new Set(C.people(owner).flatMap((p) => p.tags || []))).filter((t) => !isSysTag(t)).sort();
        App.modal({
          title: `Tag ${plural(n, 'person', 'people')}`,
          html: `<label class="fld-label" for="crm-bt">Tag</label><input class="input" id="crm-bt" list="crm-bt-l" placeholder="For example, Poll observer" autocomplete="off"><datalist id="crm-bt-l">${tags.map((t) => `<option value="${esc(t)}">`).join('')}</datalist><p class="fld-hint">Pick an existing tag or type a new one.</p>`,
          actions: [{ label: 'Cancel' }, { label: 'Add tag', primary: true, onClick: (m) => {
            const v = m.body.querySelector('#crm-bt').value.trim();
            if (!v) { ctx.toast('Type a tag first.', 'warn'); return false; }
            C.bulkPeople(ids, (p) => ((p.tags || []).indexOf(v) >= 0 ? null : { tags: (p.tags || []).concat([v]) }));
            ctx.toast(`Tagged ${plural(n, 'person', 'people')} "${v}".`, 'ok');
            M.sel.clear(); renderResults();
          } }],
        });
        setTimeout(() => { const i = document.getElementById('crm-bt'); if (i) i.focus(); }, 60);
      } else if (kind === 'path') {
        const ps = C.paths(owner);
        if (!ps.length) { ctx.toast('Create a path first on the Paths tab.', 'warn'); return; }
        App.modal({
          title: `Add ${plural(n, 'person', 'people')} to a path`,
          html: `<label class="fld-label" for="crm-bp">Path</label><select class="select" id="crm-bp">${ps.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>
            <p class="fld-hint">They start at the first step. Anyone already on the path stays where they are.</p>`,
          actions: [{ label: 'Cancel' }, { label: 'Add to path', primary: true, onClick: (m) => {
            const pid = m.body.querySelector('#crm-bp').value;
            const added = C.enter(pid, ids);
            const path = C.getPath(pid);
            ctx.toast(added.length ? `Added ${plural(added.length, 'person', 'people')} to "${path.name}".${n - added.length ? ` ${n - added.length} were already on it.` : ''}` : `Everyone you picked is already on "${path.name}".`, added.length ? 'ok' : 'info');
            M.sel.clear(); renderResults();
          } }],
        });
      } else if (kind === 'point') {
        App.modal({
          title: `Point person for ${plural(n, 'person', 'people')}`,
          html: `<label class="fld-label" for="crm-bpp">Point person</label><select class="select" id="crm-bpp">${personOptions(owner, '', 'No point person')}</select><p class="fld-hint">The point person keeps in touch with them and sees them in their follow-ups.</p>`,
          actions: [{ label: 'Cancel' }, { label: 'Assign', primary: true, onClick: (m) => {
            const v = m.body.querySelector('#crm-bpp').value || null;
            C.bulkPeople(ids, () => ({ pointPersonId: v }));
            const who = v ? C.person(v).name : 'nobody';
            ctx.toast(v ? `${who} is now the point person for ${plural(n, 'person', 'people')}.` : `Cleared the point person for ${plural(n, 'person', 'people')}.`, 'ok');
            M.sel.clear(); renderResults();
          } }],
        });
      } else if (kind === 'share') {
        const camps = C.campaignOwners();
        if (!camps.length) { ctx.toast('No campaigns are set up yet. Launch one in Campaign-in-a-Box first.', 'warn'); return; }
        App.modal({
          title: `Share ${plural(n, 'person', 'people')} with a campaign`,
          html: `<p>The county party and each candidate's campaign committee are separate organizations, so their supporter records stay apart. Sharing copies these people into the campaign's own records.</p>
            <p>Every share is logged with your name, the date and your note. The copies belong to the campaign from then on, and nothing syncs back.</p>
            <label class="fld-label" for="crm-sc">Campaign</label><select class="select" id="crm-sc">${camps.map((c) => `<option value="${esc(c.owner)}">${esc(c.name)}${c.office ? ', ' + esc(c.office) : ''}</option>`).join('')}</select>
            <label class="fld-label" for="crm-sn" style="margin-top:12px">Note for the log</label><input class="input" id="crm-sn" placeholder="For example, volunteers who asked to help in Trustee Area 3">`,
          actions: [{ label: 'Cancel' }, { label: `Share ${plural(n, 'person', 'people')}`, primary: true, onClick: (m) => {
            const to = m.body.querySelector('#crm-sc').value;
            const note = m.body.querySelector('#crm-sn').value.trim();
            const r = C.share(owner, to, ids, note);
            ctx.toast(`Shared ${plural(r ? r.copied : 0, 'person', 'people')} with ${C.ownerLabel(to)}. The share is in the log.`, 'ok');
            M.sel.clear(); renderResults();
          } }],
        });
      }
    }

    function saveListModal() {
      const f = currentFilter();
      const n = C.people(owner, f).length;
      App.modal({
        title: 'Save as list',
        html: `<p>${esc(filterSummary(f))} Right now that's ${plural(n, 'person', 'people')}. The list updates itself as people change.</p>
          <label class="fld-label" for="crm-ln">List name</label><input class="input" id="crm-ln" placeholder="For example, Strong supporters in Sunnyvale" maxlength="80">`,
        actions: [{ label: 'Cancel' }, { label: 'Save list', primary: true, onClick: (m) => {
          const name = m.body.querySelector('#crm-ln').value.trim();
          if (!name) { ctx.toast('Give the list a name.', 'warn'); m.body.querySelector('#crm-ln').focus(); return false; }
          const clean = {}; Object.keys(f).forEach((k) => { const v = f[k]; if (v != null && v !== '' && !(Array.isArray(v) && !v.length)) clean[k] = v; });
          C.saveList({ owner, name, filter: clean, createdBy: ctx.user ? ctx.user.id : null });
          ctx.toast(`Saved "${name}" with ${plural(n, 'person', 'people')}.`, 'ok');
        } }],
      });
      setTimeout(() => { const i = document.getElementById('crm-ln'); if (i) i.focus(); }, 60);
    }

    function addPersonModal() {
      const z = Object.keys(C.people(owner).reduce((m, p) => { if (p.city) m[p.city] = 1; return m; }, {})).sort();
      const m = App.modal({
        title: 'Add a person',
        html: `<form id="crm-ap" novalidate>
          <div class="grid-2" style="gap:10px 12px"><div><label class="fld-label" for="ap-f">First name</label><input class="input" id="ap-f" required autocomplete="off"></div>
          <div><label class="fld-label" for="ap-l">Last name</label><input class="input" id="ap-l" autocomplete="off"></div>
          <div><label class="fld-label" for="ap-e">Email</label><input class="input" id="ap-e" type="email" autocomplete="off"></div>
          <div><label class="fld-label" for="ap-p">Mobile phone</label><input class="input" id="ap-p" type="tel" autocomplete="off"></div>
          <div><label class="fld-label" for="ap-c">City</label><input class="input" id="ap-c" list="ap-cl" autocomplete="off"><datalist id="ap-cl">${z.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
          <div><label class="fld-label" for="ap-z">ZIP code</label><input class="input" id="ap-z" inputmode="numeric" maxlength="10" autocomplete="off"></div></div>
          <label class="toggle" style="margin-top:12px"><input type="checkbox" id="ap-eo" checked> They asked for email updates</label>
          <p class="fld-hint">Turn on texts from their profile once they say yes to texts. We check for an existing record with the same email or phone first.</p>
          <p class="fld-error" id="ap-err" role="alert"></p></form>`,
        actions: [{ label: 'Cancel' }, { label: 'Add person', primary: true, onClick: (mm) => {
          const b = mm.body;
          const v = (id) => b.querySelector(id).value.trim();
          const err = b.querySelector('#ap-err');
          if (!v('#ap-f')) { err.textContent = 'Enter a first name.'; b.querySelector('#ap-f').focus(); return false; }
          if (v('#ap-e') && App.auth.validate && App.auth.validate.email(v('#ap-e'))) { err.textContent = App.auth.validate.email(v('#ap-e')); return false; }
          if (v('#ap-p') && !C.util.normPhone(v('#ap-p'))) { err.textContent = 'Enter a 10-digit phone number, like (408) 555-0142.'; return false; }
          const r = C.upsertPerson({ owner, firstName: v('#ap-f'), lastName: v('#ap-l'), email: v('#ap-e'), phone: v('#ap-p'), city: v('#ap-c'), zip: v('#ap-z'), emailOptIn: b.querySelector('#ap-eo').checked && !!v('#ap-e'), source: 'Added by hand', roles: ['supporter'] });
          C.addInteraction({ personId: r.person.id, type: 'note', summary: r.created ? 'Added by hand.' : 'Matched this record when someone tried to add them again.' });
          ctx.toast(r.created ? `Added ${r.person.name}.` : `${r.person.name} was already here, so we updated that record.`, 'ok');
          openProfile(r.person.id);
        } }],
      });
      setTimeout(() => { const i = m.body.querySelector('#ap-f'); if (i) i.focus(); }, 60);
      m.body.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const b = m.el.querySelector('.modal-foot .btn-primary'); if (b) b.click(); });
    }

    function exportCsv() {
      const rows = M.sel.size ? C.people(owner).filter((p) => M.sel.has(p.id)) : (section === 'people' ? lastRows : C.people(owner));
      const name = `${ctx.tenantSlug || 'county'}-${isCamp ? C.ownerSlug(owner) + '-' : ''}people-${C.util.isoDay(Date.now())}.csv`;
      C.download(name, C.peopleCsv(rows));
      ctx.toast(`Downloaded ${plural(rows.length, 'person', 'people')} as ${name}.`, 'ok');
    }

    /* =================== PROFILE =================== */
    let pushed = false;
    function openProfile(id, opts) {
      const p = C.person(id);
      if (!p) { ctx.toast('That person is no longer in your records. They may have been merged.', 'warn'); return; }
      const wasOpen = !!openPerson;
      openPerson = id;
      renderProfile(false);
      drawer.classList.add('open');
      page.querySelectorAll('tr.is-open').forEach((r) => r.classList.remove('is-open'));
      const row = page.querySelector(`tr[data-open="${CSS.escape(id)}"]`); if (row) row.classList.add('is-open');
      const target = href(id);
      if (!(opts && opts.noHistory) && location.hash !== target) {
        try {
          if (wasOpen && pushed) history.replaceState({ crm: 1 }, '', target);
          else { history.pushState({ crm: 1 }, '', target); pushed = true; }
        } catch (e) { /* ignore */ }
      }
      setTimeout(() => { const h = drawer.querySelector('.crm-dbar [data-act="close-pf"]'); if (h && !(opts && opts.keepFocus)) h.focus({ preventScroll: true }); }, 30);
    }
    function closeProfile() {
      if (!openPerson) return;
      openPerson = null;
      drawer.classList.remove('open');
      page.querySelectorAll('tr.is-open').forEach((r) => r.classList.remove('is-open'));
      try { history.replaceState(null, '', base); } catch (e) { /* ignore */ }
      pushed = false;
    }
    function renderProfile(keepScroll) {
      const p = C.person(openPerson);
      const bar = drawer.querySelector('.crm-dbar');
      const body = drawer.querySelector('.crm-dbody');
      if (!p) { closeProfile(); return; }
      const st = keepScroll ? body.scrollTop : 0;
      const idx = lastRows.findIndex((x) => x.id === p.id);
      const prev = idx > 0 ? lastRows[idx - 1] : null, next = idx >= 0 && idx < lastRows.length - 1 ? lastRows[idx + 1] : null;
      bar.innerHTML = `<button class="crm-ibtn" data-act="close-pf" aria-label="${isPhone() ? 'Back to people' : 'Close profile'}">${isPhone() ? IC.back : IC.x}</button>
        <span class="small muted">${idx >= 0 ? `${U.fmtNum(idx + 1)} of ${U.fmtNum(lastRows.length)}` : ''}</span><span class="sp"></span>
        <button class="crm-ibtn" data-act="pf-prev" aria-label="Previous person"${prev ? '' : ' disabled'}><span style="display:inline-flex;transform:rotate(90deg)">${IC.chev}</span></button>
        <button class="crm-ibtn" data-act="pf-next" aria-label="Next person"${next ? '' : ' disabled'}><span style="display:inline-flex;transform:rotate(-90deg)">${IC.chev}</span></button>`;
      const logT = body.querySelector('#crm-log-t');
      const keepLog = keepScroll && logT ? logT.value : '';
      body.innerHTML = profileHtml(p);
      if (keepLog) { const t = body.querySelector('#crm-log-t'); if (t) t.value = keepLog; }
      body.scrollTop = st;
    }
    function profileHtml(p) {
      const S = C.SUPPORT;
      const dups = canEdit ? C.duplicatesOf(p.id) : [];
      const warn = C.donorWarning(p.id);
      const pp = p.pointPersonId ? C.person(p.pointPersonId) : null;
      const tl = C.timeline(p.id);
      const ents = C.entriesFor(p.id).filter((e) => e.status !== 'dropped');
      const tks = C.tasks(owner, { personId: p.id });
      const fmtP = C.util.fmtPhone;
      const alerts = [];
      if (p.doNotContact) alerts.push(`<div class="crm-alert danger">${IC.warn}<div><p><b>Do not contact.</b> ${esc(p.firstName || 'This person')} asked not to be contacted. Broadcasts and phone banks skip them.</p></div></div>`);
      dups.slice(0, 2).forEach((d) => alerts.push(`<div class="crm-alert info">${IC.merge}<div><p><b>Possible duplicate:</b> ${esc(d.person.name)} has ${esc(d.reason)}${d.person.source ? ` and came from ${esc(d.person.source.toLowerCase())}` : ''}.</p>
        <div class="row"><button class="btn btn-sm btn-primary" data-act="merge" data-id="${esc(d.person.id)}">Merge into this record</button><button class="btn btn-sm" data-act="open" data-id="${esc(d.person.id)}">View ${esc(d.person.firstName || 'record')}</button><button class="btn btn-sm btn-ghost" data-act="not-dup" data-id="${esc(d.person.id)}">Not the same person</button></div></div></div>`));
      if (warn) alerts.push(`<div class="crm-alert warn">${IC.warn}<div><p><b>${warn.over ? 'Over' : 'Close to'} the donor limit.</b> Gifts from ${esc(p.firstName || 'this donor')} total ${U.fmtUsd(warn.total)} this cycle. Your treasurer set the per-election limit at ${U.fmtUsd(warn.limit)}${warn.over ? ', so check with the treasurer before accepting more' : ''}.</p></div></div>`);
      const roleLabel = (p.roles || []).map((r) => C.ROLE_LABEL[r]).filter(Boolean).join(', ');
      const quick = [];
      if (p.phone && !p.doNotContact) quick.push(`<a class="btn btn-sm" href="tel:+1${esc(p.phone)}">${IC.phone} Call</a>`);
      if (p.phone && p.smsOptIn && !p.doNotContact) quick.push(`<a class="btn btn-sm" href="sms:+1${esc(p.phone)}">${IC.chat} Text</a>`);
      if (p.email && !p.doNotContact) quick.push(`<a class="btn btn-sm" href="mailto:${esc(p.email)}">${IC.mail} Email</a>`);
      const supp = canEdit
        ? `<div class="crm-supp" role="group" aria-label="Support score">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-act="support" data-v="${n}" aria-pressed="${p.support === n}" aria-label="${n}: ${S[n]}">${n}<small>${S[n]}</small></button>`).join('')}</div>`
        : `<div>${supportMeter(p.support)}</div>`;
      const team = C.team(owner);
      const months = {};
      const tlHtml = tl.length ? `<ol class="crm-tl">${tl.map((x) => {
        const mo = new Date(x.at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const head = months[mo] ? '' : `<li class="mo" aria-hidden="true">${esc(mo)}</li>`;
        months[mo] = 1;
        return head + `<li class="t-${esc(x.type)}"><span class="ic" title="${esc(C.TYPES[x.type] || x.type)}">${TYPE_IC[x.type] || IC.note}</span><div class="b"><p>${x.direction === 'in' ? '<b>Inbound text.</b> ' : ''}${esc(x.summary)}</p><small>${esc(C.TYPES[x.type] || x.type)} · ${esc(x.by || '')} · ${esc(fmtDate(x.at, { year: 'numeric' }))}</small></div></li>`;
      }).join('')}</ol>` : '<p class="muted small">Nothing yet. Calls, emails, RSVPs and gifts show here as they happen.</p>';
      const LOG = [['call', 'Call', IC.phone], ['email', 'Email', IC.mail], ['text', 'Text', IC.chat], ['note', 'Note', IC.note], ['meeting', 'Meeting', IC.meet]];
      const lt = M.logType;
      const allTags = Array.from(new Set(C.people(owner).flatMap((x) => x.tags || []))).filter((t) => !isSysTag(t)).sort().slice(0, 200);
      return `<div class="crm-pf">
        <header class="crm-pf-head">${U.avatar(p.name, 56)}<div style="min-width:0"><h2>${esc(p.name || 'No name')}${sampleMark(p)}</h2>
          <div class="sub">${esc([roleLabel, [p.city, p.zip].filter(Boolean).join(' '), p.party].filter(Boolean).join(' · '))}</div></div></header>
        ${quick.length ? `<div class="crm-pf-quick">${quick.join('')}</div>` : ''}
        ${alerts.join('')}
        <section class="crm-pf-sec"><h3>Support</h3>${supp}</section>
        <section class="crm-pf-sec"><h3>Contact<span class="sp"></span>${canEdit ? '<button class="btn btn-sm btn-ghost" data-act="edit-contact">Edit details</button>' : ''}</h3>
          <div data-contact><dl class="crm-dl">
            <dt>Email</dt><dd>${p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '<span class="muted">None on file</span>'}</dd>
            <dt>Mobile</dt><dd>${p.phone ? `<a href="tel:+1${esc(p.phone)}">${esc(fmtP(p.phone))}</a>` : '<span class="muted">None on file</span>'}</dd>
            ${p.address ? `<dt>Address</dt><dd>${esc(p.address)}${p.city ? ', ' + esc(p.city) : ''}</dd>` : `<dt>Place</dt><dd>${esc([p.city, p.zip].filter(Boolean).join(' ') || 'Not known')}</dd>`}
            ${p.precinct ? `<dt>Precinct</dt><dd>${esc(p.precinct)}</dd>` : ''}
            <dt>Source</dt><dd>${esc(p.source || 'Not recorded')}</dd>
            <dt>Added</dt><dd>${esc(fmtDate(p.createdAt, { year: 'numeric' }))}</dd>
          </dl></div>
          <div class="crm-toggles">
            <label><input type="checkbox" class="toggle" data-opt="emailOptIn"${p.emailOptIn ? ' checked' : ''}${canEdit && p.email && !p.doNotContact ? '' : ' disabled'}><span>Email updates<small>${p.email ? (p.emailOptIn ? 'Gets email broadcasts' : p.emailOptOutAt ? `Unsubscribed on ${esc(fmtDate(p.emailOptOutAt))}` : 'Not getting email') : 'Add an email address first'}</small></span></label>
            <label><input type="checkbox" class="toggle" data-opt="smsOptIn"${p.smsOptIn ? ' checked' : ''}${canEdit && p.phone && !p.doNotContact ? '' : ' disabled'}><span>Texts<small>${p.smsOptOutAt ? `Opted out on ${esc(fmtDate(p.smsOptOutAt))}. Turn back on only if they text START or ask you to.` : p.phone ? (p.smsOptIn ? 'Gets texts from 8 AM to 9 PM Pacific' : 'Turn on only after they say yes to texts') : 'Add a mobile number first'}</small></span></label>
            <label><input type="checkbox" class="toggle" data-opt="doNotContact"${p.doNotContact ? ' checked' : ''}${canEdit ? '' : ' disabled'}><span>Do not contact<small>Skips every broadcast, text and call</small></span></label>
          </div>
        </section>
        <section class="crm-pf-sec"><h3>Roles and tags</h3>
          ${canEdit ? `<div class="crm-rolepick" role="group" aria-label="Roles">${C.ROLES.map((r) => `<button type="button" data-act="role" data-v="${r}" aria-pressed="${(p.roles || []).indexOf(r) >= 0}">${esc(C.ROLE_LABEL[r])}</button>`).join('')}</div>` : `<div>${roleChips(p.roles, 7) || '<span class="muted small">No roles yet</span>'}</div>`}
          <div class="crm-tagedit" style="margin-top:10px">${(p.tags || []).map((t) => `<span class="crm-tag${isSysTag(t) ? ' sys' : ''}" title="${esc(t)}">${esc(tagText(t, false))}${canEdit ? `<button type="button" data-act="untag" data-v="${esc(t)}" aria-label="Remove tag ${esc(tagText(t, false))}">${IC.x}</button>` : ''}</span>`).join('') || (canEdit ? '' : '<span class="muted small">No tags yet</span>')}
            ${canEdit ? `<form data-form="tag"><input class="input" name="tag" placeholder="Add a tag" list="crm-tags-all" aria-label="Add a tag" autocomplete="off"><datalist id="crm-tags-all">${allTags.map((t) => `<option value="${esc(t)}">`).join('')}</datalist><button class="btn btn-sm" type="submit">Add</button></form>` : ''}</div>
        </section>
        <section class="crm-pf-sec"><h3>Point person</h3>
          ${canEdit ? `<select class="select" data-act="point" aria-label="Point person">${team.map((t) => `<option value="${esc(t.id)}"${t.id === p.pointPersonId ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}<option value=""${p.pointPersonId ? '' : ' selected'}>No point person</option></select>`
            : pp ? `<span class="crm-pp">${U.avatar(pp.name, 24)} ${esc(pp.name)}</span>` : '<span class="muted small">No point person yet</span>'}
        </section>
        ${canEdit ? `<section class="crm-pf-sec"><h3>Log what happened</h3>
          <form class="crm-log" data-form="log">
            <div class="crm-log-tabs" role="group" aria-label="Type">${LOG.map(([k, l, ic]) => `<button type="button" data-act="logtype" data-v="${k}" aria-pressed="${lt === k}">${ic}${l}</button>`).join('')}</div>
            <label class="sr-only" for="crm-log-t">What happened</label>
            <textarea class="textarea" id="crm-log-t" name="summary" placeholder="${esc({ call: 'Talked about the candidate forum. Wants a ride to the polls.', email: 'Sent the volunteer schedule for Saturday.', text: 'Texted the phone bank address.', note: 'Met at the farmers market. Interested in poll watching.', meeting: 'Coffee about running for school board in 2028.' }[lt])}"></textarea>
            <div class="row">${lt === 'call' ? `<select class="select" name="outcome" aria-label="Call outcome">${C.CALL_OUTCOMES.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select>` : ''}
              ${lt === 'text' ? '<label class="toggle small" style="min-height:40px"><input type="checkbox" name="inbound"> They texted us</label>' : ''}
              <span class="spacer"></span><button class="btn btn-primary btn-sm" type="submit">Save to timeline</button></div>
          </form></section>` : ''}
        <section class="crm-pf-sec"><h3>Paths${canEdit && C.paths(owner).length ? '<span class="sp"></span><button class="btn btn-sm btn-ghost" data-act="pf-addpath">Add to a path</button>' : ''}</h3>
          ${ents.length ? ents.map((e) => {
            const path = C.getPath(e.pathId); if (!path) return '';
            const i = path.steps.findIndex((s) => s.id === e.stepId);
            const done = e.status === 'done';
            const d = dueInfo(e.due);
            return `<div class="crm-pathrow"><div class="top"><b><a href="${esc(href('paths/' + path.id))}">${esc(path.name)}</a></b>${done ? '<span class="badge badge-ok">Finished</span>' : `<span class="crm-due ${d.cls}">${IC.clock}${esc(d.label)}</span>`}</div>
              <div class="crm-steps" aria-hidden="true">${path.steps.map((s, k) => `<i class="${done || k < i ? 'done' : k === i ? 'cur' : ''}"></i>`).join('')}</div>
              <div class="row" style="justify-content:space-between"><span class="small">${done ? 'Every step done' : `Step ${i + 1} of ${path.steps.length}: <b>${esc((path.steps[i] || {}).name || '')}</b>`}</span>
              ${canEdit && !done ? `<button class="btn btn-sm" data-act="advance" data-id="${esc(e.id)}">${i >= path.steps.length - 1 ? 'Mark finished' : 'Advance'}</button>` : ''}</div></div>`;
          }).join('') : '<p class="muted small">Not on a path yet.</p>'}
        </section>
        <section class="crm-pf-sec"><h3>Tasks</h3>
          ${tks.length ? tks.map((t) => taskRow(t, false)).join('') : '<p class="muted small" style="margin-bottom:6px">No follow-ups yet.</p>'}
          ${canEdit ? `<form class="crm-addtask" data-form="task"><input class="input" name="title" placeholder="Follow up about..." aria-label="New task" required><input class="input" type="date" name="due" value="${C.util.isoDay(Date.now() + 2 * 86400000)}" aria-label="Due date"><button class="btn btn-sm" type="submit">Add task</button></form>` : ''}
        </section>
        <section class="crm-pf-sec"><h3>Timeline</h3>${tlHtml}</section>
      </div>`;
    }
    function taskRow(t, showPerson) {
      const d = dueInfo(t.due);
      const per = showPerson && t.personId ? C.person(t.personId) : null;
      const asg = t.assigneeId ? C.person(t.assigneeId) : null;
      return `<div class="crm-task${t.done ? ' done' : ''}" data-task="${esc(t.id)}">
        <label class="crm-cb"><input type="checkbox" data-act="task-done" data-id="${esc(t.id)}"${t.done ? ' checked' : ''}${canEdit ? '' : ' disabled'} aria-label="Mark done: ${esc(t.title)}"></label>
        <div class="b"><span>${esc(t.title)}</span>${t.sample ? sampleMark(t) : ''}<small>${t.done ? '<span>Done</span>' : `<span class="crm-due ${d.cls}">${esc(d.label)}</span>`}
          ${per ? `<a href="${esc(href(per.id))}" data-open-link="${esc(per.id)}">${esc(per.name)}</a>` : ''}
          ${asg ? `<span>${esc(asg.name)}</span>` : ''}</small></div></div>`;
    }

    /* =================== LISTS =================== */
    function drawLists(sec) {
      const ls = C.lists(owner);
      if (!ls.length) {
        sec.innerHTML = emptyState({ art: ART.lists, title: 'No lists yet', body: 'A list is a saved search that stays current. Filter People by tag, support or place, then choose Save as list.', action: `<a class="btn btn-primary" href="${esc(href(''))}">Filter people</a>` });
        return;
      }
      sec.innerHTML = `<div class="crm-lists">${ls.map((l) => {
        const ppl = C.runList(l.id);
        const em = ppl.filter((p) => p.email && p.emailOptIn && !p.doNotContact).length;
        const sm = ppl.filter((p) => p.phone && p.smsOptIn && !p.doNotContact).length;
        const ph = ppl.filter((p) => p.phone && !p.doNotContact).length;
        return `<article class="crm-lcard">
          <div class="h"><h3>${esc(l.name)}</h3><div class="num">${U.fmtNum(ppl.length)}<small>${ppl.length === 1 ? 'person' : 'people'}</small></div></div>
          <p class="desc">${esc(filterSummary(l.filter || {}))}</p>
          <div class="reach"><span><b>${U.fmtNum(em)}</b> get email</span><span><b>${U.fmtNum(sm)}</b> get texts</span><span><b>${U.fmtNum(ph)}</b> can be called</span></div>
          <div class="acts">
            <button class="btn btn-sm" data-act="open-list" data-id="${esc(l.id)}">Open in People</button>
            ${canSend ? `<a class="btn btn-sm btn-ghost" href="${esc(outBase)}/compose?list=${esc(l.id)}&amp;channel=email">${IC.mail} Email</a><a class="btn btn-sm btn-ghost" href="${esc(outBase)}/compose?list=${esc(l.id)}&amp;channel=sms">${IC.chat} Text</a>` : ''}
            ${canEdit ? `<button class="crm-ibtn" data-act="list-menu" data-id="${esc(l.id)}" aria-label="More for ${esc(l.name)}" style="margin-left:auto">${IC.dots}</button>` : ''}
          </div></article>`;
      }).join('')}</div>`;
    }

    /* =================== PATHS =================== */
    const freshCards = new Set();
    function drawPaths(sec) {
      const ps = C.paths(owner);
      if (!ps.length) {
        sec.innerHTML = emptyState({ art: ART.path, title: 'No paths yet', body: 'A path is a set of steps you walk people through, like welcoming a new volunteer. Each step has an owner and a due date.', action: canEdit ? `<button class="btn btn-primary" data-act="new-path">${IC.plus} Create a path</button>` : '' });
        return;
      }
      const pid = (parts[0] === 'paths' && parts[1] && C.getPath(parts[1]) && !M.pathPicked) ? parts[1] : (M.pathId && C.getPath(M.pathId) ? M.pathId : ps[0].id);
      M.pathId = pid;
      const path = C.getPath(pid);
      const ents = C.pathEntries(pid, undefined, true);
      const active = ents.filter((e) => e.status === 'active');
      const done = ents.filter((e) => e.status === 'done').sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      const overdue = active.filter((e) => dueInfo(e.due).overdue).length;
      const fc = path.kind === 'future-candidates';
      const sugg = fc ? C.pathSuggestions(pid) : [];
      const team = C.team(owner);
      const cand = 'app.html#/candidate';
      sec.innerHTML = `
        <div class="crm-pathbar" role="navigation" aria-label="Paths">${ps.map((p) => `<a class="crm-pathpill" href="${esc(href('paths/' + p.id))}"${p.id === pid ? ' aria-current="page"' : ''}>${esc(p.name)}<span class="n">${U.fmtNum(C.pathEntries(p.id).length)}</span></a>`).join('')}
          ${canEdit ? `<button class="btn btn-sm btn-ghost" data-act="new-path">${IC.plus} New path</button>` : ''}</div>
        <div class="crm-pathhead"><div><h2>${esc(path.name)}</h2><p>${esc(path.goal || '')} ${plural(active.length, 'person', 'people')} on it now${overdue ? `, <b style="color:var(--danger)">${overdue} overdue</b>` : ''}.</p></div>
          ${canEdit ? `<div class="row"><button class="btn btn-sm" data-act="edit-path">Edit steps</button><button class="btn btn-sm btn-primary" data-act="path-add">${IC.plus} Add people</button></div>` : ''}</div>
        ${fc && sugg.length ? `<section class="crm-sugg" aria-labelledby="crm-sugg-h"><div class="h"><h3 id="crm-sugg-h">${plural(sugg.length, 'volunteer has', 'volunteers have')} put in 3 or more shifts or walks<p>Field work is a good sign someone could run. Add them to "${esc(path.steps[0].name)}" to start the conversation.</p></h3>
            <a class="btn btn-sm btn-ghost" href="${cand}">${IC.cap} Start in Campaign-in-a-Box</a></div>
          <ul>${sugg.slice(0, 12).map((x) => `<li>${U.avatar(x.person.name, 26)}<span><a href="${esc(href(x.person.id))}" data-open-link="${esc(x.person.id)}">${esc(x.person.name)}</a> <small>${x.shifts ? plural(x.shifts, 'shift') : ''}${x.shifts && x.walks ? ', ' : ''}${x.walks ? plural(x.walks, 'walk') : ''}</small></span>${canEdit ? `<button class="btn btn-sm" data-act="sugg-add" data-id="${esc(x.person.id)}">Add</button>` : ''}</li>`).join('')}</ul></section>` : ''}
        <div class="crm-steptabs" role="tablist" aria-label="Steps">${path.steps.map((s, i) => `<button type="button" role="tab" data-steptab="${i}" aria-selected="${i === 0}">${i + 1}. ${esc(s.name)}<span class="n">${active.filter((e) => e.stepId === s.id).length}</span></button>`).join('')}<button type="button" role="tab" data-steptab="${path.steps.length}" aria-selected="false">Finished<span class="n">${done.length}</span></button></div>
        <div class="crm-kan" data-kan data-tour="people-paths">${path.steps.map((s, i) => {
          const cards = active.filter((e) => e.stepId === s.id).sort((a, b) => String(a.due).localeCompare(String(b.due)));
          return `<section class="crm-col" data-step="${esc(s.id)}" aria-label="Step ${i + 1}: ${esc(s.name)}">
            <div class="crm-col-h"><div style="flex:1;min-width:0"><div class="step">STEP ${i + 1}</div><h3>${esc(s.name)}</h3></div><span class="n">${cards.length}</span></div>
            <div class="crm-col-own">${s.assigneeId ? U.avatar((C.person(s.assigneeId) || {}).name || '?', 22) : IC.user}${canEdit ? `<select class="select" data-act="step-owner" data-step="${esc(s.id)}" aria-label="Owner of ${esc(s.name)}">${team.map((t) => `<option value="${esc(t.id)}"${t.id === s.assigneeId ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}<option value=""${s.assigneeId ? '' : ' selected'}>No owner</option></select>` : `<span>${esc(((C.person(s.assigneeId) || {}).name) || 'No owner')}</span>`}</div>
            <div class="crm-col-b">${cards.map((e) => kanCard(e, path, i, fc && i === path.steps.length - 1)).join('') || `<div class="crm-col-empty">${i === 0 ? 'Add people to start.' : 'Nobody at this step.'}</div>`}</div>
          </section>`;
        }).join('')}
          <section class="crm-col fin" data-step="done" aria-label="Finished"><div class="crm-col-h"><div style="flex:1"><div class="step">DONE</div><h3>Finished</h3></div><span class="n">${done.length}</span></div>
            <div class="crm-col-b">${done.slice(0, 6).map((e) => { const p = C.person(e.personId); return p ? `<div class="crm-kc">${U.avatar(p.name, 28)}<div class="b"><b>${esc(p.name)}</b><small class="muted">${esc(fmtDate(e.updatedAt))}</small></div></div>` : ''; }).join('') || `<div class="crm-col-empty">${canEdit ? 'Drag someone here when the last step is done.' : 'Nobody has finished yet.'}</div>`}
            ${done.length > 6 ? `<p class="small muted" style="text-align:center;margin:0">and ${done.length - 6} more</p>` : ''}</div></section>
        </div>`;
      wireScroller(sec.querySelector('[data-kan]'));
    }
    function kanCard(e, path, i, last) {
      const p = C.person(e.personId);
      if (!p) return '';
      const d = dueInfo(e.due);
      const s = path.steps[i];
      const asg = s.assigneeId ? C.person(s.assigneeId) : null;
      return `<div class="crm-kc${freshCards.has(e.id) ? ' is-new' : ''}" data-entry="${esc(e.id)}" ${canEdit ? 'data-drag' : ''}>
        ${canEdit ? `<span class="crm-grip" aria-hidden="true">${IC.grip}</span>` : ''}
        ${U.avatar(p.name, 30)}
        <div class="b"><b><a href="${esc(href(p.id))}" data-open-link="${esc(p.id)}" draggable="false" style="color:inherit;text-decoration:none">${esc(p.name)}</a></b>
          <small><span class="crm-due ${d.cls}">${d.overdue ? IC.warn : IC.clock}${esc(d.label)}</span>${asg ? `<span title="Step owner: ${esc(asg.name)}">${U.avatar(asg.name, 18)}</span>` : ''}</small>
          ${last ? `<small><a class="cta" href="app.html#/candidate">${IC.cap} Start in Campaign-in-a-Box</a></small>` : ''}</div>
        ${canEdit ? `<button class="crm-ibtn" data-act="card-menu" data-id="${esc(e.id)}" aria-label="Move ${esc(p.name)}">${IC.dots}</button>` : ''}
      </div>`;
    }
    function moveEntry(entryId, stepId) {
      const e = C.getEntry(entryId);
      if (!e || (e.stepId === stepId && stepId !== 'done')) return;
      const p = C.person(e.personId);
      const path = C.getPath(e.pathId);
      freshCards.clear(); freshCards.add(entryId);
      C.advance(entryId, stepId);
      const st = stepId === 'done' ? null : path.steps.find((s) => s.id === stepId);
      ctx.toast(st ? `${p ? p.name : 'They'} moved to "${st.name}".` : `${p ? p.name : 'They'} finished "${path.name}".`, 'ok');
      setTimeout(() => freshCards.clear(), 800);
    }

    /* drag and drop on the kanban (pointer events: mouse anywhere on the card, touch on the grip) */
    el.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.crm-kc[data-drag]');
      if (!card || e.button > 0 || e.target.closest('button, select')) return;
      if (e.pointerType !== 'mouse' && !e.target.closest('.crm-grip')) return;
      drag = { card, id: card.dataset.entry, x: e.clientX, y: e.clientY, started: false, pointerId: e.pointerId };
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      if (!drag.started) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
        drag.started = true;
        const r = drag.card.getBoundingClientRect();
        drag.dx = e.clientX - r.left; drag.dy = e.clientY - r.top;
        drag.ghost = document.createElement('div');
        drag.ghost.className = 'crm crm-ghost';
        drag.ghost.appendChild(drag.card.cloneNode(true));
        drag.ghost.style.width = r.width + 'px';
        document.body.appendChild(drag.ghost);
        drag.card.classList.add('dragging');
        try { drag.card.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
      e.preventDefault();
      drag.ghost.style.left = (e.clientX - drag.dx) + 'px';
      drag.ghost.style.top = (e.clientY - drag.dy) + 'px';
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const col = under && under.closest('.crm-col');
      page.querySelectorAll('.crm-col.drop').forEach((c) => { if (c !== col) c.classList.remove('drop'); });
      if (col) col.classList.add('drop');
      drag.col = col;
      const kan = page.querySelector('[data-kan]');
      if (kan) { const kr = kan.getBoundingClientRect(); if (e.clientX > kr.right - 40) kan.scrollLeft += 12; else if (e.clientX < kr.left + 40) kan.scrollLeft -= 12; }
    });
    function endDrag(e) {
      if (!drag) return;
      const d = drag; drag = null;
      if (!d.started) return;
      e.preventDefault();
      d.ghost.remove();
      d.card.classList.remove('dragging');
      page.querySelectorAll('.crm-col.drop').forEach((c) => c.classList.remove('drop'));
      if (d.col && d.col.dataset.step) moveEntry(d.id, d.col.dataset.step);
      el.addEventListener('click', (ev) => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
    }
    el.addEventListener('pointerup', endDrag);
    // Links and avatars inside a card would start the browser's own drag and cancel ours.
    el.addEventListener('dragstart', (e) => { if (e.target && e.target.closest && e.target.closest('.crm-kc')) e.preventDefault(); });
    el.addEventListener('pointercancel', () => { if (drag && drag.started) { drag.ghost.remove(); drag.card.classList.remove('dragging'); page.querySelectorAll('.crm-col.drop').forEach((c) => c.classList.remove('drop')); } drag = null; });

    function pathEditor(path) {
      const steps = path ? path.steps.map((s) => s.name) : ['', '', ''];
      const m = App.modal({
        title: path ? `Edit "${path.name}"` : 'Create a path',
        html: `<label class="fld-label" for="pe-n">Name</label><input class="input" id="pe-n" value="${esc(path ? path.name : '')}" placeholder="For example, Precinct captain onboarding">
          <label class="fld-label" for="pe-g" style="margin-top:12px">Goal</label><input class="input" id="pe-g" value="${esc(path ? path.goal : '')}" placeholder="What finishing this path means">
          <p class="fld-label" style="margin:14px 0 6px">Steps, in order</p><div data-steps style="display:flex;flex-direction:column;gap:6px">${steps.map((s, i) => `<input class="input" data-stepname value="${esc(s)}" placeholder="Step ${i + 1}" aria-label="Step ${i + 1}">`).join('')}</div>
          <button type="button" class="btn btn-sm btn-ghost" data-addstep style="margin-top:6px">${IC.plus} Add a step</button>
          ${path ? '<p class="fld-hint">Renaming a step keeps everyone on it. Removing a step moves its people to the last step that remains.</p>' : ''}`,
        actions: (path && !path.kind ? [{ label: 'Delete path', onClick: () => { confirmModal({ title: `Delete "${path.name}"?`, html: `<p>This takes ${plural(C.pathEntries(path.id).length, 'person', 'people')} off the path. Their timelines keep the history.</p>`, ok: 'Delete path', onOk: () => { C.removePath(path.id); M.pathId = null; ctx.toast(`Deleted "${path.name}".`, 'info'); go('paths'); } }); } }] : [])
          .concat([{ label: 'Cancel' }, { label: path ? 'Save path' : 'Create path', primary: true, onClick: (mm) => {
            const name = mm.body.querySelector('#pe-n').value.trim();
            const names = Array.from(mm.body.querySelectorAll('[data-stepname]')).map((i) => i.value.trim()).filter(Boolean);
            if (!name) { ctx.toast('Give the path a name.', 'warn'); return false; }
            if (names.length < 2) { ctx.toast('A path needs at least two steps.', 'warn'); return false; }
            const old = path ? path.steps : [];
            const st = names.map((n, i) => Object.assign({}, old[i] || {}, { name: n }));
            const saved = C.savePath({ id: path ? path.id : undefined, owner, name, goal: mm.body.querySelector('#pe-g').value.trim(), steps: st });
            if (path && old.length > st.length) {
              const keep = saved.steps[saved.steps.length - 1];
              C.pathEntries(path.id).forEach((e) => { if (!saved.steps.some((s) => s.id === e.stepId)) C.advance(e.id, keep.id); });
            }
            M.pathId = saved.id;
            ctx.toast(path ? `Saved "${name}".` : `Created "${name}". Add people to get it moving.`, 'ok');
            if (!path) go('paths/' + saved.id);
          } }]),
      });
      m.body.querySelector('[data-addstep]').addEventListener('click', () => {
        const box = m.body.querySelector('[data-steps]');
        const n = box.children.length + 1;
        box.insertAdjacentHTML('beforeend', `<input class="input" data-stepname placeholder="Step ${n}" aria-label="Step ${n}">`);
        box.lastElementChild.focus();
      });
    }
    function pathAddModal(path) {
      const ls = C.lists(owner);
      if (!ls.length) { ctx.toast('Save a list first, then add it here.', 'warn'); return; }
      App.modal({
        title: `Add people to "${path.name}"`,
        html: `<label class="fld-label" for="pa-l">From a saved list</label><select class="select" id="pa-l">${ls.map((l) => `<option value="${esc(l.id)}">${esc(l.name)} (${U.fmtNum(C.runList(l.id).length)})</option>`).join('')}</select>
          <label class="fld-label" for="pa-s" style="margin-top:12px">Starting step</label><select class="select" id="pa-s">${path.steps.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select>
          <p class="fld-hint">To add a few people by hand, select them on the People tab and choose Add to path.</p>`,
        actions: [{ label: 'Cancel' }, { label: 'Add people', primary: true, onClick: (m) => {
          const lid = m.body.querySelector('#pa-l').value;
          const ids = C.runList(lid).map((p) => p.id);
          const added = C.enter(path.id, ids, undefined, { stepId: m.body.querySelector('#pa-s').value });
          added.forEach((e) => freshCards.add(e.id));
          ctx.toast(added.length ? `Added ${plural(added.length, 'person', 'people')} to "${path.name}".` : 'Everyone on that list is already on this path.', added.length ? 'ok' : 'info');
          setTimeout(() => freshCards.clear(), 900);
        } }],
      });
    }

    /* =================== TASKS =================== */
    function drawTasks(sec) {
      const mine = C.me(owner);
      const showMine = M.taskMine && !!mine;
      const all = C.tasks(owner, showMine ? { assigneeId: mine.id } : {});
      const open = all.filter((t) => !t.done);
      const today = C.util.isoDay(Date.now());
      const wk = C.util.isoDay(Date.now() + 7 * 86400000);
      const groups = [
        ['over', 'Overdue', open.filter((t) => t.due && t.due < today)],
        ['today', 'Today', open.filter((t) => t.due === today)],
        ['week', 'This week', open.filter((t) => t.due > today && t.due <= wk)],
        ['later', 'Later', open.filter((t) => !t.due || t.due > wk)],
      ].filter((g) => g[2].length);
      const done = all.filter((t) => t.done).slice(0, 8);
      const team = C.team(owner);
      const names = C.people(owner).map((p) => p.name);
      sec.innerHTML = `
        <div class="row" style="margin-bottom:14px;justify-content:space-between">
          ${mine ? `<div class="crm-seg" role="group" aria-label="Whose tasks"><button type="button" data-act="tmine" data-v="1" aria-pressed="${showMine}">Mine</button><button type="button" data-act="tmine" data-v="0" aria-pressed="${!showMine}">Everyone's</button></div>` : '<span class="small muted">Everyone\'s follow-ups</span>'}
          <span class="small muted">${plural(open.length, 'open task')}</span></div>
        ${canEdit ? `<form class="crm-addtask crm-tbox" data-form="task-page" style="padding:10px;margin-bottom:18px">
          <input class="input" name="title" placeholder="Add a follow-up, like Call Maria about poll watching" aria-label="Task" required>
          <input class="input" name="person" list="crm-names" placeholder="About (optional)" aria-label="About which person" style="flex:1 1 160px"><datalist id="crm-names">${names.slice(0, 400).map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
          <input class="input" type="date" name="due" value="${C.util.isoDay(Date.now() + 86400000)}" aria-label="Due date">
          <select class="select" name="assignee" aria-label="Assign to" style="flex:0 1 200px">${team.map((t) => `<option value="${esc(t.id)}"${mine && t.id === mine.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
          <button class="btn btn-primary" type="submit">Add task</button></form>` : ''}
        ${groups.length ? groups.map(([k, l, ts]) => `<div class="crm-tgroup ${k}"><h3>${k === 'over' ? IC.warn : ''}${l}<span style="font-weight:600">${ts.length}</span></h3><div class="crm-tbox">${ts.map((t) => taskRow(t, true)).join('')}</div></div>`).join('')
          : emptyState({ art: ART.tasks, title: showMine ? 'You\'re caught up' : 'No open follow-ups', body: showMine ? 'Nothing is waiting on you. Tasks you add from a profile or a path land here.' : 'Add a task above, or from anyone\'s profile.' })}
        ${done.length ? `<div class="crm-tgroup" style="margin-top:18px"><h3>Done recently</h3><div class="crm-tbox">${done.map((t) => taskRow(t, true)).join('')}</div></div>` : ''}`;
    }

    /* =================== events =================== */
    /* The drawer sits on <body>, so it gets the same handlers as the screen. */
    function both(type, fn) { el.addEventListener(type, fn); drawer.addEventListener(type, fn); }
    both('input', (e) => {
      if (e.target.matches('[data-q]')) {
        M.q = e.target.value;
        M.shown = 150;
        renderResults();
        refreshChipsKeep();
      }
    });
    both('change', (e) => {
      const t = e.target;
      if (t.matches('[data-sel]')) {
        if (t.checked) M.sel.add(t.dataset.sel); else M.sel.delete(t.dataset.sel);
        const row = t.closest('tr, .crm-card'); if (row) row.classList.toggle('is-sel', t.checked);
        const all = page.querySelector('[data-selall]');
        if (all) all.checked = lastRows.slice(0, M.shown).every((p) => M.sel.has(p.id));
        drawBulk();
        return;
      }
      if (t.matches('[data-selall]')) {
        lastRows.slice(0, M.shown).forEach((p) => { if (t.checked) M.sel.add(p.id); else M.sel.delete(p.id); });
        renderResults();
        return;
      }
      if (t.matches('[data-opt]') && openPerson) {
        const k = t.dataset.opt;
        const patch = { [k]: t.checked };
        const p = C.person(openPerson);
        if (k === 'doNotContact' && t.checked) { patch.emailOptIn = false; patch.smsOptIn = false; }
        if (k === 'smsOptIn' && t.checked) patch.smsOptOutAt = null;
        if (k === 'emailOptIn') patch.emailOptOutAt = t.checked ? null : new Date().toISOString();
        C.setField(openPerson, patch);
        C.addInteraction({ personId: openPerson, type: 'note', summary: { emailOptIn: t.checked ? 'Turned on email updates.' : 'Turned off email updates.', smsOptIn: t.checked ? 'Turned on texts.' : 'Turned off texts.', doNotContact: t.checked ? 'Marked do not contact.' : 'Removed do not contact.' }[k] });
        ctx.toast(`${p.firstName || p.name}: ${{ emailOptIn: t.checked ? 'email updates on' : 'email updates off', smsOptIn: t.checked ? 'texts on' : 'texts off', doNotContact: t.checked ? 'marked do not contact' : 'can be contacted again' }[k]}.`, 'ok');
        return;
      }
      if (t.matches('[data-act="point"]') && openPerson) {
        const v = t.value || null;
        C.setField(openPerson, { pointPersonId: v });
        ctx.toast(v ? `${C.person(v).name} is now the point person.` : 'Cleared the point person.', 'ok');
        return;
      }
      if (t.matches('[data-act="step-owner"]')) {
        const path = C.getPath(M.pathId);
        if (!path) return;
        C.savePath(Object.assign({}, path, { steps: path.steps.map((s) => (s.id === t.dataset.step ? Object.assign({}, s, { assigneeId: t.value || null }) : s)) }));
        ctx.toast(t.value ? `${C.person(t.value).name} owns this step now.` : 'This step has no owner now.', 'ok');
        return;
      }
      if (t.matches('[data-act="task-done"]')) {
        const isDone = t.checked;
        const task = C.tasks(owner).find((x) => x.id === t.dataset.id);
        const row = t.closest('.crm-task');
        if (row) row.classList.toggle('done', isDone);
        setTimeout(() => {
          C.updateTask(t.dataset.id, { done: isDone, doneAt: isDone ? new Date().toISOString() : null });
          if (isDone && task && task.personId) C.addInteraction({ personId: task.personId, type: 'note', summary: `Finished the task "${task.title}".` });
        }, reduceMotion() ? 0 : 220);
        if (isDone) ctx.toast('Task done.', 'ok', { duration: 1800 });
      }
    });
    both('submit', (e) => {
      const f = e.target;
      e.preventDefault();
      if (f.dataset.form === 'tag' && openPerson) {
        const v = f.tag.value.trim(); if (!v) return;
        const p = C.person(openPerson);
        if ((p.tags || []).indexOf(v) < 0) C.setField(openPerson, { tags: (p.tags || []).concat([v]) });
        setTimeout(() => { const i = drawer.querySelector('[data-form="tag"] input'); if (i) i.focus(); }, 40);
      } else if (f.dataset.form === 'log' && openPerson) {
        const summary = f.summary.value.trim();
        if (!summary) { ctx.toast('Write a line about what happened first.', 'warn'); f.summary.focus(); return; }
        const type = M.logType;
        f.summary.value = '';
        if (type === 'text' && f.inbound && f.inbound.checked) {
          const r = C.inboundText(openPerson, summary);
          ctx.toast(r && r.stopped ? 'They replied STOP, so texts are off for them now.' : 'Saved their text to the timeline.', r && r.stopped ? 'warn' : 'ok');
        } else {
          const outcome = f.outcome ? f.outcome.value : undefined;
          C.addInteraction({ personId: openPerson, type, summary, outcome });
          if (outcome === 'do_not_call') C.setField(openPerson, { doNotContact: true, smsOptIn: false });
          ctx.toast(`${C.TYPES[type]} saved to ${C.person(openPerson).firstName || 'their'}'s timeline.`, 'ok');
        }
      } else if (f.dataset.form === 'task' && openPerson) {
        const title = f.title.value.trim(); if (!title) return;
        const mine = C.me(owner);
        const p = C.person(openPerson);
        C.addTask({ owner, personId: openPerson, title, due: f.due.value, assigneeId: (mine && mine.id) || p.pointPersonId || null });
        ctx.toast('Task added to your follow-ups.', 'ok');
      } else if (f.dataset.form === 'task-page') {
        const title = f.title.value.trim(); if (!title) { f.title.focus(); return; }
        const who = f.person.value.trim().toLowerCase();
        const per = who ? C.people(owner).find((p) => p.name.toLowerCase() === who) : null;
        if (who && !per) { ctx.toast('Pick a name from the list, or leave "About" empty.', 'warn'); f.person.focus(); return; }
        C.addTask({ owner, personId: per ? per.id : null, title, due: f.due.value, assigneeId: f.assignee.value || null });
        ctx.toast('Task added.', 'ok');
      } else if (f.dataset.form === 'contact' && openPerson) {
        const v = (n) => f[n].value.trim();
        if (v('email') && App.auth.validate && App.auth.validate.email(v('email'))) { ctx.toast(App.auth.validate.email(v('email')), 'warn'); return; }
        if (v('phone') && !C.util.normPhone(v('phone'))) { ctx.toast('Enter a 10-digit phone number, like (408) 555-0142.', 'warn'); return; }
        C.setField(openPerson, { firstName: v('firstName'), lastName: v('lastName'), email: v('email'), phone: v('phone'), city: v('city'), zip: v('zip') });
        ctx.toast('Contact details saved.', 'ok');
      }
    });
    both('click', (e) => {
      const stop = e.target.closest('[data-stop]');
      const a = e.target.closest('[data-act]');
      const link = e.target.closest('[data-open-link]');
      if (link && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openProfile(link.dataset.openLink); return; }
      const fchip = e.target.closest('[data-filter]');
      if (fchip) { openPop(fchip); return; }
      const st = e.target.closest('[data-steptab]');
      if (st) {
        const kan = page.querySelector('[data-kan]');
        if (kan) kan.scrollTo({ left: Number(st.dataset.steptab) * kan.clientWidth + Number(st.dataset.steptab) * 16, behavior: reduceMotion() ? 'auto' : 'smooth' });
        return;
      }
      const pill = e.target.closest('.crm-pathpill');
      if (pill) { M.pathPicked = false; }
      if (!a) {
        const row = !stop && e.target.closest('[data-open]');
        if (row && !e.target.closest('input,label,a,button')) openProfile(row.dataset.open);
        return;
      }
      if (a.tagName === 'SELECT') return;
      const act = a.dataset.act;
      const id = a.dataset.id;
      switch (act) {
        case 'export': exportCsv(); break;
        case 'add-person': addPersonModal(); break;
        case 'clear-filters': M.f = {}; M.q = ''; { const q = page.querySelector('[data-q]'); if (q) q.value = ''; } closePop(); renderResults(); refreshChipsKeep(); break;
        case 'save-list': saveListModal(); break;
        case 'more': M.shown += 150; renderResults(); break;
        case 'close-pf': closeProfile(); break;
        case 'pf-prev': case 'pf-next': {
          const i = lastRows.findIndex((x) => x.id === openPerson);
          const n = lastRows[i + (act === 'pf-next' ? 1 : -1)];
          if (n) openProfile(n.id, { keepFocus: true });
          break;
        }
        case 'open': openProfile(id); break;
        case 'support': {
          const v = Number(a.dataset.v);
          const p = C.person(openPerson);
          const nv = p.support === v ? null : v;
          C.setField(openPerson, { support: nv });
          if (nv) C.addInteraction({ personId: openPerson, type: 'note', summary: `Support set to ${nv} (${C.SUPPORT[nv]}).` });
          break;
        }
        case 'role': {
          const p = C.person(openPerson);
          const r = a.dataset.v;
          const has = (p.roles || []).indexOf(r) >= 0;
          C.setField(openPerson, { roles: has ? p.roles.filter((x) => x !== r) : (p.roles || []).concat([r]) });
          break;
        }
        case 'untag': {
          const p = C.person(openPerson);
          C.setField(openPerson, { tags: (p.tags || []).filter((x) => x !== a.dataset.v) });
          break;
        }
        case 'logtype': {
          M.logType = a.dataset.v;
          renderProfile(true);
          const t2 = drawer.querySelector('#crm-log-t'); if (t2) t2.focus();
          break;
        }
        case 'edit-contact': {
          const p = C.person(openPerson);
          const box = drawer.querySelector('[data-contact]');
          box.innerHTML = `<form data-form="contact" class="grid-2" style="gap:8px 10px">
            <div><label class="fld-label" for="ec-f">First name</label><input class="input" id="ec-f" name="firstName" value="${esc(p.firstName)}"></div>
            <div><label class="fld-label" for="ec-l">Last name</label><input class="input" id="ec-l" name="lastName" value="${esc(p.lastName)}"></div>
            <div><label class="fld-label" for="ec-e">Email</label><input class="input" id="ec-e" name="email" type="email" value="${esc(p.email)}"></div>
            <div><label class="fld-label" for="ec-p">Mobile</label><input class="input" id="ec-p" name="phone" type="tel" value="${esc(C.util.fmtPhone(p.phone))}"></div>
            <div><label class="fld-label" for="ec-c">City</label><input class="input" id="ec-c" name="city" value="${esc(p.city)}"></div>
            <div><label class="fld-label" for="ec-z">ZIP code</label><input class="input" id="ec-z" name="zip" value="${esc(p.zip)}"></div>
            <div class="row" style="grid-column:1/-1"><button class="btn btn-primary btn-sm" type="submit">Save details</button><button class="btn btn-sm btn-ghost" type="button" data-act="cancel-contact">Cancel</button></div></form>`;
          box.querySelector('input').focus();
          break;
        }
        case 'cancel-contact': renderProfile(true); break;
        case 'merge': {
          const keep = C.person(openPerson), other = C.person(id);
          confirmModal({
            title: `Merge ${other.name} into ${keep.name}?`,
            html: `<p>${esc(keep.name)}'s record stays. We fill in any details it's missing from ${esc(other.name)}'s record, combine their tags and roles, and move ${plural(C.timeline(other.id).length, 'timeline entry', 'timeline entries')} over. ${esc(other.name)}'s separate record goes away.</p>`,
            ok: 'Merge records',
            onOk: () => { C.merge(keep.id, other.id); ctx.toast(`Merged. ${keep.name} now has one record.`, 'ok'); },
          });
          break;
        }
        case 'not-dup': C.notDuplicate(openPerson, id); ctx.toast('Got it. We won\'t suggest that match again.', 'info'); break;
        case 'advance': {
          const en = C.getEntry(id); const path = en && C.getPath(en.pathId);
          C.advance(id);
          const ne = C.getEntry(id);
          ctx.toast(ne.status === 'done' ? `Finished "${path.name}".` : `Moved to "${path.steps.find((s) => s.id === ne.stepId).name}".`, 'ok');
          break;
        }
        case 'pf-addpath': {
          const pid = openPerson;
          const on = new Set(C.entriesFor(pid).filter((x) => x.status === 'active').map((x) => x.pathId));
          openMenu(a, [{ heading: 'Add to path' }].concat(C.paths(owner).map((p) => ({ label: p.name + (on.has(p.id) ? ' (already on it)' : ''), icon: IC.path, onClick: () => { if (on.has(p.id)) return; C.enter(p.id, [pid]); ctx.toast(`Added to "${p.name}".`, 'ok'); } }))));
          break;
        }
        case 'open-list': {
          const l = C.getList(id);
          M.f = Object.assign({}, l.filter || {}); M.q = M.f.q || ''; delete M.f.q; M.shown = 150;
          go('');
          break;
        }
        case 'list-menu': {
          const l = C.getList(id);
          openMenu(a, [
            { label: 'Rename', icon: IC.note, onClick: () => {
              App.modal({ title: 'Rename list', html: `<label class="fld-label" for="rl-n">List name</label><input class="input" id="rl-n" value="${esc(l.name)}">`, actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, onClick: (m) => { const v = m.body.querySelector('#rl-n').value.trim(); if (!v) return false; C.saveList({ id: l.id, name: v }); ctx.toast(`Renamed to "${v}".`, 'ok'); } }] });
            } },
            canSend ? { label: 'Call these people', icon: IC.phone, href: `${outBase}/calls?new=${encodeURIComponent(l.id)}` } : null,
            'sep',
            { label: 'Delete list', icon: IC.x, danger: true, onClick: () => confirmModal({ title: `Delete "${l.name}"?`, html: '<p>The people on it stay in your records. Broadcasts already sent to this list keep their history.</p>', ok: 'Delete list', onOk: () => { C.removeList(l.id); ctx.toast(`Deleted "${l.name}".`, 'info'); } }) },
          ].filter(Boolean));
          break;
        }
        case 'new-path': pathEditor(null); break;
        case 'edit-path': pathEditor(C.getPath(M.pathId)); break;
        case 'path-add': pathAddModal(C.getPath(M.pathId)); break;
        case 'sugg-add': {
          const path = C.getPath(M.pathId);
          const added = C.enter(path.id, [id]);
          added.forEach((x) => freshCards.add(x.id));
          ctx.toast(`${C.person(id).name} added to "${path.steps[0].name}".`, 'ok');
          setTimeout(() => freshCards.clear(), 900);
          break;
        }
        case 'card-menu': {
          const en = C.getEntry(id); const path = C.getPath(en.pathId);
          const i = path.steps.findIndex((s) => s.id === en.stepId);
          const items = [];
          if (i < path.steps.length - 1) items.push({ label: `Advance to "${path.steps[i + 1].name}"`, icon: IC.check, onClick: () => moveEntry(id, path.steps[i + 1].id) });
          else items.push({ label: 'Mark finished', icon: IC.check, onClick: () => moveEntry(id, 'done') });
          items.push({ heading: 'Move to' });
          path.steps.forEach((s, k) => { if (k !== i) items.push({ label: s.name, onClick: () => moveEntry(id, s.id) }); });
          items.push('sep', { label: 'Open profile', icon: IC.user, onClick: () => openProfile(en.personId) });
          items.push({ label: 'Take off this path', icon: IC.x, danger: true, onClick: () => { C.drop(id); ctx.toast('Taken off the path.', 'info'); } });
          openMenu(a, items);
          break;
        }
        case 'tmine': M.taskMine = a.dataset.v === '1'; drawTasks(page.querySelector('[data-sec]')); break;
        default:
      }
    });

    /* close the filter popover when clicking elsewhere; keyboard shortcuts */
    function docDown(e) { if (!el.isConnected) { unsub(); return; } if (pop && !pop.contains(e.target) && !e.target.closest('[data-filter]')) closePop(); }
    function docKey(e) {
      if (!el.isConnected) { unsub(); return; }
      if (document.querySelector('.modal-backdrop, .sheet-backdrop, .crm-menu')) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
      if (e.key === '/' && !typing && section === 'people') { const q = page.querySelector('[data-q]'); if (q) { e.preventDefault(); q.focus(); q.select(); } }
      if (e.key === 'Escape') {
        if (pop) { closePop(); return; }
        if (openPerson && !document.body.classList.contains('drawer-open')) {
          e.preventDefault();
          const prev = openPerson;
          closeProfile();
          const r = page.querySelector(`[data-open="${CSS.escape(prev)}"] a`) || page.querySelector(`[data-open="${CSS.escape(prev)}"]`);
          if (r && r.focus) r.focus({ preventScroll: true });
        }
      }
    }
    document.addEventListener('pointerdown', docDown, true);
    document.addEventListener('keydown', docKey);
    function onHash() { setTimeout(() => { if (!el.isConnected) unsub(); }, 0); }
    window.addEventListener('hashchange', onHash);
    let wasPhone = isPhone();
    function onResize() { if (!el.isConnected) { unsub(); return; } const ph = isPhone(); if (ph !== wasPhone) { wasPhone = ph; if (section === 'people') renderResults(); if (openPerson) renderProfile(true); } }
    window.addEventListener('resize', onResize);
    function onScroll() { if (!el.isConnected) return; if (section === 'people') M.winY = window.scrollY; }
    window.addEventListener('scroll', onScroll, { passive: true });

    /* drawer resize */
    const rsz = drawer.querySelector('.crm-rsz');
    rsz.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      rsz.setPointerCapture(e.pointerId);
      const mv = (ev) => { const w = Math.max(380, Math.min(Math.min(900, window.innerWidth * 0.7), window.innerWidth - ev.clientX)); drawerW = Math.round(w); drawer.style.setProperty('--crm-dw', drawerW + 'px'); };
      const up = () => { rsz.removeEventListener('pointermove', mv); rsz.removeEventListener('pointerup', up); try { Store.global.set('crmDrawerWidth', drawerW); } catch (err) { /* ignore */ } };
      rsz.addEventListener('pointermove', mv);
      rsz.addEventListener('pointerup', up);
    });
    rsz.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      drawerW = Math.max(380, Math.min(900, getDrawerW() + (e.key === 'ArrowLeft' ? 40 : -40)));
      drawer.style.setProperty('--crm-dw', drawerW + 'px');
      try { Store.global.set('crmDrawerWidth', drawerW); } catch (err) { /* ignore */ }
    });

    /* live updates */
    const unsubs = ['people', 'interactions', 'lists', 'paths', 'pathEntries', 'tasks', 'petitions'].map((n) => Store.on(n, (d) => { if (!d || !d.tenant || d.tenant === (App.state && App.state.tenant)) redraw(); }));
    let gone = false;
    function unsub() {
      if (gone) return; gone = true;
      unsubs.forEach((u) => { try { u(); } catch (e) { /* ignore */ } });
      document.removeEventListener('pointerdown', docDown, true);
      document.removeEventListener('keydown', docKey);
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      drawer.remove();
      if (bulkEl) bulkEl.remove();
      clearInterval(tick);
    }
    const tick = setInterval(() => { if (!el.isConnected) unsub(); }, 4000);

    /* first paint */
    function start() {
      C.ensure();
      draw();
      if (openId) openProfile(openId, { noHistory: true, keepFocus: true });
      if (M.winY && section === 'people' && isPhone()) requestAnimationFrame(() => window.scrollTo(0, M.winY));
    }
    if (firstMount) {
      firstMount = false;
      page.innerHTML = `<div class="crm-head"><div><${embedded ? 'h2' : 'h1'} class="crm-h1">${isCamp ? 'Supporters' : 'People'}</${embedded ? 'h2' : 'h1'}><p>Loading your records.</p></div></div>` + skeleton(9);
      setTimeout(start, 60);
    } else start();
    return { el, owner };
  }

  /* ---------------- register ---------------- */
  App.crmUI = Object.assign(App.crmUI || {}, {
    mountPeople,
    _kit: { whenEngine, embedRoute, IC, TYPE_IC, I, injectStyles, supportMeter, sampleMark, roleChips, tagChips, tagText, emptyState, ART, skeleton, fmtRel, fmtDate, dueInfo, plural, openMenu, closeMenus, filterSummary, confirmModal, reduceMotion, isPhone },
  });

  App.register({
    id: 'people',
    title: 'People',
    group: 'People & Outreach',
    minRole: 'member',
    icon: SCREEN_ICON,
    blurb: 'Every supporter, volunteer and donor, with their full history across the platform.',
    gateAbout: 'Central committee members look up supporters, volunteers and donors here and see each person\'s history with the party.',
    render(el, ctx) { mountPeople(el, ctx, { owner: 'committee' }); },
  });
})();
