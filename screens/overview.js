/* screens/overview.js — Platform overview / module map (Agent 1) */
(function () {
  'use strict';
  if (!window.App) return;

  const I = (d) => `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICON_HOME = I('<path d="M3 9.5L10 4l7 5.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M8 17v-5h4v5"/>');

  const GROUP_ORDER = ['Public Site', 'Committee Portal', 'Candidate Tools', 'Field & Governance', 'Master Network', 'AI Engine'];
  const GROUP_NOTE = {
    'Public Site': 'What voters see at your county’s web address.',
    'Committee Portal': 'Run your county’s website content, local ads and county-to-county network.',
    'Candidate Tools': 'Track the candidate pipeline, then launch each campaign site, print pieces and social posts.',
    'Field & Governance': 'Walk lists, precinct turf, meetings and votes.',
    'Master Network': 'Shared news, ads and resources across every county.',
    'AI Engine': 'An AI (Artificial Intelligence) supervisor that checks every result before anything goes public.',
  };

  /* Fallback cards (title + icon only) shown only if a module script fails to load. */
  const PLACEHOLDERS = [
    { id: 'public-hub', group: 'Public Site', title: 'Public Media Hub',
      icon: I('<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M3 8h14M7 12h6"/>') },
    { id: 'portal', group: 'Committee Portal', title: 'Committee Portal',
      icon: I('<circle cx="7" cy="7" r="2.5"/><circle cx="13.5" cy="8" r="2"/><path d="M2.5 16c.6-2.8 2.4-4.2 4.5-4.2s3.9 1.4 4.5 4.2M11.5 12.3c2.3-.4 4.2.8 5 3.7"/>') },
    { id: 'candidate', group: 'Candidate Tools', title: 'Candidate Launchpad',
      icon: I('<path d="M10 2.8l2 4.2 4.6.6-3.3 3.2.8 4.6L10 13.2l-4.1 2.2.8-4.6L3.4 7.6 8 7z"/>') },
    { id: 'field', group: 'Field & Governance', title: 'Field Organizer',
      icon: I('<path d="M10 17s5-4.4 5-8.5a5 5 0 0 0-10 0C5 12.6 10 17 10 17z"/><circle cx="10" cy="8.5" r="1.8"/>') },
    { id: 'governance', group: 'Field & Governance', title: 'Meetings & Voting',
      icon: I('<path d="M4 8h12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M7 8V5h6v3M8.5 12h3"/>') },
    { id: 'master', group: 'Master Network', title: 'Master Network Console',
      icon: I('<circle cx="10" cy="4.5" r="2"/><circle cx="4.5" cy="15" r="2"/><circle cx="15.5" cy="15" r="2"/><path d="M10 6.5v3M10 9.5L5.5 13.3M10 9.5l4.5 3.8"/>') },
    { id: 'director', group: 'AI Engine', title: 'AI Campaign Director',
      icon: I('<rect x="4" y="6" width="12" height="10" rx="2.5"/><path d="M10 3v3M7.5 11h.01M12.5 11h.01M8 14h4"/>') },
  ];

  const STAR = (x, y, r, fill) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const rr = i % 2 ? r * 0.42 : r;
      pts.push((x + rr * Math.cos(a)).toFixed(1) + ',' + (y + rr * Math.sin(a)).toFixed(1));
    }
    return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
  };

  function diagramDesktop(t) {
    const brand = 'var(--brand)', master = 'var(--master)';
    const cur = t.slug;
    const county = (x, label, sub, active, dashed) => `
      <g>
        <rect x="${x}" y="300" width="200" height="74" rx="12" fill="${active ? brand : 'var(--surface)'}" stroke="${dashed ? 'var(--line-strong)' : brand}" stroke-width="2" ${dashed ? 'stroke-dasharray="6 5"' : ''}/>
        <text x="${x + 100}" y="332" text-anchor="middle" font-family="var(--font-head)" font-weight="800" font-size="19" fill="${active ? 'var(--brand-ink)' : dashed ? 'var(--ink-3)' : brand}">${label}</text>
        <text x="${x + 100}" y="355" text-anchor="middle" font-family="var(--font-body)" font-size="13.5" fill="${active ? 'var(--brand-ink)' : 'var(--ink-3)'}">${sub}</text>
      </g>`;
    const arrow = (x1, y1, x2, y2, col) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="2.2" marker-end="url(#ov-arrow-${col === master ? 'm' : 'b'})"/>`;
    return `
    <svg class="ov-diagram-d" viewBox="0 0 900 430" role="img" aria-labelledby="ov-dg-t">
      <title id="ov-dg-t">The Master Network sends shared news and ads down to the state, and on to each county committee. Each county controls its own local zones.</title>
      <defs>
        <marker id="ov-arrow-m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--master)"/></marker>
        <marker id="ov-arrow-b" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--brand)"/></marker>
      </defs>
      <!-- Master -->
      <rect x="300" y="14" width="300" height="78" rx="14" fill="var(--master)"/>
      ${STAR(336, 53, 15, '#fff')}
      <text x="362" y="49" font-family="var(--font-head)" font-weight="800" font-size="21" fill="#fff">Master Network</text>
      <text x="362" y="72" font-family="var(--font-body)" font-size="14" fill="#fff" opacity=".9">Shared news, ads &amp; resources</text>
      ${arrow(450, 94, 450, 150, master)}
      <text x="466" y="128" font-family="var(--font-body)" font-weight="600" font-size="14.5" fill="var(--master)">Network news &amp; ads flow down</text>
      <!-- State -->
      <rect x="340" y="156" width="220" height="62" rx="12" fill="var(--master-soft)" stroke="var(--master)" stroke-width="2"/>
      <text x="450" y="184" text-anchor="middle" font-family="var(--font-head)" font-weight="800" font-size="19" fill="var(--master)">California</text>
      <text x="450" y="205" text-anchor="middle" font-family="var(--font-body)" font-size="13.5" fill="var(--ink-2)">State &amp; regional channels</text>
      <!-- Branches -->
      <path d="M450 220 V252 M140 252 H760" stroke="var(--master)" stroke-width="2.2" fill="none"/>
      ${arrow(140, 252, 140, 294, master)}
      ${arrow(450, 252, 450, 294, master)}
      ${arrow(760, 252, 760, 294, master)}
      ${county(40, 'SVGOP', 'Santa Clara County', cur === 'svgop', false)}
      ${county(350, 'Demo County GOP', 'Demo County', cur === 'demo', false)}
      ${county(660, '+ more counties', 'Onboarding now', false, true)}
      <!-- Local control -->
      <rect x="40" y="392" width="820" height="32" rx="8" fill="color-mix(in srgb, var(--brand) 8%, white)"/>
      ${STAR(62, 408, 8, 'var(--accent)')}
      <text x="78" y="413" font-family="var(--font-body)" font-weight="600" font-size="14.5" fill="var(--brand)">Each county controls its own local zones: its own news, events, ads, members and data.</text>
    </svg>`;
  }

  function diagramMobile(t) {
    const cur = t.slug;
    const box = (y, label, sub, kind) => {
      const fill = kind === 'master' ? 'var(--master)' : kind === 'state' ? 'var(--master-soft)' : kind === 'active' ? 'var(--brand)' : 'var(--surface)';
      const stroke = kind === 'master' || kind === 'state' ? 'var(--master)' : kind === 'more' ? 'var(--line-strong)' : 'var(--brand)';
      const ink = kind === 'master' ? '#fff' : kind === 'state' ? 'var(--master)' : kind === 'active' ? 'var(--brand-ink)' : kind === 'more' ? 'var(--ink-3)' : 'var(--brand)';
      const subInk = kind === 'master' ? '#fff' : kind === 'active' ? 'var(--brand-ink)' : 'var(--ink-3)';
      return `<rect x="20" y="${y}" width="300" height="56" rx="11" fill="${fill}" stroke="${stroke}" stroke-width="2" ${kind === 'more' ? 'stroke-dasharray="6 5"' : ''}/>
        <text x="170" y="${y + 25}" text-anchor="middle" font-family="var(--font-head)" font-weight="800" font-size="18" fill="${ink}">${label}</text>
        <text x="170" y="${y + 44}" text-anchor="middle" font-family="var(--font-body)" font-size="13" fill="${subInk}">${sub}</text>`;
    };
    return `
    <svg class="ov-diagram-m" viewBox="0 0 340 520" role="img" aria-label="Master Network to California to each county committee. Network news and ads flow down; each county controls its own local zones.">
      <defs><marker id="ov-arrow-mm" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--master)"/></marker></defs>
      ${box(6, 'Master Network', 'Shared news, ads & resources', 'master')}
      <line x1="170" y1="64" x2="170" y2="106" stroke="var(--master)" stroke-width="2.2" marker-end="url(#ov-arrow-mm)"/>
      <text x="182" y="90" font-family="var(--font-body)" font-weight="600" font-size="13" fill="var(--master)">News &amp; ads flow down</text>
      ${box(112, 'California', 'State & regional channels', 'state')}
      <line x1="170" y1="170" x2="170" y2="204" stroke="var(--master)" stroke-width="2.2" marker-end="url(#ov-arrow-mm)"/>
      ${box(210, 'SVGOP', 'Santa Clara County', cur === 'svgop' ? 'active' : 'county')}
      ${box(276, 'Demo County GOP', 'Demo County', cur === 'demo' ? 'active' : 'county')}
      ${box(342, '+ more counties', 'Onboarding now', 'more')}
      <rect x="20" y="414" width="300" height="96" rx="10" fill="color-mix(in srgb, var(--brand) 8%, white)"/>
      ${STAR(44, 440, 9, 'var(--accent)')}
      <text font-family="var(--font-body)" font-weight="600" font-size="14" fill="var(--brand)">
        <tspan x="60" y="445">Each county controls its</tspan>
        <tspan x="60" y="466">own local zones: news, events,</tspan>
        <tspan x="60" y="487">ads, members and data.</tspan>
      </text>
    </svg>`;
  }

  function moduleCard(s, real) {
    const esc = App.util.esc;
    const master = s.group === 'Master Network';
    return `<div class="card ov-mod${real ? '' : ' is-placeholder'}">
      <div class="ov-mod-top">
        <span class="ov-mod-icon${master ? ' is-master' : ''}">${s.icon || ICON_HOME}</span>
        <div class="ov-mod-titles">
          <span class="ov-mod-group">${esc(s.group)}</span>
          <h4>${esc(s.title)}</h4>
        </div>
      </div>
      ${real && s.blurb ? `<p>${esc(s.blurb)}</p>` : '<p class="muted">Coming in this prototype.</p>'}
      <div class="row">
        ${real ? `<button class="btn btn-sm btn-primary" data-open="${esc(s.id)}">Open</button>` : ''}
        <span class="spacer"></span>
        ${master ? '<span class="badge badge-master">Network</span>' : '<span class="badge badge-local">Your county</span>'}
      </div>
    </div>`;
  }

  function moduleMap() {
    const registered = App.registry.filter((s) => s.id !== 'overview');
    const realIds = new Set(registered.map((s) => s.id));
    const cards = [];
    GROUP_ORDER.forEach((g) => {
      registered.filter((s) => s.group === g).forEach((s) => cards.push(moduleCard(s, true)));
      PLACEHOLDERS.filter((p) => p.group === g && !realIds.has(p.id)).forEach((p) => cards.push(moduleCard(p, false)));
    });
    const legend = GROUP_ORDER.map((g) => `<div class="ov-legend-item"><strong>${App.util.esc(g)}</strong> <span class="muted">${App.util.esc(GROUP_NOTE[g])}</span></div>`).join('');
    return `<div class="ov-legend small">${legend}</div><div class="grid-3 ov-mod-grid">${cards.join('')}</div>`;
  }

  function kpis(t) {
    const s = t.stats || {};
    const u = App.util;
    const tile = (v, label, note) => `<div class="kpi"><div class="kpi-value">${v}</div><div class="kpi-label">${label}</div>${note ? `<div class="small muted" style="margin-top:4px">${note}</div>` : ''}</div>`;
    return `<div class="grid-3">
      ${tile(s.visitors7d != null ? u.fmtNum(s.visitors7d) : '—', 'Website visitors, last 7 days', 'Across news, events and candidate pages')}
      ${tile(s.volunteers != null ? u.fmtNum(s.volunteers) : '—', 'Active volunteers', s.newsletter != null ? `${u.fmtNum(s.newsletter)} newsletter subscribers` : '')}
      ${tile(s.donationsUsd != null ? u.fmtUsd(s.donationsUsd) : '—', 'Raised online this cycle', 'Through the county donate page')}
    </div>`;
  }

  App.register({
    id: 'overview',
    title: 'Platform overview',
    group: 'Overview',
    icon: ICON_HOME,
    blurb: 'One platform for every county committee.',
    render(el, ctx) {
      const t = ctx.tenant || {};
      const esc = App.util.esc;
      const bigStar = `<svg class="ov-hero-stars" viewBox="0 0 100 100" aria-hidden="true">${STAR(50, 52, 48, 'currentColor')}</svg>`;
      el.innerHTML = `
      <div class="page">
        <section class="ov-hero" data-tour="overview-hero">
          ${bigStar}
          <span class="ov-hero-county">${esc(t.name || '')}</span>
          <h1>One platform for every county committee</h1>
          <p>Your website, member tools, candidate sites, walk lists and meetings, all in one place. Volunteers save hours each week, and your county keeps full control of its own site and data.</p>
          <div class="row">
            <button class="btn btn-primary" data-act="tour">Start guided tour</button>
            <button class="btn btn-outline" data-act="explore">Explore freely</button>
          </div>
        </section>

        <div class="stack">
          <div class="page-head" style="margin-bottom:0">
            <div>
              <h2 style="margin-bottom:2px">${esc(t.shortName || '')} at a glance</h2>
              <p class="small muted">Sample figures for this committee. Switch committees at the top to compare.</p>
            </div>
          </div>
          ${kpis(t)}
        </div>

        <section class="ov-section">
          <h2>How the network works</h2>
          <p class="ov-lede">The network shares what every county needs. Each county decides what appears on its own pages.</p>
          <div class="card ov-diagram">${diagramDesktop(t)}${diagramMobile(t)}</div>
        </section>

        <section class="ov-section">
          <div class="explain"><strong>Why this matters for your committee.</strong> Most county committees run on volunteers who change every cycle. A shared platform keeps the website, member list and campaign tools working year after year, so new officers pick up right where the last team left off.</div>
        </section>

        <section class="ov-section" id="ov-modules" data-tour="module-map">
          <h2>What’s inside</h2>
          <p class="ov-lede">Open any area to try it with ${esc(t.shortName || 'your county')}’s sample data.</p>
          ${moduleMap()}
        </section>
      </div>`;

      el.addEventListener('click', (e) => {
        const open = e.target.closest('[data-open]');
        if (open) { ctx.navigate(open.dataset.open); return; }
        const act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'tour') App.startTour();
        if (act.dataset.act === 'explore') {
          const m = el.querySelector('#ov-modules');
          if (m) m.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    },
  });
})();
