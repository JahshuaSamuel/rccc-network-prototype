/* auth.js: App.auth, accounts, one-time codes, the account sheet and the topbar account menu.
   Accounts live in Store.global('accounts'); the session lives in Store.global('session') so it
   survives reloads. Until email and SMS delivery are connected, every code is shown in a toast.
   Classic script, ES2020, loads after core.js and before the screens. */
(function () {
  'use strict';
  const App = window.App;
  if (!App || !window.Store) { console.error('[auth] needs core.js and store.js first'); return; }
  const U = App.util, esc = U.esc;
  const G = window.Store.global;

  const CODE_TTL = 10 * 60 * 1000;
  const MAX_ATTEMPTS = 5;
  const RESEND_MS = 30 * 1000;
  const CODES_NOTE = 'Codes appear on screen until email and text delivery are connected.';

  /* Capability table from the brief. Unknown capabilities need a Master Network admin. */
  const CAPS = {
    rsvp: 'public', volunteer: 'public', donate: 'public', join: 'public',
    profile: 'supporter',
    'portal.view': 'member', 'field.canvass': 'member', 'governance.attend': 'member', 'governance.vote': 'member',
    'portal.edit': 'board', 'ads.manage': 'board', 'candidate.manage': 'board', 'field.manage': 'board', 'governance.run': 'board',
    'master.*': 'master', 'director.*': 'master',
    /* Wave 3. 'candidate' means candidates, the executive board and Master Network staff (see App.atLeast). */
    'campaign.own': 'candidate', 'crm.campaign': 'candidate',
    'crm.view': 'member', 'crm.committee': 'board', 'outreach.send': 'board',
  };
  const ROLE_IDS = ['public', 'supporter', 'member', 'board', 'master', 'candidate'];

  /* ---------------- formatting and validation ---------------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;
  function normEmail(s) { return String(s || '').trim().toLowerCase(); }
  function normPhone(s) {
    let d = String(s || '').replace(/\D/g, '');
    if (d.length === 11 && d[0] === '1') d = d.slice(1);
    return d;
  }
  function phoneError(raw) {
    const d = normPhone(raw);
    if (!d) return 'Enter your mobile number.';
    if (d.length !== 10) return 'Enter a 10-digit US mobile number, like (408) 555-0142.';
    if (d[0] < '2' || d[3] < '2') return 'That number doesn\'t look like a US number. Check the area code.';
    return '';
  }
  function emailError(raw) {
    const e = normEmail(raw);
    if (!e) return 'Enter your email address.';
    if (!EMAIL_RE.test(e)) return 'Check the email address. It should look like name@example.com.';
    return '';
  }
  function zipError(raw) {
    const z = String(raw || '').trim();
    if (!z) return 'Enter your ZIP code.';
    if (!/^\d{5}(-?\d{4})?$/.test(z)) return 'Enter a 5-digit ZIP code.';
    return '';
  }
  function nameError(raw) {
    const n = String(raw || '').trim();
    if (!n) return 'Enter your name.';
    if (n.length < 2) return 'Enter your full name.';
    return '';
  }
  function formatPhone(d) {
    d = normPhone(d);
    return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d;
  }
  function maskEmail(e) {
    const [local, domain] = String(e || '').split('@');
    return (local ? local[0] : '') + '•••@' + (domain || '');
  }
  function maskPhone(p) { const d = normPhone(p); return '(•••) •••-' + d.slice(-4); }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }

  /* ---------------- accounts and session ---------------- */
  /* One sample candidate per county: SVGOP's Elena Marsh owns her campaign, and Demo County's
     endorsed candidate does the same. Built from the seed candidates so the ids always match. */
  function candidateSeeds() {
    const T = (window.DATA && window.DATA.tenants) || {};
    const want = [
      { tenant: 'svgop', name: 'Elena Marsh', email: 'elena.marsh@example.com', phone: '4085550133', zip: '94086' },
      { tenant: 'demo', name: 'Luis Arredondo', email: 'luis.arredondo@example.com', phone: '5595550137', zip: '93274' },
    ];
    return want.map((w) => {
      const c = ((T[w.tenant] && T[w.tenant].candidates) || []).find((x) => x.name === w.name);
      if (!c) return null;
      return { id: 'acct-' + w.tenant + '-candidate', name: w.name, email: w.email, phone: w.phone, zip: w.zip, role: 'candidate',
        tenant: w.tenant, memberId: null, office: c.office, candidateId: c.id, campaignSlug: kebab(c.name), campaignRole: 'owner' };
    }).filter(Boolean);
  }
  function normName(n) { return String(n || '').trim().toLowerCase().replace(/\s+/g, ' '); }
  function kebab(n) { return String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function seedAccounts() {
    const seeds = ((window.DATA && window.DATA.sampleAccounts) || []).concat(candidateSeeds());
    if (!seeds.length) return;
    const have = new Set(G.list('accounts').map((a) => a.id));
    seeds.forEach((s) => {
      if (have.has(s.id)) return;
      G.add('accounts', Object.assign({}, s, {
        sample: true, verified: { email: true, phone: true }, createdAt: '2026-01-05T17:00:00.000Z', createdBy: null,
      }));
    });
  }
  function accounts() { return G.list('accounts'); }
  function findAccount(id) { return accounts().find((a) => a.id === id) || null; }
  function findBy(kind, value) {
    if (kind === 'email') { const e = normEmail(value); return accounts().find((a) => normEmail(a.email) === e) || null; }
    const p = normPhone(value); return accounts().find((a) => normPhone(a.phone) === p) || null;
  }
  function sampleAccounts(tenant) {
    const t = tenant || App.state.tenant;
    const order = { supporter: 1, member: 2, candidate: 2.5, board: 3, master: 4 };
    return accounts().filter((a) => a.sample && !a.supersededBy && (a.tenant === t || !a.tenant))
      .sort((a, b) => (order[a.role] || 9) - (order[b.role] || 9));
  }

  let cached = null;
  function loadSession() {
    const s = G.get('session', null);
    cached = s && s.userId ? findAccount(s.userId) : null;
    if (s && s.userId && !cached) G.set('session', null);
  }
  const subs = new Set();
  function notify() {
    loadSession();
    const u = api.user;
    subs.forEach((fn) => { try { fn(u); } catch (e) { console.error('[auth] onChange listener', e); } });
    renderAccountControl();
  }
  function setSession(id) {
    G.set('session', id ? { userId: id, at: new Date().toISOString() } : null);
    notify();
  }

  function effectiveRole(u) {
    if (!u) return 'public';
    if (u.role === 'master') return 'master';
    if (!u.tenant || u.tenant === App.state.tenant) return u.role;
    return 'supporter';     // a real account visiting another county is a supporter there
  }
  function minRoleFor(cap) {
    cap = String(cap || '');
    if (CAPS[cap]) return CAPS[cap];
    if (ROLE_IDS.indexOf(cap) >= 0) return cap;
    const dot = cap.indexOf('.');
    if (dot > 0 && CAPS[cap.slice(0, dot) + '.*']) return CAPS[cap.slice(0, dot) + '.*'];
    return 'master';
  }
  function can(cap) {
    const role = effectiveRole(cached);
    if (String(cap) === 'crm.campaign') return role === 'candidate';     // a campaign's own records, never the committee's
    return App.atLeast(role, minRoleFor(cap));
  }
  function isCandidate() { return !!cached && effectiveRole(cached) === 'candidate'; }
  function campaign() {
    if (!isCandidate()) return null;
    return { candidateId: cached.candidateId, slug: cached.campaignSlug, role: cached.campaignRole || 'staff' };
  }

  function accountPhrase(role) { return App.accountPhrase ? App.accountPhrase(role) : 'an account'; }
  function tenantShort() { const t = App.ctx.tenant; return t.shortName || t.name; }
  function roleLine(u) {
    if (!u) return '';
    const r = effectiveRole(u);
    const where = u.role === 'master' ? 'All counties' : tenantShort();
    if (r === 'candidate' && u.office) return `Candidate · ${u.office}`;
    return `${App.roleLabel(r)} · ${where}`;
  }

  /* ---------------- one-time codes ---------------- */
  let challenge = null;
  let codeToast = null;
  function dismissCodeToast() { if (codeToast && codeToast.dismiss) codeToast.dismiss(); codeToast = null; }
  function randomCode() {
    try {
      const b = new Uint32Array(1); window.crypto.getRandomValues(b);
      return String(b[0] % 1000000).padStart(6, '0');
    } catch (e) { return String(Math.floor(Math.random() * 1000000)).padStart(6, '0'); }
  }
  function issueCode(channel, target, purpose) {
    const code = randomCode();
    challenge = { channel, target, purpose, code, expires: Date.now() + CODE_TTL, attempts: 0, sentAt: Date.now() };
    const to = channel === 'email' ? maskEmail(target) : maskPhone(target);
    dismissCodeToast();
    codeToast = App.toast(`${tenantShort()} verification code: ${code.slice(0, 3)} ${code.slice(3)} (sent to ${to})`, 'code', {
      duration: 20000,
      html: `<span class="toast-code-line">${esc(tenantShort())} verification code: <b class="toast-code" data-code="${code}">${code.slice(0, 3)} ${code.slice(3)}</b></span>` +
        `<span class="toast-sub">Sent to ${esc(to)}</span>`,
    });
    return challenge;
  }
  function checkCode(input) {
    const c = challenge;
    if (!c) return { ok: false, locked: true, error: 'This code is no longer active. Send a new code.' };
    if (Date.now() > c.expires) return { ok: false, locked: true, error: 'This code expired after 10 minutes. Send a new code.' };
    if (c.attempts >= MAX_ATTEMPTS) return { ok: false, locked: true, error: 'Too many tries. Send a new code.' };
    if (String(input) === c.code) { challenge = null; dismissCodeToast(); return { ok: true }; }
    c.attempts++;
    const left = MAX_ATTEMPTS - c.attempts;
    if (left <= 0) return { ok: false, locked: true, error: 'That code didn\'t match five times. Send a new code.' };
    return { ok: false, error: `That code doesn't match. You have ${left} ${left === 1 ? 'try' : 'tries'} left.` };
  }

  /* ---------------- icons ---------------- */
  const IC = {
    x: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>',
    back: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 4.5L7 10l5.5 5.5"/></svg>',
    lock: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>',
    chev: '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7.5l5 5 5-5"/></svg>',
    mail: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M4 7l8 6 8-6"/></svg>',
    phone: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>',
    user: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="7" r="3.2"/><path d="M3.8 17c.9-3.2 3.3-5 6.2-5s5.3 1.8 6.2 5"/></svg>',
    reset: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 10a6.5 6.5 0 1 0 2-4.7"/><path d="M3.5 3.5v3.5H7"/></svg>',
    out: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4H5a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 5 16h3"/><path d="M12.5 13.5L16 10l-3.5-3.5M16 10H8"/></svg>',
  };

  /* ---------------- the sheet ---------------- */
  let sheet = null;
  function focusables(root) {
    return Array.from(root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
      .filter((el) => el.offsetParent !== null || el === document.activeElement);
  }
  function buildSheet() {
    const back = document.createElement('div');
    back.className = 'sheet-backdrop';
    back.innerHTML =
      `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">` +
      `<div class="sheet-grab" aria-hidden="true"></div>` +
      `<div class="sheet-head">` +
      `<button type="button" class="sheet-icon-btn sheet-back" aria-label="Back" hidden>${IC.back}</button>` +
      `<h2 id="sheet-title" class="sheet-title"></h2>` +
      `<button type="button" class="sheet-icon-btn sheet-close" aria-label="Close">${IC.x}</button></div>` +
      `<div class="sheet-body"><div class="sheet-stage"></div></div></div>`;
    document.body.appendChild(back);
    const s = {
      root: back, panel: back.querySelector('.sheet'), stage: back.querySelector('.sheet-stage'),
      title: back.querySelector('.sheet-title'), backBtn: back.querySelector('.sheet-back'),
      prevFocus: document.activeElement, timers: [], backTo: null, opts: {},
    };
    back.querySelector('.sheet-close').addEventListener('click', closeSheet);
    s.backBtn.addEventListener('click', () => { if (s.backTo) s.backTo(); });
    back.addEventListener('mousedown', (e) => { if (e.target === back) closeSheet(); });
    s.onKey = (e) => {
      if (!sheet || document.querySelector('.modal-backdrop')) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSheet(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables(s.panel);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (!s.panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', s.onKey, true);
    document.documentElement.classList.add('sheet-open');
    requestAnimationFrame(() => requestAnimationFrame(() => back.classList.add('in')));
    return s;
  }
  function clearTimers() { if (sheet) { sheet.timers.forEach((t) => clearInterval(t)); sheet.timers = []; } }
  function closeSheet() {
    if (!sheet) return;
    const s = sheet; sheet = null;
    s.timers.forEach((t) => clearInterval(t));
    document.removeEventListener('keydown', s.onKey, true);
    s.root.classList.remove('in');
    s.root.classList.add('out');
    document.documentElement.classList.remove('sheet-open');
    setTimeout(() => s.root.remove(), 320);
    const pf = s.prevFocus;
    if (pf && pf.isConnected && pf.focus) try { pf.focus(); } catch (e) { /* ignore */ }
    if (s.opts.onClose) try { s.opts.onClose(); } catch (e) { console.error(e); }
  }

  /* Swap the sheet to a new step. view = { title, html, back, mount(el) }, dir = 1 forward / -1 back / 0 none. */
  function showStep(view, dir) {
    if (!sheet) return;
    clearTimers();
    const s = sheet;
    s.title.textContent = view.title;
    s.backTo = view.back || null;
    s.backBtn.hidden = !view.back;
    const old = s.stage.querySelector('.sheet-step:not(.is-leaving)');
    const el = document.createElement('div');
    el.className = 'sheet-step';
    el.innerHTML = view.html;
    if (old && dir) {
      old.classList.add('is-leaving', dir > 0 ? 'to-left' : 'to-right');
      setTimeout(() => old.remove(), 260);
      el.classList.add('is-entering', dir > 0 ? 'from-right' : 'from-left');
      s.stage.appendChild(el);
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('is-entering', 'from-right', 'from-left')));
    } else {
      if (old) old.remove();
      s.stage.appendChild(el);
    }
    s.panel.querySelector('.sheet-body').scrollTop = 0;
    if (view.mount) view.mount(el);
    const auto = el.querySelector('[data-autofocus]') || el.querySelector('input,button');
    if (auto) {
      const grab = () => { try { if (!el.contains(document.activeElement) || document.activeElement.tagName === 'BUTTON') auto.focus({ preventScroll: true }); } catch (e) { /* ignore */ } };
      setTimeout(() => { try { auto.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, dir ? 200 : 60);
      if (dir) { setTimeout(grab, 320); setTimeout(grab, 520); }
    }
  }

  /* ---------------- form helpers ---------------- */
  function field(id, label, attrs, hint) {
    return `<div class="fld"><label class="fld-label" for="${id}">${esc(label)}</label>` +
      `<input class="input" id="${id}" ${attrs} aria-describedby="${id}-err${hint ? ` ${id}-hint` : ''}">` +
      (hint ? `<p class="fld-hint" id="${id}-hint">${esc(hint)}</p>` : '') +
      `<p class="fld-error" id="${id}-err" aria-live="polite"></p></div>`;
  }
  function setErr(input, msg) {
    const box = document.getElementById(input.id + '-err');
    if (box) box.textContent = msg || '';
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    input.closest('.fld') && input.closest('.fld').classList.toggle('has-error', !!msg);
    return !msg;
  }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.classList.add('is-busy'); if (label) btn.textContent = label; }
    else { btn.disabled = false; btn.classList.remove('is-busy'); if (btn.dataset.label) btn.textContent = btn.dataset.label; }
  }

  /* 6-box one-time-code input: paste, auto-advance, backspace, arrow keys, SMS autofill. */
  function otpHTML() {
    let h = '<div class="otp" role="group" aria-label="6-digit code">';
    for (let i = 0; i < 6; i++) {
      h += `<input class="otp-box" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${i === 0 ? 6 : 1}" ` +
        `autocomplete="${i === 0 ? 'one-time-code' : 'off'}" aria-label="Digit ${i + 1} of 6"${i === 0 ? ' data-autofocus' : ''}>`;
    }
    return h + '</div>';
  }
  function mountOtp(root, onComplete) {
    const boxes = Array.from(root.querySelectorAll('.otp-box'));
    const value = () => boxes.map((b) => b.value).join('');
    const fill = (digits, from) => {
      let i = from;
      for (const d of digits) { if (i >= 6) break; boxes[i].value = d; i++; }
      boxes[Math.min(i, 5)].focus();
      check();
    };
    const check = () => {
      boxes.forEach((b) => b.classList.toggle('is-filled', !!b.value));
      const v = value();
      if (v.length === 6 && /^\d{6}$/.test(v)) onComplete(v);
    };
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        const digits = b.value.replace(/\D/g, '');
        if (digits.length > 1) { b.value = ''; fill(digits, i); return; }
        b.value = digits;
        if (digits && i < 5) boxes[i + 1].focus();
        check();
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !b.value && i > 0) { e.preventDefault(); boxes[i - 1].value = ''; boxes[i - 1].focus(); check(); }
        else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); boxes[i - 1].focus(); }
        else if (e.key === 'ArrowRight' && i < 5) { e.preventDefault(); boxes[i + 1].focus(); }
      });
      b.addEventListener('focus', () => { try { b.select(); } catch (e) { /* ignore */ } });
      b.addEventListener('paste', (e) => {
        const t = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\D/g, '');
        if (!t) return;
        e.preventDefault();
        fill(t, t.length >= 6 ? 0 : i);
      });
    });
    return {
      value,
      clear() { boxes.forEach((b) => { b.value = ''; b.classList.remove('is-filled'); }); boxes[0].focus(); },
      setDisabled(on) { boxes.forEach((b) => { b.disabled = on; }); },
      shake() { const g = root.querySelector('.otp'); g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake'); },
    };
  }

  /* A code step shared by sign-in, sign-up and contact changes.
     cfg: { title, channel, target, purpose, lead, progress, submitLabel, back, onVerified() } */
  function codeView(cfg) {
    const to = cfg.channel === 'email' ? maskEmail(cfg.target) : maskPhone(cfg.target);
    return {
      title: cfg.title, back: cfg.back,
      html:
        (cfg.progress ? `<p class="sheet-progress">${esc(cfg.progress)}</p>` : '') +
        `<div class="code-lead"><span class="code-icon">${cfg.channel === 'email' ? IC.mail : IC.phone}</span>` +
        `<p>${esc(cfg.lead || 'We sent a 6-digit code to')} <strong>${esc(to)}</strong>.</p></div>` +
        `<form class="sheet-form" novalidate>${otpHTML()}` +
        `<p class="fld-error otp-error" aria-live="polite"></p>` +
        `<button class="btn btn-primary btn-block" type="submit">${esc(cfg.submitLabel || 'Verify code')}</button></form>` +
        `<div class="resend-row"><span class="resend-wait" aria-live="off"></span><button type="button" class="btn btn-ghost btn-sm resend-btn" hidden>Send a new code</button></div>` +
        `<p class="sheet-note">${esc(CODES_NOTE)} Codes expire after 10 minutes.</p>`,
      mount(el) {
        const err = el.querySelector('.otp-error');
        const btn = el.querySelector('button[type=submit]');
        const wait = el.querySelector('.resend-wait');
        const resend = el.querySelector('.resend-btn');
        let locked = false;
        const otp = mountOtp(el, (v) => submit(v));
        function submit(v) {
          if (locked) return;
          if (!/^\d{6}$/.test(v)) { err.textContent = 'Enter all 6 digits of the code.'; otp.shake(); return; }
          const r = checkCode(v);
          if (r.ok) { err.textContent = ''; busy(btn, true, 'Verified'); cfg.onVerified(); return; }
          err.textContent = r.error;
          otp.shake();
          if (r.locked) { locked = true; otp.setDisabled(true); btn.disabled = true; showResend(true); }
          else otp.clear();
        }
        el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); submit(otp.value()); });
        function tick() {
          const left = Math.max(0, Math.ceil(((challenge ? challenge.sentAt : 0) + RESEND_MS - Date.now()) / 1000));
          if (left > 0 && !locked) { wait.textContent = `Send a new code in 0:${String(left).padStart(2, '0')}`; resend.hidden = true; }
          else showResend(true);
        }
        function showResend(on) { if (on) { wait.textContent = 'Didn\'t get it?'; resend.hidden = false; } }
        resend.addEventListener('click', () => {
          issueCode(cfg.channel, cfg.target, cfg.purpose);
          locked = false; otp.setDisabled(false); btn.disabled = false; err.textContent = '';
          otp.clear(); tick();
        });
        if (!challenge || challenge.target !== cfg.target) issueCode(cfg.channel, cfg.target, cfg.purpose);
        tick();
        sheet.timers.push(setInterval(tick, 1000));
      },
    };
  }

  /* ---------------- sign-in ---------------- */
  function reasonHTML(reason) {
    return reason ? `<div class="sheet-reason">${IC.lock}<p>${esc(reason)}</p></div>` : '';
  }
  function sampleListHTML(excludeId) {
    const list = sampleAccounts().filter((a) => a.id !== excludeId);
    if (!list.length) return '';
    return `<section class="sample-accts" aria-labelledby="sample-h">` +
      `<h3 id="sample-h" class="sample-h">Sample accounts</h3>` +
      `<p class="sample-sub">Invented people, one at each level of access. Tap one to sign in without a code.</p>` +
      `<ul class="sample-list">` + list.map((a) =>
        `<li><button type="button" class="sample-btn" data-sample="${esc(a.id)}">${U.avatar(a.name, 38)}` +
        `<span class="sample-txt"><span class="sample-name">${esc(a.name)}</span>` +
        `<span class="sample-role">${a.role === 'candidate' ? esc('Candidate · ' + (a.office || 'Campaign')) : esc(App.roleLabel(a.role))}${a.role === 'candidate' ? '' : a.title && a.role !== 'master' ? ' · ' + esc(a.title) : ''}${a.role === 'master' ? ' · All counties' : ''}</span></span>` +
        `<span class="sample-go" aria-hidden="true">${IC.back}</span></button></li>`).join('') +
      `</ul></section>`;
  }
  function wireSamples(el) {
    el.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => {
      completeSignIn(b.dataset.sample, false);
    }));
  }
  function completeSignIn(id, isNew) {
    const a = findAccount(id);
    if (!a) return;
    challenge = null;
    const after = sheet && sheet.opts.onSuccess;
    setSession(id);
    closeSheet();
    dismissCodeToast();
    const t = tenantShort();
    if (isNew && a.role === 'candidate') App.toast(`Welcome, ${firstName(a.name)}. Your campaign is ready in My Campaign.`, 'ok', { duration: 5000 });
    else if (isNew) App.toast(`Welcome, ${firstName(a.name)}. You're signed in as a supporter of ${t}.`, 'ok', { duration: 5000 });
    else App.toast(`Signed in as ${a.name} with ${accountPhrase(effectiveRole(a))}.`, 'ok');
    if (after) try { after(api.user); } catch (e) { console.error(e); }
    else landCandidate();
  }
  /* Candidates start in their campaign. */
  function landCandidate() { if (isCandidate()) App.go('mycampaign'); }

  function signInView(prefill) {
    const o = sheet.opts;
    return {
      title: 'Sign in',
      html:
        reasonHTML(o.reason) +
        `<form class="sheet-form" novalidate>` +
        field('si-id', 'Email or mobile number', `type="text" autocomplete="username" autocapitalize="off" spellcheck="false" value="${esc(prefill || '')}" data-autofocus`) +
        `<button class="btn btn-primary btn-block" type="submit">Send code</button></form>` +
        `<p class="sheet-switch">New to ${esc(tenantShort())}? <button type="button" class="link-btn" data-go="signup">Create an account</button></p>` +
        sampleListHTML(cached && cached.id),
      mount(el) {
        const input = el.querySelector('#si-id');
        el.querySelector('[data-go=signup]').addEventListener('click', () => showStep(signUpView(), 1));
        wireSamples(el);
        input.addEventListener('input', () => setErr(input, ''));
        el.querySelector('form').addEventListener('submit', (e) => {
          e.preventDefault();
          const raw = input.value.trim();
          if (!raw) return setErr(input, 'Enter the email or mobile number on your account.');
          const isEmail = raw.indexOf('@') >= 0;
          const bad = isEmail ? emailError(raw) : (/[a-z]/i.test(raw) ? 'Enter an email address or a 10-digit US mobile number.' : phoneError(raw));
          if (bad) return setErr(input, bad);
          const acct = findBy(isEmail ? 'email' : 'phone', raw);
          if (!acct) {
            setErr(input, `We couldn't find an account with that ${isEmail ? 'email' : 'number'}. Check it, or create an account below.`);
            return;
          }
          const channel = isEmail ? 'email' : 'phone';
          const target = isEmail ? normEmail(raw) : normPhone(raw);
          challenge = null;
          showStep(codeView({
            title: 'Enter your code', channel, target, purpose: 'signin', submitLabel: 'Sign in',
            back: () => showStep(signInView(raw), -1),
            onVerified: () => completeSignIn(acct.id, false),
          }), 1);
        });
      },
    };
  }

  /* ---------------- sign-up ---------------- */
  function signUpView(draft) {
    const d = draft || {};
    return {
      title: 'Create your account',
      back: null,
      html:
        `<p class="sheet-lead">Join ${esc(tenantShort())} as a supporter. Your account keeps your RSVPs and volunteer sign-ups together, so you can find them later.</p>` +
        `<form class="sheet-form" novalidate>` +
        field('su-name', 'Full name', `type="text" autocomplete="name" value="${esc(d.name || '')}" data-autofocus`) +
        field('su-email', 'Email', `type="email" autocomplete="email" autocapitalize="off" spellcheck="false" value="${esc(d.email || '')}"`) +
        field('su-phone', 'Mobile phone', `type="tel" inputmode="tel" autocomplete="tel-national" value="${esc(d.phone ? formatPhone(d.phone) : '')}"`, 'We text a code to confirm it\'s yours.') +
        field('su-zip', 'ZIP code', `type="text" inputmode="numeric" autocomplete="postal-code" maxlength="10" value="${esc(d.zip || '')}"`, 'Your ZIP shows you local races and events.') +
        `<p class="sheet-note">We confirm your email and phone with two 6-digit codes. ${esc(CODES_NOTE)}</p>` +
        `<button class="btn btn-primary btn-block" type="submit">Send email code</button></form>` +
        `<p class="sheet-switch">Already have an account? <button type="button" class="link-btn" data-go="signin">Sign in</button></p>`,
      mount(el) {
        const $f = (id) => el.querySelector('#' + id);
        const checks = { 'su-name': nameError, 'su-email': emailError, 'su-phone': phoneError, 'su-zip': zipError };
        Object.keys(checks).forEach((id) => {
          const inp = $f(id);
          inp.addEventListener('blur', () => { if (inp.value.trim()) setErr(inp, checks[id](inp.value)); });
          inp.addEventListener('input', () => { if (inp.getAttribute('aria-invalid')) setErr(inp, ''); });
        });
        $f('su-phone').addEventListener('blur', () => { const p = $f('su-phone'); if (!phoneError(p.value)) p.value = formatPhone(p.value); });
        el.querySelector('[data-go=signin]').addEventListener('click', () => showStep(signInView($f('su-email').value), 1));
        el.querySelector('form').addEventListener('submit', (e) => {
          e.preventDefault();
          let first = null;
          Object.keys(checks).forEach((id) => {
            const inp = $f(id);
            if (!setErr(inp, checks[id](inp.value)) && !first) first = inp;
          });
          const email = normEmail($f('su-email').value), phone = normPhone($f('su-phone').value);
          if (!first && findBy('email', email)) { setErr($f('su-email'), 'An account already uses this email. Sign in instead.'); first = $f('su-email'); }
          if (!first && findBy('phone', phone)) { setErr($f('su-phone'), 'An account already uses this number. Sign in instead.'); first = $f('su-phone'); }
          if (first) { first.focus(); return; }
          const next = { name: $f('su-name').value.trim().replace(/\s+/g, ' '), email, phone, zip: $f('su-zip').value.trim().slice(0, 5) };
          challenge = null;
          showStep(signUpEmailView(next), 1);
        });
      },
    };
  }
  function signUpEmailView(d) {
    return codeView({
      title: 'Check your email', channel: 'email', target: d.email, purpose: 'signup-email', progress: 'Code 1 of 2',
      lead: 'We sent a 6-digit code to', submitLabel: 'Verify email',
      back: () => showStep(signUpView(d), -1),
      onVerified: () => { challenge = null; setTimeout(() => showStep(signUpPhoneView(d), 1), 260); },
    });
  }
  function signUpPhoneView(d) {
    return codeView({
      title: 'Check your phone', channel: 'phone', target: d.phone, purpose: 'signup-phone', progress: 'Code 2 of 2',
      lead: 'Email confirmed. Now enter the code we texted to', submitLabel: 'Create account',
      back: () => showStep(signUpView(d), -1),
      onVerified: () => {
        if (findBy('email', d.email) || findBy('phone', d.phone)) { showStep(signInView(d.email), -1); return; }
        const acct = G.add('accounts', {
          name: d.name, email: d.email, phone: d.phone, zip: d.zip, role: 'supporter', tenant: App.state.tenant,
          verified: { email: true, phone: true }, sample: false, createdBy: null,
        });
        setTimeout(() => completeSignIn(acct.id, true), 260);
      },
    });
  }

  /* ---------------- public entry points ---------------- */
  function open(mode, opts) {
    const o = opts || {};
    if (!sheet) sheet = buildSheet();
    sheet.opts = o;
    if (mode === 'verify') return;
    showStep(mode === 'signup' ? signUpView(o.draft) : signInView(o.prefill), 0);
  }

  /* Confirm a new email or phone for the signed-in account. Resolves true once verified and saved. */
  function verifyContact(channel, value) {
    return new Promise((resolve) => {
      const u = cached;
      if (!u) return resolve(false);
      const target = channel === 'email' ? normEmail(value) : normPhone(value);
      let done = false;
      if (!sheet) sheet = buildSheet();
      sheet.opts = { onClose: () => { if (!done) resolve(false); } };
      challenge = null;
      showStep(codeView({
        title: channel === 'email' ? 'Confirm your new email' : 'Confirm your new number', channel, target, purpose: 'change',
        lead: 'Enter the code we sent to', submitLabel: 'Confirm and save',
        onVerified: () => {
          const patch = channel === 'email' ? { email: target } : { phone: target };
          const verified = Object.assign({}, u.verified, { [channel]: true });
          G.update('accounts', u.id, Object.assign(patch, { verified }));
          done = true;
          closeSheet();
          notify();
          resolve(true);
        },
      }), 0);
    });
  }

  function updateProfile(patch) {
    const u = cached;
    if (!u) return { ok: false, error: 'Sign in first.' };
    const p = {};
    if ('name' in patch) { const e = nameError(patch.name); if (e) return { ok: false, field: 'name', error: e }; p.name = String(patch.name).trim().replace(/\s+/g, ' '); }
    if ('zip' in patch) { const e = zipError(patch.zip); if (e) return { ok: false, field: 'zip', error: e }; p.zip = String(patch.zip).trim().slice(0, 5); }
    G.update('accounts', u.id, p);
    notify();
    return { ok: true, user: api.user };
  }

  function signOut(opts) {
    if (!cached) return;
    const name = cached.name;
    setSession(null);
    if (!(opts && opts.silent)) App.toast(`${firstName(name)}, you're signed out.`, 'info');
  }
  function signInAs(id, opts) {
    const a = findAccount(id);
    if (!a) return false;
    setSession(a.id);
    if (!(opts && opts.silent)) App.toast(`Signed in as ${a.name} with ${accountPhrase(effectiveRole(a))}.`, 'ok');
    if (!(opts && opts.silent)) landCandidate();
    return true;
  }
  function signInSample(role, opts) {
    const a = sampleAccounts().find((x) => x.role === role);
    return a ? signInAs(a.id, opts) : false;
  }

  function requireCap(cap, opts) {
    if (can(cap)) return true;
    const o = opts || {};
    const need = minRoleFor(cap);
    const aud = App.roleAudience[need] || { who: App.roleLabel(need), account: 'an account with access' };
    if (!cached) {
      open('signin', { reason: o.reason || `Sign in with ${aud.account} to continue.`, onSuccess: o.onSuccess });
      return false;
    }
    App.modal({
      title: `This is for ${aud.who}`,
      html: `<p>${o.reason ? esc(o.reason) + ' ' : ''}You're signed in as ${esc(cached.name)} with ${esc(accountPhrase(effectiveRole(cached)))}. ` +
        `This needs ${esc(aud.account)}.</p>`,
      actions: [
        { label: 'Switch account', primary: true, onClick: () => { setTimeout(() => open('signin', { reason: `Choose ${aud.account}.` }), 200); } },
        { label: 'Close' },
      ],
    });
    return false;
  }

  /* Sample accounts follow the county switcher so the tour and demos keep their role. */
  function tenantChanged(prev, next, silent) {
    const u = cached;
    if (!u || !u.sample || !u.tenant || u.tenant === next) { renderAccountControl(); return; }
    const twin = sampleAccounts(next).find((a) => a.role === u.role);
    if (!twin) { renderAccountControl(); return; }
    G.set('session', { userId: twin.id, at: new Date().toISOString() });
    loadSession();
    if (u.role === 'candidate' || twin.role === 'candidate') App.go('mycampaign');
    if (!silent) setTimeout(() => App.toast(`Switched to ${twin.name}, the matching sample account for this county.`, 'info'), 50);
    subs.forEach((fn) => { try { fn(api.user); } catch (e) { console.error(e); } });
    renderAccountControl();
  }

  /* ---------------- topbar account control ---------------- */
  let slot = null;
  let menuOpen = false;
  function renderAccountControl() {
    if (!slot) return;
    closeMenu(true);
    const u = cached;
    if (!u) {
      slot.innerHTML = `<button type="button" class="acct-signin" data-acct="signin">${IC.user}<span>Sign in</span></button>`;
      return;
    }
    const others = sampleAccounts().filter((a) => a.id !== u.id);
    slot.innerHTML =
      `<button type="button" class="acct-btn" id="acct-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="acct-menu" aria-label="Account: ${esc(u.name)}">` +
      `${U.avatar(u.name, 34)}<span class="acct-first">${esc(firstName(u.name))}</span><span class="acct-chev">${IC.chev}</span></button>` +
      `<div class="acct-menu" id="acct-menu" role="menu" aria-labelledby="acct-btn" hidden>` +
      `<div class="acct-head">${U.avatar(u.name, 44)}<div class="acct-head-txt"><strong>${esc(u.name)}</strong><span>${esc(roleLine(u))}</span></div></div>` +
      `<button type="button" role="menuitem" class="acct-item" data-acct="profile">${IC.user}<span>Your profile</span></button>` +
      (others.length ? `<div class="acct-sep" role="separator"></div><p class="acct-group" id="acct-switch-h">Switch account</p>` +
        others.map((a) => `<button type="button" role="menuitem" class="acct-item acct-sample" data-acct="switch" data-id="${esc(a.id)}">` +
          `${U.avatar(a.name, 26)}<span><span class="acct-s-name">${esc(a.name)}</span><span class="acct-s-role">${esc(App.roleLabel(a.role))}</span></span></button>`).join('') +
        `<button type="button" role="menuitem" class="acct-item" data-acct="signin">${IC.mail}<span>Sign in with another account</span></button>` : '') +
      `<div class="acct-sep" role="separator"></div>` +
      `<button type="button" role="menuitem" class="acct-item" data-acct="reset">${IC.reset}<span>Reset sample data</span></button>` +
      `<button type="button" role="menuitem" class="acct-item" data-acct="signout">${IC.out}<span>Sign out</span></button>` +
      `</div>`;
  }
  function menuItems() { return Array.from(slot.querySelectorAll('.acct-menu [role=menuitem]')); }
  function openMenu() {
    const m = slot && slot.querySelector('.acct-menu');
    if (!m) return;
    m.hidden = false;
    requestAnimationFrame(() => m.classList.add('in'));
    menuOpen = true;
    slot.querySelector('.acct-btn').setAttribute('aria-expanded', 'true');
    const f = menuItems()[0]; if (f) f.focus();
  }
  function closeMenu(silent) {
    if (!menuOpen || !slot) { menuOpen = false; return; }
    menuOpen = false;
    const m = slot.querySelector('.acct-menu');
    const b = slot.querySelector('.acct-btn');
    if (b) b.setAttribute('aria-expanded', 'false');
    if (m) { m.classList.remove('in'); m.hidden = true; }
    if (!silent && b) b.focus();
  }
  function confirmReset() {
    App.modal({
      title: 'Reset sample data?',
      html: '<p>This clears every saved RSVP, vote, post and sign-up for both counties on this device, so each screen starts fresh. Accounts and your sign-in stay as they are.</p>',
      actions: [
        { label: 'Cancel' },
        { label: 'Reset data', primary: true, onClick: () => { window.Store.reset(); App.toast('Sample data is back to its starting point.', 'ok'); } },
      ],
    });
  }
  function mount(el) {
    slot = el;
    if (!slot) return;
    renderAccountControl();
    slot.addEventListener('click', (e) => {
      const b = e.target.closest('[data-acct], .acct-btn');
      if (!b) return;
      if (b.classList.contains('acct-btn')) { menuOpen ? closeMenu() : openMenu(); return; }
      const k = b.dataset.acct;
      closeMenu(true);
      if (k === 'signin') open('signin');
      else if (k === 'profile') App.go('account');
      else if (k === 'switch') signInAs(b.dataset.id);
      else if (k === 'reset') confirmReset();
      else if (k === 'signout') signOut();
    });
    slot.addEventListener('keydown', (e) => {
      if (!menuOpen) {
        if (e.key === 'ArrowDown' && e.target.classList.contains('acct-btn')) { e.preventDefault(); openMenu(); }
        return;
      }
      const items = menuItems();
      const i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === 'Tab') closeMenu(true);
    });
    document.addEventListener('mousedown', (e) => { if (menuOpen && !slot.contains(e.target)) closeMenu(true); });
  }


  /* ---------------- candidate invites and the claim page ---------------- */
  function tenantsData() { return (window.DATA && window.DATA.tenants) || {}; }
  function storeFor(slug) { return (window.Store.forTenant ? window.Store.forTenant(slug) : window.Store); }
  function newToken() {
    try { const b = new Uint8Array(16); window.crypto.getRandomValues(b); return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); }
    catch (e) { return (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2) + '00000000000000000000').slice(0, 32); }
  }
  function inviteUrl(token, tenant) {
    return new URL(`app.html?tenant=${encodeURIComponent(tenant || App.state.tenant)}#/claim/${token}`, location.href).href;
  }
  function copyText(text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true, () => false); } catch (e) { /* fall through */ }
    return new Promise((res) => {
      try {
        const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); res(!!ok);
      } catch (e) { res(false); }
    });
  }
  function candidateOf(tenant, id) { return ((tenantsData()[tenant] || {}).candidates || []).find((c) => c.id === id) || null; }

  /* Board and Master Network manage any campaign. A campaign owner manages staff on their own campaign only. */
  function canManageCampaign(candidateId, slug, campaignRole) {
    if (can('candidate.manage')) return true;
    const c = campaign();
    return !!c && c.role === 'owner' && campaignRole === 'staff' && !!candidateId && c.candidateId === candidateId && c.slug === slug;
  }
  function showInviteToast(invite, url, heading) {
    const t = App.toast(`Invite link for ${invite.email}`, 'ok', {
      duration: 30000,
      html: `<span class="toast-code-line">${esc(heading || 'Invite ready for')} <b>${esc(invite.email)}</b>. Email delivery is not connected yet, so send them this link.</span>` +
        `<span class="toast-link">${esc(url)}</span>` +
        `<button type="button" class="toast-copy" data-copy>Copy link</button>`,
    });
    const b = t.querySelector('[data-copy]');
    if (b) b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await copyText(url);
      b.textContent = ok ? 'Link copied' : 'Select the link and copy it';
    });
  }
  function auditLog(action, detail) {
    try { window.Store.add('auditLog', Object.assign({ title: action, action, by: cached ? cached.id : null }, detail)); } catch (e) { /* ignore */ }
  }

  /* createInvite({email, phone, role:'candidate', candidateId, campaignSlug, campaignRole}, {silent})
     -> { ok:true, invite, url, token }  or  { ok:false, error, field? }.  Board and Master Network only. */
  function createInvite(d, opts) {
    d = d || {};
    const email = normEmail(d.email), phone = normPhone(d.phone);
    const eErr = emailError(email); if (eErr) return { ok: false, field: 'email', error: eErr };
    const pErr = phoneError(phone); if (pErr) return { ok: false, field: 'phone', error: pErr };
    if (!d.candidateId) return { ok: false, field: 'candidateId', error: 'Choose the candidate this invite is for.' };
    if (!d.candidateId) return { ok: false, field: 'candidateId', error: 'Choose the candidate this invite is for.' };
    const cand = candidateOf(App.state.tenant, d.candidateId);
    const campaignSlug = d.campaignSlug || (cand ? kebab(cand.name) : '');
    if (!campaignSlug) return { ok: false, field: 'campaignSlug', error: 'This invite needs a campaign.' };
    const campaignRole = d.campaignRole === 'staff' ? 'staff' : 'owner';
    if (!canManageCampaign(d.candidateId, campaignSlug, campaignRole)) {
      return { ok: false, error: campaignRole === 'staff' ? 'Only the campaign owner or the executive board can invite staff.' : 'Only the executive board can invite a campaign owner.' };
    }
    // A new invite replaces any open one for the same person and campaign.
    window.Store.list('invites').forEach((i) => {
      if (i.status === 'sent' && i.candidateId === d.candidateId && normEmail(i.email) === email) window.Store.update('invites', i.id, { status: 'revoked', revokedAt: new Date().toISOString() });
    });
    const invite = window.Store.add('invites', {
      email, phone, role: 'candidate', candidateId: d.candidateId, campaignSlug, campaignRole,
      invitedBy: cached ? cached.id : null, status: 'sent', token: newToken(), tenant: App.state.tenant,
    });
    const url = inviteUrl(invite.token, App.state.tenant);
    if (!(opts && opts.silent)) showInviteToast(invite, url);
    return { ok: true, invite, url, token: invite.token };
  }
  function revokeInvite(id) {
    const i = window.Store.list('invites').find((x) => x.id === id);
    if (!i) return { ok: false, error: 'That invite no longer exists.' };
    if (!canManageCampaign(i.candidateId, i.campaignSlug, i.campaignRole)) return { ok: false, error: 'Only the campaign owner or the executive board can revoke this invite.' };
    if (i.status === 'claimed') return { ok: false, error: 'This invite was already claimed.' };
    return { ok: true, invite: window.Store.update('invites', id, { status: 'revoked', revokedAt: new Date().toISOString() }) };
  }
  /* resendInvite(id, {silent}) -> {ok, invite, url}. Shows the link toast again and counts the resend. */
  function resendInvite(id, opts) {
    const i = window.Store.list('invites').find((x) => x.id === id);
    if (!i) return { ok: false, error: 'That invite no longer exists.' };
    if (!canManageCampaign(i.candidateId, i.campaignSlug, i.campaignRole)) return { ok: false, error: 'Only the campaign owner or the executive board can resend this invite.' };
    if (i.status !== 'sent') return { ok: false, error: i.status === 'claimed' ? 'This invite was already claimed.' : 'This invite was revoked. Send a new one.' };
    const invite = window.Store.update('invites', id, { resentAt: new Date().toISOString(), resendCount: (i.resendCount || 0) + 1 });
    const url = inviteUrl(invite.token, invite.tenant || App.state.tenant);
    if (!(opts && opts.silent)) showInviteToast(invite, url, 'Invite resent to');
    return { ok: true, invite, url, token: invite.token };
  }
  /* removeCampaignMember(accountId) -> {ok, account}. Staff only; the account stays as a supporter. */
  function removeCampaignMember(accountId) {
    const a = findAccount(accountId);
    if (!a || a.role !== 'candidate') return { ok: false, error: 'That person is not on a campaign team.' };
    if (a.campaignRole !== 'staff') return { ok: false, error: 'Campaign owners are changed by the executive board with a new invite.' };
    if (!canManageCampaign(a.candidateId, a.campaignSlug, 'staff')) return { ok: false, error: 'Only the campaign owner or the executive board can remove staff.' };
    const account = G.update('accounts', a.id, { role: 'supporter', candidateId: null, campaignSlug: null, campaignRole: null, office: null });
    auditLog('Removed ' + a.name + ' from the ' + a.campaignSlug + ' campaign', { kind: 'campaign.member.removed', accountId: a.id, campaignSlug: a.campaignSlug, candidateId: a.candidateId });
    notify();
    return { ok: true, account };
  }
  /* campaignTeam(slug) -> accounts on that campaign (owner first), hiding superseded sample accounts. */
  function campaignTeam(slug) {
    return accounts().filter((a) => a.role === 'candidate' && a.campaignSlug === slug && !a.supersededBy)
      .sort((x, y) => (x.campaignRole === 'owner' ? 0 : 1) - (y.campaignRole === 'owner' ? 0 : 1) || String(x.name).localeCompare(y.name));
  }

  /* listInvites({status, candidateId, campaignSlug}) -> invites for this county, newest first. */
  function listInvites(f) {
    f = f || {};
    return window.Store.list('invites').filter((i) =>
      (!f.status || i.status === f.status) && (!f.candidateId || i.candidateId === f.candidateId) &&
      (!f.campaignSlug || i.campaignSlug === f.campaignSlug))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }
  function findInviteByToken(token) {
    const slugs = Object.keys(tenantsData());
    for (const slug of slugs) {
      const i = storeFor(slug).list('invites').find((x) => x.token === token);
      if (i) return { invite: i, tenant: slug };
    }
    return null;
  }

  function claimShell(inner) {
    return `<div class="page claim-page"><section class="claim-card" aria-labelledby="claim-h">${inner}</section></div>`;
  }
  function claimMessage(el, title, text, actions) {
    el.innerHTML = claimShell(`<span class="claim-mark">${IC.lock}</span><h1 id="claim-h">${esc(title)}</h1><p class="claim-lead">${esc(text)}</p><div class="claim-actions">${actions || ''}</div>`);
    const si = el.querySelector('[data-claim=signin]');
    if (si) si.addEventListener('click', () => open('signin'));
  }
  function renderClaim(el, ctx) {
    const token = String((ctx && ctx.sub) || '').split('/')[0];
    const found = token ? findInviteByToken(token) : null;
    const home = '<a class="btn btn-primary" href="#/overview">Go to the overview</a>';
    if (!found) return claimMessage(el, 'We can\'t find this invite', 'The link may have a typo or be cut off. Ask the committee to send it again.', home);
    const inv = found.invite;
    if (found.tenant !== App.state.tenant) { App.setTenant(found.tenant, true); return; }
    const T = tenantsData()[found.tenant] || {};
    const org = T.shortName || T.name || 'the committee';
    if (inv.status === 'revoked') return claimMessage(el, 'This invite was withdrawn', `${org} replaced or cancelled it. Ask them for a new link.`, home);
    if (inv.status === 'claimed') return claimMessage(el, 'This invite was already used', 'Someone has already set up this campaign account. Sign in to open it.', '<button type="button" class="btn btn-primary" data-claim="signin">Sign in</button>');
    const cand = candidateOf(found.tenant, inv.candidateId) || {};
    const inviter = inv.invitedBy ? accounts().find((a) => a.id === inv.invitedBy) : null;
    const who = inviter ? `${inviter.name}${inviter.title ? ', ' + inviter.title + ' of ' + org : ' of ' + org}` : org;
    const what = cand.office ? `${cand.name}'s campaign for ${cand.office}` : 'a campaign';
    const roleWord = inv.campaignRole === 'staff' ? 'campaign staff member' : 'campaign owner';
    el.innerHTML = claimShell(
      `<p class="claim-eyebrow">${esc(org)}</p><h1 id="claim-h">Set up your campaign account</h1>` +
      `<p class="claim-lead">${esc(who)} invited you to run ${esc(what)} as a ${esc(roleWord)}. We confirm your email and phone with two codes, then you can edit your campaign site.</p>` +
      `<form class="claim-form" novalidate>` +
      field('cl-name', 'Full name', `type="text" autocomplete="name" value="${esc(cand.name || '')}"`) +
      field('cl-email', 'Email', `type="email" autocomplete="email" autocapitalize="off" spellcheck="false" value="${esc(inv.email)}"`) +
      field('cl-phone', 'Mobile phone', `type="tel" inputmode="tel" autocomplete="tel-national" value="${esc(formatPhone(inv.phone))}"`, 'We text a code to confirm it\'s yours.') +
      `<p class="sheet-note">${esc(CODES_NOTE)}</p>` +
      `<button class="btn btn-primary btn-block" type="submit">Send email code</button></form>`);
    const form = el.querySelector('form');
    const $f = (id) => el.querySelector('#' + id);
    const checks = { 'cl-name': nameError, 'cl-email': emailError, 'cl-phone': phoneError };
    Object.keys(checks).forEach((id) => $f(id).addEventListener('input', () => setErr($f(id), '')));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let first = null;
      Object.keys(checks).forEach((id) => { if (!setErr($f(id), checks[id]($f(id).value)) && !first) first = $f(id); });
      const d = { name: $f('cl-name').value.trim().replace(/\s+/g, ' '), email: normEmail($f('cl-email').value), phone: normPhone($f('cl-phone').value) };
      if (!first) {
        const other = (a) => a && (a.role !== 'supporter' && a.role !== 'candidate');
        if (other(findBy('email', d.email))) { setErr($f('cl-email'), 'This email belongs to a committee account. Use a different email for your campaign.'); first = $f('cl-email'); }
        else if (other(findBy('phone', d.phone))) { setErr($f('cl-phone'), 'This number belongs to a committee account. Use a different number for your campaign.'); first = $f('cl-phone'); }
      }
      if (first) { first.focus(); return; }
      startClaimCodes(found, d);
    });
  }
  function startClaimCodes(found, d) {
    if (!sheet) sheet = buildSheet();
    sheet.opts = {};
    challenge = null;
    const emailStep = () => codeView({
      title: 'Check your email', channel: 'email', target: d.email, purpose: 'claim-email', progress: 'Code 1 of 2',
      lead: 'We sent a 6-digit code to', submitLabel: 'Verify email',
      onVerified: () => { challenge = null; setTimeout(() => showStep(phoneStep(), 1), 260); },
    });
    const phoneStep = () => codeView({
      title: 'Check your phone', channel: 'phone', target: d.phone, purpose: 'claim-phone', progress: 'Code 2 of 2',
      lead: 'Email confirmed. Now enter the code we texted to', submitLabel: 'Open my campaign',
      back: () => showStep(emailStep(), -1),
      onVerified: () => setTimeout(() => finishClaim(found, d), 260),
    });
    showStep(emailStep(), 0);
  }
  function finishClaim(found, d) {
    const inv = found.invite;
    const patch = { name: d.name, email: d.email, phone: d.phone, role: 'candidate', tenant: found.tenant, candidateId: inv.candidateId,
      campaignSlug: inv.campaignSlug, campaignRole: inv.campaignRole, verified: { email: true, phone: true } };
    const cand = candidateOf(found.tenant, inv.candidateId);
    if (cand) patch.office = cand.office;
    let existing = findBy('email', d.email) || findBy('phone', d.phone);
    const sameName = (x) => normName(x.name) === normName(d.name);
    // A sample account matched by contact details but claimed by someone else gives up those details.
    if (existing && existing.sample && !sameName(existing)) {
      G.update('accounts', existing.id, { email: null, phone: null });
      existing = null;
    }
    let acct;
    if (existing) acct = G.update('accounts', existing.id, Object.assign({}, patch, existing.sample ? { sample: false } : {}));
    else acct = G.add('accounts', Object.assign({ zip: '', sample: false, createdBy: null }, patch));
    // One owner per campaign: a real owner replaces the sample owner of the same campaign.
    if (inv.campaignRole === 'owner') {
      accounts().filter((a) => a.sample && a.id !== acct.id && !a.supersededBy && a.role === 'candidate' &&
        a.candidateId === inv.candidateId && a.campaignRole === 'owner')
        .forEach((a) => G.update('accounts', a.id, { supersededBy: acct.id }));
    }
    storeFor(found.tenant).update('invites', inv.id, { status: 'claimed', claimedAt: new Date().toISOString(), claimedBy: acct.id });
    completeSignIn(acct.id, true);
    App.go('mycampaign');
  }

  App.register({
    id: 'claim', title: 'Claim your campaign account', group: 'Account', minRole: 'public',
    blurb: 'Open a campaign invite from your county committee.', render: renderClaim,
  });

  /* ---------------- boot ---------------- */
  seedAccounts();
  loadSession();
  G.on('session', (d) => { if (d.type === 'external') notify(); });
  G.on('accounts', (d) => { if (d.type === 'external') notify(); });
  G.on('reset', () => { seedAccounts(); notify(); });

  const api = {
    get user() { return cached ? JSON.parse(JSON.stringify(cached)) : null; },
    get role() { return effectiveRole(cached); },
    can,
    isCandidate,
    campaign,
    createInvite,
    revokeInvite,
    resendInvite,
    removeCampaignMember,
    campaignTeam,
    listInvites,
    require: requireCap,
    open,
    close: closeSheet,
    signOut,
    signInAs,
    signInSample,
    onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
    sampleAccounts: (tenant) => sampleAccounts(tenant),
    updateProfile,
    verifyContact,
    minRoleFor,
    roleLine: (u) => roleLine(u || cached),
    validate: { email: emailError, phone: phoneError, zip: zipError, name: nameError },
    format: { phone: formatPhone, maskEmail, maskPhone, normPhone, normEmail },
    findByContact: findBy,
    _mount: mount,
    _tenantChanged: tenantChanged,
  };
  App.auth = api;
})();
