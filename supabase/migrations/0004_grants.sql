-- supabase/migrations/0004_grants.sql
-- Privilegios explícitos de tabla. RLS filtra filas; GRANT decide si la sentencia llega a RLS.
--
-- Hallazgo: el proyecto tenía TRUNCATE, REFERENCES y TRIGGER para anon y authenticated
-- sobre todas las tablas de negocio. TRUNCATE no pasa por RLS: permitía vaciar tablas
-- completas de todas las tiendas. Además, authenticated no tenía SELECT.
--
-- Modelo: lectura por RLS para authenticated; escritura solo vía RPC SECURITY DEFINER;
-- anon sin privilegios sobre tablas base (solo RPC públicas).

-- 1. Quitar todo privilegio de tabla a anon y authenticated en public
revoke all on all tables in schema public from anon, authenticated;

-- 2. Lectura para usuarios autenticados (RLS restringe filas a su tenancy)
grant select on
  public.profiles,
  public.platform_members,
  public.stores,
  public.store_members,
  public.categories,
  public.tags,
  public.products,
  public.variants,
  public.store_storage,
  public.audit_log,
  public.events,
  public.plan_limits
to authenticated;

-- 3. Secuencias: las RPC insertan con bigserial (audit_log, events) vía SECURITY DEFINER,
--    así que no hace falta conceder uso de secuencias a los roles de petición.
revoke all on all sequences in schema public from anon, authenticated;

-- 4. Proyección: tablas nuevas no recibirán privilegios automáticos para anon/authenticated.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
