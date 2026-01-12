import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

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
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
      {/* Background premium (bem discreto, alinhado à paleta Diâmetro) */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-[#F5A623]/10 dark:bg-[#F5A623]/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-[28rem] w-[28rem] rounded-full bg-[#0B4F8A]/10 dark:bg-[#0B4F8A]/5 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/40 dark:from-slate-950/40 to-transparent" />
      </div>

      <Sidebar currentPage={currentPage} onNavigate={onNavigate} />

      {/* Ajuste do offset do conteúdo para a sidebar em desktop */}
      <div className="lg:pl-64">
        {/* Header (seu componente) */}
        <Header title={title} subtitle={subtitle} actions={actions} onNavigate={onNavigate} />

        {/* Conteúdo com container e espaçamento consistente */}
        <main className="px-4 sm:px-6 lg:px-8 py-6">
          <div className="mx-auto w-full max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
