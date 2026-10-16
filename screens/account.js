/* screens/account.js: the "Your profile" screen (#/account).
   Edit name, email, phone and ZIP (email and phone changes re-verify with a code), and see what this
   person did across the site by reading the Store collections other screens write. */
(function () {
  'use strict';
  const App = window.App;
  if (!App) return;
  const U = App.util, esc = U.esc;

  const CSS = `
  .scr-acct { max-width: 1080px; }
  .scr-acct .pa-hero { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; padding: 4px 0 26px; border-bottom: 1px solid var(--line); margin-bottom: 28px; }
  .scr-acct .pa-hero .avatar { box-shadow: 0 0 0 4px var(--surface), 0 0 0 6px color-mix(in srgb, var(--brand) 22%, transparent); border-radius: 50%; }
  .scr-acct .pa-who { flex: 1 1 260px; min-width: 0; }
  .scr-acct .pa-who h1 { margin: 0 0 6px; overflow-wrap: anywhere; }
  .scr-acct .pa-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; color: var(--ink-2); font-size: 15px; }
  .scr-acct .pa-grid { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 28px; align-items: start; }
  .scr-acct .pa-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--shadow-1); }
  .scr-acct .pa-card > header { padding: 18px 22px 0; }
  .scr-acct .pa-card > header h2 { font-size: 1.25rem; margin: 0 0 2px; }
  .scr-acct .pa-card > header p { color: var(--ink-3); font-size: 14.5px; margin: 0; }
  .scr-acct .pa-form { padding: 16px 22px 22px; display: flex; flex-direction: column; gap: 4px; }
  .scr-acct .pa-label-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .scr-acct .pa-ver { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: var(--ok); }
  .scr-acct .pa-ver.no { color: var(--warn); }
  .scr-acct .pa-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-top: 10px; }
  .scr-acct .pa-actions .small { color: var(--ink-3); }
  .scr-acct .pa-acts { display: flex; flex-direction: column; gap: 14px; }
  .scr-acct .pa-act { padding: 16px 20px; }
  .scr-acct .pa-act-head { display: flex; align-items: center; gap: 12px; }
  .scr-acct .pa-act-icon { width: 38px; height: 38px; border-radius: 10px; flex: none; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--brand) 9%, white); color: var(--brand); }
  .scr-acct .pa-act-head h3 { font-size: 1.05rem; margin: 0; flex: 1; min-width: 0; }
  .scr-acct .pa-count { font: 700 13px/1 var(--font-body); color: var(--brand); background: color-mix(in srgb, var(--brand) 9%, white); border-radius: 999px; padding: 5px 10px; }
  .scr-acct .pa-more { margin: 6px 0 0 50px; color: var(--ink-3); font-size: 13.5px; }
  .scr-acct .pa-none { padding: 16px 20px 18px; background: var(--surface-2); box-shadow: none; border-style: dashed; animation: pa-in .32s ease both; }
  .scr-acct .pa-none-lead { margin: 0 0 12px; color: var(--ink-2); font-size: 15px; }
  .scr-acct .pa-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .scr-acct .pa-chip { display: inline-flex; align-items: center; gap: 7px; min-height: 40px; padding: 6px 14px 6px 10px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line-strong); color: var(--ink); font-weight: 600; font-size: 14.5px; text-decoration: none; transition: border-color .15s ease, color .15s ease, transform .1s ease, box-shadow .15s ease; }
  .scr-acct .pa-chip svg { width: 18px; height: 18px; color: var(--brand); flex: none; }
  .scr-acct .pa-chip:hover { border-color: var(--brand); color: var(--brand); box-shadow: var(--shadow-1); }
  .scr-acct .pa-chip:active { transform: translateY(1px); }
  .scr-acct .pa-list { list-style: none; margin: 10px 0 0 50px; padding: 0; display: flex; flex-direction: column; }
  .scr-acct .pa-list li { display: flex; gap: 12px; justify-content: space-between; align-items: baseline; padding: 9px 0; border-top: 1px solid var(--line); animation: pa-in .32s ease both; }
  .scr-acct .pa-list li:first-child { border-top: 0; }
  .scr-acct .pa-item { font-weight: 600; color: var(--ink); min-width: 0; overflow-wrap: anywhere; }
  .scr-acct .pa-item small { display: block; font-weight: 400; color: var(--ink-3); font-size: 13.5px; }
  .scr-acct .pa-when { color: var(--ink-3); font-size: 13.5px; white-space: nowrap; }
  @keyframes pa-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  .scr-acct .pa-camp { padding: 16px 20px; margin-bottom: 22px; }
  .scr-acct .pa-camp-text { margin: 10px 0 0 50px; color: var(--ink-2); font-size: 14.5px; }
  .scr-acct .pa-foot { margin-top: 18px; color: var(--ink-3); font-size: 14px; }
  @media (max-width: 860px) { .scr-acct .pa-grid { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 560px) {
    .scr-acct .pa-hero { gap: 14px; }
    .scr-acct .pa-hero .btn { width: 100%; }
    .scr-acct .pa-more, .scr-acct .pa-list, .scr-acct .pa-camp-text { margin-left: 0; }
    .scr-acct .pa-none { padding: 14px 16px 16px; }
    .scr-acct .pa-chip { min-height: 44px; }
    .scr-acct .pa-act { padding: 14px 16px; }
    .scr-acct .pa-form { padding: 14px 16px 18px; }
    .scr-acct .pa-card > header { padding: 16px 16px 0; }
  }`;
  function injectCss() {
    if (document.getElementById('scr-acct-css')) return;
    const s = document.createElement('style');
    s.id = 'scr-acct-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  const I = (d) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    rsvps: I('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M9 15l2 2 4-4"/>'),
    volunteers: I('<path d="M12 20s-7-4.3-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.7-7 10-7 10z"/>'),
    donations: I('<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2c-.5-.9-1.6-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2.1 0 3 5.8 1.5 5.8 4.3 0 1.3-1.3 2.1-3 2.1-1.3 0-2.5-.6-3-1.5M12 6.3v1.5M12 16.8v1.4"/>'),
    posts: I('<path d="M5 19.5V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9z"/><path d="M9 8.5h6M9 11.5h4"/>'),
    votes: I('<rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8.5 11l2-6.5h3l2 6.5"/><path d="M9.5 8.5l2 2 3-3.5"/>'),
    memberships: I('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>'),
    walkResults: I('<path d="M12 21s6.5-5.8 6.5-11a6.5 6.5 0 0 0-13 0c0 5.2 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
  };
  const CHECK = '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8"/></svg>';

  const money = (d) => (d.amount != null ? U.fmtUsd(d.amount) : (d.amountUsd != null ? U.fmtUsd(d.amountUsd) : ''));
  const pick = (d, keys) => { for (const k of keys) if (d[k]) return String(d[k]); return ''; };
  /* Stored enum ids ("not_home", "yard_sign", "published") read as words, never raw ids. */
  const LABELS = {
    talked: 'Talked', not_home: 'Not home', refused: 'Refused', moved: 'Moved', yard_sign: 'Yard sign',
    published: 'Published', draft: 'Draft', scheduled: 'Scheduled', archived: 'Archived',
  };
  const SUPPORT = { 1: 'Strong no', 2: 'Leans no', 3: 'Undecided', 4: 'Leans yes', 5: 'Strong yes' };
  const human = (v) => {
    if (v == null || v === '') return '';
    const k = String(v);
    if (LABELS[k] || LABELS[k.toLowerCase()]) return LABELS[k] || LABELS[k.toLowerCase()];
    if (!/^[a-z0-9]+([_-][a-z0-9]+)*$/.test(k)) return k;       // already prose
    const w = k.replace(/[_-]+/g, ' ');
    return w.charAt(0).toUpperCase() + w.slice(1);
  };
  const plural = (n, one, many) => `${U.fmtNum(n)} ${Number(n) === 1 ? one : many}`;
  /* Each collection: how to title a doc, what the empty state says, and where to go next. */
  const COLLS = [
    { key: 'rsvps', chip: 'RSVP to an event', title: 'Event RSVPs', min: 'public', href: (s) => `index.html?county=${s}#/events`, go: 'See upcoming events',
      line: (d) => pick(d, ['title', 'eventTitle', 'event', 'name']) || 'Event RSVP',
      sub: (d) => [pick(d, ['date', 'eventDate']), pick(d, ['location', 'where']), d.guests ? plural(d.guests, 'guest', 'guests') : ''].filter(Boolean).join(' · ') },
    { key: 'volunteers', chip: 'Volunteer', title: 'Volunteer sign-ups', min: 'public', href: (s) => `index.html?county=${s}#/volunteer`, go: 'Find a volunteer shift',
      line: (d) => d.title || human(pick(d, ['role', 'shift', 'activity', 'interest'])) || 'Volunteer sign-up',
      sub: (d) => [pick(d, ['date', 'when']), Array.isArray(d.interests) ? d.interests.map(human).join(', ') : ''].filter(Boolean).join(' · ') },
    { key: 'memberships', chip: 'Join the committee', title: 'Memberships', min: 'public', href: (s) => `index.html?county=${s}#/join`, go: 'Join the committee',
      line: (d) => d.title || 'Membership',
      sub: (d) => [d.amount != null ? money(d) : '', pick(d, ['tier', 'level'])].filter(Boolean).join(' · ') },
    { key: 'donations', chip: 'Donate', title: 'Donations', min: 'public', href: (s) => `index.html?county=${s}#/donate`, go: 'Give to the committee',
      line: (d) => [money(d), pick(d, ['to', 'recipient', 'title', 'candidate'])].filter(Boolean).join(' to ') || 'Donation',
      sub: (d) => [d.recurring ? 'Monthly' : '', pick(d, ['receipt', 'receiptId'])].filter(Boolean).join(' · ') },
    { key: 'posts', chip: 'Post an update', title: 'Posts', min: 'member', href: () => '#/portal', go: 'Open the Committee Portal',
      line: (d) => pick(d, ['title', 'headline', 'text', 'body']).slice(0, 120) || 'Post',
      sub: (d) => ['status', 'channel', 'section'].map((k) => human(d[k])).filter(Boolean).join(' · ') },
    { key: 'votes', chip: 'Vote at a meeting', title: 'Votes', min: 'member', href: () => '#/governance', go: 'Open Meetings & Voting',
      line: (d) => pick(d, ['title', 'ballotTitle', 'ballot', 'motion']) || 'Ballot cast',
      sub: (d) => (d.receipt ? `Receipt ${d.receipt}` : '') },
    { key: 'walkResults', chip: 'Canvass a turf', title: 'Walk results', min: 'member', href: () => '#/field', go: 'Open the Field Organizer',
      line: (d) => pick(d, ['title', 'address', 'turf', 'turfName']) || 'Walk result',
      sub: (d) => {
        const res = human(pick(d, ['result', 'outcome', 'status']));
        const showRes = res && !String(d.title || '').startsWith(res);     // field titles already lead with it
        return [showRes ? res : '', d.support ? SUPPORT[d.support] || '' : '', d.doors ? plural(d.doors, 'door', 'doors') : ''].filter(Boolean).join(' · ');
      } },
  ];

  function mine(list, user) {
    return list.filter((d) => d && (d.createdBy === user.id || d.userId === user.id))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }
  function when(iso) {
    if (!iso) return '';
    const t = Date.parse(iso);
    if (isNaN(t)) return '';
    return U.timeAgo((Date.now() - t) / 60000);
  }
  function since(iso) {
    const t = Date.parse(iso || '');
    if (isNaN(t)) return '';
    return new Date(t).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  /* Cards with activity come first. Empty collections the person can act on collapse into one
     compact "Nothing here yet" row of chips; members-only collections stay hidden for supporters. */
  function activityHTML(user, ctx) {
    const rows = COLLS.map((c) => ({ c, items: mine(window.Store.list(c.key), user), allowed: App.atLeast(ctx.role, c.min) }));
    const full = rows.filter((r) => r.items.length);
    const empty = rows.filter((r) => !r.items.length && r.allowed);
    let html = full.map(({ c, items }) => {
      const list = `<ul class="pa-list">` + items.slice(0, 8).map((d) => {
        const sub = c.sub(d);
        return `<li><span class="pa-item">${esc(c.line(d))}${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="pa-when">${esc(when(d.createdAt))}</span></li>`;
      }).join('') + `</ul>` + (items.length > 8 ? `<p class="pa-more">Showing the 8 most recent of ${items.length}.</p>` : '');
      return `<article class="pa-card pa-act" data-coll="${c.key}"><div class="pa-act-head"><span class="pa-act-icon">${ICONS[c.key]}</span>` +
        `<h3>${esc(c.title)}</h3><span class="pa-count">${items.length}</span></div>${list}</article>`;
    }).join('');
    if (empty.length) {
      const lead = full.length ? 'Nothing here yet for these.' : 'Nothing here yet. What you do on the site shows up on this page.';
      html += `<div class="pa-card pa-none" data-coll="none"><p class="pa-none-lead">${esc(lead)}</p><div class="pa-chips">` +
        empty.map(({ c }) => `<a class="pa-chip" href="${esc(c.href(ctx.tenantSlug))}">${ICONS[c.key]}<span>${esc(c.chip)}</span></a>`).join('') +
        `</div></div>`;
    }
    return html;
  }

  /* Candidates get a shortcut to their campaign. */
  function campaignCard(user, ctx) {
    const camp = App.auth.campaign && App.auth.campaign();
    if (!camp) return '';
    const cand = ((ctx.tenant.candidates) || []).find((c) => c.id === camp.candidateId) || {};
    const line = cand.office ? `${cand.name || user.name} is running for ${cand.office}. ` : '';
    const role = camp.role === 'owner' ? 'You own this campaign.' : 'You work on this campaign.';
    return `<article class="pa-card pa-camp" data-pa="campaign"><div class="pa-act-head"><span class="pa-act-icon">${ICONS.memberships}</span>` +
      `<h3>Your campaign</h3><a class="btn btn-primary btn-sm" href="#/mycampaign">Open My Campaign</a></div>` +
      `<p class="pa-camp-text">${esc(line + role)} Edit your campaign site there and see who has signed up to help.</p></article>`;
  }

  function fld(id, label, attrs, verified) {
    const ver = verified == null ? '' : verified
      ? `<span class="pa-ver">${CHECK}Verified</span>` : `<span class="pa-ver no">Not verified</span>`;
    return `<div class="fld"><div class="pa-label-row"><label class="fld-label" for="${id}">${esc(label)}</label>${ver}</div>` +
      `<input class="input" id="${id}" ${attrs} aria-describedby="${id}-err"><p class="fld-error" id="${id}-err" aria-live="polite"></p></div>`;
  }

  function render(el, ctx) {
    injectCss();
    const user = ctx.user;
    if (!user) { el.innerHTML = ''; return; }
    const A = App.auth;
    const t = ctx.tenant;
    const v = user.verified || {};
    el.innerHTML =
      `<div class="page scr-acct">` +
      `<header class="pa-hero">${U.avatar(user.name, 72)}<div class="pa-who"><h1>${esc(user.name)}</h1>` +
      `<div class="pa-meta"><span class="badge badge-local">${esc(App.roleLabel(ctx.role))}</span>` +
      `<span>${esc(user.role === 'master' ? 'Master Network, all counties' : (user.role === 'candidate' && user.office ? 'Candidate for ' + user.office + ', ' : user.title ? user.title + ', ' : '') + (t.shortName || t.name))}</span>` +
      (user.sample ? `<span class="badge">Sample account</span>` : '') +
      (since(user.createdAt) ? `<span class="small muted">Joined ${esc(since(user.createdAt))}</span>` : '') +
      `</div></div><button type="button" class="btn" data-pa="signout">Sign out</button></header>` +
      `<div class="pa-grid">` +
      `<section class="pa-card" aria-labelledby="pa-details-h"><header><h2 id="pa-details-h">Your details</h2>` +
      `<p>Changing your email or phone sends a code to the new one.</p></header>` +
      `<form class="pa-form" novalidate>` +
      fld('pa-name', 'Full name', `type="text" autocomplete="name" value="${esc(user.name)}"`) +
      fld('pa-email', 'Email', `type="email" autocomplete="email" autocapitalize="off" spellcheck="false" value="${esc(user.email)}"`, !!v.email) +
      fld('pa-phone', 'Mobile phone', `type="tel" inputmode="tel" autocomplete="tel-national" value="${esc(A.format.phone(user.phone))}"`, !!v.phone) +
      fld('pa-zip', 'ZIP code', `type="text" inputmode="numeric" autocomplete="postal-code" maxlength="10" value="${esc(user.zip || '')}"`) +
      `<div class="pa-actions"><button class="btn btn-primary" type="submit" disabled>Save changes</button><span class="small" aria-live="polite" data-pa="status">Everything is up to date.</span></div>` +
      `</form></section>` +
      `<section aria-labelledby="pa-act-h">${campaignCard(user, ctx)}<h2 id="pa-act-h" style="margin-bottom:12px">Your activity in ${esc(t.shortName || t.name)}</h2>` +
      `<div class="pa-acts" data-pa="acts">${activityHTML(user, ctx)}</div>` +
      `<p class="pa-foot">Activity is saved to your account, so it is still here after you reload the page.</p></section>` +
      `</div></div>`;

    const form = el.querySelector('form');
    const save = form.querySelector('button[type=submit]');
    const status = el.querySelector('[data-pa=status]');
    const inp = (id) => el.querySelector('#' + id);
    const orig = { name: user.name, email: user.email, phone: A.format.normPhone(user.phone), zip: user.zip || '' };
    const now = () => ({ name: inp('pa-name').value.trim(), email: A.format.normEmail(inp('pa-email').value), phone: A.format.normPhone(inp('pa-phone').value), zip: inp('pa-zip').value.trim() });
    const dirty = () => { const n = now(); return Object.keys(orig).some((k) => n[k] !== orig[k]); };
    const setErr = (id, msg) => {
      const i = inp(id); el.querySelector('#' + id + '-err').textContent = msg || '';
      if (msg) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid');
      i.closest('.fld').classList.toggle('has-error', !!msg);
      return !msg;
    };
    form.addEventListener('input', (e) => {
      if (e.target.id) setErr(e.target.id, '');
      save.disabled = !dirty();
      status.textContent = dirty() ? 'You have unsaved changes.' : 'Everything is up to date.';
    });
    inp('pa-phone').addEventListener('blur', () => { const p = inp('pa-phone'); if (!A.validate.phone(p.value)) p.value = A.format.phone(p.value); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const n = now();
      const ok = [setErr('pa-name', A.validate.name(n.name)), setErr('pa-email', A.validate.email(n.email)),
        setErr('pa-phone', A.validate.phone(n.phone)), setErr('pa-zip', A.validate.zip(n.zip))];
      if (n.email !== orig.email) { const o = A.findByContact('email', n.email); if (o && o.id !== user.id) ok.push(setErr('pa-email', 'Another account already uses this email.')); }
      if (n.phone !== orig.phone) { const o = A.findByContact('phone', n.phone); if (o && o.id !== user.id) ok.push(setErr('pa-phone', 'Another account already uses this number.')); }
      if (ok.includes(false)) { const bad = form.querySelector('[aria-invalid=true]'); if (bad) bad.focus(); return; }
      const basic = {};
      if (n.name !== orig.name) basic.name = n.name;
      if (n.zip !== orig.zip) basic.zip = n.zip;
      let saved = [];
      if (Object.keys(basic).length) { const r = A.updateProfile(basic); if (r.ok) saved.push(basic.name ? 'name' : '', basic.zip ? 'ZIP code' : ''); }
      if (n.email !== orig.email) {
        await U.sleep(Object.keys(basic).length ? 150 : 0);
        if (await A.verifyContact('email', n.email)) saved.push('email');
      }
      if (n.phone !== orig.phone) {
        await U.sleep(350);
        if (await A.verifyContact('phone', n.phone)) saved.push('mobile number');
      }
      saved = saved.filter(Boolean);
      if (saved.length) ctx.toast(`Saved your ${saved.length > 1 ? saved.slice(0, -1).join(', ') + ' and ' + saved[saved.length - 1] : saved[0]}.`, 'ok');
      else if (n.email !== orig.email || n.phone !== orig.phone) ctx.toast('Nothing changed. Your contact details stay as they were until you confirm the code.', 'info');
      App.rerender();
    });
    el.querySelector('[data-pa=signout]').addEventListener('click', () => { A.signOut(); App.go('overview'); });

    // Live activity: refresh the list when another screen saves something.
    const acts = el.querySelector('[data-pa=acts]');
    const offs = COLLS.map((c) => window.Store.on(c.key, () => {
      if (!acts.isConnected) { offs.forEach((f) => f()); return; }
      const u = App.auth.user;
      if (u) acts.innerHTML = activityHTML(u, App.ctx);
    }));
  }

  App.register({
    id: 'account',
    title: 'Your profile',
    group: 'Account',
    minRole: 'supporter',
    gateText: 'Sign in to see your profile and everything you have signed up for.',
    blurb: 'Your contact details and everything you have done on the site.',
    icon: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10" cy="7" r="3.2"/><path d="M3.8 17c.9-3.2 3.3-5 6.2-5s5.3 1.8 6.2 5"/></svg>',
    render,
  });
})();
