# Plan: Rediseño de la página de login (AuthBlock split-screen)

## Objetivo
Reemplazar la página de login actual por un componente `AuthBlock` tipo split-screen (originUI): formulario a la izquierda y panel de marca oscuro con grid/blur a la derecha. Se conserva el flujo de autenticación real de la app.

## Decisiones
- **Auth passwordless (se mantiene)**: el formulario usa magic link por email (`signInMagicLink`) + botón "Continuar con Google" (`signInGoogle`). No se añaden contraseñas ni registro con password.
- **Elementos del snippet que se omiten** (no existen en la app): campo contraseña, "Remember me", "GitHub", "Sign up", "Forgot password".
- **Wordmark de marca**: "Catálogo" (coincide con `layout.tsx` título "Catálogo SaaS" y footer "Hecho con Catalogo"). Logo: SVG inline de 4 cuadrados rotados (del snippet). Ícono del badge: `Sparkles` de `lucide-react` (ya instalado).
- **Dependencias**: no se instala `@mynaui` ni `@mynaui/icons-react`. Se añade solo el componente `separator` de shadcn.
- **Componentes ausentes no requeridos**: `checkbox`, `field` e `icon-placeholder` no se usan; el formulario reutiliza `Label` + `Input` + `Button` existentes y muestra errores con `toast` (comportamiento actual).

## Tareas (ordenadas)
1. Crear `src/components/ui/separator.tsx` (separator estándar de shadcn: `<div>` con `shrink-0 bg-border` y orientación horizontal/vertical).
2. Crear `src/components/auth-block.tsx` (`"use client"`):
   - `section` grid `grid-cols-1 md:grid-cols-2 min-h-svh`.
   - **Columna izquierda**: título "Iniciar sesión", descripción, formulario:
     - Email (`Input` + `Label`), botón submit "Entrar" → `signInMagicLink` (mantener estado `loading` y `toast`).
     - Separador "o" (`Separator`).
     - Botón outline "Continuar con Google" con `GoogleMark` (SVG inline del snippet) → `signInGoogle` (redirección a `result.url`).
   - **Columna derecha** (`hidden md:block dark`): fondo grid (gradiente lineal 40px), blobs blur (`bg-foreground/10 blur-3xl`), logo SVG inline + wordmark "Catálogo", badge con `Sparkles` + texto, heading + párrafo (copy en español sobre catálogos para microemprendedores), footer de copyright.
3. Reemplazar `src/app/login/page.tsx` para renderizar `<AuthBlock />` (la página sigue siendo client; `AuthBlock` asume el estado). Eliminar la implementación actual basada en `Card`.
4. Mantener `signInMagicLink` / `signInGoogle` en `src/lib/actions/auth.ts` sin cambios.

## Flujo de datos
- Email → `signInMagicLink(formData)` → `toast.success(message)` o `toast.error(error)`.
- Google → `signInGoogle()` → si `result.url`, `window.location.href = result.url`; si error, `toast.error`.
- Rate limiting ya aplicado en las actions (magic link 5/min, Google 5/min).

## Casos de error / edge cases
- Email vacío o inválido: `signInMagicLink` devuelve error → toast.
- Rate limit alcanzado: toast "Demasiados intentos…".
- Google sin URL de redirección: toast error.

## Validación
- `npx tsc --noEmit` y `npm run lint` sin errores nuevos.
- Revisión manual móvil (una columna, formulario primero) y desktop (dos columnas con panel de marca a la derecha).
- Verificar que el panel oscuro derecho usa `dark` correctamente y no rompe el theme global.

## Fuera de alcance
- Autenticación con contraseña, registro con password, "olvidé mi contraseña", OAuth de GitHub.
- Instalar `@mynaui` / `@mynaui/icons-react`.
