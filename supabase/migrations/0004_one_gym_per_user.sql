-- A person has one gym, so the app no longer has a list of gyms, a default gym or a gym name.
-- The table stays, with at most one row per user: it holds the bars that are added to every weight.

-- 1. A user who somehow has several keeps the default one, otherwise the oldest. The others go, with their
--    bars (cascade). A workout that used a removed gym keeps its own copy of the bars and only loses the
--    link (its foreign key sets gym_id to null).
delete from public.gyms g
using (
  select id,
         row_number() over (partition by user_id order by is_default desc, created_at, id) as position
  from public.gyms
) ranked
where g.id = ranked.id
  and ranked.position > 1;

-- 2. No default any more.
drop index if exists public.gyms_one_default_per_user;
alter table public.gyms drop column is_default;

-- 3. At most one gym per user. The plain index on user_id is covered by this one.
drop index if exists public.gyms_user_id_idx;
create unique index gyms_one_per_user on public.gyms (user_id);

-- 4. The app no longer asks for a name, so a new row takes this one.
alter table public.gyms alter column name set default 'My gym';
