-- supabase/migrations/0023_public_product_published.sql
-- Comprobación ligera de la ficha de producto, para el Proxy.
--
-- La pagina /s/{tienda}/{producto} devuelve notFound() cuando el producto no
-- existe. Con Partial Prerender, el shell HTML se envia antes de que la pagina
-- resuelva, asi que el status llega como 200 con la pagina vacia (soft 404):
-- un crawler lo indexaria como una pagina valida.
--
-- Igual que en el catalogo, la comprobacion va en el Proxy (docs de Next,
-- "Status codes"): alli el 404 es real. Esta RPC es la version ligera de
-- public_product: devuelve un booleano y no carga variantes ni imagenes.

create or replace function public.public_product_published(
  p_store_slug text,
  p_product_slug text
)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.stores s
    join public.products p on p.store_id = s.id
    where s.slug = p_store_slug
      and s.status = 'published'
      and s.deleted_at is null
      and p.slug = p_product_slug
      and p.active
      and p.deleted_at is null
  )
$$;

revoke execute on function public.public_product_published(text, text) from public;
grant execute on function public.public_product_published(text, text) to anon, authenticated;
