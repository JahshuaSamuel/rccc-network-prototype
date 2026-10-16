/* tour.js — guided tour engine + story steps (Agent 10).
   window.Tour = { steps, allSteps, chapters, start(i), next(), back(), exit(), goTo(i) }
   Classic script, ES2020, no dependencies. Builds against data-tour ids from the contract. */
(function () {
  'use strict';

  /* ---------------- helpers used by step actions ---------------- */
  const q = (sel, root) => (root || document).querySelector(sel);
  function tourEl(id) { return q(`[data-tour="${id}"]`); }
  function say(msg, kind) { if (window.App && App.toast) App.toast(msg, kind || 'info'); }

  /* Click a button inside a data-tour element whose label matches `re` (else the first button). */
  function clickIn(id, re, fallbackMsg) {
    const host = tourEl(id);
    if (!host) { say(fallbackMsg || 'That part of the screen is still loading. Try again in a moment.', 'info'); return; }
    const pool = host.matches('button, a.btn, [role="button"]') ? [host]
      : Array.from(host.querySelectorAll('button, a.btn, [role="button"]'));
    const live = pool.filter((b) => !b.disabled && b.offsetParent !== null);
    const hit = re ? live.find((b) => re.test((b.textContent || b.getAttribute('aria-label') || '').trim())) : live[0];
    if (hit) hit.click();
    else if (fallbackMsg !== false) say(fallbackMsg || 'Already done. Take a look at the result.', 'info');
  }

  /* Turn a checkbox/toggle inside a data-tour element ON (idempotent). */
  function toggleOn(id) {
    const host = tourEl(id);
    if (!host) { say('The zone switch is still loading. Try again in a moment.', 'info'); return; }
    const input = host.matches('input[type="checkbox"]') ? host : q('input[type="checkbox"]', host);
    if (input) { if (!input.checked) input.click(); else say('Zone labels are already on. Scroll the page to see them.', 'info'); return; }
    const btn = host.matches('button') ? host : q('button', host);
    if (btn) btn.click();
  }


  /* Fill a form field the way a person would, so the screen's own input handlers run. */
  function typeInto(sel, value) {
    const el = q(sel);
    if (!el) return false;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  /* Meetings & Voting: the tour starts the sample meeting so check-in, quorum and ballots are live. */
  function startMeeting() { try { if (App.governance && App.governance.startMeeting && !(App.governance.isStarted && App.governance.isStarted())) App.governance.startMeeting(); } catch (e) { /* ignore */ } }

  /* AI Campaign Director helpers (screens/director.js). */
  function dirHasPlan() { return !!q('[data-tour="dir-summary"]'); }
  function dirDraftIfEmpty() {
    if (q('[data-tour="dir-plan"]') && q('#dr-draft')) { q('#dr-draft').click(); return true; }
    return false;
  }
  function scrollTo(sel) {
    const el = q(sel);
    if (el) el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
  }

  /* ---------------- the story ---------------- */
  // main:true = the standard tour. Everything is in allSteps (for jump-to).
  const B = 'board', M = 'master';
  const ALL = [
    /* ===== Welcome ===== */
    { chapter: 'Welcome', main: true, route: 'overview', target: 'overview-hero', role: B,
      title: 'One platform for every county committee',
      body: 'Your committee runs its public website, member list, campaign sites, walk lists and meetings from one sign-in. Each new team of officers picks up right where the last one left off.' },
    { main: true, route: 'overview', target: 'tenant-switcher', role: B,
      title: 'Same platform, your own committee',
      body: 'Switch committees here. Demo County GOP runs on the same platform with its own colors, members, news and voter data. Each county sees only its own information.',
      action: {
        label: () => (App.state.tenant === 'demo' ? 'Back to SVGOP' : 'Switch to Demo County'),
        run: () => {
          const to = App.state.tenant === 'demo' ? 'svgop' : 'demo';
          App.setTenant(to, true);
          say(`Now showing ${to === 'demo' ? 'Demo County GOP' : 'SVGOP'}, signed in as its sample board chair.`, 'ok');
        },
      } },
    { main: true, route: 'overview', target: 'role-switcher', role: B, tenant: 'svgop',
      title: 'Everyone sees what fits their job',
      body: 'Your account decides what you see. A supporter sees the public site, a committee member also sees walk lists and ballots, Executive Board members get the controls, and Master Network admins see every county. Sign-in sends a 6-digit code to your email or phone.',
      tip: 'The account menu lists the sample accounts, so you can sign in as each role in one click.',
      pick: () => { const m = q('.acct-menu'); return m && !m.hidden && m.offsetParent ? m : null; },
      action: { label: 'Open the account menu', run: () => { const b = q('.acct-btn'); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); } },
      cleanup: () => { const b = q('.acct-btn'); if (b && b.getAttribute('aria-expanded') === 'true') b.click(); } },
    { main: true, route: 'overview', target: 'overview-shortcuts', role: B, tenant: 'svgop',
      title: 'Your shortcuts, with today’s numbers',
      body: 'After you sign in, the overview greets you by name and shows the jobs that fit your account: for the board chair, campaign plans waiting for approval, doors left to knock and open ballots.' },
    { main: true, route: 'overview', target: 'nav', role: B,
      prepare: () => { if (window.innerWidth <= 900) document.body.classList.add('drawer-open'); },
      cleanup: () => { document.body.classList.remove('drawer-open'); },
      title: 'Every tool sits in one menu',
      body: 'The public site, Committee Portal, Campaign-in-a-Box, Field Organizer, Meetings & Voting and Master Network all sit behind one sign-in. A lock means your account can’t open that area yet.' },

    /* ===== Public site ===== */
    { chapter: 'Your public website', main: true, route: 'public-hub', target: 'hub-zones-toggle', role: B,
      title: 'See who controls each part of the page',
      body: 'Turn on the zone labels. Purple zones come from Master Network. Zones in your county’s color are local, and your board decides what goes in them.',
      action: { label: 'Show zone labels', run: () => toggleOn('hub-zones-toggle') } },
    { main: true, route: 'public-hub', target: 'hub-preview', role: B,
      title: 'Network zones keep your site current',
      body: 'Network zones fill themselves with statewide news and video from Master Network, so your site has something new every day, even in the quiet months between elections. When Master Network sends a locked statewide alert, it shows across the top of the page.' },
    { main: true, route: 'public-hub', target: 'hub-preview', role: B,
      title: 'Local zones carry your county’s voice',
      body: 'Local zones belong to your committee, from events and endorsements to local sponsors. Your board decides what goes there, and Master Network fills only the network zones.' },
    { main: true, route: 'public-hub', target: 'hub-preview', role: B,
      title: 'Voters see it at your own web address',
      body: 'This preview is the same page voters open at your county’s address. RSVPs, volunteer sign-ups and donations made there are saved and show up in the Committee Portal.',
      action: { label: 'Open the public site in a new tab', run: () => { window.open(`index.html?county=${encodeURIComponent(App.state.tenant || 'svgop')}`, '_blank', 'noopener'); } } },

    /* ===== Committee Portal ===== */
    { chapter: 'Committee Portal', main: true, route: 'portal/network', target: 'portal-network-items', role: B,
      title: 'Your county decides what shows',
      body: 'Here the board reviews everything Master Network sends. Pin what matters locally and hide what doesn’t fit. Locked urgent alerts stay fixed so every county shows the same notice.' },
    { main: false, route: 'portal/network', target: 'portal-lock', role: B,
      title: 'A lock marks the alerts that stay put',
      body: 'Only Master Network can lock an item, and only for urgent alerts. Everything else is your county’s call.' },
    { main: true, route: 'portal/ads', target: 'portal-ads-map', role: B,
      title: 'See every ad slot on your site',
      body: 'This map shows every ad slot on your site and who fills it. Network slots carry statewide sponsors, and local slots are yours to fill with businesses and supporters from your county.' },
    { main: true, route: 'portal/network', target: 'portal-chat', role: B,
      title: 'Counties help each other here',
      body: 'Neighboring committees share a regional channel to plan joint events and trade what works, like a final-week door hanger another county already printed.' },
    { main: false, route: 'portal/network', target: 'portal-assets', role: B,
      title: 'A shared library of what works',
      body: 'Other counties share their door hangers, flyers, playbooks and precinct strategies here. Copy one and it switches to your county’s name, ready to print.' },

    /* ===== Master Network ===== */
    { chapter: 'Master Network', main: true, route: 'master', target: 'master-kpis', role: M,
      title: 'The whole network in five numbers',
      body: 'These five numbers add up every county on the platform: live sites, weekly visitors, candidates recruited, volunteers and money raised online.',
      tip: 'The tour signs in as the sample Master Network admin for this chapter.' },
    { main: true, route: 'master', target: 'master-map', role: M,
      title: 'Every county on one map',
      body: 'Network admins see every county on one map, with live counties and counties still setting up in different colors. County boards see only their own county.' },
    { main: true, route: 'master/push', target: 'push-targeting', role: M,
      title: 'Send to exactly the right counties',
      body: 'Write the update once, then pick the counties that receive it and the news tab it lands in. The preview shows how it looks on each county homepage before you send it.',
      action: { label: 'Fill in a sample update', run: () => {
        typeInto('#mn-title', 'Vote centers open Saturday across California');
        typeInto('#mn-sum', 'Every county vote center opens at 8 AM Saturday. Check your registration before you go.');
        const pv = q('#mn-preview'); if (pv) pv.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
      } } },
    { main: true, route: 'master/push', target: 'push-lock', role: M,
      title: 'Lock what must stay up',
      body: 'Counties can hide or pin regular pushes. A locked push stays on every targeted site, and a locked push at top priority becomes the red statewide alert across the top of each county homepage.',
      action: { label: 'Make it a statewide alert', run: () => { const b = q('[data-act="alert-preset"]'); if (b && !b.hidden) b.click(); scrollTo('#mn-preview'); } } },
    { main: true, route: 'master/push', target: 'push-publish', role: M,
      title: 'Publish once and every targeted site updates',
      body: 'Press Push and the update goes live on every county you picked. The list below shows each county’s delivery status, including any county that chose to hide it.' },
    { main: false, route: 'master/ads', target: 'master-ads', role: M,
      title: 'Network ads run on every county site',
      body: 'Each network slot shows the newest running ad for that county. Create, pause or edit an ad here, and a sample fills any slot you haven’t claimed.' },
    { main: true, route: 'master/analytics', target: 'master-analytics', role: M,
      title: 'See which counties are moving',
      body: 'Every chart answers a question a state director asks: who is showing up, who is knocking doors and where the money comes from. The numbers include every RSVP, sign-up, gift and door saved on the county sites.' },

    /* ===== Campaign-in-a-Box ===== */
    { chapter: 'Campaign-in-a-Box', main: true, route: 'candidate', target: 'cand-pipeline', role: B,
      title: 'From recruited to on the ballot, in one view',
      body: 'Track every candidate your committee recruits as they move from recruited to filed, endorsed and active. The board sees at a glance who needs help next.' },
    { main: true, route: 'candidate/builder', target: 'wizard-steps', role: B,
      title: 'A campaign site in a few guided steps',
      body: 'Candidates answer plain questions about the office, district, issues and committee details. The builder turns those answers into a campaign site, a donate page, print proofs and a week of draft posts.' },
    { main: false, route: 'candidate/builder', target: 'wizard-launch', role: B,
      title: 'The board reviews before anything goes live',
      body: 'On the last step the campaign site goes to the Executive Board for review. A board member approves it and the site opens at its own address, with the disclaimer in place.' },
    { main: false, route: 'candidate/microsite', target: 'microsite-donate', role: B,
      title: 'Donations from day one',
      body: 'This preview is the candidate’s live campaign site. It has a Donate button from the start, so supporters can give the moment they hear the name.' },
    { main: true, route: 'candidate/microsite', target: 'microsite-disclaimer', role: B,
      title: 'Disclaimers, always in place',
      body: 'Every campaign page carries its “Paid for by” disclaimer with the committee’s FPPC (California Fair Political Practices Commission) ID. If the ID is missing, the platform asks for it and holds the page.' },
    { main: false, route: 'candidate/print', target: 'print-check', role: B,
      title: 'Print-ready, with a disclaimer check',
      body: 'Every print proof is checked for the disclaimer before it goes to the printer.' },
    { main: false, route: 'candidate/social', target: 'social-approve', role: B,
      title: 'Social posts, approved by people',
      body: 'Drafted posts wait for a person to approve them before they go out.' },

    /* ===== Field ===== */
    { chapter: 'Field & canvassing', main: true, route: 'field', target: 'field-map', role: B,
      title: 'Your precinct turf on one map',
      body: 'Your precincts and walk turfs on one map, each turf in its own color, with doors knocked updating as volunteers record them. Field chairs see progress without phone calls or spreadsheets.' },
    { main: false, route: 'field', target: 'field-filters', role: B,
      title: 'Read the map at a glance',
      body: 'The map key names each turf’s color and shows which households are knocked. Filter by turnout score and support score so volunteers spend their time on the doors that count.',
      action: { label: 'Open the map key', run: () => { const d = q('[data-tour="field-filters"]'); if (d && d.tagName === 'DETAILS') d.open = true; } } },
    { main: true, route: 'field', target: 'field-privacy', role: B,
      title: 'Voter data stays in your county',
      body: 'Voter files live inside your county’s own space. Volunteers see only the addresses on their own walk list, and the county decides who sees more.' },
    { main: false, route: 'field/list', target: 'field-build', role: B,
      title: 'Build a walk list in seconds',
      body: 'Pick a turf and filters, and the platform builds a walk list in a sensible walking order, ready to assign.' },
    { main: true, route: 'field/canvass', target: 'field-phone', role: B,
      title: 'Canvassing from any phone',
      body: 'Volunteers open their walk list on their own phone and record each door in a tap. Results are saved and flow back to the field chair for the next shift.' },
    { main: false, route: 'field/canvass', target: 'field-offline', role: B,
      title: 'Keeps working with weak signal',
      body: 'Doors recorded with weak signal are saved on the phone and send once it reconnects.' },

    /* ===== Meetings ===== */
    { chapter: 'Meetings & Voting', main: false, route: 'governance', target: 'gov-meeting', role: B, prepare: startMeeting,
      title: 'The agenda, on the meeting page',
      body: 'The agenda for the central committee meeting sits on the same page as check-in, quorum and the ballots, so members follow along item by item.' },
    { chapter: 'Meetings & Voting', main: true, route: 'governance', target: 'gov-quorum', role: B, prepare: startMeeting,
      tip: 'The tour starts the sample October meeting so you can see check-in and the ballots open.',
      title: 'The platform counts quorum for you',
      body: 'As members check in, the platform counts seated members and verified proxies and shows the moment you reach quorum, so the chair knows exactly when the committee can vote.' },
    { main: true, route: 'governance/ballots', target: 'gov-ballot', role: B, prepare: startMeeting,
      title: 'Vote by secret ballot or roll call',
      body: 'Run a secret ballot, a roll call or a weighted vote right inside the meeting. Each member votes once, and results are measured against your bylaws’ threshold.' },
    { main: false, route: 'governance/ballots', target: 'gov-receipt', role: B, prepare: startMeeting,
      title: 'Every voter gets a receipt',
      body: 'Each member gets a receipt confirming the vote was counted, while the choice itself stays private.' },
    { main: false, route: 'governance/ballots', target: 'gov-results', role: B, prepare: startMeeting,
      title: 'Results appear the moment voting closes',
      body: 'Results appear as soon as the chair closes the ballot, measured against the threshold your bylaws require.' },
    { main: false, route: 'governance/proxies', target: 'gov-proxies', role: B,
      title: 'The secretary verifies every proxy',
      body: 'Members assign proxies ahead of time, and the secretary verifies each one before the meeting starts.' },
    { main: false, route: 'governance/proxies', target: 'gov-audit', role: B,
      title: 'Every decision leaves an audit trail',
      body: 'Every vote and proxy is recorded with a time stamp, so the committee can answer questions later.' },

    /* ===== AI Campaign Director ===== */
    { chapter: 'AI Campaign Director', main: true, route: 'director', target: 'dir-request', role: B,
      title: 'Ask for a campaign plan',
      body: 'A board member picks an endorsed candidate and chooses what the plan covers. The AI assistant drafts weekly goals to Election Day, a canvass target for every turf, print orders, social posts and events, all from your county’s own data.',
      action: {
        label: () => (dirHasPlan() ? 'Show the saved plan' : 'Draft a plan'),
        run: () => { if (!dirDraftIfEmpty()) scrollTo('[data-tour="dir-summary"]'); },
      } },
    { main: true, route: 'director', target: 'dir-items', role: B, wait: 6000, waitText: 'The AI assistant is drafting the plan…',
      prepare: dirDraftIfEmpty, ready: () => !!q('[data-tour="dir-items"] .dr-sec'),
      pick: () => q('[data-tour="dir-items"] .dr-sec.is-fix') || q('[data-tour="dir-items"] .dr-sec'),
      title: 'Every item gets a quality check',
      body: 'Each draft item runs through plain checks, such as “Disclaimer present”, “Turf exists” or “Date is on or before Election Day”. Items that fail sit at the top and say why, and sections where everything passes fold into one row you can approve at once. The AI assistant never makes up a legal detail like an FPPC ID.' },
    { main: true, route: 'director', target: 'dir-summary', role: B, wait: 6000,
      prepare: dirDraftIfEmpty, ready: () => !!q('[data-tour="dir-summary"]'),
      title: 'A person approves every item',
      body: 'Board members approve, edit or reject each item. Every approval records the person’s name and the time, and an approved item links to the module that carries it out: Field Organizer, Campaign-in-a-Box or the Committee Portal.',
      action: {
        label: () => (q('[data-act="approve-ready"]') ? 'Approve the items that pass' : 'See the approval record'),
        run: () => { const b = q('[data-act="approve-ready"]'); if (b) b.click(); else scrollTo('.dr-log, .dr-main .card:last-child'); },
      } },
  ];

  // Carry chapter names forward so every step knows its chapter.
  let ch = '';
  ALL.forEach((s) => { if (s.chapter) ch = s.chapter; s.chapter = ch; });

  const MAIN = ALL.filter((s) => s.main);
  function chaptersOf(list) {
    const out = [];
    list.forEach((s, i) => { if (!out.length || out[out.length - 1].title !== s.chapter) out.push({ title: s.chapter, start: i }); });
    return out;
  }

  /* ---------------- styles ---------------- */
  const CSS = `
.tour-spot{position:fixed;z-index:2000;pointer-events:none;border-radius:12px;
  box-shadow:0 0 0 3px var(--accent,#C8102E),0 0 0 9999px rgba(12,18,28,.58);
  transition:top .25s ease,left .25s ease,width .25s ease,height .25s ease,opacity .2s ease;}
.tour-spot.tour-none{top:50%!important;left:50%!important;width:0!important;height:0!important;box-shadow:0 0 0 9999px rgba(12,18,28,.42);}
body.tour-modal .tour-spot{opacity:0}
.tour-card{position:fixed;z-index:2002;width:380px;max-width:calc(100vw - 24px);background:var(--surface,#fff);color:var(--ink,#15202E);
  border-radius:14px;border-top:5px solid var(--accent,#C8102E);box-shadow:0 22px 50px -12px rgba(0,0,0,.45),0 2px 6px rgba(0,0,0,.12);
  font-family:var(--font-body);font-size:15px;line-height:1.5;display:flex;flex-direction:column;max-height:calc(100vh - 24px);
  transition:top .25s ease,left .25s ease;}
.tour-card:focus{outline:none}
.tour-head{display:flex;align-items:center;gap:8px;padding:12px 14px 0 18px}
.tour-count{font-size:13px;font-weight:700;color:var(--ink-3,#5A6676);letter-spacing:.02em;white-space:nowrap}
.tour-chap{flex:1;min-width:0;font:600 13px/1.2 var(--font-body);color:var(--brand,#0B2A4A);background:var(--surface-2,#F8F9FB);
  border:1px solid var(--line,#DCE1E8);border-radius:8px;padding:5px 8px;cursor:pointer;text-overflow:ellipsis}
.tour-x{flex:none;width:32px;height:32px;border:0;background:transparent;border-radius:8px;cursor:pointer;color:var(--ink-3,#5A6676);
  display:inline-flex;align-items:center;justify-content:center}
.tour-x:hover{background:var(--surface-2,#F3F5F8);color:var(--ink,#15202E)}
.tour-scroll{overflow:auto;padding:8px 18px 4px}
.tour-title{font-family:var(--font-head);font-weight:800;font-size:1.28rem;line-height:1.2;margin:2px 0 6px;color:var(--ink,#15202E)}
.tour-body{margin:0 0 10px;color:var(--ink-2,#3C4858)}
.tour-wait{font-size:13px;color:var(--ink-3,#5A6676);margin:-4px 0 10px;display:flex;align-items:center;gap:8px}
.tour-wait::before{content:'';width:12px;height:12px;border-radius:50%;border:2px solid var(--line-strong,#C3CAD4);border-top-color:var(--brand,#0B2A4A);animation:tour-spin .8s linear infinite}
@keyframes tour-spin{to{transform:rotate(360deg)}}
.tour-action{display:inline-flex;align-items:center;gap:8px;margin:0 0 10px;font:700 14.5px/1.2 var(--font-body);cursor:pointer;
  background:var(--accent,#C8102E);color:#fff;border:0;border-radius:9px;padding:9px 14px;box-shadow:0 2px 0 rgba(0,0,0,.18)}
.tour-action:hover{filter:brightness(.92)}
.tour-tip{margin:-4px 0 10px;font-size:13.5px;color:var(--ink-3,#5A6676)}
.tour-card .tour-title,.tour-card .tour-body{animation:tour-in .28s ease both}
@keyframes tour-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.tour-dots{display:flex;flex-wrap:wrap;gap:4px;padding:6px 18px 0}
.tour-dot{width:8px;height:8px;padding:0;border:0;border-radius:50%;background:var(--line-strong,#C3CAD4);cursor:pointer}
.tour-dot.done{background:color-mix(in srgb,var(--brand,#0B2A4A) 45%,white)}
.tour-dot.on{background:var(--accent,#C8102E);transform:scale(1.35)}
.tour-foot{display:flex;align-items:center;gap:8px;padding:10px 14px 14px 18px}
.tour-foot .tour-sp{flex:1}
.tour-btn{font:700 14.5px/1.2 var(--font-body);border-radius:9px;padding:9px 14px;cursor:pointer;border:1px solid var(--line-strong,#C3CAD4);
  background:var(--surface,#fff);color:var(--ink,#15202E)}
.tour-btn:hover{background:var(--surface-2,#F3F5F8)}
.tour-btn[disabled]{opacity:.45;cursor:default}
.tour-btn.tour-primary{background:var(--brand,#0B2A4A);color:var(--brand-ink,#fff);border-color:var(--brand,#0B2A4A)}
.tour-btn.tour-primary:hover{filter:brightness(1.12)}
.tour-btn.tour-link{border-color:transparent;background:none;color:var(--ink-3,#5A6676);padding-left:4px;padding-right:4px}
.tour-card.tour-center{left:50%!important;top:50%!important;transform:translate(-50%,-50%)}
.tour-card.tour-end .tour-title{font-size:1.5rem}
body.tour-modal .tour-card:not(.tour-sheet){left:auto!important;top:auto!important;right:16px;bottom:16px;transform:none}
.tour-card.tour-sheet{left:0!important;right:0;bottom:0;top:auto!important;width:auto;max-width:none;transform:none;
  border-radius:16px 16px 0 0;max-height:52vh;padding-bottom:env(safe-area-inset-bottom)}
.tour-card.tour-sheet .tour-title{font-size:1.12rem}
.tour-card.tour-sheet .tour-scroll{padding-top:4px}
.tour-card.tour-sheet .tour-foot{padding-bottom:12px}
.tour-card.tour-sheet::before{content:'';display:block;width:40px;height:4px;border-radius:2px;background:var(--line-strong,#C3CAD4);margin:6px auto 0}
body.tour-on #toasts{z-index:2100}
@media (max-width:719px){body.tour-on #toasts{bottom:calc(var(--tour-sheet-h,0px) + 12px)}}
@media (prefers-reduced-motion:reduce){.tour-spot,.tour-card{transition:none}.tour-wait::before{animation:none}.tour-card .tour-title,.tour-card .tour-body{animation:none}}
`;
  function injectCss() {
    if (document.getElementById('tour-css')) return;
    const s = document.createElement('style');
    s.id = 'tour-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------------- engine ---------------- */
  const PHONE = 720;
  const PAD = 6;
  const GAP = 14;
  let list = MAIN;
  let idx = -1;
  let active = false;
  let token = 0;
  let curStep = null;
  let target = null;
  let spot = null, card = null;
  let tick = null, mo = null;
  let lastFocus = null;

  const esc = (s) => (window.App && App.util ? App.util.esc(s) : String(s));
  const isPhone = () => window.innerWidth < PHONE;
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const topbarBottom = () => { const t = document.getElementById('topbar'); return t ? Math.max(0, t.getBoundingClientRect().bottom) : 0; };
  const routeKey = () => { const r = (window.App && App.route) || {}; return (r.id || '') + (r.sub ? '/' + r.sub : ''); };
  const norm = (r) => String(r || '').replace(/^#?\/?/, '').replace(/\/$/, '');

  function visible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  function findTarget(id) {
    if (!id) return null;
    const els = document.querySelectorAll(`[data-tour="${id}"]`);
    for (const el of els) if (visible(el)) return el;
    return null;
  }

  function buildDom() {
    injectCss();
    if (!spot) { spot = document.createElement('div'); spot.className = 'tour-spot tour-none'; spot.setAttribute('aria-hidden', 'true'); }
    if (!card) {
      card = document.createElement('div');
      card.className = 'tour-card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'false');
      card.setAttribute('aria-labelledby', 'tour-title');
      card.tabIndex = -1;
      card.addEventListener('click', onCardClick);
      card.addEventListener('change', onCardChange);
    }
    if (!spot.isConnected) document.body.appendChild(spot);
    if (!card.isConnected) document.body.appendChild(card);
    document.body.classList.add('tour-on');
  }

  const ICON_X = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>';
  const ICON_CHEV = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 2l4 4-4 4"/></svg>';

  function chapterSelect(selIdx) {
    const chs = chaptersOf(list);
    let curCh = -1;
    chs.forEach((c, k) => { if (selIdx >= c.start) curCh = k; });
    return `<select class="tour-chap" aria-label="Jump to a chapter">` +
      (selIdx < 0 ? `<option value="" selected>Jump to a chapter…</option>` : '') +
      chs.map((c, k) => `<option value="${c.start}"${k === curCh ? ' selected' : ''}>${k + 1}. ${esc(c.title)}</option>`).join('') +
      `</select>`;
  }

  function renderCard(waiting) {
    const s = curStep;
    const n = list.length;
    const label = s.action ? (typeof s.action.label === 'function' ? s.action.label() : s.action.label) : '';
    card.classList.remove('tour-end');
    card.innerHTML =
      `<div class="tour-head"><span class="tour-count">${idx + 1} of ${n}</span>${chapterSelect(idx)}` +
      `<button class="tour-x" data-t="exit" aria-label="Exit tour">${ICON_X}</button></div>` +
      `<div class="tour-scroll">` +
      `<h2 class="tour-title" id="tour-title">${esc(s.title)}</h2>` +
      `<p class="tour-body">${esc(s.body)}</p>` +
      (waiting ? `<p class="tour-wait">${esc(s.waitText || 'Getting this part of the screen ready…')}</p>` : '') +
      (s.action ? `<button class="tour-action" data-t="action">${esc(label)}</button>` : '') +
      (s.tip ? `<p class="tour-tip">${esc(s.tip)}</p>` : '') +
      `</div>` +
      `<div class="tour-dots" role="group" aria-label="Tour progress">${list.map((x, k) =>
        `<button class="tour-dot${k === idx ? ' on' : k < idx ? ' done' : ''}" data-t="dot" data-i="${k}" aria-label="Step ${k + 1}: ${esc(x.title)}"${k === idx ? ' aria-current="step"' : ''}></button>`).join('')}</div>` +
      `<div class="tour-foot"><button class="tour-btn tour-link" data-t="exit">Exit</button><span class="tour-sp"></span>` +
      `<button class="tour-btn" data-t="back"${idx === 0 ? ' disabled' : ''}>Back</button>` +
      `<button class="tour-btn tour-primary" data-t="next">${idx === n - 1 ? 'Finish' : 'Next'}</button></div>`;
  }

  function renderEnd() {
    curStep = null;
    target = null;
    card.classList.add('tour-end');
    card.innerHTML =
      `<div class="tour-head"><span class="tour-count">Tour complete</span><span class="tour-sp" style="flex:1"></span>` +
      `<button class="tour-x" data-t="close" aria-label="Close">${ICON_X}</button></div>` +
      `<div class="tour-scroll"><h2 class="tour-title" id="tour-title">That’s the tour</h2>` +
      `<p class="tour-body">Open any area from the menu. You can restart the tour or jump to a chapter from here. Closing the tour puts you back in the account you started with.</p>` +
      `${chapterSelect(-1)}</div>` +
      `<div class="tour-foot"><button class="tour-btn" data-t="restart">Restart tour</button><span class="tour-sp"></span>` +
      `<button class="tour-btn tour-primary" data-t="close">Close</button></div>`;
    place();
    focusCard('[data-t="close"].tour-primary');
  }

  function focusCard(sel) {
    const b = card && (card.querySelector(sel) || card);
    if (b) try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function onCardClick(e) {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    const t = b.dataset.t;
    if (t === 'next') next();
    else if (t === 'back') back();
    else if (t === 'exit') exit();
    else if (t === 'close') finishClose();
    else if (t === 'restart') start(0);
    else if (t === 'dot') goTo(Number(b.dataset.i));
    else if (t === 'action' && curStep && curStep.action) {
      try { curStep.action.run(); } catch (err) { console.error('[Tour] action failed', err); }
      setTimeout(() => {
        if (!active || !curStep || !curStep.action) return;
        const ab = card.querySelector('.tour-action');
        const l = curStep.action.label;
        if (ab && typeof l === 'function') ab.textContent = l();
        resolveAndPlace();
      }, 350);
    }
  }
  function onCardChange(e) {
    const sel = e.target.closest('.tour-chap');
    if (!sel || sel.value === '') return;
    if (!active) { active = true; buildDom(); bindGlobal(); }
    goTo(Number(sel.value));
  }

  /* ----- positioning ----- */
  function spotRect() {
    if (!target) return null;
    const r = target.getBoundingClientRect();
    const tb = target.closest('.topbar') ? 0 : topbarBottom();
    let top = r.top - PAD, left = r.left - PAD, bottom = r.bottom + PAD, right = r.right + PAD;
    top = Math.max(top, tb + 2); left = Math.max(left, 2);
    bottom = Math.min(bottom, window.innerHeight - 2); right = Math.min(right, window.innerWidth - 2);
    if (bottom - top < 8 || right - left < 8) return null;
    return { top, left, bottom, right, width: right - left, height: bottom - top };
  }

  function place() {
    if (!card) return;
    const phone = isPhone();
    const sr = spotRect();
    const noSpot = !sr;
    spot.classList.toggle('tour-none', noSpot);
    if (sr) Object.assign(spot.style, { top: sr.top + 'px', left: sr.left + 'px', width: sr.width + 'px', height: sr.height + 'px' });

    card.classList.toggle('tour-sheet', phone);
    if (phone) {
      card.classList.remove('tour-center');
      card.style.left = ''; card.style.top = '';
      document.documentElement.style.setProperty('--tour-sheet-h', card.offsetHeight + 'px');
      return;
    }
    if (noSpot) { card.classList.add('tour-center'); card.style.left = ''; card.style.top = ''; return; }
    card.classList.remove('tour-center');
    const vw = window.innerWidth, vh = window.innerHeight, M = 12;
    const cw = card.offsetWidth, chh = card.offsetHeight;
    const clampX = (x) => Math.min(Math.max(x, M), vw - cw - M);
    const clampY = (y) => Math.min(Math.max(y, M), vh - chh - M);
    const fits = {
      right: sr.right + GAP + cw <= vw - M,
      left: sr.left - GAP - cw >= M,
      bottom: sr.bottom + GAP + chh <= vh - M,
      top: sr.top - GAP - chh >= M,
    };
    let x, y;
    if (fits.right) { x = sr.right + GAP; y = clampY(sr.top); }
    else if (fits.left) { x = sr.left - GAP - cw; y = clampY(sr.top); }
    else if (fits.bottom) { x = clampX(sr.left); y = sr.bottom + GAP; }
    else if (fits.top) { x = clampX(sr.left); y = sr.top - GAP - chh; }
    else if (vh - sr.bottom > sr.top) { x = clampX(sr.right - cw); y = clampY(sr.bottom + GAP); } // best effort, below
    else { x = clampX(sr.right - cw); y = clampY(sr.top - GAP - chh); }
    card.style.left = Math.round(x) + 'px';
    card.style.top = Math.round(y) + 'px';
  }

  function scrollToTarget() {
    if (!target || target.closest('.topbar') || (target.closest('.sidebar') && !isPhone())) return;
    if (target.closest('.sidebar')) return; // drawer is fixed on phones
    const r = target.getBoundingClientRect();
    const top = topbarBottom() + 12;
    const bottom = window.innerHeight - (isPhone() ? (card ? card.offsetHeight : 0) : 0) - 12;
    const avail = bottom - top;
    // Desktop, wide target (no room beside it): park it near the top so the card sits below it.
    const cw = card ? card.offsetWidth : 380, chh = card ? card.offsetHeight : 300;
    const wide = !isPhone() && r.right + PAD + GAP + cw > window.innerWidth - 12 && r.left - PAD - GAP - cw < 12;
    if (wide && r.height + PAD * 2 + GAP + chh <= avail) {
      const roomBelow = window.innerHeight - 12 - (r.bottom + PAD + GAP);
      const roomAbove = r.top - PAD - GAP - top;
      if (r.top >= top && r.bottom <= window.innerHeight - 12 && (roomBelow >= chh || roomAbove >= chh)) return;
      window.scrollTo({ top: Math.max(0, window.scrollY + r.top - top - PAD), behavior: 'auto' });
      return;
    }
    if (r.top >= top && r.bottom <= bottom) return;
    let want = r.height <= avail ? top + (avail - r.height) / 2 : top;
    if (isPhone()) want = top; // keep it right under the header, above the sheet
    const dist = Math.abs(r.top - want);
    window.scrollTo({ top: Math.max(0, window.scrollY + r.top - want), behavior: reduced() || dist > 1400 ? 'auto' : 'smooth' });
  }

  function resolveAndPlace() {
    if (!active || !curStep) { place(); return; }
    let t = null;
    if (curStep.pick) { try { t = curStep.pick(); } catch (e) { t = null; } }
    if (!t) t = findTarget(curStep.target);
    if (t !== target) target = t;
    place();
  }

  /* ----- step flow ----- */
  async function show(i) {
    if (i < 0 || i >= list.length) return;
    const my = ++token;
    if (curStep && curStep.cleanup) try { curStep.cleanup(); } catch (e) { /* ignore */ }
    idx = i;
    curStep = list[i];
    App.state.tour_step = i;
    target = null;
    const s = curStep;

    // Role / tenant first (silently), then route.
    if (s.role && App.state.role !== s.role) App.setRole(s.role, true);
    if (s.tenant && App.state.tenant !== s.tenant) App.setTenant(s.tenant, true);
    const want = norm(s.route);
    if (want && routeKey() !== want) App.go(want);

    renderCard(false);
    place();

    // Wait for the route to settle and the target to appear.
    const limit = s.wait || 2000;
    const t0 = Date.now();
    let found = null;
    let shownWait = false;
    while (Date.now() - t0 < limit) {
      if (my !== token) return;
      if (!want || routeKey() === want) {
        if (s.prepare && !s._prepared) { try { s.prepare(); } catch (e) { /* ignore */ } s._prepared = true; await sleep(260); }
        found = null;
        if (s.pick) { try { found = s.pick(); } catch (e) { found = null; } }
        if (!found) found = findTarget(s.target);
        const isReady = !s.ready || (() => { try { return !!s.ready(); } catch (e) { return true; } })();
        if ((found || !s.target) && isReady) break;
        if (found && !isReady && !target) { target = found; place(); scrollToTarget(); place(); }
      }
      if (!shownWait && Date.now() - t0 > 700 && limit > 2000) { renderCard(true); place(); shownWait = true; }
      if (found && s.ready) target = found;
      await sleep(100);
    }
    s._prepared = false;
    if (my !== token) return;
    if (shownWait) renderCard(false);
    target = found;
    place();
    scrollToTarget();
    place();
    focusCard('[data-t="next"]');
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function onKey(e) {
    if (!active) return;
    if (document.querySelector('.modal-backdrop')) return; // a modal owns the keyboard
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); if (curStep) next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (curStep) back(); }
    else if (e.key === 'Escape') { e.preventDefault(); if (curStep) exit(); else finishClose(); }
  }
  let raf = 0;
  function onMove() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (active) { if (curStep) resolveAndPlace(); else place(); } }); }

  function bindGlobal() {
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, { passive: true });
    clearInterval(tick);
    tick = setInterval(() => { if (active && curStep) resolveAndPlace(); }, 400); // screens re-render; keep tracking
    if (!mo && window.MutationObserver) {
      mo = new MutationObserver(() => document.body.classList.toggle('tour-modal', !!document.querySelector('.modal-backdrop')));
    }
    if (mo) mo.observe(document.body, { childList: true });
  }
  function unbindGlobal() {
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onMove);
    window.removeEventListener('scroll', onMove);
    clearInterval(tick); tick = null;
    if (mo) mo.disconnect();
    document.body.classList.remove('tour-modal');
  }

  function start(i, opts) {
    if (!window.App) return;
    list = opts && opts.full ? ALL : MAIN;
    if (!active) {
      lastFocus = document.activeElement;
      if (startUser === undefined) { const u = App.auth && App.auth.user; startUser = u ? u.id : null; startTenant = App.state.tenant; }
    }
    active = true;
    buildDom();
    bindGlobal();
    show(Math.min(Math.max(Number(i) || 0, 0), list.length - 1));
  }
  function goTo(i) { if (!active) return start(i); show(Math.min(Math.max(i, 0), list.length - 1)); }
  function next() {
    if (!active) return;
    if (idx >= list.length - 1) return finish();
    show(idx + 1);
  }
  function back() { if (active && idx > 0) show(idx - 1); }

  /* The tour signs in as sample accounts; put the person back where they started. */
  let startUser = undefined, startTenant = null;
  function restoreDefaults() {
    if (startUser === undefined) return;
    try {
      if (startTenant && App.state.tenant !== startTenant) App.setTenant(startTenant, true);
      const now = App.auth && App.auth.user;
      if (!startUser && now) App.auth.signOut({ silent: true });
      else if (startUser && (!now || now.id !== startUser)) App.auth.signInAs(startUser, { silent: true });
    } catch (e) { /* ignore */ }
    startUser = undefined; startTenant = null;
  }
  function finish() {
    token++;
    if (curStep && curStep.cleanup) try { curStep.cleanup(); } catch (e) { /* ignore */ }
    App.state.tour_step = 0;
    renderEnd();
  }
  function teardown() {
    token++;
    active = false;
    if (curStep && curStep.cleanup) try { curStep.cleanup(); } catch (e) { /* ignore */ }
    curStep = null; target = null;
    unbindGlobal();
    if (spot) spot.remove();
    if (card) card.remove();
    document.body.classList.remove('tour-on');
    document.documentElement.style.removeProperty('--tour-sheet-h');
    restoreDefaults();
    if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function exit() {
    if (!active) return;
    // Show the closing card so the presenter can restart or jump to a chapter.
    finish();
  }
  function finishClose() { teardown(); }

  window.Tour = {
    steps: MAIN,
    allSteps: ALL,
    chapters: chaptersOf(MAIN),
    allChapters: chaptersOf(ALL),
    start,
    next,
    back,
    exit,
    close: finishClose,
    goTo,
    get index() { return idx; },
    get active() { return active; },
  };
})();
