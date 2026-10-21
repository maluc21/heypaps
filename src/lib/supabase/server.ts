/**
 * Supabase client de servidor (App Router).
 * Lee/escribe sesión vía cookies httpOnly (@supabase/ssr).
 * service_role NO se usa en la aplicación (plan §5.2).
 */

import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getEnv } from '@/lib/env'

export async function createServerClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getEnv()
  const cookieStore = await cookies()
  return createSupabaseServerClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: unknown) {
          try {
            cookieStore.set({ name, value, ...(options as Record<string, unknown>) })
          } catch {
            // El servidor de respuesta ya se envió; ignorar en render de solo lectura
          }
        },
        remove(name: string, options: unknown) {
          try {
            cookieStore.set({ name, value: '', ...(options as Record<string, unknown>) })
          } catch {
            // idem
          }
        },
      },
    }
  )
}
