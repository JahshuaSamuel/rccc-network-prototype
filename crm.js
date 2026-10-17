/* crm.js: App.crm, the people database and outreach engine (docs/BRIEF.md section 9.2).
   Every record carries an owner: 'committee' (the county party) or 'campaign:<slug>' (a candidate's
   campaign). They are separate legal entities, so records never cross owners on their own; moving
   people between them is an explicit share, logged in `shares`.
   Collections (county scope): people, interactions, lists, paths, pathEntries, tasks, broadcasts,
   callCampaigns, petitions, signatures, shares. Config key: crmConfig (committee) and
   crmConfig:campaign:<slug> (a campaign) = {donorLimit, mailingAddress, senderIdentities:[{name,title}], paidForBy}.
   Ingestion turns public actions (rsvps, volunteers, memberships, donations, signatures, walkResults)
   into people and timeline entries. It is idempotent: ingested refColl:refId pairs live in crmIngest.
   Classic script, ES2020, loads after store.js, core.js and auth.js and before screens/people.js. */
(function () {
  'use strict';
  const App = window.App;
  const Store = window.Store;
  if (!App || !Store) { console.error('[crm] needs core.js and store.js first'); return; }
  const U = App.util;

  const SEED_VERSION = 1;
  const COLLS = ['people', 'interactions', 'lists', 'paths', 'pathEntries', 'tasks', 'broadcasts', 'callCampaigns', 'petitions', 'signatures', 'shares'];
  const SOURCES = ['rsvps', 'volunteers', 'memberships', 'donations', 'signatures', 'walkResults', 'optOuts'];
  const DAY = 86400000;
  const TZ = 'America/Los_Angeles';
  const QUIET = { start: 8, end: 21 };   // texts go out from 8 AM to 9 PM recipient local time

  const SUPPORT = { 1: 'Strong no', 2: 'Leans no', 3: 'Undecided', 4: 'Leans yes', 5: 'Strong yes' };
  const ROLES = ['supporter', 'volunteer', 'donor', 'member', 'candidate', 'press', 'elected'];
  const ROLE_LABEL = { supporter: 'Supporter', volunteer: 'Volunteer', donor: 'Donor', member: 'Committee member', candidate: 'Candidate', press: 'Press', elected: 'Elected official' };
  const TYPES = {
    note: 'Note', call: 'Call', email: 'Email', text: 'Text', meeting: 'Meeting', rsvp: 'RSVP', volunteer: 'Volunteer',
    donation: 'Donation', membership: 'Membership', walk: 'Door knock', signature: 'Signature', share: 'Share',
  };
  const CALL_OUTCOMES = [
    { id: 'talked', label: 'Talked' }, { id: 'no_answer', label: 'No answer' }, { id: 'left_message', label: 'Left message' },
    { id: 'wrong_number', label: 'Wrong number' }, { id: 'do_not_call', label: 'Do not call' },
  ];
  const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE'];

  /* ---------------- small helpers ---------------- */
  const nowIso = () => new Date().toISOString();
  function tenantSlug(slug) { return slug || (App.state && App.state.tenant) || 'svgop'; }
  function db(slug) { return Store.forTenant(tenantSlug(slug)); }
  function tenantObj(slug) { const d = window.DATA; return (d && d.tenants && d.tenants[tenantSlug(slug)]) || null; }
  function userId() { return (App.auth && App.auth.user && App.auth.user.id) || null; }
  function userName() { return (App.auth && App.auth.user && App.auth.user.name) || 'Someone on the team'; }
  function normEmail(s) { const e = String(s || '').trim().toLowerCase(); return /@/.test(e) ? e : ''; }
  function normPhone(s) {
    let d = String(s || '').replace(/\D/g, '');
    if (d.length === 11 && d[0] === '1') d = d.slice(1);
    return d.length === 10 ? d : '';
  }
  function fmtPhone(s) { const d = normPhone(s); return d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(s || ''); }
  function kebab(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function splitName(n) {
    const parts = String(n || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { firstName: '', lastName: '' };
    if (parts.length === 1) return { firstName: parts[0], lastName: '' };
    return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
  }
  function uniq(a) { return Array.from(new Set((a || []).filter((x) => x !== '' && x != null))); }
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function isoDay(d) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
  function ownerSlug(owner) { return String(owner || '').indexOf('campaign:') === 0 ? owner.slice(9) : ''; }
  function isCampaign(owner) { return !!ownerSlug(owner); }
  function countyName(slug) {
    const t = tenantObj(slug);
    const c = (t && t.county) || '';
    return /county$/i.test(c) ? c : (c ? c + ' County' : 'your county');
  }
  function candidateFor(owner, slug) {
    const s = ownerSlug(owner); const t = tenantObj(slug);
    if (!s || !t) return null;
    const sites = db(slug).list('campaignSites');
    const site = sites.find((x) => x.slug === s);
    return (t.candidates || []).find((c) => (site && c.id === site.candidateId) || kebab(c.name) === s) || null;
  }
  function ownerLabel(owner, slug) {
    if (!isCampaign(owner)) { const t = tenantObj(slug); return t ? t.shortName || t.name : 'the committee'; }
    const c = candidateFor(owner, slug);
    return c ? `${c.name}'s campaign` : 'the campaign';
  }

  /* ---------------- cache ---------------- */
  const cache = new Map();
  function key(coll, slug) { return tenantSlug(slug) + ':' + coll; }
  function list(coll, slug) {
    const k = key(coll, slug);
    if (!cache.has(k)) cache.set(k, db(slug).list(coll));
    return cache.get(k);
  }
  Store.on('*', (d) => {
    if (!d) return;
    if (d.type === 'reset') { cache.clear(); seeded.clear(); return; }
    if (d.name) cache.delete((d.tenant || tenantSlug()) + ':' + d.name);
  });
  const indexMemo = new WeakMap();
  function interactionsByPerson(slug) {
    const arr = list('interactions', slug);
    let idx = indexMemo.get(arr);
    if (!idx) {
      idx = new Map();
      arr.forEach((x) => { if (!idx.has(x.personId)) idx.set(x.personId, []); idx.get(x.personId).push(x); });
      indexMemo.set(arr, idx);
    }
    return idx;
  }

  /* ---------------- bulk writes ---------------- */
  /* Store has single-doc add/update. Seeding and broadcasts write hundreds of rows, so we write the
     collection in one set() when Store has no addMany/updateMany. */
  function stamp(coll, d, now, uid) {
    const o = Object.assign({}, d);
    if (!o.id) o.id = Store.newId ? Store.newId(coll) : coll + '_' + Math.random().toString(36).slice(2, 12);
    if (!o.createdAt) o.createdAt = now;
    if (!('createdBy' in o)) o.createdBy = uid;
    return o;
  }
  function addMany(coll, docs, slug) {
    if (!docs.length) return [];
    const S = db(slug);
    if (typeof S.addMany === 'function') return S.addMany(coll, docs);
    const now = nowIso(), uid = userId();
    const out = docs.map((d) => stamp(coll, d, now, uid));
    S.set(coll, S.list(coll).concat(out));
    return out;
  }
  function updateMany(coll, patches, slug) {
    const ids = Object.keys(patches || {});
    if (!ids.length) return 0;
    const S = db(slug);
    if (typeof S.updateMany === 'function') return S.updateMany(coll, patches);
    const now = nowIso();
    let n = 0;
    const all = S.list(coll).map((d) => {
      if (!d || !patches[d.id]) return d;
      n++;
      return Object.assign({}, d, patches[d.id], { id: d.id, updatedAt: now });
    });
    S.set(coll, all);
    return n;
  }

  /* ---------------- config ---------------- */
  function configKey(owner) { return isCampaign(owner) ? 'crmConfig:' + owner : 'crmConfig'; }
  function defaultConfig(owner, slug) {
    const t = tenantObj(slug) || {};
    if (isCampaign(owner)) {
      const c = candidateFor(owner, slug) || {};
      return {
        donorLimit: null, mailingAddress: '', sample: false,
        senderIdentities: c.name ? [{ name: c.name, title: 'Candidate' }] : [],
        paidForBy: c.disclaimer ? c.disclaimer.replace(/FPPC #/, 'FPPC ID #') : '',
      };
    }
    const chair = t.chair || {};
    const hq = ((t.events || []).find((e) => /headquarters|office/i.test(e.location || '')) || {}).location || '';
    const addr = hq ? hq.replace(/^[^,]*(Headquarters|Office),\s*/i, '') : '';
    const zip = { svgop: '95125', demo: '93291' }[t.slug] || '';
    return {
      donorLimit: 5000,
      mailingAddress: addr ? `${t.shortName || t.name}, ${addr}, CA ${zip}`.replace(/\s+,/g, ',') : '',
      sample: true,
      senderIdentities: [chair.name ? { name: chair.name, title: chair.title || 'Chair' } : null, { name: t.shortName || t.name || 'The committee', title: 'Committee' }].filter(Boolean),
      paidForBy: t.name ? `Paid for by the ${t.name}` : '',
    };
  }
  function config(owner, slug) {
    owner = owner || 'committee';
    const saved = db(slug).get(configKey(owner), null) || {};
    return Object.assign(defaultConfig(owner, slug), saved);
  }
  function setConfig(owner, patch, slug) {
    owner = owner || 'committee';
    const cur = db(slug).get(configKey(owner), null) || {};
    return db(slug).set(configKey(owner), Object.assign({}, cur, patch, { sample: false, updatedAt: nowIso(), updatedBy: userName() }));
  }

  /* ---------------- permissions ---------------- */
  function can(cap) { return !!(App.auth && App.auth.can && App.auth.can(cap)); }
  function role() { return (App.auth && App.auth.role) || 'public'; }
  function ownsCampaign(slug) {
    const u = App.auth && App.auth.user;
    return !!(u && u.campaignSlug === slug && u.role === 'candidate' && (can('crm.campaign') || u.role === 'candidate'));
  }
  const perms = {
    view(owner) {
      if (role() === 'master') return false;   // Master Network reads statewide totals, never records
      if (isCampaign(owner)) return ownsCampaign(ownerSlug(owner)) || can('crm.committee') || can('board');
      return can('crm.view') || can('member');
    },
    edit(owner) {
      if (role() === 'master') return false;
      if (isCampaign(owner)) return ownsCampaign(ownerSlug(owner)) || can('board');
      return can('crm.committee') || can('board');
    },
    send(owner) {
      if (role() === 'master') return false;
      if (isCampaign(owner)) return ownsCampaign(ownerSlug(owner)) || can('board');
      return can('outreach.send') || can('board');
    },
    share() { return role() !== 'master' && (can('crm.committee') || can('board')); },
  };

  /* ---------------- people ---------------- */
  function ownerOf(doc) { return (doc && doc.owner) || 'committee'; }
  function scoped(coll, owner, slug) { owner = owner || 'committee'; return list(coll, slug).filter((d) => ownerOf(d) === owner); }

  function daysSince(iso) { const t = Date.parse(iso || ''); return isNaN(t) ? Infinity : (Date.now() - t) / DAY; }
  function matches(p, f) {
    if (!f) return true;
    if (f.q) {
      const q = String(f.q).trim().toLowerCase();
      if (q) {
        const qd = q.replace(/\D/g, '');
        const hay = [p.name, p.email, p.city, p.zip, (p.tags || []).join(' '), p.address].join(' ').toLowerCase();
        const words = q.split(/\s+/).filter(Boolean);
        const okText = words.every((w) => hay.indexOf(w) >= 0);
        const okPhone = qd.length >= 3 && String(p.phone || '').indexOf(qd) >= 0;
        if (!okText && !okPhone) return false;
      }
    }
    if (f.tags && f.tags.length && !f.tags.every((t) => (p.tags || []).indexOf(t) >= 0)) return false;
    if (f.roles && f.roles.length && !f.roles.some((r) => (p.roles || []).indexOf(r) >= 0)) return false;
    if (f.support && f.support.length) {
      const s = p.support == null ? 'unknown' : Number(p.support);
      if (!f.support.some((x) => (x === 'unknown' ? s === 'unknown' : Number(x) === s))) return false;
    }
    if (f.city && f.city.length && f.city.indexOf(p.city) < 0) return false;
    if (f.zip && f.zip.length && f.zip.indexOf(String(p.zip || '')) < 0) return false;
    if (f.optIn) {
      if (f.optIn === 'email' && !(p.emailOptIn && p.email && !p.doNotContact)) return false;
      if (f.optIn === 'sms' && !(p.smsOptIn && p.phone && !p.doNotContact)) return false;
      if (f.optIn === 'none' && (p.emailOptIn || p.smsOptIn)) return false;
      if (f.optIn === 'dnc' && !p.doNotContact) return false;
    }
    if (f.lastActivityDays) {
      const n = Number(f.lastActivityDays);
      if (n > 0 && !(daysSince(p.lastActivityAt) <= n)) return false;
      if (n < 0 && !(daysSince(p.lastActivityAt) > -n)) return false;   // negative = quiet for n days
    }
    if (f.ids && f.ids.indexOf(p.id) < 0) return false;
    return true;
  }
  function sortPeople(a, b) {
    return String(a.lastName || a.name).localeCompare(String(b.lastName || b.name)) || String(a.firstName).localeCompare(String(b.firstName));
  }
  function people(owner, filter, slug) {
    return scoped('people', owner, slug).filter((p) => !p.mergedInto && matches(p, filter)).sort(sortPeople);
  }
  function person(id, slug) { return list('people', slug).find((p) => p.id === id) || null; }
  /* Email is a match on its own. A shared phone (a family landline, a reused number) only matches when the
     last names agree or one record has no name yet. */
  function findMatch(owner, email, phone, slug, exceptId, lastName) {
    const e = normEmail(email), ph = normPhone(phone);
    const ln = String(lastName || '').trim().toLowerCase();
    const pool = scoped('people', owner, slug).filter((p) => !p.mergedInto && p.id !== exceptId);
    return (e && pool.find((p) => normEmail(p.email) === e)) ||
      (ph && pool.find((p) => normPhone(p.phone) === ph && (!ln || !p.lastName || String(p.lastName).toLowerCase() === ln))) || null;
  }
  function cleanPerson(doc) {
    const d = Object.assign({}, doc);
    if (d.name && !d.firstName && !d.lastName) Object.assign(d, splitName(d.name));
    if (d.firstName != null || d.lastName != null) d.name = [d.firstName, d.lastName].filter(Boolean).join(' ').trim() || d.name || '';
    if ('email' in d) d.email = normEmail(d.email);
    if ('phone' in d) d.phone = normPhone(d.phone);
    if ('tags' in d) d.tags = uniq((d.tags || []).map((t) => String(t).trim()).filter(Boolean));
    if ('roles' in d) d.roles = uniq(d.roles);
    if ('support' in d) d.support = d.support == null || d.support === '' ? null : Math.max(1, Math.min(5, Number(d.support)));
    return d;
  }
  /* Insert or update. With an id, patches that person. Without one, dedupes by email then phone in the
     same owner and fills in blanks on the match. Returns {person, created}. */
  function upsertPerson(doc, slug) {
    const d = cleanPerson(doc || {});
    const S = db(slug);
    if (d.id && person(d.id, slug)) {
      const id = d.id; delete d.id;
      return { person: S.update('people', id, d), created: false };
    }
    d.owner = d.owner || 'committee';
    const m = findMatch(d.owner, d.email, d.phone, slug, null, d.lastName);
    if (m) {
      const patch = {};
      ['firstName', 'lastName', 'name', 'email', 'phone', 'zip', 'city', 'address'].forEach((k) => { if (!m[k] && d[k]) patch[k] = d[k]; });
      patch.tags = uniq((m.tags || []).concat(d.tags || []));
      patch.roles = uniq((m.roles || []).concat(d.roles || []));
      if (d.emailOptIn && !m.emailOptIn && !m.emailOptOutAt) patch.emailOptIn = true;
      if (d.smsOptIn && !m.smsOptIn && !m.smsOptOutAt) patch.smsOptIn = true;
      if (d.support != null && m.support == null) patch.support = d.support;
      if (d.lastActivityAt && (!m.lastActivityAt || d.lastActivityAt > m.lastActivityAt)) patch.lastActivityAt = d.lastActivityAt;
      return { person: S.update('people', m.id, patch), created: false };
    }
    const base = {
      owner: d.owner, firstName: '', lastName: '', name: '', email: '', phone: '', zip: '', city: '', tags: [], support: null, roles: [],
      pointPersonId: null, emailOptIn: false, smsOptIn: false, doNotContact: false, source: 'Added by hand', lastActivityAt: nowIso(),
    };
    return { person: S.add('people', Object.assign(base, d)), created: true };
  }
  function setField(id, patch, slug) { return db(slug).update('people', id, cleanPerson(patch)); }
  /* One write for many people: fn(person) returns a patch or null. */
  function bulkPeople(ids, fn, slug) {
    const patches = {};
    uniq(ids).forEach((id) => { const p = person(id, slug); const patch = p && fn(p); if (patch) patches[id] = cleanPerson(patch); });
    return updateMany('people', patches, slug);
  }

  /* Possible duplicates: same email, same phone, or same last name + first initial + ZIP. */
  function duplicatesOf(id, slug) {
    const p = person(id, slug);
    if (!p) return [];
    const e = normEmail(p.email), ph = normPhone(p.phone);
    const li = String(p.lastName || '').toLowerCase(), fi = String(p.firstName || '').charAt(0).toLowerCase();
    return scoped('people', ownerOf(p), slug).filter((q) => q.id !== p.id && !q.mergedInto && (p.notDuplicate || []).indexOf(q.id) < 0 && (q.notDuplicate || []).indexOf(p.id) < 0 && (
      (e && normEmail(q.email) === e) || (ph && normPhone(q.phone) === ph) ||
      (li && li === String(q.lastName || '').toLowerCase() && fi && fi === String(q.firstName || '').charAt(0).toLowerCase() && p.zip && p.zip === q.zip) ||
      (li && String(p.name).trim().toLowerCase() === String(q.name).trim().toLowerCase() && (!p.zip || !q.zip || p.zip === q.zip))
    )).map((q) => ({ person: q, reason: e && normEmail(q.email) === e ? 'the same email' : ph && normPhone(q.phone) === ph ? 'the same phone number' : String(p.name).toLowerCase() === String(q.name).toLowerCase() ? 'the same name' : 'the same last name and ZIP' }));
  }
  function notDuplicate(idA, idB, slug) {
    const a = person(idA, slug); if (!a) return;
    db(slug).update('people', idA, { notDuplicate: uniq((a.notDuplicate || []).concat([idB])) });
  }
  /* Keep A, fold B into it: blanks filled, tags/roles unioned, timeline, path entries and tasks moved. */
  function merge(idA, idB, slug) {
    const a = person(idA, slug), b = person(idB, slug);
    if (!a || !b || a.id === b.id || ownerOf(a) !== ownerOf(b)) return null;
    const patch = {};
    ['firstName', 'lastName', 'email', 'phone', 'zip', 'city', 'address', 'pointPersonId', 'party', 'voterId', 'memberId'].forEach((k) => { if (!a[k] && b[k]) patch[k] = b[k]; });
    patch.name = [patch.firstName || a.firstName, patch.lastName || a.lastName].filter(Boolean).join(' ');
    patch.tags = uniq((a.tags || []).concat(b.tags || []));
    patch.roles = uniq((a.roles || []).concat(b.roles || []));
    if (a.support == null && b.support != null) patch.support = b.support;
    patch.emailOptIn = !!(a.emailOptIn || b.emailOptIn) && !(a.emailOptOutAt || b.emailOptOutAt);
    patch.smsOptIn = !!(a.smsOptIn || b.smsOptIn) && !(a.smsOptOutAt || b.smsOptOutAt);
    patch.doNotContact = !!(a.doNotContact || b.doNotContact);
    patch.volunteerShifts = Math.max(a.volunteerShifts || 0, b.volunteerShifts || 0) || undefined;
    patch.lastActivityAt = [a.lastActivityAt, b.lastActivityAt].filter(Boolean).sort().pop() || a.lastActivityAt;
    const moved = {};
    list('interactions', slug).forEach((x) => { if (x.personId === b.id) moved[x.id] = { personId: a.id }; });
    updateMany('interactions', moved, slug);
    const ent = {};
    list('pathEntries', slug).forEach((x) => { if (x.personId === b.id) ent[x.id] = { personId: a.id }; });
    updateMany('pathEntries', ent, slug);
    const tk = {};
    list('tasks', slug).forEach((x) => { if (x.personId === b.id) tk[x.id] = { personId: a.id }; });
    updateMany('tasks', tk, slug);
    const ing = db(slug).get('crmIngest', {}) || {};
    let touched = false;
    Object.keys(ing).forEach((k) => { if (ing[k] === b.id) { ing[k] = a.id; touched = true; } });
    if (touched) db(slug).set('crmIngest', ing);
    db(slug).update('people', a.id, patch);
    db(slug).remove('people', b.id);
    addInteraction({ personId: a.id, type: 'note', summary: `Merged the duplicate record for ${b.name}${b.email ? ` (${b.email})` : b.phone ? ` (${fmtPhone(b.phone)})` : ''} into this one.` }, slug);
    return person(a.id, slug);
  }

  /* ---------------- interactions ---------------- */
  function addInteraction(doc, slug) {
    const p = person(doc.personId, slug);
    if (!p) return null;
    const at = doc.at || nowIso();
    const saved = db(slug).add('interactions', Object.assign({ owner: ownerOf(p), by: userName(), byId: userId(), at }, doc, { owner: ownerOf(p), at }));
    if (!p.lastActivityAt || at > p.lastActivityAt) db(slug).update('people', p.id, { lastActivityAt: at });
    return saved;
  }
  function timeline(personId, slug) {
    return (interactionsByPerson(slug).get(personId) || []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }

  /* ---------------- lists ---------------- */
  function lists(owner, slug) { return scoped('lists', owner, slug).slice().sort((a, b) => String(a.name).localeCompare(String(b.name))); }
  function saveList(doc, slug) {
    const d = Object.assign({}, doc);
    if (d.id && list('lists', slug).some((x) => x.id === d.id)) { const id = d.id; delete d.id; return db(slug).update('lists', id, d); }
    return db(slug).add('lists', Object.assign({ owner: 'committee', name: 'Untitled list', filter: {} }, d));
  }
  function removeList(id, slug) { return db(slug).remove('lists', id); }
  function getList(id, slug) { return list('lists', slug).find((x) => x.id === id) || null; }
  function runList(listId, slug) {
    const l = getList(listId, slug);
    return l ? people(ownerOf(l), l.filter || {}, slug) : [];
  }

  /* ---------------- paths ---------------- */
  function paths(owner, slug) { return scoped('paths', owner, slug); }
  function getPath(id, slug) { return list('paths', slug).find((x) => x.id === id) || null; }
  function savePath(doc, slug) {
    const d = Object.assign({}, doc);
    d.steps = (d.steps || []).map((s, i) => Object.assign({ id: s.id || 'st' + i + '_' + Math.random().toString(36).slice(2, 7), name: s.name || 'Step ' + (i + 1), assigneeId: s.assigneeId || null, dueDays: s.dueDays || 7 }, s));
    if (d.id && getPath(d.id, slug)) { const id = d.id; delete d.id; return db(slug).update('paths', id, d); }
    return db(slug).add('paths', Object.assign({ owner: 'committee', name: 'New path', goal: '' }, d));
  }
  function removePath(id, slug) {
    const rm = list('pathEntries', slug).filter((e) => e.pathId === id).map((e) => e.id);
    if (rm.length) db(slug).set('pathEntries', db(slug).list('pathEntries').filter((e) => rm.indexOf(e.id) < 0));
    return db(slug).remove('paths', id);
  }
  function pathEntries(pathId, slug, all) {
    return list('pathEntries', slug).filter((e) => e.pathId === pathId && (all || e.status === 'active'));
  }
  function entriesFor(personId, slug) { return list('pathEntries', slug).filter((e) => e.personId === personId); }
  function dueFor(path, stepId) {
    const st = (path.steps || []).find((s) => s.id === stepId) || {};
    return isoDay(Date.now() + (st.dueDays || 7) * DAY);
  }
  function enter(pathId, personIds, slug, opts) {
    const path = getPath(pathId, slug);
    if (!path || !(path.steps || []).length) return [];
    const o = opts || {};
    const stepId = o.stepId || path.steps[0].id;
    const active = new Set(pathEntries(pathId, slug).map((e) => e.personId));
    const fresh = uniq(personIds).filter((id) => !active.has(id) && person(id, slug));
    const docs = fresh.map((pid) => ({ owner: path.owner, pathId, personId: pid, stepId, status: 'active', due: dueFor(path, stepId), updatedAt: nowIso() }));
    const saved = addMany('pathEntries', docs, slug);
    const step = path.steps.find((s) => s.id === stepId);
    addMany('interactions', saved.map((e) => ({ owner: path.owner, personId: e.personId, type: 'note', summary: `Added to the "${path.name}" path at "${step.name}".`, by: userName(), byId: userId(), at: nowIso(), refColl: 'pathEntries', refId: e.id })), slug);
    return saved;
  }
  function getEntry(id, slug) { return list('pathEntries', slug).find((e) => e.id === id) || null; }
  /* Move to the next step (or to toStepId). Advancing past the last step marks the entry done. */
  function advance(entryId, toStepId, slug) {
    const e = getEntry(entryId, slug);
    if (!e) return null;
    const path = getPath(e.pathId, slug);
    if (!path) return null;
    const i = path.steps.findIndex((s) => s.id === e.stepId);
    let patch;
    let summary;
    if (toStepId === 'done' || (!toStepId && i >= path.steps.length - 1)) {
      patch = { status: 'done', updatedAt: nowIso() };
      summary = `Finished the "${path.name}" path.`;
    } else {
      const next = toStepId ? path.steps.find((s) => s.id === toStepId) : path.steps[i + 1];
      if (!next || next.id === e.stepId) return e;
      patch = { stepId: next.id, status: 'active', due: dueFor(path, next.id), updatedAt: nowIso() };
      summary = `Moved to "${next.name}" on the "${path.name}" path.`;
    }
    const out = db(slug).update('pathEntries', entryId, patch);
    addInteraction({ personId: e.personId, type: 'note', summary, refColl: 'pathEntries', refId: e.id }, slug);
    return out;
  }
  function drop(entryId, slug) {
    const e = getEntry(entryId, slug);
    if (!e) return null;
    const path = getPath(e.pathId, slug) || { name: 'path' };
    const out = db(slug).update('pathEntries', entryId, { status: 'dropped', updatedAt: nowIso() });
    addInteraction({ personId: e.personId, type: 'note', summary: `Taken off the "${path.name}" path.`, refColl: 'pathEntries', refId: e.id }, slug);
    return out;
  }
  /* Future candidates: people with 3 or more volunteer shifts or walk results, not already on the path. */
  function activityScore(p, slug) {
    const its = interactionsByPerson(slug).get(p.id) || [];
    const vol = its.filter((x) => x.type === 'volunteer').length;
    const nm = String(p.name || '').toLowerCase();
    const walks = list('walkResults', slug).filter((w) => String(w.walkerName || '').toLowerCase() === nm).length;
    return { shifts: Math.max(p.volunteerShifts || 0, vol), walks, total: Math.max(p.volunteerShifts || 0, vol) + walks };
  }
  function pathSuggestions(pathId, slug) {
    const path = getPath(pathId, slug);
    if (!path || path.kind !== 'future-candidates') return [];
    const on = new Set(list('pathEntries', slug).filter((e) => e.pathId === pathId && e.status !== 'dropped').map((e) => e.personId));
    return scoped('people', path.owner, slug)
      .filter((p) => !p.mergedInto && !on.has(p.id) && (p.roles || []).indexOf('candidate') < 0 && (p.roles || []).indexOf('elected') < 0)
      .map((p) => Object.assign({ person: p }, activityScore(p, slug)))
      .filter((x) => x.shifts >= 3 || x.walks >= 3)
      .sort((a, b) => b.total - a.total);
  }

  /* ---------------- tasks ---------------- */
  function tasks(owner, f, slug) {
    const o = f || {};
    return scoped('tasks', owner, slug).filter((t) => (o.assigneeId == null || t.assigneeId === o.assigneeId) && (o.personId == null || t.personId === o.personId) && (o.done == null || !!t.done === !!o.done))
      .sort((a, b) => (a.done - b.done) || String(a.due || '9999').localeCompare(String(b.due || '9999')));
  }
  function addTask(doc, slug) { return db(slug).add('tasks', Object.assign({ owner: 'committee', title: '', due: isoDay(Date.now() + 2 * DAY), assigneeId: null, done: false }, doc)); }
  function updateTask(id, patch, slug) { return db(slug).update('tasks', id, patch); }
  function removeTask(id, slug) { return db(slug).remove('tasks', id); }

  /* Team: the people who can be a point person or path owner. Committee: committee members. Campaign: its team. */
  function team(owner, slug) {
    owner = owner || 'committee';
    return scoped('people', owner, slug).filter((p) => !p.mergedInto && (isCampaign(owner) ? (p.tags || []).indexOf('Campaign team') >= 0 : (p.roles || []).indexOf('member') >= 0))
      .sort((a, b) => (b.teamRank || 0) - (a.teamRank || 0) || sortPeople(a, b));
  }
  /* The signed-in user's own record in this owner, if there is one. */
  function me(owner, slug) {
    const u = App.auth && App.auth.user;
    if (!u) return null;
    const pool = scoped('people', owner || 'committee', slug);
    return pool.find((p) => u.memberId && p.memberId === u.memberId) || pool.find((p) => u.email && normEmail(p.email) === normEmail(u.email)) ||
      pool.find((p) => String(p.name).toLowerCase() === String(u.name).toLowerCase()) || null;
  }

  /* ---------------- compliance ---------------- */
  function pacificParts(date) {
    const d = date || new Date();
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(d);
    const get = (t) => Number((parts.find((p) => p.type === t) || {}).value || 0);
    return { h: get('hour') % 24, m: get('minute') };
  }
  /* {ok, next: Date of the next 8:00 AM Pacific when not ok, label} */
  function quietHours(date) {
    const d = date || new Date();
    const { h, m } = pacificParts(d);
    const ok = h >= QUIET.start && h < QUIET.end;
    if (ok) return { ok: true, next: d, localTime: fmtTime(d) };
    const mins = ((QUIET.start * 60 - (h * 60 + m)) + 1440) % 1440 || 1440;
    const next = new Date(d.getTime() + mins * 60000);
    next.setSeconds(0, 0);
    return { ok: false, next, localTime: fmtTime(d) };
  }
  function fmtTime(d) { return new Date(d).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }); }
  function fmtWhen(d) {
    return new Date(d).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  const GSM = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  const GSM_EXT = '^{}\\[~]|€';
  function smsSegments(text) {
    const s = String(text || '');
    let gsm = true, units = 0;
    for (const ch of s) {
      if (GSM.indexOf(ch) >= 0) units += 1;
      else if (GSM_EXT.indexOf(ch) >= 0) units += 2;
      else { gsm = false; break; }
    }
    if (!gsm) units = Array.from(s).length;
    const single = gsm ? 160 : 70, multi = gsm ? 153 : 67;
    const segments = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi);
    return { chars: units, segments, encoding: gsm ? 'GSM-7' : 'Unicode', perSegment: segments > 1 ? multi : single };
  }
  function footer(owner, channel, slug) {
    const c = config(owner, slug);
    const org = ownerLabel(owner, slug);
    const paid = (c.paidForBy || '').trim().replace(/([^.])$/, '$1.');
    if (channel === 'sms') return [paid, 'Reply STOP to opt out.'].filter(Boolean).join(' ');
    return [
      paid,
      c.mailingAddress ? `Our mailing address: ${c.mailingAddress}.` : '',
      `You're getting this email because you signed up with ${org}. Unsubscribe: ${unsubscribeUrl(slug)} (or reply with the word UNSUBSCRIBE).`,
    ].filter(Boolean).join('\n');
  }
  function unsubscribeUrl(slug) {
    const rel = `index.html?county=${encodeURIComponent(tenantSlug(slug))}#/unsubscribe`;
    try { return new URL(rel, location.href).href; } catch (e) { return rel; }
  }
  /* Friendly text for system tags like petition:<slug>. The raw tag stays the value for filtering. */
  function tagLabel(tag, slug, short) {
    const t = String(tag || '');
    const m = /^([a-z][a-z0-9-]*):(.+)$/i.exec(t);
    if (!m) return t;
    const kind = m[1].toLowerCase(), val = m[2];
    if (kind === 'petition') {
      const p = list('petitions', slug).find((x) => x.slug === val);
      const verb = p && p.kind === 'survey' ? 'Answered' : 'Signed';
      if (short) return p && p.kind === 'survey' ? 'Answered survey' : 'Signed petition';
      return `${verb}: ${p ? p.title : val.replace(/-/g, ' ')}`;
    }
    const nice = kind.charAt(0).toUpperCase() + kind.slice(1).replace(/-/g, ' ');
    return short ? nice : `${nice}: ${val.replace(/-/g, ' ')}`;
  }
  function merge_(text, p, slug) {
    const first = (p && (p.firstName || splitName(p.name).firstName)) || 'friend';
    return String(text || '').replace(/\{first_name\}/g, first).replace(/\{county\}/g, countyName(slug));
  }
  /* Who a broadcast reaches right now, and who it skips and why. */
  function audience(owner, listId, channel, slug, at) {
    const pool = runList(listId, slug);
    const out = { recipients: [], skipped: { optOut: [], noContact: [], quietHours: [], doNotContact: [] }, total: pool.length };
    const qh = channel === 'sms' ? quietHours(at || new Date()) : { ok: true };
    pool.forEach((p) => {
      if (p.doNotContact) { out.skipped.doNotContact.push(p); return; }
      if (channel === 'email') {
        if (!p.email) out.skipped.noContact.push(p);
        else if (!p.emailOptIn) out.skipped.optOut.push(p);
        else out.recipients.push(p);
      } else {
        if (!p.phone) out.skipped.noContact.push(p);
        else if (!p.smsOptIn) out.skipped.optOut.push(p);
        else if (!qh.ok) out.skipped.quietHours.push(p);
        else out.recipients.push(p);
      }
    });
    out.quiet = qh;
    return out;
  }
  function broadcasts(owner, slug) { return scoped('broadcasts', owner, slug).slice().sort((a, b) => String(b.sentAt || b.scheduledFor || b.createdAt).localeCompare(String(a.sentAt || a.scheduledFor || a.createdAt))); }
  function saveBroadcast(doc, slug) {
    const d = Object.assign({}, doc);
    if (d.id && list('broadcasts', slug).some((b) => b.id === d.id)) { const id = d.id; delete d.id; return db(slug).update('broadcasts', id, d); }
    return db(slug).add('broadcasts', Object.assign({ owner: 'committee', channel: 'email', status: 'draft', counts: null }, d));
  }
  /* Send now, or schedule. Texts sent during quiet hours are held for the next 8 AM Pacific.
     Until email and SMS delivery are connected, sending logs one interaction per recipient. */
  function sendBroadcast(doc, slug, opts) {
    const o = opts || {};
    const d = Object.assign({}, doc);
    if (!d.listId) throw new Error('Pick a list first.');
    const cfg = config(d.owner, slug);
    if (!cfg.paidForBy) throw new Error('Add the "Paid for by" disclaimer in Sending settings before you send.');
    if (d.channel === 'email' && !cfg.mailingAddress) throw new Error('Add your mailing address in Sending settings before you send email.');
    const when = o.scheduleFor ? new Date(o.scheduleFor) : null;
    if (when && when.getTime() > Date.now() + 30000) {
      let at = when;
      if (d.channel === 'sms') { const q = quietHours(when); if (!q.ok) at = q.next; }
      const a = audience(d.owner, d.listId, d.channel, slug, at);
      const saved = saveBroadcast(Object.assign(d, { status: 'scheduled', scheduledFor: at.toISOString(), counts: countsOf(a, 0) }), slug);
      return { broadcast: saved, scheduled: true, at, audience: a };
    }
    const a = audience(d.owner, d.listId, d.channel, slug, new Date());
    if (d.channel === 'sms' && !a.quiet.ok) {
      const at = a.quiet.next;
      const saved = saveBroadcast(Object.assign(d, { status: 'scheduled', scheduledFor: at.toISOString(), heldForQuietHours: true, counts: countsOf(a, 0) }), slug);
      return { broadcast: saved, scheduled: true, held: true, at, audience: a };
    }
    if (remote()) {
      /* Real backend: the send-email Edge Function resolves the list, sends and records the result
         (status, counts, one interaction per recipient). Until it answers, the broadcast is a draft. */
      const saved = saveBroadcast(Object.assign(d, { status: 'draft', counts: countsOf(a, 0) }), slug);
      const promise = Store.invoke('send-email', { kind: 'broadcast', tenant: tenantSlug(slug), id: saved.id })
        .then((r) => {
          if (r && r.status === 'draft') throw new Error('No messages could be handed to the email service. Your broadcast is saved as a draft.');
          return r || {};
        }, (e) => { throw sendFailure(e, d.channel); });
      return { broadcast: saved, scheduled: false, pending: true, promise, audience: a };
    }
    const saved = saveBroadcast(Object.assign(d, { status: 'sent', sentAt: nowIso(), counts: countsOf(a, a.recipients.length) }), slug);
    logSend(saved, a.recipients, slug);
    return { broadcast: saved, scheduled: false, audience: a };
  }
  /* Supabase backend (docs/SUPABASE.md R2): sending goes through the send-email Edge Function. */
  function remote() { return Store.backend === 'supabase' && typeof Store.invoke === 'function'; }
  function sendFailure(e, channel) {
    if (e && e.reachable && e.status !== 404) {
      const m = String(e.message || '').trim().replace(/([^.])$/, '$1.');
      return new Error(e.status === 409 ? m : `${m} Your broadcast is saved as a draft.`);
    }
    return new Error(channel === 'sms'
      ? 'Texting isn\'t connected yet. Your message is saved as a draft.'
      : 'Email sending isn\'t connected yet. Your broadcast is saved as a draft.');
  }
  const schedBusy = new Set();
  let schedPauseUntil = 0, schedNoticed = false;
  function runScheduledRemote(slug) {
    if (Date.now() < schedPauseUntil) return [];
    const s = tenantSlug(slug);
    list('broadcasts', s).filter((b) => b.status === 'scheduled' && b.channel === 'email' && b.scheduledFor && Date.parse(b.scheduledFor) <= Date.now() && perms.send(ownerOf(b)))
      .forEach((b) => {
        const key = s + ':' + b.id;
        if (schedBusy.has(key)) return;
        schedBusy.add(key);
        Store.invoke('send-email', { kind: 'broadcast', tenant: s, id: b.id })
          .catch((e) => {
            if (e && e.reachable) return;
            schedPauseUntil = Date.now() + 10 * 60000;   // not connected: try again in 10 minutes
            if (!schedNoticed) {
              schedNoticed = true;
              App.toast('A scheduled email is due, but email sending isn\'t connected yet. It stays scheduled and goes out once sending is on.', 'info', { duration: 8000 });
            }
          })
          .then(() => schedBusy.delete(key));
      });
    return [];
  }
  function countsOf(a, sent) {
    return { sent, skippedOptOut: a.skipped.optOut.length + a.skipped.doNotContact.length, skippedQuietHours: a.skipped.quietHours.length, skippedNoContact: a.skipped.noContact.length };
  }
  function logSend(b, recipients, slug) {
    const at = b.sentAt || nowIso();
    const label = b.channel === 'sms' ? 'text' : 'email';
    const first = String(b.channel === 'sms' ? b.body : b.subject || b.body || '').split('\n')[0].slice(0, 80);
    addMany('interactions', recipients.map((p) => ({
      owner: b.owner, personId: p.id, type: b.channel === 'sms' ? 'text' : 'email', summary: `Sent the ${label} "${first}" from ${b.sender ? b.sender.name : 'the team'}.`,
      by: userName(), byId: userId(), at, refColl: 'broadcasts', refId: b.id,
    })), slug);
    const patches = {};
    recipients.forEach((p) => { if (!p.lastActivityAt || at > p.lastActivityAt) patches[p.id] = { lastActivityAt: at }; });
    updateMany('people', patches, slug);
  }
  function cancelBroadcast(id, slug) { return db(slug).update('broadcasts', id, { status: 'draft', scheduledFor: null, heldForQuietHours: false }); }
  /* Sends scheduled broadcasts whose time has come (checked on load and every minute while a CRM screen is open). */
  function runScheduled(slug) {
    if (remote()) return runScheduledRemote(slug);
    const due = list('broadcasts', slug).filter((b) => b.status === 'scheduled' && b.scheduledFor && Date.parse(b.scheduledFor) <= Date.now());
    const out = [];
    due.forEach((b) => {
      const a = audience(b.owner, b.listId, b.channel, slug, new Date());
      if (b.channel === 'sms' && !a.quiet.ok) { db(slug).update('broadcasts', b.id, { scheduledFor: a.quiet.next.toISOString() }); return; }
      const saved = db(slug).update('broadcasts', b.id, { status: 'sent', sentAt: nowIso(), counts: countsOf(a, a.recipients.length) });
      logSend(saved, a.recipients, slug);
      out.push(saved);
    });
    return out;
  }
  /* An inbound text. STOP words opt the person out of texts right away. */
  function inboundText(personId, text, slug) {
    const p = person(personId, slug);
    if (!p) return null;
    const word = String(text || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    const isStop = STOP_WORDS.indexOf(word) >= 0;
    if (isStop) db(slug).update('people', p.id, { smsOptIn: false, smsOptOutAt: nowIso() });
    addInteraction({ personId, type: 'text', direction: 'in', summary: isStop ? `Replied "${String(text).trim()}". Texts are off for this person.` : `Replied: "${String(text).trim()}"` }, slug);
    return { stopped: isStop };
  }
  function donationTotal(personId, slug, owner) {
    const cfg = config(owner, slug);
    const since = cfg.cycleStart || '2025-01-01';
    return (interactionsByPerson(slug).get(personId) || []).filter((x) => x.type === 'donation' && String(x.at) >= since).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  }
  function donorWarning(personId, slug) {
    const p = person(personId, slug);
    if (!p) return null;
    const cfg = config(ownerOf(p), slug);
    const limit = Number(cfg.donorLimit) || 0;
    if (!limit) return null;
    const total = donationTotal(personId, slug, ownerOf(p));
    if (total <= limit * 0.8) return null;
    return { total, limit, over: total > limit };
  }

  /* ---------------- phone bank ---------------- */
  function callCampaigns(owner, slug) { return scoped('callCampaigns', owner, slug); }
  function getCallCampaign(id, slug) { return list('callCampaigns', slug).find((c) => c.id === id) || null; }
  function saveCallCampaign(doc, slug) {
    const d = Object.assign({}, doc);
    if (d.id && getCallCampaign(d.id, slug)) { const id = d.id; delete d.id; return db(slug).update('callCampaigns', id, d); }
    return db(slug).add('callCampaigns', Object.assign({ owner: 'committee', name: 'Call campaign', script: '', questions: [], status: 'active' }, d));
  }
  function callsFor(campaignId, slug) { return list('interactions', slug).filter((x) => x.type === 'call' && x.refColl === 'callCampaigns' && x.refId === campaignId); }
  function callQueue(campaignId, slug) {
    const c = getCallCampaign(campaignId, slug);
    if (!c) return [];
    const done = new Set(callsFor(campaignId, slug).map((x) => x.personId));
    return runList(c.listId, slug).filter((p) => p.phone && !p.doNotContact && !done.has(p.id) && (p.tags || []).indexOf('Wrong number') < 0);
  }
  function callProgress(campaignId, slug) {
    const c = getCallCampaign(campaignId, slug);
    if (!c) return null;
    const calls = callsFor(campaignId, slug);
    const callable = runList(c.listId, slug).filter((p) => p.phone && !p.doNotContact);
    const reached = new Set(calls.map((x) => x.personId));
    const total = new Set(callable.map((p) => p.id).concat(Array.from(reached))).size;
    const by = {}; CALL_OUTCOMES.forEach((o) => { by[o.id] = 0; });
    calls.forEach((x) => { by[x.outcome] = (by[x.outcome] || 0) + 1; });
    return { total, called: reached.size, left: Math.max(0, total - reached.size), outcomes: by, talkedRate: calls.length ? by.talked / calls.length : 0 };
  }
  /* Saves one call: a `call` interaction, plus support and tags from the answers. */
  function logCall(campaignId, personId, result, slug) {
    const c = getCallCampaign(campaignId, slug);
    const p = person(personId, slug);
    if (!c || !p) return null;
    const r = result || {};
    const outcome = CALL_OUTCOMES.find((o) => o.id === r.outcome) || CALL_OUTCOMES[0];
    const patch = {};
    const tags = (p.tags || []).slice();
    const said = [];
    (c.questions || []).forEach((q) => {
      const ans = r.answers && r.answers[q.id];
      if (ans == null || ans === '') return;
      const opt = (q.options || []).find((o) => (o.label || o) === ans) || {};
      said.push(`${q.short || q.text}: ${ans}`);
      if (opt.support) patch.support = Number(opt.support);
      if (opt.tag && tags.indexOf(opt.tag) < 0) tags.push(opt.tag);
    });
    if (outcome.id === 'do_not_call') { patch.doNotContact = true; patch.smsOptIn = false; }
    if (outcome.id === 'wrong_number' && tags.indexOf('Wrong number') < 0) tags.push('Wrong number');
    patch.tags = tags;
    db(slug).update('people', p.id, cleanPerson(patch));
    const summary = `${outcome.label}${said.length ? '. ' + said.join('. ') : ''}${r.notes ? '. Notes: ' + r.notes : ''}`.replace(/\.\./g, '.');
    return addInteraction({ personId, type: 'call', outcome: outcome.id, summary: `${c.name}: ${summary}`, answers: r.answers || {}, refColl: 'callCampaigns', refId: c.id }, slug);
  }

  /* ---------------- petitions ---------------- */
  function petitions(owner, slug) { return scoped('petitions', owner, slug).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); }
  function getPetition(id, slug) { return list('petitions', slug).find((p) => p.id === id || p.slug === id) || null; }
  function savePetition(doc, slug) {
    const d = Object.assign({}, doc);
    d.slug = kebab(d.slug || d.title || 'petition').slice(0, 60) || 'petition';
    const taken = new Set(list('petitions', slug).filter((p) => p.id !== d.id).map((p) => p.slug));
    let s = d.slug, n = 2;
    while (taken.has(s)) s = d.slug + '-' + (n++);
    d.slug = s;
    if (d.id && getPetition(d.id, slug)) { const id = d.id; delete d.id; return db(slug).update('petitions', id, d); }
    return db(slug).add('petitions', Object.assign({ owner: 'committee', kind: 'petition', title: '', ask: '', goal: 100, questions: [], status: 'draft' }, d));
  }
  function signatures(petitionId, slug) { return list('signatures', slug).filter((s) => s.petitionId === petitionId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); }
  /* Public total, same formula as the public petition page: seedCount + saved signatures. */
  function petitionCount(p, slug) { return p ? (Number(p.seedCount) || 0) + list('signatures', slug).filter((x) => x.petitionId === p.id).length : 0; }
  function petitionUrl(p, slug) {
    const county = tenantSlug(slug);
    const rel = `index.html?county=${encodeURIComponent(county)}#/act/${encodeURIComponent(p.slug)}`;
    try { return new URL(rel, location.href).href; } catch (e) { return rel; }
  }

  /* ---------------- sharing ---------------- */
  /* Copies people from one owner to another, deduped in the target, and logs it in `shares`. */
  function share(from, to, personIds, note, slug) {
    if (!from || !to || from === to) return null;
    const ids = uniq(personIds);
    const copied = [];
    ids.forEach((id) => {
      const p = person(id, slug);
      if (!p || ownerOf(p) !== from) return;
      const r = upsertPerson({
        owner: to, firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone, zip: p.zip, city: p.city,
        tags: (p.tags || []).filter((t) => t !== 'Campaign team').concat(['Shared by ' + ownerLabel(from, slug)]), roles: (p.roles || []).filter((x) => x !== 'member'),
        support: p.support, emailOptIn: p.emailOptIn, smsOptIn: p.smsOptIn, doNotContact: p.doNotContact, source: `Shared by ${ownerLabel(from, slug)}`,
        sharedFrom: { owner: from, personId: p.id },
      }, slug);
      copied.push(r.person.id);
    });
    const at = nowIso();
    const log = db(slug).add('shares', { from, to, personIds: ids, copiedIds: copied, by: userName(), byId: userId(), at, note: note || '' });
    addMany('interactions', ids.map((pid) => ({ owner: from, personId: pid, type: 'share', summary: `Shared with ${ownerLabel(to, slug)}${note ? `: ${note}` : '.'}`, by: userName(), byId: userId(), at, refColl: 'shares', refId: log.id }))
      .concat(copied.map((pid) => ({ owner: to, personId: pid, type: 'share', summary: `Shared by ${ownerLabel(from, slug)}${note ? `: ${note}` : '.'}`, by: userName(), byId: userId(), at, refColl: 'shares', refId: log.id }))), slug);
    return { share: log, copied: copied.length };
  }
  function campaignOwners(slug) {
    const t = tenantObj(slug);
    const out = new Map();
    db(slug).list('campaignSites').forEach((s) => { if (s.slug) out.set('campaign:' + s.slug, s.name || s.slug); });
    (t && t.candidates || []).filter((c) => c.status === 'ENDORSED' || c.status === 'ACTIVE_CAMPAIGN').forEach((c) => { const k = 'campaign:' + kebab(c.name); if (!out.has(k)) out.set(k, c.name); });
    return Array.from(out, ([owner, name]) => {
      const c = candidateFor(owner, slug);
      return { owner, slug: ownerSlug(owner), name: c ? c.name : name, office: c ? c.office : '' };
    });
  }

  /* ---------------- ingestion ---------------- */
  function parseContact(doc, slug) {
    let email = normEmail(doc.email), phone = normPhone(doc.phone);
    const c = String(doc.contact || '');
    if (!email && /@/.test(c)) email = normEmail(c);
    if (!phone && !/@/.test(c)) phone = normPhone(c);
    if ((!email && !phone) && doc.createdBy) {
      const acct = (Store.global.list('accounts') || []).find((a) => a.id === doc.createdBy);
      if (acct) { email = normEmail(acct.email); phone = normPhone(acct.phone); }
    }
    return { email, phone };
  }
  function ingestOne(coll, doc, slug, ing) {
    const k = coll + ':' + doc.id;
    if (Object.prototype.hasOwnProperty.call(ing, k)) return false;
    const at = doc.createdAt || nowIso();
    if (coll === 'optOuts') {
      /* From the public unsubscribe page. Honored for every record in the county with that email or phone. */
      const e = normEmail(doc.email), ph = normPhone(doc.phone);
      const ch = doc.channel === 'sms' || doc.channel === 'all' ? doc.channel : 'email';
      const hits = list('people', slug).filter((x) => !x.mergedInto && ((e && normEmail(x.email) === e) || (ph && normPhone(x.phone) === ph)));
      ing[k] = hits.map((x) => x.id).join(',') || null;
      const patches = {};
      hits.forEach((x) => {
        patches[x.id] = ch === 'all' ? { doNotContact: true, emailOptIn: false, smsOptIn: false, emailOptOutAt: at, smsOptOutAt: at }
          : ch === 'sms' ? { smsOptIn: false, smsOptOutAt: at } : { emailOptIn: false, emailOptOutAt: at };
      });
      updateMany('people', patches, slug);
      addMany('interactions', hits.map((x) => ({ owner: ownerOf(x), personId: x.id, type: 'note', summary: ch === 'all' ? 'Asked not to be contacted at all, from the unsubscribe page.' : ch === 'sms' ? 'Turned off texts from the unsubscribe page.' : 'Unsubscribed from email on the unsubscribe page.', by: 'Unsubscribe page', byId: null, at, refColl: coll, refId: doc.id })), slug);
      return true;
    }
    if (coll === 'walkResults') {
      const addr = String(doc.address || '').toLowerCase();
      const p = scoped('people', 'committee', slug).find((x) => (doc.voterId && x.voterId === doc.voterId) || (addr && x.address && addr.indexOf(String(x.address).toLowerCase()) === 0));
      ing[k] = p ? p.id : null;
      if (!p) return true;
      const RES = { talked: 'Talked at the door', not_home: 'Not home', refused: 'Refused to talk', moved: 'Moved away', yard_sign: 'Asked for a yard sign' };
      addInteraction({ personId: p.id, type: 'walk', outcome: doc.result, summary: `${RES[doc.result] || 'Door knocked'}${doc.support ? `, support ${doc.support} (${SUPPORT[doc.support]})` : ''}${doc.notes ? `. ${doc.notes}` : '.'}`, by: doc.walkerName || 'A walker', at, refColl: coll, refId: doc.id }, slug);
      const patch = {};
      if (doc.support) patch.support = doc.support;
      if (doc.result === 'yard_sign') patch.tags = uniq((p.tags || []).concat(['Yard sign']));
      if (Object.keys(patch).length) db(slug).update('people', p.id, patch);
      return true;
    }
    let owner = 'committee';
    let petition = null;
    if (coll === 'signatures') {
      petition = getPetition(doc.petitionId, slug);
      if (doc.campaign) owner = 'campaign:' + doc.campaign;
      else if (petition) owner = petition.owner || 'committee';
    } else if (doc.campaign) owner = 'campaign:' + doc.campaign;
    const { email, phone } = parseContact(doc, slug);
    const nm = splitName(doc.name || '');
    if (!email && !phone && !nm.firstName) { ing[k] = null; return true; }
    const tags = [];
    const roles = [];
    let source = 'Public site';
    let summary = '';
    let type = 'note';
    const extra = {};
    if (coll === 'rsvps') {
      type = 'rsvp'; roles.push('supporter'); source = 'Event RSVP';
      summary = `RSVP'd to ${doc.title || 'an event'}${doc.date ? ` on ${doc.date}` : ''}${Number(doc.guests) ? ` with ${doc.guests} guest${Number(doc.guests) === 1 ? '' : 's'}` : ''}.`;
    } else if (coll === 'volunteers') {
      type = 'volunteer'; roles.push('volunteer'); source = owner === 'committee' ? 'Volunteer form' : 'Campaign site';
      (doc.interests || []).forEach((x) => tags.push(String(x)));
      summary = `Signed up to volunteer${(doc.interests || []).length ? `: ${doc.interests.join(', ')}` : ''}.`;
    } else if (coll === 'memberships') {
      type = 'membership'; roles.push('supporter'); tags.push('Dues-paying member'); source = 'Membership form';
      summary = `Joined as a dues-paying member${doc.amount ? ` (${U.fmtUsd(doc.amount)})` : ''}.`;
    } else if (coll === 'donations') {
      type = 'donation'; roles.push('donor'); source = 'Donation page';
      extra.amount = Number(doc.amount) || 0;
      summary = `${doc.status === 'pledged' ? 'Pledged' : 'Gave'} ${U.fmtUsd(doc.amount)}${doc.recurring ? ' a month' : ''}${doc.via ? ` through ${doc.via}` : ''}.`;
    } else if (coll === 'signatures') {
      type = 'signature'; roles.push('supporter');
      const ps = petition ? petition.slug : 'unknown';
      tags.push('petition:' + ps);
      source = petition ? `${petition.kind === 'survey' ? 'Survey' : 'Petition'}: ${petition.title}` : 'Petition';
      summary = `${petition && petition.kind === 'survey' ? 'Answered the survey' : 'Signed'} "${petition ? petition.title : 'a petition'}".`;
      if (doc.answers && Object.keys(doc.answers).length) extra.answers = doc.answers;
    }
    const r = upsertPerson({
      owner, firstName: nm.firstName, lastName: nm.lastName, email, phone, zip: doc.zip || '', tags, roles,
      emailOptIn: coll === 'signatures' ? !!(doc.optIn && email) : !!email, smsOptIn: !!(doc.smsOptIn && phone), source, lastActivityAt: at,
      sample: doc.sample ? true : undefined,
    }, slug);
    const pid = r.person.id;
    ing[k] = pid;
    const by = coll === 'signatures' ? 'Public site' : owner === 'committee' ? 'Public site' : 'Campaign site';
    addInteraction(Object.assign({ personId: pid, type, summary, by, byId: null, at, refColl: coll, refId: doc.id }, extra), slug);
    if (coll === 'donations') {
      const w = donorWarning(pid, slug);
      if (w && w.over) {
        const tre = team(owner, slug).find((x) => /treasurer/i.test((x.tags || []).join(' '))) || team(owner, slug)[0];
        addTask({ owner, personId: pid, title: `Review gifts from ${r.person.name}: ${U.fmtUsd(w.total)} so far, above the ${U.fmtUsd(w.limit)} limit your treasurer set`, due: isoDay(Date.now() + DAY), assigneeId: tre ? tre.id : null, auto: 'donor-limit' }, slug);
      }
    }
    return true;
  }
  let ingesting = false;
  function ingest(slug) {
    const s = tenantSlug(slug);
    if (ingesting) return 0;
    ingesting = true;
    let n = 0;
    try {
      const S = db(s);
      const ing = S.get('crmIngest', {}) || {};
      const before = Object.keys(ing).length;
      SOURCES.forEach((coll) => {
        S.list(coll).forEach((doc) => { if (doc && doc.id && ingestOne(coll, doc, s, ing)) n++; });
      });
      if (Object.keys(ing).length !== before) S.set('crmIngest', ing);
    } catch (e) { console.error('[crm] ingest', e); }
    ingesting = false;
    return n;
  }
  let ingestTimer = 0;
  SOURCES.forEach((coll) => Store.on(coll, (d) => {
    if (seeding) return;
    if (d && d.tenant && d.tenant !== tenantSlug()) return;
    clearTimeout(ingestTimer);
    ingestTimer = setTimeout(() => ingest(), 30);
  }));

  /* ---------------- seed ---------------- */
  const FIRST = ['Maria', 'James', 'Linh', 'Robert', 'Aisha', 'Carlos', 'Mei', 'David', 'Fatima', 'Thomas', 'Rosa', 'Anil', 'Grace', 'Miguel', 'Sarah', 'Hyun', 'Patricia', 'Oscar', 'Jennifer', 'Tuan',
    'Elaine', 'Victor', 'Leilani', 'Gregory', 'Ana', 'Rajesh', 'Catherine', 'Diego', 'Nadia', 'William', 'Yesenia', 'Kevin', 'Teresa', 'Samir', 'Lauren', 'Arturo', 'Joyce', 'Minh', 'Brenda', 'Ernesto',
    'Helen', 'Kofi', 'Monica', 'Stanley', 'Ingrid', 'Rafael', 'Deborah', 'Wei', 'Hannah', 'Luis', 'Priscilla', 'Desmond', 'Noemi', 'Calvin', 'Ruth', 'Hector'];
  const LAST = ['Alvarez', 'Nguyen', 'Patterson', 'Kaur', 'Mendoza', 'Chen', 'Holloway', 'Ramirez', 'Okonkwo', 'Fischer', 'Tran', 'Castellano', 'Brennan', 'Iyer', 'Delacruz', 'Whitaker', 'Park', 'Esposito', 'Haddad', 'Lindqvist',
    'Oyelaran', 'Gutierrez', 'Sato', 'McAllister', 'Pham', 'Rosales', 'Dunleavy', 'Bhatt', 'Carrasco', 'Yamamoto', 'Abernathy', 'Villanueva', 'Kowalski', 'Ortega', 'Sorensen', 'Mahmoud', 'Thibodeaux', 'Cruz', 'Hartley', 'Lozano',
    'Ferreira', 'Galloway', 'Osterberg', 'Quintero', 'Rasmussen', 'Takahashi', 'Underwood', 'Valdivia', 'Winslow', 'Zamora'];
  const ZIPS = {
    svgop: { 'San Jose': ['95125', '95120', '95118', '95123'], Sunnyvale: ['94086', '94087'], Milpitas: ['95035'], Cupertino: ['95014'], Campbell: ['95008'], 'Morgan Hill': ['95037'], 'Santa Clara': ['95050', '95051'], 'Los Gatos': ['95032'] },
    demo: { Riverbend: ['93274', '93277'], 'Oak Hollow': ['93277'], 'Cedar Flats': ['93291'], Millbrook: ['93292'] },
  };
  const AREA = { svgop: ['408', '669', '650', '408'], demo: ['559', '209', '661', '559'] };
  const TOPIC_TAGS = ['Public safety', 'Schools', 'Gas tax', 'Small business owner', 'Parent', 'Veteran', 'Spanish speaker', 'Vietnamese speaker', 'Mandarin speaker', 'Housing costs', 'Water', 'Election integrity'];
  const VOL_TAGS = ['Phone bank', 'Precinct walker', 'Yard sign', 'Poll observer', 'Election night', 'Data entry'];

  const seeded = new Set();
  let seeding = false;
  function makeGen(slug, salt, reserved) {
    const rng = U.seeded('crm:' + slug + ':' + salt);
    const usedEmail = new Set(reserved.emails);
    const usedPhone = new Set(reserved.phones);
    let phoneN = salt === 'committee' ? 0 : salt.length * 37;
    const pick = (a) => a[Math.floor(rng() * a.length)];
    function email(first, last) {
      const base = (first + '.' + last).toLowerCase().normalize('NFKD').replace(/[^a-z.]/g, '');
      const dom = pick(['example.com', 'example.org', 'example.net']);
      let e = base + '@' + dom, n = 2;
      while (usedEmail.has(e)) e = base + (n++) + '@' + dom;
      usedEmail.add(e);
      return e;
    }
    function phone() {
      const areas = AREA[slug] || AREA.svgop;
      for (let guard = 0; guard < 500; guard++) {
        const a = areas[Math.floor(phoneN / 100) % areas.length];
        const p = a + '555' + String(100 + (phoneN % 100)).padStart(4, '0');
        phoneN += 7;
        if (!usedPhone.has(p)) { usedPhone.add(p); return p; }
      }
      return '';
    }
    function place() {
      const z = ZIPS[slug] || ZIPS.svgop;
      const city = pick(Object.keys(z));
      return { city, zip: pick(z[city]) };
    }
    return { rng, pick, email, phone, place };
  }
  function ago(base, days, hours) { return new Date(base - days * DAY - (hours || 0) * 3600000).toISOString(); }

  function seedCommittee(slug, t, base, reserved) {
    const G = makeGen(slug, 'committee', reserved);
    const { rng, pick } = G;
    const people = [];
    const its = [];
    let n = 0;
    const id = () => `pp-${slug}-${String(++n).padStart(3, '0')}`;
    const accts = ((window.DATA && DATA.sampleAccounts) || []).filter((a) => a.tenant === slug);
    const byMember = {}; accts.forEach((a) => { if (a.memberId) byMember[a.memberId] = a; });
    const z = ZIPS[slug] || ZIPS.svgop;
    const cities = Object.keys(z);
    function mk(o) {
      const nm = splitName(o.name);
      const pl = o.city ? { city: o.city, zip: o.zip || (z[o.city] || [''])[0] } : G.place();
      const acct = o.acct;
      const p = Object.assign({
        id: id(), owner: 'committee', firstName: nm.firstName, lastName: nm.lastName, name: o.name,
        email: acct ? normEmail(acct.email) : (rng() < 0.92 ? G.email(nm.firstName, nm.lastName) : ''),
        phone: acct ? normPhone(acct.phone) : (rng() < 0.85 ? G.phone() : ''),
        zip: acct && acct.zip ? acct.zip : pl.zip, city: pl.city, tags: [], support: null, roles: [], pointPersonId: null,
        emailOptIn: false, smsOptIn: false, doNotContact: false, source: 'Voter file', sample: true, createdAt: ago(base, 200 + Math.floor(rng() * 400)), lastActivityAt: null,
      }, o.fields || {});
      p.emailOptIn = !!p.email && (o.optInEmail != null ? o.optInEmail : rng() < 0.82);
      p.smsOptIn = !!p.phone && (o.optInSms != null ? o.optInSms : rng() < 0.48);
      delete p.acct;
      people.push(p);
      return p;
    }
    function it(p, type, daysAgo, summary, extra) {
      its.push(Object.assign({ id: `ix-${slug}-${its.length + 1}`, owner: p.owner, personId: p.id, type, summary, by: extra && extra.by || (t.chair || {}).name || 'The committee', byId: null, at: ago(base, daysAgo, Math.floor(rng() * 8)), sample: true, createdAt: ago(base, daysAgo) }, extra || {}, { by: (extra && extra.by) || (t.chair || {}).name || 'The committee' }));
    }
    // Committee members
    const members = (t.members || []);
    members.forEach((m, i) => {
      const acct = byMember[m.id];
      const isVol = m.role === 'VOLUNTEER';
      const tags = [m.role === 'EXEC_BOARD' ? 'Executive Board' : m.role === 'ALTERNATE' ? 'Alternate' : m.role === 'COMMITTEE_MEMBER' ? 'Central committee' : m.title, m.district].filter(Boolean);
      if (m.role === 'EXEC_BOARD' && m.title) tags.push(m.title);
      const p = mk({ name: m.name, acct, city: cities[i % cities.length], fields: {
        memberId: m.id, roles: isVol ? ['volunteer', 'supporter'] : ['member', 'supporter'], support: 5, tags, source: isVol ? 'Volunteer team' : 'Central committee roster',
        teamRank: m.role === 'EXEC_BOARD' ? 3 - (i * 0.1) : m.role === 'COMMITTEE_MEMBER' ? 1 : 0,
      }, optInEmail: true, optInSms: true });
      if (!isVol) it(p, 'meeting', 26, 'Checked in at the September General Meeting.', { by: 'Meetings & Voting' });
      if (m.role === 'EXEC_BOARD') it(p, 'meeting', 9, 'Executive Board call on the election-night budget.', { by: p.name });
    });
    const memberPeople = people.filter((p) => (p.roles || []).indexOf('member') >= 0);
    const chair = memberPeople[0];
    // Field volunteers (some are already on the roster as volunteers)
    (t.volunteers || []).forEach((v, i) => {
      let p = people.find((x) => x.name === v.name);
      if (!p) p = mk({ name: v.name, fields: { roles: ['volunteer', 'supporter'], support: 5, source: 'Volunteer form' } });
      p.volunteerShifts = v.shifts;
      p.tags = uniq(p.tags.concat([pick(VOL_TAGS), i % 2 ? 'Phone bank' : 'Precinct walker']));
      p.pointPersonId = memberPeople[1 + (i % Math.max(1, memberPeople.length - 1))].id;
      const turf = (t.turfs || []).find((x) => x.volunteerId === v.id);
      for (let k = 0; k < Math.min(4, v.shifts); k++) {
        it(p, 'volunteer', 3 + k * 6 + Math.floor(rng() * 3), turf ? `Walked ${Math.round(v.doors / v.shifts)} doors in ${turf.name}.` : 'Worked a phone bank shift at headquarters.', { by: 'Field Organizer' });
      }
    });
    // Voters from the sample voter file
    const PLEAN = { REP: 4, NPP: 3, OTHER: 3, DEM: 2 };
    const PARTY = { REP: 'Republican', NPP: 'No party preference', DEM: 'Democrat', OTHER: 'Other party' };
    (t.voters || []).forEach((v) => {
      const r = U.seeded(v.id + ':hh');
      const known = r() < 0.55;
      const lean = PLEAN[v.party] || 3;
      const support = known ? Math.max(1, Math.min(5, lean + Math.round(r() * 2 - 1))) : null;
      const tags = [];
      if (rng() < 0.35) tags.push(pick(TOPIC_TAGS));
      if (rng() < 0.12) tags.push(pick(TOPIC_TAGS));
      const p = mk({ name: v.first + ' ' + v.last, city: v.city, fields: {
        address: v.address, voterId: v.id, party: PARTY[v.party] || v.party, support, tags, precinct: v.precinct,
        roles: support >= 4 ? ['supporter'] : [], source: 'Voter file',
      } });
      p.zip = (z[v.city] || [p.zip])[Math.floor(rng() * (z[v.city] || [1]).length)] || p.zip;
      if (support != null) {
        const turf = (t.turfs || []).find((x) => x.id === v.turfId);
        it(p, 'walk', 4 + Math.floor(rng() * 50), `Talked at the door${turf ? ` in ${turf.name}` : ''}, support ${support} (${SUPPORT[support]}).`, { by: pick((t.volunteers || [{ name: 'A walker' }])).name, outcome: 'talked' });
      }
      if (rng() < 0.18) it(p, 'call', 2 + Math.floor(rng() * 30), pick(['Talked. Wants a mail ballot reminder.', 'Left message about the candidate forum.', 'Talked. Asked where to drop off a ballot.', 'No answer.']), { by: pick(memberPeople).name, outcome: 'talked' });
      if (p.email && p.emailOptIn && rng() < 0.5) it(p, 'email', 12, 'Sent the email "September General Meeting recap" from the chair.', { by: chair ? chair.name : 'The chair' });
      if (support >= 4 && rng() < 0.22) {
        const ev = pick(t.events || [{ title: 'a committee event' }]);
        it(p, 'rsvp', 1 + Math.floor(rng() * 20), `RSVP'd to ${ev.title}.`, { by: 'Public site' });
      }
      if (support >= 4 && rng() < 0.22) p.pointPersonId = pick(memberPeople).id;
      if (rng() < 0.03) { p.doNotContact = true; p.emailOptIn = false; p.smsOptIn = false; p.tags.push('Asked not to be contacted'); }
    });
    // Donors
    const donorPool = people.filter((p) => p.support >= 4 && !p.memberId).slice(0, 60);
    const gifts = [100, 250, 50, 500, 1000, 75, 250, 2500, 150, 100, 4800, 300, 50, 200, 1500, 250];
    gifts.forEach((amt, i) => {
      const p = donorPool[(i * 3 + 1) % donorPool.length];
      if (!p) return;
      p.roles = uniq(p.roles.concat(['donor']));
      it(p, 'donation', 5 + i * 4, `Gave ${U.fmtUsd(amt)} through WinRed.`, { by: 'Donation page', amount: amt });
      if (amt >= 1000) it(p, 'donation', 120 + i, `Gave ${U.fmtUsd(Math.round(amt * 0.3))} at the spring dinner.`, { by: 'Treasurer', amount: Math.round(amt * 0.3) });
      if (!p.pointPersonId && memberPeople[3]) p.pointPersonId = memberPeople[3].id;
    });
    // Press and elected officials
    const extras = slug === 'demo'
      ? [['Ruth Galloway', 'press', 'Reporter, Riverbend Ledger'], ['Desmond Quintero', 'press', 'Host, Valley Morning Radio'], ['Priscilla Winslow', 'elected', 'Cedar Flats City Council'], ['Calvin Osterberg', 'elected', 'Riverbend School Board']]
      : [['Hannah Ferreira', 'press', 'Reporter, Valley Courier'], ['Desmond Takahashi', 'press', 'Producer, South Bay Morning Show'], ['Noemi Valdivia', 'elected', 'Campbell City Council'], ['Hector Underwood', 'elected', 'Morgan Hill Unified School Board']];
    extras.forEach(([name, r, title]) => {
      const p = mk({ name, fields: { roles: [r], tags: [title], source: 'Added by hand', support: r === 'elected' ? 4 : null } });
      it(p, r === 'press' ? 'email' : 'meeting', 6 + Math.floor(rng() * 20), r === 'press' ? 'Sent the candidate forum media advisory.' : 'Coffee with the chair about the endorsement process.', { by: chair ? chair.name : 'The chair' });
    });
    // One deliberate duplicate, so the merge suggestion has something to show
    const dupOf = people.find((p) => p.volunteerShifts && !p.memberId && p.phone);
    if (dupOf) {
      const short = { Benjamin: 'Ben', Abigail: 'Abby', Lucia: 'Lucy', Simone: 'Simi' }[dupOf.firstName] || dupOf.firstName.slice(0, 3);
      const d = mk({ name: short + ' ' + dupOf.lastName, city: dupOf.city, zip: dupOf.zip, fields: { roles: ['supporter'], tags: ['Event sign-in sheet'], source: 'Event sign-in sheet', support: 4 } });
      d.phone = dupOf.phone; d.email = ''; d.emailOptIn = false; d.smsOptIn = dupOf.smsOptIn;
      it(d, 'rsvp', 15, `Signed in at ${((t.events || [])[0] || { title: 'a committee event' }).title}.`, { by: 'Event sign-in sheet' });
    }
    // Last activity from the timeline
    const last = {};
    its.forEach((x) => { if (!last[x.personId] || x.at > last[x.personId]) last[x.personId] = x.at; });
    people.forEach((p) => { p.lastActivityAt = last[p.id] || p.createdAt; p.createdAt = p.createdAt < p.lastActivityAt ? p.createdAt : p.lastActivityAt; });
    // A few people joined this month
    people.filter((p) => !p.memberId && p.source === 'Voter file').slice(0, 11).forEach((p, i) => { p.createdAt = ago(base, 1 + i * 2); p.source = i % 2 ? 'Volunteer form' : 'Event RSVP'; });
    return { people, its, memberPeople, chair };
  }

  function seedCampaign(slug, owner, cand, base, reserved, t) {
    const G = makeGen(slug, owner, reserved);
    const { rng, pick } = G;
    const people = [];
    const its = [];
    let n = 0;
    const cs = ownerSlug(owner);
    const used = new Set();
    function mk(name, fields) {
      const nm = splitName(name);
      const pl = G.place();
      const p = Object.assign({
        id: `pp-${slug}-${cs}-${String(++n).padStart(2, '0')}`, owner, firstName: nm.firstName, lastName: nm.lastName, name,
        email: rng() < 0.9 ? G.email(nm.firstName, nm.lastName) : '', phone: rng() < 0.85 ? G.phone() : '', zip: pl.zip, city: pl.city,
        tags: [], support: 5, roles: ['supporter'], pointPersonId: null, emailOptIn: false, smsOptIn: false, doNotContact: false,
        source: 'Campaign site', sample: true, createdAt: ago(base, 20 + Math.floor(rng() * 120)), lastActivityAt: null,
      }, fields || {});
      p.emailOptIn = !!p.email && rng() < 0.85;
      p.smsOptIn = !!p.phone && rng() < 0.55;
      people.push(p);
      used.add(name);
      return p;
    }
    function it(p, type, daysAgo, summary, extra) {
      its.push(Object.assign({ id: `ix-${slug}-${cs}-${its.length + 1}`, owner, personId: p.id, type, summary, by: cand.name, byId: null, at: ago(base, daysAgo, Math.floor(rng() * 8)), sample: true, createdAt: ago(base, daysAgo) }, extra || {}));
    }
    const me = mk(cand.name, { roles: ['candidate'], tags: ['Campaign team'], source: 'Campaign team', teamRank: 3 });
    const acct = (Store.global.list('accounts') || []).find((a) => a.campaignSlug === cs && a.tenant === slug);
    if (acct) { me.email = normEmail(acct.email) || me.email; me.phone = normPhone(acct.phone) || me.phone; if (acct.zip) me.zip = acct.zip; }
    me.emailOptIn = !!me.email;
    function freshName() {
      for (let g = 0; g < 200; g++) { const nm = pick(FIRST) + ' ' + pick(LAST); if (!used.has(nm)) return nm; }
      return 'Alex Morgan';
    }
    const mgr = mk(freshName(), { roles: ['volunteer'], tags: ['Campaign team', 'Campaign manager'], source: 'Campaign team', teamRank: 2 });
    const tre = mk(freshName(), { roles: ['volunteer'], tags: ['Campaign team', 'Treasurer'], source: 'Campaign team', teamRank: 1 });
    const CTAGS = ['Parent', 'Teacher', 'Yard sign', 'House party host', 'Walk precincts', 'Phone bank', 'Neighbor', 'Small business owner'];
    for (let i = 0; i < 37; i++) {
      const r = rng();
      const roles = r < 0.3 ? ['volunteer', 'supporter'] : r < 0.5 ? ['donor', 'supporter'] : ['supporter'];
      const p = mk(freshName(), { roles, tags: [pick(CTAGS)].concat(rng() < 0.3 ? [pick(CTAGS)] : []), support: rng() < 0.75 ? 5 : 4, source: pick(['Campaign site', 'Campaign site', 'House party', 'Door knock']) });
      p.tags = uniq(p.tags);
      if (roles.indexOf('volunteer') >= 0) {
        p.volunteerShifts = 1 + Math.floor(rng() * 4);
        it(p, 'volunteer', 3 + Math.floor(rng() * 25), `Walked ${8 + Math.floor(rng() * 30)} doors for ${cand.name}.`, { by: mgr.name });
        p.pointPersonId = mgr.id;
      }
      if (roles.indexOf('donor') >= 0) { const amt = pick([50, 100, 250, 500, 100, 1000]); it(p, 'donation', 2 + Math.floor(rng() * 40), `Gave ${U.fmtUsd(amt)} to ${cand.committeeName || cand.name}.`, { by: tre.name, amount: amt }); p.pointPersonId = tre.id; }
      if (rng() < 0.4) it(p, 'rsvp', 1 + Math.floor(rng() * 20), 'RSVP\'d to the meet-the-candidate coffee.', { by: 'Campaign site' });
      if (rng() < 0.2) it(p, 'call', 1 + Math.floor(rng() * 10), 'Talked. Will take a yard sign.', { by: mgr.name, outcome: 'talked' });
    }
    const last = {};
    its.forEach((x) => { if (!last[x.personId] || x.at > last[x.personId]) last[x.personId] = x.at; });
    people.forEach((p) => { p.lastActivityAt = last[p.id] || p.createdAt; });
    return { people, its, team: [me, mgr, tre] };
  }

  function seedPaths(owner, slug, base, ppl, team_, extras) {
    const out = { paths: [], entries: [], tasks: [] };
    const tag = owner === 'committee' ? '' : ownerSlug(owner) + '-';
    const T = (i) => (team_[i % team_.length] || {}).id || null;
    const mkPath = (idSuffix, name, goal, steps, kind) => {
      const p = { id: `path-${slug}-${tag}${idSuffix}`, owner, name, goal, kind: kind || '', sample: true, createdAt: ago(base, 60), createdBy: null,
        steps: steps.map((s, i) => ({ id: `${idSuffix}-s${i + 1}`, name: s[0], assigneeId: T(s[1]), dueDays: s[2] || 7 })) };
      out.paths.push(p);
      return p;
    };
    const entry = (path, person, stepIdx, dueDays, status) => {
      if (!person) return;
      out.entries.push({ id: `pe-${path.id}-${person.id}`, owner, pathId: path.id, personId: person.id, stepId: path.steps[stepIdx].id, status: status || 'active', due: isoDay(base + dueDays * DAY), updatedAt: ago(base, Math.max(0, 6 - dueDays)), sample: true, createdAt: ago(base, 20), createdBy: null });
    };
    const welcome = mkPath('welcome', 'New volunteer welcome', 'Turn a new sign-up into a regular volunteer within a month.', [['Welcome call', 1, 2], ['First shift', 1, 10], ['Second shift', 2, 14], ['Team lead talk', 0, 14]]);
    const thanks = mkPath('donor-thanks', 'Donor thank-you', 'Thank every donor personally and bring them to an event.', [['Thank-you call within 48 hours', 2, 2], ['Handwritten note', 0, 7], ['Invite to event', 1, 14]]);
    const vols = ppl.filter((p) => (p.roles || []).indexOf('volunteer') >= 0 && !p.memberId);
    const donors = ppl.filter((p) => (p.roles || []).indexOf('donor') >= 0);
    const recent = ppl.filter((p) => !(p.roles || []).length || (p.roles || []).indexOf('supporter') >= 0).filter((p) => !p.memberId).slice(-12);
    [[vols[0], 1, 3], [vols[1], 2, -2], [vols[2], 0, -1], [recent[0], 0, 1], [recent[1], 0, 2], [recent[2], 1, 6], [vols[3], 3, 4]].forEach(([p, s, d]) => entry(welcome, p, s, d));
    [[donors[0], 0, -1], [donors[1], 0, 1], [donors[2], 1, 3], [donors[3], 2, 9], [donors[4], 1, -3]].forEach(([p, s, d]) => entry(thanks, p, s, d));
    if (owner === 'committee') {
      const fc = mkPath('future-candidates', 'Future candidates', 'Find the volunteers who could run for office and get them into Campaign-in-a-Box.', [['Spotted', 0, 14], ['Coffee with the chair', 0, 14], ['Candidate training', 1, 30], ['Recruited into Campaign-in-a-Box', 0, 30]], 'future-candidates');
      const strong = ppl.filter((p) => (p.volunteerShifts || 0) >= 7 && (p.roles || []).indexOf('member') < 0);
      entry(fc, strong[0], 1, 5);
      entry(fc, strong[1], 2, 12);
    }
    // Tasks
    const chairId = T(0);
    const tk = (title, person, dueDays, assignee, done) => out.tasks.push({ id: `task-${slug}-${tag}${out.tasks.length + 1}`, owner, personId: person ? person.id : null, title, due: isoDay(base + dueDays * DAY), assigneeId: assignee || chairId, done: !!done, sample: true, createdAt: ago(base, 3), createdBy: null });
    if (owner === 'committee') {
      tk(`Call ${(donors[0] || {}).name || 'our newest donor'} to say thank you`, donors[0], -1);
      tk(`Ask ${(vols[0] || {}).name || 'a volunteer'} to captain a precinct`, vols[0], 0);
      tk('Confirm the candidate forum room and microphones', null, 2);
      tk(`Send ${(extras.press || {}).name || 'the reporter'} the forum media advisory`, extras.press, 1, T(2));
      tk('Review this week\'s new volunteer sign-ups', null, 3, T(1));
      tk(`Coffee with ${(vols[1] || {}).name || 'a volunteer'} about running in 2028`, vols[1], 6);
      tk('Order 200 more yard signs for the final weekend', null, -2, T(3), true);
    } else {
      tk(`Thank ${(donors[0] || {}).name || 'our newest donor'} for the gift`, donors[0], 0);
      tk('Confirm the house party host for Saturday', null, 2, T(1));
      tk(`Ask ${(vols[0] || {}).name || 'a volunteer'} to lead a canvass`, vols[0], -1, T(1));
    }
    return out;
  }

  function seedTenant(slug) {
    const s = tenantSlug(slug);
    const S = db(s);
    const meta = S.get('crmMeta', null);
    if (meta && meta.seeded >= SEED_VERSION) return false;
    const t = tenantObj(s);
    if (!t) return false;
    seeding = true;
    try {
      const base = startOfDay(Date.now()).getTime() + 12 * 3600000;
      const accts = ((window.DATA && DATA.sampleAccounts) || []).concat(Store.global.list('accounts') || []);
      const knownAcct = [['elena.marsh@example.com', '4085550133'], ['luis.arredondo@example.com', '5595550137']];
      const reserved = { emails: accts.map((a) => normEmail(a.email)).filter(Boolean).concat(knownAcct.map((k) => k[0])), phones: accts.map((a) => normPhone(a.phone)).filter(Boolean).concat(knownAcct.map((k) => k[1])) };
      const C = seedCommittee(s, t, base, reserved);
      const all = { people: C.people.slice(), interactions: C.its.slice(), lists: [], paths: [], pathEntries: [], tasks: [], broadcasts: [], callCampaigns: [], petitions: [], signatures: [] };
      const press = C.people.find((p) => (p.roles || []).indexOf('press') >= 0);
      const P = seedPaths('committee', s, base, C.people, C.memberPeople, { press });
      all.paths.push(...P.paths); all.pathEntries.push(...P.entries); all.tasks.push(...P.tasks);
      const L = (id, name, filter, owner) => { const d = { id: `list-${s}-${id}`, owner: owner || 'committee', name, filter, sample: true, createdAt: ago(base, 30), createdBy: null }; all.lists.push(d); return d; };
      const strong = L('strong', 'Strong supporters', { support: [4, 5] });
      L('volunteers', 'Active volunteers', { roles: ['volunteer'] });
      L('donors', 'Donors', { roles: ['donor'] });
      const textReady = L('text-ready', 'Text-ready supporters', { support: [4, 5], optIn: 'sms' });
      const undecided = L('undecided', 'Undecided voters', { support: [3] });
      const chairName = C.chair ? C.chair.name : (t.chair || {}).name;
      all.broadcasts.push({ id: `bc-${s}-1`, owner: 'committee', channel: 'email', sender: { name: chairName, title: (t.chair || {}).title || 'Chair' }, listId: strong.id, subject: 'September General Meeting recap', body: 'Hi {first_name},\n\nThank you to everyone who came out on Tuesday. We approved the election-night budget and heard from three of our endorsed candidates. The October General Meeting is on the 20th.\n\nSee you there,\n' + chairName, status: 'sent', sentAt: ago(base, 12), counts: { sent: 0, skippedOptOut: 0, skippedQuietHours: 0, skippedNoContact: 0 }, sample: true, createdAt: ago(base, 13), createdBy: null });
      all.broadcasts.push({ id: `bc-${s}-2`, owner: 'committee', channel: 'sms', sender: { name: t.shortName || t.name, title: 'Committee' }, listId: textReady.id, body: 'Hi {first_name}, the Weekend Phone Bank starts Saturday at 10 AM at headquarters. Can you take a two-hour shift? Reply YES and we will save you a seat.', status: 'sent', sentAt: ago(base, 4), counts: { sent: 0, skippedOptOut: 0, skippedQuietHours: 0, skippedNoContact: 0 }, sample: true, createdAt: ago(base, 4), createdBy: null });
      all.callCampaigns.push({ id: `cc-${s}-1`, owner: 'committee', name: 'Undecided voters before Election Day', listId: undecided.id, status: 'active', sample: true, createdAt: ago(base, 8), createdBy: null,
        script: 'Hi {first_name}, this is a volunteer with the {county} Republican Party. We\'re calling neighbors before the November 3 election. Do you have a minute?\n\nWe\'ve endorsed local candidates who want balanced budgets and safer streets. Can I ask you two quick questions?',
        questions: [
          { id: 'q1', text: 'If the election were today, would you vote for our endorsed candidates?', short: 'Support', options: [{ label: 'Yes, for sure', support: 5 }, { label: 'Leaning yes', support: 4 }, { label: 'Not sure yet', support: 3 }, { label: 'Leaning no', support: 2 }, { label: 'No', support: 1 }] },
          { id: 'q2', text: 'Would you put a yard sign in front of your home?', short: 'Yard sign', options: [{ label: 'Yes', tag: 'Yard sign' }, { label: 'No' }] },
        ] });
      // A few calls already made
      const und = all.people.filter((p) => p.support === 3 && p.phone && !p.doNotContact).slice(0, 7);
      und.forEach((p, i) => {
        const oc = ['talked', 'no_answer', 'talked', 'left_message', 'talked', 'no_answer', 'talked'][i];
        all.interactions.push({ id: `ix-${s}-cc-${i + 1}`, owner: 'committee', personId: p.id, type: 'call', outcome: oc, refColl: 'callCampaigns', refId: `cc-${s}-1`, by: C.memberPeople[(i % 4) + 1] ? C.memberPeople[(i % 4) + 1].name : chairName, byId: null, at: ago(base, 1 + (i % 3), i), sample: true, createdAt: ago(base, 1),
          summary: `Undecided voters before Election Day: ${{ talked: 'Talked. Support: Not sure yet', no_answer: 'No answer', left_message: 'Left message' }[oc]}.` });
      });
      /* Sample petitions and a survey. seedCount = signatures gathered before the page went online
         (clipboards at events), so the totals look real without inventing hundreds of people. */
      const PETS = s === 'demo' ? [
        { slug: 'evening-irrigation-hearing', kind: 'petition', title: 'Hold the December irrigation assessment hearing in the evening so growers and working families can attend', ask: 'The irrigation district plans a 7% assessment increase for canal lining. Ask the board to schedule its December hearing after 6 PM and to post the project list a week before.', goal: 300, seedCount: 96 },
        { slug: 'publish-patrol-response-times', kind: 'petition', title: 'Publish rural patrol response times before the next budget vote', ask: 'Response times on the eastern farm roads average 22 minutes. Ask the Board of Supervisors to publish monthly response times by area before it votes on next year\'s sheriff budget.', goal: 250, seedCount: 58 },
        { slug: 'after-november-3', kind: 'survey', title: 'What should Demo County GOP focus on after November 3?', ask: 'Three quick questions. Your answers set the committee\'s plan for 2027.', goal: 200, seedCount: 31 },
      ] : [
        { slug: 'evening-water-rate-hearing', kind: 'petition', title: 'Keep the November 12 water rate hearing in the evening so working families can attend', ask: 'The water district proposes a 9% rate increase and has set a public hearing for November 12. Ask the board to hold it after 6 PM and to stream it live, so families who work days can speak.', goal: 500, seedCount: 214 },
        { slug: 'publish-overtime-report', kind: 'petition', title: 'Publish the county overtime report before the December budget vote', ask: 'Overtime costs ran 14% over budget. Ask the Board of Supervisors to publish the department-by-department overtime report at least two weeks before the December budget vote.', goal: 400, seedCount: 137 },
        { slug: 'after-november-3', kind: 'survey', title: 'What should SVGOP focus on after November 3?', ask: 'Three quick questions. Your answers set the committee\'s plan for 2027.', goal: 300, seedCount: 64 },
      ];
      const SURVEY_Q = [
        { id: 'q1', text: 'Which issue matters most to your family next year?', options: ['Cost of living', 'Public safety', 'Schools', 'Water and roads'] },
        { id: 'q2', text: 'How should the committee spend most of its time in 2027?', options: ['Recruiting local candidates', 'Registering new voters', 'Watching city and county budgets', 'Training precinct volunteers'] },
        { id: 'q3', text: 'Would you help with a phone bank or a walk next year?', options: ['Yes', 'Maybe', 'No'] },
      ];
      PETS.forEach((d, i) => all.petitions.push(Object.assign({ id: `pet-${s}-${i + 1}`, owner: 'committee', questions: d.kind === 'survey' ? SURVEY_Q : [], status: 'live', sample: true, createdAt: ago(base, 24 - i * 6), createdBy: null }, d)));
      // Sample signatures: some from people already on file, some new
      const sigRng = U.seeded('sig:' + s);
      const known = all.people.filter((p) => p.email && p.support >= 4 && !p.memberId).slice(5, 14);
      const G2 = makeGen(s, 'signatures', { emails: all.people.map((p) => p.email).concat(reserved.emails), phones: all.people.map((p) => p.phone).concat(reserved.phones) });
      PETS.forEach((d, pi) => {
        const pid = `pet-${s}-${pi + 1}`;
        const answers = () => (d.kind === 'survey' ? { q1: SURVEY_Q[0].options[Math.floor(sigRng() * 4)], q2: SURVEY_Q[1].options[Math.floor(sigRng() * 4)], q3: SURVEY_Q[2].options[Math.floor(sigRng() * 3)] } : undefined);
        known.slice(pi * 3, pi * 3 + 3).forEach((p, i) => all.signatures.push({ id: `sig-${s}-${pi + 1}-k${i + 1}`, petitionId: pid, name: p.name, email: p.email, phone: '', zip: p.zip, answers: answers(), optIn: true, sample: true, createdAt: ago(base, 2 + i * 3 + pi), createdBy: null }));
        for (let i = 0; i < 4; i++) {
          const nm = FIRST[Math.floor(sigRng() * FIRST.length)] + ' ' + LAST[Math.floor(sigRng() * LAST.length)];
          const sp = splitName(nm);
          all.signatures.push({ id: `sig-${s}-${pi + 1}-n${i + 1}`, petitionId: pid, name: nm, email: G2.email(sp.firstName, sp.lastName), phone: '', zip: G2.place().zip, answers: answers(), optIn: sigRng() < 0.8, sample: true, createdAt: ago(base, 1 + i * 2 + pi), createdBy: null });
        }
      });
      // Sample campaigns
      const camps = [];
      const marsh = (t.candidates || []).find((c) => kebab(c.name) === 'elena-marsh');
      if (marsh) camps.push(marsh);
      const endorsed = (t.candidates || []).find((c) => c.status === 'ENDORSED');
      if (s !== 'svgop' && endorsed) camps.push(endorsed);
      ((window.DATA && DATA.sampleAccounts) || []).filter((a) => a.tenant === s && a.campaignSlug).forEach((a) => {
        const c = (t.candidates || []).find((x) => kebab(x.name) === a.campaignSlug || x.id === a.candidateId);
        if (c && camps.indexOf(c) < 0) camps.push(c);
      });
      const allEmails = all.people.map((p) => p.email).concat(reserved.emails);
      const allPhones = all.people.map((p) => p.phone).concat(reserved.phones);
      camps.forEach((c) => {
        const owner = 'campaign:' + kebab(c.name);
        const K = seedCampaign(s, owner, c, base, { emails: allEmails, phones: allPhones }, t);
        all.people.push(...K.people); all.interactions.push(...K.its);
        const KP = seedPaths(owner, s, base, K.people, K.team, {});
        all.paths.push(...KP.paths); all.pathEntries.push(...KP.entries); all.tasks.push(...KP.tasks);
        L(kebab(c.name) + '-vols', 'Volunteers', { roles: ['volunteer'] }, owner);
        L(kebab(c.name) + '-donors', 'Donors', { roles: ['donor'] }, owner);
        K.people.forEach((p) => { allEmails.push(p.email); allPhones.push(p.phone); });
      });
      // Seeded broadcast counts come from the lists as they stand
      const byOwnerList = (l) => all.people.filter((p) => p.owner === l.owner && matches(p, l.filter));
      all.broadcasts.forEach((b) => {
        const l = all.lists.find((x) => x.id === b.listId);
        const pool = l ? byOwnerList(l) : [];
        const ok = pool.filter((p) => !p.doNotContact && (b.channel === 'email' ? p.email && p.emailOptIn : p.phone && p.smsOptIn));
        b.counts = { sent: ok.length, skippedOptOut: pool.filter((p) => p.doNotContact || (b.channel === 'email' ? p.email && !p.emailOptIn : p.phone && !p.smsOptIn)).length, skippedQuietHours: 0, skippedNoContact: pool.filter((p) => !p.doNotContact && !(b.channel === 'email' ? p.email : p.phone)).length };
      });
      // Write: seeded docs replace older sample docs, saved docs stay
      Object.keys(all).forEach((coll) => {
        const keep = S.list(coll).filter((d) => !d.sample);
        S.set(coll, all[coll].concat(keep));
      });
      S.set('crmMeta', { seeded: SEED_VERSION, at: nowIso() });
    } catch (e) {
      console.error('[crm] seed', e);
    }
    seeding = false;
    return true;
  }
  function seed(slug) { return seedTenant(slug); }

  /* Seed once, ingest new actions and send due scheduled broadcasts. Screens call this on render. */
  function ensure(slug) {
    const s = tenantSlug(slug);
    if (!seeded.has(s)) { seedTenant(s); seeded.add(s); }
    ingest(s);
    runScheduled(s);
  }

  /* ---------------- statewide aggregates ---------------- */
  let statsWatch = false;
  function stats(slug) {
    const s = tenantSlug(slug);
    if (!tenantObj(s)) return null;
    if (remote() && typeof Store.crmStats === 'function') {
      // Counts only, from the crm_stats RPC (cached; refreshed in the background, then the screen redraws).
      if (!statsWatch) { statsWatch = true; Store.on('crmStats', () => { if (App.route && App.route.id === 'master') App.rerender(); }); }
      const v = Store.crmStats(s);
      return v ? Object.assign({}, v) : null;
    }
    ensure(s);
    const all = list('people', s).filter((p) => !p.mergedInto);
    const ppl = all.filter((p) => ownerOf(p) === 'committee');
    const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
    const its = list('interactions', s).filter((x) => ownerOf(x) === 'committee');
    const calls = its.filter((x) => x.type === 'call');
    const sent = scoped('broadcasts', 'committee', s).filter((b) => b.status === 'sent').reduce((n, b) => n + ((b.counts && b.counts.sent) || 0), 0);
    const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
    const campaigns = uniq(all.map((p) => ownerOf(p)).filter(isCampaign));
    return {
      people: ppl.length,
      newThisMonth: ppl.filter((p) => Date.parse(p.createdAt) >= month.getTime()).length,
      volunteers: ppl.filter((p) => (p.roles || []).indexOf('volunteer') >= 0).length,
      donors: ppl.filter((p) => (p.roles || []).indexOf('donor') >= 0).length,
      emailOptInRate: pct(ppl.filter((p) => p.email && p.emailOptIn && !p.doNotContact).length, ppl.length),
      smsOptInRate: pct(ppl.filter((p) => p.phone && p.smsOptIn && !p.doNotContact).length, ppl.length),
      responseRate: pct(calls.filter((x) => x.outcome === 'talked').length, calls.length),
      callsMade: calls.length,
      messagesSent: sent,
      interactions30d: its.filter((x) => daysSince(x.at) <= 30).length,
      campaigns: campaigns.length,
      campaignPeople: all.filter((p) => isCampaign(ownerOf(p))).length,
    };
  }

  /* ---------------- CSV ---------------- */
  function csvCell(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // keeps spreadsheet apps from running it as a formula
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function csv(rows) { return rows.map((r) => r.map(csvCell).join(',')).join('\r\n'); }
  function download(name, text) {
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function peopleCsv(rows, slug) {
    const name = (id) => { const p = id && person(id, slug); return p ? p.name : ''; };
    return csv([['First name', 'Last name', 'Email', 'Phone', 'ZIP', 'City', 'Support', 'Roles', 'Tags', 'Email opt-in', 'Text opt-in', 'Do not contact', 'Point person', 'Last activity', 'Source']]
      .concat(rows.map((p) => [p.firstName, p.lastName, p.email, fmtPhone(p.phone), p.zip, p.city, p.support || '', (p.roles || []).map((r) => ROLE_LABEL[r] || r).join('; '), (p.tags || []).join('; '),
        p.emailOptIn ? 'Yes' : 'No', p.smsOptIn ? 'Yes' : 'No', p.doNotContact ? 'Yes' : 'No', name(p.pointPersonId), String(p.lastActivityAt || '').slice(0, 10), p.source || ''])));
  }

  // Ingest on load, once the app has booted and DATA is in.
  /* Readiness: App.crm.ready resolves (and a 'crm:ready' window event fires) once DATA is in and the seed has run. */
  let readyResolve;
  const ready = new Promise((r) => { readyResolve = r; });
  let isReady = false;
  function boot() {
    if (!window.DATA) { setTimeout(boot, 200); return; }
    try { ensure(); } catch (e) { console.error('[crm] boot', e); }
    isReady = true;
    readyResolve(App.crm);
    try { window.dispatchEvent(new CustomEvent('crm:ready')); } catch (e) { /* ignore */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
  else setTimeout(boot, 0);
  // Keep scheduled broadcasts moving while the app is open.
  setInterval(() => { try { if (window.DATA && seeded.has(tenantSlug())) runScheduled(); } catch (e) { /* ignore */ } }, 60000);

  App.crm = {
    COLLS, SUPPORT, ROLES, ROLE_LABEL, TYPES, CALL_OUTCOMES, QUIET, TZ,
    people, person, upsertPerson, setField, bulkPeople, merge, duplicatesOf, notDuplicate, matches,
    addInteraction, timeline,
    lists, getList, saveList, removeList, runList,
    paths, getPath, savePath, removePath, pathEntries, entriesFor, getEntry, enter, advance, drop, pathSuggestions, activityScore,
    tasks, addTask, updateTask, removeTask, team, me,
    tagLabel, unsubscribeUrl, broadcasts, saveBroadcast, sendBroadcast, cancelBroadcast, runScheduled, audience, footer, mergeFields: merge_, smsSegments, quietHours, inboundText,
    donationTotal, donorWarning,
    callCampaigns, getCallCampaign, saveCallCampaign, callQueue, callProgress, callsFor, logCall,
    petitions, getPetition, savePetition, signatures, petitionCount, petitionUrl,
    share, shares: (slug) => list('shares', slug).slice().sort((a, b) => String(b.at).localeCompare(String(a.at))), campaignOwners,
    ingest, seed, ensure, stats, ready, get isReady() { return isReady; },
    config, setConfig, perms, ownerLabel, ownerSlug, isCampaign, candidateFor, countyName,
    csv, csvCell, peopleCsv, download,
    util: { normEmail, normPhone, fmtPhone, kebab, splitName, isoDay, fmtWhen, fmtTime, daysSince },
  };

  /* ---------------- access guard ----------------
     Every read that returns records is checked against the signed-in user's owner here, at the API,
     so a screen (or the console) can never pull another owner's records. Internal code (ingest, seed,
     sends) uses the unwrapped functions above. */
  (function guard() {
    const C = App.crm;
    const mayRead = (owner) => {
      const u = App.auth && App.auth.user;
      if (!u) return false;
      owner = owner || 'committee';
      if (u.role === 'candidate') return owner === 'campaign:' + u.campaignSlug;
      if (u.role === 'board') return owner === 'committee' || isCampaign(owner);
      if (u.role === 'member') return owner === 'committee';
      return false;   // supporters and the Master Network never read CRM records
    };
    const byOwner = (name, empty) => { const f = C[name]; if (typeof f !== 'function') return; C[name] = function (owner) { return mayRead(owner) ? f.apply(this, arguments) : empty; }; };
    const byDoc = (name, fetch, empty) => { const f = C[name]; if (typeof f !== 'function') return; C[name] = function () { const doc = fetch.apply(null, arguments); return doc && mayRead(ownerOf(doc)) ? f.apply(this, arguments) : empty; }; };
    ['people', 'lists', 'paths', 'tasks', 'broadcasts', 'callCampaigns', 'petitions', 'team'].forEach((n) => byOwner(n, []));
    byOwner('me', null);
    byOwner('audience', { recipients: [], skipped: { optOut: [], noContact: [], quietHours: [], doNotContact: [] }, total: 0, quiet: { ok: true } });
    ['person', 'getList', 'getPath', 'getEntry', 'getCallCampaign'].forEach((n) => { const f = C[n]; C[n] = function () { const r = f.apply(this, arguments); return r && mayRead(ownerOf(r)) ? r : null; }; });
    const personDoc = (id, slug) => list('people', slug).find((p) => p.id === id);
    byDoc('timeline', personDoc, []);
    byDoc('duplicatesOf', personDoc, []);
    byDoc('entriesFor', personDoc, []);
    byDoc('runList', (id, slug) => getList(id, slug), []);
    byDoc('pathEntries', (id, slug) => getPath(id, slug), []);
    byDoc('pathSuggestions', (id, slug) => getPath(id, slug), []);
    byDoc('callQueue', (id, slug) => getCallCampaign(id, slug), []);
    byDoc('callProgress', (id, slug) => getCallCampaign(id, slug), null);
    byDoc('callsFor', (id, slug) => getCallCampaign(id, slug), []);
    byDoc('signatures', (id, slug) => getPetition(id, slug), []);
    const stats0 = C.stats; C.stats = function () { const r = App.auth && App.auth.role; return r === 'master' || r === 'board' || r === 'member' ? stats0.apply(this, arguments) : null; };
    const shares0 = C.shares; C.shares = function () { return mayRead('committee') && perms.share() ? shares0.apply(this, arguments) : []; };
  })();
})();
