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
    if (!host) { say('The zones switch is still loading. Try again in a moment.', 'info'); return; }
    const input = host.matches('input[type="checkbox"]') ? host : q('input[type="checkbox"]', host);
    if (input) { if (!input.checked) input.click(); else say('The zones overlay is already on.', 'info'); return; }
    const btn = host.matches('button') ? host : q('button', host);
    if (btn) btn.click();
  }


  /* AI Campaign Director helpers (scripted run on screens/director.js). */
  const dirQ = (sel) => q(sel);
  function dirStatus() { const b = dirQ('.dir-req-status'); return b ? b.textContent.trim().toLowerCase() : ''; }
  function dirEnsureRunning() {
    const st = dirStatus();
    if (st === 'ready' || st === 'paused') clickIn('dir-request', /^(run|resume)$/i, false);
  }
  function dirSupplyNumber() {
    const use = dirQ('[data-tour="dir-gate"] [data-act="fill-fppc"]');
    if (!use) return false;
    use.click();
    setTimeout(() => clickIn('dir-gate', /^confirm/i, false), 250);
    return true;
  }
  /* Summary step: resolve any pending gate or approval, keep the run going, report when finished. */
  let ffLast = 0;
  function dirFastForward() {
    if (/finished/.test(dirStatus())) return true;
    if (Date.now() - ffLast > 600) {
      ffLast = Date.now();
      if (!dirSupplyNumber()) {
        const ap = dirQ('[data-tour="dir-approval"] [data-act="approve"]');
        if (ap) ap.click(); else dirEnsureRunning();
      }
    }
    return false;
  }
  function dirApproveOrUnblock() {
    if (dirSupplyNumber()) { say('Committee number supplied from the filing. The run continues to approval.', 'ok'); return; }
    const ap = dirQ('[data-tour="dir-approval"] [data-act="approve"]');
    if (ap) { ap.click(); return; }
    if (dirStatus() === 'finished') { say('Everything is approved. The summary is ready below.', 'ok'); return; }
    dirEnsureRunning();
    say('Approval opens once the drafts are ready. The run is working now.', 'info');
  }

  /* ---------------- the story ---------------- */
  // main:true = part of the ~27-step presenter tour. Everything is in allSteps (for jump-to).
  const B = 'board', M = 'master';
  const ALL = [
    /* ===== Welcome ===== */
    { chapter: 'Welcome', main: true, route: 'overview', target: 'overview-hero', role: B,
      title: 'One platform for every county committee',
      body: 'Everything your committee runs lives in one place: the public website, member tools, candidate sites, walk lists and meetings. Volunteers learn it once, and each new team of officers picks up right where the last one left off.',
      notes: ['Open with the familiar pain: every new board inherits a stale site and a dozen logins.',
        'This is a working prototype with invented sample data. Every person shown is fictional.',
        'Santa Clara County Republican Party (SVGOP) is our pilot county.'] },
    { main: true, route: 'overview', target: 'tenant-switcher', role: B,
      title: 'Same platform, your own committee',
      body: 'Switch committees here. Demo County GOP (Grand Old Party) runs on the very same platform with its own colors, members, news and voter data. Each county sees only its own information.',
      notes: ['Press the action button and watch the colors, headlines and numbers change.',
        'Separation is built into the database itself, so each county’s members and voters stay with that county.',
        'Every county keeps its own web address, such as svgop.com.'],
      action: {
        label: () => (App.state.tenant === 'demo' ? 'Back to SVGOP' : 'Switch to Demo County'),
        run: () => App.setTenant(App.state.tenant === 'demo' ? 'svgop' : 'demo'),
      } },
    { main: true, route: 'overview', target: 'role-switcher', role: B, tenant: 'svgop',
      title: 'Everyone sees what fits their job',
      body: 'Choose who you are viewing as: network admin, executive board, committee member, volunteer or public visitor. Volunteers get a simple screen, and officers keep the sensitive controls.',
      notes: ['We are back on SVGOP, viewing as the Executive Board.',
        'Roles mirror your bylaws: executive board, members, alternates, volunteers.',
        'Sign-in uses MFA (Multi-Factor Authentication) for anyone with access to member or voter data.'] },
    { main: true, route: 'overview', target: 'nav', role: B,
      prepare: () => { if (window.innerWidth <= 900) document.body.classList.add('drawer-open'); },
      cleanup: () => { document.body.classList.remove('drawer-open'); },
      title: 'Every tool, one menu',
      body: 'Public site, committee portal, candidate tools, field work, meetings and the network console all sit in one menu behind one login. New officers find everything in the same place every year.',
      notes: ['A small lock means that role would normally see the area as restricted; the demo opens everything.',
        'One login replaces the website host, the email tool, the spreadsheet and the meeting app.'] },

    /* ===== Public site ===== */
    { chapter: 'Your public website', main: true, route: 'public-hub', target: 'hub-zones-toggle', role: B,
      title: 'See who controls each part of the page',
      body: 'Turn on the zones overlay. Purple frames are network slots, filled by the shared network. Frames in your county’s color are local slots, and your board decides everything in them.',
      notes: ['Press “Turn on the zones overlay”, then scroll so the board sees the frames.',
        'This is the heart of the pitch: shared where it helps, local where it matters.'],
      action: { label: 'Turn on the zones overlay', run: () => toggleOn('hub-zones-toggle') } },
    { main: true, route: 'public-hub', target: 'hub-master-slot', role: B,
      title: 'Network slots keep your site fresh',
      body: 'Network slots fill themselves with statewide news, video and sponsor messages from the Master Network. Your site stays current every day, including the quiet months between elections.',
      notes: ['A stale site tells voters the party is asleep. This keeps it alive with zero volunteer hours.',
        'The county can hide or pin network items from its portal; only locked alerts stay fixed.'] },
    { main: false, route: 'public-hub', target: 'hub-breaking', role: B,
      title: 'Urgent alerts reach every county',
      body: 'When the network sends a locked alert, such as an election-day polling notice, it appears at the top of every county site at once.',
      notes: ['Locked alerts are rare and reserved for urgent, network-wide messages.'] },
    { main: false, route: 'public-hub', target: 'hub-tabs', role: B,
      title: 'National, state, county and city news',
      body: 'Visitors browse news by level, from national down to their own city. County posts written in the portal appear first, marked “New”.',
      notes: ['All headlines here are invented samples from invented sources.'] },
    { main: false, route: 'public-hub', target: 'hub-video', role: B,
      title: 'A video hub for your county',
      body: 'Shared video channels plus your own: candidate introductions, meeting recaps and training clips, all on your county’s site.',
      notes: ['Channel names are invented for the demo.'] },
    { main: true, route: 'public-hub', target: 'hub-local-slot', role: B,
      title: 'Local slots carry your county’s voice',
      body: 'Local slots belong to your committee: your events, your endorsements, your local sponsors. Your board decides what goes here, and the network fills only the spaces marked as network slots.',
      notes: ['Point to the Lincoln Day Dinner or the next local event.',
        'Same frame style everywhere: purple tag means network, brand color means local.'] },

    /* ===== Portal & network ===== */
    { chapter: 'Committee portal & network', main: true, route: 'portal', target: 'portal-network-items', role: B,
      title: 'Your county decides what shows',
      body: 'Here the board reviews everything the network sends. Pin what matters locally, hide what fits elsewhere, and add your own posts. Urgent alerts with a lock stay fixed so the network speaks with one voice.',
      notes: ['Try hiding an item, then visit the public site: it is gone there too.',
        'Pinning moves an item to the top of the county’s home page.'] },
    { main: false, route: 'portal', target: 'portal-lock', role: B,
      title: 'Locked items, clearly marked',
      body: 'A lock marks the few network alerts that stay in place. Everything else is your county’s call.',
      notes: ['Locks are set only by the Master Network for urgent items.'] },
    { main: true, route: 'portal/ads', target: 'portal-ads-map', role: B,
      title: 'Every ad space, mapped',
      body: 'This map shows every ad space on your site and who fills it. Network spaces carry statewide sponsors; local spaces are yours to fill with businesses and supporters from your county.',
      notes: ['Local sponsors are a natural fit for county fundraising.',
        'The same dashed frames appear here as on the public site, so nobody has to learn two systems.'] },
    { main: true, route: 'portal/network', target: 'portal-chat', role: B,
      title: 'Counties helping counties',
      body: 'Neighboring committees share a regional channel to plan joint events, swap volunteers and trade what works. A small county gets the playbook of a large one in a single message.',
      notes: ['Regional channels, working groups and direct messages between chairs.',
        'Joint events, like a regional Lincoln Day Dinner, are planned right here.'] },
    { main: false, route: 'portal/network', target: 'portal-assets', role: B,
      title: 'A shared library of what works',
      body: 'Door hangers, flyers, playbooks and precinct strategies shared by other counties. Copy one, add your county’s details, and print.',
      notes: ['Download and copy counts show what other counties trust.'] },

    /* ===== Master Network ===== */
    { chapter: 'The Master Network', main: false, route: 'master', target: 'master-kpis', role: M,
      title: 'The whole network in four numbers',
      body: 'Sites live, weekly visitors, candidates recruited and volunteers, across every county on the platform.',
      notes: ['Sample figures only.'] },
    { chapter: 'The Master Network', main: true, route: 'master', target: 'master-map', role: M,
      title: 'The network at a glance',
      body: 'Network admins see every county on one map: which are live, which are onboarding, and where volunteers and visitors are growing. County boards see their own county; this view is for the network team.',
      notes: ['We switched to “Master Network Admin” for this chapter.',
        'SVGOP is live; other counties show as onboarding or invited.'] },
    { main: true, route: 'master/push', target: 'push-targeting', role: M,
      title: 'Send to exactly the right counties',
      body: 'Write once, then choose who receives it: every county, one state, one region or a hand-picked list. One statewide message reaches every county site in a single step, with no copying and pasting.',
      notes: ['Show the region option: Bay Area counties only.',
        'Priority decides where the item sits on each county’s page.'] },
    { main: true, route: 'master/push', target: 'push-lock', role: M,
      title: 'Lock what must stay up',
      body: 'For urgent alerts, such as an election-day polling notice, the admin can lock the item. Locked items stay on every county site until the network releases them. Counties pin or hide everything else freely.',
      notes: ['Locks are the exception, used sparingly, so counties keep trusting the network.'] },
    { main: true, route: 'master/push', target: 'push-publish', role: M,
      title: 'Publish once, live everywhere',
      body: 'Press Publish and the item goes live across every county you targeted. Each county site updates on its own, and the network sees the reach right away.',
      notes: ['Press the action button to publish the sample item.',
        'Afterward, the public site shows it in the network slot.'],
      action: { label: 'Press Publish', run: () => clickIn('push-publish', /publish|send|push/i) } },
    { main: false, route: 'master/ads', target: 'master-ads', role: M,
      title: 'Network sponsors, shared fairly',
      body: 'Network ad spaces carry statewide sponsors across every county site, alongside each county’s own local spaces.',
      notes: ['Fill rate shows how much network space is in use.'] },
    { main: false, route: 'master/analytics', target: 'master-analytics', role: M,
      title: 'Growth, week by week',
      body: 'Visitors, sign-ups and online donations across the network, so leaders see what is working.',
      notes: ['Sample trend data only.'] },

    /* ===== Campaign-in-a-box ===== */
    { chapter: 'Campaign-in-a-box', main: true, route: 'candidate', target: 'cand-pipeline', role: B,
      title: 'From recruited to on the ballot, in one view',
      body: 'Track every candidate your committee recruits: recruited, filed, endorsed, active campaign. The board sees at a glance who needs help next, so every candidate gets the next step on time.',
      notes: ['Recruiting is the job that most often slips when volunteers turn over.',
        'All candidates shown are fictional.'] },
    { main: true, route: 'candidate/builder', target: 'wizard-steps', role: B,
      title: 'A campaign site in a few guided steps',
      body: 'Candidates answer plain questions: office, district, issues and committee details. The builder turns those answers into a campaign website, donate page and print pieces, so first-time candidates start strong.',
      notes: ['Walk through the steps quickly; each one is a short form.',
        'Committee name and FPPC (Fair Political Practices Commission) number are collected once and reused everywhere.'] },
    { main: false, route: 'candidate/builder', target: 'wizard-launch', role: B,
      title: 'Hand it to the AI Campaign Director',
      body: 'One button sends the candidate’s answers to the AI (Artificial Intelligence) Campaign Director, which drafts everything for your review.',
      notes: ['This button jumps to the Director screen.'] },
    { main: false, route: 'candidate/microsite', target: 'microsite-donate', role: B,
      title: 'Donations from day one',
      body: 'Every candidate site includes a donate page from the start, so supporters can give the moment they hear the name.',
      notes: ['Sample amounts only.'] },
    { main: true, route: 'candidate/microsite', target: 'microsite-disclaimer', role: B,
      title: 'Disclaimers, always in place',
      body: 'Every candidate page carries its “Paid for by” disclaimer with the FPPC (Fair Political Practices Commission) number, placed automatically. Volunteers keep candidates compliant without memorizing the rules.',
      notes: ['The same disclaimer flows to print pieces and social posts.',
        'If a number is missing, the platform asks for it and holds the page.'] },
    { main: false, route: 'candidate/print', target: 'print-check', role: B,
      title: 'Print-ready, with a compliance check',
      body: 'Yard signs, door hangers and slate cards are checked for the disclaimer before they go to the printer.',
      notes: ['Show the check passing or asking for a missing detail.'] },
    { main: false, route: 'candidate/social', target: 'social-approve', role: B,
      title: 'Social posts, approved by people',
      body: 'Drafted posts wait for a person to approve them before they go out.',
      notes: ['Approval keeps the committee’s voice consistent.'] },

    /* ===== Field ===== */
    { chapter: 'Field & canvassing', main: true, route: 'field', target: 'field-map', role: B,
      title: 'Precinct turf, drawn for you',
      body: 'Your precincts and walk turfs on one map, color-coded by volunteer, with doors knocked updating as they happen. Field chairs see progress without phone calls or spreadsheets.',
      notes: ['Each color is one volunteer’s turf.',
        'All voters and addresses shown are invented.'] },
    { main: false, route: 'field', target: 'field-filters', role: B,
      title: 'Find the right doors',
      body: 'Filter by party, likelihood to vote and precinct to focus volunteer time where it counts most.',
      notes: ['Filters update the map instantly.'] },
    { main: true, route: 'field', target: 'field-privacy', role: B,
      title: 'Voter data stays in your county',
      body: 'Voter files live inside your county’s own space. Volunteers see only the addresses on their own walk list, and the county decides who sees more.',
      notes: ['Separation between counties is enforced in the database itself.',
        'Every export is logged, so the board knows where data went.'] },
    { main: false, route: 'field/list', target: 'field-build', role: B,
      title: 'Build a walk list in seconds',
      body: 'Pick a turf and filters, and the platform builds a walk list in a sensible walking order, ready to assign.',
      notes: ['Assign directly to a volunteer from here.'] },
    { main: true, route: 'field/canvass', target: 'field-phone', role: B,
      title: 'Canvassing from any phone',
      body: 'Volunteers open their walk list on their own phone and record each door in a tap. Results flow back to the field chair automatically, ready for the next shift.',
      notes: ['Tap through a door or two on the phone preview.',
        'Works with weak signal and catches up when the phone reconnects.'] },
    { main: false, route: 'field/canvass', target: 'field-offline', role: B,
      title: 'Keeps working with weak signal',
      body: 'Doors recorded with weak signal are saved on the phone and sync once it reconnects.',
      notes: ['Hillside and rural precincts often have spotty coverage.'] },

    /* ===== Governance ===== */
    { chapter: 'Meetings & voting', main: false, route: 'governance', target: 'gov-meeting', role: B,
      title: 'Meetings, agenda included',
      body: 'Schedule the central committee meeting, share the agenda and open the video call from one place.',
      notes: ['Agenda items link to the ballots for each vote.'] },
    { chapter: 'Meetings & voting', main: true, route: 'governance', target: 'gov-quorum', role: B,
      title: 'Quorum, counted for you',
      body: 'As members join, the platform counts seated members and verified proxies and shows the moment you reach quorum. The chair runs the meeting with confidence, and the record is accurate.',
      notes: ['Quorum rule follows your bylaws: majority of seated members in this sample.',
        'Alternates seat automatically when a member is absent, if your bylaws allow.'] },
    { main: true, route: 'governance/ballots', target: 'gov-ballot', role: B,
      title: 'Secret ballots, roll calls and weighted votes',
      body: 'Run a secret ballot, a roll call or a weighted vote right inside the meeting. Each member votes once, results follow your bylaws’ threshold, and secret ballots keep every choice private.',
      notes: ['Endorsements often need two-thirds; the threshold is set per ballot.',
        'Each voter gets a receipt proving the vote counted, without revealing the choice.'] },
    { main: false, route: 'governance/ballots', target: 'gov-receipt', role: B,
      title: 'A receipt for every vote',
      body: 'Each member gets a receipt confirming the vote was counted, while the choice itself stays private.',
      notes: ['Receipts settle disputes after close votes.'] },
    { main: false, route: 'governance/ballots', target: 'gov-results', role: B,
      title: 'Results, the moment voting closes',
      body: 'Results appear as soon as the chair closes the ballot, measured against the threshold your bylaws require.',
      notes: ['Results go straight into the minutes.'] },
    { main: false, route: 'governance/proxies', target: 'gov-proxies', role: B,
      title: 'Proxies, verified',
      body: 'Members assign proxies ahead of time, and the secretary verifies each one before the meeting starts.',
      notes: ['Verified proxies count toward quorum automatically.'] },
    { main: false, route: 'governance/proxies', target: 'gov-audit', role: B,
      title: 'An audit trail for every decision',
      body: 'Every vote, proxy and change is recorded with a time stamp, so the committee can answer any question later.',
      notes: ['Useful for credential challenges and party audits.'] },

    /* ===== AI Campaign Director ===== */
    { chapter: 'AI Campaign Director', main: true, route: 'director', target: 'dir-request', role: B,
      title: 'Ask for a whole campaign launch',
      body: 'A board member describes what a candidate needs in plain words. The AI (Artificial Intelligence) Campaign Director turns that into a plan: website, emails, social posts, print pieces and events.',
      notes: ['Press “Start the run” and let the screen work while you talk.',
        'Every run is scripted for the demo, so it plays the same way each time.'],
      action: { label: 'Start the run', run: () => { if (/running|waiting|finished/.test(dirStatus())) say('The Director is already working. Watch the next steps.', 'info'); else dirEnsureRunning(); } } },
    { main: true, route: 'director', target: 'dir-agents', role: B, prepare: dirEnsureRunning,
      title: 'Specialist assistants work side by side',
      body: 'Separate assistants draft the website, the emails, the social posts and the print pieces at the same time. Work that would fill a volunteer team’s weekend is drafted while you watch.',
      notes: ['Each card is one assistant with one job.',
        'Drafts only: nothing is public yet.'] },
    { main: true, route: 'director', target: 'dir-gate', role: B, waitText: 'The Director is checking the drafts…', prepare: dirEnsureRunning, wait: 20000,
      ready: () => !!dirQ('[data-tour="dir-gate"] [data-act="fill-fppc"]') || /finished/.test(dirStatus()) || !!dirQ('[data-tour="dir-approval"] [data-act="approve"]'),
      title: 'It checks the rules and asks when unsure',
      body: 'Before anything goes public, the Director checks each piece: disclaimers, committee numbers, dates. When a legal detail is missing, it stops and asks a person instead of guessing.',
      notes: ['This is the safeguard boards ask about most.',
        'Missing FPPC (Fair Political Practices Commission) number? It pauses and asks.',
        'When the gate asks, press the action button to supply the number from the filing.'],
      action: { label: 'Supply the committee number', run: () => {
        if (!dirSupplyNumber()) { dirEnsureRunning(); say('The number is already in place. The run continues.', 'info'); }
      } } },
    { main: true, route: 'director', target: 'dir-approval', role: B, waitText: 'The drafts are on their way to the board…', prepare: dirEnsureRunning, wait: 20000,
      ready: () => !!dirQ('[data-tour="dir-approval"] [data-act="approve"]') || !!dirQ('[data-tour="dir-gate"] [data-act="fill-fppc"]') || /finished/.test(dirStatus()),
      title: 'People approve every public step',
      body: 'Every public step waits for a person on your committee to approve it. Review each draft, edit it and approve with one click. Your board stays in charge; the AI does the drafting.',
      notes: ['Approve one item to show how quick it is.',
        'Approvals are logged with a name and time.'],
      action: { label: 'Approve', run: dirApproveOrUnblock } },
    { main: true, route: 'director', target: 'dir-summary', role: B, waitText: 'Approving the remaining drafts and finishing the run…', wait: 30000,
      prepare: () => { const sp = dirQ('[data-tour="dir-request"] [data-act="speed"]'); if (sp && sp.getAttribute('aria-pressed') !== 'true') sp.click(); },
      ready: dirFastForward,
      title: 'A plain-language summary at the end',
      body: 'The run ends with a short summary: what was drafted, what was approved and what still needs a person. Your volunteers save hours, and your county stays in control.',
      notes: ['Close on the theme: saves volunteers hours, county stays in control.',
        'Then invite questions and use the chapter menu to jump back.'] },
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
.tour-notes-btn{display:inline-flex;align-items:center;gap:6px;background:none;border:0;padding:2px 0;cursor:pointer;
  font:600 13.5px/1.3 var(--font-body);color:var(--brand,#0B2A4A)}
.tour-notes-btn svg{transition:transform .15s ease}
.tour-notes-btn[aria-expanded="true"] svg{transform:rotate(90deg)}
.tour-notes{margin:6px 0 8px;padding:10px 12px 10px 28px;background:#FFF8E6;border:1px solid #F1DFAE;border-radius:10px;color:#3E3418;font-size:14px}
.tour-notes li{margin:2px 0}
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
@media (prefers-reduced-motion:reduce){.tour-spot,.tour-card{transition:none}.tour-wait::before{animation:none}}
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
    const notesOpen = !!(App.state.tour_notes);
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
      (s.notes && s.notes.length
        ? `<div><button class="tour-notes-btn" data-t="notes" aria-expanded="${notesOpen}">${ICON_CHEV}Presenter notes</button>` +
          `<ul class="tour-notes"${notesOpen ? '' : ' hidden'}>${s.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`
        : '') +
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
      `<div class="tour-scroll"><h2 class="tour-title" id="tour-title">Now explore freely</h2>` +
      `<p class="tour-body">Every screen is yours to click through. Switch committees or roles at the top, or jump back to any chapter when a question comes up.</p>` +
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
    else if (t === 'notes') {
      App.state.tour_notes = !App.state.tour_notes;
      b.setAttribute('aria-expanded', String(!!App.state.tour_notes));
      const ul = card.querySelector('.tour-notes');
      if (ul) ul.hidden = !App.state.tour_notes;
      place();
    } else if (t === 'action' && curStep && curStep.action) {
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
    window.scrollTo({ top: Math.max(0, window.scrollY + r.top - want), behavior: reduced() ? 'auto' : 'smooth' });
  }

  function resolveAndPlace() {
    if (!active || !curStep) { place(); return; }
    const t = findTarget(curStep.target);
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
        found = findTarget(s.target);
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
    if (!active) lastFocus = document.activeElement;
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

  function restoreDefaults() {
    if (App.state.role !== 'board') App.setRole('board', true);
  }
  function finish() {
    token++;
    if (curStep && curStep.cleanup) try { curStep.cleanup(); } catch (e) { /* ignore */ }
    restoreDefaults();
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
    if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function exit() {
    if (!active) return;
    // Show the closing card so the presenter can restart or jump to a chapter.
    finish();
  }
  function finishClose() { restoreDefaults(); teardown(); }

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
