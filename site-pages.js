/* site-pages.js: pages of the public county website, registered on window.Site.
   Home (Media Hub layout), news, article, voter guide, events, event, volunteer, join, donate, candidates.
   Saved actions go through Store: rsvps, volunteers, memberships, donations (brief section 8). */
(function () {
  'use strict';
  const S = window.Site;
  if (!S) return;
  const { esc, util, H, C, V, icon: ICON, star: STAR, t: T, slug: SLUG } = S;
  const state = { tab: 'national', newsTab: 'national', kind: 'All' };
  const TABS = [{ id: 'national', label: 'National' }, { id: 'state', label: 'State' }, { id: 'county', label: 'County' }, { id: 'city', label: 'City' }];
  const zoneFor = (tab) => (tab === 'national' || tab === 'state' ? 'network' : 'local');
  const first = (name) => String(name || '').trim().split(/\s+/)[0] || '';
  const plural = (n, one, many) => `${util.fmtNum(n)} ${n === 1 ? one : (many || one + 's')}`;

  /* ================= shared blocks ================= */
  function storyMeta(n) {
    const bits = [];
    if (n.source) bits.push(`<b>${esc(n.source)}</b>`);
    if (n.at) bits.push(esc(S.ago(n.at)));
    return `<span class="s-meta">${bits.join('<span aria-hidden="true"> · </span>')}${n.sample ? ' ' + H.sample() : ''}</span>`;
  }
  function storyBadges(n) {
    const b = [];
    if (n.isNew) b.push('<span class="s-badge s-badge-new">Just in</span>');
    if (n.kind === 'post') b.push(`<span class="s-badge s-badge-local">${STAR(11)} ${esc(T.shortName)}</span>`);
    if (n.pinned) b.push('<span class="s-badge">Pinned</span>');
    if (n.kind === 'push') b.push(`<span class="s-badge s-badge-net">${ICON.net} Statewide desk</span>`);
    return b.join('');
  }
  function storyCard(n, opts) {
    const o = opts || {};
    return `<article class="s-story${o.feature ? ' is-feature' : ''}${n.isNew ? ' is-new' : ''}">
      <a class="s-story-link" href="#/news/${encodeURIComponent(n.id)}">
        <div class="s-story-media">${H.tile(n, { uid: o.uid || '', index: o.index || 0, feature: !!o.feature })}</div>
        <div class="s-story-body">
          <div class="s-story-top"><span class="s-kicker">${esc(n.tag || '')}</span>${storyBadges(n)}</div>
          <h3 class="s-story-title">${esc(n.title)}</h3>
          ${o.summary !== false && n.summary ? `<p class="s-story-sum">${esc(n.summary)}</p>` : ''}
          ${storyMeta(n)}
        </div>
      </a>
    </article>`;
  }
  /* Mark stories that arrived since the page was last drawn, so they animate in. */
  const seen = new Set();
  let seenReady = false;
  function markNew(items) {
    items.forEach((n) => { if (seenReady && !seen.has(n.id) && (n.kind === 'post' || n.kind === 'push')) n.isNew = true; });
    items.forEach((n) => seen.add(n.id));
    return items;
  }
  function primeSeen() { if (!seenReady) { C.allNews().forEach((n) => seen.add(n.id)); seenReady = true; } }

  function feedHtml(tab, limit) {
    const items = markNew(C.news(tab));
    if (!items.length) return `<div class="s-empty">No stories in this section yet. Check back later today.</div>`;
    const list = items.slice(0, limit || items.length);
    const out = [];
    const netAd = C.networkAd('IN_FEED');
    const locAd = C.localAd('IN_FEED');
    list.forEach((n, i) => {
      out.push(storyCard(n, { feature: i === 0, uid: tab, index: i }));
      if (i === 2 && netAd) out.push(H.zone('network', H.adSlot(netAd, 's-ad-feed')));
      if (i === 5 && locAd) out.push(H.zone('local', H.adSlot(locAd, 's-ad-feed')));
    });
    return out.join('');
  }
  function tabsHtml(cur, act) {
    return `<div class="s-tabs" role="tablist" aria-label="News by level">${TABS.map((x) =>
      `<button class="s-tab${x.id === cur ? ' is-on' : ''}" role="tab" id="tab-${act}-${x.id}" aria-selected="${x.id === cur}" aria-controls="panel-${act}" tabindex="${x.id === cur ? 0 : -1}" data-act="${act}" data-tab="${x.id}">${x.label}</button>`).join('')}</div>`;
  }
  function bindTabs(root, act, get, set, redraw) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest(`[data-act="${act}"]`);
      if (!b) return;
      set(b.dataset.tab); redraw();
      const nb = root.querySelector(`[data-act="${act}"][data-tab="${b.dataset.tab}"]`); if (nb) nb.focus({ preventScroll: true });
    });
    root.addEventListener('keydown', (e) => {
      const b = e.target.closest(`[data-act="${act}"]`);
      if (!b || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
      e.preventDefault();
      const i = TABS.findIndex((x) => x.id === get());
      const n = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id;
      set(n); redraw();
      const nb = root.querySelector(`[data-act="${act}"][data-tab="${n}"]`); if (nb) nb.focus({ preventScroll: true });
    });
  }

  /* ----- events: compact row, RSVP sheet ----- */
  function goingLine(ev) {
    const cap = ev.capacity ? ` of ${util.fmtNum(ev.capacity)} spots` : '';
    return `<span class="s-going">${ICON.people}<b>${util.fmtNum(ev.going)}</b> going${cap}</span>`;
  }
  /* Small "<Candidate> campaign" tag for events a campaign proposed and the board listed. */
  function campTag(ev) {
    const c = C.campaignOf(ev);
    return c ? `<a class="s-camp-tag" href="${esc(c.href)}"${S.framed ? ' target="_top"' : ''}>${esc(c.name)} campaign</a>` : '';
  }
  function rsvpButton(ev, cls) {
    if (ev.myRsvp) return `<a class="s-btn s-btn-sm s-btn-going ${cls || ''}" href="#/events/${encodeURIComponent(ev.id)}">${ICON.check}<span>You’re going</span></a>`;
    if (ev.full) return `<span class="s-btn s-btn-sm s-btn-disabled ${cls || ''}" aria-disabled="true">Event is full</span>`;
    return `<button class="s-btn s-btn-sm s-btn-primary ${cls || ''}" data-act="rsvp" data-id="${esc(ev.id)}">RSVP</button>`;
  }
  function eventRow(ev) {
    const d = S.dateParts(ev.date);
    return `<div class="s-erow">
      ${H.dateBlock(ev.date)}
      <div class="s-erow-info">
        <span class="s-kicker">${esc(ev.kind || 'Event')}${ev.sample ? ' ' + H.sample() : ''}${campTag(ev)}</span>
        <a class="s-erow-title" href="#/events/${encodeURIComponent(ev.id)}">${esc(ev.title)}</a>
        <span class="s-erow-sub">${esc(d.dow)} · ${esc(ev.time || '')} · ${esc(S.C.city(ev))}</span>
        <div class="s-erow-act">${rsvpButton(ev)}${goingLine(ev)}</div>
      </div>
    </div>`;
  }

  function rsvpFormHtml(ev) {
    const me = H.me();
    return `<form class="s-form s-rsvp-form" novalidate data-ev="${esc(ev.id)}">
      ${H.field({ name: 'name', label: 'Your name', autocomplete: 'name', value: me.name })}
      ${H.field({ name: 'contact', label: 'Email or mobile phone', autocomplete: 'email', value: me.contact, hint: 'We use this only to reach you about this event.' })}
      <div class="s-fld">
        <span class="s-fld-label" id="guests-l-${esc(ev.id)}">Guests coming with you</span>
        <div class="s-stepper" role="group" aria-labelledby="guests-l-${esc(ev.id)}">
          <button type="button" class="s-step" data-step="-1" aria-label="One fewer guest">${ICON.minus}</button>
          <output class="s-step-val" name="guests" aria-live="polite">0</output>
          <button type="button" class="s-step" data-step="1" aria-label="One more guest">${ICON.plus}</button>
          <span class="s-step-note">Up to 3</span>
        </div>
      </div>
      <button class="s-btn s-btn-primary s-btn-block" type="submit">RSVP for ${esc(S.dateParts(ev.date).long)}</button>
    </form>`;
  }
  function goingHtml(ev, r, fresh) {
    const guests = Number(r.guests) || 0;
    return `<div class="s-done${fresh ? ' is-fresh' : ''}" role="status">
      <span class="s-done-mark">${ICON.check}</span>
      <h3>${fresh ? `You’re going, ${esc(first(r.name))}.` : 'You’re going'}</h3>
      <p>Your RSVP is saved for ${esc(r.name)}${guests ? ` plus ${plural(guests, 'guest')}` : ''}. The ${esc(T.shortName)} events team checks names at the door, and they’ll contact you at ${esc(r.contact)} if plans change.</p>
      <div class="s-done-actions">
        <button class="s-btn s-btn-primary" type="button" data-act="ics" data-id="${esc(ev.id)}">${ICON.cal}<span>Add to calendar</span></button>
        <button class="s-btn s-btn-quiet" type="button" data-act="cancel-rsvp" data-rid="${esc(r.id)}">Cancel my RSVP</button>
      </div>
    </div>`;
  }
  /* Wires an RSVP form or going state inside root. onDone redraws the host. */
  function bindRsvp(root, ev, onDone) {
    root.addEventListener('click', (e) => {
      const st = e.target.closest('[data-step]');
      if (st) {
        const out = root.querySelector('.s-step-val');
        const v = Math.max(0, Math.min(3, (Number(out.value || out.textContent) || 0) + Number(st.dataset.step)));
        out.value = v; out.textContent = v;
        root.querySelectorAll('[data-step]').forEach((b) => { b.disabled = (b.dataset.step === '-1' && v === 0) || (b.dataset.step === '1' && v === 3); });
        return;
      }
      const ics = e.target.closest('[data-act="ics"]');
      if (ics) { H.ics(ev); S.toast('Calendar file downloaded. Open it to add the event.', 'ok'); return; }
      const cx = e.target.closest('[data-act="cancel-rsvp"]');
      if (cx) {
        S.quietly(() => Store.remove('rsvps', cx.dataset.rid));
        S.toast('Your RSVP is canceled. Your spot is open for a neighbor.', 'info');
        onDone(null);
      }
    });
    const minus = root.querySelector('[data-step="-1"]'); if (minus) minus.disabled = true;
    const form = root.querySelector('form.s-rsvp-form');
    if (!form) return;
    const rules = { name: V.name, contact: V.contact };
    H.liveValidate(form, rules);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!H.validate(form, rules)) return;
      const out = form.querySelector('.s-step-val');
      const doc = {
        eventId: ev.id, title: ev.title, date: ev.date, time: ev.time || '', location: ev.location || '',
        name: form.name.value.trim(), contact: H.formatContact(form.contact.value), guests: Number(out.value || out.textContent) || 0,
        visitorId: S.visitorId(),
      };
      const saved = S.quietly(() => Store.add('rsvps', doc));
      form.dataset.dirty = '0';
      S.toast(`RSVP saved for ${ev.title}.`, 'ok');
      onDone(saved);
    });
  }
  function openRsvp(ev, after) {
    const m = S.modal({ title: ev.title, actions: false, html: `<p class="s-modal-lede">${esc(S.dateParts(ev.date).full)} · ${esc(ev.time || '')}<br>${esc(ev.location || '')}</p><div class="s-rsvp-host"></div>` });
    const draw = (saved) => {
      const fresh = S.C.findEvent(ev.id) || ev;
      const old = m.body.querySelector('.s-rsvp-host');
      const h2 = document.createElement('div');
      h2.className = 's-rsvp-host';
      h2.innerHTML = saved ? goingHtml(fresh, saved, true) : rsvpFormHtml(fresh);
      old.replaceWith(h2);
      bindRsvp(h2, fresh, (r) => { if (r) draw(r); else m.close(); if (after) after(); });
      const f = h2.querySelector('input'); if (f && !saved) f.focus({ preventScroll: true });
      if (saved) { const b = h2.querySelector('[data-act="ics"]'); if (b) b.focus(); }
    };
    draw(null);
  }
  /* Delegated RSVP buttons inside a page */
  function bindRsvpButtons(root) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act="rsvp"]');
      if (!b) return;
      const ev = C.findEvent(b.dataset.id);
      if (ev) openRsvp(ev, () => S.rerender());
    });
  }

  /* ----- video ----- */
  const PALETTE = [['#1E2A44', '#F2C14E'], ['#3B1C32', '#FF9F80'], ['#0F3B36', '#7FD8BE'], ['#2B2D42', '#FF5A5F'], ['#1D3557', '#A8DADC'],
    ['#3D2A1A', '#F4A259'], ['#26313F', '#FFE08A'], ['#2E1F47', '#C9B2FF'], ['#123524', '#B5E48C'], ['#43202B', '#FFC2B4'],
    ['#16324F', '#FF8C42'], ['#2A2A2A', '#FFD166'], ['#0E2F44', '#62D2FF'], ['#3A2E12', '#E9D58B'], ['#301934', '#F7A8D8'], ['#1B3B2F', '#F2E863'], ['#2C1A12', '#FFB703']];
  function chColors(name) {
    const N = window.NEWSROOM || {};
    const idx = (N.channels || []).findIndex((c) => c.name === name);
    const i = idx >= 0 ? idx : Math.floor(util.seeded('ch:' + name)() * PALETTE.length);
    return PALETTE[i % PALETTE.length];
  }
  /* The tile carries the channel name; the video title appears once, below the tile. */
  function tileText(v) {
    return `<em>${esc(v.channel || 'Video')}</em>${esc(v.topic || '')}`;
  }
  function videoTile(v, big) {
    const [bg, ac] = chColors(v.channel);
    return `<div class="s-vtile${big ? ' is-big' : ''}" style="--c-bg:${bg};--c-ac:${ac}">
      <span class="s-vtile-chip">Watch</span>
      <div class="s-vtile-text" aria-hidden="true">${tileText(v)}</div>
      <span class="s-vtile-play">${ICON.play}</span>
    </div>`;
  }
  function videoCard(v, opts) {
    const o = opts || {};
    const [bg, ac] = chColors(v.channel);
    return `<button class="s-vcard${o.big ? ' is-big' : ''}" type="button" data-act="video" data-id="${esc(v.id)}" style="--c-bg:${bg};--c-ac:${ac}">
      ${videoTile(v, o.big)}
      <span class="s-vinfo"><span class="s-vav" aria-hidden="true">${esc(util.initials(v.channel))}</span>
        <span class="s-vtext"><span class="s-vtitle">${esc(v.title)}</span><span class="s-vchan">${esc(v.channel)}</span></span></span>
    </button>`;
  }
  function openVideo(id) {
    const v = C.videos().find((x) => x.id === id);
    if (!v) return;
    const src = v.videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.videoId)}?autoplay=1&rel=0&modestbranding=1` : '';
    S.modal({
      title: v.title, wide: true,
      html: `<div class="s-player">${src ? `<iframe src="${esc(src)}" title="${esc(v.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>` : videoTile(v, true)}</div>
        <div class="s-player-meta"><span><b>${esc(v.channel)}</b>${v.topic ? ' · ' + esc(v.topic) : ''}</span>
        <a href="${esc(v.url)}" target="_blank" rel="noopener">Watch on YouTube ${ICON.out}</a></div>
        <p class="s-player-note">The video plays here from YouTube. Some channels only allow playback on YouTube itself; use the link if it won’t start.</p>`,
      actions: false,
    });
  }
  S.H.videoCard = videoCard;
  S.H.videoTile = videoTile;
  S.H.chColors = chColors;
  S.H.tileText = tileText;
  S.openVideo = openVideo;
  S.openRsvp = openRsvp;
  S.eventRow = eventRow;
  S.storyCard = storyCard;
  S.rsvpButton = rsvpButton;

  function cmtePanel() {
    const mtg = T.meeting;
    const next = C.events()[0];
    return `<section class="s-cmte" aria-labelledby="cmte-h">
      <div class="s-cmte-head">
        <span class="s-eyebrow">${STAR(13, 'var(--accent)')} Your county party</span>
        <h2 id="cmte-h">${esc(T.shortName)} this month</h2>
      </div>
      ${mtg ? `<div class="s-cmte-item">
        ${H.dateBlock(mtg.date)}
        <div class="s-cmte-info">
          <span class="s-kicker">Central committee meeting ${H.sample()}</span>
          <span class="s-cmte-title">${esc(mtg.title)}</span>
          <span class="s-cmte-sub">${esc(S.dateParts(mtg.date).long)} · ${esc(mtg.time)} · ${esc(mtg.provider || '')} · Open to the public</span>
          <div class="s-cmte-act"><button class="s-btn s-btn-sm" data-act="agenda">See the agenda</button><button class="s-btn s-btn-sm s-btn-quiet" data-act="mtg-ics">${ICON.cal}<span>Add to calendar</span></button></div>
        </div>
      </div>` : ''}
      ${next ? `<div class="s-cmte-item">
        ${H.dateBlock(next.date)}
        <div class="s-cmte-info">
          <span class="s-kicker">Next event · ${esc(next.kind || 'Event')}${next.sample ? ' ' + H.sample() : ''}</span>
          <a class="s-cmte-title" href="#/events/${encodeURIComponent(next.id)}">${esc(next.title)}</a>
          <span class="s-cmte-sub">${esc(S.dateParts(next.date).long)} · ${esc(next.time || '')} · ${esc(C.city(next))}</span>
          <div class="s-cmte-act">${rsvpButton(next)}${goingLine(next)}</div>
        </div>
      </div>` : ''}
      <div class="s-cmte-cta">
        <a class="s-btn s-btn-primary" href="#/volunteer">Volunteer</a>
        <a class="s-btn s-btn-accent" href="#/donate">Donate</a>
        <a class="s-cmte-join" href="#/join">Become a member ${ICON.arrow}</a>
      </div>
    </section>`;
  }
  function bindCmte(root) {
    root.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act="agenda"], [data-act="mtg-ics"]');
      if (!a || !T.meeting) return;
      const m = T.meeting;
      const ev = { id: m.id, title: `${T.shortName} ${m.title}`, date: m.date, time: m.time, location: `${m.provider || 'Online'} (link sent to members)` };
      if (a.dataset.act === 'mtg-ics') { H.ics(ev); S.toast('Calendar file downloaded. Open it to add the meeting.', 'ok'); return; }
      S.modal({
        title: `Agenda: ${m.title}`,
        html: `<p class="s-modal-lede">${esc(S.dateParts(m.date).full)} · ${esc(m.time)} · ${esc(m.provider || '')}. Members of the public are welcome to attend. ${H.sample()}</p>
          <ol class="s-agenda">${(m.agenda || []).map((x) => `<li>${esc(S.clean(x).replace('Call to order, roll call and quorum', 'Call to order and roll call'))}</li>`).join('')}</ol>`,
        actions: [{ label: 'Add to calendar', onClick: () => { H.ics(ev); S.toast('Calendar file downloaded. Open it to add the meeting.', 'ok'); return false; } }, { label: 'Close', primary: true }],
      });
    });
  }

  function candStrip() {
    const cands = C.candidates();
    if (!cands.length) return `<div class="s-empty">Endorsements are announced after the next central committee meeting.</div>`;
    return `<div class="s-cand-strip">${cands.map((c) => { const href = C.campaignHref(c); return `<a class="s-cand-card s-reveal" href="${href ? esc(href) : '#/candidates'}"${href && S.framed ? ' target="_top"' : ''} data-cand="${esc(c.id)}">
        <span class="s-cand-photo">${c.photo ? `<img src="${esc(c.photo)}" alt="" loading="lazy" style="object-position:${esc(c.photoPos || '50% 25%')}">` : util.avatar(c.name, 200)}</span>
        <span class="s-cand-body"><span class="s-kicker">${esc(c.office)}${c.district ? ' · ' + esc(c.district) : ''}</span>
        <span class="s-cand-name">${esc(c.name)}</span><span class="s-cand-slogan">${esc(c.slogan || '')}</span>
        <span class="s-cand-tags">${c.status === 'ENDORSED' ? '<span class="s-badge s-badge-local">Endorsed</span>' : ''}${href ? '<span class="s-badge">Campaign site</span>' : ''}${c.sample ? H.sample() : ''}</span></span>
      </a>`; }).join('')}</div>`;
  }

  /* ================= HOME (Media Hub layout) ================= */
  S.register('home', (el, route) => {
    if (C.layout() === 'newsroom' && S.pages.newsroomHome) return S.pages.newsroomHome(el, route);
    primeSeen();
    const settings = C.settings();
    const g = C.guide();
    const events = C.events().slice(0, 3);
    const headerAd = C.networkAd('HEADER_BANNER');
    const sideTop = C.localAd('SIDEBAR_TOP');
    const sideBottom = C.networkAd('SIDEBAR_BOTTOM');
    const vids = C.videos();
    const feat = vids[0];
    const tabZone = zoneFor(state.tab);
    const county = /county$/i.test(T.county || '') ? T.county : (T.county || '') + ' County';

    el.innerHTML = `
      ${H.zone('local', `<section class="s-hero" aria-labelledby="hero-h">
        <div class="s-hero-art" aria-hidden="true"></div>
        <div class="s-wrap s-hero-in">
          <p class="s-eyebrow s-eyebrow-light">${STAR(14, 'var(--accent)')} ${esc(T.name)}</p>
          <h1 id="hero-h" class="s-display">${esc(C.tagline())}</h1>
          ${settings.heroNote ? `<p class="s-hero-note">${esc(settings.heroNote)}</p>` : ''}
        </div>
      </section>`, 'id="z-hero"')}

      <div class="s-wrap s-front${g ? '' : ' is-single'}">
        ${g && App.voterGuide ? H.zone('local', App.voterGuide.teaser(T), 'id="z-guide"') : ''}
        ${H.zone('local', cmtePanel(), 'id="z-cmte"')}
      </div>

      ${headerAd ? `<div class="s-wrap s-banner-row">${H.zone('network', H.adSlot(headerAd, 's-ad-banner'), 'id="z-banner"')}</div>` : ''}

      ${S.actBlock ? S.actBlock() : ''}

      <div class="s-wrap s-hub">
        <div class="s-hub-main">
          <div class="s-zone s-newsblock" data-zone="${tabZone}" id="news">
            ${H.zoneTag(tabZone)}
            <div class="s-sec-head"><h2>Latest news</h2><span class="s-sec-note">Newest stories first</span></div>
            ${tabsHtml(state.tab, 'tab')}
            <div class="s-feed" id="panel-tab" role="tabpanel" aria-labelledby="tab-tab-${state.tab}">${feedHtml(state.tab, 7)}</div>
            <a class="s-more-link" href="#/news" data-newstab="${state.tab}">See all ${esc(TABS.find((x) => x.id === state.tab).label.toLowerCase())} news ${ICON.arrow}</a>
          </div>
        </div>
        <aside class="s-hub-side" aria-label="Events and candidates">
          ${sideTop ? H.zone('local', H.adSlot(sideTop, 's-ad-side')) : ''}
          ${H.zone('local', `<section class="s-widget" aria-labelledby="w-ev">
            <div class="s-widget-head"><h2 id="w-ev">Upcoming events</h2><a href="#/events">See the map ${ICON.arrow}</a></div>
            ${events.length ? events.map(eventRow).join('') : '<div class="s-empty">No events on the calendar right now. New ones are posted every week.</div>'}
          </section>`, 'id="z-events"')}
          ${H.zone('local', `<section class="s-widget" aria-labelledby="w-c">
            <div class="s-widget-head"><h2 id="w-c">Endorsed candidates</h2><a href="#/candidates">All ${ICON.arrow}</a></div>
            ${C.candidates().map((c) => `<a class="s-wcand" href="${C.campaignHref(c) ? esc(C.campaignHref(c)) : '#/candidates'}"${C.campaignHref(c) && S.framed ? ' target="_top"' : ''}>${util.candidatePhoto(c, 48, { shape: 'circle' })}<span><span class="s-wcand-name">${esc(c.name)}</span><span class="s-wcand-office">${esc(c.office)}${c.district ? ', ' + esc(c.district) : ''}</span></span></a>`).join('') || '<div class="s-empty">Endorsements are announced after the next central committee meeting.</div>'}
            ${C.candidates().some((c) => c.sample) ? `<p class="s-widget-foot">${H.sample()} Candidates marked as samples are examples.</p>` : ''}
          </section>`)}
          ${sideBottom ? H.zone('network', H.adSlot(sideBottom, 's-ad-side')) : ''}
        </aside>
      </div>

      ${feat ? H.zone('network', `<section class="s-videohub" aria-labelledby="vh-h" id="video">
        <div class="s-wrap">
          <div class="s-sec-head is-dark"><h2 id="vh-h">Video Hub</h2><span class="s-sec-note">Every video plays right on this page</span></div>
          <div class="s-vh-grid">
            <div class="s-vh-feature s-reveal">${videoCard(feat, { big: true })}</div>
            <div class="s-vh-list">${vids.slice(1, 7).map((v) => `<div class="s-reveal">${videoCard(v)}</div>`).join('')}</div>
          </div>
        </div>
      </section>`, 'id="z-video"') : ''}

      ${H.zone('local', `<section class="s-involve s-wrap" aria-labelledby="inv-h">
        <div class="s-sec-head"><h2 id="inv-h">Pitch in before November 3</h2></div>
        <div class="s-involve-grid">
          <a class="s-involve-card is-brand s-reveal" href="#/volunteer"><span class="s-involve-k">Volunteer</span><span class="s-involve-t">Walk your precinct or make calls from home</span><span class="s-involve-go">Pick a shift ${ICON.arrow}</span></a>
          <a class="s-involve-card is-ink s-reveal" href="#/join"><span class="s-involve-k">Join</span><span class="s-involve-t">Become a member of ${esc(T.shortName)}</span><span class="s-involve-go">Apply in two minutes ${ICON.arrow}</span></a>
          <a class="s-involve-card is-accent s-reveal" href="#/donate"><span class="s-involve-k">Donate</span><span class="s-involve-t">Fund walk lists and printed voter guides in ${esc(county)}</span><span class="s-involve-go">Give now ${ICON.arrow}</span></a>
        </div>
      </section>`)}

      ${H.zone('local', `<section class="s-cands s-wrap" aria-labelledby="cands-h">
        <div class="s-sec-head"><h2 id="cands-h">Our local candidates</h2><a class="s-sec-link" href="#/candidates">Meet every candidate ${ICON.arrow}</a></div>
        ${candStrip()}
      </section>`)}
    `;

    const redrawFeed = () => {
      const block = el.querySelector('#news');
      const kind = zoneFor(state.tab);
      block.dataset.zone = kind;
      block.querySelector(':scope > .s-zone-tag').outerHTML = H.zoneTag(kind);
      block.querySelector('.s-tabs').outerHTML = tabsHtml(state.tab, 'tab');
      const panel = block.querySelector('.s-feed');
      panel.setAttribute('aria-labelledby', 'tab-tab-' + state.tab);
      panel.innerHTML = feedHtml(state.tab, 7);
      panel.classList.remove('is-swap'); void panel.offsetWidth; panel.classList.add('is-swap');
      const more = block.querySelector('.s-more-link');
      more.innerHTML = `See all ${esc(TABS.find((x) => x.id === state.tab).label.toLowerCase())} news ${ICON.arrow}`;
      more.dataset.newstab = state.tab;
      S.zones.count();
    };
    bindTabs(el, 'tab', () => state.tab, (v) => { state.tab = v; }, redrawFeed);
    el.addEventListener('click', (e) => {
      const m = e.target.closest('[data-newstab]'); if (m) state.newsTab = m.dataset.newstab;
      const v = e.target.closest('[data-act="video"]'); if (v) openVideo(v.dataset.id);
    });
    bindRsvpButtons(el);
    bindCmte(el);
    return { title: '', description: `${T.name}: ${C.tagline()} News, the voter guide, events and endorsed candidates for ${county}.` };
  });

  /* ================= NEWS INDEX ================= */
  S.register('news', (el) => {
    primeSeen();
    const z = zoneFor(state.newsTab);
    el.innerHTML = `
      <section class="s-pagehead"><div class="s-wrap">
        <p class="s-eyebrow">${STAR(13, 'var(--accent)')} ${esc(T.shortName)} News</p>
        <h1>News for ${esc(T.county ? (/county$/i.test(T.county) ? T.county : T.county + ' County') : T.shortName)} voters</h1>
        <p class="s-lede">National and state headlines come from trusted outlets; each story links to the full article. County news includes posts from the ${esc(T.shortName)} committee.</p>
      </div></section>
      <div class="s-wrap s-newspage">
        <div class="s-zone s-newsblock" data-zone="${z}" id="news-all">${H.zoneTag(z)}
          ${tabsHtml(state.newsTab, 'ntab')}
          <div class="s-feed s-feed-grid" id="panel-ntab" role="tabpanel" aria-labelledby="tab-ntab-${state.newsTab}">${feedHtml(state.newsTab)}</div>
        </div>
      </div>`;
    const redraw = () => {
      const block = el.querySelector('#news-all');
      const k = zoneFor(state.newsTab);
      block.dataset.zone = k;
      block.querySelector(':scope > .s-zone-tag').outerHTML = H.zoneTag(k);
      block.querySelector('.s-tabs').outerHTML = tabsHtml(state.newsTab, 'ntab');
      const p = block.querySelector('.s-feed');
      p.setAttribute('aria-labelledby', 'tab-ntab-' + state.newsTab);
      p.innerHTML = feedHtml(state.newsTab);
      p.classList.remove('is-swap'); void p.offsetWidth; p.classList.add('is-swap');
      S.zones.count();
    };
    bindTabs(el, 'ntab', () => state.newsTab, (v) => { state.newsTab = v; }, redraw);
    return { title: 'News', description: `National, state, county and city news for ${T.county} voters from ${T.name}.` };
  });

  /* ================= ARTICLE ================= */
  S.register('article', (el, route) => {
    const n = C.findNews(route.id);
    if (!n) return S.pages.notfound(el, { path: 'news/' + route.id, what: 'story' });
    const zone = n.network || n.alert ? 'network' : 'local';
    const related = C.news(n.tab || 'state').filter((x) => x.id !== n.id).slice(0, 3);
    const paras = String(n.body || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    el.innerHTML = `
      <article class="s-article">
        <div class="s-wrap s-article-head">
          <a class="s-backlink" href="#/news">${ICON.back}<span>All news</span></a>
          <div class="s-story-top"><span class="s-kicker">${esc(n.tag || '')}</span>${storyBadges(n)}${n.alert ? `<span class="s-badge s-badge-alert">${ICON.lock} Statewide alert</span>` : ''}</div>
          <h1 class="s-article-title">${esc(n.title)}</h1>
          ${storyMeta(n)}
        </div>
        <div class="s-wrap s-article-grid">
          ${H.zone(zone, `<div class="s-article-main">
            <div class="s-article-art">${H.tile(n, { uid: 'art', tone: n.alert ? 'accent' : '' })}</div>
            ${n.summary ? `<p class="s-article-lede">${esc(n.summary)}</p>` : ''}
            ${paras.map((p) => `<p>${esc(p)}</p>`).join('')}
            ${n.url ? `<a class="s-btn s-btn-primary s-readmore" href="${esc(n.url)}" target="_blank" rel="noopener">Read the full story at ${esc(n.urlLabel || n.source)} ${ICON.out}</a>` : ''}
            ${n.sample ? `<p class="s-note">${H.sample()} This is a sample story. ${n.alert ? 'Master Network sends real statewide alerts to every county site.' : `${esc(T.shortName)} replaces sample stories with its own posts from the Committee Portal.`}</p>` : ''}
            ${n.kind === 'post' ? `<p class="s-note">Posted by the ${esc(T.shortName)} committee.</p>` : ''}
            <div class="s-article-share"><button class="s-btn s-btn-quiet" type="button" data-act="copy">${ICON.share}<span>Copy link</span></button></div>
          </div>`)}
          <aside class="s-article-side" aria-label="More stories">
            <h2 class="s-side-h">More ${esc(TABS.find((x) => x.id === n.tab) ? TABS.find((x) => x.id === n.tab).label.toLowerCase() : '')} news</h2>
            ${related.map((r, i) => storyCard(r, { summary: false, uid: 'rel', index: i + 1 })).join('') || '<div class="s-empty">No other stories in this section yet.</div>'}
          </aside>
        </div>
      </article>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="copy"]')) H.copyLink(location.href, 'Link to this story copied.');
    });
    return { title: n.title, description: n.summary };
  });

  /* ================= VOTER GUIDE ================= */
  S.register('guide', (el) => {
    const g = C.guide();
    if (!g || !App.voterGuide || !App.voterGuide.page) {
      el.innerHTML = `<section class="s-wrap s-empty-page"><h1>Voter guide</h1><p>${esc(T.shortName)}’s voter guide is published after the central committee votes on endorsements.</p><a class="s-btn s-btn-primary" href="#/">Go to the home page</a></section>`;
      return { title: 'Voter guide' };
    }
    el.innerHTML = H.zone('local', '<div class="s-guide-host"></div>', 'id="z-guide-page"');
    const res = App.voterGuide.page(el.querySelector('.s-guide-host'), T) || {};
    return { title: `${g.election} Voter Guide`, description: `${T.shortName}’s endorsements for the ${g.election}: every candidate and how to vote on all ${g.measures.length} measures.`, cleanup: res.cleanup };
  });

  /* ================= EVENTS ================= */
  let mapState = null;
  function destroyMap() { if (mapState && mapState.map) { try { mapState.map.remove(); } catch (e) { /* ignore */ } } mapState = null; }

  S.register('events', (el) => {
    const all = C.events();
    const kinds = ['All'].concat(Array.from(new Set(all.map((e) => e.kind || 'Event'))));
    if (!kinds.includes(state.kind)) state.kind = 'All';
    const list = () => C.events().filter((e) => state.kind === 'All' || (e.kind || 'Event') === state.kind);
    const anySample = all.some((e) => e.sample);
    el.innerHTML = `
      <section class="s-pagehead"><div class="s-wrap">
        <p class="s-eyebrow">${STAR(13, 'var(--accent)')} Events</p>
        <h1>Meet your neighbors at ${esc(T.shortName)} events</h1>
        <p class="s-lede">Phone banks, canvass launches and candidate forums. RSVP so the team knows how many people to expect.</p>
      </div></section>
      ${H.zone('local', `<div class="s-wrap s-events">
        <div class="s-events-list">
          <div class="s-chips" role="toolbar" aria-label="Filter events by type">${kinds.map((k) => `<button class="s-chip${k === state.kind ? ' is-on' : ''}" data-kind="${esc(k)}" aria-pressed="${k === state.kind}">${esc(k)}</button>`).join('')}</div>
          <div class="s-ecards" aria-live="polite"></div>
        </div>
        <div class="s-events-map">
          <div class="s-map" id="s-map" role="region" aria-label="Map of upcoming events"><div class="s-map-loading">Loading the map…</div></div>
          <p class="s-map-note">${SLUG === 'demo' ? 'Demo County is a sample county, so its events are placed in a sample area near Visalia.' : `Pins show each event’s city in ${esc(T.county)} County.`}${anySample ? ' ' + H.sample('Sample events') : ''}</p>
        </div>
      </div>`, 'id="z-events-page"')}`;

    const cards = el.querySelector('.s-ecards');
    const drawList = () => {
      const items = list();
      cards.innerHTML = items.length ? items.map((ev) => {
        const d = S.dateParts(ev.date);
        return `<article class="s-ecard s-reveal${ev.myRsvp ? ' is-going' : ''}" data-ev="${esc(ev.id)}" tabindex="-1">
          ${H.dateBlock(ev.date, 'is-big')}
          <div class="s-ecard-body">
            <span class="s-kicker">${esc(ev.kind || 'Event')}${ev.sample ? ' ' + H.sample() : ''}${campTag(ev)}</span>
            <h2 class="s-ecard-title"><a href="#/events/${encodeURIComponent(ev.id)}">${esc(ev.title)}</a></h2>
            <p class="s-ecard-facts"><span>${ICON.clock}${esc(d.long)} · ${esc(ev.time || '')}</span><span>${ICON.pin}${esc(ev.location || '')}</span></p>
            <div class="s-ecard-act">${rsvpButton(ev)}<a class="s-btn s-btn-sm s-btn-quiet" href="#/events/${encodeURIComponent(ev.id)}">Details</a>${goingLine(ev)}</div>
          </div>
        </article>`;
      }).join('') : `<div class="s-empty">No ${state.kind === 'All' ? '' : esc(state.kind.toLowerCase()) + ' '}events on the calendar right now. New ones are posted every week.</div>`;
      H.reveal(cards);
      syncMarkers();
    };
    const syncMarkers = () => {
      if (!mapState || !mapState.L) return;
      const { L, map, layer } = mapState;
      layer.clearLayers();
      mapState.markers = {};
      const items = list();
      items.forEach((ev) => {
        const m = L.marker([ev.lat, ev.lng], { icon: H.pin(L, ev, false), title: ev.title, keyboard: true, riseOnHover: true });
        m.bindPopup(`<div class="s-pop"><span class="s-kicker">${esc(ev.kind || 'Event')}</span><b>${esc(ev.title)}</b><span>${esc(S.dateParts(ev.date).long)} · ${esc(ev.time || '')}</span><a href="#/events/${encodeURIComponent(ev.id)}">See details and RSVP</a></div>`, { closeButton: true, autoPanPadding: [24, 24] });
        m.on('click', () => highlight(ev.id, false));
        m.addTo(layer);
        mapState.markers[ev.id] = m;
      });
      if (items.length) {
        const b = L.latLngBounds(items.map((e) => [e.lat, e.lng]));
        map.fitBounds(b, { padding: [48, 48], maxZoom: 13, animate: false });
      } else map.setView(C.center(), 10);
    };
    let activeId = null;
    const highlight = (id, fly) => {
      if (!mapState) return;
      const ev = C.findEvent(id);
      if (!ev) return;
      Object.keys(mapState.markers || {}).forEach((k) => {
        const m = mapState.markers[k];
        const e2 = C.findEvent(k);
        if (e2) m.setIcon(H.pin(mapState.L, e2, k === id));
        if (k === id) m.setZIndexOffset(1000); else m.setZIndexOffset(0);
      });
      el.querySelectorAll('.s-ecard').forEach((c) => c.classList.toggle('is-active', c.dataset.ev === id));
      if (fly && activeId !== id) {
        if (S.reduced()) mapState.map.setView([ev.lat, ev.lng], 13);
        else mapState.map.flyTo([ev.lat, ev.lng], 13, { duration: 0.8 });
      }
      activeId = id;
    };

    el.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-kind]');
      if (chip) {
        state.kind = chip.dataset.kind;
        el.querySelectorAll('[data-kind]').forEach((b) => { const on = b.dataset.kind === state.kind; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
        drawList();
        return;
      }
      const card = e.target.closest('.s-ecard');
      if (card && !e.target.closest('a,button')) { highlight(card.dataset.ev, true); const m = mapState && mapState.markers[card.dataset.ev]; if (m) m.openPopup(); }
    });
    el.addEventListener('mouseover', (e) => { const card = e.target.closest('.s-ecard'); if (card && window.matchMedia('(hover:hover)').matches) highlight(card.dataset.ev, false); });
    bindRsvpButtons(el);
    drawList();

    return {
      title: 'Events',
      description: `Upcoming ${T.shortName} events: phone banks, canvass launches and candidate forums in ${T.county}.`,
      after: () => {
        destroyMap();
        H.leaflet().then((L) => {
          const box = el.querySelector('#s-map');
          if (!box || !box.isConnected) return;
          box.innerHTML = '';
          const map = L.map(box, { scrollWheelZoom: false, zoomControl: true, attributionControl: true }).setView(C.center(), 10);
          H.tiles(L).addTo(map);
          const layer = L.layerGroup().addTo(map);
          mapState = { L, map, layer, markers: {} };
          syncMarkers();
          setTimeout(() => map.invalidateSize(), 60);
        }).catch(() => {
          const box = el.querySelector('#s-map');
          if (box) box.innerHTML = '<div class="s-map-loading">The map didn’t load. Every event above lists its address.</div>';
        });
      },
      cleanup: destroyMap,
    };
  });

  /* ================= EVENT DETAIL ================= */
  S.register('event', (el, route) => {
    const ev = C.findEvent(route.id);
    if (!ev) return S.pages.notfound(el, { path: 'events/' + route.id, what: 'event' });
    const d = S.dateParts(ev.date);
    const past = ev.date < S.todayIso();
    const more = C.events().filter((x) => x.id !== ev.id).slice(0, 3);
    el.innerHTML = `
      <section class="s-evhero">
        <div class="s-wrap s-evhero-in">
          <a class="s-backlink is-light" href="#/events">${ICON.back}<span>All events</span></a>
          <div class="s-evhero-grid">
            ${H.dateBlock(ev.date, 'is-hero')}
            <div>
              <p class="s-eyebrow s-eyebrow-light">${esc(ev.kind || 'Event')}${ev.sample ? ' ' + H.sample() : ''}${campTag(ev)}</p>
              <h1 class="s-evhero-title">${esc(ev.title)}</h1>
            </div>
          </div>
        </div>
      </section>
      ${H.zone('local', `<div class="s-wrap s-evbody">
        <div class="s-evmain">
          <dl class="s-facts">
            <div><dt>${ICON.cal}When</dt><dd>${esc(d.full)}<br>${esc(ev.time || '')}</dd></div>
            <div><dt>${ICON.pin}Where</dt><dd>${esc(C.venue(ev))}<br>${esc(C.city(ev))}</dd></div>
            <div><dt>${ICON.people}Who’s coming</dt><dd>${util.fmtNum(ev.going)} going${ev.capacity ? `<br>${util.fmtNum(Math.max(0, ev.capacity - ev.going))} spots left` : ''}</dd></div>
          </dl>
          <div class="s-evmap" id="s-evmap" role="region" aria-label="Map of the event location"><div class="s-map-loading">Loading the map…</div></div>
          <p class="s-map-note">${SLUG === 'demo' ? 'Sample area near Visalia. ' : ''}<a href="https://www.openstreetmap.org/?mlat=${ev.lat}&mlon=${ev.lng}#map=15/${ev.lat}/${ev.lng}" target="_blank" rel="noopener">Open in a full map ${ICON.out}</a></p>
          ${C.campaignOf(ev) ? `<p class="s-note">Hosted by the ${esc(C.campaignOf(ev).name)} campaign and listed by ${esc(T.shortName)}. <a href="${esc(C.campaignOf(ev).href)}"${S.framed ? ' target="_top"' : ''}>Visit the campaign site ${ICON.arrow}</a></p>` : ''}
          <div class="s-ev-share">
            <button class="s-btn s-btn-quiet" type="button" data-act="ics-top">${ICON.cal}<span>Add to calendar</span></button>
            <button class="s-btn s-btn-quiet" type="button" data-act="copy">${ICON.share}<span>Copy link</span></button>
          </div>
        </div>
        <aside class="s-evside" aria-labelledby="rsvp-h">
          <div class="s-rsvp-card">
            <h2 id="rsvp-h">${past ? 'This event has passed' : ev.myRsvp ? 'Your RSVP' : 'RSVP'}</h2>
            <div class="s-rsvp-host">${past ? '<p>See what’s coming up next on the events page.</p>' : ev.myRsvp ? goingHtml(ev, ev.myRsvp, false) : ev.full ? '<p>This event is full. Check the events page for another date.</p>' : rsvpFormHtml(ev)}</div>
          </div>
        </aside>
      </div>`)}
      ${more.length ? `<section class="s-wrap s-more-events" aria-labelledby="more-h"><div class="s-sec-head"><h2 id="more-h">More events</h2><a class="s-sec-link" href="#/events">See all ${ICON.arrow}</a></div>
        <div class="s-more-grid">${more.map(eventRow).join('')}</div></section>` : ''}`;

    const host = el.querySelector('.s-rsvp-host');
    const redraw = (saved) => {
      const fresh = C.findEvent(ev.id) || ev;
      el.querySelector('#rsvp-h').textContent = saved ? 'Your RSVP' : 'RSVP';
      host.innerHTML = saved ? goingHtml(fresh, saved, true) : rsvpFormHtml(fresh);
      const dd = el.querySelector('.s-facts div:nth-child(3) dd');
      if (dd) dd.innerHTML = `${util.fmtNum(fresh.going)} going${fresh.capacity ? `<br>${util.fmtNum(Math.max(0, fresh.capacity - fresh.going))} spots left` : ''}`;
      bindRsvp(host, fresh, redraw);
      if (saved) { const b = host.querySelector('[data-act="ics"]'); if (b) b.focus({ preventScroll: true }); }
      else { const f = host.querySelector('input'); if (f) f.focus({ preventScroll: true }); }
    };
    if (!past) bindRsvp(host, ev, redraw);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="copy"]')) H.copyLink(location.href, 'Link to this event copied.');
      if (e.target.closest('[data-act="ics-top"]')) { H.ics(ev); S.toast('Calendar file downloaded. Open it to add the event.', 'ok'); }
    });
    bindRsvpButtons(el.querySelector('.s-more-events') || document.createElement('div'));
    let map = null;
    return {
      title: ev.title,
      description: `${ev.title}: ${d.full}, ${ev.time || ''}, ${ev.location || ''}. RSVP on the ${T.shortName} site.`,
      after: () => {
        H.leaflet().then((L) => {
          const box = el.querySelector('#s-evmap');
          if (!box || !box.isConnected) return;
          box.innerHTML = '';
          map = L.map(box, { scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false }).setView([ev.lat, ev.lng], 14);
          H.tiles(L).addTo(map);
          L.marker([ev.lat, ev.lng], { icon: H.pin(L, ev, true), title: ev.title, keyboard: false }).addTo(map);
          setTimeout(() => map && map.invalidateSize(), 60);
        }).catch(() => { const box = el.querySelector('#s-evmap'); if (box) box.innerHTML = `<div class="s-map-loading">${esc(ev.location || '')}</div>`; });
      },
      cleanup: () => { if (map) try { map.remove(); } catch (e) { /* ignore */ } map = null; },
    };
  });

  /* ================= VOLUNTEER ================= */
  const INTERESTS = ['Walk precincts', 'Phone bank', 'Host a yard sign', 'Help at events', 'Watch the polls', 'Office help'];
  S.register('volunteer', (el) => {
    const mine = Store.list('volunteers').filter(S.isMine).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const last = mine[0];
    const shifts = C.events().filter((e) => /phone|canvass|walk|volunteer/i.test((e.kind || '') + ' ' + e.title)).slice(0, 3);
    el.innerHTML = `
      <section class="s-pagehead is-split"><div class="s-wrap s-split">
        <div>
          <p class="s-eyebrow">${STAR(13, 'var(--accent)')} Volunteer</p>
          <h1>Give ${esc(T.shortName)} a few hours before Election Day</h1>
          <p class="s-lede">Most shifts take two or three hours, and you can make calls from your kitchen table. Tell us what you’d like to do, and a team lead near you will reach out within two days with your first shift.</p>
          ${shifts.length ? `<div class="s-shifts"><h2 class="s-side-h">Shifts this month</h2>${shifts.map(eventRow).join('')}</div>` : ''}
        </div>
        <div class="s-formcard" id="vol-card">${last ? volDone(last, false) : volForm()}</div>
      </div></section>`;
    bindRsvpButtons(el);
    bindVol(el);
    return { title: 'Volunteer', description: `Volunteer with ${T.shortName}: walk precincts, make calls or host a yard sign in ${T.county}.` };
  });
  function volForm() {
    const me = H.me();
    return `<form class="s-form" id="vol-form" novalidate>
      <h2 class="s-form-h">Sign up to volunteer</h2>
      <fieldset class="s-fld s-chipset"><legend class="s-fld-label">I’d like to</legend>
        <div class="s-chips">${INTERESTS.map((x, i) => `<label class="s-chip s-chip-check"><input type="checkbox" name="interests" value="${esc(x)}" ${i === 0 ? 'checked' : ''}><span>${ICON.check}${esc(x)}</span></label>`).join('')}</div>
        <p class="s-fld-err" id="f-interests-err" aria-live="polite"></p>
      </fieldset>
      ${H.field({ name: 'name', label: 'Your name', autocomplete: 'name', value: me.name })}
      ${H.field({ name: 'contact', label: 'Email or mobile phone', autocomplete: 'email', value: me.contact })}
      ${H.field({ name: 'zip', label: 'ZIP code', autocomplete: 'postal-code', inputmode: 'numeric', maxlength: 5, value: me.zip, hint: 'We match you with the team closest to home.' })}
      <button class="s-btn s-btn-primary s-btn-block" type="submit">Sign me up</button>
    </form>`;
  }
  function volDone(doc, fresh) {
    const when = new Date(doc.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    return `<div class="s-done${fresh ? ' is-fresh' : ''}" role="status">
      <span class="s-done-mark">${ICON.check}</span>
      <h2>${fresh ? `Thank you, ${esc(first(doc.name))}.` : 'You’re on the volunteer team'}</h2>
      <p>${fresh ? `Your sign-up went to the ${esc(T.shortName)} volunteer team.` : `You signed up on ${esc(when)}.`} A team lead will reach out at ${esc(doc.contact)} within two days with your first shift.</p>
      <ul class="s-done-list">${(doc.interests || []).map((x) => `<li>${ICON.check}${esc(x)}</li>`).join('')}</ul>
      <div class="s-done-actions"><a class="s-btn s-btn-primary" href="#/events">See volunteer events</a><button class="s-btn s-btn-quiet" type="button" data-act="vol-again">Sign up someone else</button></div>
    </div>`;
  }
  function bindVol(el) {
    const card = el.querySelector('#vol-card');
    const wire = () => {
      const form = card.querySelector('#vol-form');
      if (!form) return;
      const rules = { name: V.name, contact: V.contact, zip: V.zip };
      H.liveValidate(form, rules);
      form.addEventListener('change', () => { const err = form.querySelector('#f-interests-err'); if (form.querySelector('[name="interests"]:checked')) err.textContent = ''; });
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const picked = Array.from(form.querySelectorAll('[name="interests"]:checked')).map((i) => i.value);
        const ok = H.validate(form, rules);
        const err = form.querySelector('#f-interests-err');
        err.textContent = picked.length ? '' : 'Pick at least one way to help.';
        if (!ok || !picked.length) return;
        const doc = S.quietly(() => Store.add('volunteers', {
          title: `Volunteer: ${picked.join(', ')}`, name: form.name.value.trim(), contact: H.formatContact(form.contact.value),
          interests: picked, zip: form.zip.value.trim(), visitorId: S.visitorId(),
        }));
        form.dataset.dirty = '0';
        S.toast(`Your sign-up went to the ${T.shortName} volunteer team.`, 'ok');
        card.innerHTML = volDone(doc, true);
        const h = card.querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
        card.scrollIntoView({ block: 'nearest', behavior: S.reduced() ? 'auto' : 'smooth' });
      });
    };
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="vol-again"]')) { card.innerHTML = volForm(); const f = card.querySelector('#vol-form'); f.name.value = ''; f.contact.value = ''; f.zip.value = ''; wire(); f.querySelector('input[name="name"]').focus(); }
    });
    wire();
  }

  /* ================= JOIN ================= */
  const DUES = 25;
  S.register('join', (el) => {
    const mine = Store.list('memberships').filter(S.isMine).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const county = /county$/i.test(T.county || '') ? T.county : (T.county || '') + ' County';
    el.innerHTML = `
      <section class="s-pagehead is-split"><div class="s-wrap s-split">
        <div>
          <p class="s-eyebrow">${STAR(13, 'var(--accent)')} Membership</p>
          <h1>Become a member of ${esc(T.shortName)}</h1>
          <p class="s-lede">Members are registered Republicans in ${esc(county)} who want a say in how the local party works.</p>
          <ul class="s-benefits">
            <li>${ICON.check}<span><b>Notice of every central committee meeting</b>, with the agenda a week ahead</span></li>
            <li>${ICON.check}<span><b>First call on volunteer roles</b>, including precinct captain openings</span></li>
            <li>${ICON.check}<span><b>The monthly member newsletter</b> with candidate news and volunteer needs</span></li>
            <li>${ICON.check}<span><b>Member pricing</b> for the Lincoln Day Dinner and other events</span></li>
          </ul>
          <div class="s-dues"><b>Dues: ${util.fmtUsd(DUES)} a year.</b> You pay after the membership secretary confirms your registration, so nothing is charged today. ${H.sample('Sample amount')}</div>
        </div>
        <div class="s-formcard" id="join-card">${mine[0] ? joinDone(mine[0], false) : joinForm()}</div>
      </div></section>`;
    const card = el.querySelector('#join-card');
    const wire = () => {
      const form = card.querySelector('form');
      if (!form) return;
      const rules = { name: V.name, contact: V.contact, zip: V.zip };
      H.liveValidate(form, rules);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!H.validate(form, rules)) return;
        const doc = S.quietly(() => Store.add('memberships', {
          title: `Membership application: ${T.shortName}`, name: form.name.value.trim(), contact: H.formatContact(form.contact.value),
          zip: form.zip.value.trim(), amount: DUES, status: 'pending', visitorId: S.visitorId(),
        }));
        form.dataset.dirty = '0';
        S.toast('Membership application received.', 'ok');
        card.innerHTML = joinDone(doc, true);
        const h = card.querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
        card.scrollIntoView({ block: 'nearest', behavior: S.reduced() ? 'auto' : 'smooth' });
      });
    };
    card.addEventListener('click', (e) => { if (e.target.closest('[data-act="join-again"]')) { card.innerHTML = joinForm(true); wire(); card.querySelector('input').focus(); } });
    wire();
    return { title: 'Join', description: `Become a member of ${T.shortName}, the Republican Party in ${county}.` };
  });
  function joinForm(blank) {
    const me = blank ? { name: '', contact: '', zip: '' } : H.me();
    return `<form class="s-form" novalidate>
      <h2 class="s-form-h">Apply for membership</h2>
      ${H.field({ name: 'name', label: 'Your name', autocomplete: 'name', value: me.name, hint: 'As it appears on your voter registration.' })}
      ${H.field({ name: 'contact', label: 'Email or mobile phone', autocomplete: 'email', value: me.contact })}
      ${H.field({ name: 'zip', label: 'Home ZIP code', autocomplete: 'postal-code', inputmode: 'numeric', maxlength: 5, value: me.zip, hint: 'Used to confirm you live in the county.' })}
      <button class="s-btn s-btn-primary s-btn-block" type="submit">Apply for membership</button>
      <p class="s-form-foot">Not registered yet? <a href="https://registertovote.ca.gov/" target="_blank" rel="noopener">Register to vote in California ${ICON.out}</a></p>
    </form>`;
  }
  function joinDone(doc, fresh) {
    const when = new Date(doc.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    return `<div class="s-done${fresh ? ' is-fresh' : ''}" role="status">
      <span class="s-done-mark">${ICON.check}</span>
      <h2>${fresh ? `Welcome, ${esc(first(doc.name))}.` : 'Your application is in'}</h2>
      <p>${fresh ? 'We received your membership application.' : `You applied on ${esc(when)}, and it’s waiting for review.`} The membership secretary checks your voter registration and will contact you at ${esc(doc.contact)} with a link to pay your ${util.fmtUsd(doc.amount || DUES)} dues and the date of your first meeting.</p>
      <div class="s-done-actions"><a class="s-btn s-btn-primary" href="#/events">See upcoming events</a><button class="s-btn s-btn-quiet" type="button" data-act="join-again">Apply for someone else</button></div>
    </div>`;
  }

  /* ================= DONATE ================= */
  const AMOUNTS = [25, 50, 100, 250];
  const dState = { amount: 50, custom: '', monthly: false };
  S.register('donate', (el) => {
    const mine = Store.list('donations').filter(S.isMine).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    el.innerHTML = `
      <section class="s-pagehead is-split is-donate"><div class="s-wrap s-split">
        <div>
          <p class="s-eyebrow">${STAR(13, 'var(--accent)')} Donate</p>
          <h1>Help ${esc(T.shortName)} reach every Republican voter</h1>
          <p class="s-lede">Your gift pays for precinct walk lists and the printed voter guides our volunteers hand out at the door.</p>
          <div class="s-impact">
            <div><b>${util.fmtUsd(25)}</b><span>prints 100 voter guides</span></div>
            <div><b>${util.fmtUsd(100)}</b><span>covers a phone bank for an evening</span></div>
          </div>
          <p class="s-note">${H.sample('Sample figures')} Your county committee sets its own examples.</p>
          ${mine.length ? `<div class="s-pledges"><h2 class="s-side-h">Your recent gifts</h2><ul>${mine.slice(0, 3).map((d) => `<li><b>${util.fmtUsd(d.amount)}</b>${d.recurring ? ' monthly' : ''}<span>${esc(new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))} · ${esc(d.receipt || '')}</span></li>`).join('')}</ul></div>` : ''}
        </div>
        <div class="s-formcard" id="don-card">${donForm()}</div>
      </div></section>`;
    bindDonate(el);
    return { title: 'Donate', description: `Donate to ${T.name}. Gifts fund walk lists and printed voter guides.` };
  });
  function donAmount() { return dState.custom ? Number(dState.custom) : dState.amount; }
  function donForm() {
    const me = H.me();
    const amt = donAmount();
    return `<form class="s-form" id="don-form" novalidate>
      <h2 class="s-form-h">Choose an amount</h2>
      <div class="s-amounts" role="radiogroup" aria-label="Donation amount">
        ${AMOUNTS.map((a) => `<button type="button" class="s-amount${!dState.custom && dState.amount === a ? ' is-on' : ''}" role="radio" aria-checked="${!dState.custom && dState.amount === a}" data-amt="${a}">${util.fmtUsd(a)}</button>`).join('')}
      </div>
      <div class="s-fld" data-fld="custom">
        <label class="s-fld-label" for="f-custom">Other amount</label>
        <div class="s-money"><span aria-hidden="true">$</span><input class="s-input" id="f-custom" name="custom" inputmode="decimal" autocomplete="off" placeholder="Enter an amount" value="${esc(dState.custom)}" aria-describedby="f-custom-err"></div>
        <p class="s-fld-err" id="f-custom-err" aria-live="polite"></p>
      </div>
      <label class="s-switch"><input type="checkbox" name="monthly" ${dState.monthly ? 'checked' : ''}><span class="s-switch-ui" aria-hidden="true"></span><span><b>Make it monthly</b><span>Monthly gifts let the committee plan its precinct work ahead.</span></span></label>
      ${H.field({ name: 'name', label: 'Your name', autocomplete: 'name', value: me.name })}
      ${H.field({ name: 'contact', label: 'Email or mobile phone', autocomplete: 'email', value: me.contact, hint: 'WinRed sends your receipt here.' })}
      <button class="s-btn s-btn-accent s-btn-block s-don-go" type="submit">${donLabel(amt)}</button>
      <p class="s-form-foot">Checkout opens WinRed, the contribution page, in a new tab. The WinRed address is a sample until the committee connects its account. WinRed asks for your address, occupation and employer, as campaign finance law requires.</p>
    </form>`;
  }
  function donLabel(amt) { return amt > 0 ? `Continue to checkout with ${util.fmtUsd(amt)}${dState.monthly ? ' a month' : ''}` : 'Continue to checkout'; }
  function bindDonate(el) {
    const card = el.querySelector('#don-card');
    const wire = () => {
      const form = card.querySelector('#don-form');
      if (!form) return;
      const go = form.querySelector('.s-don-go');
      const refresh = () => { go.textContent = donLabel(donAmount()); };
      const amtRule = () => {
        const a = donAmount();
        if (!a || isNaN(a)) return 'Choose an amount or enter your own.';
        if (a < 1) return 'The smallest gift is $1.';
        if (a > 5000) return 'For gifts over $5,000, contact the treasurer.';
        return '';
      };
      form.addEventListener('click', (e) => {
        const b = e.target.closest('[data-amt]');
        if (!b) return;
        dState.amount = Number(b.dataset.amt); dState.custom = '';
        form.custom.value = '';
        form.querySelectorAll('[data-amt]').forEach((x) => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', on); });
        form.querySelector('[data-fld="custom"]').classList.remove('has-error'); form.querySelector('#f-custom-err').textContent = '';
        refresh();
      });
      form.custom.addEventListener('input', () => {
        dState.custom = form.custom.value.replace(/[^\d.]/g, '');
        if (form.custom.value !== dState.custom) form.custom.value = dState.custom;
        form.querySelectorAll('[data-amt]').forEach((x) => { const on = !dState.custom && Number(x.dataset.amt) === dState.amount; x.classList.toggle('is-on', on); x.setAttribute('aria-checked', on); });
        if (!amtRule()) { form.querySelector('[data-fld="custom"]').classList.remove('has-error'); form.querySelector('#f-custom-err').textContent = ''; }
        refresh();
      });
      form.monthly.addEventListener('change', () => { dState.monthly = form.monthly.checked; refresh(); });
      const rules = { name: V.name, contact: V.contact };
      H.liveValidate(form, rules);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const aErr = amtRule();
        const cw = form.querySelector('[data-fld="custom"]');
        cw.classList.toggle('has-error', !!aErr);
        form.querySelector('#f-custom-err').textContent = aErr;
        const ok = H.validate(form, rules);
        if (aErr) { form.custom.focus(); return; }
        if (!ok) return;
        const amount = Math.round(donAmount() * 100) / 100;
        const url = `${C.donateUrl()}?amount=${encodeURIComponent(amount)}${dState.monthly ? '&recurring=true' : ''}`;
        let win = null;
        try { win = window.open(url, '_blank'); if (win) win.opener = null; } catch (err) { win = null; }
        const receipt = 'Pledge ' + String(Date.now()).slice(-6);
        const doc = S.quietly(() => Store.add('donations', {
          title: `Donation to ${T.shortName}`, name: form.name.value.trim(), contact: H.formatContact(form.contact.value),
          amount, to: T.shortName, recurring: dState.monthly, receipt, status: 'pledged', via: 'WinRed', checkoutUrl: url, visitorId: S.visitorId(),
        }));
        form.dataset.dirty = '0';
        card.innerHTML = `<div class="s-done is-fresh" role="status">
          <span class="s-done-mark">${ICON.check}</span>
          <h2>Thank you, ${esc(first(doc.name))}. Finish on WinRed.</h2>
          <p>We opened WinRed in a new tab with ${util.fmtUsd(amount)}${doc.recurring ? ' a month' : ''} filled in. Your gift is complete once you check out there, and WinRed sends your receipt.</p>
          <p class="s-note">We saved your pledge as ${esc(receipt)}.${win ? '' : ' Your browser blocked the new tab, so use the button below.'}</p>
          <div class="s-done-actions"><a class="s-btn s-btn-accent" href="${esc(url)}" target="_blank" rel="noopener">Open WinRed checkout ${ICON.out}</a><button class="s-btn s-btn-quiet" type="button" data-act="don-again">Make another gift</button></div>
        </div>`;
        const h = card.querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      });
    };
    card.addEventListener('click', (e) => { if (e.target.closest('[data-act="don-again"]')) { S.rerender(); } });
    wire();
  }

  /* ================= CANDIDATES ================= */
  S.register('candidates', (el) => {
    const g = C.guide();
    const local = C.candidates();
    const county = /county$/i.test(T.county || '') ? T.county : (T.county || '') + ' County';
    el.innerHTML = `
      <section class="s-pagehead"><div class="s-wrap">
        <p class="s-eyebrow">${STAR(13, 'var(--accent)')} Candidates</p>
        <h1>The candidates ${esc(T.shortName)} endorses</h1>
        <p class="s-lede">The ${esc(T.shortName)} central committee votes on every endorsement. ${g ? `See how to vote on all ${g.measures.length} measures in the <a href="#/guide">voter guide</a>.` : ''}</p>
      </div></section>
      ${g ? H.zone('local', `<section class="s-wrap s-slate" aria-labelledby="slate-h">
        <div class="s-sec-head"><h2 id="slate-h">${esc(g.election)}</h2><span class="s-sec-note">Vote by ${esc(S.dateParts(g.electionDate).full)}</span></div>
        ${g.groups.map((grp) => `<div class="s-slate-group">
          <h3 class="s-slate-h">${esc(grp.label)}<span>${grp.scope === 'state' ? 'On every California ballot' : esc(county) + ' races'}</span></h3>
          <div class="s-slate-grid">${grp.races.map((r) => `<div class="s-slate-card s-reveal">
            <span class="s-slate-photo${r.photo ? '' : ' is-initials'}">${r.photo ? `<img src="${esc(r.photo)}" alt="${esc(r.name)}" loading="lazy">` : `<span class="s-slate-initials" aria-hidden="true">${esc(util.initials(r.name))}</span>`}</span>
            <span class="s-slate-office">${esc(r.office)}</span><span class="s-slate-name">${esc(r.name)}</span>
          </div>`).join('')}</div>
        </div>`).join('')}
        ${g.localPending ? `<p class="s-note">${esc(g.localPending)}</p>` : ''}
        <a class="s-btn s-btn-primary" href="#/guide">Open the full voter guide ${ICON.arrow}</a>
      </section>`) : ''}
      ${H.zone('local', `<section class="s-wrap s-localcands" aria-labelledby="lc-h">
        <div class="s-sec-head"><h2 id="lc-h">Local candidates</h2></div>
        ${local.length ? local.map((c) => {
          const site = C.campaignSite(c);
          return `<article class="s-lc s-reveal" id="cand-${esc(c.id)}">
            <div class="s-lc-photo">${c.photo ? `<img src="${esc(c.photo)}" alt="${esc(c.name)}" loading="lazy" style="object-position:${esc(c.photoPos || '50% 25%')}">` : util.avatar(c.name, 240)}</div>
            <div class="s-lc-body">
              <span class="s-kicker">${esc(c.office)}${c.district ? ' · ' + esc(c.district) : ''}</span>
              <h3 class="s-lc-name">${esc(c.name)}</h3>
              <div class="s-cand-tags">${c.status === 'ENDORSED' ? '<span class="s-badge s-badge-local">Endorsed by the central committee</span>' : '<span class="s-badge">Running with our support</span>'}${c.sample ? H.sample() : ''}</div>
              ${c.slogan ? `<p class="s-lc-slogan">${esc(c.slogan)}</p>` : ''}
              <p>${esc(c.bio || '')}</p>
              ${(c.issues || []).length ? `<ul class="s-lc-issues">${c.issues.map((x) => `<li>${ICON.check}${esc(x)}</li>`).join('')}</ul>` : ''}
              ${site ? `<a class="s-btn s-btn-primary" href="${esc(C.campaignHref(c))}"${S.framed ? ' target="_top"' : ''}>Visit the campaign site ${ICON.arrow}</a>` : ''}
            </div>
          </article>`;
        }).join('') : '<div class="s-empty">Endorsements are announced after the next central committee meeting.</div>'}
      </section>`)}`;
    return { title: 'Candidates', description: `Candidates endorsed by ${T.name} in the ${g ? g.election : 'next election'}.` };
  });

  /* ================= UNSUBSCRIBE ================= */
  /* Email footers link here. One tap after the contact is known; writes Store 'optOuts' {email?, phone?, channel}. */
  const unsub = { last: null };
  function unsubParams() {
    const q = new URLSearchParams(location.search);
    const h = new URLSearchParams((location.hash.split('?')[1]) || '');
    return { email: (h.get('email') || q.get('email') || '').trim(), phone: (h.get('phone') || q.get('phone') || '').trim() };
  }
  S.register('unsubscribe', (el) => {
    const pre = unsubParams();
    const known = pre.email || pre.phone;
    const shown = pre.email ? pre.email.toLowerCase() : pre.phone ? H.formatContact(pre.phone) : '';
    const CH = [
      { id: 'email', label: 'Stop emails', sub: 'You can still get texts if you signed up for them.' },
      { id: 'sms', label: 'Stop texts', sub: 'You can still get emails if you signed up for them.' },
      { id: 'all', label: `Stop everything from ${T.shortName}`, sub: 'No emails, texts or calls from the committee.' },
    ];
    el.innerHTML = `
      <section class="s-pagehead"><div class="s-wrap u-wrap">
        <p class="s-eyebrow">${STAR(13, 'var(--accent)')} Email and text preferences</p>
        <h1>Choose what ${esc(T.shortName)} sends you</h1>
        <p class="s-lede">${known ? `This applies to <b>${esc(shown)}</b>.` : 'Enter the email address or mobile number we contact you at, then pick one option.'}</p>
      </div></section>
      <div class="s-wrap u-wrap"><div class="s-formcard u-card" id="u-card">
        <form class="s-form" novalidate id="u-form">
          ${known ? '' : H.field({ name: 'contact', label: 'Email or mobile phone', autocomplete: 'email' })}
          <div class="u-opts" role="group" aria-label="What to stop">${CH.map((c) => `<button type="submit" class="u-opt" name="channel" value="${c.id}"><b>${esc(c.label)}</b><span>${esc(c.sub)}</span></button>`).join('')}</div>
          <p class="s-form-foot">If a message was already on its way, one more may still reach you. Questions? Reply to any ${esc(T.shortName)} email.</p>
        </form>
      </div></div>`;
    const card = el.querySelector('#u-card');
    const form = el.querySelector('#u-form');
    let channel = 'email';
    form.addEventListener('click', (e) => { const b = e.target.closest('.u-opt'); if (b) channel = b.value; });
    if (!known) H.liveValidate(form, { contact: V.contact });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (e.submitter && e.submitter.value) channel = e.submitter.value;
      let email = pre.email, phone = pre.phone;
      if (!known) {
        if (!H.validate(form, { contact: V.contact })) return;
        const raw = form.contact.value.trim();
        if (raw.includes('@')) email = raw; else phone = raw;
      }
      const doc = { channel, title: `Unsubscribed (${channel === 'all' ? 'everything' : channel === 'sms' ? 'texts' : 'emails'})` };
      if (email) doc.email = email.toLowerCase();
      if (phone) doc.phone = phone.replace(/\D/g, '').slice(-10);
      const saved = S.quietly(() => Store.add('optOuts', doc));
      unsub.last = saved.id;
      form.dataset.dirty = '0';
      const what = channel === 'all' ? `You won’t hear from ${esc(T.shortName)} again` : channel === 'sms' ? `${esc(T.shortName)} won’t text you again` : `${esc(T.shortName)} won’t email you again`;
      card.innerHTML = `<div class="s-done is-fresh" role="status">
        <span class="s-done-mark">${ICON.check}</span>
        <h2 tabindex="-1">You’re unsubscribed.</h2>
        <p>${what} at ${esc(doc.email || H.formatContact(doc.phone))}.</p>
        <div class="s-done-actions"><button class="s-btn s-btn-quiet" type="button" data-u="undo">Undo</button><a class="s-btn s-btn-quiet" href="#/">Go to the home page</a></div>
      </div>`;
      card.querySelector('h2').focus({ preventScroll: true });
    });
    card.addEventListener('click', (e) => {
      if (!e.target.closest('[data-u="undo"]') || !unsub.last) return;
      S.quietly(() => Store.remove('optOuts', unsub.last));
      unsub.last = null;
      S.toast('Undone. Your preferences are back to how they were.', 'info');
      S.rerender();
    });
    return { title: 'Email and text preferences', description: `Stop emails or texts from ${T.name}.` };
  });

  /* ================= NOT FOUND ================= */
  S.register('notfound', (el, route) => {
    const what = (route && route.what) || 'page';
    el.innerHTML = `<section class="s-wrap s-empty-page">
      <p class="s-eyebrow">${STAR(13, 'var(--accent)')} Not found</p>
      <h1>We couldn’t find that ${esc(what)}</h1>
      <p>It may have been moved or taken down. Try the home page or the events calendar.</p>
      <div class="s-done-actions"><a class="s-btn s-btn-primary" href="#/">Go to the home page</a><a class="s-btn" href="#/events">See events</a></div>
    </section>`;
    return { title: 'Not found' };
  });

  /* Mark forms dirty on input so live refreshes never wipe what someone is typing. */
  document.addEventListener('input', (e) => { const f = e.target.closest && e.target.closest('#main form'); if (f) f.dataset.dirty = '1'; });
})();
