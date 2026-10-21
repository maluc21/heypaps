'use server'

import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";

const MAGIC_LINK_RATE_LIMIT = { limit: 5, windowMs: 60 * 1000 };
const GOOGLE_RATE_LIMIT = { limit: 5, windowMs: 60 * 1000 };

export type AuthResult = { error?: string; message?: string; url?: string };

export async function signInMagicLink(formData: FormData): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Ingresa un correo electrónico." };

  const rate = checkRateLimit(`magic-link:${email}`, MAGIC_LINK_RATE_LIMIT.limit, MAGIC_LINK_RATE_LIMIT.windowMs);
  if (!rate.ok) {
    return { error: "Demasiados intentos. Espera un momento e inténtalo de nuevo." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) return { error: error.message ?? "No se pudo enviar el enlace mágico." };
  return { message: "Revisa tu correo y pulsa el enlace mágico para entrar." };
}

export async function signInGoogle(): Promise<AuthResult> {
  const ip = "google";
  const rate = checkRateLimit(`google:${ip}`, GOOGLE_RATE_LIMIT.limit, GOOGLE_RATE_LIMIT.windowMs);
  if (!rate.ok) {
    return { error: "Demasiados intentos. Espera un momento e inténtalo de nuevo." };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${getEnv().NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });
  if (error) return { error: error.message ?? "No se pudo iniciar sesión con Google." };
  return { url: data.url };
}

export async function signOut(): Promise<void> {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
