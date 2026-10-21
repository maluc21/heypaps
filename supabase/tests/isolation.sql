-- supabase/tests/isolation.sql
-- Tests de aislamiento multiinquilino (plan fundacional §10.1).
--
-- Ejecutar SOLO contra una base de desarrollo/staging ya migrada (0001..0003).
-- Inserta usuarios y tiendas de prueba y los deja en las tablas.
--
-- Cada prueba falla con RAISE EXCEPTION si el aislamiento se rompe. Las
-- comprobaciones de denegación capturan el error esperado y solo entonces
-- marcan la prueba como correcta; un fallo nunca queda oculto por un
-- "when others" que lo trague.
--
-- Auth simulado: test_set_user() fija request.jwt.claims (lo que lee auth.uid())
-- y cambia al rol 'authenticated' o 'anon', de modo que RLS se aplica de verdad.

-- -----------------------------------------------------------------------------
-- 0. Fixtures (como admin, sin RLS)
-- -----------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'user-a@test.test', '{"nombre":"A"}'),
  ('22222222-2222-2222-2222-222222222222', 'user-b@test.test', '{"nombre":"B"}')
on conflict (id) do nothing;

insert into public.stores (id, slug, name, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tienda-a', 'Tienda A', 'published'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'tienda-b', 'Tienda B', 'published'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'tienda-c', 'Tienda C', 'draft')
on conflict (id) do nothing;

insert into public.store_members (store_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'owner')
on conflict (store_id, user_id) do nothing;

insert into public.store_storage (store_id, bytes_used) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 0),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 0),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 0)
on conflict (store_id) do nothing;

insert into public.products (id, store_id, slug, name) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'prod-a-1', 'Producto A 1'),
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'prod-a-2', 'Producto A 2'),
  ('a0000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'prod-a-last', 'Producto A última'),
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'prod-b-1', 'Producto B 1')
on conflict (id) do nothing;

insert into public.variants (id, store_id, product_id, attributes, price_cents) values
  ('a1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'a0000000-0000-0000-0000-000000000001', '{}', 1000),
  ('a1000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'a0000000-0000-0000-0000-000000000003', '{}', 1000)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Helpers de simulación de sesión
-- -----------------------------------------------------------------------------

create or replace function public.test_set_user(p_user_id uuid)
returns void language plpgsql set search_path = '' as $$
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

create or replace function public.test_reset_role()
returns void language plpgsql set search_path = '' as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'reset role';
end $$;

-- -----------------------------------------------------------------------------
-- 1.1 Usuario de tienda A no lee ni escribe datos de tienda B
-- -----------------------------------------------------------------------------

do $$
declare
  n int;
  denied boolean;
begin
  perform public.test_set_user('11111111-1111-1111-1111-111111111111'::uuid);

  select count(*) into n from public.stores where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 0 then raise exception '1.1 FAIL: A ve la tienda B'; end if;

  select count(*) into n from public.products where store_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 0 then raise exception '1.1 FAIL: A lee % producto(s) de B', n; end if;

  select count(*) into n from public.variants where store_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 0 then raise exception '1.1 FAIL: A lee % variante(s) de B', n; end if;

  select count(*) into n from public.categories where store_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 0 then raise exception '1.1 FAIL: A lee categorías de B'; end if;

  select count(*) into n from public.tags where store_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 0 then raise exception '1.1 FAIL: A lee etiquetas de B'; end if;

  select count(*) into n from public.store_members where store_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 0 then raise exception '1.1 FAIL: A lee miembros de B'; end if;

  select count(*) into n from public.store_storage where store_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 0 then raise exception '1.1 FAIL: A lee storage de B'; end if;

  select count(*) into n from public.audit_log where store_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 0 then raise exception '1.1 FAIL: A lee auditoría de B'; end if;

  select count(*) into n from public.events where store_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 0 then raise exception '1.1 FAIL: A lee eventos de B'; end if;

  -- Escritura cruzada directa: debe ser denegada (no hay políticas de INSERT para authenticated)
  denied := false;
  begin
    insert into public.products (store_id, slug, name)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'slug-cruzado', 'cruzado');
  exception when others then
    denied := true;
  end;
  if not denied then raise exception '1.1 FAIL: A pudo insertar producto en B'; end if;

  perform public.test_reset_role();
end $$;

-- -----------------------------------------------------------------------------
-- 1.2 anon: sin lectura de tablas base; catálogo público solo de tiendas publicadas
-- -----------------------------------------------------------------------------

do $$
declare
  n int;
begin
  perform public.test_set_user(null);

  begin
    select count(*) into n from public.products;
    if n <> 0 then raise exception '1.2 FAIL: anon lee % producto(s)', n; end if;
  exception when insufficient_privilege then
    null; -- denegado por permisos: correcto
  end;

  begin
    select count(*) into n from public.variants;
    if n <> 0 then raise exception '1.2 FAIL: anon lee % variante(s)', n; end if;
  exception when insufficient_privilege then
    null; -- denegado por permisos: correcto
  end;

  if (public.public_catalog('tienda-a')->'store'->>'name') is distinct from 'Tienda A' then
    raise exception '1.2 FAIL: public_catalog no devuelve la tienda publicada A';
  end if;

  if public.public_catalog('tienda-c') is not null then
    raise exception '1.2 FAIL: public_catalog expone tienda en borrador';
  end if;

  perform public.test_reset_role();
end $$;

-- -----------------------------------------------------------------------------
-- 1.3 variants.store_id no es falsificable (trigger sync_variant_store_id)
-- Se ejecuta como admin: el trigger es el mecanismo bajo prueba.
-- -----------------------------------------------------------------------------

do $$
declare
  v_store uuid;
begin
  perform public.test_reset_role();
  delete from public.variants where id = 'a1000000-0000-0000-0000-0000000000f1';

  -- Variante sobre producto de A declarando store_id de B -> debe quedar en A
  insert into public.variants (id, store_id, product_id, attributes, price_cents)
  values ('a1000000-0000-0000-0000-0000000000f1',
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          'a0000000-0000-0000-0000-000000000001', '{}', 1000);
  select store_id into v_store from public.variants where id = 'a1000000-0000-0000-0000-0000000000f1';
  if v_store <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' then
    raise exception '1.3 FAIL: store_id falsificado no fue corregido (obtuvo %)', v_store;
  end if;

  delete from public.variants where id = 'a1000000-0000-0000-0000-0000000000f1';
end $$;

-- -----------------------------------------------------------------------------
-- 1.4 Permisos de RPC por tienda y por rol; cuota de almacenamiento
-- -----------------------------------------------------------------------------

do $$
declare
  v_new uuid;
  denied boolean;
begin
  -- Owner de A puede crear producto vía RPC
  perform public.test_set_user('11111111-1111-1111-1111-111111111111'::uuid);
  v_new := public.create_product_with_variant(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'rpc-' || gen_random_uuid()::text, 'Creado por RPC', '', null, null,
    '[]'::jsonb, '{}'::text[], 0, '{}'::jsonb, null,
    1500, 'none', 0, null, null
  );
  if v_new is null then raise exception '1.4 FAIL: owner no pudo crear producto vía RPC'; end if;

  -- Owner de B no puede crear producto en A
  perform public.test_set_user('22222222-2222-2222-2222-222222222222'::uuid);
  denied := false;
  begin
    perform public.create_product_with_variant(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      'cruzado-' || gen_random_uuid()::text, 'Cruzado', '', null, null,
      '[]'::jsonb, '{}'::text[], 0, '{}'::jsonb, null,
      1500, 'none', 0, null, null
    );
  exception when others then
    denied := true;
  end;
  if not denied then raise exception '1.4 FAIL: B creó producto en A vía RPC'; end if;

  -- Cuota de almacenamiento: B no puede registrar uso en A
  denied := false;
  begin
    perform public.record_storage_usage('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1);
  exception when others then
    denied := true;
  end;
  if not denied then raise exception '1.4 FAIL: B registró almacenamiento en A'; end if;

  perform public.test_reset_role();
end $$;

-- -----------------------------------------------------------------------------
-- 1.5 Concurrencia optimista, acciones masivas auditadas y no mezcla de tiendas
-- -----------------------------------------------------------------------------

do $$
declare
  v_version int;
  v_before int;
  v_after int;
  v_affected int;
  denied boolean;
begin
  perform public.test_set_user('11111111-1111-1111-1111-111111111111'::uuid);

  -- Versión desactualizada -> sqlstate 45000
  select version into v_version from public.products where id = 'a0000000-0000-0000-0000-000000000002';
  denied := false;
  begin
    perform public.update_product(
      'a0000000-0000-0000-0000-000000000002'::uuid, 'Nombre X', null, null, null,
      '[]'::jsonb, '{}'::text[], 0, true, false, false, v_version - 1
    );
  exception when sqlstate '45000' then
    denied := true;
  end;
  if not denied then raise exception '1.5 FAIL: update_product aceptó versión desactualizada'; end if;

  -- Versión correcta -> aplica e incrementa version
  perform public.update_product(
    'a0000000-0000-0000-0000-000000000002'::uuid, 'Nombre X', null, null, null,
    '[]'::jsonb, '{}'::text[], 0, true, false, false, v_version
  );
  select version into v_after from public.products where id = 'a0000000-0000-0000-0000-000000000002';
  if v_after <> v_version + 1 then raise exception '1.5 FAIL: version no incrementó'; end if;

  -- Actualización parcial (0005): null conserva el valor; no debe borrar nombre, imágenes ni banderas.
  -- El fixture se prepara como admin (authenticated no tiene UPDATE directo, por diseño).
  perform public.test_reset_role();
  update public.products
  set images = array['https://ik.imagekit.io/test/a.jpg'], featured = true
  where id = 'a0000000-0000-0000-0000-000000000002';
  perform public.test_set_user('11111111-1111-1111-1111-111111111111'::uuid);
  select version into v_version from public.products where id = 'a0000000-0000-0000-0000-000000000002';
  perform public.update_product(
    'a0000000-0000-0000-0000-000000000002'::uuid, null, null, null, null,
    null, null, null, false, null, null, v_version
  );
  if not exists (
    select 1 from public.products
    where id = 'a0000000-0000-0000-0000-000000000002'
      and name = 'Nombre X'
      and featured = true
      and cardinality(images) = 1
      and active = false
  ) then
    raise exception '1.5 FAIL: actualización parcial borró campos no enviados';
  end if;

  -- Versión desactualizada combinada con parcial (0005): debe rechazarse con 45000
  -- y no modificar ningún campo, ni siquiera el que venía con valor (active).
  select version into v_version from public.products where id = 'a0000000-0000-0000-0000-000000000002';
  denied := false;
  begin
    perform public.update_product(
      'a0000000-0000-0000-0000-000000000002'::uuid, null, null, null, null,
      null, null, null, true, null, null, v_version - 1
    );
  exception when sqlstate '45000' then
    denied := true;
  end;
  if not denied then raise exception '1.5 FAIL: parcial con versión desactualizada fue aceptado'; end if;
  if not exists (
    select 1 from public.products
    where id = 'a0000000-0000-0000-0000-000000000002'
      and name = 'Nombre X'
      and featured = true
      and cardinality(images) = 1
      and active = false
  ) then
    raise exception '1.5 FAIL: rechazo por versión desactualizada modificó campos';
  end if;

  -- Acción masiva sobre producto propio: afecta 1 fila y deja auditoría
  select count(*) into v_before from public.audit_log where action = 'product.bulk_update';
  v_affected := public.bulk_update_products(array['a0000000-0000-0000-0000-000000000002'::uuid], 'activate', '{}'::jsonb);
  select count(*) into v_after from public.audit_log where action = 'product.bulk_update';
  if v_affected <> 1 then raise exception '1.5 FAIL: bulk afectó % fila(s), esperado 1', v_affected; end if;
  if v_after <> v_before + 1 then raise exception '1.5 FAIL: bulk no escribió auditoría'; end if;

  -- Mezcla de tiendas: A + producto de B -> rechazo
  denied := false;
  begin
    perform public.bulk_update_products(
      array['a0000000-0000-0000-0000-000000000002'::uuid, 'b0000000-0000-0000-0000-000000000001'::uuid],
      'activate', '{}'::jsonb);
  exception when others then
    denied := true;
  end;
  if not denied then raise exception '1.5 FAIL: bulk aceptó productos de tiendas distintas'; end if;

  -- Usuario B no puede editar producto de A
  perform public.test_set_user('22222222-2222-2222-2222-222222222222'::uuid);
  denied := false;
  begin
    perform public.update_product(
      'a0000000-0000-0000-0000-000000000001'::uuid, 'Hackeado', null, null, null,
      '[]'::jsonb, '{}'::text[], 0, true, false, false, 1
    );
  exception when others then
    denied := true;
  end;
  if not denied then raise exception '1.5 FAIL: B editó producto de A'; end if;

  perform public.test_reset_role();
end $$;

-- -----------------------------------------------------------------------------
-- 1.6 No se puede borrar la última variante activa (trigger, como admin)
-- -----------------------------------------------------------------------------

do $$
declare
  denied boolean := false;
begin
  perform public.test_reset_role();
  begin
    delete from public.variants where id = 'a1000000-0000-0000-0000-000000000003';
  exception when others then
    denied := true;
  end;
  if not denied then raise exception '1.6 FAIL: se borró la última variante activa'; end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1.7 Paginación del catálogo público (0003)
-- -----------------------------------------------------------------------------

do $$
declare
  v_page jsonb;
  v_next jsonb;
  v_expected int;
begin
  -- Conteo esperado calculado como admin (sin RLS)
  select count(*)::int into v_expected
  from public.products p
  where p.store_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    and p.active and p.deleted_at is null;
  if v_expected < 2 then
    raise exception '1.7 FAIL: fixture insuficiente (se requieren al menos 2 productos activos en A)';
  end if;

  perform public.test_set_user(null);

  -- Límite respetado y total correcto
  v_page := public.public_catalog('tienda-a', 1, 0, null);
  if (v_page->'pagination'->>'limit')::int <> 1 then
    raise exception '1.7 FAIL: limit no respetado';
  end if;
  if jsonb_array_length(v_page->'products') <> 1 then
    raise exception '1.7 FAIL: la página debería contener exactamente 1 producto';
  end if;
  if (v_page->'pagination'->>'total')::int <> v_expected then
    raise exception '1.7 FAIL: total % no coincide con el esperado %',
      v_page->'pagination'->>'total', v_expected;
  end if;
  if (v_page->'pagination'->>'has_more')::boolean is not true then
    raise exception '1.7 FAIL: has_more debería ser true con más productos que el límite';
  end if;

  -- Offset: la segunda página no repite el primer producto
  v_next := public.public_catalog('tienda-a', 1, 1, null);
  if (v_next->'products'->0->>'id') = (v_page->'products'->0->>'id') then
    raise exception '1.7 FAIL: offset no desplaza la página';
  end if;

  -- Límite acotado a 100
  v_page := public.public_catalog('tienda-a', 9999, 0, null);
  if (v_page->'pagination'->>'limit')::int <> 100 then
    raise exception '1.7 FAIL: limit no se acota a 100';
  end if;

  -- Filtro por categoría inexistente: vacío
  v_page := public.public_catalog('tienda-a', 50, 0, 'categoria-inexistente');
  if (v_page->'pagination'->>'total')::int <> 0 then
    raise exception '1.7 FAIL: filtro por categoría inexistente devuelve productos';
  end if;

  -- Conteo rápido consistente con la paginación
  if public.public_product_count('tienda-a', null) <> v_expected then
    raise exception '1.7 FAIL: public_product_count no coincide con el total paginado';
  end if;

  perform public.test_reset_role();
end $$;

-- -----------------------------------------------------------------------------
-- 1.8 RLS activo en todas las tablas de negocio y grants de RPC de escritura
-- -----------------------------------------------------------------------------

do $$
declare
  n int;
begin
  select count(*) into n
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in ('profiles','platform_members','stores','store_members',
                      'categories','tags','products','variants','store_storage',
                      'audit_log','events','plan_limits')
    and not c.relrowsecurity;
  if n <> 0 then raise exception '1.8 FAIL: % tabla(s) de negocio sin RLS', n; end if;

  -- TRUNCATE no pasa por RLS: ningún rol de petición debe tenerlo
  if has_table_privilege('authenticated', 'public.products', 'TRUNCATE')
     or has_table_privilege('anon', 'public.products', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.stores', 'TRUNCATE') then
    raise exception '1.8 FAIL: un rol de petición tiene TRUNCATE sobre tablas de negocio';
  end if;

  if has_function_privilege('anon', 'public.create_product_with_variant(uuid,text,text,text,uuid,uuid,jsonb,text[],int,jsonb,text,int,text,int,int,text)', 'EXECUTE') then
    raise exception '1.8 FAIL: anon puede ejecutar create_product_with_variant';
  end if;
  if has_function_privilege('anon', 'public.bulk_update_products(uuid[],text,jsonb)', 'EXECUTE') then
    raise exception '1.8 FAIL: anon puede ejecutar bulk_update_products';
  end if;
  if not has_function_privilege('anon', 'public.public_catalog(text,int,int,text)', 'EXECUTE') then
    raise exception '1.8 FAIL: anon no puede ejecutar public_catalog';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Limpieza de helpers de sesión
-- -----------------------------------------------------------------------------

drop function public.test_set_user(uuid);
drop function public.test_reset_role();

do $$
begin
  raise notice 'Pruebas de aislamiento completadas sin errores.';
end $$;
