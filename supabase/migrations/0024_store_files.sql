-- supabase/migrations/0024_store_files.sql
-- Registro de archivos del DAM por tienda.
--
-- HALLAZGO (medicion de rendimiento): las imagenes del catalogo publico NUNCA
-- se habian cargado. La app guardaba el fileId de ImageKit y construia la
-- URL como {endpoint}/{fileId}, pero ImageKit solo sirve {endpoint}/{filePath}:
-- con carpetas, el fileId es un identificador opaco que no forma parte de la
-- URL. Todas las imagenes devolvian 404 y los tests no lo detectaban porque
-- solo contaban elementos del DOM, no que la imagen cargara.
--
-- La API de ImageKit solo acepta el fileId (por path devuelve 500) y no
-- permite buscar por path, asi que hacen falta las dos cosas:
--   - file_path: lo que forma la URL publica y permite validar de que tienda
--     es el archivo;
--   - file_id: lo que la API necesita para borrar el archivo.
--
-- Esta tabla guarda ambas, y de paso hace que la cuota de almacenamiento se
-- contabilice con el peso real de cada archivo en vez de con un delta que
-- declara el llamante.

create table if not exists public.store_files (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores on delete cascade,
  file_id text not null unique,
  file_path text not null,
  bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_store_files_store on public.store_files(store_id);
create index if not exists idx_store_files_path on public.store_files(store_id, file_path);

alter table public.store_files enable row level security;

create policy store_files_member on public.store_files
  for select to authenticated
  using (store_id = any (select public.current_user_store_ids()));

-- ============================================================
-- register_store_file: da de alta un archivo y suma su peso real
-- ============================================================

create or replace function public.register_store_file(
  p_store_id uuid,
  p_file_id text,
  p_file_path text,
  p_bytes bigint
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_plan text;
  v_max_bytes bigint;
  v_new_bytes bigint;
begin
  if not exists (
    select 1 from public.store_members sm
    where sm.store_id = p_store_id
      and sm.user_id = v_actor
      and sm.role in ('owner', 'editor')
  ) then
    raise exception 'no autorizado';
  end if;

  if p_bytes is null or p_bytes < 0 then
    raise exception 'peso de archivo no válido';
  end if;

  -- El archivo tiene que estar en la carpeta de la tienda.
  if p_file_path is null or p_file_path not like '%/stores/' || p_store_id::text || '/%' then
    raise exception 'el archivo no pertenece a esta tienda';
  end if;

  select s.plan_code into v_plan
  from public.stores s
  where s.id = p_store_id and s.deleted_at is null;

  select pl.max_storage_bytes into v_max_bytes
  from public.plan_limits pl
  where pl.plan_code = v_plan;

  insert into public.store_storage (store_id, bytes_used)
  values (p_store_id, p_bytes)
  on conflict (store_id) do update
    set bytes_used = public.store_storage.bytes_used + excluded.bytes_used,
        updated_at = now()
  returning bytes_used into v_new_bytes;

  if v_new_bytes > v_max_bytes then
    raise exception 'límite de almacenamiento del plan alcanzado';
  end if;

  insert into public.store_files (store_id, file_id, file_path, bytes)
  values (p_store_id, p_file_id, p_file_path, p_bytes)
  on conflict (file_id) do update
    set file_path = excluded.file_path, bytes = excluded.bytes;

  return p_file_path;
end $$;

revoke execute on function public.register_store_file(uuid, text, text, bigint) from public;
grant execute on function public.register_store_file(uuid, text, text, bigint) to authenticated;

-- ============================================================
-- get_store_file: file_id de un archivo (lo necesita el borrado en el DAM)
-- ============================================================

create or replace function public.get_store_file(
  p_store_id uuid,
  p_file_path text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_row jsonb;
begin
  if not exists (
    select 1 from public.store_members sm
    where sm.store_id = p_store_id
      and sm.user_id = v_actor
      and sm.role in ('owner', 'editor')
  ) then
    raise exception 'no autorizado';
  end if;

  select jsonb_build_object('file_id', sf.file_id, 'file_path', sf.file_path, 'bytes', sf.bytes)
  into v_row
  from public.store_files sf
  where sf.store_id = p_store_id and sf.file_path = p_file_path;

  return v_row;
end $$;

revoke execute on function public.get_store_file(uuid, text) from public;
grant execute on function public.get_store_file(uuid, text) to authenticated;

-- ============================================================
-- release_store_file: borra el registro y descuenta su peso real
--
-- Solo el servidor la ejecuta: el peso lo leyó del DAM, no lo declara nadie.
-- ============================================================

create or replace function public.release_store_file(
  p_store_id uuid,
  p_file_path text
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_file_id text;
  v_bytes bigint;
begin
  if current_setting('role', true) is distinct from 'service_role' then
    raise exception 'solo el servidor puede liberar el almacenamiento';
  end if;

  select sf.file_id, sf.bytes into v_file_id, v_bytes
  from public.store_files sf
  where sf.store_id = p_store_id and sf.file_path = p_file_path;

  if v_file_id is null then
    raise exception 'el archivo no está registrado en esta tienda';
  end if;

  delete from public.store_files where store_id = p_store_id and file_path = p_file_path;

  insert into public.store_storage (store_id, bytes_used)
  values (p_store_id, -coalesce(v_bytes, 0))
  on conflict (store_id) do update
    set bytes_used = greatest(0, public.store_storage.bytes_used - coalesce(v_bytes, 0)),
        updated_at = now();

  return v_file_id;
end $$;

revoke execute on function public.release_store_file(uuid, text) from public;
grant execute on function public.release_store_file(uuid, text) to service_role;

-- ============================================================
-- store_files_consolidate: recontar el uso desde el registro real
--
-- Util para reponer el contador si algun borrado dejo el contador descuadrado.
-- ============================================================

create or replace function public.store_files_consolidate(p_store_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_total bigint;
begin
  if current_setting('role', true) is distinct from 'service_role' then
    raise exception 'solo el servidor puede recontar el almacenamiento';
  end if;

  select coalesce(sum(sf.bytes), 0) into v_total
  from public.store_files sf
  where sf.store_id = p_store_id;

  insert into public.store_storage (store_id, bytes_used)
  values (p_store_id, v_total)
  on conflict (store_id) do update
    set bytes_used = excluded.bytes_used, updated_at = now();

  return v_total;
end $$;

revoke execute on function public.store_files_consolidate(uuid) from public;
grant execute on function public.store_files_consolidate(uuid) to service_role;

-- ============================================================
-- remove_product_image: la RPC ahora trabaja con la RUTA del archivo
--
-- products.images guarda la ruta del DAM (la que forma la URL publica), no el
-- fileId: ImageKit solo sirve {endpoint}/{filePath}.
--
-- El parametro se renombra, y Postgres no lo permite con create or replace:
-- la funcion anterior se elimina primero.
-- ============================================================

revoke execute on function public.remove_product_image(uuid, uuid, text) from public;
drop function if exists public.remove_product_image(uuid, uuid, text);

create or replace function public.remove_product_image(
  p_store_id uuid,
  p_product_id uuid,
  p_file_path text
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
    where img <> p_file_path
  ),
  updated_at = now()
  where id = p_product_id;

  update public.variants
  set image_file_id = null
  where product_id = p_product_id and image_file_id = p_file_path;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    p_store_id, v_actor, 'image.remove', 'product', p_product_id,
    jsonb_build_object('file_path', p_file_path)
  );
end $$;

revoke execute on function public.remove_product_image(uuid, uuid, text) from public;
grant execute on function public.remove_product_image(uuid, uuid, text) to authenticated;

-- PostgREST cachea el esquema: si una RPC cambia de firma o de parametros, la
-- cache puede seguir apuntando a la version anterior y las llamadas fallan
-- con "Could not find the function ... in the schema cache". Este aviso le
-- dice que lo recargue.
notify pgrst, 'reload schema';
