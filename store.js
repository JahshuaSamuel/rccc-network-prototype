/* store.js: window.Store, the shared data layer.
   Tenant-scoped JSON values and collections, persisted to localStorage today.
   Every key is namespaced as rccc:v1:<tenant>:<name> (global data uses the tenant slot "global").
   Every storage access is wrapped in try/catch with an in-memory fallback, so private windows work.
   Reads return deep clones, so callers can never mutate what is stored.
   Classic script, ES2020, no dependencies. Swap the four raw* functions for a hosted database later. */
(function () {
  'use strict';

  const PREFIX = 'rccc:v1:';
  const GLOBAL = 'global';
  const mem = new Map();          // fallback store (and write-through cache) of raw JSON strings
  let ls = null;
  try {
    ls = window.localStorage;
    const probe = PREFIX + '__probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
  } catch (e) { ls = null; }

  /* ---------- raw storage ---------- */
  function rawGet(k) {
    if (mem.has(k)) return mem.get(k);
    if (ls) { try { const v = ls.getItem(k); if (v !== null) { mem.set(k, v); return v; } } catch (e) { /* ignore */ } }
    return null;
  }
  function rawSet(k, v) {
    mem.set(k, v);
    if (ls) { try { ls.setItem(k, v); } catch (e) { /* quota or blocked: memory keeps it */ } }
  }
  function rawRemove(k) {
    mem.delete(k);
    if (ls) { try { ls.removeItem(k); } catch (e) { /* ignore */ } }
  }
  function rawKeys() {
    const out = new Set(mem.keys());
    if (ls) {
      try { for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.indexOf(PREFIX) === 0) out.add(k); } }
      catch (e) { /* ignore */ }
    }
    return Array.from(out).filter((k) => k.indexOf(PREFIX) === 0);
  }

  function parse(str, fallback) {
    if (str == null) return clone(fallback);
    try { return JSON.parse(str); } catch (e) { return clone(fallback); }
  }
  function clone(v) {
    if (v === undefined) return undefined;
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }

  function currentTenant() {
    const a = window.App;
    return (a && a.state && a.state.tenant) || 'svgop';
  }
  function currentUserId() {
    const a = window.App;
    return (a && a.auth && a.auth.user && a.auth.user.id) || null;
  }
  function newId(coll) {
    let r = '';
    try {
      const b = new Uint8Array(6);
      window.crypto.getRandomValues(b);
      r = Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 8);
    } catch (e) { r = Math.random().toString(36).slice(2, 10); }
    const p = String(coll || 'doc').replace(/[^a-z0-9]/gi, '').slice(0, 4).toLowerCase() || 'doc';
    return p + '_' + Date.now().toString(36) + r;
  }

  /* ---------- events ---------- */
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
    fire('*');
  }

  /* ---------- API factory ---------- */
  function makeApi(kind, tenantFn) {
    const key = (name) => PREFIX + tenantFn() + ':' + name;
    const detail = (type, name, extra) => Object.assign({ type, name, tenant: tenantFn() }, extra);

    const api = {
      get(name, fallback) { return parse(rawGet(key(name)), fallback === undefined ? null : fallback); },
      set(name, value) {
        rawSet(key(name), JSON.stringify(value === undefined ? null : value));
        emit(kind, name, detail('set', name, { value: clone(value) }));
        return clone(value);
      },
      list(coll) {
        const v = parse(rawGet(key(coll)), []);
        return Array.isArray(v) ? v : [];
      },
      add(coll, doc) {
        const all = api.list(coll);
        const saved = Object.assign({}, clone(doc || {}));
        if (!saved.id) saved.id = newId(coll);
        if (!saved.createdAt) saved.createdAt = new Date().toISOString();
        if (!('createdBy' in saved)) saved.createdBy = currentUserId();
        all.push(saved);
        rawSet(key(coll), JSON.stringify(all));
        emit(kind, coll, detail('add', coll, { doc: clone(saved) }));
        return clone(saved);
      },
      /* One storage write and one {type:'addMany', name, docs} event for the whole batch. */
      addMany(coll, docs) {
        const list = Array.isArray(docs) ? docs : [];
        if (!list.length) return [];
        const all = api.list(coll);
        const uid = currentUserId(), now = new Date().toISOString();
        const saved = list.map((doc) => {
          const d = Object.assign({}, clone(doc || {}));
          if (!d.id) d.id = newId(coll);
          if (!d.createdAt) d.createdAt = now;
          if (!('createdBy' in d)) d.createdBy = uid;
          all.push(d);
          return d;
        });
        rawSet(key(coll), JSON.stringify(all));
        emit(kind, coll, detail('addMany', coll, { docs: clone(saved) }));
        return clone(saved);
      },
      /* patches is {id: patch, ...}. One write and one {type:'updateMany', name, ids} event; unknown ids are skipped. */
      updateMany(coll, patches) {
        const ids = Object.keys(patches || {});
        if (!ids.length) return [];
        const all = api.list(coll);
        const now = new Date().toISOString();
        const idx = new Map();
        all.forEach((d, i) => { if (d && d.id != null) idx.set(String(d.id), i); });
        const done = [], out = [];
        ids.forEach((id) => {
          const i = idx.get(String(id));
          if (i == null) return;
          all[i] = Object.assign({}, all[i], clone(patches[id] || {}), { id: all[i].id, updatedAt: now });
          done.push(all[i].id); out.push(all[i]);
        });
        if (!done.length) return [];
        rawSet(key(coll), JSON.stringify(all));
        emit(kind, coll, detail('updateMany', coll, { ids: done }));
        return clone(out);
      },
      update(coll, id, patch) {
        const all = api.list(coll);
        const i = all.findIndex((d) => d && d.id === id);
        if (i < 0) return null;
        all[i] = Object.assign({}, all[i], clone(patch || {}), { id, updatedAt: new Date().toISOString() });
        rawSet(key(coll), JSON.stringify(all));
        emit(kind, coll, detail('update', coll, { doc: clone(all[i]) }));
        return clone(all[i]);
      },
      remove(coll, id) {
        const all = api.list(coll);
        const next = all.filter((d) => !(d && d.id === id));
        if (next.length === all.length) return false;
        rawSet(key(coll), JSON.stringify(next));
        emit(kind, coll, detail('remove', coll, { id }));
        return true;
      },
      on(name, fn) { return on(kind, name, fn); },
    };
    return api;
  }

  const Store = makeApi('scoped', currentTenant);
  Store.global = makeApi('global', () => GLOBAL);
  /* Read or write another county's data explicitly (e.g. the Master Network console). */
  Store.forTenant = (slug) => makeApi('scoped', () => String(slug || currentTenant()));

  /* Clears saved data for every county. Accounts and the current session (global) stay
     unless { all: true } is passed. Fires a "reset" event on both scopes. */
  Store.reset = function (opts) {
    const all = !!(opts && opts.all);
    rawKeys().forEach((k) => {
      if (!all && k.indexOf(PREFIX + GLOBAL + ':') === 0) return;
      rawRemove(k);
    });
    emit('scoped', 'reset', { type: 'reset', name: 'reset' });
    emit('global', 'reset', { type: 'reset', name: 'reset' });
  };
  Store.persistent = !!ls;
  Store.newId = newId;

  /* Another tab changed something: let listeners refresh. */
  window.addEventListener('storage', (e) => {
    if (!e.key || e.key.indexOf(PREFIX) !== 0) return;
    mem.delete(e.key);
    const rest = e.key.slice(PREFIX.length);
    const sep = rest.indexOf(':');
    const scope = rest.slice(0, sep), name = rest.slice(sep + 1);
    if (scope === GLOBAL) emit('global', name, { type: 'external', name, tenant: GLOBAL });
    else if (scope === currentTenant()) emit('scoped', name, { type: 'external', name, tenant: scope });
  });

  window.Store = Store;
})();
