// src/components/layout/NotificationDropdown.tsx
import { useState, useEffect, useRef } from "react";
import { Bell, Check, CheckCheck, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import {
  Notification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getNotificationIcon,
  getNotificationColor,
} from "../../lib/notifications";

export function NotificationDropdown() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      loadNotifications();
      const cleanup = subscribeToNotifications();
      return cleanup;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEsc(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEsc);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleEsc);
      };
    }
  }, [isOpen]);

  const loadNotifications = async () => {
    if (!user) return;
    setLoading(true);
    const data = await getNotifications(user.id, 20);
    setNotifications(data);
    setLoading(false);
  };

  const subscribeToNotifications = () => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notificacoes",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  // remove do dropdown imediatamente
  const handleMarkAsRead = async (notificationId: string) => {
    await markAsRead(notificationId);
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
  };

  // limpa o dropdown
  const handleMarkAllAsRead = async () => {
    if (!user) return;
    await markAllAsRead(user.id);
    setNotifications([]);
  };

  const unreadCount = notifications.filter((n) => !n.lida).length;

  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Agora";
    if (diffMins < 60) return `${diffMins}min atrás`;
    if (diffHours < 24) return `${diffHours}h atrás`;
    if (diffDays < 7) return `${diffDays}d atrás`;
    return d.toLocaleDateString("pt-PT");
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={[
          "relative inline-flex items-center justify-center h-10 w-10 rounded-xl border transition",
          "focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]/30",
          "border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50",
          "dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800",
        ].join(" ")}
        aria-label="Notificações"
        aria-expanded={isOpen ? true : false}
        type="button"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-red-500 text-white text-xs font-semibold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className={[
            // POSICIONAMENTO: no mobile vira “quase fullscreen”, no desktop fica dropdown normal
            "absolute right-0 mt-2 z-50 overflow-hidden rounded-2xl shadow-xl",
            "w-[calc(100vw-2rem)] sm:w-[420px]",
            "max-w-[420px] sm:max-w-none",
            // garante que em telas muito pequenas não encoste nas bordas
            "mr-0 sm:mr-0",
            // light/dark
            "bg-white border border-slate-200",
            "dark:bg-slate-900 dark:border-slate-800 dark:shadow-black/40",
          ].join(" ")}
          role="dialog"
          aria-label="Lista de notificações"
        >
          {/* Header */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">Notificações</h3>
              {unreadCount > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {unreadCount} não lida(s)
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-[#0B4F8A] hover:text-[#0B4F8A]/80 flex items-center gap-1"
                  title="Marcar todas como lidas"
                  type="button"
                >
                  <CheckCheck size={14} />
                  <span className="hidden sm:inline">Marcar todas</span>
                  <span className="sm:hidden">Todas</span>
                </button>
              )}

              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg transition hover:bg-slate-100 dark:hover:bg-slate-800"
                type="button"
                aria-label="Fechar notificações"
              >
                <X size={16} className="text-slate-500 dark:text-slate-300" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[70vh] sm:max-h-[500px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0B4F8A]" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                <Bell size={32} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-sm">Nenhuma notificação</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {notifications.map((notification) => {
                  const icon = getNotificationIcon(notification.tipo);
                  const colorClass = getNotificationColor(notification.tipo);
                  const unreadBg = "bg-blue-50/30 dark:bg-[#0B4F8A]/10";

                  return (
                    <div
                      key={notification.id}
                      className={[
                        "p-4 transition",
                        "hover:bg-slate-50 dark:hover:bg-slate-800/60",
                        !notification.lida ? unreadBg : "",
                      ].join(" ")}
                    >
                      <div className="flex gap-3 min-w-0">
                        <div
                          className={[
                            "h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg",
                            colorClass,
                          ].join(" ")}
                        >
                          {icon}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4
                              className={[
                                "text-sm font-semibold text-slate-900 dark:text-slate-100",
                                !notification.lida ? "font-bold" : "",
                                "min-w-0 break-words",
                              ].join(" ")}
                            >
                              {notification.titulo}
                            </h4>

                            {!notification.lida && (
                              <button
                                onClick={() => handleMarkAsRead(notification.id)}
                                className="p-1 rounded transition flex-shrink-0 hover:bg-slate-200 dark:hover:bg-slate-700"
                                title="Marcar como lida"
                                type="button"
                              >
                                <Check size={14} className="text-slate-600 dark:text-slate-200" />
                              </button>
                            )}
                          </div>

                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">
                            {notification.mensagem}
                          </p>

                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                            {formatTime(notification.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
