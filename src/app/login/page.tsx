'use client'

import { useState } from "react";
import type { FormEvent } from "react";
import { signInMagicLink, signInGoogle } from "@/lib/actions/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleMagicLink = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const result = await signInMagicLink(formData);
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message);
  };

  const handleGoogle = async () => {
    setLoading(true);
    const result = await signInGoogle();
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.url) {
      window.location.href = result.url;
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-muted px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>Sin contraseñas. Recibirás un enlace mágico por correo.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleMagicLink} className="space-y-3">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Enviando…" : "Enviar enlace mágico"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button variant="outline" onClick={handleGoogle} className="w-full" disabled={loading}>
            {loading ? "…" : "Continuar con Google"}
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            ¿Primera vez? Tu tienda se crea al iniciar sesión.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
