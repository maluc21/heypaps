export const metadata = {
  title: "Productos · Catálogo SaaS",
};

export default function PanelPage() {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Productos</h2>
        <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground shadow hover:bg-primary/90">
          Nuevo producto
        </button>
      </div>
      <div className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
        Tu catálogo está vacío. Crea tu primer producto para compartir tu link.
      </div>
    </div>
  );
}
