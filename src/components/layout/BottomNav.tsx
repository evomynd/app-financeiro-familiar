"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, FileText, Upload, Settings, Wallet, BarChart2 } from "lucide-react";

const navItems = [
  { href: "/dashboard", icon: Home, label: "Home" },
  { href: "/resumo", icon: BarChart2, label: "Resumo" },
  { href: "/orcamento", icon: Wallet, label: "Orçamento" },
  { href: "/lancamentos", icon: FileText, label: "Lançamentos" },
  { href: "/upload", icon: Upload, label: "Upload" },
  { href: "/configuracoes", icon: Settings, label: "Config" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white shadow-2xl">
      <div className="mx-auto grid max-w-screen-xl grid-cols-6">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-3 transition-colors ${
                isActive
                  ? "text-orange-600"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              <Icon className="h-6 w-6" />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
