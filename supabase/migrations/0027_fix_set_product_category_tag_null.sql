-- supabase/migrations/0027_fix_set_product_category_tag_null.sql
-- Fix: set_product_category y set_product_tag deben aceptar null para limpiar.

-- ============================================================
-- set_product_category: p_category_id debe ser uuid nullable
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
-- set_product_tag: p_tag_id debe ser uuid nullable
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
    select 1 from public.tags t
    where t.id = p_tag_id and t.store_id = v_store_id
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