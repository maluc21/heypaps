/**
 * Supabase cliente administrativo (service_role).
 *
 * ATENCIÓN: el plan fundacional (§5.2) establece que service_role NO se usa en la
 * aplicación. Este cliente existe únicamente para scripts de semillado/tooling fuera
 * del runtime de la app. No importar este módulo en Server Actions ni en componentes.
 */

import { createClient } from '@supabase/supabase-js'
import { getEnv } from '@/lib/env'

export function getAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv()
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY no está definida')
  }
  return createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
}
