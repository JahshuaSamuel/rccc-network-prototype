/* store-supabase.js: window.Store on Supabase (prepared, not wired in; see docs/SUPABASE.md).
   Same API as store.js: get/set/list/add/update/remove/on/global/forTenant/reset/addMany/updateMany.
   Screens call Store synchronously, so this keeps a synchronous in-memory cache per county:
   - hydrate: at startup it pulls every collection the signed-in person may read (RLS decides), in pages;
   - reads come from the cache; writes update the cache at once, fire the usual events, then go to Postgres;
   - realtime: other people's changes arrive over Supabase Realtime and fire {type:'external'} events;
   - offline queue: writes made with no connection wait in localStorage and replay in order.
   It only takes over when RCCC_CONFIG.ACTIVE_BACKEND === 'supabase'. Otherwise store.js stays in charge.
   Load order: config.js, store.js, supabase-js (UMD), this file. No service-role key here or anywhere in the browser.
   Classic script, ES2020. */
(function () {
  'use strict';

  const CFG = window.RCCC_CONFIG || {};
  if (CFG.ACTIVE_BACKEND !== 'supabase') return;
  const Local = window.Store;
  if (!window.supabase || typeof window.supabase.createClient !== 'function' || !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) {
    console.error('[Store] Supabase is configured but supabase-js or the project keys are missing. Staying on browser storage.');
    return;
  }

  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'rccc:sb:auth' },
  });
  window.RCCC_SB = sb;   // shared with auth-supabase.js so REST, RPC and Realtime use one session

  const GLOBAL = 'global';
  const KEY_ID = '__key__';
  const PAGE = 1000;
  const HYDRATE_LIMIT = Number(CFG.HYDRATE_LIMIT) || 20000;
  const BIG = ['people', 'interactions'];                      // hydrated newest first, may be partial
  const LOCAL_ONLY = new Set(['session', 'accounts', 'siteVisitor', 'crmDrawerWidth', 'campaignSignups']);
  const VIRTUAL = new Set(['session', 'accounts']);            // global names served from the Supabase session
  const AGG = { rsvps: 'eventId', signatures: 'petitionId' };  // public totals for people who can't read the rows
  const WITHDRAWABLE = ['rsvps', 'optOuts', 'volunteers'];     // anonymous submissions this browser may cancel (withdraw_submission)
  const LS = {
    queue: 'rccc:sb:queue', policies: 'rccc:sb:policies',
    snap: (t) => 'rccc:sb:snap:' + t, mine: (t, c) => 'rccc:sb:mine:' + t + ':' + c, receipts: 'rccc:sb:receipts',
  };

  /* ---------- small helpers ---------- */
  function clone(v) { if (v === undefined) return undefined; try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; } }
  function same(a, b) { try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; } }
  function lsGet(k, fb) { try { const v = window.localStorage.getItem(k); return v == null ? fb : JSON.parse(v); } catch (e) { return fb; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* quota or private window */ } }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  const newId = Local && Local.newId ? Local.newId : function (coll) {
    const p = String(coll || 'doc').replace(/[^a-z0-9]/gi, '').slice(0, 4).toLowerCase() || 'doc';
    return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  };
  function randomToken() {
    try { const b = new Uint8Array(16); window.crypto.getRandomValues(b); return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); }
    catch (e) { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  }
  function urlTenant() {
    try { const q = new URLSearchParams(location.search); return q.get('tenant') || q.get('county') || 'svgop'; } catch (e) { return 'svgop'; }
  }
  function currentTenant() { const a = window.App; return (a && a.state && a.state.tenant) || urlTenant(); }
  function toast(msg) { try { if (window.App && App.toast) App.toast(msg, 'error'); else console.warn('[Store]', msg); } catch (e) { /* ignore */ } }
  function baseOf(name) { return String(name).split(':')[0]; }
  function isLocalOnly(name) { return LOCAL_ONLY.has(name) || String(name).charAt(0) === '_'; }

  /* ---------- auth state (auth-supabase.js reads it through Store.authState / onAuthState) ---------- */
  let session = null, profile = null;
  const authSubs = new Set();
  function uid() { return (session && session.user && session.user.id) || null; }
  function toAccount(p) {
    if (!p) return null;
    const u = (session && session.user) || {};
    return {
      id: p.id, name: p.name || '', email: p.email || u.email || '', phone: p.phone || '', zip: p.zip || '', role: p.role,
      tenant: p.tenant || null, title: p.title || null, memberId: p.member_id || null, office: p.office || null,
      candidateId: p.candidate_id || null, campaignSlug: p.campaign_slug || null, campaignRole: p.campaign_role || null,
      verified: p.verified || { email: false, phone: false }, sample: false, createdAt: p.created_at,
    };
  }
  async function loadProfile() {
    if (!uid()) { profile = null; return null; }
    const { data, error } = await sb.from('profiles').select('*').eq('id', uid()).maybeSingle();
    if (error) { console.warn('[Store] profile', error.message); return profile; }
    profile = data || { id: uid(), role: 'supporter', tenant: null, name: '' };
    return profile;
  }
  function authSnapshot() { return { session, user: session ? session.user : null, profile: clone(profile), account: toAccount(profile) }; }
  function notifyAuth() {
    const s = authSnapshot();
    authSubs.forEach((fn) => { try { fn(s); } catch (e) { console.error('[Store] auth listener', e); } });
    emit('global', 'session', { type: 'external', name: 'session', tenant: GLOBAL });
    emit('global', 'accounts', { type: 'external', name: 'accounts', tenant: GLOBAL });
  }

  /* ---------- policies (public table; the same rules RLS enforces) ---------- */
  let policies = new Map((lsGet(LS.policies, []) || []).map((p) => [p.coll, p]));
  async function loadPolicies() {
    const { data, error } = await sb.from('coll_policies').select('*');
    if (error) { console.warn('[Store] policies', error.message); return; }
    policies = new Map(data.map((p) => [p.coll, p]));
    lsSet(LS.policies, data);
  }
  const RANK = { public: 0, supporter: 1, candidate: 1, volunteer: 1, member: 2, board: 3, master: 4 };
  const MIN = { public: 0, supporter: 1, member: 2, board: 3, master: 4 };
  const rank = (r) => RANK[r] || 0;
  const minRank = (r) => (r in MIN ? MIN[r] : 99);
  function effRole(tenant) {
    if (!uid()) return 'public';
    const p = profile || { role: 'supporter' };
    if (p.role === 'master') return 'master';
    if (tenant === GLOBAL || tenant === p.tenant) return p.role;
    return 'supporter';
  }
  function policy(tenant, name) {
    const p = policies.get(baseOf(name));
    if (!p) return null;
    if ((p.scope === 'global') !== (tenant === GLOBAL)) return null;
    return p;
  }
  /* Mirrors public.doc_access() in supabase/schema.sql. The server decides; this only avoids doomed writes. */
  function access(op, tenant, name, owner, data, createdBy) {
    const pol = policy(tenant, name);
    if (!pol) return false;
    const r = effRole(tenant), me = uid();
    const slug = profile && profile.role === 'candidate' ? profile.campaign_slug : null;
    const cid = profile && profile.role === 'candidate' ? profile.candidate_id : null;
    const own = owner || 'committee';
    const d = data && typeof data === 'object' ? data : {};
    if (op === 'select' && pol.public_status && pol.public_status.indexOf(d.status != null ? d.status : pol.status_default) >= 0) return true;
    if (pol.crm) {
      if (r === 'candidate') return !!slug && own === 'campaign:' + slug;
      if (r === 'board') return true;
      if (r === 'member') return op === 'select' && own === 'committee';
      return false;
    }
    if (pol.intake && r === 'master') {
      if (op === 'insert') return true;
      return !!(pol.own_rows && me && createdBy === me && (op === 'select' || pol.own_update));
    }
    let cmatch = false;
    if (r === 'candidate' && pol.campaign_ops !== 'none') {
      cmatch = !!pol.map_guard || (!!pol.campaign_field && !!slug && d[pol.campaign_field] === slug) ||
        (!!pol.candidate_field && !!cid && d[pol.candidate_field] === cid);
    }
    if (op === 'select') {
      if (rank(r) >= minRank(pol.read_min)) return true;
      if (pol.intake && r === 'member' && own === 'committee') return true;
      if (pol.intake && r === 'candidate' && slug && own === 'campaign:' + slug) return true;
      if (pol.own_rows && me && createdBy === me) return true;
      return cmatch;
    }
    if (op === 'insert') {
      if (rank(r) >= minRank(pol.write_min) || rank(r) >= minRank(pol.insert_min)) return true;
      return cmatch && pol.campaign_ops === 'write';
    }
    if (rank(r) >= minRank(pol.write_min)) return true;
    if (pol.own_rows && pol.own_update && me && createdBy === me) return true;
    return cmatch && (pol.campaign_ops === 'write' || (pol.campaign_ops === 'update' && op === 'update'));
  }
  /* Could this person read any row of the collection? (decides whether to hydrate it) */
  function mayReadSome(tenant, name) {
    const pol = policy(tenant, name);
    if (!pol) return false;
    const r = effRole(tenant);
    if (pol.public_status) return true;
    if (pol.crm) return r === 'candidate' || r === 'board' || r === 'member';
    if (pol.intake && r === 'master') return !!(pol.own_rows && uid());
    if (rank(r) >= minRank(pol.read_min)) return true;
    if (pol.intake && (r === 'member' || r === 'candidate')) return true;
    if (pol.own_rows && uid()) return true;
    return r === 'candidate' && pol.campaign_ops !== 'none';
  }
  /* Reads every row (no need for the local mirror and the aggregate placeholders). */
  function readsAll(tenant, name) {
    const pol = policy(tenant, name);
    if (!pol) return false;
    const r = effRole(tenant);
    if (pol.crm) return r === 'board';
    if (pol.intake && r === 'master') return false;
    if (rank(r) >= minRank(pol.read_min)) return true;
    return !!pol.intake && r === 'member';
  }
  function ownerOf(tenant, name, id, data) {
    const pol = policy(tenant, name);
    if (!pol) return null;
    const d = data && typeof data === 'object' ? data : {};
    if (pol.crm) {
      if (id === KEY_ID) { const i = String(name).indexOf(':'); return i > 0 ? String(name).slice(i + 1) : 'committee'; }
      return d.owner || 'committee';
    }
    if (pol.intake) {
      const camp = String(d.campaign || '').toLowerCase();
      if (/^[a-z0-9-]{1,80}$/.test(camp)) return 'campaign:' + camp;
      if (baseOf(name) === 'signatures') { const pet = coll(tenant, 'petitions').docs.find((x) => x.id === d.petitionId); return (pet && pet.owner) || 'committee'; }
      return 'committee';
    }
    return null;
  }

  /* ---------- cache ---------- */
  // tenants: Map<tenant, {colls: Map<name,{docs,meta:Map<id,{createdBy,owner}>,status}>, keys: Map<name,{value,exists,meta}>, status, counts}>
  const tenants = new Map();
  function T(tenant) {
    let t = tenants.get(tenant);
    if (!t) { t = { colls: new Map(), keys: new Map(), status: 'none', counts: null, hydrating: null }; tenants.set(tenant, t); }
    return t;
  }
  function coll(tenant, name) {
    const t = T(tenant);
    let c = t.colls.get(name);
    if (!c) { c = { docs: [], meta: new Map(), status: 'none' }; t.colls.set(name, c); }
    return c;
  }
  function docOf(row) {
    const doc = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data : { value: row.data };
    doc.id = row.id;
    return doc;
  }
  function putRow(tenant, row) {
    if (row.id === KEY_ID) { T(tenant).keys.set(row.coll, { value: row.data, exists: true, meta: { createdBy: row.created_by, owner: row.owner } }); return; }
    const c = coll(tenant, row.coll);
    const doc = docOf(row);
    const i = c.docs.findIndex((x) => x && x.id === row.id);
    if (i >= 0) c.docs[i] = doc; else c.docs.push(doc);
    c.meta.set(row.id, { createdBy: row.created_by, owner: row.owner });
  }
  function dropRow(tenant, name, id) {
    if (id === KEY_ID) { T(tenant).keys.delete(name); return; }
    const c = coll(tenant, name);
    const i = c.docs.findIndex((x) => x && x.id === id);
    if (i >= 0) c.docs.splice(i, 1);
    c.meta.delete(id);
  }

  /* ---------- this browser's own submissions, for collections it cannot read back ---------- */
  function mineKey(tenant, name) { return LS.mine(tenant + ':' + (uid() || 'anon'), name); }
  function mine(tenant, name) { return lsGet(mineKey(tenant, name), []) || []; }
  function saveMine(tenant, name, list) { lsSet(mineKey(tenant, name), list.slice(-200)); }
  const receipts = lsGet(LS.receipts, {}) || {};
  function aggregateDocs(tenant, name, mineDocs) {
    const field = AGG[name], counts = T(tenant).counts;
    if (!field || !counts || !counts[name]) return [];
    const at = counts.at || '';
    const out = [];
    Object.keys(counts[name]).forEach((key) => {
      const c = counts[name][key] || {};
      const minePrior = mineDocs.filter((m) => m[field] === key && String(m.createdAt || '') <= at);
      if (name === 'rsvps') {
        const heads = (Number(c.heads) || 0) - minePrior.reduce((a, m) => a + 1 + (Number(m.guests) || 0), 0);
        if (heads > 0) out.push({ id: '_agg:rsvps:' + key, eventId: key, guests: heads - 1, _aggregate: true });
      } else {
        const n = Math.min(10000, (Number(c.docs) || 0) - minePrior.length);
        for (let i = 0; i < n; i++) out.push({ id: '_agg:' + name + ':' + key + ':' + i, [field]: key, _aggregate: true });
      }
    });
    return out;
  }

  /* ---------- events (same shapes as store.js) ---------- */
  const listeners = { scoped: new Map(), global: new Map() };
  function on(kind, name, fn) {
    const m = listeners[kind];
    if (!m.has(name)) m.set(name, new Set());
    m.get(name).add(fn);
    return () => { const s = m.get(name); if (s) s.delete(fn); };
  }
  function emit(kind, name, detail) {
    const fire = (key) => {
      const s = listeners[kind].get(key);
      if (s) Array.from(s).forEach((fn) => { try { fn(detail); } catch (e) { console.error('[Store] listener error', e); } });
    };
    fire(name);
    if (name !== '*') fire('*');
  }
  const kindOf = (tenant) => (tenant === GLOBAL ? 'global' : 'scoped');
  function emitFor(tenant, name, detail) {
    emit(kindOf(tenant), name, Object.assign({ name, tenant }, detail));
  }

  /* ---------- hydration ---------- */
  const COLS = 'tenant,coll,id,owner,data,created_by,created_at,updated_at';
  async function fetchAll(build, limit) {
    const rows = [];
    for (let from = 0; from < limit; from += PAGE) {
      const { data, error } = await build().range(from, Math.min(from + PAGE, limit) - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < PAGE) return { rows, partial: false };
    }
    return { rows, partial: true };
  }
  function snapshotSave(tenant) {
    const t = T(tenant), out = { colls: {}, keys: {}, at: Date.now() };
    t.colls.forEach((c, name) => { const p = policy(tenant, name); if (p && p.snapshot && c.status !== 'none') out.colls[name] = c.docs; });
    t.keys.forEach((k, name) => { const p = policy(tenant, name); if (p && p.snapshot) out.keys[name] = k.value; });
    lsSet(LS.snap(tenant), out);
  }
  function snapshotLoad(tenant) {
    const s = lsGet(LS.snap(tenant), null);
    if (!s) return;
    const t = T(tenant);
    Object.keys(s.colls || {}).forEach((name) => { const c = coll(tenant, name); if (c.status === 'none') { c.docs = s.colls[name] || []; c.status = 'snapshot'; } });
    Object.keys(s.keys || {}).forEach((name) => { if (!t.keys.has(name)) t.keys.set(name, { value: s.keys[name], exists: true, meta: {} }); });
  }
  function hydrate(tenant, force) {
    const t = T(tenant);
    if (t.hydrating && !force) return t.hydrating;
    if (t.status === 'ready' && !force) return Promise.resolve();
    t.status = 'loading';
    t.hydrating = (async () => {
      const names = Array.from(policies.values()).filter((p) => (p.scope === 'global') === (tenant === GLOBAL) && mayReadSome(tenant, p.coll)).map((p) => p.coll);
      const before = new Map();
      names.forEach((n) => before.set(n, JSON.stringify(coll(tenant, n).docs) + '|' + JSON.stringify((t.keys.get(n) || {}).value)));
      const small = names.filter((n) => BIG.indexOf(n) < 0);
      const big = names.filter((n) => BIG.indexOf(n) >= 0);
      const fresh = { colls: new Map(), keys: new Map() };
      const take = (rows) => rows.forEach((row) => {
        const name = row.coll;
        if (row.id === KEY_ID) fresh.keys.set(name, { value: row.data, exists: true, meta: { createdBy: row.created_by, owner: row.owner } });
        else { if (!fresh.colls.has(name)) fresh.colls.set(name, []); fresh.colls.get(name).push(row); }
      });
      try {
        if (small.length) {
          // one paged stream for every small collection (keys like crmConfig:campaign:<slug> included through the base name)
          const r = await fetchAll(() => sb.from('docs').select(COLS).eq('tenant', tenant).not('coll', 'in', '(' + BIG.join(',') + ')').order('coll').order('created_at').order('id'), 200000);
          take(r.rows.filter((row) => small.indexOf(baseOf(row.coll)) >= 0));
        }
        for (const n of big) {
          const r = await fetchAll(() => sb.from('docs').select(COLS).eq('tenant', tenant).eq('coll', n).order('created_at', { ascending: false }).order('id', { ascending: false }), HYDRATE_LIMIT);
          take(r.rows.reverse());
          coll(tenant, n).status = r.partial ? 'partial' : 'ready';
          if (r.partial) console.warn(`[Store] ${tenant}:${n} has more than ${HYDRATE_LIMIT} rows; older rows load on demand (Store.loadMore).`);
        }
        if ((!readsAll(tenant, 'rsvps') || !readsAll(tenant, 'signatures')) && tenant !== GLOBAL) {
          const { data } = await sb.rpc('public_counts', { p_tenant: tenant });
          t.counts = data || null;
        }
      } catch (e) {
        console.warn('[Store] hydrate ' + tenant + ' failed; using what is cached.', e && e.message);
        t.status = 'error'; t.hydrating = null;
        return;
      }
      // Swap in the fresh rows (keeping docs this browser wrote that are still waiting in the queue).
      const pendingIds = new Set(queue.filter((q) => q.tenant === tenant).map((q) => q.coll + ':' + q.id));
      names.forEach((n) => {
        const c = coll(tenant, n);
        const rows = fresh.colls.get(n) || [];
        const keep = c.docs.filter((d) => d && pendingIds.has(n + ':' + d.id) && !rows.some((r) => r.id === d.id));
        c.docs = rows.map(docOf).concat(keep);
        c.meta = new Map(rows.map((row) => [row.id, { createdBy: row.created_by, owner: row.owner }]));
        if (c.status !== 'partial') c.status = 'ready';
      });
      Array.from(t.keys.keys()).forEach((k) => { if (names.indexOf(baseOf(k)) >= 0 && !fresh.keys.has(k) && !pendingIds.has(k + ':' + KEY_ID)) t.keys.delete(k); });
      fresh.keys.forEach((v, k) => t.keys.set(k, v));
      t.status = 'ready'; t.hydrating = null;
      snapshotSave(tenant);
      names.forEach((n) => {
        if (before.get(n) !== JSON.stringify(coll(tenant, n).docs) + '|' + JSON.stringify((t.keys.get(n) || {}).value)) emitFor(tenant, n, { type: 'external' });
      });
      emitFor(tenant, 'hydrated', { type: 'hydrated' });
    })();
    return t.hydrating;
  }
  function ensureTenant(tenant) {
    const t = T(tenant);
    if (t.status === 'none') { snapshotLoad(tenant); if (bootDone) { hydrate(tenant); subscribe(tenant); } }
  }

  /* ---------- realtime ---------- */
  const channels = new Map();
  function subscribe(tenant) {
    if (channels.has(tenant)) return;
    const ch = sb.channel('docs:' + tenant)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'tenant=eq.' + tenant }, (p) => onChange(tenant, p))
      .subscribe((status) => { if (status === 'SUBSCRIBED') flush(); });
    channels.set(tenant, ch);
  }
  function unsubscribeAll() { channels.forEach((ch) => { try { sb.removeChannel(ch); } catch (e) { /* ignore */ } }); channels.clear(); }
  function onChange(tenant, p) {
    const row = p.new && p.new.coll ? p.new : null;
    const old = p.old || {};
    if (p.eventType === 'DELETE') {
      if (old.tenant && old.tenant !== tenant) return;
      const name = old.coll; if (!name) return;
      const had = old.id === KEY_ID ? T(tenant).keys.has(name) : coll(tenant, name).docs.some((d) => d && d.id === old.id);
      if (!had) return;
      dropRow(tenant, name, old.id);
      emitFor(tenant, name, { type: 'external', id: old.id });
      return;
    }
    if (!row || row.tenant !== tenant) return;
    if (row.id === KEY_ID) {
      const cur = T(tenant).keys.get(row.coll);
      if (cur && same(cur.value, row.data)) return;
      putRow(tenant, row);
      emitFor(tenant, row.coll, { type: 'external', value: clone(row.data) });
      return;
    }
    const cur = coll(tenant, row.coll).docs.find((d) => d && d.id === row.id);
    if (cur && same(cur, row.data)) return;
    putRow(tenant, row);
    emitFor(tenant, row.coll, { type: 'external', doc: clone(row.data) });
  }

  /* ---------- write queue (offline-safe, in order) ---------- */
  let queue = (lsGet(LS.queue, []) || []).filter((q) => q && q.op);
  let flushing = false, retryTimer = 0, backoff = 1000;
  function persistQueue() { lsSet(LS.queue, queue); }
  function enqueue(item) {
    item.uid = uid(); item.at = Date.now();
    queue.push(item); persistQueue();
    Promise.resolve().then(flush);
  }
  function isNetworkError(err) {
    if (!err) return false;
    const m = String(err.message || err);
    return err.status === 0 || err.status >= 500 || /Failed to fetch|NetworkError|Load failed|network|timeout/i.test(m) || (typeof navigator !== 'undefined' && navigator.onLine === false);
  }
  async function run(item) {
    const base = { tenant: item.tenant, coll: item.coll };
    switch (item.op) {
      case 'insert': {
        const rows = item.rows.map((r) => Object.assign({}, base, { id: r.id, data: r.data }));
        const { error } = await sb.from('docs').insert(rows);
        return error;
      }
      case 'upsert': {
        const rows = item.rows.map((r) => Object.assign({}, base, { id: r.id, data: r.data }));
        const { error } = await sb.from('docs').upsert(rows, { onConflict: 'tenant,coll,id' });
        return error;
      }
      case 'patch': {
        const { data, error } = await sb.rpc('doc_patch', { p_tenant: item.tenant, p_coll: item.coll, p_id: item.id, p_patch: item.patch });
        if (error) return error;
        if (data == null) return { message: 'not allowed or not found', code: 'RLS0' };
        return null;
      }
      case 'patchMany': {
        const { error } = await sb.rpc('doc_patch_many', { p_tenant: item.tenant, p_coll: item.coll, p_patches: item.patches });
        return error;
      }
      case 'delete': {
        const { error, count } = await sb.from('docs').delete({ count: 'exact' }).eq('tenant', item.tenant).eq('coll', item.coll).in('id', item.ids);
        if (error) return error;
        if (!count && item.ids.length) return { message: 'not allowed or not found', code: 'RLS0' };
        return null;
      }
      case 'withdraw': {
        const { data, error } = await sb.rpc('withdraw_submission', { p_tenant: item.tenant, p_coll: item.coll, p_id: item.id, p_receipt: item.receipt });
        if (error) return error;
        return data ? null : { message: 'This can no longer be undone here.', code: 'RLS0' };
      }
      default: return null;
    }
  }
  async function flush() {
    if (flushing || !queue.length || !bootDone) return;
    flushing = true;
    clearTimeout(retryTimer);
    try {
      while (queue.length) {
        const item = queue[0];
        if (item.uid !== uid() && item.op !== 'withdraw' && item.uid) { queue.shift(); persistQueue(); continue; }   // another account's write
        let err = null;
        try { err = await run(item); } catch (e) { err = e; }
        if (err && isNetworkError(err)) {
          retryTimer = setTimeout(flush, backoff); backoff = Math.min(backoff * 2, 60000);
          break;
        }
        queue.shift(); persistQueue(); backoff = 1000;
        if (err) rejected(item, err);
      }
    } finally { flushing = false; }
  }
  async function rejected(item, err) {
    console.warn('[Store] write rejected', item.op, item.tenant + ':' + item.coll, err && (err.message || err));
    const msg = String((err && err.message) || '');
    toast(/row-level security|not allowed|RLS0|42501|permission/i.test(msg)
      ? 'That change didn\'t save because this account can\'t make it.'
      : 'That change didn\'t save: ' + msg.replace(/^.*?:\s*/, '').slice(0, 140));
    // Reload the affected rows from the server so the screen shows the truth.
    const ids = item.ids || (item.rows ? item.rows.map((r) => r.id) : item.patches ? Object.keys(item.patches) : [item.id]);
    try {
      const { data } = await sb.from('docs').select(COLS).eq('tenant', item.tenant).eq('coll', item.coll).in('id', ids);
      const found = new Set((data || []).map((r) => r.id));
      ids.forEach((id) => { if (!found.has(id)) dropRow(item.tenant, item.coll, id); });
      (data || []).forEach((row) => putRow(item.tenant, row));
    } catch (e) { /* offline again: the next hydrate fixes it */ }
    emitFor(item.tenant, item.coll, { type: 'external' });
  }
  window.addEventListener('online', () => { backoff = 1000; flush(); });
  setInterval(() => { if (queue.length) flush(); }, 30000);

  /* ---------- the Store API ---------- */
  function makeApi(tenantFn, localApi) {
    const kind = () => kindOf(tenantFn());
    const evt = (type, name, extra) => Object.assign({ type, name, tenant: tenantFn() }, extra);
    const isColl = (tenant, name) => { const p = policy(tenant, name); return !!p && p.kind === 'coll'; };
    const stamp = (coll_, doc, now, me) => {
      const d = Object.assign({}, clone(doc || {}));
      if (!d.id) d.id = newId(coll_);
      if (!d.createdAt) d.createdAt = now;
      if (!('createdBy' in d)) d.createdBy = me;
      return d;
    };
    function deny(op, tenant, name) {
      console.debug('[Store] skipped ' + op + ' on ' + tenant + ':' + name + ' (this account cannot write it)');
    }
    function listOf(tenant, name) {
      ensureTenant(tenant);
      const docs = coll(tenant, name).docs.slice();
      const pol = policy(tenant, name);
      if (readsAll(tenant, name) || !pol || !(pol.own_rows || AGG[name])) return docs;
      const mineDocs = mine(tenant, name).filter((m) => !docs.some((d) => d.id === m.id));
      return docs.concat(mineDocs, aggregateDocs(tenant, name, mineDocs.concat(docs.filter((d) => d.createdBy && d.createdBy === uid()))));
    }

    const api = {
      get(name, fallback) {
        const tenant = tenantFn();
        const fb = fallback === undefined ? null : fallback;
        if (tenant === GLOBAL && VIRTUAL.has(name)) {
          if (name === 'session') return uid() ? { userId: uid(), at: session && session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null } : clone(fb);
          return clone(fb);
        }
        if (isLocalOnly(name)) return localApi.get(name, fallback);
        if (name === 'crmIngest') {
          // The server ingests public actions (crm_ingest_row). Tell crm.js every action is already in.
          const k = T(tenant).keys.get(name);
          const target = Object.assign({}, (k && k.value) || {});
          return new Proxy(target, {
            has: () => true,
            getOwnPropertyDescriptor: (t, p) => Reflect.getOwnPropertyDescriptor(t, p) || { value: null, writable: true, enumerable: false, configurable: true },
          });
        }
        ensureTenant(tenant);
        const k = T(tenant).keys.get(name);
        if (name === 'crmMeta' && !k && !mayReadSome(tenant, name)) return { seeded: 1e9, serverOwned: true };   // no client seeding without CRM access
        return k && k.exists ? clone(k.value) : clone(fb);
      },
      set(name, value) {
        const tenant = tenantFn();
        if (tenant === GLOBAL && VIRTUAL.has(name)) return clone(value);
        if (isLocalOnly(name)) return localApi.set(name, value);
        if (name === 'crmIngest') return clone(value);   // server-owned
        ensureTenant(tenant);
        if (isColl(tenant, name) && Array.isArray(value)) return replaceColl(tenant, name, value);
        const pol = policy(tenant, name);
        const owner = ownerOf(tenant, name, KEY_ID, value);
        const exists = T(tenant).keys.has(name);
        if (!pol || !access(exists ? 'update' : 'insert', tenant, name, owner, value, null)) { deny('set', tenant, name); return clone(value); }
        if (value === undefined || value === null) {
          T(tenant).keys.set(name, { value: null, exists: true, meta: {} });
          if (exists) enqueue({ op: 'delete', tenant, coll: name, ids: [KEY_ID] });
        } else {
          T(tenant).keys.set(name, { value: clone(value), exists: true, meta: { owner } });
          enqueue({ op: 'upsert', tenant, coll: name, rows: [{ id: KEY_ID, data: clone(value) }] });
        }
        emit(kind(), name, evt('set', name, { value: clone(value) }));
        return clone(value);
      },
      list(name) {
        const tenant = tenantFn();
        if (tenant === GLOBAL && name === 'accounts') return profile ? [toAccount(profile)] : [];
        if (isLocalOnly(name)) return localApi.list(name);
        return clone(listOf(tenant, name));
      },
      add(name, doc) {
        const tenant = tenantFn();
        if (isLocalOnly(name) || (tenant === GLOBAL && VIRTUAL.has(name))) return VIRTUAL.has(name) ? clone(doc) : localApi.add(name, doc);
        return api.addMany(name, [doc], true)[0] || null;
      },
      /* One request and one {type:'addMany'} event for the whole batch (single adds fire {type:'add'}). */
      addMany(name, docs, single) {
        const tenant = tenantFn();
        const list = Array.isArray(docs) ? docs : [];
        if (!list.length) return [];
        if (isLocalOnly(name)) return localApi.addMany ? localApi.addMany(name, docs) : list.map((d) => localApi.add(name, d));
        ensureTenant(tenant);
        const now = new Date().toISOString(), me = uid();
        const saved = list.map((d) => stamp(name, d, now, me));
        const ok = saved.filter((d) => access('insert', tenant, name, ownerOf(tenant, name, d.id, d), d, me));
        if (ok.length < saved.length) deny('add', tenant, name);
        if (!ok.length) return clone(saved);
        const c = coll(tenant, name);
        const all = readsAll(tenant, name);
        const anon = !me;
        const rows = ok.map((d) => {
          const data = clone(d);
          if (anon && WITHDRAWABLE.indexOf(name) >= 0) {
            const r = randomToken(); receipts[tenant + ':' + name + ':' + d.id] = r; data._receipt = r;
          }
          return { id: d.id, data };
        });
        lsSet(LS.receipts, receipts);
        ok.forEach((d) => { c.docs.push(clone(d)); c.meta.set(d.id, { createdBy: me, owner: ownerOf(tenant, name, d.id, d) }); });
        if (!all) saveMine(tenant, name, mine(tenant, name).concat(clone(ok)));
        enqueue({ op: 'insert', tenant, coll: name, rows });
        if (single) emit(kind(), name, evt('add', name, { doc: clone(ok[0]) }));
        else emit(kind(), name, evt('addMany', name, { docs: clone(ok) }));
        return clone(ok);
      },
      update(name, id, patch) {
        const tenant = tenantFn();
        if (isLocalOnly(name)) return localApi.update(name, id, patch);
        const r = api.updateMany(name, { [id]: patch }, true);
        return r[0] || null;
      },
      /* patches is {id: patch}. One request and one {type:'updateMany', ids} event; unknown ids are skipped. */
      updateMany(name, patches, single) {
        const tenant = tenantFn();
        if (isLocalOnly(name)) return localApi.updateMany ? localApi.updateMany(name, patches) : [];
        ensureTenant(tenant);
        const c = coll(tenant, name);
        const now = new Date().toISOString();
        const out = [], sent = {};
        Object.keys(patches || {}).forEach((id) => {
          let i = c.docs.findIndex((d) => d && String(d.id) === String(id));
          let inMine = false;
          let cur = i >= 0 ? c.docs[i] : null;
          if (!cur) { const m = mine(tenant, name); const j = m.findIndex((d) => String(d.id) === String(id)); if (j >= 0) { cur = m[j]; inMine = true; } }
          if (!cur) return;
          const meta = c.meta.get(cur.id) || { createdBy: cur.createdBy, owner: ownerOf(tenant, name, cur.id, cur) };
          const p = Object.assign({}, clone(patches[id] || {}), { updatedAt: now });
          delete p.id;
          const next = Object.assign({}, cur, p, { id: cur.id });
          if (!access('update', tenant, name, meta.owner, cur, meta.createdBy) || !access('update', tenant, name, ownerOf(tenant, name, cur.id, next), next, meta.createdBy)) {
            deny('update', tenant, name); return;
          }
          if (inMine) { const m = mine(tenant, name).map((d) => (d.id === cur.id ? next : d)); saveMine(tenant, name, m); }
          else c.docs[i] = next;
          sent[cur.id] = p; out.push(clone(next));
        });
        const ids = Object.keys(sent);
        if (!ids.length) return [];
        if (ids.length === 1) enqueue({ op: 'patch', tenant, coll: name, id: ids[0], patch: sent[ids[0]] });
        else enqueue({ op: 'patchMany', tenant, coll: name, patches: sent });
        if (single) emit(kind(), name, evt('update', name, { doc: clone(out[0]) }));
        else emit(kind(), name, evt('updateMany', name, { ids: out.map((d) => d.id) }));
        return out;
      },
      remove(name, id) {
        const tenant = tenantFn();
        if (isLocalOnly(name)) return localApi.remove(name, id);
        ensureTenant(tenant);
        const c = coll(tenant, name);
        const i = c.docs.findIndex((d) => d && d.id === id);
        const m = mine(tenant, name);
        const j = m.findIndex((d) => d.id === id);
        if (i < 0 && j < 0) return false;
        const cur = i >= 0 ? c.docs[i] : m[j];
        const meta = c.meta.get(id) || { createdBy: cur.createdBy, owner: ownerOf(tenant, name, id, cur) };
        const rkey = tenant + ':' + name + ':' + id;
        if (!uid() && receipts[rkey]) {
          enqueue({ op: 'withdraw', tenant, coll: name, id, receipt: receipts[rkey] });
          delete receipts[rkey]; lsSet(LS.receipts, receipts);
        } else if (access('delete', tenant, name, meta.owner, cur, meta.createdBy)) {
          enqueue({ op: 'delete', tenant, coll: name, ids: [id] });
        } else { deny('remove', tenant, name); return false; }
        if (i >= 0) { c.docs.splice(i, 1); c.meta.delete(id); }
        if (j >= 0) { m.splice(j, 1); saveMine(tenant, name, m); }
        emit(kind(), name, evt('remove', name, { id }));
        return true;
      },
      on(name, fn) { return on(kindOf(tenantFn()), name, fn); },
    };

    /* Store.set(collection, array), used by crm.js seeding and bulk edits: upsert what changed, delete what is gone.
       A partially loaded collection never deletes rows it has not seen. */
    function replaceColl(tenant, name, value) {
      const c = coll(tenant, name);
      const now = new Date().toISOString(), me = uid();
      const next = value.map((d) => stamp(name, d, now, me));
      const prev = new Map(c.docs.map((d) => [d.id, d]));
      const changed = next.filter((d) => !same(prev.get(d.id), d));
      const allowed = changed.filter((d) => access(prev.has(d.id) ? 'update' : 'insert', tenant, name, ownerOf(tenant, name, d.id, d), d, (c.meta.get(d.id) || {}).createdBy || me));
      const nextIds = new Set(next.map((d) => d.id));
      const gone = c.status === 'partial' ? [] : c.docs.filter((d) => !nextIds.has(d.id) && access('delete', tenant, name, (c.meta.get(d.id) || {}).owner, d, (c.meta.get(d.id) || {}).createdBy)).map((d) => d.id);
      if (allowed.length < changed.length) deny('set', tenant, name);
      const allowedIds = new Set(allowed.map((d) => d.id));
      const goneIds = new Set(gone);
      c.docs = c.docs.filter((d) => !goneIds.has(d.id)).map((d) => (allowedIds.has(d.id) ? clone(allowed.find((x) => x.id === d.id)) : d));
      allowed.forEach((d) => { if (!prev.has(d.id)) { c.docs.push(clone(d)); c.meta.set(d.id, { createdBy: me, owner: ownerOf(tenant, name, d.id, d) }); } });
      for (let i = 0; i < allowed.length; i += 500) enqueue({ op: 'upsert', tenant, coll: name, rows: allowed.slice(i, i + 500).map((d) => ({ id: d.id, data: clone(d) })) });
      if (gone.length) enqueue({ op: 'delete', tenant, coll: name, ids: gone });
      emit(kindOf(tenant), name, { type: 'set', name, tenant, value: clone(c.docs) });
      return clone(c.docs);
    }
    return api;
  }

  const Store = makeApi(currentTenant, Local);
  Store.global = makeApi(() => GLOBAL, Local.global);
  Store.forTenant = (slug) => makeApi(() => String(slug || currentTenant()), Local.forTenant ? Local.forTenant(slug) : Local);

  /* "Reset sample data" never touches the server here: it clears this browser's cache and reloads it. */
  Store.reset = function () {
    tenants.forEach((t, slug) => lsDel(LS.snap(slug)));
    tenants.clear();
    emit('scoped', 'reset', { type: 'reset', name: 'reset' });
    emit('global', 'reset', { type: 'reset', name: 'reset' });
    return Promise.all([hydrate(currentTenant(), true), hydrate(GLOBAL, true)]);
  };
  Store.persistent = true;
  Store.backend = 'supabase';
  Store.newId = newId;
  Store.client = sb;
  Store.local = Local;

  /* ---------- extras (new; screens keep working without them) ---------- */
  Store.status = () => ({ queued: queue.length, online: typeof navigator === 'undefined' ? true : navigator.onLine, tenants: Array.from(tenants.keys()).map((k) => ({ tenant: k, status: T(k).status })) });
  Store.authState = authSnapshot;
  Store.onAuthState = (fn) => { authSubs.add(fn); return () => authSubs.delete(fn); };
  Store.refreshProfile = async () => { await loadProfile(); notifyAuth(); return clone(profile); };
  Store.rpc = async (fn, args) => { const { data, error } = await sb.rpc(fn, args || {}); if (error) throw error; return data; };
  Store.invoke = async (fn, body) => {
    const { data, error } = await sb.functions.invoke(fn, { body: body || {} });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* not json */ }
      throw new Error(msg);
    }
    return data;
  };
  /* Public totals without personal data. count('rsvps','eventId') -> {eventId: heads}; count('signatures','petitionId') -> {id: n}. */
  Store.count = (name, field, slug) => {
    const tenant = slug || currentTenant();
    if (readsAll(tenant, name)) {
      const out = {};
      coll(tenant, name).docs.forEach((d) => { const k = d[field]; if (k == null) return; out[k] = (out[k] || 0) + (name === 'rsvps' ? 1 + (Number(d.guests) || 0) : 1); });
      return out;
    }
    const c = (T(tenant).counts || {})[name] || {};
    const out = {};
    Object.keys(c).forEach((k) => { out[k] = name === 'rsvps' ? Number(c[k].heads) || 0 : Number(c[k].docs) || 0; });
    mine(tenant, name).forEach((m) => { if (String(m.createdAt || '') > String((T(tenant).counts || {}).at || '')) out[m[field]] = (out[m[field]] || 0) + (name === 'rsvps' ? 1 + (Number(m.guests) || 0) : 1); });
    return out;
  };
  /* Statewide aggregates for Master Network (crm_stats RPC). Sync: returns the cached value and refreshes it. */
  const stats = new Map();
  Store.crmStats = (slug) => {
    const s = slug || currentTenant();
    const hit = stats.get(s);
    if (!hit || Date.now() - hit.at > 60000) {
      stats.set(s, { at: Date.now(), value: hit ? hit.value : null });
      sb.rpc('crm_stats', { p_tenant: s }).then(({ data }) => { stats.set(s, { at: Date.now(), value: data }); emitFor(s, 'crmStats', { type: 'external' }); });
    }
    return hit ? clone(hit.value) : null;
  };
  Store.purgeSample = (slug) => Store.rpc('purge_sample', { p_tenant: slug || currentTenant() }).then((n) => { hydrate(slug || currentTenant(), true); return n; });
  /* Pull rows newer than `since` (ISO) for a big collection, or the next older page. */
  Store.hydrate = async (name, opts) => {
    const tenant = (opts && opts.tenant) || currentTenant();
    let q = sb.from('docs').select(COLS).eq('tenant', tenant).eq('coll', name).order('created_at').limit(PAGE * 5);
    if (opts && opts.since) q = q.gte('created_at', opts.since);
    const { data, error } = await q;
    if (error) throw error;
    data.forEach((row) => putRow(tenant, row));
    emitFor(tenant, name, { type: 'external' });
    return data.length;
  };
  Store.loadMore = async (name, slug) => {
    const tenant = slug || currentTenant();
    const c = coll(tenant, name);
    const oldest = c.docs.reduce((a, d) => (!a || String(d.createdAt) < a ? String(d.createdAt) : a), '');
    let q = sb.from('docs').select(COLS).eq('tenant', tenant).eq('coll', name).order('created_at', { ascending: false }).limit(PAGE);
    if (oldest) q = q.lt('created_at', oldest);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data.slice().reverse();
    c.docs = rows.map((r) => Object.assign({}, r.data, { id: r.id })).concat(c.docs);
    rows.forEach((r) => c.meta.set(r.id, { createdBy: r.created_by, owner: r.owner }));
    if (data.length < PAGE) c.status = 'ready';
    emitFor(tenant, name, { type: 'external' });
    return data.length;
  };
  /* Optional import of a localStorage dump (docs/SUPABASE.md 5.2). Goes through the normal write path. */
  Store.importLocal = async (dump, opts) => {
    const o = opts || {};
    const tenant = o.tenant || currentTenant();
    await hydrate(tenant);
    const S = Store.forTenant(tenant), out = {};
    Object.keys(dump || {}).forEach((k) => {
      const m = /^rccc:v1:([^:]+):(.+)$/.exec(k);
      if (!m || m[1] !== tenant) return;
      const name = m[2];
      if (isLocalOnly(name) || name === 'crmIngest' || name === 'crmMeta' || !policy(tenant, name)) { out[name] = 'skipped'; return; }
      let v; try { v = JSON.parse(dump[k]); } catch (e) { out[name] = 'unreadable'; return; }
      if (Array.isArray(v) && policy(tenant, name).kind === 'coll') {
        const have = new Set(coll(tenant, name).docs.map((d) => d.id));
        const docs = v.filter((d) => d && !d.sample && !have.has(d.id));
        out[name] = docs.length + ' new';
        if (!o.dryRun && docs.length) for (let i = 0; i < docs.length; i += 500) S.addMany(name, docs.slice(i, i + 500));
      } else if (v && typeof v === 'object' && !v.sample) {
        out[name] = 'key';
        if (!o.dryRun) S.set(name, v);
      } else out[name] = 'skipped';
    });
    console.table(out);
    return out;
  };

  /* ---------- boot ---------- */
  let bootDone = false;
  const bootTenant = urlTenant();
  snapshotLoad(bootTenant);
  snapshotLoad(GLOBAL);
  let lastAuthKey = '';
  async function onAuth(nextSession) {
    session = nextSession || null;
    await loadProfile();
    const key = (uid() || 'anon') + ':' + (profile ? [profile.role, profile.tenant, profile.campaign_slug].join(',') : '');
    const changed = key !== lastAuthKey;
    lastAuthKey = key;
    if (changed && bootDone) {
      // Access changed: drop everything this account may no longer read, then reload.
      unsubscribeAll();
      const slugs = Array.from(tenants.keys());
      tenants.clear();
      slugs.forEach((s) => { snapshotLoad(s); });
      await Promise.all(slugs.map((s) => hydrate(s, true)));
      slugs.forEach(subscribe);
      if (!uid()) { queue = queue.filter((q) => !q.uid); persistQueue(); }
    }
    notifyAuth();
    flush();
  }
  const boot = (async () => {
    const [{ data }] = await Promise.all([sb.auth.getSession(), loadPolicies()]);
    session = (data && data.session) || null;
    await loadProfile();
    lastAuthKey = (uid() || 'anon') + ':' + (profile ? [profile.role, profile.tenant, profile.campaign_slug].join(',') : '');
    await Promise.all([hydrate(bootTenant), hydrate(GLOBAL)]);
    bootDone = true;
    subscribe(bootTenant); subscribe(GLOBAL);
    notifyAuth();
    flush();
    sb.auth.onAuthStateChange((event, s) => {
      if (event === 'INITIAL_SESSION') return;
      if (event === 'TOKEN_REFRESHED') { session = s; return; }
      setTimeout(() => onAuth(s), 0);   // outside the auth callback (supabase-js deadlock guidance)
    });
  })().catch((e) => { console.error('[Store] boot', e); bootDone = true; });
  Store.ready = Promise.race([boot, new Promise((r) => setTimeout(r, 8000))]).then(() => {
    emit('scoped', 'hydrated', { type: 'hydrated', name: 'hydrated', tenant: currentTenant() });
    emit('global', 'hydrated', { type: 'hydrated', name: 'hydrated', tenant: GLOBAL });
    return Store;
  });

  window.Store = Store;
})();
