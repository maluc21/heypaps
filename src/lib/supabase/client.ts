/**
 * Supabase cliente de navegador.
 * Usado para lecturas del panel (rápido, cacheado por el navegador, protegido por RLS).
 * Escrituras van por Server Actions.
 */

import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr'
import { getEnv } from '@/lib/env'

export function createBrowserClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getEnv()
  return createSupabaseBrowserClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}
