import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LoginPage } from './components/auth/LoginPage';
import { Layout } from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import { Colaboradores } from './pages/Colaboradores';
import { Obras } from './pages/Obras';
import { Presencas } from './pages/Presencas';
import Pagamentos from './pages/Pagamentos';
import { Documentos } from './pages/Documentos';
import { Configuracoes } from './pages/Configuracoes';
import { Perfil } from './pages/Perfil';
import { ObraModal } from './components/obras/ObraModal';
import { ColaboradorModal } from './components/colaboradores/ColaboradorModal';

type DocsFocusPayload = {
  tipo: 'colaborador' | 'empresa';
  id: string;
};

function AppContent() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isObraModalOpen, setIsObraModalOpen] = useState(false);
  const [isColaboradorModalOpen, setIsColaboradorModalOpen] = useState(false);

  const openDocumentosForColaborador = (colaboradorId: string) => {
    const payload: DocsFocusPayload = { tipo: 'colaborador', id: colaboradorId };
    sessionStorage.setItem('documentos_focus', JSON.stringify(payload));
    setCurrentPage('documentos');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex items-center justify-center transition-colors">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0B4F8A]"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const pageConfig: Record<string, { title: string; subtitle?: string; component: JSX.Element }> = {
    dashboard: {
      title: 'Dashboard',
      subtitle: 'Visão geral do sistema',
      component: (
        <Dashboard
          onNavigate={setCurrentPage}
          onNovaObra={() => {
            setCurrentPage('obras');
            setIsObraModalOpen(true);
          }}
          onNovoColaborador={() => {
            setCurrentPage('colaboradores');
            setIsColaboradorModalOpen(true);
          }}
        />
      ),
    },
    colaboradores: {
      title: 'Colaboradores',
      subtitle: 'Gerir colaboradores e equipas',
      component: <Colaboradores onOpenDocumentosColaborador={openDocumentosForColaborador} />,
    },
    obras: {
      title: 'Obras',
      subtitle: 'Gerir obras e projetos',
      component: <Obras />,
    },
    presencas: {
      title: 'Presenças',
      subtitle: 'Registar e gerir presenças',
      component: <Presencas />,
    },
    pagamentos: {
      title: 'Folha de Pagamento',
      subtitle: 'Processar pagamentos mensais',
      component: <Pagamentos />,
    },
    documentos: {
      title: 'Documentos',
      subtitle: 'Gerir documentos com validade',
      component: <Documentos />,
    },
    configuracoes: {
      title: 'Configurações',
      subtitle: 'Configurações do sistema',
      component: <Configuracoes />,
    },
    perfil: {
      title: 'Meu Perfil',
      subtitle: 'Gerir as suas informações pessoais',
      component: <Perfil />,
    },
  };

  const current = pageConfig[currentPage] || pageConfig.dashboard;

  return (
    <>
      <Layout
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        title={current.title}
        subtitle={current.subtitle}
      >
        {current.component}
      </Layout>

      {/* Modals globais */}
      <ObraModal
        open={isObraModalOpen}
        onClose={() => setIsObraModalOpen(false)}
        onSave={() => {
          setIsObraModalOpen(false);
          if (currentPage === 'dashboard' || currentPage === 'obras') {
            window.location.reload();
          }
        }}
      />

      <ColaboradorModal
        open={isColaboradorModalOpen}
        onClose={() => setIsColaboradorModalOpen(false)}
        onSave={() => {
          setIsColaboradorModalOpen(false);
          if (currentPage === 'dashboard' || currentPage === 'colaboradores') {
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
