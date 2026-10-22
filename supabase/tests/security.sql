-- supabase/tests/security.sql
-- Batería de seguridad: autorización de RPC, aislamiento entre inquilinos,
-- superficie pública, cuota de almacenamiento y auditoría de privilegios.
--
-- Ejecutar SOLO contra una base de desarrollo/staging ya migrada (0001..0019):
--   supabase db query --linked -f supabase/tests/security.sql
--
-- Cómo se lee el resultado:
--   * Cada comprobación deja una fila en la tabla de resultados con:
--       ord     - número de la comprobación
--       area    - bloque al que pertenece
--       nombre  - qué se comprueba, en claro
--       ok      - ¿se cumple la expectativa?
--       exp_ok  - ¿el fallo es un hallazgo conocido (documentado) o inesperado?
--       detalle - mensaje literal del error o del valor observado
--   * Si alguna comprobación FALLA y NO es un hallazgo conocido, el archivo
--     termina con una excepción que lista los fallos: la suite está en rojo.
--   * Si solo fallan las comprobaciones marcadas como hallazgo conocido, la
--     suite termina en verde y la tabla los muestra como FALLA (esperado).
--
-- Autenticación simulada: sec_set_user() fija request.jwt.claims (lo que lee
-- auth.uid()) y cambia al rol 'authenticated' o 'anon', de modo que RLS y los
-- GRANT se aplican de verdad. Los helpers viven en pg_temp: nunca se exponen
-- en el esquema public (PostgREST publica el esquema public: un helper de
-- pruebas dejado ahí sería una puerta trasera de escalada de privilegios).

-- -----------------------------------------------------------------------------
-- 0. Fixtures
-- -----------------------------------------------------------------------------
-- Tiendas (prefijo 'e2e-' para que tests/e2e/cleanup-e2e.sql las borre):
--   STORE_A  publicada, con owner/editor/viewer
--   STORE_B  publicada, con otro owner (para probar el cruce de tiendas)
--   STORE_C  en borrador, con owner/editor/viewer (publicar/despublicar)
--
-- Usuarios:
--   OWNER_A / OWNER_B  dueños de A y de B
--   EDITOR_A           editor de A y de C
--   VIEWER_A           viewer de A y de C
--   INTRUDER           sin ninguna membresía
--   SUPPORT            platform_members con rol 'support'
--   SUPER              platform_members con rol 'superadmin'

insert into auth.users (id, email, raw_user_meta_data) values
  ('e5000000-0000-0000-0000-000000000001', 'e2e-sec-owner-a@test.test',   '{"nombre":"Owner A"}'),
  ('e5000000-0000-0000-0000-000000000002', 'e2e-sec-owner-b@test.test',   '{"nombre":"Owner B"}'),
  ('e5000000-0000-0000-0000-000000000003', 'e2e-sec-editor-a@test.test',  '{"nombre":"Editor A"}'),
  ('e5000000-0000-0000-0000-000000000004', 'e2e-sec-viewer-a@test.test',  '{"nombre":"Viewer A"}'),
  ('e5000000-0000-0000-0000-000000000005', 'e2e-sec-intruder@test.test',  '{"nombre":"Intruso"}'),
  ('e5000000-0000-0000-0000-000000000006', 'e2e-sec-support@test.test',   '{"nombre":"Soporte"}'),
  ('e5000000-0000-0000-0000-000000000007', 'e2e-sec-super@test.test',     '{"nombre":"Superadmin"}')
on conflict (id) do nothing;

insert into public.stores (id, slug, name, description, status) values
  ('e6000000-0000-0000-0000-000000000001', 'e2e-sec-a', 'Tienda A', 'Tienda de pruebas A', 'published'),
  ('e6000000-0000-0000-0000-000000000002', 'e2e-sec-b', 'Tienda B', 'Tienda de pruebas B', 'published'),
  ('e6000000-0000-0000-0000-000000000003', 'e2e-sec-c', 'Tienda C', 'Tienda en borrador', 'draft')
on conflict (id) do update
  set slug = excluded.slug, name = excluded.name, description = excluded.description,
      status = excluded.status, deleted_at = null, updated_at = now();

insert into public.store_members (store_id, user_id, role) values
  ('e6000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'owner'),
  ('e6000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000003', 'editor'),
  ('e6000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000004', 'viewer'),
  ('e6000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000002', 'owner'),
  ('e6000000-0000-0000-0000-000000000003', 'e5000000-0000-0000-0000-000000000001', 'owner'),
  ('e6000000-0000-0000-0000-000000000003', 'e5000000-0000-0000-0000-000000000003', 'editor'),
  ('e6000000-0000-0000-0000-000000000003', 'e5000000-0000-0000-0000-000000000004', 'viewer')
on conflict (store_id, user_id) do update set role = excluded.role;

insert into public.platform_members (user_id, role) values
  ('e5000000-0000-0000-0000-000000000006', 'support'),
  ('e5000000-0000-0000-0000-000000000007', 'superadmin')
on conflict (user_id) do update set role = excluded.role;

insert into public.store_storage (store_id, bytes_used) values
  ('e6000000-0000-0000-0000-000000000001', 5000),
  ('e6000000-0000-0000-0000-000000000002', 1000),
  ('e6000000-0000-0000-0000-000000000003', 0)
on conflict (store_id) do update set bytes_used = excluded.bytes_used;

insert into public.categories (id, store_id, name, slug) values
  ('e9000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000001', 'Categoría A', 'categoria-a'),
  ('e9000000-0000-0000-0000-000000000002', 'e6000000-0000-0000-0000-000000000002', 'Categoría B', 'categoria-b')
on conflict (id) do update
  set store_id = excluded.store_id, name = excluded.name, slug = excluded.slug, active = true;

insert into public.tags (id, store_id, name, color) values
  ('ea000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000001', 'Etiqueta A', '#112233'),
  ('ea000000-0000-0000-0000-000000000002', 'e6000000-0000-0000-0000-000000000002', 'Etiqueta B', '#445566')
on conflict (id) do update
  set store_id = excluded.store_id, name = excluded.name, color = excluded.color;

insert into public.products (id, store_id, slug, name, category_id, tag_id) values
  ('e7000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000001', 'prod-a', 'Producto A',
   'e9000000-0000-0000-0000-000000000001', 'ea000000-0000-0000-0000-000000000001'),
  ('e7000000-0000-0000-0000-000000000002', 'e6000000-0000-0000-0000-000000000001', 'prod-a-2', 'Producto A 2', null, null),
  ('e7000000-0000-0000-0000-000000000003', 'e6000000-0000-0000-0000-000000000001', 'prod-a-oculto', 'Producto oculto', null, null),
  ('e7000000-0000-0000-0000-000000000004', 'e6000000-0000-0000-0000-000000000002', 'prod-b', 'Producto B', null, null)
on conflict (id) do update
  set store_id = excluded.store_id, slug = excluded.slug, name = excluded.name,
      category_id = excluded.category_id, tag_id = excluded.tag_id,
      deleted_at = null, active = true;

-- El producto oculto (prod-a-oculto) nace inactivo.
update public.products set active = false where id = 'e7000000-0000-0000-0000-000000000003';

insert into public.variants (id, store_id, product_id, attributes, sku, price_cents, stock) values
  ('e8000000-0000-0000-0000-000000000001', 'e6000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001', '{}', 'A-1', 1000, 5),
  ('e8000000-0000-0000-0000-000000000002', 'e6000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000001', '{"Talle":"M"}', 'A-2', 1200, 3),
  ('e8000000-0000-0000-0000-000000000003', 'e6000000-0000-0000-0000-000000000001', 'e7000000-0000-0000-0000-000000000002', '{}', 'A2-1', 1500, 2),
  ('e8000000-0000-0000-0000-000000000004', 'e6000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000004', '{}', 'B-1', 2000, 1)
on conflict (id) do update
  set store_id = excluded.store_id, product_id = excluded.product_id, attributes = excluded.attributes,
      sku = excluded.sku, price_cents = excluded.price_cents, stock = excluded.stock, active = true;

-- -----------------------------------------------------------------------------
-- 1. Helpers de la batería (esquema temporal: nunca se exponen en public)
-- -----------------------------------------------------------------------------

create temp table sec_results (
  ord     int primary key,
  area    text not null,
  nombre  text not null,
  ok      boolean not null,
  exp_ok  boolean not null,
  detalle text
);

create function pg_temp.sec_set_user(p_user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_user_id,
      'role', case when p_user_id is null then 'anon' else 'authenticated' end
    )::text,
    false
  );
  if p_user_id is null then
    execute 'set role anon';
  else
    execute 'set role authenticated';
  end if;
end $$;

create function pg_temp.sec_reset_role()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'reset role';
end $$;

-- Ejecuta una sentencia y devuelve 'PERMITIDO' o 'DENEGADO: <mensaje>'.
create function pg_temp.sec_try(p_cmd text)
returns text language plpgsql as $$
begin
  execute p_cmd;
  return 'PERMITIDO';
exception when others then
  return 'DENEGADO: ' || sqlerrm;
end $$;

create function pg_temp.sec_record(
  p_ord int, p_area text, p_nombre text, p_ok boolean, p_exp_ok boolean, p_detalle text
) returns void language plpgsql as $$
begin
  insert into pg_temp.sec_results (ord, area, nombre, ok, exp_ok, detalle)
  values (p_ord, p_area, p_nombre, p_ok, p_exp_ok, p_detalle);
end $$;

-- Comprueba que la sentencia se rechaza para el actor indicado.
create function pg_temp.sec_expect_denied(
  p_ord int, p_nombre text, p_cmd text, p_uid uuid, p_exp_ok boolean default true
) returns void language plpgsql as $$
declare v_res text;
begin
  perform pg_temp.sec_set_user(p_uid);
  v_res := pg_temp.sec_try(p_cmd);
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_record(
    p_ord, 'S.1 escritura', p_nombre, v_res like 'DENEGADO%', p_exp_ok, v_res);
end $$;

-- Comprueba que la sentencia se permite para el actor indicado.
create function pg_temp.sec_expect_allowed(
  p_ord int, p_nombre text, p_cmd text, p_uid uuid, p_exp_ok boolean default true
) returns void language plpgsql as $$
declare v_res text;
begin
  perform pg_temp.sec_set_user(p_uid);
  v_res := pg_temp.sec_try(p_cmd);
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_record(
    p_ord, 'S.1 escritura', p_nombre, v_res = 'PERMITIDO', p_exp_ok, v_res);
end $$;

-- Registra una comprobación de estado (no es una llamada a RPC).
create function pg_temp.sec_check(
  p_ord int, p_area text, p_nombre text, p_ok boolean, p_detalle text,
  p_exp_ok boolean default true
) returns void language plpgsql as $$
begin
  perform pg_temp.sec_record(p_ord, p_area, p_nombre, p_ok, p_exp_ok, p_detalle);
end $$;

-- -----------------------------------------------------------------------------
-- 2. S.1 Matriz de autorización de las RPC de escritura
--    Tres actores que NO deben poder escribir: un viewer de la tienda, un
--    usuario sin membresía y el dueño de OTRA tienda.
-- -----------------------------------------------------------------------------

do $$
declare
  v_store_a text := 'e6000000-0000-0000-0000-000000000001';
  v_store_b text := 'e6000000-0000-0000-0000-000000000002';
  v_store_c text := 'e6000000-0000-0000-0000-000000000003';
  v_cat_a   text := 'e9000000-0000-0000-0000-000000000001';
  v_tag_a   text := 'ea000000-0000-0000-0000-000000000001';
  v_prod_a  text := 'e7000000-0000-0000-0000-000000000001';
  v_var_a   text := 'e8000000-0000-0000-0000-000000000001';
  v_viewer  uuid := 'e5000000-0000-0000-0000-000000000004';
  v_intrud  uuid := 'e5000000-0000-0000-0000-000000000005';
  v_owner_b uuid := 'e5000000-0000-0000-0000-000000000002';
  v_cmd     text;
  v_ver     int;
begin
  select version into v_ver from public.products where id = v_prod_a::uuid;

  -- Categorías -------------------------------------------------------
  v_cmd := format($q$select public.create_category('%s', 'Intrusa', 'intrusa')$q$, v_store_a);
  perform pg_temp.sec_expect_denied(101, 'create_category: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(102, 'create_category: un usuario sin membresía no puede', v_cmd, v_intrud);
  perform pg_temp.sec_expect_denied(103, 'create_category: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  v_cmd := format($q$select public.update_category('%s', 'Renombrada', 'renombrada', true, 1)$q$, v_cat_a);
  perform pg_temp.sec_expect_denied(104, 'update_category: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(105, 'update_category: un usuario sin membresía no puede', v_cmd, v_intrud);
  perform pg_temp.sec_expect_denied(106, 'update_category: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  v_cmd := format($q$select public.delete_category('%s')$q$, v_cat_a);
  perform pg_temp.sec_expect_denied(107, 'delete_category: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(108, 'delete_category: un usuario sin membresía no puede', v_cmd, v_intrud);
  perform pg_temp.sec_expect_denied(109, 'delete_category: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  -- Etiquetas ---------------------------------------------------------
  v_cmd := format($q$select public.create_tag('%s', 'Intrusa', null)$q$, v_store_a);
  perform pg_temp.sec_expect_denied(110, 'create_tag: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(111, 'create_tag: un usuario sin membresía no puede', v_cmd, v_intrud);
  perform pg_temp.sec_expect_denied(112, 'create_tag: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  v_cmd := format($q$select public.update_tag('%s', 'Renombrada', '#010203', 1)$q$, v_tag_a);
  perform pg_temp.sec_expect_denied(113, 'update_tag: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(114, 'update_tag: un usuario sin membresía no puede', v_cmd, v_intrud);
  perform pg_temp.sec_expect_denied(115, 'update_tag: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  v_cmd := format($q$select public.delete_tag('%s')$q$, v_tag_a);
  perform pg_temp.sec_expect_denied(116, 'delete_tag: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(117, 'delete_tag: un usuario sin membresía no puede', v_cmd, v_intrud);
  perform pg_temp.sec_expect_denied(118, 'delete_tag: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  -- Producto: categoría y etiqueta ------------------------------------
  v_cmd := format($q$select public.set_product_category('%s', '%s')$q$, v_prod_a, v_cat_a);
  perform pg_temp.sec_expect_denied(119, 'set_product_category: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(120, 'set_product_category: un usuario sin membresía no puede', v_cmd, v_intrud);
  perform pg_temp.sec_expect_denied(121, 'set_product_category: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  v_cmd := format($q$select public.set_product_tag('%s', '%s')$q$, v_prod_a, v_tag_a);
  perform pg_temp.sec_expect_denied(122, 'set_product_tag: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(123, 'set_product_tag: un usuario sin membresía no puede', v_cmd, v_intrud);
  perform pg_temp.sec_expect_denied(124, 'set_product_tag: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  -- Variantes ----------------------------------------------------------
  v_cmd := format(
    $q$select public.upsert_variant('%s', null, '{"Talle":"L"}', null, 1000, 'none', 0, 1, true, 0, %s)$q$,
    v_prod_a, v_ver);
  perform pg_temp.sec_expect_denied(125, 'upsert_variant: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(126, 'upsert_variant: un usuario sin membresía no puede', v_cmd, v_intrud);
  perform pg_temp.sec_expect_denied(127, 'upsert_variant: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  v_cmd := format($q$select public.delete_variant('%s', '%s', %s)$q$, v_prod_a, v_var_a, v_ver);
  perform pg_temp.sec_expect_denied(128, 'delete_variant: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(129, 'delete_variant: un usuario sin membresía no puede', v_cmd, v_intrud);
  perform pg_temp.sec_expect_denied(130, 'delete_variant: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  -- Producto: alta y edición ------------------------------------------
  v_cmd := format(
    $q$select public.create_product_with_variant('%s', 'intruso', 'Intruso', '', null, null, '[]'::jsonb, '{}'::text[], 0, '{}'::jsonb, null, 1000, 'none', 0, 1, null)$q$,
    v_store_a);
  perform pg_temp.sec_expect_denied(131, 'create_product_with_variant: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(132, 'create_product_with_variant: un usuario sin membresía no puede', v_cmd, v_intrud);
  perform pg_temp.sec_expect_denied(133, 'create_product_with_variant: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  v_cmd := format(
    $q$select public.update_product('%s', 'Hackeado', null, null, null, null, null, null, null, null, null, %s)$q$,
    v_prod_a, v_ver);
  perform pg_temp.sec_expect_denied(134, 'update_product: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(135, 'update_product: un usuario sin membresía no puede', v_cmd, v_intrud);
  perform pg_temp.sec_expect_denied(136, 'update_product: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  v_cmd := format($q$select public.bulk_update_products(array['%s']::uuid[], 'activate', '{}'::jsonb)$q$, v_prod_a);
  perform pg_temp.sec_expect_denied(137, 'bulk_update_products: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(138, 'bulk_update_products: un usuario sin membresía no puede', v_cmd, v_intrud);
  perform pg_temp.sec_expect_denied(139, 'bulk_update_products: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  -- Imágenes -----------------------------------------------------------
  v_cmd := format($q$select public.remove_product_image('%s', '%s', 'archivo.jpg')$q$, v_store_a, v_prod_a);
  perform pg_temp.sec_expect_denied(140, 'remove_product_image: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(141, 'remove_product_image: un usuario sin membresía no puede', v_cmd, v_intrud);
  perform pg_temp.sec_expect_denied(142, 'remove_product_image: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  -- Cuota --------------------------------------------------------------
  v_cmd := format($q$select public.record_storage_usage('%s', 1)$q$, v_store_a);
  perform pg_temp.sec_expect_denied(143, 'record_storage_usage: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(144, 'record_storage_usage: un usuario sin membresía no puede', v_cmd, v_intrud);
  perform pg_temp.sec_expect_denied(145, 'record_storage_usage: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  -- Ajustes de la tienda: solo el dueño --------------------------------
  v_cmd := format($q$select public.update_store('%s', 'Intrusa', null, null, 'HNL', null, null)$q$, v_store_a);
  perform pg_temp.sec_expect_denied(146, 'update_store: un editor no puede', v_cmd, 'e5000000-0000-0000-0000-000000000003');
  perform pg_temp.sec_expect_denied(147, 'update_store: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(148, 'update_store: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  v_cmd := format($q$select public.set_store_logo('%s', '/stores/%s/logo.jpg')$q$, v_store_a, v_store_b);
  perform pg_temp.sec_expect_denied(149, 'set_store_logo: un editor no puede', v_cmd, 'e5000000-0000-0000-0000-000000000003');
  perform pg_temp.sec_expect_denied(150, 'set_store_logo: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(151, 'set_store_logo: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  v_cmd := format($q$select public.regenerate_store_slug('%s', 'e2e-sec-a-nuevo')$q$, v_store_a);
  perform pg_temp.sec_expect_denied(152, 'regenerate_store_slug: un editor no puede', v_cmd, 'e5000000-0000-0000-0000-000000000003');
  perform pg_temp.sec_expect_denied(153, 'regenerate_store_slug: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(154, 'regenerate_store_slug: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  -- Publicación: solo el dueño ------------------------------------------
  v_cmd := format($q$select public.publish_store('%s')$q$, v_store_c);
  perform pg_temp.sec_expect_denied(155, 'publish_store: un editor no puede', v_cmd, 'e5000000-0000-0000-0000-000000000003');
  perform pg_temp.sec_expect_denied(156, 'publish_store: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(157, 'publish_store: un usuario sin membresía no puede', v_cmd, v_intrud);
  perform pg_temp.sec_expect_denied(158, 'publish_store: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  v_cmd := format($q$select public.unpublish_store('%s')$q$, v_store_a);
  perform pg_temp.sec_expect_denied(159, 'unpublish_store: un editor no puede', v_cmd, 'e5000000-0000-0000-0000-000000000003');
  perform pg_temp.sec_expect_denied(160, 'unpublish_store: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(161, 'unpublish_store: un usuario sin membresía no puede', v_cmd, v_intrud);
  perform pg_temp.sec_expect_denied(162, 'unpublish_store: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  -- Miembros y borrado de tienda: solo el dueño --------------------------
  v_cmd := format($q$select public.invite_member('%s', 'nuevo@test.test', 'viewer')$q$, v_store_a);
  perform pg_temp.sec_expect_denied(163, 'invite_member: un editor no puede', v_cmd, 'e5000000-0000-0000-0000-000000000003');
  perform pg_temp.sec_expect_denied(164, 'invite_member: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(165, 'invite_member: el dueño de otra tienda no puede', v_cmd, v_owner_b);

  v_cmd := format($q$select public.delete_store('%s')$q$, v_store_c);
  perform pg_temp.sec_expect_denied(166, 'delete_store: un editor no puede', v_cmd, 'e5000000-0000-0000-0000-000000000003');
  perform pg_temp.sec_expect_denied(167, 'delete_store: un viewer no puede', v_cmd, v_viewer);
  perform pg_temp.sec_expect_denied(168, 'delete_store: el dueño de otra tienda no puede', v_cmd, v_owner_b);
end $$;

-- El editor sí puede gestionar el catálogo (matriz §5.1): es el control que
-- distingue "rol insuficiente" de "todo cerrado".
do $$
declare
  v_store_a text := 'e6000000-0000-0000-0000-000000000001';
  v_prod_a  text := 'e7000000-0000-0000-0000-000000000001';
  v_prod_a2 text := 'e7000000-0000-0000-0000-000000000002';
  v_var_a3  text := 'e8000000-0000-0000-0000-000000000003';
  v_editor  uuid := 'e5000000-0000-0000-0000-000000000003';
  v_cmd     text;
  v_ver     int;
  v_uniq    text := 'x' || floor(random() * 1000000)::text;
begin
  select version into v_ver from public.products where id = v_prod_a2::uuid;

  -- Slug y nombre únicos por corrida: create_category/create_tag rechazan los
  -- duplicados, así que la batería tiene que ser reejecutable.
  v_cmd := format($q$select public.create_category('%s', 'Del editor %s', 'del-editor-%s')$q$,
    v_store_a, v_uniq, v_uniq);
  perform pg_temp.sec_expect_allowed(170, 'create_category: un editor sí puede', v_cmd, v_editor);

  v_cmd := format($q$select public.create_tag('%s', 'Del editor %s', '#010203')$q$, v_store_a, v_uniq);
  perform pg_temp.sec_expect_allowed(171, 'create_tag: un editor sí puede', v_cmd, v_editor);

  -- Se actualiza una variante existente (no se crea otra): upsert_variant
  -- rechaza los atributos repetidos y la regla de presentación única impide
  -- activar la variante simple en un producto que ya tiene tallas activas.
  v_cmd := format(
    $q$select public.upsert_variant('%s', '%s', '{}', 'A2-1', 1500, 'none', 0, 2, true, 0, %s)$q$,
    v_prod_a2, v_var_a3, v_ver);
  perform pg_temp.sec_expect_allowed(172, 'upsert_variant: un editor sí puede', v_cmd, v_editor);

  v_cmd := format($q$select public.record_storage_usage('%s', 1)$q$, v_store_a);
  perform pg_temp.sec_expect_allowed(173, 'record_storage_usage: un editor sí puede', v_cmd, v_editor);

  v_cmd := format($q$select public.remove_product_image('%s', '%s', 'no-existe.jpg')$q$, v_store_a, v_prod_a);
  perform pg_temp.sec_expect_allowed(174, 'remove_product_image: un editor sí puede', v_cmd, v_editor);

  -- Limpieza de lo que ha creado la corrida.
  delete from public.categories where store_id = v_store_a::uuid and slug like 'del-editor-%';
  delete from public.tags where store_id = v_store_a::uuid and name like 'Del editor %';
end $$;

-- -----------------------------------------------------------------------------
-- 3. S.2 RPCs de administración
-- -----------------------------------------------------------------------------

do $$
declare
  v_store_a text := 'e6000000-0000-0000-0000-000000000001';
  v_store_b text := 'e6000000-0000-0000-0000-000000000002';
  v_normal  uuid := 'e5000000-0000-0000-0000-000000000005';
  v_support uuid := 'e5000000-0000-0000-0000-000000000006';
  v_super   uuid := 'e5000000-0000-0000-0000-000000000007';
  v_other   uuid := 'e5000000-0000-0000-0000-000000000001';
  v_cmd     text;
  v_res     text;
begin
  -- Un usuario normal (sin platform_members) no debe poder operar la plataforma.
  v_cmd := format($q$select public.admin_list_stores()$q$);
  perform pg_temp.sec_set_user(v_normal);
  v_res := pg_temp.sec_try(v_cmd);
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(201, 'S.2 administración',
    'admin_list_stores: un usuario normal no puede', v_res like 'DENEGADO%', v_res);

  v_cmd := format($q$select public.admin_audit_log('%s', 10)$q$, v_store_a);
  perform pg_temp.sec_set_user(v_normal);
  v_res := pg_temp.sec_try(v_cmd);
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(202, 'S.2 administración',
    'admin_audit_log: un usuario normal no puede', v_res like 'DENEGADO%', v_res);

  v_cmd := format($q$select public.admin_set_store_status('%s', 'suspended')$q$, v_store_b);
  perform pg_temp.sec_set_user(v_normal);
  v_res := pg_temp.sec_try(v_cmd);
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(203, 'S.2 administración',
    'admin_set_store_status: un usuario normal no puede', v_res like 'DENEGADO%', v_res);

  v_cmd := format($q$select public.admin_set_store_plan('%s', 'pro')$q$, v_store_b);
  perform pg_temp.sec_set_user(v_normal);
  v_res := pg_temp.sec_try(v_cmd);
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(204, 'S.2 administración',
    'admin_set_store_plan: un usuario normal no puede', v_res like 'DENEGADO%', v_res);

  v_cmd := format($q$select public.admin_grant_platform_role('%s', 'superadmin', true)$q$, v_normal);
  perform pg_temp.sec_set_user(v_normal);
  v_res := pg_temp.sec_try(v_cmd);
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(205, 'S.2 administración',
    'admin_grant_platform_role: un usuario normal no puede', v_res like 'DENEGADO%', v_res);

  -- 'support' lee pero no opera.
  perform pg_temp.sec_set_user(v_support);
  v_res := pg_temp.sec_try(format($q$select public.admin_list_stores()$q$));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(206, 'S.2 administración',
    'admin_list_stores: support sí puede leer', v_res = 'PERMITIDO', v_res);

  perform pg_temp.sec_set_user(v_support);
  v_res := pg_temp.sec_try(format($q$select public.admin_audit_log('%s', 10)$q$, v_store_a));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(207, 'S.2 administración',
    'admin_audit_log: support sí puede leer', v_res = 'PERMITIDO', v_res);

  perform pg_temp.sec_set_user(v_support);
  v_res := pg_temp.sec_try(format($q$select public.admin_set_store_status('%s', 'suspended')$q$, v_store_b));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(208, 'S.2 administración',
    'admin_set_store_status: support NO puede suspender', v_res like 'DENEGADO%', v_res);

  perform pg_temp.sec_set_user(v_support);
  v_res := pg_temp.sec_try(format($q$select public.admin_set_store_plan('%s', 'pro')$q$, v_store_b));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(209, 'S.2 administración',
    'admin_set_store_plan: support NO puede cambiar el plan', v_res like 'DENEGADO%', v_res);

  perform pg_temp.sec_set_user(v_support);
  v_res := pg_temp.sec_try(format($q$select public.admin_grant_platform_role('%s', 'superadmin', true)$q$, v_other));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(210, 'S.2 administración',
    'admin_grant_platform_role: support NO puede conceder roles', v_res like 'DENEGADO%', v_res);

  -- Un superadmin sí puede suspender y cambiar el plan (y la tienda vuelve
  -- a su estado para no arrastrar el efecto a otras comprobaciones).
  perform pg_temp.sec_set_user(v_super);
  v_res := pg_temp.sec_try(format($q$select public.admin_set_store_status('%s', 'suspended')$q$, v_store_b));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(211, 'S.2 administración',
    'admin_set_store_status: superadmin sí puede suspender', v_res = 'PERMITIDO', v_res);

  perform pg_temp.sec_set_user(v_super);
  v_res := pg_temp.sec_try(format($q$select public.admin_set_store_status('%s', 'published')$q$, v_store_b));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(212, 'S.2 administración',
    'admin_set_store_status: superadmin sí puede reactivar', v_res = 'PERMITIDO', v_res);

  perform pg_temp.sec_set_user(v_super);
  v_res := pg_temp.sec_try(format($q$select public.admin_set_store_plan('%s', 'pro')$q$, v_store_b));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(213, 'S.2 administración',
    'admin_set_store_plan: superadmin sí puede cambiar el plan', v_res = 'PERMITIDO', v_res);

  perform pg_temp.sec_set_user(v_super);
  v_res := pg_temp.sec_try(format($q$select public.admin_set_store_plan('%s', 'free')$q$, v_store_b));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(214, 'S.2 administración',
    'admin_set_store_plan: el plan vuelve a free', v_res = 'PERMITIDO', v_res);

  -- Un superadmin no puede quitarse su propio rol por accidente.
  perform pg_temp.sec_set_user(v_super);
  v_res := pg_temp.sec_try(format($q$select public.admin_grant_platform_role('%s', 'superadmin', false)$q$, v_super));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(215, 'S.2 administración',
    'admin_grant_platform_role: un superadmin no puede quitarse su propio rol',
    v_res like 'DENEGADO%', v_res);

  perform pg_temp.sec_check(216, 'S.2 administración',
    'el superadmin conserva su rol tras el intento de quitárselo',
    exists (select 1 from public.platform_members where user_id = v_super and role = 'superadmin'),
    (select role from public.platform_members where user_id = v_super)::text);

  -- Conceder un rol de plataforma a OTRO usuario está permitido...
  perform pg_temp.sec_set_user(v_super);
  v_res := pg_temp.sec_try(format($q$select public.admin_grant_platform_role('%s', 'support', true)$q$, v_other));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(217, 'S.2 administración',
    'admin_grant_platform_role: un superadmin sí puede conceder un rol', v_res = 'PERMITIDO', v_res);

  perform pg_temp.sec_check(218, 'S.2 administración',
    'el rol concedido queda en platform_members',
    exists (select 1 from public.platform_members where user_id = v_other and role = 'support'),
    (select role from public.platform_members where user_id = v_other)::text);

  -- ...y el usuario有些不 de rol de plataforma ya no puede operar: el rol se
  -- comprueba en la base, no en la interfaz.
  perform pg_temp.sec_set_user(v_other);
  v_res := pg_temp.sec_try(format($q$select public.admin_set_store_status('%s', 'suspended')$q$, v_store_b));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(219, 'S.2 administración',
    'admin_set_store_status: un support no puede suspender (rol comprobado en la base)',
    v_res like 'DENEGADO%', v_res);

  -- Se devuelve el rol original.
  perform pg_temp.sec_set_user(v_super);
  v_res := pg_temp.sec_try(format($q$select public.admin_grant_platform_role('%s', 'superadmin', false)$q$, v_other));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(220, 'S.2 administración',
    'admin_grant_platform_role: se revoca el rol de prueba', v_res = 'PERMITIDO', v_res);
end $$;

-- platform_seed_superadmin: la puerta trasera de bootstrap no debe ser
-- alcanzable desde la aplicación.
do $$
declare
  v_res text;
begin
  perform pg_temp.sec_check(221, 'S.2 administración',
    'platform_seed_superadmin: anon no tiene permiso de ejecución',
    not has_function_privilege('anon', 'public.platform_seed_superadmin(uuid)', 'EXECUTE'),
    'has_function_privilege(anon)');

  perform pg_temp.sec_check(222, 'S.2 administración',
    'platform_seed_superadmin: authenticated no tiene permiso de ejecución',
    not has_function_privilege('authenticated', 'public.platform_seed_superadmin(uuid)', 'EXECUTE'),
    'has_function_privilege(authenticated)');

  perform pg_temp.sec_set_user('e5000000-0000-0000-0000-000000000005'::uuid);
  v_res := pg_temp.sec_try(format(
    $q$select public.platform_seed_superadmin('%s')$q$, 'e5000000-0000-0000-0000-000000000005'));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(223, 'S.2 administración',
    'platform_seed_superadmin: un usuario normal no puede auto-asignarse el rol',
    v_res like 'DENEGADO%', v_res);

  perform pg_temp.sec_check(224, 'S.2 administración',
    'el usuario normal sigue sin rol de plataforma',
    not exists (select 1 from public.platform_members where user_id = 'e5000000-0000-0000-0000-000000000005'),
    'platform_members');
end $$;

-- -----------------------------------------------------------------------------
-- 4. S.3 Aislamiento de categoría y etiqueta entre tiendas
--
-- REGRESIÓN: create_product_with_variant y update_product no comprobaban que
-- la categoría o la etiqueta pertenezcan a la tienda del producto. El
-- resultado era que el catálogo público de la tienda A exponía el nombre de la
-- categoría de la tienda B. Corregido en 0021_security_fixes.sql; estas
-- comprobaciones fallan si alguien revierte esa corrección.
-- -----------------------------------------------------------------------------

do $$
declare
  v_store_a text := 'e6000000-0000-0000-0000-000000000001';
  v_store_b text := 'e6000000-0000-0000-0000-000000000002';
  v_cat_b   text := 'e9000000-0000-0000-0000-000000000002';
  v_tag_b   text := 'ea000000-0000-0000-0000-000000000002';
  v_prod_a  text := 'e7000000-0000-0000-0000-000000000001';
  v_owner_a uuid := 'e5000000-0000-0000-0000-000000000001';
  v_res     text;
  v_cat     jsonb;
  v_leak    text;
  v_ver     int;
begin
  select version into v_ver from public.products where id = v_prod_a::uuid;

  -- Control: set_product_category SÍ valida la pertenencia.
  perform pg_temp.sec_set_user(v_owner_a);
  v_res := pg_temp.sec_try(format($q$select public.set_product_category('%s', '%s')$q$, v_prod_a, v_cat_b));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(301, 'S.3 aislamiento categoría',
    'set_product_category rechaza una categoría de otra tienda (control)',
    v_res like 'DENEGADO%', v_res);

  -- create_product_with_variant NO valida la pertenencia.
  perform pg_temp.sec_set_user(v_owner_a);
  v_res := pg_temp.sec_try(format(
    $q$select public.create_product_with_variant('%s', 'con-categoria-ajena', 'Con categoría ajena', '', '%s', '%s', '[]'::jsonb, '{}'::text[], 0, '{}'::jsonb, null, 1000, 'none', 0, 1, null)$q$,
    v_store_a, v_cat_b, v_tag_b));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(302, 'S.3 aislamiento categoría',
    'create_product_with_variant NO debería aceptar una categoría de otra tienda',
    v_res like 'DENEGADO%', v_res);
  -- update_product NO valida la pertenencia.
  perform pg_temp.sec_set_user(v_owner_a);
  v_res := pg_temp.sec_try(format(
    $q$select public.update_product('%s', null, null, '%s', null, null, null, null, null, null, null, %s)$q$,
    v_prod_a, v_cat_b, v_ver));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(303, 'S.3 aislamiento categoría',
    'update_product NO debería aceptar una categoría de otra tienda',
    v_res like 'DENEGADO%', v_res);

  -- Efecto visible: el catálogo público de A expone el slug de la categoría de B.
  v_cat := public.public_catalog('e2e-sec-a', 50, 0, null, null);
  select p->>'category' into v_leak
  from jsonb_array_elements(coalesce(v_cat->'products', '[]'::jsonb)) p
  where p->>'id' = v_prod_a;

  perform pg_temp.sec_check(304, 'S.3 aislamiento categoría',
    'el catálogo público de A no expone la categoría de la tienda B',
    v_leak is distinct from 'categoria-b',
    'categoría mostrada: ' || coalesce(v_leak, '(null)'));

  -- La lista de categorías del catálogo de A tampoco debe incluir la de B.
  perform pg_temp.sec_check(305, 'S.3 aislamiento categoría',
    'la lista de categorías del catálogo de A no incluye la de B',
    not exists (
      select 1 from jsonb_array_elements(coalesce(v_cat->'categories', '[]'::jsonb)) c
      where c->>'slug' = 'categoria-b'
    ),
    coalesce((v_cat->'categories')::text, '(null)'));

  -- Etiquetas: mismo hueco por la vía de update_product.
  perform pg_temp.sec_set_user(v_owner_a);
  v_res := pg_temp.sec_try(format(
    $q$select public.update_product('%s', null, null, null, '%s', null, null, null, null, null, null, %s)$q$,
    v_prod_a, v_tag_b, v_ver + 1));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(306, 'S.3 aislamiento categoría',
    'update_product NO debería aceptar una etiqueta de otra tienda',
    v_res like 'DENEGADO%', v_res);

  -- El catálogo se vuelve a leer: el de arriba era anterior al cambio.
  v_cat := public.public_catalog('e2e-sec-a', 50, 0, null, null);
  select p->>'tag' into v_leak
  from jsonb_array_elements(coalesce(v_cat->'products', '[]'::jsonb)) p
  where p->>'id' = v_prod_a;

  perform pg_temp.sec_check(307, 'S.3 aislamiento categoría',
    'el catálogo público de A no expone la etiqueta de la tienda B',
    v_leak is distinct from 'Etiqueta B',
    'etiqueta mostrada: ' || coalesce(v_leak, '(null)'));

  -- Se deja el producto como estaba para no ensuciar las comprobaciones finales.
  perform pg_temp.sec_set_user(v_owner_a);
  v_res := pg_temp.sec_try(format(
    $q$select public.update_product('%s', null, null, null, null, null, null, null, null, null, null, %s)$q$,
    v_prod_a, v_ver + 2));
  perform pg_temp.sec_reset_role();

  -- Limpieza: se borran los productos que ha creado la corrida y se devuelven
  -- la categoría y la etiqueta originales del producto fixture.
  delete from public.products
  where store_id = v_store_a::uuid and slug like 'con-categoria-ajena%';

  update public.products
  set category_id = 'e9000000-0000-0000-0000-000000000001',
      tag_id = 'ea000000-0000-0000-0000-000000000001'
  where id = v_prod_a::uuid;
end $$;

-- -----------------------------------------------------------------------------
-- 5. S.4 Cuota de almacenamiento
--
-- REGRESIÓN: el delta de record_storage_usage lo elegía el llamante y no se
-- contrastaba con el DAM, así que un dueño (o editor) podía llamar la RPC con
-- un delta negativo y poner el contador de su tienda a cero: la cuota del plan
-- dejaba de aplicar. Corregido en 0021_security_fixes.sql (la resta la hace
-- release_storage_usage, que solo puede ejecutar el servidor).
-- -----------------------------------------------------------------------------

do $$
declare
  v_store_a text := 'e6000000-0000-0000-0000-000000000001';
  v_owner_a uuid := 'e5000000-0000-0000-0000-000000000001';
  v_intrud  uuid := 'e5000000-0000-0000-0000-000000000005';
  v_res     text;
  v_before  bigint;
  v_after   bigint;
begin
  -- Un usuario sin membresía no puede tocar la cuota de nadie.
  perform pg_temp.sec_set_user(v_intrud);
  v_res := pg_temp.sec_try(format($q$select public.record_storage_usage('%s', 1)$q$, v_store_a));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(401, 'S.4 cuota',
    'record_storage_usage: un usuario sin membresía no puede', v_res like 'DENEGADO%', v_res);

  -- Un delta positivo que rebasa el plan se rechaza.
  perform pg_temp.sec_set_user(v_owner_a);
  v_res := pg_temp.sec_try(format($q$select public.record_storage_usage('%s', %s)$q$,
    v_store_a, (select max_storage_bytes + 1 from public.plan_limits where plan_code = 'free')::bigint));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(402, 'S.4 cuota',
    'un delta que rebasa el plan se rechaza', v_res like 'DENEGADO%', v_res);

  -- HALLAZGO: un delta negativo deja el contador en cero.
  select bytes_used into v_before from public.store_storage where store_id = v_store_a::uuid;
  perform pg_temp.sec_set_user(v_owner_a);
  v_res := pg_temp.sec_try(format($q$select public.record_storage_usage('%s', %s)$q$,
    v_store_a, -v_before));
  perform pg_temp.sec_reset_role();
  select bytes_used into v_after from public.store_storage where store_id = v_store_a::uuid;

  perform pg_temp.sec_check(403, 'S.4 cuota',
    'un delta negativo NO debería poder vaciar el contador de la tienda',
    v_after = v_before,
    format('antes=%s, delta=-%s, después=%s', v_before, v_before, v_after));

  -- Se restituye el contador para el resto de la batería.
  update public.store_storage set bytes_used = v_before where store_id = v_store_a::uuid;
end $$;

-- -----------------------------------------------------------------------------
-- 6. S.5 Superficie pública: enumeración y aislamiento
-- -----------------------------------------------------------------------------

do $$
declare
  v_cat    jsonb;
  v_prod   jsonb;
  v_sitemap jsonb;
  v_slugs  text;
begin
  -- Una tienda en borrador y una que no existen devuelven lo mismo.
  perform pg_temp.sec_check(501, 'S.5 superficie pública',
    'public_catalog: una tienda en borrador devuelve null',
    public.public_catalog('e2e-sec-c', 50, 0, null, null) is null, 'null');

  perform pg_temp.sec_check(502, 'S.5 superficie pública',
    'public_catalog: una tienda inexistente devuelve null',
    public.public_catalog('e2e-sec-no-existe', 50, 0, null, null) is null, 'null');

  perform pg_temp.sec_check(503, 'S.5 superficie pública',
    'public_catalog: no se puede distinguir borrador de inexistente',
    (public.public_catalog('e2e-sec-c', 50, 0, null, null) is null)
    = (public.public_catalog('e2e-sec-no-existe', 50, 0, null, null) is null),
    'ambos null');

  perform pg_temp.sec_check(504, 'S.5 superficie pública',
    'public_store_published: borrador e inexistente devuelven false',
    public.public_store_published('e2e-sec-c') is false
      and public.public_store_published('e2e-sec-no-existe') is false,
    'false / false');

  perform pg_temp.sec_check(505, 'S.5 superficie pública',
    'public_store_published: una tienda publicada devuelve true',
    public.public_store_published('e2e-sec-a') is true, 'true');

  -- El catálogo de A no mezcla productos de B.
  v_cat := public.public_catalog('e2e-sec-a', 50, 0, null, null);
  perform pg_temp.sec_check(506, 'S.5 superficie pública',
    'public_catalog: la tienda A no expone productos de la tienda B',
    not exists (
      select 1 from jsonb_array_elements(coalesce(v_cat->'products', '[]'::jsonb)) p
      where p->>'id' = 'e7000000-0000-0000-0000-000000000004'
    ),
    'productos: ' || jsonb_array_length(coalesce(v_cat->'products', '[]'::jsonb))::text);

  -- El producto oculto no aparece en el catálogo.
  perform pg_temp.sec_check(507, 'S.5 superficie pública',
    'public_catalog: un producto inactivo no aparece',
    not exists (
      select 1 from jsonb_array_elements(coalesce(v_cat->'products', '[]'::jsonb)) p
      where p->>'id' = 'e7000000-0000-0000-0000-000000000003'
    ),
    'productos: ' || jsonb_array_length(coalesce(v_cat->'products', '[]'::jsonb))::text);

  -- public_product: nada de productos ajenos, ocultos o de tiendas en borrador.
  perform pg_temp.sec_check(508, 'S.5 superficie pública',
    'public_product: el slug de un producto de otra tienda no resuelve',
    public.public_product('e2e-sec-a', 'prod-b') is null, 'null');

  perform pg_temp.sec_check(509, 'S.5 superficie pública',
    'public_product: un producto inactivo no resuelve',
    public.public_product('e2e-sec-a', 'prod-a-oculto') is null, 'null');

  perform pg_temp.sec_check(510, 'S.5 superficie pública',
    'public_product: una tienda en borrador no resuelve',
    public.public_product('e2e-sec-c', 'prod-a') is null, 'null');

  v_prod := public.public_product('e2e-sec-a', 'prod-a');
  perform pg_temp.sec_check(511, 'S.5 superficie pública',
    'public_product: devuelve el producto pedido',
    v_prod->'product'->>'id' = 'e7000000-0000-0000-0000-000000000001',
    coalesce(v_prod->'product'->>'id', '(null)'));

  -- El sitemap solo lista tiendas publicadas.
  v_sitemap := public.public_sitemap_entries();
  select string_agg(s->>'slug', ',') into v_slugs
  from jsonb_array_elements(coalesce(v_sitemap->'stores', '[]'::jsonb)) s;

  perform pg_temp.sec_check(512, 'S.5 superficie pública',
    'public_sitemap_entries: no incluye tiendas en borrador',
    not exists (
      select 1 from jsonb_array_elements(coalesce(v_sitemap->'stores', '[]'::jsonb)) s
      where s->>'slug' = 'e2e-sec-c'
    ),
    'tiendas: ' || coalesce(v_slugs, '(null)'));

  perform pg_temp.sec_check(513, 'S.5 superficie pública',
    'public_sitemap_entries: incluye las tiendas publicadas',
    exists (
      select 1 from jsonb_array_elements(coalesce(v_sitemap->'stores', '[]'::jsonb)) s
      where s->>'slug' = 'e2e-sec-a'
    ),
    'tiendas: ' || coalesce(v_slugs, '(null)'));

  perform pg_temp.sec_check(514, 'S.5 superficie pública',
    'public_sitemap_entries: no expone identificadores internos',
    not exists (
      select 1 from jsonb_array_elements(coalesce(v_sitemap->'stores', '[]'::jsonb)) s
      where s ? 'id'
    ),
    'claves: ' || (
      select string_agg(k, ',') from jsonb_object_keys(
        (select s from jsonb_array_elements(coalesce(v_sitemap->'stores', '[]'::jsonb)) s limit 1)) k
    )::text);
end $$;

-- -----------------------------------------------------------------------------
-- 7. S.6 Logo de la tienda
--
-- El fileId de ImageKit es opaco (no lleva la ruta), así que la pertenencia
-- del archivo no se puede comprobar aquí: la comprueba upload-commit, que lee
-- la ruta real en el DAM (probado en la E2E). Aquí se comprueba que la RPC
--acepte el valor que manda la aplicación y que siga siendo solo del dueño.
-- -----------------------------------------------------------------------------

do $$
declare
  v_store_a text := 'e6000000-0000-0000-0000-000000000001';
  v_owner_a uuid := 'e5000000-0000-0000-0000-000000000001';
  v_res     text;
begin
  -- El valor que manda la aplicación (fileId opaco) se acepta.
  perform pg_temp.sec_set_user(v_owner_a);
  v_res := pg_temp.sec_try(format($q$select public.set_store_logo('%s', '65f0a1b2c3d4e5f6a7b8c9d0')$q$, v_store_a));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(601, 'S.6 logo',
    'set_store_logo acepta el fileId que devuelve ImageKit', v_res = 'PERMITIDO', v_res);

  -- Un identificador absurdo se rechaza.
  perform pg_temp.sec_set_user(v_owner_a);
  v_res := pg_temp.sec_try(format($q$select public.set_store_logo('%s', '%s')$q$,
    v_store_a, repeat('x', 300)));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(602, 'S.6 logo',
    'set_store_logo rechaza un identificador de longitud absurda', v_res like 'DENEGADO%', v_res);

  -- Quitar el logo (null) está permitido para el dueño.
  perform pg_temp.sec_set_user(v_owner_a);
  v_res := pg_temp.sec_try(format($q$select public.set_store_logo('%s', null)$q$, v_store_a));
  perform pg_temp.sec_reset_role();
  perform pg_temp.sec_check(603, 'S.6 logo',
    'set_store_logo con null (quitar el logo) está permitido para el dueño',
    v_res = 'PERMITIDO', v_res);

  update public.stores set logo_file_id = null where id = v_store_a::uuid;
end $$;

-- -----------------------------------------------------------------------------
-- 8. S.7 Privilegios: superficie expuesta por rol
-- -----------------------------------------------------------------------------

do $$
declare
  v_leak text;
begin
  -- Ninguna RPC de escritura puede ejecutarse como anónimo.
  select string_agg(p.proname, ', ' order by p.proname) into v_leak
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any (array[
      'create_store','create_product_with_variant','update_product','bulk_update_products',
      'invite_member','delete_store','create_category','update_category','delete_category',
      'create_tag','update_tag','delete_tag','set_product_category','set_product_tag',
      'upsert_variant','delete_variant','publish_store','unpublish_store','update_store',
      'set_store_logo','regenerate_store_slug','record_storage_usage','remove_product_image',
      'admin_list_stores','admin_set_store_status','admin_set_store_plan','admin_audit_log',
      'admin_grant_platform_role'])
    and has_function_privilege('anon', p.oid, 'EXECUTE');

  perform pg_temp.sec_check(701, 'S.7 privilegios',
    'ninguna RPC de escritura o de administración es ejecutable por anon',
    v_leak is null, 'expuestas a anon: ' || coalesce(v_leak, '(ninguna)'));

  -- Las RPC públicas son las únicas accesibles sin sesión.
  perform pg_temp.sec_check(702, 'S.7 privilegios',
    'las RPC públicas siguen siendo accesibles para anon',
    has_function_privilege('anon', 'public.public_catalog(text, int, int, text, text)', 'EXECUTE')
      and has_function_privilege('anon', 'public.public_product(text, text)', 'EXECUTE')
      and has_function_privilege('anon', 'public.public_sitemap_entries()', 'EXECUTE')
      and has_function_privilege('anon', 'public.public_store_published(text)', 'EXECUTE'),
    'public_catalog / public_product / public_sitemap_entries / public_store_published');

  -- Ninguna función de pruebas debe quedar expuesta en el esquema public:
  -- PostgREST publica el esquema public y un helper de simulación de sesión
  -- ahí sería una escalada de privilegios a cualquier usuario.
  select string_agg(p.proname, ', ') into v_leak
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (p.proname like 'test\_%' or p.proname like 'sec\_%' or p.proname like 'probe\_%');

  perform pg_temp.sec_check(703, 'S.7 privilegios',
    'no quedan funciones de prueba en el esquema public',
    v_leak is null, 'expuestas: ' || coalesce(v_leak, '(ninguna)'));

  -- RLS activo en todas las tablas de negocio.
  select string_agg(c.relname, ', ') into v_leak
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in ('profiles','platform_members','stores','store_members','categories','tags',
                      'products','variants','store_storage','audit_log','events','plan_limits')
    and not c.relrowsecurity;

  perform pg_temp.sec_check(704, 'S.7 privilegios',
    'todas las tablas de negocio tienen RLS activo', v_leak is null,
    'sin RLS: ' || coalesce(v_leak, '(ninguna)'));

  -- TRUNCATE no pasa por RLS: ningún rol de petición puede vaciar las tablas.
  perform pg_temp.sec_check(705, 'S.7 privilegios',
    'anon y authenticated no tienen TRUNCATE sobre las tablas de negocio',
    not has_table_privilege('anon', 'public.products', 'TRUNCATE')
      and not has_table_privilege('authenticated', 'public.products', 'TRUNCATE')
      and not has_table_privilege('authenticated', 'public.stores', 'TRUNCATE')
      and not has_table_privilege('authenticated', 'public.variants', 'TRUNCATE'),
    'has_table_privilege');

  -- Las tablas de negocio no admiten escritura directa: solo RPC.
  perform pg_temp.sec_check(706, 'S.7 privilegios',
    'authenticated no puede escribir directo en las tablas de negocio',
    not has_table_privilege('authenticated', 'public.products', 'INSERT')
      and not has_table_privilege('authenticated', 'public.stores', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.variants', 'DELETE')
      and not has_table_privilege('authenticated', 'public.store_members', 'INSERT'),
    'has_table_privilege');

  -- platform_members solo se lee por RLS (cada uno ve su fila).
  perform pg_temp.sec_check(707, 'S.7 privilegios',
    'authenticated no puede leer ni escribir platform_members directamente',
    not has_table_privilege('authenticated', 'public.platform_members', 'INSERT')
      and not has_table_privilege('authenticated', 'public.platform_members', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.platform_members', 'DELETE'),
    'has_table_privilege');
end $$;

-- -----------------------------------------------------------------------------
-- 9. S.8 Metrica publica de eventos (clic en WhatsApp)
--
-- REGRESIÓN: record_event estaba declarada STABLE pero hace un INSERT.
-- Postgres rechaza la escritura en una función no volátil ("INSERT is not
-- allowed in a non-volatile function"), así que el evento nunca se guardaba:
-- la métrica de clic en WhatsApp (KPI central, plan §4.3) era siempre cero y
-- el cliente se tragaba el error. Corregido en 0021_security_fixes.sql.
-- -----------------------------------------------------------------------------

do $$
declare
  v_before bigint;
  v_after  bigint;
  v_res    text;
  v_vol    text;
begin
  select provolatile into v_vol
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'record_event';

  perform pg_temp.sec_check(800, 'S.8 metrica',
    'record_event es VOLATILE: puede escribir en la tabla events',
    v_vol = 'v', 'provolatile=' || coalesce(v_vol, '(null)'));

  select count(*) into v_before from public.events where store_id = 'e6000000-0000-0000-0000-000000000001';

  perform pg_temp.sec_set_user(null);
  v_res := pg_temp.sec_try(format(
    $q$select public.record_event('%s', '%s', 'view')$q$,
    'e6000000-0000-0000-0000-000000000002', 'e7000000-0000-0000-0000-000000000004'));
  perform pg_temp.sec_reset_role();

  select count(*) into v_after from public.events where store_id = 'e6000000-0000-0000-0000-000000000001';
  perform pg_temp.sec_check(801, 'S.8 metrica',
    'record_event: un evento de otra tienda no se imputa a la tienda A',
    v_after = v_before,
    format('eventos de A antes=%s, después=%s', v_before, v_after));

  perform pg_temp.sec_check(802, 'S.8 metrica',
    'record_event debería registrar el evento sin error',
    v_res = 'PERMITIDO', v_res);

  perform pg_temp.sec_check(803, 'S.8 metrica',
    'el evento queda registrado en la tabla events',
    exists (
      select 1 from public.events
      where store_id = 'e6000000-0000-0000-0000-000000000002'
        and product_id = 'e7000000-0000-0000-0000-000000000004'
    ),
    'events');
end $$;

-- -----------------------------------------------------------------------------
-- 10. Veredicto y resumen
-- -----------------------------------------------------------------------------

do $$
declare
  v_inesperados text;
  v_documentados text;
begin
  select string_agg(ord::text || '. ' || nombre, ' | ' order by ord) into v_inesperados
  from pg_temp.sec_results where not ok and exp_ok;

  select string_agg(ord::text || '. ' || nombre, ' | ' order by ord) into v_documentados
  from pg_temp.sec_results where not ok and not exp_ok;

  if v_inesperados is not null then
    raise exception 'FALLOS INESPERADOS: %', v_inesperados;
  end if;

  raise notice 'Batería de seguridad: % comprobaciones, % hallazgos documentados',
    (select count(*) from pg_temp.sec_results),
    (select count(*) from pg_temp.sec_results where not ok);
end $$;

select ord, area, nombre,
       case when ok then 'PASA' else 'FALLA' end as resultado,
       case when ok then '-' when exp_ok then 'FALLA INESPERADA' else 'hallazgo documentado' end as estado,
       coalesce(detalle, '') as detalle
from pg_temp.sec_results
order by ord;
