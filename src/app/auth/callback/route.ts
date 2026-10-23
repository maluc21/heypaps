/**
 * Callback de OAuth (magic link / Google).
 * Route Handler: no se prerenderiza, se ejecuta por petición.
 * Intercambia el código de autorización por una sesión usando la clave pública (anon),
 * nunca service_role (plan §5.2).
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";

const OAUTH_RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 };

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");

  const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
  const rate = checkRateLimit(`oauth:callback:${ip}`, OAUTH_RATE_LIMIT.limit, OAUTH_RATE_LIMIT.windowMs);
  if (!rate.ok) {
    return NextResponse.redirect(`${getEnv().NEXT_PUBLIC_APP_URL}/login?error=rate_limited`);
  }

  if (error || !code) {
    return NextResponse.redirect(`${getEnv().NEXT_PUBLIC_APP_URL}/login?error=oauth_error`);
  }

  const origin = getEnv().NEXT_PUBLIC_APP_URL;
  const response = NextResponse.redirect(`${origin}/panel`);
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: unknown) {
          response.cookies.set({
            name,
            value,
            ...(options as Record<string, unknown>),
          });
        },
        remove(name: string, options: unknown) {
          response.cookies.set({
            name,
            value: "",
            ...(options as Record<string, unknown>),
          });
        },
      },
    }
  );

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(`${getEnv().NEXT_PUBLIC_APP_URL}/login?error=exchange_failed&details=${encodeURIComponent(exchangeError.message)}`);
  }

  return response;
}