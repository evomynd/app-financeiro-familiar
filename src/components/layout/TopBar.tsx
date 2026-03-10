"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Bell, User, LogOut } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export function TopBar() {
  const { user, signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-slate-900 text-white shadow-lg">
      <div className="mx-auto flex h-16 max-w-screen-xl items-center justify-between px-4">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-orange-500 to-orange-600">
              {user.photoURL ? (
                <Image
                  src={user.photoURL}
                  alt="Foto do perfil"
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-5 w-5" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium">
                {user.displayName || user.email?.split("@")[0]}
              </p>
              <p className="text-xs text-slate-400">Boa tarde</p>
            </div>
            <button
              onClick={handleLogout}
              className="ml-4 flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium transition-colors hover:bg-slate-700"
              title="Fazer logout"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        ) : (
          <Link 
            href="/login" 
            className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-slate-800"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600">
              <User className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Visitante</p>
              <p className="text-xs text-slate-400">Clique para fazer login</p>
            </div>
          </Link>
        )}

        <button
          className="relative rounded-lg p-2 transition-colors hover:bg-slate-800"
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500"></span>
          </span>
        </button>
      </div>
    </header>
  );
}
