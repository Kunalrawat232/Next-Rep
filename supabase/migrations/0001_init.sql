-- Next Rep: initial schema, constraints, indexes and Row Level Security.
-- See docs/architecture/data-model.md. All weights are stored in kg (total including the bar).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  default_unit text not null default 'kg' check (default_unit in ('kg', 'lb')),
  created_at timestamptz not null default now()
);

create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  default_bar_kg numeric(5, 2) not null default 20 check (default_bar_kg between 0 and 100),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  -- Target for composite foreign keys, so child rows cannot point at another user's gym.
  unique (id, user_id)
);

create table public.gym_bars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  gym_id uuid not null,
  name text not null check (char_length(name) between 1 and 60),
  weight_kg numeric(5, 2) not null check (weight_kg between 0 and 100),
  foreign key (gym_id, user_id) references public.gyms (id, user_id) on delete cascade
);

-- user_id is null for global seeded exercises (see supabase/seed.sql).
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  equipment_type text not null
    check (equipment_type in ('barbell', 'ez_bar', 'smith', 'dumbbell', 'machine', 'cable', 'bodyweight')),
  body_part text not null check (body_part in ('upper', 'lower', 'core')),
  aliases text[] not null default '{}'
    check (cardinality(aliases) <= 20 and octet_length(array_to_string(aliases, ',')) <= 1000)
);

-- Ids for workouts and sets are generated on the client (crypto.randomUUID()) and used for
-- idempotent upserts, so they intentionally have no default.
create table public.workouts (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  gym_id uuid,
  started_at timestamptz not null,
  ended_at timestamptz,
  notes text check (char_length(notes) <= 1000),
  deleted_at timestamptz,
  check (ended_at is null or ended_at >= started_at),
  unique (id, user_id),
  foreign key (gym_id, user_id) references public.gyms (id, user_id) on delete set null (gym_id)
);

create table public.sets (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid not null,
  exercise_id uuid not null references public.exercises (id),
  total_kg numeric(6, 2) not null check (total_kg between 0 and 500),
  bar_kg numeric(5, 2) check (bar_kg between 0 and 100),
  per_side_kg numeric(5, 2) check (per_side_kg between 0 and 250),
  input_mode text not null check (input_mode in ('total', 'per_side', 'tap')),
  reps integer not null check (reps between 1 and 100),
  source text not null check (source in ('voice', 'tap', 'gemini')),
  raw_transcript text check (char_length(raw_transcript) <= 500),
  logged_at timestamptz not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (workout_id, user_id) references public.workouts (id, user_id) on delete cascade,
  check (input_mode <> 'per_side' or (per_side_kg is not null and bar_kg is not null)),
  check (per_side_kg is null or bar_kg is null or total_kg = bar_kg + 2 * per_side_kg)
);

-- Per-user request counters for /api/parse. Not directly accessible to clients: it is only
-- written through public.consume_rate_limit() below.
create table public.api_rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, window_start)
);

-- ---------------------------------------------------------------------------
-- Indexes (Postgres does not index foreign keys automatically)
-- ---------------------------------------------------------------------------

create unique index gyms_one_default_per_user on public.gyms (user_id) where is_default;
create index gyms_user_id_idx on public.gyms (user_id);
create index gym_bars_user_gym_idx on public.gym_bars (user_id, gym_id);

create unique index exercises_global_name_key on public.exercises (lower(name)) where user_id is null;
create unique index exercises_user_name_key on public.exercises (user_id, lower(name)) where user_id is not null;
create index exercises_user_id_idx on public.exercises (user_id);

create index workouts_user_started_idx on public.workouts (user_id, started_at desc);
create index workouts_user_gym_idx on public.workouts (user_id, gym_id);

create index sets_user_exercise_logged_idx on public.sets (user_id, exercise_id, logged_at desc);
create index sets_user_workout_idx on public.sets (user_id, workout_id);
create index sets_exercise_id_idx on public.sets (exercise_id);

-- ---------------------------------------------------------------------------
-- A set may only reference an exercise the user can see (global or their own).
-- Foreign keys bypass RLS, so this trigger (SECURITY INVOKER, hence subject to the
-- exercises RLS policies) closes that gap.
-- ---------------------------------------------------------------------------

create function public.sets_check_exercise_visible()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.exercises where id = new.exercise_id) then
    raise exception 'exercise % is not available', new.exercise_id using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger sets_check_exercise_visible
  before insert or update of exercise_id on public.sets
  for each row execute function public.sets_check_exercise_visible();

-- ---------------------------------------------------------------------------
-- Rate limiting for /api/parse.
-- SECURITY DEFINER on purpose: clients must not be able to write the counter table directly
-- (they could reset their own limit). The function only ever touches the caller's own row,
-- checks auth.uid() itself, pins search_path and is not executable by anon.
-- Returns the number of calls made by the caller in the current window; /api/parse decides
-- whether that exceeds its limit.
-- ---------------------------------------------------------------------------

create function public.consume_rate_limit(p_window_seconds integer)
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
  if p_window_seconds is null or p_window_seconds not between 1 and 3600 then
    raise exception 'invalid window' using errcode = '22023';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  delete from public.api_rate_limits
  where user_id = v_uid and window_start < now() - interval '1 day';

  insert into public.api_rate_limits as r (user_id, window_start, request_count)
  values (v_uid, v_window, 1)
  on conflict (user_id, window_start) do update set request_count = r.request_count + 1
  returning r.request_count into v_count;

  return v_count;
end;
$$;

revoke execute on function public.consume_rate_limit(integer) from public, anon;
grant execute on function public.consume_rate_limit(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.gyms enable row level security;
alter table public.gym_bars enable row level security;
alter table public.exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.sets enable row level security;
alter table public.api_rate_limits enable row level security; -- no policies: deny all direct access

-- profiles (owner column is id)
create policy profiles_select on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_insert on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy profiles_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy profiles_delete on public.profiles for delete to authenticated
  using ((select auth.uid()) = id);

-- gyms
create policy gyms_select on public.gyms for select to authenticated
  using ((select auth.uid()) = user_id);
create policy gyms_insert on public.gyms for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy gyms_update on public.gyms for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy gyms_delete on public.gyms for delete to authenticated
  using ((select auth.uid()) = user_id);

-- gym_bars
create policy gym_bars_select on public.gym_bars for select to authenticated
  using ((select auth.uid()) = user_id);
create policy gym_bars_insert on public.gym_bars for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy gym_bars_update on public.gym_bars for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy gym_bars_delete on public.gym_bars for delete to authenticated
  using ((select auth.uid()) = user_id);

-- exercises: global rows (user_id is null) are readable by every signed-in user;
-- writes only on the user's own rows.
create policy exercises_select on public.exercises for select to authenticated
  using (user_id is null or (select auth.uid()) = user_id);
create policy exercises_insert on public.exercises for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy exercises_update on public.exercises for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy exercises_delete on public.exercises for delete to authenticated
  using ((select auth.uid()) = user_id);

-- workouts
create policy workouts_select on public.workouts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy workouts_insert on public.workouts for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy workouts_update on public.workouts for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy workouts_delete on public.workouts for delete to authenticated
  using ((select auth.uid()) = user_id);

-- sets
create policy sets_select on public.sets for select to authenticated
  using ((select auth.uid()) = user_id);
create policy sets_insert on public.sets for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy sets_update on public.sets for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy sets_delete on public.sets for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Data API privileges: signed-in users only. RLS decides which rows they can touch.
-- ---------------------------------------------------------------------------

revoke all on table
  public.profiles, public.gyms, public.gym_bars, public.exercises,
  public.workouts, public.sets, public.api_rate_limits
from anon;

revoke all on table public.api_rate_limits from authenticated;

grant select, insert, update, delete on table
  public.profiles, public.gyms, public.gym_bars, public.exercises,
  public.workouts, public.sets
to authenticated;
