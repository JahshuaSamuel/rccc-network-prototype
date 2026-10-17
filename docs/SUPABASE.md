# RCCC Network on Supabase and Resend

Status (2026-10-16): **wired in and live on Supabase project `udnrlisexjymqousvkkn`.** The three pages load `config.js` with `BACKEND: 'supabase'`. Public actions, sign-in, the CRM and meetings run against the real database. Email is the one piece still waiting: see **section 10** for what is live, what was verified and the exact steps left (Resend SMTP, the function secrets, the webhook and pg_cron). To go back to browser storage, see 10.4.

| File | What it is |
|---|---|
| `supabase/schema.sql` | One idempotent script for the Supabase SQL editor: tables, helper functions, RLS, RPCs, server-side CRM ingestion, rate limiting |
| `supabase/seed-from-data.mjs` | Node script that produces `supabase/seed.sql` (the sample content, every row marked `sample`) |
| `supabase/seed.sql` | Generated output of the script above (1,160 rows for SVGOP and Demo County); regenerate whenever `data.js` or `crm.js` seeding changes |
| `supabase/functions/send-email/index.ts` | Edge Function (Deno) that sends broadcasts, invites and RSVP confirmations through Resend, plus one-click unsubscribe |
| `store-supabase.js` | Drop-in `window.Store` with the exact same API, backed by supabase-js v2 |
| `auth-supabase.js` | Drop-in `App.auth` with the same API and the same sheet UI, backed by Supabase Auth email codes |
| `docs/SUPABASE.md` | This plan |

---

## 1. Architecture in words

1. **Browser (GitHub Pages, unchanged static files).** The ~25 screens keep calling `Store.*` and `App.auth.*` synchronously, as they do today.
2. **`store-supabase.js`** replaces `window.Store` when `config.js` says `BACKEND = 'supabase'`. It keeps a synchronous in-memory cache per county. At startup it pulls ("hydrates") the collections that the signed-in person is allowed to read. Reads come from the cache. Writes update the cache immediately, fire the same `Store.on` events as today, then go to Postgres. A Supabase Realtime subscription per county feeds other people's changes back into the cache and fires `Store.on` events with `type: 'external'`. Writes made with no connection wait in an offline queue in localStorage and are replayed in order.
3. **`auth-supabase.js`** replaces `App.auth`. Sign-in and sign-up use **Supabase Auth email OTP** (6-digit codes sent by Supabase through the custom SMTP, which is Resend's SMTP relay). The account itself is the `profiles` row. A person's role can only be changed on the server.
4. **Postgres (Supabase).**
   - `profiles` is 1:1 with `auth.users` and holds name, phone, ZIP, role, county, campaign.
   - `docs` is one generic document table with the key `(tenant, coll, id)`. It mirrors the Store API one to one. `tenant = 'global'` is the global scope. Store keys (`Store.get/set`) are rows with `id = '__key__'`.
   - `coll_policies` holds one row per collection describing who may read and write it. A single function, `doc_access()`, reads that table and the caller's profile. Every RLS policy on `docs` calls it. A collection with no row in `coll_policies` is closed to everyone (fails closed).
   - Triggers stamp `created_by` from the JWT (never from the client), derive the CRM `owner` column, enforce the campaign-site disclaimer and endorsement rules, rate-limit anonymous inserts, and run **CRM ingestion on the server** (see 1.6).
   - RPCs (`SECURITY DEFINER`, each one checks the caller): `claim_invite`, `create_invite`, `revoke_invite`, `resend_invite`, `invite_preview`, `set_role`, `remove_campaign_member`, `campaign_team`, `crm_stats`, `public_counts`, `withdraw_submission`, `doc_patch`, `doc_patch_many`, `purge_sample`.
5. **Edge Function `send-email`** (Deno). It verifies the caller's JWT, checks the capability on the server, resolves recipients itself from a saved list id, applies opt-outs, do-not-contact, the "Paid for by" line, the mailing address and the unsubscribe link, sends through the Resend batch API with rate limiting, and logs results back into `docs` (`interactions`, `emailLog`, the broadcast's `counts`). It also serves one-click unsubscribe links (RFC 8058) for the `List-Unsubscribe` header.
6. **CRM ingestion moves to the server.** In the browser, `App.crm.ingest()` can only see what RLS lets it see, and many people (anonymous visitors, members, candidates) cannot write the committee's CRM. So an `AFTER INSERT` trigger on `docs` turns each new `rsvps`, `volunteers`, `memberships`, `donations`, `signatures`, `optOuts` and `walkResults` row into a person and a timeline entry, using the same dedupe rules as `crm.js`, and records it in the `crmIngest` key. `store-supabase.js` tells `crm.js` that everything is already ingested (see 4.4), so the client never double-ingests.
7. **Resend** delivers all mail: auth codes through SMTP, everything else through the HTTP API from the Edge Function. SMS stays "code on screen" until Twilio is connected.

```
 Browser (static)                         Supabase                                   Resend
 screens ──sync──> Store (cache) ──REST──> docs (RLS → doc_access → coll_policies)
                    ^    │  offline queue      │ triggers: stamp, owner, guards, rate limit, ingest
                    │    └──realtime<──────────┘
 App.auth ──OTP──> Supabase Auth ──SMTP──────────────────────────────────────────> Resend SMTP
            ──RPC──> claim_invite / set_role / campaign_team ...
 Outreach ──invoke──> Edge Function send-email ──service role──> docs ──HTTP batch──> Resend API
```

---

## 2. Roles, mirrored in SQL

`auth_role()`, `auth_tenant()`, `auth_campaign()`, `eff_role(tenant)`, `role_rank(role)` and `can(cap, tenant)` in `schema.sql` mirror `auth.js`:

- Ranks: `public 0`, `supporter 1`, `candidate 1`, `member 2`, `board 3`, `master 4`.
- Effective role in a county: Master Network staff are `master` everywhere. Anyone else has their role only in their own county and is a `supporter` elsewhere. In the global scope a person keeps their own role.
- `can(cap)` uses the same capability table as `auth.js` (`CAPS`), including `'candidate'` meaning candidates, board and master, `crm.campaign` meaning candidates only, unknown capabilities needing master, and `prefix.*`.
- **Master sees aggregates only.** `doc_access()` refuses Master Network staff on CRM collections (`crm = true`) and on intake collections that hold personal contact details (`intake = true`). They read `crm_stats(tenant)`, which returns counts only.
- **CRM owners** mirror the guard at the bottom of `crm.js`: a candidate reads and writes only `campaign:<their slug>`; board reads and writes `committee` and every campaign; members read `committee` only; supporters and master read nothing.

## 3. Every collection and its rule

Legend: **read** is the minimum role that reads every row; **public rows** are rows anyone (signed out too) can read when their `status` matches; **insert** is the minimum role that may add rows (`public` means signed-out visitors can insert, and only insert); **write** is the minimum role for any insert, update or delete; **own** means signed-in people can always read their own rows (and update or delete them when marked "own rw"); **candidate** is what a candidate may do on rows of their own campaign. `nobody` means only `SECURITY DEFINER` RPCs, triggers and the Edge Function (service role) write it.

### County scope (`tenant = <slug>`)

| Collection | Kind | Read | Public rows | Insert | Write | Own | Candidate | Notes |
|---|---|---|---|---|---|---|---|---|
| `posts` | coll | member | `status` published (missing = published) | board | board | | | Committee Portal |
| `events` | coll | member | `status` published (missing = published) | board | board | | | |
| `localAds` | coll | public | | board | board | | | `ads.manage` |
| `siteSettings` | key | public | | board | board | | | |
| `networkPrefs`, `hiddenPushes`, `pinnedPushes` | key | public | | board | board | | | |
| `candidates` | coll | public | | board | board | | | public site lists recruits; see open question 6 |
| `candidateStatus` | key | public | | board | board | | | |
| `campaignSites` | coll | member | `status` live | board | board | | read+write where `slug` = theirs | trigger: candidates cannot change `endorsed`/`endorsementPaused`/`endorsementPause`; nobody can set `status: live` without "Paid for by …, FPPC ID #…" |
| `eventProposals` | coll | board | | board | board | | read+write where `campaignSlug` = theirs | |
| `siteSuggestions` | coll | board | | board | board | | read+update where `campaignSlug` = theirs | committee suggests, candidate accepts |
| `printOrders` | coll | board | | board | board | | read+write where `candidateId` = theirs | |
| `socialPlan` | key | board | | board | board | | read+update, own entry only | trigger: a candidate may change only `data[<their candidateId>]` |
| `directorPlans` | coll | board | | board | board | | read+update where `candidateId` = theirs | Director writes as master |
| `candidateStatusLog`, `endorsementLog` | coll | board | | board | nobody | | | append-only logs |
| `invites` | coll | board | | nobody | nobody | | read where `campaignSlug` = theirs | written only by invite RPCs |
| `auditLog` | coll | board | | board | nobody | | | append-only |
| `rsvps` | coll | board, intake | | **public** | board | own rw | read own campaign rows | intake: members read `committee` rows |
| `volunteers` | coll | board, intake | | **public** | board | own rw | read own campaign rows | campaign sign-ups get `owner = campaign:<slug>` |
| `memberships`, `donations` | coll | board, intake | | **public** | board | own | | |
| `signatures` | coll | board, intake | | **public** | board | own | read own campaign rows | owner comes from the petition |
| `optOuts` | coll | board | | **public** | board | own rw | | also honored directly by the Edge Function |
| `walkResults` | coll | member | | member | board | own rw | | `field.canvass` |
| `votes` | coll | member | | member | nobody | own | | receipts only, immutable |
| `proxies` | coll | member | | member | board | own rw | | |
| `meetingState` | key | member | | member | member | | | see risk 7.6 |
| `turfAssignments`, `joinedChannels` | key | member | | board | board | | | |
| `fileLibrary` | coll | member | | board | board | | | |
| `emailLog` | coll | board | | nobody | nobody | | | written by the Edge Function |
| `people`, `interactions`, `lists`, `paths`, `pathEntries`, `tasks`, `broadcasts`, `callCampaigns`, `shares` | coll | CRM owner rule | | CRM owner rule | CRM owner rule | | own campaign only | master refused |
| `petitions` | coll | CRM owner rule | `status` live or closed | CRM | CRM | | own campaign only | public petition pages |
| `crmConfig`, `crmConfig:campaign:<slug>` | key | CRM owner rule | | CRM | CRM | | own campaign key | owner comes from the key suffix |
| `crmIngest`, `crmMeta` | key | CRM owner rule (committee) | | CRM | CRM | | | written by the ingestion trigger |

### Global scope (`tenant = 'global'`)

| Collection | Read | Public rows | Insert | Write | Own |
|---|---|---|---|---|---|
| `networkPushes`, `networkAds` | public | | master | master | |
| `networkPushArchive`, `networkOutreach` | master | | master | master | |
| `channelMessages` | member | | member | board | own rw |
| `fileCopies` | member | | board | board | |

### Never stored on the server (kept in the browser by `store-supabase.js`)
`session`, `accounts` (both become read-only views of the Supabase session and the person's own profile, so `site.js` and `campaign.js` keep working), `siteVisitor`, `crmDrawerWidth`, `campaignSignups`, and any name starting with `_`.

### Signed-out visitors and "their own" rows
Anonymous inserts never return the row (no `SELECT` for anon), so the adapter inserts with `returning: minimal` and keeps a local mirror of what this browser submitted. That keeps "Your RSVP" and "You signed" working after a reload. Each anonymous submission carries a random receipt; only its SHA-256 is stored (`docs.receipt_hash`), and `withdraw_submission()` lets the same browser cancel it within 24 hours (un-RSVP, undo unsubscribe).

Public totals (RSVP head counts per event, signatures per petition) come from `public_counts(tenant)`, which returns numbers only. Until `site.js` and `site-act.js` read `Store.count()`, the adapter adds anonymous placeholder rows (`{_aggregate: true}`, no names or contacts) to `list('rsvps')` and `list('signatures')` for people who cannot read those collections, so the existing totals stay right (see request R4).

---

## 4. Wiring steps once the keys arrive

### 4.1 Supabase project settings
1. **SQL editor:** run `supabase/schema.sql`. Run it again whenever it changes; it is idempotent.
2. **Seed:** run `node supabase/seed-from-data.mjs --browse http://localhost:8000 --playwright <path to a folder with node_modules/playwright>` (or `--dump dump.json`; see section 5), then paste `supabase/seed.sql` into the SQL editor.
3. **Auth → Providers → Email:** enable Email, turn **off** "Confirm email" link mode for OTP-only use, set **Email OTP expiration = 600 s**, and set the OTP length to 6.
4. **Auth → Email templates:** in "Magic Link" and "Confirm signup", replace the link with the code: `Your {{ .SiteURL }} code is {{ .Token }}. It expires in 10 minutes.` (A template that only has `{{ .Token }}` makes Supabase send a 6-digit code instead of a link.)
5. **Auth → SMTP:** host `smtp.resend.com`, port 465, user `resend`, password = a Resend API key with "sending access" only, sender `no-reply@<verified domain>`. Raise the auth email rate limit from the default once SMTP is on.
6. **Auth → URL configuration:** Site URL = the GitHub Pages URL; add it to the redirect allow-list.
7. **Auth → Phone:** leave disabled until Twilio (see 7.5).
8. **Database → Replication:** `schema.sql` adds `docs` to the `supabase_realtime` publication. Confirm it shows up.
9. **Edge Function:** `supabase functions deploy send-email --no-verify-jwt` (the function verifies the JWT itself because its unsubscribe and webhook routes carry no user JWT). Secrets:
   ```
   supabase secrets set RESEND_API_KEY=re_... \
     SITE_URL=https://<user>.github.io/<repo> \
     EMAIL_FROM="RCCC Network <no-reply@mail.example.org>" \
     UNSUBSCRIBE_SECRET=<64 random hex chars> \
     WEBHOOK_SECRET=<64 random hex chars>
   ```
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform. **The service-role key exists only inside the Edge Function. No browser file references it.**
10. **Database Webhook (RSVP confirmations):** Database → Webhooks → on `INSERT` into `public.docs`, HTTP POST to `https://<ref>.functions.supabase.co/send-email`, header `x-webhook-secret: <WEBHOOK_SECRET>`. The function ignores everything except new `rsvps` rows.
11. **Scheduled broadcasts:** enable `pg_cron` + `pg_net` and schedule `select net.http_post(url := 'https://<ref>.functions.supabase.co/send-email', headers := jsonb_build_object('x-webhook-secret', '<WEBHOOK_SECRET>', 'content-type','application/json'), body := '{"kind":"scheduled"}'::jsonb)` every minute. (Optional; until then `crm.runScheduled()` in an open board session still triggers sends through the function, see R2.)

### 4.2 `config.js` (new file, the supervisor creates it)
```js
/* config.js: which backend this page uses. Public values only: the anon key is safe to ship; RLS protects the data. */
window.RCCC_CONFIG = {
  BACKEND: 'supabase',                 // 'local' | 'supabase'
  SUPABASE_URL: 'https://<ref>.supabase.co',
  SUPABASE_ANON_KEY: '<anon public key>',
  PHONE_OTP: 'screen',                 // 'screen' (code shown on screen, phone stays unverified) | 'twilio'
  HYDRATE_LIMIT: 20000,                // rows per collection pulled at startup (see 6)
};
/* Demo mode: ?demo=1 runs this tab on the old localStorage backend with the sample accounts.
   It never touches the real database. ?demo=0 leaves demo mode. */
(function () {
  var c = window.RCCC_CONFIG, k = 'rccc:demo', demo = false;
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('demo') === '1') sessionStorage.setItem(k, '1');
    if (q.get('demo') === '0') sessionStorage.removeItem(k);
    demo = sessionStorage.getItem(k) === '1';
  } catch (e) { /* private window: no demo persistence */ }
  c.DEMO = demo;
  c.ACTIVE_BACKEND = demo ? 'local' : c.BACKEND;
})();
```

### 4.3 Script order
`app.html`, `index.html` and `campaign.html` get the same head of the chain. Each adapter does nothing unless `RCCC_CONFIG.ACTIVE_BACKEND === 'supabase'`, so the tags can ship before the switch is flipped.
```html
<script src="config.js"></script>
<script src="data.js"></script>
<script src="store.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>
<script src="store-supabase.js"></script>
<script src="core.js"></script>          <!-- app.html only -->
<script src="auth.js"></script>          <!-- app.html only -->
<script src="auth-supabase.js"></script> <!-- app.html only, right after auth.js -->
<script src="crm.js"></script>
... screens ...
```
`index.html` and `campaign.html` do not load `auth.js`; they read the signed-in person through `Store.global.get('session')` and `Store.global.list('accounts')`, which `store-supabase.js` serves from the Supabase session and profile.

### 4.4 Feature flags and the small changes other owners make
- `BACKEND = 'local'` is today's behavior, byte for byte. Flip to `'supabase'` per environment.
- **R1 (core.js, foundation):** *Done 2026-10-16 in core.js, site.js and campaign.js.* Before the first `onRoute()`, wait for `Store.ready` when it exists: `Promise.resolve(Store.ready).then(onRoute)`. Also `Store.on('hydrated', renderCurrent)`. Without it, the first paint can show empty lists for up to a second until the `external` events arrive. The same applies to `site.js` and `campaign.js` first render.
- **R2 (crm.js, CRM agent):** *Done 2026-10-16 (crm.js and screens/outreach.js).* When `Store.backend === 'supabase'`, `sendBroadcast` and `runScheduled` call `Store.invoke('send-email', {kind:'broadcast', tenant, broadcastId})` instead of logging sends locally. `stats(slug)` returns `Store.crmStats(slug)` (cached from the `crm_stats` RPC) for Master Network. `ingest()` is already neutralized by the adapter, so no change is needed there.
- **R3 (screens/candidate.js, candidate agent):** *Not done yet; needs a schema change too (see 10.5).* Split the county key `socialPlan` into one key per candidate (`socialPlan:<candidateId>`). Until then a candidate can read every candidate's plan in that county (writes are guarded).
- **R4 (site.js, site-act.js, public-site agent):** *Done 2026-10-16. The placeholder rows still exist in the adapter and can be retired later.* Use `Store.count('rsvps', 'eventId')` / `Store.count('signatures', 'petitionId')` when present instead of `list().length`, so the aggregate placeholder rows can be retired.
- **R5 (governance, committee agent):** *Done 2026-10-16: migration `20261016200000_meeting_votes.sql` (cast_vote RPC and a meetingState guard), schema.sql section 9b, screens/governance.js.* Move vote casting into an RPC so a member cannot rewrite `meetingState.ballots` directly (risk 7.6).
- **R6 (tour.js, network agent):** *Done 2026-10-16 in core.js: "Take the tour" opens `?demo=1&tour=1` in the same tab, the tour starts and a toast says it uses sample accounts. Demo tabs show "Leave the demo" in the sidebar.* The guided tour switches between sample accounts with `App.setRole`. With the real backend, `signInSample` shows a note and returns false, so the tour should start only in demo mode (or link to `?demo=1`).
- **R7 (screens/account.js, foundation):** *Done 2026-10-16 in auth-supabase.js (the Supabase account menu never had the reset item; board and master get "Remove sample data" with a confirmation).* "Reset sample data" only clears this browser's cache under Supabase. Hide it when `Store.backend === 'supabase'`, and for board members offer "Remove sample data" (`Store.purgeSample()`) behind a confirmation instead.

---

## 5. Seed and migration

### 5.1 Sample content (`seed-from-data.mjs`)
The seed is whatever the app writes into `Store` on a clean first load: the 150-ish CRM people per county, timelines, lists, paths, petitions, broadcasts, `crmConfig`, `crmMeta`, and so on. `data.js` itself stays a static file (it is the baseline the screens merge with, as the brief says), so it is not copied into the database.

The script produces that content in one of two ways:
- `--browse <url> --playwright <dir>`: opens `app.html?tenant=<slug>` for each county in headless Chromium with an empty profile, waits for `App.crm.ready`, opens the screens that seed on first render, and reads every `rccc:v1:*` key.
- `--dump <file.json>`: reads a dump you copied from a browser console on a fresh profile:
  `copy(JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('rccc:v1:')).map(k => [k, localStorage.getItem(k)]))))`

It then writes `supabase/seed.sql`: one `insert ... on conflict do update ... where docs.sample` per row, with `sample = true` on the row and `"sample": true` in each document. Re-running the seed never overwrites a row someone has edited (edits clear the flag). `purge_sample(tenant)` (board) deletes the sample rows of a county when the committee is ready to go live.

### 5.2 Existing localStorage data (optional import)
Real users have only used the localStorage build on their own devices, so nothing needs to move by default. For a committee that entered real data in a browser:
1. In that browser, run the console dump above and save it.
2. Sign in on the Supabase build as a board member of that county.
3. In the console: `await Store.importLocal(JSON.parse(<dump>), { tenant: 'svgop', dryRun: true })` prints what would be written per collection. Run again without `dryRun` to write.
`importLocal` goes through the normal write path, so RLS decides what is allowed, `created_by` becomes the importer, and `sample` rows are skipped. Accounts are not imported (people sign up again; board then sets roles with `set_role`).

---

## 6. Hydration strategy and its limits

- **At startup** the adapter loads, for the current county plus `global`, every collection in `coll_policies` that the caller can read, in pages of 1,000 rows, up to `HYDRATE_LIMIT` rows per collection. Collections the caller cannot read are skipped without a request (the policy table is public), and RLS would return zero rows anyway.
- **Another county** (Master console, county switcher, `Store.forTenant`): hydrated on first access. `list()` returns what is cached (possibly `[]`) and fires `{type:'external'}` when the rows arrive.
- **Snapshot:** non-personal collections (posts, events, ads, settings, pushes, campaign sites, candidates, petitions) are snapshotted to localStorage so a reload paints instantly and then revalidates. CRM and intake collections are never written to the browser's storage; they live in memory only.
- **Big collections.** `people` and `interactions` are the ones that grow. Today `crm.js` filters and joins them in memory, so they must be fully loaded for the screens to be correct. Practical ceiling: about 20,000 people and 50,000 interactions per county before the first load takes several seconds on a phone (roughly 1 KB per row compressed). Beyond that:
  - `interactions` should become lazy: load the last 180 days at startup and fetch a person's older timeline on demand. `Store.hydrate('interactions', {since})` and `Store.loadMore('interactions')` exist for that, but `App.crm.timeline()` needs an async variant to use them (future CRM work).
  - `people` search and list building should move to SQL (a `crm_people(filter)` RPC) once a county passes ~20k people.
  The adapter marks a collection `partial` when it hits the limit. In that state, a whole-collection `Store.set(coll, array)` (which `crm.js` seeding uses) only upserts and never deletes, so a partial cache can never wipe rows it has not seen.
- **Writes** are optimistic. `update` and `updateMany` call `doc_patch` / `doc_patch_many`, which merge on the server (`data || patch`), so two people editing different fields of one record do not overwrite each other. Last write wins per field.
- **Realtime** subscribes to `docs` filtered by `tenant=eq.<slug>` and `tenant=eq.global`. Supabase checks RLS per subscriber, so people only receive rows they could select. Deletes arrive with the primary key only, which is all the cache needs. Echoes of the browser's own writes are dropped when the incoming row equals the cached one.
- **Offline queue:** writes made while offline (or failing with a network error) are queued in localStorage (`rccc:sb:queue`) and replayed in order on `online`, on reconnect and every 30 seconds. A write the server rejects (RLS, check violation) is dropped from the queue, the cache is rolled back for that row, an `external` event fires so the screen redraws, and `App.toast` shows "That change didn't save: <reason>". Queue entries for CRM collections hold personal data; they are cleared on sign-out.

---

## 7. Risks

1. **Sync semantics.** The cache is eventually consistent. Two board members editing the same field: last write wins. Whole-collection `set()` calls in `crm.js` seeding race with other writers; they are rare (first load of a county) and guarded by the `partial` rule. Clock skew affects `createdAt`/`updatedAt` written by clients; `created_at`/`updated_at` columns are server time and are what ordering uses.
2. **Cost of hydrating CRM collections.** See section 6. Watch Supabase egress: a board member opening the app pulls the whole county CRM. At 10k people and 30k interactions that is about 8–15 MB uncompressed per cold load. The snapshot rule keeps PII out of localStorage, so CRM data is refetched every session.
3. **Abuse of anonymous inserts.** Anyone can insert RSVPs, volunteer sign-ups, membership and donation pledges, signatures and opt-outs.
   - In place: per-IP and per-county rate limit in the insert trigger (20 anonymous writes per 10 minutes per IP per county, `anon_rate`), an 8 KB size cap per anonymous document, the `tenants` foreign key (no invented counties), server-stamped `created_by`, no `SELECT` for anon, and server-side ingestion that dedupes people.
   - Next: Cloudflare Turnstile (free) or hCaptcha on the public forms. Supabase Auth supports both for auth endpoints; for `docs` inserts, route anonymous writes through a tiny Edge Function that checks the Turnstile token and then inserts with the service role, and remove the anon insert path from `coll_policies` (change `insert_min` from `public` to `nobody`).
   - RSVP confirmation emails are the main spam vector (someone types a stranger's email). The function sends at most one confirmation per RSVP, only within 10 minutes of the insert, at most 3 per address per day, and only when the address has no opt-out.
4. **Email deliverability.** Verify a sending domain in Resend (SPF, DKIM, a DMARC record at `p=none` to start), use a subdomain such as `mail.<county-domain>`, and keep marketing (broadcasts) and transactional (codes, RSVPs) on separate subdomains once volume grows. Broadcasts carry `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, which Gmail and Yahoo require for bulk senders. Warm up slowly: the first broadcasts should go to engaged lists only.
5. **SMS is deferred.** Phone codes stay on screen behind `PHONE_OTP = 'screen'`, and `verified.phone` stays `false` on the server in that mode. Texting broadcasts return "not connected" from the function. Turning on Twilio needs A2P 10DLC brand and campaign registration for political messaging (weeks, with fees), a Twilio Messaging Service, Supabase Auth phone provider settings, and STOP/HELP handling through a Twilio webhook into `optOuts`. Quiet hours (8 AM to 9 PM recipient time) then move into the function.
6. **Meetings.** `meetingState` is one key that members write as a whole (check-ins, roll calls). Any member could rewrite another member's recorded choice. Fine for a pilot; R5 moves casting into an RPC.
7. **Ingestion parity.** The SQL ingestion mirrors `crm.js` (dedupe by email, then phone with matching last name; roles, tags, opt-ins and timeline text). The donor-limit review task that `crm.js` adds when a gift passes the treasurer's limit is not created by the trigger; the warning still shows on the person's profile. Changes to `crm.js` ingestion must be copied into `crm_ingest_row()`.
8. **A send that dies midway.** A broadcast is marked `sending` before the first batch, so a double click never sends twice. If the function crashes, the broadcast stays `sending`; the board can reset it to `draft` from the SQL editor (`select doc_patch('<county>','broadcasts','<id>','{"status":"draft"}')`). A stale-lock timeout is a small follow-up.
9. **Supabase email OTP quotas.** Without custom SMTP, Supabase sends very few auth emails per hour. Configure Resend SMTP before inviting anyone.

---

## 8. Test plan

### 8.1 RLS tests in the SQL editor
The SQL editor runs as `postgres`, which bypasses RLS. Impersonate a role and a JWT inside a transaction and roll back. `schema.sql` creates a helper:
```sql
begin;
select public.test_as('<user uuid>');      -- sets role authenticated + request.jwt.claims
select count(*) from docs where coll = 'people';
rollback;
```
`test_as(null)` impersonates a signed-out visitor (`anon`). Create test users in Auth → Users (or via sign-up), then set roles with `select set_role(...)` as postgres (it allows the SQL editor).

Expected results (svgop, after seeding). Each line is one test; all must pass before launch:

| # | As | Statement | Expect |
|---|---|---|---|
| 1 | anon | `select count(*) from docs where tenant='svgop' and coll='people'` | 0 |
| 2 | anon | `select count(*) from docs where coll='posts' and data->>'status'='draft'` | 0 |
| 3 | anon | `select count(*) from docs where coll='petitions' and data->>'status'='live'` | > 0 |
| 4 | anon | `insert into docs(tenant,coll,id,data) values ('svgop','rsvps','t1','{"id":"t1","name":"T","contact":"t@example.com","eventId":"e1"}')` | ok |
| 5 | anon | same row, `select` it back | 0 rows |
| 6 | anon | insert into `posts` | RLS error |
| 7 | anon | insert into `rsvps` with tenant `nowhere` | FK error |
| 8 | anon | 21st insert from one IP inside 10 minutes | "Too many submissions" |
| 9 | supporter | `update profiles set role='board' where id=auth.uid()` | permission denied (column) |
| 10 | supporter | `update profiles set name='X' where id=auth.uid()` | ok |
| 11 | supporter | select own RSVP (inserted while signed in) | 1 row |
| 12 | supporter | select someone else's RSVP | 0 rows |
| 13 | member | `select count(*) ... coll='people' and owner='committee'` | > 0 |
| 14 | member | `... owner like 'campaign:%'` | 0 |
| 15 | member | update a committee person | 0 rows updated |
| 16 | member | insert `walkResults` | ok; `created_by` = member |
| 17 | member | insert `votes`, then update it | insert ok, update 0 rows |
| 18 | board | update a committee person; read campaign people | ok; > 0 |
| 19 | board (svgop) | select `people` in `demo` | 0 |
| 20 | candidate (Elena) | select `people` where owner = `campaign:elena-marsh` / `committee` | > 0 / 0 |
| 21 | candidate | update own `campaignSites` row setting `endorsementPaused=false` | error "endorsement is set by the committee" |
| 22 | candidate | update own site to `status:'live'` with no disclaimer | error "disclaimer" |
| 23 | candidate | update another campaign's site | 0 rows |
| 24 | candidate | change `socialPlan` entry of another candidate | error |
| 25 | master | select `people` any county | 0; `select crm_stats('svgop')` returns counts |
| 26 | master | select `rsvps` | 0 |
| 27 | master | insert `networkPushes` (global) | ok; board insert → RLS error |
| 28 | board | `select create_invite('svgop', 'x@example.com', null, '<candId>', 'x', 'owner')` | invite row; anon `invite_preview(token)` shows masked email |
| 29 | other signed-in user | `claim_invite(token)` with a different email | error "This invite was sent to a different email" |
| 30 | invitee | `claim_invite(token)` | profile role = candidate, slug set; second claim → "already used" |
| 31 | supporter | `select set_role(<self>, 'board', 'svgop')` | error |
| 32 | any | insert into a collection missing from `coll_policies` | RLS error (fails closed) |
| 33 | anon | `select public_counts('svgop')` | numbers only |
| 34 | anon | `withdraw_submission('svgop','rsvps','t1','<receipt>')` | true; wrong receipt → false |

### 8.1a What has already been run
Before review, `schema.sql` and `seed.sql` were loaded into PGlite (Postgres compiled to WebAssembly) with a small stand-in for Supabase's `auth` schema and roles. The script ran twice without errors (idempotent), and the RLS tests above passed as anon, supporter, member, board, candidate (through a real `create_invite` and `claim_invite`) and master, along with server-side ingestion, `public_counts`, `withdraw_submission` and `crm_stats` (55 checks). `store-supabase.js` passed 25 checks against a fake supabase-js client, and `app.html` loaded with both adapters and a fake client at 390px with zero console errors (sign-in sheet, wrong-code message, claim page). The Edge Function type-checks under `tsc --strict` with Deno shims. None of this replaces the tests against a real project below.

### 8.2 Edge Function tests
- No `Authorization` header → 401. Supporter calling a broadcast → 403. Member → 403. Board → 200 with counts.
- Broadcast to a list containing a do-not-contact person, an opted-out person and a person with no email → `counts` show each skip; no email reaches them (check the Resend dashboard).
- Missing `paidForBy` or mailing address in `crmConfig` → 422 with the same message `crm.js` shows.
- Sending the same broadcast twice → the second call returns 409 (status already `sending`/`sent`).
- Unsubscribe link → `optOuts` row inserted, person's `emailOptIn` false, next broadcast skips them.
- Invite email: board → 200; candidate staff inviting an owner → 403.
- RSVP webhook with wrong secret → 401; correct secret → one email; replay → skipped.

### 8.3 Browser tests (Playwright, `BACKEND='supabase'` against a staging project)
- Signed out: RSVP, reload, "Your RSVP" still shows; cancel it; totals stay right.
- Sign up with email code, phone step shows a code on screen, profile row created as supporter.
- Two browsers as board: a post published in one appears in the other within 2 s (realtime).
- Go offline, add a note to a person, go online: the note saves and appears in the other browser.
- Board, member, candidate and master walk through every screen with zero console errors and no RLS errors in the network panel.
- `?demo=1`: sample accounts work, no requests to Supabase are made.

---

## 9. Open questions for the owner
1. **Invites by board vs master.** `create_invite` allows board of the county and Master Network staff. Confirm Master Network should be able to invite candidates.
2. **Claiming as an existing board member.** `claim_invite` refuses when the claimer is board or master, because claiming would replace their role. Should one person be able to hold both (needs a multi-role model)?
3. **One owner per campaign.** A second owner claim currently adds another owner. Should it demote the previous owner to staff?
4. **Phone in screen mode.** Phone numbers are stored but marked unverified until Twilio. Is that acceptable for launch, or should the phone field be optional until then?
5. **Who sees donations.** Members can read `donations` and `memberships` today (committee CRM is member-readable). Should donations be board-only (treasurer)?
6. **Recruited candidates are public.** `candidates` must be public because the public site and campaign pages read it, so pipeline notes on recruits are visible to anyone who queries the API. Should recruits move to a board-only collection with only endorsed candidates public?
7. **Sample data in production.** Should real counties start with the sample CRM people (marked Sample) or empty? `purge_sample` removes them.
8. **Sending domain.** Which domain will be verified in Resend, and will each county get its own From address?
9. **Captcha.** Turnstile on public forms now, or after the first abuse?

---

## 10. Go-live status (2026-10-16)

### 10.1 Live now
- **Database:** migrations `20261016180000_schema.sql`, `20261016180100_sample_seed.sql` and `20261016200000_meeting_votes.sql` are applied. `supabase/schema.sql` matches all three.
- **Pages:** `app.html`, `index.html` and `campaign.html` load `config.js`, `@supabase/supabase-js@2.45.4` from jsdelivr and `store-supabase.js`; the app also loads `auth-supabase.js` right after `auth.js`.
- **First paint (R1):** each page shows its loading state until `Store.ready`, then renders, then redraws on `hydrated`. A 9-second backstop timer means a page never stays on the spinner.
- **Broadcasts (R2):** on Supabase, Send saves the broadcast as a draft and calls `send-email`. Until email is connected the screen says "Email sending isn't connected yet. Your broadcast is saved as a draft." and never says "Sent". Due scheduled broadcasts stay scheduled, and one quiet notice appears per session. Master Network totals come from the `crm_stats` RPC.
- **Votes (R5):** `cast_vote()` records one vote per member under a row lock. A secret ballot adds to the tally, the voter list and the hashed-receipt list separately; the receipt stays with the voter (`votes`). Members can no longer change `ballots`, `box`, the meeting status, minutes or anyone else's check-in, and the meeting record is append-only for them (trigger `meeting_state_guard`). Board members keep full control. Quorum is still checked in the browser, because the seat list lives in `data.js`, and the ballot type (secret or roll call) comes from the browser.
- **Demo mode:** `?demo=1` is the old browser-only build with the sample accounts and the tour. It sends no requests to Supabase. The real sign-in sheet offers no sample accounts, only the quiet link "Try the demo with sample accounts".
- **Sign-in links:** `detectSessionInUrl` is on, so if Supabase sends a sign-in link instead of a code (the default template), opening the link still signs the person in.

### 10.2 Verified against the live project
- Signed-out RSVP, volunteer sign-up, membership application, petition signature and unsubscribe each returned HTTP 201 and showed their success state. A reload still showed "You're going" from the local copy. The event head count went from 38 to 39 and the petition count from 221 to 222.
- Server ingestion created one committee person and one timeline entry for each of the RSVP, volunteer, membership and signature submissions (checked with `supabase db query`). The opt-out matched no existing person, so it created none, as designed.
- Anonymous REST reads of `people`, `rsvps`, `interactions`, `volunteers`, `memberships`, `signatures` and `optOuts` returned `[]`, an unfiltered read returned only the 6 live petitions, and `profiles` returned permission denied.
- The RSVP cancel, volunteer and unsubscribe-undo paths all withdrew through `withdraw_submission` (true each time).
- R5, in one rolled-back transaction as a test member and a test board member: voting before check-in returned `checkin`; the first vote returned `ok`; a second vote returned `dup`, even when sent as a roll call; direct edits to the box, the roll, another member's check-in or the log failed, and so did deleting the meeting; anonymous callers got permission denied.
- App signed out at 390 and 1440: the overview, Public Media Hub and Newsroom render, the other 10 screens show their sign-in gates, and there is no horizontal scroll and no console errors. The public site and campaign page also showed no console errors on both backends.
- Demo mode at 390 and 1440: the tour ran all 31 steps, the sign-in sheet listed the sample accounts, every screen rendered as each of the 5 sample roles, and there were no console errors and no Supabase requests.
- Every test row was removed afterwards, including the 4 CRM people and their timelines, the membership and signature, the `crmIngest` entries and one test auth user. The live data is back to its seeded counts.

### 10.3 What is left for you
1. **Resend:** verify a sending domain (for example `mail.<county-domain>`) with SPF, DKIM and a DMARC record at `p=none`. Then create an API key with sending access only.
2. **Supabase Auth SMTP:** either use Dashboard → Authentication → Emails → SMTP Settings (host `smtp.resend.com`, port `465`, user `resend`, password the Resend key, sender `no-reply@<your verified domain>`, name `RCCC Network`), or uncomment the `[auth.email.smtp]` block in `supabase/config.toml`, set `admin_email` and run
   `RESEND_SMTP_PASS=re_xxx supabase config push --project-ref udnrlisexjymqousvkkn --yes`.
   Raise `[auth.rate_limit] email_sent` from 2 to about 30 per hour in the same push.
3. **Email templates and confirmations:** in `supabase/config.toml`, uncomment `[auth.email.template.magic_link]`, `[auth.email.template.confirmation]` and `[auth.email.template.email_change]`. `enable_confirmations` is already set to `true` there but has not been pushed yet. Then run `supabase config push --project-ref udnrlisexjymqousvkkn --yes`. Sign-up and sign-in emails will then carry the 6-digit code instead of a link.
   **Security note:** the live project still has confirmations off. In that mode Supabase marks an address confirmed without any code (a test sign-up to an address that could not receive mail came back confirmed). Anyone could then create an account under someone else's email, for example the address on a candidate invite, and `claim_invite` matches on email. Push `enable_confirmations = true` before you send any invites.
4. **Edge Function secrets:** `send-email` reads `RESEND_API_KEY` and `EMAIL_FROM` at startup and is missing both, so today every call fails with 500 `WORKER_ERROR`. That includes the one-click unsubscribe links. Run:
   `supabase secrets set RESEND_API_KEY=re_xxx EMAIL_FROM="SVGOP <no-reply@mail.your-domain.org>" --project-ref udnrlisexjymqousvkkn`
   No redeploy is needed. The function's CORS allows only `SITE_URL` (the GitHub Pages origin), so sends work from the published site, not from `localhost`.
5. **RSVP confirmations (Database Webhook):** Dashboard → Database → Webhooks → Create: table `public.docs`, event `Insert`, type HTTP Request, `POST https://udnrlisexjymqousvkkn.supabase.co/functions/v1/send-email`, headers `content-type: application/json` and `x-webhook-secret: <the WEBHOOK_SECRET you set>`. The function ignores every insert except new `rsvps` rows.
6. **Scheduled broadcasts (pg_cron):** Dashboard → Database → Extensions: enable `pg_cron` and `pg_net`. Then in the SQL editor:
   ```sql
   select vault.create_secret('<WEBHOOK_SECRET>', 'rccc_webhook_secret');
   select cron.schedule('rccc-scheduled-broadcasts', '* * * * *', $$
     select net.http_post(
       url := 'https://udnrlisexjymqousvkkn.supabase.co/functions/v1/send-email',
       headers := jsonb_build_object('content-type', 'application/json',
         'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'rccc_webhook_secret')),
       body := '{"kind":"scheduled"}'::jsonb)
   $$);
   ```
   Until then, an open board session sends due email broadcasts through the function once a minute.
7. **First real accounts:** sign up on the published site, then in the SQL editor run `select set_role('<your user id>', 'board', 'svgop');`. To let a member vote in Meetings & Voting, link their seat with `update profiles set member_id = '<member id from data.js>' where id = '<user id>';`.
8. **Sample data:** when the committee is ready, a board member uses account menu → "Remove sample data". This deletes every row marked sample in that county.

### 10.4 Switching back to browser storage
In `config.js`, change `BACKEND: 'supabase'` to `BACKEND: 'local'`. Every page goes back to the localStorage build with the sample accounts on its next load. No other file changes, and the database is untouched.

### 10.5 Known gaps
- **R3:** `socialPlan` is still one key per county, so a candidate can read every candidate's plan in their county. Writes are guarded. Splitting the key per candidate also needs `doc_access()` to match the `socialPlan:<candidateId>` suffix against the caller's candidate id, because today `map_guard` gives every candidate access to every `socialPlan*` key.
- In demo mode, the public site's petition pages are empty in a fresh browser until the app has been opened once, because `crm.js` seeds them. This was already the case before this change.
- A sign-in attempt for an unknown email logs the 422 response as a resource error in the browser console. Chrome does this for any failed request. The sheet itself shows a clear message.
- Without custom SMTP, Supabase sends auth emails only to project team members, and they arrive as links. A sign-up to any other address can still create an account (confirmed, while confirmations are off) even though no email goes out. Deleting those accounts in Authentication → Users is safe.
