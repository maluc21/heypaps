-- supabase/migrations/0007_publish_store.sql
-- Publicación de la tienda.
--
-- El onboarding deja la tienda en 'draft' (plan §8.1) y el catálogo público solo
-- sirve tiendas 'published'. Faltaba el paso intermedio: sin esta RPC el
-- vendedor no tenía forma de publicar su catálogo y el link público nunca
-- funcionaba.
--
-- Solo el owner puede publicar. La RPC audita el cambio.

create or replace function public.publish_store(p_store_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
begin
  select sm.role into v_role
  from public.store_members sm
  where sm.store_id = p_store_id and sm.user_id = v_actor;

  if v_role is distinct from 'owner' then
    raise exception 'solo el dueno puede publicar la tienda';
  end if;

  update public.stores
  set status = 'published',
      updated_at = now()
  where id = p_store_id
    and deleted_at is null
    and status = 'draft';

  if not found then
    raise exception 'la tienda no existe o ya esta publicada';
  end if;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    p_store_id, v_actor, 'store.publish', 'store', p_store_id, '{}'::jsonb
  );
end $$;

revoke execute on function public.publish_store(uuid) from public;
grant execute on function public.publish_store(uuid) to authenticated;

-- Despublicar: el vendedor puede ocultar su catálogo sin perderlo.
create or replace function public.unpublish_store(p_store_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
begin
  select sm.role into v_role
  from public.store_members sm
  where sm.store_id = p_store_id and sm.user_id = v_actor;

  if v_role is distinct from 'owner' then
    raise exception 'solo el dueno puede despublicar la tienda';
  end if;

  update public.stores
  set status = 'draft',
      updated_at = now()
  where id = p_store_id
    and deleted_at is null
    and status = 'published';

  if not found then
    raise exception 'la tienda no existe o no esta publicada';
  end if;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    p_store_id, v_actor, 'store.unpublish', 'store', p_store_id, '{}'::jsonb
  );
end $$;

revoke execute on function public.unpublish_store(uuid) from public;
grant execute on function public.unpublish_store(uuid) to authenticated;
