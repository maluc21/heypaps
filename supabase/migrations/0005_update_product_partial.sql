-- supabase/migrations/0005_update_product_partial.sql
-- Corrige update_product: semántica de actualización parcial.
--
-- Hallazgo (E2E): la acción "Ocultar" envía null o valores por defecto para los campos que
-- no cambia. La versión anterior los aplicaba literalmente: name = null (viola NOT NULL),
-- images = '{}' (borra imágenes), featured/paused = false y position = 0 en cada cambio.
--
-- Ahora null significa "conservar el valor actual". Misma firma que 0001 (no rompe llamadas).
-- Limitación conocida: category_id y tag_id no pueden limpiarse a null con esta RPC; se
-- resolverá con una RPC específica cuando exista la UI de categorías/etiquetas.

create or replace function public.update_product(
  p_product_id uuid,
  p_name text,
  p_description text,
  p_category_id uuid,
  p_tag_id uuid,
  p_attributes jsonb,
  p_images text[],
  p_position int,
  p_active bool,
  p_paused bool,
  p_featured bool,
  p_expected_version int
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_store_id uuid;
  v_actor uuid := (select auth.uid());
  v_affected int;
begin
  select p.store_id into v_store_id
  from public.products p
  where p.id = p_product_id;

  if not exists (
    select 1 from public.store_members sm
    where sm.store_id = v_store_id
      and sm.user_id = v_actor
      and sm.role in ('owner', 'editor')
  ) then
    raise exception 'no autorizado para editar este producto';
  end if;

  update public.products
  set name        = coalesce(p_name, name),
      description = coalesce(p_description, description),
      category_id = coalesce(p_category_id, category_id),
      tag_id      = coalesce(p_tag_id, tag_id),
      attributes  = coalesce(p_attributes, attributes),
      images      = coalesce(p_images, images),
      position    = coalesce(p_position, position),
      active      = coalesce(p_active, active),
      paused      = coalesce(p_paused, paused),
      featured    = coalesce(p_featured, featured),
      updated_at  = now(),
      version     = version + 1
  where id = p_product_id
    and version = p_expected_version;

  get diagnostics v_affected = row_count;

  if v_affected = 0 then
    raise exception 'conflicto: el producto cambió en otra pestaña, recargar' using errcode = '45000';
  end if;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    v_store_id, v_actor, 'product.update', 'product', p_product_id,
    jsonb_build_object('partial', true)
  );
end $$;

revoke execute on function public.update_product(
  uuid, text, text, uuid, uuid, jsonb, text[], int, bool, bool, bool, int
) from public;
grant execute on function public.update_product(
  uuid, text, text, uuid, uuid, jsonb, text[], int, bool, bool, bool, int
) to authenticated;
