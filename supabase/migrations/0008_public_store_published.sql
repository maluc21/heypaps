-- supabase/migrations/0008_public_store_published.sql
-- Comprobación ligera de publicación para el Proxy.
--
-- El Proxy necesita saber si una tienda existe y está publicada ANTES de
-- renderizar la página: con Partial Prerender, un notFound() dentro de la página
-- llegaría con status 200 porque el shell HTML ya se envió (docs de Next,
-- "Status codes"). Por eso la comprobación va en el Proxy.
--
-- public_catalog servía para eso, pero serializa tienda, categorías, etiquetas y
-- productos. Esta RPC devuelve un booleano y nada más.

create or replace function public.public_store_published(p_store_slug text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.stores s
    where s.slug = p_store_slug
      and s.status = 'published'
      and s.deleted_at is null
  )
$$;

revoke execute on function public.public_store_published(text) from public;
grant execute on function public.public_store_published(text) to anon, authenticated;
