-- supabase/migrations/0006_public_catalog_plan_and_price_range.sql
-- Añade al catálogo público lo que la UI necesita y la RPC no exponía:
--
-- 1. store.plan_code — para decidir si el pie muestra la marca "Hecho con
--    Catalogo" (entitlement remove_brand del plan pro, plan §6.3).
-- 2. products.price_is_range — el plan §4.4 exige "precio simple" cuando todas
--    las variantes activas cuestan lo mismo y "desde $X" cuando difieren. Sin
--    este flag la card solo podía mostrar el mínimo, sin poder distinguir.
--
-- Mismas firmas y permisos que 0003: public_catalog(text,int,int,text) y
-- public_product(text,text). Solo se amplía el JSON de salida.

-- ============================================================
-- public_catalog
-- ============================================================

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
      'appearance', s.appearance,
      'plan_code', s.plan_code
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
        ),
        'price_is_range', (
          select count(distinct v.final_price_cents) > 1
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

-- ============================================================
-- public_product
-- ============================================================

create or replace function public.public_product(p_store_slug text, p_product_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'store', jsonb_build_object(
      'id', s.id,
      'name', s.name, 'logo', s.logo_file_id,
      'whatsapp', s.whatsapp_e164, 'currency', s.currency,
      'plan_code', s.plan_code
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

revoke execute on function public.public_product(text, text) from public;
grant execute on function public.public_product(text, text) to anon, authenticated;
