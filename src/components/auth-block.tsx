"use client"

import { useState } from "react"
import type { FormEvent } from "react"
import { Sparkles } from "lucide-react"
import { signInMagicLink, signInGoogle } from "@/lib/actions/auth"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="4" y="4" width="6" height="6" rx="1" transform="rotate(45 7 7)" />
      <rect x="14" y="4" width="6" height="6" rx="1" transform="rotate(45 17 7)" />
      <rect x="4" y="14" width="6" height="6" rx="1" transform="rotate(45 7 17)" />
      <rect x="14" y="14" width="6" height="6" rx="1" transform="rotate(45 17 17)" />
    </svg>
  )
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.6 12.23c0-.77-.07-1.5-.2-2.23H12v4.22h5.39c-.23 1.24-.93 2.29-1.99 3v2.48h3.22c1.88-1.73 2.98-4.28 2.98-7.47Z"
      />
      <path
        fill="currentColor"
        d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.22-2.48c-.9.6-2.05.95-3.4.95-2.62 0-4.84-1.77-5.63-4.15H3.05v2.57C4.7 19.77 8.1 22 12 22Z"
      />
      <path
        fill="currentColor"
        d="M6.37 13.9c-.2-.6-.32-1.24-.32-1.9s.12-1.3.32-1.9V7.53H3.05C2.38 8.86 2 10.38 2 12s.38 3.14 1.05 4.47l3.32-2.57Z"
      />
      <path
        fill="currentColor"
        d="M12 6.55c1.47 0 2.78.5 3.82 1.5l2.85-2.85C16.95 3.9 14.7 3 12 3 8.1 3 4.7 5.23 3.05 8.47l3.32 2.57c.79-2.38 3.01-4.49 5.63-4.49Z"
      />
    </svg>
  )
}

export function AuthBlock() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)

  const handleMagicLink = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const result = await signInMagicLink(formData)
    setLoading(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(result.message)
  }

  const handleGoogle = async () => {
    setLoading(true)
    const result = await signInGoogle()
    setLoading(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    if (result.url) {
      window.location.href = result.url
    }
  }

  return (
    <section className="grid min-h-svh grid-cols-1 md:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="font-heading text-2xl font-bold">Iniciar sesión</h1>
              <p className="text-balance text-sm text-muted-foreground">
                Recibirás un enlace mágico por correo.
              </p>
            </div>
            <form
              onSubmit={handleMagicLink}
              noValidate
              className="mt-6 flex flex-col gap-6"
            >
              <div className="grid gap-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="tu@correo.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Enviando…" : "Entrar"}
              </Button>
            </form>
            <div className="mt-6 flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">o</span>
              <Separator className="flex-1" />
            </div>
            <Button
              variant="outline"
              onClick={handleGoogle}
              className="mt-6 w-full"
              disabled={loading}
            >
              <GoogleMark />
              Continuar con Google
            </Button>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              ¿Primera vez? Tu tienda se crea al iniciar sesión.
            </p>
          </div>
        </div>
      </div>

      <div className="dark relative hidden overflow-hidden md:block">
        <div className="absolute inset-0 [background-image:linear-gradient(to_right,var(--foreground)/0.06,transparent),linear-gradient(to_bottom,var(--foreground)/0.06,transparent)] [background-size:40px_40px]" />
        <div className="absolute -top-1/4 right-0 size-[500px] rounded-full bg-foreground/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 size-[400px] rounded-full bg-foreground/10 blur-3xl" />
        <div className="absolute inset-0 z-10 flex flex-col gap-6 p-6 md:p-10">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <div className="flex size-6 items-center justify-center rounded-md bg-foreground text-background">
              <Logo className="size-4" />
            </div>
            Catálogo
          </div>
          <div className="flex flex-1 flex-col items-start justify-center gap-4">
            <Badge variant="secondary" className="gap-1">
              <Sparkles />
              Catálogos digitales
            </Badge>
            <h2 className="font-heading text-3xl font-bold text-balance text-foreground">
              Muestra tus productos con un catálogo profesional
            </h2>
            <p className="max-w-md text-balance text-sm text-muted-foreground">
              Crea y comparte tu catálogo en minutos. Recibe pedidos por WhatsApp
              y gestiona tu tienda desde el móvil.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Catálogo
          </p>
        </div>
      </div>
    </section>
  )
}
