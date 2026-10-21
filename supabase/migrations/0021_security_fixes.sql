-- supabase/migrations/0021_security_fixes.sql
-- Cinco correcciones de seguridad y de correctitud detectadas por la batería
-- supabase/tests/security.sql.
--
-- 1. FUGA ENTRE INQUILINOS (CRITICA): create_product_with_variant y
--    update_product aceptaban un category_id o tag_id de OTRA tienda. El
--    resultado era que el catalogo publico de la tienda A exponia el nombre de
--    la categoria o la etiqueta de la tienda B.
--
-- 2. record_event estaba declarada STABLE pero hace un INSERT. Postgres
--    rechaza la escritura en una funcion no volatil ("INSERT is not allowed in
--    a non-volatile function"), asi que el evento nunca se guardaba: la
--    metrica de clic en WhatsApp (KPI central, plan §4.3) era siempre cero.
--    El cliente se tragaba el error, asi que nadie lo veia.
--
-- 3. CUOTA DE ALMACENAMIENTO: record_storage_usage aceptaba cualquier delta,
--    incluido uno negativo: un dueño podia poner el contador de su tienda a
--    cero y saltarse el limite de su plan. Ahora sumar y restar son operaciones
--    distintas: la suma la puede hacer la app, la resta solo el servidor.
--
-- 4. LOGO DE LA TIENDA: set_store_logo comparaba el fileId con el patron
--    '/stores/{id}/', pero la aplicacion guarda el fileId opaco que devuelve
--    ImageKit (sin ruta). La guarda rechazaba siempre: el logo de la tienda no
--    se podia guardar. La comprobacion real la hace upload-commit, que lee la
--    ruta del archivo en el DAM.
--
-- 5. record_storage_usage mantiene la validacion de la cuota del plan.

-- ============================================================
-- 1. update_product: la categoria y la etiqueta deben ser de la tienda
-- ============================================================

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

  -- La categoria y la etiqueta tienen que pertenecer a la tienda del producto.
  -- Sin esta comprobacion, el catalogo publico de una tienda expone los
  -- nombres de las categorias y etiquetas de otra.
  if p_category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = p_category_id and c.store_id = v_store_id
  ) then
    raise exception 'la categoria no pertenece a la tienda';
  end if;

  if p_tag_id is not null and not exists (
    select 1 from public.tags t
    where t.id = p_tag_id and t.store_id = v_store_id
  ) then
    raise exception 'la etiqueta no pertenece a la tienda';
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

-- ============================================================
-- 2. create_product_with_variant: misma comprobacion
-- ============================================================

create or replace function public.create_product_with_variant(
  p_store_id uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_category_id uuid,
  p_tag_id uuid,
  p_attributes jsonb,
  p_images text[],
  p_position int,
  p_variant_attributes jsonb,
  p_sku text,
  p_price_cents int,
  p_discount_type text,
  p_discount_value int,
  p_stock int,
  p_image_file_id text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_product_id uuid;
  v_plan text;
  v_max_products int;
  v_product_count int;
  v_max_images int;
  v_max_storage_bytes bigint;
  v_bytes_used bigint;
  v_actor uuid := (select auth.uid());
  v_base_slug text;
  v_slug text;
  v_suffix int := 1;
begin
  -- membresía con rol de escritura
  if not exists (
    select 1 from public.store_members sm
    where sm.store_id = p_store_id
      and sm.user_id = v_actor
      and sm.role in ('owner', 'editor')
  ) then
    raise exception 'no pertenece a la tienda o no tiene rol de escritura';
  end if;

  -- La categoria y la etiqueta tienen que ser de la tienda.
  if p_category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = p_category_id and c.store_id = p_store_id
  ) then
    raise exception 'la categoria no pertenece a la tienda';
  end if;

  if p_tag_id is not null and not exists (
    select 1 from public.tags t
    where t.id = p_tag_id and t.store_id = p_store_id
  ) then
    raise exception 'la etiqueta no pertenece a la tienda';
  end if;

  -- entitlements del plan
  select s.plan_code into v_plan
  from public.stores s
  where s.id = p_store_id and s.deleted_at is null;
  if v_plan is null then
    raise exception 'tienda inexistente';
  end if;

  select pl.max_products, pl.max_images_per_product, pl.max_storage_bytes
  into v_max_products, v_max_images, v_max_storage_bytes
  from public.plan_limits pl
  where pl.plan_code = v_plan;

  select count(*) into v_product_count
  from public.products p
  where p.store_id = p_store_id and p.deleted_at is null;

  if v_product_count >= v_max_products then
    raise exception 'límite de productos del plan alcanzado';
  end if;

  if array_length(p_images, 1) > v_max_images then
    raise exception 'límite de imágenes por producto del plan alcanzado';
  end if;

  -- verificar almacenamiento usado vs límite
  select coalesce(ss.bytes_used, 0) into v_bytes_used
  from public.store_storage ss
  where ss.store_id = p_store_id;

  if v_bytes_used >= v_max_storage_bytes then
    raise exception 'límite de almacenamiento del plan alcanzado';
  end if;

  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'el nombre del producto es obligatorio';
  end if;

  if p_price_cents is null or p_price_cents <= 0 then
    raise exception 'el precio debe ser mayor que cero';
  end if;

  -- Slug unico dentro de la tienda: si el propuesto ya existe se anade un
  -- sufijo numerico. Dos productos con el mismo nombre son legitimos.
  v_base_slug := lower(trim(coalesce(nullif(p_slug, ''), p_name)));
  v_base_slug := trim(both '-' from regexp_replace(v_base_slug, '[^a-z0-9]+', '-', 'g'));
  if v_base_slug = '' then
    raise exception 'el nombre del producto no genera un identificador válido';
  end if;

  v_slug := v_base_slug;
  while exists (
    select 1 from public.products p
    where p.store_id = p_store_id and p.slug = v_slug and p.deleted_at is null
  ) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into public.products (
    store_id, slug, name, description, category_id, tag_id,
    attributes, images, position
  ) values (
    p_store_id, v_slug, trim(p_name), nullif(trim(coalesce(p_description, '')), ''),
    p_category_id, p_tag_id,
    coalesce(p_attributes, '[]'::jsonb), coalesce(p_images, '{}'::text[]),
    coalesce(p_position, 0)
  )
  returning id into v_product_id;

  insert into public.variants (
    store_id, product_id, attributes, sku, price_cents,
    discount_type, discount_value, stock, image_file_id, position
  ) values (
    p_store_id, v_product_id, coalesce(p_variant_attributes, '{}'::jsonb),
    nullif(trim(coalesce(p_sku, '')), ''),
    p_price_cents, coalesce(p_discount_type, 'none'), coalesce(p_discount_value, 0),
    p_stock, p_image_file_id, 0
  );

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    p_store_id, v_actor, 'product.create', 'product', v_product_id,
    jsonb_build_object('slug', v_slug)
  );

  return jsonb_build_object('id', v_product_id, 'slug', v_slug);
end $$;

revoke execute on function public.create_product_with_variant(
  uuid, text, text, text, uuid, uuid, jsonb, text[], int, jsonb, text, int, text, int, int, text
) from public;
grant execute on function public.create_product_with_variant(
  uuid, text, text, text, uuid, uuid, jsonb, text[], int, jsonb, text, int, text, int, int, text
) to authenticated;

-- ============================================================
-- 3. record_event: VOLATILE (hace un INSERT)
-- ============================================================

create or replace function public.record_event(p_store_id uuid, p_product_id uuid, p_kind text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_store_status text;
begin
  select s.status into v_store_status
  from public.stores s
  where s.id = p_store_id and s.deleted_at is null;

  if v_store_status <> 'published' then
    return;
  end if;

  if p_product_id is not null then
    perform 1
    from public.products p
    where p.id = p_product_id and p.store_id = p_store_id and p.deleted_at is null;
    if not found then
      return;
    end if;
  end if;

  insert into public.events (store_id, product_id, kind)
  values (p_store_id, p_product_id, p_kind);
end $$;

revoke execute on function public.record_event(uuid, uuid, text) from public;
grant execute on function public.record_event(uuid, uuid, text) to anon, authenticated;

-- ============================================================
-- 4. Cuota de almacenamiento: sumar y restar son operaciones distintas
--
-- record_storage_usage solo admite deltas positivos (subida de un archivo).
-- La resta la hace release_storage_usage, que solo puede ejecutar el servidor:
-- el tamano lo lee del DAM, y un dueño no puede inventarse un delta negativo
-- para vaciar su contador y saltarse el limite de su plan.
-- ============================================================

create or replace function public.record_storage_usage(
  p_store_id uuid,
  p_delta_bytes bigint
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_plan text;
  v_max_bytes bigint;
  v_new_bytes bigint;
begin
  if p_delta_bytes is null or p_delta_bytes <= 0 then
    raise exception 'el delta debe ser positivo: para liberar espacio usa release_storage_usage';
  end if;

  if not exists (
    select 1 from public.store_members sm
    where sm.store_id = p_store_id
      and sm.user_id = v_actor
      and sm.role in ('owner', 'editor')
  ) then
    raise exception 'no autorizado';
  end if;

  select s.plan_code into v_plan
  from public.stores s
  where s.id = p_store_id and s.deleted_at is null;

  select pl.max_storage_bytes into v_max_bytes
  from public.plan_limits pl
  where pl.plan_code = v_plan;

  insert into public.store_storage (store_id, bytes_used)
  values (p_store_id, p_delta_bytes)
  on conflict (store_id) do update
    set bytes_used = public.store_storage.bytes_used + excluded.bytes_used,
        updated_at = now()
  returning bytes_used into v_new_bytes;

  if v_new_bytes > v_max_bytes then
    raise exception 'límite de almacenamiento del plan alcanzado';
  end if;

  return v_new_bytes;
end $$;

revoke execute on function public.record_storage_usage(uuid, bigint) from public;
grant execute on function public.record_storage_usage(uuid, bigint) to authenticated;

-- Resta de bytes: solo el servidor (service_role) la puede ejecutar.
create or replace function public.release_storage_usage(
  p_store_id uuid,
  p_delta_bytes bigint
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_new_bytes bigint;
begin
  -- Solo el servidor libera espacio: el peso real lo lee del DAM. Un rol de
  -- aplicacion no puede ejecutarla, asi que no puede inventar un delta.
  if current_setting('role', true) is distinct from 'service_role' then
    raise exception 'solo el servidor puede liberar espacio de almacenamiento';
  end if;

  if p_delta_bytes is null or p_delta_bytes >= 0 then
    raise exception 'el delta debe ser negativo';
  end if;

  insert into public.store_storage (store_id, bytes_used)
  values (p_store_id, p_delta_bytes)
  on conflict (store_id) do update
    set bytes_used = greatest(0, public.store_storage.bytes_used + excluded.bytes_used),
        updated_at = now()
  returning bytes_used into v_new_bytes;

  return v_new_bytes;
end $$;

revoke execute on function public.release_storage_usage(uuid, bigint) from public;
grant execute on function public.release_storage_usage(uuid, bigint) to service_role;

-- ============================================================
-- 5. set_store_logo: el fileId de ImageKit es opaco, no una ruta
--
-- La pertenencia del archivo a la tienda la comprueba upload-commit, que lee
-- la ruta real en el DAM. Aqui solo se valida que el valor tenga forma de
-- identificador de ImageKit.
-- ============================================================

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
