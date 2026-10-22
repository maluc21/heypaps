/**
 * Proxy (middleware) — tenancy por subdominio (plan §9), sesión y cabeceras de seguridad.
 *
 * - Genera un nonce aleatorio POR PETICIÓN y lo usa en la CSP. Sin 'unsafe-inline'
 *   para scripts: solo ejecutan scripts con el nonce correcto. Requiere render dinámico
 *   (ver layout raíz con connection()).
 * - Lee el Host. Si es un subdominio de tienda (no reservado) reescribe
 *   internamente a /s/{storeSlug}{path}; la URL del navegador no cambia.
 * - Refresca la sesión de Supabase Auth y conserva las cookies refrescadas también
 *   cuando la respuesta es una reescritura.
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cached } from '@/lib/cache'

const RESERVED_SUBDOMAINS = new Set([
  'www',
  'app',
  'super',
  'admin',
  'api',
  'assets',
  'cdn',
  'mail',
  'staging',
])

const IS_DEV = process.env.NODE_ENV === 'development'

function generateNonce(): string {
  // 16 bytes aleatorios criptográficos, en base64
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function buildCsp(nonce: string): string {
  const directives = [
    "default-src 'self'",
    // strict-dynamic: los chunks cargados por un script con nonce también ejecutan.
    // unsafe-eval solo en desarrollo (React reconstruye stacks de error).
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${IS_DEV ? " 'unsafe-eval'" : ''}`,
    // Estilos sin nonce: sonner@2 inserta su <style> con document.createElement y no admite nonce.
    // Decisión documentada: la protección XSS depende de script-src (nonce estricto); una
    // inyección de CSS no ejecuta JavaScript.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://ik.imagekit.io",
    "font-src 'self' data:",
    // upload.imagekit.io: el navegador sube las fotos directo al DAM, sin pasar por Vercel.
    `connect-src 'self' https://*.supabase.co https://api.imagekit.io https://upload.imagekit.io${IS_DEV ? ' ws://localhost:* http://localhost:*' : ''}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]
  // upgrade-insecure-requests rompería http://localhost en desarrollo.
  if (!IS_DEV) directives.push('upgrade-insecure-requests')
  return directives.join('; ')
}

/**
 * ¿La tienda existe y está publicada?
 *
 * La RPC pública devuelve null si la tienda no existe, está en borrador o fue
 * suspendida: es la única superficie de lectura pública (plan §5.4).
 *
 * Se comprueba aquí, en el Proxy, y no en la página: con Partial Prerender el
 * shell HTML se envía antes de que la página resuelva, así que un notFound()
 * dentro de la página quedaría con status 200 (docs de Next: "Status codes").
 * En el Proxy el 404 es real.
 *
 * La ventana de caché es de 5 s a propósito: el Proxy y las Server Functions
 * corren en bundles separados y no comparten memoria, así que la invalidación
 * desde la acción de publicar no llega hasta aquí. Con 5 s el vendedor no ve
 * "no disponible" tras publicar.
 */
async function isStorePublished(slug: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return true

  return cached(`store-published:${slug}`, 5, async () => {
    try {
      const res = await fetch(
        `${url}/rest/v1/rpc/public_store_published?p_store_slug=${encodeURIComponent(slug)}`,
        {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        },
      )
      if (!res.ok) return true
      return (await res.json()) === true
    } catch {
      // Un fallo de red no debe tumbar el catálogo público.
      return true
    }
  })
}

/**
 * Respuesta 404 real para quien no tiene acceso al panel de plataforma.
 * Se construye en el Proxy para que el status no dependa del prerender.
 */
function platformForbidden(message: string): NextResponse {
  const res = new NextResponse(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>No encontrado</title></head><body style="font-family:system-ui;padding:2rem;text-align:center"><h1>No encontrado</h1><p>${message}</p></body></html>`,
    {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    },
  )
  res.headers.set('X-Robots-Tag', 'noindex')
  return res
}

/**
 * Respuesta 404 real del catálogo público. Sin esto, con Partial Prerender, una
 * tienda o un producto inexistente se servirian con status 200 y una pagina
 * vacia (soft 404), que un crawler indexaria como pagina valida.
 */
function notFoundResponse(
  title: string,
  message: string,
  cookieWrites: Array<{ name: string; value: string; options?: Record<string, unknown> }>,
): NextResponse {
  const res = new NextResponse(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${title}</title></head><body style="font-family:system-ui;padding:2rem;text-align:center"><h1>${title}</h1><p>${message}</p></body></html>`,
    {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    },
  )
  res.headers.set('X-Robots-Tag', 'noindex')
  for (const c of cookieWrites) {
    res.cookies.set({ name: c.name, value: c.value, ...(c.options ?? {}) })
  }
  return res
}

/**
 * ¿Existe la ficha de un producto y es visible?
 *
 * Igual que la tienda, la comprobacion va en el Proxy: con Partial Prerender
 * un notFound() en la pagina llegaria con status 200 (soft 404) y un crawler
 * lo indexaria como una pagina valida.
 */
async function isProductPublished(storeSlug: string, productSlug: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return true

  return cached(`product-published:${storeSlug}:${productSlug}`, 5, async () => {
    try {
      const res = await fetch(
        `${url}/rest/v1/rpc/public_product_published?p_store_slug=${encodeURIComponent(
          storeSlug,
        )}&p_product_slug=${encodeURIComponent(productSlug)}`,
        {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        },
      )
      if (!res.ok) return true
      return (await res.json()) === true
    } catch {
      // Un fallo de red no debe tumbar el catalogo publico.
      return true
    }
  })
}

export async function proxy(request: NextRequest) {
  const nonce = generateNonce()
  const csp = buildCsp(nonce)

  // Cabeceras de petición: el render lee x-nonce y la CSP para aplicar el nonce a sus scripts.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  // Cookies de sesión que Supabase quiere escribir; se aplican a la respuesta final.
  const cookieWrites: Array<{ name: string; value: string; options?: Record<string, unknown> }> = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: unknown) {
          cookieWrites.push({ name, value, options: options as Record<string, unknown> })
        },
        remove(name: string, options: unknown) {
          cookieWrites.push({ name, value: '', options: options as Record<string, unknown> })
        },
      },
    }
  )

  // Refrescar sesión (magic link / Google / cookie)
  const { data: { user } } = await supabase.auth.getUser()

  const host = request.headers.get('host') || ''
  const hostname = host.split(':')[0]
  const parts = hostname.split('.')

  let response = NextResponse.next({ request: { headers: requestHeaders } })
  let storeSlug: string | null = null
  let effectivePath = request.nextUrl.pathname

  // Subdominio de tienda: sub.dominio.tld (al menos 3 partes)
  if (parts.length >= 3) {
    const subdomain = parts[0]
    if (subdomain === 'super') {
      // super.dominio.tld sirve el panel de superadmin.
      const url = request.nextUrl.clone()
      url.pathname = `/super${url.pathname === '/' ? '' : url.pathname}`
      effectivePath = url.pathname
      response = NextResponse.rewrite(url, { request: { headers: requestHeaders } })
    } else if (!RESERVED_SUBDOMAINS.has(subdomain)) {
      const url = request.nextUrl.clone()
      url.pathname = `/s/${subdomain}${url.pathname}`
      storeSlug = subdomain
      effectivePath = url.pathname
      response = NextResponse.rewrite(url, { request: { headers: requestHeaders } })
    }
  }

  // Guard del superadmin: el rol se comprueba aquí y no en la página. Con
  // Partial Prerender, un notFound() en el layout llegaría con status 200;
  // en el Proxy el 404 es real (docs de Next: "Status codes").
  if (effectivePath === '/super' || effectivePath.startsWith('/super/')) {
    if (!user) {
      return platformForbidden('Necesitas iniciar sesión para entrar al panel.')
    }
    const { data: member } = await supabase
      .from('platform_members')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!member) {
      return platformForbidden('No tienes acceso al panel de plataforma.')
    }
  }

  // Catálogo público por ruta interna: /s/{slug} (útil en desarrollo y pruebas)
  if (!storeSlug) {
    const match = request.nextUrl.pathname.match(/^\/s\/([^/]+)/)
    if (match) storeSlug = decodeURIComponent(match[1])
  }

  // Tienda inexistente, en borrador o suspendida: 404 real antes de renderizar.
  if (storeSlug && !(await isStorePublished(storeSlug))) {
    return notFoundResponse(
      'Catálogo no disponible',
      'Esta tienda no existe o no está publicada.',
      cookieWrites,
    )
  }

  // Ficha de producto: /s/{tienda}/{producto}. Un producto que no existe o
  // esta oculto devuelve 404 real, no un 200 con la pagina vacia.
  // Las rutas de metadatos de Next (opengraph-image, twitter-image) no son
  // productos: el proxy no debe interceptarlas.
  const productMatch = effectivePath.match(/^\/s\/([^/]+)\/([^/]+)/)
  const productSlug = productMatch?.[2]
  if (productMatch && productSlug && !/^(opengraph|twitter)-image/.test(productSlug)) {
    const [, productStore, product] = productMatch
    if (!(await isProductPublished(productStore, product))) {
      return notFoundResponse(
        'Producto no disponible',
        'Este producto no existe o ya no está disponible.',
        cookieWrites,
      )
    }
  }

  for (const c of cookieWrites) {
    response.cookies.set({ name: c.name, value: c.value, ...(c.options ?? {}) })
  }

  // Cabeceras de seguridad base (plan §6.4)
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
