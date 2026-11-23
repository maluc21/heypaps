-- Las etiquetas pueden ocultarse del catálogo público sin desvincularlas
-- de los productos que ya las tienen asignadas.

alter table public.tags
  add column active boolean not null default true;

drop function public.update_tag(uuid, text, text, int);

create function public.update_tag(
  p_tag_id uuid,
  p_name text,
  p_color text,
  p_position int,
  p_active boolean default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_store_id uuid;
  v_role text;
  v_name text;
  v_color text;
begin
  select t.store_id, trim(t.name), t.color into v_store_id, v_name, v_color
  from public.tags t
  where t.id = p_tag_id;

  select sm.role into v_role
  from public.store_members sm
  where sm.store_id = v_store_id and sm.user_id = v_actor;

  if v_role is distinct from 'owner' and v_role is distinct from 'editor' then
    raise exception 'no autorizado';
  end if;

  if p_name is not null then
    if length(trim(p_name)) < 1 or length(trim(p_name)) > 30 then
      raise exception 'el nombre de la etiqueta debe tener entre 1 y 30 caracteres';
    end if;
    v_name := trim(p_name);
  end if;

  if p_color is not null then
    if p_color <> '' and p_color !~ '^#[0-9a-fA-F]{6}$' then
      raise exception 'el color debe estar en formato hexadecimal (#rrggbb)';
    end if;
    v_color := nullif(p_color, '');
  end if;

  if exists (
    select 1 from public.tags t
    where t.store_id = v_store_id
      and lower(t.name) = lower(v_name)
      and t.id <> p_tag_id
  ) then
    raise exception 'ya existe una etiqueta con ese nombre';
  end if;

  update public.tags
  set name = v_name,
      color = v_color,
      position = coalesce(p_position, position),
      active = coalesce(p_active, active)
  where id = p_tag_id;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    v_store_id, v_actor, 'tag.update', 'tag', p_tag_id,
    jsonb_build_object('name', v_name)
  );
end $$;

revoke execute on function public.update_tag(uuid, text, text, int, boolean) from public;
grant execute on function public.update_tag(uuid, text, text, int, boolean) to authenticated;

create or replace function public.public_catalog(
  p_store_slug text,
  p_limit int default 50,
  p_offset int default 0,
  p_category_slug text default null,
  p_tag_slug text default null
)
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
      where t.store_id = s.id and t.active
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
        left join public.tags tg on p.tag_id = tg.id and tg.active
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
      left join public.tags tg on tg.id = p.tag_id and tg.active
    ),
    'pagination', jsonb_build_object(
      'total', (
        select count(*)
        from public.products p
        left join public.categories cat on cat.id = p.category_id
        left join public.tags tg on tg.id = p.tag_id and tg.active
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
         left join public.tags tg on tg.id = p.tag_id and tg.active
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
