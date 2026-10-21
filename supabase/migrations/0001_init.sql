-- Catálogo SaaS multitienda — migración inicial
-- Seguridad y desempeño desde la base (plan fundacional §4, §5, §6)
-- Extensiones

create extension if not exists pgcrypto;

-- ============================================================
-- 4.1 Identidad y tenancy
-- plan_limits primero (stores le referencia por FK)
-- ============================================================

create table public.plan_limits (
  plan_code text primary key,
  max_products int not null,
  max_images_per_product int not null,
  max_storage_bytes bigint not null,
  custom_domain bool not null default false,
  remove_brand bool not null default false
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.platform_members (
  user_id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('superadmin','support')),
  created_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  logo_file_id text,
  whatsapp_e164 text,
  currency char(3) not null default 'HNL',
  secondary_currency char(3),
  fx_rate numeric(12,4),
  plan_code text not null default 'free' references public.plan_limits(plan_code),
  status text not null default 'draft' check (status in ('draft','published','suspended')),
  custom_domain text,
  appearance jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.store_members (
  store_id uuid not null references public.stores on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

-- ============================================================
-- 4.2 Catálogo
-- ============================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores on delete cascade,
  name text not null,
  slug text not null,
  position int not null default 0,
  active bool not null default true,
  unique (store_id, slug)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores on delete cascade,
  name text not null,
  color text,
  position int not null default 0,
  unique (store_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores on delete cascade,
  slug text not null,
  name text not null,
  description text,
  category_id uuid references public.categories on delete set null,
  tag_id uuid references public.tags on delete set null,
  attributes jsonb not null default '[]',
  images text[] not null default '{}',
  active bool not null default true,
  featured bool not null default false,
  paused bool not null default false,
  position int not null default 0,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (store_id, slug)
);

create table public.variants (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores on delete cascade,
  product_id uuid not null references public.products on delete cascade,
  attributes jsonb not null default '{}',
  sku text,
  price_cents int not null check (price_cents > 0),
  discount_type text not null default 'none' check (discount_type in ('none','percent','fixed')),
  discount_value int not null default 0 check (discount_value >= 0),
  final_price_cents int generated always as (
    greatest(0, case discount_type
      when 'percent' then price_cents - ((price_cents * discount_value + 50) / 100)
      when 'fixed'   then price_cents - discount_value
      else price_cents end)
  ) stored,
  stock int,
  image_file_id text,
  active bool not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_type <> 'percent' or discount_value <= 100),
  check (discount_type <> 'fixed'   or discount_value < price_cents)
);

-- ============================================================
-- 4.3 Cuota, auditoría, analítica
-- ============================================================

create table public.store_storage (
  store_id uuid primary key references public.stores on delete cascade,
  bytes_used bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigserial primary key,
  store_id uuid,
  actor_user_id uuid,
  action text not null,
  entity text,
  entity_id uuid,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table public.events (
  id bigserial primary key,
  store_id uuid not null references public.stores on delete cascade,
  product_id uuid references public.products on delete cascade,
  kind text not null check (kind in ('view','wa_click')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- Índices obligatorios en toda columna usada por política (§5.2)
-- ============================================================

create index idx_stores_slug on public.stores(slug);
create index idx_stores_status on public.stores(status);
create index idx_store_members_user_id on public.store_members(user_id);
create index idx_store_members_store_id on public.store_members(store_id);
create index idx_categories_store_id on public.categories(store_id);
create index idx_tags_store_id on public.tags(store_id);
create index idx_products_store_id on public.products(store_id);
create index idx_products_store_slug on public.products(store_id, slug);
create index idx_variants_store_id on public.variants(store_id);
create index idx_variants_product_id on public.variants(product_id);
create index idx_events_store_id on public.events(store_id);
create index idx_store_storage_store_id on public.store_storage(store_id);
create index idx_audit_log_store_id on public.audit_log(store_id);
create index idx_profiles_id on public.profiles(id);

-- ============================================================
-- Trigger updated_at (tablas con columna updated_at)
-- ============================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_stores_updated_at
  before update on public.stores for each row execute function public.set_updated_at();
create trigger trg_products_updated_at
  before update on public.products for each row execute function public.set_updated_at();
create trigger trg_variants_updated_at
  before update on public.variants for each row execute function public.set_updated_at();
create trigger trg_categories_updated_at
  before update on public.categories for each row execute function public.set_updated_at();
create trigger trg_tags_updated_at
  before update on public.tags for each row execute function public.set_updated_at();
create trigger trg_store_storage_updated_at
  before update on public.store_storage for each row execute function public.set_updated_at();

-- ============================================================
-- 5.3 Trigger: sync_variant_store_id (store_id no falsificable)
-- ============================================================

create or replace function public.sync_variant_store_id()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select p.store_id into new.store_id
  from public.products p
  where p.id = new.product_id and p.deleted_at is null;
  if new.store_id is null then
    raise exception 'producto inexistente o no visible';
  end if;
  return new;
end $$;

create trigger t_variants_store_id
  before insert or update of product_id on public.variants
  for each row execute function public.sync_variant_store_id();

-- Trigger: no borrar la última variante activa de un producto
create or replace function public.variants_last_one_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  remaining int;
begin
  select count(*) into remaining
  from public.variants v
  where v.product_id = old.product_id
    and v.active
    and v.id <> old.id;
  if remaining = 0 then
    raise exception 'no se puede borrar la última variante activa del producto';
  end if;
  return old;
end $$;

create trigger t_variants_last_one_guard
  before delete on public.variants
  for each row execute function public.variants_last_one_guard();

-- ============================================================
-- Helper: derivación de estatus (usada por las RPC públicas)
-- ============================================================

create or replace function public.derive_status(p_product_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when not exists (
      select 1 from public.products p
      where p.id = p_product_id and p.active and p.deleted_at is null
    ) then 'Oculto'
    when exists (
      select 1 from public.products p
      where p.id = p_product_id and p.paused
    ) then 'Pausado'
    when not exists (
      select 1 from public.variants v
      where v.product_id = p_product_id and v.active
        and (v.stock > 0 or v.stock is null)
    ) then 'Agotado'
    when not exists (
      select 1 from public.variants v
      where v.product_id = p_product_id and v.active and v.stock is null
    ) then 'Por encargo'
    else 'Disponible'
  end
$$;

-- ============================================================
-- 5.2 Helpers SECURITY DEFINER (elevan auth.uid() a InitPlan)
-- ============================================================

create or replace function public.current_user_store_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select sm.store_id from public.store_members sm where sm.user_id = (select auth.uid())
$$;

create or replace function public.current_user_platform_role()
returns text language sql stable security definer set search_path = '' as $$
  select pm.role from public.platform_members pm where pm.user_id = (select auth.uid())
$$;

-- ============================================================
-- RLS: habilitar en tablas de negocio
-- ============================================================

alter table public.profiles enable row level security;
alter table public.platform_members enable row level security;
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.products enable row level security;
alter table public.variants enable row level security;
alter table public.store_storage enable row level security;
alter table public.audit_log enable row level security;
alter table public.events enable row level security;
alter table public.plan_limits enable row level security;

-- Políticas de lectura (TO authenticated explícito; anon queda fuera sin coste)

create policy profiles_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy platform_members_own on public.platform_members
  for select to authenticated
  using (user_id = auth.uid());

create policy stores_member on public.stores
  for select to authenticated
  using (id = any (select public.current_user_store_ids()));

create policy store_members_member on public.store_members
  for select to authenticated
  using (store_id = any (select public.current_user_store_ids()));

create policy categories_member on public.categories
  for select to authenticated
  using (store_id = any (select public.current_user_store_ids()));

create policy tags_member on public.tags
  for select to authenticated
  using (store_id = any (select public.current_user_store_ids()));

create policy products_member on public.products
  for select to authenticated
  using (store_id = any (select public.current_user_store_ids()));

create policy variants_member on public.variants
  for select to authenticated
  using (store_id = any (select public.current_user_store_ids()));

create policy store_storage_member on public.store_storage
  for select to authenticated
  using (store_id = any (select public.current_user_store_ids()));

create policy audit_log_member on public.audit_log
  for select to authenticated
  using (store_id = any (select public.current_user_store_ids()));

create policy events_member on public.events
  for select to authenticated
  using (store_id = any (select public.current_user_store_ids()));

create policy plan_limits_read on public.plan_limits
  for select to authenticated
  using (true);

-- Sin políticas de escritura en tablas base para el cliente:
-- altas y cambios pasan por RPCs SECURITY DEFINER (§5.5).
-- anon no tiene políticas sobre las tablas base.

-- ============================================================
-- 5.4 RPCs públicas de lectura (única superficie pública)
-- ============================================================

create or replace function public.public_catalog(p_store_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'store', jsonb_build_object(
      'name', s.name, 'logo', s.logo_file_id,
      'whatsapp', s.whatsapp_e164, 'currency', s.currency,
      'secondary_currency', s.secondary_currency,
      'fx_rate', s.fx_rate, 'appearance', s.appearance
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
        'id', p.id, 'slug', p.slug, 'name', p.name, 'description', p.description,
        'images', p.images, 'tag', tg.name, 'tag_color', tg.color,
        'category', cat.slug, 'status', public.derive_status(p.id),
        'price_from', (
          select min(v.final_price_cents)
          from public.variants v
          where v.product_id = p.id and v.active
        )
      ) order by p.featured desc, p.position), '[]'::jsonb)
      from public.products p
      left join public.categories cat on cat.id = p.category_id
      left join public.tags tg on tg.id = p.tag_id
      where p.store_id = s.id and p.active and p.deleted_at is null
    )
  )
  from public.stores s
  where s.slug = p_store_slug
    and s.status = 'published'
    and s.deleted_at is null
$$;

revoke execute on function public.public_catalog(text) from public;
grant execute on function public.public_catalog(text) to anon, authenticated;

create or replace function public.public_product(p_store_slug text, p_product_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'store', jsonb_build_object(
      'name', s.name, 'logo', s.logo_file_id,
      'whatsapp', s.whatsapp_e164, 'currency', s.currency
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

-- Evento público: clic en WhatsApp desde el catálogo (anon puede registrarlo)
create or replace function public.record_event(p_store_id uuid, p_product_id uuid, p_kind text)
returns void language plpgsql stable security definer set search_path = '' as $$
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
-- 5.5 RPCs de escritura (transaccionales + auditadas)
-- ============================================================

-- Crear producto + primera variante atómicamente; valida plan y slug
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

  select pl.max_products, pl.max_images_per_product
  into v_max_products, v_max_images
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

-- Actualizar producto con control de concurrencia optimista (version)
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

  update public.products
  set name = p_name,
      description = p_description,
      category_id = p_category_id,
      tag_id = p_tag_id,
      attributes = p_attributes,
      images = p_images,
      position = p_position,
      active = p_active,
      paused = p_paused,
      featured = p_featured,
      updated_at = now(),
      version = version + 1
  where id = p_product_id
    and version = p_expected_version;

  get diagnostics v_affected = row_count;

  if v_affected = 0 then
    raise exception 'conflicto: el producto cambió en otra pestaña, recargar' using errcode = '45000';
  end if;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    v_store_id, v_actor, 'product.update', 'product', p_product_id, null
  );
end $$;

revoke execute on function public.update_product(
  uuid, text, text, uuid, uuid, jsonb, text[], int, bool, bool, bool, int
) from public;
grant execute on function public.update_product(
  uuid, text, text, uuid, uuid, jsonb, text[], int, bool, bool, bool, int
) to authenticated;

-- Acciones masivas transacionales + auditoría
create or replace function public.bulk_update_products(
  p_ids uuid[],
  p_action text,
  p_payload jsonb
)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_store_id uuid;
  v_affected int;
begin
  select p.store_id into v_store_id
  from public.products p
  where p.id = p_ids[1]
  limit 1;

  if not exists (
    select 1 from public.store_members sm
    where sm.store_id = v_store_id
      and sm.user_id = v_actor
      and sm.role in ('owner', 'editor')
  ) then
    raise exception 'no autorizado';
  end if;

  if exists (
    select 1 from public.products p
    where p.id = any (p_ids) and p.store_id <> v_store_id
  ) then
    raise exception 'los productos pertenecen a tiendas distintas';
  end if;

  case p_action
    when 'activate' then
      update public.products
      set active = true, updated_at = now(), version = version + 1
      where id = any (p_ids) and store_id = v_store_id;
    when 'deactivate' then
      update public.products
      set active = false, updated_at = now(), version = version + 1
      where id = any (p_ids) and store_id = v_store_id;
    when 'pause' then
      update public.products
      set paused = true, updated_at = now(), version = version + 1
      where id = any (p_ids) and store_id = v_store_id;
    when 'resume' then
      update public.products
      set paused = false, updated_at = now(), version = version + 1
      where id = any (p_ids) and store_id = v_store_id;
    when 'change_category' then
      update public.products
      set category_id = (p_payload->>'category_id')::uuid,
          updated_at = now(), version = version + 1
      where id = any (p_ids) and store_id = v_store_id;
    when 'change_tag' then
      update public.products
      set tag_id = (p_payload->>'tag_id')::uuid,
          updated_at = now(), version = version + 1
      where id = any (p_ids) and store_id = v_store_id;
    when 'apply_discount_percent' then
      update public.variants v
      set discount_type = 'percent',
          discount_value = (p_payload->>'percent')::int,
          updated_at = now()
      from public.products p
      where v.product_id = p.id
        and p.store_id = v_store_id
        and p.id = any (p_ids)
        and v.active;
    when 'archive' then
      update public.products
      set active = false, deleted_at = now(), updated_at = now(), version = version + 1
      where id = any (p_ids) and store_id = v_store_id;
    else
      raise exception 'acción de actualización masiva desconocida';
  end case;

  get diagnostics v_affected = row_count;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    v_store_id, v_actor, 'product.bulk_update', 'product', null,
    jsonb_build_object('action', p_action, 'count', v_affected, 'ids', p_ids)
  );

  return v_affected;
end $$;

revoke execute on function public.bulk_update_products(uuid[], text, jsonb) from public;
grant execute on function public.bulk_update_products(uuid[], text, jsonb) to authenticated;

-- Invitar miembro a la tienda (rol validado contra la matriz §5.1)
create or replace function public.invite_member(
  p_store_id uuid,
  p_email text,
  p_role text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_invited_user_id uuid;
begin
  if not exists (
    select 1 from public.store_members sm
    where sm.store_id = p_store_id
      and sm.user_id = v_actor
      and sm.role = 'owner'
  ) then
    raise exception 'solo el owner puede invitar miembros';
  end if;

  if p_role not in ('owner', 'editor', 'viewer') then
    raise exception 'rol no válido';
  end if;

  select id into v_invited_user_id
  from auth.users
  where raw_user_meta_data->>'email' = p_email
     or email = p_email
  limit 1;

  if v_invited_user_id is null then
    raise exception 'el usuario invitado aún no se ha registrado (magic link o Google)';
  end if;

  insert into public.store_members (store_id, user_id, role)
  values (p_store_id, v_invited_user_id, p_role)
  on conflict (store_id, user_id) do update set role = excluded.role;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    p_store_id, v_actor, 'member.invite', 'store_members', v_invited_user_id,
    jsonb_build_object('email', p_email, 'role', p_role)
  );
end $$;

revoke execute on function public.invite_member(uuid, text, text) from public;
grant execute on function public.invite_member(uuid, text, text) to authenticated;

-- Soft delete de tienda + marca de purga de ImageKit
create or replace function public.delete_store(p_store_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.store_members sm
    where sm.store_id = p_store_id
      and sm.user_id = v_actor
      and sm.role = 'owner'
  ) then
    raise exception 'solo el owner puede eliminar la tienda';
  end if;

  update public.stores
  set status = 'suspended', deleted_at = now(), updated_at = now()
  where id = p_store_id;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    p_store_id, v_actor, 'store.delete', 'store', p_store_id, null
  );
end $$;

revoke execute on function public.delete_store(uuid) from public;
grant execute on function public.delete_store(uuid) to authenticated;

-- ============================================================
-- 0.7 Seed: plan_limits
-- ============================================================

insert into public.plan_limits (plan_code, max_products, max_images_per_product, max_storage_bytes, custom_domain, remove_brand)
values
  ('free', 30, 5, 40 * 1024 * 1024, false, false),
  ('pro', 200, 8, 500 * 1024 * 1024, true, true)
on conflict (plan_code) do nothing;

-- El primer superadmin se añade tras el primer registro (0.2/0.7):
-- insert into public.platform_members (user_id, role) values ('<uid>', 'superadmin');
