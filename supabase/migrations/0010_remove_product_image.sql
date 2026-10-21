-- supabase/migrations/0010_remove_product_image.sql
-- Quita una imagen de un producto y de sus variantes.
--
-- Las escrituras del panel van por RPC SECURITY DEFINER (plan §5.2), así que
-- el borrado de una imagen necesita su propia RPC en vez de un UPDATE directo.
--
-- El borrado del archivo en ImageKit, la purga de caché y el descuento de bytes
-- los hace la API del servidor: esta RPC solo despeja las referencias.

create or replace function public.remove_product_image(
  p_store_id uuid,
  p_product_id uuid,
  p_file_id text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
begin
  select sm.role into v_role
  from public.store_members sm
  where sm.store_id = p_store_id and sm.user_id = v_actor;

  if v_role is distinct from 'owner' and v_role is distinct from 'editor' then
    raise exception 'no autorizado';
  end if;

  if not exists (
    select 1 from public.products p
    where p.id = p_product_id and p.store_id = p_store_id and p.deleted_at is null
  ) then
    raise exception 'el producto no pertenece a la tienda';
  end if;

  update public.products
  set images = (
    select coalesce(array_agg(img), '{}'::text[])
    from unnest(images) as img
    where img <> p_file_id
  ),
  updated_at = now()
  where id = p_product_id;

  update public.variants
  set image_file_id = null
  where product_id = p_product_id and image_file_id = p_file_id;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    p_store_id, v_actor, 'image.remove', 'product', p_product_id,
    jsonb_build_object('file_id', p_file_id)
  );
end $$;

revoke execute on function public.remove_product_image(uuid, uuid, text) from public;
grant execute on function public.remove_product_image(uuid, uuid, text) to authenticated;
