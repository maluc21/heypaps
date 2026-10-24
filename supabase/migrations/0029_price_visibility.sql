-- supabase/migrations/0029_price_visibility.sql
-- Visibilidad flexible de precios: modo global en la tienda y toggle por producto.

-- ============================================================
-- 1. Esquema
-- ============================================================
alter table public.stores
  add column if not exists pricing_mode text not null default 'SHOW_ALL'
  check (pricing_mode in ('SHOW_ALL', 'REQUEST_ALL', 'CUSTOM'));

alter table public.products
  add column if not exists show_price boolean not null default true;

-- ============================================================
-- 2. update_store: añade p_pricing_mode
-- ============================================================
create or replace function public.update_store(
  p_store_id uuid,
  p_name text,
  p_description text,
  p_whatsapp_e164 text,
  p_currency text,
  p_secondary_currency text,
  p_fx_rate numeric,
  p_social_links jsonb,
  p_pricing_mode text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_currency text := upper(trim(coalesce(p_currency, 'HNL')));
  v_secondary text := nullif(upper(trim(coalesce(p_secondary_currency, ''))), '');
  v_appearance jsonb := coalesce((select appearance from public.stores where id = p_store_id), '{}'::jsonb);
  v_pricing_mode text := coalesce(nullif(trim(p_pricing_mode), ''), 'SHOW_ALL');
begin
  select sm.role into v_role
  from public.store_members sm
  where sm.store_id = p_store_id and sm.user_id = v_actor;

  if v_role is distinct from 'owner' then
    raise exception 'solo el dueno puede cambiar los ajustes de la tienda';
  end if;

  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'el nombre de la tienda es obligatorio';
  end if;

  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'la moneda debe ser un codigo de 3 letras';
  end if;

  if v_secondary is not null and v_secondary !~ '^[A-Z]{3}$' then
    raise exception 'la moneda secundaria debe ser un codigo de 3 letras';
  end if;

  if v_secondary is not null and v_secondary = v_currency then
    raise exception 'la moneda secundaria debe ser distinta de la principal';
  end if;

  if v_secondary is null and p_fx_rate is not null then
    raise exception 'no se puede fijar una tasa sin moneda secundaria';
  end if;

  if p_fx_rate is not null and (p_fx_rate <= 0 or p_fx_rate > 1000000) then
    raise exception 'la tasa de cambio no es valida';
  end if;

  if v_pricing_mode not in ('SHOW_ALL', 'REQUEST_ALL', 'CUSTOM') then
    raise exception 'modo de precios invalido';
  end if;

  if p_social_links is not null then
    v_appearance := jsonb_set(v_appearance, '{socialLinks}', p_social_links, true);
  end if;

  update public.stores
  set name = trim(p_name),
      description = nullif(trim(coalesce(p_description, '')), ''),
      whatsapp_e164 = case
        when p_whatsapp_e164 is null or trim(p_whatsapp_e164) = '' then null
        else '+' || regexp_replace(p_whatsapp_e164, '\D', '', 'g')
      end,
      currency = v_currency,
      secondary_currency = v_secondary,
      fx_rate = case when v_secondary is null then null else p_fx_rate end,
      appearance = v_appearance,
      pricing_mode = v_pricing_mode,
      updated_at = now()
  where id = p_store_id and deleted_at is null;

  if not found then
    raise exception 'la tienda no existe';
  end if;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    p_store_id, v_actor, 'store.update', 'store', p_store_id,
    jsonb_build_object(
      'currency', v_currency,
      'secondary_currency', v_secondary,
      'social_links', p_social_links,
      'pricing_mode', v_pricing_mode
    )
  );
end $$;

revoke execute on function public.update_store(uuid, text, text, text, text, text, numeric, jsonb, text) from public;
grant execute on function public.update_store(uuid, text, text, text, text, text, numeric, jsonb, text) to authenticated;

-- ============================================================
-- 3. update_product: añade p_show_price
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
  p_show_price bool,
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
      show_price  = coalesce(p_show_price, show_price),
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
    jsonb_build_object('partial', true, 'show_price', p_show_price)
  );
end $$;

revoke execute on function public.update_product(
  uuid, text, text, uuid, uuid, jsonb, text[], int, bool, bool, bool, bool, int
) from public;
grant execute on function public.update_product(
  uuid, text, text, uuid, uuid, jsonb, text[], int, bool, bool, bool, bool, int
) to authenticated;

-- ============================================================
-- 4. public_catalog: incluye pricing_mode y show_price
-- ============================================================
create or replace function public.public_catalog(p_store_slug text, p_limit int default 50, p_offset int default 0, p_category_slug text default null, p_tag_slug text default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'store', jsonb_build_object(
      'name', s.name, 'logo', s.logo_file_id,
      'whatsapp', s.whatsapp_e164, 'currency', s.currency,
      'secondary_currency', s.secondary_currency,
      'fx_rate', s.fx_rate, 'appearance', s.appearance,
      'pricing_mode', coalesce(s.pricing_mode, 'SHOW_ALL')
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
        ),
        'price_is_range', (
          select count(distinct v.final_price_cents) > 1
          from public.variants v
          where v.product_id = p.id and v.active
        ),
        'show_price', coalesce(p.show_price, true)
      ) order by p.featured desc, p.position), '[]'::jsonb)
      from (
        select p.*
        from public.products p
        left join public.categories cat on cat.id = p.category_id
        left join public.tags tg on p.tag_id = tg.id
        where p.store_id = s.id
          and p.active
          and p.deleted_at is null
          and (p_category_slug is null or cat.slug = p_category_slug)
          and (p_tag_slug is null or regexp_replace(lower(tg.name), '[^a-z0-9]+', '-', 'g') = p_tag_slug)
        order by p.featured desc, p.position, p.id
        limit greatest(1, least(coalesce(p_limit, 50), 100))
        offset greatest(0, coalesce(p_offset, 0))
      ) p
      left join public.categories cat on cat.id = p.category_id
      left join public.tags tg on tg.id = p.tag_id
    ),
    'pagination', jsonb_build_object(
      'total', (
        select count(*)
        from public.products p
        left join public.categories cat on cat.id = p.category_id
        left join public.tags tg on tg.id = p.tag_id
        where p.store_id = s.id
          and p.active
          and p.deleted_at is null
          and (p_category_slug is null or cat.slug = p_category_slug)
          and (p_tag_slug is null or regexp_replace(lower(tg.name), '[^a-z0-9]+', '-', 'g') = p_tag_slug)
      ),
      'has_more', (
        (select count(*)
         from public.products p
         left join public.categories cat on cat.id = p.category_id
         left join public.tags tg on tg.id = p.tag_id
         where p.store_id = s.id
           and p.active
           and p.deleted_at is null
           and (p_category_slug is null or cat.slug = p_category_slug)
           and (p_tag_slug is null or regexp_replace(lower(tg.name), '[^a-z0-9]+', '-', 'g') = p_tag_slug)
        ) > (greatest(0, coalesce(p_offset, 0)) + greatest(1, least(coalesce(p_limit, 50), 100)))
      )
    )
  )
  from public.stores s
  where s.slug = p_store_slug
    and s.status = 'published'
    and s.deleted_at is null
$$;

-- ============================================================
-- 5. public_product: incluye pricing_mode y show_price
-- ============================================================
create or replace function public.public_product(p_store_slug text, p_product_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'store', jsonb_build_object(
      'name', s.name, 'logo', s.logo_file_id,
      'whatsapp', s.whatsapp_e164, 'currency', s.currency,
      'pricing_mode', coalesce(s.pricing_mode, 'SHOW_ALL')
    ),
    'product', jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'name', p.name, 'description', p.description,
      'images', p.images, 'active', p.active,
      'status', public.derive_status(p.id),
      'price_from', (
        select min(v.final_price_cents)
        from public.variants v
        where v.product_id = p.id and v.active
      ),
      'show_price', coalesce(p.show_price, true),
      'variants', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', v.id, 'attributes', v.attributes, 'sku', v.sku,
          'price_cents', v.price_cents, 'discount_type', v.discount_type,
          'discount_value', v.discount_value, 'final_price_cents', v.final_price_cents,
          'stock', v.stock, 'image_file_id', v.image_file_id,
          'active', v.active, 'position', v.position
        ) order by v.position), '[]'::jsonb)
        from public.variants v
        where v.product_id = p.id and v.active
      )
    )
  )
  from public.stores s
  join public.products p on p.store_id = s.id
  where s.slug = p_store_slug
    and p.slug = p_product_slug
    and s.status = 'published'
    and s.deleted_at is null
    and p.active
    and p.deleted_at is null
$$;

