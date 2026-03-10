// src/components/layout/Header.tsx
import { ReactNode, useMemo, useState, useRef, useEffect } from "react";
import { Sun, Moon, User, LogOut, ChevronDown, Menu, X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
import { NotificationDropdown } from "./NotificationDropdown";

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  onNavigate?: (page: string) => void;
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
}

function toDisplayName(email?: string | null) {
  if (!email) return "Utilizador";
  const left = email.split("@")[0] || "Utilizador";
  const cleaned = left.replace(/[._-]+/g, " ").trim();
  return cleaned || left;
}

export function Header({
  title,
  subtitle,
  actions,
  onNavigate,
  onToggleSidebar,
  sidebarOpen,
}: HeaderProps) {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const displayName = useMemo(() => toDisplayName(user?.email ?? null), [user?.email]);
  const initial = useMemo(() => (user?.email ? user.email[0].toUpperCase() : "U"), [user?.email]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    if (showProfileMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showProfileMenu]);

  const handleProfileClick = () => {
    setShowProfileMenu(false);
    onNavigate?.("perfil");
  };

  const handleLogout = async () => {
    setShowProfileMenu(false);
    await signOut();
  };

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 transition-colors">
      <div className="h-1 w-full bg-gradient-to-r from-[#1F3348] via-[#2C4E6B] to-[#F59A23]" />

      <div className="px-4 sm:px-6 py-4">
        <div className="flex items-start sm:items-center justify-between gap-4">
          {/* Left */}
          <div className="min-w-0 flex items-start sm:items-center gap-3">
            {onToggleSidebar && (
              <button
                onClick={onToggleSidebar}
                className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                aria-label={sidebarOpen ? "Fechar menu" : "Abrir menu"}
                aria-expanded={sidebarOpen ? true : false}
              >
                {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            )}

            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white truncate">
                {title}
              </h1>

              {subtitle && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed line-clamp-2">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            {actions && <div className="hidden md:flex items-center gap-2">{actions}</div>}

            <button
              onClick={toggleTheme}
              className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
              title={theme === "light" ? "Mudar para modo escuro" : "Mudar para modo claro"}
            >
              {theme === "light" ? (
                <Sun size={18} className="text-[#F59A23]" />
              ) : (
                <Moon size={18} className="text-slate-400" />
              )}
            </button>

            <NotificationDropdown />

            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setShowProfileMenu((prev) => !prev)}
                className="flex items-center gap-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors p-1.5 -mr-1.5"
              >
                <div className="hidden sm:block text-right leading-tight">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white max-w-[180px] truncate">
                    {displayName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[180px] truncate">
                    {user?.email || "—"}
                  </p>
                </div>

                <div className="h-10 w-10 rounded-2xl bg-[#1F3348] dark:bg-[#2C4E6B] flex items-center justify-center shadow-sm">
                  <span className="text-white font-semibold text-sm">{initial}</span>
                </div>

                <ChevronDown
                  size={16}
                  className={`text-slate-400 transition-transform ${showProfileMenu ? "rotate-180" : ""}`}
                />
              </button>

              {showProfileMenu && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40 z-50">
                  <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-[#F8FAFC] to-[#FFF7ED] dark:from-slate-900 dark:to-slate-900">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {displayName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {user?.email || "—"}
                    </p>
                  </div>

                  <div className="py-2">
                    <button
                      onClick={handleProfileClick}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <User size={16} className="text-[#2C4E6B] dark:text-[#F59A23]" />
                      <span>Meu Perfil</span>
                    </button>

                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors dark:text-red-400 dark:hover:bg-red-950/20"
                    >
                      <LogOut size={16} />
                      <span>Sair</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile actions */}
        {actions && (
          <div className="mt-3 flex md:hidden items-center gap-2 overflow-x-auto pb-1">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}