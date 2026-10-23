-- supabase/migrations/0002_onboarding.sql
-- Onboarding: creación de tienda + primer producto.
-- Escrituras vía RPCs SECURITY DEFINER (plan §5.2, §5.5).

create or replace function public.create_store(
  p_slug text,
  p_name text,
  p_description text,
  p_whatsapp_e164 text,
  p_currency char(3),
  p_appearance jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_store_id uuid;
  v_actor uuid := (select auth.uid());
  v_exists bool;
  v_profile bool;
begin
  if v_actor is null then
    raise exception 'usuario no autenticado';
  end if;

  -- slug reservado o en uso
  select exists (
    select 1 from public.stores s where s.slug = p_slug
  ) into v_exists;
  if v_exists then
    raise exception 'el slug ya esta en uso';
  end if;

  if lower(p_slug) in ('www','app','super','admin','api','assets','cdn','mail','staging') then
    raise exception 'slug reservado';
  end if;

  -- el usuario no puede ser owner de dos tiendas (simplificacion v1)
  select exists (
    select 1 from public.store_members sm
    where sm.user_id = v_actor and sm.role = 'owner'
  ) into v_exists;
  if v_exists then
    raise exception 'el usuario ya es dueño de una tienda';
  end if;

  insert into public.stores (slug, name, description, whatsapp_e164, currency, status, appearance)
  values (p_slug, p_name, p_description, p_whatsapp_e164, p_currency, 'draft', p_appearance)
  returning id into v_store_id;

  insert into public.store_members (store_id, user_id, role)
  values (v_store_id, v_actor, 'owner');

  -- perfil si no existe
  select exists (select 1 from public.profiles p where p.id = v_actor) into v_profile;
  if not v_profile then
    insert into public.profiles (id, full_name) values (v_actor, p_name);
  end if;

  insert into public.audit_log (
    store_id, actor_user_id, action, entity, entity_id, meta
  ) values (
    v_store_id, v_actor, 'store.create', 'store', v_store_id,
    jsonb_build_object('slug', p_slug)
  );

  return v_store_id;
end $$;

revoke execute on function public.create_store(
  text, text, text, text, char(3), jsonb
) from public;
grant execute on function public.create_store(
  text, text, text, text, char(3), jsonb
) to authenticated;

-- Índice para validación rápida de slug
create index if not exists idx_stores_slug_lower on public.stores(lower(slug));
