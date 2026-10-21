/**
 * Supabase cliente administrativo (service_role).
 *
 * ATENCIÓN: el plan fundacional (§5.2) establece que service_role NO se usa en la
 * aplicación para acceder a datos de negocio. Este cliente existe para:
 *   - scripts de semillado y tooling fuera del runtime de la app;
 *   - una única operación técnica: liberar bytes de la cuota cuando se borra una
 *     imagen (el peso real lo lee el servidor del DAM; la RPC que lo descuenta
 *     solo admite llamadas de service_role, ver migración 0021).
 *
 * No usarlo para leer ni escribir datos de negocio de un inquilino.
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
