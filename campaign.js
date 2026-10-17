/* campaign.js: the public campaign site (campaign.html?county=<slug>&c=<candidate-slug>).
   Standalone: loads data.js and store.js only (never core.js or auth.js).
   Content comes from the county's saved `campaignSites` doc for the candidate, falling back to the
   seed candidate in data.js. A site shows to the public only when it is live and carries its
   "Paid for by" disclaimer. `&preview=1` (used by Campaign-in-a-Box) shows drafts too and accepts
   live edits from the builder through postMessage. */
(function () {
  'use strict';

  const D = window.DATA;
  const app = document.getElementById('cs-app');
  if (!D || !window.Store || !app) {
    if (app) app.innerHTML = '<main class="cs-empty"><h1>This page could not load</h1><p>Refresh the page to try again.</p></main>';
    return;
  }

  /* ---------- tiny shim (no core.js here) ---------- */
  const q = new URLSearchParams(location.search);
  const county = D.tenants[q.get('county')] ? q.get('county') : 'svgop';
  const slugParam = String(q.get('c') || '').toLowerCase();
  const preview = q.get('preview') === '1';
  window.App = window.App || { state: { tenant: county } };
  const T = D.tenants[county];
  const DB = window.Store.forTenant(county);

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ESC[ch]);
  const kebab = (n) => String(n || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'candidate';
  const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
  const safeUrl = (u) => (/^https:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');
  const isColor = (v) => /^#[0-9a-f]{6}$/i.test(String(v || ''));

  /* Focal points of the supplied headshots, so crops keep the face in frame. */
  const FOCUS = {
    'images/photo-1.jpg': '51% 20%', 'images/photo-2.jpg': '43% 24%', 'images/photo-3.jpg': '53% 20%',
    'images/photo-4.jpg': '55% 32%', 'images/photo-5.jpg': '56% 30%',
  };
  const focus = (photo, fallback) => FOCUS[photo] || fallback || '50% 25%';

  const slogan = (c) => c.slogan || '';

  /* ---------- data ---------- */
  function candidates() {
    const extra = DB.list('candidates');
    const overrides = DB.get('candidateStatus', {}) || {};
    return (T.candidates || []).concat(extra).map((c) => (overrides[c.id] ? Object.assign({}, c, { status: overrides[c.id] }) : c));
  }
  function findCandidate(slug) {
    if (!slug) return null;
    const list = candidates();
    const sites = DB.list('campaignSites');
    const bySite = sites.find((s) => s.slug === slug);
    if (bySite) { const c = list.find((x) => x.id === bySite.candidateId); if (c) return c; }
    return list.find((c) => kebab(c.name) === slug || c.id === slug || String(c.subdomain || '').split('.')[0] === slug.replace(/-/g, '')) || null;
  }
  function siteFor(c) { return DB.list('campaignSites').find((s) => s.candidateId === c.id) || null; }
  function seedDisclaimer(c) { return String(c.disclaimer || '').trim(); }

  /* One flat view of what the page shows. */
  function model(c, site) {
    const s = site || {};
    const has = !!site;
    const colors = s.colors || {};
    return {
      c,
      has,
      status: has ? s.status : (c.siteStatus === 'LIVE' ? 'live' : 'draft'),
      slug: s.slug || kebab(c.name),
      name: s.name || c.name,
      office: s.office || c.office,
      district: s.district || c.district,
      electionDate: s.electionDate || c.electionDate || '2026-11-03',
      headline: has ? (s.headline || '') : slogan(c),
      about: has ? (s.about || '') : (c.bio || ''),
      issues: (has ? s.issues : c.issues) || [],
      photo: s.photo !== undefined ? s.photo : c.photo,
      photoPos: s.photoPos || c.photoPos,
      brand: isColor(colors.brand) ? colors.brand : (T.colors.brand || '#0B2A4A'),
      accent: isColor(colors.accent) ? colors.accent : (T.colors.accent || '#C8102E'),
      template: s.template || 'classic',
      donateUrl: safeUrl(s.donateUrl) || `https://secure.winred.com/${kebab(c.name)}/donate`,
      volunteerOn: has ? s.volunteerOn !== false : true,
      disclaimer: has ? String(s.disclaimer || '').trim() : seedDisclaimer(c),
      endorsed: (c.status === 'ENDORSED' || c.status === 'ACTIVE_CAMPAIGN') && !s.endorsementPaused,
    };
  }

  /* Signed-in person on this device (read through Store; auth.js is not loaded here). */
  function sessionUser() {
    try {
      const s = window.Store.global.get('session', null);
      if (!s || !s.userId) return null;
      return window.Store.global.list('accounts').find((a) => a.id === s.userId) || null;
    } catch (e) { return null; }
  }
  const SIGNUPS = 'campaignSignups';
  function mySignup(slug) {
    const map = window.Store.global.get(SIGNUPS, {}) || {};
    const id = map[county + ':' + slug];
    if (!id) return null;
    return DB.list('volunteers').find((v) => v.id === id) || null;
  }

  /* ---------- formatting ---------- */
  function fmtLong(iso) {
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  function daysLeft(iso) {
    const now = new Date(); now.setHours(12, 0, 0, 0);
    return Math.round((new Date(iso + 'T12:00:00') - now) / 86400000);
  }
  function fmtTime(hm) {
    const p = String(hm || '').match(/^(\d{1,2}):(\d{2})/);
    if (!p) return String(hm || '');
    return new Date(2000, 0, 1, +p[1], +p[2]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function initials(n) { const p = String(n || '').trim().split(/\s+/); return ((p[0] || '')[0] || '') + (p.length > 1 ? p[p.length - 1][0] : ''); }

  const IC = {
    star: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 1.8l2.4 5 5.4.7-4 3.8 1 5.4L10 14.1l-4.8 2.6 1-5.4-4-3.8 5.4-.7z" fill="currentColor"/></svg>',
    share: '<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="15" cy="4.5" r="2.3"/><circle cx="5" cy="10" r="2.3"/><circle cx="15" cy="15.5" r="2.3"/><path d="M7 8.9l6-3.3M7 11.1l6 3.3"/></svg>',
    out: '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 3.5h5.5V9M16.5 3.5L9 11M14 12v3.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H8"/></svg>',
    check: '<svg viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8"/></svg>',
    cal: '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8.5h14M7 2.8v3.4M13 2.8v3.4"/></svg>',
  };

  function photoHtml(m, cls, alt) {
    if (!m.photo) return `<div class="${cls} cs-ph-initials" aria-hidden="true"><span>${esc(initials(m.name))}</span></div>`;
    return `<div class="${cls}"><img src="${esc(m.photo)}" alt="${esc(alt == null ? m.name : alt)}" style="object-position:${esc(focus(m.photo, m.photoPos))}" decoding="async"></div>`;
  }

  /* ---------- pages ---------- */
  function shellHead(title, brand, accent) {
    document.title = title;
    const root = document.documentElement;
    root.style.setProperty('--cb', brand);
    root.style.setProperty('--ca', accent);
    root.style.setProperty('--brand', brand);
    root.style.setProperty('--accent', accent);
    const meta = document.querySelector('meta[name="theme-color"]') || document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }));
    meta.content = brand;
  }
  const countyHref = (hash) => `index.html?county=${encodeURIComponent(county)}${hash || ''}`;

  function renderMessage(title, body) {
    shellHead(`${title} · ${T.shortName}`, T.colors.brand, T.colors.accent);
    app.innerHTML = `<main class="cs-empty" id="cs-main">
      <a class="cs-empty-mark" href="${countyHref()}">${IC.star}<span>${esc(T.shortName)}</span></a>
      <h1>${esc(title)}</h1><p>${body}</p>
      <a class="cs-btn primary" href="${countyHref('#/candidates')}">See ${esc(T.shortName)}’s endorsed candidates</a>
    </main>`;
  }

  let firstPaint = true;
  function renderSite(m, opts) {
    const o = opts || {};
    const first = firstName(m.name);
    const dl = daysLeft(m.electionDate);
    const live = m.status === 'live' && !!m.disclaimer;
    const publicUrl = new URL(`campaign.html?county=${encodeURIComponent(county)}&c=${encodeURIComponent(m.slug)}`, location.href).href;
    shellHead(`${m.name} for ${m.office}`, m.brand, m.accent);
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.content = `${m.name} for ${m.office}, ${m.district}. ${m.headline}`.trim();

    const ribbon = preview && !live
      ? `<div class="cs-ribbon" role="note"><b>Preview.</b> ${m.status === 'review' ? 'Waiting for board approval.' : m.disclaimer ? 'Not public yet.' : 'Not public: the “Paid for by” disclaimer is missing.'}</div>` : '';
    const signup = mySignup(m.slug);
    const user = sessionUser();
    const vols = DB.list('volunteers').filter((v) => v.campaign === m.slug).length;
    const issues = (m.issues || []).map((x) => String(x || '').trim()).filter(Boolean);
    const todayIso = (() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })();
    const events = DB.list('events').filter((e) => e.campaign === m.slug && e.status !== 'draft' && String(e.date || '') >= todayIso)
      .sort((a, b) => String(a.date + (a.time || '')).localeCompare(String(b.date + (b.time || '')))).slice(0, 4);

    const heroPhoto = photoHtml(m, 'cs-hero-photo', `${m.name}, candidate for ${m.office}`);
    const endorse = m.endorsed ? `<p class="cs-endorse">${IC.star}<span>Endorsed by the ${esc(T.name)}</span></p>` : '';

    app.innerHTML = `${ribbon}
      <header class="cs-nav">
        <a class="cs-nav-name" href="#top">${esc(m.name)}</a>
        <nav class="cs-nav-links" aria-label="Sections"><a href="#about">About</a>${issues.length ? '<a href="#priorities">Priorities</a>' : ''}${events.length ? '<a href="#events">Events</a>' : ''}${m.volunteerOn ? '<a href="#volunteer">Volunteer</a>' : ''}</nav>
        <a class="cs-btn give sm" href="${esc(m.donateUrl)}" target="_blank" rel="noopener">Donate</a>
      </header>
      <main id="cs-main" class="cs-main t-${esc(m.template)}${firstPaint ? ' cs-enter' : ''}">
        <section class="cs-hero" id="top" aria-labelledby="cs-name">
          ${heroPhoto}
          <div class="cs-hero-txt">
            <p class="cs-office">${esc(m.office)} · ${esc(m.district)}</p>
            <h1 id="cs-name">${esc(m.name)}</h1>
            ${m.headline ? `<p class="cs-headline">${esc(m.headline)}</p>` : ''}
            ${endorse}
            <div class="cs-cta">
              <a class="cs-btn give" href="${esc(m.donateUrl)}" target="_blank" rel="noopener">Donate ${IC.out}</a>
              ${m.volunteerOn ? '<a class="cs-btn ghost" href="#volunteer">Volunteer</a>' : ''}
            </div>
          </div>
        </section>

        <div class="cs-vote">
          <span class="cs-vote-ic">${IC.cal}</span>
          <p><b>Election Day is ${esc(fmtLong(m.electionDate))}.</b> ${dl > 1 ? `That’s ${dl} days from today.` : dl === 1 ? 'That’s tomorrow.' : dl === 0 ? 'That’s today.' : ''} <a href="${countyHref('#/guide')}">Read the ${esc(T.shortName)} voter guide</a></p>
        </div>

        <section class="cs-sec cs-about" id="about" aria-labelledby="cs-about-h">
          <div class="cs-about-side">
            <h2 id="cs-about-h">Meet ${esc(first)}</h2>
            <p class="cs-about-meta"><span>${esc(m.office)}</span><span class="dot" aria-hidden="true"> · </span><span>${esc(m.district)}</span></p>
          </div>
          <div class="cs-about-txt">
            ${m.about ? m.about.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('') : `<p>${esc(m.name)} is running for ${esc(m.office)} in ${esc(m.district)}.</p>`}
          </div>
        </section>

        ${issues.length ? `<section class="cs-sec cs-issues-sec" id="priorities" aria-labelledby="cs-pri-h">
          <h2 id="cs-pri-h">${esc(first)}’s priorities</h2>
          <ol class="cs-issues">${issues.map((x, i) => `<li class="cs-issue" style="--i:${i}"><span class="cs-issue-n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span><p>${esc(x)}</p></li>`).join('')}</ol>
        </section>` : ''}

        ${events.length ? `<section class="cs-sec cs-events" id="events" aria-labelledby="cs-ev-h">
          <h2 id="cs-ev-h">Meet ${esc(first)} in person</h2>
          <ul class="cs-evlist">${events.map((e) => { const d = new Date(e.date + 'T12:00:00'); return `<li class="cs-ev">
            <span class="cs-ev-date" aria-hidden="true"><small>${esc(d.toLocaleDateString('en-US', { month: 'short' }))}</small><b>${d.getDate()}</b></span>
            <span class="cs-ev-txt"><b>${esc(e.title)}</b><span>${esc(d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))}${e.time ? ` · ${esc(fmtTime(e.time))}` : ''}</span>${e.location ? `<span>${esc(e.location)}</span>` : ''}</span>
          </li>`; }).join('')}</ul>
        </section>` : ''}

        ${m.volunteerOn ? `<section class="cs-sec cs-vol" id="volunteer" aria-labelledby="cs-vol-h">
          <div class="cs-vol-head">
            <h2 id="cs-vol-h">Volunteer for ${esc(first)}</h2>
            <p>Knock on doors, make calls or host a yard sign. Pick what fits your week and the campaign team will contact you.${vols ? ` <b>${vols} ${vols === 1 ? 'neighbor has' : 'neighbors have'} signed up so far.</b>` : ''}</p>
          </div>
          <div class="cs-vol-body" data-vol-body>${signup ? thanksHtml(m, signup) : formHtml(user)}</div>
        </section>` : ''}

        <section class="cs-sec cs-give" aria-labelledby="cs-give-h">
          <div>
            <h2 id="cs-give-h">Help ${esc(first)} reach every door</h2>
            <p>Gifts pay for yard signs, door hangers and mail to voters in ${esc(m.district)}.</p>
          </div>
          <div class="cs-give-act">
            <a class="cs-btn give lg" href="${esc(m.donateUrl)}" target="_blank" rel="noopener">Donate on WinRed ${IC.out}</a>
            <p class="cs-quiet">Opens WinRed in a new tab. This sample site links to a sample WinRed address.</p>
          </div>
        </section>
      </main>

      <footer class="cs-foot">
        ${m.disclaimer
          ? `<p class="cs-disc">${esc(m.disclaimer)}</p>`
          : `<p class="cs-disc missing">The “Paid for by” disclaimer is missing. This site stays private until the committee adds it.</p>`}
        <div class="cs-foot-row">
          <button class="cs-btn ghost-dark sm" type="button" data-share>${IC.share} Share this site</button>
          <a class="cs-foot-link" href="${countyHref()}">${esc(T.name)}</a>
        </div>
        <p class="cs-sample"><span class="cs-sample-tag">Sample</span> This candidate and campaign are invented to show how a campaign site works.</p>
      </footer>`;

    firstPaint = false;
    wire(m, publicUrl);
  }

  function formHtml(user) {
    const u = user || {};
    const contact = u.email || (u.phone ? String(u.phone) : '');
    return `<form class="cs-form" novalidate data-vol-form>
      <div class="cs-field"><label for="v-name">Your name</label><input id="v-name" name="name" autocomplete="name" value="${esc(u.name || '')}" required><span class="cs-err" id="v-name-e" aria-live="polite"></span></div>
      <div class="cs-field"><label for="v-contact">Email or mobile number</label><input id="v-contact" name="contact" autocomplete="email" inputmode="email" value="${esc(contact)}" required><span class="cs-err" id="v-contact-e" aria-live="polite"></span></div>
      <div class="cs-field cs-zip"><label for="v-zip">ZIP code</label><input id="v-zip" name="zip" inputmode="numeric" autocomplete="postal-code" maxlength="5" value="${esc(u.zip || '')}" required><span class="cs-err" id="v-zip-e" aria-live="polite"></span></div>
      <fieldset class="cs-interests"><legend>I can help with</legend>
        ${[['doors', 'Knocking on doors'], ['calls', 'Making calls'], ['sign', 'Hosting a yard sign'], ['events', 'Working events']].map(([v, l]) =>
          `<label class="cs-check"><input type="checkbox" name="interests" value="${v}"><span>${l}</span></label>`).join('')}
      </fieldset>
      <div class="cs-form-foot"><button class="cs-btn primary" type="submit">Sign up to volunteer</button>
        <p class="cs-quiet">We use your contact only for this campaign’s volunteer work.</p></div>
    </form>`;
  }
  function thanksHtml(m, doc) {
    return `<div class="cs-thanks" tabindex="-1">
      <span class="cs-thanks-ic">${IC.check}</span>
      <div><h3>Thank you, ${esc(firstName(doc.name))}. You’re on the team.</h3>
      <p>${esc(firstName(m.name))}’s campaign will contact you at <b>${esc(doc.contact)}</b> about a first shift.</p>
      <button class="cs-link" type="button" data-again>Sign up someone else</button></div>
    </div>`;
  }

  /* ---------- behavior ---------- */
  function toast(msg) {
    const host = document.getElementById('cs-toasts');
    if (!host) return;
    const t = document.createElement('div');
    t.className = 'cs-toast';
    t.textContent = msg;
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, 3200);
  }

  function validate(f) {
    const name = f.name.value.trim(), contact = f.contact.value.trim(), zip = f.zip.value.trim();
    const digits = contact.replace(/\D/g, '');
    const errs = {
      name: name.length < 2 ? 'Enter your name.' : '',
      contact: !contact ? 'Enter an email or a mobile number.' : (/@/.test(contact) ? (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact) ? '' : 'Check the email address.') : (digits.length === 10 || (digits.length === 11 && digits[0] === '1') ? '' : 'Enter a 10-digit phone number or an email.')),
      zip: /^\d{5}$/.test(zip) ? '' : 'Enter a 5-digit ZIP code.',
    };
    Object.keys(errs).forEach((k) => {
      const inp = f[k], e = document.getElementById(`v-${k}-e`);
      inp.setAttribute('aria-invalid', errs[k] ? 'true' : 'false');
      if (errs[k]) inp.setAttribute('aria-describedby', `v-${k}-e`); else inp.removeAttribute('aria-describedby');
      if (e) e.textContent = errs[k];
    });
    const bad = Object.keys(errs).find((k) => errs[k]);
    if (bad) f[bad].focus();
    return bad ? null : { name, contact, zip };
  }

  function wire(m, publicUrl) {
    const form = app.querySelector('[data-vol-form]');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = validate(form);
        if (!v) return;
        if (preview) { toast('This is the preview. Sign-ups save on the public site.'); return; }
        const interests = Array.from(form.querySelectorAll('input[name="interests"]:checked')).map((x) => x.value);
        const user = sessionUser();
        const doc = DB.add('volunteers', {
          title: `Volunteer for ${m.name}`,
          name: v.name, contact: v.contact, zip: v.zip, interests,
          campaign: m.slug, candidateId: m.c.id, source: 'campaign site',
          createdBy: user ? user.id : null,
        });
        const map = window.Store.global.get(SIGNUPS, {}) || {};
        map[county + ':' + m.slug] = doc.id;
        window.Store.global.set(SIGNUPS, map);
        const body = app.querySelector('[data-vol-body]');
        body.innerHTML = thanksHtml(m, doc);
        const th = body.querySelector('.cs-thanks');
        if (th) th.focus({ preventScroll: true });
        wireAgain(m);
      });
    }
    wireAgain(m);
    const share = app.querySelector('[data-share]');
    if (share) share.addEventListener('click', async () => {
      const data = { title: `${m.name} for ${m.office}`, text: m.headline || `${m.name} for ${m.office}`, url: publicUrl };
      try {
        if (navigator.share) { await navigator.share(data); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(publicUrl); toast('Link copied. Paste it anywhere to share.'); }
      catch (e) { window.prompt('Copy this link to share the site:', publicUrl); }
    });
  }
  function wireAgain(m) {
    const again = app.querySelector('[data-again]');
    if (!again) return;
    again.addEventListener('click', () => {
      const map = window.Store.global.get(SIGNUPS, {}) || {};
      delete map[county + ':' + m.slug];
      window.Store.global.set(SIGNUPS, map);
      const body = app.querySelector('[data-vol-body]');
      body.innerHTML = formHtml(null);
      wire(m, '');
      const n = body.querySelector('#v-name');
      if (n) n.focus();
    });
  }

  /* ---------- route ---------- */
  let current = null;
  function render() {
    const c = findCandidate(slugParam);
    if (!c) {
      renderMessage('We couldn’t find that campaign', `Check the link, or see the candidates the ${esc(T.name)} has endorsed.`);
      return;
    }
    const m = model(c, siteFor(c));
    current = m;
    const publicOk = m.status === 'live' && !!m.disclaimer;
    if (!preview && !publicOk) {
      renderMessage(`${m.name}’s campaign site is on its way`, `The ${esc(T.shortName)} committee is reviewing this site. Check back soon, or see the county party’s other endorsed candidates.`);
      return;
    }
    renderSite(m);
  }

  /* Live edits from the Campaign-in-a-Box builder (same origin only). */
  if (preview) {
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'rccc:campaign-preview') return;
      const c = findCandidate(slugParam) || (e.data.candidate || null);
      if (!c) return;
      const y = window.scrollY;
      renderSite(model(c, e.data.site));
      window.scrollTo(0, y);
    });
    document.documentElement.classList.add('cs-is-preview');
  }
  /* Another tab (or the builder) saved changes. */
  ['campaignSites', 'candidateStatus', 'volunteers', 'events'].forEach((n) => DB.on(n, (d) => {
    if (d && d.type === 'external') render();
  }));

  /* Supabase backend: show a spinner until the first data load (Store.ready), then render and
     redraw when the county finishes loading. The timer makes sure the page never stays blank. */
  const ready = window.Store.ready;
  if (ready && typeof ready.then === 'function') {
    app.innerHTML = '<div style="min-height:60vh;display:grid;place-items:center" role="status" aria-label="Loading the campaign site"><div class="spinner" aria-hidden="true"></div></div>';
    let first = false;
    const paint = () => { if (first) return; first = true; render(); DB.on('hydrated', () => render()); };
    Promise.resolve(ready).then(paint, paint);
    setTimeout(paint, 9000);
  } else render();
  void current;
})();
