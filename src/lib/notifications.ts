import { supabase } from './supabase';

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

export async function createNotification(
  userId: string,
  tipo: string,
  titulo: string,
  mensagem: string,
  link?: string
) {
  const { error } = await supabase.from('notificacoes').insert([
    {
      user_id: userId,
      tipo,
      titulo,
      mensagem,
      link: link || null,
      lida: false,
    },
  ]);

  if (error) {
    console.error('Erro ao criar notificação:', error);
  }
}

export async function markAsRead(notificationId: string) {
  const { error } = await supabase
    .from('notificacoes')
    .update({ lida: true })
    .eq('id', notificationId);

  if (error) {
    console.error('Erro ao marcar notificação como lida:', error);
  }
}

export async function markAllAsRead(userId: string) {
  const { error } = await supabase
    .from('notificacoes')
    .update({ lida: true })
    .eq('user_id', userId)
    .eq('lida', false);

  if (error) {
    console.error('Erro ao marcar todas notificações como lidas:', error);
  }
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notificacoes')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('lida', false);

  if (error) {
    console.error('Erro ao contar notificações:', error);
    return 0;
  }

  return count || 0;
}

export async function getNotifications(userId: string, limit = 20): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notificacoes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Erro ao carregar notificações:', error);
    return [];
  }

  return data || [];
}

export function getNotificationIcon(tipo: string) {
  const icons: Record<string, string> = {
    obra: '🏗️',
    colaborador: '👤',
    documento: '📄',
    pagamento: '💰',
    alerta: '⚠️',
    sucesso: '✅',
    info: 'ℹ️',
  };

  return icons[tipo] || 'ℹ️';
}

export function getNotificationColor(tipo: string) {
  const colors: Record<string, string> = {
    obra: 'bg-blue-50 text-blue-700',
    colaborador: 'bg-green-50 text-green-700',
    documento: 'bg-amber-50 text-amber-700',
    pagamento: 'bg-emerald-50 text-emerald-700',
    alerta: 'bg-red-50 text-red-700',
    sucesso: 'bg-green-50 text-green-700',
    info: 'bg-slate-50 text-slate-700',
  };

  return colors[tipo] || 'bg-slate-50 text-slate-700';
}
