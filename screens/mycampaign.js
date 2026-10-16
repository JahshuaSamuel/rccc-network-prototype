/* screens/mycampaign.js: My Campaign, the candidate's own home (#/mycampaign).
   Open to candidate accounts (their one campaign only) and to the executive board and Master Network,
   who pick a candidate to support. Reuses the builder, print studio and social planner from
   screens/candidate.js (App.campaignKit). Every query here is scoped to one campaign slug or candidate id.
   Sub-routes: '' overview · site · people · outreach · print · social · events · team
   Store: siteSuggestions, eventProposals (written here), invites (through App.auth.createInvite). */
(function () {
  'use strict';
  if (!window.App) return;
  const U = App.util;
  const esc = U.esc;
  const ICON = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2.5l2.2 4.6 5 .7-3.6 3.5.9 5L10 13.9l-4.5 2.4.9-5L2.8 7.8l5-.7z"/></svg>';

  const SUBS = [
    ['', 'Overview'], ['site', 'My site'], ['people', 'People'], ['outreach', 'Outreach'],
    ['print', 'Print'], ['social', 'Social'], ['events', 'Events'], ['team', 'Team'],
  ];

  function css() {
    if (document.getElementById('scr-mc-style')) return;
    const s = document.createElement('style');
    s.id = 'scr-mc-style';
    s.textContent = `
.scr-mc .mc-hero { position: relative; overflow: hidden; display: flex; gap: 16px; align-items: center; padding: 22px 22px 20px; border-radius: var(--r-lg); background: var(--mc-b); color: #fff; margin-bottom: 18px; box-shadow: 0 24px 40px -30px rgba(21,32,46,.6); }
.scr-mc .mc-hero::after { content: ''; position: absolute; right: -60px; top: -60px; width: 220px; height: 220px; border-radius: 50%; background: color-mix(in srgb, var(--mc-a) 55%, transparent); opacity: .35; }
.scr-mc .mc-hero > * { position: relative; z-index: 1; }
.scr-mc .mc-hero .cb-ph { box-shadow: 0 0 0 3px #fff, 0 0 0 6px var(--mc-a); }
.scr-mc .mc-hero h1 { color: #fff; margin: 0 0 4px; font-size: clamp(1.7rem, 1.2rem + 2vw, 2.4rem); }
.scr-mc .mc-eyebrow { margin: 0; font: 700 12.5px/1.3 var(--font-body); letter-spacing: .08em; text-transform: uppercase; opacity: .85; }
.scr-mc .mc-sub { margin: 0; opacity: .92; font-size: 15px; }
.scr-mc .mc-hero::after { pointer-events: none; }
@media (max-width: 640px) { .scr-mc .mc-hero { padding: 18px; } }
.scr-mc .mc-support { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; margin-bottom: 14px; padding: 10px 14px; border-radius: var(--r); background: var(--info-soft); color: #173E66; font-size: 14.5px; }
.scr-mc .mc-line { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 22px; padding: 12px 16px; margin-bottom: 18px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); font-size: 14.5px; color: var(--ink-2); }
.scr-mc .mc-line-site { text-decoration: none; }
.scr-mc .mc-line-money { flex: 1 1 260px; min-width: 0; display: flex; align-items: center; gap: 12px; }
.scr-mc .mc-line-money > span { white-space: nowrap; }
.scr-mc .mc-line-money b, .scr-mc .mc-line-days b { font: 800 1.15rem/1 var(--font-head); color: var(--ink); font-variant-numeric: tabular-nums; }
.scr-mc .mc-line-money .cb-bar { flex: 1; min-width: 80px; margin: 0; }
@media (max-width: 640px) { .scr-mc .mc-line-money { flex-basis: 100%; flex-wrap: wrap; gap: 6px; } .scr-mc .mc-line-money .cb-bar { flex-basis: 100%; } }
.scr-mc .mc-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 18px; align-items: start; }
@media (max-width: 1000px) { .scr-mc .mc-grid { grid-template-columns: minmax(0, 1fr); } }
.scr-mc .mc-notice { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: var(--r); background: var(--warn-soft); color: #5C3A00; margin-bottom: 16px; font-size: 14.5px; }
.scr-mc .mc-notice svg { flex: none; margin-top: 1px; color: var(--warn); }
.scr-mc .mc-todo { list-style: none; margin: 0; padding: 0; }
.scr-mc .mc-todo li { display: flex; gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid var(--line); animation: cbIn .3s ease both; }
.scr-mc .mc-todo li:first-child { border-top: 0; padding-top: 0; }
.scr-mc .mc-todo .n { width: 30px; height: 30px; border-radius: 50%; flex: none; display: inline-flex; align-items: center; justify-content: center; font: 800 14px/1 var(--font-body); background: color-mix(in srgb, var(--brand) 10%, white); color: var(--brand); }
.scr-mc .mc-todo .t { flex: 1; min-width: 0; font-size: 15px; }
.scr-mc .mc-todo .t small { display: block; color: var(--ink-3); font-size: 13px; }
.scr-mc .mc-sug { border: 1px solid var(--line); border-radius: var(--r); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; animation: cbIn .3s ease both; }
.scr-mc .mc-sug + .mc-sug { margin-top: 10px; }
.scr-mc .mc-sug-h { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; font-size: 14px; color: var(--ink-3); }
.scr-mc .mc-sug-h b { color: var(--ink); font-size: 15px; }
.scr-mc .mc-diff { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; font-size: 14.5px; }
.scr-mc .mc-diff div { padding: 8px 10px; border-radius: 8px; overflow-wrap: anywhere; }
.scr-mc .mc-diff .from { background: var(--surface-2); color: var(--ink-3); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--ink-3) 50%, transparent); }
.scr-mc .mc-diff .to { background: var(--ok-soft); color: #0F4A28; font-weight: 600; }
.scr-mc .mc-sug .row .btn { min-height: 44px; }
.scr-mc .mc-coming { text-align: center; padding: 34px 20px; }
.scr-mc .mc-coming .spinner { margin: 0 auto 12px; }
.scr-mc .mc-ev { display: flex; gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid var(--line); }
.scr-mc .mc-ev:first-child { border-top: 0; padding-top: 0; }
.scr-mc .mc-date { width: 54px; flex: none; text-align: center; border-radius: 10px; background: var(--mc-b); color: #fff; padding: 6px 0; line-height: 1.1; }
.scr-mc .mc-date b { display: block; font: 800 1.35rem/1.05 var(--font-head); }
.scr-mc .mc-date small { font-size: 11.5px; text-transform: uppercase; letter-spacing: .06em; }
@media (max-width: 640px), (pointer: coarse) {
.scr-cand .mc-line-site, .scr-mc .mc-line-site { display: inline-flex; align-items: center; min-height: 44px; }
.scr-mc .chip, .scr-mc .cb-seg button, .scr-mc .btn-sm { min-height: 44px; min-width: 44px; }
}
`;
    document.head.appendChild(s);
  }

  /* ---------- scope: one campaign ---------- */
  function scope(ctx) {
    const K = App.campaignKit;
    const all = K.candidates(ctx);
    const camp = App.auth && App.auth.campaign ? App.auth.campaign() : null;
    if (camp) {
      const c = all.find((x) => x.id === camp.candidateId) || all.find((x) => K.view(x, ctx).slug === camp.slug) || null;
      return { c, self: true, owner: camp.role === 'owner', role: camp.role, list: c ? [c] : [] };
    }
    const sel = (App.state.mc_sel = App.state.mc_sel || {});
    const c = all.find((x) => x.id === sel[ctx.tenantSlug]) || all.find((x) => K.ownerInfo(ctx, x).owned) ||
      all.find((x) => x.status === 'ENDORSED' || x.status === 'ACTIVE_CAMPAIGN') || all[0] || null;
    if (c) sel[ctx.tenantSlug] = c.id;
    return { c, self: false, owner: false, role: 'board', list: all };
  }

  function weekAgo() { return Date.now() - 7 * 86400000; }

  /* ---------- overview ---------- */
  function suggestionCards(ctx, S, d) {
    const K = App.campaignKit;
    const list = K.suggestionsFor(d.slug, 'pending');
    if (!list.length) return '';
    return list.map((x) => `<div class="mc-sug" data-sugcard="${esc(x.id)}">
      <div class="mc-sug-h"><b>${esc(K.SUGGEST_LABEL[x.field] || x.field)}</b><span>from ${esc(x.by || 'the committee')} · ${esc(K.fmtStamp(x.at || x.createdAt))}</span></div>
      <div class="mc-diff"><div class="from">${esc(K.fmtVal(x.field, x.from))}</div><div class="to">${esc(K.fmtVal(x.field, x.to))}</div></div>
      ${S.self ? `<div class="row"><button type="button" class="btn btn-primary btn-sm" data-accept="${esc(x.id)}">Accept</button><button type="button" class="btn btn-sm" data-decline="${esc(x.id)}">Decline</button></div>` : '<span class="small muted">Waiting for the campaign to accept or decline.</span>'}
    </div>`).join('');
  }

  function renderOverview(root, ctx, S, d) {
    const K = App.campaignKit;
    const c = S.c;
    const site = K.siteOf(c) || {};
    const st = K.siteState(c, K.siteOf(c));
    const vols = Store.list('volunteers').filter((v) => v.campaign === d.slug);
    const weekVols = vols.filter((v) => new Date(v.createdAt).getTime() >= weekAgo()).length;
    const saved = Store.list('donations').filter((x) => x.campaign === d.slug).reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const raised = (c.raisedUsd || 0) + saved;
    const goal = c.goalUsd || 0;
    const pct = goal ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
    const sugs = K.suggestionsFor(d.slug, 'pending');
    const bl = K.blockers(d);
    const { plan, saved: planSaved } = K.planFor(c, d, ctx);
    const drafts = plan.posts.filter((p) => p.status !== 'approved').length;
    const crmTasks = Store.list('tasks').filter((t) => t.owner === 'campaign:' + d.slug && !t.done).length;
    const you = S.self;
    const todo = [];
    if (sugs.length) todo.push([sugs.length, you ? `Review ${sugs.length} ${sugs.length === 1 ? 'suggestion' : 'suggestions'} from the committee` : `${sugs.length} ${sugs.length === 1 ? 'suggestion waits' : 'suggestions wait'} for ${K.firstName(c.name)}`, 'Accept or decline each one below.', '#/mycampaign']);
    if (bl.length) todo.push([bl.length, `Fix ${bl.length} required ${bl.length === 1 ? 'check' : 'checks'} on ${you ? 'your' : 'the'} site`, bl.map((x) => x.label).join('; '), '#/mycampaign/site']);
    if (st.key !== 'live' && !bl.length) todo.push([1, `Publish ${you ? 'your' : 'the'} site`, 'Every required check passes.', '#/mycampaign/site']);
    if (drafts) todo.push([drafts, `Approve ${drafts} social ${drafts === 1 ? 'post' : 'posts'} for next week`, planSaved ? 'Edit the wording, then approve.' : 'Suggested posts are ready to edit.', '#/mycampaign/social']);
    if (crmTasks) todo.push([crmTasks, `${crmTasks} follow-up ${crmTasks === 1 ? 'task' : 'tasks'} in People`, '', '#/mycampaign/people']);
    const vRecent = vols.slice(-5).reverse();

    root.insertAdjacentHTML('beforeend', `
      ${site.endorsementPaused ? `<div class="mc-notice" role="status">${K.IC.warn}<span><b>The committee paused ${you ? 'your' : 'this'} endorsement.</b> The endorsement badge is hidden on ${you ? 'your' : 'the'} site for now. Reason given: “${esc((site.endorsementPause || {}).reason || '')}”</span></div>` : ''}
      <div class="mc-line" role="group" aria-label="Campaign at a glance">
        <a class="mc-line-site" href="#/mycampaign/site"><span class="badge ${esc(st.cls)}">${esc(st.key === 'live' ? 'Site live' : st.key === 'review' ? 'Site in review' : st.key === 'hold' ? 'Site on hold' : 'Site draft')}</span></a>
        <div class="mc-line-money"><span><b>${U.fmtUsd(raised)}</b> raised of ${U.fmtUsd(goal)}</span><div class="cb-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${pct}% of goal"><span style="width:${pct}%"></span></div></div>
        <span class="mc-line-days"><b>${Math.max(0, K.daysUntil(d.electionDate))}</b> days to Election Day</span>
      </div>
      <div class="mc-grid">
        <div class="stack">
          <div class="card"><div class="card-head"><h3>${you ? 'What needs you' : 'What needs the campaign'}</h3></div><div class="card-body">
            ${todo.length ? `<ul class="mc-todo">${todo.map(([n, t, sub, href]) => `<li><span class="n">${n}</span><span class="t">${esc(t)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><a class="btn btn-sm" href="${href}">Open</a></li>`).join('')}</ul>`
              : `<p class="muted" style="margin:0">${you ? 'You’re caught up.' : 'The campaign is caught up.'} New volunteers and committee suggestions show up here.</p>`}
          </div></div>
          ${sugs.length ? `<div class="card" id="mc-suggestions" data-tour="mycampaign-suggestions"><div class="card-head"><h3>Committee suggestions</h3><span class="badge badge-warn">${sugs.length}</span></div><div class="card-body" data-sugs>${suggestionCards(ctx, S, d)}</div></div>` : ''}
        </div>
        <div class="stack">
          <div class="card"><div class="card-head"><h3>New volunteers</h3><span class="badge">${weekVols} this week</span></div><div class="card-body">
            ${vRecent.length ? `<ul class="cb-vlist">${vRecent.map((v) => `<li><b>${esc(v.name)}</b><br><span class="small muted">${esc((v.interests || []).join(', ') || 'Any task')} · ${esc(K.fmtStamp(v.createdAt))}</span></li>`).join('')}</ul>`
              : `<p class="muted" style="margin:0">No sign-ups yet. Share ${you ? 'your' : 'the'} site link and they show here.</p>`}
            <div class="row" style="margin-top:12px"><a class="btn btn-sm" href="${esc(d.url)}" target="_blank" rel="noopener">${K.IC.out} Open ${you ? 'your' : 'the'} site</a><button type="button" class="btn btn-ghost btn-sm" data-copylink>${K.IC.copy} Copy link</button></div>
          </div></div>
          ${S.self ? '' : K.committeePanelHtml(ctx, c)}
        </div>
      </div>`);
    if (!S.self) K.wireCommitteePanel(root, ctx, c);
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-copylink]')) { K.copyText(d.url, 'Link copied.'); return; }
      const a = e.target.closest('[data-accept]'), dc = e.target.closest('[data-decline]');
      if (!(a || dc) || !S.self) return;
      const r = K.decideSuggestion(ctx, (a || dc).dataset[a ? 'accept' : 'decline'], !!a);
      ctx.toast(r === 'applied' ? 'Accepted. Your site shows the change now.' : r === 'private' ? 'Accepted. Your site is private until the “Paid for by” check passes again.' : 'Declined. The committee sees your answer.', r === 'private' ? 'warn' : 'ok');
      App.rerender();
    });
  }

  /* ---------- CRM mounts ---------- */
  function renderCrm(root, ctx, S, d, which) {
    const K = App.campaignKit;
    const box = document.createElement('div');
    root.appendChild(box);
    if (!S.self) {
      box.innerHTML = `<div class="card"><div class="card-body"><h3>${esc(K.firstName(S.c.name))}’s ${which === 'people' ? 'people' : 'outreach'} stay private</h3><p class="muted" style="margin:0">A campaign is a separate committee under the law, so its volunteer and donor records are kept apart from the county party’s. Only ${esc(K.firstName(S.c.name))}’s campaign team can open them.</p></div></div>`;
      return;
    }
    const fn = App.crmUI && (which === 'people' ? App.crmUI.mountPeople : App.crmUI.mountOutreach);
    if (typeof fn === 'function') {
      try { fn(box, ctx, { owner: 'campaign:' + d.slug }); return; } catch (err) { console.error('[mycampaign] CRM mount', err); }
    }
    const vols = Store.list('volunteers').filter((v) => v.campaign === d.slug).slice().reverse();
    box.innerHTML = `<div class="card mc-coming"><div class="spinner" aria-hidden="true"></div><h3>${which === 'people' ? 'Your people list is coming online' : 'Your outreach tools are coming online'}</h3>
      <p class="muted" style="max-width:52ch;margin:0 auto">${which === 'people' ? 'Every volunteer from your site will be in it, with notes, tags and follow-ups.' : 'You’ll send email and texts to your own lists from here.'} Reload this page to try again.</p></div>
      ${which === 'people' && vols.length ? `<div class="card cb-mt"><div class="card-head"><h3>Volunteers from your site</h3><span class="badge">${vols.length}</span></div><div class="card-body"><ul class="cb-vlist">${vols.map((v) => `<li><b>${esc(v.name)}</b> · ${esc(v.contact)}${v.zip ? ' · ' + esc(v.zip) : ''}<br><span class="small muted">${esc((v.interests || []).join(', ') || 'Any task')} · ${esc(K.fmtStamp(v.createdAt))}</span></li>`).join('')}</ul></div></div>` : ''}`;
  }

  /* ---------- events ---------- */
  function renderEvents(root, ctx, S, d) {
    const K = App.campaignKit;
    const props = Store.list('eventProposals').filter((x) => x.campaignSlug === d.slug).slice().reverse();
    const listed = Store.list('events').filter((x) => x.campaign === d.slug);
    const today = new Date(); today.setDate(today.getDate() + 1);
    const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const badge = { pending: ['badge-warn', 'Waiting for the committee'], listed: ['badge-ok', 'On the county site'], declined: ['', 'Not listed'] };
    root.insertAdjacentHTML('beforeend', `
      <div class="mc-grid">
        <div class="card"><div class="card-head"><h3>Propose an event</h3></div><div class="card-body">
          <p class="muted" style="margin-top:0">The committee reviews it and lists it on the ${esc(ctx.tenant.shortName)} site. ${S.self ? 'You' : 'The campaign'} can still promote it right away.</p>
          <form class="cb-form" data-evform novalidate>
            <label class="cb-field full"><span class="lbl">Event name</span><input class="input" name="title" maxlength="80" required placeholder="Coffee with ${esc(K.firstName(S.c.name))}"></label>
            <label class="cb-field"><span class="lbl">Date</span><input class="input" type="date" name="date" min="${minDate}" required></label>
            <label class="cb-field"><span class="lbl">Start time</span><input class="input" type="time" name="time" value="18:00" required></label>
            <label class="cb-field full"><span class="lbl">Place</span><input class="input" name="location" maxlength="120" required placeholder="Name and street address"></label>
            <label class="cb-field full"><span class="lbl">Note for the committee <span class="cnt">optional</span></span><textarea class="textarea" name="note" rows="2"></textarea></label>
            <p class="small full" data-everr role="alert" style="margin:0;color:var(--danger);font-weight:600"></p>
            <div class="full"><button class="btn btn-primary" type="submit">Send to the committee</button></div>
          </form>
        </div></div>
        <div class="card"><div class="card-head"><h3>${S.self ? 'Your events' : 'Campaign events'}</h3><span class="badge">${props.length}</span></div><div class="card-body">
          ${props.length ? props.map((x) => { const b = badge[x.status] || ['', x.status]; const dt = new Date(x.date + 'T12:00:00'); return `<div class="mc-ev"><div class="mc-date"><small>${esc(dt.toLocaleDateString('en-US', { month: 'short' }))}</small><b>${dt.getDate()}</b></div>
            <div style="flex:1;min-width:0"><b>${esc(x.title)}</b><br><span class="small muted">${esc(x.location)}</span><br><span class="badge ${b[0]}">${b[1]}</span></div></div>`; }).join('')
            : `<p class="muted" style="margin:0">No events yet. ${listed.length ? '' : 'Proposed events show here with the committee’s answer.'}</p>`}
        </div></div>
      </div>`);
    root.querySelector('[data-evform]').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const v = { title: f.title.value.trim(), date: f.date.value, time: f.time.value, location: f.location.value.trim(), note: f.note.value.trim() };
      const err = v.title.length < 4 ? 'Give the event a name.' : !v.date ? 'Pick a date.' : v.date < minDate ? 'Pick a date after today.' : v.location.length < 4 ? 'Add where it is.' : '';
      f.querySelector('[data-everr]').textContent = err;
      if (err) return;
      Store.add('eventProposals', Object.assign(v, { campaignSlug: d.slug, candidateId: S.c.id, status: 'pending', by: ctx.user ? ctx.user.name : null }));
      ctx.toast(`Sent to the committee. “${v.title}” shows on the county site once they list it.`, 'ok');
      App.rerender();
    });
  }

  /* ---------- team ---------- */
  function renderTeam(root, ctx, S, d) {
    const K = App.campaignKit;
    const own = K.ownerInfo(ctx, S.c);
    const people = own.owners.concat(own.staff);
    const inv = own.invites.filter((i) => i.campaignRole === 'staff').slice().reverse();
    const me = ctx.user || {};
    const badge = { sent: ['badge-warn', 'Invite sent'], claimed: ['badge-ok', 'Accepted'], revoked: ['', 'Revoked'] };
    root.insertAdjacentHTML('beforeend', `
      <div class="mc-grid">
        <div class="card"><div class="card-head"><h3>${S.self ? 'Your team' : 'Campaign team'}</h3><span class="badge">${people.length}</span></div><div class="card-body">
          ${people.length ? `<ul class="cb-vlist">${people.map((a) => `<li><b>${esc(a.name)}${a.id === me.id ? ' (you)' : ''}</b> · ${a.campaignRole === 'staff' ? 'Staff' : 'Owner'}<br><span class="small muted">${esc(a.email || '')}</span>
            ${S.owner && a.campaignRole === 'staff' ? `<div class="row" style="margin-top:6px"><button type="button" class="btn btn-ghost btn-sm" data-rmstaff="${esc(a.id)}">Remove from the campaign</button></div>` : ''}</li>`).join('')}</ul>`
            : '<p class="muted" style="margin:0">No one has accepted an invite yet.</p>'}
          ${inv.length ? `<h4 class="cb-mt">Staff invites</h4><ul class="cb-vlist">${inv.map((i) => { const b = badge[i.status] || ['', i.status]; return `<li><span class="badge ${b[0]}">${b[1]}</span> ${esc(i.email)}${S.owner && i.status === 'sent' ? `<div class="row" style="margin-top:6px"><button type="button" class="btn btn-sm" data-copyinv="${esc(i.id)}">${K.IC.copy} Copy invite link</button><button type="button" class="btn btn-sm" data-resendinv="${esc(i.id)}">Resend</button><button type="button" class="btn btn-ghost btn-sm" data-revinv="${esc(i.id)}">Revoke</button></div>` : ''}</li>`; }).join('')}</ul>` : ''}
        </div></div>
        <div class="card"><div class="card-head"><h3>Invite staff</h3></div><div class="card-body">
          ${S.owner ? `<p class="muted" style="margin-top:0">Staff can edit your site, print pieces, posts and people. Only you can invite or remove staff.</p>
            <form class="stack" style="gap:10px" data-staffform novalidate>
              <label class="cb-field"><span class="lbl">Email</span><input class="input" name="email" type="email" autocomplete="off" required></label>
              <label class="cb-field"><span class="lbl">Mobile number</span><input class="input" name="phone" type="tel" inputmode="tel" autocomplete="off" required></label>
              <p class="small" data-stafferr role="alert" style="margin:0;color:var(--danger);font-weight:600"></p>
              <button class="btn btn-primary" type="submit">Send invite</button>
            </form>`
            : `<p class="muted" style="margin:0">${S.self ? 'Only the campaign owner can invite or remove staff. Ask them to add someone.' : `${esc(K.firstName(S.c.name))} invites campaign staff. The board sends the owner invite from Campaign-in-a-Box.`}</p>`}
        </div></div>
      </div>`);
    if (!S.owner) return;
    const form = root.querySelector('[data-staffform]');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const V = (App.auth && App.auth.validate) || {};
      const email = form.email.value.trim(), phone = form.phone.value.trim();
      const err = (V.email ? V.email(email) : '') || (V.phone ? V.phone(phone) : '');
      form.querySelector('[data-stafferr]').textContent = err;
      if (err) return;
      const r = App.auth.createInvite({ email, phone, role: 'candidate', candidateId: S.c.id, campaignSlug: d.slug, campaignRole: 'staff' });
      if (!r || !r.ok) { form.querySelector('[data-stafferr]').textContent = (r && r.error) || 'The invite didn’t send. Try again.'; return; }
      App.rerender();
    });
    root.addEventListener('click', (e) => {
      const cp = e.target.closest('[data-copyinv]');
      if (cp) { const i = own.invites.find((x) => x.id === cp.dataset.copyinv); if (i) K.copyText(K.inviteLink(i), 'Invite link copied.'); return; }
      const rs = e.target.closest('[data-resendinv]');
      if (rs) { const r = App.auth.resendInvite(rs.dataset.resendinv); if (!r || !r.ok) ctx.toast((r && r.error) || 'The invite could not be resent.', 'warn'); return; }
      const rv = e.target.closest('[data-revinv]');
      if (rv) {
        const r = App.auth.revokeInvite(rv.dataset.revinv);
        if (!r || !r.ok) { ctx.toast((r && r.error) || 'The invite could not be revoked.', 'warn'); return; }
        ctx.toast('Invite revoked. The link no longer works.', 'info'); App.rerender(); return;
      }
      const rm = e.target.closest('[data-rmstaff]');
      if (rm) {
        const a = people.find((x) => x.id === rm.dataset.rmstaff);
        if (!a) return;
        ctx.modal({ title: `Remove ${a.name}?`, html: `<p>${esc(a.name)} loses access to your campaign right away. Their account stays, as a supporter account.</p>`,
          actions: [{ label: 'Keep' }, { label: 'Remove', primary: true, onClick: () => {
            const r = App.auth.removeCampaignMember(a.id);
            if (!r || !r.ok) { ctx.toast((r && r.error) || 'That person could not be removed.', 'warn'); return; }
            ctx.toast(`${a.name} no longer has access to your campaign.`, 'info'); App.rerender();
          } }] });
      }
    });
  }

  /* ---------- register ---------- */
  ['siteSuggestions', 'campaignSites', 'volunteers', 'invites', 'eventProposals'].forEach((n) => Store.on(n, (dt) => {
    if (!dt || dt.type !== 'external') return;
    const r = App.route;
    if (r.id === 'mycampaign' && !/^(site|social|people|outreach)/.test(r.sub)) App.rerender();
  }));

  App.register({
    id: 'mycampaign',
    title: 'My Campaign',
    group: 'My Campaign',
    minRole: 'candidate',
    icon: ICON,
    blurb: 'Your campaign site, volunteers, print pieces, posts and team.',
    render(el, ctx) {
      const K = App.campaignKit;
      if (!K) { el.innerHTML = '<div class="page"><div class="card mc-coming"><div class="card-body"><h2>Loading your campaign</h2><p class="muted">This usually takes a second.</p></div></div></div>'; return; }
      K.injectStyle(); css();
      const sub = SUBS.some((s) => s[0] === String(ctx.sub || '').split('/')[0]) ? String(ctx.sub || '').split('/')[0] : '';
      if (sub !== 'site') K.flushSave();
      if (sub !== 'print') K.dropPrintRoot();
      const S = scope(ctx);
      const root = document.createElement('div');
      root.className = 'page scr-cand scr-mc';
      el.appendChild(root);
      if (!S.c) {
        root.innerHTML = `<div class="card"><div class="card-body"><h2>We couldn’t find your campaign</h2><p class="muted">Your account isn’t linked to a campaign in ${esc(ctx.tenant.shortName)}. Ask the committee to send a new invite.</p></div></div>`;
        return;
      }
      const d = K.view(S.c, ctx);
      const st = K.siteState(S.c, K.siteOf(S.c));
      root.style.setProperty('--mc-b', d.colors.brand);
      root.style.setProperty('--mc-a', d.colors.accent);
      const first = K.firstName(S.c.name);
      root.innerHTML = `
        ${S.self ? '' : `<div class="mc-support"><span>You’re supporting this campaign ${ctx.role === 'master' ? 'for Master Network' : 'as a board member'}. Committee edits go to the candidate as suggestions.</span><span class="spacer"></span>
          <label class="cb-picker"><span>Campaign</span><select class="select" data-mcpick aria-label="Campaign">${S.list.map((x) => `<option value="${esc(x.id)}"${x.id === S.c.id ? ' selected' : ''}>${esc(x.name)}, ${esc(x.office)}</option>`).join('')}</select></label></div>`}
        <header class="mc-hero" data-tour="mycampaign-overview">
          ${K.photoTag(d, 72)}
          <div style="min-width:0"><p class="mc-eyebrow">${esc(d.office)} · ${esc(d.district)}</p>
            <h1>${S.self ? `Hi, ${esc(first)}` : esc(S.c.name)}</h1>
            <p class="mc-sub">${S.self ? (st.key === 'live' ? 'Your site is live.' : 'Your site is private until you publish it.') : `${esc(first)}’s site is ${st.key === 'live' ? 'live' : 'not public yet'}.`}${S.self && S.role === 'staff' ? ' You’re on the campaign staff.' : ''}</p></div>
        </header>
        <nav class="tabs cb-tabs" aria-label="My Campaign sections">
          ${SUBS.map(([id, label]) => `<a class="tab${id === sub ? ' active' : ''}" href="#/mycampaign${id ? '/' + id : ''}"${id === sub ? ' aria-current="page"' : ''}>${esc(S.self || id !== 'site' ? label : 'Site')}</a>`).join('')}
        </nav>`;
      const tabs = root.querySelector('.cb-tabs');
      const act = tabs.querySelector('.tab.active');
      const tabEnd = () => tabs.classList.toggle('at-end', tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 4);
      if (act && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = Math.max(0, act.offsetLeft - (tabs.clientWidth - act.offsetWidth) / 2);
      tabEnd(); tabs.addEventListener('scroll', tabEnd, { passive: true });
      const pk = root.querySelector('[data-mcpick]');
      if (pk) pk.addEventListener('change', (e) => { App.state.mc_sel[ctx.tenantSlug] = e.target.value; App.rerender(); });

      const links = { print: '#/mycampaign/print', social: '#/mycampaign/social' };
      if (sub === '') renderOverview(root, ctx, S, d);
      else if (sub === 'site') {
        const pend = K.suggestionsFor(d.slug, 'pending').length;
        if (S.self && pend) root.insertAdjacentHTML('beforeend', `<div class="mc-notice" role="status">${K.IC.warn}<span>The committee suggested ${pend} ${pend === 1 ? 'change' : 'changes'} to your site. <a href="#/mycampaign">Review ${pend === 1 ? 'it' : 'them'}</a>.</span></div>`);
        K.renderBuilder(root, ctx, S.c.id, { mode: S.self ? 'candidate' : 'committee', links });
      } else if (sub === 'people' || sub === 'outreach') renderCrm(root, ctx, S, d, sub);
      else if (sub === 'print') K.renderPrint(root, ctx, S.c.id, { only: true, builderHref: '#/mycampaign/site' });
      else if (sub === 'social') K.renderSocial(root, ctx, S.c.id, { only: true });
      else if (sub === 'events') renderEvents(root, ctx, S, d);
      else if (sub === 'team') renderTeam(root, ctx, S, d);
    },
  });
})();
