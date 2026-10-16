/* site-newsroom.js: the "Newsroom" homepage layout for the public county site.
   Used for #/ when ?layout=newsroom or siteSettings.layout === 'newsroom'.
   Headlines and videos come from newsroom-data.js (real, vetted) plus network pushes;
   the local zone carries committee posts, county news, events and endorsed candidates. */
(function () {
  'use strict';
  const S = window.Site;
  if (!S) return;
  const { esc, util, H, C, icon: ICON, star: STAR, t: T, slug: SLUG } = S;
  const st = { topic: 'All', showAll: false };
  const TZ = { timeZone: 'America/Los_Angeles' };
  const clock = (ms) => { try { return new Date(ms).toLocaleTimeString('en-US', Object.assign({ hour: 'numeric', minute: '2-digit' }, TZ)); } catch (e) { return ''; } };
  const day = (ms) => { try { return new Date(ms).toLocaleDateString('en-US', Object.assign({ month: 'short', day: 'numeric' }, TZ)); } catch (e) { return ''; } };
  const stamp = (ms) => (day(ms) === day(Date.now()) ? clock(ms) : day(ms) + ' · ' + clock(ms));

  const link = (n, cls) => `<a class="nr-hl ${cls || ''}" href="#/news/${encodeURIComponent(n.id)}">${esc(n.title)}</a>`;
  const meta = (n) => `<div class="nr-meta">${n.source ? `<b>${esc(n.source)}</b><span aria-hidden="true">·</span>` : ''}<span>${esc(S.ago(n.at))}</span>${n.sample ? ' ' + H.sample() : ''}</div>`;
  const listItem = (n, top) => `<div class="nr-item${top ? ' is-top' : ''}"><span class="nr-kicker">${esc(n.tag || '')}</span>${link(n)}${top && n.summary ? `<p>${esc(n.summary)}</p>` : ''}${meta(n)}</div>`;

  S.register('newsroomHome', (el) => {
    const national = C.news('national');
    const state = C.news('state');
    const county = C.news('county');
    const city = C.news('city');
    const all = national.concat(state).sort((a, b) => (b.at || 0) - (a.at || 0));
    const N = window.NEWSROOM || {};
    const lead = all.find((n) => n.kind === 'push' && n.priority >= 90) || all.find((n) => n.id === N.breaking) || all.find((n) => n.tag !== 'Opinion') || all[0];
    if (!lead) { el.innerHTML = '<section class="s-wrap s-empty-page"><h1>Headlines are loading</h1><p>The news feed fills in within a minute.</p></section>'; return { title: 'News' }; }
    const used = new Set([lead.id]);
    const secondary = all.filter((n) => !used.has(n.id) && n.tag !== 'Opinion').slice(0, 4);
    secondary.forEach((n) => used.add(n.id));
    const river = all.filter((n) => n.id !== lead.id).slice(0, 6);
    const natList = national.filter((n) => !used.has(n.id) && n.tag !== 'Opinion').slice(0, 5);
    const caList = state.filter((n) => !used.has(n.id)).slice(0, 5);
    const opinion = national.filter((n) => n.tag === 'Opinion');
    const localNews = county.concat(city.slice(0, 2)).slice(0, 6);
    const events = C.events().slice(0, 3);
    const cands = C.candidates();
    const videos = C.videos();
    const featured = videos[0];
    const topics = ['All'].concat(Array.from(new Set(videos.map((v) => v.topic).filter(Boolean))));
    if (!topics.includes(st.topic)) st.topic = 'All';
    const tickerItems = all.slice(0, 10).map((n) => `<a href="#/news/${encodeURIComponent(n.id)}">${esc(n.title)}</a><span class="sep" aria-hidden="true">■</span>`).join('');
    const asOf = Math.max(...all.map((n) => n.at || 0));
    let dateLine = '';
    try { dateLine = new Date().toLocaleDateString('en-US', Object.assign({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }, TZ)); } catch (e) { dateLine = ''; }
    const headerAd = C.networkAd('HEADER_BANNER');
    const sideTop = C.localAd('SIDEBAR_TOP');
    const inFeed = C.networkAd('IN_FEED');
    const g = C.guide();

    el.innerHTML = `
      ${H.zone('local', `<section class="nr-mast" aria-labelledby="nr-h">
        <div class="s-wrap nr-mast-in">
          <div><h1 id="nr-h" class="nr-title">${esc(T.shortName)} News</h1><p class="nr-sub">${esc(T.county || T.name)} · ${esc(C.tagline())}</p></div>
          <div class="nr-date"><b>${esc(dateLine)}</b>Headlines updated ${esc(clock(asOf))} Pacific</div>
        </div>
        <nav class="nr-sections-nav" aria-label="Sections"><div class="s-wrap">
          <button data-jump="nr-national">National</button><button data-jump="nr-california">California</button><button data-jump="nr-local">Local</button>
          ${opinion.length ? '<button data-jump="nr-opinion">Opinion</button>' : ''}<button data-jump="nr-watch" class="is-watch"><i aria-hidden="true"></i>Video</button>
        </div></nav>
      </section>`)}

      ${H.zone('network', `<div class="nr-breaking">
        <span class="nr-breaking-label"><span class="nr-pulse" aria-hidden="true"></span>TOP STORY</span>
        <a href="#/news/${encodeURIComponent(lead.id)}"><span class="nr-bk-head">${esc(lead.title)}</span><span class="nr-bk-meta">${esc(lead.source || '')} · ${esc(S.ago(lead.at))}</span></a>
      </div>
      <div class="nr-ticker" role="region" aria-label="Latest headlines">
        <span class="nr-ticker-label">LATEST</span>
        <div class="nr-ticker-view"><div class="nr-ticker-track"><div>${tickerItems}</div><div aria-hidden="true">${tickerItems.replace(/<a /g, '<a tabindex="-1" ')}</div></div></div>
      </div>`)}
      ${g && App.voterGuide ? H.zone('local', App.voterGuide.bar(T)) : ''}

      ${H.zone('network', `<div class="s-wrap nr-lead-grid">
        <article class="nr-lead">
          <div class="nr-lead-art">${H.tile(lead, { uid: 'nrl' })}</div>
          <span class="nr-kicker">${esc(lead.tag || '')} · Top story</span>
          ${link(lead, 'is-lead')}
          ${lead.summary ? `<p class="nr-lead-sum">${esc(lead.summary)}</p>` : ''}
          ${meta(lead)}
          ${lead.url ? `<a class="nr-lead-cta" href="${esc(lead.url)}" target="_blank" rel="noopener">Read the full story at ${esc(lead.source)} ${ICON.out}</a>` : ''}
        </article>
        <div class="nr-secondary">${secondary.map((n) => `<div class="nr-sec-item"><span class="nr-kicker">${esc(n.tag || '')}</span>${link(n)}${meta(n)}</div>`).join('')}</div>
        <aside class="nr-river" aria-label="Latest">
          <h2><i aria-hidden="true"></i>Latest</h2>
          <ol>${river.map((n) => `<li><time>${esc(stamp(n.at))}</time>${link(n)}<span class="nr-src">${esc(n.source || '')}</span></li>`).join('')}</ol>
        </aside>
      </div>`)}

      ${headerAd ? `<div class="s-wrap s-banner-row">${H.zone('network', H.adSlot(headerAd, 's-ad-banner'))}</div>` : ''}

      ${featured ? H.zone('network', `<section class="nr-rail" aria-labelledby="nr-rail-h">
        <div class="s-wrap">
          <div class="nr-sec-head is-dark"><h2 id="nr-rail-h">Watch now</h2><span class="nr-sec-note">Plays right on this page</span><span class="spacer"></span><button class="s-btn s-btn-sm s-btn-darkghost" data-jump="nr-watch">See all ${videos.length} videos</button></div>
          <div class="nr-feature">${H.videoCard(featured, { big: true })}</div>
          <div class="nr-row" tabindex="0" aria-label="More videos">${videos.slice(1, 8).map((v) => H.videoCard(v)).join('')}</div>
        </div>
      </section>`) : ''}

      <div class="s-wrap">
        <div class="nr-two">
          ${H.zone('network', `<section class="nr-section" id="nr-national"><div class="nr-sec-head"><h2>National</h2></div>${natList.map((n, i) => listItem(n, i === 0)).join('') || '<div class="s-empty">No national stories yet today.</div>'}</section>`)}
          ${H.zone('network', `<section class="nr-section" id="nr-california"><div class="nr-sec-head"><h2>California</h2></div>${caList.map((n, i) => listItem(n, i === 0)).join('') || '<div class="s-empty">No California stories yet today.</div>'}</section>`)}
        </div>

        ${H.zone('local', `<section class="nr-local" id="nr-local" aria-labelledby="nr-local-h">
          <div class="nr-sec-head is-local"><h2 id="nr-local-h">Local · ${esc(T.county || '')}</h2><span class="spacer"></span><span class="s-badge s-badge-local">${STAR(11)} From ${esc(T.shortName)}</span></div>
          <div class="nr-local-grid">
            <div><h3 class="nr-sub-h">Around the county</h3>${localNews.map((n, i) => listItem(n, i === 0)).join('') || '<div class="s-empty">No county stories yet.</div>'}</div>
            <div><h3 class="nr-sub-h">Upcoming events</h3>${events.map((e) => S.eventRow(e)).join('') || '<div class="s-empty">No events on the calendar right now.</div>'}<a class="s-more-link" href="#/events">All events ${ICON.arrow}</a></div>
            <div><h3 class="nr-sub-h">Endorsed candidates${cands.some((c) => c.sample) ? ' ' + H.sample() : ''}</h3>${cands.map((c) => `<a class="s-wcand" href="${C.campaignHref(c) ? esc(C.campaignHref(c)) : '#/candidates'}"${C.campaignHref(c) && S.framed ? ' target="_top"' : ''}>${util.candidatePhoto(c, 48, { shape: 'circle' })}<span><span class="s-wcand-name">${esc(c.name)}</span><span class="s-wcand-office">${esc(c.office)}${c.district ? ', ' + esc(c.district) : ''}</span></span></a>`).join('')}
              ${sideTop ? `<div class="nr-local-ad">${H.adSlot(sideTop, 's-ad-side')}</div>` : ''}</div>
          </div>
        </section>`)}

        ${S.actBlock ? `<div class="nr-act">${S.actBlock()}</div>` : ''}
        ${opinion.length ? H.zone('network', `<section class="nr-section nr-opinion" id="nr-opinion"><div class="nr-sec-head"><h2>Opinion</h2></div><div class="nr-op-grid">${opinion.map((n) => listItem(n, true)).join('')}</div></section>`) : ''}
        ${inFeed ? `<div class="s-banner-row">${H.zone('network', H.adSlot(inFeed, 's-ad-banner'))}</div>` : ''}
      </div>

      ${videos.length ? H.zone('network', `<section class="nr-watch" id="nr-watch" aria-labelledby="nr-watch-h">
        <div class="s-wrap">
          <div class="nr-sec-head is-dark"><h2 id="nr-watch-h">Watch</h2><span class="nr-sec-note">Conservative video from across the country</span></div>
          <div class="nr-chips" role="toolbar" aria-label="Filter videos by topic">${topics.map((c) => `<button class="nr-chip${c === st.topic ? ' is-on' : ''}" data-topic="${esc(c)}" aria-pressed="${c === st.topic}">${esc(c)}<span class="n">${c === 'All' ? videos.length : videos.filter((v) => v.topic === c).length}</span></button>`).join('')}</div>
          <div class="nr-vgrid" aria-live="polite"></div>
          <div class="nr-more"></div>
          <div class="nr-channels"><h3>Channels</h3><div class="nr-chan-strip">${(N.channels || []).map((c) => { const [bg, ac] = H.chColors(c.name); return `<a class="nr-chan" href="${esc(c.url)}" target="_blank" rel="noopener" style="--c-bg:${bg};--c-ac:${ac}"><span class="s-vav" aria-hidden="true">${esc(util.initials(c.name))}</span>${esc(c.name)}</a>`; }).join('')}</div></div>
        </div>
      </section>`) : ''}`;

    const drawVideos = () => {
      const list = videos.filter((v) => st.topic === 'All' || v.topic === st.topic);
      const lim = st.showAll ? list.length : 8;
      const grid = el.querySelector('.nr-vgrid');
      if (!grid) return;
      grid.innerHTML = list.slice(0, lim).map((v) => H.videoCard(v)).join('');
      el.querySelector('.nr-more').innerHTML = list.length > lim ? `<button class="s-btn s-btn-darkghost" data-more="1">Show all ${list.length} videos</button>` : '';
      el.querySelectorAll('.nr-chip').forEach((b) => { const on = b.dataset.topic === st.topic; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
    };
    drawVideos();

    el.addEventListener('click', (e) => {
      const v = e.target.closest('[data-act="video"]'); if (v) { S.openVideo(v.dataset.id); return; }
      const tp = e.target.closest('[data-topic]'); if (tp) { st.topic = tp.dataset.topic; st.showAll = false; drawVideos(); return; }
      if (e.target.closest('[data-more]')) { st.showAll = true; drawVideos(); return; }
      const j = e.target.closest('[data-jump]');
      if (j) {
        const target = el.querySelector('#' + j.dataset.jump);
        const off = (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--s-header-h'), 10) || 64) + 12;
        if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - off, behavior: S.reduced() ? 'auto' : 'smooth' });
      }
      const r = e.target.closest('[data-act="rsvp"]');
      if (r) { const ev = C.findEvent(r.dataset.id); if (ev) S.openRsvp(ev, () => S.rerender()); }
    });
    void SLUG;
    return { title: '', description: `${T.shortName} News: national, California and ${T.county} headlines, local events and conservative video.` };
  });
})();
