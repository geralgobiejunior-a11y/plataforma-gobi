// src/pages/Pagamentos.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import {
  Search,
  Download,
  Calendar,
  Euro,
  Clock,
  FileText,
  Eye,
  Copy,
  ExternalLink,
  AlertTriangle,
  X,
} from 'lucide-react';

interface ColaboradorPagamento {
  id: string;
  nome_completo: string;
  foto_url: string | null;
  valor_hora_base: number | null;
  iban: string | null;

  horas_total: number;
  dias_trabalhados: number;
  faltas: number;
  total_pagar: number;

  obras_trabalhadas: string[];
  ultimo_registro: string | null;
}

interface DailyDetail {
  presenca_dia_id: string;
  data: string;
  obra_nome: string;
  horas: number;
  entrada: string | null;
  saida: string | null;
  faltou: boolean;
  justificacao_falta: string | null;
}

const BRAND = { blue: '#0B4F8A' };

const cardBase =
  'border border-slate-200 bg-white shadow-sm ' +
  'dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30';

// REGRA DO PERÍODO:
// Mês “fecha” no dia 23 => o período do “mês selecionado” é de 24 do mês anterior até 23 do mês selecionado (inclusive).
const FECHO_DIA = 23;
const INICIO_DIA = FECHO_DIA + 1; // 24

function toISODateUTC(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function periodRangeByClosingDay(year: number, month: number) {
  // month: 1..12 (mês de fecho)
  // Ex.: seleciona 2026-01 => 2025-12-24 até 2026-01-23
  const end = new Date(Date.UTC(year, month - 1, FECHO_DIA));
  const start = new Date(Date.UTC(year, month - 2, INICIO_DIA));
  return { startDate: start, endDate: end, startISO: toISODateUTC(start), endISO: toISODateUTC(end) };
}

function formatDatePT(date?: string | null) {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-PT');
}

function formatDateShortPT(date?: string | null) {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
}

function formatTimePT(ts?: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

function normalize(s: unknown) {
  return String(s ?? '').trim().toLowerCase();
}

function csvEscape(v: unknown) {
  const s = String(v ?? '');
  const needs = /[",\n]/.test(s);
  const inner = s.replaceAll('"', '""');
  return needs ? `"${inner}"` : inner;
}

function Pill({
  tone = 'default',
  children,
  icon,
  className = '',
}: {
  tone?: 'default' | 'warn' | 'danger';
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  const base =
    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold whitespace-nowrap';
  const styles =
    tone === 'danger'
      ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200'
        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/25 dark:text-slate-200';

  return (
    <span className={`${base} ${styles} ${className}`}>
      {icon}
      {children}
    </span>
  );
}

export default function Pagamentos() {
  const now = new Date();

  // UI: seletor único mês (mês do FECHO, dia 23)
  const [periodo, setPeriodo] = useState<string>(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );

  const { selectedYear, selectedMonth } = useMemo(() => {
    const [y, m] = String(periodo).split('-');
    const year = Number(y);
    const month = Number(m);
    return {
      selectedYear: Number.isFinite(year) ? year : now.getFullYear(),
      selectedMonth: Number.isFinite(month) ? month : now.getMonth() + 1,
    };
  }, [periodo, now]);

  const { rangeStartISO, rangeEndISO } = useMemo(() => {
    const r = periodRangeByClosingDay(selectedYear, selectedMonth);
    return { rangeStartISO: r.startISO, rangeEndISO: r.endISO };
  }, [selectedYear, selectedMonth]);

  const [colaboradores, setColaboradores] = useState<ColaboradorPagamento[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [colaboradorFilterId, setColaboradorFilterId] = useState<string>('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedColaborador, setSelectedColaborador] = useState<ColaboradorPagamento | null>(null);

  const [dailyDetails, setDailyDetails] = useState<DailyDetail[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Popover de obras (desktop)
  const [openObrasFor, setOpenObrasFor] = useState<string | null>(null);

  const monthNames = useMemo(
    () => [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ],
    []
  );

  const periodoLabel = useMemo(() => {
    return `${formatDatePT(rangeStartISO)} a ${formatDatePT(rangeEndISO)}`;
  }, [rangeStartISO, rangeEndISO]);

  useEffect(() => {
    loadColaboradoresPagamento();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStartISO, rangeEndISO]);

  useEffect(() => {
    if (!openObrasFor) return;
    const onDocClick = () => setOpenObrasFor(null);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [openObrasFor]);

  const eur = (v: number) =>
    new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

  const getInitials = (name: string) => {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return '??';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  const loadColaboradoresPagamento = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('presencas_dia')
        .select(
          `
          colaborador_id,
          total_horas,
          faltou,
          data,
          obra:obras(nome),
          colaborador:colaboradores(*)
        `
        )
        .gte('data', rangeStartISO)
        .lte('data', rangeEndISO);

      if (error) throw error;

      const map = new Map<
        string,
        {
          nome_completo: string;
          foto_url: string | null;
          valor_hora_base: number | null;
          iban: string | null;

          horas_total: number;
          dias_trabalhados: Set<string>;
          faltas: number;
          obras: Set<string>;
          ultimo_registro: string | null;
        }
      >();

      (data || []).forEach((p: any) => {
        const colabId: string = p.colaborador_id;
        if (!colabId) return;

        const col = p.colaborador || {};
        const valorHora =
          typeof col.valor_hora === 'number'
            ? col.valor_hora
            : typeof col.valor_hora_base === 'number'
              ? col.valor_hora_base
              : null;

        if (!map.has(colabId)) {
          map.set(colabId, {
            nome_completo: col.nome_completo || 'Desconhecido',
            foto_url: col.foto_url || null,
            valor_hora_base: valorHora,
            iban: col.iban || null,

            horas_total: 0,
            dias_trabalhados: new Set(),
            faltas: 0,
            obras: new Set(),
            ultimo_registro: null,
          });
        }

        const row = map.get(colabId)!;

        if (p.faltou) {
          row.faltas += 1;
        } else {
          row.horas_total += Number(p.total_horas || 0);
          row.dias_trabalhados.add(String(p.data));
        }

        if (p.obra?.nome) row.obras.add(String(p.obra.nome));

        const dt = String(p.data || '');
        if (dt && (!row.ultimo_registro || dt > row.ultimo_registro)) row.ultimo_registro = dt;
      });

      const list: ColaboradorPagamento[] = Array.from(map.entries()).map(([id, v]) => {
        const horas = Math.round(v.horas_total * 10) / 10;
        const valor = typeof v.valor_hora_base === 'number' ? v.valor_hora_base : null;
        const total = valor ? Math.round(horas * valor * 100) / 100 : 0;

        return {
          id,
          nome_completo: v.nome_completo,
          foto_url: v.foto_url,
          valor_hora_base: valor,
          iban: v.iban,

          horas_total: horas,
          dias_trabalhados: v.dias_trabalhados.size,
          faltas: v.faltas,
          total_pagar: total,

          obras_trabalhadas: Array.from(v.obras),
          ultimo_registro: v.ultimo_registro,
        };
      });

      list.sort((a, b) => b.total_pagar - a.total_pagar);
      setColaboradores(list);

      setColaboradorFilterId((prev) => (prev && !list.some((c) => c.id === prev) ? '' : prev));
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao carregar dados do financeiro');
      setColaboradores([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = normalize(search);
    let list = colaboradores;

    if (colaboradorFilterId) list = list.filter((c) => c.id === colaboradorFilterId);
    if (!q) return list;

    return list.filter((c) => {
      if (normalize(c.nome_completo).includes(q)) return true;
      if ((c.iban || '').toLowerCase().includes(q)) return true;
      if (c.obras_trabalhadas.some((o) => normalize(o).includes(q))) return true;
      return false;
    });
  }, [colaboradores, search, colaboradorFilterId]);

  const totals = useMemo(() => {
    return {
      totalHoras: filtered.reduce((sum, c) => sum + c.horas_total, 0),
      totalPagar: filtered.reduce((sum, c) => sum + c.total_pagar, 0),
      totalColaboradores: filtered.length,
      totalDias: filtered.reduce((sum, c) => sum + c.dias_trabalhados, 0),
      faltas: filtered.reduce((sum, c) => sum + c.faltas, 0),
      semIban: filtered.reduce((sum, c) => sum + (c.iban ? 0 : 1), 0),
      semValorHora: filtered.reduce((sum, c) => sum + (c.valor_hora_base ? 0 : 1), 0),
    };
  }, [filtered]);

  const exportCSV = () => {
    const headers = [
      'Nome',
      'Horas',
      'Dias Trabalhados',
      'Faltas',
      'Valor/Hora',
      'Total a Pagar',
      'IBAN',
      'Obras',
      'Último registo',
      'Período Início',
      'Período Fim',
    ];

    const rows = filtered.map((c) => [
      csvEscape(c.nome_completo),
      csvEscape(c.horas_total.toFixed(1)),
      csvEscape(c.dias_trabalhados),
      csvEscape(c.faltas),
      csvEscape(c.valor_hora_base ? c.valor_hora_base.toFixed(2) : ''),
      csvEscape(c.total_pagar.toFixed(2)),
      csvEscape(c.iban || ''),
      csvEscape(c.obras_trabalhadas.join('; ')),
      csvEscape(c.ultimo_registro ? formatDatePT(c.ultimo_registro) : ''),
      csvEscape(rangeStartISO),
      csvEscape(rangeEndISO),
    ]);

    const csv = [headers.map(csvEscape).join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `folha_pagamento_${selectedYear}-${String(selectedMonth).padStart(
      2,
      '0'
    )}_${rangeStartISO}_a_${rangeEndISO}.csv`;
    a.click();

    URL.revokeObjectURL(url);
    toast.success('CSV exportado');
  };

  const copyIBAN = async (iban: string) => {
    try {
      await navigator.clipboard.writeText(iban);
      toast.success('IBAN copiado');
    } catch {
      toast.error('Não foi possível copiar o IBAN');
    }
  };

  const openDetails = async (colaborador: ColaboradorPagamento) => {
    setSelectedColaborador(colaborador);
    setDrawerOpen(true);
    await loadDailyDetails(colaborador.id);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedColaborador(null);
    setDailyDetails([]);
  };

  const loadDailyDetails = async (colaboradorId: string) => {
    setLoadingDetails(true);
    try {
      const { data: dias, error } = await supabase
        .from('presencas_dia')
        .select(
          `
          id,
          data,
          total_horas,
          faltou,
          justificacao_falta,
          obra:obras(nome)
        `
        )
        .eq('colaborador_id', colaboradorId)
        .gte('data', rangeStartISO)
        .lte('data', rangeEndISO)
        .order('data', { ascending: false });

      if (error) throw error;

      const presencas = (dias || []) as any[];
      const ids = presencas.map((p) => p.id).filter(Boolean);

      const registosMap = new Map<string, { entrada: string | null; saida: string | null }>();

      if (ids.length > 0) {
        const { data: regs, error: regsErr } = await supabase
          .from('presencas_registos')
          .select('presenca_dia_id, tipo, momento')
          .in('presenca_dia_id', ids)
          .order('momento', { ascending: true });

        if (regsErr) throw regsErr;

        (regs || []).forEach((r: any) => {
          const pid = String(r.presenca_dia_id);
          const tipo = String(r.tipo);
          const ts = r.momento ? String(r.momento) : null;

          if (!registosMap.has(pid)) registosMap.set(pid, { entrada: null, saida: null });

          const cur = registosMap.get(pid)!;
          if (tipo === 'entrada' && !cur.entrada) cur.entrada = ts;
          if (tipo === 'saida') cur.saida = ts;
        });
      }

      const details: DailyDetail[] = presencas.map((p) => {
        const pid = String(p.id);
        const rs = registosMap.get(pid);

        return {
          presenca_dia_id: pid,
          data: String(p.data),
          obra_nome: p.obra?.nome ? String(p.obra.nome) : 'Sem obra',
          horas: Number(p.total_horas || 0),
          entrada: rs?.entrada || null,
          saida: rs?.saida || null,
          faltou: Boolean(p.faltou),
          justificacao_falta: p.justificacao_falta ? String(p.justificacao_falta) : null,
        };
      });

      setDailyDetails(details);
    } catch (e: any) {
      console.error(e);
      toast.error('Erro ao carregar detalhes do colaborador');
      setDailyDetails([]);
    } finally {
      setLoadingDetails(false);
    }
  };

  const kpiCard = (
    icon: React.ReactNode,
    label: string,
    value: React.ReactNode,
    hint?: string,
    tone?: 'default' | 'warn'
  ) => (
    <Card className={`p-4 ${cardBase}`}>
      <div className="flex items-center gap-3">
        <div
          className="p-2 rounded-xl ring-1 ring-black/5 dark:ring-white/10"
          style={{ background: tone === 'warn' ? '#FEF3C7' : '#EFF6FF' }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-slate-600 dark:text-slate-300">{label}</div>
          <div className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate">{value}</div>
          {hint && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{hint}</div>}
        </div>
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div className="min-w-0">
  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
    Resumo do período
  </div>

  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
    Apuramento por colaborador (período {INICIO_DIA} do mês anterior até {FECHO_DIA} do mês selecionado),
    com horas, faltas e total a pagar.
  </p>

  <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
    Período atual: <span className="font-semibold">{periodoLabel}</span>
  </div>
</div>


        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 justify-end">
          <Button
            variant="secondary"
            onClick={exportCSV}
            className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
          >
            <Download size={16} className="mr-2" />
            Exportar CSV
          </Button>

          <Button
            variant="secondary"
            onClick={() => toast.info('Exportação PDF: ligar quando você quiser')}
            className="hidden sm:inline-flex dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
          >
            <FileText size={16} className="mr-2" />
            Exportar PDF
          </Button>

          <Button
            variant="secondary"
            onClick={loadColaboradoresPagamento}
            className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
          >
            Atualizar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpiCard(<Euro size={20} className="text-emerald-700" />, 'Total a Pagar', eur(totals.totalPagar))}
        {kpiCard(<Clock size={20} className="text-blue-700" />, 'Total de Horas', `${totals.totalHoras.toFixed(1)}h`)}
        {kpiCard(<Calendar size={20} className="text-purple-700" />, 'Colaboradores', totals.totalColaboradores)}
        {kpiCard(
          <AlertTriangle size={20} className="text-amber-700" />,
          'Pendências',
          `${totals.semIban + totals.semValorHora}`,
          `${totals.semIban} sem IBAN • ${totals.semValorHora} sem valor/h`,
          totals.semIban + totals.semValorHora > 0 ? 'warn' : 'default'
        )}
      </div>

      {/* Lista principal */}
      <Card className={`p-4 sm:p-6 ${cardBase}`}>
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 mb-6">
          {/* Período + filtros */}
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="min-w-[260px]">
              <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {monthNames[selectedMonth - 1]} {selectedYear}{' '}
                <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(fecho dia {FECHO_DIA})</span>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                {formatDateShortPT(rangeStartISO)} a {formatDateShortPT(rangeEndISO)}
              </div>
            </div>

            <div className="w-full sm:w-auto">
              <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Mês (fecho)</div>
              <Input
                type="month"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                className="w-full sm:min-w-[180px] dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="w-full sm:w-auto">
              <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Colaborador</div>
              <Select
                value={colaboradorFilterId}
                onChange={(e) => setColaboradorFilterId(e.target.value)}
                options={[
                  { value: '', label: 'Todos' },
                  ...colaboradores
                    .slice()
                    .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo))
                    .map((c) => ({ value: c.id, label: c.nome_completo })),
                ]}
                className="w-full sm:min-w-[260px] dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Pesquisa */}
          <div className="flex items-center gap-3 justify-end">
            <div className="relative w-full xl:w-[420px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
              <input
                type="text"
                placeholder="Pesquisar colaborador, obra ou IBAN…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm text-slate-900
                           focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent
                           dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
          </div>
        </div>

        {/* Conteúdo */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: BRAND.blue }} />
            <p className="text-slate-600 dark:text-slate-400 mt-4">Carregando dados…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Calendar size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
            <p className="text-slate-600 dark:text-slate-400">Nenhum colaborador encontrado para este período</p>
          </div>
        ) : (
          <>
            {/* MOBILE: cards */}
            <div className="md:hidden space-y-3">
              {filtered.map((c) => {
                const missingRate = !c.valor_hora_base;
                const missingIban = !c.iban;

                const obras = c.obras_trabalhadas || [];
                const showObras = obras.slice(0, 2);
                const remaining = Math.max(0, obras.length - showObras.length);

                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openDetails(c)}
                    className={[
                      'w-full text-left rounded-2xl border border-slate-200 bg-white shadow-sm p-4 transition',
                      'hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]/30',
                      'dark:border-slate-800/70 dark:bg-slate-900/60 dark:hover:bg-slate-900/70',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {c.foto_url ? (
                          <img
                            src={c.foto_url}
                            alt={c.nome_completo}
                            className="w-11 h-11 rounded-2xl object-cover border border-slate-200 dark:border-slate-800"
                          />
                        ) : (
                          <div
                            className="w-11 h-11 rounded-2xl text-white flex items-center justify-center font-semibold"
                            style={{ background: BRAND.blue }}
                          >
                            {getInitials(c.nome_completo)}
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{c.nome_completo}</div>

                          <div className="mt-1 flex flex-wrap gap-2">
                            {missingRate && (
                              <Pill tone="warn" icon={<AlertTriangle size={12} />}>
                                Sem valor/h
                              </Pill>
                            )}
                            {missingIban && (
                              <Pill tone="warn" icon={<AlertTriangle size={12} />}>
                                Sem IBAN
                              </Pill>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-slate-500 dark:text-slate-400">Total</div>
                        <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                          {eur(c.total_pagar)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800/70 dark:bg-slate-950/25">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Horas</div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{c.horas_total.toFixed(1)}h</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800/70 dark:bg-slate-950/25">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Dias</div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{c.dias_trabalhados}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800/70 dark:bg-slate-950/25">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Faltas</div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{c.faltas}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">€/Hora</div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {c.valor_hora_base ? eur(c.valor_hora_base) : 'N/A'}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">Último</div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {c.ultimo_registro ? formatDateShortPT(c.ultimo_registro) : '—'}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {c.iban ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyIBAN(c.iban!);
                            }}
                            className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-950/35"
                            title="Copiar IBAN"
                          >
                            <Copy size={16} className="text-slate-700 dark:text-slate-200" />
                          </button>
                        ) : (
                          <div
                            className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500"
                            title="Sem IBAN"
                          >
                            <Copy size={16} />
                          </div>
                        )}

                        <div
                          className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center"
                          title="Ver detalhes"
                        >
                          <Eye size={16} className="text-slate-700 dark:text-slate-200" />
                        </div>
                      </div>
                    </div>

                    {obras.length > 0 && (
                      <div className="mt-3">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">Obras</div>
                        <div className="flex flex-wrap gap-2">
                          {showObras.map((o, i) => (
                            <Badge key={`${c.id}-mobra-${i}`} variant="default" className="text-xs">
                              {o}
                            </Badge>
                          ))}
                          {remaining > 0 && <span className="text-xs text-slate-500 dark:text-slate-400">+{remaining}</span>}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}

              {/* Totais (mobile) */}
              <div className="mt-2 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/25">
                <div className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-semibold">{filtered.length}</span> colaborador(es) •{' '}
                  <span className="font-semibold">{totals.totalHoras.toFixed(1)}h</span> •{' '}
                  <span className="font-semibold">{totals.totalDias}</span> dias •{' '}
                  <span className="font-semibold">{totals.faltas}</span> faltas
                </div>
                <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                  Total a pagar:{' '}
                  <span className="font-bold text-emerald-700 dark:text-emerald-300">{eur(totals.totalPagar)}</span>
                </div>
              </div>
            </div>

            {/* DESKTOP: tabela */}
            <div className="hidden md:block overflow-x-auto">
              {/* DICA: AÇÕES sticky à direita + colunas pesadas só em xl+ */}
              <table className="w-full min-w-[980px]">
                <thead className="border-b border-slate-200 dark:border-slate-800/70">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Colaborador
                    </th>

                    <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Horas
                    </th>

                    <th className="hidden lg:table-cell text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Dias
                    </th>

                    <th className="hidden lg:table-cell text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Faltas
                    </th>

                    <th className="hidden lg:table-cell text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      €/Hora
                    </th>

                    <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Total
                    </th>

                    <th className="hidden xl:table-cell text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      IBAN
                    </th>

                    <th className="hidden xl:table-cell text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Obras
                    </th>

                    <th className="hidden xl:table-cell text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Último registo
                    </th>

                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Pendências
                    </th>

                    <th
                      className="sticky right-0 z-10 text-center py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300
                                 bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800/70"
                    >
                      Ações
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {filtered.map((c) => {
                    const missingRate = !c.valor_hora_base;
                    const missingIban = !c.iban;

                    const obras = c.obras_trabalhadas || [];
                    const obraPrincipal = obras[0] || null;
                    const restantes = obras.length > 1 ? obras.slice(1) : [];

                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-slate-50 transition dark:hover:bg-slate-950/35 cursor-pointer"
                        onClick={() => openDetails(c)}
                        title="Abrir detalhes"
                      >
                        <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-3">
                            {c.foto_url ? (
                              <img
                                src={c.foto_url}
                                alt={c.nome_completo}
                                className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-slate-800"
                              />
                            ) : (
                              <div
                                className="w-10 h-10 rounded-xl text-white flex items-center justify-center font-semibold"
                                style={{ background: BRAND.blue }}
                              >
                                {getInitials(c.nome_completo)}
                              </div>
                            )}

                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {c.nome_completo}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {formatDateShortPT(rangeStartISO)}–{formatDateShortPT(rangeEndISO)}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 px-4 text-right font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {c.horas_total.toFixed(1)}h
                        </td>

                        <td className="hidden lg:table-cell py-2.5 px-4 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                          {c.dias_trabalhados}
                        </td>

                        <td className="hidden lg:table-cell py-2.5 px-4 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                          {c.faltas}
                        </td>

                        <td className="hidden lg:table-cell py-2.5 px-4 text-right tabular-nums">
                          {c.valor_hora_base ? (
                            <span className="font-semibold text-slate-900 dark:text-slate-100">{eur(c.valor_hora_base)}</span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-300 text-xs font-semibold">N/A</span>
                          )}
                        </td>

                        <td className="py-2.5 px-4 text-right tabular-nums">
                          <span className="font-bold text-emerald-700 dark:text-emerald-300">{eur(c.total_pagar)}</span>
                        </td>

                        <td className="hidden xl:table-cell py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                          {c.iban ? (
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate max-w-[190px]">
                                {c.iban}
                              </span>
                              <button
                                onClick={() => copyIBAN(c.iban!)}
                                className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-950/35"
                                title="Copiar IBAN"
                              >
                                <Copy size={14} className="text-slate-600 dark:text-slate-300" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 text-sm">—</span>
                          )}
                        </td>

                        <td className="hidden xl:table-cell py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                          {obras.length === 0 ? (
                            <span className="text-slate-400 dark:text-slate-500 text-sm">—</span>
                          ) : (
                            <div className="relative inline-flex items-center gap-2">
                              <Badge variant="default" className="text-xs">
                                {obraPrincipal}
                              </Badge>

                              {restantes.length > 0 && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenObrasFor((prev) => (prev === c.id ? null : c.id));
                                    }}
                                    className="px-2 py-1 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/30 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-950/45"
                                    title="Ver todas as obras"
                                  >
                                    +{restantes.length}
                                  </button>

                                  {openObrasFor === c.id && (
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute left-0 top-[110%] z-20 w-[320px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-lg"
                                    >
                                      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800/70">
                                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">Obras no período</div>
                                        <button
                                          className="h-7 w-7 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-950/35"
                                          onClick={() => setOpenObrasFor(null)}
                                          aria-label="Fechar obras"
                                          title="Fechar"
                                        >
                                          <X size={14} className="text-slate-600 dark:text-slate-300" />
                                        </button>
                                      </div>

                                      <div className="max-h-[220px] overflow-auto p-3 space-y-2">
                                        {obras.map((o, i) => (
                                          <div key={`${c.id}-obra-pop-${i}`} className="text-sm text-slate-700 dark:text-slate-300">
                                            • {o}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="hidden xl:table-cell py-2.5 px-4 text-sm text-slate-700 dark:text-slate-300">
                          {c.ultimo_registro ? formatDatePT(c.ultimo_registro) : '—'}
                        </td>

                        <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-wrap gap-2">
                            {missingRate && (
                              <Pill tone="warn" icon={<AlertTriangle size={12} />}>
                                Sem valor/h
                              </Pill>
                            )}
                            {missingIban && (
                              <Pill tone="warn" icon={<AlertTriangle size={12} />}>
                                Sem IBAN
                              </Pill>
                            )}
                            {!missingRate && !missingIban && <Pill>OK</Pill>}
                          </div>
                        </td>

                        <td
                          className="sticky right-0 z-10 py-2.5 px-4 text-center bg-white dark:bg-slate-950
                                     border-l border-slate-200 dark:border-slate-800/70"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => openDetails(c)}
                            className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                          >
                            <Eye size={14} className="mr-1" />
                            Ver
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-5 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-semibold">{filtered.length}</span> colaborador(es) •{' '}
                  <span className="font-semibold">{totals.totalHoras.toFixed(1)}h</span> •{' '}
                  <span className="font-semibold">{totals.totalDias}</span> dias •{' '}
                  <span className="font-semibold">{totals.faltas}</span> faltas
                </div>

                <div className="text-sm text-slate-700 dark:text-slate-300">
                  Total a pagar:{' '}
                  <span className="font-bold text-emerald-700 dark:text-emerald-300">{eur(totals.totalPagar)}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Drawer Detalhes (mantive igual, só ajustes pequenos) */}
      {drawerOpen && selectedColaborador && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={closeDrawer} />

          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white dark:bg-slate-950 shadow-2xl border-l border-slate-200 dark:border-slate-800 overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-950 z-10 border-b border-slate-200 dark:border-slate-800 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  {selectedColaborador.foto_url ? (
                    <img
                      src={selectedColaborador.foto_url}
                      alt={selectedColaborador.nome_completo}
                      className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-slate-800"
                    />
                  ) : (
                    <div
                      className="w-16 h-16 rounded-2xl text-white flex items-center justify-center text-xl font-bold"
                      style={{ background: BRAND.blue }}
                    >
                      {getInitials(selectedColaborador.nome_completo)}
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Colaborador</div>
                    <div className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
                      {selectedColaborador.nome_completo}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">{periodoLabel}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      toast.info('Configurar rota do perfil (ex.: /colaboradores/:id)');
                    }}
                    className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                  >
                    <ExternalLink size={14} className="mr-1" />
                    Ver Perfil
                  </Button>

                  <button
                    onClick={closeDrawer}
                    className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-950/35"
                    aria-label="Fechar"
                    title="Fechar"
                  >
                    <span className="text-xl leading-none">×</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/25 p-3">
                  <div className="text-xs text-slate-600 dark:text-slate-400">Horas</div>
                  <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {selectedColaborador.horas_total.toFixed(1)}h
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/25 p-3">
                  <div className="text-xs text-slate-600 dark:text-slate-400">Dias</div>
                  <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {selectedColaborador.dias_trabalhados}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/25 p-3">
                  <div className="text-xs text-slate-600 dark:text-slate-400">€/Hora</div>
                  <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {selectedColaborador.valor_hora_base ? eur(selectedColaborador.valor_hora_base) : 'N/A'}
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/25 bg-emerald-50 dark:bg-emerald-500/10 p-3">
                  <div className="text-xs text-emerald-700 dark:text-emerald-200">Total a pagar</div>
                  <div className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                    {eur(selectedColaborador.total_pagar)}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                {selectedColaborador.iban ? (
                  <div className="p-3 rounded-xl border border-blue-200 dark:border-blue-500/25 bg-blue-50 dark:bg-blue-500/10 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-blue-700 dark:text-blue-200">IBAN</div>
                      <div className="font-mono text-sm text-blue-900 dark:text-blue-100 truncate">
                        {selectedColaborador.iban}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => copyIBAN(selectedColaborador.iban!)}
                      className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                    >
                      <Copy size={14} className="mr-1" />
                      Copiar
                    </Button>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200 text-sm">
                    IBAN não definido para este colaborador.
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">Obras no período</h3>
                {selectedColaborador.obras_trabalhadas.length === 0 ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">—</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedColaborador.obras_trabalhadas.map((o, i) => (
                      <Badge key={`obra-${i}`} variant="default">
                        {o}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">Registo diário</h3>

                {loadingDetails ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{ borderColor: BRAND.blue }} />
                  </div>
                ) : dailyDetails.length === 0 ? (
                  <div className="text-sm text-slate-500 dark:text-slate-400">Sem registos neste período.</div>
                ) : (
                  <div className="space-y-2">
                    {dailyDetails.map((d) => (
                      <div
                        key={d.presenca_dia_id}
                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950/35 transition"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {new Date(d.data).toLocaleDateString('pt-PT', {
                                  day: '2-digit',
                                  month: 'short',
                                  weekday: 'short',
                                })}
                              </div>
                              <Badge variant="default" className="text-xs">
                                {d.obra_nome}
                              </Badge>
                              {d.faltou ? (
                                <Badge variant="warning" className="text-xs">
                                  Falta
                                </Badge>
                              ) : (
                                <Badge variant="success" className="text-xs">
                                  Presença
                                </Badge>
                              )}
                            </div>

                            {d.faltou && d.justificacao_falta && (
                              <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                                <span className="font-semibold">Justificação:</span> {d.justificacao_falta}
                              </div>
                            )}
                          </div>

                          <div className="text-right">
                            {d.faltou ? (
                              <div className="text-sm text-slate-600 dark:text-slate-400">—</div>
                            ) : (
                              <>
                                <div className="text-sm text-slate-600 dark:text-slate-300 flex items-center justify-end gap-2">
                                  <Clock size={14} className="text-slate-400 dark:text-slate-500" />
                                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                                    {d.horas.toFixed(1)}h
                                  </span>
                                </div>
                                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                  {formatTimePT(d.entrada)} → {formatTimePT(d.saida)}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  onClick={exportCSV}
                  className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                >
                  <Download size={16} className="mr-2" />
                  Exportar CSV
                </Button>

                <Button
                  variant="secondary"
                  onClick={closeDrawer}
                  className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                >
                  Fechar
                </Button>
              </div>

              <div className="text-xs text-slate-400 dark:text-slate-500">
                Nota: entrada/saída vem de <span className="font-semibold">presencas_registos</span>. Se faltar entrada ou saída, aparece “—”.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
