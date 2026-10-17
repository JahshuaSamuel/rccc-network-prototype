/* auth-supabase.js: App.auth on Supabase Auth (prepared, not wired in; see docs/SUPABASE.md).
   Same public API and the same account sheet as auth.js. Email codes are real 6-digit Supabase email OTPs
   (sent through the custom SMTP). Phone codes stay "shown on screen" until Twilio is connected:
   RCCC_CONFIG.PHONE_OTP = 'screen' (default) or 'twilio'. In screen mode the phone is saved but stays
   unverified on the server, and phone sign-in is not offered.
   Sample accounts are not available here. They live in demo mode (?demo=1), which runs this tab on the
   browser-storage backend with the original auth.js and never touches the database.
   Roles never change in the browser: claim_invite, set_role and the other RPCs do that on the server.
   Load order: store-supabase.js ... core.js, auth.js, this file. Classic script, ES2020. */
(function () {
  'use strict';
  const CFG = window.RCCC_CONFIG || {};
  const App = window.App;
  const Store = window.Store;
  if (CFG.ACTIVE_BACKEND !== 'supabase' || !App || !App.auth || !Store || Store.backend !== 'supabase' || !window.RCCC_SB) return;
  const sb = window.RCCC_SB;
  const prev = App.auth;                              // auth.js, for its pure helpers (validate, format, minRoleFor)
  const U = App.util, esc = U.esc;
  const V = prev.validate, F = prev.format;
  const PHONE_MODE = CFG.PHONE_OTP === 'twilio' ? 'twilio' : 'screen';
  const CODE_TTL = 10 * 60 * 1000, MAX_ATTEMPTS = 5, RESEND_MS = 60 * 1000;   // Supabase allows one email code per 60 s
  const NOTE_EMAIL = 'Codes expire after 10 minutes.';
  const NOTE_PHONE = 'Text messages are not connected yet, so the phone code appears on screen. Your number is saved but stays unverified until texting is on.';

  /* ---------------- state ---------------- */
  let cached = null;                                  // the account shape auth.js used (see Store.authState().account)
  const subs = new Set();
  function readAuth() { const s = Store.authState(); cached = s.account || null; }
  readAuth();
  Store.onAuthState(() => { readAuth(); notify(); });
  function notify() {
    const u = api.user;
    subs.forEach((fn) => { try { fn(u); } catch (e) { console.error('[auth] onChange listener', e); } });
    renderAccountControl();
  }
  function uid() { const s = Store.authState(); return s.user ? s.user.id : null; }
  function tenantShort() { const t = App.ctx.tenant; return t.shortName || t.name; }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function accountPhrase(role) { return App.accountPhrase ? App.accountPhrase(role) : 'an account'; }
  function e164(d) { return '+1' + F.normPhone(d); }
  function friendly(err) {
    const m = String((err && err.message) || err || '');
    if (/expired|invalid.*otp|token has expired|otp_expired/i.test(m)) return 'That code doesn\'t match or has expired.';
    if (/rate limit|too many|security purposes|seconds/i.test(m)) return 'Please wait a minute before asking for another code.';
    if (/signups not allowed|user not found|otp_disabled/i.test(m)) return 'NOT_FOUND';
    if (/not authorized/i.test(m)) return 'Sign-in email isn\'t connected yet, so codes can\'t go to this address. Try again later, or ask the committee for help.';
    if (/email address .* is invalid|email_address_invalid/i.test(m)) return 'We can\'t send a code to that email address. Check it, or use another one.';
    if (/fetch|network/i.test(m)) return 'We couldn\'t reach the server. Check your connection and try again.';
    return m.replace(/^.*?:\s*/, '') || 'Something went wrong. Try again.';
  }

  /* ---------------- roles (same rules as auth.js) ---------------- */
  function effectiveRole(u) {
    if (!u) return 'public';
    if (u.role === 'master') return 'master';
    if (!u.tenant || u.tenant === App.state.tenant) return u.role;
    return 'supporter';
  }
  const minRoleFor = prev.minRoleFor;
  function can(cap) {
    const role = effectiveRole(cached);
    if (String(cap) === 'crm.campaign') return role === 'candidate';
    return App.atLeast(role, minRoleFor(cap));
  }
  function isCandidate() { return !!cached && effectiveRole(cached) === 'candidate'; }
  function campaign() { return isCandidate() ? { candidateId: cached.candidateId, slug: cached.campaignSlug, role: cached.campaignRole || 'staff' } : null; }
  function roleLine(u) {
    if (!u) return '';
    const r = effectiveRole(u);
    if (r === 'candidate' && u.office) return `Candidate · ${u.office}`;
    return `${App.roleLabel(r)} · ${u.role === 'master' ? 'All counties' : tenantShort()}`;
  }

  /* ---------------- icons ---------------- */
  const svg = (p, s) => `<svg width="${s || 20}" height="${s || 20}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const IC = {
    x: svg('<path d="M5 5l10 10M15 5L5 15"/>'), back: svg('<path d="M12.5 4.5L7 10l5.5 5.5"/>'),
    lock: svg('<rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/>', 18),
    chev: svg('<path d="M5 7.5l5 5 5-5"/>', 14), user: svg('<circle cx="10" cy="7" r="3.2"/><path d="M3.8 17c.9-3.2 3.3-5 6.2-5s5.3 1.8 6.2 5"/>', 18),
    out: svg('<path d="M8 4H5a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 5 16h3"/><path d="M12.5 13.5L16 10l-3.5-3.5M16 10H8"/>', 18),
    mail: svg('<rect x="2.5" y="4" width="15" height="12" rx="2"/><path d="M3.5 5.5l6.5 5 6.5-5"/>', 22),
    phone: svg('<rect x="6" y="2" width="8" height="16" rx="2"/><path d="M9 15h2"/>', 22),
    trash: svg('<path d="M4 6h12M8 6V4.5h4V6M6 6l.8 10h6.4L14 6"/>', 18),
  };

  /* ---------------- the sheet (same markup and classes as auth.js) ---------------- */
  let sheet = null;
  function focusables(root) {
    return Array.from(root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
      .filter((el) => el.offsetParent !== null || el === document.activeElement);
  }
  function buildSheet() {
    const back = document.createElement('div');
    back.className = 'sheet-backdrop';
    back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-grab" aria-hidden="true"></div>` +
      `<div class="sheet-head"><button type="button" class="sheet-icon-btn sheet-back" aria-label="Back" hidden>${IC.back}</button>` +
      `<h2 id="sheet-title" class="sheet-title"></h2><button type="button" class="sheet-icon-btn sheet-close" aria-label="Close">${IC.x}</button></div>` +
      `<div class="sheet-body"><div class="sheet-stage"></div></div></div>`;
    document.body.appendChild(back);
    const s = { root: back, panel: back.querySelector('.sheet'), stage: back.querySelector('.sheet-stage'), title: back.querySelector('.sheet-title'),
      backBtn: back.querySelector('.sheet-back'), prevFocus: document.activeElement, timers: [], backTo: null, opts: {} };
    back.querySelector('.sheet-close').addEventListener('click', closeSheet);
    s.backBtn.addEventListener('click', () => { if (s.backTo) s.backTo(); });
    back.addEventListener('mousedown', (e) => { if (e.target === back) closeSheet(); });
    s.onKey = (e) => {
      if (!sheet || document.querySelector('.modal-backdrop')) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSheet(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables(s.panel); if (!f.length) return;
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
    s.root.classList.remove('in'); s.root.classList.add('out');
    document.documentElement.classList.remove('sheet-open');
    setTimeout(() => s.root.remove(), 320);
    if (s.prevFocus && s.prevFocus.isConnected && s.prevFocus.focus) try { s.prevFocus.focus(); } catch (e) { /* ignore */ }
    if (s.opts.onClose) try { s.opts.onClose(); } catch (e) { console.error(e); }
  }
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
    } else { if (old) old.remove(); s.stage.appendChild(el); }
    s.panel.querySelector('.sheet-body').scrollTop = 0;
    if (view.mount) view.mount(el);
    const auto = el.querySelector('[data-autofocus]') || el.querySelector('input,button');
    if (auto) setTimeout(() => { try { auto.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, dir ? 220 : 60);
  }
  function field(id, label, attrs, hint) {
    return `<div class="fld"><label class="fld-label" for="${id}">${esc(label)}</label>` +
      `<input class="input" id="${id}" ${attrs} aria-describedby="${id}-err${hint ? ` ${id}-hint` : ''}">` +
      (hint ? `<p class="fld-hint" id="${id}-hint">${esc(hint)}</p>` : '') + `<p class="fld-error" id="${id}-err" aria-live="polite"></p></div>`;
  }
  function setErr(input, msg) {
    const box = document.getElementById(input.id + '-err');
    if (box) box.textContent = msg || '';
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    if (input.closest('.fld')) input.closest('.fld').classList.toggle('has-error', !!msg);
    return !msg;
  }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.classList.add('is-busy'); if (label) btn.textContent = label; }
    else { btn.disabled = false; btn.classList.remove('is-busy'); if (btn.dataset.label) btn.textContent = btn.dataset.label; }
  }
  function reasonHTML(r) { return r ? `<div class="sheet-reason">${IC.lock}<p>${esc(r)}</p></div>` : ''; }

  /* 6-box code input (paste, auto-advance, backspace, arrows, SMS autofill). */
  function otpHTML() {
    let h = '<div class="otp" role="group" aria-label="6-digit code">';
    for (let i = 0; i < 6; i++) h += `<input class="otp-box" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${i === 0 ? 6 : 1}" autocomplete="${i === 0 ? 'one-time-code' : 'off'}" aria-label="Digit ${i + 1} of 6"${i === 0 ? ' data-autofocus' : ''}>`;
    return h + '</div>';
  }
  function mountOtp(root, onComplete) {
    const boxes = Array.from(root.querySelectorAll('.otp-box'));
    const value = () => boxes.map((b) => b.value).join('');
    const check = () => { boxes.forEach((b) => b.classList.toggle('is-filled', !!b.value)); const v = value(); if (/^\d{6}$/.test(v)) onComplete(v); };
    const fill = (digits, from) => { let i = from; for (const d of digits) { if (i >= 6) break; boxes[i].value = d; i++; } boxes[Math.min(i, 5)].focus(); check(); };
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        const d = b.value.replace(/\D/g, '');
        if (d.length > 1) { b.value = ''; fill(d, i); return; }
        b.value = d; if (d && i < 5) boxes[i + 1].focus(); check();
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !b.value && i > 0) { e.preventDefault(); boxes[i - 1].value = ''; boxes[i - 1].focus(); check(); }
        else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); boxes[i - 1].focus(); }
        else if (e.key === 'ArrowRight' && i < 5) { e.preventDefault(); boxes[i + 1].focus(); }
      });
      b.addEventListener('focus', () => { try { b.select(); } catch (e) { /* ignore */ } });
      b.addEventListener('paste', (e) => {
        const t = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\D/g, '');
        if (!t) return; e.preventDefault(); fill(t, t.length >= 6 ? 0 : i);
      });
    });
    return {
      value,
      clear() { boxes.forEach((b) => { b.value = ''; b.classList.remove('is-filled'); }); boxes[0].focus(); },
      setDisabled(on) { boxes.forEach((b) => { b.disabled = on; }); },
      shake() { const g = root.querySelector('.otp'); g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake'); },
    };
  }

  /* ---------------- code senders ----------------
     A sender is { channel, target, send(): Promise<void>, verify(code): Promise<void> }.
     Email and Twilio senders go to Supabase. The screen sender is the "code on screen" fallback for phones. */
  function emailSender(email, opts) {
    const o = opts || {};
    return {
      channel: 'email', target: email,
      async send() {
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: !!o.create, data: o.data || undefined } });
        if (error) throw error;
      },
      async verify(code) {
        const { error } = await sb.auth.verifyOtp({ email, token: code, type: o.change ? 'email_change' : 'email' });
        if (error) throw error;
      },
    };
  }
  function emailChangeSender(email) {
    return {
      channel: 'email', target: email,
      async send() { const { error } = await sb.auth.updateUser({ email }); if (error) throw error; },
      async verify(code) { const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email_change' }); if (error) throw error; },
    };
  }
  function phoneSender(phone, purpose) {
    if (PHONE_MODE === 'twilio') {
      return {
        channel: 'phone', target: phone,
        async send() {
          const r = purpose === 'signin' ? await sb.auth.signInWithOtp({ phone: e164(phone), options: { shouldCreateUser: false } }) : await sb.auth.updateUser({ phone: e164(phone) });
          if (r.error) throw r.error;
        },
        async verify(code) {
          const { error } = await sb.auth.verifyOtp({ phone: e164(phone), token: code, type: purpose === 'signin' ? 'sms' : 'phone_change' });
          if (error) throw error;
        },
      };
    }
    let current = null;
    return {
      channel: 'phone', target: phone, screen: true,
      async send() {
        const b = new Uint32Array(1); window.crypto.getRandomValues(b);
        current = { code: String(b[0] % 1000000).padStart(6, '0'), expires: Date.now() + CODE_TTL };
        App.toast(`${tenantShort()} code: ${current.code}`, 'code', {
          duration: 20000,
          html: `<span class="toast-code-line">${esc(tenantShort())} phone code: <b class="toast-code" data-code="${current.code}">${current.code.slice(0, 3)} ${current.code.slice(3)}</b></span><span class="toast-sub">For ${esc(F.maskPhone(phone))}. Texting is not connected yet.</span>`,
        });
      },
      async verify(code) {
        if (!current || Date.now() > current.expires) throw new Error('This code expired after 10 minutes. Send a new code.');
        if (code !== current.code) throw new Error('That code doesn\'t match.');
        current = null;
      },
    };
  }

  /* A code step shared by sign-in, sign-up, contact changes and the claim page.
     cfg: { title, sender, lead, progress, submitLabel, back, onVerified(), sendFirst=true } */
  function codeView(cfg) {
    const s = cfg.sender;
    const to = s.channel === 'email' ? F.maskEmail(s.target) : F.maskPhone(s.target);
    return {
      title: cfg.title, back: cfg.back,
      html: (cfg.progress ? `<p class="sheet-progress">${esc(cfg.progress)}</p>` : '') +
        `<div class="code-lead"><span class="code-icon">${s.channel === 'email' ? IC.mail : IC.phone}</span>` +
        `<p>${esc(cfg.lead || 'We sent a 6-digit code to')} <strong>${esc(to)}</strong>.</p></div>` +
        `<form class="sheet-form" novalidate>${otpHTML()}<p class="fld-error otp-error" aria-live="polite"></p>` +
        `<button class="btn btn-primary btn-block" type="submit">${esc(cfg.submitLabel || 'Verify code')}</button></form>` +
        `<div class="resend-row"><span class="resend-wait" aria-live="off"></span><button type="button" class="btn btn-ghost btn-sm resend-btn" hidden>Send a new code</button></div>` +
        `<p class="sheet-note">${esc(s.screen ? NOTE_PHONE : NOTE_EMAIL)}</p>`,
      mount(el) {
        const err = el.querySelector('.otp-error'), btn = el.querySelector('button[type=submit]');
        const wait = el.querySelector('.resend-wait'), resend = el.querySelector('.resend-btn');
        let attempts = 0, locked = false, sentAt = 0, working = false;
        const otp = mountOtp(el, (v) => submit(v));
        async function sendCode() {
          try { await s.send(); sentAt = Date.now(); err.textContent = ''; }
          catch (e) { const m = friendly(e); err.textContent = m === 'NOT_FOUND' ? 'We couldn\'t find an account for that. Check it, or create an account.' : m; sentAt = Date.now(); }
          tick();
        }
        async function submit(v) {
          if (locked || working) return;
          if (!/^\d{6}$/.test(v)) { err.textContent = 'Enter all 6 digits of the code.'; otp.shake(); return; }
          working = true; busy(btn, true, 'Checking');
          try {
            await s.verify(v);
            err.textContent = ''; btn.textContent = 'Verified';
            await cfg.onVerified();
          } catch (e) {
            busy(btn, false);
            attempts++;
            const left = MAX_ATTEMPTS - attempts;
            const m = friendly(e);
            err.textContent = left <= 0 ? 'That code didn\'t match five times. Send a new code.' : `${m === 'NOT_FOUND' ? 'That code doesn\'t match.' : m} You have ${left} ${left === 1 ? 'try' : 'tries'} left.`;
            otp.shake();
            if (left <= 0) { locked = true; otp.setDisabled(true); btn.disabled = true; showResend(); } else otp.clear();
          }
          working = false;
        }
        el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); submit(otp.value()); });
        function showResend() { wait.textContent = 'Didn\'t get it?'; resend.hidden = false; }
        function tick() {
          const left = Math.max(0, Math.ceil((sentAt + RESEND_MS - Date.now()) / 1000));
          if (left > 0 && !locked) { wait.textContent = `Send a new code in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; resend.hidden = true; }
          else showResend();
        }
        resend.addEventListener('click', () => { attempts = 0; locked = false; otp.setDisabled(false); btn.disabled = false; otp.clear(); sendCode(); });
        if (cfg.sendFirst === false) { sentAt = Date.now(); tick(); } else sendCode();
        sheet.timers.push(setInterval(tick, 1000));
      },
    };
  }

  /* ---------------- sign-in ---------------- */
  function afterSignIn(isNew) {
    const after = sheet && sheet.opts.onSuccess;
    return Store.refreshProfile().then(() => {
      readAuth();
      closeSheet();
      const a = cached;
      if (!a) return;
      if (isNew) App.toast(`Welcome, ${firstName(a.name)}. You're signed in as a supporter of ${tenantShort()}.`, 'ok', { duration: 5000 });
      else App.toast(`Signed in as ${a.name} with ${accountPhrase(effectiveRole(a))}.`, 'ok');
      if (after) try { after(api.user); } catch (e) { console.error(e); }
      else if (isCandidate()) App.go('mycampaign');
    });
  }
  function signInView(prefill) {
    const o = sheet.opts;
    const label = PHONE_MODE === 'twilio' ? 'Email or mobile number' : 'Email';
    return {
      title: 'Sign in',
      html: reasonHTML(o.reason) + `<form class="sheet-form" novalidate>` +
        field('si-id', label, `type="${PHONE_MODE === 'twilio' ? 'text' : 'email'}" autocomplete="username" autocapitalize="off" spellcheck="false" value="${esc(prefill || '')}" data-autofocus`) +
        `<button class="btn btn-primary btn-block" type="submit">Send code</button></form>` +
        `<p class="sheet-switch">New to ${esc(tenantShort())}? <button type="button" class="link-btn" data-go="signup">Create an account</button></p>` +
        (CFG.DEMO_URL !== false ? `<p class="sheet-note sheet-demo"><a href="${esc(demoHref())}">Try the demo with sample accounts</a></p>` : ''),
      mount(el) {
        const input = el.querySelector('#si-id');
        el.querySelector('[data-go=signup]').addEventListener('click', () => showStep(signUpView(), 1));
        input.addEventListener('input', () => setErr(input, ''));
        el.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const raw = input.value.trim();
          if (!raw) return setErr(input, 'Enter the email on your account.');
          const isEmail = raw.indexOf('@') >= 0;
          if (!isEmail && PHONE_MODE !== 'twilio') return setErr(input, 'Sign in with your email for now. Text codes start once texting is connected.');
          const bad = isEmail ? V.email(raw) : V.phone(raw);
          if (bad) return setErr(input, bad);
          const btn = el.querySelector('button[type=submit]');
          const sender = isEmail ? emailSender(F.normEmail(raw)) : phoneSender(F.normPhone(raw), 'signin');
          busy(btn, true, 'Sending');
          try { await sender.send(); }
          catch (err) {
            busy(btn, false);
            const m = friendly(err);
            return setErr(input, m === 'NOT_FOUND' ? `We couldn't find an account with that ${isEmail ? 'email' : 'number'}. Check it, or create an account below.` : m);
          }
          busy(btn, false);
          showStep(codeView({ title: 'Enter your code', sender, submitLabel: 'Sign in', sendFirst: false,
            back: () => showStep(signInView(raw), -1), onVerified: () => afterSignIn(false) }), 1);
        });
      },
    };
  }

  /* Demo mode keeps the sample accounts: same page and county, ?demo=1, browser storage only. */
  function demoHref() {
    if (App.demoUrl) return App.demoUrl();
    const q = new URLSearchParams(location.search); q.set('demo', '1'); q.set('tenant', App.state.tenant);
    return location.pathname + '?' + q.toString() + '#/overview';
  }

  /* ---------------- sign-up ---------------- */
  function signUpView(draft) {
    const d = draft || {};
    return {
      title: 'Create your account',
      html: `<p class="sheet-lead">Join ${esc(tenantShort())} as a supporter. Your account keeps your RSVPs and volunteer sign-ups together, so you can find them later.</p>` +
        `<form class="sheet-form" novalidate>` +
        field('su-name', 'Full name', `type="text" autocomplete="name" value="${esc(d.name || '')}" data-autofocus`) +
        field('su-email', 'Email', `type="email" autocomplete="email" autocapitalize="off" spellcheck="false" value="${esc(d.email || '')}"`) +
        field('su-phone', 'Mobile phone', `type="tel" inputmode="tel" autocomplete="tel-national" value="${esc(d.phone ? F.phone(d.phone) : '')}"`, PHONE_MODE === 'twilio' ? 'We text a code to confirm it\'s yours.' : 'We confirm it once texting is connected.') +
        field('su-zip', 'ZIP code', `type="text" inputmode="numeric" autocomplete="postal-code" maxlength="10" value="${esc(d.zip || '')}"`, 'Your ZIP shows you local races and events.') +
        `<p class="sheet-note">We confirm your email with a 6-digit code.</p>` +
        `<button class="btn btn-primary btn-block" type="submit">Send email code</button></form>` +
        `<p class="sheet-switch">Already have an account? <button type="button" class="link-btn" data-go="signin">Sign in</button></p>`,
      mount(el) {
        const $f = (id) => el.querySelector('#' + id);
        const checks = { 'su-name': V.name, 'su-email': V.email, 'su-phone': V.phone, 'su-zip': V.zip };
        Object.keys(checks).forEach((id) => {
          const inp = $f(id);
          inp.addEventListener('blur', () => { if (inp.value.trim()) setErr(inp, checks[id](inp.value)); });
          inp.addEventListener('input', () => { if (inp.getAttribute('aria-invalid')) setErr(inp, ''); });
        });
        el.querySelector('[data-go=signin]').addEventListener('click', () => showStep(signInView($f('su-email').value), 1));
        el.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          let first = null;
          Object.keys(checks).forEach((id) => { if (!setErr($f(id), checks[id]($f(id).value)) && !first) first = $f(id); });
          if (first) { first.focus(); return; }
          const next = { name: $f('su-name').value.trim().replace(/\s+/g, ' '), email: F.normEmail($f('su-email').value), phone: F.normPhone($f('su-phone').value), zip: $f('su-zip').value.trim().slice(0, 5) };
          const sender = emailSender(next.email, { create: true, data: { name: next.name, phone: next.phone, zip: next.zip, tenant: App.state.tenant } });
          const btn = el.querySelector('button[type=submit]');
          busy(btn, true, 'Sending');
          try { await sender.send(); } catch (err) { busy(btn, false); return setErr($f('su-email'), friendly(err)); }
          busy(btn, false);
          showStep(codeView({ title: 'Check your email', sender, progress: 'Code 1 of 2', submitLabel: 'Verify email', sendFirst: false,
            back: () => showStep(signUpView(next), -1),
            onVerified: async () => {
              await Store.refreshProfile(); readAuth();
              const existing = cached && cached.createdAt && Date.now() - Date.parse(cached.createdAt) > 5 * 60 * 1000;
              if (existing) return afterSignIn(false);   // that email already had an account: it is now signed in
              setTimeout(() => showStep(signUpPhoneView(next), 1), 240);
            } }), 1);
        });
      },
    };
  }
  function signUpPhoneView(d) {
    const sender = phoneSender(d.phone, 'change');
    return codeView({
      title: 'Check your phone', sender, progress: 'Code 2 of 2', lead: 'Email confirmed. Now enter the code for', submitLabel: 'Create account',
      onVerified: async () => {
        if (sender.screen) await sb.from('profiles').update({ phone: d.phone }).eq('id', uid());
        await afterSignIn(true);
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
  function requireCap(cap, opts) {
    if (can(cap)) return true;
    const o = opts || {};
    const need = minRoleFor(cap);
    const aud = (App.roleAudience && App.roleAudience[need]) || { who: App.roleLabel(need), account: 'an account with access' };
    if (!cached) { open('signin', { reason: o.reason || `Sign in with ${aud.account} to continue.`, onSuccess: o.onSuccess }); return false; }
    App.modal({
      title: `This is for ${aud.who}`,
      html: `<p>${o.reason ? esc(o.reason) + ' ' : ''}You're signed in as ${esc(cached.name)} with ${esc(accountPhrase(effectiveRole(cached)))}. This needs ${esc(aud.account)}. Ask your county's executive board to update your access.</p>`,
      actions: [{ label: 'Close', primary: true }],
    });
    return false;
  }
  function verifyContact(channel, value) {
    return new Promise((resolve) => {
      if (!cached) return resolve(false);
      const target = channel === 'email' ? F.normEmail(value) : F.normPhone(value);
      let done = false;
      if (!sheet) sheet = buildSheet();
      sheet.opts = { onClose: () => { if (!done) resolve(false); } };
      const sender = channel === 'email' ? emailChangeSender(target) : phoneSender(target, 'change');
      showStep(codeView({
        title: channel === 'email' ? 'Confirm your new email' : 'Confirm your new number', sender, lead: 'Enter the code we sent to', submitLabel: 'Confirm and save',
        onVerified: async () => {
          if (channel === 'phone' && sender.screen) await sb.from('profiles').update({ phone: target }).eq('id', uid());
          await Store.refreshProfile();
          done = true; closeSheet(); resolve(true);
        },
      }), 0);
    });
  }
  function updateProfile(patch) {
    if (!cached) return { ok: false, error: 'Sign in first.' };
    const p = {};
    if ('name' in patch) { const e = V.name(patch.name); if (e) return { ok: false, field: 'name', error: e }; p.name = String(patch.name).trim().replace(/\s+/g, ' '); }
    if ('zip' in patch) { const e = V.zip(patch.zip); if (e) return { ok: false, field: 'zip', error: e }; p.zip = String(patch.zip).trim().slice(0, 5); }
    cached = Object.assign({}, cached, p);
    sb.from('profiles').update(p).eq('id', uid()).then(({ error }) => {
      if (error) App.toast('Your profile change didn\'t save. Try again.', 'error');
      Store.refreshProfile();
    });
    notify();
    return { ok: true, user: api.user };
  }
  async function signOut(opts) {
    if (!cached) return;
    const name = cached.name;
    await sb.auth.signOut();
    readAuth(); notify();
    if (!(opts && opts.silent)) App.toast(`${firstName(name)}, you're signed out.`, 'info');
  }
  function signInSample() {
    App.toast('Sample accounts are in the demo. Add ?demo=1 to the address to open it.', 'info', { duration: 6000 });
    return false;
  }

  /* ---------------- invites (server RPCs; results come back through Store realtime) ---------------- */
  function inviteUrl(token, tenant) { return new URL(`app.html?tenant=${encodeURIComponent(tenant || App.state.tenant)}#/claim/${token}`, location.href).href; }
  function newToken() { const b = new Uint8Array(24); window.crypto.getRandomValues(b); return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); }
  function copyText(text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true, () => false); } catch (e) { /* fall through */ }
    return Promise.resolve(false);
  }
  function linkToast(email, url, heading) {
    const t = App.toast(`Invite link for ${email}`, 'ok', {
      duration: 30000,
      html: `<span class="toast-code-line">${esc(heading)} <b>${esc(email)}</b>.</span><span class="toast-link">${esc(url)}</span><button type="button" class="toast-copy" data-copy>Copy link</button>`,
    });
    const b = t && t.querySelector && t.querySelector('[data-copy]');
    if (b) b.addEventListener('click', async (e) => { e.stopPropagation(); b.textContent = (await copyText(url)) ? 'Link copied' : 'Select the link and copy it'; });
  }
  async function emailInvite(tenant, invite, url, resent) {
    try {
      await Store.invoke('send-email', { kind: 'invite', tenant, id: invite.id });
      App.toast(`${resent ? 'Invite resent' : 'Invite emailed'} to ${invite.email}.`, 'ok');
    } catch (e) {
      linkToast(invite.email, url, `${e.message} Send this link to`);
    }
  }
  function canManageCampaign(candidateId, slug, campaignRole) {
    if (can('candidate.manage')) return true;
    const c = campaign();
    return !!c && c.role === 'owner' && campaignRole === 'staff' && c.candidateId === candidateId && c.slug === slug;
  }
  function createInvite(d, opts) {
    d = d || {};
    const tenant = App.state.tenant;
    const email = F.normEmail(d.email);
    if (V.email(email)) return { ok: false, field: 'email', error: V.email(email) };
    if (d.phone && V.phone(d.phone)) return { ok: false, field: 'phone', error: V.phone(d.phone) };
    if (!d.candidateId) return { ok: false, field: 'candidateId', error: 'Choose the candidate this invite is for.' };
    if (!d.campaignSlug) return { ok: false, field: 'campaignSlug', error: 'This invite needs a campaign.' };
    const campaignRole = d.campaignRole === 'staff' ? 'staff' : 'owner';
    if (!canManageCampaign(d.candidateId, d.campaignSlug, campaignRole)) {
      return { ok: false, error: campaignRole === 'staff' ? 'Only the campaign owner or the executive board can invite staff.' : 'Only the executive board can invite a campaign owner.' };
    }
    const token = newToken();
    const url = inviteUrl(token, tenant);
    const invite = { id: null, email, phone: F.normPhone(d.phone), role: 'candidate', candidateId: d.candidateId, campaignSlug: d.campaignSlug,
      campaignRole, status: 'sent', token, tenant, invitedBy: cached ? cached.id : null, createdAt: new Date().toISOString() };
    Store.rpc('create_invite', { p_tenant: tenant, p_email: email, p_phone: d.phone || null, p_candidate_id: d.candidateId, p_campaign_slug: d.campaignSlug,
      p_campaign_role: campaignRole, p_office: d.office || null, p_token: token })
      .then((saved) => { Object.assign(invite, saved); Store.hydrate('invites', { tenant }); if (!(opts && opts.silent)) emailInvite(tenant, saved, url, false); })
      .catch((e) => App.toast(`The invite didn't save: ${friendly(e)}`, 'error'));
    return { ok: true, invite, url, token };
  }
  function findInvite(id) { return Store.list('invites').find((x) => x.id === id) || null; }
  function revokeInvite(id) {
    const i = findInvite(id);
    if (!i) return { ok: false, error: 'That invite no longer exists.' };
    if (!canManageCampaign(i.candidateId, i.campaignSlug, i.campaignRole)) return { ok: false, error: 'Only the campaign owner or the executive board can revoke this invite.' };
    if (i.status === 'claimed') return { ok: false, error: 'This invite was already claimed.' };
    Store.rpc('revoke_invite', { p_tenant: App.state.tenant, p_id: id }).then(() => Store.hydrate('invites')).catch((e) => App.toast(friendly(e), 'error'));
    return { ok: true, invite: Object.assign({}, i, { status: 'revoked', revokedAt: new Date().toISOString() }) };
  }
  function resendInvite(id, opts) {
    const i = findInvite(id);
    if (!i) return { ok: false, error: 'That invite no longer exists.' };
    if (!canManageCampaign(i.candidateId, i.campaignSlug, i.campaignRole)) return { ok: false, error: 'Only the campaign owner or the executive board can resend this invite.' };
    if (i.status !== 'sent') return { ok: false, error: i.status === 'claimed' ? 'This invite was already claimed.' : 'This invite was revoked. Send a new one.' };
    const tenant = App.state.tenant, url = inviteUrl(i.token, tenant);
    Store.rpc('resend_invite', { p_tenant: tenant, p_id: id })
      .then((saved) => { Store.hydrate('invites'); if (!(opts && opts.silent)) emailInvite(tenant, saved, url, true); })
      .catch((e) => App.toast(friendly(e), 'error'));
    return { ok: true, invite: i, url, token: i.token };
  }
  const teams = new Map();
  function campaignTeam(slug) {
    const key = App.state.tenant + ':' + slug;
    const hit = teams.get(key);
    if (!hit || Date.now() - hit.at > 30000) {
      teams.set(key, { at: Date.now(), list: hit ? hit.list : [] });
      Store.rpc('campaign_team', { p_tenant: App.state.tenant, p_slug: slug }).then((rows) => {
        const list = (rows || []).map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, role: 'candidate', tenant: App.state.tenant, campaignSlug: slug, campaignRole: r.campaign_role, createdAt: r.created_at }));
        const changed = JSON.stringify(list) !== JSON.stringify((teams.get(key) || {}).list);
        teams.set(key, { at: Date.now(), list });
        if (changed) notify();
      }).catch(() => {});
    }
    return (teams.get(key).list || []).slice();
  }
  function removeCampaignMember(accountId) {
    Store.rpc('remove_campaign_member', { p_user: accountId })
      .then(() => { teams.clear(); notify(); })
      .catch((e) => App.toast(friendly(e), 'error'));
    return { ok: true };
  }
  function listInvites(f) {
    f = f || {};
    return Store.list('invites').filter((i) => (!f.status || i.status === f.status) && (!f.candidateId || i.candidateId === f.candidateId) && (!f.campaignSlug || i.campaignSlug === f.campaignSlug))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  /* ---------------- the claim page (#/claim/<token>) ---------------- */
  function claimShell(inner) { return `<div class="page claim-page"><section class="claim-card" aria-labelledby="claim-h">${inner}</section></div>`; }
  function claimMessage(el, title, text, actions) {
    el.innerHTML = claimShell(`<span class="claim-mark">${IC.lock}</span><h1 id="claim-h">${esc(title)}</h1><p class="claim-lead">${esc(text)}</p><div class="claim-actions">${actions || ''}</div>`);
    const si = el.querySelector('[data-claim=signin]'); if (si) si.addEventListener('click', () => open('signin'));
    const so = el.querySelector('[data-claim=signout]'); if (so) so.addEventListener('click', () => signOut());
  }
  async function claimNow(el, token) {
    try {
      await Store.rpc('claim_invite', { p_token: token });
      await Store.refreshProfile(); readAuth(); notify();
      App.toast(`Welcome, ${firstName(cached && cached.name)}. Your campaign is ready in My Campaign.`, 'ok', { duration: 5000 });
      App.go('mycampaign');
    } catch (e) {
      claimMessage(el, 'This invite didn\'t go through', friendly(e), '<a class="btn btn-primary" href="#/overview">Go to the overview</a>');
    }
  }
  function renderClaim(el, ctx) {
    const token = String((ctx && ctx.sub) || '').split('/')[0];
    const home = '<a class="btn btn-primary" href="#/overview">Go to the overview</a>';
    el.innerHTML = claimShell('<p class="claim-lead" aria-live="polite">Opening your invite…</p>');
    Store.rpc('invite_preview', { p_token: token }).then((inv) => {
      if (!inv) return claimMessage(el, 'We can\'t find this invite', 'The link may have a typo or be cut off. Ask the committee to send it again.', home);
      if (inv.tenant !== App.state.tenant) { App.setTenant(inv.tenant, true); return; }
      const org = tenantShort();
      if (inv.status === 'revoked') return claimMessage(el, 'This invite was withdrawn', `${org} replaced or cancelled it. Ask them for a new link.`, home);
      if (inv.status === 'expired') return claimMessage(el, 'This invite expired', `Invites work for 14 days. Ask ${org} to send a new one.`, home);
      if (inv.status === 'claimed') return claimMessage(el, 'This invite was already used', 'Someone has already set up this campaign account. Sign in to open it.', '<button type="button" class="btn btn-primary" data-claim="signin">Sign in</button>');
      const cand = (((window.DATA && DATA.tenants[inv.tenant]) || {}).candidates || []).find((c) => c.id === inv.candidateId) || {};
      const what = cand.office ? `${cand.name}'s campaign for ${cand.office}` : 'a campaign';
      const roleWord = inv.campaignRole === 'staff' ? 'campaign staff member' : 'campaign owner';
      const who = inv.invitedByName ? `${inv.invitedByName} of ${org}` : org;
      if (cached && F.normEmail(cached.email) !== F.normEmail(inv.email)) {
        return claimMessage(el, 'Sign in with the invited email', `This invite was sent to ${F.maskEmail(inv.email)}. You're signed in as ${cached.email}. Sign out, then open the link again.`, '<button type="button" class="btn btn-primary" data-claim="signout">Sign out</button>');
      }
      if (cached) {
        el.innerHTML = claimShell(`<p class="claim-eyebrow">${esc(org)}</p><h1 id="claim-h">Open your campaign account</h1>` +
          `<p class="claim-lead">${esc(who)} invited you to run ${esc(what)} as a ${esc(roleWord)}.</p><div class="claim-actions"><button type="button" class="btn btn-primary" data-go>Open my campaign</button></div>`);
        el.querySelector('[data-go]').addEventListener('click', (e) => { busy(e.currentTarget, true, 'Opening'); claimNow(el, token); });
        return;
      }
      el.innerHTML = claimShell(`<p class="claim-eyebrow">${esc(org)}</p><h1 id="claim-h">Set up your campaign account</h1>` +
        `<p class="claim-lead">${esc(who)} invited you to run ${esc(what)} as a ${esc(roleWord)}. We confirm your email with a 6-digit code, then you can edit your campaign site.</p>` +
        `<form class="claim-form" novalidate>` +
        field('cl-name', 'Full name', `type="text" autocomplete="name" value="${esc(cand.name || '')}"`) +
        field('cl-email', 'Email', `type="email" value="${esc(inv.email)}" readonly`, 'Invites work only with the email they were sent to.') +
        field('cl-phone', 'Mobile phone', `type="tel" inputmode="tel" autocomplete="tel-national" value="${esc(inv.phone ? F.phone(inv.phone) : '')}"`) +
        `<button class="btn btn-primary btn-block" type="submit">Send email code</button></form>`);
      const $f = (id) => el.querySelector('#' + id);
      el.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!setErr($f('cl-name'), V.name($f('cl-name').value)) || !setErr($f('cl-phone'), V.phone($f('cl-phone').value))) return;
        const d = { name: $f('cl-name').value.trim().replace(/\s+/g, ' '), phone: F.normPhone($f('cl-phone').value) };
        const sender = emailSender(F.normEmail(inv.email), { create: true, data: { name: d.name, phone: d.phone, tenant: inv.tenant } });
        const btn = el.querySelector('button[type=submit]');
        busy(btn, true, 'Sending');
        try { await sender.send(); } catch (err) { busy(btn, false); return setErr($f('cl-email'), friendly(err)); }
        busy(btn, false);
        if (!sheet) sheet = buildSheet();
        sheet.opts = {};
        showStep(codeView({ title: 'Check your email', sender, submitLabel: 'Open my campaign', sendFirst: false,
          onVerified: async () => { closeSheet(); await claimNow(el, token); } }), 0);
      });
    }).catch((e) => claimMessage(el, 'We couldn\'t open this invite', friendly(e), home));
  }
  App.register({ id: 'claim', title: 'Claim your campaign account', group: 'Account', minRole: 'public', blurb: 'Open a campaign invite from your county committee.', render: renderClaim });

  /* ---------------- topbar account control ---------------- */
  let slot = null, menuOpen = false;
  function renderAccountControl() {
    if (!slot) return;
    closeMenu(true);
    const u = cached;
    if (!u) { slot.innerHTML = `<button type="button" class="acct-signin" data-acct="signin">${IC.user}<span>Sign in</span></button>`; return; }
    slot.innerHTML =
      `<button type="button" class="acct-btn" id="acct-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="acct-menu" aria-label="Account: ${esc(u.name)}">` +
      `${U.avatar(u.name, 34)}<span class="acct-first">${esc(firstName(u.name))}</span><span class="acct-chev">${IC.chev}</span></button>` +
      `<div class="acct-menu" id="acct-menu" role="menu" aria-labelledby="acct-btn" hidden>` +
      `<div class="acct-head">${U.avatar(u.name, 44)}<div class="acct-head-txt"><strong>${esc(u.name)}</strong><span>${esc(roleLine(u))}</span></div></div>` +
      `<button type="button" role="menuitem" class="acct-item" data-acct="profile">${IC.user}<span>Your profile</span></button>` +
      (can('board') ? `<button type="button" role="menuitem" class="acct-item" data-acct="purge">${IC.trash}<span>Remove sample data</span></button>` : '') +
      `<div class="acct-sep" role="separator"></div>` +
      `<button type="button" role="menuitem" class="acct-item" data-acct="signout">${IC.out}<span>Sign out</span></button></div>`;
  }
  function menuItems() { return Array.from(slot.querySelectorAll('.acct-menu [role=menuitem]')); }
  function openMenu() {
    const m = slot && slot.querySelector('.acct-menu'); if (!m) return;
    m.hidden = false; requestAnimationFrame(() => m.classList.add('in'));
    menuOpen = true; slot.querySelector('.acct-btn').setAttribute('aria-expanded', 'true');
    const f = menuItems()[0]; if (f) f.focus();
  }
  function closeMenu(silent) {
    if (!menuOpen || !slot) { menuOpen = false; return; }
    menuOpen = false;
    const m = slot.querySelector('.acct-menu'), b = slot.querySelector('.acct-btn');
    if (b) b.setAttribute('aria-expanded', 'false');
    if (m) { m.classList.remove('in'); m.hidden = true; }
    if (!silent && b) b.focus();
  }
  function mount(el) {
    slot = el; if (!slot) return;
    renderAccountControl();
    slot.addEventListener('click', (e) => {
      const b = e.target.closest('[data-acct], .acct-btn'); if (!b) return;
      if (b.classList.contains('acct-btn')) { menuOpen ? closeMenu() : openMenu(); return; }
      const k = b.dataset.acct; closeMenu(true);
      if (k === 'signin') open('signin'); else if (k === 'profile') App.go('account'); else if (k === 'signout') signOut(); else if (k === 'purge') confirmPurge();
    });
    slot.addEventListener('keydown', (e) => {
      if (!menuOpen) { if (e.key === 'ArrowDown' && e.target.classList.contains('acct-btn')) { e.preventDefault(); openMenu(); } return; }
      const items = menuItems(), i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Tab') closeMenu(true);
    });
    document.addEventListener('mousedown', (e) => { if (menuOpen && !slot.contains(e.target)) closeMenu(true); });
  }
  /* R7: on the real database "Reset sample data" would only clear this browser, so board members get
     "Remove sample data" instead: purge_sample deletes this county's rows marked sample, after a confirmation. */
  function confirmPurge() {
    if (!can('board')) return;
    const org = tenantShort();
    App.modal({
      title: `Remove ${org}'s sample data?`,
      html: `<p>This permanently deletes the sample people, timelines, lists, petitions and other records marked Sample in ${esc(org)}. ` +
        `Records your committee added or edited stay. It can't be undone.</p>`,
      actions: [{ label: 'Keep sample data' }, { label: 'Remove sample data', primary: true, danger: true, onClick: () => {
        Store.purgeSample(App.state.tenant)
          .then((n) => App.toast(n ? `Removed ${Number(n).toLocaleString('en-US')} sample records from ${org}.` : `${org} has no sample records left.`, 'ok'))
          .catch((e) => App.toast(`Sample data wasn't removed: ${friendly(e)}`, 'error'));
      } }],
    });
  }
  /* Real accounts keep their home role when the county switcher changes; there are no sample twins here. */
  function tenantChanged() { renderAccountControl(); }

  const api = {
    get user() { return cached ? JSON.parse(JSON.stringify(cached)) : null; },
    get role() { return effectiveRole(cached); },
    can, isCandidate, campaign,
    createInvite, revokeInvite, resendInvite, removeCampaignMember, campaignTeam, listInvites,
    require: requireCap, open, close: closeSheet, signOut,
    signInAs: () => false, signInSample,
    onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
    sampleAccounts: () => [],
    updateProfile, verifyContact, minRoleFor,
    roleLine: (u) => roleLine(u || cached),
    validate: V, format: F,
    findByContact: () => null,          // other people's accounts are private on the server
    backend: 'supabase', phoneMode: PHONE_MODE,
    _mount: mount, _tenantChanged: tenantChanged,
  };
  App.auth = api;
})();
