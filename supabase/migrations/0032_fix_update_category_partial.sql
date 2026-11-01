-- ============================================================
-- Cambios parciales en categorías y etiquetas
--
-- Los formularios actualizan de uno en uno: al mostrar u ocultar una
-- categoría solo se envía `active`, al reordenar solo `position`, y al
-- cambiar el color de una etiqueta solo `color`. Las funciones exigían
-- nombre (y la etiqueta exigía además nombre siempre), así que esos casos
-- fallaban con "null value in column name ... violates not-null constraint"
-- o con "el nombre de la etiqueta debe tener entre 1 y 30 caracteres".
--
-- Ahora los campos que no llegan se conservan: el nombre mantiene el valor
-- actual y el identificador de la categoría solo se recalcula cuando se
-- renombra (como antes) o cuando se envía explícitamente.
--
-- El color de la etiqueta usa un centinela para distinguir "conservar"
-- (NULL) de "quitar" (''): así la firma se mantiene en 4 parámetros y la
-- función es compatible con la versión anterior (PostgREST resuelve por
-- nombre). NULL = conservar, '' = quitar, '#hex' = establecer.
-- ============================================================

-- ------------------------------------------------------------
-- Categorías
-- ------------------------------------------------------------

drop function if exists public.update_category(uuid, text, text, bool, int);

create or replace function public.update_category(
  p_category_id uuid,
  p_name text,
  p_slug text,
  p_active bool,
  p_position int
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_store_id uuid;
  v_role text;
  v_slug text;
  v_name text;
begin
  -- Una sola lectura: store_id, nombre actual y slug actual.
  select c.store_id, trim(c.name), c.slug into v_store_id, v_name, v_slug
  from public.categories c
  where c.id = p_category_id;

  select sm.role into v_role
  from public.store_members sm
  where sm.store_id = v_store_id and sm.user_id = v_actor;

  if v_role is distinct from 'owner' and v_role is distinct from 'editor' then
    raise exception 'no autorizado';
  end if;

  if p_name is not null and trim(p_name) <> '' then
    v_name := trim(p_name);
  end if;

  if p_slug is not null and trim(p_slug) <> '' then
    -- Normalización equivalente a normalizeSlug (src/lib/utils.ts):
    -- quitar caracteres no alfanuméricos/espacio/guion, colapsar, recortar.
    v_slug := regexp_replace(lower(trim(p_slug)), '[^a-z0-9\s-]+', '', 'g');
    v_slug := regexp_replace(v_slug, '[\s_-]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
  elsif p_name is not null and trim(p_name) <> '' then
    v_slug := regexp_replace(lower(trim(p_name)), '[^a-z0-9\s-]+', '', 'g');
    v_slug := regexp_replace(v_slug, '[\s_-]+', '-', 'g');
    v_slug := trim(both '-' from v_slug);
  end if;

  if v_slug = '' then
    raise exception 'el nombre de la categoria no es valido';
  end if;

  if exists (
    select 1 from public.categories c
    where c.store_id = v_store_id and c.slug = v_slug and c.id <> p_category_id
  ) then
    raise exception 'ya existe una categoria con ese identificador';
  end if;

  update public.categories
  set name = v_name,
      slug = v_slug,
      active = coalesce(p_active, active),
      position = coalesce(p_position, position)
  where id = p_category_id;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    v_store_id, v_actor, 'category.update', 'category', p_category_id,
    jsonb_build_object('slug', v_slug)
  );
end $$;

revoke execute on function public.update_category(uuid, text, text, bool, int) from public;
grant execute on function public.update_category(uuid, text, text, bool, int) to authenticated;

-- ------------------------------------------------------------
-- Etiquetas
-- ------------------------------------------------------------

drop function if exists public.update_tag(uuid, text, text, int);
drop function if exists public.update_tag(uuid, text, text, int, boolean);

create function public.update_tag(
  p_tag_id uuid,
  p_name text,
  p_color text,
  p_position int
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_store_id uuid;
  v_role text;
  v_name text;
  v_color text;
begin
  -- Una sola lectura: store_id, nombre actual y color actual.
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

  -- Centinela: NULL conserva el color, '' lo quita, '#hex' lo establece.
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
      position = coalesce(p_position, position)
  where id = p_tag_id;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    v_store_id, v_actor, 'tag.update', 'tag', p_tag_id,
    jsonb_build_object('name', v_name)
  );
end $$;

revoke execute on function public.update_tag(uuid, text, text, int) from public;
grant execute on function public.update_tag(uuid, text, text, int) to authenticated;
