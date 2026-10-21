-- supabase/migrations/0019_seed_superadmin.sql
-- Bootstrap del primer superadmin (plan §10.0.7).
--
-- La funcion NO es security definer a proposito: se ejecuta con los
-- privilegios del llamante y solo acepta llamadas del propietario de la base
-- (la CLI de Supabase) o de service_role. Un rol de aplicacion no puede
-- llamarla, y el permiso de ejecucion se revoca a public/anon/authenticated,
-- asi que nadie puede auto-asignarse el rol de superadmin desde la app.
--
-- Uso (desde la CLI de Supabase):
--   select public.platform_seed_superadmin(id) from auth.users where email = 'tu@email.com';

create or replace function public.platform_seed_superadmin(p_user_id uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'solo el propietario de la base puede sembrar un superadmin';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'el usuario no existe';
  end if;

  insert into public.platform_members (user_id, role)
  values (p_user_id, 'superadmin')
  on conflict (user_id) do update set role = 'superadmin';
end $$;

revoke execute on function public.platform_seed_superadmin(uuid) from public;
revoke execute on function public.platform_seed_superadmin(uuid) from anon;
revoke execute on function public.platform_seed_superadmin(uuid) from authenticated;
