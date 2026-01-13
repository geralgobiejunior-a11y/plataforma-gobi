// src/components/layout/Layout.tsx
import { ReactNode, useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface LayoutProps {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function Layout({
  children,
  currentPage,
  onNavigate,
  title,
  subtitle,
  actions,
}: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Fecha menu ao trocar de página (garante UX boa no mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [currentPage]);

  // ESC fecha + trava scroll no mobile quando aberto
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };

    if (sidebarOpen) {
      document.addEventListener("keydown", onKeyDown);
      // trava scroll da página quando o drawer está aberto
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      return () => {
        document.removeEventListener("keydown", onKeyDown);
        document.body.style.overflow = prevOverflow;
      };
    }

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [sidebarOpen]);

  return (
    <div
      className="
        min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors
        [--sidebar-w:256px]
      "
    >
      {/* Background premium (discreto) */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-[#F5A623]/10 dark:bg-[#F5A623]/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-[#0B4F8A]/10 dark:bg-[#0B4F8A]/5 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/40 dark:from-slate-950/40 to-transparent" />
      </div>

      {/* Sidebar (drawer no mobile, fixo no desktop) */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Overlay mobile */}
      {sidebarOpen && (
        <button
          className="fixed inset-0 z-40 lg:hidden bg-black/45 backdrop-blur-[1px]"
          onClick={() => setSidebarOpen(false)}
          aria-label="Fechar menu"
        />
      )}

      <div className="lg:pl-[var(--sidebar-w)] min-w-0">
        <Header
          title={title}
          subtitle={subtitle}
          actions={actions}
          onNavigate={onNavigate}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          sidebarOpen={sidebarOpen}
        />

        <main className="min-w-0 px-4 sm:px-6 lg:px-8 py-6">
          <div className="mx-auto w-full max-w-[1280px] 2xl:max-w-[1440px] min-w-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
