"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderOpen,
  LayoutDashboard,
  Package,
  Settings,
  Store,
  Tag,
} from "lucide-react";

const navItems = [
  { href: "/panel", label: "Panel", icon: LayoutDashboard },
  { href: "/products", label: "Productos", icon: Package },
  { href: "/categorias", label: "Categorías", icon: FolderOpen },
  { href: "/etiquetas", label: "Etiquetas", icon: Tag },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

function NavigationItems({ pathname }: { pathname: string | null }) {
  return navItems.map((item) => {
    const isActive =
      pathname === item.href ||
      (item.href !== "/panel" && pathname?.startsWith(`${item.href}/`));
    const Icon = item.icon;

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Icon className="size-4" />
        {item.label}
      </Link>
    );
  });
}

export function TopBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 items-center gap-6 px-4 sm:px-6">
        <Link href="/panel" className="flex shrink-0 items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Store className="size-5" />
          </span>
          <span className="flex flex-col">
            <span className="text-base font-semibold leading-tight">Catálogo</span>
            <span className="text-xs leading-tight text-muted-foreground">Panel de administración</span>
          </span>
        </Link>

        <nav
          aria-label="Navegación principal"
          className="hidden flex-1 items-center justify-center gap-1 md:flex"
        >
          <NavigationItems pathname={pathname} />
        </nav>
      </div>

      <nav
        aria-label="Navegación principal"
        className="border-t px-2 py-1 md:hidden"
      >
        <div className="flex gap-1 overflow-x-auto">
          <NavigationItems pathname={pathname} />
        </div>
      </nav>
    </header>
  );
}
