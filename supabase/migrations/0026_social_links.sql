-- supabase/migrations/0026_social_links.sql
-- Añade soporte para enlaces sociales en la tabla stores (plan §2.9).
-- Usa la columna appearance (jsonb) para almacenar socialLinks.

-- ============================================================
-- update_store: añade p_social_links para guardar redes sociales
-- ============================================================

create or replace function public.update_store(
  p_store_id uuid,
  p_name text,
  p_description text,
  p_whatsapp_e164 text,
  p_currency text,
  p_secondary_currency text,
  p_fx_rate numeric,
  p_social_links jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_currency text := upper(trim(coalesce(p_currency, 'HNL')));
  v_secondary text := nullif(upper(trim(coalesce(p_secondary_currency, ''))), '');
  v_appearance jsonb := coalesce((select appearance from public.stores where id = p_store_id), '{}'::jsonb);
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

  -- Actualizar appearance con socialLinks si se proporciona
  if p_social_links is not null then
    v_appearance := jsonb_set(v_appearance, '{socialLinks}', p_social_links, true);
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
      appearance = v_appearance,
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
      'social_links', p_social_links
    )
  );
end $$;

revoke execute on function public.update_store(uuid, text, text, text, text, text, numeric, jsonb) from public;
grant execute on function public.update_store(uuid, text, text, text, text, text, numeric, jsonb) to authenticated;