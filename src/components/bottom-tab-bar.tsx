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

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background sm:hidden">
      <div className="grid grid-cols-5">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/panel" && pathname?.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 py-2 text-xs ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
