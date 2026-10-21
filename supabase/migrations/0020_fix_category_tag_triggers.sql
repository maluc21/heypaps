-- supabase/migrations/0020_fix_category_tag_triggers.sql
-- Corrige un trigger incompatible con el esquema.
--
-- 0001_init.sql creo los triggers trg_categories_updated_at y
-- trg_tags_updated_at, pero categories y tags NO tienen columna updated_at
-- (el plan §4.2 no la contempla). El trigger BEFORE UPDATE hacia
-- "new.updated_at = now()" sobre una tabla sin esa columna, asi que CUALQUIER
-- update sobre esas tablas falla con:
--   ERROR: record "new" has no field "updated_at"
--
-- Efecto en el producto: renombrar una categoria, cambiar su slug, ocultarla,
-- reordenarla o cambiar el color de una etiqueta fallan siempre. El
-- vocabulario de la UI lo muestra como un error generico y el vendedor no
-- puede corregirlo.
--
-- La solucion es quitar los triggers sobrantes: el esquema no tiene esa
-- columna y ninguna consulta ni RPC la usa. Las demas tablas (stores,
-- products, variants, store_storage) si la tienen y conservan su trigger.

drop trigger if exists trg_categories_updated_at on public.categories;
drop trigger if exists trg_tags_updated_at on public.tags;
