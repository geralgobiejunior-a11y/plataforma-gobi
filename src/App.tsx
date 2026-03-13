// src/App.tsx
import { useEffect, useMemo, useState } from "react";
import { AuthProvider, useAuth, type AccessType } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LoginPage } from "./components/auth/LoginPage";
import { Layout } from "./components/layout/Layout";
import Dashboard from "./pages/Dashboard";
import { Colaboradores } from "./pages/Colaboradores";
import { Obras } from "./pages/Obras";
import { Presencas } from "./pages/Presencas";
import Pagamentos from "./pages/Pagamentos";
import { Documentos } from "./pages/Documentos";
import { Configuracoes } from "./pages/Configuracoes";
import { Perfil } from "./pages/Perfil";
import EliminarConta from "./pages/EliminarConta";
import Privacidade from "./pages/Privacidade";
import { ObraModal } from "./components/obras/ObraModal";
import { ColaboradorModal } from "./components/colaboradores/ColaboradorModal";

type DocsFocusPayload = {
  tipo: "colaborador" | "empresa";
  id: string;
};

type PageKey =
  | "dashboard"
  | "colaboradores"
  | "obras"
  | "presencas"
  | "pagamentos"
  | "documentos"
  | "configuracoes"
  | "perfil"
  | "admin_dashboard"
  | "admin_utilizadores"
  | "admin_financas";

function AppContent() {
  const { user, loading } = useAuth();

  const [currentPage, setCurrentPage] = useState<PageKey>("dashboard");
  const [isObraModalOpen, setIsObraModalOpen] = useState(false);
  const [isColaboradorModalOpen, setIsColaboradorModalOpen] = useState(false);

  // Páginas públicas acessíveis só por link direto
  const pathname = window.location.pathname;
  const isPublicDeleteAccountPage = pathname === "/eliminar-conta";
  const isPublicPrivacyPage = pathname === "/privacidade";

  // Se entrar direto pelas URLs públicas, não passa pelo login nem pela plataforma
  if (isPublicDeleteAccountPage) {
    return <EliminarConta />;
  }

  if (isPublicPrivacyPage) {
    return <Privacidade />;
  }

  const PAGE_ACCESS: Record<PageKey, AccessType> = useMemo(
    () => ({
      dashboard: "operacoes",
      colaboradores: "operacoes",
      obras: "operacoes",
      presencas: "operacoes",
      pagamentos: "operacoes",
      documentos: "operacoes",
      perfil: "operacoes",

      configuracoes: "administracao",
      admin_dashboard: "administracao",
      admin_utilizadores: "administracao",
      admin_financas: "administracao",
    }),
    []
  );

  const safeNavigate = (next: PageKey) => {
    setCurrentPage(next);
  };

  const openDocumentosForColaborador = (colaboradorId: string) => {
    const payload: DocsFocusPayload = { tipo: "colaborador", id: colaboradorId };
    sessionStorage.setItem("documentos_focus", JSON.stringify(payload));
    safeNavigate("documentos");
  };

  useEffect(() => {
    if (!user) return;
    const required = PAGE_ACCESS[currentPage];
    if (!required) setCurrentPage("dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tipo_acesso]);

  if (!user) {
    return <LoginPage />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center transition-colors">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0B4F8A]"></div>
      </div>
    );
  }

  const pageConfig: Record<PageKey, { title: string; subtitle?: string; component: JSX.Element }> =
    {
      dashboard: {
        title: "Dashboard",
        subtitle: "Visão geral do sistema",
        component: (
          <Dashboard
            onNavigate={(p: string) => safeNavigate(p as PageKey)}
            onNovaObra={() => {
              safeNavigate("obras");
              setIsObraModalOpen(true);
            }}
            onNovoColaborador={() => {
              safeNavigate("colaboradores");
              setIsColaboradorModalOpen(true);
            }}
          />
        ),
      },
      colaboradores: {
        title: "Colaboradores",
        subtitle: "Gerir colaboradores e equipas",
        component: <Colaboradores onOpenDocumentosColaborador={openDocumentosForColaborador} />,
      },
      obras: {
        title: "Obras",
        subtitle: "Gerir obras e projetos",
        component: <Obras />,
      },
      presencas: {
        title: "Presenças",
        subtitle: "Registar e gerir presenças",
        component: <Presencas />,
      },
      pagamentos: {
        title: "Folha de Pagamento",
        subtitle: "Processar pagamentos mensais",
        component: <Pagamentos />,
      },
      documentos: {
        title: "Documentos",
        subtitle: "Gerir documentos com validade",
        component: <Documentos />,
      },
      configuracoes: {
        title: "Configurações",
        subtitle: "Configurações do sistema",
        component: <Configuracoes />,
      },
      perfil: {
        title: "Meu Perfil",
        subtitle: "Gerir as suas informações pessoais",
        component: <Perfil />,
      },

      admin_dashboard: {
        title: "Administração",
        subtitle: "Painel administrativo",
        component: <div className="p-6">Admin Dashboard</div>,
      },
      admin_utilizadores: {
        title: "Utilizadores",
        subtitle: "Gestão de utilizadores e acessos",
        component: <div className="p-6">Admin Utilizadores</div>,
      },
      admin_financas: {
        title: "Finanças",
        subtitle: "Gestão financeira (admin)",
        component: <div className="p-6">Admin Finanças</div>,
      },
    };

  const current = pageConfig[currentPage] || pageConfig.dashboard;

  return (
    <>
      <Layout
        currentPage={currentPage}
        onNavigate={(p: string) => safeNavigate(p as PageKey)}
        title={current.title}
        subtitle={current.subtitle}
      >
        {current.component}
      </Layout>

      <ObraModal
        open={isObraModalOpen}
        onClose={() => setIsObraModalOpen(false)}
        onSave={() => {
          setIsObraModalOpen(false);
          if (currentPage === "dashboard" || currentPage === "obras") {
            window.location.reload();
          }
        }}
      />

      <ColaboradorModal
        open={isColaboradorModalOpen}
        onClose={() => setIsColaboradorModalOpen(false)}
        onSave={() => {
          setIsColaboradorModalOpen(false);
          if (currentPage === "dashboard" || currentPage === "colaboradores") {
            window.location.reload();
          }
        }}
      />
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
// teste deploy
// deploy definitivo