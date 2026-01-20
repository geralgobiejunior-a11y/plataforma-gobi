// src/components/colaboradores/ColaboradorProfilePanel.tsx
import React from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Mail, Phone, CalendarDays, Euro, CreditCard, Fingerprint } from 'lucide-react';

const BRAND = { blue: '#0B4F8A' };

export type ColaboradorProfile = {
  id: string;
  nome_completo: string;
  foto_url?: string | null;

  email?: string | null;
  telefone?: string | null;

  status?: string | null;
  categoria?: string | null;

  data_entrada_plataforma?: string | null; // YYYY-MM-DD
  valor_hora?: number | null;

  iban?: string | null;
  nif?: string | null;
  niss?: string | null;
};

function normKey(s: string) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function statusLabel(s?: string | null) {
  const v = normKey(s || '');
  if (v === 'ativo') return 'Ativo';
  if (v === 'inativo') return 'Inativo';
  if (v === 'ferias') return 'Férias';
  if (v === 'baixa') return 'Baixa';
  return s || '—';
}

function getStatusVariant(status?: string | null) {
  const s = normKey(status || '');
  const variants: any = {
    ativo: 'success',
    inativo: 'default',
    ferias: 'info',
    baixa: 'warning',
  };
  return variants[s] || 'default';
}

function formatDatePT(date?: string | null) {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-PT');
}

function formatEUR(value: number) {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800/70 dark:bg-slate-950/30 dark:shadow-black/25">
      <div className="flex items-start gap-3">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10"
          style={{ background: '#EFF6FF' }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
          <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100 break-words">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ColaboradorProfilePanel({
  colaborador,
  footer,
  variant = 'standalone',
}: {
  colaborador: ColaboradorProfile;
  footer?: React.ReactNode;
  variant?: 'standalone' | 'embedded';
}) {
  const isEmbedded = variant === 'embedded';

  return (
    <div className="space-y-5">
      <Card className="p-5 border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 dark:text-slate-400">Perfil do colaborador</div>

            {!isEmbedded && (
              <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100 truncate">
                {colaborador.nome_completo}
              </div>
            )}

            <div className="mt-2 flex items-center gap-2">
              <Badge variant={getStatusVariant(colaborador.status)}>{statusLabel(colaborador.status)}</Badge>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {colaborador.categoria || 'Sem categoria'}
              </span>
            </div>
          </div>

          {!isEmbedded && (
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold shadow-sm"
              style={{ background: BRAND.blue }}
              title="Perfil"
            >
              P
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InfoRow icon={<Mail size={16} className="text-slate-700" />} label="Email" value={colaborador.email || '—'} />

          <InfoRow
            icon={<Phone size={16} className="text-slate-700" />}
            label="Telefone"
            value={colaborador.telefone || '—'}
          />

          <InfoRow
            icon={<CalendarDays size={16} className="text-slate-700" />}
            label="Entrada"
            value={formatDatePT(colaborador.data_entrada_plataforma)}
          />

          <InfoRow
            icon={<Euro size={16} className="text-slate-700" />}
            label="Valor/hora"
            value={typeof colaborador.valor_hora === 'number' ? formatEUR(colaborador.valor_hora) : '—'}
          />

          <InfoRow
            icon={<CreditCard size={16} className="text-slate-700" />}
            label="IBAN"
            value={colaborador.iban ? <span className="font-mono">{colaborador.iban}</span> : '—'}
          />

          <InfoRow
            icon={<Fingerprint size={16} className="text-slate-700" />}
            label="NIF"
            value={colaborador.nif ? <span className="font-mono">{colaborador.nif}</span> : '—'}
          />

          <InfoRow
            icon={<Fingerprint size={16} className="text-slate-700" />}
            label="NISS"
            value={colaborador.niss ? <span className="font-mono">{colaborador.niss}</span> : '—'}
          />
        </div>
      </Card>

      {footer ? <div>{footer}</div> : null}
    </div>
  );
}
