-- supabase/migrations/0012_categories.sql
-- Categorías del catálogo (plan §2.4) y el pendiente de limpiar la categoría
-- de un producto.
--
-- Pendiente resuelto: tras la migración 0005, update_product trata null como
-- "conservar el valor actual", asi que no habia forma de quitar la categoria
-- de un producto (p_category_id = null no se aplicaba nunca). Estas RPCs
-- resuelven el caso: set_product_category quita la categoria cuando recibe
-- null, y set_product_tag hace lo propio con la etiqueta.

-- ============================================================
-- create_category
-- ============================================================

create or replace function public.create_category(
  p_store_id uuid,
  p_name text,
  p_slug text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_id uuid;
  v_slug text := lower(trim(coalesce(p_slug, p_name)));
begin
  select sm.role into v_role
  from public.store_members sm
  where sm.store_id = p_store_id and sm.user_id = v_actor;

  if v_role is distinct from 'owner' and v_role is distinct from 'editor' then
    raise exception 'no autorizado';
  end if;

  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'el nombre de la categoria es obligatorio';
  end if;

  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);

  if v_slug = '' then
    raise exception 'el nombre de la categoria no es valido';
  end if;

  if exists (
    select 1 from public.categories c
    where c.store_id = p_store_id and c.slug = v_slug
  ) then
    raise exception 'ya existe una categoria con ese identificador';
  end if;

  insert into public.categories (store_id, name, slug, position)
  values (
    p_store_id, trim(p_name), v_slug,
    coalesce((select max(position) + 1 from public.categories c where c.store_id = p_store_id), 0)
  )
  returning id into v_id;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    p_store_id, v_actor, 'category.create', 'category', v_id,
    jsonb_build_object('slug', v_slug)
  );

  return v_id;
end $$;

revoke execute on function public.create_category(uuid, text, text) from public;
grant execute on function public.create_category(uuid, text, text) to authenticated;

-- ============================================================
-- update_category: nombre, slug, visible y orden
-- ============================================================

create or replace function public.update_category(
  p_category_id uuid,
  p_name text,
  p_slug text,
  p_active bool,
  p_position int
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_store_id uuid;
  v_role text;
  v_slug text;
begin
  select c.store_id into v_store_id from public.categories c where c.id = p_category_id;

  select sm.role into v_role
  from public.store_members sm
  where sm.store_id = v_store_id and sm.user_id = v_actor;

  if v_role is distinct from 'owner' and v_role is distinct from 'editor' then
    raise exception 'no autorizado';
  end if;

  v_slug := regexp_replace(lower(trim(coalesce(p_slug, p_name))), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);

  if v_slug = '' then
    raise exception 'el nombre de la categoria no es valido';
  end if;

  if exists (
    select 1 from public.categories c
    where c.store_id = v_store_id and c.slug = v_slug and c.id <> p_category_id
  ) then
    raise exception 'ya existe una categoria con ese identificador';
  end if;

  update public.categories
  set name = trim(p_name),
      slug = v_slug,
      active = coalesce(p_active, active),
      position = coalesce(p_position, position)
  where id = p_category_id;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    v_store_id, v_actor, 'category.update', 'category', p_category_id,
    jsonb_build_object('slug', v_slug)
  );
end $$;

revoke execute on function public.update_category(uuid, text, text, bool, int) from public;
grant execute on function public.update_category(uuid, text, text, bool, int) to authenticated;

-- ============================================================
-- delete_category
--
-- Los productos que usaban la categoria quedan sin categoria (ON DELETE SET
-- NULL) y su enlace publico no cambia.
-- ============================================================

create or replace function public.delete_category(p_category_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_store_id uuid;
  v_role text;
begin
  select c.store_id into v_store_id from public.categories c where c.id = p_category_id;

  select sm.role into v_role
  from public.store_members sm
  where sm.store_id = v_store_id and sm.user_id = v_actor;

  if v_role is distinct from 'owner' and v_role is distinct from 'editor' then
    raise exception 'no autorizado';
  end if;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    v_store_id, v_actor, 'category.delete', 'category', p_category_id, '{}'::jsonb
  );

  delete from public.categories where id = p_category_id;
end $$;

revoke execute on function public.delete_category(uuid) from public;
grant execute on function public.delete_category(uuid) to authenticated;

-- ============================================================
-- set_product_category: asignar o QUITAR la categoria
--
-- Esta es la RPC que faltaba para limpiar category_id: null significa
-- "quitar la categoria", no "conservar".
-- ============================================================

create or replace function public.set_product_category(
  p_product_id uuid,
  p_category_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_store_id uuid;
  v_role text;
begin
  select p.store_id into v_store_id from public.products p where p.id = p_product_id;

  select sm.role into v_role
  from public.store_members sm
  where sm.store_id = v_store_id and sm.user_id = v_actor;

  if v_role is distinct from 'owner' and v_role is distinct from 'editor' then
    raise exception 'no autorizado';
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = p_category_id and c.store_id = v_store_id
  ) then
    raise exception 'la categoria no pertenece a la tienda';
  end if;

  update public.products
  set category_id = p_category_id, updated_at = now()
  where id = p_product_id;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    v_store_id, v_actor, 'product.category', 'product', p_product_id,
    jsonb_build_object('category_id', p_category_id)
  );
end $$;

revoke execute on function public.set_product_category(uuid, uuid) from public;
grant execute on function public.set_product_category(uuid, uuid) to authenticated;

-- ============================================================
-- set_product_tag: asignar o QUITAR la etiqueta
-- ============================================================

create or replace function public.set_product_tag(
  p_product_id uuid,
  p_tag_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_store_id uuid;
  v_role text;
begin
  select p.store_id into v_store_id from public.products p where p.id = p_product_id;

  select sm.role into v_role
  from public.store_members sm
  where sm.store_id = v_store_id and sm.user_id = v_actor;

  if v_role is distinct from 'owner' and v_role is distinct from 'editor' then
    raise exception 'no autorizado';
  end if;

  if p_tag_id is not null and not exists (
    select 1 from public.tags t where t.id = p_tag_id and t.store_id = v_store_id
  ) then
    raise exception 'la etiqueta no pertenece a la tienda';
  end if;

  update public.products
  set tag_id = p_tag_id, updated_at = now()
  where id = p_product_id;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    v_store_id, v_actor, 'product.tag', 'product', p_product_id,
    jsonb_build_object('tag_id', p_tag_id)
  );
end $$;

revoke execute on function public.set_product_tag(uuid, uuid) from public;
grant execute on function public.set_product_tag(uuid, uuid) to authenticated;
