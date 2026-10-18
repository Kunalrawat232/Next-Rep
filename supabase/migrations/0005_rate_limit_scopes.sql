-- Rate limits per endpoint, and a daily ceiling for the model calls of the whole project.
--
-- Before this, /api/parse and /api/coach shared one counter per window, and the 60 second and 3600 second windows
-- shared a row in the first minute of each hour, so one request could count twice. Now a counter is told apart by
-- its scope (the endpoint) and its window length. Counters are only ever short-lived numbers, so the old rows go.

delete from public.api_rate_limits;

alter table public.api_rate_limits
  add column scope text not null default 'api' check (scope ~ '^[a-z]{1,20}$'),
  add column window_seconds integer not null default 60 check (window_seconds between 1 and 3600);

alter table public.api_rate_limits drop constraint api_rate_limits_pkey;
alter table public.api_rate_limits add primary key (user_id, scope, window_seconds, window_start);

create function public.consume_rate_limit(p_scope text, p_window_seconds integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_window timestamptz;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_scope is null or p_scope !~ '^[a-z]{1,20}$' then
    raise exception 'invalid scope' using errcode = '22023';
  end if;
  if p_window_seconds is null or p_window_seconds not between 1 and 3600 then
    raise exception 'invalid window' using errcode = '22023';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  delete from public.api_rate_limits
  where user_id = v_uid and window_start < now() - interval '1 day';

  insert into public.api_rate_limits as r (user_id, scope, window_seconds, window_start, request_count)
  values (v_uid, p_scope, p_window_seconds, v_window, 1)
  on conflict (user_id, scope, window_seconds, window_start) do update set request_count = r.request_count + 1
  returning r.request_count into v_count;

  return v_count;
end;
$$;

revoke execute on function public.consume_rate_limit(text, integer) from public, anon;
grant execute on function public.consume_rate_limit(text, integer) to authenticated;

-- The one-argument version stays for a /api/parse that was deployed before this migration; it counts as 'parse'.
create or replace function public.consume_rate_limit(p_window_seconds integer)
returns integer
language sql
security definer
set search_path = ''
as $$
  select public.consume_rate_limit('parse', p_window_seconds);
$$;

-- Model calls made by the whole project per day (UTC), so one busy day cannot use up the free tier.
create table public.api_daily_totals (
  scope text not null check (scope ~ '^[a-z]{1,20}$'),
  day date not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (scope, day)
);
alter table public.api_daily_totals enable row level security;

-- Counts one model call and says whether it is still under the day's ceiling. The ceiling is fixed here, not
-- passed in by the caller. A caller who is over the per-hour cap below is turned away without touching the shared
-- count, so one account cannot use up the day.
create function public.consume_daily_ceiling(p_scope text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Model calls the whole project may make in a day (UTC): about what the free tier gives. Change it here.
  v_max constant integer := 1000;
  v_today date := (now() at time zone 'utc')::date;
  v_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_scope is null or p_scope <> 'gemini' then
    raise exception 'invalid scope' using errcode = '22023';
  end if;

  if public.consume_rate_limit('ceiling', 3600) > 100 then
    return false;
  end if;

  delete from public.api_daily_totals where day < v_today - 7;

  insert into public.api_daily_totals as t (scope, day, request_count)
  values (p_scope, v_today, 1)
  on conflict (scope, day) do update set request_count = t.request_count + 1
  returning t.request_count into v_count;

  return v_count <= v_max;
end;
$$;

revoke execute on function public.consume_daily_ceiling(text) from public, anon;
grant execute on function public.consume_daily_ceiling(text) to authenticated;
