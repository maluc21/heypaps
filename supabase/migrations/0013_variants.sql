-- supabase/migrations/0013_variants.sql
-- Editor de variantes (plan §2.3): crear, editar y borrar variantes de un producto.
--
-- Hasta ahora solo existía create_product_with_variant (al crear el producto):
-- la variante inicial no se podía editar ni se podían agregar tallas o colores.
--
-- Reglas en la base (no solo en la UI):
--   - Concurrencia: se bloquea la fila del producto y se valida su version
--     (errcode 45000, igual que update_product). Cada cambio la incrementa.
--   - Atributos: objeto de 0 a 3 pares {nombre: valor}, sin duplicar combinaciones.
--   - Precio y descuento: el precio es > 0; el porcentaje va de 0 a 100 y el
--     monto fijo debe ser menor que el precio.
--   - Stock: null = por encargo; si no, entero >= 0.
--   - Siempre queda al menos una variante activa (desactivar o borrar la última
--     activa se rechaza; el borrado además lo garantiza variants_last_one_guard).

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
  p_expected_version int
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_store_id uuid;
  v_version int;
  v_role text;
  v_id uuid;
  v_others_active int;
  v_key text;
  v_value jsonb;
begin
  -- Bloqueo de la fila del producto: serializa las ediciones concurrentes.
  select p.store_id, p.version into v_store_id, v_version
  from public.products p
  where p.id = p_product_id and p.deleted_at is null
  for update;

  if v_store_id is null then
    raise exception 'el producto no existe';
  end if;

  select sm.role into v_role
  from public.store_members sm
  where sm.store_id = v_store_id and sm.user_id = v_actor;

  if v_role is distinct from 'owner' and v_role is distinct from 'editor' then
    raise exception 'no autorizado';
  end if;

  if v_version <> p_expected_version then
    raise exception 'conflicto: el producto cambió en otra pestaña, recargar' using errcode = '45000';
  end if;

  -- Atributos: objeto plano de 0 a 3 pares con valores de texto no vacíos.
  if p_attributes is null or jsonb_typeof(p_attributes) <> 'object' then
    raise exception 'los atributos deben ser un objeto';
  end if;
  if (select count(*) from jsonb_object_keys(p_attributes)) > 3 then
    raise exception 'una variante puede tener hasta 3 atributos';
  end if;
  for v_key, v_value in select key, value from jsonb_each(p_attributes) loop
    if jsonb_typeof(v_value) <> 'string'
       or length(trim(v_key)) = 0 or length(trim(v_key)) > 40
       or length(trim(v_value #>> '{}')) = 0 or length(trim(v_value #>> '{}')) > 40 then
      raise exception 'cada atributo necesita un nombre y un valor de hasta 40 caracteres';
    end if;
  end loop;

  if p_price_cents is null or p_price_cents <= 0 or p_price_cents > 100000000 then
    raise exception 'el precio debe ser mayor que cero';
  end if;

  if p_discount_type not in ('none', 'percent', 'fixed') then
    raise exception 'tipo de descuento no válido';
  end if;
  if p_discount_type = 'none' and coalesce(p_discount_value, 0) <> 0 then
    raise exception 'sin descuento el valor debe ser cero';
  end if;
  if p_discount_type = 'percent' and (p_discount_value < 0 or p_discount_value > 100) then
    raise exception 'el descuento en porcentaje va de 0 a 100';
  end if;
  if p_discount_type = 'fixed' and (p_discount_value < 0 or p_discount_value >= p_price_cents) then
    raise exception 'el descuento fijo debe ser menor que el precio';
  end if;

  if p_stock is not null and p_stock < 0 then
    raise exception 'el stock no puede ser negativo';
  end if;

  -- Una combinación de atributos no puede repetirse dentro del mismo producto.
  if exists (
    select 1 from public.variants v
    where v.product_id = p_product_id
      and v.attributes = p_attributes
      and (p_variant_id is null or v.id <> p_variant_id)
  ) then
    raise exception 'ya existe una variante con esos atributos';
  end if;

  -- Nunca quedarse sin variantes activas.
  if p_active is not true then
    select count(*) into v_others_active
    from public.variants v
    where v.product_id = p_product_id
      and v.active
      and (p_variant_id is null or v.id <> p_variant_id);
    if v_others_active = 0 then
      raise exception 'el producto necesita al menos una variante activa';
    end if;
  end if;

  if p_variant_id is null then
    insert into public.variants (
      store_id, product_id, attributes, sku, price_cents,
      discount_type, discount_value, stock, active, position
    ) values (
      v_store_id, p_product_id, p_attributes, nullif(trim(coalesce(p_sku, '')), ''),
      p_price_cents, p_discount_type, coalesce(p_discount_value, 0), p_stock,
      coalesce(p_active, true), coalesce(p_position, 0)
    )
    returning id into v_id;
  else
    update public.variants
    set attributes = p_attributes,
        sku = nullif(trim(coalesce(p_sku, '')), ''),
        price_cents = p_price_cents,
        discount_type = p_discount_type,
        discount_value = coalesce(p_discount_value, 0),
        stock = p_stock,
        active = coalesce(p_active, active),
        position = coalesce(p_position, position),
        updated_at = now()
    where id = p_variant_id and product_id = p_product_id
    returning id into v_id;

    if v_id is null then
      raise exception 'la variante no pertenece al producto';
    end if;
  end if;

  update public.products
  set version = version + 1, updated_at = now()
  where id = p_product_id;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    v_store_id, v_actor, 'variant.upsert', 'variant', v_id,
    jsonb_build_object('product_id', p_product_id, 'attributes', p_attributes)
  );

  return v_id;
end $$;

revoke execute on function public.upsert_variant(uuid, uuid, jsonb, text, int, text, int, int, bool, int, int) from public;
grant execute on function public.upsert_variant(uuid, uuid, jsonb, text, int, text, int, int, bool, int, int) to authenticated;

-- ============================================================
-- delete_variant
-- ============================================================

create or replace function public.delete_variant(
  p_product_id uuid,
  p_variant_id uuid,
  p_expected_version int
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_store_id uuid;
  v_version int;
  v_role text;
  v_deleted int;
begin
  select p.store_id, p.version into v_store_id, v_version
  from public.products p
  where p.id = p_product_id and p.deleted_at is null
  for update;

  if v_store_id is null then
    raise exception 'el producto no existe';
  end if;

  select sm.role into v_role
  from public.store_members sm
  where sm.store_id = v_store_id and sm.user_id = v_actor;

  if v_role is distinct from 'owner' and v_role is distinct from 'editor' then
    raise exception 'no autorizado';
  end if;

  if v_version <> p_expected_version then
    raise exception 'conflicto: el producto cambió en otra pestaña, recargar' using errcode = '45000';
  end if;

  -- variants_last_one_guard rechaza borrar la última variante activa.
  delete from public.variants
  where id = p_variant_id and product_id = p_product_id;
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise exception 'la variante no pertenece al producto';
  end if;

  update public.products
  set version = version + 1, updated_at = now()
  where id = p_product_id;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    v_store_id, v_actor, 'variant.delete', 'variant', p_variant_id,
    jsonb_build_object('product_id', p_product_id)
  );
end $$;

revoke execute on function public.delete_variant(uuid, uuid, int) from public;
grant execute on function public.delete_variant(uuid, uuid, int) to authenticated;
