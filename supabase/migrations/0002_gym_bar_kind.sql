-- Lets a logged exercise find its bar: a barbell uses gyms.default_bar_kg, an EZ-bar exercise the
-- gym's 'ez_bar', a Smith exercise its 'smith'. 'other' bars are manual overrides only.
alter table public.gym_bars
  add column kind text not null default 'other' check (kind in ('ez_bar', 'smith', 'other'));

-- At most one EZ bar and one Smith bar per gym, so the lookup is never ambiguous.
create unique index gym_bars_one_kind_per_gym on public.gym_bars (gym_id, kind) where kind <> 'other';

-- Bar names are unique within a gym, ignoring case.
create unique index gym_bars_name_per_gym on public.gym_bars (gym_id, lower(name));

-- A name of only spaces is not a name. The app already refuses it; this makes the database agree.
alter table public.gyms add constraint gyms_name_not_blank check (btrim(name) <> '');
alter table public.gym_bars add constraint gym_bars_name_not_blank check (btrim(name) <> '');
