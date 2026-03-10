// src/components/layout/Sidebar.tsx
import { useMemo, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Building2,
  Clock,
  Receipt,
  FileText,
  Settings,
  LogOut,
  ChevronRight,
  Shield,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage } from "../../contexts/LanguageContext";

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ currentPage, onNavigate, open, onClose }: SidebarProps) {
  const auth = useAuth();
  const { signOut } = auth;
  const { t } = useLanguage();

  const hasRoleFromContext = (auth as any).hasRole as undefined | ((role: string) => boolean);
  const userRoles = ((auth as any).userRoles as string[] | undefined) ?? [];

  const [logoOk, setLogoOk] = useState(true);

  // usa o logo da Gobi
  const logoSrc = `${import.meta.env.BASE_URL}logo-gobi.png`;

  const norm = (v: string) =>
    String(v)
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");

  const rolesLower = useMemo(() => userRoles.map((r) => norm(r)), [userRoles]);

  const hasRole = (role: string) => {
    const lower = norm(role);

    if (typeof hasRoleFromContext === "function") {
      try {
        if (hasRoleFromContext(lower)) return true;
        if (hasRoleFromContext(role)) return true;
      } catch {
        // fallback abaixo
      }
    }

    return rolesLower.includes(lower);
  };

  const isOwner = hasRole("owner");
  const isAdmin = isOwner || hasRole("admin");

  const menuItems = [
    { id: "dashboard", label: t("nav.dashboard"), icon: LayoutDashboard, roles: ["all"] },
    { id: "colaboradores", label: t("nav.colaboradores"), icon: Users, roles: ["all"] },
    { id: "obras", label: t("nav.obras"), icon: Building2, roles: ["all"] },
    { id: "presencas", label: t("nav.presencas"), icon: Clock, roles: ["all"] },
    {
      id: "pagamentos",
      label: t("nav.pagamentos"),
      icon: Receipt,
      roles: ["financeiro", "admin", "owner"],
    },
    { id: "documentos", label: t("nav.documentos"), icon: FileText, roles: ["all"] },
    { id: "configuracoes", label: t("nav.configuracoes"), icon: Settings, roles: ["admin", "owner"] },
  ];

  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (item.roles.includes("all")) return true;
      if (isAdmin) return true;
      return item.roles.some((role) => hasRole(role));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, rolesLower.join("|")]);

  const roleLabel = useMemo(() => {
    if (isOwner) return "Owner";
    if (hasRole("admin")) return "Admin";
    if (hasRole("financeiro")) return "Financeiro";
    return "Operações";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, rolesLower.join("|"), hasRoleFromContext]);

  const handleSignOut = async () => {
    try {
      await signOut();
      onClose();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const onItemClick = (id: string) => {
    onNavigate(id);
    onClose();
  };

  return (
    <aside
      className={[
        "fixed left-0 top-0 h-full w-72 lg:w-64 z-50",
        "transition-transform duration-300 will-change-transform",
        open ? "translate-x-0" : "-translate-x-full",
        "lg:translate-x-0",
      ].join(" ")}
      aria-hidden={!open ? true : undefined}
    >
      <div className="h-full border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col transition-colors">
        {/* Top brand */}
        <div className="relative px-6 pt-6 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-[#F59A23]/20 dark:bg-[#F59A23]/10 blur-3xl" />
            <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-[#1F3348]/10 dark:bg-[#1F3348]/5 blur-3xl" />
          </div>

          <div className="relative flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-md shadow-[#1F3348]/10 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
              {logoOk ? (
                <img
                  src={logoSrc}
                  alt="Gobi & Júnior"
                  className="h-full w-full object-contain p-1.5"
                  onError={() => setLogoOk(false)}
                />
              ) : (
                <span className="text-[#1F3348] font-semibold text-lg">GJ</span>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-slate-900 dark:text-white leading-tight truncate">
                  Gobi & Júnior
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 px-2 py-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                  <Shield size={12} className="text-[#F59A23]" />
                  {roleLabel}
                </span>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Gestão de Obras & Colaboradores
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="px-3 py-4">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Navegação
          </div>

          <ul className="space-y-1">
            {filteredMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;

              return (
                <li key={item.id}>
                  <button
                    onClick={() => onItemClick(item.id)}
                    className={[
                      "group w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium",
                      "transition-all duration-200",
                      "focus:outline-none focus:ring-2 focus:ring-[#1F3348]/30",
                      isActive
                        ? "bg-gradient-to-r from-[#1F3348] to-[#2C4E6B] text-white shadow-sm shadow-[#1F3348]/20"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
                    ].join(" ")}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <span
                      className={[
                        "h-9 w-9 rounded-xl flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10",
                        isActive
                          ? "bg-white/15"
                          : "bg-slate-200/60 dark:bg-slate-800/60 group-hover:bg-white dark:group-hover:bg-slate-700",
                      ].join(" ")}
                    >
                      <Icon size={18} className={isActive ? "text-white" : "text-[#1F3348]"} />
                    </span>

                    <span className="flex-1 text-left truncate">{item.label}</span>

                    <ChevronRight
                      size={16}
                      className={[
                        "transition",
                        isActive
                          ? "text-white/80"
                          : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300",
                      ].join(" ")}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Bottom */}
        <div className="mt-auto border-t border-slate-200 dark:border-slate-800 p-3">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium
                       text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition
                       focus:outline-none focus:ring-2 focus:ring-[#1F3348]/30"
          >
            <span className="h-9 w-9 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
              <LogOut size={18} className="text-slate-700 dark:text-slate-400" />
            </span>
            <span className="flex-1 text-left">Sair</span>
          </button>

          <div className="px-3 pt-3 text-[11px] text-slate-400 dark:text-slate-500">
            Sistema interno Gobi & Júnior • Acesso restrito
          </div>
        </div>
      </div>
    </aside>
  );
}