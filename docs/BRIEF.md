# RCCC Network: build brief

Every agent working on this repo reads this file first. The supervisor (the main session) owns this brief, `index.html` until the public-site agent takes it over, git, and all commits. **Agents never run git commands.**

## 1. What we are building

One platform for every Republican County Central Committee in California. Each county gets:

- **A public website** that voters use: news, the voter guide, events, endorsed candidates, volunteering, membership and donations.
- **A committee platform** for signed-in people: website content and local ad slots (Committee Portal), candidate pipeline and campaign sites (Campaign-in-a-Box), turf and walk lists (Field Organizer), meetings and votes (Meetings & Voting).
- **A Master Network console** for state-level staff: shared news pushes, network ads, analytics, and the AI Campaign Director.

SVGOP (Santa Clara County) is the seed county. Demo County GOP is the second county, which proves the platform is multi-tenant.

The previous version was a clickable stakeholder prototype. **This round takes it beyond prototype**: real pages that work for real users, real sign-in, saved actions, real maps, and finished copy and design. The modules, their purpose and their content stay the same. We are making them real, not inventing new products.

### Data honesty
- The SVGOP 2026 voter guide (`voter-guide-data.js`) is real data from svgop.com. Never alter it.
- `newsroom-data.js` holds real vetted headlines and videos. Use them as given.
- Everything else in `data.js` (members, candidates other than the voter guide, turfs, ad sponsors, tallies) is invented. Wherever invented records appear on a public page, a small, quiet "Sample" label stays on them. Do not put "Prototype", "simulated", "mock" or "demo" in user-facing copy anywhere else.

## 2. Architecture (keep it)

- Static site, classic `<script>` files, ES2020, no build step, no bundler, no framework. It is hosted on GitHub Pages.
- `app.html` is the platform shell (topbar, sidebar, hash router in `core.js`, screens registered with `App.register({id,title,group,icon,blurb,render(el, ctx)})`).
- `index.html` becomes the **standalone public county website** (owned by the public-site agent). The county is chosen by `?county=svgop|demo` (default `svgop`).
- Screens inject their own scoped CSS (`.scr-xyz ...`) from their own file. Global tokens live in `styles.css` (`--brand`, `--brand-ink`, `--accent`, `--master`, `--ink*`, `--line*`, `--surface*`, `--r*`, `--shadow-*`, `--font-head`, `--font-body`, `--ok/--warn/--danger/--info` and their `-soft` variants). Use tokens, never new hard-coded brand colors.
- External libraries load only from `cdnjs.cloudflare.com`, `cdn.jsdelivr.net/npm/` or `unpkg.com` with an exact version (e.g. Leaflet 1.9.4). Fonts come from Google Fonts only.
- Tenant theming: `App.ctx.tenant.colors` is applied to `--brand/--brand-ink/--accent` by `core.js`.

### File ownership (parallel agents must not edit files they do not own)
| Owner | Files |
|---|---|
| Foundation agent | `store.js` (new), `auth.js` (new), `core.js`, `styles.css`, `app.html`, `screens/account.js` (new), `data.js` (accounts seed only) |
| Public-site agent | `index.html`, `site.js`/`site.css` (new), `screens/public-hub.js`, `screens/newsroom.js`, `voter-guide.js`, `newsroom-data.js` |
| Field agent | `screens/field.js` |
| Committee agent | `screens/portal.js`, `screens/governance.js` |
| Candidate agent | `screens/candidate.js` |
| Network agent | `screens/master.js`, `screens/director.js`, `screens/overview.js`, `tour.js` |

If you need a change in a file you do not own, write it under **"Requests for other owners"** in your final report. Do not make the change yourself.

## 3. Shared contracts (implemented by the foundation agent, used by everyone)

### `window.Store`: the data layer
All saved state goes through `Store`, never through `localStorage` directly and never only through `App.state`. Today it persists to `localStorage`. Later it gets swapped for a hosted database without screen changes, so keep calls to this API.

```js
Store.get(key, fallback)          // tenant-scoped JSON value
Store.set(key, value)
Store.list(coll)                  // array of docs, tenant-scoped
Store.add(coll, doc)              // returns saved doc with id, createdAt, createdBy (user id or null)
Store.update(coll, id, patch)     // returns updated doc
Store.remove(coll, id)
Store.on(name, fn)                // fires on set/add/update/remove of that key or coll; returns unsubscribe
Store.global                      // same API, not tenant-scoped (accounts, sessions)
Store.reset()                     // clears saved data for all tenants (used by a "Reset sample data" control)
```
Keys are namespaced as `rccc:v1:<tenant>:<name>`. Every storage access is wrapped in try/catch with an in-memory fallback, so the site works in private windows.

### `App.auth`: accounts and roles
```js
App.auth.user            // null when signed out, else { id, name, email, phone, zip, role, tenant, verified:{email,phone}, createdAt }
App.auth.role            // 'public' when signed out, else user.role
App.auth.can(cap)        // boolean, see the capability table
App.auth.require(cap, { reason })  // returns true if allowed; otherwise opens the sign-in sheet (signed out) or a polite "needs <role>" notice, and returns false
App.auth.open('signin' | 'signup')  // opens the account sheet from anywhere
App.auth.signOut()
App.auth.onChange(fn)    // returns unsubscribe
```
The screen context gains `ctx.user` and `ctx.can`.

Verification: sign-up verifies email and phone with 6-digit codes, and sign-in sends a code to email or phone. **Until real email and SMS APIs are connected, each code is shown in a toast** (e.g. "SVGOP code for jordan@…: 482 913"). Codes expire after 10 minutes and allow 5 attempts.

Roles, from least to most access: `public` (signed out) → `supporter` → `member` (central committee member or alternate) → `board` (executive board) → `master` (Master Network admin).

| Capability | Minimum role |
|---|---|
| `rsvp`, `volunteer`, `donate`, `join` | public (asks for name and contact if signed out) |
| `profile` | supporter |
| `portal.view`, `field.canvass`, `governance.attend`, `governance.vote` | member |
| `portal.edit`, `ads.manage`, `candidate.manage`, `field.manage`, `governance.run` | board |
| `master.*`, `director.*` | master |

Sample accounts (seeded, labeled "Sample accounts" on the sign-in sheet, each one click): a supporter, a committee member, the SVGOP chair (board), and a Master Network admin. In the app shell, the "Viewing as" dropdown is replaced by an account menu. The guided tour may still switch between sample accounts.

## 4. Quality bar: what the supervisor will reject

### Design
- Feels alive and clean. Motion is purposeful and present: page and section transitions, hover and press states, list insertions, toasts, sheet open and close, map fly-to. All motion respects `prefers-reduced-motion`.
- Nothing looks generic: no default-looking cards stacked endlessly, no stock "dashboard template" feel. Use the existing type pairing (Archivo display, Public Sans text), strong hierarchy and generous spacing.
- No glitches: no overlapping elements, clipped text, horizontal page scroll, layout shift on load, or dead buttons. Every control does something real or is removed.
- Works at 360, 390, 768, 1024, 1280 and 1440 widths. Touch targets are at least 44px on phones.
- Accessible: semantic HTML, labels, visible focus, keyboard support, AA contrast, `aria-live` for toasts.

### User journey
- Every flow has the fewest steps that still work: no confirmation screens that confirm nothing, and no forms asking for data we never use.
- Each page has one obvious primary action. Secondary actions look secondary.
- Empty, loading, error and success states are all designed.
- What a person did is visible afterward (their RSVP, vote, post or sign-up shows up where they'd look for it), and it survives a reload.

### Language
Plain, specific and warm, the way a good county chair talks to neighbors. Write complete sentences with concrete nouns and real numbers.
**Banned:**
- Three-part lists used for rhythm ("fast, simple, and secure"). Use two items or four, or just say the one that matters.
- Sentence fragments as style ("Your fit. Measured." / "No forms. No hassle.").
- Contrast setups and overcorrections ("It's not X, it's Y", "not just X but Y", "more than just").
- AI clichés: seamless, effortless, empower, unlock, elevate, leverage, robust, streamline, cutting-edge, game-changer, delve, journey, "in today's world", "behind the scenes", "behind them", "at your fingertips", "all in one place", "look no further", "whether you're X or Y".
- Em dashes in body copy (one occasional dash in a headline is fine). Exclamation points, except in a real thank-you.
- Vague benefit claims without a number or example.
Button labels are verbs that say what happens ("RSVP", "Send code", "Save walk results").

## 5. How to verify your work
- A local server already runs at `http://localhost:8000/` serving the repo root. Use it.
- Headless browser: Playwright with Chromium is installed at
  `/private/tmp/claude-502/-Users-Jahshua-Library-Application-Support-Claude-scratch-workspaces-3e05ea76-0679-4146-8edc-c06a74c946ec-c36484ab-1423-443c-8cb4-e060833f80a6-scratch-2026-10-15-1755f1/0e40dfc0-3794-4348-b045-c87c6c9ba977/scratchpad/pw`
  Put your test scripts in your own folder under that `scratchpad` directory (never in the repo) and run them with `node`, resolving `playwright` from the `pw` folder (e.g. `require('<that path>/node_modules/playwright')`). Do **not** use the app's built-in browser pane: other agents share it.
- Before reporting done: run `node --check` on every JS file you touched, load your screens at 390px and 1440px, capture screenshots, read them, fix what you see, and confirm zero console errors.
- Final report: what you built, every file touched, how you verified it (including screenshot paths), known gaps, and requests for other owners.

## 6. Foundation API (built, available now)
```js
// Store
Store.get(key, fallback) / set(key, value) / list(coll) / add(coll, doc) / update(coll, id, patch) / remove(coll, id)
Store.on(name, fn)       // detail = {type:'set'|'add'|'update'|'remove'|'external'|'reset', name, tenant, doc?, value?, id?}; '*' = all; returns unsubscribe
Store.global             // same API, not tenant-scoped
Store.forTenant(slug)    // same API for an explicit county (Master console)
Store.reset()            // clears every county's saved data; fires 'reset'
Store.addMany(coll, docs) / updateMany(coll, {id: patch}) // batch writes (also on Store.global and forTenant): one storage write, one event {type:'addMany', docs} / {type:'updateMany', ids}; addMany returns saved docs like add

// App.auth
App.auth.user            // null or {id,name,email,phone,zip,role,tenant,verified,sample,title?,memberId?,createdAt}
App.auth.role            // effective role in the current county: public | supporter | member | board | master
App.auth.can(cap)        // brief's table; a role name also works: can('member')
App.auth.require(cap, {reason, onSuccess})  // true if allowed; else opens sign-in (calls onSuccess(user) after) or a notice
App.auth.open('signin'|'signup', {reason, prefill, onSuccess})
App.auth.signInSample(role) / signOut() / onChange(fn)
App.auth.validate.{email,phone,zip,name}(v) -> '' or message;  App.auth.format.{phone,maskEmail,maskPhone}

// core
ctx.user, ctx.can(cap), ctx.auth, ctx.store
App.toast(msg, kind, {duration, html})   // kinds: info | ok | warn | error | code
App.setRole(role)        // tour only: signs in as that role's sample account ('public' signs out)
// Screen defs may set minRole (overrides its group gate) and gateText.
// Gates are central: a screen only renders for allowed roles. Inside a screen, use ctx.can() for finer permissions.
```
**Saving actions:** call `Store.add(coll, doc)` and include a `title`, so the action appears on the person's `#/account` page. Collections: `rsvps` (date, location, guests), `volunteers`, `donations` (amount, to, recurring, receipt), `posts`, `votes` (receipt only, never the choice), `walkResults` (address or turf, result, doors). For public-site actions by signed-out people, ask only for name and one contact method, then save the doc with that contact info.

**Old code to remove everywhere:** any "Viewing as" text, `ctx.role === 'volunteer'` checks, "switch your role" toasts, banners saying locked screens open for everyone, and `data-asrole` preview buttons (use `App.setRole` if a preview is truly needed).

## 7. Reports to read before you start
In `/private/tmp/claude-502/-Users-Jahshua-Library-Application-Support-Claude-scratch-workspaces-3e05ea76-0679-4146-8edc-c06a74c946ec-c36484ab-1423-443c-8cb4-e060833f80a6-scratch-2026-10-15-1755f1/0e40dfc0-3794-4348-b045-c87c6c9ba977/scratchpad/reports/`:
- `copy-audit.md`: the glossary and voice sheet (top), then a section per file with exact rewrites. Apply every rewrite for your files, and follow the glossary in all new copy.
- `qa-baseline.md`: QA findings grouped by file (it may still be in progress; check again midway through your work). Fix every blocker and major finding for your files, and the minor ones where you can.

## 8. Cross-module data contracts (writers and readers must match exactly)
| Store name | Scope | Written by | Read by | Doc shape |
|---|---|---|---|---|
| `posts` | county | Committee Portal | public site (county news), `#/account` | `{id, title, summary, body, tag, status:'published'|'draft', publishedAt, createdBy}` |
| `events` | county | Committee Portal | public site, Field Organizer | `{id, title, kind, date:'YYYY-MM-DD', time, location, lat, lng, capacity?, status:'published'|'draft'}`. These are added to the seed `tenant.events`; a doc with the same id as a seed event overrides it |
| `localAds` | county | Committee Portal (ad slots) | public site | `{id, placement:'SIDEBAR_TOP'|'IN_FEED'|'FOOTER_BANNER', title, sponsor, cta, url, active}` overrides the seed ad in that placement |
| `siteSettings` (key) | county | Committee Portal | public site | `{tagline, heroNote, layout:'classic'|'newsroom'}` |
| `rsvps` | county | public site, Committee Portal | `#/account`, Committee Portal, Field Organizer | `{id, eventId, title, date, location, name, contact, guests, createdBy}` |
| `volunteers` | county | public site | Field Organizer, Committee Portal, `#/account` | `{id, title, name, contact, interests:[], zip, createdBy}` |
| `memberships`, `donations` | county | public site | Committee Portal, `#/account` | `{id, title, name, contact, amount?, createdBy}` |
| `networkPushes` | **global** | Master Network | public site, Committee Portal | `{id, title, summary, tag, source, tenants:[slugs], locked:boolean, priority:0-100, tab:'national'|'state', createdAt}` (priority ≥ 100 + locked = statewide alert) |
| `networkAds` | **global** | Master Network | public site | `{id, placement:'HEADER_BANNER'|'IN_FEED'|'SIDEBAR_BOTTOM', title, sponsor, cta, url, tenants:[slugs], active}` |
| `campaignSites` | county | Campaign-in-a-Box | `campaign.html`, public site (endorsed candidates) | `{id, candidateId, slug, status:'draft'|'review'|'live', headline, about, issues:[], donateUrl, volunteerOn:boolean, photo, colors}` |
| `walkResults` | county | Field Organizer | Field Organizer, `#/account` | `{id, title, turfId, address, result:'talked'|'not_home'|'refused'|'moved'|'yard_sign', support:1-5?, notes, doors, createdBy}` |
| `meetingState` (key), `votes`, `proxies` | county | Meetings & Voting | Meetings & Voting, `#/account` | as needed; `votes` hold a receipt only |
| `networkPrefs` (key) | county | Committee Portal | public site | `{hidden:[pushIds], pinned:[pushIds]}`: hide or pin network pushes on this county's site (locked pushes can't be hidden) |
| `channelMessages` | **global** | Committee Portal | Committee Portal | `{channelId, from, county, text, createdAt}` |
| `joinedChannels` (key), `fileLibrary` | county | Committee Portal | Committee Portal | as needed |
| `fileCopies` | **global** | Committee Portal | Committee Portal | as needed |
| `directorPlans` | county | AI Campaign Director | Director, Campaign-in-a-Box | `{id, candidateId, steps:[], approvals:[{by:name, at}], status}` |

Notes: `localAds.active === false` means the slot shows nothing (or falls back to a network ad). Event `capacity` may be null (no limit). Event `time` is a display string like `9:00 AM`.

The seed data in `data.js` stays the baseline. Saved docs layer on top. Never mutate `window.DATA` to persist anything.

### Public URLs
- `index.html?county=svgop` is the county website. Supported hash routes are `#/` (home), `#/guide` (voter guide), `#/events`, `#/events/<id>`, `#/volunteer`, `#/join`, `#/donate`, `#/news/<id>` and `#/candidates`. `?layout=newsroom` previews the alternate homepage, and `?zones=1` labels the network and local zones (used by the app's preview).
- `campaign.html?county=svgop&c=<slug>` is a candidate's public campaign site.
- `app.html#/...` is the committee platform.

## 9. Wave 3: CRM, outreach and candidate accounts

### 9.1 Candidate accounts (role `candidate`)
- A candidate account belongs to one campaign: `user.role = 'candidate'`, `user.candidateId`, `user.campaignSlug`, `user.campaignRole = 'owner' | 'staff'`.
- It sits outside the linear role ladder: a candidate has supporter abilities plus `campaign.own` (edit their own campaign site, events, print, social) and `crm.campaign` (their campaign's CRM). It has no committee capabilities.
- The sidebar shows a **My Campaign** group (`#/mycampaign`) to candidates. Board members can also open My Campaign for any candidate, to support them.
- **Invites:** `Store` collection `invites` `{id, email, phone, role:'candidate', candidateId, campaignSlug, campaignRole, invitedBy, status:'sent'|'claimed'|'revoked', token, createdAt}`. The board sends one from Campaign-in-a-Box. The candidate opens `app.html#/claim/<token>`, verifies email and phone (codes by toast), and lands in My Campaign. Until email delivery is connected, the invite link is shown in a toast and a copy button.
- **Takeover rules:** once claimed, the candidate edits their site directly. The committee keeps the endorsement badge (it can pause the endorsement) and the disclaimer check, which blocks publishing without "Paid for by …, FPPC ID #…". Committee edits to candidate content go through a suggestion the candidate accepts.
- **Sample accounts:** one candidate per county (SVGOP: Elena Marsh, campaign owner).

### 9.2 People CRM (`crm.js` engine, `App.crm`)
Every CRM record has an `owner`: `'committee'` (the county party) or `'campaign:<slug>'` (a candidate's campaign). Committee users see only `committee` records. A candidate sees only their campaign's records. These are separate legal entities, so **records never cross owners automatically**. Moving people between them is an explicit share that's logged in `shares` `{from, to, personIds, by, at, note}`.

| Collection (county scope) | Shape |
|---|---|
| `people` | `{id, owner, firstName, lastName, name, email, phone, zip, city, tags:[], support:1-5|null, roles:['supporter'|'volunteer'|'donor'|'member'|'candidate'|'press'|'elected'], pointPersonId, emailOptIn, smsOptIn, doNotContact, source, sample?, createdAt, lastActivityAt}` |
| `interactions` | `{id, owner, personId, type:'note'|'call'|'email'|'text'|'meeting'|'rsvp'|'volunteer'|'donation'|'membership'|'walk'|'signature'|'share', summary, outcome?, by, at, refColl?, refId?}` |
| `lists` | `{id, owner, name, filter:{tags, roles, support, zip, city, optIn, lastActivityDays}, createdBy}` (saved segments) |
| `paths` | `{id, owner, name, goal, steps:[{id, name, assigneeId}]}` |
| `pathEntries` | `{id, owner, pathId, personId, stepId, status:'active'|'done'|'dropped', due, updatedAt}` |
| `tasks` | `{id, owner, personId?, title, due, assigneeId, done}` |
| `broadcasts` | `{id, owner, channel:'email'|'sms', sender:{name, title}, listId, subject?, body, status:'draft'|'scheduled'|'sent', scheduledFor?, sentAt?, counts:{sent, skippedOptOut, skippedQuietHours, skippedNoContact}}` |
| `callCampaigns` | `{id, owner, name, listId, script, questions:[{id, text, options}], status}`; call results are `interactions` of type `call` |
| `petitions` | `{id, owner, kind:'petition'|'survey', slug, title, ask, goal, questions?, status:'draft'|'live'|'closed'}`; signatures go to collection `signatures` `{id, petitionId, name, email, phone, zip, answers?, optIn, createdAt}` |

**Ingestion.** `App.crm.ingest()` turns existing actions into people and interactions. It is idempotent (it tracks ingested `refColl:refId` pairs) and dedupes by normalized email, then phone:
- `rsvps`, `volunteers`, `memberships`, `donations` and `signatures` without a campaign go to `committee`;
- `volunteers` with `campaign: <slug>` and campaign-site signatures go to `campaign:<slug>`;
- `walkResults` add a `walk` interaction to the matching sample voter if there is one.
It runs on app load and on `Store.on` changes.

**Seed.** About 150 sample people per county, generated deterministically from `data.js` members, volunteers and invented supporters. They're labeled `sample: true` and show a quiet "Sample" mark. Sample candidates' campaigns get about 40 people each.

**Compliance (built in, not optional):**
- Email broadcasts add an unsubscribe line and the committee's mailing address, and skip people who opted out or are marked do-not-contact.
- Texts go only to `smsOptIn` people, honor STOP, and refuse to send outside 8 AM to 9 PM recipient local time (scheduling for the next allowed time instead).
- Every political broadcast carries the "Paid for by" disclaimer.
- Donor records warn when a gift would pass a per-election limit, set in config by the treasurer. Show the configured number; never state a legal limit as fact.

Sending: until email and SMS APIs are connected, a send shows a summary toast and logs an `interactions` row per recipient. Copy may say "Sent to 214 people", but it must not claim delivery receipts.

**Statewide view.** `App.crm.stats(slug)` returns aggregate counts only (people, new this month, volunteers, donors, opt-in rates, response rates). Master Network reads these and never individual records.

### 9.3 File ownership for wave 3
| Owner | Files |
|---|---|
| Accounts agent (Sonnet) | `auth.js`, `core.js`, `app.html`, `styles.css`, `screens/account.js` (candidate role, invites and claim flow, new sidebar groups, script tags) |
| CRM agent (Opus) | `crm.js` (new), `screens/people.js` (new: `#/people`, lists, paths, tasks), `screens/outreach.js` (new: `#/outreach`, broadcasts, phone bank, petitions and surveys admin) |
| Candidate agent (Opus) | `screens/candidate.js`, `campaign.html`/`campaign.js`/`campaign.css`, `screens/mycampaign.js` (new) |
| Public-site agent | `site*.js`, `site.css`, `index.html` (adds public petition and survey pages) |
| Network agent | `screens/master.js` (statewide CRM totals) |

Sidebar groups: add **People & Outreach** (People, Outreach; `member` to view, board to send broadcasts) and **My Campaign** (candidates, plus board).
