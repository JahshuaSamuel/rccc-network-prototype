-- =====================================================================================
-- RCCC Network: Supabase schema (Postgres 15)
-- Paste the whole file into the Supabase SQL editor and run it. It is idempotent: run it
-- again after every change. See docs/SUPABASE.md for the design and the test plan.
--
-- Shape
--   tenants         one row per county, plus 'global'
--   profiles        1:1 with auth.users (name, phone, zip, role, county, campaign)
--   docs            generic documents, primary key (tenant, coll, id); mirrors window.Store.
--                   Store keys (Store.get/set) are rows with id = '__key__'.
--   coll_policies   per-collection read/write rules; doc_access() reads it. No row = closed.
--   anon_rate       per-IP counters for anonymous inserts
--
-- Security model: RLS on every table, failing closed. Roles and capabilities mirror auth.js
-- and the CRM owner guard in crm.js. Only SECURITY DEFINER RPCs change roles.
-- =====================================================================================

create extension if not exists pgcrypto with schema extensions;

-- -------------------------------------------------------------------------------------
-- 1. Tables
-- -------------------------------------------------------------------------------------
create table if not exists public.tenants (
  slug            text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  name            text not null,
  short_name      text,
  mailing_address text,          -- fallback when crmConfig has none
  paid_for_by     text,          -- fallback when crmConfig has none
  email_from      text,          -- e.g. 'SVGOP <news@mail.svgop.com>' (verified in Resend)
  created_at      timestamptz not null default now()
);
alter table public.tenants add column if not exists county_name text;   -- used in {county} merge fields
insert into public.tenants (slug, name, short_name) values
  ('global', 'RCCC Network', 'RCCC Network'),
  ('svgop',  'Santa Clara County Republican Party', 'SVGOP'),
  ('demo',   'Demo County Republican Party', 'Demo County GOP')
on conflict (slug) do nothing;
update public.tenants set county_name = 'Santa Clara County' where slug = 'svgop' and county_name is null;
update public.tenants set county_name = 'Demo County' where slug = 'demo' and county_name is null;

create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  name           text not null default '',
  email          text,
  phone          text,
  zip            text,
  role           text not null default 'supporter'
                 check (role in ('supporter', 'member', 'board', 'master', 'candidate')),
  tenant         text references public.tenants (slug),
  title          text,
  member_id      text,
  office         text,
  candidate_id   text,
  campaign_slug  text check (campaign_slug is null or campaign_slug ~ '^[a-z0-9-]{1,80}$'),
  campaign_role  text check (campaign_role is null or campaign_role in ('owner', 'staff')),
  sample         boolean not null default false,
  verified       jsonb not null default '{"email": false, "phone": false}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint profiles_candidate_shape check (
    role <> 'candidate' or (tenant is not null and campaign_slug is not null and candidate_id is not null and campaign_role is not null)
  )
);
create index if not exists profiles_tenant_role on public.profiles (tenant, role);
create index if not exists profiles_campaign on public.profiles (tenant, campaign_slug) where campaign_slug is not null;
create index if not exists profiles_email on public.profiles (lower(email));

create table if not exists public.docs (
  tenant        text not null references public.tenants (slug) on update cascade,
  coll          text not null check (coll ~ '^[A-Za-z][A-Za-z0-9_.-]{0,60}(:[A-Za-z0-9_.:-]{1,100})?$'),
  id            text not null check (length(id) between 1 and 120),
  owner         text,                       -- 'committee' | 'campaign:<slug>' (CRM and intake), else null
  data          jsonb not null default '{}'::jsonb,
  sample        boolean not null default false,
  receipt_hash  text,                       -- sha256 of an anonymous submitter's receipt (withdraw_submission)
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (tenant, coll, id)
);
create index if not exists docs_list       on public.docs (tenant, coll, created_at, id);
create index if not exists docs_owner      on public.docs (tenant, coll, owner) where owner is not null;
create index if not exists docs_created_by on public.docs (created_by) where created_by is not null;
create index if not exists docs_updated    on public.docs (tenant, updated_at);
create index if not exists docs_sample     on public.docs (tenant) where sample;
create index if not exists docs_people_email on public.docs (tenant, owner, lower(data ->> 'email')) where coll = 'people';
create index if not exists docs_people_phone on public.docs (tenant, owner, (data ->> 'phone')) where coll = 'people';
create index if not exists docs_interactions_person on public.docs (tenant, (data ->> 'personId')) where coll = 'interactions';
create index if not exists docs_invite_token on public.docs ((data ->> 'token')) where coll = 'invites';
create index if not exists docs_rsvp_event on public.docs (tenant, (data ->> 'eventId')) where coll = 'rsvps';
create index if not exists docs_sig_petition on public.docs (tenant, (data ->> 'petitionId')) where coll = 'signatures';

create table if not exists public.coll_policies (
  coll            text primary key,
  scope           text not null check (scope in ('tenant', 'global')),
  kind            text not null default 'coll' check (kind in ('coll', 'key')),
  read_min        text not null default 'nobody',   -- min role that reads every row
  public_status   text[],                           -- rows anyone reads when status matches
  status_default  text,                             -- status assumed when data.status is missing
  insert_min      text not null default 'nobody',   -- min role that may insert ('public' = signed-out visitors)
  write_min       text not null default 'nobody',   -- min role for insert, update and delete of any row
  own_rows        boolean not null default false,   -- signed-in creator always reads own rows
  own_update      boolean not null default false,   -- ... and may update or delete them
  intake          boolean not null default false,   -- public-action rows: member reads committee rows, candidate reads own campaign rows, master refused
  crm             boolean not null default false,   -- CRM owner rule replaces the role rules
  campaign_field  text,                             -- data field compared to the candidate's campaign slug
  candidate_field text,                             -- data field compared to the candidate's candidate id
  campaign_ops    text not null default 'none' check (campaign_ops in ('none', 'read', 'update', 'write')),
  map_guard       boolean not null default false,   -- key holds {candidateId: value}; a candidate may change only their entry
  snapshot        boolean not null default false,   -- the browser may keep a localStorage snapshot (no personal data)
  note            text,
  constraint coll_policies_roles check (
    read_min in ('public', 'supporter', 'member', 'board', 'master', 'nobody') and
    insert_min in ('public', 'supporter', 'member', 'board', 'master', 'nobody') and
    write_min in ('public', 'supporter', 'member', 'board', 'master', 'nobody') and
    write_min <> 'public'
  )
);

create table if not exists public.anon_rate (
  ip            text not null,
  tenant        text not null,
  window_start  timestamptz not null,
  n             int not null default 0,
  primary key (ip, tenant, window_start)
);

-- -------------------------------------------------------------------------------------
-- 2. Collection policies (the table in docs/SUPABASE.md section 3). Re-running updates them.
-- -------------------------------------------------------------------------------------
insert into public.coll_policies
  (coll, scope, kind, read_min, public_status, status_default, insert_min, write_min, own_rows, own_update, intake, crm,
   campaign_field, candidate_field, campaign_ops, map_guard, snapshot, note)
values
  -- county content
  ('posts',              'tenant', 'coll', 'member', '{published}', 'published', 'board',  'board',  false, false, false, false, null, null, 'none', false, true,  'Committee Portal news'),
  ('events',             'tenant', 'coll', 'member', '{published}', 'published', 'board',  'board',  false, false, false, false, null, null, 'none', false, true,  'overrides seed events by id'),
  ('localAds',           'tenant', 'coll', 'public', null, null,                 'board',  'board',  false, false, false, false, null, null, 'none', false, true,  'ads.manage'),
  ('siteSettings',       'tenant', 'key',  'public', null, null,                 'board',  'board',  false, false, false, false, null, null, 'none', false, true,  null),
  ('networkPrefs',       'tenant', 'key',  'public', null, null,                 'board',  'board',  false, false, false, false, null, null, 'none', false, true,  null),
  ('hiddenPushes',       'tenant', 'key',  'public', null, null,                 'board',  'board',  false, false, false, false, null, null, 'none', false, true,  'legacy'),
  ('pinnedPushes',       'tenant', 'key',  'public', null, null,                 'board',  'board',  false, false, false, false, null, null, 'none', false, true,  'legacy'),
  ('candidates',         'tenant', 'coll', 'public', null, null,                 'board',  'board',  false, false, false, false, null, null, 'none', false, true,  'recruits; open question 6'),
  ('candidateStatus',    'tenant', 'key',  'public', null, null,                 'board',  'board',  false, false, false, false, null, null, 'none', false, true,  null),
  ('campaignSites',      'tenant', 'coll', 'member', '{live}', 'draft',          'board',  'board',  false, false, false, false, 'slug', null, 'write', false, true, 'guarded: endorsement and disclaimer'),
  ('eventProposals',     'tenant', 'coll', 'board',  null, null,                 'board',  'board',  false, false, false, false, 'campaignSlug', null, 'write', false, false, null),
  ('siteSuggestions',    'tenant', 'coll', 'board',  null, null,                 'board',  'board',  false, false, false, false, 'campaignSlug', null, 'update', false, false, 'candidate accepts or declines'),
  ('printOrders',        'tenant', 'coll', 'board',  null, null,                 'board',  'board',  false, false, false, false, null, 'candidateId', 'write', false, false, null),
  ('socialPlan',         'tenant', 'key',  'board',  null, null,                 'board',  'board',  false, false, false, false, null, null, 'write', true,  false, 'map keyed by candidate id; request R3'),
  ('directorPlans',      'tenant', 'coll', 'board',  null, null,                 'board',  'board',  false, false, false, false, null, 'candidateId', 'update', false, false, null),
  ('candidateStatusLog', 'tenant', 'coll', 'board',  null, null,                 'board',  'nobody', false, false, false, false, null, null, 'none', false, false, 'append-only'),
  ('endorsementLog',     'tenant', 'coll', 'board',  null, null,                 'board',  'nobody', false, false, false, false, null, null, 'none', false, false, 'append-only'),
  ('invites',            'tenant', 'coll', 'board',  null, null,                 'nobody', 'nobody', false, false, false, false, 'campaignSlug', null, 'read', false, false, 'written by invite RPCs only'),
  ('auditLog',           'tenant', 'coll', 'board',  null, null,                 'board',  'nobody', false, false, false, false, null, null, 'none', false, false, 'append-only'),
  -- public actions (intake)
  ('rsvps',              'tenant', 'coll', 'board',  null, null,                 'public', 'board',  true,  true,  true,  false, null, null, 'none', false, false, null),
  ('volunteers',         'tenant', 'coll', 'board',  null, null,                 'public', 'board',  true,  true,  true,  false, null, null, 'none', false, false, 'campaign sign-ups get owner campaign:<slug>'),
  ('memberships',        'tenant', 'coll', 'board',  null, null,                 'public', 'board',  true,  false, true,  false, null, null, 'none', false, false, null),
  ('donations',          'tenant', 'coll', 'board',  null, null,                 'public', 'board',  true,  false, true,  false, null, null, 'none', false, false, 'open question 5'),
  ('signatures',         'tenant', 'coll', 'board',  null, null,                 'public', 'board',  true,  false, true,  false, null, null, 'none', false, false, 'owner from petition'),
  ('optOuts',            'tenant', 'coll', 'board',  null, null,                 'public', 'board',  true,  true,  true,  false, null, null, 'none', false, false, 'also read by send-email'),
  -- field and meetings
  ('walkResults',        'tenant', 'coll', 'member', null, null,                 'member', 'board',  true,  true,  false, false, null, null, 'none', false, false, 'field.canvass'),
  ('votes',              'tenant', 'coll', 'member', null, null,                 'member', 'nobody', true,  false, false, false, null, null, 'none', false, false, 'receipts only, immutable'),
  ('proxies',            'tenant', 'coll', 'member', null, null,                 'member', 'board',  true,  true,  false, false, null, null, 'none', false, false, null),
  ('meetingState',       'tenant', 'key',  'member', null, null,                 'member', 'member', false, false, false, false, null, null, 'none', false, false, 'risk 7.6; request R5'),
  ('turfAssignments',    'tenant', 'key',  'member', null, null,                 'board',  'board',  false, false, false, false, null, null, 'none', false, false, 'field.manage'),
  ('joinedChannels',     'tenant', 'key',  'member', null, null,                 'board',  'board',  false, false, false, false, null, null, 'none', false, false, null),
  ('fileLibrary',        'tenant', 'coll', 'member', null, null,                 'board',  'board',  false, false, false, false, null, null, 'none', false, false, null),
  ('emailLog',           'tenant', 'coll', 'board',  null, null,                 'nobody', 'nobody', false, false, false, false, null, null, 'none', false, false, 'written by send-email'),
  -- CRM (owner rule)
  ('people',             'tenant', 'coll', 'nobody', null, null,                 'nobody', 'nobody', false, false, false, true,  null, null, 'none', false, false, null),
  ('interactions',       'tenant', 'coll', 'nobody', null, null,                 'nobody', 'nobody', false, false, false, true,  null, null, 'none', false, false, null),
  ('lists',              'tenant', 'coll', 'nobody', null, null,                 'nobody', 'nobody', false, false, false, true,  null, null, 'none', false, false, null),
  ('paths',              'tenant', 'coll', 'nobody', null, null,                 'nobody', 'nobody', false, false, false, true,  null, null, 'none', false, false, null),
  ('pathEntries',        'tenant', 'coll', 'nobody', null, null,                 'nobody', 'nobody', false, false, false, true,  null, null, 'none', false, false, null),
  ('tasks',              'tenant', 'coll', 'nobody', null, null,                 'nobody', 'nobody', false, false, false, true,  null, null, 'none', false, false, null),
  ('broadcasts',         'tenant', 'coll', 'nobody', null, null,                 'nobody', 'nobody', false, false, false, true,  null, null, 'none', false, false, 'sent by send-email'),
  ('callCampaigns',      'tenant', 'coll', 'nobody', null, null,                 'nobody', 'nobody', false, false, false, true,  null, null, 'none', false, false, null),
  ('petitions',          'tenant', 'coll', 'nobody', '{live,closed}', 'draft',  'nobody', 'nobody', false, false, false, true,  null, null, 'none', false, true,  'public petition pages'),
  ('shares',             'tenant', 'coll', 'nobody', null, null,                 'nobody', 'nobody', false, false, false, true,  null, null, 'none', false, false, null),
  ('crmConfig',          'tenant', 'key',  'nobody', null, null,                 'nobody', 'nobody', false, false, false, true,  null, null, 'none', false, false, 'crmConfig and crmConfig:campaign:<slug>'),
  ('crmIngest',          'tenant', 'key',  'nobody', null, null,                 'nobody', 'nobody', false, false, false, true,  null, null, 'none', false, false, 'written by crm_ingest_row'),
  ('crmMeta',            'tenant', 'key',  'nobody', null, null,                 'nobody', 'nobody', false, false, false, true,  null, null, 'none', false, false, null),
  -- global scope
  ('networkPushes',      'global', 'coll', 'public', null, null,                 'master', 'master', false, false, false, false, null, null, 'none', false, true,  null),
  ('networkAds',         'global', 'coll', 'public', null, null,                 'master', 'master', false, false, false, false, null, null, 'none', false, true,  null),
  ('networkPushArchive', 'global', 'coll', 'master', null, null,                 'master', 'master', false, false, false, false, null, null, 'none', false, false, null),
  ('networkOutreach',    'global', 'coll', 'master', null, null,                 'master', 'master', false, false, false, false, null, null, 'none', false, false, null),
  ('channelMessages',    'global', 'coll', 'member', null, null,                 'member', 'board',  true,  true,  false, false, null, null, 'none', false, false, null),
  ('fileCopies',         'global', 'coll', 'member', null, null,                 'board',  'board',  false, false, false, false, null, null, 'none', false, false, null)
on conflict (coll) do update set
  scope = excluded.scope, kind = excluded.kind, read_min = excluded.read_min, public_status = excluded.public_status,
  status_default = excluded.status_default, insert_min = excluded.insert_min, write_min = excluded.write_min,
  own_rows = excluded.own_rows, own_update = excluded.own_update, intake = excluded.intake, crm = excluded.crm,
  campaign_field = excluded.campaign_field, candidate_field = excluded.candidate_field, campaign_ops = excluded.campaign_ops,
  map_guard = excluded.map_guard, snapshot = excluded.snapshot, note = excluded.note;

-- -------------------------------------------------------------------------------------
-- 3. Small helpers
-- -------------------------------------------------------------------------------------
create or replace function public.now_iso() returns text
language sql stable as $$ select to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;

create or replace function public.norm_phone(p text) returns text
language sql immutable as $$
  select case when length(d) = 10 then d else '' end
  from (select case when length(x) = 11 and left(x, 1) = '1' then substr(x, 2) else x end as d
        from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as x) a) b
$$;

create or replace function public.safe_ts(t text) returns timestamptz
language plpgsql stable as $$
begin
  return t::timestamptz;
exception when others then
  return null;
end $$;

create or replace function public.new_id(p_coll text) returns text
language sql volatile set search_path = public, extensions as $$
  select coalesce(nullif(left(regexp_replace(lower(p_coll), '[^a-z0-9]', '', 'g'), 4), ''), 'doc') || '_' ||
         to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint) || encode(gen_random_bytes(4), 'hex')
$$;

create or replace function public.fmt_usd(n numeric) returns text
language sql immutable as $$ select '$' || to_char(round(coalesce(n, 0)), 'FM999,999,999,990') $$;

-- Order-preserving union of two JSON arrays.
create or replace function public.jsonb_union(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(v order by o), '[]'::jsonb)
  from (select v, min(o) as o
        from jsonb_array_elements(
               (case when jsonb_typeof(a) = 'array' then a else '[]'::jsonb end) ||
               (case when jsonb_typeof(b) = 'array' then b else '[]'::jsonb end)) with ordinality t(v, o)
        group by v) s
$$;

-- Role ladder (core.js ROLE_RANK). role_rank is for people (unknown = 0); min_rank is for rules (unknown = closed).
create or replace function public.role_rank(r text) returns int
language sql immutable as $$
  select case r when 'supporter' then 1 when 'candidate' then 1 when 'volunteer' then 1
                when 'member' then 2 when 'board' then 3 when 'master' then 4 else 0 end
$$;
create or replace function public.min_rank(r text) returns int
language sql immutable as $$
  select case r when 'public' then 0 when 'supporter' then 1 when 'member' then 2
                when 'board' then 3 when 'master' then 4 else 99 end
$$;

-- Internal-write flag: set by RPCs and the ingestion trigger so their own writes skip client rules.
create or replace function public.internal_on() returns void
language sql volatile as $$ select set_config('rccc.internal', '1', true) $$;
create or replace function public.internal_off() returns void
language sql volatile as $$ select set_config('rccc.internal', '', true) $$;
create or replace function public.is_internal() returns boolean
language sql stable as $$ select coalesce(current_setting('rccc.internal', true), '') = '1' $$;
-- True when the statement came through the API as a browser (anon or signed-in user), not the SQL editor or the service role.
create or replace function public.is_client() returns boolean
language sql stable as $$ select coalesce(auth.role(), '') in ('anon', 'authenticated') and not public.is_internal() $$;

-- -------------------------------------------------------------------------------------
-- 4. Who is asking (mirrors App.auth)
-- -------------------------------------------------------------------------------------
create or replace function public.auth_role() returns text
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then 'public'
              else coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'supporter') end
$$;
create or replace function public.auth_tenant() returns text
language sql stable security definer set search_path = public as $$
  select p.tenant from public.profiles p where p.id = auth.uid()
$$;
create or replace function public.auth_campaign() returns text
language sql stable security definer set search_path = public as $$
  select p.campaign_slug from public.profiles p where p.id = auth.uid() and p.role = 'candidate'
$$;
create or replace function public.auth_candidate_id() returns text
language sql stable security definer set search_path = public as $$
  select p.candidate_id from public.profiles p where p.id = auth.uid() and p.role = 'candidate'
$$;
-- Everything doc_access needs about the caller, computed once per statement (used as an initplan).
create or replace function public.auth_ctx() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then jsonb_build_object('uid', null, 'role', 'public')
    else coalesce(
      (select jsonb_build_object('uid', p.id, 'role', p.role, 'tenant', p.tenant,
                                 'slug', case when p.role = 'candidate' then p.campaign_slug end,
                                 'cid', case when p.role = 'candidate' then p.candidate_id end,
                                 'crole', p.campaign_role)
         from public.profiles p where p.id = auth.uid()),
      jsonb_build_object('uid', auth.uid(), 'role', 'supporter')) end
$$;
-- Effective role in a county: master everywhere; own role in own county (and the global scope); supporter elsewhere.
create or replace function public.eff_role_ctx(ctx jsonb, p_tenant text) returns text
language sql immutable as $$
  select case
    when ctx ->> 'uid' is null then 'public'
    when ctx ->> 'role' = 'master' then 'master'
    when p_tenant = 'global' or p_tenant = ctx ->> 'tenant' then coalesce(ctx ->> 'role', 'supporter')
    else 'supporter' end
$$;
create or replace function public.eff_role(p_tenant text) returns text
language sql stable as $$ select public.eff_role_ctx(public.auth_ctx(), p_tenant) $$;

-- auth.js CAPS, including 'candidate' (candidates, board, master), crm.campaign (candidates only), prefix.* and unknown = master.
create or replace function public.cap_min(cap text) returns text
language sql immutable as $$
  select case
    when cap in ('rsvp', 'volunteer', 'donate', 'join', 'public') then 'public'
    when cap in ('profile', 'supporter') then 'supporter'
    when cap in ('portal.view', 'field.canvass', 'governance.attend', 'governance.vote', 'crm.view', 'member') then 'member'
    when cap in ('portal.edit', 'ads.manage', 'candidate.manage', 'field.manage', 'governance.run', 'crm.committee', 'outreach.send', 'board') then 'board'
    when cap in ('campaign.own', 'crm.campaign', 'candidate') then 'candidate'
    else 'master' end
$$;
create or replace function public.can(cap text, p_tenant text default null) returns boolean
language plpgsql stable as $$
declare
  r text := public.eff_role(coalesce(p_tenant, public.auth_tenant(), 'global'));
  m text := public.cap_min(cap);
begin
  if cap = 'crm.campaign' then return r = 'candidate'; end if;
  if m = 'candidate' then return r = 'candidate' or public.role_rank(r) >= 3; end if;
  return public.role_rank(r) >= public.min_rank(m);
end $$;

-- -------------------------------------------------------------------------------------
-- 5. The access rule for docs (one function, every policy calls it)
-- -------------------------------------------------------------------------------------
create or replace function public.doc_access(
  p_op text, p_tenant text, p_coll text, p_owner text, p_data jsonb, p_created_by uuid, ctx jsonb
) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  pol   public.coll_policies;
  r     text;
  uid   uuid := nullif(ctx ->> 'uid', '')::uuid;
  slug  text := ctx ->> 'slug';
  cid   text := ctx ->> 'cid';
  own   text := coalesce(p_owner, 'committee');
  cmatch boolean := false;
begin
  select * into pol from public.coll_policies where coll = split_part(p_coll, ':', 1);
  if not found then return false; end if;                                   -- unknown collection: closed
  if (pol.scope = 'global') <> (p_tenant = 'global') then return false; end if;
  r := public.eff_role_ctx(ctx, p_tenant);

  -- Rows anyone may read (published posts, live campaign sites, live petitions).
  if p_op = 'select' and pol.public_status is not null
     and coalesce(p_data ->> 'status', pol.status_default) = any (pol.public_status) then
    return true;
  end if;

  -- CRM owner rule (crm.js guard): candidate = own campaign; board = committee + campaigns; member reads committee.
  if pol.crm then
    if r = 'candidate' then return slug is not null and own = 'campaign:' || slug; end if;
    if r = 'board' then return true; end if;
    if r = 'member' then return p_op = 'select' and own = 'committee'; end if;
    return false;                                                           -- supporters, public and master
  end if;

  -- Master Network reads aggregates only: no personal intake rows (it may still submit its own, like anyone).
  if pol.intake and r = 'master' then
    if p_op = 'insert' then return true; end if;
    return pol.own_rows and uid is not null and p_created_by = uid and (p_op = 'select' or pol.own_update);
  end if;

  if r = 'candidate' and pol.campaign_ops <> 'none' then
    cmatch := pol.map_guard
      or (pol.campaign_field is not null and slug is not null and p_data ->> pol.campaign_field = slug)
      or (pol.candidate_field is not null and cid is not null and p_data ->> pol.candidate_field = cid);
  end if;

  if p_op = 'select' then
    if public.role_rank(r) >= public.min_rank(pol.read_min) then return true; end if;
    if pol.intake then
      if r = 'member' and own = 'committee' then return true; end if;
      if r = 'candidate' and slug is not null and own = 'campaign:' || slug then return true; end if;
    end if;
    if pol.own_rows and uid is not null and p_created_by = uid then return true; end if;
    return cmatch;
  elsif p_op = 'insert' then
    if public.role_rank(r) >= public.min_rank(pol.write_min) then return true; end if;
    if public.role_rank(r) >= public.min_rank(pol.insert_min) then return true; end if;
    return cmatch and pol.campaign_ops = 'write';
  else -- update, delete
    if public.role_rank(r) >= public.min_rank(pol.write_min) then return true; end if;
    if pol.own_rows and pol.own_update and uid is not null and p_created_by = uid then return true; end if;
    return cmatch and (pol.campaign_ops = 'write' or (pol.campaign_ops = 'update' and p_op = 'update'));
  end if;
end $$;

-- -------------------------------------------------------------------------------------
-- 6. Triggers on docs
-- -------------------------------------------------------------------------------------
create or replace function public.disclaimer_ok(d text) returns boolean
language sql immutable as $$
  select coalesce(d, '') ~* '^\s*paid for by .{3,}' and coalesce(d, '') ~* 'FPPC ID #\s?[0-9]{6,9}'
$$;

-- Stamps, owner derivation, size caps and the anonymous rate limit.
create or replace function public.docs_before_write() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  pol     public.coll_policies;
  base    text := split_part(new.coll, ':', 1);
  client  boolean := public.is_client();
  anon    boolean := coalesce(auth.role(), '') = 'anon' and not public.is_internal();
  v_ip    text;
  win     timestamptz;
  cnt     int;
  camp    text;
  pown    text;
begin
  select * into pol from public.coll_policies where coll = base;

  if tg_op = 'UPDATE' then
    if new.tenant <> old.tenant or new.coll <> old.coll or new.id <> old.id then
      raise exception 'Documents keep their county, collection and id.' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if client then
      new.receipt_hash := old.receipt_hash;
      new.sample := false;                         -- an edited sample row is no longer replaced by re-seeding
    end if;
  else
    if client then
      new.created_by := auth.uid();
      new.created_at := now();
      new.sample := false;
      new.receipt_hash := null;
      if jsonb_typeof(new.data) = 'object' and new.data ? '_receipt' then
        new.receipt_hash := encode(digest(coalesce(new.data ->> '_receipt', ''), 'sha256'), 'hex');
      end if;
    end if;
    if anon then
      if pg_column_size(new.data) > 8192 then
        raise exception 'That submission is too large.' using errcode = '22023';
      end if;
      begin
        v_ip := split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', 'unknown'), ',', 1);
      exception when others then v_ip := 'unknown';
      end;
      win := date_trunc('hour', now()) + floor(extract(minute from now()) / 10) * interval '10 minutes';
      insert into public.anon_rate as a (ip, tenant, window_start, n) values (trim(v_ip), new.tenant, win, 1)
        on conflict on constraint anon_rate_pkey do update set n = a.n + 1
        returning n into cnt;
      if cnt > 20 then
        raise exception 'Too many submissions from this connection. Try again in a few minutes.' using errcode = 'P0001';
      end if;
      if random() < 0.01 then delete from public.anon_rate where window_start < now() - interval '1 day'; end if;
    end if;
  end if;

  if pg_column_size(new.data) > 4194304 then
    raise exception 'That document is larger than 4 MB.' using errcode = '22023';
  end if;
  new.updated_at := now();

  -- Collection docs carry their id; the receipt never stays in data; createdBy comes from the JWT.
  if new.id <> '__key__' and jsonb_typeof(new.data) = 'object' then
    new.data := (new.data - '_receipt') || jsonb_build_object('id', new.id);
    if client and tg_op = 'INSERT' then
      new.data := new.data || jsonb_build_object('createdBy', case when auth.uid() is null then null else auth.uid()::text end);
    elsif client and tg_op = 'UPDATE' then
      new.data := new.data || jsonb_build_object('createdBy', coalesce(old.data -> 'createdBy', 'null'::jsonb));
      if old.data ? 'createdAt' then new.data := new.data || jsonb_build_object('createdAt', old.data -> 'createdAt'); end if;
    end if;
  end if;

  -- Owner column.
  if pol.crm then
    if new.id = '__key__' then
      new.owner := case when position(':' in new.coll) > 0 then substr(new.coll, position(':' in new.coll) + 1) else 'committee' end;
    elsif jsonb_typeof(new.data) = 'object' then
      new.owner := coalesce(nullif(new.data ->> 'owner', ''), 'committee');
      new.data := new.data || jsonb_build_object('owner', new.owner);
    else
      new.owner := 'committee';
    end if;
    if new.owner <> 'committee' and new.owner !~ '^campaign:[a-z0-9-]{1,80}$' then
      raise exception 'Unknown record owner %.', new.owner using errcode = '22023';
    end if;
  elsif pol.intake and jsonb_typeof(new.data) = 'object' then
    camp := lower(nullif(new.data ->> 'campaign', ''));
    if camp is not null and camp !~ '^[a-z0-9-]{1,80}$' then camp := null; end if;
    if camp is not null then
      new.owner := 'campaign:' || camp;
    elsif base = 'signatures' then
      select d.owner into pown from public.docs d
       where d.tenant = new.tenant and d.coll = 'petitions' and d.id = new.data ->> 'petitionId';
      new.owner := coalesce(pown, 'committee');
    else
      new.owner := 'committee';
    end if;
  elsif tg_op = 'INSERT' then
    new.owner := null;
  end if;
  return new;
end $$;

-- Campaign-site and per-candidate map guards (brief 9.1 takeover rules).
create or replace function public.docs_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  base text;
  pol  public.coll_policies;
  r    text;
  cid  text;
  k    text;
begin
  if not public.is_client() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    base := split_part(old.coll, ':', 1);
    r := public.eff_role(old.tenant);
  else
    base := split_part(new.coll, ':', 1);
    r := public.eff_role(new.tenant);
  end if;
  select * into pol from public.coll_policies where coll = base;

  if base = 'campaignSites' and tg_op <> 'DELETE' then
    if new.data ->> 'status' = 'live' and not public.disclaimer_ok(new.data ->> 'disclaimer') then
      raise exception 'This site needs the "Paid for by ..., FPPC ID #..." disclaimer before it can go live.' using errcode = '23514';
    end if;
    if r = 'candidate' then
      if tg_op = 'INSERT' then
        new.data := new.data - 'endorsed' - 'endorsementPaused' - 'endorsementPause';
      else
        foreach k in array array['endorsed', 'endorsementPaused', 'endorsementPause'] loop
          if (new.data -> k) is distinct from (old.data -> k) then
            raise exception 'The endorsement is set by the committee.' using errcode = '42501';
          end if;
        end loop;
      end if;
    end if;
  end if;

  if pol.map_guard and r = 'candidate' then
    cid := public.auth_candidate_id();
    if tg_op = 'DELETE' then
      raise exception 'Only the committee can clear this.' using errcode = '42501';
    elsif tg_op = 'INSERT' then
      if jsonb_typeof(new.data) <> 'object' or exists (select 1 from jsonb_object_keys(new.data) x where x <> cid) then
        raise exception 'You can change only your own campaign''s plan.' using errcode = '42501';
      end if;
    elsif (new.data - cid) is distinct from (old.data - cid) then
      raise exception 'You can change only your own campaign''s plan.' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists docs_before_write on public.docs;
create trigger docs_before_write before insert or update on public.docs
  for each row execute function public.docs_before_write();
drop trigger if exists docs_guard on public.docs;
create trigger docs_guard before insert or update or delete on public.docs
  for each row when (pg_trigger_depth() < 2)
  execute function public.docs_guard();

-- -------------------------------------------------------------------------------------
-- 7. Server-side CRM ingestion (mirrors crm.js ingestOne; see docs/SUPABASE.md 1.6 and risk 7.7)
-- -------------------------------------------------------------------------------------
create or replace function public.crm_ingest_row(p_tenant text, p_coll text, p_id text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  d jsonb; v_owner text; v_by_uid uuid; k text := p_coll || ':' || p_id; ing jsonb;
  v_at text; v_email text := ''; v_phone text := ''; v_contact text; v_name text; v_first text := ''; v_last text := '';
  v_type text := 'note'; v_summary text := ''; v_roles jsonb := '[]'; v_tags jsonb := '[]'; v_source text := 'Public site';
  v_extra jsonb := '{}'; v_pet jsonb; v_pid text; m_id text; m jsonb; v_patch jsonb; v_ch text; v_addr text;
  v_email_opt boolean; v_sms_opt boolean; v_by text; v_guests int; v_ints jsonb; v_res text;
begin
  select x.data, x.owner, x.created_by into d, v_owner, v_by_uid from public.docs x
   where x.tenant = p_tenant and x.coll = p_coll and x.id = p_id;
  if d is null or jsonb_typeof(d) <> 'object' then return null; end if;

  insert into public.docs (tenant, coll, id, owner, data) values (p_tenant, 'crmIngest', '__key__', 'committee', '{}'::jsonb)
    on conflict do nothing;
  select x.data into ing from public.docs x where x.tenant = p_tenant and x.coll = 'crmIngest' and x.id = '__key__' for update;
  if ing ? k then return ing ->> k; end if;
  v_at := coalesce(nullif(d ->> 'createdAt', ''), public.now_iso());

  -- Unsubscribe page: honored for every record in the county with that email or phone.
  if p_coll = 'optOuts' then
    v_ch := case when d ->> 'channel' in ('sms', 'all') then d ->> 'channel' else 'email' end;
    v_email := lower(trim(coalesce(d ->> 'email', '')));
    if position('@' in v_email) = 0 then v_email := ''; end if;
    v_phone := public.norm_phone(d ->> 'phone');
    v_patch := case v_ch
      when 'all' then jsonb_build_object('doNotContact', true, 'emailOptIn', false, 'smsOptIn', false, 'emailOptOutAt', v_at, 'smsOptOutAt', v_at)
      when 'sms' then jsonb_build_object('smsOptIn', false, 'smsOptOutAt', v_at)
      else jsonb_build_object('emailOptIn', false, 'emailOptOutAt', v_at) end;
    with hits as (
      update public.docs p set data = p.data || v_patch
       where p.tenant = p_tenant and p.coll = 'people' and (p.data ->> 'mergedInto') is null
         and ((v_email <> '' and lower(p.data ->> 'email') = v_email) or (v_phone <> '' and p.data ->> 'phone' = v_phone))
      returning p.id, p.owner
    ), logged as (
      insert into public.docs (tenant, coll, id, owner, data)
      select p_tenant, 'interactions', public.new_id('interactions'), h.owner, jsonb_build_object(
        'owner', h.owner, 'personId', h.id, 'type', 'note',
        'summary', case v_ch when 'all' then 'Asked not to be contacted at all, from the unsubscribe page.'
                             when 'sms' then 'Turned off texts from the unsubscribe page.'
                             else 'Unsubscribed from email on the unsubscribe page.' end,
        'by', 'Unsubscribe page', 'byId', null, 'at', v_at, 'refColl', p_coll, 'refId', p_id, 'createdAt', v_at, 'createdBy', null)
      from hits h returning 1
    )
    select string_agg(id, ',') into v_pid from hits;
    update public.docs set data = data || jsonb_build_object(k, v_pid) where tenant = p_tenant and coll = 'crmIngest' and id = '__key__';
    return v_pid;
  end if;

  -- Door knocks: add to the matching committee voter if there is one.
  if p_coll = 'walkResults' then
    v_addr := lower(coalesce(d ->> 'address', ''));
    select x.id, x.data into m_id, m from public.docs x
     where x.tenant = p_tenant and x.coll = 'people' and x.owner = 'committee' and (x.data ->> 'mergedInto') is null
       and ((d ->> 'voterId' is not null and x.data ->> 'voterId' = d ->> 'voterId')
         or (v_addr <> '' and coalesce(x.data ->> 'address', '') <> '' and starts_with(v_addr, lower(x.data ->> 'address'))))
     order by x.created_at limit 1;
    if m_id is not null then
      v_res := case d ->> 'result' when 'talked' then 'Talked at the door' when 'not_home' then 'Not home'
        when 'refused' then 'Refused to talk' when 'moved' then 'Moved away' when 'yard_sign' then 'Asked for a yard sign' else 'Door knocked' end;
      insert into public.docs (tenant, coll, id, owner, data) values (p_tenant, 'interactions', public.new_id('interactions'), 'committee',
        jsonb_build_object('owner', 'committee', 'personId', m_id, 'type', 'walk', 'outcome', d ->> 'result',
          'summary', v_res
            || case when (d ->> 'support') ~ '^[1-5]$' then ', support ' || (d ->> 'support') || ' (' ||
                 (array['Strong no', 'Leans no', 'Undecided', 'Leans yes', 'Strong yes'])[(d ->> 'support')::int] || ')' else '' end
            || case when coalesce(d ->> 'notes', '') <> '' then '. ' || (d ->> 'notes') else '.' end,
          'by', coalesce(d ->> 'walkerName', 'A walker'), 'byId', null, 'at', v_at, 'refColl', p_coll, 'refId', p_id,
          'createdAt', v_at, 'createdBy', null));
      v_patch := '{}'::jsonb;
      if (d ->> 'support') ~ '^[1-5]$' then v_patch := v_patch || jsonb_build_object('support', (d ->> 'support')::int); end if;
      if d ->> 'result' = 'yard_sign' then v_patch := v_patch || jsonb_build_object('tags', public.jsonb_union(m -> 'tags', '["Yard sign"]')); end if;
      if v_patch <> '{}'::jsonb then
        update public.docs set data = data || v_patch where tenant = p_tenant and coll = 'people' and id = m_id;
      end if;
    end if;
    update public.docs set data = data || jsonb_build_object(k, m_id) where tenant = p_tenant and coll = 'crmIngest' and id = '__key__';
    return m_id;
  end if;

  -- RSVPs, volunteers, memberships, donations and signatures become a person and a timeline entry.
  v_email := lower(trim(coalesce(d ->> 'email', '')));
  if position('@' in v_email) = 0 then v_email := ''; end if;
  v_phone := public.norm_phone(d ->> 'phone');
  v_contact := coalesce(d ->> 'contact', '');
  if v_email = '' and position('@' in v_contact) > 0 then v_email := lower(trim(v_contact)); end if;
  if v_phone = '' and position('@' in v_contact) = 0 then v_phone := public.norm_phone(v_contact); end if;
  if v_email = '' and v_phone = '' and v_by_uid is not null then
    select coalesce(lower(p.email), ''), public.norm_phone(p.phone) into v_email, v_phone from public.profiles p where p.id = v_by_uid;
  end if;
  v_name := regexp_replace(trim(coalesce(d ->> 'name', '')), '\s+', ' ', 'g');
  if v_name <> '' then
    if position(' ' in v_name) = 0 then v_first := v_name;
    else v_last := regexp_replace(v_name, '^.* ', ''); v_first := regexp_replace(v_name, ' [^ ]*$', '');
    end if;
  end if;
  if v_email = '' and v_phone = '' and v_first = '' then
    update public.docs set data = data || jsonb_build_object(k, null) where tenant = p_tenant and coll = 'crmIngest' and id = '__key__';
    return null;
  end if;

  if p_coll = 'rsvps' then
    v_type := 'rsvp'; v_roles := '["supporter"]'; v_source := 'Event RSVP';
    v_guests := case when (d ->> 'guests') ~ '^\d+$' then (d ->> 'guests')::int else 0 end;
    v_summary := 'RSVP''d to ' || coalesce(nullif(d ->> 'title', ''), 'an event')
      || case when coalesce(d ->> 'date', '') <> '' then ' on ' || (d ->> 'date') else '' end
      || case when v_guests > 0 then ' with ' || v_guests || ' guest' || case when v_guests = 1 then '' else 's' end else '' end || '.';
  elsif p_coll = 'volunteers' then
    v_type := 'volunteer'; v_roles := '["volunteer"]';
    v_source := case when v_owner = 'committee' then 'Volunteer form' else 'Campaign site' end;
    v_tags := case when jsonb_typeof(d -> 'interests') = 'array' then d -> 'interests' else '[]'::jsonb end;
    v_summary := 'Signed up to volunteer'
      || case when jsonb_array_length(v_tags) > 0
              then ': ' || (select string_agg(x, ', ') from jsonb_array_elements_text(v_tags) x) else '' end || '.';
  elsif p_coll = 'memberships' then
    v_type := 'membership'; v_roles := '["supporter"]'; v_tags := '["Dues-paying member"]'; v_source := 'Membership form';
    v_summary := 'Joined as a dues-paying member'
      || case when (d ->> 'amount') ~ '^\d+(\.\d+)?$' then ' (' || public.fmt_usd((d ->> 'amount')::numeric) || ')' else '' end || '.';
  elsif p_coll = 'donations' then
    v_type := 'donation'; v_roles := '["donor"]'; v_source := 'Donation page';
    v_extra := jsonb_build_object('amount', case when (d ->> 'amount') ~ '^\d+(\.\d+)?$' then (d ->> 'amount')::numeric else 0 end);
    v_summary := case when d ->> 'status' = 'pledged' then 'Pledged ' else 'Gave ' end
      || public.fmt_usd(case when (d ->> 'amount') ~ '^\d+(\.\d+)?$' then (d ->> 'amount')::numeric else 0 end)
      || case when coalesce(d ->> 'recurring', 'false') in ('true', 'monthly') then ' a month' else '' end
      || case when coalesce(d ->> 'via', '') <> '' then ' through ' || (d ->> 'via') else '' end || '.';
  elsif p_coll = 'signatures' then
    select x.data into v_pet from public.docs x where x.tenant = p_tenant and x.coll = 'petitions' and x.id = d ->> 'petitionId';
    v_type := 'signature'; v_roles := '["supporter"]';
    v_tags := jsonb_build_array('petition:' || coalesce(v_pet ->> 'slug', 'unknown'));
    v_source := case when v_pet is null then 'Petition'
      else case when v_pet ->> 'kind' = 'survey' then 'Survey: ' else 'Petition: ' end || coalesce(v_pet ->> 'title', '') end;
    v_summary := case when v_pet ->> 'kind' = 'survey' then 'Answered the survey' else 'Signed' end
      || ' "' || coalesce(v_pet ->> 'title', 'a petition') || '".';
    if jsonb_typeof(d -> 'answers') = 'object' and d -> 'answers' <> '{}'::jsonb then v_extra := jsonb_build_object('answers', d -> 'answers'); end if;
  else
    return null;
  end if;

  v_email_opt := case when p_coll = 'signatures' then coalesce(d -> 'optIn' = 'true'::jsonb, false) and v_email <> '' else v_email <> '' end;
  v_sms_opt := coalesce(d -> 'smsOptIn' = 'true'::jsonb, false) and v_phone <> '';

  -- Dedupe in the same owner: email first, then phone when last names agree or one is blank.
  if v_email <> '' then
    select x.id, x.data into m_id, m from public.docs x
     where x.tenant = p_tenant and x.coll = 'people' and x.owner = v_owner and (x.data ->> 'mergedInto') is null
       and lower(x.data ->> 'email') = v_email order by x.created_at limit 1;
  end if;
  if m_id is null and v_phone <> '' then
    select x.id, x.data into m_id, m from public.docs x
     where x.tenant = p_tenant and x.coll = 'people' and x.owner = v_owner and (x.data ->> 'mergedInto') is null
       and x.data ->> 'phone' = v_phone
       and (v_last = '' or coalesce(x.data ->> 'lastName', '') = '' or lower(x.data ->> 'lastName') = lower(v_last))
     order by x.created_at limit 1;
  end if;

  if m_id is not null then
    v_patch := jsonb_build_object('tags', public.jsonb_union(m -> 'tags', v_tags), 'roles', public.jsonb_union(m -> 'roles', v_roles));
    if coalesce(m ->> 'firstName', '') = '' and v_first <> '' then v_patch := v_patch || jsonb_build_object('firstName', v_first); end if;
    if coalesce(m ->> 'lastName', '') = '' and v_last <> '' then v_patch := v_patch || jsonb_build_object('lastName', v_last); end if;
    if coalesce(m ->> 'name', '') = '' and v_name <> '' then v_patch := v_patch || jsonb_build_object('name', v_name); end if;
    if coalesce(m ->> 'email', '') = '' and v_email <> '' then v_patch := v_patch || jsonb_build_object('email', v_email); end if;
    if coalesce(m ->> 'phone', '') = '' and v_phone <> '' then v_patch := v_patch || jsonb_build_object('phone', v_phone); end if;
    if coalesce(m ->> 'zip', '') = '' and coalesce(d ->> 'zip', '') <> '' then v_patch := v_patch || jsonb_build_object('zip', d ->> 'zip'); end if;
    if v_email_opt and not coalesce(m -> 'emailOptIn' = 'true'::jsonb, false) and coalesce(m ->> 'emailOptOutAt', '') = '' then
      v_patch := v_patch || '{"emailOptIn": true}'::jsonb; end if;
    if v_sms_opt and not coalesce(m -> 'smsOptIn' = 'true'::jsonb, false) and coalesce(m ->> 'smsOptOutAt', '') = '' then
      v_patch := v_patch || '{"smsOptIn": true}'::jsonb; end if;
    if coalesce(m ->> 'lastActivityAt', '') = '' or v_at > (m ->> 'lastActivityAt') then
      v_patch := v_patch || jsonb_build_object('lastActivityAt', v_at); end if;
    update public.docs set data = data || v_patch where tenant = p_tenant and coll = 'people' and id = m_id;
    v_pid := m_id;
  else
    v_pid := public.new_id('people');
    insert into public.docs (tenant, coll, id, owner, sample, data) values (p_tenant, 'people', v_pid, v_owner,
      coalesce(d -> 'sample' = 'true'::jsonb, false),
      jsonb_build_object(
        'owner', v_owner, 'firstName', v_first, 'lastName', v_last, 'name', v_name, 'email', v_email, 'phone', v_phone,
        'zip', coalesce(d ->> 'zip', ''), 'city', '', 'tags', public.jsonb_union(v_tags, '[]'), 'support', null,
        'roles', v_roles, 'pointPersonId', null, 'emailOptIn', v_email_opt, 'smsOptIn', v_sms_opt, 'doNotContact', false,
        'source', v_source, 'lastActivityAt', v_at, 'createdAt', public.now_iso(), 'createdBy', null)
      || case when coalesce(d -> 'sample' = 'true'::jsonb, false) then '{"sample": true}'::jsonb else '{}'::jsonb end);
  end if;

  v_by := case when p_coll = 'signatures' or v_owner = 'committee' then 'Public site' else 'Campaign site' end;
  insert into public.docs (tenant, coll, id, owner, data) values (p_tenant, 'interactions', public.new_id('interactions'), v_owner,
    jsonb_build_object('owner', v_owner, 'personId', v_pid, 'type', v_type, 'summary', v_summary, 'by', v_by, 'byId', null,
      'at', v_at, 'refColl', p_coll, 'refId', p_id, 'createdAt', public.now_iso(), 'createdBy', null) || v_extra);

  update public.docs set data = data || jsonb_build_object(k, v_pid) where tenant = p_tenant and coll = 'crmIngest' and id = '__key__';
  return v_pid;
end $$;

create or replace function public.docs_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_internal() or coalesce(auth.role(), '') not in ('anon', 'authenticated') then return null; end if;
  if new.tenant = 'global' or new.coll not in ('rsvps', 'volunteers', 'memberships', 'donations', 'signatures', 'optOuts', 'walkResults') then
    return null;
  end if;
  perform public.internal_on();
  begin
    perform public.crm_ingest_row(new.tenant, new.coll, new.id);
  exception when others then
    raise warning '[crm_ingest_row] %.% %: %', new.tenant, new.coll, new.id, sqlerrm;   -- never fail the visitor's submission
  end;
  perform public.internal_off();
  return null;
end $$;
drop trigger if exists docs_after_insert on public.docs;
create trigger docs_after_insert after insert on public.docs
  for each row execute function public.docs_after_insert();

-- -------------------------------------------------------------------------------------
-- 8. Profiles: creation from auth.users, sync, and the role lock
-- -------------------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  t text := m ->> 'tenant';
begin
  if t is null or t = 'global' or not exists (select 1 from public.tenants where slug = t) then t := null; end if;
  insert into public.profiles (id, name, email, phone, zip, role, tenant, verified)
  values (new.id,
          left(regexp_replace(trim(coalesce(m ->> 'name', '')), '\s+', ' ', 'g'), 120),
          lower(new.email),
          nullif(public.norm_phone(coalesce(new.phone, m ->> 'phone')), ''),
          left(regexp_replace(coalesce(m ->> 'zip', ''), '[^0-9]', '', 'g'), 5),
          'supporter',                                  -- never from metadata
          t,
          jsonb_build_object('email', new.email_confirmed_at is not null, 'phone', new.phone_confirmed_at is not null))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_updated() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles p set
    email = lower(new.email),
    phone = case when new.phone_confirmed_at is not null and coalesce(new.phone, '') <> '' then public.norm_phone(new.phone) else p.phone end,
    verified = p.verified
      || jsonb_build_object('email', new.email_confirmed_at is not null)
      || case when new.phone_confirmed_at is not null then '{"phone": true}'::jsonb else '{}'::jsonb end
  where p.id = new.id;
  return new;
end $$;
drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update of email, email_confirmed_at, phone, phone_confirmed_at on auth.users
  for each row execute function public.handle_user_updated();

-- A person may change only their own name, phone and ZIP. Roles change only through SECURITY DEFINER RPCs.
create or replace function public.profiles_guard() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id or new.role is distinct from old.role or new.tenant is distinct from old.tenant
       or new.candidate_id is distinct from old.candidate_id or new.campaign_slug is distinct from old.campaign_slug
       or new.campaign_role is distinct from old.campaign_role or new.sample is distinct from old.sample
       or new.verified is distinct from old.verified or new.email is distinct from old.email
       or new.title is distinct from old.title or new.member_id is distinct from old.member_id or new.office is distinct from old.office then
      raise exception 'Only the executive board can change roles and campaign access.' using errcode = '42501';
    end if;
    new.name := left(regexp_replace(trim(coalesce(new.name, '')), '\s+', ' ', 'g'), 120);
    new.zip := left(regexp_replace(coalesce(new.zip, ''), '[^0-9]', '', 'g'), 5);
    if new.phone is distinct from old.phone then
      new.phone := nullif(public.norm_phone(new.phone), '');
      new.verified := old.verified || '{"phone": false}'::jsonb;   -- unverified until Twilio (PHONE_OTP = 'twilio')
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

-- -------------------------------------------------------------------------------------
-- 9. Row Level Security
-- -------------------------------------------------------------------------------------
alter table public.tenants       enable row level security;
alter table public.profiles      enable row level security;
alter table public.docs          enable row level security;
alter table public.coll_policies enable row level security;
alter table public.anon_rate     enable row level security;   -- no policies: only definer functions touch it

drop policy if exists tenants_read on public.tenants;
create policy tenants_read on public.tenants for select to anon, authenticated using (true);

drop policy if exists coll_policies_read on public.coll_policies;
create policy coll_policies_read on public.coll_policies for select to anon, authenticated using (true);

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or (select public.auth_role()) = 'master'
  or ((select public.auth_role()) = 'board' and tenant = (select public.auth_tenant()))
);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- No insert or delete policies: profiles are created by handle_new_user and removed with the auth user.

drop policy if exists docs_select on public.docs;
create policy docs_select on public.docs for select to anon, authenticated
  using (public.doc_access('select', tenant, coll, owner, data, created_by, (select public.auth_ctx())));
drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs for insert to anon, authenticated
  with check (public.doc_access('insert', tenant, coll, owner, data, created_by, (select public.auth_ctx())));
drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs for update to anon, authenticated
  using (public.doc_access('update', tenant, coll, owner, data, created_by, (select public.auth_ctx())))
  with check (public.doc_access('update', tenant, coll, owner, data, created_by, (select public.auth_ctx())));
drop policy if exists docs_delete on public.docs;
create policy docs_delete on public.docs for delete to anon, authenticated
  using (public.doc_access('delete', tenant, coll, owner, data, created_by, (select public.auth_ctx())));

-- Privileges (RLS decides rows; grants decide statements and columns).
revoke all on public.tenants, public.profiles, public.docs, public.coll_policies, public.anon_rate from anon, authenticated;
grant select on public.tenants, public.coll_policies to anon, authenticated;
grant select, insert, update, delete on public.docs to anon, authenticated;
grant select on public.profiles to authenticated;
grant update (name, phone, zip) on public.profiles to authenticated;

-- -------------------------------------------------------------------------------------
-- 10. RPCs
-- -------------------------------------------------------------------------------------

-- Shallow merge on the server (Store.update / updateMany semantics), so concurrent edits of different fields both survive. RLS applies.
create or replace function public.doc_patch(p_tenant text, p_coll text, p_id text, p_patch jsonb) returns jsonb
language sql volatile security invoker set search_path = public as $$
  update public.docs set data = data || coalesce(p_patch, '{}'::jsonb) || jsonb_build_object('id', p_id)
   where tenant = p_tenant and coll = p_coll and id = p_id and jsonb_typeof(data) = 'object'
  returning data
$$;
create or replace function public.doc_patch_many(p_tenant text, p_coll text, p_patches jsonb) returns int
language plpgsql volatile security invoker set search_path = public as $$
declare n int;
begin
  update public.docs d set data = d.data || p.value || jsonb_build_object('id', d.id)
    from jsonb_each(coalesce(p_patches, '{}'::jsonb)) p
   where d.tenant = p_tenant and d.coll = p_coll and d.id = p.key and jsonb_typeof(p.value) = 'object';
  get diagnostics n = row_count;
  return n;
end $$;

-- Public totals without personal data: RSVP head counts per event and signatures per public petition.
create or replace function public.public_counts(p_tenant text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'rsvps', coalesce((
      select jsonb_object_agg(eid, jsonb_build_object('docs', c, 'heads', h))
      from (select data ->> 'eventId' as eid, count(*) as c,
                   sum(1 + case when (data ->> 'guests') ~ '^\d{1,3}$' then (data ->> 'guests')::int else 0 end) as h
              from public.docs where tenant = p_tenant and coll = 'rsvps' and data ->> 'eventId' is not null group by 1) s), '{}'::jsonb),
    'signatures', coalesce((
      select jsonb_object_agg(pid, jsonb_build_object('docs', c))
      from (select s.data ->> 'petitionId' as pid, count(*) as c
              from public.docs s
              join public.docs p on p.tenant = s.tenant and p.coll = 'petitions' and p.id = s.data ->> 'petitionId'
                                and p.data ->> 'status' in ('live', 'closed')
             where s.tenant = p_tenant and s.coll = 'signatures' group by 1) t), '{}'::jsonb),
    'at', public.now_iso())
$$;

-- Lets the browser that made an anonymous submission cancel it within 24 hours (un-RSVP, undo unsubscribe).
create or replace function public.withdraw_submission(p_tenant text, p_coll text, p_id text, p_receipt text) returns boolean
language plpgsql volatile security definer set search_path = public, extensions as $$
declare n int;
begin
  if p_coll not in ('rsvps', 'optOuts', 'volunteers') or coalesce(p_receipt, '') = '' then return false; end if;
  perform public.internal_on();
  delete from public.docs
   where tenant = p_tenant and coll = p_coll and id = p_id
     and receipt_hash = encode(digest(p_receipt, 'sha256'), 'hex')
     and created_at > now() - interval '24 hours';
  get diagnostics n = row_count;
  perform public.internal_off();
  return n > 0;
end $$;

-- Statewide view (App.crm.stats): aggregate counts only. Master Network, and the county's board and members.
create or replace function public.crm_stats(p_tenant text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r text := public.eff_role(p_tenant); out jsonb; month_start timestamptz;
begin
  if r not in ('master', 'board', 'member') then return null; end if;
  if not exists (select 1 from public.tenants where slug = p_tenant and slug <> 'global') then return null; end if;
  month_start := date_trunc('month', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles';
  with allp as (
    select owner, data from public.docs where tenant = p_tenant and coll = 'people' and (data ->> 'mergedInto') is null
  ), ppl as (select data from allp where owner = 'committee'
  ), its as (select data from public.docs where tenant = p_tenant and coll = 'interactions' and owner = 'committee'
  ), calls as (select data from its where data ->> 'type' = 'call')
  select jsonb_build_object(
    'people', (select count(*) from ppl),
    'newThisMonth', (select count(*) from ppl where public.safe_ts(data ->> 'createdAt') >= month_start),
    'volunteers', (select count(*) from ppl where data -> 'roles' ? 'volunteer'),
    'donors', (select count(*) from ppl where data -> 'roles' ? 'donor'),
    'emailOptInRate', (select case when count(*) = 0 then 0 else round(1000.0 * count(*) filter (where coalesce(data ->> 'email', '') <> ''
        and data -> 'emailOptIn' = 'true'::jsonb and coalesce(data -> 'doNotContact' <> 'true'::jsonb, true)) / count(*)) / 10 end from ppl),
    'smsOptInRate', (select case when count(*) = 0 then 0 else round(1000.0 * count(*) filter (where coalesce(data ->> 'phone', '') <> ''
        and data -> 'smsOptIn' = 'true'::jsonb and coalesce(data -> 'doNotContact' <> 'true'::jsonb, true)) / count(*)) / 10 end from ppl),
    'responseRate', (select case when count(*) = 0 then 0 else round(1000.0 * count(*) filter (where data ->> 'outcome' = 'talked') / count(*)) / 10 end from calls),
    'callsMade', (select count(*) from calls),
    'messagesSent', (select coalesce(sum(case when (data #>> '{counts,sent}') ~ '^\d+$' then (data #>> '{counts,sent}')::int else 0 end), 0)
                       from public.docs where tenant = p_tenant and coll = 'broadcasts' and owner = 'committee' and data ->> 'status' = 'sent'),
    'interactions30d', (select count(*) from its where public.safe_ts(data ->> 'at') >= now() - interval '30 days'),
    'campaigns', (select count(distinct owner) from allp where owner like 'campaign:%'),
    'campaignPeople', (select count(*) from allp where owner like 'campaign:%'),
    'at', public.now_iso()
  ) into out;
  return out;
end $$;

-- Whether the caller may send for this CRM owner (crm.js perms.send). Used by the send-email Edge Function.
create or replace function public.crm_can_send(p_tenant text, p_owner text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r text := public.eff_role(p_tenant);
begin
  if r = 'master' then return false; end if;
  if coalesce(p_owner, 'committee') like 'campaign:%' then
    return (r = 'candidate' and public.auth_campaign() = substr(p_owner, 10)) or public.role_rank(r) >= 3;
  end if;
  return public.can('outreach.send', p_tenant) or public.role_rank(r) >= 3;
end $$;

-- Compare-and-set for the Edge Function (service role only): patch a doc only while data->>field is one of p_expected.
create or replace function public.doc_cas(p_tenant text, p_coll text, p_id text, p_field text, p_expected text[], p_patch jsonb)
returns jsonb
language sql volatile security definer set search_path = public as $$
  update public.docs set data = data || coalesce(p_patch, '{}'::jsonb)
   where tenant = p_tenant and coll = p_coll and id = p_id and coalesce(data ->> p_field, '') = any (p_expected)
  returning data
$$;

-- ---------- invites (brief 9.1) ----------
create or replace function public.invite_can_manage(p_tenant text, p_slug text, p_campaign_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.role_rank(public.eff_role(p_tenant)) >= 3
      or (p_campaign_role = 'staff' and exists (
            select 1 from public.profiles p where p.id = auth.uid() and p.role = 'candidate' and p.tenant = p_tenant
               and p.campaign_slug = p_slug and p.campaign_role = 'owner'))
$$;

-- p_token: optional, generated in the browser with crypto.getRandomValues (>= 32 hex chars) so the inviter can show the
-- link at once; the server generates one when it is missing. Either way it is stored only here and is single-use.
drop function if exists public.create_invite(text, text, text, text, text, text, text);
create or replace function public.create_invite(
  p_tenant text, p_email text, p_phone text, p_candidate_id text, p_campaign_slug text,
  p_campaign_role text default 'owner', p_office text default null, p_token text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id text; v_token text; v_data jsonb; v_inviter text;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if v_email !~ '^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$' then raise exception 'Check the email address.' using errcode = '22023'; end if;
  if coalesce(p_candidate_id, '') = '' then raise exception 'Choose the candidate this invite is for.' using errcode = '22023'; end if;
  if coalesce(p_campaign_slug, '') !~ '^[a-z0-9-]{1,80}$' then raise exception 'This invite needs a campaign.' using errcode = '22023'; end if;
  if p_campaign_role not in ('owner', 'staff') then raise exception 'Unknown campaign role.' using errcode = '22023'; end if;
  if not exists (select 1 from public.tenants where slug = p_tenant and slug <> 'global') then raise exception 'Unknown county.' using errcode = '22023'; end if;
  if not public.invite_can_manage(p_tenant, p_campaign_slug, p_campaign_role) then
    raise exception '%', case when p_campaign_role = 'staff' then 'Only the campaign owner or the executive board can invite staff.'
                              else 'Only the executive board can invite a campaign owner.' end using errcode = '42501';
  end if;
  perform public.internal_on();
  update public.docs set data = data || jsonb_build_object('status', 'revoked', 'revokedAt', public.now_iso())
   where tenant = p_tenant and coll = 'invites' and data ->> 'status' = 'sent'
     and data ->> 'candidateId' = p_candidate_id and lower(data ->> 'email') = v_email;
  select name into v_inviter from public.profiles where id = auth.uid();
  v_id := public.new_id('invites');
  if p_token is not null and p_token !~ '^[a-f0-9]{32,128}$' then raise exception 'Invalid invite token.' using errcode = '22023'; end if;
  if p_token is not null and exists (select 1 from public.docs where coll = 'invites' and data ->> 'token' = p_token) then
    raise exception 'Invalid invite token.' using errcode = '22023';
  end if;
  v_token := coalesce(p_token, encode(gen_random_bytes(24), 'hex'));
  v_data := jsonb_build_object(
    'id', v_id, 'title', 'Campaign invite for ' || v_email, 'email', v_email, 'phone', nullif(public.norm_phone(p_phone), ''),
    'role', 'candidate', 'candidateId', p_candidate_id, 'campaignSlug', p_campaign_slug, 'campaignRole', p_campaign_role,
    'office', p_office, 'invitedBy', auth.uid()::text, 'invitedByName', v_inviter, 'status', 'sent', 'token', v_token,
    'tenant', p_tenant, 'createdAt', public.now_iso(), 'createdBy', auth.uid()::text,
    'expiresAt', to_char((now() + interval '14 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  insert into public.docs (tenant, coll, id, data, created_by) values (p_tenant, 'invites', v_id, v_data, auth.uid());
  insert into public.docs (tenant, coll, id, data, created_by) values (p_tenant, 'auditLog', public.new_id('auditLog'),
    jsonb_build_object('title', 'Invite sent', 'action', 'invite.create', 'inviteId', v_id, 'email', v_email,
                       'campaignSlug', p_campaign_slug, 'by', auth.uid()::text, 'createdAt', public.now_iso()), auth.uid());
  perform public.internal_off();
  return v_data;
end $$;

create or replace function public.revoke_invite(p_tenant text, p_id text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  select data into v from public.docs where tenant = p_tenant and coll = 'invites' and id = p_id for update;
  if v is null then raise exception 'That invite no longer exists.' using errcode = 'P0002'; end if;
  if not public.invite_can_manage(p_tenant, v ->> 'campaignSlug', v ->> 'campaignRole') then
    raise exception 'Only the campaign owner or the executive board can revoke this invite.' using errcode = '42501';
  end if;
  if v ->> 'status' = 'claimed' then raise exception 'This invite was already claimed.' using errcode = '22023'; end if;
  perform public.internal_on();
  update public.docs set data = data || jsonb_build_object('status', 'revoked', 'revokedAt', public.now_iso())
   where tenant = p_tenant and coll = 'invites' and id = p_id returning data into v;
  perform public.internal_off();
  return v;
end $$;

-- Marks a resend and extends the expiry. The browser then asks send-email to deliver it.
create or replace function public.resend_invite(p_tenant text, p_id text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v jsonb;
begin
  select data into v from public.docs where tenant = p_tenant and coll = 'invites' and id = p_id for update;
  if v is null then raise exception 'That invite no longer exists.' using errcode = 'P0002'; end if;
  if not public.invite_can_manage(p_tenant, v ->> 'campaignSlug', v ->> 'campaignRole') then
    raise exception 'Only the campaign owner or the executive board can resend this invite.' using errcode = '42501';
  end if;
  if v ->> 'status' <> 'sent' then
    raise exception '%', case when v ->> 'status' = 'claimed' then 'This invite was already claimed.' else 'This invite was revoked. Send a new one.' end
      using errcode = '22023';
  end if;
  perform public.internal_on();
  update public.docs set data = data || jsonb_build_object(
      'resentAt', public.now_iso(),
      'resendCount', coalesce((data ->> 'resendCount')::int, 0) + 1,
      'expiresAt', to_char((now() + interval '14 days') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   where tenant = p_tenant and coll = 'invites' and id = p_id returning data into v;
  perform public.internal_off();
  return v;
end $$;

-- What the claim page shows before sign-in. The token is the secret; whoever holds it was sent it.
create or replace function public.invite_preview(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', d.id, 'tenant', d.tenant, 'status',
      case when d.data ->> 'status' = 'sent' and public.safe_ts(d.data ->> 'expiresAt') < now() then 'expired' else d.data ->> 'status' end,
    'email', d.data ->> 'email', 'phone', d.data ->> 'phone', 'candidateId', d.data ->> 'candidateId',
    'campaignSlug', d.data ->> 'campaignSlug', 'campaignRole', d.data ->> 'campaignRole', 'office', d.data ->> 'office',
    'invitedByName', d.data ->> 'invitedByName')
  from public.docs d
  where d.coll = 'invites' and length(coalesce(p_token, '')) >= 32 and d.data ->> 'token' = p_token
  limit 1
$$;

-- Claims an invite for the signed-in person. The only path (besides set_role) that grants the candidate role.
create or replace function public.claim_invite(p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); d record; v jsonb; u record; cur text; prof jsonb;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select * into d from public.docs where coll = 'invites' and length(coalesce(p_token, '')) >= 32 and data ->> 'token' = p_token for update;
  if not found then raise exception 'We can''t find this invite. Ask the committee to send it again.' using errcode = 'P0002'; end if;
  v := d.data;
  if v ->> 'status' = 'revoked' then raise exception 'This invite was withdrawn. Ask for a new link.' using errcode = '22023'; end if;
  if v ->> 'status' = 'claimed' then raise exception 'This invite was already used.' using errcode = '22023'; end if;
  if public.safe_ts(v ->> 'expiresAt') < now() then raise exception 'This invite expired. Ask for a new link.' using errcode = '22023'; end if;
  select email, email_confirmed_at into u from auth.users where id = uid;
  if u.email_confirmed_at is null or lower(u.email) <> lower(v ->> 'email') then
    raise exception 'This invite was sent to a different email. Sign in with that email to claim it.' using errcode = '42501';
  end if;
  select role into cur from public.profiles where id = uid;
  if cur in ('board', 'master') then
    raise exception 'This account is on the executive board or the Master Network. Use a separate email for the campaign.' using errcode = '42501';
  end if;
  update public.profiles set
    role = 'candidate', tenant = d.tenant, candidate_id = v ->> 'candidateId', campaign_slug = v ->> 'campaignSlug',
    campaign_role = v ->> 'campaignRole', office = coalesce(v ->> 'office', office),
    phone = coalesce(phone, nullif(v ->> 'phone', ''))
  where id = uid;
  perform public.internal_on();
  update public.docs set data = data || jsonb_build_object('status', 'claimed', 'claimedAt', public.now_iso(), 'claimedBy', uid::text)
   where tenant = d.tenant and coll = 'invites' and id = d.id;
  insert into public.docs (tenant, coll, id, data, created_by) values (d.tenant, 'auditLog', public.new_id('auditLog'),
    jsonb_build_object('title', 'Invite claimed', 'action', 'invite.claim', 'inviteId', d.id, 'campaignSlug', v ->> 'campaignSlug',
                       'by', uid::text, 'createdAt', public.now_iso()), uid);
  perform public.internal_off();
  select to_jsonb(p) into prof from public.profiles p where p.id = uid;
  return prof;
end $$;

-- Board (own county, up to board) and Master Network (anything) change roles. The SQL editor may too.
create or replace function public.set_role(p_user uuid, p_role text, p_tenant text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me record; target record; v_tenant text; prof jsonb;
  editor boolean := auth.uid() is null and coalesce(auth.role(), '') not in ('anon', 'authenticated');
begin
  if p_role not in ('supporter', 'member', 'board', 'master') then
    raise exception 'Campaign access is granted with an invite.' using errcode = '22023';
  end if;
  select * into target from public.profiles where id = p_user;
  if not found then raise exception 'No such account.' using errcode = 'P0002'; end if;
  v_tenant := coalesce(p_tenant, target.tenant);
  if p_role <> 'master' and (v_tenant is null or not exists (select 1 from public.tenants where slug = v_tenant and slug <> 'global')) then
    raise exception 'Choose the county for this role.' using errcode = '22023';
  end if;
  if not editor then
    select * into me from public.profiles where id = auth.uid();
    if not found then raise exception 'Sign in first.' using errcode = '42501'; end if;
    if me.role = 'master' then
      null;
    elsif me.role = 'board' then
      if p_role = 'master' or target.role = 'master' or v_tenant is distinct from me.tenant
         or (target.tenant is not null and target.tenant <> me.tenant and target.role <> 'supporter') then
        raise exception 'The executive board can change roles only in its own county.' using errcode = '42501';
      end if;
    else
      raise exception 'Only the executive board can change roles.' using errcode = '42501';
    end if;
  end if;
  update public.profiles set role = p_role, tenant = case when p_role = 'master' then null else v_tenant end,
    candidate_id = null, campaign_slug = null, campaign_role = null
   where id = p_user;
  if v_tenant is not null then
    perform public.internal_on();
    insert into public.docs (tenant, coll, id, data, created_by) values (v_tenant, 'auditLog', public.new_id('auditLog'),
      jsonb_build_object('title', 'Role changed to ' || p_role, 'action', 'role.set', 'user', p_user::text, 'from', target.role,
                         'to', p_role, 'by', coalesce(auth.uid()::text, 'sql editor'), 'createdAt', public.now_iso()), auth.uid());
    perform public.internal_off();
  end if;
  select to_jsonb(p) into prof from public.profiles p where p.id = p_user;
  return prof;
end $$;

create or replace function public.remove_campaign_member(p_user uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare t record; prof jsonb;
begin
  select * into t from public.profiles where id = p_user;
  if not found or t.role <> 'candidate' then raise exception 'That person is not on a campaign team.' using errcode = 'P0002'; end if;
  if t.campaign_role <> 'staff' then raise exception 'Campaign owners are changed by the executive board with a new invite.' using errcode = '22023'; end if;
  if not public.invite_can_manage(t.tenant, t.campaign_slug, 'staff') then
    raise exception 'Only the campaign owner or the executive board can remove staff.' using errcode = '42501';
  end if;
  update public.profiles set role = 'supporter', candidate_id = null, campaign_slug = null, campaign_role = null, office = null where id = p_user;
  select to_jsonb(p) into prof from public.profiles p where p.id = p_user;
  return prof;
end $$;

create or replace function public.campaign_team(p_tenant text, p_slug text)
returns table (id uuid, name text, email text, phone text, campaign_role text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.email, p.phone, p.campaign_role, p.created_at
    from public.profiles p
   where p.tenant = p_tenant and p.role = 'candidate' and p.campaign_slug = p_slug
     and (public.role_rank(public.eff_role(p_tenant)) >= 3 or public.auth_campaign() = p_slug)
   order by p.campaign_role, p.name
$$;

-- Board deletes a county's sample rows when it is ready to go live.
create or replace function public.purge_sample(p_tenant text) returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if public.role_rank(public.eff_role(p_tenant)) < 3 and not (auth.uid() is null and coalesce(auth.role(), '') not in ('anon', 'authenticated')) then
    raise exception 'Only the executive board can remove sample data.' using errcode = '42501';
  end if;
  perform public.internal_on();
  delete from public.docs where tenant = p_tenant and sample;
  get diagnostics n = row_count;
  perform public.internal_off();
  return n;
end $$;

-- SQL editor only: impersonate a user (or anon with null) for RLS tests inside begin ... rollback.
create or replace function public.test_as(p_uid uuid, p_ip text default '203.0.113.9') returns text
language plpgsql volatile as $$
begin
  perform set_config('request.headers', json_build_object('x-forwarded-for', p_ip)::text, true);
  if p_uid is null then
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    execute 'set local role anon';
    return 'anon';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  return 'authenticated as ' || p_uid;
end $$;

-- -------------------------------------------------------------------------------------
-- 11. Function privileges (Supabase grants EXECUTE to anon and authenticated by default)
-- -------------------------------------------------------------------------------------
revoke execute on function public.crm_ingest_row(text, text, text) from public, anon, authenticated;
revoke execute on function public.test_as(uuid, text) from public, anon, authenticated;
revoke execute on function public.internal_on() from public, anon, authenticated;
revoke execute on function public.internal_off() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_updated() from public, anon, authenticated;
revoke execute on function public.docs_before_write() from public, anon, authenticated;
revoke execute on function public.docs_after_insert() from public, anon, authenticated;
revoke execute on function public.docs_guard() from public, anon, authenticated;
revoke execute on function public.new_id(text) from public, anon, authenticated;
revoke execute on function public.doc_cas(text, text, text, text, text[], jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.crm_ingest_row(text, text, text) to service_role;
    grant execute on function public.doc_cas(text, text, text, text, text[], jsonb) to service_role;
    grant execute on function public.doc_patch(text, text, text, jsonb) to service_role;
    grant execute on function public.doc_patch_many(text, text, jsonb) to service_role;
  end if;
end $$;

revoke execute on function public.create_invite(text, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.revoke_invite(text, text) from public, anon;
revoke execute on function public.resend_invite(text, text) from public, anon;
revoke execute on function public.claim_invite(text) from public, anon;
revoke execute on function public.set_role(uuid, text, text) from public, anon;
revoke execute on function public.remove_campaign_member(uuid) from public, anon;
revoke execute on function public.campaign_team(text, text) from public, anon;
revoke execute on function public.purge_sample(text) from public, anon;
revoke execute on function public.crm_stats(text) from public, anon;
revoke execute on function public.doc_patch(text, text, text, jsonb) from public, anon;
revoke execute on function public.doc_patch_many(text, text, jsonb) from public, anon;

grant execute on function public.create_invite(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.revoke_invite(text, text) to authenticated;
grant execute on function public.resend_invite(text, text) to authenticated;
grant execute on function public.claim_invite(text) to authenticated;
grant execute on function public.set_role(uuid, text, text) to authenticated;
grant execute on function public.remove_campaign_member(uuid) to authenticated;
grant execute on function public.campaign_team(text, text) to authenticated;
grant execute on function public.purge_sample(text) to authenticated;
grant execute on function public.crm_stats(text) to authenticated;
grant execute on function public.doc_patch(text, text, text, jsonb) to authenticated;
grant execute on function public.doc_patch_many(text, text, jsonb) to authenticated;
grant execute on function public.invite_preview(text) to anon, authenticated;
grant execute on function public.public_counts(text) to anon, authenticated;
grant execute on function public.withdraw_submission(text, text, text, text) to anon, authenticated;
grant execute on function public.can(text, text) to anon, authenticated;
grant execute on function public.auth_role() to anon, authenticated;
grant execute on function public.crm_can_send(text, text) to authenticated;
grant execute on function public.invite_can_manage(text, text, text) to authenticated;

-- -------------------------------------------------------------------------------------
-- 12. Realtime
-- -------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;

-- Done. Next: run supabase/seed.sql (generated by supabase/seed-from-data.mjs).
