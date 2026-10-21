-- supabase/migrations/0011_store_settings.sql
-- Ajustes de la tienda: datos, logo, publicación y enlace público (plan §2.6-2.8).
--
-- Hasta ahora solo existían create_store, publish_store y unpublish_store: el
-- vendedor no podía renombrar su tienda, cambiar su logo, su WhatsApp ni su
-- moneda una vez creado el catálogo.
--
-- Todas las escrituras van por RPC SECURITY DEFINER (plan §5.2). Solo el owner
-- puede cambiar los ajustes de la tienda; un editor puede managear el catálogo.

-- ============================================================
-- update_store: datos de la tienda
-- ============================================================

create or replace function public.update_store(
  p_store_id uuid,
  p_name text,
  p_description text,
  p_whatsapp_e164 text,
  p_currency text,
  p_secondary_currency text,
  p_fx_rate numeric
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_currency text := upper(trim(coalesce(p_currency, 'HNL')));
  v_secondary text := nullif(upper(trim(coalesce(p_secondary_currency, ''))), '');
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

  -- La tasa solo tiene sentido con una segunda moneda.
  if v_secondary is null and p_fx_rate is not null then
    raise exception 'no se puede fijar una tasa sin moneda secundaria';
  end if;

  if p_fx_rate is not null and (p_fx_rate <= 0 or p_fx_rate > 1000000) then
    raise exception 'la tasa de cambio no es valida';
  end if;

  -- El WhatsApp se guarda normalizado a E.164 (solo dígitos con prefijo +).
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
      updated_at = now()
  where id = p_store_id and deleted_at is null;

  if not found then
    raise exception 'la tienda no existe';
  end if;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    p_store_id, v_actor, 'store.update', 'store', p_store_id,
    jsonb_build_object('currency', v_currency, 'secondary_currency', v_secondary)
  );
end $$;

revoke execute on function public.update_store(uuid, text, text, text, text, text, numeric) from public;
grant execute on function public.update_store(uuid, text, text, text, text, text, numeric) to authenticated;

-- ============================================================
-- set_store_logo: logo de la tienda (o null para quitarlo)
-- ============================================================

create or replace function public.set_store_logo(
  p_store_id uuid,
  p_file_id text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
begin
  select sm.role into v_role
  from public.store_members sm
  where sm.store_id = p_store_id and sm.user_id = v_actor;

  if v_role is distinct from 'owner' then
    raise exception 'solo el dueno puede cambiar el logo de la tienda';
  end if;

  -- El archivo debe vivir en la carpeta de la tienda: si no, se podría apuntar
  -- al logo de otra tienda.
  if p_file_id is not null and p_file_id not like '%/stores/' || p_store_id::text || '/%' then
    raise exception 'el archivo no pertenece a esta tienda';
  end if;

  update public.stores
  set logo_file_id = p_file_id,
      updated_at = now()
  where id = p_store_id and deleted_at is null;

  if not found then
    raise exception 'la tienda no existe';
  end if;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    p_store_id, v_actor, 'store.logo', 'store', p_store_id,
    jsonb_build_object('file_id', p_file_id)
  );
end $$;

revoke execute on function public.set_store_logo(uuid, text) from public;
grant execute on function public.set_store_logo(uuid, text) to authenticated;

-- ============================================================
-- regenerate_store_slug: cambiar el link público
--
-- El enlace /s/{slug} puede estar ya compartido por WhatsApp: cambiarlo rompe
-- los enlaces antiguos, asi que la UI debe advertirlo.
-- ============================================================

create or replace function public.regenerate_store_slug(
  p_store_id uuid,
  p_new_slug text
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_slug text := lower(trim(p_new_slug));
begin
  select sm.role into v_role
  from public.store_members sm
  where sm.store_id = p_store_id and sm.user_id = v_actor;

  if v_role is distinct from 'owner' then
    raise exception 'solo el dueno puede cambiar el link del catalogo';
  end if;

  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'el link solo puede tener letras, numeros y guiones';
  end if;

  if v_slug in ('www', 'app', 'super', 'admin', 'api', 'assets', 'cdn', 'mail', 'staging') then
    raise exception 'ese link esta reservado';
  end if;

  if exists (select 1 from public.stores s where s.slug = v_slug and s.id <> p_store_id) then
    raise exception 'ese link ya esta en uso';
  end if;

  update public.stores
  set slug = v_slug, updated_at = now()
  where id = p_store_id and deleted_at is null;

  if not found then
    raise exception 'la tienda no existe';
  end if;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    p_store_id, v_actor, 'store.slug', 'store', p_store_id,
    jsonb_build_object('slug', v_slug)
  );

  return v_slug;
end $$;

revoke execute on function public.regenerate_store_slug(uuid, text) from public;
grant execute on function public.regenerate_store_slug(uuid, text) to authenticated;
