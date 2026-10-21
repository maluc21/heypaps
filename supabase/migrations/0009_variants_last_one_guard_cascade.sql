-- supabase/migrations/0009_variants_last_one_guard_cascade.sql
-- Corrige el guard de "última variante" para que no bloquee el borrado en cascada.
--
-- Hallazgo: el trigger BEFORE DELETE sobre variants rechazaba siempre el borrado
-- de la última variante activa, incluso cuando el producto padre se estaba
-- borrando por ON DELETE CASCADE. Efecto: era imposible borrar una tienda con
-- productos (el cascade stores -> products -> variants reventaba el trigger).
-- El cleanup de pruebas lo sorteaba con session_replication_role = replica.
--
-- Ahora el guard solo aplica al borrado explícito: si el producto padre ya no
-- existe, la variante se va con él.

create or replace function public.variants_last_one_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  remaining int;
begin
  -- Borrado en cascada: el producto padre ya no existe, la variante se va con él.
  if not exists (
    select 1 from public.products p where p.id = old.product_id
  ) then
    return old;
  end if;

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
