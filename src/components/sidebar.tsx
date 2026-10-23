"use client";

import { usePathname } from "next/navigation";
import { LayoutDashboard, Package, FolderOpen, Tag, Settings } from "lucide-react";
import Link from "next/link";

const navItems = [
  { href: "/panel", label: "Panel", icon: LayoutDashboard },
  { href: "/products", label: "Productos", icon: Package },
  { href: "/categorias", label: "Categorías", icon: FolderOpen },
  { href: "/etiquetas", label: "Etiquetas", icon: Tag },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 hidden h-full w-64 border-r bg-background md:flex md:flex-col">
      <div className="flex h-16 items-center border-b px-6">
        <span className="text-lg font-semibold">Panel</span>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
