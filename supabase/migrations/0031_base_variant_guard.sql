-- supabase/migrations/0031_base_variant_guard.sql
-- La variante sin atributos (presentación única) guarda el precio base del
-- producto. Migración 0028 quitó el guard de "última variante activa", lo que
-- permitió borrarla y dejar productos sin ninguna variante: en el catálogo
-- público aparecían como "Agotado" y sin precio.

-- ============================================================
-- 1. delete_variant: no permitir borrar la variante base
-- ============================================================

create or replace function public.delete_variant(
  p_product_id uuid,
  p_variant_id uuid,
  p_expected_version int
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_store_id uuid;
  v_version int;
  v_role text;
  v_deleted int;
begin
  select p.store_id, p.version into v_store_id, v_version
  from public.products p
  where p.id = p_product_id and p.deleted_at is null
  for update;

  if v_store_id is null then
    raise exception 'el producto no existe';
  end if;

  select sm.role into v_role
  from public.store_members sm
  where sm.store_id = v_store_id and sm.user_id = v_actor;

  if v_role is distinct from 'owner' and v_role is distinct from 'editor' then
    raise exception 'no autorizado';
  end if;

  if v_version <> p_expected_version then
    raise exception 'conflicto: el producto cambió en otra pestaña, recargar' using errcode = '45000';
  end if;

  -- La variante sin atributos es la que guarda el precio base: no se elimina.
  if exists (
    select 1 from public.variants v
    where v.id = p_variant_id and v.product_id = p_product_id
      and v.attributes = '{}'::jsonb
  ) then
    raise exception 'la variante base no se puede eliminar: edita el precio del producto en su lugar';
  end if;

  delete from public.variants
  where id = p_variant_id and product_id = p_product_id;
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise exception 'la variante no pertenece al producto';
  end if;

  update public.products
  set version = version + 1, updated_at = now()
  where id = p_product_id;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    v_store_id, v_actor, 'variant.delete', 'variant', p_variant_id,
    jsonb_build_object('product_id', p_product_id)
  );
end $$;

revoke execute on function public.delete_variant(uuid, uuid, int) from public;
grant execute on function public.delete_variant(uuid, uuid, int) to authenticated;

-- ============================================================
-- 2. Reparación: reactivar la variante base cuando es la única
--    y quedó inactiva (producto sin ninguna variante activa)
-- ============================================================

update public.variants v
set active = true, updated_at = now()
where v.attributes = '{}'::jsonb
  and not v.active
  and exists (
    select 1 from public.products p
    where p.id = v.product_id and p.active and p.deleted_at is null
  )
  and not exists (
    select 1 from public.variants o
    where o.product_id = v.product_id
      and o.id <> v.id
      and o.active
  );
