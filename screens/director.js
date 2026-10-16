/* screens/director.js: AI Campaign Director (Network agent)
   An Executive Board member picks an endorsed candidate. The AI assistant drafts a campaign plan to
   Election Day from templates and the county's own data (turfs, events, candidate details). Each item gets
   a plain-language quality check, and a person approves, edits or rejects every item.
   Saves to the county-scoped `directorPlans` collection (brief section 8):
     { id, title, candidateId, candidateName, request, include:[kinds], steps:[Step], approvals:[{by, at, stepId, action, item}], status }
     status: 'draft' (items still waiting) | 'approved' (every kept item approved)
     Step: { id, kind:'goal'|'canvass'|'print'|'social'|'event'|'site', title, detail, date:'YYYY-MM-DD', module:'field'|'candidate'|'portal',
             route, fields:{...}, status:'draft'|'approved'|'rejected', approvedBy?, approvedAt?, editedBy?, editedAt? }
   Campaign-in-a-Box can read approved print and social steps (fields.qty, fields.piece, fields.text, fields.disclaimer). */
(function () {
  'use strict';
  if (!window.App) return;
  const U = App.util;
  const esc = U.esc;

  const I = (d, s) => `<svg width="${s || 20}" height="${s || 20}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = I('<rect x="4" y="6" width="12" height="10" rx="2.5"/><path d="M10 3v3M7.5 11h.01M12.5 11h.01M8 14h4"/>');
  const OK = I('<path d="M4.5 10.5l3.5 3.5 7.5-8"/>', 15);
  const BAD = I('<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>', 15);
  const ARROW = I('<path d="M4 10h11M11 6l4 4-4 4"/>', 15);

  const ELECTION = '2026-11-03';
  const MODULES = {
    field: { name: 'Field Organizer', route: 'field/list' },
    candidate: { name: 'Campaign-in-a-Box', route: 'candidate' },
    portal: { name: 'Committee Portal', route: 'portal' },
  };
  const KINDS = {
    goal: { label: 'Weekly goals', plural: 'Weekly goals', icon: I('<rect x="3" y="4" width="14" height="13" rx="2"/><path d="M3 8h14M7 2.5v3M13 2.5v3"/>') },
    canvass: { label: 'Canvass', plural: 'Canvass by turf', icon: I('<path d="M10 17s5-4.4 5-8.5a5 5 0 0 0-10 0C5 12.6 10 17 10 17z"/><circle cx="10" cy="8.5" r="1.8"/>') },
    print: { label: 'Print', plural: 'Print pieces', icon: I('<path d="M6 8V3.5h8V8"/><rect x="3" y="8" width="14" height="6" rx="1.5"/><path d="M6 12h8v4.5H6z"/>') },
    social: { label: 'Social', plural: 'Social posts', icon: I('<path d="M4 5h12v8H9l-4 3v-3H4z"/>') },
    event: { label: 'Events', plural: 'Events to hold', icon: I('<circle cx="7" cy="7" r="2.5"/><circle cx="13.5" cy="8" r="2"/><path d="M2.5 16c.6-2.8 2.4-4.2 4.5-4.2s3.9 1.4 4.5 4.2M11.5 12.3c2.3-.4 4.2.8 5 3.7"/>') },
    site: { label: 'Campaign site', plural: 'Campaign site', icon: I('<rect x="2.5" y="3.5" width="15" height="13" rx="2"/><path d="M2.5 7.5h15"/>') },
  };
  const ORDER = ['goal', 'canvass', 'print', 'social', 'event', 'site'];
  const CHOOSABLE = ['canvass', 'print', 'social', 'event'];

  /* ---------------- dates ---------------- */
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => new Date(String(s) + 'T12:00:00');
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
  const today = () => ymd(new Date());
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const fmtDay = (s, long) => { const d = parse(s); return isNaN(d) ? '' : d.toLocaleDateString('en-US', long ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' }); };
  const fmtStamp = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function nextWeekday(from, wd) { const d = parse(from); d.setDate(d.getDate() + ((wd - d.getDay() + 7) % 7 || 7)); return ymd(d); }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function userName() { const u = App.auth && App.auth.user; return u ? u.name : ''; }

  /* ---------------- county data ---------------- */
  function candidates(ctx) {
    const t = ctx.tenant || {};
    const out = (t.candidates || []).slice();
    const add = (c) => { if (c && c.id && !out.some((x) => x.id === c.id)) out.push(c); };
    try { Store.list('candidates').forEach(add); } catch (e) { /* ignore */ }
    (App.state.newCandidates || []).filter((c) => !c.tenantSlug || c.tenantSlug === ctx.tenantSlug).forEach(add);
    let ov = {};
    try { ov = Store.get('candidateStatus', {}) || {}; } catch (e) { /* ignore */ }
    return out.map((c) => (ov[c.id] ? Object.assign({}, c, { status: ov[c.id] }) : c));
  }
  const isEndorsed = (c) => c && (c.status === 'ENDORSED' || c.status === 'ACTIVE_CAMPAIGN');
  function turfs(ctx) {
    const walks = Store.list('walkResults');
    return ((ctx.tenant || {}).turfs || []).map((tf) => {
      const extra = walks.filter((w) => w.turfId === tf.id).reduce((a, w) => a + (Number(w.doors) || 1), 0);
      const done = Math.min(tf.doors, (tf.done || 0) + extra);
      const vol = ((ctx.tenant || {}).volunteers || []).find((v) => v.id === tf.volunteerId);
      return { id: tf.id, name: tf.name, precincts: tf.precincts || [], doors: tf.doors, done, left: tf.doors - done, volunteer: vol ? vol.name : '' };
    });
  }
  function events(ctx) {
    const seed = ((ctx.tenant || {}).events || []).slice();
    Store.list('events').forEach((e) => {
      if (!e || e.status === 'draft') return;
      const i = seed.findIndex((s) => s.id === e.id);
      if (i >= 0) seed[i] = Object.assign({}, seed[i], e); else seed.push(e);
    });
    return seed.filter((e) => e.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }
  function siteFor(ctx, c) {
    let doc = null;
    try { doc = Store.list('campaignSites').find((s) => s.candidateId === c.id) || null; } catch (e) { /* ignore */ }
    return { live: (doc && doc.status === 'live') || (!doc && c.siteStatus === 'LIVE'), doc };
  }

  /* ---------------- drafting (deterministic templates) ---------------- */
  function draftPlan(ctx, c, include, request) {
    const start = today();
    const t = ctx.tenant || {};
    const f = firstName(c.name);
    const steps = [];
    let n = 0;
    const step = (kind, module, title, detail, date, fields, route) => steps.push({
      id: 's' + (++n), kind, module, route: route || MODULES[module].route, title, detail, date, fields: fields || {}, status: 'draft',
    });
    const tf = turfs(ctx).filter((x) => x.left > 0);
    const left = tf.reduce((a, x) => a + x.left, 0);
    // weeks: Monday-to-Sunday blocks from this week through Election Day
    const weeks = [];
    let ws = (() => { const d = parse(start); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); })();
    while (ws <= ELECTION) { const we = addDays(ws, 6); weeks.push({ start: ws, end: we < ELECTION ? we : ELECTION }); ws = addDays(ws, 7); }
    const W = Math.max(1, weeks.length);
    const evs = events(ctx).filter((e) => e.date >= start && e.date <= ELECTION);
    const domain = c.subdomain || (t.domain || '');

    // weekly goals
    weeks.forEach((w, i) => {
      const doors = Math.ceil(left / W);
      const evN = evs.filter((e) => e.date >= w.start && e.date <= w.end).length;
      const last = i === weeks.length - 1;
      step('goal', 'field', last ? `Election week: get every ballot in` : `Week of ${fmtDay(w.start).replace(/^\w+, /, '')}: knock ${U.fmtNum(doors)} doors`,
        last ? `Call every supporter who hasn’t returned a ballot, staff the ${evs.length ? 'watch party' : 'vote centers'} and post the “polls close at 8 PM” reminder.`
          : `Knock ${U.fmtNum(doors)} doors across ${tf.length} turfs${include.includes('social') ? `, post twice for ${f}` : ''}${evN ? `, and bring ${f} to ${evN === 1 ? 'one county event' : evN + ' county events'}` : ''}.`,
        w.end, { weekStart: w.start, doors: last ? 0 : doors });
    });

    if (include.includes('canvass')) {
      tf.sort((a, b) => b.left - a.left).forEach((x) => {
        step('canvass', 'field', `Knock the last ${U.fmtNum(x.left)} doors in ${x.name}`,
          `${U.fmtNum(Math.ceil(x.left / W))} doors a week in precincts ${x.precincts.join(' and ')}. ${x.volunteer ? `${x.volunteer} walks this turf now, and ` : ''}${U.fmtNum(x.done)} of ${U.fmtNum(x.doors)} doors are done. Talk about ${String((c.issues || [])[0] || 'the race').toLowerCase()} first.`,
          addDays(ELECTION, -3), { turfId: x.id, doors: x.left });
      });
    }

    if (include.includes('print')) {
      const orderBy = (() => { const d = addDays(ELECTION, -12); return d < start ? start : d; })();
      const hangers = Math.max(500, Math.ceil(left * 1.1 / 100) * 100);
      step('print', 'candidate', `Order ${U.fmtNum(hangers)} door hangers`, `One for every door left in the canvass plan plus 10% spare. Front: “${c.slogan || c.name}”. Back: ${f}’s three priorities and where to vote.`,
        orderBy, { piece: 'Door hanger', qty: hangers, disclaimer: '' }, 'candidate/print');
      step('print', 'candidate', 'Order 150 yard signs', `24 × 18 in, two-sided. Captains hand them out at ${evs[0] ? evs[0].title : 'the next county event'} and on walks where a voter asks for one.`,
        orderBy, { piece: 'Yard sign', qty: 150, disclaimer: '' }, 'candidate/print');
      step('print', 'candidate', `Order ${U.fmtNum(Math.max(1000, Math.ceil(left * 2 / 500) * 500))} palm cards`, `Pocket cards for walkers and events, with ${f}’s photo, the race and ${domain}.`,
        orderBy, { piece: 'Palm card', qty: Math.max(1000, Math.ceil(left * 2 / 500) * 500), disclaimer: '' }, 'candidate/print');
    }

    if (include.includes('social')) {
      const iss = c.issues || [];
      const posts = [
        { text: `Meet ${c.name}, running for ${c.office} in ${c.district}. “${c.slogan || ''}” Read the plan at ${domain}.` },
        { text: `${f}’s first priority for ${c.district}: ${String(iss[0] || 'getting the basics right').toLowerCase()}. It starts on day one.` },
        { text: `Walk with ${f} this Saturday. Grab a walk list, knock a few doors and meet your neighbors. Sign up at ${domain}.` },
        { text: `${String(iss[1] || 'Spending you can see').replace(/\.$/, '')}. That’s the promise from ${f}. Ballots are due Tuesday, Nov 3.` },
        { text: `Tomorrow is Election Day. Return your ballot by 8 PM on Tuesday, Nov 3, or drop it at any vote center. Vote ${c.name} for ${c.office}.` },
      ];
      const dates = [];
      let d = addDays(start, 1);
      const gap = Math.max(2, Math.floor(daysBetween(start, ELECTION) / posts.length));
      posts.forEach((p, i) => { dates.push(i === posts.length - 1 ? addDays(ELECTION, -1) : d); d = addDays(d, gap); });
      posts.forEach((p, i) => step('social', 'candidate', `Post ${i + 1}: ${['Meet the candidate', 'Top priority', 'Walk with us', 'Second priority', 'Election Day reminder'][i]}`,
        p.text, dates[i] > ELECTION ? ELECTION : dates[i], { text: p.text, disclaimer: '' }, 'candidate/social'));
    }

    if (include.includes('event')) {
      evs.slice(0, 3).forEach((e) => step('event', 'portal', `Bring ${f} to ${e.title}`, `${e.time || ''} at ${e.location || 'the county event'}. Give ${f} five minutes to speak and set up a sign-up table.`,
        e.date, { eventId: e.id, location: e.location || '', existing: true }));
      const city = tf[0] ? tf[0].name : (t.county || 'the county');
      const busy = new Set(events(ctx).map((e) => e.date));
      let sat = nextWeekday(start, 6);
      while (busy.has(sat) && sat < ELECTION) sat = addDays(sat, 7);
      if (sat < ELECTION) step('event', 'portal', `Coffee with ${f} in ${city}`, `A one-hour neighborhood coffee for supporters in ${tf[0] ? tf[0].name : city}. Collect volunteer sign-ups and yard sign requests.`,
        sat, { location: `${city} (pick a host home or cafe)`, existing: false });
    }

    const site = siteFor(ctx, c);
    if (!site.live) step('site', 'candidate', `Publish ${f}’s campaign site`, `Finish the site at ${domain} with the bio, the three priorities and a Donate button, then send it to the board to publish.`,
      addDays(start, 3), { disclaimer: '' }, 'candidate');

    return {
      title: `Campaign plan for ${c.name}`, candidateId: c.id, candidateName: c.name, request: String(request || '').trim(),
      include: include.slice(), steps, approvals: [], status: 'draft',
    };
  }

  /* ---------------- quality checks ---------------- */
  const DISC_RE = /^paid for by .{3,}/i;
  const FPPC_RE = /fppc\s*(id|#|number|no\.?)?\s*#?\s*\d{6,8}/i;
  function disclaimerOf(c, s, plan) {
    const own = String((s.fields && s.fields.disclaimer) || '').trim();
    if (own) return own;
    if (plan && plan.disclaimer) return String(plan.disclaimer).trim();
    let site = null;
    try { site = Store.list('campaignSites').find((x) => x.candidateId === c.id) || null; } catch (e) { /* ignore */ }
    if (site && String(site.disclaimer || '').trim()) return String(site.disclaimer).trim();
    return String(c.disclaimer || '').trim();
  }
  function checks(ctx, plan, s, c) {
    const out = [];
    const add = (ok, label, why) => out.push({ ok: !!ok, label, why: ok ? '' : why });
    const start = today();
    const dateOk = s.date && s.date <= ELECTION;
    if (s.kind !== 'goal') add(dateOk, 'Date is on or before Election Day', s.date ? `${fmtDay(s.date)} is after Election Day, Tuesday, Nov 3.` : 'This item has no date.');
    if (s.kind === 'goal') add(dateOk, 'Week ends by Election Day', 'This week runs past Election Day.');
    if (['print', 'social', 'site'].includes(s.kind)) {
      const d = disclaimerOf(c, s, plan);
      const ok = DISC_RE.test(d) && FPPC_RE.test(d);
      add(ok, 'Disclaimer present', !d ? `No “Paid for by” disclaimer is on file for ${c.committeeName || c.name}. Add it, with the FPPC ID from the committee’s filing, using Edit.`
        : !DISC_RE.test(d) ? 'The disclaimer must start with “Paid for by”.' : 'The disclaimer needs the committee’s FPPC ID number.');
    }
    if (s.kind === 'canvass') {
      const tf = turfs(ctx).find((x) => x.id === s.fields.turfId);
      add(!!tf, 'Turf exists', 'This turf isn’t in Field Organizer anymore. Pick another turf or reject this item.');
      if (tf) add(Number(s.fields.doors) > 0 && Number(s.fields.doors) <= tf.left, 'Doors match what’s left in the turf',
        tf.left === 0 ? `${tf.name} is already finished.` : `${tf.name} has ${U.fmtNum(tf.left)} doors left, and this item asks for ${U.fmtNum(s.fields.doors)}.`);
    }
    if (s.kind === 'print') {
      const lead = daysBetween(s.date, ELECTION);
      add(lead >= 7, 'Ordered at least 7 days before Election Day', `The print shop needs 5 business days, and this order date leaves ${lead} days.`);
      add(s.date >= start, 'Order date isn’t in the past', `${fmtDay(s.date)} has already passed.`);
      if (s.fields.piece === 'Door hanger') {
        const left = turfs(ctx).reduce((a, x) => a + x.left, 0);
        add(Number(s.fields.qty) >= left, 'Enough to cover every door left', `${U.fmtNum(left)} doors are left in the canvass plan, and this order is for ${U.fmtNum(s.fields.qty)}.`);
      }
    }
    if (s.kind === 'social') {
      const txt = String(s.fields.text || s.detail || '');
      add(txt.length <= 280, 'Fits in 280 characters', `The post is ${txt.length} characters long.`);
      const wrong = /nov(ember)?\.?\s+(?!3\b)\d{1,2}\b/i.test(txt) && /(ballot|vote|election)/i.test(txt);
      add(!wrong, 'Election Day date is right', 'The post gives a different date for Election Day. Ballots are due Tuesday, Nov 3.');
    }
    if (s.kind === 'event') {
      add(String(s.fields.location || '').trim().length > 2, 'Location set', 'Add where the event happens.');
      if (!s.fields.existing) {
        const clash = events(ctx).find((e) => e.date === s.date);
        add(!clash, 'No other county event that day', clash ? `${clash.title} is already on ${fmtDay(s.date)}.` : '');
      }
    }
    return out;
  }

  /* ---------------- store ---------------- */
  function plans() { return Store.list('directorPlans'); }
  function planFor(cid) { return plans().filter((p) => p.candidateId === cid).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null; }
  function statusOf(p) { const kept = p.steps.filter((s) => s.status !== 'rejected'); return kept.length && kept.every((s) => s.status === 'approved') ? 'approved' : 'draft'; }
  function save(p, patch, log) {
    const next = Object.assign({}, p, patch || {});
    if (log) next.approvals = (p.approvals || []).concat([log]);
    next.status = statusOf(next);
    return Store.update('directorPlans', p.id, next);
  }

  /* ---------------- styles ---------------- */
  function injectStyles() {
    if (document.getElementById('scr-dir-style')) return;
    const s = document.createElement('style');
    s.id = 'scr-dir-style';
    s.textContent = `
.scr-dir .dr-hero { position:relative; overflow:hidden; border-radius: var(--r-lg); padding: 28px 30px; margin-bottom: 22px; color: var(--brand-ink);
  background: linear-gradient(135deg, var(--brand) 0%, color-mix(in srgb, var(--brand) 70%, var(--master)) 100%); }
.scr-dir .dr-hero::after { content:''; position:absolute; right:-60px; bottom:-90px; width:300px; height:300px; border-radius:50%; border: 40px solid rgba(255,255,255,.06); pointer-events:none; }
.scr-dir .dr-eyebrow { display:inline-flex; align-items:center; gap:8px; font-weight:700; font-size:13.5px; letter-spacing:.06em; text-transform:uppercase; opacity:.9; margin-bottom:6px; }
.scr-dir .dr-hero h1 { color: inherit; font-stretch:78%; margin-bottom:.2em; }
.scr-dir .dr-hero p { max-width:70ch; margin:0; opacity:.9; font-size:1.02rem; }
.scr-dir .dr-count { position:absolute; right:30px; top:28px; text-align:right; }
.scr-dir .dr-count b { display:block; font: 800 3rem/1 var(--font-head); font-stretch:75%; font-variant-numeric: tabular-nums; }
.scr-dir .dr-count span { font-size:13.5px; opacity:.85; }
.scr-dir .dr-grid { display:grid; grid-template-columns: minmax(0, 360px) minmax(0, 1fr); gap:22px; align-items:start; }
.scr-dir .dr-side { position:sticky; top: calc(var(--topbar-h) + 16px); display:flex; flex-direction:column; gap:16px; }
.scr-dir .dr-h { font: 700 13px/1.2 var(--font-body); letter-spacing:.06em; text-transform:uppercase; color: var(--ink-3); margin: 0 0 10px; }
.scr-dir .dr-cands { display:flex; flex-direction:column; gap:8px; }
.scr-dir .dr-cand { display:flex; align-items:center; gap:12px; width:100%; text-align:left; padding:10px 12px; border-radius: var(--r); border:1.5px solid var(--line); background: var(--surface); cursor:pointer;
  font: inherit; color: var(--ink); transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease; min-height:64px; }
.scr-dir .dr-cand:hover { border-color: var(--ink-3); transform: translateY(-1px); }
.scr-dir .dr-cand[aria-pressed="true"] { border-color: var(--brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 18%, transparent); }
.scr-dir .dr-cand:disabled { opacity:.6; cursor:not-allowed; transform:none; }
.scr-dir .dr-cand-txt { flex:1; min-width:0; }
.scr-dir .dr-cand-txt strong { display:block; font-size:15px; }
.scr-dir .dr-cand-txt span { display:block; font-size:13px; color: var(--ink-3); line-height:1.35; }
.scr-dir .dr-inc { display:flex; flex-wrap:wrap; gap:8px; }
.scr-dir .dr-inc label { display:inline-flex; align-items:center; gap:7px; padding:7px 12px; border-radius:999px; border:1px solid var(--line-strong); background: var(--surface); cursor:pointer; font-weight:600; font-size:14px; min-height:40px; }
.scr-dir .dr-inc label:has(input:checked) { border-color: var(--brand); background: color-mix(in srgb, var(--brand) 8%, white); color: var(--brand); }
.scr-dir .dr-inc input { accent-color: var(--brand); margin:0; width:16px; height:16px; }
.scr-dir .dr-main { min-width:0; display:flex; flex-direction:column; gap:18px; }
.scr-dir .dr-ring { width:84px; height:84px; position:relative; }
.scr-dir .dr-ring svg { transform: rotate(-90deg); }
.scr-dir .dr-ring circle { transition: stroke-dashoffset .8s cubic-bezier(.2,.7,.2,1); }
.scr-dir .dr-ring b { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font: 800 1.3rem/1 var(--font-head); font-stretch:80%; }
.scr-dir .dr-sec { display:flex; flex-direction:column; gap:10px; }
.scr-dir .dr-sec-h { display:flex; align-items:center; gap:10px; margin-top:6px; }
.scr-dir .dr-sec-h h3 { margin:0; font-size:1.15rem; }
.scr-dir .dr-sec-h .dr-sec-ic { width:34px; height:34px; border-radius:9px; display:flex; align-items:center; justify-content:center; background: color-mix(in srgb, var(--brand) 9%, white); color: var(--brand); }
.scr-dir .dr-sec-h .spacer { flex:1; }
.scr-dir .dr-head h2 { margin:0 0 2px; font-size:1.35rem; }
.scr-dir .dr-head p { margin:0; }
.scr-dir .dr-bar { position:sticky; top: calc(var(--topbar-h) + 10px); z-index:5; display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding:10px 12px 10px 14px; border-radius: var(--r-lg);
  background: color-mix(in srgb, var(--surface) 94%, transparent); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border:1px solid var(--line); box-shadow: var(--shadow-2); }
.scr-dir .dr-bar .dr-ring { width:44px; height:44px; flex:none; }
.scr-dir .dr-bar-txt { flex:1 1 220px; margin:0; font-size:15px; color: var(--ink-2); }
.scr-dir .dr-bar-txt b { color: var(--ink); }
.scr-dir .is-bad { color: var(--danger); font-weight:700; }
.scr-dir .dr-secs { display:flex; flex-direction:column; gap:12px; }
.scr-dir .dr-sec { border:1px solid var(--line); border-radius: var(--r-lg); background: var(--surface); padding:12px 14px; gap:10px; }
.scr-dir .dr-sec.is-fix { border-color: color-mix(in srgb, var(--danger) 35%, white); background: color-mix(in srgb, var(--danger) 3%, white); }
.scr-dir .dr-sec .dr-sec-h { margin:0; flex-wrap:wrap; }
.scr-dir .dr-sec-note { font-size:14px; color: var(--ink-3); }
.scr-dir .dr-sec-ic.is-ok { background: var(--ok-soft) !important; color: var(--ok) !important; }
.scr-dir .dr-sec-ic.is-bad { background: var(--danger-soft) !important; color: var(--danger) !important; }
.scr-dir .dr-waitlist { list-style:none; margin:0; padding:0; border-top:1px solid var(--line); }
.scr-dir .dr-waitlist li { display:flex; flex-wrap:wrap; justify-content:space-between; gap:2px 12px; padding:7px 0; border-bottom:1px solid var(--line); font-size:14px; }
.scr-dir .dr-waitlist li span:last-child { color: var(--ink-3); font-size:13px; }
.scr-dir .dr-discfix { display:flex; flex-direction:column; gap:10px; padding:12px 14px; border-radius: var(--r); background: var(--surface); border:1px solid var(--line); font-size:14.5px; }
.scr-dir .dr-item { border:1px solid var(--line); border-radius: var(--r); background: var(--surface); padding:12px 14px; display:grid; grid-template-columns: minmax(0,1fr) auto; gap:6px 16px;
  animation: dr-in .4s cubic-bezier(.2,.7,.2,1) both; animation-delay: calc(var(--i, 0) * 45ms); transition: border-color .2s ease, background-color .2s ease; }
@keyframes dr-in { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform:none; } }
.scr-dir .dr-item.is-approved { border-color: color-mix(in srgb, var(--ok) 45%, white); background: color-mix(in srgb, var(--ok) 3%, white); }
.scr-dir .dr-item.is-rejected { background: var(--surface-2); }
.scr-dir .dr-item.is-rejected h4, .scr-dir .dr-item.is-rejected .dr-detail { color: var(--ink-3); }
.scr-dir .dr-item.is-fail { border-color: color-mix(in srgb, var(--danger) 35%, white); }
.scr-dir .dr-item h4 { margin: 0 0 2px; font-size:1rem; overflow-wrap:anywhere; }
.scr-dir .dr-detail { margin:4px 0 0; color: var(--ink-2); font-size:14px; overflow-wrap:anywhere; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.scr-dir .dr-item.is-fail .dr-detail, .scr-dir .dr-item:focus-within .dr-detail { -webkit-line-clamp: unset; }
.scr-dir .dr-meta { display:flex; flex-wrap:wrap; gap:4px 12px; align-items:center; font-size:13px; color: var(--ink-3); margin:0; }
.scr-dir .dr-line { display:flex; flex-wrap:wrap; align-items:center; gap:4px 14px; margin-top:6px; }
.scr-dir .dr-chk { display:inline-flex; align-items:center; gap:8px; background:none; border:0; padding:6px 0; min-height:36px; cursor:pointer; font: 600 13px/1.2 var(--font-body); color: var(--ink-3); }
.scr-dir .dr-chk:hover { color: var(--ink); }
.scr-dir .dr-dots { display:inline-flex; gap:3px; }
.scr-dir .dr-dots i { width:18px; height:18px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; background: var(--ok-soft); color: var(--ok); }
.scr-dir .dr-dots i.bad { background: var(--danger-soft); color: var(--danger); }
.scr-dir .dr-dots svg { width:11px; height:11px; }
.scr-dir .dr-status { font-size:13px; font-weight:600; color: var(--ink-3); display:inline-flex; align-items:center; gap:5px; }
.scr-dir .dr-status.is-ok { color: var(--ok); }
.scr-dir .dr-mod { display:inline-flex; align-items:center; gap:5px; font-weight:700; color: var(--ink-2); }
.scr-dir .dr-acts { display:flex; flex-wrap:wrap; gap:6px; align-items:flex-start; justify-content:flex-end; }
.scr-dir .dr-checks { grid-column: 1 / -1; list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:6px; }
.scr-dir .dr-checks li { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:600; padding:4px 10px 4px 8px; border-radius:999px; background: var(--ok-soft); color: var(--ok); }
.scr-dir .dr-checks li.is-bad { background: var(--danger-soft); color: var(--danger); }
.scr-dir .dr-why { grid-column: 1 / -1; margin:0; padding:8px 12px; border-radius: var(--r); background: var(--danger-soft); color: var(--danger); font-size:14px; font-weight:600; }
.scr-dir .dr-who { grid-column: 1 / -1; display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px; font-size:13.5px; color: var(--ink-2); }
.scr-dir .dr-who a { display:inline-flex; align-items:center; gap:6px; font-weight:700; text-decoration:none; }
.scr-dir .dr-edit { grid-column: 1 / -1; display:flex; flex-direction:column; gap:12px; padding:14px; border-radius: var(--r); background: var(--surface-2); border:1px solid var(--line); }
.scr-dir .dr-edit .dr-two { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
.scr-dir .dr-field { display:flex; flex-direction:column; gap:5px; min-width:0; }
.scr-dir .dr-field label { font-weight:600; font-size:14px; }
.scr-dir .dr-help { font-size:13px; color: var(--ink-3); }
.scr-dir .dr-drafting { padding:22px; display:flex; flex-direction:column; gap:10px; }
.scr-dir .dr-drafting li { display:flex; align-items:center; gap:10px; font-weight:600; color: var(--ink-3); opacity:.5; transition: opacity .25s ease, color .25s ease; }
.scr-dir .dr-drafting li.on { opacity:1; color: var(--ink); }
.scr-dir .dr-drafting li i { width:20px; height:20px; border-radius:50%; border:2px solid var(--line-strong); flex:none; display:flex; align-items:center; justify-content:center; }
.scr-dir .dr-drafting li.on i { border-color: var(--ok); background: var(--ok); color:#fff; }
.scr-dir .dr-drafting ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:10px; }
.scr-dir .dr-empty { padding:36px 24px; text-align:center; }
.scr-dir .dr-empty h2 { margin-bottom:6px; }
.scr-dir .dr-empty p { color: var(--ink-2); max-width:52ch; margin:0 auto 16px; }
.scr-dir .dr-steps { display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:12px; text-align:left; margin-top:18px; }
.scr-dir .dr-steps div { padding:14px; border-radius: var(--r); background: var(--surface-2); border:1px solid var(--line); font-size:14px; color: var(--ink-2); }
.scr-dir .dr-steps b { display:block; font: 800 1.4rem/1 var(--font-head); color: var(--brand); margin-bottom:6px; }
.scr-dir .dr-log { list-style:none; margin:0; padding:0; }
.scr-dir .dr-log li { display:flex; gap:10px; padding:9px 0; border-bottom:1px solid var(--line); font-size:14px; }
.scr-dir .dr-log li:last-child { border-bottom:0; }
.scr-dir .dr-log time { flex:none; color: var(--ink-3); min-width:118px; font-variant-numeric: tabular-nums; }
@media (max-width: 1000px) {
  .scr-dir .dr-grid { grid-template-columns: minmax(0,1fr); }
  .scr-dir .dr-side { position: static; }
}
@media (max-width: 640px) {
  .scr-dir .dr-hero { padding: 22px 18px; }
  .scr-dir .dr-count { position: static; text-align:left; margin-top:14px; }
      .scr-dir .dr-item { grid-template-columns: minmax(0,1fr); padding:14px; }
  .scr-dir .dr-acts { justify-content:flex-start; }
  .scr-dir .dr-edit .dr-two { grid-template-columns: minmax(0,1fr); }
  .scr-dir .dr-steps { grid-template-columns: minmax(0,1fr); }
  .scr-dir .dr-log li { flex-direction:column; gap:2px; }
  .scr-dir .dr-bar { padding:8px 10px; gap:8px; top: calc(var(--topbar-h) + 6px); }
  .scr-dir .dr-bar .dr-ring { display:none; }
  .scr-dir .dr-bar-txt { font-size:13.5px; flex-basis:100%; }
  .scr-dir .dr-bar .btn { width:100%; min-height:44px; }
  .scr-dir .dr-inc label { min-height:44px; padding:9px 14px; }
  .scr-dir .dr-inc input { width:20px; height:20px; }
  .scr-dir .chip, .scr-dir .btn-sm { min-height:44px; }
}
@media (prefers-reduced-motion: reduce) {
  .scr-dir .dr-item { animation:none; }
  .scr-dir .dr-ring circle { transition:none; }
}`;
    document.head.appendChild(s);
  }

  /* ---------------- view state (survives re-renders) ---------------- */
  const V = { tenant: '', cid: null, include: CHOOSABLE.slice(), request: '', editing: null, drafting: false, open: new Set(), checks: new Set() };

  function render(el, ctx) {
    injectStyles();
    el.classList.add('scr-dir');
    if (V.tenant !== ctx.tenantSlug) { V.tenant = ctx.tenantSlug; V.cid = null; V.editing = null; V.open = new Set(); V.checks = new Set(); }
    const all = candidates(ctx);
    const req = App.state.directorRequest;
    if (req && (!req.tenantSlug || req.tenantSlug === ctx.tenantSlug)) {
      const want = req.newCandidateId || req.candidateId;
      if (all.some((c) => c.id === want)) V.cid = want;
      App.state.directorRequest = null;
    }
    const usable = all.filter((c) => isEndorsed(c) || c.id === V.cid);
    if (!V.cid || !all.some((c) => c.id === V.cid)) V.cid = (usable.find((c) => planFor(c.id)) || usable[0] || {}).id || null;
    const days = Math.max(0, daysBetween(today(), ELECTION));

    el.innerHTML = `<div class="page">
      <section class="dr-hero">
        <div class="dr-eyebrow">${ICON} AI Campaign Director</div>
        <h1>Plan a campaign to Election Day</h1>
        <p>Pick an endorsed candidate and the AI assistant drafts a week-by-week plan from ${esc(ctx.tenant.shortName || 'your county')}’s turfs, events and the candidate’s details. It works from templates and county data, checks every item, and nothing happens until a board member approves it.</p>
        <div class="dr-count" aria-label="${days} days to Election Day"><b>${days}</b><span>days to Election Day</span></div>
      </section>
      <div class="dr-grid">
        <aside class="dr-side" data-tour="dir-request"></aside>
        <div class="dr-main" aria-live="polite"></div>
      </div>
    </div>`;
    const side = el.querySelector('.dr-side');
    const main = el.querySelector('.dr-main');

    function drawSide() {
      const endorsed = all.filter((c) => isEndorsed(c) || c.id === V.cid);
      const others = all.filter((c) => !endorsed.includes(c));
      const card = (c, off) => {
        const p = planFor(c.id);
        const note = off ? 'Plans open once the central committee endorses' : p ? `${p.steps.filter((s) => s.status === 'approved').length} of ${p.steps.filter((s) => s.status !== 'rejected').length} items approved` : 'No plan yet';
        return `<button type="button" class="dr-cand" data-cand="${esc(c.id)}" aria-pressed="${c.id === V.cid}"${off ? ' disabled' : ''}>
          ${U.candidatePhoto(c, 44)}<span class="dr-cand-txt"><strong>${esc(c.name)}</strong><span>${esc(c.office)}, ${esc(c.district || '')}</span><span>${esc(note)}</span></span></button>`;
      };
      const cur = all.find((c) => c.id === V.cid);
      const has = cur && planFor(cur.id);
      side.innerHTML = `<div class="card"><div class="card-body">
          <p class="dr-h">1. Choose a candidate</p>
          <div class="dr-cands">${endorsed.map((c) => card(c, false)).join('') || '<p class="small muted">No endorsed candidates yet.</p>'}</div>
          ${others.length ? `<details style="margin-top:10px"><summary class="small" style="cursor:pointer;font-weight:600;min-height:32px">Not endorsed yet (${others.length})</summary><div class="dr-cands" style="margin-top:8px">${others.map((c) => card(c, true)).join('')}</div></details>` : ''}
        </div></div>
        ${cur ? `<form class="card" id="dr-form"><div class="card-body" style="display:flex;flex-direction:column;gap:14px">
          <p class="dr-h" style="margin:0">2. What should the plan cover?</p>
          <div class="dr-inc" role="group" aria-label="Parts of the plan">${CHOOSABLE.map((k) => `<label><input type="checkbox" name="inc" value="${k}"${V.include.includes(k) ? ' checked' : ''}>${KINDS[k].label}</label>`).join('')}</div>
          <div class="dr-field"><label for="dr-req">Anything the board wants noted (optional)</label>
            <textarea class="textarea" id="dr-req" rows="2" maxlength="300" placeholder="For example: lean on the school budget in Sunnyvale">${esc(V.request)}</textarea>
            <span class="dr-help">Saved with the plan for the board to read. Weekly goals are always included.</span></div>
          <button type="submit" class="btn ${has ? '' : 'btn-primary'} btn-block" id="dr-draft">${has ? 'Draft a new plan' : `Draft ${esc(firstName(cur.name))}’s plan`}</button>
          ${has ? '<p class="dr-help" style="margin:-6px 0 0">A new plan replaces the saved one, including its approvals.</p>' : ''}
        </div></form>` : ''}`;
    }

    function drawMain() {
      const cur = all.find((c) => c.id === V.cid);
      if (!all.length || !cur) {
        main.innerHTML = `<div class="card dr-empty"><h2>No endorsed candidates yet</h2><p>Add a candidate in Campaign-in-a-Box. Once the central committee endorses them, the board can plan their campaign here.</p>
          <a class="btn btn-primary" href="#/candidate">Open Campaign-in-a-Box</a></div>`;
        return;
      }
      if (V.drafting) return;
      const plan = planFor(cur.id);
      if (!plan) {
        main.innerHTML = `<div class="card dr-empty" data-tour="dir-plan">
          ${U.candidatePhoto(cur, 72)}
          <h2 style="margin-top:12px">No plan yet for ${esc(cur.name)}</h2>
          <p>Press Draft and the AI assistant writes the plan in a few seconds. You then check each item, edit what needs a human touch, and approve it.</p>
          <div class="dr-steps"><div><b>1</b>The assistant drafts weekly goals, canvass targets, print orders, posts and events.</div>
            <div><b>2</b>Each item runs through a quality check, such as “Disclaimer present” or “Turf exists”.</div>
            <div><b>3</b>A board member approves, edits or rejects every item, and approved work links to the module that does it.</div></div></div>`;
        return;
      }
      drawPlan(plan, cur);
    }

    function drawPlan(plan, cur) {
      const live = plan.steps.filter((s) => s.status !== 'rejected');
      const approved = live.filter((s) => s.status === 'approved').length;
      const results = {};
      plan.steps.forEach((s) => { results[s.id] = checks(ctx, plan, s, cur); });
      const fails = (s) => s.status !== 'rejected' && results[s.id].some((x) => !x.ok);
      const failItems = plan.steps.filter((s) => s.status === 'draft' && fails(s));
      const discMissing = live.some((s) => results[s.id].some((x) => !x.ok && x.label === 'Disclaimer present'));
      const ready = live.filter((s) => s.status === 'draft' && !fails(s));
      const pct = live.length ? approved / live.length : 0;
      const C = 2 * Math.PI * 18;
      const kinds = ORDER.filter((k) => plan.steps.some((s) => s.kind === k));
      let n = 0;
      const ctxFor = { discMissing };
      const discOnly = failItems.filter((s) => !String((s.fields || {}).disclaimer || '').trim() && results[s.id].filter((x) => !x.ok).every((x) => x.label === 'Disclaimer present'));
      const otherFails = failItems.filter((s) => !discOnly.includes(s));

      const fixSec = failItems.length ? `<section class="dr-sec is-fix" data-sec="fix">
          <div class="dr-sec-h"><span class="dr-sec-ic is-bad">${BAD}</span><h3>Needs a fix</h3><span class="dr-sec-note">${failItems.length} ${failItems.length === 1 ? 'item fails' : 'items fail'} a check</span></div>
          ${discMissing ? `<form class="dr-discfix" id="dr-disc">
            <div><strong>Add ${esc(firstName(cur.name))}’s disclaimer once.</strong> Print pieces and posts need a “Paid for by” line with the FPPC (California Fair Political Practices Commission) ID from the committee’s filing. The AI assistant won’t make one up.</div>
            <div class="row" style="align-items:flex-end"><div class="dr-field" style="flex:1 1 260px"><label for="dr-disc-in">Disclaimer</label>
              <input class="input" id="dr-disc-in" value="${esc(plan.disclaimer || '')}" placeholder="Paid for by ${esc(cur.committeeName || 'the committee')}, FPPC #0000000"></div>
              <button type="submit" class="btn btn-primary">Save and check again</button></div>
            <p class="dr-why" id="dr-disc-err" style="display:none"></p>
            ${discOnly.length ? `<p class="small muted" style="margin:0">Waiting on the disclaimer: ${discOnly.length} ${discOnly.length === 1 ? 'item' : 'items'}</p>
              <ul class="dr-waitlist">${discOnly.map((s) => `<li><span>${esc(s.title)}</span><span>${esc(KINDS[s.kind].label)} · ${esc(fmtDay(s.date))}</span></li>`).join('')}</ul>` : ''}</form>` : ''}
          ${(discMissing ? otherFails : failItems).map((s) => itemHtml(s, results[s.id], n++, ctxFor)).join('')}</section>` : '';

      const sections = kinds.map((k) => {
        const items = plan.steps.filter((s) => s.kind === k && !failItems.includes(s));
        if (!items.length) return '';
        const waiting = items.filter((s) => s.status === 'draft');
        const appr = items.filter((s) => s.status === 'approved').length;
        const open = V.open.has(k);
        const state = waiting.length ? `${items.length} ${items.length === 1 ? 'item' : 'items'}, all checks pass` : `${items.length} ${items.length === 1 ? 'item' : 'items'}, ${appr === items.length ? 'all approved' : `${appr} approved`}`;
        return `<section class="dr-sec${open ? ' is-open' : ''}" data-sec="${k}">
          <div class="dr-sec-h"><span class="dr-sec-ic${waiting.length ? '' : ' is-ok'}">${waiting.length ? KINDS[k].icon : OK}</span><h3>${KINDS[k].plural}</h3><span class="dr-sec-note">${state}</span><span class="spacer"></span>
            ${waiting.length ? `<button class="btn btn-sm" data-act="approve-kind" data-kind="${k}">Approve ${waiting.length === items.length ? 'all' : waiting.length}</button>` : ''}
            <button class="btn btn-sm btn-ghost" data-act="toggle-sec" data-kind="${k}" aria-expanded="${open}">${open ? 'Hide' : 'Show'}</button></div>
          ${open ? items.map((s) => itemHtml(s, results[s.id], n++, ctxFor)).join('') : ''}</section>`;
      }).join('');

      const log = (plan.approvals || []).slice().reverse().slice(0, 12);
      main.innerHTML = `
        <div class="dr-head">
          <h2>${esc(plan.title)}</h2>
          <p class="small muted">Drafted ${esc(fmtStamp(plan.createdAt))}${plan.request ? ` · Board note: ${esc(plan.request)}` : ''}</p>
        </div>
        <div class="dr-bar" data-tour="dir-summary">
          <div class="dr-ring" role="img" aria-label="${approved} of ${live.length} items approved">
            <svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" fill="none" stroke="var(--line)" stroke-width="5"/>
              <circle cx="22" cy="22" r="18" fill="none" stroke="${plan.status === 'approved' ? 'var(--ok)' : 'var(--brand)'}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}" data-off="${(C * (1 - pct)).toFixed(1)}"/></svg></div>
          <p class="dr-bar-txt">${plan.status === 'approved' ? `<b>All ${live.length} items approved.</b> Each one links to the module that does it.`
            : `<b>${live.length} items</b>${failItems.length ? ` · <span class="is-bad">${failItems.length} need a fix</span>` : ''}${ready.length ? ` · ${ready.length} ready to approve` : ''} · ${approved} approved`}</p>
          ${ready.length ? `<button class="btn btn-primary" data-act="approve-ready">Approve ${ready.length} that pass</button>` : ''}
        </div>
        <div data-tour="dir-items" class="dr-secs">${fixSec}${sections}</div>
        <div class="card"><div class="card-head"><h3>Approval record</h3><span class="spacer"></span><span class="small muted">Who decided what, and when</span></div>
          <div class="card-body">${log.length ? `<ul class="dr-log">${log.map((a) => `<li><time datetime="${esc(a.at)}">${esc(fmtStamp(a.at))}</time><span><strong>${esc(a.by)}</strong> ${a.action === 'approved' ? 'approved' : a.action === 'rejected' ? 'rejected' : a.action === 'edited' ? 'edited' : a.action === 'restored' ? 'put back' : esc(a.action)} “${esc(a.item || '')}”</span></li>`).join('')}</ul>`
            : '<p class="muted" style="margin:0">No decisions yet. Approvals show the person’s name and the time.</p>'}</div></div>`;
      requestAnimationFrame(() => requestAnimationFrame(() => { const r = main.querySelector('.dr-ring circle[data-off]'); if (r) r.setAttribute('stroke-dashoffset', r.dataset.off); }));
    }

    function itemHtml(s, res, i, o) {
      const mod = MODULES[s.module];
      const fail = s.status === 'rejected' ? [] : res.filter((x) => !x.ok);
      const cls = s.status === 'approved' ? ' is-approved' : s.status === 'rejected' ? ' is-rejected' : fail.length ? ' is-fail' : '';
      const qty = s.kind === 'print' ? ` · ${U.fmtNum(s.fields.qty)} ${esc(String(s.fields.piece || '').toLowerCase())}s` : '';
      const editing = V.editing === s.id;
      const chk = V.checks.has(s.id);
      let acts = '';
      if (s.status === 'draft') acts = `<button class="btn btn-sm btn-primary" data-act="approve" data-id="${s.id}"${fail.length ? ' disabled aria-disabled="true" title="Fix the failed check first"' : ''}>Approve</button>
        <button class="btn btn-sm" data-act="edit" data-id="${s.id}" aria-expanded="${editing}">Edit</button>
        <button class="btn btn-sm btn-ghost" data-act="reject" data-id="${s.id}">Reject</button>`;
      else if (s.status === 'approved') acts = `<a class="btn btn-sm" href="#/${esc(s.route || mod.route)}">Open in ${esc(mod.name)}</a><button class="btn btn-sm btn-ghost" data-act="edit" data-id="${s.id}" aria-expanded="${editing}">Edit</button>`;
      else acts = `<button class="btn btn-sm" data-act="restore" data-id="${s.id}">Put back</button>`;
      const when = `${s.kind === 'goal' ? 'Week ends' : s.kind === 'print' ? 'Order by' : s.kind === 'social' ? 'Post on' : s.kind === 'event' ? 'On' : 'Due'} ${esc(fmtDay(s.date))}${qty}`;
      const passN = res.length - res.filter((x) => !x.ok).length;
      const checkLine = s.status === 'rejected' ? `<span class="dr-status">Rejected by ${esc(s.rejectedBy || '')}, ${esc(fmtStamp(s.rejectedAt))}</span>`
        : `<button type="button" class="dr-chk" data-act="toggle-checks" data-id="${s.id}" aria-expanded="${chk}" aria-label="${passN} of ${res.length} checks pass. Show the checks.">
            <span class="dr-dots" aria-hidden="true">${res.map((x) => `<i class="${x.ok ? 'ok' : 'bad'}">${x.ok ? OK : BAD}</i>`).join('')}</span>
            <span>${passN === res.length ? `All ${res.length} ${res.length === 1 ? 'check passes' : 'checks pass'}` : `${res.length - passN} of ${res.length} ${res.length === 1 ? 'check fails' : 'checks fail'}`}</span></button>`;
      const status = s.status === 'approved' ? `<span class="dr-status is-ok">${OK} Approved by ${esc(s.approvedBy)}, ${esc(fmtStamp(s.approvedAt))}</span>` : '';
      const why = fail.map((x) => (o && o.discMissing && x.label === 'Disclaimer present' && !String((s.fields || {}).disclaimer || '').trim())
        ? '' : `<p class="dr-why">${esc(x.why)}</p>`).join('');
      const discShort = fail.some((x) => x.label === 'Disclaimer present') && o && o.discMissing && !String((s.fields || {}).disclaimer || '').trim();
      return `<article class="dr-item${cls}" style="--i:${Math.min(i, 14)}" data-step="${s.id}">
        <div class="dr-item-main">
          <h4>${esc(s.title)}</h4>
          <p class="dr-meta"><span class="dr-mod">${esc(mod.name)}</span><span>${when}</span>${discShort ? '<span class="is-bad">Needs the disclaimer above</span>' : ''}</p>
          <p class="dr-detail">${esc(s.detail)}</p>
          <div class="dr-line">${checkLine}${status}</div>
        </div>
        <div class="dr-acts">${acts}</div>
        ${chk && s.status !== 'rejected' ? `<ul class="dr-checks" aria-label="Quality check">${res.map((x) => `<li class="${x.ok ? '' : 'is-bad'}">${x.ok ? OK : BAD}${esc(x.label)}</li>`).join('')}</ul>` : ''}
        ${why}
        ${s.editedBy ? `<p class="dr-help" style="grid-column:1/-1;margin:0">Edited by ${esc(s.editedBy)}, ${esc(fmtStamp(s.editedAt))}</p>` : ''}
        ${editing ? editHtml(s) : ''}
      </article>`;
    }

    function editHtml(s) {
      const f = s.fields || {};
      const disc = ['print', 'social', 'site'].includes(s.kind);
      return `<form class="dr-edit" data-edit="${s.id}">
        <div class="dr-field"><label for="dr-e-title">Title</label><input class="input" id="dr-e-title" name="title" maxlength="120" value="${esc(s.title)}"></div>
        <div class="dr-field"><label for="dr-e-detail">${s.kind === 'social' ? 'Post text' : 'Details'}</label><textarea class="textarea" id="dr-e-detail" name="detail" rows="3" maxlength="600">${esc(s.kind === 'social' ? (f.text || s.detail) : s.detail)}</textarea></div>
        <div class="dr-two">
          <div class="dr-field"><label for="dr-e-date">${s.kind === 'print' ? 'Order by' : 'Date'}</label><input class="input" type="date" id="dr-e-date" name="date" value="${esc(s.date)}"></div>
          ${s.kind === 'print' ? `<div class="dr-field"><label for="dr-e-qty">Quantity</label><input class="input" type="number" min="1" step="1" id="dr-e-qty" name="qty" value="${Number(f.qty) || 0}"></div>` : ''}
          ${s.kind === 'canvass' ? `<div class="dr-field"><label for="dr-e-doors">Doors</label><input class="input" type="number" min="1" step="1" id="dr-e-doors" name="doors" value="${Number(f.doors) || 0}"></div>` : ''}
          ${s.kind === 'event' ? `<div class="dr-field"><label for="dr-e-loc">Location</label><input class="input" id="dr-e-loc" name="location" value="${esc(f.location || '')}"></div>` : ''}
        </div>
        ${disc ? `<div class="dr-field"><label for="dr-e-disc">“Paid for by” disclaimer</label><input class="input" id="dr-e-disc" name="disclaimer" value="${esc(f.disclaimer || '')}" placeholder="Paid for by ${esc((all.find((c) => c.id === V.cid) || {}).committeeName || 'the committee')}, FPPC #0000000">
          <span class="dr-help">Leave it blank to use the disclaimer on file. Copy the FPPC ID from the committee’s filing.</span></div>` : ''}
        <div class="row"><button type="submit" class="btn btn-sm btn-primary">Save and check again</button><button type="button" class="btn btn-sm btn-ghost" data-act="cancel-edit">Cancel</button></div>
      </form>`;
    }

    function current() { const c = all.find((x) => x.id === V.cid); return { c, plan: c ? planFor(c.id) : null }; }
    function redraw() { drawSide(); drawMain(); }

    async function startDraft() {
      const { c, plan: old } = current();
      if (!c) return;
      if (!ctx.can('board')) { App.auth.require('board', { reason: 'Only Executive Board members can draft campaign plans.' }); return; }
      const run = async () => {
        V.drafting = true; V.editing = null; V.open = new Set(); V.checks = new Set();
        const tf = turfs(ctx), ev = events(ctx).filter((e) => e.date >= today() && e.date <= ELECTION);
        const lines = [`Reading ${c.name}’s details and priorities`, `Reading ${tf.length} turfs and ${U.fmtNum(tf.reduce((a, x) => a + x.left, 0))} doors left`, `Checking ${ev.length} county events before Election Day`, 'Writing the plan and running the quality check'];
        main.innerHTML = `<div class="card dr-drafting" role="status"><h3 style="margin:0">The AI assistant is drafting</h3><ul>${lines.map((l) => `<li><i>${OK}</i>${esc(l)}</li>`).join('')}</ul></div>`;
        const lis = main.querySelectorAll('.dr-drafting li');
        for (let k = 0; k < lis.length; k++) { await U.sleep(reduced() ? 0 : 260); if (lis[k]) lis[k].classList.add('on'); }
        await U.sleep(reduced() ? 0 : 200);
        const doc = draftPlan(ctx, c, V.include, V.request);
        if (old) Store.remove('directorPlans', old.id);
        V.drafting = false;
        Store.add('directorPlans', doc);
        ctx.toast(`Drafted ${doc.steps.length} items for ${c.name}. Check each one, then approve.`, 'ok');
      };
      if (old && old.approvals && old.approvals.length) {
        ctx.modal({ title: 'Replace the saved plan?', html: `<p>The saved plan for ${esc(c.name)} has ${old.approvals.length} recorded ${old.approvals.length === 1 ? 'decision' : 'decisions'}. A new draft starts over, and every item needs approval again.</p>`,
          actions: [{ label: 'Keep the saved plan' }, { label: 'Draft a new plan', primary: true, onClick: () => { run(); } }] });
      } else run();
    }

    function act(kind, id) {
      const { c, plan } = current();
      if (!plan) return;
      const s = plan.steps.find((x) => x.id === id);
      const who = userName();
      const now = new Date().toISOString();
      if (kind === 'approve' && s) {
        if (checks(ctx, plan, s, c).some((x) => !x.ok)) { ctx.toast('Fix the failed check before approving.', 'warn'); return; }
        const steps = plan.steps.map((x) => x.id === id ? Object.assign({}, x, { status: 'approved', approvedBy: who, approvedAt: now }) : x);
        const saved = save(plan, { steps }, { by: who, at: now, stepId: id, action: 'approved', item: s.title });
        ctx.toast(saved.status === 'approved' ? 'Every item is approved. The plan is ready to carry out.' : `Approved. ${MODULES[s.module].name} has it now.`, 'ok');
      } else if (kind === 'approve-ready') {
        const ok = plan.steps.filter((x) => x.status === 'draft' && checks(ctx, plan, x, c).every((r) => r.ok));
        if (!ok.length) return;
        const ids = new Set(ok.map((x) => x.id));
        const steps = plan.steps.map((x) => ids.has(x.id) ? Object.assign({}, x, { status: 'approved', approvedBy: who, approvedAt: now }) : x);
        let next = Object.assign({}, plan, { steps, approvals: (plan.approvals || []).concat(ok.map((x) => ({ by: who, at: now, stepId: x.id, action: 'approved', item: x.title }))) });
        next.status = statusOf(next);
        Store.update('directorPlans', plan.id, next);
        ctx.toast(`Approved ${ok.length} ${ok.length === 1 ? 'item' : 'items'}.`, 'ok');
      } else if (kind === 'reject' && s) {
        const steps = plan.steps.map((x) => x.id === id ? Object.assign({}, x, { status: 'rejected', rejectedBy: who, rejectedAt: now }) : x);
        save(plan, { steps }, { by: who, at: now, stepId: id, action: 'rejected', item: s.title });
        ctx.toast('Rejected. It stays in the plan, crossed out, in case you want it back.', 'info');
      } else if (kind === 'restore' && s) {
        const steps = plan.steps.map((x) => x.id === id ? Object.assign({}, x, { status: 'draft', rejectedBy: null, rejectedAt: null }) : x);
        save(plan, { steps }, { by: who, at: now, stepId: id, action: 'restored', item: s.title });
      } else if (kind === 'edit') {
        V.editing = V.editing === id ? null : id; drawMain();
        const f = main.querySelector('.dr-edit input'); if (f) f.focus();
      } else if (kind === 'toggle-sec') {
        const k = arguments[2];
        if (V.open.has(k)) V.open.delete(k); else V.open.add(k);
        drawMain();
        const b = main.querySelector(`[data-act="toggle-sec"][data-kind="${k}"]`); if (b) b.focus();
      } else if (kind === 'toggle-checks') {
        if (V.checks.has(id)) V.checks.delete(id); else V.checks.add(id);
        drawMain();
        const b = main.querySelector(`[data-act="toggle-checks"][data-id="${id}"]`); if (b) b.focus();
      } else if (kind === 'approve-kind') {
        const k = arguments[2];
        const ok = plan.steps.filter((x) => x.kind === k && x.status === 'draft' && checks(ctx, plan, x, c).every((r) => r.ok));
        if (!ok.length) return;
        const ids = new Set(ok.map((x) => x.id));
        const next = Object.assign({}, plan, { steps: plan.steps.map((x) => ids.has(x.id) ? Object.assign({}, x, { status: 'approved', approvedBy: who, approvedAt: now }) : x),
          approvals: (plan.approvals || []).concat(ok.map((x) => ({ by: who, at: now, stepId: x.id, action: 'approved', item: x.title }))) });
        next.status = statusOf(next);
        Store.update('directorPlans', plan.id, next);
        ctx.toast(`Approved ${ok.length} ${KINDS[k].plural.toLowerCase()} ${ok.length === 1 ? 'item' : 'items'}.`, 'ok');
      } else if (kind === 'cancel-edit') {
        V.editing = null; drawMain();
      }
    }

    function saveEdit(form) {
      const { plan } = current();
      if (!plan) return;
      const s = plan.steps.find((x) => x.id === form.dataset.edit);
      if (!s) return;
      const v = (n) => { const e = form.elements[n]; return e ? String(e.value).trim() : undefined; };
      const fields = Object.assign({}, s.fields);
      if (v('qty') !== undefined) fields.qty = Math.max(0, Math.round(Number(v('qty')) || 0));
      if (v('doors') !== undefined) fields.doors = Math.max(0, Math.round(Number(v('doors')) || 0));
      if (v('location') !== undefined) fields.location = v('location');
      if (v('disclaimer') !== undefined) fields.disclaimer = v('disclaimer');
      const detail = v('detail') || s.detail;
      if (s.kind === 'social') fields.text = detail;
      const who = userName(), now = new Date().toISOString();
      const wasApproved = s.status === 'approved';
      const ns = Object.assign({}, s, { title: v('title') || s.title, detail, date: v('date') || s.date, fields, editedBy: who, editedAt: now,
        status: 'draft', approvedBy: null, approvedAt: null });
      V.editing = null;
      save(plan, { steps: plan.steps.map((x) => x.id === s.id ? ns : x) }, { by: who, at: now, stepId: s.id, action: 'edited', item: ns.title });
      const res = checks(ctx, plan, ns, current().c);
      const bad = res.filter((x) => !x.ok).length;
      ctx.toast(bad ? `Saved. ${bad} ${bad === 1 ? 'check still fails' : 'checks still fail'}.` : wasApproved ? 'Saved. It passes every check and needs approval again.' : 'Saved. It passes every check.', bad ? 'warn' : 'ok');
    }

    redraw();

    el.addEventListener('click', (e) => {
      const cb = e.target.closest('[data-cand]');
      if (cb && !cb.disabled) { V.cid = cb.dataset.cand; V.editing = null; V.open = new Set(); V.checks = new Set(); redraw(); return; }
      const a = e.target.closest('[data-act]');
      if (a && !a.disabled && a.tagName !== 'A') act(a.dataset.act, a.dataset.id, a.dataset.kind);
    });
    el.addEventListener('change', (e) => {
      if (e.target.name === 'inc') V.include = Array.from(el.querySelectorAll('input[name="inc"]:checked')).map((x) => x.value);
    });
    el.addEventListener('input', (e) => { if (e.target.id === 'dr-req') V.request = e.target.value; });
    el.addEventListener('submit', (e) => {
      e.preventDefault();
      if (e.target.id === 'dr-form') startDraft();
      else if (e.target.matches('[data-edit]')) saveEdit(e.target);
      else if (e.target.id === 'dr-disc') {
        const { plan } = current();
        const val = String(e.target.querySelector('#dr-disc-in').value || '').trim();
        const err = e.target.querySelector('#dr-disc-err');
        if (!DISC_RE.test(val) || !FPPC_RE.test(val)) { err.style.display = 'block'; err.textContent = !DISC_RE.test(val) ? 'Start with “Paid for by” and the committee’s name.' : 'Add the FPPC ID number from the committee’s filing.'; return; }
        const who = userName();
        save(plan, { disclaimer: val }, { by: who, at: new Date().toISOString(), action: 'edited', item: 'Disclaimer for every print piece and post' });
        ctx.toast('Disclaimer saved. Print pieces and posts pass that check now.', 'ok');
      }
    });

    /* Re-check when the county's data changes (a walk result, an event, a campaign site, another tab). */
    let pending = 0;
    const off = Store.on('*', (d) => {
      if (!el.isConnected) { off(); return; }
      if (V.drafting || (d && /^(session|accounts)$/.test(d.name))) return;
      if (d && d.tenant && d.tenant !== ctx.tenantSlug && d.name !== 'reset') return;
      clearTimeout(pending);
      pending = setTimeout(() => { if (el.isConnected) { const keepEdit = V.editing && d && d.name !== 'directorPlans'; if (!keepEdit) redraw(); } }, 50);
    });
  }

  App.register({
    id: 'director',
    group: 'AI tools',
    title: 'AI Campaign Director',
    minRole: 'board',
    gateText: 'The AI Campaign Director is for Executive Board members. Sign in with an Executive Board account to plan a campaign.',
    icon: ICON,
    blurb: 'For Executive Board members and Master Network admins: the AI assistant drafts a campaign plan to Election Day for an endorsed candidate, and a board member approves each item.',
    render,
  });
})();
