-- tests/e2e/cleanup-e2e.sql
-- Elimina SOLO los datos creados por el E2E (tiendas slug 'e2e-%' y usuarios 'e2e-%@test.test').
-- Ejecutar antes y después de cada corrida:
--   supabase db query --linked -f tests/e2e/cleanup-e2e.sql

begin;
set local session_replication_role = replica;

-- Incluye también los fixtures exactos del suite supabase/tests/isolation.sql
-- (tienda-a/b/c y user-a/b@test.test), que dejan datos en el proyecto.
create temp table _e2e_stores as select id from public.stores
  where slug like 'e2e-%' or slug in ('tienda-a', 'tienda-b', 'tienda-c');
create temp table _e2e_users as select id from auth.users
  where email like 'e2e-%@test.test' or email in ('user-a@test.test', 'user-b@test.test');

delete from public.audit_log where store_id in (select id from _e2e_stores)
  or actor_user_id in (select id from _e2e_users);
delete from public.events where store_id in (select id from _e2e_stores);
delete from public.variants where store_id in (select id from _e2e_stores);
delete from public.products where store_id in (select id from _e2e_stores);
delete from public.categories where store_id in (select id from _e2e_stores);
delete from public.tags where store_id in (select id from _e2e_stores);
delete from public.store_storage where store_id in (select id from _e2e_stores);
delete from public.store_members where store_id in (select id from _e2e_stores)
  or user_id in (select id from _e2e_users);
delete from public.stores where id in (select id from _e2e_stores);
delete from public.profiles where id in (select id from _e2e_users);
delete from auth.refresh_tokens where session_id in (
  select s.id from auth.sessions s where s.user_id in (select id from _e2e_users));
delete from auth.sessions where user_id in (select id from _e2e_users);
delete from auth.identities where user_id in (select id from _e2e_users);
delete from auth.users where id in (select id from _e2e_users);

commit;
