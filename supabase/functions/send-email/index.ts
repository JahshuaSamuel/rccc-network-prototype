// supabase/functions/send-email/index.ts
// Sends RCCC Network email through Resend: CRM broadcasts, campaign invites and RSVP confirmations,
// and serves one-click unsubscribe links. Deploy with --no-verify-jwt: this function verifies the
// caller's JWT itself, because the unsubscribe and webhook routes carry no user token.
//
// Requests
//   POST  Authorization: Bearer <user JWT>   {kind:'broadcast', tenant, id}   needs crm_can_send (outreach.send / campaign)
//   POST  Authorization: Bearer <user JWT>   {kind:'invite', tenant, id}      needs board, or the campaign owner for staff
//   POST  Authorization: Bearer <user JWT>   {kind:'rsvp', tenant, id}        only the person who made the RSVP
//   POST  x-webhook-secret                   Database Webhook payload (new rsvps row) | {kind:'scheduled'} | {kind:'continue', tenant, id}
//   GET   ?u=<signed token>                  unsubscribe confirmation page
//   POST  ?u=<signed token>                  one-click unsubscribe (RFC 8058)
//
// Secrets: RESEND_API_KEY, SITE_URL, EMAIL_FROM, UNSUBSCRIBE_SECRET, WEBHOOK_SECRET.
// Provided by the platform: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Recipient lists are never taken from the request: they are resolved here from a saved list id.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };
type Json = Record<string, any>;
type Doc = { tenant: string; coll: string; id: string; owner: string | null; data: Json; created_by: string | null; created_at: string };

const env = (k: string, required = true): string => {
  const v = Deno.env.get(k) ?? '';
  if (!v && required) throw new Error(`Missing secret ${k}`);
  return v;
};
const SUPABASE_URL = env('SUPABASE_URL');
const ANON_KEY = env('SUPABASE_ANON_KEY');
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const RESEND_API_KEY = env('RESEND_API_KEY');
const SITE_URL = env('SITE_URL').replace(/\/+$/, '');
const EMAIL_FROM = env('EMAIL_FROM');
const UNSUBSCRIBE_SECRET = env('UNSUBSCRIBE_SECRET');
const WEBHOOK_SECRET = env('WEBHOOK_SECRET');
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/send-email`;
const SITE_ORIGIN = new URL(SITE_URL).origin;

const BATCH = 100;               // Resend batch API maximum
const MIN_GAP_MS = 550;          // stays under Resend's default 2 requests per second
const MAX_PER_RUN = 2000;        // recipients per invocation; the rest continue in a fresh invocation
const RUN_BUDGET_MS = 110_000;   // leave headroom under the Edge Function wall-clock limit
const RSVP_WINDOW_MS = 10 * 60_000;
const RSVP_DAILY_CAP = 3;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const asUser = (jwt: string) => createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${jwt}` } },
});

/* ---------------- http helpers ---------------- */
const cors = {
  'Access-Control-Allow-Origin': SITE_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  Vary: 'Origin',
};
class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const json = (status: number, body: Json) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const html = (status: number, body: string) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const normEmail = (s: unknown) => { const e = String(s ?? '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ''; };
const normPhone = (s: unknown) => { let d = String(s ?? '').replace(/\D/g, ''); if (d.length === 11 && d[0] === '1') d = d.slice(1); return d.length === 10 ? d : ''; };
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

/* ---------------- data helpers (service role) ---------------- */
async function getDoc(tenant: string, coll: string, id: string): Promise<Doc | null> {
  const { data, error } = await admin.from('docs').select('*').eq('tenant', tenant).eq('coll', coll).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Doc | null;
}
async function allDocs(tenant: string, coll: string, owner?: string): Promise<Doc[]> {
  const out: Doc[] = [];
  for (let from = 0; ; from += 1000) {
    let q = admin.from('docs').select('*').eq('tenant', tenant).eq('coll', coll).order('id').range(from, from + 999);
    if (owner) q = q.eq('owner', owner);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...(data as Doc[]));
    if (!data || data.length < 1000) return out;
  }
}
async function patch(tenant: string, coll: string, id: string, p: Json) {
  const { error } = await admin.rpc('doc_patch', { p_tenant: tenant, p_coll: coll, p_id: id, p_patch: p });
  if (error) throw new Error(error.message);
}
async function cas(tenant: string, coll: string, id: string, field: string, expected: string[], p: Json): Promise<Json | null> {
  const { data, error } = await admin.rpc('doc_cas', { p_tenant: tenant, p_coll: coll, p_id: id, p_field: field, p_expected: expected, p_patch: p });
  if (error) throw new Error(error.message);
  return (data as Json) ?? null;
}
async function insertDocs(tenant: string, coll: string, rows: Json[], owner: string | null = null) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((d) => {
      const id = d.id || `${coll.slice(0, 4).toLowerCase()}_${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}`;
      return { tenant, coll, id, owner: owner ?? d.owner ?? null, data: { ...d, id, createdAt: d.createdAt || nowIso(), createdBy: null } };
    });
    const { error } = await admin.from('docs').insert(chunk);
    if (error) throw new Error(error.message);
  }
}
async function tenantRow(slug: string): Promise<Json> {
  const { data } = await admin.from('tenants').select('*').eq('slug', slug).maybeSingle();
  if (!data) throw new HttpError(404, 'Unknown county.');
  return data as Json;
}
/* crm.js config(): crmConfig (committee) or crmConfig:campaign:<slug>, with the tenants row as fallback. */
async function sendingConfig(tenant: string, owner: string) {
  const t = await tenantRow(tenant);
  const key = owner === 'committee' ? 'crmConfig' : `crmConfig:${owner}`;
  const saved = (await getDoc(tenant, key, '__key__'))?.data ?? {};
  return {
    t,
    paidForBy: String(saved.paidForBy || (owner === 'committee' ? t.paid_for_by : '') || '').trim(),
    mailingAddress: String(saved.mailingAddress || (owner === 'committee' ? t.mailing_address : '') || '').trim(),
    from: String(saved.emailFrom || t.email_from || EMAIL_FROM),
    orgName: String(saved.orgName || (owner === 'committee' ? (t.short_name || t.name) : '') || ''),
  };
}
async function optOutSets(tenant: string) {
  const email = new Set<string>(); const all = new Set<string>();
  for (const d of await allDocs(tenant, 'optOuts')) {
    const e = normEmail(d.data.email);
    if (!e) continue;
    if (d.data.channel === 'all') all.add(e);
    if (d.data.channel === 'all' || !d.data.channel || d.data.channel === 'email') email.add(e);
  }
  return { email, all };
}

/* ---------------- auth ---------------- */
async function caller(req: Request) {
  const h = req.headers.get('authorization') || '';
  const jwt = h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
  if (!jwt || jwt === ANON_KEY) throw new HttpError(401, 'Sign in first.');
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) throw new HttpError(401, 'Your sign-in expired. Sign in again.');
  const { data: prof } = await admin.from('profiles').select('id,name,role,tenant').eq('id', data.user.id).maybeSingle();
  return { jwt, user: data.user, profile: (prof as Json) || { id: data.user.id, name: '', role: 'supporter' }, db: asUser(jwt) };
}
function isWebhook(req: Request) {
  const s = req.headers.get('x-webhook-secret') || '';
  return !!s && safeEqual(s, WEBHOOK_SECRET);
}

/* ---------------- unsubscribe tokens ---------------- */
const b64url = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
let hmacKey: CryptoKey | null = null;
async function hmac(text: string) {
  hmacKey ??= await crypto.subtle.importKey('raw', new TextEncoder().encode(UNSUBSCRIBE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(text)));
}
async function unsubToken(tenant: string, personId: string, owner: string) {
  const body = b64url(new TextEncoder().encode(JSON.stringify({ t: tenant, p: personId, o: owner })));
  return `${body}.${await hmac(body)}`;
}
async function readUnsubToken(tok: string): Promise<{ t: string; p: string; o: string } | null> {
  const [body, sig] = String(tok || '').split('.');
  if (!body || !sig || !safeEqual(sig, await hmac(body))) return null;
  try { return JSON.parse(fromB64url(body)); } catch { return null; }
}
async function sha256(text: string) {
  return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/* ---------------- Resend ---------------- */
type Msg = { from: string; to: string[]; subject: string; html: string; text: string; headers?: Record<string, string>; tags?: { name: string; value: string }[] };
let lastCall = 0;
async function resendBatch(msgs: Msg[], idempotencyKey: string): Promise<{ ids: string[]; error?: string }> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const wait = lastCall + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(msgs),
    });
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ids: ((body as Json).data || []).map((x: Json) => x.id) };
    }
    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get('retry-after')) || 0;
      await sleep(Math.max(ra * 1000, 1000 * 2 ** attempt));
      continue;
    }
    return { ids: [], error: `Resend ${res.status}: ${(await res.text()).slice(0, 300)}` };
  }
  return { ids: [], error: 'Resend kept rate-limiting this send.' };
}

/* ---------------- message building ---------------- */
function mergeFields(text: string, p: Json, countyName: string) {
  const first = String(p.firstName || String(p.name || '').trim().split(/\s+/)[0] || 'friend');
  return String(text || '').replace(/\{first_name\}/g, first).replace(/\{county\}/g, countyName);
}
function textToHtml(text: string) {
  return String(text || '').split(/\n{2,}/).map((para) => `<p style="margin:0 0 14px">${esc(para).replace(/\n/g, '<br>')}</p>`).join('');
}
function layout(bodyHtml: string, footerLines: string[], unsubUrl?: string) {
  const foot = footerLines.filter(Boolean).map((l) => `<p style="margin:0 0 6px">${esc(l)}</p>`).join('') +
    (unsubUrl ? `<p style="margin:0"><a href="${esc(unsubUrl)}" style="color:#555">Unsubscribe</a></p>` : '');
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f4;font-family:Arial,Helvetica,sans-serif;color:#1d1d1f">` +
    `<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:10px;padding:28px;font-size:16px;line-height:1.5">${bodyHtml}</div>` +
    `<div style="max-width:600px;margin:14px auto 0;font-size:12px;line-height:1.5;color:#555">${foot}</div></body></html>`;
}
const publicUnsubPage = (tenant: string) => `${SITE_URL}/index.html?county=${encodeURIComponent(tenant)}#/unsubscribe`;

/* ---------------- list resolution (crm.js matches/runList, server side) ---------------- */
function daysSince(iso: unknown) { const t = Date.parse(String(iso || '')); return isNaN(t) ? Infinity : (Date.now() - t) / 86400000; }
function matches(p: Json, f: Json) {
  if (!f) return true;
  if (f.q) {
    const q = String(f.q).trim().toLowerCase();
    if (q) {
      const qd = q.replace(/\D/g, '');
      const hay = [p.name, p.email, p.city, p.zip, (p.tags || []).join(' '), p.address].join(' ').toLowerCase();
      const okText = q.split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
      const okPhone = qd.length >= 3 && String(p.phone || '').includes(qd);
      if (!okText && !okPhone) return false;
    }
  }
  if (f.tags?.length && !f.tags.every((t: string) => (p.tags || []).includes(t))) return false;
  if (f.roles?.length && !f.roles.some((r: string) => (p.roles || []).includes(r))) return false;
  if (f.support?.length) {
    const s = p.support == null ? 'unknown' : Number(p.support);
    if (!f.support.some((x: unknown) => (x === 'unknown' ? s === 'unknown' : Number(x) === s))) return false;
  }
  if (f.city?.length && !f.city.includes(p.city)) return false;
  if (f.zip?.length && !f.zip.includes(String(p.zip || ''))) return false;
  if (f.optIn === 'email' && !(p.emailOptIn && p.email && !p.doNotContact)) return false;
  if (f.optIn === 'sms' && !(p.smsOptIn && p.phone && !p.doNotContact)) return false;
  if (f.optIn === 'none' && (p.emailOptIn || p.smsOptIn)) return false;
  if (f.optIn === 'dnc' && !p.doNotContact) return false;
  if (f.lastActivityDays) {
    const n = Number(f.lastActivityDays);
    if (n > 0 && !(daysSince(p.lastActivityAt) <= n)) return false;
    if (n < 0 && !(daysSince(p.lastActivityAt) > -n)) return false;
  }
  if (f.ids && !f.ids.includes(p.id)) return false;
  return true;
}

/* ---------------- broadcasts ---------------- */
async function sendBroadcast(tenant: string, id: string, actor: { id: string | null; name: string }, continuing = false) {
  const started = Date.now();
  const doc = await getDoc(tenant, 'broadcasts', id);
  if (!doc) throw new HttpError(404, 'That broadcast no longer exists.');
  const b = doc.data;
  const owner = doc.owner || 'committee';
  if (b.channel === 'sms') throw new HttpError(501, 'Texting is not connected yet. Send this as an email, or save it as a draft.');
  if (b.channel !== 'email') throw new HttpError(422, 'Unknown channel.');
  if (!b.listId) throw new HttpError(422, 'Pick a list first.');
  if (!String(b.subject || '').trim() || !String(b.body || '').trim()) throw new HttpError(422, 'Add a subject and a message before you send.');
  const cfg = await sendingConfig(tenant, owner);
  if (!cfg.paidForBy) throw new HttpError(422, 'Add the "Paid for by" disclaimer in Sending settings before you send.');
  if (!cfg.mailingAddress) throw new HttpError(422, 'Add your mailing address in Sending settings before you send email.');

  // Claim the send so two clicks (or a click and the scheduler) never send twice.
  const claimed = continuing
    ? await cas(tenant, 'broadcasts', id, 'status', ['sending'], { sendingHeartbeat: nowIso() })
    : await cas(tenant, 'broadcasts', id, 'status', ['draft', 'scheduled'], {
        status: 'sending', sendingAt: nowIso(), sendingBy: actor.id, progress: { lastPersonId: '', sent: 0, failed: 0 } });
  if (!claimed) throw new HttpError(409, 'This broadcast was already sent or is sending now.');

  const list = await getDoc(tenant, 'lists', b.listId);
  if (!list || (list.owner || 'committee') !== owner) {
    await patch(tenant, 'broadcasts', id, { status: 'draft', sendError: 'The saved list is gone or belongs to someone else.' });
    throw new HttpError(422, 'The saved list is gone or belongs to someone else.');
  }
  const people = (await allDocs(tenant, 'people', owner)).map((d) => d.data).filter((p) => !p.mergedInto && matches(p, list.data.filter || {}));
  const opt = await optOutSets(tenant);
  const counts = { sent: 0, skippedOptOut: 0, skippedQuietHours: 0, skippedNoContact: 0, failed: 0 };
  const recipients: Json[] = [];
  for (const p of people) {
    const e = normEmail(p.email);
    if (p.doNotContact || (e && opt.all.has(e))) { counts.skippedOptOut++; continue; }
    if (!e) { counts.skippedNoContact++; continue; }
    if (!p.emailOptIn || p.emailOptOutAt || opt.email.has(e)) { counts.skippedOptOut++; continue; }
    recipients.push(p);
  }
  recipients.sort((a, c) => String(a.id).localeCompare(String(c.id)));
  const progress = (claimed.progress as Json) || { lastPersonId: '', sent: 0, failed: 0 };
  const todo = recipients.filter((p) => String(p.id) > String(progress.lastPersonId || ''));
  const countyName = String(cfg.t.county_name || cfg.t.name || 'your county');
  const org = cfg.orgName || (b.sender?.name ? `${b.sender.name}'s campaign` : 'the campaign');
  const firstLine = String(b.subject || b.body || '').split('\n')[0].slice(0, 80);
  const fromName = b.sender?.name ? `${b.sender.name}${b.sender.title ? ', ' + b.sender.title : ''}` : '';
  const from = fromName && /<[^>]+>/.test(cfg.from) ? cfg.from.replace(/^[^<]*</, `${fromName.replace(/[<>"]/g, '')} <`) : cfg.from;
  const paid = cfg.paidForBy.replace(/([^.])$/, '$1.');

  let sentThisRun = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    if (sentThisRun >= MAX_PER_RUN || Date.now() - started > RUN_BUDGET_MS) {
      await patch(tenant, 'broadcasts', id, { progress });
      const next = fetch(FUNCTION_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
        body: JSON.stringify({ kind: 'continue', tenant, id, actor }) }).catch((e) => console.error('[send-email] continue', e));
      try { EdgeRuntime.waitUntil(next); } catch { /* local serve: the fetch still runs */ }
      return { status: 'sending', progress };
    }
    const chunk = todo.slice(i, i + BATCH);
    const msgs: Msg[] = [];
    for (const p of chunk) {
      const tok = await unsubToken(tenant, p.id, owner);
      const oneClick = `${FUNCTION_URL}?u=${tok}`;
      const footer = [paid, `Our mailing address: ${cfg.mailingAddress}.`,
        `You're getting this email because you signed up with ${org}. Unsubscribe: ${publicUnsubPage(tenant)} (or reply with the word UNSUBSCRIBE).`];
      const body = mergeFields(b.body, p, countyName);
      msgs.push({
        from, to: [normEmail(p.email)], subject: mergeFields(b.subject, p, countyName),
        html: layout(textToHtml(body), footer, oneClick),
        text: `${body}\n\n--\n${footer.join('\n')}\nOne-click unsubscribe: ${oneClick}`,
        headers: { 'List-Unsubscribe': `<${oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        tags: [{ name: 'kind', value: 'broadcast' }, { name: 'tenant', value: tenant }],
      });
    }
    const r = await resendBatch(msgs, `${tenant}-${id}-${chunk[0].id}`);
    const at = nowIso();
    const ok = r.error ? [] : chunk;
    progress.lastPersonId = chunk[chunk.length - 1].id;
    progress.sent = (progress.sent || 0) + ok.length;
    progress.failed = (progress.failed || 0) + (r.error ? chunk.length : 0);
    sentThisRun += chunk.length;
    await insertDocs(tenant, 'emailLog', [{ title: `Broadcast batch for ${id}`, kind: 'broadcast', broadcastId: id, owner, count: chunk.length,
      ok: ok.length, resendIds: r.ids, error: r.error || null, at }]);
    if (ok.length) {
      await insertDocs(tenant, 'interactions', ok.map((p) => ({
        owner, personId: p.id, type: 'email', summary: `Sent the email "${firstLine}" from ${b.sender?.name || 'the team'}.`,
        by: actor.name || 'Outreach', byId: actor.id, at, refColl: 'broadcasts', refId: id })), owner);
      const patches: Json = {};
      ok.forEach((p) => { if (!p.lastActivityAt || at > p.lastActivityAt) patches[p.id] = { lastActivityAt: at }; });
      await admin.rpc('doc_patch_many', { p_tenant: tenant, p_coll: 'people', p_patches: patches });
    }
  }
  counts.sent = progress.sent || 0;
  counts.failed = progress.failed || 0;
  const final = await cas(tenant, 'broadcasts', id, 'status', ['sending'], {
    status: counts.sent ? 'sent' : 'draft', sentAt: nowIso(), counts, progress, scheduledFor: null, heldForQuietHours: false,
    sendError: counts.sent ? null : 'No messages could be delivered to Resend. Check the sending domain and try again.' });
  return { status: final?.status || 'sent', counts };
}

async function runScheduled() {
  const { data, error } = await admin.from('docs').select('tenant,id,data').eq('coll', 'broadcasts')
    .eq('data->>status', 'scheduled').lte('data->>scheduledFor', nowIso()).limit(20);
  if (error) throw new Error(error.message);
  const out: Json[] = [];
  for (const row of (data || []) as Json[]) {
    if (row.data.channel !== 'email') continue;   // texts wait for Twilio
    try { out.push({ id: row.id, ...(await sendBroadcast(row.tenant, row.id, { id: null, name: 'Scheduled send' })) }); }
    catch (e) { out.push({ id: row.id, error: (e as Error).message }); }
  }
  return out;
}

/* ---------------- invites ---------------- */
async function sendInvite(tenant: string, id: string, who: Awaited<ReturnType<typeof caller>>) {
  const doc = await getDoc(tenant, 'invites', id);
  if (!doc) throw new HttpError(404, 'That invite no longer exists.');
  const v = doc.data;
  const { data: allowed, error } = await who.db.rpc('invite_can_manage', { p_tenant: tenant, p_slug: v.campaignSlug, p_campaign_role: v.campaignRole });
  if (error || !allowed) throw new HttpError(403, 'Only the campaign owner or the executive board can send this invite.');
  if (v.status !== 'sent') throw new HttpError(409, v.status === 'claimed' ? 'This invite was already claimed.' : 'This invite was revoked. Send a new one.');
  if (v.emailedAt && Date.now() - Date.parse(v.emailedAt) < 60_000) throw new HttpError(429, 'This invite was just emailed. Wait a minute before sending it again.');
  const to = normEmail(v.email);
  if (!to) throw new HttpError(422, 'This invite has no email address.');
  const cfg = await sendingConfig(tenant, 'committee');
  const org = cfg.t.short_name || cfg.t.name;
  const link = `${SITE_URL}/app.html?tenant=${encodeURIComponent(tenant)}#/claim/${encodeURIComponent(v.token)}`;
  const inviter = v.invitedByName || who.profile.name || org;
  const what = v.office ? `your campaign for ${v.office}` : 'your campaign';
  const role = v.campaignRole === 'staff' ? 'a member of the campaign staff' : 'the campaign owner';
  const text = `${inviter} of ${org} invited you to run ${what} on the ${org} platform as ${role}.\n\n` +
    `Open this link to set up your account. We confirm your email with a 6-digit code, then you can edit your campaign site:\n${link}\n\n` +
    `The link works once and expires in 14 days. If you weren't expecting this, you can ignore it.`;
  const footer = [cfg.paidForBy ? cfg.paidForBy.replace(/([^.])$/, '$1.') : '', cfg.mailingAddress ? `Our mailing address: ${cfg.mailingAddress}.` : ''];
  const body = textToHtml(text.replace(link, '')) +
    `<p style="margin:18px 0"><a href="${esc(link)}" style="display:inline-block;background:#1d3d7a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Set up your campaign account</a></p>`;
  const r = await resendBatch([{ from: cfg.from, to: [to], subject: `${org}: set up your campaign account`, html: layout(body, footer), text,
    tags: [{ name: 'kind', value: 'invite' }, { name: 'tenant', value: tenant }] }], `${tenant}-invite-${id}-${v.resendCount || 0}`);
  await insertDocs(tenant, 'emailLog', [{ title: `Invite email for ${id}`, kind: 'invite', inviteId: id, count: 1, ok: r.error ? 0 : 1, resendIds: r.ids, error: r.error || null, at: nowIso() }]);
  if (r.error) throw new HttpError(502, 'The invite email did not go out. Copy the link and send it yourself, or try again in a minute.');
  await patch(tenant, 'invites', id, { emailedAt: nowIso(), emailCount: (v.emailCount || 0) + 1 });
  return { sent: 1 };
}

/* ---------------- RSVP confirmations ---------------- */
async function sendRsvp(tenant: string, id: string, userId: string | null) {
  const doc = await getDoc(tenant, 'rsvps', id);
  if (!doc) throw new HttpError(404, 'That RSVP no longer exists.');
  if (userId && doc.created_by !== userId) throw new HttpError(403, 'Only the person who RSVPd can ask for a confirmation.');
  const v = doc.data;
  if (v.confirmationSentAt) return { skipped: 'already sent' };
  if (Date.now() - Date.parse(doc.created_at) > RSVP_WINDOW_MS) return { skipped: 'too old' };
  let to = normEmail(v.email) || normEmail(v.contact);
  if (!to && doc.created_by) {
    const { data: prof } = await admin.from('profiles').select('email').eq('id', doc.created_by).maybeSingle();
    to = normEmail((prof as Json | null)?.email);
  }
  if (!to) return { skipped: 'no email' };
  const opt = await optOutSets(tenant);
  if (opt.all.has(to)) return { skipped: 'do not contact' };
  const hash = await sha256(to);
  const since = new Date(Date.now() - 86400000).toISOString();
  const { count } = await admin.from('docs').select('id', { count: 'exact', head: true })
    .eq('tenant', tenant).eq('coll', 'emailLog').eq('data->>kind', 'rsvp').eq('data->>toHash', hash).gte('created_at', since);
  if ((count || 0) >= RSVP_DAILY_CAP) return { skipped: 'daily cap' };
  if (!(await cas(tenant, 'rsvps', id, 'confirmationSentAt', [''], { confirmationSentAt: nowIso() }))) return { skipped: 'already sent' };

  const cfg = await sendingConfig(tenant, 'committee');
  const org = cfg.t.short_name || cfg.t.name;
  const guests = Number(v.guests) || 0;
  const eventUrl = `${SITE_URL}/index.html?county=${encodeURIComponent(tenant)}#/events/${encodeURIComponent(v.eventId || '')}`;
  const name = String(v.name || '').trim().split(/\s+/)[0] || 'there';
  const text = `Hi ${name},\n\nYou're on the list for ${v.title || 'the event'}` +
    `${v.date ? ` on ${v.date}` : ''}${v.location ? ` at ${v.location}` : ''}${guests ? `, with ${guests} guest${guests === 1 ? '' : 's'}` : ''}.\n\n` +
    `Event details and directions: ${eventUrl}\n\nIf your plans change, you can cancel from the event page.\n\n${org}`;
  const footer = [cfg.paidForBy ? cfg.paidForBy.replace(/([^.])$/, '$1.') : '', cfg.mailingAddress ? `Our mailing address: ${cfg.mailingAddress}.` : '',
    `You're getting this because you RSVPd on the ${org} website. Unsubscribe: ${publicUnsubPage(tenant)}`];
  const r = await resendBatch([{ from: cfg.from, to: [to], subject: `You're going: ${v.title || 'event RSVP'}`, html: layout(textToHtml(text), footer), text: `${text}\n\n--\n${footer.join('\n')}`,
    tags: [{ name: 'kind', value: 'rsvp' }, { name: 'tenant', value: tenant }] }], `${tenant}-rsvp-${id}`);
  await insertDocs(tenant, 'emailLog', [{ title: `RSVP confirmation for ${id}`, kind: 'rsvp', rsvpId: id, toHash: hash, count: 1, ok: r.error ? 0 : 1, resendIds: r.ids, error: r.error || null, at: nowIso() }]);
  if (r.error) { await patch(tenant, 'rsvps', id, { confirmationSentAt: null, confirmationError: r.error.slice(0, 200) }); throw new HttpError(502, 'The confirmation email did not go out.'); }
  return { sent: 1 };
}

/* ---------------- unsubscribe ---------------- */
async function unsubscribe(tok: string) {
  const t = await readUnsubToken(tok);
  if (!t) throw new HttpError(400, 'This unsubscribe link is not valid.');
  const p = await getDoc(t.t, 'people', t.p);
  const email = normEmail(p?.data.email);
  if (!p || !email) return { done: true };
  const id = `opto_${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}`;
  const { error } = await admin.from('docs').insert({ tenant: t.t, coll: 'optOuts', id,
    data: { id, title: 'Unsubscribed from email', email, channel: 'email', source: 'one-click', owner: t.o, createdAt: nowIso(), createdBy: null } });
  if (error) throw new Error(error.message);
  // Service-role inserts skip the browser trigger, so run the same ingestion explicitly.
  await admin.rpc('crm_ingest_row', { p_tenant: t.t, p_coll: 'optOuts', p_id: id });
  return { done: true };
}
function unsubPage(tok: string, done: boolean, err?: string) {
  const body = err ? `<h1>That link didn't work</h1><p>${esc(err)}</p>`
    : done ? `<h1>You're unsubscribed</h1><p>You won't get more of these emails. It can take a day for messages already scheduled to stop.</p>`
    : `<h1>Unsubscribe from these emails?</h1><form method="post" action="?u=${esc(tok)}"><button style="font-size:16px;padding:12px 20px;border-radius:8px;border:0;background:#1d3d7a;color:#fff">Unsubscribe</button></form>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe</title></head>` +
    `<body style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:48px auto;padding:0 16px;line-height:1.5;color:#1d1d1f">${body}</body></html>`;
}

/* ---------------- router ---------------- */
Deno.serve(async (req) => {
  const url = new URL(req.url);
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    const tok = url.searchParams.get('u');
    if (tok && req.method === 'GET') {
      return (await readUnsubToken(tok)) ? html(200, unsubPage(tok, false)) : html(400, unsubPage(tok, false, 'This unsubscribe link is not valid.'));
    }
    if (tok && req.method === 'POST') { await unsubscribe(tok); return html(200, unsubPage(tok, true)); }
    if (req.method !== 'POST') return json(405, { error: 'Use POST.' });

    const body = (await req.json().catch(() => ({}))) as Json;

    if (isWebhook(req)) {
      if (body.kind === 'scheduled') return json(200, { results: await runScheduled() });
      if (body.kind === 'continue') return json(200, await sendBroadcast(String(body.tenant), String(body.id), body.actor || { id: null, name: 'Outreach' }, true));
      const rec = body.record as Json | undefined;   // Database Webhook payload
      if (body.type === 'INSERT' && rec && rec.coll === 'rsvps') return json(200, await sendRsvp(String(rec.tenant), String(rec.id), null));
      return json(200, { ignored: true });
    }

    const who = await caller(req);
    const tenant = String(body.tenant || '');
    const id = String(body.id || '');
    if (!/^[a-z0-9-]{2,40}$/.test(tenant) || !id) throw new HttpError(400, 'Missing county or id.');

    if (body.kind === 'broadcast') {
      const doc = await getDoc(tenant, 'broadcasts', id);
      if (!doc) throw new HttpError(404, 'That broadcast no longer exists.');
      const { data: ok, error } = await who.db.rpc('crm_can_send', { p_tenant: tenant, p_owner: doc.owner || 'committee' });
      if (error || !ok) throw new HttpError(403, 'Only the executive board, or the campaign team for its own records, can send broadcasts.');
      return json(200, await sendBroadcast(tenant, id, { id: who.user.id, name: who.profile.name || '' }));
    }
    if (body.kind === 'invite') return json(200, await sendInvite(tenant, id, who));
    if (body.kind === 'rsvp') return json(200, await sendRsvp(tenant, id, who.user.id));
    throw new HttpError(400, 'Unknown kind.');
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error('[send-email]', e);
    return json(status, { error: status === 500 ? 'Something went wrong on our side. Try again in a minute.' : (e as Error).message });
  }
});
