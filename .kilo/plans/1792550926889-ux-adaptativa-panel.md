# Plan: UX adaptativa del panel de gestión (móvil vs escritorio)

**Archivo del plan:** `.kilo/plans/1792550926889-ux-adaptativa-panel.md`  
**Rama:** `main`  
**Proyecto:** `catalogo1` — `maluc21/heypaps`  
**Estado:** Listo para implementar

---

## Contexto actual

El panel de gestión vive en `src/app/(app)/` con estas páginas (todas Server Components):

| Ruta | Componente cliente usado |
|------|--------------------------|
| `/panel` | `Card` (layout propio) |
| `/products` | `ProductsTable` |
| `/products/[slug]` | `ProductEditorForm` + `VariantManager` |
| `/products/nuevo` | `NewProductForm` |
| `/categorias` | `CategoryManager` |
| `/etiquetas` | `TagManager` |
| `/ajustes` | `StoreSettingsForm` |

Todos los componentes cliente reciben datos vía props desde el Server Component. No hay navegación estructurada (no hay sidebar ni bottom bar); cada página renderiza sus propios `Card` centrados con `p-4`.

Ya existe en `src/components/providers.tsx` un patrón `useSyncExternalStore` para detectar móvil (`window.innerWidth < 640`) usado solo para posicionar el toaster. No hay hook de medios reutilizable aún.

---

## Decisiones de diseño

| Decisión | Valor |
|----------|-------|
| Breakpoint móvil/escritorio | `640px` (coherente con `providers.tsx`) |
| Navegación móvil | Bottom tab bar fija (`fixed bottom-0`), 5 íconos + etiqueta |
| Navegación escritorio | Sidebar permanente izquierda (`fixed left-0 top-0 h-full w-64`) |
| Layout raíz | Único `RootLayout` sin cambios; un nuevo `PanelShell` envía el contenido de cada página del panel |
| Hook de medios | Nuevo `use-mobile.tsx` en `src/lib/` usando `useSyncExternalStore` (misma técnica que `providers.tsx`) |
| Componentes UI | Reutilizar `sheet.tsx`, `dialog.tsx`, `button.tsx`, `input.tsx`, `select.tsx` existentes |
| Estrategia por página | UI condicional con clases `hidden md:flex` / `md:hidden` o componentes separados (Mobile/Desktop) cuando la estructura difiere mucho |

---

## Árbol de cambios

### 1. Hook `use-mobile` (nuevo)
**Archivo:** `src/lib/use-mobile.tsx`

Exporta `useIsMobile()` que devuelve booleano. Usa `useSyncExternalStore` con `window.innerWidth < 640`, valor inicial `false` en servidor (evita mismatch de hidratación).

### 2. Componente `PanelShell` (nuevo)
**Archivo:** `src/components/panel-shell.tsx`

Recibe `children` y renderiza:
- **Desktop (`md:flex`)**: Sidebar fijo izquierda + área de contenido con `md:ml-64`
- **Móvil (`md:hidden`)**: Contenido principal con `pb-20` (espacio para bottom tab) + BottomTabBar fija abajo

El shell decide qué navegación mostrar según `useIsMobile()`.

### 3. BottomTabBar (nuevo)
**Archivo:** `src/components/bottom-tab-bar.tsx`

Barra fija inferior con 5 destinos: Panel, Productos, Categorías, Etiquetas, Ajustes. Usa `Link` de Next.js. Activo resaltado según `pathname`. Iconos de `lucide-react`.

### 4. Sidebar (nuevo)
**Archivo:** `src/components/sidebar.tsx`

Menú lateral permanente con los mismos 5 destinos. Logo/nombre de tienda en la parte superior. Enlaces con `Link`.

### 5. Páginas del panel — cambios por página

#### `/panel` (Dashboard)
- Desktop: Dos columnas (`grid grid-cols-1 md:grid-cols-2`) con cards de resumen y enlace público.
- Móvil: Una columna (`grid-cols-1`) con cards apiladas. Bottom tab para navegación rápida.
- Componente: `src/app/(app)/panel/page.tsx` (modificar, envolver en PanelShell)

#### `/products` (Listado de productos)
- Desktop: `ProductsTable` tal cual (tabla de datos).
- Móvil: Nuevo `ProductListMobile` — lista de tarjetas compactas con botones grandes (toggle activar/desactivar, editar).
- Componente: `src/app/(app)/products/page.tsx` (envolver en PanelShell), `src/components/product-list-mobile.tsx` (nuevo)

#### `/products/[slug]` (Editor de producto)
- Desktop: `ProductEditorForm` + `VariantManager` en pantalla completa (como ahora).
- Móvil: `ProductEditorForm` dentro de `Sheet` (lateral derecho) o pantalla completa con navegación de vuelta. `VariantManager` apilado verticalmente.
- Componente: `src/app/(app)/products/[slug]/page.tsx` (envolver en PanelShell, condicional Sheet vs full)

#### `/products/nuevo` (Nuevo producto)
- Desktop: `NewProductForm` en página completa.
- Móvil: `NewProductForm` dentro de `Sheet` (lateral derecho) o pantalla completa.
- Componente: `src/app/(app)/products/nuevo/page.tsx` (envolver en PanelShell, condicional)

#### `/categorias` (Categorías)
- Desktop: `CategoryManager` tal cual (tabla/lista).
- Móvil: `CategoryManager` con filas más grandes y botones táctiles.
- Componente: `src/app/(app)/categorias/page.tsx` (envolver en PanelShell)

#### `/etiquetas` (Etiquetas)
- Desktop: `TagManager` tal cual.
- Móvil: `TagManager` con filas táctiles.
- Componente: `src/app/(app)/etiquetas/page.tsx` (envolver en PanelShell)

#### `/ajustes` (Configuración)
- Desktop: `StoreSettingsForm` en grid de dos columnas.
- Móvil: `StoreSettingsForm` en columna única, campos apilados.
- Componente: `src/app/(app)/ajustes/page.tsx` (envolver en PanelShell)

### 6. Componentes existentes a ajustar
- `src/components/products-table.tsx`: Añadir `className` responsivas (`text-xs` en móvil, `text-sm` en desktop), botones de acción más grandes en móvil.
- `src/components/product-editor-form.tsx`: `max-w-xl` → `max-w-full` en móvil, `p-4` → `p-2` en móvil.
- `src/components/new-product-form.tsx`: Misma lógica de responsividad.
- `src/components/category-manager.tsx` y `src/components/tag-manager.tsx`: Filas táctiles en móvil (`min-h-[44px]`).

---

## Reglas de implementación

1. **Rutas únicas:** No se duplican páginas. Una sola ruta renderiza UI condicional.
2. **Misma lógica, misma data:** Los componentes Mobile/Desktop reciben exactamente las mismas props que los componentes cliente actuales.
3. **No romper el catálogo público:** Los cambios son solo en el panel (`/app/(app)/*`), no en `/s/[slug]` ni en `/login` ni en `/onboarding`.
4. **Hidratación segura:** Cualquier detección de pantalla usa `useSyncExternalStore` con valor inicial `false` (como en `providers.tsx`).
5. **Tailwind clases:** Usar `md:flex`/`md:hidden` para cambios menores; componentes separados (Mobile/Desktop) para cambios estructurales grandes.

---

## Lista de tareas de implementación

1. [ ] Crear `src/lib/use-mobile.tsx` con `useIsMobile()`
2. [ ] Crear `src/components/panel-shell.tsx` (Sidebar + BottomTabBar + layout)
3. [ ] Crear `src/components/sidebar.tsx`
4. [ ] Crear `src/components/bottom-tab-bar.tsx`
5. [ ] Crear `src/components/product-list-mobile.tsx` (tarjetas para móvil)
6. [ ] Modificar `src/app/(app)/panel/page.tsx` — envolver en PanelShell, grid responsivo
7. [ ] Modificar `src/app/(app)/products/page.tsx` — envolver en PanelShell, condicional ProductsTable/ProductListMobile
8. [ ] Modificar `src/app/(app)/products/[slug]/page.tsx` — envolver en PanelShell, Sheet vs full en móvil
9. [ ] Modificar `src/app/(app)/products/nuevo/page.tsx` — envolver en PanelShell, Sheet vs full en móvil
10. [ ] Modificar `src/app/(app)/categorias/page.tsx` — envolver en PanelShell
11. [ ] Modificar `src/app/(app)/etiquetas/page.tsx` — envolver en PanelShell
12. [ ] Modificar `src/app/(app)/ajustes/page.tsx` — envolver en PanelShell, grid responsivo
13. [ ] Ajustar `src/components/products-table.tsx` para móvil (texto más pequeño, botones táctiles)
14. [ ] Ajustar `src/components/product-editor-form.tsx` para móvil (ancho completo)
15. [ ] Ajustar `src/components/new-product-form.tsx` para móvil (ancho completo)
16. [ ] Ejecutar `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`

---

## Validación

- `pnpm tsc --noEmit` sin errores de tipos.
- `pnpm lint` sin errores nuevos (warning preexistente en `tests/e2e/panel.e2e.mjs` es aceptable).
- `pnpm build` exitoso.
- Navegación en móvil (viewport 390×844): bottom tab visible, sidebar oculto, tarjetas de producto apiladas.
- Navegación en escritorio (viewport 1280×800): sidebar visible, bottom tab oculto, tabla de productos.
- Las mismas rutas funcionan en ambos dispositivos sin duplicar lógica de negocio.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Mismatch de hidratación al detectar móvil | `useSyncExternalStore` con valor inicial `false` (técnica ya probada en `providers.tsx`) |
| Bottom tab tapa contenido en móvil | `pb-20` en el contenedor principal del shell móvil |
| Sidebar rompe layout en páginas existentes | `PanelShell` solo se usa en rutas del panel, no afecta `/login`, `/onboarding`, `/s/[slug]` |
| Demasiados cambios en una sola página | Implementar página por página, verificar build después de cada una |

---

## Notas

- El `use-mobile.tsx` usa el mismo breakpoint (640px) que `providers.tsx` para consistencia.
- Los iconos del bottom tab y sidebar usan `lucide-react` (ya es dependencia del proyecto, usado en `sheet.tsx` y `dialog.tsx`).
- `Next/Link` se usa para navegación interna (no etiquetas `<a>`, por la restricción de routing interna del proyecto).