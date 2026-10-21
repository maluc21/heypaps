-- supabase/migrations/0016_unique_product_slug.sql
-- Slug único automático al crear productos.
--
-- create_product_with_variant fallaba con "el slug ya existe en esta tienda".
-- Para el vendedor eso es un error incomprensible: dos productos con el mismo
-- nombre son legitimos ("Camiseta" en dos colores, dos lotes del mismo
-- producto). Ahora la RPC anade un sufijo numerico (-2, -3...) y devuelve el
-- slug real, que la accion de servidor usa para la URL.
--
-- El resto de validaciones se mantiene: membresia con rol de escritura,
-- limite de productos e imagenes del plan, cuota de almacenamiento.

-- El tipo de retorno cambia de uuid a jsonb, y Postgres no lo permite con
-- create or replace: la funcion anterior se elimina primero (sus permisos
-- se reasignan al final).
revoke execute on function public.create_product_with_variant(
  uuid, text, text, text, uuid, uuid, jsonb, text[], int, jsonb, text, int, text, int, int, text
) from public;
drop function if exists public.create_product_with_variant(
  uuid, text, text, text, uuid, uuid, jsonb, text[], int, jsonb, text, int, text, int, int, text
);

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
