-- Un nombre opcional para describir la unidad del inventario de cada variante.
alter table public.variants
  add column stock_unit text,
  add constraint variants_stock_unit_length
    check (stock_unit is null or length(trim(stock_unit)) between 1 and 40),
  add constraint variants_stock_unit_requires_stock
    check (stock_unit is null or stock is not null);

-- Mantiene la RPC existente y agrega la escritura del nombre de unidad.
create or replace function public.upsert_variant(
  p_product_id uuid,
  p_variant_id uuid,
  p_attributes jsonb,
  p_sku text,
  p_price_cents int,
  p_discount_type text,
  p_discount_value int,
  p_stock int,
  p_active bool,
  p_position int,
  p_expected_version int,
  p_stock_unit text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_stock_unit text;
begin
  if p_stock_unit is not null and length(trim(p_stock_unit)) > 40 then
    raise exception 'el nombre de la cantidad admite hasta 40 caracteres';
  end if;

  v_id := public.upsert_variant(
    p_product_id,
    p_variant_id,
    p_attributes,
    p_sku,
    p_price_cents,
    p_discount_type,
    p_discount_value,
    p_stock,
    p_active,
    p_position,
    p_expected_version
  );
  v_stock_unit := case
    when p_stock is null then null
    else nullif(trim(coalesce(p_stock_unit, '')), '')
  end;
  update public.variants
  set stock_unit = v_stock_unit
  where id = v_id;

  return v_id;
end
$$;

revoke execute on function public.upsert_variant(uuid, uuid, jsonb, text, int, text, int, int, bool, int, int, text) from public;
grant execute on function public.upsert_variant(uuid, uuid, jsonb, text, int, text, int, int, bool, int, int, text) to authenticated;

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
          'stock', v.stock, 'stock_unit', v.stock_unit, 'image_file_id', v.image_file_id,
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
