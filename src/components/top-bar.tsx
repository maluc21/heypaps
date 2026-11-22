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
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Icon className="size-4" />
        {item.label}
      </Link>
    );
  });
}

export function TopBar({ storeName }: { storeName: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-card">
      <div className="mx-auto grid h-14 grid-cols-[minmax(0,1fr)_auto] items-center px-3 sm:h-16 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:px-6">
        <Link href="/panel" className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Store className="size-5" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base font-semibold leading-tight">{storeName}</span>
            <span className="text-xs leading-tight text-muted-foreground">Catálogo comercial</span>
          </span>
        </Link>

        <nav
          aria-label="Navegación principal"
          className="hidden items-center justify-center gap-1 lg:flex"
        >
          <NavigationItems pathname={pathname} />
        </nav>
      </div>
    </header>
  );
}
