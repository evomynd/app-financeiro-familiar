"use client";

import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";
import type { ReactNode } from "react";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar />
      <main className="mx-auto min-h-[calc(100vh-8rem)] max-w-screen-xl px-4 py-6 pb-24">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
