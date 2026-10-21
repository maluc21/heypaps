-- supabase/migrations/0022_store_logo_guard.sql
-- Afina la guarda de set_store_logo (introducida en 0021).
--
-- 0021 la relajo del todo para que aceptara el fileId opaco que devuelve
-- ImageKit, porque la guarda anterior comparaba el valor con el patron
-- '/stores/{id}/' y la app nunca manda una ruta. Pero asi tambien se
-- aceptaba un valor con ruta de OTRA tienda.
--
-- Regla final:
--   - un valor con '/' es una ruta: tiene que ser de esta tienda;
--   - un valor sin '/' es el fileId opaco de ImageKit: se acepta, porque su
--     pertenencia la comprueba upload-commit leyendo la ruta real en el DAM.

create or replace function public.set_store_logo(
  p_store_id uuid,
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

  if v_role is distinct from 'owner' then
    raise exception 'solo el dueno puede cambiar el logo de la tienda';
  end if;

  if p_file_id is not null and length(trim(p_file_id)) > 200 then
    raise exception 'identificador de archivo no válido';
  end if;

  -- Un valor con '/' es una ruta: solo vale la de esta tienda.
  if p_file_id is not null
     and p_file_id like '%/%'
     and p_file_id not like '%/stores/' || p_store_id::text || '/%' then
    raise exception 'el archivo no pertenece a esta tienda';
  end if;

  update public.stores
  set logo_file_id = p_file_id,
      updated_at = now()
  where id = p_store_id and deleted_at is null;

  if not found then
    raise exception 'la tienda no existe';
  end if;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    p_store_id, v_actor, 'store.logo', 'store', p_store_id,
    jsonb_build_object('file_id', p_file_id)
  );
end $$;

revoke execute on function public.set_store_logo(uuid, text) from public;
grant execute on function public.set_store_logo(uuid, text) to authenticated;
