/* screens/newsroom.js: the "Newsroom" homepage layout (platform screen).
   Shows the real county site with ?layout=newsroom in the shared live preview from screens/public-hub.js.
   The layout itself lives in site-newsroom.js on the public site. */
(function () {
  'use strict';
  if (!window.App) return;

  const esc = App.util.esc;
  const ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4" width="15" height="11" rx="2"/><path d="M8.5 7.5l4 2-4 2z" fill="currentColor"/><path d="M6 17.5h8"/></svg>';

  function render(el, ctx) {
    const t = ctx.tenant || {};
    if (!App.sitePreview) {
      el.innerHTML = '<div class="page"><div class="card"><div class="card-body"><h2>The preview is loading</h2><p class="muted">Open the Public Media Hub, then come back to this layout.</p></div></div></div>';
      return;
    }
    App.sitePreview.render(el, ctx, {
      layout: 'newsroom',
      title: 'Newsroom homepage',
      lede: `A second front page for ${esc(t.domain || '')}, with live headlines and a video wall around your county’s own news and events. A front page that changes through the day gives voters a reason to come back.`,
    });
  }

  App.register({
    id: 'newsroom',
    title: 'Newsroom homepage',
    group: 'Public Site',
    icon: ICON,
    blurb: 'A second homepage layout with live headlines and conservative video.',
    render,
  });
})();
