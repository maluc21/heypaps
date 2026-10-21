export const metadata = {
  title: "Catálogo SaaS — Catálogos digitales para microemprendedores",
  description: "Carga tu catálogo y vende por WhatsApp. Cada producto tiene su propio link compartible.",
};

export default function LandingPage() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-muted px-6">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Catálogos digitales para microemprendedores</h1>
        <p className="text-lg text-muted-foreground">
          Reemplaza el PDF de WhatsApp. Cada producto tiene su propio link compartible y la venta
          se cierra por WhatsApp.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="/login"
            className="rounded-full bg-primary px-6 py-3 text-primary-foreground font-semibold shadow hover:bg-primary/90"
          >
            Iniciar sesión
          </a>
          <a
            href="/login"
            className="rounded-full border border-input bg-background px-6 py-3 text-sm font-medium shadow hover:bg-accent hover:text-accent-foreground"
          >
            Crear tu tienda
          </a>
        </div>
      </div>
    </div>
  );
}
