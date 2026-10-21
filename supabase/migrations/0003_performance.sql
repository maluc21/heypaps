-- supabase/migrations/0003_performance.sql
-- Optimización de desempeño, paginación de catálogo y control de cuota de almacenamiento.

-- ============================================================
-- 1. Paginación y filtrado en catálogo público
-- ============================================================

drop function if exists public.public_catalog(text);

create or replace function public.public_catalog(
  p_store_slug text,
  p_limit int default 50,
  p_offset int default 0,
  p_category_slug text default null
)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'store', jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'logo', s.logo_file_id,
      'whatsapp', s.whatsapp_e164,
      'currency', s.currency,
      'secondary_currency', s.secondary_currency,
      'fx_rate', s.fx_rate,
      'appearance', s.appearance
    ),
    'categories', (
      select coalesce(jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name)
                              order by c.position), '[]'::jsonb)
      from public.categories c
      where c.store_id = s.id and c.active
    ),
    'tags', (
      select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color)
                              order by t.position), '[]'::jsonb)
      from public.tags t
      where t.store_id = s.id
    ),
    'pagination', jsonb_build_object(
      'limit', greatest(1, least(coalesce(p_limit, 50), 100)),
      'offset', greatest(0, coalesce(p_offset, 0)),
      'total', (
        select count(*)
        from public.products p
        left join public.categories cat on cat.id = p.category_id
        where p.store_id = s.id
          and p.active
          and p.deleted_at is null
          and (p_category_slug is null or cat.slug = p_category_slug)
      ),
      'has_more', (
        (select count(*)
         from public.products p
         left join public.categories cat on cat.id = p.category_id
         where p.store_id = s.id
           and p.active
           and p.deleted_at is null
           and (p_category_slug is null or cat.slug = p_category_slug)
        ) > (greatest(0, coalesce(p_offset, 0)) + greatest(1, least(coalesce(p_limit, 50), 100)))
      )
    ),
    'products', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'slug', p.slug,
        'name', p.name,
        'description', p.description,
        'images', p.images,
        'tag', tg.name,
        'tag_color', tg.color,
        'category', cat.slug,
        'status', public.derive_status(p.id),
        'price_from', (
          select min(v.final_price_cents)
          from public.variants v
          where v.product_id = p.id and v.active
        )
      ) order by p.featured desc, p.position), '[]'::jsonb)
      from (
        select p.*
        from public.products p
        left join public.categories cat on cat.id = p.category_id
        where p.store_id = s.id
          and p.active
          and p.deleted_at is null
          and (p_category_slug is null or cat.slug = p_category_slug)
        order by p.featured desc, p.position, p.id
        limit greatest(1, least(coalesce(p_limit, 50), 100))
        offset greatest(0, coalesce(p_offset, 0))
      ) p
      left join public.categories cat on cat.id = p.category_id
      left join public.tags tg on tg.id = p.tag_id
    )
  )
  from public.stores s
  where s.slug = p_store_slug
    and s.status = 'published'
    and s.deleted_at is null
$$;

revoke execute on function public.public_catalog(text, int, int, text) from public;
grant execute on function public.public_catalog(text, int, int, text) to anon, authenticated;

-- Helper para conteo rápido sin serializar JSON
create or replace function public.public_product_count(
  p_store_slug text,
  p_category_slug text default null
)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from public.stores s
  join public.products p on p.store_id = s.id
  left join public.categories c on c.id = p.category_id
  where s.slug = p_store_slug
    and s.status = 'published'
    and s.deleted_at is null
    and p.active
    and p.deleted_at is null
    and (p_category_slug is null or c.slug = p_category_slug)
$$;

revoke execute on function public.public_product_count(text, text) from public;
grant execute on function public.public_product_count(text, text) to anon, authenticated;

-- ============================================================
-- 2. Inicialización y registro de cuota de almacenamiento
-- ============================================================

-- Actualizar create_store para garantizar registro en store_storage
create or replace function public.create_store(
  p_slug text,
  p_name text,
  p_description text,
  p_whatsapp_e164 text,
  p_currency char(3),
  p_appearance jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_store_id uuid;
  v_actor uuid := (select auth.uid());
  v_exists bool;
  v_profile bool;
begin
  if v_actor is null then
    raise exception 'usuario no autenticado';
  end if;

  -- slug reservado o en uso
  select exists (
    select 1 from public.stores s where s.slug = p_slug
  ) into v_exists;
  if v_exists then
    raise exception 'el slug ya esta en uso';
  end if;

  if lower(p_slug) in ('www','app','super','admin','api','assets','cdn','mail','staging') then
    raise exception 'slug reservado';
  end if;

  -- el usuario no puede ser owner de dos tiendas (simplificacion v1)
  select exists (
    select 1 from public.store_members sm
    where sm.user_id = v_actor and sm.role = 'owner'
  ) into v_exists;
  if v_exists then
    raise exception 'el usuario ya es duenio de una tienda';
  end if;

  insert into public.stores (slug, name, description, whatsapp_e164, currency, status, appearance)
  values (p_slug, p_name, p_description, p_whatsapp_e164, p_currency, 'draft', p_appearance)
  returning id into v_store_id;

  insert into public.store_members (store_id, user_id, role)
  values (v_store_id, v_actor, 'owner');

  -- inicializar cuota de almacenamiento en 0
  insert into public.store_storage (store_id, bytes_used)
  values (v_store_id, 0)
  on conflict (store_id) do nothing;

  -- perfil si no existe
  select exists (select 1 from public.profiles p where p.id = v_actor) into v_profile;
  if not v_profile then
    insert into public.profiles (id, full_name) values (v_actor, p_name);
  end if;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    v_store_id, v_actor, 'store.create', 'store', v_store_id,
    jsonb_build_object('slug', p_slug)
  );

  return v_store_id;
end $$;

revoke execute on function public.create_store(
  text, text, text, text, char(3), jsonb
) from public;
grant execute on function public.create_store(
  text, text, text, text, char(3), jsonb
) to authenticated;

-- Actualizar create_product_with_variant con validación de almacenamiento
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
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_product_id uuid;
  v_plan text;
  v_max_products int;
  v_product_count int;
  v_max_images int;
  v_max_storage_bytes bigint;
  v_bytes_used bigint;
  v_actor uuid := (select auth.uid());
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

  -- slug único dentro de la tienda
  if exists (
    select 1 from public.products p
    where p.store_id = p_store_id and p.slug = p_slug and p.deleted_at is null
  ) then
    raise exception 'el slug ya existe en esta tienda';
  end if;

  insert into public.products (
    store_id, slug, name, description, category_id, tag_id,
    attributes, images, position
  ) values (
    p_store_id, p_slug, p_name, p_description, p_category_id, p_tag_id,
    p_attributes, p_images, p_position
  )
  returning id into v_product_id;

  insert into public.variants (
    store_id, product_id, attributes, sku, price_cents,
    discount_type, discount_value, stock, image_file_id, position
  ) values (
    p_store_id, v_product_id, p_variant_attributes, p_sku, p_price_cents,
    p_discount_type, p_discount_value, p_stock, p_image_file_id, 0
  );

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    p_store_id, v_actor, 'product.create', 'product', v_product_id,
    jsonb_build_object('slug', p_slug)
  );

  return v_product_id;
end $$;

revoke execute on function public.create_product_with_variant(
  uuid, text, text, text, uuid, uuid, jsonb, text[], int, jsonb, text,
  int, text, int, int, text
) from public;
grant execute on function public.create_product_with_variant(
  uuid, text, text, text, uuid, uuid, jsonb, text[], int, jsonb, text,
  int, text, int, int, text
) to authenticated;

-- Helper para actualizar uso de almacenamiento de forma controlada
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
  values (p_store_id, greatest(0, p_delta_bytes))
  on conflict (store_id) do update
    set bytes_used = greatest(0, public.store_storage.bytes_used + p_delta_bytes),
        updated_at = now()
  returning bytes_used into v_new_bytes;

  if p_delta_bytes > 0 and v_new_bytes > v_max_bytes then
    raise exception 'límite de almacenamiento del plan excedido';
  end if;

  return v_new_bytes;
end $$;

revoke execute on function public.record_storage_usage(uuid, bigint) from public;
grant execute on function public.record_storage_usage(uuid, bigint) to authenticated;
