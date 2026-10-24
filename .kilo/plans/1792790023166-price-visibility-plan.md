# Plan: Visibilidad flexible de precios (global + por producto)

## Objetivo
Implementar un sistema de 3 estados globales de visibilidad de precios en la tienda (`SHOW_ALL`, `REQUEST_ALL`, `CUSTOM`) y un toggle por producto (`show_price`), con renderizado condicional en el catálogo público y CTA de "Precio a solicitud" por WhatsApp.

## Decisiones
- `pricing_mode` se guarda como columna en `stores` (default `SHOW_ALL`).
- `show_price` se guarda como columna en `products` (default `true`).
- En `CUSTOM`, el toggle por producto queda habilitado; en los otros modos se deshabilita y se muestra nota.
- Condición de renderizado de precio:
  `(store.pricing_mode === 'SHOW_ALL') || (store.pricing_mode === 'CUSTOM' && product.show_price === true)`.

## Cambios de datos (migración nueva)
1. `ALTER TABLE stores ADD COLUMN pricing_mode text NOT NULL DEFAULT 'SHOW_ALL' CHECK (pricing_mode IN ('SHOW_ALL','REQUEST_ALL','CUSTOM'));`
2. `ALTER TABLE products ADD COLUMN show_price boolean NOT NULL DEFAULT true;`
3. Actualizar RPCs:
   - `update_store`: añadir `p_pricing_mode text`; validar; guardar.
   - `update_product`: añadir `p_show_price boolean`; guardar (null = conservar).
   - `public_catalog` y `public_product`: incluir `pricing_mode` en `store` y `show_price` en `product`.
   - `create_product_with_variant`: default `show_price = true` (columna default basta).

## Backend (TypeScript)
- `src/lib/actions/store.ts`:
  - `StoreSettings.pricingMode?: string`.
  - `updateStoreSettings`: pasar `p_pricing_mode`.
  - `StoreSettingsData.pricing_mode: string`.
- `src/lib/actions/product.ts`:
  - `updateProduct`: aceptar `showPrice?: boolean`; pasar `p_show_price`.
- `src/lib/catalog.ts`:
  - `PublicStore.pricing_mode: string` (o `'SHOW_ALL'`).
  - `PublicProduct.show_price: boolean`.
- `src/app/(app)/ajustes/page.tsx`: pasar `pricing_mode` al form.
- `src/app/(app)/products/[slug]/page.tsx`: incluir `show_price` en `Product` type (select * ya lo trae).

## UI
- `src/components/store-settings-form.tsx`:
  - Estado `pricingMode`.
  - Selector de 3 opciones (RadioGroup o Select) en la card "Tu Catálogo" o nueva card "Visibilidad de precios".
  - Enviar `pricingMode` en `save`.
- `src/components/product-editor-form.tsx`:
  - Estado `showPrice` inicializado desde `product.show_price`.
  - Switch "Mostrar precio" deshabilitado si `store.pricing_mode !== 'CUSTOM'`, con nota informativa.
  - Guardar `showPrice` en `save` (cuando habilitado o siempre enviar).
- `src/components/new-product-form.tsx`:
  - Opcional: switch `show_price` (default true) solo si CUSTOM; por simplicidad enviar `true` por defecto.
- `src/components/public/product-card.tsx`:
  - Calcular `canShowPrice`.
  - Si true: mostrar precio (como hoy).
  - Si false: mostrar badge/texto "Precio a solicitud".
- `src/components/public/product-detail.tsx`:
  - Calcular `canShowPrice`.
  - Si true: mostrar precio.
  - Si false: mostrar badge "Precio a solicitud" que abre WhatsApp (reusar `WhatsAppButton` o enlace wa.me).

## Lógica de renderizado
```
const canShowPrice =
  store.pricing_mode === 'SHOW_ALL' ||
  (store.pricing_mode === 'CUSTOM' && product.show_price === true);
```

## Riesgos
- Migración debe aplicarse en Supabase antes de desplegar.
- `store.pricing_mode` puede ser null en datos antiguos; normalizar a 'SHOW_ALL' en frontend y DB default.
- Cache del catálogo: invalidar tras cambios de ajustes/producto (ya se hace).

## Validación
- `npx tsc --noEmit`, `npm run lint`, tests.
- E2E: verificar modos global y por producto en card y detalle, y CTA WhatsApp en "Precio a solicitud".
