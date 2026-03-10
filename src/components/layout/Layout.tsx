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

  useEffect(() => {
    setSidebarOpen(false);
  }, [currentPage]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };

    if (sidebarOpen) {
      document.addEventListener("keydown", onKeyDown);

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
      {/* Background premium */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-[#F59A23]/10 dark:bg-[#F59A23]/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-[#1F3348]/10 dark:bg-[#1F3348]/5 blur-3xl" />
        <div className="absolute top-1/3 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[#2C4E6B]/8 dark:bg-[#2C4E6B]/5 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/50 dark:from-slate-950/50 to-transparent" />
      </div>

      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {sidebarOpen && (
        <button
          className="fixed inset-0 z-40 lg:hidden bg-[#1F3348]/45 backdrop-blur-[2px]"
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