/* screens/public-hub.js: Public Media Hub (platform screen).
   Shows the real county website (index.html?county=<tenant>) live in an iframe inside a device frame,
   with a desktop/phone toggle, the "Show who controls each zone" overlay and the layout comparison.
   Exposes App.sitePreview.render(el, ctx, { layout }) so screens/newsroom.js shares the same preview. */
(function () {
  'use strict';
  if (!window.App) return;

  const U = App.util;
  const esc = U.esc;
  const I = (d, s) => `<svg width="${s || 20}" height="${s || 20}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = I('<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M3 8h14M7 12h6"/>');
  const IC_OUT = I('<path d="M11 4h5v5M16 4l-7 7M14 12v3.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5H8"/>', 16);
  const IC_DESK = I('<rect x="2.5" y="3.5" width="15" height="10" rx="1.5"/><path d="M7 17h6M10 13.5V17"/>', 17);
  const IC_PHONE = I('<rect x="6" y="2.5" width="8" height="15" rx="2"/><path d="M9 15h2"/>', 17);
  const IC_RELOAD = I('<path d="M16 10a6 6 0 1 1-1.8-4.3M16 4v3.5h-3.5"/>', 16);
  const IC_LOCK = '<svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>';

  const CSS = `
.scr-prev .pv-switch-row { display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px; margin-bottom:16px; }
.scr-prev .pv-seg { display:inline-flex; gap:4px; padding:4px; border-radius:999px; background:var(--surface); border:1px solid var(--line-strong); box-shadow:var(--shadow-1); max-width:100%; }
.scr-prev .pv-seg a, .scr-prev .pv-seg button { display:inline-flex; align-items:center; gap:7px; min-height:36px; padding:6px 16px; border-radius:999px; border:0; background:none; cursor:pointer;
  font:600 14.5px/1.2 var(--font-body); color:var(--ink-2); text-decoration:none; white-space:nowrap; }
.scr-prev .pv-seg a:hover, .scr-prev .pv-seg button:hover { color:var(--ink); background:var(--surface-2); }
.scr-prev .pv-seg .is-on { background:var(--brand); color:var(--brand-ink); }
.scr-prev .pv-seg .is-on:hover { background:var(--brand); color:var(--brand-ink); }
.scr-prev .pv-live { font-size:14px; color:var(--ink-3); }
.scr-prev .pv-live b { color:var(--ink); }
.scr-prev .page-head p { max-width:70ch; }
.scr-prev .pv-bar { display:flex; flex-wrap:wrap; align-items:center; gap:14px 22px; padding:14px 18px; margin-bottom:16px; border:1px solid var(--line); border-radius:var(--r-lg); background:var(--surface); box-shadow:var(--shadow-1);
  transition:border-color .25s ease, box-shadow .25s ease; }
.scr-prev.pv-zones-on .pv-bar { border-color:color-mix(in srgb, var(--master) 40%, white); box-shadow:0 0 0 4px color-mix(in srgb, var(--master) 10%, transparent), var(--shadow-1); }
.scr-prev .pv-toggle { display:flex; align-items:center; gap:14px; cursor:pointer; flex:1 1 320px; min-width:0; }
.scr-prev .pv-toggle input.toggle { width:56px; height:32px; flex:none; }
.scr-prev .pv-toggle input.toggle::after { width:26px; height:26px; }
.scr-prev .pv-toggle input.toggle:checked { background:var(--master); }
.scr-prev .pv-toggle input.toggle:checked::after { transform:translateX(24px); }
.scr-prev .pv-toggle-title { display:block; font-family:var(--font-head); font-stretch:85%; font-weight:800; font-size:1.15rem; line-height:1.2; color:var(--ink); }
.scr-prev .pv-toggle-sub { display:block; font-size:14px; color:var(--ink-2); }
.scr-prev .pv-legend { display:flex; flex-wrap:wrap; gap:8px; }
.scr-prev .pv-legend span { display:inline-flex; align-items:center; gap:8px; padding:5px 12px 5px 5px; border-radius:999px; font-size:13.5px; font-weight:600; border:1px solid var(--line); background:var(--surface-2); color:var(--ink-2); transition:all .25s; }
.scr-prev .pv-legend b { display:inline-flex; align-items:center; justify-content:center; min-width:26px; height:26px; padding:0 7px; border-radius:999px; color:#fff; font-size:13px; }
.scr-prev .pv-legend .is-net b { background:var(--master); }
.scr-prev .pv-legend .is-loc b { background:var(--brand); color:var(--brand-ink); }
.scr-prev.pv-zones-on .pv-legend .is-net { background:var(--master-soft); border-color:color-mix(in srgb, var(--master) 35%, white); color:var(--master); }
.scr-prev.pv-zones-on .pv-legend .is-loc { background:color-mix(in srgb, var(--brand) 9%, white); border-color:color-mix(in srgb, var(--brand) 35%, white); color:var(--brand); }
.scr-prev .pv-tools { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-left:auto; }

.scr-prev .pv-stage { position:relative; border-radius:18px; padding:20px; background:
  radial-gradient(circle at 15% 0%, color-mix(in srgb, var(--brand) 14%, transparent), transparent 50%),
  linear-gradient(180deg, #E9EDF2, #DDE3EA); border:1px solid var(--line); }
.scr-prev .pv-desk { border-radius:12px; overflow:hidden; background:#fff; box-shadow:0 30px 60px -30px rgba(15,23,36,.55), 0 0 0 1px rgba(15,23,36,.08); }
.scr-prev .pv-chrome { display:flex; align-items:center; gap:12px; padding:9px 12px; background:#F3F5F8; border-bottom:1px solid var(--line); }
.scr-prev .pv-dots { display:flex; gap:6px; flex:none; }
.scr-prev .pv-dots i { width:11px; height:11px; border-radius:50%; background:#D5DAE1; display:block; }
.scr-prev .pv-addr { flex:1; min-width:0; display:flex; align-items:center; gap:7px; padding:5px 12px; border-radius:999px; background:#fff; border:1px solid var(--line); font-size:13.5px; color:var(--ink-2); }
.scr-prev .pv-addr svg { color:var(--ok); flex:none; }
.scr-prev .pv-addr span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.scr-prev .pv-viewport { position:relative; overflow:hidden; background:#fff; }
.scr-prev .pv-viewport iframe { position:absolute; left:0; top:0; border:0; transform-origin:0 0; background:#fff; }
.scr-prev .pv-phone { width:min(414px, 100%); margin:0 auto; padding:12px; border-radius:46px; background:#11161D; box-shadow:0 40px 70px -35px rgba(15,23,36,.7), inset 0 0 0 2px #2A323E; }
.scr-prev .pv-phone .pv-viewport { border-radius:34px; }
.scr-prev .pv-phone .pv-notch { position:absolute; top:8px; left:50%; transform:translateX(-50%); width:110px; height:26px; border-radius:20px; background:#11161D; z-index:2; pointer-events:none; }
.scr-prev .pv-loading { position:absolute; inset:0; display:grid; place-items:center; background:#fff; color:var(--ink-3); font-weight:600; transition:opacity .3s; z-index:1; pointer-events:none; }
.scr-prev .pv-loading.is-done { opacity:0; }
.scr-prev .pv-caption { margin:12px 0 0; text-align:center; font-size:13.5px; color:var(--ink-3); }
@media (max-width: 640px) { .scr-prev .pv-stage { padding:10px; border-radius:14px; } .scr-prev .pv-phone { border-radius:38px; padding:9px; } }
`;
  function injectStyle() {
    if (document.getElementById('scr-prev-style')) return;
    const s = document.createElement('style');
    s.id = 'scr-prev-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function siteUrl(slug, opts) {
    const q = new URLSearchParams({ county: slug });
    if (opts.zones) q.set('zones', '1'); else q.set('zones', '0');
    if (opts.layout === 'newsroom') q.set('layout', 'newsroom');
    else if (opts.layout === 'classic') q.set('layout', 'classic');
    return 'index.html?' + q.toString() + (opts.hash || '#/');
  }

  /* Shared preview: used by #/public-hub (Media Hub layout) and #/newsroom (Newsroom layout). */
  function renderPreview(el, ctx, cfg) {
    injectStyle();
    const t = ctx.tenant || {};
    const slug = ctx.tenantSlug || t.slug || 'svgop';
    const S = ctx.state || App.state;
    if (typeof S.hub_zones !== 'boolean') S.hub_zones = false;
    S.hub_device = S.hub_device === 'phone' ? 'phone' : 'desktop';
    const layout = cfg.layout === 'newsroom' ? 'newsroom' : 'classic';
    let settings = {};
    try { settings = (window.Store && Store.get('siteSettings', {})) || {}; } catch (e) { settings = {}; }
    const liveLayout = settings.layout === 'newsroom' ? 'newsroom' : 'classic';
    const label = (l) => (l === 'newsroom' ? 'Newsroom' : 'Media Hub');
    const liveHref = siteUrl(slug, { zones: false, layout: '' }).replace('&zones=0', '');
    el.classList.add('scr-prev');
    el.classList.toggle('pv-zones-on', S.hub_zones);

    el.innerHTML = `
    <div class="page">
      <div class="pv-switch-row">
        <nav class="pv-seg" aria-label="Homepage layout">
          <a href="#/public-hub" class="${layout === 'classic' ? 'is-on' : ''}"${layout === 'classic' ? ' aria-current="page"' : ''}>Media Hub</a>
          <a href="#/newsroom" class="${layout === 'newsroom' ? 'is-on' : ''}"${layout === 'newsroom' ? ' aria-current="page"' : ''}>Newsroom</a>
        </nav>
        <span class="pv-live">Your live site uses the <b>${label(liveLayout)}</b> layout${ctx.can && ctx.can('portal.edit') ? ' · <a href="#/portal">Change it in the Committee Portal</a>' : ''}.</span>
      </div>
      <div class="page-head">
        <div>
          <h1>${esc(cfg.title)}</h1>
          <p>${cfg.lede}</p>
        </div>
        <div class="row">
          <a class="btn btn-primary" href="${esc(liveHref)}" target="_blank" rel="noopener">Open the live site ${IC_OUT}</a>
          ${ctx.can && ctx.can('portal.view') ? '<a class="btn btn-ghost" href="#/portal">Edit your local zones</a>' : ''}
        </div>
      </div>

      <div class="pv-bar" data-tour="hub-zones-toggle">
        <label class="pv-toggle">
          <input type="checkbox" class="toggle" data-pv="zones" ${S.hub_zones ? 'checked' : ''} aria-describedby="pv-zones-sub">
          <span><span class="pv-toggle-title">Show who controls each zone</span>
          <span class="pv-toggle-sub" id="pv-zones-sub">Local zones are the parts of the page your county controls. Network zones are filled by Master Network.</span></span>
        </label>
        <div class="pv-legend" aria-live="polite">
          <span class="is-net"><b data-legend="network">·</b> Network zones · set by Master Network</span>
          <span class="is-loc"><b data-legend="local">·</b> Local zones · set by ${esc(t.shortName || '')}</span>
        </div>
        <div class="pv-tools">
          <div class="pv-seg" role="group" aria-label="Preview width">
            <button type="button" data-device="desktop" class="${S.hub_device === 'desktop' ? 'is-on' : ''}" aria-pressed="${S.hub_device === 'desktop'}">${IC_DESK}Desktop</button>
            <button type="button" data-device="phone" class="${S.hub_device === 'phone' ? 'is-on' : ''}" aria-pressed="${S.hub_device === 'phone'}">${IC_PHONE}Phone</button>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" data-pv="reload" aria-label="Reload the preview">${IC_RELOAD}</button>
        </div>
      </div>

      <div class="pv-stage" data-tour="hub-preview">
        <div class="pv-host"></div>
      </div>
      <p class="pv-caption">This is the real site, live. Changes saved in the Committee Portal or by Master Network show up here within a second.</p>
    </div>`;

    const host = el.querySelector('.pv-host');
    let frame = null, ro = null;

    function fit() {
      if (!frame) return;
      const vp = frame.parentElement;
      if (S.hub_device === 'desktop') {
        const W = 1280;
        const w = vp.clientWidth || W;
        const scale = Math.min(1, w / W);
        const visH = Math.max(420, Math.min(820, Math.round(window.innerHeight * 0.72)));
        vp.style.height = visH + 'px';
        frame.style.width = W + 'px';
        frame.style.height = Math.round(visH / scale) + 'px';
        frame.style.transform = `scale(${scale})`;
      } else {
        const w = Math.min(390, vp.clientWidth || 390);
        const h = Math.round(Math.min(780, Math.max(560, window.innerHeight * 0.74)));
        vp.style.height = h + 'px';
        frame.style.width = w + 'px';
        frame.style.height = h + 'px';
        frame.style.transform = 'none';
      }
    }

    function mount() {
      const src = siteUrl(slug, { zones: S.hub_zones, layout });
      const domain = esc(t.domain || 'your-county.org');
      const shell = S.hub_device === 'desktop'
        ? `<div class="pv-desk"><div class="pv-chrome"><span class="pv-dots" aria-hidden="true"><i></i><i></i><i></i></span>
            <div class="pv-addr">${IC_LOCK}<span>https://${domain}</span></div></div>
            <div class="pv-viewport"><div class="pv-loading">Loading your site…</div></div></div>`
        : `<div class="pv-phone"><div class="pv-viewport"><span class="pv-notch" aria-hidden="true"></span><div class="pv-loading">Loading your site…</div></div></div>`;
      host.innerHTML = shell;
      frame = document.createElement('iframe');
      frame.title = `${t.shortName || 'County'} public website, ${S.hub_device} preview`;
      frame.src = src;
      frame.loading = 'eager';
      frame.addEventListener('load', () => { const l = host.querySelector('.pv-loading'); if (l) l.classList.add('is-done'); });
      host.querySelector('.pv-viewport').appendChild(frame);
      fit();
    }
    mount();

    function onMsg(e) {
      if (e.origin !== location.origin || !e.data || e.data.type !== 'rccc-site' || !frame || e.source !== frame.contentWindow) return;
      const n = el.querySelector('[data-legend="network"]'), l = el.querySelector('[data-legend="local"]');
      if (n) n.textContent = e.data.network;
      if (l) l.textContent = e.data.local;
    }
    window.addEventListener('message', onMsg);
    if ('ResizeObserver' in window) { ro = new ResizeObserver(() => fit()); ro.observe(host); }
    const onResize = () => fit();
    window.addEventListener('resize', onResize);
    /* Stop listening once this screen is replaced. */
    const mo = new MutationObserver(() => {
      if (!el.isConnected) { window.removeEventListener('message', onMsg); window.removeEventListener('resize', onResize); if (ro) ro.disconnect(); mo.disconnect(); }
    });
    if (el.parentNode) mo.observe(el.parentNode, { childList: true });

    el.addEventListener('change', (e) => {
      if (!e.target.matches('[data-pv="zones"]')) return;
      S.hub_zones = e.target.checked;
      el.classList.toggle('pv-zones-on', S.hub_zones);
      if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type: 'rccc-preview', zones: S.hub_zones }, location.origin);
      if (S.hub_zones) App.toast(`Purple zones come from Master Network. ${t.shortName}-colored zones belong to your county.`, 'info');
    });
    el.addEventListener('click', (e) => {
      const d = e.target.closest('[data-device]');
      if (d && d.dataset.device !== S.hub_device) {
        S.hub_device = d.dataset.device;
        el.querySelectorAll('[data-device]').forEach((b) => { const on = b.dataset.device === S.hub_device; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on); });
        mount();
        return;
      }
      if (e.target.closest('[data-pv="reload"]')) mount();
    });
  }

  function render(el, ctx) {
    const t = ctx.tenant || {};
    renderPreview(el, ctx, {
      layout: 'classic',
      title: 'Public Media Hub',
      lede: `This is your county’s home page as voters see it at ${esc(t.domain || '')}. Master Network adds state and national news every day, and your committee controls the county news and endorsements.`,
    });
    // Old shared links (#/public-hub/voter-guide) still open the guide.
    if (ctx.sub === 'voter-guide' && App.voterGuide && App.voterGuide.get(t)) setTimeout(() => App.voterGuide.open(t), 60);
  }

  App.sitePreview = { render: renderPreview, url: siteUrl };

  App.register({
    id: 'public-hub',
    title: 'Public Media Hub',
    group: 'Public Site',
    icon: ICON,
    blurb: 'Your county’s public website, live: news, the voter guide, video, events and endorsed candidates.',
    render,
  });
})();
