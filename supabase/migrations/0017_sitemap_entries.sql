-- supabase/migrations/0017_sitemap_entries.sql
-- Entradas publicas del sitemap.
--
-- El sitemap necesita listar las tiendas publicadas y sus productos activos.
-- Se expone por RPC publica (la unica superficie de lectura, plan §5.4) y
-- devuelve SOLO datos que ya son publicos: slug, nombre y fecha de
-- actualizacion. No expone ids internos, whatsapp, ni datos de tiendas en
-- borrador o suspendidas.

create or replace function public.public_sitemap_entries()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'stores', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'slug', s.slug,
          'name', s.name,
          'updated_at', s.updated_at,
          'products', (
            select coalesce(jsonb_agg(
              jsonb_build_object('slug', p.slug, 'updated_at', p.updated_at)
              order by p.position, p.id
            ), '[]'::jsonb)
            from public.products p
            where p.store_id = s.id
              and p.active
              and p.deleted_at is null
          )
        )
        order by s.slug
      ), '[]'::jsonb)
      from public.stores s
      where s.status = 'published'
        and s.deleted_at is null
    )
  )
$$;

revoke execute on function public.public_sitemap_entries() from public;
grant execute on function public.public_sitemap_entries() to anon, authenticated;
