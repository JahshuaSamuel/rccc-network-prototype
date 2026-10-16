/* screens/candidate.js: Campaign-in-a-Box (Executive Board, capability candidate.manage).
   Sub-routes: '' pipeline · builder[/<id>|/new] · microsite/<id> · print[/<id>] · social[/<id>]
   Saved data (Store, county-scoped):
     candidateStatus (key)    {<candidateId>: 'RECRUITED'|'FILED'|'ENDORSED'|'ACTIVE_CAMPAIGN'}
     candidateStatusLog       {candidateId, name, office, from, to, by}
     candidates               candidates added through the builder (same shape as the seed candidates)
     campaignSites            {candidateId, slug, status:'draft'|'review'|'live', headline, about, issues[], donateUrl,
                               volunteerOn, photo, colors:{brand,accent}, template, disclaimer, committeeName, fppcId, ...}
     printOrders              {title, candidateId, piece, qty, paper, sides, estimate, status}
     socialPlan (key)         {<candidateId>: {weekStart, posts:[...]}}
   The public campaign site is campaign.html?county=<slug>&c=<slug> (campaign.js). */
(function () {
  'use strict';
  if (!window.App) return;

  const U = App.util;
  const esc = U.esc;

  const I = (d, s) => `<svg width="${s || 20}" height="${s || 20}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = I('<path d="M3 7.5l7-4 7 4v7l-7 4-7-4z"/><path d="M3 7.5l7 4 7-4M10 11.5v7"/>');
  const IC = {
    check: I('<path d="M4.5 10.5l3.5 3.5 7.5-8"/>', 16),
    x: I('<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>', 16),
    warn: I('<path d="M10 3.5l7 12.5H3z"/><path d="M10 8.5v3.5M10 14.2v.1"/>', 16),
    dot: I('<circle cx="10" cy="10" r="5.5"/>', 16),
    arrow: I('<path d="M4 10h11M11 6l4 4-4 4"/>', 16),
    back: I('<path d="M16 10H5M9 6l-4 4 4 4"/>', 16),
    plus: I('<path d="M10 4v12M4 10h12"/>', 18),
    out: I('<path d="M11 3.5h5.5V9M16.5 3.5L9 11M14 12v3.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H8"/>', 16),
    move: I('<path d="M4 7h12M4 13h12M13 4l3 3-3 3M7 10l-3 3 3 3"/>', 16),
    print: I('<path d="M5.5 7V3h9v4M5.5 14h-2v-6h13v6h-2"/><rect x="5.5" y="11" width="9" height="6"/>', 18),
    dl: I('<path d="M10 3v10M6 9l4 4 4-4M4 16.5h12"/>', 16),
    copy: I('<rect x="7" y="7" width="9.5" height="9.5" rx="2"/><path d="M13 7V4.5a1 1 0 0 0-1-1H4.5a1 1 0 0 0-1 1V12a1 1 0 0 0 1 1H7"/>', 16),
    trash: I('<path d="M4 6h12M8 6V4h4v2M6 6l1 10.5h6L14 6"/>', 16),
    site: I('<rect x="2.5" y="3.5" width="15" height="13" rx="2"/><path d="M2.5 7h15"/>', 18),
    chat: I('<path d="M3.5 4.5h13v9h-7l-4 3v-3h-2z"/>', 18),
    pen: I('<path d="M13.5 3.5l3 3L7 16H4v-3z"/>', 18),
    upload: I('<path d="M10 13V3M6 7l4-4 4 4M4 16.5h12"/>', 16),
    star: '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M10 1.8l2.4 5 5.4.7-4 3.8 1 5.4L10 14.1l-4.8 2.6 1-5.4-4-3.8 5.4-.7z" fill="currentColor"/></svg>',
  };

  const STAGES = [
    ['RECRUITED', 'Recruited', 'Said yes to running'],
    ['FILED', 'Filed', 'Papers filed with the county'],
    ['ENDORSED', 'Endorsed', 'Endorsed by the central committee'],
    ['ACTIVE_CAMPAIGN', 'Active campaign', 'Campaign site and posts are live'],
  ];
  const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s[0], s[1]]));
  const TEMPLATES = [['classic', 'Classic', 'Color block with the photo beside it'], ['banner', 'Photo banner', 'A full-width photo behind the name'], ['hometown', 'Hometown', 'Light background and a framed photo']];
  const PHOTOS = ['images/photo-1.jpg', 'images/photo-2.jpg', 'images/photo-3.jpg', 'images/photo-4.jpg', 'images/photo-5.jpg'];
  /* Focal points (fx, fy as fractions) and aspect ratio of the supplied headshots. */
  const FACES = {
    'images/photo-1.jpg': { ar: 600 / 900, fx: 0.51, fy: 0.22 },
    'images/photo-2.jpg': { ar: 600 / 900, fx: 0.43, fy: 0.26 },
    'images/photo-3.jpg': { ar: 601 / 900, fx: 0.53, fy: 0.21 },
    'images/photo-4.jpg': { ar: 600 / 900, fx: 0.55, fy: 0.34 },
    'images/photo-5.jpg': { ar: 900 / 600, fx: 0.56, fy: 0.31 },
  };
  const FOCUS_CSS = { 'images/photo-1.jpg': '51% 20%', 'images/photo-2.jpg': '43% 24%', 'images/photo-3.jpg': '53% 20%', 'images/photo-4.jpg': '55% 32%', 'images/photo-5.jpg': '56% 30%' };
  const QR_SRC = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
  const HEAD = "Archivo, 'Arial Narrow', sans-serif";
  const BODY = "'Public Sans', system-ui, sans-serif";

  /* ======================================================================
     Data
     ====================================================================== */
  const db = (tenant) => (tenant ? Store.forTenant(tenant) : Store);
  const kebab = (n) => String(n || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'candidate';
  const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
  const lc1 = (s) => { s = String(s || '').trim(); return s ? s[0].toLowerCase() + s.slice(1) : s; };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function fmtDate(iso, opt) {
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d) ? String(iso || '') : d.toLocaleDateString('en-US', opt || { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function fmtStamp(ts) {
    const d = new Date(ts);
    return isNaN(d) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function daysUntil(iso, from) {
    const a = from ? new Date(from + 'T12:00:00') : new Date();
    a.setHours(12, 0, 0, 0);
    return Math.round((new Date(iso + 'T12:00:00') - a) / 86400000);
  }
  const slogan = (c) => c.slogan || '';
  const composeDisc = (committee, fppc) => `Paid for by ${String(committee || '').trim()}, FPPC ID #${String(fppc || '').trim()}`;

  function candidates(ctx) {
    const extra = Store.list('candidates');
    const ov = Store.get('candidateStatus', {}) || {};
    return ((ctx.tenant && ctx.tenant.candidates) || []).concat(extra).map((c) => (ov[c.id] ? Object.assign({}, c, { status: ov[c.id] }) : c));
  }
  const sitesAll = () => Store.list('campaignSites');
  const siteOf = (c, all) => (all || sitesAll()).find((s) => s.candidateId === c.id) || null;
  const discOf = (c, site) => String(site ? site.disclaimer || '' : c.disclaimer || '').trim();

  function siteState(c, site) {
    const st = site ? site.status : (c.siteStatus === 'LIVE' ? 'live' : c.siteStatus === 'BUILDING' ? 'draft' : 'none');
    if (st === 'live' && !discOf(c, site)) return { key: 'hold', label: 'Site on hold', cls: 'badge-danger' };
    return ({
      live: { key: 'live', label: 'Site live', cls: 'badge-ok' },
      review: { key: 'review', label: 'Waiting for approval', cls: 'badge-warn' },
      draft: { key: 'draft', label: 'Site draft', cls: 'badge-local' },
      none: { key: 'none', label: 'No site yet', cls: '' },
    })[st] || { key: 'none', label: 'No site yet', cls: '' };
  }

  function defaultSite(c, ctx) {
    const tc = ctx.tenant.colors || {};
    const disc = String(c.disclaimer || '').trim();
    return {
      candidateId: c.id, slug: kebab(c.name),
      status: c.siteStatus === 'LIVE' && disc ? 'live' : 'draft',
      name: c.name, office: c.office || '', district: c.district || '', electionDate: c.electionDate || '2026-11-03',
      committeeName: c.committeeName || '', fppcId: c.fppcId || '',
      disclaimer: disc ? composeDisc(c.committeeName, c.fppcId) : '',
      headline: slogan(c), about: c.bio || '', issues: (c.issues || []).slice(0, 5),
      donateUrl: `https://secure.winred.com/${kebab(c.name)}/donate`, volunteerOn: true,
      photo: c.photo || null, photoPos: c.photoPos || '', colors: { brand: tc.brand || '#0B2A4A', accent: tc.accent || '#C8102E' },
      template: 'classic', step: 1,
    };
  }
  /* What every surface shows: the saved site doc, else the seed defaults. */
  function view(c, ctx, site) {
    const s = site === undefined ? siteOf(c) : site;
    const d = Object.assign(defaultSite(c, ctx), s || {});
    if (!s) d.disclaimer = String(c.disclaimer || '').trim() ? composeDisc(c.committeeName, c.fppcId) : '';
    d.c = c;
    d.endorsed = (c.status === 'ENDORSED' || c.status === 'ACTIVE_CAMPAIGN') && !d.endorsementPaused;
    d.url = campaignUrl(ctx.tenantSlug, d.slug);
    return d;
  }
  function campaignUrl(county, slug, extra) {
    return new URL(`campaign.html?county=${encodeURIComponent(county)}&c=${encodeURIComponent(slug)}${extra || ''}`, location.href).href;
  }

  function checks(d) {
    const fppcOk = /^\d{6,9}$/.test(String(d.fppcId || '').trim());
    const disc = String(d.disclaimer || '').trim();
    const discOk = /^paid for by .{3,}/i.test(disc) && /FPPC ID #\s?\d{6,9}/i.test(disc) && (!fppcOk || disc.includes(String(d.fppcId).trim()));
    const url = String(d.donateUrl || '').trim();
    const issues = (d.issues || []).filter((x) => String(x || '').trim());
    return [
      { id: 'name', step: 1, block: true, ok: !!String(d.name || '').trim() && !!String(d.office || '').trim() && !!String(d.district || '').trim(), label: 'Name, office and district', bad: 'Add them on step 1.' },
      { id: 'headline', step: 3, block: true, ok: String(d.headline || '').trim().length >= 6, label: 'Headline', bad: 'Write a headline on step 3.' },
      { id: 'issues', step: 3, block: true, ok: issues.length >= 1, label: 'At least one priority', bad: 'Add a priority on step 3.' },
      { id: 'about', step: 3, block: false, ok: String(d.about || '').trim().length >= 80, label: 'About section of two sentences or more', bad: 'Voters read this first. Add a few sentences on step 3.' },
      { id: 'photo', step: 2, block: false, ok: !!d.photo, label: 'Headshot', bad: 'Initials show until you add one on step 2.' },
      { id: 'donate', step: 3, block: true, ok: /^https:\/\/[^\s/]+\.[^\s]+/.test(url), label: 'Donate link starts with https://', bad: 'Fix the donate link on step 3.' },
      { id: 'committee', step: 4, block: true, ok: String(d.committeeName || '').trim().length >= 4, label: 'Committee name', bad: 'Add it on step 4.' },
      { id: 'fppc', step: 4, block: true, ok: fppcOk, label: 'FPPC ID of 6 to 9 digits', bad: 'Add the ID from the committee’s filing on step 4.' },
      { id: 'disc', step: 4, block: true, ok: discOk, label: '“Paid for by …, FPPC ID #…” disclaimer', bad: disc ? 'It must read “Paid for by <committee>, FPPC ID #<number>”.' : 'Missing. The site cannot publish without it.' },
    ];
  }
  const blockers = (d) => checks(d).filter((x) => x.block && !x.ok);

  function setStatus(ctx, c, to) {
    if (!c || c.status === to) return;
    const ov = Store.get('candidateStatus', {}) || {};
    ov[c.id] = to;
    Store.set('candidateStatus', ov);
    Store.add('candidateStatusLog', { candidateId: c.id, name: c.name, office: c.office, from: c.status || null, to, by: ctx.user ? ctx.user.name : null });
    App.state.cand_flash = c.id;
    ctx.toast(`${c.name} moved to ${STAGE_LABEL[to]}.`, 'ok');
  }

  /* Candidate picked for print and social. */
  function pick(ctx, list, id) {
    const sel = (App.state.cand_sel = App.state.cand_sel || {});
    const c = list.find((x) => x.id === id) || list.find((x) => x.id === sel[ctx.tenantSlug]) ||
      list.find((x) => x.status === 'ENDORSED' || x.status === 'ACTIVE_CAMPAIGN') || list[0];
    if (c) sel[ctx.tenantSlug] = c.id;
    return c;
  }
  function picker(list, cur, label, extra) {
    return `<label class="cb-picker"><span>${esc(label)}</span>
      <select class="select" data-pick aria-label="${esc(label)}">${list.map((c) =>
        `<option value="${esc(c.id)}"${cur && c.id === cur.id ? ' selected' : ''}>${esc(c.name)}, ${esc(c.office)}</option>`).join('')}${extra || ''}</select></label>`;
  }

  function photoTag(d, size, cls) {
    if (!d.photo) return `<span class="cb-ph ${cls || ''}" style="width:${size}px;height:${size}px" aria-hidden="true">${esc(U.initials(d.name))}</span>`;
    return `<img class="cb-ph ${cls || ''}" src="${esc(d.photo)}" alt="" width="${size}" height="${size}" style="object-position:${esc(FOCUS_CSS[d.photo] || d.photoPos || '50% 25%')}" loading="lazy">`;
  }

  /* ======================================================================
     Styles
     ====================================================================== */
  function injectStyle() {
    if (document.getElementById('scr-cand-style')) return;
    const css = `
.scr-cand { --ease: cubic-bezier(.2,.8,.2,1); }
.scr-cand .cb-tabs { margin-bottom: 22px; }
.scr-cand .cb-ph { border-radius: 50%; object-fit: cover; flex: none; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--brand) 12%, white); color: var(--brand); font: 800 15px/1 var(--font-head); }
.scr-cand .cb-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin-bottom: 18px; }
.scr-cand .cb-picker { display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; min-width: 0; max-width: 100%; }
.scr-cand .cb-picker > span { font-weight: 600; font-size: 14px; color: var(--ink-2); }
.scr-cand .cb-picker .select { width: auto; min-width: min(280px, 100%); max-width: 100%; flex: 1 1 240px; }
.scr-cand .cb-seg { display: inline-flex; padding: 3px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--line); }
.scr-cand .cb-seg button { all: unset; box-sizing: border-box; cursor: pointer; min-height: 36px; padding: 6px 14px; border-radius: 999px; font: 600 14px/1.2 var(--font-body); color: var(--ink-2); display: inline-flex; align-items: center; gap: 6px; transition: background-color .18s, color .18s, box-shadow .18s; }
.scr-cand .cb-seg button[aria-pressed="true"] { background: var(--surface); color: var(--brand); box-shadow: 0 1px 3px rgba(21,32,46,.16); }
.scr-cand .cb-seg button:focus-visible { box-shadow: var(--focus); }
.scr-cand .cb-mt { margin-top: 22px; }
.scr-cand .cb-note { font-size: 13.5px; color: var(--ink-3); }
@keyframes cbIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes cbFlash { 0% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 45%, transparent); } 100% { box-shadow: var(--shadow-1); } }

/* ---------- pipeline ---------- */
.scr-cand .cb-sum { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 14px; margin-bottom: 18px; align-items: stretch; }
.scr-cand .cb-sum-money { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.scr-cand .cb-sum-top { display: flex; justify-content: space-between; gap: 10px; font-size: 15px; color: var(--ink-2); }
.scr-cand .cb-sum-top b { font: 800 1.7rem/1 var(--font-head); font-stretch: 80%; color: var(--ink); margin-right: 4px; }
.scr-cand .cb-sum-top > span:last-child { font-weight: 700; color: var(--brand); align-self: flex-end; }
.scr-cand .cb-bar.big { height: 12px; margin: 6px 0 4px; }
.scr-cand .cb-sum-alert, .scr-cand .cb-sum-ok { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 12px 14px; border-radius: var(--r); font-size: 14.5px; }
.scr-cand .cb-sum-alert { background: var(--danger-soft); color: #7A1A12; }
.scr-cand .cb-sum-alert > svg { color: var(--danger); flex: none; }
.scr-cand .cb-sum-alert > span { flex: 1 1 220px; min-width: 0; }
.scr-cand .cb-sum-ok { background: var(--ok-soft); color: var(--ok); font-weight: 600; }
@media (max-width: 760px) { .scr-cand .cb-sum { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 760px) { .scr-cand .cb-tabs { -webkit-mask-image: linear-gradient(to right, #000 82%, transparent); mask-image: linear-gradient(to right, #000 82%, transparent); padding-right: 28px; } .scr-cand .cb-tabs.at-end { -webkit-mask-image: none; mask-image: none; } }
.scr-cand .cb-filter { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.scr-cand .cb-pipe { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; align-items: start; }
.scr-cand .cb-col { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--r-lg); padding: 12px; min-width: 0; min-height: 160px; transition: background-color .18s, border-color .18s; }
.scr-cand .cb-col.drop { background: color-mix(in srgb, var(--brand) 7%, white); border-color: var(--brand); border-style: dashed; }
.scr-cand .cb-col-head { display: flex; align-items: baseline; gap: 8px; padding: 2px 4px 2px; }
.scr-cand .cb-col-head h3 { margin: 0; font-size: 1.05rem; }
.scr-cand .cb-count { margin-left: auto; font: 700 13px/1 var(--font-body); color: var(--ink-3); background: var(--surface); border: 1px solid var(--line); border-radius: 999px; padding: 4px 9px; }
.scr-cand .cb-col-note { font-size: 13px; color: var(--ink-3); padding: 2px 4px 10px; }
.scr-cand .cb-cards { display: flex; flex-direction: column; gap: 10px; }
.scr-cand .cb-card { position: relative; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: 12px 13px 10px; box-shadow: var(--shadow-1); transition: border-color .15s, box-shadow .2s, transform .2s var(--ease); animation: cbIn .3s var(--ease) both; }
.scr-cand .cb-card:hover { border-color: color-mix(in srgb, var(--brand) 45%, white); box-shadow: var(--shadow-2); transform: translateY(-1px); }
.scr-cand .cb-card.flash { animation: cbIn .3s var(--ease) both, cbFlash 1.4s ease .2s; }
.scr-cand .cb-card.dragging { opacity: .45; }
.scr-cand .cb-card[draggable="true"] { cursor: grab; }
.scr-cand .cb-card-top { display: flex; gap: 10px; align-items: center; }
.scr-cand .cb-card-open { all: unset; cursor: pointer; font-family: var(--font-head); font-stretch: 85%; font-weight: 750; font-size: 1.05rem; line-height: 1.15; color: var(--ink); }
.scr-cand .cb-card-open::after { content: ''; position: absolute; inset: 0; border-radius: var(--r); }
.scr-cand .cb-card-open:focus-visible::after { box-shadow: var(--focus); }
.scr-cand .cb-card-office { font-size: 13.5px; color: var(--ink-2); line-height: 1.35; }
.scr-cand .cb-bar { height: 7px; background: var(--line); border-radius: 999px; overflow: hidden; margin: 11px 0 5px; }
.scr-cand .cb-bar > span { display: block; height: 100%; background: linear-gradient(90deg, var(--brand), color-mix(in srgb, var(--brand) 70%, var(--accent))); border-radius: 999px; transform-origin: left; animation: cbGrow .8s var(--ease) both; }
@keyframes cbGrow { from { transform: scaleX(0); } to { transform: none; } }
.scr-cand .cb-money { display: flex; justify-content: space-between; font-size: 13px; color: var(--ink-3); gap: 6px; flex-wrap: wrap; }
.scr-cand .cb-money b { color: var(--ink); }
.scr-cand .cb-card-foot { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 9px; }
.scr-cand .cb-warn { display: flex; gap: 6px; align-items: flex-start; margin-top: 8px; padding: 7px 9px; border-radius: 8px; background: var(--danger-soft); color: var(--danger); font-size: 13px; font-weight: 600; line-height: 1.3; }
.scr-cand .cb-warn svg { flex: none; margin-top: 1px; }
.scr-cand .cb-move { position: relative; z-index: 1; margin-left: auto; min-height: 36px; padding: 4px 10px; font-size: 13.5px; }
.scr-cand .cb-empty { font-size: 13.5px; color: var(--ink-3); border: 1px dashed var(--line-strong); border-radius: var(--r); padding: 18px 12px; text-align: center; }
.scr-cand .cb-menu { position: fixed; z-index: 850; min-width: 220px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); box-shadow: var(--shadow-2); padding: 6px; animation: cbIn .16s var(--ease) both; }
.scr-cand .cb-menu button { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 8px; width: 100%; min-height: 42px; padding: 8px 10px; border-radius: 8px; font-size: 14.5px; font-weight: 600; color: var(--ink); }
.scr-cand .cb-menu button:hover, .scr-cand .cb-menu button:focus-visible { background: var(--surface-2); color: var(--brand); }
.scr-cand .cb-menu button[aria-current="true"] { color: var(--ink-3); cursor: default; }
.scr-cand .cb-menu .lbl { font-size: 12.5px; color: var(--ink-3); padding: 4px 10px 2px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
.scr-cand .cb-log { list-style: none; margin: 0; padding: 0; }
.scr-cand .cb-log li { display: flex; gap: 12px; align-items: baseline; justify-content: space-between; padding: 10px 0; border-top: 1px solid var(--line); animation: cbIn .3s var(--ease) both; }
.scr-cand .cb-log li:first-child { border-top: 0; padding-top: 0; }
.scr-cand .cb-log .when { color: var(--ink-3); font-size: 13.5px; white-space: nowrap; }
@media (max-width: 1100px) { .scr-cand .cb-pipe { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 620px) { .scr-cand .cb-pipe { grid-template-columns: minmax(0, 1fr); } .scr-cand .cb-log li { flex-direction: column; gap: 2px; } }

/* drawer */
.scr-cand .cb-drawer-back { position: fixed; inset: 0; background: rgba(15,22,32,.42); z-index: 790; animation: cbFade .2s ease both; }
@keyframes cbFade { from { opacity: 0; } to { opacity: 1; } }
.scr-cand .cb-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(460px, 100vw); background: var(--surface); z-index: 800; box-shadow: var(--shadow-2); display: flex; flex-direction: column; animation: cbSlide .28s var(--ease) both; }
@keyframes cbSlide { from { transform: translateX(40px); opacity: .3; } to { transform: none; opacity: 1; } }
.scr-cand .cb-drawer-head { display: flex; gap: 14px; align-items: center; padding: 20px 20px 16px; border-bottom: 1px solid var(--line); }
.scr-cand .cb-drawer-head h2 { margin: 0; font-size: 1.4rem; }
.scr-cand .cb-drawer-body { padding: 18px 20px 28px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 18px; }
.scr-cand .cb-dl { display: grid; grid-template-columns: minmax(0, 9.5em) minmax(0, 1fr); gap: 6px 14px; font-size: 14.5px; margin: 0; }
.scr-cand .cb-dl dt { color: var(--ink-3); }
.scr-cand .cb-dl dd { margin: 0; font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.scr-cand .cb-links { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.scr-cand .cb-links .btn { justify-content: flex-start; white-space: normal; text-align: left; }
.scr-cand .cb-stage-seg { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.scr-cand .cb-stage-seg button { min-height: 44px; }
.scr-cand .cb-stage-seg button[aria-pressed="true"] { background: var(--brand); color: var(--brand-ink); border-color: var(--brand); }

/* ---------- builder ---------- */
.scr-cand .cb-build { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 38%); gap: 20px; align-items: start; }
.scr-cand .cb-build-side { position: sticky; top: calc(var(--topbar-h) + 16px); }
@media (max-width: 1100px) { .scr-cand .cb-build { grid-template-columns: minmax(0, 1fr); } .scr-cand .cb-build-side { position: static; } }
.scr-cand .cb-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; position: relative; }
.scr-cand .cb-step { all: unset; box-sizing: border-box; cursor: pointer; display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 10px 4px 12px; border-radius: var(--r); font-weight: 600; font-size: 14px; color: var(--ink-3); position: relative; }
.scr-cand .cb-step::before { content: ''; height: 4px; border-radius: 999px; background: var(--line); transition: background-color .3s; }
.scr-cand .cb-step.done::before { background: color-mix(in srgb, var(--ok) 70%, white); }
.scr-cand .cb-step.current::before { background: var(--accent); }
.scr-cand .cb-step.current { color: var(--ink); }
.scr-cand .cb-step:hover { color: var(--ink); background: var(--surface-2); }
.scr-cand .cb-step:focus-visible { box-shadow: var(--focus); }
.scr-cand .cb-step-l { display: flex; align-items: center; gap: 6px; min-width: 0; }
.scr-cand .cb-step-l span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scr-cand .cb-step .n { font: 700 12px/1 var(--font-body); color: var(--ink-3); }
.scr-cand .cb-step.done .n { color: var(--ok); }
@media (max-width: 640px) { .scr-cand .cb-step-l span:last-child { display: none; } .scr-cand .cb-step.current .cb-step-l span:last-child { display: inline; } .scr-cand .cb-steps { display: flex; } .scr-cand .cb-steps > li { flex: 1 1 0; min-width: 0; } .scr-cand .cb-steps > li:has(.current) { flex: 3 1 0; } }
@media (max-width: 640px) { .scr-cand .cb-filter { flex-wrap: nowrap; overflow-x: auto; margin-left: -16px; margin-right: -16px; padding: 2px 16px 6px; scrollbar-width: none; } .scr-cand .cb-filter .chip { flex: none; } }
.scr-cand .cb-wcard { overflow: hidden; }
.scr-cand .cb-wcard-head { display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap; padding: 16px 20px 8px; }
.scr-cand .cb-stepbody { padding: 8px 20px 22px; min-height: 320px; }
.scr-cand .cb-stepbody.in-next { animation: cbStepNext .34s var(--ease) both; }
.scr-cand .cb-stepbody.in-prev { animation: cbStepPrev .34s var(--ease) both; }
@keyframes cbStepNext { from { opacity: 0; transform: translateX(26px); } to { opacity: 1; transform: none; } }
@keyframes cbStepPrev { from { opacity: 0; transform: translateX(-26px); } to { opacity: 1; transform: none; } }
.scr-cand .cb-stepbody h2 { font-size: 1.45rem; margin: 6px 0 4px; }
.scr-cand .cb-lead { color: var(--ink-2); margin: 0 0 18px; max-width: 60ch; }
.scr-cand .cb-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.scr-cand .cb-form .full { grid-column: 1 / -1; }
@media (max-width: 640px) { .scr-cand .cb-form { grid-template-columns: minmax(0, 1fr); } }
.scr-cand .cb-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.scr-cand .cb-field > .lbl { font-weight: 600; font-size: 14.5px; color: var(--ink-2); display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.scr-cand .cb-field .cnt { font-weight: 500; font-size: 12.5px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.scr-cand .cb-hint { font-size: 13px; color: var(--ink-3); }
.scr-cand .cb-field .input.flash, .scr-cand .cb-field .textarea.flash { animation: cbFlashIn 1s ease; }
@keyframes cbFlashIn { 0% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--ok) 40%, transparent); border-color: var(--ok); } 100% { box-shadow: none; } }
.scr-cand .cb-wiz-foot { display: flex; gap: 10px; align-items: center; padding: 14px 20px; border-top: 1px solid var(--line); background: var(--surface-2); flex-wrap: wrap; }
.scr-cand .cb-save { font-size: 13.5px; color: var(--ink-3); display: inline-flex; align-items: center; gap: 6px; }
.scr-cand .cb-save i { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); display: inline-block; }
.scr-cand .cb-save.saving i { background: var(--warn); animation: cbPulse 1s ease infinite; }
.scr-cand .cb-save.pending i { background: var(--line-strong); }
@keyframes cbPulse { 50% { opacity: .3; } }
.scr-cand .cb-owned { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; margin-bottom: 16px; border-radius: var(--r); background: var(--info-soft); color: #173E66; font-size: 14.5px; }
.scr-cand .cb-owned svg { flex: none; color: var(--info); margin-top: 1px; }
.scr-cand .cb-hand .cb-vlist li { display: block; }
.scr-cand .cb-tpls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 560px) { .scr-cand .cb-tpls { grid-template-columns: minmax(0, 1fr); } }
.scr-cand .cb-tpl { all: unset; box-sizing: border-box; cursor: pointer; border: 2px solid var(--line); border-radius: var(--r); padding: 8px 8px 10px; background: var(--surface); font-size: 13px; color: var(--ink-3); transition: border-color .15s, box-shadow .15s, transform .15s; }
.scr-cand .cb-tpl b { display: block; font-size: 14.5px; color: var(--ink); margin-top: 6px; }
.scr-cand .cb-tpl svg { display: block; width: 100%; height: auto; border-radius: 6px; }
.scr-cand .cb-tpl:hover { transform: translateY(-2px); }
.scr-cand .cb-tpl[aria-checked="true"] { border-color: var(--brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 18%, transparent); }
.scr-cand .cb-tpl:focus-visible { box-shadow: var(--focus); }
.scr-cand .cb-sw { display: flex; flex-wrap: wrap; gap: 10px; }
.scr-cand .cb-swatch { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; padding: 4px 12px 4px 4px; border: 2px solid var(--line); font-size: 13.5px; font-weight: 600; color: var(--ink-2); min-height: 44px; }
.scr-cand .cb-swatch[aria-checked="true"] { border-color: var(--ink); color: var(--ink); }
.scr-cand .cb-swatch:focus-visible { box-shadow: var(--focus); }
.scr-cand .cb-swatch span.chips { display: inline-flex; }
.scr-cand .cb-swatch span.chips i { width: 16px; height: 32px; display: block; }
.scr-cand .cb-swatch span.chips i:first-child { border-radius: 999px 0 0 999px; }
.scr-cand .cb-swatch span.chips i:last-child { border-radius: 0 999px 999px 0; }
.scr-cand .cb-photos { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.scr-cand .cb-photo { all: unset; box-sizing: border-box; cursor: pointer; width: 64px; height: 64px; border-radius: 50%; overflow: hidden; border: 3px solid transparent; box-shadow: 0 0 0 1px var(--line); transition: transform .15s; }
.scr-cand .cb-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.scr-cand .cb-photo:hover { transform: scale(1.05); }
.scr-cand .cb-photo[aria-checked="true"] { border-color: var(--accent); }
.scr-cand .cb-photo:focus-visible { box-shadow: var(--focus); }
.scr-cand .cb-upload { position: relative; overflow: hidden; }
.scr-cand .cb-upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.scr-cand .cb-upload:focus-within { box-shadow: var(--focus); }
.scr-cand .cb-suggest { margin-top: 8px; border-radius: var(--r); background: color-mix(in srgb, var(--info) 6%, white); border: 1px solid color-mix(in srgb, var(--info) 18%, white); padding: 10px; }
.scr-cand .cb-suggest-h { font: 700 12.5px/1.2 var(--font-body); color: var(--info); text-transform: uppercase; letter-spacing: .05em; margin: 0 2px 8px; }
.scr-cand .cb-sug { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border-radius: 8px; font-size: 14.5px; color: var(--ink); }
.scr-cand .cb-sug + .cb-sug { margin-top: 2px; }
.scr-cand .cb-sug span.t { flex: 1; min-width: 0; }
.scr-cand .cb-sug span.u { flex: none; font-size: 13px; font-weight: 700; color: var(--info); }
.scr-cand .cb-sug:hover, .scr-cand .cb-sug:focus-visible { background: var(--surface); box-shadow: 0 1px 3px rgba(21,32,46,.12); }
.scr-cand .cb-chipsugs { display: flex; flex-wrap: wrap; gap: 6px; }
.scr-cand .cb-chipsugs .chip { min-height: 38px; }
.scr-cand .cb-issue-row { display: flex; gap: 8px; align-items: center; animation: cbIn .25s var(--ease) both; }
.scr-cand .cb-issue-row .num { font: 800 1.1rem/1 var(--font-head); color: var(--accent); width: 1.6em; flex: none; text-align: center; }
.scr-cand .cb-issue-row .input { flex: 1; }
.scr-cand .cb-icon-btn { min-width: 44px; min-height: 44px; padding: 0; }
.scr-cand .cb-checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.scr-cand .cb-checks li { display: flex; gap: 10px; align-items: flex-start; padding: 9px 10px; border-radius: 8px; font-size: 14.5px; }
.scr-cand .cb-checks li.bad.block { background: var(--danger-soft); }
.scr-cand .cb-checks .ic { width: 24px; height: 24px; border-radius: 50%; flex: none; display: inline-flex; align-items: center; justify-content: center; }
.scr-cand .cb-checks .ok .ic { background: var(--ok-soft); color: var(--ok); }
.scr-cand .cb-checks .bad.block .ic { background: var(--surface); color: var(--danger); }
.scr-cand .cb-checks .bad.soft .ic { background: var(--warn-soft); color: var(--warn); }
.scr-cand .cb-checks b { display: block; }
.scr-cand .cb-checks .why { font-size: 13.5px; color: var(--ink-2); }
.scr-cand .cb-checks .go { margin-left: auto; flex: none; }
.scr-cand .cb-disc-preview { border: 2px solid var(--ink); padding: 10px 14px; border-radius: 4px; font-weight: 700; background: var(--surface); overflow-wrap: anywhere; }
.scr-cand .cb-disc-preview.missing { border-style: dashed; border-color: var(--danger); color: var(--danger); background: var(--danger-soft); font-weight: 600; }
.scr-cand .cb-timeline { list-style: none; margin: 0 0 18px; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; }
.scr-cand .cb-timeline li { position: relative; padding: 30px 6px 0; text-align: center; font-size: 13.5px; color: var(--ink-3); font-weight: 600; }
.scr-cand .cb-timeline li::before { content: ''; position: absolute; top: 9px; left: 50%; width: 20px; height: 20px; margin-left: -10px; border-radius: 50%; background: var(--surface); border: 2px solid var(--line-strong); z-index: 1; transition: all .3s; }
.scr-cand .cb-timeline li::after { content: ''; position: absolute; top: 18px; left: -50%; width: 100%; height: 3px; background: var(--line); }
.scr-cand .cb-timeline li:first-child::after { display: none; }
.scr-cand .cb-timeline li.on { color: var(--ink); }
.scr-cand .cb-timeline li.on::before { background: var(--ok); border-color: var(--ok); box-shadow: 0 0 0 4px var(--ok-soft); }
.scr-cand .cb-timeline li.on::after { background: var(--ok); }
.scr-cand .cb-timeline li.cur::before { background: var(--accent); border-color: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 20%, transparent); }
.scr-cand .cb-pubbox { border: 1px solid var(--line); border-radius: var(--r-lg); padding: 18px; display: flex; flex-direction: column; gap: 12px; background: var(--surface-2); }
.scr-cand .cb-pubbox .btn-primary.big { min-height: 52px; font-size: 16.5px; }
.scr-cand .cb-addr { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 14px; }
.scr-cand .cb-addr code { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; font-size: 13px; overflow-wrap: anywhere; min-width: 0; flex: 1 1 220px; }
.scr-cand .cb-next { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.scr-cand .cb-next a { justify-content: flex-start; }

/* preview */
.scr-cand .cb-pv { border: 1px solid var(--line); border-radius: var(--r-lg); background: linear-gradient(180deg, var(--surface-2), color-mix(in srgb, var(--brand) 6%, var(--surface-2))); overflow: hidden; }
.scr-cand .cb-pv-bar { display: flex; align-items: center; gap: 8px 10px; padding: 10px 12px; border-bottom: 1px solid var(--line); background: var(--surface); flex-wrap: wrap; }
.scr-cand .cb-pv-stage { position: relative; margin: 18px 14px; transition: height .3s var(--ease); }
.scr-cand .cb-pv-device { position: absolute; top: 0; left: 0; transform-origin: 0 0; background: #fff; overflow: hidden; box-shadow: 0 30px 60px -30px rgba(21,32,46,.55); transition: transform .35s var(--ease), left .35s var(--ease); }
.scr-cand .cb-pv[data-mode="phone"] .cb-pv-device { border-radius: 44px; border: 12px solid #141B24; }
.scr-cand .cb-pv[data-mode="desktop"] .cb-pv-device { border-radius: 12px; border: 1px solid var(--line-strong); padding-top: 34px; background: #E9ECF1; }
.scr-cand .cb-pv[data-mode="desktop"] .cb-pv-device::before { content: ''; position: absolute; top: 12px; left: 14px; width: 54px; height: 11px; background: radial-gradient(circle at 5px 5.5px, #E5736A 5px, transparent 5.5px), radial-gradient(circle at 25px 5.5px, #E8B84A 5px, transparent 5.5px), radial-gradient(circle at 45px 5.5px, #69B86E 5px, transparent 5.5px); }
.scr-cand .cb-pv iframe { display: block; width: 100%; height: 100%; border: 0; background: #fff; }
.scr-cand .cb-pv-empty { padding: 40px 20px; text-align: center; color: var(--ink-3); }

/* microsite */
.scr-cand .cb-ms { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
@media (max-width: 1000px) { .scr-cand .cb-ms { grid-template-columns: minmax(0, 1fr); } }
.scr-cand .cb-vlist { list-style: none; margin: 0; padding: 0; }
.scr-cand .cb-vlist li { padding: 9px 0; border-top: 1px solid var(--line); font-size: 14.5px; }
.scr-cand .cb-vlist li:first-child { border-top: 0; padding-top: 0; }

/* ---------- print studio ---------- */
.scr-cand .cp-wrap { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 20px; align-items: start; }
@media (max-width: 1100px) { .scr-cand .cp-wrap { grid-template-columns: minmax(0, 1fr); } }
.scr-cand .cp-mat { position: relative; border-radius: var(--r-lg); border: 1px solid var(--line); background: radial-gradient(circle at 30% 20%, #fff, #E7EBF0 70%); padding: 28px 18px 18px; display: flex; flex-direction: column; align-items: center; gap: 14px; min-width: 0; }
.scr-cand .cp-sheets { display: flex; gap: 22px; align-items: flex-start; justify-content: center; flex-wrap: wrap; width: 100%; animation: cbIn .35s var(--ease) both; }
.scr-cand .cp-sheet { display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 0; }
.scr-cand .cp-sheet svg { display: block; height: auto; max-width: 100%; filter: drop-shadow(0 18px 22px rgba(21,32,46,.22)); background: #fff; }
.scr-cand .cp-sheet .cap { font-size: 13px; color: var(--ink-3); font-weight: 600; }
.scr-cand .cp-door svg { width: min(250px, 100%); }
.scr-cand .cp-palm svg { width: min(220px, 42vw); }
.scr-cand .cp-yard svg { width: min(640px, 100%); }
.scr-cand .cp-yard .cp-sheet { width: 100%; }
.scr-cand .cp-mat:not(.guides) .cp-guide { display: none; }
.scr-cand .cp-legend { font-size: 13px; color: var(--ink-3); display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
.scr-cand .cp-legend .toggle input { width: 44px; min-width: 44px; }
.scr-cand .cp-legend i { display: inline-block; width: 22px; border-top: 2px dashed #18A0C8; vertical-align: middle; margin-right: 6px; }
.scr-cand .cp-panel { display: flex; flex-direction: column; gap: 14px; }
.scr-cand .cp-specs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; font-size: 13.5px; }
.scr-cand .cp-specs div { background: var(--surface-2); border-radius: var(--r-sm); padding: 8px 10px; color: var(--ink-3); }
.scr-cand .cp-specs b { display: block; font-size: 15px; color: var(--ink); }
.scr-cand .cp-est { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 12px 14px; border-radius: var(--r); background: color-mix(in srgb, var(--brand) 6%, white); }
.scr-cand .cp-est b { font: 800 1.6rem/1 var(--font-head); color: var(--brand); font-variant-numeric: tabular-nums; }
.scr-cand .cp-orders { list-style: none; margin: 0; padding: 0; }
.scr-cand .cp-orders li { display: flex; gap: 10px; align-items: center; padding: 10px 0; border-top: 1px solid var(--line); animation: cbIn .3s var(--ease) both; }
.scr-cand .cp-orders li:first-child { border-top: 0; }
.scr-cand .cp-orders .t { flex: 1; min-width: 0; font-size: 14.5px; }
.scr-cand .cp-orders .t small { display: block; color: var(--ink-3); font-size: 13px; }
.scr-cand .cp-block { padding: 12px 14px; border-radius: var(--r); background: var(--danger-soft); color: var(--danger); font-weight: 600; font-size: 14.5px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
#cb-print-root { display: none; }

/* ---------- social ---------- */
.scr-cand .cs-week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; margin-bottom: 20px; }
.scr-cand .cs-day { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: 9px; min-width: 0; }
.scr-cand .cs-day-h { font-size: 12.5px; color: var(--ink-3); font-weight: 600; }
.scr-cand .cs-day-h b { display: block; font-family: var(--font-head); font-size: 1.35rem; color: var(--ink); line-height: 1.1; }
.scr-cand .cs-pill { all: unset; box-sizing: border-box; cursor: pointer; display: flex; align-items: center; gap: 5px; width: 100%; margin-top: 6px; padding: 4px 6px; border-radius: 6px; font-size: 12.5px; font-weight: 600; background: var(--warn-soft); color: var(--warn); min-height: 44px; }
.scr-cand .cs-pill.ok { background: var(--ok-soft); color: var(--ok); }
.scr-cand .cs-pill span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scr-cand .cs-pill:focus-visible { box-shadow: var(--focus); }
@media (max-width: 760px) { .scr-cand .cs-week { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.scr-cand .cs-posts { display: flex; flex-direction: column; gap: 18px; }
.scr-cand .cs-post { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 0; overflow: hidden; animation: cbIn .35s var(--ease) both; }
.scr-cand .cs-post.flash { animation: cbFlash 1.4s ease; }
@media (max-width: 820px) { .scr-cand .cs-post { grid-template-columns: minmax(0, 1fr); } }
.scr-cand .cs-art { background: var(--surface-2); border-right: 1px solid var(--line); padding: 16px; display: flex; flex-direction: column; gap: 10px; align-items: center; }
@media (max-width: 820px) { .scr-cand .cs-art { border-right: 0; border-bottom: 1px solid var(--line); } }
.scr-cand .cs-art canvas { display: block; width: 100%; height: auto; border-radius: 10px; box-shadow: 0 14px 30px -18px rgba(21,32,46,.5); background: var(--line); }
.scr-cand .cs-art[data-fmt="story"] canvas { width: 62%; }
.scr-cand .cs-art .row { justify-content: center; }
.scr-cand .cs-edit { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.scr-cand .cs-edit-head { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.scr-cand .cs-edit-head h3 { margin: 0; font-size: 1.1rem; }
.scr-cand .cs-plats { display: flex; gap: 6px; flex-wrap: wrap; }
.scr-cand .cs-plats .chip { min-height: 44px; }
.scr-cand .cs-plats .chip[aria-pressed="true"] { background: var(--brand); color: var(--brand-ink); border-color: var(--brand); }
.scr-cand .cs-when { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 140px); gap: 10px; }
.scr-cand .cs-counts { display: flex; gap: 6px; flex-wrap: wrap; }
.scr-cand .cs-count { font-size: 12.5px; font-weight: 700; padding: 3px 8px; border-radius: 999px; background: var(--surface-2); color: var(--ink-2); font-variant-numeric: tabular-nums; }
.scr-cand .cs-count.over { background: var(--danger-soft); color: var(--danger); }
.scr-cand .cs-foot { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding-top: 4px; }
@media (prefers-reduced-motion: reduce) {
  .scr-cand *, .scr-cand *::before, .scr-cand *::after { animation: none !important; transition: none !important; }
}

/* ---------- print output ---------- */
@media print {
  @page cbdoor { size: 4.25in 11in; margin: 0; }
  @page cbpalm { size: 4in 9in; margin: 0; }
  @page cbyard { size: 24in 18in; margin: 0; }
  body.cb-print-ready { background: #fff !important; margin: 0 !important; padding: 0 !important; }
  body.cb-print-ready > *:not(#cb-print-root) { display: none !important; }
  body.cb-print-ready #cb-print-root { display: block !important; }
  #cb-print-root .cb-sheet { display: block; overflow: hidden; break-after: page; page-break-after: always; -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; }
  #cb-print-root .cb-sheet:last-child { break-after: auto; page-break-after: auto; }
  #cb-print-root .cb-sheet svg { display: block; width: 100%; height: 100%; max-width: none; }
  #cb-print-root .cp-guide { display: none; }
  #cb-print-root .cb-sheet[data-piece="door"] { page: cbdoor; width: 4.25in; height: 11in; }
  #cb-print-root .cb-sheet[data-piece="palm"] { page: cbpalm; width: 4in; height: 9in; }
  #cb-print-root .cb-sheet[data-piece="yard"] { page: cbyard; width: 24in; height: 18in; }
  /* Chromium drops a named page back to Letter when an SVG is drawn this large, so draw at half size and scale up (still vector). */
  #cb-print-root .cb-sheet[data-piece="yard"] svg { width: 12in; height: 9in; transform: scale(2); transform-origin: 0 0; }
  #cb-print-root[data-only="door"] .cb-sheet:not([data-piece="door"]),
  #cb-print-root[data-only="palm"] .cb-sheet:not([data-piece="palm"]),
  #cb-print-root[data-only="yard"] .cb-sheet:not([data-piece="yard"]) { display: none !important; }
}
`;
    const s = document.createElement('style');
    s.id = 'scr-cand-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ======================================================================
     1. Pipeline
     ====================================================================== */
  function money(c) {
    const pct = c.goalUsd ? Math.min(100, Math.round(((c.raisedUsd || 0) / c.goalUsd) * 100)) : 0;
    return `<div class="cb-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${pct}% of fundraising goal"><span style="width:${pct}%"></span></div>
      <div class="cb-money"><span><b>${U.fmtUsd(c.raisedUsd || 0)}</b> raised</span><span>${pct}% of ${U.fmtUsd(c.goalUsd || 0)}</span></div>`;
  }
  function needsDisc(c, site) { const s = siteState(c, site); return s.key !== 'none' && !discOf(c, site); }

  function renderPipeline(root, ctx) {
    const all = candidates(ctx);
    const sites = sitesAll();
    const offices = Array.from(new Set(all.map((c) => c.office))).sort();
    const office = offices.includes(App.state.cand_office) ? App.state.cand_office : '';
    const list = office ? all.filter((c) => c.office === office) : all;
    const total = all.reduce((s, c) => s + (c.raisedUsd || 0), 0);
    const goal = all.reduce((s, c) => s + (c.goalUsd || 0), 0);
    const goalPct = goal ? Math.min(100, Math.round((total / goal) * 100)) : 0;
    const live = all.filter((c) => siteState(c, siteOf(c, sites)).key === 'live').length;
    const attention = all.filter((c) => needsDisc(c, siteOf(c, sites)));
    const flash = App.state.cand_flash; App.state.cand_flash = null;
    const log = Store.list('candidateStatusLog').filter((l) => !office || l.office === office).slice(-12).reverse();

    root.insertAdjacentHTML('beforeend', `
      <div class="cb-sum">
        <div class="cb-sum-money"><div class="cb-sum-top"><span><b>${U.fmtUsd(total)}</b> raised of ${U.fmtUsd(goal)}</span><span>${goalPct}%</span></div>
          <div class="cb-bar big" role="progressbar" aria-valuenow="${goalPct}" aria-valuemin="0" aria-valuemax="100" aria-label="${goalPct}% of combined goals"><span style="width:${goalPct}%"></span></div>
          <span class="cb-note">Across ${all.length} ${all.length === 1 ? 'candidate' : 'candidates'}. ${live} campaign ${live === 1 ? 'site is' : 'sites are'} live.</span></div>
        ${attention.length ? `<div class="cb-sum-alert">${IC.warn}<span><b>${attention.length === 1 ? `${esc(attention[0].name)}’s site has` : `${attention.length} sites have`} no “Paid for by” disclaimer.</b> ${attention.length === 1 ? 'It stays' : 'They stay'} private until one is added.</span><a class="btn btn-sm" href="#/candidate/builder/${esc(attention[0].id)}" data-fix-disc="${esc(attention[0].id)}">Add ${esc(firstName(attention[0].name))}’s disclaimer</a></div>`
          : `<div class="cb-sum-ok">${IC.check}<span>Every campaign site has its “Paid for by” disclaimer.</span></div>`}
      </div>
      <div class="cb-filter" role="group" aria-label="Filter by office">
        <button class="chip${office ? '' : ' active'}" data-office="" aria-pressed="${!office}">All offices</button>
        ${offices.map((o) => `<button class="chip${o === office ? ' active' : ''}" data-office="${esc(o)}" aria-pressed="${o === office}">${esc(o)}</button>`).join('')}
      </div>
      <div class="cb-pipe" data-tour="cand-pipeline">
        ${STAGES.map(([key, label, note]) => {
          const col = list.filter((c) => c.status === key);
          return `<section class="cb-col" data-col="${key}" aria-label="${esc(label)}">
            <div class="cb-col-head"><h3>${esc(label)}</h3><span class="cb-count">${col.length}</span></div>
            <div class="cb-col-note">${esc(note)}</div>
            <div class="cb-cards">${col.length ? col.map((c, i) => {
              const site = siteOf(c, sites);
              const st = siteState(c, site);
              return `<article class="cb-card${flash === c.id ? ' flash' : ''}" draggable="true" data-card="${esc(c.id)}" style="animation-delay:${Math.min(i, 6) * 40}ms">
                <div class="cb-card-top">${photoTag(view(c, ctx, site), 44)}<div style="min-width:0"><button class="cb-card-open" data-open="${esc(c.id)}">${esc(c.name)}</button><div class="cb-card-office">${esc(c.office)} · ${esc(c.district)}</div></div></div>
                ${money(c)}
                <div class="cb-card-foot"><span class="badge ${st.cls}">${esc(st.label)}</span><button class="btn btn-ghost btn-sm cb-move" data-move="${esc(c.id)}" aria-haspopup="menu" aria-label="Move ${esc(c.name)} to another stage">${IC.move} Move</button></div>
                ${needsDisc(c, site) ? `<div class="cb-warn">${IC.warn}<span>Missing its “Paid for by” disclaimer. The public site stays private until it’s added.</span></div>` : ''}
              </article>`;
            }).join('') : '<div class="cb-empty">Drag a candidate here</div>'}</div>
          </section>`;
        }).join('')}
      </div>
      <p class="cb-note cb-mt">Drag a card to change its stage, or use its Move button. Every change is logged with your name.</p>
      <div class="card cb-mt">
        <div class="card-head"><h3>Stage changes${office ? ` · ${esc(office)}` : ''}</h3></div>
        <div class="card-body">${log.length ? `<ul class="cb-log">${log.map((l) => `<li><span><b>${esc(l.name)}</b> moved from ${esc(STAGE_LABEL[l.from] || 'new')} to <b>${esc(STAGE_LABEL[l.to] || l.to)}</b>${l.by ? ` by ${esc(l.by)}` : ''}.</span><span class="when">${esc(fmtStamp(l.createdAt))}</span></li>`).join('')}</ul>`
          : `<p class="muted" style="margin:0">No stage changes yet${office ? ' for this office' : ''}. When someone moves a candidate, it shows here with their name and the time.</p>`}</div>
      </div>`);

    const byId = (id) => all.find((c) => c.id === id);
    root.addEventListener('click', (e) => {
      const of = e.target.closest('[data-office]');
      if (of) { App.state.cand_office = of.dataset.office; App.rerender(); return; }
      const mv = e.target.closest('[data-move]');
      if (mv) { e.stopPropagation(); moveMenu(mv, ctx, byId(mv.dataset.move)); return; }
      const op = e.target.closest('[data-open]');
      if (op) { App.state.cand_drawer = op.dataset.open; drawer(root, ctx, byId(op.dataset.open)); }
    });
    /* drag and drop between columns */
    let dragId = null;
    root.addEventListener('dragstart', (e) => {
      const card = e.target.closest('[data-card]');
      if (!card) return;
      dragId = card.dataset.card;
      card.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch (err) { /* ignore */ }
    });
    root.addEventListener('dragend', (e) => {
      const card = e.target.closest('[data-card]');
      if (card) card.classList.remove('dragging');
      root.querySelectorAll('.cb-col.drop').forEach((x) => x.classList.remove('drop'));
    });
    root.addEventListener('dragover', (e) => {
      const col = e.target.closest('[data-col]');
      if (!col || !dragId) return;
      e.preventDefault();
      root.querySelectorAll('.cb-col.drop').forEach((x) => { if (x !== col) x.classList.remove('drop'); });
      col.classList.add('drop');
    });
    root.addEventListener('drop', (e) => {
      const col = e.target.closest('[data-col]');
      if (!col || !dragId) return;
      e.preventDefault();
      const c = byId(dragId);
      dragId = null;
      if (c && c.status !== col.dataset.col) { setStatus(ctx, c, col.dataset.col); App.rerender(); }
      else col.classList.remove('drop');
    });

    const openId = App.state.cand_drawer;
    if (openId && byId(openId)) drawer(root, ctx, byId(openId));
  }

  function moveMenu(btn, ctx, c) {
    document.querySelectorAll('.cb-menu').forEach((m) => m.remove());
    if (!c) return;
    const host = btn.closest('.scr-cand');
    const m = document.createElement('div');
    m.className = 'cb-menu';
    m.setAttribute('role', 'menu');
    m.innerHTML = `<div class="lbl">Move ${esc(firstName(c.name))} to</div>` + STAGES.map(([k, l]) =>
      `<button role="menuitem" data-to="${k}"${c.status === k ? ' aria-current="true" disabled' : ''}>${c.status === k ? IC.check : IC.arrow}${esc(l)}</button>`).join('');
    host.appendChild(m);
    const r = btn.getBoundingClientRect();
    const mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.right - mw)) + 'px';
    m.style.top = (r.bottom + 6 + mh > window.innerHeight ? Math.max(8, r.top - mh - 6) : r.bottom + 6) + 'px';
    const first = m.querySelector('button:not([disabled])');
    if (first) first.focus();
    const close = () => { m.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', key, true); window.removeEventListener('scroll', close, true); };
    const outside = (e) => { if (!m.contains(e.target)) close(); };
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); btn.focus(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = Array.from(m.querySelectorAll('button:not([disabled])'));
        const i = items.indexOf(document.activeElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      }
    };
    setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', key, true); window.addEventListener('scroll', close, true); }, 0);
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-to]');
      if (!b || b.disabled) return;
      close();
      setStatus(ctx, c, b.dataset.to);
      App.rerender();
    });
  }

  function drawer(root, ctx, c) {
    root.querySelectorAll('.cb-drawer-wrap').forEach((x) => x.remove());
    if (!c) return;
    const site = siteOf(c);
    const d = view(c, ctx, site);
    const st = siteState(c, site);
    const w = document.createElement('div');
    w.className = 'cb-drawer-wrap';
    w.innerHTML = `
      <div class="cb-drawer-back" data-close></div>
      <aside class="cb-drawer" role="dialog" aria-modal="true" aria-labelledby="cb-drawer-title">
        <div class="cb-drawer-head">${photoTag(d, 64)}<div style="flex:1;min-width:0"><h2 id="cb-drawer-title">${esc(c.name)}</h2><div class="muted small">${esc(c.office)} · ${esc(c.district)}</div></div>
          <button class="btn btn-ghost btn-sm cb-icon-btn" data-close aria-label="Close">${IC.x}</button></div>
        <div class="cb-drawer-body">
          <div class="row"><span class="badge badge-local">${esc(STAGE_LABEL[c.status] || c.status)}</span><span class="badge ${st.cls}">${esc(st.label)}</span></div>
          <div>${money(c)}</div>
          <div><h4>Stage</h4><div class="cb-stage-seg" role="group" aria-label="Stage">${STAGES.map(([k, l]) => `<button class="btn btn-sm" data-stage="${k}" aria-pressed="${c.status === k}">${esc(l)}</button>`).join('')}</div></div>
          <dl class="cb-dl">
            <dt>Election</dt><dd>${esc(fmtDate(d.electionDate, { month: 'long', day: 'numeric', year: 'numeric' }))}</dd>
            <dt>Committee</dt><dd>${esc(d.committeeName || 'Not added yet')}</dd>
            <dt>FPPC ID</dt><dd>${esc(d.fppcId || 'Not added yet')}</dd>
            <dt>Disclaimer</dt><dd>${d.disclaimer ? esc(d.disclaimer) : '<span class="badge badge-danger">Missing. Add it in the builder’s compliance step.</span>'}</dd>
          </dl>
          <div class="cb-links">
            <a class="btn btn-primary" href="#/candidate/builder/${esc(c.id)}">${IC.pen} ${site ? 'Edit campaign site' : 'Build campaign site'}</a>
            <a class="btn" href="#/candidate/microsite/${esc(c.id)}">${IC.site} Preview campaign site</a>
            <a class="btn" href="#/candidate/print/${esc(c.id)}">${IC.print} Open print proofs</a>
            <a class="btn" href="#/candidate/social/${esc(c.id)}">${IC.chat} Open social posts</a>
          </div>
          ${d.headline ? `<p class="cb-note" style="margin:0">Headline: “${esc(d.headline)}”</p>` : ''}
        </div>
      </aside>`;
    root.appendChild(w);
    const close = () => { App.state.cand_drawer = null; w.remove(); document.removeEventListener('keydown', onKey); };
    function onKey(e) {
      if (!w.isConnected) { document.removeEventListener('keydown', onKey); return; }
      if (e.key === 'Escape' && !document.querySelector('.modal-backdrop') && !document.querySelector('.cb-menu')) close();
    }
    document.addEventListener('keydown', onKey);
    w.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) { close(); return; }
      if (e.target.closest('a[href]')) { App.state.cand_drawer = null; return; }
      const sb = e.target.closest('[data-stage]');
      if (sb && sb.dataset.stage !== c.status) { setStatus(ctx, c, sb.dataset.stage); App.state.cand_drawer = c.id; App.rerender(); }
    });
    setTimeout(() => { const b = w.querySelector('.cb-drawer [data-close]'); if (b) b.focus(); }, 30);
  }

  /* ======================================================================
     Preview pane (iframe of campaign.html, phone or desktop)
     ====================================================================== */
  function previewHtml(url, extra) {
    const mode = App.state.cand_pv || 'phone';
    return `<div class="cb-pv" data-mode="${mode}">
      <div class="cb-pv-bar"><div class="cb-seg" role="group" aria-label="Preview size">
        <button type="button" data-pvmode="phone" aria-pressed="${mode === 'phone'}">Phone</button><button type="button" data-pvmode="desktop" aria-pressed="${mode === 'desktop'}">Desktop</button></div>
        <span class="spacer"></span>${extra || ''}</div>
      ${url ? `<div class="cb-pv-stage"><div class="cb-pv-device"><iframe data-pv title="Campaign site preview" src="${esc(url)}"></iframe></div></div>`
        : '<div class="cb-pv-empty">The preview appears once the candidate has a name and office.</div>'}
    </div>`;
  }
  function wirePreview(host, maxH, onLoad) {
    const pv = host.querySelector('.cb-pv');
    if (!pv) return;
    const stage = pv.querySelector('.cb-pv-stage');
    const fit = () => {
      if (!stage || !stage.isConnected) return;
      const phone = pv.dataset.mode === 'phone';
      const W = phone ? 390 : 1280, H = phone ? 800 : 860;
      const avail = stage.clientWidth;
      if (!avail) return;
      let s = Math.min(1, avail / (W + 24));
      s = Math.min(s, (maxH || 660) / (H + 24));
      const dev = stage.querySelector('.cb-pv-device');
      dev.style.width = (W + 24) + 'px';
      dev.style.height = (H + 24 + (phone ? 0 : 34)) + 'px';
      dev.style.transform = `scale(${s})`;
      dev.style.left = Math.max(0, (avail - (W + 24) * s) / 2) + 'px';
      stage.style.height = ((H + 24 + (phone ? 0 : 34)) * s) + 'px';
    };
    if (stage) {
      fit();
      if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (!stage.isConnected) { ro.disconnect(); return; } fit(); }); ro.observe(stage); }
      const fr = stage.querySelector('iframe');
      if (fr && onLoad) fr.addEventListener('load', () => onLoad(fr));
    }
    pv.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pvmode]');
      if (!b) return;
      App.state.cand_pv = b.dataset.pvmode;
      pv.dataset.mode = b.dataset.pvmode;
      pv.querySelectorAll('[data-pvmode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      fit();
    });
  }

  /* ======================================================================
     2. Builder
     ====================================================================== */
  const STEPS = ['Intake', 'Design', 'Content', 'Compliance', 'Publish'];
  let W = null;          // working copy {key, tenant, cid, isNew, doc, dirty}
  let saveTimer = 0;
  let pvRaf = 0;

  function palettes(ctx) {
    const tc = ctx.tenant.colors || {};
    return [[tc.brand, tc.accent, 'County colors'], ['#7A1F2B', '#8F650C', 'Burgundy and gold'], ['#1F3A5F', '#B4470F', 'Navy and orange'], ['#2F4F4F', '#B23A48', 'Slate and red'], ['#3B2E5A', '#8C6512', 'Plum and gold']];
  }
  function issueBank(office) {
    const o = String(office || '');
    if (/school|education|college|trustee/i.test(o)) return ['Reading and math skills come first', 'Budget reports any parent can read', 'Career and trade pathways in every high school', 'Parents as partners on curriculum', 'Safe, well-lit campuses'];
    if (/water/i.test(o)) return ['Rate increases tied to published project lists', 'More local water storage', 'Independent audits of capital spending', 'Stable rates for families and farms'];
    if (/supervisor/i.test(o)) return ['Repair roads on a published schedule', 'A real rainy-day reserve', 'Faster permits for homes and small businesses', 'Every county contract posted online'];
    if (/council|city|mayor/i.test(o)) return ['Fully staffed police and faster 911 response', 'Fix roads before new projects', 'Faster permits for small businesses', 'A city hall that answers the phone'];
    return ['Lower costs for families', 'Safe neighborhoods', 'Every public dollar posted online', 'Faster permits for small businesses'];
  }
  function headlineSugs(d, c) {
    const f = firstName(d.name);
    const out = [];
    if (c && c.slogan) out.push(slogan(c));
    if (d.district) out.push(`${f} works for ${d.district}.`);
    if ((d.issues || [])[0]) out.push(`${d.issues[0]}, with ${f} on the ${String(d.office || 'job').toLowerCase().replace(/ director| trustee/, '')}.`);
    if (d.district) out.push(`Put ${d.district} first.`);
    return Array.from(new Set(out.filter(Boolean))).filter((x) => x !== d.headline).slice(0, 3);
  }
  function aboutSugs(d, c, ctx) {
    const f = firstName(d.name);
    const iss = (d.issues || []).filter(Boolean);
    const out = [];
    const tail = iss[0] ? ` ${f}’s first priority for ${d.district}: ${lc1(iss[0])}.` : '';
    if (c && c.bio) out.push(`${c.bio}${tail}`);
    out.push(`${d.name} lives in ${ctx.tenant.county || 'the county'} and is running for ${d.office} in ${d.district}.${tail}${iss[1] ? ` Next on the list: ${lc1(iss[1])}.` : ''}`);
    return out.filter((x) => x !== d.about);
  }

  function workFor(ctx, c, isNew, mode) {
    const key = ctx.tenantSlug + ':' + (isNew ? 'new' : c.id) + ':' + (mode || 'committee');
    if (W && W.key === key) {
      if (!isNew) { const s = siteOf(c); if (s && !W.dirty) W.doc = Object.assign(clone(s), { step: W.doc.step }); }
      return W;
    }
    if (isNew) {
      const tc = ctx.tenant.colors || {};
      W = { key, mode: mode || 'committee', tenant: ctx.tenantSlug, cid: null, isNew: true, dirty: false, doc: {
        candidateId: null, slug: '', status: 'draft', name: '', office: '', district: '', electionDate: '2026-11-03',
        committeeName: '', fppcId: '', disclaimer: '', headline: '', about: '', issues: [''], donateUrl: '', volunteerOn: true,
        photo: null, photoPos: '', colors: { brand: tc.brand, accent: tc.accent }, template: 'classic', step: 1 } };
    } else {
      const s = siteOf(c);
      W = { key, mode: mode || 'committee', tenant: ctx.tenantSlug, cid: c.id, isNew: false, dirty: false, doc: s ? clone(s) : defaultSite(c, ctx) };
      if (s && s.step) W.doc.step = s.step;
    }
    return W;
  }

  function saveState(state) {
    const el = document.querySelector('.scr-cand [data-save]');
    if (!el) return;
    el.className = 'cb-save ' + state;
    el.innerHTML = '<i></i>' + (state === 'saving' ? 'Saving…' : state === 'pending' ? 'Saves when you continue'
      : state === 'suggest' ? 'Edits wait until you suggest them' : state === 'suggest-none' ? 'Edits become suggestions' : 'All changes saved');
  }
  function queueSave() {
    if (!W || W.isNew) return;
    W.dirty = true;
    if (W.suggest) { saveState('suggest'); const b = document.querySelector('.scr-cand [data-act="suggest"]'); if (b) b.disabled = !suggestDiff().length; return; }
    saveState('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 500);
  }
  function flushSave() {
    clearTimeout(saveTimer); saveTimer = 0;
    if (!W || W.isNew || !W.dirty || W.suggest) return;
    const d = W.doc;
    if (W.mode === 'candidate') d.handedOver = true;
    if ((d.status === 'live' || d.status === 'review') && blockers(d).length) {
      const was = d.status;
      d.status = 'draft';
      App.toast(was === 'live' ? 'The site went private: it fails a required check, such as the “Paid for by” disclaimer.' : 'Moved back to draft: a required check no longer passes.', 'warn', { duration: 5000 });
    }
    const dbt = db(W.tenant);
    const payload = clone(d);
    delete payload.id; delete payload.createdAt; delete payload.createdBy; delete payload.updatedAt;
    if (d.id) dbt.update('campaignSites', d.id, payload);
    else { const saved = dbt.add('campaignSites', payload); d.id = saved.id; }
    W.dirty = false;
    saveState('saved');
  }
  function postPreview() {
    if (pvRaf) return;
    pvRaf = requestAnimationFrame(() => {
      pvRaf = 0;
      const fr = document.querySelector('.scr-cand iframe[data-pv]');
      if (fr && fr.contentWindow && W) fr.contentWindow.postMessage({ type: 'rccc:campaign-preview', site: clone(W.doc) }, location.origin);
    });
  }

  /* Fields a committee member can suggest on a candidate-run site. */
  const SUGGEST_FIELDS = [['headline', 'Headline'], ['about', 'About'], ['issues', 'Priorities'], ['name', 'Name'], ['office', 'Office'], ['district', 'District'],
    ['electionDate', 'Election date'], ['donateUrl', 'Donate link'], ['volunteerOn', 'Volunteer form'], ['photo', 'Headshot'], ['colors', 'Colors'], ['template', 'Layout'],
    ['committeeName', 'Committee name'], ['fppcId', 'FPPC ID'], ['disclaimer', '“Paid for by” disclaimer']];
  const SUGGEST_LABEL = Object.fromEntries(SUGGEST_FIELDS);
  const norm = (v) => JSON.stringify(Array.isArray(v) ? v.map((x) => String(x || '').trim()).filter(Boolean) : (v == null ? '' : v));
  function suggestDiff() {
    if (!W || !W.cid) return [];
    const c = { id: W.cid };
    const base = siteOf(c) || {};
    return SUGGEST_FIELDS.map(([f]) => f).filter((f) => norm(base[f]) !== norm(W.doc[f]))
      .map((f) => ({ field: f, from: clone(base[f] === undefined ? null : base[f]), to: clone(Array.isArray(W.doc[f]) ? W.doc[f].filter((x) => String(x || '').trim()) : W.doc[f]) }));
  }
  function fmtVal(field, v) {
    if (v == null || v === '') return 'Empty';
    if (Array.isArray(v)) return v.join(' · ') || 'Empty';
    if (field === 'volunteerOn') return v ? 'Shown' : 'Hidden';
    if (field === 'colors') return 'New colors';
    if (field === 'photo') return String(v).startsWith('data:') ? 'Uploaded photo' : 'Photo ' + (PHOTOS.indexOf(v) + 1);
    if (field === 'template') return (TEMPLATES.find((t) => t[0] === v) || [0, v])[1];
    return String(v);
  }
  /* Accept or decline one suggestion. Accepting applies it to the live site (the disclaimer check still applies). */
  function decideSuggestion(ctx, id, accept) {
    const sg = Store.list('siteSuggestions').find((x) => x.id === id);
    if (!sg || sg.status !== 'pending') return null;
    Store.update('siteSuggestions', id, { status: accept ? 'accepted' : 'declined', decidedBy: ctx.user ? ctx.user.name : null, decidedAt: new Date().toISOString() });
    if (accept) {
      const site = Store.list('campaignSites').find((x) => x.slug === sg.campaignSlug || x.candidateId === sg.candidateId);
      if (site) {
        const next = Object.assign({}, site, { [sg.field]: clone(sg.to) });
        const patch = { [sg.field]: clone(sg.to) };
        if (next.status === 'live' && blockers(next).length) patch.status = 'draft';
        Store.update('campaignSites', site.id, patch);
        if (W && W.cid === site.candidateId && !W.dirty) W = null;
        return patch.status === 'draft' ? 'private' : 'applied';
      }
    }
    return 'declined';
  }
  function suggestionsFor(slug, status) { return Store.list('siteSuggestions').filter((x) => x.campaignSlug === slug && (!status || x.status === status)); }

  /* ---------- ownership, invites and endorsement ---------- */
  function invitesFor(slug) {
    let list = [];
    try { if (App.auth && typeof App.auth.listInvites === 'function') list = App.auth.listInvites({ campaignSlug: slug }) || []; } catch (e) { list = []; }
    if (!Array.isArray(list) || !list.length) list = Store.list('invites');
    return list.filter((i) => i && i.campaignSlug === slug);
  }
  function teamFor(slug, tenant) {
    let accts = [];
    try { accts = Store.global.list('accounts'); } catch (e) { accts = []; }
    return accts.filter((a) => a.role === 'candidate' && a.campaignSlug === slug && (!a.tenant || a.tenant === tenant));
  }
  function ownerInfo(ctx, c) {
    const d = view(c, ctx);
    const inv = invitesFor(d.slug);
    const owned = !!(siteOf(c) || {}).handedOver || inv.some((i) => i.status === 'claimed' && (i.campaignRole || 'owner') === 'owner');
    /* Sample candidate accounts count once the campaign is handed over. */
    const all = teamFor(d.slug, ctx.tenantSlug);
    const real = all.filter((a) => !a.sample);
    const team = real.length ? real : (owned ? all : []);
    return { slug: d.slug, owned, invites: inv, owners: team.filter((a) => (a.campaignRole || 'owner') === 'owner'), staff: team.filter((a) => a.campaignRole === 'staff') };
  }
  function acctName(id) { try { const a = Store.global.list('accounts').find((x) => x.id === id); return a ? a.name : ''; } catch (e) { return ''; } }
  function inviteLink(inv) { return inv && inv.token ? new URL(`app.html?tenant=${encodeURIComponent(App.state.tenant)}#/claim/${encodeURIComponent(inv.token)}`, location.href).href : ''; }
  function ensureSiteDoc(c, ctx) {
    const s = siteOf(c);
    if (s) return s;
    return Store.add('campaignSites', defaultSite(c, ctx));
  }
  function setEndorsementPause(ctx, c, paused, reason) {
    const s = ensureSiteDoc(c, ctx);
    const by = ctx.user ? ctx.user.name : null;
    Store.update('campaignSites', s.id, paused ? { endorsementPaused: true, endorsementPause: { reason, by, at: new Date().toISOString() } } : { endorsementPaused: false, endorsementPause: null });
    Store.add('endorsementLog', { candidateId: c.id, campaignSlug: s.slug, action: paused ? 'paused' : 'restored', reason: reason || null, by });
    if (W && W.cid === c.id) W = null;
  }

  function tplThumb(id, b, a) {
    const hero = id === 'classic'
      ? `<rect width="120" height="46" fill="${b}"/><rect x="74" y="0" width="46" height="46" fill="#C9D1DB"/><circle cx="97" cy="20" r="8" fill="#9AA6B4"/><rect x="8" y="14" width="46" height="8" rx="2" fill="#fff"/><rect x="8" y="26" width="32" height="4" rx="2" fill="#fff" opacity=".7"/><rect x="8" y="34" width="18" height="6" rx="3" fill="${a}"/>`
      : id === 'banner'
        ? `<rect width="120" height="54" fill="#B4BEC9"/><circle cx="84" cy="20" r="10" fill="#8C98A6"/><rect width="120" height="54" fill="${b}" opacity=".55"/><rect x="8" y="26" width="56" height="9" rx="2" fill="#fff"/><rect x="8" y="39" width="20" height="6" rx="3" fill="${a}"/>`
        : `<rect width="120" height="54" fill="${b}" opacity=".1"/><rect x="72" y="6" width="40" height="42" rx="6" fill="#C9D1DB"/><circle cx="92" cy="22" r="8" fill="#9AA6B4"/><rect x="8" y="14" width="46" height="8" rx="2" fill="${b}"/><rect x="8" y="26" width="34" height="4" rx="2" fill="${a}"/><rect x="8" y="35" width="18" height="6" rx="3" fill="${a}"/>`;
    return `<svg viewBox="0 0 120 80" aria-hidden="true"><rect width="120" height="80" fill="#fff"/>${hero}<rect y="${id === 'classic' ? 46 : 54}" width="120" height="5" fill="${a}"/>
      <rect x="8" y="64" width="31" height="10" rx="2" fill="#EEF1F5"/><rect x="44" y="64" width="31" height="10" rx="2" fill="#EEF1F5"/><rect x="80" y="64" width="31" height="10" rx="2" fill="#EEF1F5"/></svg>`;
  }

  function fld(key, label, val, o) {
    o = o || {};
    const id = 'cbf-' + key;
    const input = o.area
      ? `<textarea class="textarea" id="${id}" data-f="${key}" rows="${o.rows || 5}"${o.max ? ` maxlength="${o.max}"` : ''} placeholder="${esc(o.ph || '')}">${esc(val)}</textarea>`
      : `<input class="input" id="${id}" data-f="${key}" value="${esc(val)}"${o.type ? ` type="${o.type}"` : ''}${o.max ? ` maxlength="${o.max}"` : ''}${o.mode ? ` inputmode="${o.mode}"` : ''} placeholder="${esc(o.ph || '')}"${o.auto ? ` autocomplete="${o.auto}"` : ''}>`;
    return `<div class="cb-field${o.full ? ' full' : ''}"><label class="lbl" for="${id}"><span>${label}</span>${o.max ? `<span class="cnt" data-cnt="${key}">${String(val || '').length}/${o.max}</span>` : ''}</label>${input}${o.hint ? `<span class="cb-hint">${o.hint}</span>` : ''}${o.after || ''}</div>`;
  }
  function sugBox(field, list) {
    if (!list.length) return '';
    return `<div class="cb-suggest"><div class="cb-suggest-h">Suggested wording</div>${list.map((t) =>
      `<button type="button" class="cb-sug" data-sug="${field}" data-val="${esc(t)}"><span class="t">${esc(t.length > 180 ? t.slice(0, 177) + '…' : t)}</span><span class="u">Use this</span></button>`).join('')}</div>`;
  }
  function checklistHtml(d) {
    return `<ul class="cb-checks">${checks(d).map((x) => `<li class="${x.ok ? 'ok' : 'bad ' + (x.block ? 'block' : 'soft')}">
      <span class="ic">${x.ok ? IC.check : x.block ? IC.x : IC.warn}</span>
      <span style="min-width:0"><b>${esc(x.label)}</b>${x.ok ? '' : `<span class="why">${esc(x.bad)}${x.block ? '' : ' Recommended.'}</span>`}</span>
      ${x.ok || x.step === d.step ? '' : `<button type="button" class="btn btn-ghost btn-sm go" data-goto="${x.step}">Fix</button>`}</li>`).join('')}</ul>`;
  }

  function stepBody(d, ctx, c) {
    const s = d.step;
    if (s === 1) {
      return `<h2>Who is running</h2><p class="cb-lead">${W.isNew ? 'Start with the candidate’s name and office. The committee name and disclaimer fill in from these on the compliance step.' : 'Check the candidate’s details. These show at the top of the campaign site and on every print piece.'}</p>
        <div class="cb-form">
          ${fld('name', 'Candidate name', d.name, { ph: 'First and last name', auto: 'off' })}
          ${fld('office', 'Office', d.office, { ph: 'City Council' })}
          ${fld('district', 'District or area', d.district, { ph: 'District 4' })}
          ${fld('electionDate', 'Election date', d.electionDate, { type: 'date' })}
        </div>`;
    }
    if (s === 2) {
      const pal = palettes(ctx);
      const custom = d.photo && !PHOTOS.includes(d.photo);
      return `<h2>Design</h2><p class="cb-lead">Pick a layout, colors and a headshot. The preview updates as you choose.</p>
        <div class="stack">
          <div><div class="cb-field"><span class="lbl">Layout</span></div>
            <div class="cb-tpls" role="radiogroup" aria-label="Layout">${TEMPLATES.map(([id, label, note]) => `<button type="button" class="cb-tpl" role="radio" aria-checked="${d.template === id}" data-tpl="${id}">${tplThumb(id, d.colors.brand, d.colors.accent)}<b>${esc(label)}</b>${esc(note)}</button>`).join('')}</div></div>
          <div><div class="cb-field"><span class="lbl">Colors</span></div>
            <div class="cb-sw" role="radiogroup" aria-label="Colors">${pal.map(([b, a, l]) => `<button type="button" class="cb-swatch" role="radio" aria-checked="${d.colors.brand === b && d.colors.accent === a}" data-sw="${b}|${a}"><span class="chips"><i style="background:${b}"></i><i style="background:${a}"></i></span>${esc(l)}</button>`).join('')}</div></div>
          <div><div class="cb-field"><span class="lbl">Headshot</span></div>
            <div class="cb-photos" role="radiogroup" aria-label="Headshot">
              ${PHOTOS.map((p, i) => `<button type="button" class="cb-photo" role="radio" aria-checked="${d.photo === p}" data-photo="${p}" aria-label="Photo ${i + 1}"><img src="${p}" alt="" style="object-position:${FOCUS_CSS[p]}"></button>`).join('')}
              ${custom ? `<button type="button" class="cb-photo" role="radio" aria-checked="true" aria-label="Uploaded photo"><img src="${esc(d.photo)}" alt=""></button>` : ''}
              <label class="btn btn-sm cb-upload">${IC.upload} ${d.photo ? 'Replace headshot' : 'Upload a headshot'}<input type="file" accept="image/*" data-upload aria-label="Upload a headshot"></label>
              ${d.photo ? '<button type="button" class="btn btn-ghost btn-sm" data-photo="">Remove photo</button>' : ''}
            </div>
            <p class="cb-hint" style="margin-top:6px">A sharp, front-facing photo works best. We resize uploads to fit the page.</p></div>
        </div>`;
    }
    if (s === 3) {
      const issues = d.issues && d.issues.length ? d.issues : [''];
      const bank = issueBank(d.office).filter((x) => !issues.includes(x));
      return `<h2>Content</h2><p class="cb-lead">Write in the candidate’s own voice. Suggested wording is a starting point to edit.</p>
        <div class="cb-form">
          ${fld('headline', 'Headline', d.headline, { full: true, max: 90, ph: 'One line voters remember', after: sugBox('headline', headlineSugs(d, c)) })}
          ${fld('about', 'About the candidate', d.about, { full: true, area: true, rows: 6, max: 900, ph: 'Where they live, what they do and why they’re running', after: sugBox('about', aboutSugs(d, c, ctx)) })}
          <div class="cb-field full"><span class="lbl">Priorities <span class="cnt">${issues.filter(Boolean).length} of 5</span></span>
            <div class="stack" style="gap:8px" data-issues>${issues.map((x, i) => `<div class="cb-issue-row"><span class="num">${i + 1}</span><input class="input" data-issue="${i}" value="${esc(x)}" maxlength="80" aria-label="Priority ${i + 1}" placeholder="A specific promise"><button type="button" class="btn btn-ghost cb-icon-btn" data-rmissue="${i}" aria-label="Remove priority ${i + 1}">${IC.trash}</button></div>`).join('')}</div>
            <div class="row" style="margin-top:4px">${issues.length < 5 ? `<button type="button" class="btn btn-sm" data-addissue>${IC.plus} Add a priority</button>` : ''}</div>
            ${bank.length && issues.length < 5 ? `<div class="cb-suggest"><div class="cb-suggest-h">Suggested priorities for ${esc(d.office || 'this office')}</div><div class="cb-chipsugs">${bank.map((x) => `<button type="button" class="chip" data-addsug="${esc(x)}">${IC.plus} ${esc(x)}</button>`).join('')}</div></div>` : ''}
          </div>
          ${fld('donateUrl', 'Donate link', d.donateUrl, { full: true, type: 'url', ph: 'https://secure.winred.com/…', hint: 'The campaign’s WinRed page. The Donate buttons open it in a new tab.' })}
          <label class="toggle full"><input type="checkbox" data-vol ${d.volunteerOn !== false ? 'checked' : ''}> Show the volunteer sign-up form</label>
        </div>`;
    }
    if (s === 4) {
      const auto = d.committeeName && d.fppcId ? composeDisc(d.committeeName, d.fppcId) : '';
      return `<h2>Compliance</h2><p class="cb-lead">California requires a “Paid for by” line on campaign websites and print. The site cannot publish until every red item below passes.</p>
        <div class="cb-form">
          ${fld('committeeName', 'Committee name', d.committeeName, { full: true, ph: `${d.name || 'Candidate'} for ${d.office || 'Office'} 2026`, hint: 'The name on the committee’s Form 410 filing.' })}
          ${fld('fppcId', 'FPPC ID', d.fppcId, { mode: 'numeric', max: 9, ph: '1234567', hint: 'From the FPPC (California Fair Political Practices Commission) filing.' })}
          <div></div>
          ${fld('disclaimer', '“Paid for by” disclaimer', d.disclaimer, { full: true, ph: 'Paid for by …, FPPC ID #…', after: auto && auto !== d.disclaimer ? `<div class="row"><button type="button" class="btn btn-sm" data-autodisc>${IC.pen} Write it from the committee name and FPPC ID</button></div>` : '' })}
          <div class="full"><div class="cb-field"><span class="lbl">How it shows on the site</span></div>
            <div class="cb-disc-preview${d.disclaimer ? '' : ' missing'}" data-discpv>${d.disclaimer ? esc(d.disclaimer) : 'Disclaimer missing'}</div></div>
          <div class="full"><div class="cb-field"><span class="lbl">Checks</span></div><div data-checks>${checklistHtml(d)}</div></div>
        </div>`;
    }
    const lead = W.mode === 'candidate' ? 'Your edits go live as soon as every required check passes. The committee keeps the endorsement badge and the disclaimer check.'
      : W.suggest ? `${esc(firstName(d.name))} runs this site now. Your edits go to ${esc(firstName(d.name))} as suggestions to accept or decline.`
        : 'A board member sends the site for approval, and a board member approves it before it goes public. Approvals are recorded by name.';
    return `<h2>Publish</h2><p class="cb-lead">${lead}</p>
      <div data-pub>${publishHtml(d, ctx)}</div>
      <div class="cb-mt"><div class="cb-field"><span class="lbl">Checks</span></div><div data-checks>${checklistHtml(d)}</div></div>`;
  }

  function publishHtml(d, ctx) {
    const bl = blockers(d);
    const order = ['draft', 'review', 'live'];
    const at = order.indexOf(d.status);
    const url = d.slug ? campaignUrl(W.tenant, d.slug) : '';
    const me = ctx.user || {};
    let act = '';
    const L = W.links || {};
    if (W.mode === 'candidate') {
      act = d.status === 'live'
        ? `<p style="margin:0"><span class="badge badge-ok">${IC.check} Live</span> Your site is public. Changes go live as soon as they save.</p>
          <div class="row"><a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener">${IC.out} Open your site</a><button type="button" class="btn btn-ghost" data-act="unpublish">Take your site offline</button></div>`
        : `<button type="button" class="btn btn-primary big" data-act="publish"${bl.length ? ' disabled aria-disabled="true"' : ''}>Publish your site</button>
          ${bl.length ? `<p class="small" style="color:var(--danger);font-weight:600;margin:0">${bl.length === 1 ? 'One required check is' : `${bl.length} required checks are`} still open. Fix ${bl.length === 1 ? 'it' : 'them'} to publish.</p>` : '<p class="small muted" style="margin:0">Every required check passes. Publishing makes your site public right away.</p>'}`;
    } else if (W.suggest) {
      const n = suggestDiff().length;
      act = `<p style="margin:0">${d.status === 'live' ? `<span class="badge badge-ok">${IC.check} Live</span> ` : ''}${esc(firstName(d.name))} publishes this site. ${n ? `You have ${n} unsent ${n === 1 ? 'edit' : 'edits'}.` : 'Edit any step, then suggest the change.'}</p>
        <div class="row"><button type="button" class="btn btn-primary big" data-act="suggest"${n ? '' : ' disabled'}>Suggest this change</button>${url ? `<a class="btn btn-ghost" href="${esc(url)}" target="_blank" rel="noopener">${IC.out} Open campaign site</a>` : ''}</div>`;
    } else if (d.status === 'draft') {
      act = `<button type="button" class="btn btn-primary big" data-act="submit" data-tour="wizard-launch"${bl.length ? ' disabled aria-disabled="true"' : ''}>Send for board approval</button>
        ${bl.length ? `<p class="small" style="color:var(--danger);font-weight:600;margin:0">${bl.length === 1 ? 'One required check is' : `${bl.length} required checks are`} still open. Fix ${bl.length === 1 ? 'it' : 'them'} to send the site for approval.</p>` : '<p class="small muted" style="margin:0">Every required check passes. The site stays private until a board member approves it.</p>'}`;
    } else if (d.status === 'review') {
      const self = d.submittedById && d.submittedById === me.id;
      act = `<p style="margin:0"><b>${esc(d.submittedBy || 'A board member')}</b> sent this for approval on ${esc(fmtStamp(d.submittedAt))}.</p>
        ${self ? '<p class="small muted" style="margin:0">You sent this one. Another board member should approve it when possible; you can still approve it yourself and your name is recorded.</p>' : ''}
        <div class="row"><button type="button" class="btn btn-primary big" data-act="approve" data-tour="wizard-launch"${bl.length ? ' disabled aria-disabled="true"' : ''}>Approve and publish</button>
        <button type="button" class="btn btn-ghost" data-act="todraft">Send back to draft</button></div>`;
    } else {
      act = `<p style="margin:0"><span class="badge badge-ok">${IC.check} Live</span> ${d.approvedBy ? `Approved by <b>${esc(d.approvedBy)}</b> on ${esc(fmtStamp(d.approvedAt))}.` : 'Published before this record started.'}</p>
        <p class="small muted" style="margin:0">Edits you make now show on the public site as soon as they save. If a required check fails, the site goes private on its own.</p>
        <div class="row"><a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener" data-tour="wizard-launch">${IC.out} Open campaign site</a><button type="button" class="btn btn-ghost" data-act="unpublish">Take the site offline</button></div>`;
    }
    if (W.mode === 'candidate' || W.suggest) {
      return `<div class="cb-pubbox">${act}
        ${url ? `<div class="cb-addr"><span class="muted">Address</span><code>${esc(url)}</code><button type="button" class="btn btn-sm" data-act="copy">${IC.copy} Copy link</button></div>` : ''}</div>
      ${d.candidateId ? `<div class="cb-next cb-mt"><a class="btn" href="${esc(L.print || '#/candidate/print/' + d.candidateId)}">${IC.print} Make print proofs</a><a class="btn" href="${esc(L.social || '#/candidate/social/' + d.candidateId)}">${IC.chat} Draft social posts</a></div>` : ''}`;
    }
    return `<ol class="cb-timeline" aria-label="Site status">${['Draft', 'Board approval', 'Live'].map((l, i) => `<li class="${i < at || (i === at && d.status === 'live') ? 'on' : i === at ? 'cur' : ''}"${i === at ? ' aria-current="step"' : ''}>${l}</li>`).join('')}</ol>
      <div class="cb-pubbox">${act}
        ${url ? `<div class="cb-addr"><span class="muted">Address</span><code>${esc(url)}</code><button type="button" class="btn btn-sm" data-act="copy">${IC.copy} Copy link</button></div>` : ''}</div>
      ${d.candidateId ? `<div class="cb-next cb-mt"><a class="btn" href="${esc(L.print || '#/candidate/print/' + d.candidateId)}">${IC.print} Make print proofs</a><a class="btn" href="${esc(L.social || '#/candidate/social/' + d.candidateId)}">${IC.chat} Draft social posts</a></div>` : ''}`;
  }

  function stepDone(d, i) {
    const ck = checks(d);
    const ok = (ids) => ids.every((id) => (ck.find((x) => x.id === id) || {}).ok);
    return [ok(['name']), !!d.template && !!d.photo, ok(['headline', 'issues', 'donate']), ok(['committee', 'fppc', 'disc']), d.status === 'live'][i];
  }
  function stepsHtml(d) {
    return STEPS.map((s, i) => `<li><button type="button" class="cb-step${d.step === i + 1 ? ' current' : ''}${stepDone(d, i) ? ' done' : ''}" data-step="${i + 1}"${d.step === i + 1 ? ' aria-current="step"' : ''}${W.isNew && i > 0 ? ' disabled' : ''}>
      <span class="cb-step-l"><span class="n">${stepDone(d, i) ? IC.check : i + 1}</span><span>${s}</span></span></button></li>`).join('');
  }

  function footBtns(d) {
    const sug = W.suggest ? `<button type="button" class="btn${d.step === 5 ? ' btn-primary' : ''}" data-act="suggest"${suggestDiff().length ? '' : ' disabled'}>Suggest this change</button>` : '';
    return `${d.step > 1 ? `<button type="button" class="btn btn-ghost" data-act="back">${IC.back} Back</button>` : ''}${d.step === 5 ? '' : sug}
      ${d.step < 5 ? `<button type="button" class="btn btn-primary" data-act="next">${W.isNew ? 'Save and continue' : `Next: ${STEPS[d.step]}`} ${IC.arrow}</button>` : ''}`;
  }
  function renderBuilder(root, ctx, idParam, opts) {
    const o = opts || {};
    const mode = o.mode || 'committee';
    flushSave();
    const list = mode === 'candidate' ? candidates(ctx).filter((x) => x.id === idParam) : candidates(ctx);
    const isNew = mode !== 'candidate' && (idParam === 'new' || !list.length);
    if (!isNew && !list.length) { root.insertAdjacentHTML('beforeend', emptyCard()); return; }
    let c = null;
    if (!isNew) {
      c = list.find((x) => x.id === idParam);
      if (!c) {
        const sel = (App.state.cand_sel || {})[ctx.tenantSlug];
        c = list.find((x) => x.id === sel) || list.find((x) => (x.status === 'ENDORSED' || x.status === 'ACTIVE_CAMPAIGN') && siteState(x, siteOf(x)).key !== 'live') || list[0];
      }
      (App.state.cand_sel = App.state.cand_sel || {})[ctx.tenantSlug] = c.id;
    }
    const w = workFor(ctx, c, isNew, mode);
    w.links = o.links || {};
    w.suggest = mode === 'committee' && !isNew && ownerInfo(ctx, c).owned;
    const d = w.doc;
    const owner = w.suggest ? ownerInfo(ctx, c) : null;
    const pendingSug = c ? suggestionsFor(d.slug, 'pending').length : 0;
    const pvUrl = d.slug ? campaignUrl(ctx.tenantSlug, d.slug, '&preview=1') : '';
    const pubUrl = d.slug ? campaignUrl(ctx.tenantSlug, d.slug) : '';
    const st = c ? siteState(c, siteOf(c)) : { label: 'New', cls: '' };

    root.insertAdjacentHTML('beforeend', `
      <div class="cb-toolbar">${mode === 'candidate' ? '' : picker(list, c, 'Campaign site for', `<option value="new"${isNew ? ' selected' : ''}>New candidate…</option>`)}
        <span class="spacer"></span><span class="badge ${st.cls}" data-stbadge>${esc(st.label)}</span>
        <span class="cb-save ${isNew ? 'pending' : w.suggest ? 'suggest-none' : 'saved'}" data-save aria-live="polite"><i></i>${isNew ? 'Saves when you continue' : w.suggest ? 'Edits become suggestions' : 'All changes saved'}</span></div>
      ${w.suggest ? `<div class="cb-owned" role="note">${IC.site}<span><b>${esc(owner.owners[0] ? owner.owners[0].name : d.name)} runs this site.</b> Your edits don’t save directly. Use “Suggest this change” and ${esc(firstName(d.name))} accepts or declines each one.${pendingSug ? ` ${pendingSug} ${pendingSug === 1 ? 'suggestion is' : 'suggestions are'} waiting.` : ''}</span></div>` : ''}
      <div class="cb-build">
        <div class="card cb-wcard">
          <div class="cb-wcard-head" style="display:block"><ol class="cb-steps" data-tour="wizard-steps" aria-label="Steps">${stepsHtml(d)}</ol></div>
          <div class="cb-stepbody" data-body>${stepBody(d, ctx, c)}</div>
          <div class="cb-wiz-foot">
            <span class="small muted">Step ${d.step} of 5</span><span class="spacer"></span>
            ${footBtns(d)}
          </div>
        </div>
        <div class="cb-build-side">${previewHtml(pvUrl, pubUrl ? `<a class="btn btn-sm" href="${esc(pubUrl)}" target="_blank" rel="noopener">${IC.out} Open campaign site</a>` : '')}</div>
      </div>`);

    const body = root.querySelector('[data-body]');
    wirePreview(root, 640, () => postPreview());

    const refreshMeta = () => {
      root.querySelector('.cb-steps').innerHTML = stepsHtml(d);
      const ch = root.querySelectorAll('[data-checks]');
      ch.forEach((x) => { x.innerHTML = checklistHtml(d); });
      const pub = root.querySelector('[data-pub]');
      if (pub) pub.innerHTML = publishHtml(d, ctx);
    };
    const paintStep = (dir) => {
      body.innerHTML = stepBody(d, ctx, c);
      body.classList.remove('in-next', 'in-prev');
      void body.offsetWidth;
      body.classList.add(dir < 0 ? 'in-prev' : 'in-next');
      root.querySelector('.cb-steps').innerHTML = stepsHtml(d);
      const foot = root.querySelector('.cb-wiz-foot');
      foot.innerHTML = `<span class="small muted">Step ${d.step} of 5</span><span class="spacer"></span>${footBtns(d)}`;
      const top = root.querySelector('.cb-wcard').getBoundingClientRect().top;
      if (top < 70) window.scrollBy({ top: top - 90, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    };
    const goStep = (n) => {
      if (W.isNew && n > 1) return;
      const dir = n - d.step;
      d.step = Math.max(1, Math.min(5, n));
      if (!W.isNew && !W.suggest) queueSave();
      paintStep(dir);
    };
    const changed = () => { queueSave(); postPreview(); refreshMeta(); };

    const pk = root.querySelector('[data-pick]');
    if (pk) pk.addEventListener('change', (e) => {
      flushSave();
      ctx.navigate('candidate/builder/' + e.target.value);
    });

    root.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.f) {
        const k = t.dataset.f;
        d[k] = t.value;
        const cnt = root.querySelector(`[data-cnt="${k}"]`);
        if (cnt) cnt.textContent = `${t.value.length}/${t.maxLength}`;
        if (k === 'disclaimer') { const pv = root.querySelector('[data-discpv]'); if (pv) { pv.textContent = t.value.trim() || 'Disclaimer missing'; pv.classList.toggle('missing', !t.value.trim()); } }
        if (W.isNew && (k === 'name' || k === 'office')) {
          d.committeeName = d.name && d.office ? `${d.name.trim()} for ${d.office.trim()} ${String(d.electionDate || '2026').slice(0, 4)}` : '';
        }
        if (W.isNew) { saveState('pending'); refreshMeta(); return; }
        changed();
      } else if (t.dataset.issue != null) {
        d.issues[+t.dataset.issue] = t.value;
        changed();
      }
    });
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-vol]')) { d.volunteerOn = t.checked; changed(); }
      else if (t.matches('[data-upload]') && t.files && t.files[0]) uploadPhoto(t.files[0], (url, ar) => { d.photo = url; d.photoPos = '50% 30%'; d.photoAr = ar; changed(); paintStep(0); ctx.toast('Headshot added.', 'ok'); });
      else if (t.dataset.f === 'fppcId' || t.dataset.f === 'committeeName') {
        refreshMeta();
        const sb = body.querySelector('[data-autodisc]');
        if (!sb && d.committeeName && d.fppcId && composeDisc(d.committeeName, d.fppcId) !== d.disclaimer) paintStep(0);
      }
    });
    root.addEventListener('click', (e) => {
      const stp = e.target.closest('[data-step]');
      if (stp && !stp.disabled) { goStep(+stp.dataset.step); return; }
      const go = e.target.closest('[data-goto]');
      if (go) { goStep(+go.dataset.goto); return; }
      const tpl = e.target.closest('[data-tpl]');
      if (tpl) { d.template = tpl.dataset.tpl; changed(); body.querySelectorAll('[data-tpl]').forEach((x) => x.setAttribute('aria-checked', String(x === tpl))); return; }
      const sw = e.target.closest('[data-sw]');
      if (sw) { const [b, a] = sw.dataset.sw.split('|'); d.colors = { brand: b, accent: a }; changed(); paintStep(0); return; }
      const ph = e.target.closest('[data-photo]');
      if (ph) { d.photo = ph.dataset.photo || null; d.photoPos = ''; delete d.photoAr; changed(); paintStep(0); return; }
      const sg = e.target.closest('[data-sug]');
      if (sg) {
        d[sg.dataset.sug] = sg.dataset.val; changed(); paintStep(0);
        const inp = body.querySelector(`[data-f="${sg.dataset.sug}"]`);
        if (inp) { inp.classList.add('flash'); inp.focus(); }
        return;
      }
      if (e.target.closest('[data-addissue]')) {
        d.issues = (d.issues || []).concat(['']).slice(0, 5); paintStep(0);
        const ins = body.querySelectorAll('[data-issue]'); if (ins.length) ins[ins.length - 1].focus();
        return;
      }
      const as = e.target.closest('[data-addsug]');
      if (as) {
        const arr = (d.issues || []).filter((x) => String(x).trim());
        if (arr.length < 5) arr.push(as.dataset.addsug);
        d.issues = arr; changed(); paintStep(0); return;
      }
      const rm = e.target.closest('[data-rmissue]');
      if (rm) { d.issues.splice(+rm.dataset.rmissue, 1); if (!d.issues.length) d.issues = ['']; changed(); paintStep(0); return; }
      if (e.target.closest('[data-autodisc]')) {
        d.disclaimer = composeDisc(d.committeeName, d.fppcId); changed(); paintStep(0);
        ctx.toast('Disclaimer written from the committee name and FPPC ID.', 'ok'); return;
      }
      const act = e.target.closest('[data-act]');
      if (!act || act.disabled) return;
      const a = act.dataset.act;
      if (a === 'back') goStep(d.step - 1);
      else if (a === 'next') {
        if (W.isNew) { createCandidate(ctx); return; }
        goStep(d.step + 1);
      } else if (a === 'submit') {
        if (blockers(d).length) return;
        Object.assign(d, { status: 'review', submittedBy: ctx.user ? ctx.user.name : null, submittedById: ctx.user ? ctx.user.id : null, submittedAt: new Date().toISOString() });
        W.dirty = true; flushSave(); refreshMeta(); updBadge();
        ctx.toast('Sent for board approval. The site stays private until a board member approves it.', 'ok');
      } else if (a === 'approve') {
        if (blockers(d).length) return;
        Object.assign(d, { status: 'live', approvedBy: ctx.user ? ctx.user.name : null, approvedById: ctx.user ? ctx.user.id : null, approvedAt: new Date().toISOString() });
        W.dirty = true; flushSave(); refreshMeta(); updBadge(); postPreview();
        ctx.toast(`${d.name}’s campaign site is live.`, 'ok');
      } else if (a === 'todraft' || a === 'unpublish') {
        d.status = 'draft'; W.dirty = true; flushSave(); refreshMeta(); updBadge(); postPreview();
        ctx.toast(a === 'unpublish' ? 'The site is offline. Visitors see a “coming soon” page.' : 'Moved back to draft.', 'info');
      } else if (a === 'publish') {
        if (blockers(d).length) return;
        Object.assign(d, { status: 'live', publishedBy: ctx.user ? ctx.user.name : null, publishedAt: new Date().toISOString() });
        W.dirty = true; flushSave(); refreshMeta(); updBadge(); postPreview();
        ctx.toast('Your site is live.', 'ok');
      } else if (a === 'suggest') {
        const diff = suggestDiff();
        if (!diff.length) return;
        const at = new Date().toISOString();
        diff.forEach((x) => Store.add('siteSuggestions', Object.assign({ campaignSlug: d.slug, candidateId: d.candidateId, by: ctx.user ? ctx.user.name : null, byId: ctx.user ? ctx.user.id : null, at, status: 'pending' }, x)));
        const fresh = siteOf({ id: W.cid });
        if (fresh) W.doc = Object.assign(clone(fresh), { step: d.step });
        W.dirty = false;
        ctx.toast(`Sent ${diff.length} ${diff.length === 1 ? 'suggestion' : 'suggestions'} to ${firstName(d.name)}: ${diff.map((x) => SUGGEST_LABEL[x.field]).join(', ')}.`, 'ok', { duration: 5000 });
        App.rerender();
      } else if (a === 'copy') copyText(campaignUrl(W.tenant, d.slug), 'Link copied.');
    });
    function updBadge() {
      const b = root.querySelector('[data-stbadge]');
      if (!b || !c) return;
      const s2 = siteState(c, siteOf(c));
      b.className = 'badge ' + s2.cls; b.textContent = s2.label;
    }
  }

  function createCandidate(ctx) {
    const d = W.doc;
    const miss = ['name', 'office', 'district'].filter((k) => !String(d[k] || '').trim());
    if (miss.length) {
      ctx.toast(`Add the candidate’s ${miss.join(' and ').replace(/ and (?=.* and )/, ', ')} to continue.`, 'warn');
      const inp = document.querySelector(`.scr-cand [data-f="${miss[0]}"]`);
      if (inp) inp.focus();
      return;
    }
    const tenant = W.tenant;
    const dbt = db(tenant);
    const year = String(d.electionDate || '2026').slice(0, 4);
    const taken = new Set(candidates(ctx).map((x) => kebab(x.name)));
    let slug = kebab(d.name); let n = 2;
    while (taken.has(slug)) slug = kebab(d.name) + '-' + (n++);
    const cand = dbt.add('candidates', {
      name: d.name.trim(), office: d.office.trim(), district: d.district.trim(), electionDate: d.electionDate || '2026-11-03',
      status: 'RECRUITED', slogan: '', bio: '', issues: [], committeeName: d.committeeName || `${d.name.trim()} for ${d.office.trim()} ${year}`,
      fppcId: '', disclaimer: '', raisedUsd: 0, goalUsd: 25000, siteStatus: 'QUEUED', photo: null, photoPos: '',
    });
    dbt.add('candidateStatusLog', { candidateId: cand.id, name: cand.name, office: cand.office, from: null, to: 'RECRUITED', by: ctx.user ? ctx.user.name : null });
    const site = Object.assign({}, d, {
      candidateId: cand.id, slug, committeeName: cand.committeeName, step: 2,
      donateUrl: `https://secure.winred.com/${slug}/donate`, name: cand.name, office: cand.office, district: cand.district,
    });
    const saved = dbt.add('campaignSites', site);
    W = { key: tenant + ':' + cand.id, tenant, cid: cand.id, isNew: false, dirty: false, doc: clone(saved) };
    W.doc.step = 2;
    ctx.toast(`${cand.name} added as a recruited candidate. Next, design the site.`, 'ok');
    ctx.navigate('candidate/builder/' + cand.id);
  }

  function uploadPhoto(file, done) {
    if (!/^image\//.test(file.type)) { App.toast('Choose an image file, such as a JPG or PNG.', 'warn'); return; }
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 900;
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        done(cv.toDataURL('image/jpeg', 0.84), img.width / img.height);
      };
      img.onerror = () => App.toast('That image could not be read. Try a JPG or PNG.', 'warn');
      img.src = r.result;
    };
    r.readAsDataURL(file);
  }
  async function copyText(text, msg) {
    try { await navigator.clipboard.writeText(text); App.toast(msg, 'ok'); }
    catch (e) { window.prompt('Copy this:', text); }
  }

  /* ======================================================================
     3. Campaign site preview (live iframe)
     ====================================================================== */
  function renderMicrosite(root, ctx, idParam) {
    const list = candidates(ctx);
    if (!list.length) { root.insertAdjacentHTML('beforeend', emptyCard()); return; }
    const c = pick(ctx, list, idParam);
    const site = siteOf(c);
    const d = view(c, ctx, site);
    const st = siteState(c, site);
    const vols = Store.list('volunteers').filter((v) => v.campaign === d.slug).slice().reverse();
    const ck = checks(d).filter((x) => x.block && !x.ok);
    root.insertAdjacentHTML('beforeend', `
      <div class="cb-toolbar">${picker(list, c, 'Campaign site for')}<span class="spacer"></span><span class="badge ${st.cls}">${esc(st.label)}</span></div>
      <div class="cb-ms">
        <div data-tour="microsite-donate">${previewHtml(campaignUrl(ctx.tenantSlug, d.slug, '&preview=1'), `<a class="btn btn-sm btn-primary" href="${esc(d.url)}" target="_blank" rel="noopener">${IC.out} Open campaign site</a>`)}</div>
        <div class="stack">
          <div class="card" data-tour="microsite-disclaimer"><div class="card-head"><h3>Before it goes public</h3></div><div class="card-body stack" style="gap:12px">
            <div class="cb-disc-preview${d.disclaimer ? '' : ' missing'}">${d.disclaimer ? esc(d.disclaimer) : 'Disclaimer missing. The site stays private until the committee adds it.'}</div>
            ${ck.length ? `<p class="small" style="margin:0;color:var(--danger);font-weight:600">${ck.length === 1 ? 'One required check is' : `${ck.length} required checks are`} open: ${esc(ck.map((x) => x.label).join('; '))}.</p>` : `<p class="small muted" style="margin:0">${st.key === 'live' ? 'Every required check passes and the site is public.' : 'Every required check passes. A board member can publish it from the builder.'}</p>`}
            <a class="btn btn-primary" href="#/candidate/builder/${esc(c.id)}">${IC.pen} ${site ? 'Edit in the builder' : 'Build this site'}</a>
          </div></div>
          ${committeePanelHtml(ctx, c)}
          <div class="card"><div class="card-head"><h3>Volunteers from this site</h3><span class="badge">${vols.length}</span></div><div class="card-body">
            ${vols.length ? `<ul class="cb-vlist">${vols.slice(0, 8).map((v) => `<li><b>${esc(v.name)}</b> · ${esc(v.contact)}${v.zip ? ` · ${esc(v.zip)}` : ''}<br><span class="small muted">${esc((v.interests || []).join(', ') || 'No preference')} · ${esc(fmtStamp(v.createdAt))}</span></li>`).join('')}</ul>`
              : '<p class="muted" style="margin:0">No sign-ups yet. They show here as soon as someone volunteers on the public site.</p>'}
          </div></div>
          <div class="card"><div class="card-body stack" style="gap:8px"><div class="cb-addr"><code>${esc(d.url)}</code></div><button type="button" class="btn btn-sm" data-copy>${IC.copy} Copy link</button></div></div>
        </div>
      </div>`);
    wirePreview(root, 760);
    root.querySelector('[data-pick]').addEventListener('change', (e) => ctx.navigate('candidate/microsite/' + e.target.value));
    root.querySelector('[data-copy]').addEventListener('click', () => copyText(d.url, 'Link copied.'));
    wireCommitteePanel(root, ctx, c);
  }

  /* ======================================================================
     Committee controls for one campaign: hand-over, endorsement, event proposals
     ====================================================================== */
  const INV_BADGE = { sent: ['badge-warn', 'Sent'], claimed: ['badge-ok', 'Accepted'], revoked: ['', 'Revoked'] };
  function committeePanelHtml(ctx, c) {
    const d = view(c, ctx);
    const own = ownerInfo(ctx, c);
    const st = siteState(c, siteOf(c));
    const f = firstName(c.name);
    const hasApi = !!(App.auth && typeof App.auth.createInvite === 'function');
    const pendingOwner = own.invites.find((i) => i.status === 'sent' && (i.campaignRole || 'owner') === 'owner');
    const site = siteOf(c) || {};
    const props = Store.list('eventProposals').filter((x) => x.campaignSlug === d.slug && x.status === 'pending');
    const team = own.owners.concat(own.staff);
    const handover = `<div class="card cb-hand" data-hand><div class="card-head"><h3>Hand over to the candidate</h3>${own.owned ? `<span class="badge badge-ok">${esc(f)} runs it</span>` : '<span class="badge">Committee runs it</span>'}</div><div class="card-body stack" style="gap:12px">
      <p style="margin:0">${own.owned ? `<b>${esc(f)} runs this site now.</b> The committee keeps the endorsement badge and the disclaimer check. Your edits go to ${esc(f)} as suggestions.`
        : `<b>The committee runs this site</b> until ${esc(f)} accepts an invite. Then ${esc(f)} edits and publishes it, and gets their own volunteer list and outreach tools.`}</p>
      ${team.length ? `<ul class="cb-vlist">${team.map((a) => `<li><b>${esc(a.name)}</b> · ${a.campaignRole === 'staff' ? 'Campaign staff' : 'Campaign owner'}<br><span class="small muted">${esc(a.email || '')}</span></li>`).join('')}</ul>` : ''}
      ${own.invites.length ? `<ul class="cb-vlist">${own.invites.slice().reverse().map((i) => { const b = INV_BADGE[i.status] || ['', i.status]; return `<li><span class="badge ${b[0]}">${b[1]}</span> ${esc(i.email || '')}${i.campaignRole === 'staff' ? ' · staff' : ''}<br><span class="small muted">Invited by ${esc(acctName(i.invitedBy) || 'the committee')}${i.createdAt ? ' · ' + esc(fmtStamp(i.createdAt)) : ''}</span>
        ${i.status === 'sent' ? `<div class="row" style="margin-top:6px"><button type="button" class="btn btn-sm" data-inv-copy="${esc(i.id)}">${IC.copy} Copy invite link</button><button type="button" class="btn btn-sm" data-inv-resend="${esc(i.id)}">Resend</button><button type="button" class="btn btn-ghost btn-sm" data-inv-revoke="${esc(i.id)}">Revoke</button></div>` : ''}</li>`; }).join('')}</ul>` : ''}
      ${own.owned || pendingOwner ? '' : st.key !== 'live' ? `<p class="small muted" style="margin:0">Publish the site first. Once it’s live you can hand it over to ${esc(f)}.</p>`
        : !hasApi ? '<p class="small muted" style="margin:0">Candidate invites are coming online. Check back in a few minutes.</p>'
        : `<form class="stack" style="gap:10px" data-inv-form novalidate>
            <label class="cb-field"><span class="lbl">${esc(f)}’s email</span><input class="input" name="email" type="email" autocomplete="off" required></label>
            <label class="cb-field"><span class="lbl">${esc(f)}’s mobile number</span><input class="input" name="phone" type="tel" inputmode="tel" autocomplete="off" required></label>
            <p class="cb-err small" data-inv-err role="alert" style="margin:0;color:var(--danger);font-weight:600"></p>
            <button class="btn btn-primary" type="submit">Send ${esc(f)} an invite</button>
          </form>`}
    </div></div>`;
    const endorse = `<div class="card" data-endorse><div class="card-head"><h3>Endorsement</h3>${site.endorsementPaused ? '<span class="badge badge-warn">Paused</span>' : d.endorsed ? '<span class="badge badge-ok">Showing</span>' : '<span class="badge">Not endorsed</span>'}</div><div class="card-body stack" style="gap:10px">
      ${site.endorsementPaused ? `<p style="margin:0">The endorsement badge is hidden on ${esc(f)}’s site and the county site.</p><p class="small muted" style="margin:0">Paused by ${esc((site.endorsementPause || {}).by || 'the board')} on ${esc(fmtStamp((site.endorsementPause || {}).at))}: “${esc((site.endorsementPause || {}).reason || '')}”</p>
          <button type="button" class="btn" data-endorse-restore>Restore the endorsement</button>`
        : d.endorsed ? `<p class="small muted" style="margin:0">Only the board can pause it. ${esc(f)} sees the reason you give.</p>
          <label class="cb-field"><span class="lbl">Reason for pausing</span><textarea class="textarea" rows="2" data-endorse-reason placeholder="For example: waiting on the bylaws committee review"></textarea></label>
          <button type="button" class="btn" data-endorse-pause>Pause the endorsement</button>`
        : `<p class="small muted" style="margin:0">The badge shows once ${esc(f)} reaches the Endorsed stage in the pipeline.</p>`}
    </div></div>`;
    const events = props.length ? `<div class="card"><div class="card-head"><h3>Events ${esc(f)} proposed</h3><span class="badge">${props.length}</span></div><div class="card-body"><ul class="cb-vlist">${props.map((x) => `<li><b>${esc(x.title)}</b><br><span class="small muted">${esc(fmtDate(x.date, { weekday: 'short', month: 'short', day: 'numeric' }))} · ${esc(x.time || '')} · ${esc(x.location || '')}</span>
      <div class="row" style="margin-top:6px"><button type="button" class="btn btn-primary btn-sm" data-ev-list="${esc(x.id)}">List on the county site</button><button type="button" class="btn btn-ghost btn-sm" data-ev-decline="${esc(x.id)}">Decline</button></div></li>`).join('')}</ul></div></div>` : '';
    return handover + endorse + events;
  }
  function wireCommitteePanel(root, ctx, c) {
    const d = view(c, ctx);
    const inv = (id) => ownerInfo(ctx, c).invites.find((i) => i.id === id);
    const showLink = (i) => {
      const url = inviteLink(i);
      if (!url) return;
      App.toast('', 'info', { duration: 15000, html: `<span class="toast-code-line">Send this link to ${esc(i.email || firstName(c.name))}. Email delivery is not connected yet.</span><span class="toast-link">${esc(url)}</span>` });
    };
    root.addEventListener('submit', (e) => {
      const form = e.target.closest('[data-inv-form]');
      if (!form) return;
      e.preventDefault();
      const V = (App.auth && App.auth.validate) || {};
      const email = form.email.value.trim(), phone = form.phone.value.trim();
      const err = (V.email ? V.email(email) : (/@/.test(email) ? '' : 'Enter an email address.')) || (V.phone ? V.phone(phone) : (phone.replace(/\D/g, '').length >= 10 ? '' : 'Enter a 10-digit mobile number.'));
      form.querySelector('[data-inv-err]').textContent = err;
      if (err) return;
      const r = App.auth.createInvite({ email, phone, role: 'candidate', candidateId: c.id, campaignSlug: d.slug, campaignRole: 'owner' });
      if (!r || !r.ok) { form.querySelector('[data-inv-err]').textContent = (r && r.error) || 'The invite didn’t send. Try again.'; return; }
      App.rerender();
    });
    root.addEventListener('click', (e) => {
      const cp = e.target.closest('[data-inv-copy]');
      if (cp) { const i = inv(cp.dataset.invCopy); if (i) copyText(inviteLink(i), 'Invite link copied.'); return; }
      const rs = e.target.closest('[data-inv-resend]');
      if (rs) {
        const i = inv(rs.dataset.invResend);
        if (!i) return;
        if (App.auth && typeof App.auth.resendInvite === 'function') { try { App.auth.resendInvite(i.id); } catch (x) { /* falls back to the link below */ } }
        showLink(i); return;
      }
      const rv = e.target.closest('[data-inv-revoke]');
      if (rv) {
        const i = inv(rv.dataset.invRevoke);
        if (!i) return;
        const r = App.auth && typeof App.auth.revokeInvite === 'function' ? App.auth.revokeInvite(i.id) : (Store.update('invites', i.id, { status: 'revoked' }), { ok: true });
        if (r && r.ok === false) { ctx.toast(r.error, 'warn'); return; }
        ctx.toast(`Invite for ${i.email} revoked. The link no longer works.`, 'info'); App.rerender(); return;
      }
      if (e.target.closest('[data-endorse-pause]')) {
        const ta = root.querySelector('[data-endorse-reason]');
        const reason = ta ? ta.value.trim() : '';
        if (reason.length < 4) { ctx.toast('Add a short reason. The candidate sees it.', 'warn'); if (ta) ta.focus(); return; }
        setEndorsementPause(ctx, c, true, reason);
        ctx.toast(`Endorsement paused. The badge is hidden on ${firstName(c.name)}’s site.`, 'ok'); App.rerender(); return;
      }
      if (e.target.closest('[data-endorse-restore]')) { setEndorsementPause(ctx, c, false); ctx.toast('Endorsement restored. The badge shows again.', 'ok'); App.rerender(); return; }
      const el = e.target.closest('[data-ev-list]');
      if (el) {
        const x = Store.list('eventProposals').find((y) => y.id === el.dataset.evList);
        if (!x) return;
        const ev = Store.add('events', { title: x.title, kind: 'Campaign', date: x.date, time: x.time, location: x.location, status: 'published', campaign: x.campaignSlug, candidateId: x.candidateId });
        Store.update('eventProposals', x.id, { status: 'listed', eventId: ev.id, decidedBy: ctx.user ? ctx.user.name : null, decidedAt: new Date().toISOString() });
        ctx.toast(`“${x.title}” is listed on the county site.`, 'ok'); App.rerender(); return;
      }
      const dc = e.target.closest('[data-ev-decline]');
      if (dc) { Store.update('eventProposals', dc.dataset.evDecline, { status: 'declined', decidedBy: ctx.user ? ctx.user.name : null, decidedAt: new Date().toISOString() }); ctx.toast('Proposal declined.', 'info'); App.rerender(); }
    });
  }
  const emptyCard = () => '<div class="card"><div class="card-body"><h3>No candidates yet</h3><p class="muted">Recruit a candidate to start a campaign site.</p><a class="btn btn-primary" href="#/candidate/builder/new">Recruit a candidate</a></div></div>';

  /* ======================================================================
     4. Print studio
     ====================================================================== */
  const PIECES = [
    { id: 'door', name: 'Door hanger', plural: 'door hangers', size: '4.25 × 11 in', w: 425, h: 1100, safe: 25,
      qty: [500, 1000, 2500, 5000], papers: ['14 pt cardstock, gloss', '16 pt cardstock, matte'], sides: ['Front only', 'Front and back'], unit: [0.34, 0.24, 0.17, 0.13] },
    { id: 'palm', name: 'Palm card', plural: 'palm cards', size: '4 × 9 in', w: 400, h: 900, safe: 25,
      qty: [1000, 2500, 5000, 10000], papers: ['14 pt cardstock, gloss', '16 pt cardstock, matte', '100 lb cover, uncoated'], sides: ['Front and back'], unit: [0.16, 0.11, 0.08, 0.06] },
    { id: 'yard', name: 'Yard sign', plural: 'yard signs', size: '24 × 18 in', w: 2400, h: 1800, safe: 60,
      qty: [50, 100, 250, 500], papers: ['4 mm coroplast, wire stakes'], sides: ['Front only', 'Front and back'], unit: [9.5, 7.25, 5.4, 4.6] },
  ];
  const PAPER_MULT = { '16 pt cardstock, matte': 1.12, '100 lb cover, uncoated': 0.92 };

  const mcanvas = document.createElement('canvas').getContext('2d');
  function tw(text, size, weight, fam) { mcanvas.font = `${weight || 400} ${size}px ${fam || 'Archivo'}`; return mcanvas.measureText(String(text || '')).width; }
  function wrapW(text, maxW, size, weight, fam) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = []; let cur = '';
    words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (cur && tw(t, size, weight, fam) > maxW) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    return lines;
  }
  function fitSize(text, maxW, size, min, weight, fam) { let s = size; while (s > min && tw(text, s, weight, fam) > maxW) s -= 1; return s; }
  function T(x, y, s, o) {
    const fam = o.body ? BODY : HEAD;
    return `<text x="${x.toFixed ? +x.toFixed(1) : x}" y="${y.toFixed ? +y.toFixed(1) : y}" font-family="${esc(fam)}" font-size="${o.size}" font-weight="${o.w || 400}" fill="${o.fill || '#15202E'}"${o.a ? ` text-anchor="${o.a}"` : ''}${o.ls ? ` letter-spacing="${o.ls}"` : ''}${o.op ? ` opacity="${o.op}"` : ''}>${esc(s)}</text>`;
  }
  let svgUid = 0;
  function photoBox(d, Wd, Ht, ay) {
    const f = FACES[d.photo] || { fx: 0.5, fy: 0.3, ar: d.photoAr || 2 / 3 };
    const iw = 1, ih = 1 / f.ar;
    const sc = Math.max(Wd / iw, Ht / ih);
    const dw = iw * sc, dh = ih * sc;
    return { x: Math.min(0, Math.max(Wd - dw, Wd * 0.5 - f.fx * dw)), y: Math.min(0, Math.max(Ht - dh, Ht * (ay || 0.36) - f.fy * dh)), w: dw, h: dh };
  }
  function svgPhoto(d, x, y, Wd, Ht, ay) {
    if (!d.photo) return `<rect x="${x}" y="${y}" width="${Wd}" height="${Ht}" fill="${d.colors.brand}" opacity=".85"/>` + T(x + Wd / 2, y + Ht / 2 + Ht * 0.1, U.initials(d.name), { size: Ht * 0.3, w: 800, fill: '#fff', a: 'middle' });
    const id = 'cbclip' + (++svgUid);
    const b = photoBox(d, Wd, Ht, ay);
    return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${Wd}" height="${Ht}"/></clipPath><image href="${esc(d.photo)}" x="${(x + b.x).toFixed(1)}" y="${(y + b.y).toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" preserveAspectRatio="none" clip-path="url(#${id})"/>`;
  }
  function qrSvg(url, x, y, size) {
    if (!window.qrcode) return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#fff" stroke="#C3CAD4"/>` + T(x + size / 2, y + size / 2 + 4, 'QR code', { size: size * 0.12, body: true, a: 'middle', fill: '#5A6676' });
    const q = window.qrcode(0, 'M');
    q.addData(url); q.make();
    const n = q.getModuleCount(), quiet = 2, m = size / (n + quiet * 2);
    let p = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) p += `M${(x + (c + quiet) * m).toFixed(2)} ${(y + (r + quiet) * m).toFixed(2)}h${m.toFixed(2)}v${m.toFixed(2)}h-${m.toFixed(2)}z`;
    return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#fff"/><path d="${p}" fill="#0E141B" shape-rendering="crispEdges"/>`;
  }
  let qrPromise = null;
  function loadQr() {
    if (window.qrcode) return Promise.resolve();
    if (!qrPromise) qrPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = QR_SRC; s.async = true;
      s.onload = () => res(); s.onerror = () => { qrPromise = null; rej(new Error('qr')); };
      document.head.appendChild(s);
    });
    return qrPromise;
  }
  let fontsReady = false;
  function loadFonts() {
    if (fontsReady || !document.fonts) return Promise.resolve();
    return Promise.all(['800 40px Archivo', '700 40px Archivo', '400 20px "Public Sans"', '600 20px "Public Sans"', '700 20px "Public Sans"'].map((f) => document.fonts.load(f).catch(() => null))).then(() => { fontsReady = true; });
  }
  function guides(p) {
    const s = p.safe;
    return `<g class="cp-guide" aria-hidden="true"><rect x="${s}" y="${s}" width="${p.w - 2 * s}" height="${p.h - 2 * s}" fill="none" stroke="#18A0C8" stroke-width="${p.w / 400}" stroke-dasharray="${p.w / 80} ${p.w / 120}"/></g>`;
  }
  const voteLine = (d, long) => 'VOTE ' + fmtDate(d.electionDate, long ? { weekday: 'long', month: 'long', day: 'numeric' } : { month: 'short', day: 'numeric' }).toUpperCase();
  function discLines(d, x, yBottom, maxW, size, fill, anchor) {
    const lines = d.disclaimer ? wrapW(d.disclaimer, maxW, size, 600, 'Public Sans') : ['Disclaimer missing'];
    const lh = size * 1.25;
    return lines.map((l, i) => T(x, yBottom - (lines.length - 1 - i) * lh, l, { size, w: 600, body: true, fill: d.disclaimer ? fill : '#B42318', a: anchor || 'middle' })).join('');
  }

  function doorHanger(d, ctx) {
    const p = PIECES[0], Wd = p.w, H = p.h, b = d.colors.brand, a = d.colors.accent, tx = 30, mw = Wd - 60;
    const parts = d.name.trim().split(/\s+/);
    const last = parts.length > 1 ? parts.pop() : '';
    const first = parts.join(' ');
    const fsF = fitSize(first, mw, 40, 18, 800), fsL = fitSize(last.toUpperCase(), mw, 74, 26, 800);
    let out = `<rect width="${Wd}" height="${H}" fill="#fff"/><rect width="${Wd}" height="230" fill="${b}"/>
      <g class="cp-guide" aria-hidden="true"><circle cx="${Wd / 2}" cy="112" r="64" fill="none" stroke="#fff" stroke-width="1.5" stroke-dasharray="6 5" opacity=".85"/>${T(Wd / 2, 116, 'Door hook cut', { size: 10, w: 600, body: true, fill: '#fff', a: 'middle', op: 0.85 })}</g>
      ${d.endorsed ? T(Wd / 2, 208, `ENDORSED BY ${ctx.tenant.shortName.toUpperCase()}`, { size: 13, w: 700, body: true, fill: '#fff', a: 'middle', ls: 1.5 }) : ''}
      ${svgPhoto(d, 0, 230, Wd, 330, 0.36)}
      <rect y="560" width="${Wd}" height="186" fill="${b}"/><rect y="556" width="${Wd}" height="6" fill="${a}"/>
      ${T(Wd / 2, 600, `${d.office} · ${d.district}`.toUpperCase(), { size: fitSize(`${d.office} · ${d.district}`.toUpperCase(), mw, 14, 9, 700, 'Public Sans'), w: 700, body: true, fill: '#fff', a: 'middle', ls: 1, op: 0.9 })}
      ${first ? T(Wd / 2, 648, first, { size: fsF, w: 800, fill: '#fff', a: 'middle' }) : ''}
      ${T(Wd / 2, first ? 648 + fsL * 0.98 : 680, last ? last.toUpperCase() : first.toUpperCase(), { size: fsL, w: 800, fill: '#fff', a: 'middle' })}
      <rect y="746" width="${Wd}" height="48" fill="${a}"/>
      ${T(Wd / 2, 778, voteLine(d, true), { size: fitSize(voteLine(d, true), mw, 21, 12, 800), w: 800, fill: '#fff', a: 'middle', ls: 1 })}`;
    let y = 826;
    wrapW(d.headline, mw, 18, 700).slice(0, 2).forEach((l) => { out += T(tx, y, l, { size: 18, w: 700, fill: b }); y += 22; });
    y += 6;
    (d.issues || []).filter(Boolean).slice(0, 3).forEach((iss) => {
      const s = fitSize(iss, mw - 18, 13.5, 10, 400, 'Public Sans');
      out += `<rect x="${tx}" y="${y - 9}" width="8" height="8" fill="${a}"/>` + T(tx + 16, y, iss, { size: s, body: true, fill: '#1D2733' });
      y += 22;
    });
    out += qrSvg(d.url, tx - 4, 952, 92) + T(tx + 100, 985, 'Scan to volunteer', { size: 14, w: 700, body: true, fill: b }) + T(tx + 100, 1004, 'or donate', { size: 14, w: 700, body: true, fill: b }) +
      T(tx + 100, 1024, `${ctx.tenant.shortName} campaign site`, { size: 11, body: true, fill: '#5A6676' });
    out += `<line x1="${tx}" y1="1046" x2="${Wd - tx}" y2="1046" stroke="#DCE1E8"/>` + discLines(d, Wd / 2, 1068, mw, 10, '#3C4858');
    return `<svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Door hanger for ${esc(d.name)}">${out}${guides(p)}</svg>`;
  }
  function palmFront(d) {
    const p = PIECES[1], Wd = p.w, H = p.h, b = d.colors.brand, a = d.colors.accent, mw = Wd - 60;
    const parts = d.name.trim().split(/\s+/);
    const last = parts.length > 1 ? parts.pop() : '';
    const first = parts.join(' ');
    let out = `<rect width="${Wd}" height="${H}" fill="${b}"/>${svgPhoto(d, 0, 0, Wd, 470, 0.36)}<rect y="470" width="${Wd}" height="10" fill="${a}"/>
      ${T(30, 525, `${d.office}`.toUpperCase(), { size: fitSize(d.office.toUpperCase(), mw, 15, 9, 700, 'Public Sans'), w: 700, body: true, fill: '#fff', ls: 1.2, op: 0.9 })}
      ${first ? T(30, 572, first, { size: fitSize(first, mw, 40, 18, 800), w: 800, fill: '#fff' }) : ''}
      ${T(30, 640, (last || first).toUpperCase(), { size: fitSize((last || first).toUpperCase(), mw, 66, 24, 800), w: 800, fill: '#fff' })}
      ${T(30, 676, d.district, { size: 15, body: true, fill: '#fff', op: 0.9 })}`;
    let y = 724;
    wrapW(d.headline, mw, 19, 700).slice(0, 3).forEach((l) => { out += T(30, y, l, { size: 19, w: 700, fill: '#fff' }); y += 24; });
    out += `<rect y="822" width="${Wd}" height="50" fill="${a}"/>` + T(Wd / 2, 855, voteLine(d, true), { size: fitSize(voteLine(d, true), mw, 20, 11, 800), w: 800, fill: '#fff', a: 'middle', ls: 1 });
    return `<svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Palm card front for ${esc(d.name)}">${out}${guides(p)}</svg>`;
  }
  function palmBack(d) {
    const p = PIECES[1], Wd = p.w, H = p.h, b = d.colors.brand, a = d.colors.accent, mw = Wd - 60;
    let out = `<rect width="${Wd}" height="${H}" fill="#fff"/><rect width="${Wd}" height="118" fill="${b}"/><rect y="118" width="${Wd}" height="6" fill="${a}"/>
      ${T(30, 86, `Meet ${firstName(d.name)}`, { size: fitSize(`Meet ${firstName(d.name)}`, mw, 44, 20, 800), w: 800, fill: '#fff' })}`;
    let y = 160;
    const about = wrapW(d.about, mw, 16, 400, 'Public Sans');
    about.slice(0, 12).forEach((l, i, arr) => { out += T(30, y, i === arr.length - 1 && about.length > 12 ? l.replace(/\S+$/, '…') : l, { size: 16, body: true, fill: '#2B3542' }); y += 23; });
    y += 22;
    out += T(30, y, 'PRIORITIES', { size: 13, w: 700, body: true, fill: a, ls: 1.5 }); y += 26;
    (d.issues || []).filter(Boolean).slice(0, 4).forEach((iss, i) => {
      if (y > 690) return;
      const lines = wrapW(iss, mw - 40, 16.5, 700, 'Public Sans').slice(0, 2);
      out += T(30, y, String(i + 1).padStart(2, '0'), { size: 21, w: 800, fill: a });
      lines.forEach((l, j) => { out += T(70, y + j * 21, l, { size: 16.5, w: 700, body: true, fill: '#15202E' }); });
      y += lines.length * 21 + 16;
    });
    out += qrSvg(d.url, 26, 730, 96) + T(132, 768, 'Scan to volunteer', { size: 14, w: 700, body: true, fill: b }) + T(132, 788, 'or donate', { size: 14, w: 700, body: true, fill: b });
    out += `<line x1="30" y1="842" x2="${Wd - 30}" y2="842" stroke="#DCE1E8"/>` + discLines(d, Wd / 2, 866, mw, 10, '#3C4858');
    return `<svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Palm card back for ${esc(d.name)}">${out}${guides(p)}</svg>`;
  }
  function yardSign(d, ctx) {
    const p = PIECES[2], Wd = p.w, H = p.h, b = d.colors.brand, a = d.colors.accent, mw = Wd - 360;
    const name = d.name.toUpperCase();
    const fs = fitSize(name, mw, 400, 120, 800);
    const off = d.office.toUpperCase();
    let out = `<rect width="${Wd}" height="${H}" fill="${b}"/><rect x="90" y="90" width="${Wd - 180}" height="${H - 180}" fill="none" stroke="#fff" stroke-width="16"/>
      ${T(Wd / 2, 330, d.district.toUpperCase(), { size: fitSize(d.district.toUpperCase(), mw, 96, 40, 700, 'Public Sans'), w: 700, body: true, fill: '#fff', a: 'middle', ls: 14, op: 0.9 })}
      ${T(Wd / 2, 330 + fs * 0.95, name, { size: fs, w: 800, fill: '#fff', a: 'middle' })}
      <rect x="106" y="${Math.round(380 + fs * 0.95)}" width="${Wd - 212}" height="250" fill="${a}"/>
      ${T(Wd / 2, Math.round(380 + fs * 0.95) + 172, off, { size: fitSize(off, mw, 150, 60, 800), w: 800, fill: '#fff', a: 'middle', ls: 6 })}`;
    const yV = Math.round(380 + fs * 0.95) + 250 + 230;
    out += T(180, yV, voteLine(d, true), { size: fitSize(voteLine(d, true), Wd - 760, 130, 50, 800), w: 800, fill: '#fff', ls: 4 });
    if (d.endorsed) out += T(180, yV + 120, `Endorsed by the ${ctx.tenant.name}`, { size: fitSize(`Endorsed by the ${ctx.tenant.name}`, Wd - 820, 64, 30, 600, 'Public Sans'), w: 600, body: true, fill: '#fff', op: 0.92 });
    out += qrSvg(d.url, Wd - 540, H - 560, 360);
    out += discLines(d, 180, H - 190, Wd - 820, 46, '#fff', 'start');
    return `<svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Yard sign for ${esc(d.name)}">${out}${guides(p)}</svg>`;
  }
  function sheetsFor(piece, d, ctx) {
    if (piece === 'door') return [['door', doorHanger(d, ctx), 'Front']];
    if (piece === 'palm') return [['palm', palmFront(d), 'Front'], ['palm', palmBack(d), 'Back']];
    return [['yard', yardSign(d, ctx), 'Front']];
  }

  function buildPrintRoot(d, ctx) {
    let r = document.getElementById('cb-print-root');
    if (!r) { r = document.createElement('div'); r.id = 'cb-print-root'; r.setAttribute('aria-hidden', 'true'); document.body.appendChild(r); }
    r.innerHTML = PIECES.map((p) => sheetsFor(p.id, d, ctx).map(([id, svg]) => `<div class="cb-sheet" data-piece="${id}">${svg}</div>`).join('')).join('');
    document.body.classList.add('cb-print-ready');
    return r;
  }
  function dropPrintRoot() {
    const r = document.getElementById('cb-print-root');
    if (r) r.remove();
    document.body.classList.remove('cb-print-ready');
  }
  window.addEventListener('hashchange', () => { if (!/^#\/(candidate|mycampaign)\/print/.test(location.hash)) dropPrintRoot(); });

  function estimate(p, qty, paper, sides) {
    const i = Math.max(0, p.qty.indexOf(qty));
    const unit = p.unit[i] * (PAPER_MULT[paper] || 1) * (sides === 'Front and back' && p.sides.length > 1 ? 1.3 : 1);
    return { unit, total: Math.round(qty * unit + (p.id === 'yard' ? 40 : 25)) };
  }

  function renderPrint(root, ctx, idParam, opts) {
    const po = opts || {};
    const list = po.only ? candidates(ctx).filter((x) => x.id === idParam) : candidates(ctx);
    if (!list.length) { dropPrintRoot(); root.insertAdjacentHTML('beforeend', emptyCard()); return; }
    const c = po.only ? list[0] : pick(ctx, list, idParam);
    const d = view(c, ctx);
    const piece = PIECES.find((p) => p.id === App.state.cand_piece) || PIECES[0];
    const ord = (App.state.cand_order = App.state.cand_order || {});
    const o = ord[piece.id] = Object.assign({ qty: piece.qty[1], paper: piece.papers[0], sides: piece.sides[0] }, ord[piece.id] || {});
    if (!piece.qty.includes(+o.qty)) o.qty = piece.qty[1];
    if (!piece.papers.includes(o.paper)) o.paper = piece.papers[0];
    if (!piece.sides.includes(o.sides)) o.sides = piece.sides[0];
    const est = estimate(piece, +o.qty, o.paper, o.sides);
    const missing = !d.disclaimer;
    const orders = Store.list('printOrders').filter((x) => x.candidateId === c.id).slice().reverse();
    const guidesOn = App.state.cand_guides !== false;

    root.insertAdjacentHTML('beforeend', `
      <div class="cb-toolbar">${po.only ? '' : picker(list, c, 'Print proofs for')}<span class="spacer"></span>
        <div class="cb-seg" role="group" aria-label="Piece">${PIECES.map((p) => `<button type="button" data-piece="${p.id}" aria-pressed="${p.id === piece.id}">${esc(p.name)}</button>`).join('')}</div></div>
      <div class="cp-wrap">
        <div class="cp-mat${guidesOn ? ' guides' : ''}" data-mat>
          <div class="cp-sheets cp-${piece.id}" data-sheets>${sheetsFor(piece.id, d, ctx).map(([, svg, cap]) => `<div class="cp-sheet">${svg}${piece.id === 'palm' ? `<span class="cap">${cap}</span>` : ''}</div>`).join('')}</div>
          <div class="cp-legend"><label class="toggle"><input type="checkbox" data-guides ${guidesOn ? 'checked' : ''}> Show safe area</label>${guidesOn ? '<span><i></i>Keep text inside the dashed line so trimming never cuts it.</span>' : ''}</div>
        </div>
        <div class="cp-panel">
          <div class="card"><div class="card-body stack" style="gap:12px">
            <div class="row"><h3 style="margin:0">${esc(piece.name)}</h3><span class="spacer"></span>${missing ? '<span class="badge badge-danger">On hold</span>' : '<span class="badge badge-ok">Ready to print</span>'}</div>
            <div class="cp-specs"><div>Trim size<b>${esc(piece.size)}</b></div><div>Pages<b>${piece.id === 'palm' ? 'Front and back' : 'One per side'}</b></div></div>
            <ul class="cb-checks" data-tour="print-check">
              <li class="${missing ? 'bad block' : 'ok'}"><span class="ic">${missing ? IC.x : IC.check}</span><span><b>“Paid for by” disclaimer</b>${missing ? '<span class="why">Missing. Printing stays on hold until it’s added.</span>' : ''}</span></li>
              <li class="${window.qrcode ? 'ok' : 'bad soft'}" data-qrcheck><span class="ic">${window.qrcode ? IC.check : IC.dot}</span><span><b>QR code opens the campaign site</b><span class="why">${esc(d.url.replace(/^https?:\/\//, ''))}</span></span></li>
              <li class="ok"><span class="ic">${IC.check}</span><span><b>Text inside the safe area</b></span></li>
            </ul>
            ${missing ? `<div class="cp-block">Add the disclaimer to send this to the printer.<a class="btn btn-sm" href="${esc(po.builderHref || '#/candidate/builder/' + c.id)}" data-tostep4>Add it in the builder</a></div>`
              : `<button type="button" class="btn btn-primary" data-print="${piece.id}">${IC.print} Print or save as PDF</button>
                 <button type="button" class="btn btn-ghost btn-sm" data-print="all" style="align-self:flex-start">Print all three pieces</button>`}
          </div></div>
          <div class="card"><div class="card-head"><h3>Print shop order</h3></div><div class="card-body stack" style="gap:12px">
            <div class="cb-form" style="grid-template-columns:minmax(0,1fr)">
              <label class="cb-field"><span class="lbl">Quantity</span><select class="select" data-o="qty">${piece.qty.map((q) => `<option value="${q}"${+o.qty === q ? ' selected' : ''}>${U.fmtNum(q)}</option>`).join('')}</select></label>
              <label class="cb-field"><span class="lbl">Sides</span><select class="select" data-o="sides">${piece.sides.map((s) => `<option${o.sides === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
              <label class="cb-field full"><span class="lbl">Stock</span><select class="select" data-o="paper">${piece.papers.map((s) => `<option${o.paper === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
            </div>
            <div class="cp-est"><span class="small">Estimate, about ${esc('$' + est.unit.toFixed(2))} each</span><b>${U.fmtUsd(est.total)}</b></div>
            <p class="cb-note" style="margin:0">The final price comes from your print shop. Save the order, then send it with the PDF.</p>
            <button type="button" class="btn${missing ? '' : ' btn-primary'}" data-saveorder${missing ? ' disabled aria-disabled="true"' : ''}>Save print order</button>
          </div></div>
          <div class="card"><div class="card-head"><h3>Saved orders</h3><span class="badge">${orders.length}</span></div><div class="card-body">
            ${orders.length ? `<ul class="cp-orders">${orders.map((x) => `<li><span class="t"><b>${U.fmtNum(x.qty)} ${esc(x.pieceName)}</b><small>${esc(x.paper)} · ${esc(x.sides)} · about ${U.fmtUsd(x.estimate)} · ${esc(fmtStamp(x.createdAt))}</small></span>
              <button type="button" class="btn btn-ghost btn-sm cb-icon-btn" data-copyorder="${esc(x.id)}" aria-label="Copy order summary">${IC.copy}</button><button type="button" class="btn btn-ghost btn-sm cb-icon-btn" data-rmorder="${esc(x.id)}" aria-label="Remove order">${IC.trash}</button></li>`).join('')}</ul>`
              : '<p class="muted" style="margin:0">No orders yet. Saved orders list the quantity and stock to send your print shop.</p>'}
          </div></div>
        </div>
      </div>`);

    if (!missing) buildPrintRoot(d, ctx); else dropPrintRoot();
    const repaint = () => {
      const sh = root.querySelector('[data-sheets]');
      if (!sh || !sh.isConnected) return;
      sh.innerHTML = sheetsFor(piece.id, d, ctx).map(([, svg, cap]) => `<div class="cp-sheet">${svg}${piece.id === 'palm' ? `<span class="cap">${cap}</span>` : ''}</div>`).join('');
      const qc = root.querySelector('[data-qrcheck]');
      if (qc && window.qrcode) { qc.className = 'ok'; qc.querySelector('.ic').innerHTML = IC.check; }
      if (!missing && /^(candidate|mycampaign)$/.test(App.route.id) && /^print/.test(App.route.sub)) buildPrintRoot(d, ctx);
    };
    const needFonts = !fontsReady;
    Promise.all([loadFonts(), loadQr().catch(() => App.toast('The QR code library didn’t load. Check your connection and reload.', 'warn'))]).then(() => { if (needFonts || window.qrcode) repaint(); });

    if (!po.only) root.querySelector('[data-pick]').addEventListener('change', (e) => ctx.navigate('candidate/print/' + e.target.value));
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-guides]')) { App.state.cand_guides = t.checked; App.rerender(); }
      else if (t.dataset.o) { o[t.dataset.o] = t.dataset.o === 'qty' ? +t.value : t.value; App.rerender(); }
    });
    root.addEventListener('click', (e) => {
      const pc = e.target.closest('[data-piece]');
      if (pc) { App.state.cand_piece = pc.dataset.piece; App.rerender(); return; }
      const pr = e.target.closest('[data-print]');
      if (pr) {
        const r = buildPrintRoot(d, ctx);
        if (pr.dataset.print === 'all') r.removeAttribute('data-only'); else r.dataset.only = pr.dataset.print;
        const after = () => { r.removeAttribute('data-only'); window.removeEventListener('afterprint', after); };
        window.addEventListener('afterprint', after);
        window.print();
        return;
      }
      if (e.target.closest('[data-tostep4]')) {
        const s = siteOf(c);
        if (s) Store.update('campaignSites', s.id, { step: 4 });
        else Store.add('campaignSites', Object.assign(defaultSite(c, ctx), { status: 'draft', step: 4 }));
        W = null;
        return;
      }
      if (e.target.closest('[data-saveorder]') && !missing) {
        const doc = Store.add('printOrders', {
          title: `Print order: ${U.fmtNum(o.qty)} ${piece.plural} for ${c.name}`,
          candidateId: c.id, candidateName: c.name, piece: piece.id, pieceName: piece.plural, size: piece.size,
          qty: +o.qty, paper: o.paper, sides: o.sides, estimate: est.total, status: 'saved',
        });
        ctx.toast(`Order saved: ${U.fmtNum(doc.qty)} ${piece.plural}. Send it to your print shop with the PDF.`, 'ok');
        App.rerender();
        return;
      }
      const co = e.target.closest('[data-copyorder]');
      if (co) {
        const x = Store.list('printOrders').find((y) => y.id === co.dataset.copyorder);
        if (x) copyText(`${x.candidateName}: ${U.fmtNum(x.qty)} ${x.pieceName}, ${x.size}, ${x.paper}, ${x.sides}. Estimate ${U.fmtUsd(x.estimate)}. Campaign site: ${d.url}`, 'Order summary copied. Paste it into an email to your print shop.');
        return;
      }
      const rm = e.target.closest('[data-rmorder]');
      if (rm) { Store.remove('printOrders', rm.dataset.rmorder); ctx.toast('Order removed.', 'info'); App.rerender(); }
    });
  }

  /* ======================================================================
     5. Social posts
     ====================================================================== */
  const PLATFORMS = { facebook: { name: 'Facebook', max: 63206 }, instagram: { name: 'Instagram', max: 2200 }, x: { name: 'X', max: 280 } };
  const xLen = (t) => String(t || '').replace(/https?:\/\/\S+/g, 'x'.repeat(23)).length;
  const lenFor = (pl, t) => (pl === 'x' ? xLen(t) : String(t || '').length);
  function nextMonday() {
    const d = new Date(); d.setHours(12, 0, 0, 0);
    const k = (8 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + k);
    return isoLocal(d);
  }
  function addDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoLocal(d); }
  function fmtTime(hm) { const [h, m] = String(hm || '09:00').split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }

  function draftPosts(d, ctx, weekStart) {
    const f = firstName(d.name);
    const iss = (d.issues || []).filter(Boolean);
    const u = d.url;
    const left = daysUntil(d.electionDate, addDays(weekStart, 5));
    const posts = [
      { day: 0, time: '09:00', platforms: ['facebook', 'instagram'], kicker: 'Meet your candidate', head: `Meet ${f}`, text: `Meet ${d.name}, running for ${d.office} in ${d.district}. ${d.headline}\n\nRead about ${f}’s priorities: ${u}` },
      { day: 1, time: '12:00', platforms: ['x'], kicker: 'Priority 1', head: iss[0] || d.headline, text: `${f}’s first priority for ${d.district}: ${lc1(iss[0] || d.headline)}. Here is the plan: ${u}` },
      { day: 2, time: '18:00', platforms: ['instagram', 'facebook'], kicker: 'Volunteer', head: `Knock doors with ${f}`, text: `${f} is knocking on doors in ${d.district} this week. Join the team for a two-hour shift: ${u}#volunteer` },
      { day: 3, time: '12:00', platforms: ['x', 'facebook'], kicker: 'Priority 2', head: iss[1] || iss[0] || d.headline, text: `Priority 2 for ${d.district}: ${lc1(iss[1] || iss[0] || d.headline)}. ${f} will push for it from day one. ${u}` },
      d.endorsed
        ? { day: 4, time: '09:00', platforms: ['facebook'], kicker: 'Endorsed', head: `Endorsed by ${ctx.tenant.shortName}`, text: `${d.name} is endorsed by the ${ctx.tenant.name} for ${d.office}. See why: ${u}` }
        : { day: 4, time: '09:00', platforms: ['facebook'], kicker: 'Priority 3', head: iss[2] || iss[0] || d.headline, text: `${f} on ${lc1(iss[2] || iss[0] || d.headline)}: ${u}` },
      { day: 5, time: '10:00', platforms: ['instagram', 'x'], kicker: 'Countdown', head: left > 0 ? `${left} days to Election Day` : 'Election Day is here', text: `Election Day is ${fmtDate(d.electionDate, { weekday: 'long', month: 'long', day: 'numeric' })}. Chip in for yard signs and door hangers: ${u}` },
      { day: 6, time: '16:00', platforms: ['x', 'facebook'], kicker: 'Thank you', head: `Thank you, ${d.district}`, text: `Thank you to every neighbor in ${d.district} who talked with ${f} this week! More doors next week. Sign up for a shift: ${u}#volunteer` },
    ];
    return posts.map((p, i) => Object.assign({ id: 'p' + (i + 1), status: 'draft', format: 'square' }, p));
  }
  function planFor(c, d, ctx) {
    const all = Store.get('socialPlan', {}) || {};
    const ws = nextMonday();
    if (all[c.id] && all[c.id].posts && all[c.id].posts.length) return { saved: true, plan: all[c.id] };
    return { saved: false, plan: { weekStart: ws, posts: draftPosts(d, ctx, ws) } };
  }
  let socialTimer = 0;
  function saveSocial(tenant, cid, plan) {
    clearTimeout(socialTimer);
    socialTimer = setTimeout(() => {
      const dbt = db(tenant);
      const all = dbt.get('socialPlan', {}) || {};
      all[cid] = plan;
      dbt.set('socialPlan', all);
    }, 350);
  }

  /* canvas cards */
  const imgCache = {};
  function loadImg(src) {
    if (!src) return Promise.resolve(null);
    if (!imgCache[src]) imgCache[src] = new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
    return imgCache[src];
  }
  function cwrap(ctx2, text, maxW) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = []; let cur = '';
    words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (cur && ctx2.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    return lines;
  }
  function drawCover(g, im, d, x, y, w, h, ay) {
    if (!im) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x, y, w, h); g.fillStyle = 'rgba(255,255,255,.85)'; g.font = `800 ${Math.round(h * 0.28)}px Archivo`; g.textAlign = 'center'; g.fillText(U.initials(d.name), x + w / 2, y + h * 0.58); g.textAlign = 'left'; return; }
    const f = FACES[d.photo] || { fx: 0.5, fy: 0.3 };
    const sc = Math.max(w / im.width, h / im.height);
    const dw = im.width * sc, dh = im.height * sc;
    const dx = Math.min(x, Math.max(x + w - dw, x + w * 0.5 - f.fx * dw));
    const dy = Math.min(y, Math.max(y + h - dh, y + h * (ay || 0.36) - f.fy * dh));
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.drawImage(im, dx, dy, dw, dh); g.restore();
  }
  function setFont(g, w, px, fam, cond) { g.font = `${w} ${px}px ${fam}`; try { g.fontStretch = cond ? 'condensed' : 'normal'; } catch (e) { /* older browsers */ } }
  async function drawCard(cv, d, postIn, fmt) {
    let post = postIn;
    await loadFonts();
    const im = await loadImg(d.photo);
    const story = fmt === 'story';
    const Wc = 1080, Hc = story ? 1920 : 1080;
    cv.width = Wc; cv.height = Hc;
    const g = cv.getContext('2d');
    const b = d.colors.brand, a = d.colors.accent;
    g.fillStyle = b; g.fillRect(0, 0, Wc, Hc);
    let tx = 72, ty, maxW, maxLines, headMax;
    const typeLed = /^(priority|countdown)/i.test(String(post.kicker || ''));
    if (typeLed) {
      /* Type-led layout: big numeral, headline, round headshot by the name. */
      const m = String(post.kicker).match(/\d+/) || String(post.head).match(/\d+/);
      const num = m ? m[0] : '';
      g.fillStyle = a; g.globalAlpha = 0.9;
      setFont(g, 800, story ? 640 : 460, 'Archivo', true);
      g.textBaseline = 'alphabetic';
      if (num) g.fillText(num, Wc - g.measureText(num).width - 40, story ? 720 : 470);
      g.globalAlpha = 1;
      ty = story ? 820 : 520; maxW = Wc - 144; maxLines = story ? 5 : 3; headMax = story ? 120 : 96;
      const r = story ? 90 : 64, cx = tx + r, cy = Hc - (story ? 200 : 150) - r - (story ? 70 : 44);
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.closePath(); g.clip();
      drawCover(g, im, d, cx - r, cy - r, r * 2, r * 2, 0.32); g.restore();
      g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      post = Object.assign({}, post, { _nameX: cx + r + 28, _nameY: cy + 14 });
    } else if (story) {
      drawCover(g, im, d, 0, 0, Wc, 1180, 0.34);
      const gr = g.createLinearGradient(0, 760, 0, 1190); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, b);
      g.fillStyle = gr; g.fillRect(0, 760, Wc, 432);
      ty = 1210; maxW = Wc - 144; maxLines = 4; headMax = 136;
    } else {
      drawCover(g, im, d, 520, 0, 560, Hc - 150, 0.34);
      const gr = g.createLinearGradient(520, 0, 760, 0); gr.addColorStop(0, b); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(519, 0, 242, Hc - 150);
      ty = 170; maxW = 560; maxLines = 5; headMax = 112;
    }
    /* kicker pill */
    setFont(g, 700, story ? 36 : 30, "'Public Sans'");
    const kick = String(post.kicker || '').toUpperCase();
    const kw = g.measureText(kick).width + 44;
    g.fillStyle = a; roundRect(g, tx, ty - (story ? 44 : 38), kw, story ? 62 : 54, 27); g.fill();
    g.fillStyle = '#fff'; g.textBaseline = 'alphabetic'; g.fillText(kick, tx + 22, ty + (story ? 4 : 2));
    /* headline */
    let size = headMax, lines;
    const room = Hc - (story ? 200 : 150) - (ty + 50) - (typeLed ? (story ? 300 : 210) : (story ? 110 : 90));
    do { setFont(g, 800, size, 'Archivo', true); lines = cwrap(g, post.head, maxW); size -= 4; } while ((lines.length > maxLines || lines.length * size * 0.98 > room || lines.some((l) => g.measureText(l).width > maxW)) && size > 40);
    size += 4;
    let y = ty + 50 + size;
    g.fillStyle = '#fff';
    lines.slice(0, maxLines).forEach((l) => { g.fillText(l, tx, y); y += size * 0.98; });
    setFont(g, 600, story ? 44 : 36, "'Public Sans'");
    g.fillStyle = 'rgba(255,255,255,.9)';
    if (post._nameX) g.fillText(d.name, post._nameX, post._nameY); else g.fillText(d.name, tx, y + (story ? 50 : 34));
    /* band */
    const bandH = story ? 200 : 150;
    g.fillStyle = a; g.fillRect(0, Hc - bandH, Wc, bandH);
    setFont(g, 800, story ? 48 : 40, 'Archivo', true);
    g.fillStyle = '#fff';
    const offTxt = `${d.office} · ${d.district}`.toUpperCase();
    let os = story ? 48 : 40;
    while (g.measureText(offTxt).width > Wc - 144 && os > 20) { os -= 2; setFont(g, 800, os, 'Archivo', true); }
    g.fillText(offTxt, tx, Hc - bandH + (story ? 88 : 66));
    setFont(g, 500, story ? 26 : 22, "'Public Sans'");
    g.fillStyle = 'rgba(255,255,255,.9)';
    const disc = d.disclaimer || '';
    let dt = disc;
    while (dt && g.measureText(dt).width > Wc - 144) dt = dt.slice(0, -2);
    if (dt) g.fillText(dt === disc ? dt : dt + '…', tx, Hc - (story ? 56 : 40));
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  function renderSocial(root, ctx, idParam, opts) {
    const o = opts || {};
    const list = o.only ? candidates(ctx).filter((x) => x.id === idParam) : candidates(ctx);
    if (!list.length) { root.insertAdjacentHTML('beforeend', emptyCard()); return; }
    const c = o.only ? list[0] : pick(ctx, list, idParam);
    const d = view(c, ctx);
    const tenant = ctx.tenantSlug;
    const { plan } = planFor(c, d, ctx);
    const ps = plan.posts;
    const approved = ps.filter((p) => p.status === 'approved').length;
    let tagged = false;

    const countsHtml = (p) => p.platforms.map((pl) => { const n = lenFor(pl, p.text), m = PLATFORMS[pl].max; return `<span class="cs-count${n > m ? ' over' : ''}">${PLATFORMS[pl].name} ${U.fmtNum(n)}/${U.fmtNum(m)}</span>`; }).join('') || '<span class="cs-count over">Pick at least one platform</span>';
    const okToApprove = (p) => p.platforms.length && p.platforms.every((pl) => lenFor(pl, p.text) <= PLATFORMS[pl].max) && String(p.text).trim();
    const weekHtml = () => Array.from({ length: 7 }, (_, i) => {
      const iso = addDays(plan.weekStart, i);
      const dp = ps.filter((p) => +p.day === i).sort((x, y) => String(x.time).localeCompare(String(y.time)));
      return `<div class="cs-day"><div class="cs-day-h">${esc(fmtDate(iso, { weekday: 'short' }))}<b>${esc(fmtDate(iso, { day: 'numeric' }))}</b></div>
        ${dp.map((p) => `<button type="button" class="cs-pill${p.status === 'approved' ? ' ok' : ''}" data-jump="${p.id}" aria-label="${esc(fmtTime(p.time))} post, ${p.status === 'approved' ? 'approved' : 'draft'}">${p.status === 'approved' ? IC.check : IC.dot}<span>${esc(fmtTime(p.time))}</span></button>`).join('') || '<div class="cb-note" style="margin-top:6px">Nothing planned</div>'}</div>`;
    }).join('');
    const footHtml = (p) => p.status === 'approved'
      ? `<span class="badge badge-ok">${IC.check} Approved</span><span class="small muted">by ${esc(p.approvedBy || 'a board member')}</span><span class="spacer"></span><button type="button" class="btn btn-ghost btn-sm" data-unapprove="${p.id}">Back to draft</button><button type="button" class="btn btn-sm" data-copytext="${p.id}">${IC.copy} Copy text</button>`
      : `<button type="button" class="btn btn-primary btn-sm" data-approve="${p.id}"${okToApprove(p) ? '' : ' disabled aria-disabled="true"'}${!tagged ? (tagged = true, ' data-tour="social-approve"') : ''}>Approve post</button><button type="button" class="btn btn-sm" data-copytext="${p.id}">${IC.copy} Copy text</button><span class="spacer"></span><span class="small muted">Draft</span>`;

    root.insertAdjacentHTML('beforeend', `
      <div class="cb-toolbar">${o.only ? '' : picker(list, c, 'Posts for')}<span class="spacer"></span>
        <span class="badge badge-ok" data-appr>${approved} of ${ps.length} approved</span>
        <button type="button" class="btn btn-ghost btn-sm" data-redraft>Start over from suggested posts</button></div>
      <p class="cb-lead">A week of suggested posts from ${o.only && ctx.user && ctx.user.role === 'candidate' ? 'your' : esc(firstName(d.name)) + '’s'} campaign site. Edit the wording, pick platforms and a time, then approve each one. Approved posts are ready to copy into each platform at the planned time, with their image.</p>
      <h3 style="margin:0 0 10px">Week of ${esc(fmtDate(plan.weekStart, { month: 'long', day: 'numeric' }))}</h3>
      <div class="cs-week" data-week>${weekHtml()}</div>
      <div class="cs-posts">${ps.map((p, i) => `
        <article class="card cs-post" data-post="${p.id}" style="animation-delay:${i * 40}ms">
          <div class="cs-art" data-fmt="${p.format}">
            <div class="cb-seg" role="group" aria-label="Image size"><button type="button" data-fmt="square" aria-pressed="${p.format !== 'story'}">Square</button><button type="button" data-fmt="story" aria-pressed="${p.format === 'story'}">Story</button></div>
            <canvas data-cv="${p.id}" width="1080" height="${p.format === 'story' ? 1920 : 1080}" role="img" aria-label="Post image: ${esc(p.head)}"></canvas>
            <div class="row" style="gap:6px"><button type="button" class="btn btn-sm" data-png="${p.id}|square">${IC.dl} 1080 × 1080 PNG</button><button type="button" class="btn btn-sm" data-png="${p.id}|story">${IC.dl} 1080 × 1920 PNG</button></div>
          </div>
          <div class="cs-edit">
            <div class="cs-edit-head"><h3>${esc(fmtDate(addDays(plan.weekStart, +p.day), { weekday: 'long', month: 'short', day: 'numeric' }))}</h3><span class="spacer"></span>
              <div class="cs-plats" role="group" aria-label="Platforms">${Object.keys(PLATFORMS).map((pl) => `<button type="button" class="chip" data-plat="${p.id}|${pl}" aria-pressed="${p.platforms.includes(pl)}">${PLATFORMS[pl].name}</button>`).join('')}</div></div>
            <div class="cs-when">
              <label class="cb-field"><span class="lbl">Day</span><select class="select" data-pf="${p.id}|day">${Array.from({ length: 7 }, (_, k) => `<option value="${k}"${+p.day === k ? ' selected' : ''}>${esc(fmtDate(addDays(plan.weekStart, k), { weekday: 'long', month: 'short', day: 'numeric' }))}</option>`).join('')}</select></label>
              <label class="cb-field"><span class="lbl">Time</span><input class="input" type="time" data-pf="${p.id}|time" value="${esc(p.time)}"></label>
            </div>
            <div class="cb-form" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr)">
              <label class="cb-field"><span class="lbl">Image label</span><input class="input" data-pf="${p.id}|kicker" value="${esc(p.kicker)}" maxlength="28"></label>
              <label class="cb-field"><span class="lbl">Image headline</span><input class="input" data-pf="${p.id}|head" value="${esc(p.head)}" maxlength="80"></label>
            </div>
            <label class="cb-field"><span class="lbl">Post text</span><textarea class="textarea" rows="4" data-pf="${p.id}|text">${esc(p.text)}</textarea></label>
            <div class="cs-counts" data-counts="${p.id}" aria-live="polite">${countsHtml(p)}</div>
            <div class="cs-foot" data-foot="${p.id}">${footHtml(p)}</div>
          </div>
        </article>`).join('')}</div>`);

    const P = (id) => ps.find((x) => x.id === id);
    const persist = () => {
      saveSocial(tenant, c.id, plan);
      const ap = root.querySelector('[data-appr]');
      if (ap) ap.textContent = `${ps.filter((p) => p.status === 'approved').length} of ${ps.length} approved`;
    };
    const redrawTimers = {};
    const redraw = (p, now) => {
      clearTimeout(redrawTimers[p.id]);
      redrawTimers[p.id] = setTimeout(() => { const cv = root.querySelector(`[data-cv="${p.id}"]`); if (cv) drawCard(cv, d, p, p.format); }, now ? 0 : 200);
    };
    const refreshFoot = (p) => { tagged = true; const f = root.querySelector(`[data-foot="${p.id}"]`); if (f) f.innerHTML = footHtml(p); };
    /* draw canvases as they scroll into view */
    const cvs = root.querySelectorAll('canvas[data-cv]');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { io.unobserve(en.target); const p = P(en.target.dataset.cv); drawCard(en.target, d, p, p.format); } }), { rootMargin: '400px' });
      cvs.forEach((cv) => io.observe(cv));
    } else cvs.forEach((cv) => { const p = P(cv.dataset.cv); drawCard(cv, d, p, p.format); });

    if (!o.only) root.querySelector('[data-pick]').addEventListener('change', (e) => ctx.navigate('candidate/social/' + e.target.value));
    root.addEventListener('input', (e) => {
      const k = e.target.dataset.pf;
      if (!k) return;
      const [id, f] = k.split('|');
      const p = P(id);
      p[f] = f === 'day' ? +e.target.value : e.target.value;
      if (p.status === 'approved' && (f === 'text' || f === 'head' || f === 'kicker')) { p.status = 'draft'; delete p.approvedBy; refreshFoot(p); }
      if (f === 'text') { root.querySelector(`[data-counts="${id}"]`).innerHTML = countsHtml(p); refreshFoot(p); }
      if (f === 'head' || f === 'kicker') redraw(p);
      if (f === 'day' || f === 'time') root.querySelector('[data-week]').innerHTML = weekHtml();
      persist();
    });
    root.addEventListener('click', async (e) => {
      const fm = e.target.closest('[data-fmt]');
      if (fm && fm.tagName === 'BUTTON') {
        const art = fm.closest('.cs-art'); const p = P(art.closest('[data-post]').dataset.post);
        p.format = fm.dataset.fmt; art.dataset.fmt = p.format;
        art.querySelectorAll('button[data-fmt]').forEach((x) => x.setAttribute('aria-pressed', String(x === fm)));
        redraw(p, true); persist(); return;
      }
      const pl = e.target.closest('[data-plat]');
      if (pl) {
        const [id, k] = pl.dataset.plat.split('|'); const p = P(id);
        p.platforms = p.platforms.includes(k) ? p.platforms.filter((x) => x !== k) : p.platforms.concat(k);
        pl.setAttribute('aria-pressed', String(p.platforms.includes(k)));
        root.querySelector(`[data-counts="${id}"]`).innerHTML = countsHtml(p); refreshFoot(p); persist(); return;
      }
      const ap = e.target.closest('[data-approve]');
      if (ap && !ap.disabled) {
        const p = P(ap.dataset.approve);
        p.status = 'approved'; p.approvedBy = ctx.user ? ctx.user.name : null; p.approvedAt = new Date().toISOString();
        refreshFoot(p); root.querySelector('[data-week]').innerHTML = weekHtml(); persist();
        ctx.toast(`Approved for ${fmtDate(addDays(plan.weekStart, +p.day), { weekday: 'long' })} at ${fmtTime(p.time)}.`, 'ok'); return;
      }
      const un = e.target.closest('[data-unapprove]');
      if (un) { const p = P(un.dataset.unapprove); p.status = 'draft'; delete p.approvedBy; refreshFoot(p); root.querySelector('[data-week]').innerHTML = weekHtml(); persist(); return; }
      const ct = e.target.closest('[data-copytext]');
      if (ct) { copyText(P(ct.dataset.copytext).text, 'Post text copied.'); return; }
      const png = e.target.closest('[data-png]');
      if (png) {
        const [id, fmt] = png.dataset.png.split('|'); const p = P(id);
        const cv = document.createElement('canvas');
        await drawCard(cv, d, p, fmt);
        cv.toBlob((blob) => {
          if (!blob) { ctx.toast('The image could not be created.', 'error'); return; }
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${d.slug}-${fmtDate(addDays(plan.weekStart, +p.day), { weekday: 'short' }).toLowerCase()}-${fmt === 'story' ? '1080x1920' : '1080x1080'}.png`;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          ctx.toast(`Downloading ${a.download}.`, 'ok');
        }, 'image/png');
        return;
      }
      const jp = e.target.closest('[data-jump]');
      if (jp) {
        const card = root.querySelector(`[data-post="${jp.dataset.jump}"]`);
        if (card) { card.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
        return;
      }
      if (e.target.closest('[data-redraft]')) {
        ctx.modal({
          title: 'Start over from suggested posts?',
          html: `<p>This replaces all ${ps.length} posts for ${esc(d.name)} with fresh suggested wording, including any edits and approvals.</p>`,
          actions: [{ label: 'Keep my posts' }, { label: 'Start over', primary: true, onClick: () => {
            const dbt = db(tenant); const all = dbt.get('socialPlan', {}) || {}; delete all[c.id]; dbt.set('socialPlan', all);
            ctx.toast('Suggested posts restored.', 'info'); App.rerender();
          } }],
        });
      }
    });
  }

  /* Shared with screens/mycampaign.js (the candidate's own home). */
  App.campaignKit = {
    injectStyle, renderBuilder, renderPrint, renderSocial, dropPrintRoot, flushSave,
    candidates, siteOf, view, siteState, checks, blockers, campaignUrl, ownerInfo, invitesFor, inviteLink,
    suggestionsFor, decideSuggestion, acctName, fmtVal, SUGGEST_LABEL, setEndorsementPause, committeePanelHtml, wireCommitteePanel,
    previewHtml, wirePreview, copyText, photoTag, planFor, IC, STAGE_LABEL, fmtDate, fmtStamp, daysUntil, firstName,
  };

  /* ======================================================================
     Register
     ====================================================================== */
  const SUBS = [
    ['', 'Candidates', 'Track every candidate from recruitment to Election Day.'],
    ['builder', 'Campaign site builder', 'Five steps from intake to a published campaign site, approved by the board.'],
    ['microsite', 'Campaign site', 'The candidate’s public campaign site, exactly as voters see it.'],
    ['print', 'Print studio', 'Door hangers, palm cards and yard signs, sized for the print shop.'],
    ['social', 'Social posts', 'A week of posts with sized images, each one approved by a person.'],
  ];

  /* Refresh when another tab changes this county's campaign data (never mid-typing in the builder). */
  ['campaignSites', 'candidateStatus', 'candidates', 'volunteers', 'printOrders'].forEach((n) => Store.on(n, (d) => {
    if (!d || d.type !== 'external') return;
    const r = App.route;
    if (r.id === 'candidate' && !/^(builder|social)/.test(r.sub)) App.rerender();
  }));

  App.register({
    id: 'candidate',
    title: 'Campaign-in-a-Box',
    group: 'Candidate Tools',
    icon: ICON,
    blurb: 'Recruit a candidate and launch their campaign site, door hangers, yard signs and social posts in one sitting.',
    render(el, ctx) {
      injectStyle();
      document.querySelectorAll('.cb-menu').forEach((m) => m.remove());
      const parts = String(ctx.sub || '').split('/');
      const sub = SUBS.some((s) => s[0] === parts[0]) ? parts[0] : '';
      if (sub !== '') App.state.cand_drawer = null;
      if (sub !== 'builder') flushSave();
      if (sub !== 'print') dropPrintRoot();
      const meta = SUBS.find((s) => s[0] === sub);
      const cid = parts[1] || (App.state.cand_sel || {})[ctx.tenantSlug] || '';
      const root = document.createElement('div');
      root.className = 'page scr-cand';
      root.innerHTML = `
        <div class="page-head"><div><h1>Campaign-in-a-Box</h1><p>${esc(meta[2])}</p></div>
          ${sub === '' ? `<div class="row"><a class="btn btn-primary" href="#/candidate/builder/new">${IC.plus} Recruit a candidate</a></div>` : ''}</div>
        <nav class="tabs cb-tabs" aria-label="Campaign-in-a-Box sections">
          ${SUBS.map(([id, label]) => `<a class="tab${id === sub ? ' active' : ''}" href="#/candidate${id ? '/' + id + (id !== 'builder' && cid ? '/' + esc(cid) : '') : ''}"${id === sub ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('')}
        </nav>`;
      el.appendChild(root);
      const tabs = root.querySelector('.cb-tabs');
      const act = tabs.querySelector('.tab.active');
      const tabEnd = () => tabs.classList.toggle('at-end', tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 4);
      if (act && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = Math.max(0, act.offsetLeft - (tabs.clientWidth - act.offsetWidth) / 2);
      tabEnd(); tabs.addEventListener('scroll', tabEnd, { passive: true });
      if (sub === '') renderPipeline(root, ctx);
      else if (sub === 'builder') renderBuilder(root, ctx, parts[1]);
      else if (sub === 'microsite') renderMicrosite(root, ctx, parts[1]);
      else if (sub === 'print') renderPrint(root, ctx, parts[1]);
      else if (sub === 'social') renderSocial(root, ctx, parts[1]);
    },
  });
})();
