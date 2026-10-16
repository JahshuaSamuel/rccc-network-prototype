/* screens/governance.js: Meetings & Voting (Committee agent)
   Routes: #/governance (meeting), #/governance/ballots, #/governance/proxies.
   Saved state (docs/BRIEF.md section 8):
     meetingState (key)  { meetingId, status, agendaIdx, checkIns{memberId:{name,at}}, ballots{id:{status,closedAt,closedBy,roll{memberId:option}}},
                           box{ballotId:{tally{}, voters[], receipts[]}}, seedProxies{i:{verified,by,at}}, log[], zoomUrl, minutes, closedAt }
     votes (coll)        { title, ballotId, ballotTitle, meetingId, receipt, type }   receipt only, never the choice
     proxies (coll)      { title, meetingId, grantorId, grantorName, holderId, holderName, verified, verifiedBy, verifiedAt, revoked }
   A secret ballot's box keeps the counts, the list of members who voted and hashed receipts as three separate lists,
   so no stored record ties a person to a choice. Seed tallies in window.DATA are the baseline; saved votes add to them. */
(function () {
  'use strict';
  if (!window.App) return;

  const U = App.util;
  const esc = U.esc;
  const Store = window.Store;
  const KEY = 'meetingState';

  const I = (d, s) => `<svg width="${s || 20}" height="${s || 20}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = I('<path d="M4 8h12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M7 8V5h6v3M8.5 12h3"/>');
  const IC = {
    check: I('<path d="M4.5 10.5l3.5 3.5 7.5-8"/>', 16),
    lock: I('<rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>', 16),
    shield: I('<path d="M10 2.5l6 2.5v4.5c0 4-2.6 6.8-6 8-3.4-1.2-6-4-6-8V5z"/><path d="M7.3 10l2 2 3.6-4"/>', 18),
    users: I('<circle cx="7" cy="7" r="2.5"/><circle cx="13.5" cy="8" r="2"/><path d="M2.5 16c.6-2.8 2.4-4.2 4.5-4.2s3.9 1.4 4.5 4.2M11.5 12.3c2.3-.4 4.2.8 5 3.7"/>', 18),
    clock: I('<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2"/>', 16),
    video: I('<rect x="2.5" y="5.5" width="10.5" height="9" rx="2"/><path d="M13 9l4.5-2.5v7L13 11"/>', 18),
    ext: I('<path d="M11 4h5v5M16 4l-7 7M14 11.5V15a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3.5"/>', 15),
    print: I('<path d="M6 7V3h8v4M6 14H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2"/><rect x="6" y="11.5" width="8" height="5.5" rx="1"/>', 16),
    copy: I('<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M13 7V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3"/>', 15),
    doc: I('<path d="M5 2.5h6.5L15.5 6.5v10a1 1 0 0 1-1 1h-9.5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z"/><path d="M11.5 2.5v4h4M7 10h6M7 13h4"/>', 18),
  };
  const TYPE_LABEL = { SECRET: 'Secret ballot', ROLL_CALL: 'Roll call vote', WEIGHTED: 'Weighted vote' };

  /* ---------------- small helpers ---------------- */
  function fnv(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const RC_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function newReceipt() {
    const b = new Uint8Array(10);
    try { window.crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < 10; i++) b[i] = Math.floor(Math.random() * 256); }
    const out = Array.from(b, (x) => RC_ALPHA[x % RC_ALPHA.length]).join('');
    return `RC-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
  }
  function normReceipt(r) {
    let x = String(r || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (x.length === 12 && x.startsWith('RC')) x = x.slice(2);
    return x.length === 10 ? `RC-${x.slice(0, 4)}-${x.slice(4, 8)}-${x.slice(8)}` : null;
  }
  function hashReceipt(r) {
    let out = '';
    for (let i = 0; i < 4; i++) out += fnv(`${i}|${r}|rccc-ballot-box`).toString(16).padStart(8, '0');
    return out;
  }
  const fmtW = (n) => String(Math.round(Number(n || 0) * 10) / 10);
  function fmtDate(iso) {
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  function clock(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function shuffled(arr, seed) {
    const rng = U.seeded(seed);
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function plural(n, one, many) { return `${fmtW(n)} ${Number(n) === 1 ? one : (many || one + 's')}`; }
  const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------------- seeded model (deterministic, never saved) ---------------- */
  const modelCache = {};
  function votersNeeded(b) {
    const sum = b.options.reduce((s, o) => s + Number(b.tally[o.id] || 0), 0);
    return b.type === 'WEIGHTED' ? Math.floor(sum) + (sum % 1 ? 1 : 0) : Math.round(sum);
  }
  function assign(b, cands) {
    const pool = shuffled(cands, b.id);
    const halves = pool.filter((m) => m.weight === 0.5);
    let fulls = b.type === 'WEIGHTED' ? pool.filter((m) => m.weight !== 0.5) : pool.slice();
    const out = {};
    b.options.forEach((o) => {
      let need = Number(b.tally[o.id] || 0);
      if (b.type === 'WEIGHTED' && need % 1 !== 0 && halves.length) { const h = halves.shift(); out[h.id] = o.id; fulls = fulls.filter((m) => m !== h); need -= 0.5; }
      for (let i = 0; i < Math.round(need) && fulls.length; i++) out[fulls.shift().id] = o.id;
    });
    return out;
  }
  function model(t) {
    if (modelCache[t.slug]) return modelCache[t.slug];
    const members = t.members || [];
    const seated = members.filter((m) => m.seated);
    const byName = (n) => members.find((m) => m.name === n) || null;
    const reserved = new Set(((window.DATA && DATA.sampleAccounts) || []).filter((a) => a.tenant === t.slug && a.memberId).map((a) => a.memberId));
    const grantors = new Set((t.proxies || []).map((p) => p.grantor));
    const holders = new Set((t.proxies || []).map((p) => p.holder));
    const pool = shuffled(seated.filter((m) => !reserved.has(m.id) && !grantors.has(m.name)), t.slug + '-attendance');
    const first = pool.filter((m) => m.role === 'EXEC_BOARD' || holders.has(m.name) || m.weight === 0.5);
    const ordered = first.concat(pool.filter((m) => !first.includes(m)));
    const openB = (t.ballots || []).filter((b) => b.status === 'open');
    const k = Math.min(ordered.length, Math.max(0, ...openB.map(votersNeeded)));
    const present = ordered.slice(0, k);
    const others = seated.filter((m) => !reserved.has(m.id) && !present.includes(m));
    const seedVotes = {};
    (t.ballots || []).forEach((b) => { seedVotes[b.id] = assign(b, b.status === 'open' ? present : present.concat(others)); });
    const seedProxies = (t.proxies || []).map((p, i) => {
      const g = byName(p.grantor), h = byName(p.holder);
      return { id: 'seed-' + i, seedIndex: i, grantorId: g ? g.id : p.grantor, grantorName: p.grantor, holderId: h ? h.id : p.holder, holderName: p.holder, verified: !!p.verified, seed: true };
    });
    modelCache[t.slug] = { members, seated, reserved, present, seedVotes, seedProxies, byId: (id) => members.find((m) => m.id === id) || null };
    return modelCache[t.slug];
  }

  /* ---------------- saved state ---------------- */
  function blank(t) {
    return { meetingId: t.meeting.id, status: 'scheduled', startedAt: null, startedBy: null, agendaIdx: 0, checkIns: {}, ballots: {}, box: {}, seedProxies: {}, log: [], zoomUrl: '', minutes: null, closedAt: null };
  }
  function load(t) {
    const s = Store.get(KEY, null);
    if (!s || s.meetingId !== t.meeting.id) return blank(t);
    return Object.assign(blank(t), s);
  }
  function mutate(t, fn) {
    const s = load(t);
    const r = fn(s);
    Store.set(KEY, s);
    return r;
  }
  /* The person running the meeting is present: check them in if they hold a seat. */
  function seatRunner(t, s, ctx) {
    const me = memberOf(t, ctx);
    if (me && !(s.checkIns || {})[me.id]) { s.checkIns = s.checkIns || {}; s.checkIns[me.id] = { name: me.name, at: new Date().toISOString() }; s.log.push({ at: new Date().toISOString(), text: `${me.name} checked in`, kind: 'quorum' }); }
  }
  const started = (s) => s.status !== 'scheduled';
  function addLog(s, text, kind) { s.log.push({ at: new Date().toISOString(), text, kind: kind || 'info' }); }

  function proxiesOf(t, s) {
    const M = model(t);
    const seed = M.seedProxies.map((p) => Object.assign({}, p, s.seedProxies[p.seedIndex] || {}));
    const saved = Store.list('proxies').filter((p) => p.meetingId === t.meeting.id && !p.revoked);
    return seed.concat(saved);
  }
  function presentIds(t, s) {
    const M = model(t);
    const ids = new Set(started(s) ? M.present.map((m) => m.id) : []);
    Object.keys(s.checkIns || {}).forEach((id) => { const m = M.byId(id); if (m && m.seated) ids.add(id); });
    return ids;
  }
  function quorum(t, s) {
    const M = model(t);
    const here = presentIds(t, s);
    const counted = new Set();
    proxiesOf(t, s).forEach((p) => { if (p.verified && here.has(p.holderId) && !here.has(p.grantorId)) counted.add(p.grantorId); });
    const seated = M.seated.length;
    const need = Math.floor(seated / 2) + 1;
    const present = here.size + counted.size;
    return { seated, need, inRoom: here.size, viaProxy: counted.size, present, reached: present >= need, here, counted };
  }
  function ballotView(t, s, b) {
    const M = model(t);
    const st = s.ballots[b.id] || {};
    if (!started(s)) {
      const zero = {}; b.options.forEach((o) => { zero[o.id] = 0; });
      return { st, status: 'scheduled', tally: zero, roll: {}, cast: 0, voters: 0, votedIds: new Set(), box: { tally: {}, voters: [], receipts: [] } };
    }
    const status = s.status === 'closed' && st.status !== 'closed' ? 'closed' : (st.status || b.status);
    const box = s.box[b.id] || { tally: {}, voters: [], receipts: [] };
    const roll = st.roll || {};
    const tally = {};
    b.options.forEach((o) => { tally[o.id] = Number(b.tally[o.id] || 0); });
    let realVoters = 0;
    if (b.type === 'SECRET') { b.options.forEach((o) => { tally[o.id] += Number(box.tally[o.id] || 0); }); realVoters = box.voters.length; }
    else Object.keys(roll).forEach((id) => { const m = M.byId(id); tally[roll[id]] = (tally[roll[id]] || 0) + (b.type === 'WEIGHTED' ? (m && m.weight) || 1 : 1); realVoters++; });
    const seedVoters = Object.keys(M.seedVotes[b.id] || {}).length;
    const cast = b.options.reduce((sum, o) => sum + tally[o.id], 0);
    const votedIds = new Set(b.type === 'SECRET' ? box.voters : Object.keys(roll));
    return { st, status, tally, roll, cast, voters: seedVoters + realVoters, votedIds, box };
  }
  function result(b, v) {
    const opts = b.options.filter((o) => o.id !== 'abstain');
    const first = opts[0];
    const decisive = opts.reduce((sum, o) => sum + v.tally[o.id], 0);
    const yes = v.tally[first.id] || 0;
    const pct = decisive ? (yes / decisive) * 100 : 0;
    const passed = decisive > 0 && pct >= b.threshold - 0.001;
    const need = b.threshold > 60 ? 'two-thirds' : 'a majority';
    const unit = b.type === 'WEIGHTED' ? 'weighted votes' : 'votes';
    const abst = v.tally.abstain || 0;
    const line = `${passed ? 'Passed' : 'Failed'}. ${first.label} received ${fmtW(yes)} of ${fmtW(decisive)} ${unit} cast (${pct.toFixed(1)}%), and ${need} was needed.` +
      (abst ? ` ${plural(abst, 'member')} abstained, which doesn’t count toward the percentage.` : '');
    return { passed, pct, decisive, line, first };
  }
  function memberOf(t, ctx) {
    const u = ctx.user;
    if (!u || !u.memberId || (u.tenant && u.tenant !== t.slug)) return null;
    const m = model(t).byId(u.memberId);
    return m && m.seated ? m : null;
  }
  function secretaryOf(t) { const s = (t.members || []).find((m) => m.title === 'Secretary'); return s ? s.name : 'the Secretary'; }
  function myVote(ctx, b) {
    if (!ctx.user) return null;
    return Store.list('votes').find((v) => v.ballotId === b.id && v.createdBy === ctx.user.id) || null;
  }
  /* ---------------- meeting time, calendar, start ---------------- */
  function meetingStart(t) {
    const m = t.meeting;
    const mm = String(m.time || '7:00 PM').match(/(\d{1,2}):(\d{2})\s*([AP])M/i);
    let h = mm ? Number(mm[1]) % 12 : 19; const min = mm ? Number(mm[2]) : 0;
    if (mm && /p/i.test(mm[3])) h += 12;
    const [y, mo, d] = String(m.date).split('-').map(Number);
    return new Date(y, mo - 1, d, h, min);
  }
  function countdown(t) {
    const ms = meetingStart(t) - Date.now();
    if (ms <= 0) return 'Start time has arrived';
    const mins = Math.floor(ms / 60000), d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), mi = mins % 60;
    const part = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    return 'Starts in ' + (d ? `${part(d, 'day')}, ${part(h, 'hour')}` : h ? `${part(h, 'hour')}, ${part(mi, 'minute')}` : part(Math.max(1, mi), 'minute'));
  }
  function downloadIcs(t, s) {
    const m = t.meeting;
    const st = meetingStart(t);
    const en = new Date(st.getTime() + 2 * 3600 * 1000);
    const f = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const escI = (x) => String(x || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const desc = `Agenda:\n${(m.agenda || []).map((a, i) => `${i + 1}. ${a}`).join('\n')}` + (s.zoomUrl ? `\n\nJoin: ${s.zoomUrl}` : '');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RCCC Network//Meetings//EN', 'BEGIN:VEVENT',
      `UID:${m.id}@rccc-network`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(st)}`, `DTEND:${f(en)}`,
      `SUMMARY:${escI(t.shortName + ' ' + m.title)}`, `LOCATION:${escI(s.zoomUrl || (m.provider || 'Zoom'))}`, `DESCRIPTION:${escI(desc)}`,
      'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    a.download = `${t.slug}-${m.id}.ics`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  /* Starts the meeting: brings in the attendance from the sign-in sheet and the early votes in the seed. */
  function startMeeting(t, byName) {
    const M = model(t);
    return mutate(t, (s) => {
      if (started(s)) return false;
      s.status = 'open'; s.startedAt = new Date().toISOString(); s.startedBy = byName || (t.chair ? t.chair.name : 'The chair'); s.agendaIdx = 0;
      addLog(s, `Meeting started by ${s.startedBy} on ${t.meeting.provider || 'Zoom'}`, 'info');
      M.seedProxies.filter((p) => p.verified).forEach((p) => addLog(s, `Proxy on file and verified: ${p.grantorName} to ${p.holderName}`, 'proxy'));
      addLog(s, `${M.present.length} members signed in from the attendance sheet`, 'quorum');
      const q = quorum(t, s);
      if (q.reached) addLog(s, `Quorum reached: ${q.present} of ${q.seated} seated members present (${q.need} needed)`, 'quorum');
      (t.ballots || []).filter((b) => b.status === 'closed').forEach((b) => {
        const n = b.options.reduce((x, o) => x + Number(b.tally[o.id] || 0), 0);
        addLog(s, `Voting closed on “${b.title}”: ${fmtW(n)} votes counted`, 'close');
      });
      return true;
    });
  }

  /* ---------------- minutes ---------------- */
  function buildMinutes(t, s) {
    const M = model(t);
    const m = t.meeting;
    const q = quorum(t, s);
    const names = Array.from(q.here).map((id) => (M.byId(id) || {}).name).filter(Boolean).sort();
    const prox = proxiesOf(t, s);
    const lines = [];
    lines.push(`Minutes of the ${m.title}`);
    lines.push(`${t.name} Central Committee`);
    lines.push(`${fmtDate(m.date)}, ${m.time}, held on ${m.provider || 'Zoom'}`);
    lines.push('');
    lines.push(`Call to order: ${t.chair ? 'Chair ' + t.chair.name : 'The chair'} called the meeting to order at ${s.startedAt ? clock(s.startedAt) : m.time}.`);
    lines.push(`Attendance: ${q.present} of ${q.seated} seated members were present, ${q.inRoom} in person or online and ${q.viaProxy} by verified proxy. Quorum under the bylaws is a majority of seated members (${q.need}), and quorum ${q.reached ? 'was reached' : 'was not reached'}.`);
    lines.push(`Members present: ${names.join(', ')}.`);
    if (prox.length) lines.push(`Proxies: ${prox.map((p) => `${p.grantorName} to ${p.holderName} (${p.verified ? 'verified' : 'not verified'})`).join('; ')}.`);
    lines.push('');
    lines.push('Agenda');
    (m.agenda || []).forEach((a, i) => lines.push(`${i + 1}. ${a}`));
    lines.push('');
    lines.push('Motions and results');
    (t.ballots || []).forEach((b) => {
      const v = ballotView(t, s, b);
      const r = result(b, v);
      const counts = b.options.map((o) => `${o.label} ${fmtW(v.tally[o.id])}`).join(', ');
      lines.push(`- ${b.title} (${TYPE_LABEL[b.type].toLowerCase()}, ${b.threshold > 60 ? 'two-thirds' : 'majority'} needed): ${counts}. ${v.status === 'closed' ? r.line : 'Voting was still open.'}`);
    });
    lines.push('');
    lines.push(`Adjournment: The meeting adjourned at ${s.closedAt ? clock(s.closedAt) : '(time)'}.`);
    lines.push('');
    lines.push(`Respectfully submitted,`);
    lines.push(`${secretaryOf(t)}, Secretary (draft, not yet approved)`);
    return lines.join('\n');
  }
  function printMinutes(t, text) {
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f);
    const d = f.contentDocument;
    d.open();
    d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.meeting.title)} minutes</title><style>body{font:15px/1.6 Georgia,serif;margin:48px;color:#111}pre{white-space:pre-wrap;font:inherit}</style></head><body><pre>${esc(text)}</pre></body></html>`);
    d.close();
    setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* ignore */ } setTimeout(() => f.remove(), 1000); }, 60);
  }

  /* ---------------- styles ---------------- */
  function injectStyles() {
    if (document.getElementById('gov-styles')) return;
    const s = document.createElement('style');
    s.id = 'gov-styles';
    s.textContent = `
.scr-gov .badge { max-width: 100%; white-space: normal; }
.scr-gov .table-wrap { position: relative; }
.scr-gov .gov-tab-count { display:inline-block; margin-left:6px; font-size:12.5px; background:var(--surface-2); border:1px solid var(--line); border-radius:999px; padding:0 7px; color:var(--ink-2); }
.scr-gov .gov-grid { display:grid; grid-template-columns: minmax(0,1.5fr) minmax(0,1fr); gap:20px; align-items:start; }
.scr-gov .gov-mhead { display:flex; flex-wrap:wrap; gap:14px 20px; align-items:flex-start; }
.scr-gov .gov-mhead h2 { margin:0 0 6px; font-size:1.45rem; }
.scr-gov .gov-meta { display:flex; flex-wrap:wrap; gap:6px 16px; color:var(--ink-2); font-size:15px; }
.scr-gov .gov-meta span { display:inline-flex; align-items:center; gap:6px; }
.scr-gov .gov-zoom { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-top:16px; padding-top:16px; border-top:1px solid var(--line); }
.scr-gov .gov-zoom form { display:flex; gap:8px; flex:1 1 320px; min-width:0; }
.scr-gov .gov-zoom .input { flex:1; min-width:0; }
.scr-gov .gov-checkin { display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
.scr-gov .gov-checkin .gov-ci-txt { flex:1 1 220px; min-width:0; }
.scr-gov .gov-checkin h3 { margin:0 0 2px; font-size:1.15rem; }
.scr-gov .gov-checkin p { margin:0; color:var(--ink-2); }
.scr-gov .gov-checkin.is-in { background:var(--ok-soft); border-radius:var(--r-lg); }
.scr-gov .gov-checkin.is-in h3 { color:var(--ok); }
.scr-gov .gov-ci-mark { width:44px; height:44px; flex:none; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; background:var(--ok); color:#fff; }
.scr-gov .gov-ci-mark.pending { background:color-mix(in srgb, var(--brand) 10%, white); color:var(--brand); }
.scr-gov .gov-pop { animation: gov-pop .45s cubic-bezier(.2,.9,.3,1.3); }
@keyframes gov-pop { from { transform:scale(.6); opacity:0; } to { transform:none; opacity:1; } }
.scr-gov .gov-gauge { display:flex; gap:18px; align-items:center; flex-wrap:wrap; }
.scr-gov .gov-gauge svg { flex:none; }
.scr-gov .gov-gauge-txt { flex:1 1 160px; min-width:0; }
.scr-gov .gov-big { font-family:var(--font-head); font-stretch:80%; font-weight:800; font-size:1.3rem; line-height:1.15; }
.scr-gov .gov-rule { margin-top:14px; padding:12px 14px; border-radius:var(--r); background:var(--surface-2); border:1px solid var(--line); font-size:14.5px; color:var(--ink-2); }
.scr-gov .gov-qstate { margin-top:12px; padding:10px 12px; border-radius:var(--r); font-weight:600; font-size:15px; display:flex; gap:8px; align-items:center; }
.scr-gov .gov-qstate.ok { background:var(--ok-soft); color:var(--ok); }
.scr-gov .gov-qstate.warn { background:var(--warn-soft); color:var(--warn); }
.scr-gov .gov-agenda { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; }
.scr-gov .gov-agenda li { display:flex; gap:10px; align-items:flex-start; padding:10px; border-radius:var(--r-sm); border:1px solid transparent; font-size:15px; transition:background-color .25s ease, border-color .25s ease; }
.scr-gov .gov-agenda li > span:nth-child(2) { flex:1; min-width:0; overflow-wrap:anywhere; }
.scr-gov .gov-num { flex:none; width:26px; height:26px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; background:var(--surface-2); border:1px solid var(--line); color:var(--ink-2); }
.scr-gov .gov-agenda li.done { color:var(--ink-3); }
.scr-gov .gov-agenda li.done .gov-num { background:var(--ok-soft); color:var(--ok); border-color:transparent; }
.scr-gov .gov-agenda li.current { background:color-mix(in srgb, var(--brand) 8%, white); border-color:color-mix(in srgb, var(--brand) 30%, white); font-weight:600; color:var(--ink); }
.scr-gov .gov-agenda li.current .gov-num { background:var(--brand); color:var(--brand-ink); border-color:var(--brand); }
.scr-gov .gov-now { font-size:12px; font-weight:700; color:var(--accent); display:block; letter-spacing:.04em; }
.scr-gov .gov-people { display:flex; flex-wrap:wrap; gap:6px; list-style:none; margin:0; padding:0; }
.scr-gov .gov-person { display:inline-flex; align-items:center; gap:6px; padding:3px 10px 3px 3px; border-radius:999px; background:var(--surface-2); border:1px solid var(--line); font-size:13.5px; max-width:100%; }
.scr-gov .gov-person span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
.scr-gov .gov-person.me { background:var(--ok-soft); border-color:color-mix(in srgb, var(--ok) 30%, white); font-weight:700; }
.scr-gov .is-new { animation: gov-in .45s cubic-bezier(.2,.8,.2,1); }
@keyframes gov-in { from { opacity:0; transform:translateY(-6px) scale(.96); } to { opacity:1; transform:none; } }
.scr-gov .gov-note { display:flex; gap:10px; align-items:flex-start; padding:12px 14px; border-radius:var(--r); background:var(--info-soft); color:var(--info); font-size:15px; font-weight:500; }
.scr-gov .gov-note.warn { background:var(--warn-soft); color:var(--warn); }
.scr-gov .gov-note.ok { background:var(--ok-soft); color:var(--ok); }
.scr-gov .gov-note.plain { background:var(--surface-2); color:var(--ink-2); }
.scr-gov .gov-note svg { flex:none; margin-top:2px; }
.scr-gov .gov-note .btn { margin-top:8px; }
.scr-gov fieldset.gov-opts { border:0; padding:0; margin:0; display:flex; flex-direction:column; gap:8px; min-width:0; }
.scr-gov .gov-opts legend { font-weight:600; font-size:14.5px; color:var(--ink-2); margin-bottom:8px; padding:0; }
.scr-gov .gov-opt { display:flex; align-items:center; gap:12px; padding:12px 14px; min-height:50px; border:1.5px solid var(--line-strong); border-radius:var(--r); background:var(--surface); font:600 15.5px/1.3 var(--font-body); color:var(--ink); cursor:pointer; transition:border-color .15s ease, background-color .15s ease; }
.scr-gov .gov-opt:hover { border-color:var(--brand); }
.scr-gov .gov-opt input { width:20px; height:20px; margin:0; flex:none; accent-color:var(--brand); }
.scr-gov .gov-opt:has(input:checked) { border-color:var(--brand); background:color-mix(in srgb, var(--brand) 7%, white); }
.scr-gov .gov-opt:has(input:focus-visible) { box-shadow:var(--focus); }
.scr-gov .gov-turnout { height:10px; background:var(--surface-2); border:1px solid var(--line); border-radius:999px; overflow:hidden; }
.scr-gov .gov-turnout > span { display:block; height:100%; background:var(--brand); border-radius:999px; transition:width .5s ease; }
.scr-gov .gov-slot { border:2px dashed var(--line-strong); border-radius:var(--r-lg); padding:18px; background:var(--surface-2); color:var(--ink-3); min-width:0; }
.scr-gov .gov-slot.is-filled { border-style:solid; background:var(--surface); color:var(--ink); }
.scr-gov .gov-slot.receipt { border-color:color-mix(in srgb, var(--ok) 45%, white); background:var(--ok-soft); }
.scr-gov .gov-slot h4 { margin:0 0 6px; }
.scr-gov .gov-code { font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace; font-size:1.2rem; font-weight:700; letter-spacing:.06em; background:var(--surface); border:1px solid var(--line); border-radius:var(--r-sm); padding:8px 12px; display:inline-block; color:var(--ink); word-break:break-all; }
.scr-gov .gov-bars { display:flex; flex-direction:column; gap:12px; margin:10px 0 8px; }
.scr-gov .gov-bar-row { display:grid; grid-template-columns: minmax(90px,150px) minmax(0,1fr) 104px; gap:10px; align-items:center; font-size:15px; }
.scr-gov .gov-bar-track { position:relative; height:24px; background:var(--surface-2); border:1px solid var(--line); border-radius:6px; }
.scr-gov .gov-bar-fill { position:absolute; left:0; top:0; bottom:0; border-radius:5px 0 0 5px; background:var(--brand); animation: gov-grow .7s cubic-bezier(.2,.8,.2,1); transform-origin:left; }
.scr-gov .gov-bar-fill.alt { background:var(--line-strong); }
@keyframes gov-grow { from { transform:scaleX(0); } to { transform:none; } }
.scr-gov .gov-thresh { position:absolute; top:-5px; bottom:-5px; width:0; border-left:2px dashed var(--accent); }
.scr-gov .gov-bar-val { text-align:right; font-variant-numeric:tabular-nums; font-weight:700; }
.scr-gov .gov-legend { display:flex; align-items:flex-start; gap:8px; font-size:13.5px; color:var(--ink-2); }
.scr-gov .gov-legend i { flex:none; margin-top:3px; display:inline-block; width:0; height:14px; border-left:2px dashed var(--accent); }
.scr-gov .gov-verdict { font-size:15.5px; font-weight:600; margin:8px 0 0; }
.scr-gov .gov-ballot-grid { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); gap:20px; }
.scr-gov .gov-scroll { max-height:380px; overflow:auto; }
.scr-gov .gov-scroll .table th { position:sticky; top:0; z-index:1; }
.scr-gov .gov-audit { list-style:none; margin:0; padding:0; }
.scr-gov .gov-audit li { display:grid; grid-template-columns: 78px 14px minmax(0,1fr); gap:10px; padding:10px 0; border-bottom:1px solid var(--line); font-size:15px; align-items:start; }
.scr-gov .gov-audit li:last-child { border-bottom:0; }
.scr-gov .gov-audit time { font-variant-numeric:tabular-nums; color:var(--ink-3); font-weight:600; font-size:14px; }
.scr-gov .gov-audit .dot { width:10px; height:10px; border-radius:50%; margin-top:6px; background:var(--line-strong); }
.scr-gov .gov-audit .dot.quorum { background:var(--ok); } .scr-gov .gov-audit .dot.vote { background:var(--brand); }
.scr-gov .gov-audit .dot.proxy { background:var(--master); } .scr-gov .gov-audit .dot.close { background:var(--accent); }
.scr-gov .gov-minutes { width:100%; min-height:420px; font:15px/1.6 var(--font-body); }
.scr-gov .gov-minutes-read { white-space:pre-wrap; font:15px/1.65 var(--font-body); margin:0; overflow-wrap:anywhere; }
.scr-gov .gov-verify { display:flex; gap:8px; flex-wrap:wrap; }
.scr-gov .gov-verify .input { flex:1 1 220px; min-width:0; font-family: ui-monospace, Menlo, monospace; text-transform:uppercase; }
.scr-gov .gov-verify-out:empty { display:none; }
.scr-gov .gov-countdown { margin-top:10px; display:inline-flex; font:700 14.5px/1.2 var(--font-body); color:var(--brand); background:color-mix(in srgb, var(--brand) 8%, white); border-radius:999px; padding:6px 12px; }
.scr-gov .gov-start { display:flex; flex-wrap:wrap; gap:8px 14px; align-items:center; margin-top:16px; padding-top:16px; border-top:1px solid var(--line); }
.scr-gov .gov-start .small { flex:1 1 240px; }
.gov-chk { display:flex; gap:10px; align-items:flex-start; padding:12px; border:1px solid var(--line); border-radius:var(--r); cursor:pointer; font-weight:600; margin-top:12px; }
.gov-chk input { width:20px; height:20px; margin-top:1px; flex:none; accent-color: var(--brand); }
@media (max-width: 1000px) { .scr-gov .gov-grid { grid-template-columns: minmax(0,1fr); } }
@media (max-width: 860px) {
  .scr-gov .gov-ballot-grid { grid-template-columns:minmax(0,1fr); }
  .scr-gov .gov-bar-row { grid-template-columns: minmax(0,1fr) 104px; }
  .scr-gov .gov-bar-row .gov-bar-track { grid-column: 1 / -1; grid-row: 2; }
}
@media (max-width: 560px) {
  .scr-gov .gov-audit li { grid-template-columns: 66px 12px minmax(0,1fr); gap:8px; }
  .scr-gov .gov-checkin .btn, .scr-gov .gov-cast .btn { width:100%; min-height:48px; }
  .scr-gov .card-head .btn { min-height:44px; }
  .scr-gov .gov-zoom form { flex-direction:column; }
  .scr-gov .gov-start .btn { width:100%; min-height:48px; }
  .scr-gov .gov-mtable thead { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
  .scr-gov .gov-mtable, .scr-gov .gov-mtable tbody { display:block; }
  .scr-gov .gov-mtable tr { display:flex; flex-wrap:wrap; align-items:center; gap:4px 8px; padding:10px 12px; border-bottom:1px solid var(--line); }
  .scr-gov .gov-mtable tr:last-child { border-bottom:0; }
  .scr-gov .gov-mtable td { display:block; padding:0; border:0; background:none !important; text-align:left; }
  .scr-gov .gov-mtable td.gm-name { order:1; flex:1 1 0; min-width:0; font-weight:600; }
  .scr-gov .gov-mtable tr::after { content:''; order:3; flex-basis:100%; height:0; }
  .scr-gov .gov-mtable td.gm-vote { order:2; }
  .scr-gov .gov-mtable td.gm-vote { margin-left:auto; flex:none; }
  .scr-gov .gov-mtable td.gm-title, .scr-gov .gov-mtable td.gm-weight, .scr-gov .gov-mtable td.gm-line { order:4; font-size:13.5px; color:var(--ink-3); }
  .scr-gov .gov-mtable td.gm-title { flex-basis:auto; }
  .scr-gov .gov-mtable td.gm-weight::before, .scr-gov .gov-mtable td.gm-title[data-label]::before, .scr-gov .gov-mtable td.gm-line::before { content:attr(data-label); }
  .scr-gov .gov-mtable td.gm-weight::after { content:''; }
  .scr-gov .gov-mtable td.gm-title + td.gm-weight::before { content:'· Weight '; }
  .scr-gov .gov-mtable td.gm-line { flex-basis:100%; }
  .scr-gov .gov-mtable td.gm-act { order:5; flex-basis:100%; }
  .scr-gov .gov-mtable td.gm-act:empty { display:none; }
  .scr-gov .gov-scroll { max-height:none; }
}
@media (prefers-reduced-motion: reduce) {
  .scr-gov .is-new, .scr-gov .gov-pop, .scr-gov .gov-bar-fill { animation:none; }
}
@media (max-width: 640px), (pointer: coarse) {
.scr-gov .chip, .scr-gov .gov-agenda .chip { min-height: 44px !important; }
}
`;
    document.head.appendChild(s);
  }

  /* ---------------- pieces ---------------- */
  const freshIds = new Set();
  const sel = {};
  let popCheckin = false;

  function tabsHtml(sub, t, s) {
    const open = (t.ballots || []).filter((b) => ballotView(t, s, b).status === 'open').length;
    const tab = (id, label, extra) => `<a class="tab${sub === id ? ' active' : ''}" href="#/governance${id ? '/' + id : ''}"${sub === id ? ' aria-current="page"' : ''}>${label}${extra || ''}</a>`;
    return `<nav class="tabs" aria-label="Meetings and voting sections">
      ${tab('', 'Meeting')}${tab('ballots', 'Ballots', open ? `<span class="gov-tab-count">${open} open</span>` : '')}${tab('proxies', 'Proxies &amp; record')}
    </nav>`;
  }
  function gaugeSvg(q) {
    const r = 52, c = 2 * Math.PI * r, frac = Math.min(1, q.present / q.seated);
    const a = (q.need / q.seated) * 2 * Math.PI - Math.PI / 2;
    const p = (rr) => [64 + rr * Math.cos(a), 64 + rr * Math.sin(a)].map((x) => x.toFixed(1));
    const [x1, y1] = p(r - 12), [x2, y2] = p(r + 12);
    const col = q.reached ? 'var(--ok)' : 'var(--warn)';
    return `<svg width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="${q.present} of ${q.seated} seated members present; quorum needs ${q.need}">
      <circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--line)" stroke-width="14" stroke-opacity=".7"/>
      <circle cx="64" cy="64" r="${r}" fill="none" stroke="${col}" stroke-width="14" stroke-linecap="round"
        stroke-dasharray="${(c * frac).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 64 64)" style="transition:stroke-dasharray .5s ease"/>
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>
      <text x="64" y="62" text-anchor="middle" font-family="var(--font-head)" font-weight="800" font-size="30" fill="var(--ink)">${q.present}</text>
      <text x="64" y="82" text-anchor="middle" font-family="var(--font-body)" font-size="13" fill="var(--ink-3)">of ${q.seated} seated</text>
    </svg>`;
  }
  function quorumCard(t, s) {
    const q = quorum(t, s);
    if (!started(s)) {
      return `<div class="card" data-tour="gov-quorum">
      <div class="card-head"><h3>Quorum</h3><span class="spacer"></span><span class="badge">Not started</span></div>
      <div class="card-body">
        <div class="gov-gauge">${gaugeSvg(q)}
          <div class="gov-gauge-txt"><div class="gov-big">Quorum needs ${q.need} of ${q.seated}</div>
            <div class="small muted" style="margin-top:6px">Attendance counts from the moment the chair starts the meeting.</div></div></div>
        <div class="gov-rule"><strong>The rule:</strong> under the bylaws, quorum is a majority of seated members, ${q.need} of ${q.seated}. A verified proxy counts when its holder is checked in and the member who gave it is not.</div>
      </div></div>`;
    }
    return `<div class="card" data-tour="gov-quorum">
      <div class="card-head"><h3>Quorum</h3><span class="spacer"></span>
        <span class="badge ${q.reached ? 'badge-ok' : 'badge-warn'}">${q.reached ? 'Quorum met' : 'Waiting for quorum'}</span></div>
      <div class="card-body">
        <div class="gov-gauge">${gaugeSvg(q)}
          <div class="gov-gauge-txt" aria-live="polite">
            <div class="gov-big">${q.present} of ${q.seated} seated members present</div>
            <div style="color:var(--ink-2);margin-top:2px">Quorum needs <strong>${q.need}</strong></div>
            <div class="small muted" style="margin-top:6px">${q.inRoom} checked in, ${q.viaProxy} by verified proxy. The dark tick marks the quorum line.</div>
          </div></div>
        <div class="gov-qstate ${q.reached ? 'ok' : 'warn'}">${q.reached ? `${IC.check} ${s.status === 'closed' ? 'Quorum was met for this meeting.' : 'Quorum is met. Voting can go ahead.'}` : `${IC.users} ${q.need - q.present} more needed before anyone can vote`}</div>
        <div class="gov-rule"><strong>The rule:</strong> under the bylaws, quorum is a majority of seated members, ${q.need} of ${q.seated}. A verified proxy counts when its holder is checked in and the member who gave it is not.</div>
      </div></div>`;
  }
  function checkinCard(t, s, ctx) {
    const me = memberOf(t, ctx);
    if (!me) {
      return `<div class="card"><div class="card-body"><div class="gov-note plain">${IC.users}<span>Only seated members of the ${esc(t.shortName)} central committee check in and vote. Your account isn’t linked to a seat, so you can follow along here.</span></div></div></div>`;
    }
    if (!started(s)) {
      const mine = proxiesOf(t, s).find((p) => p.grantorId === me.id);
      return `<div class="card"><div class="card-body gov-checkin">
        <span class="gov-ci-mark pending">${IC.clock}</span>
        <div class="gov-ci-txt"><h3>Check-in opens when the meeting starts</h3><p>${mine ? `Your proxy goes to ${esc(mine.holderName)}${mine.verified ? ' and is verified' : ', waiting for the secretary'}.` : 'Can’t make it on the 20th? Give your proxy to another member ahead of time.'}</p></div>
        ${mine ? '' : '<a class="btn" href="#/governance/proxies">Give my proxy</a>'}
      </div></div>`;
    }
    const ci = (s.checkIns || {})[me.id];
    const closed = s.status === 'closed';
    if (ci) {
      const pop = popCheckin; popCheckin = false;
      return `<div class="card"><div class="card-body gov-checkin is-in">
        <span class="gov-ci-mark${pop ? ' gov-pop' : ''}">${I('<path d="M4.5 10.5l3.5 3.5 7.5-8"/>', 22)}</span>
        <div class="gov-ci-txt"><h3>You’re checked in</h3><p>${esc(me.name)}, checked in at ${esc(clock(ci.at))}. You count toward quorum${closed ? '' : ' and can vote'}.</p></div>
        ${closed ? '' : '<button class="btn btn-sm btn-ghost" data-act="checkout">Check out</button>'}
      </div></div>`;
    }
    if (closed) return `<div class="card"><div class="card-body"><div class="gov-note plain">${IC.clock}<span>This meeting is adjourned. Check-in is closed.</span></div></div></div>`;
    return `<div class="card"><div class="card-body gov-checkin">
      <span class="gov-ci-mark pending">${IC.users}</span>
      <div class="gov-ci-txt"><h3>Check in to the meeting</h3><p>Checking in marks you present, counts you toward quorum and lets you vote.</p></div>
      <button class="btn btn-primary" data-act="checkin">Check in as ${esc(me.name.split(' ')[0])}</button>
    </div></div>`;
  }
  function attendanceCard(t, s, ctx) {
    const M = model(t);
    const q = quorum(t, s);
    const me = memberOf(t, ctx);
    const checked = Object.keys(s.checkIns || {});
    const ids = Array.from(q.here).sort((a, b) => {
      const ca = checked.includes(a) ? 0 : 1, cb = checked.includes(b) ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return String((M.byId(a) || {}).name).localeCompare(String((M.byId(b) || {}).name));
    });
    const chip = (id) => {
      const m = M.byId(id); if (!m) return '';
      const isMe = me && me.id === id;
      return `<li class="gov-person${isMe ? ' me' : ''}${freshIds.has('ci-' + id) ? ' is-new' : ''}">${U.avatar(m.name, 24)}<span>${esc(isMe ? 'You' : m.name)}</span></li>`;
    };
    const prox = proxiesOf(t, s).filter((p) => q.counted.has(p.grantorId));
    return `<div class="card">
      <div class="card-head"><h3>${s.status === 'closed' ? 'Who attended' : 'Who’s here'}</h3><span class="spacer"></span><span class="small muted">${plural(q.inRoom, 'member')} checked in</span></div>
      <div class="card-body stack" style="gap:12px">
        <ul class="gov-people" aria-label="Members present">${ids.map(chip).join('')}</ul>
        ${prox.length ? `<p class="small muted" style="margin:0">By proxy: ${prox.map((p) => `${esc(p.grantorName)} (held by ${esc(p.holderName)})`).join(', ')}.</p>` : ''}
      </div></div>`;
  }
  function agendaCard(t, s, ctx) {
    const m = t.meeting;
    const run = ctx.can('governance.run');
    const closed = s.status === 'closed';
    const ag = m.agenda || [];
    const ballotFor = (txt) => (t.ballots || []).find((b) => txt.indexOf(b.title.split(' (')[0].split(' for ')[0]) === 0);
    const items = ag.map((a, i) => {
      const cls = !started(s) ? '' : closed || i < s.agendaIdx ? 'done' : i === s.agendaIdx ? 'current' : '';
      const b = ballotFor(a);
      return `<li class="${cls}"><span class="gov-num">${cls === 'done' ? IC.check : i + 1}</span>
        <span>${cls === 'current' ? '<span class="gov-now">NOW</span>' : ''}${esc(a)}</span>
        ${b ? `<a class="chip" href="#/governance/ballots" style="min-height:30px;padding:2px 10px;font-size:13px">Open ballot</a>` : ''}</li>`;
    }).join('');
    const last = s.agendaIdx >= ag.length - 1;
    return `<div class="card" data-tour="gov-meeting">
      <div class="card-head"><h3>Agenda</h3><span class="spacer"></span>
        ${!started(s) ? '' : closed ? '<span class="badge badge-ok">Meeting adjourned</span>' : run && !last ? '<button class="btn btn-sm" data-act="next">Next agenda item</button>' : ''}</div>
      <div class="card-body"><ol class="gov-agenda">${items}</ol></div></div>`;
  }
  function openBallotsCard(t, s, ctx) {
    const me = memberOf(t, ctx);
    const open = (t.ballots || []).filter((b) => ballotView(t, s, b).status === 'open');
    if (!open.length) return '';
    const q = quorum(t, s);
    const checkedIn = me && (s.checkIns || {})[me.id];
    return `<div class="card">
      <div class="card-head"><h3>Open ballots</h3></div>
      <div class="card-body stack" style="gap:12px">
        ${open.map((b) => {
          const v = ballotView(t, s, b);
          const done = me && v.votedIds.has(me.id);
          return `<div class="row" style="justify-content:space-between;align-items:flex-start">
            <div style="flex:1 1 220px;min-width:0"><strong style="overflow-wrap:anywhere">${esc(b.title)}</strong>
              <div class="small muted">${TYPE_LABEL[b.type]} · ${plural(v.voters, 'member')} voted</div></div>
            ${done ? `<span class="badge badge-ok">${IC.check} You voted</span>` : `<a class="btn btn-sm${checkedIn && q.reached ? ' btn-primary' : ''}" href="#/governance/ballots">Vote now</a>`}
          </div>`;
        }).join('')}
      </div></div>`;
  }
  function minutesCard(t, s, ctx) {
    if (s.status !== 'closed') return '';
    const run = ctx.can('governance.run');
    const text = (s.minutes && s.minutes.text) || buildMinutes(t, s);
    const saved = s.minutes && s.minutes.savedAt;
    return `<div class="card${freshIds.has('minutes') ? ' is-new' : ''}" style="margin-bottom:20px" id="gov-minutes-card">
      <div class="card-head">${IC.doc}<h3>Draft minutes</h3><span class="spacer"></span>
        <span class="badge${saved ? ' badge-ok' : ''}">${saved ? `Saved by ${esc(s.minutes.savedBy || 'the board')}` : 'Draft from the meeting record'}</span></div>
      <div class="card-body stack" style="gap:12px">
        ${run ? `<p class="small muted" style="margin:0">Built from attendance, quorum, proxies and every ballot result. Edit anything, then save so the committee can read the same version.</p>
          <label class="sr-only" for="gov-min">Minutes text</label>
          <textarea id="gov-min" class="textarea gov-minutes">${esc(text)}</textarea>
          <div class="row"><button class="btn btn-primary" data-act="min-save">Save minutes</button><button class="btn" data-act="min-print">${IC.print} Print</button>
            <span class="spacer"></span><button class="btn btn-ghost btn-sm" data-act="min-rebuild">Rebuild from the record</button></div>`
          : `<pre class="gov-minutes-read">${esc(text)}</pre><div class="row"><button class="btn" data-act="min-print">${IC.print} Print</button></div>`}
      </div></div>`;
  }

  /* ---------------- meeting tab ---------------- */
  function renderMeeting(t, s, ctx) {
    const m = t.meeting;
    const run = ctx.can('governance.run');
    const closed = s.status === 'closed';
    const zoom = closed && !s.zoomUrl ? '' : s.zoomUrl
      ? `<a class="btn ${closed || !started(s) ? '' : 'btn-primary'}" href="${esc(s.zoomUrl)}" target="_blank" rel="noopener">${IC.video} Join on ${esc(m.provider || 'Zoom')}</a>
         ${run ? '<button class="btn btn-ghost btn-sm" data-act="zoom-edit">Change link</button>' : ''}`
      : run
        ? `<form data-form="zoom" novalidate><label class="sr-only" for="gov-zoom">${esc(m.provider || 'Zoom')} link</label><input id="gov-zoom" class="input" type="url" inputmode="url" placeholder="https://zoom.us/j/…"><button class="btn" type="submit">Add ${esc(m.provider || 'Zoom')} link</button></form>`
        : `<span class="small muted">${IC.video} The chair posts the ${esc(m.provider || 'Zoom')} link here before ${esc(m.time)}.</span>`;
    return `
      ${minutesCard(t, s, ctx)}
      <div class="gov-grid">
        <div class="stack">
          <div class="card"><div class="card-body">
            <div class="gov-mhead">
              <div style="flex:1 1 300px;min-width:0">
                <h2>${esc(m.title || 'Central committee meeting')}</h2>
                <div class="gov-meta">
                  <span>${IC.clock} ${esc(fmtDate(m.date))} · ${esc(m.time || '')}</span>
                  <span>Chair: ${esc(t.chair ? t.chair.name : '')}</span>
                </div>
                ${started(s) ? '' : `<div class="gov-countdown" data-countdown>${esc(countdown(t))}</div>`}
              </div>
              <span class="badge ${closed ? '' : started(s) ? 'badge-ok' : 'badge-local'}">${closed ? `Adjourned${s.closedAt ? ' at ' + esc(clock(s.closedAt)) : ''}` : started(s) ? 'In session' : 'Scheduled'}</span>
            </div>
            <div class="gov-zoom">${zoom}
              ${started(s) ? '' : `<button class="btn btn-ghost" data-act="ics">${IC.clock} Add to calendar</button>`}
              ${run && started(s) ? `<span class="spacer"></span>${closed ? '<button class="btn btn-sm btn-ghost" data-act="reopen">Reopen meeting</button>' : '<button class="btn btn-sm" data-act="close-meeting">Close meeting</button>'}` : ''}
            </div>
            ${run && !started(s) ? `<div class="gov-start"><button class="btn btn-primary" data-act="start">Start meeting</button><span class="small muted">Starting before ${esc(m.time)} on the 20th is fine for practice runs. It opens check-in and voting.</span></div>` : ''}
          </div></div>
          ${checkinCard(t, s, ctx)}
          ${agendaCard(t, s, ctx)}
        </div>
        <div class="stack">
          ${quorumCard(t, s)}
          ${openBallotsCard(t, s, ctx)}
          ${started(s) ? attendanceCard(t, s, ctx) : ''}
        </div>
      </div>`;
  }

  /* ---------------- ballots tab ---------------- */
  function resultsBlock(b, v) {
    const opts = b.options.filter((o) => o.id !== 'abstain');
    const r = result(b, v);
    const unit = b.type === 'WEIGHTED' ? ' wt' : '';
    const bars = opts.map((o, i) => {
      const val = v.tally[o.id] || 0, p = r.decisive ? (val / r.decisive) * 100 : 0;
      return `<div class="gov-bar-row"><span>${esc(o.label)}</span>
        <span class="gov-bar-track"><span class="gov-bar-fill${i ? ' alt' : ''}" style="width:${p.toFixed(1)}%"></span><span class="gov-thresh" style="left:${b.threshold}%" title="Needed: ${b.threshold}%"></span></span>
        <span class="gov-bar-val">${p.toFixed(1)}% <span class="muted small">(${fmtW(val)}${unit})</span></span></div>`;
    }).join('');
    return `<div class="row" style="justify-content:space-between"><h4 style="margin:0">Result</h4>
        <span class="badge ${r.passed ? 'badge-ok' : 'badge-danger'}" style="font-size:14.5px;padding:5px 12px">${r.passed ? 'Passed' : 'Failed'}</span></div>
      <div class="gov-bars">${bars}</div>
      <div class="gov-legend"><i></i> The dashed line is the ${b.threshold > 60 ? 'two-thirds' : 'majority'} needed to pass.</div>
      <p class="gov-verdict">${esc(r.line)}</p>`;
  }
  function turnoutBlock(t, b, v) {
    if (v.status === 'scheduled') return '';
    const M = model(t);
    const isW = b.type === 'WEIGHTED';
    const total = isW ? M.seated.reduce((sum, m) => sum + (m.weight || 1), 0) : M.seated.length;
    const n = isW ? v.cast : v.voters;
    return `<div><div class="row" style="justify-content:space-between;margin-bottom:6px">
        <strong>${isW ? 'Weighted turnout' : 'Turnout'}: ${fmtW(n)} of ${fmtW(total)} ${isW ? '' : 'members '}voted</strong>
        ${v.status === 'open' && b.type === 'SECRET' ? '<span class="small muted">The count stays sealed until voting closes</span>' : ''}</div>
      <div class="gov-turnout"><span style="width:${Math.min(100, (n / total) * 100).toFixed(1)}%"></span></div></div>`;
  }
  function voteBlock(t, s, b, v, ctx) {
    const me = memberOf(t, ctx);
    const q = quorum(t, s);
    if (v.status === 'scheduled') return `<div class="gov-note plain">${IC.clock}<span>Voting opens when the chair starts the meeting on ${esc(fmtDate(t.meeting.date))} at ${esc(t.meeting.time)}.</span></div>`;
    if (v.status === 'closed') return `<div class="gov-note plain">${IC.lock}<span>Voting is closed${v.st.closedBy ? `. ${esc(v.st.closedBy)} closed it${v.st.closedAt ? ' at ' + esc(clock(v.st.closedAt)) : ''}` : ''}.</span></div>`;
    if (!me) return `<div class="gov-note plain">${IC.users}<span>Only seated central committee members can vote on this ballot.</span></div>`;
    if (v.votedIds.has(me.id)) return `<div class="gov-note ok">${IC.check}<span>Your ballot is in. Thank you for voting.</span></div>`;
    if (!q.reached) return `<div class="gov-note warn">${IC.lock}<span>Voting opens once quorum is reached. <a href="#/governance">Open the meeting</a> to see who has checked in.</span></div>`;
    if (!(s.checkIns || {})[me.id]) return `<div class="gov-note">${IC.users}<span>Check in to the meeting before you vote. It takes one tap.<br><button class="btn btn-primary" data-act="checkin">Check in as ${esc(me.name.split(' ')[0])}</button></span></div>`;
    const pick = sel[b.id];
    return `<fieldset class="gov-opts"><legend>${b.type === 'WEIGHTED' ? `Your vote counts as ${fmtW(me.weight || 1)}` : 'Choose one'}</legend>
        ${b.options.map((o) => `<label class="gov-opt"><input type="radio" name="gov-${esc(b.id)}" value="${esc(o.id)}" data-ballot="${esc(b.id)}"${pick === o.id ? ' checked' : ''}>${esc(o.label)}</label>`).join('')}
      </fieldset>
      <div class="row gov-cast"><button class="btn btn-primary" data-act="cast" data-b="${esc(b.id)}"${pick ? '' : ' aria-disabled="true"'}>${b.type === 'SECRET' ? 'Cast secret ballot' : 'Cast vote'}</button>
        <span class="small muted" data-hint="${esc(b.id)}">${pick ? 'You can vote once. It can’t be changed after.' : 'Choose an option first.'}</span></div>`;
  }
  function receiptBlock(b, ctx) {
    const mine = myVote(ctx, b);
    if (mine) {
      return `<div class="gov-slot is-filled receipt${freshIds.has('r-' + b.id) ? ' is-new' : ''}" data-tour="gov-receipt">
        <h4>Your vote receipt</h4>
        <div class="row" style="gap:8px"><span class="gov-code">${esc(mine.receipt)}</span><button class="btn btn-sm" data-act="copy-receipt" data-r="${esc(mine.receipt)}">${IC.copy} Copy</button></div>
        <p style="margin:12px 0 0;color:var(--ink-2)">We store the fact that you voted apart from how you voted. Your receipt confirms your vote was counted, and no one, including the chair, can link it to you.</p>
      </div>`;
    }
    return `<div class="gov-slot" data-tour="gov-receipt"><h4>Your receipt appears here after you vote</h4>
      <p class="small" style="margin:0">A private code that proves your ballot was counted, without showing your choice.</p></div>`;
  }
  function renderBallots(t, s, ctx) {
    const M = model(t);
    const q = quorum(t, s);
    const run = ctx.can('governance.run');
    let firstSecret = true;
    const cards = (t.ballots || []).map((b) => {
      const v = ballotView(t, s, b);
      const head = `<div class="card-head"><h3 style="flex:1 1 260px;min-width:0;overflow-wrap:anywhere">${esc(b.title)}</h3>
        <span class="badge badge-local">${TYPE_LABEL[b.type]}</span><span class="badge">${b.threshold > 60 ? 'Two-thirds needed' : 'Majority needed'}</span>
        ${v.status === 'scheduled' ? '<span class="badge badge-local">Opens when the meeting starts</span>' : v.status !== 'open' ? '<span class="badge">Closed</span>' : q.reached ? '<span class="badge badge-ok">Open</span>' : '<span class="badge badge-warn">On hold until quorum</span>'}
        ${v.status === 'open' && run ? `<button class="btn btn-sm" data-act="close" data-b="${esc(b.id)}">Close voting</button>` : ''}</div>`;
      if (b.type === 'SECRET') {
        const tour = firstSecret ? ' data-tour="gov-ballot"' : ''; firstSecret = false;
        const results = v.status === 'closed'
          ? `<div class="gov-slot is-filled" data-tour="gov-results">${resultsBlock(b, v)}</div>`
          : `<div class="gov-slot" data-tour="gov-results"><h4>Results appear here when voting closes</h4><p class="small" style="margin:0">When the chair closes voting, the result and whether it passed show here.</p></div>`;
        return `<div class="card"${tour}>${head}<div class="card-body gov-ballot-grid">
          <div class="stack">${turnoutBlock(t, b, v)}${voteBlock(t, s, b, v, ctx)}</div>
          <div class="stack">${receiptBlock(b, ctx)}${results}</div></div></div>`;
      }
      const label = (id) => { const o = b.options.find((x) => x.id === id); return o ? (b.type === 'WEIGHTED' ? o.label.split(' ')[0] : o.label) : ''; };
      const good = (id) => id === 'aye' || id === 'yes';
      const assigned = v.status === 'scheduled' ? {} : Object.assign({}, M.seedVotes[b.id] || {}, v.roll);
      const me = memberOf(t, ctx);
      const closed = v.status === 'closed';
      const rows = M.seated.slice().sort((a, c) => (a.weight === 0.5) - (c.weight === 0.5) || 0).map((m) => {
        const vote = assigned[m.id];
        const isMe = me && me.id === m.id;
        const cell = vote ? (closed || b.type === 'ROLL_CALL' || b.type === 'WEIGHTED'
          ? `<span class="badge ${good(vote) ? 'badge-ok' : vote === 'abstain' ? '' : 'badge-danger'}">${esc(label(vote))}</span>` : '<span class="badge badge-ok">Voted</span>')
          : `<span class="muted small">${closed ? 'Did not vote' : v.status === 'scheduled' ? 'Not open yet' : 'Not yet'}</span>`;
        return `<tr${v.roll[m.id] && freshIds.has('v-' + b.id) && isMe ? ' class="is-new"' : ''}><td class="gm-name">${isMe ? '<strong>You</strong>' : esc(m.name)}</td><td class="small gm-title">${esc(m.title)}</td>
          ${b.type === 'WEIGHTED' ? `<td class="num gm-weight" data-label="Weight ">${m.weight === 0.5 ? '<strong>0.5</strong>' : '1'}</td>` : ''}<td class="gm-vote">${cell}</td></tr>`;
      }).join('');
      const totals = b.type === 'WEIGHTED' && !closed
        ? `<div class="row small"><strong>Weighted totals so far:</strong> ${b.options.map((o) => `<span class="badge">${esc(o.label)}: ${fmtW(v.tally[o.id])}</span>`).join(' ')}</div>` : '';
      return `<div class="card">${head}<div class="card-body gov-ballot-grid">
        <div class="stack">${turnoutBlock(t, b, v)}
          ${b.type === 'WEIGHTED' ? '<p class="small" style="margin:0;color:var(--ink-2)">Your bylaws give each seated member a weight of 1 and a seated alternate a weight of 0.5. Totals add up the weights.</p>' : '<p class="small muted" style="margin:0">Roll call votes are public: each member’s name and vote go into the minutes.</p>'}
          ${closed ? `<div class="gov-slot is-filled">${resultsBlock(b, v)}</div>` : voteBlock(t, s, b, v, ctx)}
          ${totals}</div>
        <div class="table-wrap gov-scroll"><table class="table gov-mtable"><thead><tr><th>Member</th><th>Title</th>${b.type === 'WEIGHTED' ? '<th class="num">Weight</th>' : ''}<th>Vote</th></tr></thead><tbody>${rows}</tbody></table></div>
      </div></div>`;
    }).join('');
    const isSched = !started(s);
    return `<div class="stack" style="gap:20px">
      ${isSched ? `<div class="gov-note">${IC.clock}<span>These ballots open when the chair starts the ${esc(t.meeting.title)}. ${esc(countdown(t))}.</span></div>` : q.reached ? '' : `<div class="gov-note warn">${IC.lock}<span>${q.present} of ${q.seated} seated members are present and quorum needs ${q.need}, so voting is on hold.</span></div>`}
      ${cards}
      <div class="card"><div class="card-head"><h3>Check a vote receipt</h3></div>
        <div class="card-body stack" style="gap:10px">
          <p style="margin:0;color:var(--ink-2)">Enter a receipt code to confirm the ballot is in the count. The check never shows how anyone voted.</p>
          <form class="gov-verify" data-form="verify" novalidate><label class="sr-only" for="gov-rc">Receipt code</label>
            <input id="gov-rc" class="input" autocomplete="off" spellcheck="false" placeholder="RC-XXXX-XXXX-XX"><button class="btn" type="submit">Check receipt</button></form>
          <div class="gov-verify-out" aria-live="polite" id="gov-rc-out"></div>
        </div></div>
    </div>`;
  }

  /* ---------------- proxies tab ---------------- */
  function renderProxies(t, s, ctx) {
    const M = model(t);
    const q = quorum(t, s);
    const run = ctx.can('governance.run');
    const me = memberOf(t, ctx);
    const all = proxiesOf(t, s);
    const closed = s.status === 'closed';
    const mine = me ? all.find((p) => p.grantorId === me.id) : null;
    let yours = '';
    if (me) {
      if (mine) {
        const counts = q.counted.has(me.id);
        yours = `<div class="gov-note ${mine.verified ? 'ok' : ''}">${mine.verified ? IC.check : IC.clock}<span>Your proxy goes to <strong>${esc(mine.holderName)}</strong>. ${mine.verified ? (counts ? 'The secretary verified it, and it counts toward quorum now.' : `The secretary verified it. It counts once ${esc(mine.holderName.split(' ')[0])} checks in${(s.checkIns || {})[me.id] ? ' and you are not checked in yourself' : ''}.`) : 'It’s waiting for the secretary to confirm your signed form.'}
          ${!closed && !mine.seed ? `<br><button class="btn btn-sm" data-act="proxy-withdraw" data-id="${esc(mine.id)}">Withdraw my proxy</button>` : ''}</span></div>`;
      } else if (closed) {
        yours = `<div class="gov-note plain">${IC.clock}<span>This meeting is adjourned, so proxies are closed.</span></div>`;
      } else {
        const gave = new Set(all.map((p) => p.grantorId));
        const opts = M.seated.filter((m) => m.id !== me.id && !gave.has(m.id)).sort((a, b) => a.name.localeCompare(b.name));
        yours = `<form class="stack" style="gap:12px" data-form="proxy" novalidate>
          <p style="margin:0;color:var(--ink-2)">Can’t make it? Give your proxy to another seated member. It counts toward quorum once the secretary verifies your signed form and your holder checks in.</p>
          <div><label class="pt-label" for="gov-holder" style="display:block;font-weight:600;font-size:14.5px;margin-bottom:6px;color:var(--ink-2)">Proxy holder</label>
            <select id="gov-holder" class="select"><option value="">Choose a member</option>${opts.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}${m.title && m.title !== 'Committee Member' ? ' · ' + esc(m.title) : ''}</option>`).join('')}</select></div>
          <div class="row"><button class="btn btn-primary" type="submit">Give my proxy</button></div></form>`;
      }
    } else {
      yours = `<div class="gov-note plain">${IC.users}<span>Only seated central committee members give proxies.</span></div>`;
    }
    const rows = all.map((p) => {
      const counts = q.counted.has(p.grantorId);
      const grantorHere = q.here.has(p.grantorId);
      const status = counts ? 'Yes' : !p.verified ? 'After verification' : grantorHere ? `No, ${esc(p.grantorName.split(' ')[0])} is here` : `When ${esc(p.holderName.split(' ')[0])} checks in`;
      return `<tr class="${freshIds.has('p-' + p.id) ? 'is-new' : ''}">
        <td class="gm-name"><span style="display:inline-flex;align-items:center;gap:8px">${U.avatar(p.grantorName, 26)}<span>${esc(p.grantorName)}</span></span></td>
        <td class="gm-title" data-label="Proxy to ">${esc(p.holderName)}</td>
        <td class="gm-vote">${p.verified ? `<span class="badge badge-ok">${IC.check} Verified</span>` : '<span class="badge badge-warn">Waiting for signed form</span>'}</td>
        <td class="gm-line small" data-label="Counts toward quorum: ">${status}</td>
        <td class="gm-act">${!p.verified && run && !closed ? `<button class="btn btn-sm btn-primary" data-act="verify" data-id="${esc(p.id)}">Verify</button>` : p.verified ? `<span class="small muted">${p.verifiedBy ? 'By ' + esc(p.verifiedBy) : 'On file'}</span>` : ''}</td></tr>`;
    }).join('');
    const log = (s.log || []).map((e) => ({ time: clock(e.at), text: e.text, kind: e.kind })).reverse();
    return `<div class="stack" style="gap:20px">
      <div class="card"><div class="card-head"><h3>Your proxy</h3></div><div class="card-body">${yours}</div></div>
      <div class="card" data-tour="gov-proxies">
        <div class="card-head"><h3>Proxies for the ${esc(t.meeting.title)}</h3><span class="spacer"></span><span class="badge">${q.viaProxy} counting toward quorum</span></div>
        <div class="card-body stack" style="gap:14px">
          <div class="table-wrap"><table class="table gov-mtable"><thead><tr><th>Member giving proxy</th><th>Proxy holder</th><th>Status</th><th>Counts toward quorum</th><th><span class="sr-only">Action</span></th></tr></thead><tbody>${rows}</tbody></table></div>
          <div class="small muted">The rule: a verified proxy counts toward quorum when its holder is checked in and the member who gave it is not. Right now ${q.present} of ${q.seated} seated members are present and ${q.need} are needed.</div>
        </div></div>
      <div class="card" data-tour="gov-audit">
        <div class="card-head"><h3>Meeting record</h3><span class="badge">${log.length} entries</span></div>
        <div class="card-body">
          <p class="small muted" style="margin-top:0">Every check-in, proxy, vote and closing is time-stamped as it happens. Vote entries record that a ballot was received, never the choice.</p>
          ${log.length ? '' : '<p style="margin:0;color:var(--ink-2)">Nothing recorded yet. The record starts when the chair starts the meeting, and proxies filed before then show up here too.</p>'}
          <ul class="gov-audit">${log.map((e, i) => `<li class="${i === 0 && freshIds.has('log') ? 'is-new' : ''}"><time>${esc(e.time)}</time><span class="dot ${esc(e.kind)}"></span><span>${esc(e.text)}</span></li>`).join('')}</ul>
        </div></div>
    </div>`;
  }

  /* ---------------- actions ---------------- */
  function doCheckin(t, ctx) {
    if (!App.auth.require('governance.attend', { reason: 'Committee members check in to meetings.' })) return;
    const me = memberOf(t, ctx);
    if (!me) { ctx.toast('Your account isn’t linked to a seat on this committee.', 'info'); return; }
    if (!started(load(t))) { ctx.toast('Check-in opens when the chair starts the meeting.', 'info'); return; }
    const before = quorum(t, load(t)).reached;
    freshIds.add('ci-' + me.id); freshIds.add('log'); popCheckin = true;
    const q = mutate(t, (s) => {
      if (s.status === 'closed') return null;
      s.checkIns = s.checkIns || {};
      s.checkIns[me.id] = { name: me.name, at: new Date().toISOString() };
      addLog(s, `${me.name} checked in`, 'quorum');
      const nq = quorum(t, s);
      if (nq.reached && !before) addLog(s, `Quorum reached: ${nq.present} of ${nq.seated} seated members present (${nq.need} needed)`, 'quorum');
      return nq;
    });
    if (!q) { ctx.toast('This meeting is adjourned.', 'info'); return; }
    ctx.toast(q.reached && !before ? `You’re checked in, and quorum is reached: ${q.present} of ${q.seated} present.` : `You’re checked in. ${q.present} of ${q.seated} seated members are present.`, 'ok');
  }
  function closeBallot(t, ctx, b) {
    if (!App.auth.require('governance.run', { reason: 'Only the chair can close voting.' })) return;
    const v = ballotView(t, load(t), b);
    ctx.modal({
      title: 'Close voting?',
      html: `<p>Close voting on <strong>${esc(b.title)}</strong>. ${plural(v.voters, 'member')} ${v.voters === 1 ? 'has' : 'have'} voted. The result shows to the committee right away, and nobody can vote after this.</p>`,
      actions: [{ label: 'Keep voting open' }, { label: 'Close voting', primary: true, onClick: () => {
        const name = ctx.user ? ctx.user.name : 'The chair';
        const r = mutate(t, (s) => {
          s.ballots[b.id] = Object.assign({}, s.ballots[b.id], { status: 'closed', closedAt: new Date().toISOString(), closedBy: name });
          const nv = ballotView(t, s, b);
          const res = result(b, nv);
          addLog(s, `Voting closed on “${b.title}”: ${fmtW(nv.voters)} votes counted. ${res.passed ? 'Passed' : 'Failed'}.`, 'close');
          return res;
        });
        freshIds.add('log');
        ctx.toast(`Voting closed. ${r.line}`, r.passed ? 'ok' : 'info', { duration: 6000 });
      } }],
    });
  }
  function castVote(t, ctx, b) {
    if (!App.auth.require('governance.vote', { reason: 'Only seated central committee members vote.' })) return;
    const me = memberOf(t, ctx);
    const opt = sel[b.id];
    if (!me) { ctx.toast('Only seated central committee members can vote on this ballot.', 'info'); return; }
    if (!opt) { ctx.toast('Choose an option first.', 'warn'); return; }
    const receipt = newReceipt();
    const outcome = mutate(t, (s) => {
      const v = ballotView(t, s, b);
      if (v.status !== 'open' || s.status === 'closed') return 'closed';
      if (v.votedIds.has(me.id)) return 'dup';
      if (!quorum(t, s).reached) return 'quorum';
      if (!(s.checkIns || {})[me.id]) return 'checkin';
      if (b.type === 'SECRET') {
        const box = s.box[b.id] = s.box[b.id] || { tally: {}, voters: [], receipts: [] };
        box.tally[opt] = Number(box.tally[opt] || 0) + 1;
        box.voters.push(me.id);
        box.receipts.push(hashReceipt(receipt));
        box.receipts.sort();
        addLog(s, `Ballot received on “${b.title}” (choice sealed)`, 'vote');
      } else {
        s.ballots[b.id] = Object.assign({}, s.ballots[b.id]);
        s.ballots[b.id].roll = Object.assign({}, s.ballots[b.id].roll, { [me.id]: opt });
        const box = s.box[b.id] = s.box[b.id] || { tally: {}, voters: [], receipts: [] };
        box.receipts.push(hashReceipt(receipt)); box.receipts.sort();
        addLog(s, `${me.name} voted on “${b.title}” (weight ${fmtW(me.weight || 1)})`, 'vote');
      }
      return 'ok';
    });
    if (outcome === 'dup') { ctx.toast('Your ballot is already in. Each member votes once.', 'info'); return; }
    if (outcome === 'closed') { ctx.toast('Voting on this ballot is closed.', 'info'); return; }
    if (outcome === 'quorum') { ctx.toast('Voting opens once quorum is reached.', 'warn'); return; }
    if (outcome === 'checkin') { ctx.toast('Check in to the meeting before you vote.', 'warn'); return; }
    delete sel[b.id];
    freshIds.add('r-' + b.id); freshIds.add('v-' + b.id); freshIds.add('log');
    Store.add('votes', { title: `Voted on “${b.title}”`, ballotId: b.id, ballotTitle: b.title, meetingId: t.meeting.id, receipt, type: b.type.toLowerCase() });
    ctx.toast(b.type === 'SECRET' ? `Vote cast. Your receipt is ${receipt}.` : 'Vote cast. Your name and vote are on the record.', 'ok', { duration: 6000 });
  }
  function verifyReceipt(t, input, out) {
    const r = normReceipt(input);
    if (!r) { out.innerHTML = `<div class="gov-note warn">${IC.lock}<span>That doesn’t look like a receipt. Receipts look like RC-7KQM-2XPA-9D.</span></div>`; return; }
    const s = load(t);
    const h = hashReceipt(r);
    const b = (t.ballots || []).find((x) => ((s.box[x.id] || {}).receipts || []).includes(h));
    out.innerHTML = b
      ? `<div class="gov-note ok">${IC.check}<span><strong>Counted.</strong> Receipt ${esc(r)} is in the ballot box for “${esc(b.title)}”. The receipt doesn’t record how anyone voted.</span></div>`
      : `<div class="gov-note warn">${IC.lock}<span>We couldn’t find ${esc(r)} in this meeting’s ballot boxes. Check each letter and number. If it still doesn’t match, ask the secretary.</span></div>`;
  }

  /* Hook for the guided tour: starts the current county's meeting (no sign-in check) so the
     meeting, quorum and ballot steps have something to show. Returns true if it started it now. */
  App.governance = {
    startMeeting(slug) {
      const t = (window.DATA && DATA.tenants[slug || App.state.tenant]) || App.ctx.tenant;
      return !!startMeeting(t, t.chair ? t.chair.name : null);
    },
    isStarted(slug) {
      const t = (window.DATA && DATA.tenants[slug || App.state.tenant]) || App.ctx.tenant;
      const st = Store.forTenant(t.slug).get(KEY, null);
      return !!(st && st.meetingId === t.meeting.id && st.status !== 'scheduled');
    },
  };

  /* ---------------- register ---------------- */
  let unsubs = [];
  App.register({
    id: 'governance',
    title: 'Meetings & Voting',
    group: 'Field & Governance',
    icon: ICON,
    blurb: 'Run central committee meetings with automatic quorum counts and secret ballots.',
    render(el, ctx) {
      injectStyles();
      const t = ctx.tenant;
      const sub = ['ballots', 'proxies'].includes(ctx.sub) ? ctx.sub : '';
      el.classList.add('scr-gov');

      function draw() {
        const s = load(t);
        const body = sub === 'ballots' ? renderBallots(t, s, ctx) : sub === 'proxies' ? renderProxies(t, s, ctx) : renderMeeting(t, s, ctx);
        el.innerHTML = `<div class="page">
          <div class="page-head"><div>
            <h1>Meetings &amp; Voting</h1>
            <p>Run ${esc(t.shortName || t.name)} central committee meetings with automatic quorum counts and secret ballots. Members check in, vote and give proxies here.</p>
          </div></div>
          ${tabsHtml(sub, t, s)}
          ${body}
        </div>`;
        freshIds.clear();
      }
      unsubs.forEach((u) => { try { u(); } catch (e) { /* ignore */ } });
      unsubs = [KEY, 'votes', 'proxies'].map((n) => Store.on(n, () => {
        if (!el.isConnected) { unsubs.forEach((u) => u()); unsubs = []; return; }
        const y = window.scrollY; draw(); window.scrollTo(0, y);
      }));
      draw();
      const tick = setInterval(() => {
        if (!el.isConnected) { clearInterval(tick); return; }
        const c = el.querySelector('[data-countdown]'); if (c) c.textContent = countdown(t);
      }, 30000);

      el.addEventListener('change', (e) => {
        const r = e.target.closest('input[data-ballot]');
        if (!r) return;
        sel[r.dataset.ballot] = r.value;
        const btn = el.querySelector(`[data-act="cast"][data-b="${CSS.escape(r.dataset.ballot)}"]`);
        if (btn) btn.removeAttribute('aria-disabled');
        const hint = el.querySelector(`[data-hint="${CSS.escape(r.dataset.ballot)}"]`);
        if (hint) hint.textContent = 'You can vote once. It can’t be changed after.';
      });

      el.addEventListener('submit', (e) => {
        const f = e.target;
        e.preventDefault();
        if (f.dataset.form === 'verify') { verifyReceipt(t, f.querySelector('input').value, el.querySelector('#gov-rc-out')); return; }
        if (f.dataset.form === 'zoom') {
          if (!App.auth.require('governance.run', { reason: 'The chair posts the meeting link.' })) return;
          let u = f.querySelector('input').value.trim();
          if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
          if (!/^https:\/\/[^\s/]+\.[^\s]{2,}/i.test(u)) { ctx.toast('Paste the full meeting link, like https://zoom.us/j/123456789.', 'warn'); f.querySelector('input').focus(); return; }
          mutate(t, (s) => { s.zoomUrl = u; addLog(s, `Meeting link posted by ${ctx.user ? ctx.user.name : 'the chair'}`, 'info'); });
          ctx.toast('Meeting link posted. Members see a Join button now.', 'ok');
          return;
        }
        if (f.dataset.form === 'proxy') {
          if (!App.auth.require('governance.attend', { reason: 'Committee members give proxies.' })) return;
          const me = memberOf(t, ctx);
          const hid = f.querySelector('select').value;
          const h = model(t).byId(hid);
          if (!me) return;
          if (!h) { ctx.toast('Choose who holds your proxy.', 'warn'); f.querySelector('select').focus(); return; }
          const doc = Store.add('proxies', { title: `Proxy to ${h.name} for the ${t.meeting.title}`, meetingId: t.meeting.id, grantorId: me.id, grantorName: me.name, holderId: h.id, holderName: h.name, verified: false });
          freshIds.add('p-' + doc.id); freshIds.add('log');
          mutate(t, (s) => addLog(s, `Proxy filed: ${me.name} to ${h.name} (waiting for signed form)`, 'proxy'));
          ctx.toast(`Your proxy to ${h.name} is filed. The secretary confirms it once your signed form arrives.`, 'ok');
        }
      });

      el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-act]');
        if (!a) return;
        const act = a.dataset.act;
        const b = a.dataset.b ? (t.ballots || []).find((x) => x.id === a.dataset.b) : null;
        if (a.getAttribute('aria-disabled') === 'true') { if (act === 'cast') ctx.toast('Choose an option first.', 'warn'); return; }
        switch (act) {
          case 'checkin': doCheckin(t, ctx); return;
          case 'ics': downloadIcs(t, load(t)); ctx.toast(`Calendar file downloaded for ${t.meeting.title}.`, 'ok'); return;
          case 'start': {
            if (!App.auth.require('governance.run', { reason: 'Only the chair can start the meeting.' })) return;
            const name = ctx.user ? ctx.user.name : null;
            if (startMeeting(t, name)) {
              const q = quorum(t, load(t));
              ctx.toast(`Meeting started. ${q.present} of ${q.seated} seated members are present, so ${q.reached ? 'quorum is met and voting is open' : 'voting waits for quorum'}.`, 'ok', { duration: 6000 });
            }
            return;
          }
          case 'checkout': {
            const me = memberOf(t, ctx); if (!me) return;
            mutate(t, (s) => { if (s.checkIns) delete s.checkIns[me.id]; addLog(s, `${me.name} checked out`, 'info'); });
            ctx.toast('You’re checked out. Check in again any time during the meeting.', 'info'); return;
          }
          case 'next': {
            if (!App.auth.require('governance.run', { reason: 'The chair moves the agenda.' })) return;
            const ag = t.meeting.agenda || [];
            const idx = mutate(t, (s) => {
              seatRunner(t, s, ctx);
              if (s.agendaIdx < ag.length - 1) { s.agendaIdx++; addLog(s, `Agenda item ${s.agendaIdx + 1} opened: ${ag[s.agendaIdx]}`, 'info'); }
              return s.agendaIdx;
            });
            ctx.toast(`Now on item ${idx + 1}: ${ag[idx]}`, 'info'); return;
          }
          case 'zoom-edit':
            if (!App.auth.require('governance.run', { reason: 'The chair posts the meeting link.' })) return;
            mutate(t, (s) => { s.zoomUrl = ''; });
            setTimeout(() => { const i = el.querySelector('#gov-zoom'); if (i) i.focus(); }, 30); return;
          case 'close-meeting': {
            if (!App.auth.require('governance.run', { reason: 'Only the chair can close the meeting.' })) return;
            const s0 = load(t);
            const open = (t.ballots || []).filter((x) => ballotView(t, s0, x).status === 'open');
            ctx.modal({
              title: 'Close the meeting?',
              html: `<p>This adjourns the ${esc(t.meeting.title)} and drafts the minutes from the record.</p>${open.length ? `<p><strong>${plural(open.length, 'ballot is', 'ballots are')} still open.</strong> Closing the meeting closes ${open.length === 1 ? 'it' : 'them'} too and counts the votes already in.</p>` : ''}`,
              actions: [{ label: 'Keep meeting open' }, { label: 'Close meeting', primary: true, onClick: () => {
                const name = ctx.user ? ctx.user.name : 'The chair';
                mutate(t, (s) => {
                  const now = new Date().toISOString();
                  seatRunner(t, s, ctx);
                  open.forEach((x) => {
                    s.ballots[x.id] = Object.assign({}, s.ballots[x.id], { status: 'closed', closedAt: now, closedBy: name });
                    const nv = ballotView(t, s, x);
                    addLog(s, `Voting closed on “${x.title}”: ${fmtW(nv.voters)} votes counted. ${result(x, nv).passed ? 'Passed' : 'Failed'}.`, 'close');
                  });
                  s.status = 'closed'; s.closedAt = now; s.agendaIdx = (t.meeting.agenda || []).length - 1;
                  addLog(s, `Meeting adjourned by ${name}`, 'close');
                  s.minutes = { text: buildMinutes(t, s), generatedAt: now, savedAt: null, savedBy: null };
                });
                freshIds.add('minutes');
                ctx.toast('Meeting adjourned. Draft minutes are ready at the top of this page.', 'ok');
                window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
              } }],
            });
            return;
          }
          case 'reopen':
            if (!App.auth.require('governance.run', { reason: 'Only the chair can reopen the meeting.' })) return;
            mutate(t, (s) => { s.status = 'open'; s.closedAt = null; addLog(s, `Meeting reopened by ${ctx.user ? ctx.user.name : 'the chair'}`, 'info'); });
            ctx.toast('Meeting reopened. Closed ballots stay closed.', 'info'); return;
          case 'min-save': {
            if (!App.auth.require('governance.run', { reason: 'The secretary or chair saves the minutes.' })) return;
            const text = el.querySelector('#gov-min').value;
            mutate(t, (s) => { s.minutes = Object.assign({}, s.minutes, { text, savedAt: new Date().toISOString(), savedBy: ctx.user ? ctx.user.name : 'the board' }); });
            ctx.toast('Minutes saved. Committee members can read and print them here.', 'ok'); return;
          }
          case 'min-rebuild':
            if (!App.auth.require('governance.run', { reason: 'The secretary or chair edits the minutes.' })) return;
            mutate(t, (s) => { s.minutes = { text: buildMinutes(t, s), generatedAt: new Date().toISOString(), savedAt: null, savedBy: null }; });
            ctx.toast('Minutes rebuilt from the meeting record. Your edits were replaced.', 'info'); return;
          case 'min-print': {
            const ta = el.querySelector('#gov-min');
            const s = load(t);
            printMinutes(t, ta ? ta.value : (s.minutes && s.minutes.text) || buildMinutes(t, s)); return;
          }
          case 'cast': if (b) castVote(t, ctx, b); return;
          case 'close': if (b) closeBallot(t, ctx, b); return;
          case 'copy-receipt': {
            const r = a.dataset.r;
            const ok = () => ctx.toast('Receipt copied.', 'ok');
            try { navigator.clipboard.writeText(r).then(ok, () => ctx.toast(`Your receipt is ${r}.`, 'info')); } catch (err) { ctx.toast(`Your receipt is ${r}.`, 'info'); }
            return;
          }
          case 'proxy-withdraw': {
            const id = a.dataset.id;
            const p = Store.list('proxies').find((x) => x.id === id);
            if (!p) return;
            Store.update('proxies', id, { revoked: true });
            mutate(t, (s) => addLog(s, `Proxy withdrawn: ${p.grantorName} to ${p.holderName}`, 'proxy'));
            ctx.toast('Your proxy is withdrawn.', 'info'); return;
          }
          case 'verify': {
            if (!App.auth.require('governance.run', { reason: 'Only the secretary or another Executive Board member can verify proxies.' })) return;
            const p = proxiesOf(t, load(t)).find((x) => x.id === a.dataset.id);
            if (!p) return;
            ctx.modal({
              title: 'Verify proxy',
              html: `<p><strong>${esc(p.grantorName)}</strong> gives their proxy to <strong>${esc(p.holderName)}</strong> for the ${esc(t.meeting.title)}.</p>
                <label class="gov-chk"><input type="checkbox" id="gov-proxy-ok"> I have the signed proxy form</label>`,
              actions: [{ label: 'Cancel' }, { label: 'Mark verified', primary: true, onClick: (m) => {
                const cb = m.body.querySelector('#gov-proxy-ok');
                if (!cb || !cb.checked) { ctx.toast('Tick the box to confirm the signed form is on file.', 'warn'); return false; }
                const by = ctx.user ? ctx.user.name : 'the secretary';
                const at = new Date().toISOString();
                const before = quorum(t, load(t)).reached;
                freshIds.add('p-' + p.id); freshIds.add('log');
                if (!p.seed) Store.update('proxies', p.id, { verified: true, verifiedBy: by, verifiedAt: at });
                const nq = mutate(t, (s) => {
                  if (p.seed) s.seedProxies[p.seedIndex] = { verified: true, verifiedBy: by, verifiedAt: at };
                  addLog(s, `Proxy verified by ${by}: ${p.grantorName} to ${p.holderName} (signed form received)`, 'proxy');
                  const q = quorum(t, s);
                  if (q.reached && !before) addLog(s, `Quorum reached: ${q.present} of ${q.seated} seated members present`, 'quorum');
                  return q;
                });
                ctx.toast(`Proxy verified. Quorum is ${nq.present} of ${nq.seated} present.`, 'ok');
              } }],
            });
            return;
          }
          default:
        }
      });
    },
  });
})();
