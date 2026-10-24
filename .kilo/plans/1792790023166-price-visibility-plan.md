# Plan: Auto-save y toasts en Ajustes

## Objetivo
Implementar guardado automático y notificaciones flotantes con Sonner exclusivamente en `src/components/store-settings-form.tsx`. Sin botón "Guardar" en las cards/secciones; los controles guardan al cambiar (selects/switches/radios) y los textos al salir (onBlur) o con debounce.

## Alcance
- Solo `StoreSettingsForm`.
- No modificar otros formularios (productos, variantes, onboarding).

## Cambios en UI
- Eliminar el botón "Guardar" de la card de redes sociales.
- Mantener botones de acción explícita: publicar/despublicar, cambiar slug, logo.
- Controles de selección (`currency`, `secondaryCurrency`, `fxRate` al confirmar, `pricingMode`, switches sociales si existieran) guardan inmediatamente en `onValueChange`/`onChange`.
- Campos de texto (`name`, `description`, `whatsapp`, enlaces sociales) guardan en `onBlur` (o debounce 600ms).
- Mostrar toast con `toast.promise()` en cada guardado: "Guardando..." → "Ajustes guardados" / error.

## Cambios en lógica
- Reemplazar `save()` manual por `persist(nextState)` que:
  - construye el payload completo a partir del estado actual + cambios,
  - llama a `updateStoreSettings(store.id, payload)`,
  - usa `toast.promise` para feedback,
  - ejecuta `router.refresh()` si éxito.
- Evitar guardados concurrentes con un flag `saving` y deshabilitar controles mientras se guarda.
- Validaciones existentes (moneda, tasa, nombre) se mantienen; si fallan, mostrar error en toast y no refrescar.

## Riesgos
- Guardados parciales: siempre enviar el estado completo para no sobrescribir con valores stale.
- Debounce en campos de texto para no saturar la API.
- Mantener `pricingMode` y `socialLinks` en el payload.

## Validación
- `npx tsc --noEmit`, `npm run lint`, tests unitarios.
- Verificación manual en móvil: toast flotante y auto-save en cada control.