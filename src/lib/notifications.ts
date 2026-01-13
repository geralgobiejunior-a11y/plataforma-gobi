// src/lib/notifications.ts
import { supabase } from "./supabase";

export interface Notification {
  id: string;
  user_id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  link: string | null;
  lida: boolean;
  created_at: string;
}

type NotifOk<T = unknown> = { ok: true; data?: T };
type NotifErr = {
  ok: false;
  error: {
    message: string;
    code?: string | null;
    details?: string | null;
    hint?: string | null;
    status?: number | null;
  };
};

function normalizeSbError(err: any): NotifErr["error"] {
  return {
    message: String(err?.message || "Erro desconhecido"),
    code: err?.code ?? err?.error_code ?? null,
    details: err?.details ?? null,
    hint: err?.hint ?? null,
    status: typeof err?.status === "number" ? err.status : null,
  };
}

function logSbError(context: string, err: any) {
  const e = normalizeSbError(err);
  console.error(`[NOTIF] ${context}:`, e);
}

/**
 * Cria notificação para o utilizador.
 * Retorna ok=false com detalhes completos se falhar (útil para debug de RLS/GRANT).
 */
export async function createNotification(
  userId: string,
  tipo: string,
  titulo: string,
  mensagem: string,
  link?: string
): Promise<NotifOk | NotifErr> {
  const payload = {
    user_id: userId,
    tipo,
    titulo,
    mensagem,
    link: link || null,
    lida: false,
  };

  const { data, error } = await supabase
    .from("notificacoes")
    .insert([payload])
    .select("id")
    .maybeSingle();

  if (error) {
    logSbError("createNotification failed", error);
    return { ok: false, error: normalizeSbError(error) };
  }

  return { ok: true, data };
}

export async function markAsRead(notificationId: string): Promise<NotifOk | NotifErr> {
  const { error } = await supabase
    .from("notificacoes")
    .update({ lida: true })
    .eq("id", notificationId);

  if (error) {
    logSbError("markAsRead failed", error);
    return { ok: false, error: normalizeSbError(error) };
  }

  return { ok: true };
}

export async function markAllAsRead(userId: string): Promise<NotifOk | NotifErr> {
  const { error } = await supabase
    .from("notificacoes")
    .update({ lida: true })
    .eq("user_id", userId)
    .eq("lida", false);

  if (error) {
    logSbError("markAllAsRead failed", error);
    return { ok: false, error: normalizeSbError(error) };
  }

  return { ok: true };
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("notificacoes")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("lida", false);

  if (error) {
    logSbError("getUnreadCount failed", error);
    return 0;
  }

  return count || 0;
}

export async function getNotifications(userId: string, limit = 20): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notificacoes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logSbError("getNotifications failed", error);
    return [];
  }

  return data || [];
}

export function getNotificationIcon(tipo: string) {
  const icons: Record<string, string> = {
    obra: "🏗️",
    colaborador: "👤",
    documento: "📄",
    pagamento: "💰",
    alerta: "⚠️",
    sucesso: "✅",
    info: "ℹ️",
  };

  return icons[tipo] || "ℹ️";
}

/**
 * Nota: Se quiser que os chips de cor fiquem bons no dark mode,
 * você pode adicionar classes dark: aqui.
 */
export function getNotificationColor(tipo: string) {
  const colors: Record<string, string> = {
    obra: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-200",
    colaborador: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-200",
    documento: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200",
    pagamento: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200",
    alerta: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-200",
    sucesso: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-200",
    info: "bg-slate-50 text-slate-700 dark:bg-slate-500/10 dark:text-slate-200",
  };

  return colors[tipo] || "bg-slate-50 text-slate-700 dark:bg-slate-500/10 dark:text-slate-200";
}
