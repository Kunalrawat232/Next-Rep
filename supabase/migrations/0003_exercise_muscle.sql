-- The muscle an exercise mainly works, so search can find "chest" or "glutes". Optional: a custom
-- exercise may leave it empty, and then only body_part (upper, lower, core) applies.
alter table public.exercises
  add column muscle text check (
    muscle in (
      'chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'lats', 'upper_back', 'traps',
      'lower_back', 'abs', 'glutes', 'quads', 'hamstrings', 'calves', 'adductors', 'abductors'
    )
  );
