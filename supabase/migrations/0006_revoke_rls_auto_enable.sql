-- Takes away the right to call public.rls_auto_enable() through the API.
--
-- That function is a helper Supabase adds to a project (the "automatically enable RLS" event trigger). It is
-- SECURITY DEFINER, and a function in the public schema can be called by anyone through /rest/v1/rpc unless
-- EXECUTE is taken away. It only has a job when the event trigger runs it, so no API role needs to call it.
-- The security advisor flagged it for the anon and authenticated roles.
--
-- It only acts if the function exists, because a plain Postgres (the local database tests) does not have it.

do $$
begin
  if exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'rls_auto_enable'
      and pronargs = 0
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;
