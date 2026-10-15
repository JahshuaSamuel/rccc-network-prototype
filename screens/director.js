/* screens/director.js — AI Campaign Director (Agent 9)
   A scripted, deterministic visualization of the supervisor state machine in supervisor.ts:
   intake → plan → dispatch → qualityGate → (pass → board approval if public → commit → next)
   / (fail under 3 tries → retry with feedback) / (3 failures → escalate, dependents wait) → finalize. */
(function () {
  'use strict';
  if (!window.App) return;
  const U = App.util;
  const esc = U.esc;

  const I = (d, s) => `<svg width="${s || 20}" height="${s || 20}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = I('<rect x="4" y="6" width="12" height="10" rx="2.5"/><path d="M10 3v3M7.5 11h.01M12.5 11h.01M8 14h4"/>');
  const CHECK = I('<path d="M4.5 10.5l3.5 3.5 7.5-8"/>', 16);
  const CROSS = I('<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>', 16);

  const AGENTS = [
    { id: 'net', name: 'Network', desc: 'Shares news and ads across the network',
      icon: I('<circle cx="10" cy="4.5" r="2"/><circle cx="4.5" cy="15" r="2"/><circle cx="15.5" cy="15" r="2"/><path d="M10 6.5v3M10 9.5L5.5 13.3M10 9.5l4.5 3.8"/>') },
    { id: 'web', name: 'Web Builder', desc: 'Campaign sites, web addresses, donate buttons',
      icon: I('<rect x="2.5" y="3.5" width="15" height="13" rx="2"/><path d="M2.5 7.5h15M5 5.5h.01M7 5.5h.01M6 11h8M6 13.5h5"/>') },
    { id: 'copy', name: 'Copy & Content', desc: 'Bios, press releases, social posts',
      icon: I('<path d="M13.5 3.5l3 3L8 15l-4 1 1-4z"/><path d="M11.5 5.5l3 3"/>') },
    { id: 'design', name: 'Design & Print', desc: 'Door hangers, flyers, yard signs',
      icon: I('<path d="M6 8V3.5h8V8"/><rect x="3" y="8" width="14" height="6" rx="1.5"/><path d="M6 12h8v4.5H6z"/>') },
    { id: 'media', name: 'Media Curation', desc: 'News and video feeds, tagged for your county',
      icon: I('<path d="M3.5 8v4h3l5 3.5v-11l-5 3.5z"/><path d="M14.5 7.5a3.5 3.5 0 0 1 0 5"/>') },
    { id: 'field', name: 'Field Operations', desc: 'Walk lists and routes',
      icon: I('<path d="M10 17s5-4.4 5-8.5a5 5 0 0 0-10 0C5 12.6 10 17 10 17z"/><circle cx="10" cy="8.5" r="1.8"/>') },
  ];
  const AG = Object.fromEntries(AGENTS.map((a) => [a.id, a]));

  const STATUS = {
    idle: ['Idle', 'badge'],
    working: ['Working', 'badge badge-local'],
    passed: ['Passed', 'badge badge-ok'],
    failed: ['Failed check', 'badge badge-danger'],
    waiting: ['Waiting on you', 'badge badge-warn'],
    hold: ['On hold', 'badge'],
  };

  const NODES = [
    ['intake', 'Intake'], ['plan', 'Plan'], ['dispatch', 'Dispatch'], ['gate', 'Quality gate'],
    ['approval', 'Board approval'], ['commit', 'Commit'], ['escalate', 'Escalate'], ['finalize', 'Finalize'],
  ];

  /* ---------------- run state (module-level, survives re-renders) ---------------- */
  let R = null;

  function pickCandidate(t, id) {
    const list = (t && t.candidates) || [];
    return (id && list.find((c) => c.id === id)) || list.find((c) => c.disclaimer === '') || list[0] || null;
  }

  function newModel() {
    const agents = {};
    AGENTS.forEach((a) => { agents[a.id] = { status: 'idle', act: 'Ready' }; });
    return {
      node: null, visited: {}, clock: 0, started: false, done: false, wait: null,
      agents, log: [], plan: null, bio: '', site: 0, proof: 0,
      gate: null, gateHistory: [], webAttempt: 0, revised: false, changeNote: '',
      approved: false, approvedBy: '', discByPerson: false, discFound: false, wroteDisclaimer: false,
      humanTouches: [], revising: false,
    };
  }

  function newRun(t, tenantSlug, cand, fromBuilder) {
    if (R && R.timer) clearTimeout(R.timer);
    R = {
      key: tenantSlug + ':' + (cand ? cand.id : ''), tenantSlug, t, c: cand, fromBuilder: !!fromBuilder,
      m: newModel(), queue: cand ? script(t, cand) : [], playing: false, speed: 1, timer: null,
      root: null, role: 'board', last: {},
    };
    return R;
  }

  /* ---------------- helpers that mutate the model ---------------- */
  function log(m, text, kind) { m.log.push({ t: m.clock, text, kind: kind || 'info' }); }
  function ag(m, id, status, act) { m.agents[id] = { status, act, out: m.agents[id].out }; }
  function node(m, id) { m.node = id; m.visited[id] = true; }
  function step(m, sid, status) { const s = m.plan && m.plan.find((x) => x.id === sid); if (s) s.status = status; }
  function gate(m, g) {
    m.gate = g;
    const ok = g.checks.every((c) => c.ok);
    g.ok = ok;
    m.gateHistory.push({ agent: g.agent, ok });
  }
  function disclaimerFor(c) {
    const st = App.state.disclaimers || {};
    return st[c.id] || c.disclaimer || '';
  }
  function fmtClock(ms) {
    const s = Math.round(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function firstTurf(t) { return (t.turfs && t.turfs[0]) || { name: 'Precinct turf 1', doors: 180 }; }

  /* ---------------- the scripted timeline ---------------- */
  function script(t, c) {
    const E = [];
    const e = (d, fn) => E.push({ d, fn });

    e(300, (m) => {
      node(m, 'intake'); m.started = true;
      log(m, `Request received: “Launch the campaign for ${c.name}, ${c.office}.”`);
    });
    e(1100, (m) => {
      log(m, `Loaded committee context: ${t.name}, brand colors, and California disclaimer rules (every public piece needs “Paid for by …” with the committee’s FPPC (Fair Political Practices Commission) ID).`);
    });
    e(1300, (m) => {
      node(m, 'plan');
      m.plan = [
        { id: 's1', agent: 'copy', goal: 'Write the candidate bio', deps: [], approval: false, status: 'queued' },
        { id: 's2', agent: 'web', goal: 'Build the campaign site', deps: ['s1'], approval: true, status: 'queued' },
        { id: 's3', agent: 'design', goal: 'Print door hangers', deps: ['s1', 's2'], approval: true, status: 'queued' },
        { id: 's4', agent: 'copy', goal: 'Draft social posts', deps: ['s1', 's2'], approval: true, status: 'queued' },
        { id: 's5', agent: 'media', goal: 'Tag the launch for the county homepage feed', deps: ['s2'], approval: false, status: 'queued' },
        { id: 's6', agent: 'net', goal: 'Share the launch with the regional network', deps: ['s5'], approval: false, status: 'queued' },
        { id: 's7', agent: 'field', goal: 'Build the first walk list', deps: [], approval: false, status: 'queued' },
      ];
      log(m, 'Plan ready: 7 steps. Anything public waits for a person to approve it.');
    });

    // Step 1: Copy writes the bio
    e(900, (m) => {
      node(m, 'dispatch'); step(m, 's1', 'working');
      ag(m, 'copy', 'working', 'Writing a short bio from the candidate intake form');
      log(m, 'Dispatched step 1 to Copy & Content.');
    });
    const words = String(c.bio || `${c.name} is running for ${c.office}.`).split(/\s+/);
    [0.25, 0.5, 0.75, 1].forEach((f) => e(420, (m) => {
      m.bio = words.slice(0, Math.max(1, Math.round(words.length * f))).join(' ');
      m.agents.copy.out = 'bio';
    }));
    e(1200, (m) => {
      node(m, 'gate');
      gate(m, { agent: 'copy', title: 'Candidate bio', attempt: 1, checks: [
        { name: 'Editorial review: clear, friendly, under 120 words', ok: true },
        { name: 'No invented quotes or endorsements', ok: true },
        { name: 'Facts match the candidate intake form', ok: true },
      ] });
      ag(m, 'copy', 'passed', 'Bio passed editorial review');
      log(m, 'Quality gate passed: bio (editorial review, no invented quotes or endorsements).', 'ok');
    });
    e(600, (m) => { node(m, 'commit'); step(m, 's1', 'done'); log(m, 'Committed step 1. Moving to the next step.'); });

    // Step 2: Web Builder
    e(900, (m) => {
      node(m, 'dispatch'); step(m, 's2', 'working'); m.webAttempt = 1; m.site = 1; m.agents.web.out = 'site';
      ag(m, 'web', 'working', 'Connecting the web address (DNS, Domain Name System)');
      log(m, 'Dispatched step 2 to Web Builder.');
    });
    e(900, (m) => { m.site = 2; ag(m, 'web', 'working', 'Adding the security certificate (SSL, Secure Sockets Layer)'); });
    e(900, (m) => { m.site = 3; ag(m, 'web', 'working', `Site is up at ${c.subdomain}`); log(m, `Site is up at ${c.subdomain}.`); });
    e(1300, (m) => webGate(m, t, c));
    return E;
  }

  function webChecks(c, discOk, detail) {
    return [
      { name: 'Site reachable', ok: true },
      { name: 'Secure connection (HTTPS, HyperText Transfer Protocol Secure)', ok: true },
      { name: 'Donate button present', ok: true },
      { name: 'Political disclaimer on every page', ok: discOk, detail },
    ];
  }

  function webGate(m, t, c) {
    node(m, 'gate');
    const disc = disclaimerFor(c);
    if (disc) {
      m.discFound = true;
      gate(m, { agent: 'web', title: 'Campaign site', attempt: m.webAttempt, checks: webChecks(c, true, `Found on file: “${disc}”`) });
      ag(m, 'web', 'passed', 'Site ready. Publishing waits for board approval');
      step(m, 's2', 'approval');
      log(m, 'Quality gate passed: site, including the disclaimer already on file.', 'ok');
      R.queue.unshift(...designEvents(t, c));
      return;
    }
    gate(m, { agent: 'web', title: 'Campaign site', attempt: 1, checks: webChecks(c, false, 'Candidate has no committee disclaimer on file') });
    ag(m, 'web', 'failed', 'Disclaimer check failed (attempt 1 of 3)');
    log(m, 'Quality gate: site reachable, HTTPS and donate button pass. Disclaimer check fails: none on file.', 'err');
    const E = [];
    const e = (d, fn) => E.push({ d, fn });
    e(1100, (mm) => {
      node(mm, 'dispatch'); mm.webAttempt = 2;
      ag(mm, 'web', 'working', 'Attempt 2 of 3: drafting a disclaimer from the committee name');
      log(mm, 'Retry with feedback (attempt 2 of 3): “Disclaimer missing.” Web Builder drafts one from the committee name.', 'warn');
    });
    e(1400, (mm) => {
      node(mm, 'gate');
      gate(mm, { agent: 'web', title: 'Campaign site', attempt: 2, checks: webChecks(c, false,
        `Draft “Paid for by ${c.committeeName}, FPPC #???????” has no ID. The FPPC ID must come from the committee filing — an agent can’t invent it.`),
        note: 'The Director refuses to guess. Legal details come from the committee’s filing, never from the AI.' });
      ag(mm, 'web', 'failed', 'Disclaimer check failed (attempt 2 of 3)');
      log(mm, 'Quality gate failed again: the FPPC ID must come from the committee filing. The Director refuses to guess.', 'err');
    });
    e(1000, (mm) => {
      node(mm, 'dispatch'); mm.webAttempt = 3;
      ag(mm, 'web', 'working', 'Attempt 3 of 3: looking for a committee filing on record');
      log(mm, 'Retry with feedback (attempt 3 of 3): look for the committee’s filing on record.', 'warn');
    });
    e(1200, (mm) => {
      node(mm, 'gate');
      gate(mm, { agent: 'web', title: 'Campaign site', attempt: 3, checks: webChecks(c, false,
        'No Form 410 (Statement of Organization) is on record for this committee, so the FPPC ID is unknown.'),
        note: 'The Director refuses to guess. Legal details come from the committee’s filing, never from the AI.' });
      ag(mm, 'web', 'failed', 'Disclaimer check failed (attempt 3 of 3)');
      log(mm, 'Quality gate failed 3 times. Escalating to a person.', 'err');
    });
    e(900, (mm) => {
      node(mm, 'escalate');
      ag(mm, 'web', 'waiting', 'Waiting on you: the committee’s disclaimer');
      ['s3', 's4', 's5', 's6'].forEach((s) => step(mm, s, 'hold'));
      step(mm, 's2', 'waiting');
      ag(mm, 'design', 'hold', 'On hold until the disclaimer is set');
      ag(mm, 'media', 'hold', 'On hold until the site is ready');
      ag(mm, 'net', 'hold', 'On hold until the launch is tagged');
      const eb = ((R.t.members || []).filter((x) => x.role === 'EXEC_BOARD')).length;
      log(mm, `Escalated to the Executive Board${eb ? ` (${eb} members notified)` : ''}. 4 dependent steps wait. The run pauses for a person.`, 'human');
      mm.wait = 'disclaimer';
    });
    R.queue.unshift(...E);
  }

  function resumeAfterDisclaimer(t, c, disc) {
    const E = [];
    const e = (d, fn) => E.push({ d, fn });
    e(700, (m) => {
      node(m, 'gate');
      gate(m, { agent: 'web', title: 'Campaign site', attempt: 3, checks: webChecks(c, true, `Entered by a person: “${disc}”`) });
      ag(m, 'web', 'passed', 'Site ready. Publishing waits for board approval');
      step(m, 's2', 'approval');
      ['s3', 's4', 's5', 's6'].forEach((s) => step(m, s, 'queued'));
      ['design', 'media', 'net'].forEach((a) => ag(m, a, 'idle', 'Ready'));
      log(m, 'Quality gate passed: site, with the disclaimer a person entered. Dependent steps continue.', 'ok');
    });
    return E.concat(designEvents(t, c));
  }

  function designEvents(t, c) {
    const E = [];
    const e = (d, fn) => E.push({ d, fn });
    e(900, (m) => {
      node(m, 'dispatch'); step(m, 's3', 'working');
      ag(m, 'design', 'working', 'Laying out a door hanger in committee colors');
      log(m, 'Dispatched step 3 to Design & Print.');
    });
    e(1200, (m) => { m.proof = 1; m.agents.design.out = 'proof'; ag(m, 'design', 'working', 'Proof rendered. Sending to the quality gate'); });
    e(1300, (m) => designGate(m, c));
    e(900, (m) => approvalWait(m));
    return E;
  }

  function designGate(m, c) {
    node(m, 'gate');
    gate(m, { agent: 'design', title: m.revised ? 'Door hanger proof (revised)' : 'Door hanger proof', attempt: 1, checks: [
      { name: 'Disclaimer present', ok: true, detail: disclaimerFor(c) || U.disclaimer(c) },
      { name: 'Print resolution: 300 DPI (dots per inch)', ok: true },
      { name: 'Bleed: 1/8 inch on every edge', ok: true },
    ] });
    ag(m, 'design', 'passed', m.revised ? 'Revised proof passed print checks' : 'Proof passed print checks');
    log(m, 'Quality gate passed: door hanger (disclaimer present, 300 DPI, bleed).', 'ok');
  }

  function approvalWait(m) {
    node(m, 'approval');
    ag(m, 'design', 'waiting', 'Waiting on you: approve 2,000 door hangers');
    ag(m, 'web', 'waiting', 'Waiting on you: approve publishing the site');
    step(m, 's3', 'approval');
    log(m, 'Board approval needed: send 2,000 door hangers to the print vendor and publish the campaign site.', 'human');
    m.wait = 'approval';
  }

  function revisionEvents(t, c, note) {
    const E = [];
    const e = (d, fn) => E.push({ d, fn });
    e(800, (m) => {
      node(m, 'dispatch'); m.revising = true; step(m, 's3', 'working');
      ag(m, 'design', 'working', 'Revising the proof from your note');
      ag(m, 'web', 'passed', 'Site ready. Publishing waits for board approval');
      log(m, `Back to Design & Print with your note: “${note}”`, 'warn');
    });
    e(1300, (m) => { m.proof = 2; ag(m, 'design', 'working', 'Revised proof rendered'); });
    e(1100, (m) => { m.revising = false; designGate(m, c); });
    e(800, (m) => approvalWait(m));
    return E;
  }

  function afterApproval(t, c) {
    const turf = firstTurf(t);
    const E = [];
    const e = (d, fn) => E.push({ d, fn });
    e(700, (m) => {
      node(m, 'commit'); step(m, 's2', 'done'); step(m, 's3', 'done');
      ag(m, 'web', 'passed', `Published at https://${c.subdomain}`);
      ag(m, 'design', 'passed', 'Sent 2,000 door hangers to the print vendor');
      log(m, `Committed steps 2 and 3: site published, door hangers sent to the print vendor.`, 'ok');
    });
    e(900, (m) => {
      node(m, 'dispatch'); step(m, 's4', 'working');
      ag(m, 'copy', 'working', 'Drafting 6 social posts from the approved bio');
      log(m, 'Dispatched step 4 to Copy & Content.');
    });
    e(1100, (m) => {
      node(m, 'gate');
      gate(m, { agent: 'copy', title: '6 social posts', attempt: 1, checks: [
        { name: 'No invented quotes or endorsements', ok: true },
        { name: 'Every link points to the campaign site', ok: true },
        { name: 'Disclaimer on paid posts', ok: true },
      ] });
      m.postsDone = true;
      ag(m, 'copy', 'passed', 'Bio done · 6 posts queued, awaiting approval');
      step(m, 's4', 'queued-approval');
      log(m, 'Quality gate passed: 6 posts. Queued in Social posts, where each one waits for a person to approve it.', 'ok');
    });
    e(900, (m) => {
      node(m, 'dispatch'); step(m, 's5', 'working');
      ag(m, 'media', 'working', `Tagging ${c.name}’s launch as local news for ${t.county || t.shortName}`);
      log(m, 'Dispatched step 5 to Media Curation.');
    });
    e(1000, (m) => {
      node(m, 'gate');
      gate(m, { agent: 'media', title: 'Launch item for the homepage feed', attempt: 1, checks: [
        { name: `Tagged local: ${c.district}, ${t.county || t.shortName}`, ok: true },
        { name: 'Source is the committee’s own announcement', ok: true },
        { name: 'Headline matches the approved bio', ok: true },
      ] });
      ag(m, 'media', 'passed', `Launch tagged local, placed in the ${t.shortName || t.name} homepage feed`);
      log(m, 'Quality gate passed: launch item tagged local.', 'ok');
    });
    e(600, (m) => {
      node(m, 'commit'); step(m, 's5', 'done');
      log(m, `Committed step 5: ${c.name}’s launch appears in the county homepage feed.`, 'ok');
    });
    e(900, (m) => {
      node(m, 'dispatch'); step(m, 's6', 'working');
      ag(m, 'net', 'working', 'Sharing the launch with neighboring county committees');
    });
    e(900, (m) => {
      node(m, 'commit'); step(m, 's6', 'done');
      ag(m, 'net', 'passed', 'Launch shared on the regional network channel');
      log(m, 'Committed step 6: launch shared with neighboring counties on the regional network channel.', 'ok');
    });
    e(900, (m) => {
      node(m, 'dispatch'); step(m, 's7', 'working');
      ag(m, 'field', 'working', `Building a walk list for ${turf.name}`);
      log(m, 'Dispatched step 7 to Field Operations.');
    });
    e(1100, (m) => {
      node(m, 'gate');
      gate(m, { agent: 'field', title: 'First walk list', attempt: 1, checks: [
        { name: 'Only voters inside the candidate’s district turf', ok: true },
        { name: 'Voter details stay inside the county’s own data', ok: true },
      ] });
      ag(m, 'field', 'passed', `${U.fmtNum(turf.doors)} doors in ${turf.name}, ready to assign`);
    });
    e(600, (m) => { node(m, 'commit'); step(m, 's7', 'done'); log(m, `Committed step 7: first walk list, ${U.fmtNum(turf.doors)} doors in ${turf.name}.`, 'ok'); });
    e(900, (m) => {
      node(m, 'finalize'); m.done = true;
      log(m, 'Finished. Summary ready below.', 'ok');
    });
    return E;
  }

  /* ---------------- engine ---------------- */
  function alive() { return R && R.root && document.body.contains(R.root); }

  function advance() {
    const m = R.m;
    if (m.wait || !R.queue.length) return false;
    const ev = R.queue.shift();
    m.clock += ev.d;
    ev.fn(m);
    if (!R.queue.length && !m.wait) { R.playing = false; m.done = true; }
    paint();
    if (m.wait) focusHuman();
    if (m.done) {
      const s = R.root && R.root.querySelector('[data-tour="dir-summary"]');
      if (s) s.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    }
    return true;
  }
  function schedule() {
    clearTimeout(R.timer); R.timer = null;
    if (!R.playing || R.m.wait || !R.queue.length) return;
    R.timer = setTimeout(tick, R.queue[0].d / R.speed);
  }
  function tick() {
    R.timer = null;
    if (!alive()) { R.playing = false; return; }
    advance();
    schedule();
  }
  function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function focusHuman() {
    const sel = R.m.wait === 'disclaimer' ? '[data-tour="dir-gate"]' : '[data-tour="dir-approval"]';
    const el = R.root && R.root.querySelector(sel);
    if (!el) return;
    el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
    const f = el.querySelector('input:not([type=hidden]), .btn-primary');
    if (f) setTimeout(() => { try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 50);
  }

  /* ---------------- rendering ---------------- */
  function smDesktop() {
    const n = (id, label, x, y, w) => `<g class="dir-sm-node" data-node="${id}"><rect x="${x}" y="${y}" width="${w}" height="40" rx="9"/><text x="${x + w / 2}" y="${y + 25}" text-anchor="middle">${label}</text></g>`;
    const mk = (id, col) => `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${col}"/></marker>`;
    const ar = (d, cls, m) => `<path d="${d}" class="dir-sm-edge ${cls || ''}" marker-end="url(#${m || 'dsm-a'})"/>`;
    return `<svg class="dir-sm-d" viewBox="0 0 900 196" role="img" aria-label="Director flow: Intake, Plan, Dispatch, Quality gate. Passing work goes to Board approval when public, then Commit and the next step. Failing work retries with feedback up to 3 times, then escalates to the Executive Board. When every step is done: Finalize.">
      <defs>${mk('dsm-a', 'var(--ink-3)')}${mk('dsm-w', 'var(--warn)')}${mk('dsm-d', 'var(--danger)')}</defs>
      ${ar('M112 84 H132')}${ar('M240 84 H260')}${ar('M368 84 H388')}${ar('M496 84 H532')}${ar('M656 84 H676')}${ar('M776 84 H796')}
      ${ar('M728 64 V26 H316 V60', 'is-soft')}
      <text x="522" y="18" class="dir-sm-lbl" text-anchor="middle">commit, then dispatch the next step</text>
      ${ar('M432 64 Q383 46 334 62', 'is-warn', 'dsm-w')}
      <text x="383" y="43" class="dir-sm-lbl is-warn" text-anchor="middle">retry with feedback</text>
      ${ar('M486 104 Q610 172 716 106', 'is-soft')}
      <text x="612" y="160" class="dir-sm-lbl" text-anchor="middle">no approval needed</text>
      ${ar('M444 104 V132', 'is-danger', 'dsm-d')}
      <text x="436" y="126" class="dir-sm-lbl is-danger" text-anchor="end">3 failed tries</text>
      ${ar('M392 156 H316 V108', 'is-danger', 'dsm-d')}
      <text x="306" y="176" class="dir-sm-lbl is-danger" text-anchor="end">dependents wait for a person</text>
      ${n('intake', 'Intake', 8, 64, 104)}${n('plan', 'Plan', 136, 64, 104)}${n('dispatch', 'Dispatch', 264, 64, 104)}
      ${n('gate', 'Quality gate', 392, 64, 104)}${n('approval', 'Board approval', 536, 64, 120)}${n('commit', 'Commit', 680, 64, 96)}
      ${n('finalize', 'Finalize', 800, 64, 92)}${n('escalate', 'Escalate', 392, 136, 104)}
    </svg>`;
  }
  function smMobile() {
    const n = (id, label, x, y) => `<g class="dir-sm-node" data-node="${id}"><rect x="${x}" y="${y}" width="140" height="40" rx="9"/><text x="${x + 70}" y="${y + 25}" text-anchor="middle">${label}</text></g>`;
    const ar = (d, cls, m) => `<path d="${d}" class="dir-sm-edge ${cls || ''}" marker-end="url(#${m || 'dsmm-a'})"/>`;
    return `<svg class="dir-sm-m" viewBox="0 0 340 300" role="img" aria-label="Director flow: Intake, Plan, Dispatch, Quality gate, then Board approval and Commit, or Escalate after 3 failed tries, then Finalize.">
      <defs><marker id="dsmm-a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--ink-3)"/></marker>
      <marker id="dsmm-d" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--danger)"/></marker></defs>
      ${ar('M150 30 H186')}${ar('M260 50 V70')}${ar('M190 94 H154')}
      ${ar('M80 114 V144', 'is-danger', 'dsmm-d')}${ar('M150 108 L200 144')}${ar('M260 188 V218')}${ar('M190 242 H154')}
      ${n('intake', 'Intake', 10, 10)}${n('plan', 'Plan', 190, 10)}${n('gate', 'Quality gate', 10, 74)}${n('dispatch', 'Dispatch', 190, 74)}
      ${n('escalate', 'Escalate', 10, 148)}${n('approval', 'Board approval', 190, 148)}${n('finalize', 'Finalize', 10, 222)}${n('commit', 'Commit', 190, 222)}
      <text x="170" y="290" text-anchor="middle" class="dir-sm-lbl">Failed checks retry up to 3 times, then escalate.</text>
    </svg>`;
  }

  let clipSeq = 0;
  /* Candidate photo as an SVG <image> clipped to a shape; initials circle when no photo is on file. */
  function svgPhoto(c, x, y, w, h, rx, ringColor) {
    const id = 'dir-clip-' + (++clipSeq);
    if (!c.photo) {
      const r = Math.min(w, h) / 2;
      return `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${r}" fill="#fff" opacity=".18"/>` +
        `<text x="${x + w / 2}" y="${y + h / 2}" dy=".35em" text-anchor="middle" fill="#fff" font-family="var(--font-head)" font-weight="800" font-size="${Math.round(r * 0.8)}">${esc(U.initials(c.name))}</text>`;
    }
    const pos = String(c.photoPos || '50% 25%').split(/\s+/).map((v) => parseFloat(v));
    const ax = pos[0] < 34 ? 'xMin' : pos[0] > 66 ? 'xMax' : 'xMid';
    const ay = pos[1] < 34 ? 'YMin' : pos[1] > 66 ? 'YMax' : 'YMid';
    return `<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/></clipPath></defs>` +
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="#e5e7eb"/>` +
      `<image href="${esc(c.photo)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${ax}${ay} slice" clip-path="url(#${id})"/>` +
      (ringColor ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="${ringColor}" stroke-width="2"/>` : '');
  }

  function socialSvg(t, c, w) {
    const brand = (t.colors && t.colors.brand) || '#0B2A4A';
    const accent = (t.colors && t.colors.accent) || '#C8102E';
    const fit = (str, max, fs) => (str.length * fs * 0.62 > max ? ` textLength="${max}" lengthAdjust="spacingAndGlyphs"` : '');
    return `<svg class="dir-social" width="${w}" viewBox="0 0 120 120" role="img" aria-label="Social graphic for ${esc(c.name)}">
      <rect width="120" height="120" rx="8" fill="${brand}"/>
      ${svgPhoto(c, 0, 0, 120, 78, 8)}
      <rect x="0" y="70" width="120" height="50" fill="${brand}"/>
      <rect x="0" y="70" width="120" height="3" fill="${accent}"/>
      <text x="60" y="87" text-anchor="middle" fill="#fff" font-family="var(--font-body)" font-size="8" opacity=".9">I’m running for ${esc(c.office)}</text>
      <text x="60" y="103" text-anchor="middle" fill="#fff" font-family="var(--font-head)" font-weight="800" font-size="13"${fit(c.name, 108, 13)}>${esc(c.name.toUpperCase())}</text>
      <text x="60" y="114" text-anchor="middle" fill="#fff" font-family="var(--font-body)" font-size="6" opacity=".85"${fit(c.subdomain, 108, 6)}>${esc(c.subdomain)}</text>
    </svg>`;
  }

  function hangerSvg(t, c, v, w) {
    const disc = disclaimerFor(c) || U.disclaimer(c);
    const mm = /^(Paid for by)\s+(.*?),\s*(FPPC.*)$/i.exec(disc);
    const lines = mm ? [mm[1], mm[2], mm[3]] : [disc.slice(0, 40), disc.slice(40, 80), disc.slice(80)];
    const fit = (s, max, fs) => (s.length * fs * 0.7 > max ? ` textLength="${max}" lengthAdjust="spacingAndGlyphs"` : '');
    const parts = String(c.name).split(' ');
    const first = parts.slice(0, -1).join(' ') || parts[0];
    const last = parts.length > 1 ? parts[parts.length - 1] : '';
    const big = v === 2;
    const brand = (t.colors && t.colors.brand) || '#0B2A4A';
    const accent = (t.colors && t.colors.accent) || '#C8102E';
    const star = (x, y, r) => {
      const p = [];
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * 0.42 : r; p.push((x + rr * Math.cos(a)).toFixed(1) + ',' + (y + rr * Math.sin(a)).toFixed(1)); }
      return `<polygon points="${p.join(' ')}" fill="${accent}"/>`;
    };
    return `<svg class="dir-hanger" width="${w}" viewBox="0 0 120 260" role="img" aria-label="Door hanger proof for ${esc(c.name)}${big ? ', revised' : ''}">
      <rect x="1" y="1" width="118" height="258" rx="8" fill="${brand}" stroke="var(--line-strong)"/>
      <circle cx="60" cy="17" r="9" fill="var(--surface)" stroke="var(--line-strong)"/>
      ${svgPhoto(c, 14, 32, 92, 84, 6, '#fff')}
      ${star(60, 116, 7)}
      <text x="60" y="${big ? 138 : 136}" text-anchor="middle" fill="#fff" font-family="var(--font-head)" font-weight="800" font-size="${big ? 15 : 12}"${fit(first, 104, big ? 15 : 12)}>${esc(first.toUpperCase())}</text>
      <text x="60" y="${big ? 156 : 152}" text-anchor="middle" fill="#fff" font-family="var(--font-head)" font-weight="800" font-size="${big ? 19 : 15}"${fit(last, 104, big ? 19 : 15)}>${esc(last.toUpperCase())}</text>
      <text x="60" y="${big ? 172 : 165}" text-anchor="middle" fill="#fff" opacity=".9" font-family="var(--font-body)" font-size="8"${fit(c.office + ' · ' + c.district, 104, 8)}>${esc(c.office)} · ${esc(c.district)}</text>
      <rect x="10" y="${big ? 178 : 174}" width="100" height="18" rx="4" fill="${accent}"/>
      <text x="60" y="${big ? 191 : 187}" text-anchor="middle" fill="#fff" font-family="var(--font-head)" font-weight="800" font-size="10">VOTE NOV 3</text>
      ${big ? `<text x="60" y="205" text-anchor="middle" fill="#fff" font-family="var(--font-body)" font-size="7"${fit(c.subdomain, 104, 7)}>${esc(c.subdomain)}</text>` : ''}
      <rect x="6" y="214" width="108" height="40" rx="3" fill="#fff"/>
      ${lines.map((l, i) => `<text x="60" y="${226 + i * 10}" text-anchor="middle" fill="#15202E" font-family="var(--font-body)" font-size="6.5"${fit(l, 100, 6.5)}>${esc(l)}</text>`).join('')}
    </svg>`;
  }

  function siteMini(c) {
    const disc = disclaimerFor(c) || U.disclaimer(c);
    return `<div class="dir-site" aria-label="Campaign site preview">
      <div class="dir-site-bar"><span></span><span></span><span></span><code>https://${esc(c.subdomain)}</code></div>
      <div class="dir-site-body">${U.candidatePhoto ? U.candidatePhoto(c, 52) : ''}<strong>${esc(c.name)}</strong><span class="small muted">${esc(c.office)}, ${esc(c.district)}</span>
      <span class="dir-site-donate">Donate</span></div>
      <div class="dir-site-foot">${esc(disc)}</div></div>`;
  }

  function requestHtml() {
    const c = R.c, m = R.m;
    const status = m.done ? ['Finished', 'badge-ok'] : m.wait ? ['Waiting on you', 'badge-warn'] : R.playing ? ['Running', 'badge-local'] : m.started ? ['Paused', ''] : ['Ready', ''];
    const runLabel = m.done ? 'Run again' : R.playing ? 'Pause' : m.started ? 'Resume' : 'Run';
    return `<div class="dir-req-main">
        ${U.candidatePhoto ? U.candidatePhoto(c, 56) : U.avatar(c.name, 56)}
        <div class="dir-req-text">
          <span class="small muted">Request${R.fromBuilder ? ' from the Candidate Builder' : ''}</span>
          <p class="dir-req-quote">“Launch the campaign for ${esc(c.name)}, ${esc(c.office)}”</p>
          <span class="small muted">${esc(c.district)} · ${esc(c.committeeName)}</span>
        </div>
        <span class="badge ${status[1]} dir-req-status" aria-live="polite">${status[0]}</span>
      </div>
      <div class="row dir-req-btns">
        <button class="btn btn-primary" data-act="run">${R.playing ? I('<path d="M7 4.5v11M13 4.5v11"/>', 16) : I('<path d="M6.5 4.5l9 5.5-9 5.5z"/>', 16)}${runLabel}</button>
        <button class="btn" data-act="step">${I('<path d="M5 4.5l7 5.5-7 5.5zM15 4.5v11"/>', 16)}Step</button>
        <button class="btn" data-act="reset">${I('<path d="M4 10a6 6 0 1 0 2-4.5M4 4v3.5h3.5"/>', 16)}Reset</button>
        <button class="chip${R.speed === 2 ? ' active' : ''}" data-act="speed" aria-pressed="${R.speed === 2}">Speed ${R.speed}x</button>
        <span class="small muted dir-req-clock">Agent time ${fmtClock(m.clock)}</span>
      </div>`;
  }

  function agentsHtml() {
    const m = R.m, c = R.c;
    return AGENTS.map((a) => {
      const s = m.agents[a.id];
      const st = STATUS[s.status] || STATUS.idle;
      let out = '';
      if (a.id === 'copy' && m.bio) out = `<p class="dir-agent-out dir-bio">${esc(m.bio)}${m.agents.copy.status === 'working' ? '<span class="dir-caret" aria-hidden="true"></span>' : ''}</p>`;
      if (a.id === 'web' && m.site) {
        const steps = ['Web address (DNS)', 'Security (SSL)', 'Live'];
        out = `<div class="dir-progress" aria-label="Site setup progress">${steps.map((x, i) => `<span class="${m.site > i ? 'is-on' : ''}">${x}</span>`).join('')}</div>`;
      }
      if (a.id === 'design' && m.proof) out = `<div class="dir-agent-out dir-proof-thumb">${hangerSvg(R.t, c, m.proof, 46)}<span class="small muted">Proof ${m.proof === 2 ? 'v2 (revised)' : 'v1'}</span></div>`;
      if (a.id === 'copy' && m.postsDone) out = `<a class="small" href="#/candidate/social">Open Social posts →</a>`;
      if (a.id === 'media' && s.status === 'passed') out = `<a class="small" href="#/public-hub">See it in the homepage feed →</a>`;
      if (a.id === 'field' && s.status === 'passed') out = `<a class="small" href="#/field/list">Open the walk list →</a>`;
      return `<div class="card dir-agent is-${s.status}">
        <div class="dir-agent-top">
          <span class="dir-agent-ic">${a.icon}</span>
          <div class="dir-agent-name"><h4>${esc(a.name)}</h4><span class="small muted">${esc(a.desc)}</span></div>
        </div>
        <div class="row dir-agent-stat"><span class="${st[1]}">${s.status === 'working' ? '<span class="dir-pulse" aria-hidden="true"></span>' : ''}${st[0]}</span></div>
        <div class="dir-agent-act small" title="${esc(s.act)}">${esc(s.act)}</div>
        ${out}
      </div>`;
    }).join('');
  }

  function checksHtml(g) {
    return `<ul class="dir-checks">${g.checks.map((k) => `<li class="${k.ok ? 'ok' : 'bad'}"><span class="dir-ck">${k.ok ? CHECK : CROSS}</span><span><strong>${esc(k.name)}</strong>${k.detail ? `<span class="small dir-ck-detail">${esc(k.detail)}</span>` : ''}</span></li>`).join('')}</ul>`;
  }

  function gateHtml() {
    const m = R.m, c = R.c;
    const g = m.gate;
    const head = `<div class="card-head"><h3>Quality gate</h3><span class="spacer"></span>${g ? `<span class="badge ${g.ok ? 'badge-ok' : 'badge-danger'}">${g.ok ? 'Passed' : 'Failed'}</span>` : '<span class="badge">Standing by</span>'}</div>`;
    if (!g) {
      return head + `<div class="card-body dir-ph">
        <p class="muted">Every result stops here before it moves on. The gate checks facts, legal disclaimers, print specs and site health.</p>
        <ul class="dir-checks is-ghost"><li><span class="dir-ck"></span><span>Editorial review</span></li><li><span class="dir-ck"></span><span>Political disclaimer</span></li><li><span class="dir-ck"></span><span>Print specs and site health</span></li></ul></div>`;
    }
    const hist = m.gateHistory.length ? `<div class="dir-hist small"><span class="muted">History:</span> ${m.gateHistory.map((h) => `<span class="dir-hist-chip ${h.ok ? 'ok' : 'bad'}">${esc(AG[h.agent].name)} ${h.ok ? '✓' : '✗'}</span>`).join('')}</div>` : '';
    let body = `<div class="card-body">
      <p class="dir-gate-title"><strong>${esc(g.title)}</strong> <span class="muted small">· ${esc(AG[g.agent].name)}${g.agent === 'web' && !g.ok ? ` · attempt ${g.attempt} of 3` : ''}</span></p>
      ${checksHtml(g)}
      ${g.note ? `<div class="dir-note">${I('<path d="M10 3l7.5 13h-15z"/><path d="M10 8v3.5M10 14h.01"/>', 18)}<span>${esc(g.note)}</span></div>` : ''}
      ${hist}</div>`;
    if (m.wait === 'disclaimer') {
      const eb = (R.t.members || []).filter((x) => x.role === 'EXEC_BOARD').length;
      body += `<div class="card-body dir-human">
        <span class="badge badge-warn">Escalated to the Executive Board${eb ? ` · ${eb} members notified` : ''}</span>
        <h4>Enter the committee’s disclaimer</h4>
        <p class="small">The Web Builder tried 3 times. The FPPC ID comes from the committee’s Form 410 filing, so a person supplies it. Check the filing and confirm.</p>
        <form class="stack dir-disc-form" data-form="disc" novalidate>
          <label class="dir-field"><span class="small">Committee name, exactly as filed</span>
            <input class="input" name="cname" value="${esc(c.committeeName)}" autocomplete="off"></label>
          <label class="dir-field"><span class="small">FPPC ID from the filing</span>
            <input class="input" name="fppc" inputmode="numeric" placeholder="7-digit ID, e.g. 1234567" autocomplete="off"></label>
          <p class="small muted dir-sample">Sample filing for this demo lists ID #${esc(c.fppcId)}. <button type="button" class="btn btn-ghost btn-sm" data-act="fill-fppc">Use it</button></p>
          <div class="dir-preview small"><span class="muted">Preview:</span> <span data-preview>Paid for by ${esc(c.committeeName)}, FPPC #…</span></div>
          <div class="row"><button class="btn btn-primary" type="submit">Confirm and resume</button></div>
        </form></div>`;
    }
    return head + body;
  }

  function approvalHtml() {
    const m = R.m, c = R.c;
    const roleOk = R.role === 'board' || R.role === 'master';
    const head = (b) => `<div class="card-head"><h3>Board approval</h3><span class="spacer"></span>${b}</div>`;
    if (m.wait === 'approval') {
      return head('<span class="badge badge-warn">Waiting on you</span>') + `<div class="card-body dir-human">
        <h4>Approve sending 2,000 door hangers to the print vendor and publishing the campaign site?</h4>
        <div class="dir-appr-preview">${hangerSvg(R.t, c, m.proof, 104)}${siteMini(c)}</div>
        ${m.revised ? `<p class="small muted">Revised once from your note: “${esc(m.changeNote)}”</p>` : ''}
        ${roleOk ? '' : `<p class="small dir-role-note">You are viewing as ${esc(App.roleLabel(R.role))}. In production, only Executive Board members see these buttons; they stay open here for the demo.</p>`}
        <div class="row"><button class="btn btn-primary" data-act="approve">${CHECK}Approve</button>
        ${m.revised ? '' : '<button class="btn" data-act="changes">Request changes</button>'}</div></div>`;
    }
    if (m.wait === 'changes') {
      return head('<span class="badge badge-warn">Your note</span>') + `<div class="card-body dir-human">
        <h4>What should Design & Print change?</h4>
        <form class="stack" data-form="changes">
          <textarea class="textarea" name="note" rows="3">Make the candidate’s name larger and add the website address.</textarea>
          <div class="row"><button class="btn btn-primary" type="submit">Send to Design & Print</button><button class="btn btn-ghost" type="button" data-act="cancel-changes">Back</button></div>
        </form></div>`;
    }
    if (m.revising) {
      return head('<span class="badge badge-local">Revising</span>') + `<div class="card-body"><p>Design & Print is revising the proof from your note:</p><p class="dir-quote">“${esc(m.changeNote)}”</p><p class="small muted">The revised proof goes back through the quality gate, then returns here.</p></div>`;
    }
    if (m.approved) {
      return head('<span class="badge badge-ok">Approved</span>') + `<div class="card-body dir-appr-done">
        ${hangerSvg(R.t, c, m.proof, 64)}
        <div><p><strong>Approved by ${esc(m.approvedBy)}</strong> at ${esc(m.approvedAt)}.</p>
        <p class="small muted">2,000 door hangers went to the print vendor and the site is public at https://${esc(c.subdomain)}.</p></div></div>`;
    }
    return head('<span class="badge">Standing by</span>') + `<div class="card-body dir-ph">
      <p class="muted">Anything public waits here for an Executive Board member: printing, publishing, and posting. The AI prepares it; a person says yes.</p>
      <div class="row"><button class="btn btn-sm" disabled aria-disabled="true">Approve</button><button class="btn btn-sm" disabled aria-disabled="true">Request changes</button></div></div>`;
  }

  const STEP_BADGE = {
    queued: ['Queued', 'badge'], working: ['Working', 'badge badge-local'], done: ['Done', 'badge badge-ok'],
    hold: ['On hold', 'badge'], waiting: ['Waiting on you', 'badge badge-warn'], approval: ['Needs approval', 'badge badge-warn'],
    'queued-approval': ['Awaiting approval', 'badge badge-warn'],
  };
  function planHtml() {
    const m = R.m;
    if (!m.plan) {
      return `<div class="card-head"><h3>Plan</h3></div><div class="card-body dir-ph"><p class="muted">The Director breaks the request into steps, assigns each to an agent, and marks which ones need a person to approve.</p></div>`;
    }
    const idx = Object.fromEntries(m.plan.map((s, i) => [s.id, i + 1]));
    return `<div class="card-head"><h3>Plan</h3><span class="spacer"></span><span class="small muted">7 steps</span></div>
      <ol class="dir-plan">${m.plan.map((s, i) => {
        const b = STEP_BADGE[s.status] || STEP_BADGE.queued;
        return `<li class="is-${s.status}"><span class="dir-plan-n">${i + 1}</span>
          <div class="dir-plan-txt"><strong>${esc(s.goal)}</strong><span class="small muted">${esc(AG[s.agent].name)} · ${s.deps.length ? 'after step ' + s.deps.map((d) => idx[d]).join(' and ') : 'starts right away'}${s.approval ? ' · needs approval' : ''}</span></div>
          <span class="${b[1]}">${b[0]}</span></li>`;
      }).join('')}</ol>`;
  }

  function logHtml() {
    const m = R.m;
    if (!m.log.length) return '<li class="dir-log-empty muted">Press Run to watch the Director work, or Step to go one event at a time.</li>';
    return m.log.map((l) => `<li class="k-${l.kind}"><time>${fmtClock(l.t)}</time><span>${esc(l.text)}</span></li>`).join('');
  }

  function summaryHtml() {
    const m = R.m, c = R.c, t = R.t;
    if (!m.done) {
      return `<div class="card-head"><h3>Run summary</h3><span class="spacer"></span><span class="badge">Appears when the run finishes</span></div>
        <div class="card-body dir-ph"><p class="muted">What the agents finished, what needed a person, and links to every result.</p>
        <div class="dir-skel"><span></span><span></span><span></span></div></div>`;
    }
    const turf = firstTurf(t);
    const disc = disclaimerFor(c);
    const done = [
      `Bio written and passed editorial review`,
      `Campaign site live at <a href="#/candidate/microsite/${esc(c.id)}">https://${esc(c.subdomain)}</a> with a donate button`,
      `2,000 door hangers sent to the print vendor (300 DPI, with bleed)`,
      `6 social posts drafted by Copy &amp; Content, each awaiting approval`,
      `Launch tagged local and placed in the ${esc(t.shortName || t.name)} homepage feed`,
      `Launch shared with neighboring counties on the regional network`,
      `First walk list: ${U.fmtNum(turf.doors)} doors in ${esc(turf.name)}`,
    ];
    const human = [];
    if (m.discByPerson) human.push(`<strong>Committee disclaimer.</strong> The AI refused to guess the FPPC ID after 3 tries; a person entered “${esc(disc)}”.`);
    else if (m.discFound) human.push(`<strong>Committee disclaimer.</strong> Already on file from a person: “${esc(disc)}”.`);
    human.push(`<strong>Board approval</strong> for printing and publishing, given by ${esc(m.approvedBy)}${m.revised ? ' after one round of changes' : ''}.`);
    human.push(`<strong>Social posts</strong> wait for a person to approve each one.`);
    return `<div class="card-head"><h3>Run summary</h3><span class="spacer"></span><span class="badge badge-ok">Finished in ${fmtClock(m.clock)} of agent time</span></div>
      <div class="card-body"><div class="dir-sum-grid">
        <div><h4>Done by the agents</h4><ul class="dir-sum-list ok">${done.map((d) => `<li>${CHECK}<span>${d}</span></li>`).join('')}</ul></div>
        <div><h4>Needed a person</h4><ul class="dir-sum-list human">${human.map((d) => `<li>${I('<circle cx="10" cy="7" r="3"/><path d="M4 17c.8-3.2 3.1-5 6-5s5.2 1.8 6 5"/>', 16)}<span>${d}</span></li>`).join('')}</ul></div>
        <div class="dir-est"><span class="small dir-est-tag">Estimate</span>
          <div class="kpi-value">about 6 hours</div>
          <div class="kpi-label">Estimated volunteer time saved</div>
          <p class="small muted">A rough estimate from typical volunteer time: bio 45 min, site 2 hr, door hanger 1.5 hr, social 1 hr, feed and network 15 min, walk list 30 min.</p></div>
      </div>
      <div class="dir-media">
        <h4>Media the agents produced</h4>
        <div class="dir-media-row">
          <figure><div class="dir-media-frame">${siteMini(c)}</div><figcaption class="small">Campaign site headshot</figcaption></figure>
          <figure><div class="dir-media-frame">${hangerSvg(t, c, m.proof, 66)}</div><figcaption class="small">Door hanger${m.proof === 2 ? ' (revised)' : ''}</figcaption></figure>
          <figure><div class="dir-media-frame">${socialSvg(t, c, 128)}</div><figcaption class="small">Social graphic (awaiting approval)</figcaption></figure>
        </div>
      </div>
      <div class="row dir-sum-links">
        <button class="btn btn-primary" data-go="candidate/microsite/${esc(c.id)}">Campaign site</button>
        <button class="btn" data-go="candidate/print">Print studio</button>
        <button class="btn" data-go="candidate/social">Social posts</button>
        <button class="btn" data-go="field/list">Field walk list</button>
      </div></div>`;
  }

  function set(name, html) {
    if (!R.root) return;
    if (R.last[name] === html) return;
    const el = R.root.querySelector(`[data-region="${name}"]`);
    if (!el) return;
    R.last[name] = html;
    el.innerHTML = html;
  }

  function paint() {
    if (!R || !R.root) return;
    const m = R.m;
    set('req', requestHtml());
    R.root.querySelectorAll('.dir-sm-node').forEach((g) => {
      const id = g.dataset.node;
      const active = m.node === id;
      g.classList.toggle('is-active', active);
      g.classList.toggle('is-done', !!m.visited[id] && !active);
      g.classList.toggle('is-alert', active && id === 'escalate');
      g.classList.toggle('is-wait', active && id === 'approval' && m.wait === 'approval');
    });
    const smNow = R.root.querySelector('[data-sm-now]');
    if (smNow) {
      const lbl = (NODES.find((n) => n[0] === m.node) || [null, ''])[1];
      smNow.textContent = m.node ? `Now: ${lbl}` : 'Not started';
    }
    set('agents', agentsHtml());
    set('gate', gateHtml());
    set('approval', approvalHtml());
    set('plan', planHtml());
    const before = R.last.log;
    set('log', logHtml());
    if (before !== R.last.log) { const lw = R.root.querySelector('.dir-log'); if (lw) lw.scrollTop = lw.scrollHeight; }
    set('summary', summaryHtml());
    R.root.querySelector('[data-tour="dir-gate"]').classList.toggle('is-human', m.wait === 'disclaimer');
    R.root.querySelector('[data-tour="dir-approval"]').classList.toggle('is-human', m.wait === 'approval' || m.wait === 'changes');
    R.root.querySelector('[data-tour="dir-gate"]').classList.toggle('is-ph', !m.gate);
    R.root.querySelector('[data-tour="dir-approval"]').classList.toggle('is-ph', !m.wait && !m.approved && !m.revising);
    R.root.querySelector('[data-tour="dir-summary"]').classList.toggle('is-ph', !m.done);
  }

  /* ---------------- actions ---------------- */
  function doReset(silent) {
    const m = R.m;
    let cleared = false;
    if (m.wroteDisclaimer && App.state.disclaimers) { delete App.state.disclaimers[R.c.id]; cleared = true; }
    const root = R.root, role = R.role, from = R.fromBuilder, speed = R.speed;
    newRun(R.t, R.tenantSlug, R.c, from);
    R.root = root; R.role = role; R.speed = speed;
    paint();
    if (!silent) App.toast(cleared ? 'Run reset. The disclaimer you entered was cleared so the check can replay.' : 'Run reset.', 'info');
  }

  function onAct(act, btn) {
    const m = R.m;
    if (act === 'run') {
      if (m.done) { doReset(true); R.playing = true; schedule(); paint(); return; }
      if (R.playing) { R.playing = false; clearTimeout(R.timer); paint(); return; }
      R.playing = true;
      if (m.wait) { paint(); App.toast('Waiting on you. Answer the highlighted card to continue.', 'warn'); focusHuman(); return; }
      schedule(); paint();
      return;
    }
    if (act === 'step') {
      if (R.playing) { R.playing = false; clearTimeout(R.timer); }
      if (m.done) { App.toast('The run is finished. Press Reset or Run again to replay.', 'info'); paint(); return; }
      if (m.wait) { paint(); App.toast('Waiting on you. Answer the highlighted card to continue.', 'warn'); focusHuman(); return; }
      advance();
      return;
    }
    if (act === 'reset') { doReset(false); return; }
    if (act === 'speed') {
      R.speed = R.speed === 1 ? 2 : 1;
      if (R.playing) schedule();
      paint();
      App.toast(`Speed set to ${R.speed}x.`, 'info');
      return;
    }
    if (act === 'fill-fppc') {
      const f = R.root.querySelector('[data-form="disc"]');
      if (f) { f.fppc.value = R.c.fppcId; updatePreview(f); f.fppc.focus(); }
      return;
    }
    if (act === 'approve') {
      m.wait = null; m.approved = true;
      m.approvedBy = App.roleLabel(R.role); m.approvedAt = fmtClock(m.clock);
      log(m, `Approved by ${m.approvedBy}: print 2,000 door hangers and publish the site.`, 'human');
      m.humanTouches.push('approval');
      R.queue.unshift(...afterApproval(R.t, R.c));
      App.toast('Approved. The Director is sending the proof to print and publishing the site.', 'ok');
      paint(); schedule();
      if (!R.playing) App.toast('Press Run or Step to continue.', 'info');
      return;
    }
    if (act === 'changes') { m.wait = 'changes'; paint(); const ta = R.root.querySelector('[data-form="changes"] textarea'); if (ta) ta.focus(); return; }
    if (act === 'cancel-changes') { m.wait = 'approval'; paint(); return; }
  }

  function updatePreview(f) {
    const p = R.root.querySelector('[data-preview]');
    if (p) p.textContent = `Paid for by ${f.cname.value.trim() || '…'}, FPPC #${f.fppc.value.trim() || '…'}`;
  }

  function onSubmit(form) {
    const m = R.m;
    if (form.dataset.form === 'disc') {
      const name = form.cname.value.trim();
      const id = form.fppc.value.trim().replace(/^#/, '');
      if (!name) { App.toast('Add the committee name exactly as filed.', 'warn'); form.cname.focus(); return; }
      if (!/^\d{6,9}$/.test(id)) { App.toast('Enter the FPPC ID from the filing: digits only, usually 7.', 'warn'); form.fppc.focus(); return; }
      const disc = `Paid for by ${name}, FPPC #${id}`;
      App.state.disclaimers = App.state.disclaimers || {};
      App.state.disclaimers[R.c.id] = disc;
      m.wroteDisclaimer = true; m.discByPerson = true; m.wait = null;
      m.humanTouches.push('disclaimer');
      log(m, `A person entered the disclaimer: “${disc}”. Saved for every screen that prints it.`, 'human');
      R.queue.unshift(...resumeAfterDisclaimer(R.t, R.c, disc));
      App.toast('Disclaimer saved. The Director re-runs the check and continues.', 'ok');
      paint(); schedule();
      if (!R.playing) App.toast('Press Run or Step to continue.', 'info');
      return;
    }
    if (form.dataset.form === 'changes') {
      const note = form.note.value.trim() || 'Make the candidate’s name larger.';
      m.wait = null; m.revised = true; m.changeNote = note;
      log(m, 'Changes requested on the door hanger proof.', 'human');
      R.queue.unshift(...revisionEvents(R.t, R.c, note));
      App.toast('Sent to Design & Print. A revised proof comes back for approval.', 'info');
      paint(); schedule();
      if (!R.playing) App.toast('Press Run or Step to continue.', 'info');
    }
  }

  /* ---------------- styles (scoped) ---------------- */
  function injectStyles() {
    if (document.getElementById('scr-dir-style')) return;
    const s = document.createElement('style');
    s.id = 'scr-dir-style';
    s.textContent = `
.scr-dir .dir-req { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
.scr-dir .dir-req-main { display: flex; align-items: center; gap: 14px; }
.scr-dir .dir-req-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.scr-dir .dir-req-quote { font-family: var(--font-head); font-stretch: 85%; font-weight: 750; font-size: 1.35rem; line-height: 1.2; margin: 2px 0 2px; color: var(--ink); }
.scr-dir .dir-req-clock { margin-left: auto; font-variant-numeric: tabular-nums; }
.scr-dir .dir-req-btns .btn svg { flex: none; }
.scr-dir .dir-sm { padding: 12px 14px 8px; }
.scr-dir .dir-sm-head { display: flex; align-items: center; gap: 10px; padding: 4px 6px 6px; }
.scr-dir .dir-sm-head h3 { margin: 0; font-size: 1.1rem; }
.scr-dir .dir-sm svg { display: block; width: 100%; height: auto; }
.scr-dir .dir-sm-m { display: none !important; max-width: 420px; margin: 0 auto; }
.scr-dir .dir-sm-node rect { fill: var(--surface); stroke: var(--line-strong); stroke-width: 1.5; transition: fill .25s ease, stroke .25s ease; }
.scr-dir .dir-sm-node text { font: 600 14px var(--font-body); fill: var(--ink-2); }
.scr-dir .dir-sm-node.is-done rect { fill: color-mix(in srgb, var(--brand) 8%, white); stroke: color-mix(in srgb, var(--brand) 45%, white); }
.scr-dir .dir-sm-node.is-done text { fill: var(--brand); }
.scr-dir .dir-sm-node.is-active rect { fill: var(--brand); stroke: var(--brand); stroke-width: 3; }
.scr-dir .dir-sm-node.is-active text { fill: var(--brand-ink); font-weight: 700; }
.scr-dir .dir-sm-node.is-alert rect { fill: var(--danger); stroke: var(--danger); }
.scr-dir .dir-sm-node.is-wait rect { fill: var(--warn); stroke: var(--warn); }
.scr-dir .dir-sm-node.is-alert text, .scr-dir .dir-sm-node.is-wait text { fill: #fff; }
.scr-dir .dir-sm-edge { fill: none; stroke: var(--ink-3); stroke-width: 1.8; }
.scr-dir .dir-sm-edge.is-soft { stroke-dasharray: 4 4; }
.scr-dir .dir-sm-edge.is-warn { stroke: var(--warn); stroke-dasharray: 5 4; }
.scr-dir .dir-sm-edge.is-danger { stroke: var(--danger); stroke-dasharray: 5 4; }
.scr-dir .dir-sm-lbl { font: 500 12.5px var(--font-body); fill: var(--ink-3); }
.scr-dir .dir-sm-lbl.is-warn { fill: var(--warn); }
.scr-dir .dir-sm-lbl.is-danger { fill: var(--danger); }
.scr-dir .dir-sec { margin-top: 24px; }
.scr-dir .dir-sec-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 12px; margin-bottom: 10px; }
.scr-dir .dir-sec-head h2 { margin: 0; font-size: 1.3rem; }
.scr-dir .dir-agent { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; border-left: 4px solid var(--line); transition: border-color .2s ease; }
.scr-dir .dir-agent.is-working { border-left-color: var(--brand); }
.scr-dir .dir-agent.is-passed { border-left-color: var(--ok); }
.scr-dir .dir-agent.is-failed { border-left-color: var(--danger); }
.scr-dir .dir-agent.is-waiting { border-left-color: var(--warn); background: color-mix(in srgb, var(--warn-soft) 55%, white); }
.scr-dir .dir-agent.is-hold { opacity: .78; }
.scr-dir .dir-agent-top { display: flex; align-items: center; gap: 10px; }
.scr-dir .dir-agent-ic { width: 38px; height: 38px; border-radius: 10px; flex: none; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--brand) 10%, white); color: var(--brand); }
.scr-dir .dir-agent-ic svg { width: 21px; height: 21px; }
.scr-dir .dir-agent-name { min-width: 0; display: flex; flex-direction: column; }
.scr-dir .dir-agent-name h4 { margin: 0; font-size: 1.02rem; }
.scr-dir .dir-agent-name .small { line-height: 1.3; }
.scr-dir .dir-agent-act { color: var(--ink-2); font-weight: 500; min-height: 2.9em; }
.scr-dir .dir-pulse { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: dirPulse 1s ease-in-out infinite; }
@keyframes dirPulse { 50% { opacity: .25; } }
.scr-dir .dir-bio { font-size: 13.5px; line-height: 1.45; color: var(--ink-2); margin: 0; background: var(--surface-2); border-radius: var(--r-sm); padding: 8px 10px; max-height: 7.6em; overflow: hidden; }
.scr-dir .dir-caret { display: inline-block; width: 2px; height: 1em; background: var(--brand); vertical-align: -2px; margin-left: 2px; animation: dirPulse .8s steps(1) infinite; }
.scr-dir .dir-progress { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.scr-dir .dir-progress span { font-size: 13px; text-align: center; padding: 4px 2px; border-radius: 5px; background: var(--surface-2); color: var(--ink-3); border-top: 3px solid var(--line); }
.scr-dir .dir-progress span.is-on { color: var(--ok); border-top-color: var(--ok); background: var(--ok-soft); font-weight: 600; }
.scr-dir .dir-proof-thumb { display: flex; align-items: center; gap: 10px; }
.scr-dir .dir-hanger { display: block; flex: none; height: auto; }
.scr-dir .card.is-ph { background: var(--surface-2); border-style: dashed; }
.scr-dir .dir-ph p { margin-bottom: 10px; }
.scr-dir .card.is-human { border: 2px solid var(--warn); box-shadow: 0 0 0 4px color-mix(in srgb, var(--warn) 18%, transparent), var(--shadow-2); }
.scr-dir .dir-human { background: color-mix(in srgb, var(--warn-soft) 60%, white); border-radius: 0 0 var(--r-lg) var(--r-lg); }
.scr-dir .dir-human h4 { margin: 10px 0 6px; font-size: 1.12rem; }
.scr-dir .dir-gate-title { margin-bottom: 8px; }
.scr-dir .dir-checks { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.scr-dir .dir-checks li { display: flex; gap: 10px; align-items: flex-start; font-size: 15px; }
.scr-dir .dir-checks li strong { font-weight: 600; }
.scr-dir .dir-ck { width: 24px; height: 24px; border-radius: 50%; flex: none; display: inline-flex; align-items: center; justify-content: center; background: var(--surface-2); border: 1px dashed var(--line-strong); }
.scr-dir .dir-checks li.ok .dir-ck { background: var(--ok-soft); color: var(--ok); border: 0; }
.scr-dir .dir-checks li.bad .dir-ck { background: var(--danger-soft); color: var(--danger); border: 0; }
.scr-dir .dir-checks li.bad strong { color: var(--danger); }
.scr-dir .dir-checks.is-ghost li { color: var(--ink-3); }
.scr-dir .dir-ck-detail { display: block; color: var(--ink-2); margin-top: 2px; }
.scr-dir .dir-note { display: flex; gap: 8px; align-items: flex-start; margin-top: 12px; padding: 10px 12px; border-radius: var(--r-sm); background: var(--danger-soft); color: var(--danger); font-weight: 600; font-size: 14.5px; }
.scr-dir .dir-note svg { flex: none; margin-top: 2px; }
.scr-dir .dir-hist { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.scr-dir .dir-hist-chip { padding: 1px 8px; border-radius: 999px; font-weight: 600; }
.scr-dir .dir-hist-chip.ok { background: var(--ok-soft); color: var(--ok); }
.scr-dir .dir-hist-chip.bad { background: var(--danger-soft); color: var(--danger); }
.scr-dir .dir-field { display: flex; flex-direction: column; gap: 4px; font-weight: 600; }
.scr-dir .dir-sample { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; }
.scr-dir .dir-preview { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 8px 10px; font-weight: 600; overflow-wrap: anywhere; }
.scr-dir .dir-appr-preview { display: flex; gap: 14px; align-items: flex-start; margin: 10px 0 12px; }
.scr-dir .dir-site { flex: 1; min-width: 0; border: 1px solid var(--line-strong); border-radius: var(--r); background: var(--surface); overflow: hidden; }
.scr-dir .dir-site-bar { display: flex; align-items: center; gap: 4px; padding: 6px 8px; background: var(--surface-2); border-bottom: 1px solid var(--line); }
.scr-dir .dir-site-bar > span { width: 7px; height: 7px; border-radius: 50%; background: var(--line-strong); }
.scr-dir .dir-site-bar code { font-size: 12.5px; margin-left: 6px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scr-dir .dir-site-body { padding: 14px 12px; display: flex; flex-direction: column; gap: 4px; background: color-mix(in srgb, var(--brand) 6%, white); }
.scr-dir .dir-site-body strong { font-family: var(--font-head); font-size: 1.15rem; color: var(--brand); }
.scr-dir .dir-site-donate { align-self: flex-start; margin-top: 6px; background: var(--accent); color: #fff; font-weight: 700; font-size: 13px; padding: 4px 12px; border-radius: 5px; }
.scr-dir .dir-site-foot { font-size: 13px; padding: 6px 10px; color: var(--ink-2); border-top: 1px solid var(--line); }
.scr-dir .dir-role-note { background: var(--surface); border-radius: var(--r-sm); padding: 6px 10px; border: 1px solid var(--line); }
.scr-dir .dir-quote { font-style: italic; border-left: 3px solid var(--line-strong); padding-left: 10px; }
.scr-dir .dir-appr-done { display: flex; gap: 14px; align-items: flex-start; }
.scr-dir .dir-plan { list-style: none; margin: 0; padding: 8px 12px 12px; }
.scr-dir .dir-plan li { display: flex; align-items: center; gap: 10px; padding: 8px 4px; border-bottom: 1px solid var(--line); }
.scr-dir .dir-plan li:last-child { border-bottom: 0; }
.scr-dir .dir-plan-n { width: 26px; height: 26px; border-radius: 50%; flex: none; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; background: var(--surface-2); border: 1px solid var(--line); }
.scr-dir .dir-plan li.is-done .dir-plan-n { background: var(--ok); color: #fff; border-color: var(--ok); }
.scr-dir .dir-plan li.is-working .dir-plan-n { background: var(--brand); color: var(--brand-ink); border-color: var(--brand); }
.scr-dir .dir-plan-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.scr-dir .dir-plan-txt strong { font-weight: 600; font-size: 15px; }
.scr-dir .dir-log { list-style: none; margin: 0; padding: 10px 14px; height: 340px; overflow-y: auto; font-size: 14px; }
.scr-dir .dir-log li { display: flex; gap: 10px; padding: 5px 0; border-bottom: 1px dashed var(--line); line-height: 1.4; }
.scr-dir .dir-log li:last-child { border-bottom: 0; }
.scr-dir .dir-log time { font-variant-numeric: tabular-nums; color: var(--ink-3); font-weight: 600; flex: none; width: 40px; }
.scr-dir .dir-log li.k-ok span { color: var(--ok); }
.scr-dir .dir-log li.k-err span { color: var(--danger); }
.scr-dir .dir-log li.k-warn span { color: var(--warn); }
.scr-dir .dir-log li.k-human span { color: var(--ink); font-weight: 700; }
.scr-dir .dir-log li.k-human { background: var(--warn-soft); margin: 0 -8px; padding: 5px 8px; border-radius: 6px; }
.scr-dir .dir-log-empty { border: 0 !important; }
.scr-dir .dir-skel { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.scr-dir .dir-skel span { height: 64px; border-radius: var(--r); background: repeating-linear-gradient(-45deg, var(--surface), var(--surface) 8px, var(--line) 8px, var(--line) 9px); border: 1px dashed var(--line-strong); }
.scr-dir .dir-sum-grid { display: grid; grid-template-columns: 1.2fr 1.1fr .9fr; gap: 20px; }
.scr-dir .dir-sum-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 15px; }
.scr-dir .dir-sum-list li { display: flex; gap: 8px; align-items: flex-start; }
.scr-dir .dir-sum-list svg { flex: none; margin-top: 3px; }
.scr-dir .dir-sum-list.ok svg { color: var(--ok); }
.scr-dir .dir-sum-list.human svg { color: var(--warn); }
.scr-dir .dir-est { background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--r); padding: 14px 16px; align-self: start; }
.scr-dir .dir-est .kpi-value { font-size: 1.8rem; }
.scr-dir .dir-est-tag { display: inline-block; font-weight: 700; color: var(--warn); background: var(--warn-soft); border-radius: 999px; padding: 1px 9px; margin-bottom: 6px; }
.scr-dir .dir-req-main .cand-photo { border: 3px solid var(--surface); box-shadow: 0 0 0 2px var(--brand); }
.scr-dir .dir-site-body .cand-photo { margin-bottom: 4px; box-shadow: 0 0 0 2px #fff; }
.scr-dir .dir-media { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--line); }
.scr-dir .dir-media h4 { margin-bottom: 10px; }
.scr-dir .dir-media-row { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, .8fr) minmax(0, 1fr); gap: 16px; align-items: stretch; }
.scr-dir .dir-media-row figure { margin: 0; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.scr-dir .dir-media-frame { flex: 1; display: flex; justify-content: center; align-items: center; min-height: 150px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--r); padding: 10px; }
.scr-dir .dir-media-frame .dir-site { width: 100%; }
.scr-dir .dir-media-row figcaption { color: var(--ink-2); font-weight: 600; text-align: center; }
.scr-dir .dir-social { display: block; height: auto; border-radius: 8px; }
.scr-dir .dir-sum-links { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); }
@media (max-width: 1000px) {
  .scr-dir .dir-sum-grid { grid-template-columns: 1fr 1fr; }
  .scr-dir .dir-est { grid-column: 1 / -1; }
}
@media (max-width: 720px) {
  .scr-dir .dir-sm-d { display: none !important; }
  .scr-dir .dir-sm-m { display: block !important; }
  .scr-dir .dir-req-quote { font-size: 1.15rem; }
  .scr-dir .dir-req-main { align-items: flex-start; flex-wrap: wrap; }
  .scr-dir .dir-req-status { order: -1; margin-left: auto; }
  .scr-dir .dir-req-main .avatar, .scr-dir .dir-req-main .cand-photo { order: -2; }
  .scr-dir .dir-req-text { flex-basis: 100%; }
  .scr-dir .dir-req-clock { margin-left: 0; flex-basis: 100%; }
  .scr-dir .dir-req-btns .btn { flex: 1 1 auto; padding-left: 12px; padding-right: 12px; }
  .scr-dir .dir-sum-grid { grid-template-columns: 1fr; }
  .scr-dir .dir-media-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .scr-dir .dir-media-row figure:first-child { grid-column: 1 / -1; }
  .scr-dir .dir-appr-preview { flex-direction: column; align-items: stretch; }
  .scr-dir .dir-appr-preview .dir-hanger { align-self: center; }
  .scr-dir .dir-log { height: 280px; }
  .scr-dir .dir-skel { grid-template-columns: 1fr; }
  .scr-dir .dir-skel span { height: 28px; }
}
@media (prefers-reduced-motion: reduce) {
  .scr-dir .dir-pulse, .scr-dir .dir-caret { animation: none; }
}`;
    document.head.appendChild(s);
  }

  /* ---------------- register ---------------- */
  App.register({
    id: 'director',
    group: 'AI Engine',
    title: 'AI Campaign Director',
    icon: ICON,
    blurb: 'An AI (Artificial Intelligence) supervisor that assigns work to six specialist agents and checks every result before anything goes public.',
    render(el, ctx) {
      injectStyles();
      const t = ctx.tenant;
      // Incoming request from the Candidate Builder
      const req = App.state.directorRequest;
      let fromBuilder = false, wantId = null;
      if (req) {
        if (!req.tenantSlug || req.tenantSlug === ctx.tenantSlug) { wantId = req.candidateId; fromBuilder = true; }
        App.state.directorRequest = null;
      }
      if (fromBuilder) {
        newRun(t, ctx.tenantSlug, pickCandidate(t, wantId), true);
      } else {
        const c = pickCandidate(t, R && R.tenantSlug === ctx.tenantSlug && R.c ? R.c.id : null);
        if (!R || R.key !== ctx.tenantSlug + ':' + (c ? c.id : '') || R.t !== t) newRun(t, ctx.tenantSlug, c, false);
      }
      if (R.timer) { clearTimeout(R.timer); R.timer = null; }

      if (!R.c) {
        el.innerHTML = `<div class="page scr-dir"><div class="page-head"><div><h1>AI Campaign Director</h1></div></div>
          <div class="card"><div class="card-body"><h2>No candidates yet</h2><p class="muted">Add a candidate in the Candidate Launchpad, then send a launch request here.</p>
          <button class="btn btn-primary" data-go="candidate">Open Candidate Launchpad</button></div></div></div>`;
        el.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) ctx.navigate(g.dataset.go); });
        return;
      }

      R.role = ctx.role;
      R.last = {};
      el.innerHTML = `<div class="page scr-dir">
        <div class="page-head"><div>
          <h1>AI Campaign Director</h1>
          <p>An AI (Artificial Intelligence) supervisor assigns work to six specialist agents and checks every result before anything goes public. Every run here is a scripted simulation with sample data.</p>
        </div></div>
        <div class="stack">
          <div class="card dir-req" data-tour="dir-request" data-region="req"></div>
          <div class="explain"><strong>Why this matters for your committee.</strong> The AI does the busywork, and people make every public decision. It takes legal details like disclaimers only from the committee’s filing, so when one is missing it stops and asks your Executive Board.</div>
          <div class="card dir-sm">
            <div class="dir-sm-head"><h3>How the Director works</h3><span class="spacer"></span><span class="badge badge-local" data-sm-now>Not started</span></div>
            ${smDesktop()}${smMobile()}
          </div>
        </div>
        <section class="dir-sec">
          <div class="dir-sec-head"><h2>Specialist agents</h2><span class="small muted">Each agent does one kind of work. The Director checks all of it.</span></div>
          <div class="grid-3" data-tour="dir-agents" data-region="agents"></div>
        </section>
        <section class="dir-sec grid-2">
          <div class="card" data-tour="dir-gate" data-region="gate"></div>
          <div class="card" data-tour="dir-approval" data-region="approval"></div>
        </section>
        <section class="dir-sec grid-2">
          <div class="card" data-region="plan"></div>
          <div class="card"><div class="card-head"><h3>Task log</h3><span class="spacer"></span><span class="small muted">Times show agent work time</span></div>
            <ol class="dir-log" data-region="log" aria-live="polite"></ol></div>
        </section>
        <section class="dir-sec">
          <div class="card" data-tour="dir-summary" data-region="summary"></div>
        </section>
      </div>`;
      R.root = el.querySelector('.scr-dir');
      paint();

      el.addEventListener('click', (e) => {
        const go = e.target.closest('[data-go]');
        if (go) { ctx.navigate(go.dataset.go); return; }
        const a = e.target.closest('[data-act]');
        if (a && !a.disabled) onAct(a.dataset.act, a);
      });
      el.addEventListener('submit', (e) => {
        const f = e.target.closest('form[data-form]');
        if (!f) return;
        e.preventDefault();
        onSubmit(f);
      });
      el.addEventListener('input', (e) => {
        const f = e.target.closest('form[data-form="disc"]');
        if (f) updatePreview(f);
      });

      if (fromBuilder) {
        R.playing = true;
        App.toast(`Launch request received for ${R.c.name}. The Director is starting.`, 'info');
      }
      schedule();
    },
  });
})();
