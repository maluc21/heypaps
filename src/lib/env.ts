/**
 * Variables de entorno con validación al primer uso (boot).
 * Falla temprano si falta una obligatoria.
 */

type Env = {
  NEXT_PUBLIC_SUPABASE_URL: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string | undefined
  NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT: string
  IMAGEKIT_PUBLIC_KEY: string
  IMAGEKIT_PRIVATE_KEY: string | undefined
  NEXT_PUBLIC_APP_URL: string
  KV_URL: string | undefined
  RESEND_API_KEY: string | undefined
  RESEND_FROM_EMAIL: string | undefined
}

const REQUIRED: (keyof Env)[] = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT',
  'IMAGEKIT_PUBLIC_KEY',
  'NEXT_PUBLIC_APP_URL',
]

let cached: Env | null = null

export function getEnv(): Env {
  if (cached) return cached
  const missing = REQUIRED.filter((k) => !process.env[k])
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno obligatorias: ${missing.join(', ')}`
    )
  }
  cached = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT:
      process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT!,
    IMAGEKIT_PUBLIC_KEY: process.env.IMAGEKIT_PUBLIC_KEY!,
    IMAGEKIT_PRIVATE_KEY: process.env.IMAGEKIT_PRIVATE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL!,
    KV_URL: process.env.KV_URL,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  }
  return cached
}
