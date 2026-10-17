-- R5 (docs/SUPABASE.md risk 7.6): votes are cast through an RPC, so a member can no longer rewrite
-- meetingState.ballots or the ballot box directly.
--   * cast_vote() records one vote per member under a row lock. For a secret ballot it adds to the
--     box tally, the voter list and the hashed receipt list as three separate lists, so the choice is
--     never stored with the person. The receipt itself stays with the voter (collection votes).
--   * meeting_state_guard() stops members (anyone below board) from changing the meeting itself through
--     the API: they may only add or remove their own check-in and append entries to the meeting record.
--     Board members (the chair and secretary) keep full control, as before.
-- Kept in sync with supabase/schema.sql (section 9b).

create or replace function public.meeting_norm(j jsonb, k text) returns jsonb
language sql immutable as $$
  select case when j -> k is null or j -> k in ('null'::jsonb, '{}'::jsonb, '[]'::jsonb, '""'::jsonb, '0'::jsonb, 'false'::jsonb)
              then null else j -> k end
$$;

create or replace function public.meeting_state_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  t   text := coalesce(new.tenant, old.tenant);
  mid text;
  k   text;
  n   int;
begin
  if not public.is_client() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if public.role_rank(public.eff_role(t)) >= 3 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Only the chair or secretary can clear the meeting.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if public.meeting_norm(new.data, 'ballots') is not null or public.meeting_norm(new.data, 'box') is not null then
      raise exception 'Votes are recorded through the ballot, not edited directly.' using errcode = '42501';
    end if;
    return new;
  end if;
  -- UPDATE by a member: the meeting itself and every ballot stay as they are.
  foreach k in array array['meetingId', 'status', 'startedAt', 'startedBy', 'agendaIdx', 'ballots', 'box',
                           'seedProxies', 'zoomUrl', 'minutes', 'closedAt'] loop
    if public.meeting_norm(new.data, k) is distinct from public.meeting_norm(old.data, k) then
      raise exception 'Only the chair or secretary can change the meeting. Votes go through the ballot.' using errcode = '42501';
    end if;
  end loop;
  -- Check-ins: only your own seat.
  select p.member_id into mid from public.profiles p where p.id = auth.uid();
  if (coalesce(new.data -> 'checkIns', '{}'::jsonb) - coalesce(mid, ''))
     is distinct from (coalesce(old.data -> 'checkIns', '{}'::jsonb) - coalesce(mid, '')) then
    raise exception 'You can check in or out only for yourself.' using errcode = '42501';
  end if;
  -- The meeting record is append-only for members.
  n := coalesce(jsonb_array_length(old.data -> 'log'), 0);
  if coalesce(jsonb_array_length(new.data -> 'log'), 0) < n
     or coalesce((select jsonb_agg(e order by i) from jsonb_array_elements(new.data -> 'log') with ordinality x(e, i) where i <= n), '[]'::jsonb)
        is distinct from coalesce(old.data -> 'log', '[]'::jsonb) then
    raise exception 'The meeting record can only be added to.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists docs_meeting_guard on public.docs;
create trigger docs_meeting_guard before insert or update on public.docs
  for each row when (pg_trigger_depth() < 2 and new.coll = 'meetingState')
  execute function public.meeting_state_guard();
drop trigger if exists docs_meeting_guard_del on public.docs;
create trigger docs_meeting_guard_del before delete on public.docs
  for each row when (pg_trigger_depth() < 2 and old.coll = 'meetingState')
  execute function public.meeting_state_guard();

-- One vote per member per ballot. Returns 'ok', or why it wasn't recorded:
-- 'denied' (not a member here), 'notmember' (account not linked to a seat), 'notstarted', 'closed', 'checkin', 'dup', 'invalid'.
-- Quorum and seat lists come from the static county data in the browser, so the screen checks quorum before calling.
create or replace function public.cast_vote(
  p_tenant text, p_meeting_id text, p_ballot_id text, p_option text, p_secret boolean,
  p_receipt_hash text, p_ballot_title text default null, p_weight numeric default 1
) returns text
language plpgsql security definer set search_path = public as $$
declare
  mid   text;
  who   text;
  s     jsonb;
  st    jsonb;
  box   jsonb;
  roll  jsonb;
  ttl   text := left(coalesce(nullif(trim(p_ballot_title), ''), 'the ballot'), 200);
  entry jsonb;
begin
  if auth.uid() is null or not public.can('governance.vote', p_tenant) then return 'denied'; end if;
  if p_ballot_id !~ '^[A-Za-z0-9_.:-]{1,80}$' or p_option !~ '^[A-Za-z0-9_.:-]{1,80}$'
     or p_receipt_hash !~ '^[0-9a-f]{32}$' or coalesce(p_meeting_id, '') = '' then
    return 'invalid';
  end if;
  select p.member_id, p.name into mid, who from public.profiles p where p.id = auth.uid();
  if mid is null or mid = '' then return 'notmember'; end if;

  select d.data into s from public.docs d
   where d.tenant = p_tenant and d.coll = 'meetingState' and d.id = '__key__' for update;
  if s is null or s ->> 'meetingId' is distinct from p_meeting_id or coalesce(s ->> 'status', 'scheduled') = 'scheduled' then
    return 'notstarted';
  end if;
  if s ->> 'status' = 'closed' or s #>> array['ballots', p_ballot_id, 'status'] = 'closed' then return 'closed'; end if;
  if not coalesce(s -> 'checkIns', '{}'::jsonb) ? mid then return 'checkin'; end if;

  box := '{"tally":{},"voters":[],"receipts":[]}'::jsonb || coalesce(s #> array['box', p_ballot_id], '{}'::jsonb);
  st := coalesce(s #> array['ballots', p_ballot_id], '{}'::jsonb);
  roll := coalesce(st -> 'roll', '{}'::jsonb);
  if box -> 'voters' ? mid or roll ? mid then return 'dup'; end if;

  if p_secret then
    box := jsonb_set(box, array['tally', p_option], to_jsonb(coalesce((box #>> array['tally', p_option])::numeric, 0) + 1), true);
    box := jsonb_set(box, '{voters}', (box -> 'voters') || to_jsonb(mid));
    entry := jsonb_build_object('at', public.now_iso(), 'text', format('Ballot received on “%s” (choice sealed)', ttl), 'kind', 'vote');
  else
    st := jsonb_set(st, '{roll}', roll || jsonb_build_object(mid, p_option));
    s := jsonb_set(s, '{ballots}', coalesce(s -> 'ballots', '{}'::jsonb) || jsonb_build_object(p_ballot_id, st));
    entry := jsonb_build_object('at', public.now_iso(), 'kind', 'vote',
      'text', format('%s voted on “%s” (weight %s)', coalesce(nullif(who, ''), 'A member'), ttl,
                     trim(trailing '.' from trim(trailing '0' from round(greatest(coalesce(p_weight, 1), 0), 1)::text))));
  end if;
  box := jsonb_set(box, '{receipts}', (select coalesce(jsonb_agg(x order by x), '[]'::jsonb)
                                         from jsonb_array_elements_text((box -> 'receipts') || to_jsonb(p_receipt_hash)) x));
  s := jsonb_set(s, '{box}', coalesce(s -> 'box', '{}'::jsonb) || jsonb_build_object(p_ballot_id, box));
  s := jsonb_set(s, '{log}', coalesce(s -> 'log', '[]'::jsonb) || entry);

  perform public.internal_on();
  update public.docs set data = s where tenant = p_tenant and coll = 'meetingState' and id = '__key__';
  perform public.internal_off();
  return 'ok';
end $$;

revoke execute on function public.cast_vote(text, text, text, text, boolean, text, text, numeric) from public, anon;
grant execute on function public.cast_vote(text, text, text, text, boolean, text, text, numeric) to authenticated;

update public.coll_policies set note = 'members change only their own check-in and append to the record; votes go through cast_vote (R5)'
 where coll = 'meetingState';
