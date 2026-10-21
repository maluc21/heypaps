-- supabase/migrations/0018_superadmin.sql
-- Panel de superadmin (plan §6.1, §6.2).
--
-- El superadmin ve METADATOS de las tiendas, nunca su contenido: no entra al
-- panel de un vendedor ni ve sus productos. Es lo que resuelve la pregunta
-- abierta §14.6 con la menor superficie de riesgo.
--
-- Todas las funciones son SECURITY DEFINER y validan el rol de plataforma
-- DENTRO de la base: que la UI los oculte no es la proteccion.
--
-- Roles:
--   superadmin - lee y opera (suspender, cambiar plan, ver auditoria)
--   support    - solo lee

-- ============================================================
-- admin_list_stores: listado con estado, plan, uso y ultimo acceso
-- ============================================================

create or replace function public.admin_list_stores()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_role text := public.current_user_platform_role();
begin
  if v_role is null then
    raise exception 'no autorizado';
  end if;

  return jsonb_build_object(
    'role', v_role,
    'plans', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'plan_code', pl.plan_code,
        'max_products', pl.max_products,
        'max_images_per_product', pl.max_images_per_product,
        'max_storage_bytes', pl.max_storage_bytes,
        'remove_brand', pl.remove_brand,
        'custom_domain', pl.custom_domain
      ) order by pl.plan_code), '[]'::jsonb)
      from public.plan_limits pl
    ),
    'stores', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'slug', s.slug,
        'name', s.name,
        'status', s.status,
        'plan_code', s.plan_code,
        'created_at', s.created_at,
        'updated_at', s.updated_at,
        'products', (
          select count(*) from public.products p
          where p.store_id = s.id and p.deleted_at is null
        ),
        'bytes_used', coalesce((
          select ss.bytes_used from public.store_storage ss where ss.store_id = s.id
        ), 0),
        'max_storage_bytes', pl.max_storage_bytes,
        'max_products', pl.max_products,
        'owner_email', (
          select u.email from public.store_members sm
          join auth.users u on u.id = sm.user_id
          where sm.store_id = s.id and sm.role = 'owner'
          limit 1
        ),
        'last_sign_in_at', (
          select max(u.last_sign_in_at) from public.store_members sm
          join auth.users u on u.id = sm.user_id
          where sm.store_id = s.id
        )
      ) order by s.created_at desc), '[]'::jsonb)
      from public.stores s
      join public.plan_limits pl on pl.plan_code = s.plan_code
      where s.deleted_at is null
    )
  );
end $$;

revoke execute on function public.admin_list_stores() from public;
grant execute on function public.admin_list_stores() to authenticated;

-- ============================================================
-- admin_set_store_status: suspender, reactivar o despublicar
-- ============================================================

create or replace function public.admin_set_store_status(
  p_store_id uuid,
  p_status text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text := public.current_user_platform_role();
  v_slug text;
begin
  if v_role is distinct from 'superadmin' then
    raise exception 'solo un superadmin puede cambiar el estado de una tienda';
  end if;

  if p_status not in ('draft', 'published', 'suspended') then
    raise exception 'estado no valido';
  end if;

  update public.stores
  set status = p_status, updated_at = now()
  where id = p_store_id and deleted_at is null
  returning slug into v_slug;

  if v_slug is null then
    raise exception 'la tienda no existe';
  end if;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    p_store_id, v_actor, 'admin.store_status', 'store', p_store_id,
    jsonb_build_object('status', p_status)
  );
end $$;

revoke execute on function public.admin_set_store_status(uuid, text) from public;
grant execute on function public.admin_set_store_status(uuid, text) to authenticated;

-- ============================================================
-- admin_set_store_plan: cambiar el plan de la tienda
-- ============================================================

create or replace function public.admin_set_store_plan(
  p_store_id uuid,
  p_plan_code text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text := public.current_user_platform_role();
begin
  if v_role is distinct from 'superadmin' then
    raise exception 'solo un superadmin puede cambiar el plan de una tienda';
  end if;

  if not exists (
    select 1 from public.plan_limits pl where pl.plan_code = p_plan_code
  ) then
    raise exception 'plan desconocido';
  end if;

  update public.stores
  set plan_code = p_plan_code, updated_at = now()
  where id = p_store_id and deleted_at is null;

  if not found then
    raise exception 'la tienda no existe';
  end if;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    p_store_id, v_actor, 'admin.store_plan', 'store', p_store_id,
    jsonb_build_object('plan_code', p_plan_code)
  );
end $$;

revoke execute on function public.admin_set_store_plan(uuid, text) from public;
grant execute on function public.admin_set_store_plan(uuid, text) to authenticated;

-- ============================================================
-- admin_audit_log: auditoria de una tienda
-- ============================================================

create or replace function public.admin_audit_log(
  p_store_id uuid,
  p_limit int default 100
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_role text := public.current_user_platform_role();
begin
  if v_role is null then
    raise exception 'no autorizado';
  end if;

  return jsonb_build_object(
    'entries', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'id', al.id,
          'action', al.action,
          'entity', al.entity,
          'entity_id', al.entity_id,
          'meta', al.meta,
          'created_at', al.created_at,
          'actor_email', u.email
        ) order by al.created_at desc, al.id desc)
        from public.audit_log al
        left join auth.users u on u.id = al.actor_user_id
        where al.store_id = p_store_id
        limit greatest(1, least(coalesce(p_limit, 100), 500))
      ),
      '[]'::jsonb
    )
  );
end $$;

revoke execute on function public.admin_audit_log(uuid, int) from public;
grant execute on function public.admin_audit_log(uuid, int) to authenticated;

-- ============================================================
-- admin_grant_platform_role: dar o quitar un rol de plataforma
--
-- Solo un superadmin puede hacerlo, y solo a otro superadmin: nadie puede
-- auto-promoverse. El primer superadmin se siembra por SQL directo con
-- service_role (una sola vez, ver README del plan §10.0.7).
-- ============================================================

create or replace function public.admin_grant_platform_role(
  p_user_id uuid,
  p_role text,
  p_grant boolean default true
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text := public.current_user_platform_role();
begin
  if v_role is distinct from 'superadmin' then
    raise exception 'solo un superadmin puede gestionar los roles de plataforma';
  end if;

  if p_user_id = v_actor and not p_grant then
    raise exception 'un superadmin no puede quitarse su propio rol';
  end if;

  if p_grant then
    if p_role not in ('superadmin', 'support') then
      raise exception 'rol no valido';
    end if;
    insert into public.platform_members (user_id, role)
    values (p_user_id, p_role)
    on conflict (user_id) do update set role = excluded.role;
  else
    delete from public.platform_members where user_id = p_user_id;
  end if;
end $$;

revoke execute on function public.admin_grant_platform_role(uuid, text, bool) from public;
grant execute on function public.admin_grant_platform_role(uuid, text, bool) to authenticated;
