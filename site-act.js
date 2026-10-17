/* site-act.js: public petitions and surveys (#/act and #/act/<slug>) plus the homepage "Take action" block.
   Reads Store 'petitions' (owner 'committee', status 'live' or 'closed'); writes Store 'signatures'
   {petitionId, title, name, email, phone, zip, answers?, optIn, visitorId}. Seeds nothing: with no live
   committee petitions, the block and the index stay hidden. */
(function () {
  'use strict';
  const S = window.Site;
  if (!S) return;
  const { esc, util, H, V, icon: ICON, star: STAR, t: T } = S;
  const county = /county$/i.test(T.county || '') ? T.county : (T.county || '') + ' County';

  /* ---------- data ---------- */
  const all = () => Store.list('petitions').filter((p) => p && p.owner === 'committee' && p.slug && p.title);
  const live = () => all().filter((p) => p.status === 'live');
  const bySlug = (slug) => all().find((p) => p.slug === slug && (p.status === 'live' || p.status === 'closed')) || null;
  const sigs = (p) => Store.list('signatures').filter((x) => x && x.petitionId === p.id);
  const base = (p) => Number(p.seedCount ?? p.baseCount ?? p.signatureCount ?? p.count ?? 0) || 0;
  /* Supabase backend: totals come from Store.count (public_counts), numbers only (R4). */
  const count = (p) => base(p) + (typeof Store.count === 'function' ? Number(Store.count('signatures', 'petitionId')[p.id]) || 0 : sigs(p).length);
  const mine = (p) => sigs(p).filter(S.isMine).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
  const isSurvey = (p) => p.kind === 'survey';
  const qs = (p) => (Array.isArray(p.questions) ? p.questions : []).filter((q) => q && q.text && Array.isArray(q.options) && q.options.length);
  const url = (p) => location.origin + location.pathname + `?county=${S.slug}#/act/${encodeURIComponent(p.slug)}`;
  const verb = (p) => (isSurvey(p) ? 'responses' : 'signatures');

  function progress(p, n) {
    const goal = Number(p.goal) || 0;
    const pct = goal ? Math.min(100, Math.round((n / goal) * 100)) : 0;
    return `<div class="a-prog" data-prog>
      <div class="a-prog-nums"><b class="a-count" data-count>${util.fmtNum(n)}</b><span>${verb(p)}${goal ? ` of a ${util.fmtNum(goal)} goal` : ''}</span></div>
      ${goal ? `<div class="a-bar" role="progressbar" aria-label="Progress to goal" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${n}"><i style="width:${pct}%"></i></div>` : ''}
    </div>`;
  }

  /* ---------- homepage block ---------- */
  function card(p) {
    const n = count(p);
    const goal = Number(p.goal) || 0;
    const signed = !!mine(p);
    return `<a class="a-card s-reveal" href="#/act/${encodeURIComponent(p.slug)}">
      <span class="s-kicker">${isSurvey(p) ? 'Survey' : 'Petition'}${p.sample ? ' ' + H.sample() : ''}</span>
      <span class="a-card-title">${esc(p.title)}</span>
      ${p.ask ? `<span class="a-card-ask">${esc(p.ask)}</span>` : ''}
      <span class="a-card-foot">
        ${goal ? `<span class="a-mini"><i style="width:${Math.min(100, Math.round((n / goal) * 100))}%"></i></span>` : ''}
        <span class="a-card-n"><b>${util.fmtNum(n)}</b> ${verb(p)}</span>
        <span class="a-card-go">${signed ? `${ICON.check} You ${isSurvey(p) ? 'answered' : 'signed'} this` : `${isSurvey(p) ? 'Answer' : 'Sign'} ${ICON.arrow}`}</span>
      </span>
    </a>`;
  }
  S.actBlock = () => {
    const list = live();
    if (!list.length) return '';
    return H.zone('local', `<section class="s-wrap a-block" aria-labelledby="act-h">
      <div class="s-sec-head"><h2 id="act-h">Take action</h2><span class="s-sec-note">Add your name and tell us what you think</span>${list.length > 3 ? `<a class="s-sec-link" href="#/act">See all ${list.length} ${ICON.arrow}</a>` : ''}</div>
      <div class="a-grid">${list.slice(0, 3).map(card).join('')}</div>
    </section>`);
  };

  /* ---------- index ---------- */
  S.register('act', (el) => {
    const list = live();
    if (!list.length) return S.pages.notfound(el, { what: 'page' });
    el.innerHTML = `
      <section class="s-pagehead"><div class="s-wrap">
        <p class="s-eyebrow">${STAR(13, 'var(--accent)')} Take action</p>
        <h1>Petitions and surveys from ${esc(T.shortName)}</h1>
        <p class="s-lede">Sign a petition or answer a short survey. The ${esc(T.shortName)} committee reads every response.</p>
      </div></section>
      ${H.zone('local', `<div class="s-wrap a-index"><div class="a-grid">${list.map(card).join('')}</div></div>`)}`;
    return { title: 'Take action', description: `Petitions and surveys from ${T.name}.` };
  });

  /* ---------- petition / survey page ---------- */
  S.register('actItem', (el, route) => {
    const p = bySlug(route.id);
    if (!p) return S.pages.notfound(el, { what: 'petition' });
    const survey = isSurvey(p);
    const closed = p.status === 'closed';
    const questions = qs(p);
    el.innerHTML = `
      <section class="s-pagehead is-split a-head"><div class="s-wrap s-split">
        <div>
          <a class="s-backlink" href="${live().length ? '#/act' : '#/'}">${ICON.back}<span>${live().length ? 'All petitions and surveys' : 'Home'}</span></a>
          <p class="s-eyebrow">${STAR(13, 'var(--accent)')} ${survey ? 'Survey' : 'Petition'}${p.sample ? ' ' + H.sample() : ''}</p>
          <h1>${esc(p.title)}</h1>
          ${p.ask ? `<p class="s-lede a-ask">${esc(p.ask)}</p>` : ''}
          ${progress(p, count(p))}
        </div>
        <div class="s-formcard a-formcard" id="act-card"></div>
      </div></section>`;
    const host = el.querySelector('#act-card');

    const bump = (n) => {
      const b = el.querySelector('[data-count]');
      const bar = el.querySelector('.a-bar i');
      const from = Number(String(b.textContent).replace(/\D/g, '')) || 0;
      const goal = Number(p.goal) || 0;
      if (bar && goal) { bar.style.width = Math.min(100, Math.round((n / goal) * 100)) + '%'; bar.parentElement.setAttribute('aria-valuenow', n); }
      b.classList.remove('is-bump'); void b.offsetWidth; b.classList.add('is-bump');
      if (S.reduced()) { b.textContent = util.fmtNum(n); return; }
      const t0 = performance.now();
      const step = (now) => { const k = Math.min(1, (now - t0) / 600); b.textContent = util.fmtNum(Math.round(from + (n - from) * k)); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    };

    const share = () => {
      const data = { title: p.title, text: p.ask || p.title, url: url(p) };
      if (navigator.share) navigator.share(data).catch(() => { /* person closed the share sheet */ });
      else H.copyLink(data.url, 'Link copied. Paste it in a text or email to a neighbor.');
    };

    function doneHtml(sig, fresh) {
      const when = new Date(sig.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      return `<div class="s-done${fresh ? ' is-fresh' : ''}" role="status">
        <span class="s-done-mark">${ICON.check}</span>
        <h2 tabindex="-1">${fresh ? (sig.name ? `Thank you, ${esc(String(sig.name).split(/\s+/)[0])}.` : 'Thank you.') : survey ? 'You answered this survey' : 'You signed this'}</h2>
        <p>${fresh ? (survey ? `Your answers went to the ${esc(T.shortName)} committee.` : `Your name is on the petition, and the ${esc(T.shortName)} committee will deliver it with every other signature.`) : `You ${survey ? 'answered' : 'signed'} on ${esc(when)}.`}
        ${sig.optIn ? ` We’ll send occasional updates to ${esc(sig.email || sig.phone)}.` : ''}</p>
        <p>Ask two neighbors to ${survey ? 'answer' : 'sign'} too. Every ${survey ? 'response' : 'signature'} makes the case stronger.</p>
        <div class="s-done-actions">
          <button class="s-btn s-btn-primary" type="button" data-a="share">${ICON.share}<span>Share this ${survey ? 'survey' : 'petition'}</span></button>
          ${live().filter((x) => x.id !== p.id).length ? '<a class="s-btn s-btn-quiet" href="#/act">See other petitions</a>' : ''}
        </div>
      </div>`;
    }

    function formHtml() {
      const me = H.me();
      const contactReq = !survey;
      const qHtml = questions.map((q, i) => `<fieldset class="a-q${i === 0 ? ' is-current' : ''}" data-q="${i}">
          <legend class="a-q-text"><span class="a-q-num">Question ${i + 1} of ${questions.length}</span>${esc(q.text)}</legend>
          <div class="a-opts">${q.options.map((o, j) => `<label class="a-opt"><input type="radio" name="q-${esc(q.id || i)}" value="${esc(o)}"${j < 0 ? '' : ''}><span>${esc(o)}</span></label>`).join('')}</div>
          <p class="s-fld-err" data-qerr aria-live="polite"></p>
          <div class="a-q-nav">${i > 0 ? '<button type="button" class="s-btn s-btn-quiet" data-a="prev">Back</button>' : '<span></span>'}<button type="button" class="s-btn s-btn-primary" data-a="next">${i === questions.length - 1 ? 'Next: your details' : 'Next question'}</button></div>
        </fieldset>`).join('');
      const steps = survey ? questions.length + 1 : 1;
      return `<form class="s-form a-form" novalidate data-step="0" data-steps="${steps}">
        ${survey && questions.length ? `<div class="a-steps" aria-hidden="true"><span class="a-steps-bar"><i style="width:${Math.round(100 / steps)}%"></i></span><span class="a-steps-n">Step 1 of ${steps}</span></div>` : ''}
        <h2 class="s-form-h">${survey ? 'Answer the survey' : 'Add your name'}</h2>
        ${qHtml}
        <div class="a-contact${survey && questions.length ? '' : ' is-current'}" data-q="${questions.length}">
          ${survey ? `<p class="a-contact-note">Your details are optional. Add them if you’d like to hear back.</p>` : ''}
          ${H.field({ name: 'name', label: 'Your name', autocomplete: 'name', value: me.name, optional: !contactReq })}
          ${H.field({ name: 'contact', label: 'Email or mobile phone', autocomplete: 'email', value: me.contact, optional: !contactReq })}
          ${H.field({ name: 'zip', label: 'ZIP code', autocomplete: 'postal-code', inputmode: 'numeric', maxlength: 5, value: me.zip, optional: !contactReq })}
          <label class="a-optin"><input type="checkbox" name="optIn"><span>Send me updates from ${esc(T.shortName)}</span></label>
          <p class="s-form-foot">${survey ? 'We use your answers to plan the committee’s work.' : 'Your name and ZIP go on the petition.'} We use your contact only for this ${survey ? 'survey' : 'petition'}, and for updates if you check the box. We never sell it.</p>
          <div class="a-q-nav">${survey && questions.length ? '<button type="button" class="s-btn s-btn-quiet" data-a="prev">Back</button>' : '<span></span>'}
          <button class="s-btn s-btn-accent a-submit" type="submit">${survey ? 'Send my answers' : 'Sign the petition'}</button></div>
        </div>
      </form>`;
    }

    function draw(sig, fresh) {
      if (closed) {
        host.innerHTML = `<div class="a-closed"><h2>This ${survey ? 'survey' : 'petition'} has closed</h2>
          <p>${util.fmtNum(count(p))} people ${survey ? 'answered' : 'signed'}. Thank you to everyone who took part.</p>
          ${live().length ? '<a class="s-btn s-btn-primary" href="#/act">See open petitions</a>' : '<a class="s-btn s-btn-primary" href="#/">Go to the home page</a>'}</div>`;
        return;
      }
      host.innerHTML = sig ? doneHtml(sig, fresh) : formHtml();
      if (sig && fresh) { const h = host.querySelector('h2'); if (h) h.focus({ preventScroll: true }); }
      if (!sig) wire();
    }

    function wire() {
      const form = host.querySelector('form');
      const steps = Number(form.dataset.steps);
      const phone = () => window.matchMedia('(max-width: 639px)').matches;
      const go = (i) => {
        form.dataset.step = String(i);
        form.querySelectorAll('[data-q]').forEach((n) => n.classList.toggle('is-current', Number(n.dataset.q) === i));
        const bar = form.querySelector('.a-steps-bar i'); if (bar) bar.style.width = Math.round(((i + 1) / steps) * 100) + '%';
        const nn = form.querySelector('.a-steps-n'); if (nn) nn.textContent = `Step ${i + 1} of ${steps}`;
        const cur = form.querySelector(`[data-q="${i}"]`);
        if (cur && phone()) { cur.scrollIntoView({ block: 'nearest', behavior: S.reduced() ? 'auto' : 'smooth' }); const f = cur.querySelector('input'); if (f) f.focus({ preventScroll: true }); }
      };
      const answered = (i) => !!form.querySelector(`[data-q="${i}"] input:checked`);
      const markQ = (i, on) => { const e = form.querySelector(`[data-q="${i}"] [data-qerr]`); if (e) e.textContent = on ? 'Pick one answer to continue.' : ''; };
      form.addEventListener('click', (e) => {
        const b = e.target.closest('[data-a]');
        if (!b) return;
        const i = Number(form.dataset.step);
        if (b.dataset.a === 'next') { if (!answered(i)) { markQ(i, true); return; } markQ(i, false); go(i + 1); }
        if (b.dataset.a === 'prev') go(Math.max(0, i - 1));
      });
      form.addEventListener('change', (e) => {
        const q = e.target.closest('.a-q');
        if (!q || e.target.type !== 'radio') return;
        const i = Number(q.dataset.q);
        markQ(i, false);
        if (phone() && Number(form.dataset.step) === i) setTimeout(() => go(i + 1), S.reduced() ? 0 : 260);
      });
      const req = { name: V.name, contact: V.contact, zip: V.zip };
      const opt = { name: (v) => (String(v).trim() ? V.name(v) : ''), contact: (v) => (String(v).trim() ? V.contact(v) : ''), zip: (v) => (String(v).trim() ? V.zip(v) : '') };
      const rules = survey ? opt : req;
      H.liveValidate(form, rules);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const missing = questions.findIndex((_, i) => !answered(i));
        if (missing >= 0) { markQ(missing, true); go(missing); const f = form.querySelector(`[data-q="${missing}"] input`); if (f) f.focus(); return; }
        if (!H.validate(form, rules)) return;
        const raw = form.contact.value.trim();
        const answers = {};
        questions.forEach((q, i) => { const c = form.querySelector(`[data-q="${i}"] input:checked`); answers[q.id || String(i)] = c ? c.value : null; });
        const doc = {
          petitionId: p.id, title: `${survey ? 'Survey' : 'Petition'}: ${p.title}`, name: form.name.value.trim(),
          email: raw.includes('@') ? raw.toLowerCase() : '', phone: raw && !raw.includes('@') ? H.formatContact(raw) : '',
          zip: form.zip.value.trim(), optIn: !!form.optIn.checked, visitorId: S.visitorId(),
        };
        if (survey) doc.answers = answers;
        const saved = S.quietly(() => Store.add('signatures', doc));
        form.dataset.dirty = '0';
        S.toast(survey ? 'Thank you. Your answers are in.' : 'Thank you for signing.', 'ok');
        draw(saved, true);
        bump(count(p));
      });
    }

    host.addEventListener('click', (e) => { if (e.target.closest('[data-a="share"]')) share(); });
    draw(mine(p), false);
    return { title: p.title, description: p.ask || `${survey ? 'Survey' : 'Petition'} from ${T.name}.` };
  });
})();
