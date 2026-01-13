// src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import {
  Users,
  Building2,
  FileWarning,
  Clock,
  TrendingUp,
  AlertCircle,
  Plus,
  RefreshCw,
  ArrowUpRight,
  FileText,
  UserPlus,
  ClipboardList,
  Euro,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { checkAndNotifyExpiredDocuments } from '../lib/documentAlerts';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface DashboardStats {
  colaboradoresAtivos: number;
  colaboradoresInativos: number;
  obrasAtivas: number;
  obrasConcluidas: number;
  documentosVencidos: number;
  documentosAVencer: number;
  horasSemana: number;
  custoAcumulado: number;
}

type HorasSemanaPoint = { semana: string; horas: number };
type CustoObraPoint = { nome: string; custo: number };

const BRAND = {
  blue: '#0B4F8A',
  blueDark: '#083B68',
  orange: '#F5A623',
};

const PIE_COLORS = [BRAND.blue, BRAND.orange, '#10b981', '#ef4444', '#8b5cf6'];

function formatCurrencyEUR(value: number) {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

function clampText(text: string, max = 18) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function getWeekLabel(d: Date) {
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: any[];
  label?: any;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur px-3 py-2 shadow-lg
                 dark:border-slate-700/80 dark:bg-slate-950/90 dark:shadow-black/40"
    >
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {payload[0]?.name}: {payload[0]?.value}
      </div>
    </div>
  );
}

interface DashboardProps {
  onNavigate?: (page: string) => void;
  onNovaObra?: () => void;
  onNovoColaborador?: () => void;
}

type MobilePanelTab = 'acoes' | 'obras' | 'custos';

export default function Dashboard({ onNavigate, onNovaObra, onNovoColaborador }: DashboardProps) {
  const { user } = useAuth();

  const [stats, setStats] = useState<DashboardStats>({
    colaboradoresAtivos: 0,
    colaboradoresInativos: 0,
    obrasAtivas: 0,
    obrasConcluidas: 0,
    documentosVencidos: 0,
    documentosAVencer: 0,
    horasSemana: 0,
    custoAcumulado: 0,
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [horasPorSemana, setHorasPorSemana] = useState<HorasSemanaPoint[]>([]);
  const [custoPorObra, setCustoPorObra] = useState<CustoObraPoint[]>([]);

  // Tabs do painel mobile
  const [mobileTab, setMobileTab] = useState<MobilePanelTab>('acoes');

  useEffect(() => {
    loadDashboardData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) checkAndNotifyExpiredDocuments(user.id);
  }, [user]);

  const loadDashboardData = async (firstLoad = false) => {
    try {
      firstLoad ? setLoading(true) : setRefreshing(true);

      const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const cutoff30ISO = cutoff30.toISOString().split('T')[0];

      const [colaboradores, obras, documentos, presencas] = await Promise.all([
        supabase.from('colaboradores').select('status'),
        supabase.from('obras').select('status, custo_mao_obra_acumulado, nome'),
        supabase.from('documentos').select('data_validade'),
        supabase.from('presencas_dia').select('total_horas, data').gte('data', cutoff30ISO),
      ]);

      const colaboradoresAtivos =
        colaboradores.data?.filter((c) => c.status === 'ativo').length || 0;
      const colaboradoresInativos =
        colaboradores.data?.filter((c) => c.status === 'inativo').length || 0;

      const obrasAtivas = obras.data?.filter((o) => o.status === 'ativa').length || 0;
      const obrasConcluidas = obras.data?.filter((o) => o.status === 'concluida').length || 0;

      const hoje = startOfDay(new Date());
      const em30Dias = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);

      const documentosVencidos =
        documentos.data?.filter((d) => d.data_validade && new Date(d.data_validade) < hoje).length ||
        0;

      const documentosAVencer =
        documentos.data?.filter((d) => {
          if (!d.data_validade) return false;
          const dv = new Date(d.data_validade);
          return dv >= hoje && dv <= em30Dias;
        }).length || 0;

      const diasAtras7 = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
      const horasUltimos7Dias =
        presencas.data?.filter((p) => {
          const dataPresenca = new Date(p.data);
          return dataPresenca >= diasAtras7;
        }) || [];

      const horasSemana =
        horasUltimos7Dias.reduce((acc, p) => acc + (p.total_horas || 0), 0) || 0;

      const obrasCustos = obras.data || [];
      const custoAcumulado = obrasCustos.reduce(
        (acc, o) => acc + (o.custo_mao_obra_acumulado || 0),
        0
      );

      setStats({
        colaboradoresAtivos,
        colaboradoresInativos,
        obrasAtivas,
        obrasConcluidas,
        documentosVencidos,
        documentosAVencer,
        horasSemana: Math.round(horasSemana * 10) / 10,
        custoAcumulado,
      });

      const semanas = [4, 3, 2, 1, 0].map((weekOffset) => {
        const inicioSemana = startOfDay(
          new Date(hoje.getTime() - weekOffset * 7 * 24 * 60 * 60 * 1000)
        );
        const fimSemana = new Date(inicioSemana.getTime() + 7 * 24 * 60 * 60 * 1000);

        const horasDaSemana =
          presencas.data
            ?.filter((p) => {
              const dataPresenca = new Date(p.data);
              return dataPresenca >= inicioSemana && dataPresenca < fimSemana;
            })
            .reduce((acc, p) => acc + (p.total_horas || 0), 0) || 0;

        return {
          semana: getWeekLabel(inicioSemana),
          horas: Math.round(horasDaSemana * 10) / 10,
        };
      });

      setHorasPorSemana(semanas);

      const obrasCustosTop = [...obrasCustos]
        .sort((a, b) => (b.custo_mao_obra_acumulado || 0) - (a.custo_mao_obra_acumulado || 0))
        .slice(0, 5)
        .map((o) => ({
          nome: clampText(o.nome || 'Obra', 18),
          custo: o.custo_mao_obra_acumulado || 0,
        }));

      setCustoPorObra(obrasCustosTop);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const totalAlertasDocs = stats.documentosVencidos + stats.documentosAVencer;

  const kpis = useMemo(
    () => [
      {
        label: 'Colaboradores',
        value: stats.colaboradoresAtivos,
        sub: `${stats.colaboradoresInativos} inativos`,
        icon: Users,
        badgeBg: 'bg-[#0B4F8A]/10 dark:bg-[#0B4F8A]/20',
        iconColor: 'text-[#0B4F8A] dark:text-[#66A7E6]',
        accent: 'from-[#0B4F8A]/14 to-transparent dark:from-[#0B4F8A]/20 dark:to-transparent',
      },
      {
        label: 'Obras ativas',
        value: stats.obrasAtivas,
        sub: `${stats.obrasConcluidas} concluídas`,
        icon: Building2,
        badgeBg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        accent: 'from-emerald-500/12 to-transparent dark:from-emerald-500/18 dark:to-transparent',
      },
      {
        label: 'Documentos',
        value: totalAlertasDocs,
        sub: `${stats.documentosVencidos} vencidos`,
        icon: FileWarning,
        badgeBg: 'bg-red-500/10 dark:bg-red-500/15',
        iconColor: 'text-red-600 dark:text-red-400',
        accent: 'from-red-500/12 to-transparent dark:from-red-500/18 dark:to-transparent',
      },
      {
        label: 'Horas (7d)',
        value: `${stats.horasSemana}h`,
        sub: `Custo: ${formatCurrencyEUR(stats.custoAcumulado)}`,
        icon: Clock,
        badgeBg: 'bg-[#F5A623]/15 dark:bg-[#F5A623]/20',
        iconColor: 'text-[#B86F00] dark:text-[#F7C56B]',
        accent: 'from-[#F5A623]/14 to-transparent dark:from-[#F5A623]/18 dark:to-transparent',
      },
    ],
    [
      stats.colaboradoresAtivos,
      stats.colaboradoresInativos,
      stats.obrasAtivas,
      stats.obrasConcluidas,
      stats.documentosVencidos,
      totalAlertasDocs,
      stats.horasSemana,
      stats.custoAcumulado,
    ]
  );

  // Variáveis de cor para Recharts (evita “branco estourado” no dark)
  const chartVars =
    ' [--chart-grid:rgb(226_232_240)] [--chart-tick:rgb(100_116_139)] ' +
    ' dark:[--chart-grid:rgb(51_65_85)] dark:[--chart-tick:rgb(148_163_184)]';

  // Componente: botão tab do painel mobile
  const TabBtn = ({
    id,
    label,
    icon,
  }: {
    id: MobilePanelTab;
    label: string;
    icon: React.ReactNode;
  }) => {
    const active = mobileTab === id;
    return (
      <button
        type="button"
        onClick={() => setMobileTab(id)}
        className={[
          'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition',
          active
            ? 'bg-[#0B4F8A] text-white shadow-sm'
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800',
        ].join(' ')}
      >
        {icon}
        {label}
      </button>
    );
  };

  const ActionTile = ({
    title,
    icon,
    onClick,
  }: {
    title: string;
    icon: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left shadow-sm transition
                 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]/40
                 dark:border-slate-800/70 dark:bg-slate-900/40 dark:shadow-black/30"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="h-10 w-10 rounded-xl bg-white/70 flex items-center justify-center ring-1 ring-black/5
                        dark:bg-slate-900/60 dark:ring-white/10">
          {icon}
        </div>
        <ArrowUpRight size={18} className="text-slate-400 dark:text-slate-500" />
      </div>
      <div className="mt-3 font-semibold text-slate-900 dark:text-slate-100">{title}</div>
    </button>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div
          className="rounded-3xl border border-slate-200 bg-gradient-to-br from-[#0B4F8A] to-[#083B68] p-6 shadow-sm
                     dark:border-slate-800/70 dark:shadow-black/30"
        >
          <div className="h-6 w-48 rounded bg-white/20 animate-pulse" />
          <div className="mt-3 h-4 w-80 rounded bg-white/15 animate-pulse" />
        </div>

        {/* Skeleton KPIs (já em 2 colunas no mobile) */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm
                         dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-3">
                  <div className="h-3 w-24 sm:w-32 rounded bg-slate-100 animate-pulse dark:bg-slate-800/70" />
                  <div className="h-7 sm:h-8 w-16 sm:w-20 rounded bg-slate-100 animate-pulse dark:bg-slate-800/70" />
                  <div className="h-3 w-20 sm:w-24 rounded bg-slate-100 animate-pulse dark:bg-slate-800/70" />
                </div>
                <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-slate-100 animate-pulse dark:bg-slate-800/70" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero / Header */}
      <div
        className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-[#0B4F8A] to-[#083B68] p-5 sm:p-6 shadow-sm
                   dark:border-slate-800/70 dark:shadow-black/35"
      >
        <div className="absolute inset-0 opacity-30">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#F5A623]/30 blur-3xl" />
          <div className="absolute -bottom-28 -left-28 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        </div>

        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-white/70 text-sm">Sistema Diâmetro • Gestão de Obras & Colaboradores</p>
            <h1 className="mt-2 text-2xl md:text-3xl font-semibold tracking-tight text-white">
              Dashboard operacional
            </h1>
            <p className="mt-2 text-white/75 text-sm max-w-2xl">
              Visão rápida de equipas, obras, conformidade documental e produtividade — com foco em
              execução e controlo.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <Button
              variant="secondary"
              className="w-full sm:w-auto bg-white/10 text-white hover:bg-white/15 border border-white/15"
              onClick={() => loadDashboardData(false)}
            >
              <RefreshCw size={16} className={refreshing ? 'mr-2 animate-spin' : 'mr-2'} />
              {refreshing ? 'A atualizar…' : 'Atualizar'}
            </Button>

            <Button
              className="w-full sm:w-auto bg-[#F5A623] hover:bg-[#E79A17] text-slate-900"
              onClick={onNovaObra}
            >
              <Plus size={16} className="mr-2" />
              Nova obra
            </Button>
          </div>
        </div>
      </div>

      {/* KPIs — 2 colunas no mobile (2 em cima + 2 em baixo) */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card
              key={k.label}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition
                         hover:-translate-y-0.5 hover:shadow-md
                         dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30 dark:hover:bg-slate-900/70"
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${k.accent}`} />
              <CardContent className="relative pt-5 sm:pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">{k.label}</p>
                    <p className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                      {k.value}
                    </p>
                    <p className="mt-1 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                      {k.sub}
                    </p>
                  </div>

                  <div
                    className={`h-11 w-11 sm:h-12 sm:w-12 rounded-xl ${k.badgeBg} flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10`}
                  >
                    <Icon className={k.iconColor} size={20} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Alertas documentos */}
      {totalAlertasDocs > 0 && (
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-4">
                <div
                  className="h-11 w-11 rounded-xl bg-red-500/10 flex items-center justify-center ring-1 ring-red-500/15 flex-shrink-0
                             dark:bg-red-500/15 dark:ring-red-500/20"
                >
                  <AlertCircle className="text-red-600 dark:text-red-400" size={20} />
                </div>

                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                    Documentos requerem atenção
                  </h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {stats.documentosVencidos > 0 && (
                      <span className="font-medium text-red-600 dark:text-red-400">
                        {stats.documentosVencidos} vencido(s)
                      </span>
                    )}
                    {stats.documentosVencidos > 0 && stats.documentosAVencer > 0 ? ' • ' : ''}
                    {stats.documentosAVencer > 0 && (
                      <span className="font-medium text-amber-700 dark:text-amber-300">
                        {stats.documentosAVencer} a vencer (30 dias)
                      </span>
                    )}
                    <span className="text-slate-500 dark:text-slate-400">
                      {' '}
                      — revise para evitar bloqueios em obra.
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full sm:w-auto border border-slate-200 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                  onClick={() => onNavigate?.('documentos')}
                >
                  Ver documentos
                  <ArrowUpRight size={16} className="ml-2" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Painel mobile (tabs) — inspirado nos teus prints */}
      <Card className="sm:hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
        <CardHeader className="pb-3">
          <div className="text-center">
            <div className="font-semibold text-slate-900 dark:text-slate-100">Painel de Ações e Indicadores</div>
            <div className="mt-3 flex items-center justify-center gap-2">
              <TabBtn id="acoes" label="Ações" icon={<ClipboardList size={16} />} />
              <TabBtn id="obras" label="Obras" icon={<Building2 size={16} />} />
              <TabBtn id="custos" label="Custos" icon={<Euro size={16} />} />
            </div>
          </div>
        </CardHeader>

        <CardContent className={`pt-0 ${chartVars}`}>
          {mobileTab === 'acoes' && (
            <div className="grid grid-cols-2 gap-3">
              <ActionTile
                title="Pedido"
                icon={<ClipboardList size={18} className="text-[#0B4F8A]" />}
                onClick={onNovaObra}
              />
              <ActionTile
                title="Obra"
                icon={<Building2 size={18} className="text-emerald-600" />}
                onClick={onNovaObra}
              />
              <ActionTile
                title="Documento"
                icon={<FileText size={18} className="text-[#B86F00]" />}
                onClick={() => onNavigate?.('documentos')}
              />
              <ActionTile
                title="Equipe"
                icon={<Users size={18} className="text-slate-700 dark:text-slate-200" />}
                onClick={() => onNavigate?.('colaboradores')}
              />
            </div>
          )}

          {mobileTab === 'obras' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800/70 dark:bg-slate-900/40">
                <div className="text-sm text-slate-600 dark:text-slate-300">Obras ativas</div>
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">{stats.obrasAtivas}</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800/70 dark:bg-slate-900/30">
                <div className="flex items-center gap-2 px-1 pb-2">
                  <TrendingUp size={16} className="text-[#0B4F8A] dark:text-[#66A7E6]" />
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Horas (5 semanas)</div>
                </div>

                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={horasPorSemana} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke="var(--chart-grid)" />
                    <XAxis
                      dataKey="semana"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'var(--chart-tick)', fontSize: 12 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'var(--chart-tick)', fontSize: 12 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="horas" name="Horas" fill={BRAND.blue} radius={[10, 10, 4, 4]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {mobileTab === 'custos' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800/70 dark:bg-slate-900/40">
                <div className="text-sm text-slate-600 dark:text-slate-300">Custo acumulado</div>
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {formatCurrencyEUR(stats.custoAcumulado)}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800/70 dark:bg-slate-900/30">
                {custoPorObra.length > 0 ? (
                  <>
                    <div className="flex items-center gap-2 px-1 pb-2">
                      <Euro size={16} className="text-[#F5A623]" />
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Top custos por obra
                      </div>
                    </div>

                    <ResponsiveContainer width="100%" height={190}>
                      <PieChart>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const p = payload[0]?.payload as CustoObraPoint;
                            return (
                              <div
                                className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur px-3 py-2 shadow-lg
                                           dark:border-slate-700/80 dark:bg-slate-950/90 dark:shadow-black/40"
                              >
                                <div className="text-xs text-slate-500 dark:text-slate-400">{p?.nome}</div>
                                <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {formatCurrencyEUR(p?.custo || 0)}
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Pie
                          data={custoPorObra}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={3}
                          dataKey="custo"
                          stroke="transparent"
                        >
                          {custoPorObra.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>

                    <div className="mt-2 space-y-2">
                      {custoPorObra.slice(0, 3).map((o, idx) => (
                        <div
                          key={`${o.nome}-${idx}`}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2
                                     dark:border-slate-800/70 dark:bg-slate-900/40"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }}
                            />
                            <span className="text-sm text-slate-700 truncate dark:text-slate-200">{o.nome}</span>
                          </div>
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {formatCurrencyEUR(o.custo)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-40 text-slate-400 dark:text-slate-500">
                    Sem dados disponíveis
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts (desktop/tablet) — escondido no mobile, porque o painel acima já cobre */}
      <div className="hidden sm:grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div
                  className="h-9 w-9 rounded-xl bg-[#0B4F8A]/10 flex items-center justify-center ring-1 ring-black/5
                             dark:bg-[#0B4F8A]/20 dark:ring-white/10"
                >
                  <TrendingUp size={18} className="text-[#0B4F8A] dark:text-[#66A7E6]" />
                </div>
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">Horas trabalhadas</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Últimas 5 semanas</div>
                </div>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400">
                Total 7 dias:{' '}
                <span className="font-medium text-slate-900 dark:text-slate-100">{stats.horasSemana}h</span>
              </div>
            </div>
          </CardHeader>

          <CardContent className={`pt-4 ${chartVars}`}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={horasPorSemana} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--chart-grid)" />
                <XAxis
                  dataKey="semana"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--chart-tick)', fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--chart-tick)', fontSize: 12 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="horas" name="Horas" fill={BRAND.blue} radius={[10, 10, 4, 4]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">Custo de mão de obra</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Top 5 por obra (acumulado)</div>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Total:{' '}
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {formatCurrencyEUR(stats.custoAcumulado)}
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className={`pt-4 ${chartVars}`}>
            {custoPorObra.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0]?.payload as CustoObraPoint;
                        return (
                          <div
                            className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur px-3 py-2 shadow-lg
                                       dark:border-slate-700/80 dark:bg-slate-950/90 dark:shadow-black/40"
                          >
                            <div className="text-xs text-slate-500 dark:text-slate-400">{p?.nome}</div>
                            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {formatCurrencyEUR(p?.custo || 0)}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Pie
                      data={custoPorObra}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="custo"
                      stroke="transparent"
                    >
                      {custoPorObra.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>

                <div className="space-y-2">
                  {custoPorObra.map((o, idx) => (
                    <div
                      key={`${o.nome}-${idx}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2
                                 dark:border-slate-800/70 dark:bg-slate-900/40"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }}
                        />
                        <span className="text-sm text-slate-700 truncate dark:text-slate-200">{o.nome}</span>
                      </div>
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {formatCurrencyEUR(o.custo)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-slate-400 dark:text-slate-500">
                Sem dados disponíveis
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ações rápidas (desktop/tablet) — no mobile você já tem no painel */}
      <Card className="hidden sm:block rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">Ações rápidas</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Fluxos mais usados no dia a dia operacional
              </div>
            </div>

            <div className="hidden md:flex items-center gap-2">
              <Button size="sm" className="bg-[#0B4F8A] hover:bg-[#083B68]" onClick={onNovaObra}>
                <Plus size={16} className="mr-2" />
                Nova obra
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="border border-slate-200 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                onClick={onNovoColaborador}
              >
                <Plus size={16} className="mr-2" />
                Novo colaborador
              </Button>
              <Button
                size="sm"
                className="bg-[#F5A623] hover:bg-[#E79A17] text-slate-900"
                onClick={() => onNavigate?.('presencas')}
              >
                <Plus size={16} className="mr-2" />
                Registar presença
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              className="group text-left rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm transition
                         hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]/40
                         dark:border-slate-800/70 dark:from-slate-900/70 dark:to-slate-900/40 dark:shadow-black/30 dark:hover:shadow-black/40"
              type="button"
              onClick={onNovaObra}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className="h-10 w-10 rounded-xl bg-[#0B4F8A]/10 flex items-center justify-center ring-1 ring-black/5
                             dark:bg-[#0B4F8A]/20 dark:ring-white/10"
                >
                  <ClipboardList size={18} className="text-[#0B4F8A] dark:text-[#66A7E6]" />
                </div>
                <ArrowUpRight
                  className="text-slate-400 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-300"
                  size={18}
                />
              </div>
              <div className="mt-3 font-semibold text-slate-900 dark:text-slate-100">Criar nova obra</div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Registe obra, equipas, custos e pontos de controlo.
              </div>
            </button>

            <button
              className="group text-left rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm transition
                         hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]/40
                         dark:border-slate-800/70 dark:from-slate-900/70 dark:to-slate-900/40 dark:shadow-black/30 dark:hover:shadow-black/40"
              type="button"
              onClick={onNovoColaborador}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className="h-10 w-10 rounded-xl bg-[#F5A623]/15 flex items-center justify-center ring-1 ring-black/5
                             dark:bg-[#F5A623]/20 dark:ring-white/10"
                >
                  <UserPlus size={18} className="text-[#B86F00] dark:text-[#F7C56B]" />
                </div>
                <ArrowUpRight
                  className="text-slate-400 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-300"
                  size={18}
                />
              </div>
              <div className="mt-3 font-semibold text-slate-900 dark:text-slate-100">Adicionar colaborador</div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Crie perfil, status e associação a obra/equipa.
              </div>
            </button>

            <button
              className="group text-left rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm transition
                         hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]/40
                         dark:border-slate-800/70 dark:from-slate-900/70 dark:to-slate-900/40 dark:shadow-black/30 dark:hover:shadow-black/40"
              type="button"
              onClick={() => onNavigate?.('presencas')}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center ring-1 ring-black/5
                             dark:bg-emerald-500/15 dark:ring-white/10"
                >
                  <FileText size={18} className="text-emerald-700 dark:text-emerald-400" />
                </div>
                <ArrowUpRight
                  className="text-slate-400 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-300"
                  size={18}
                />
              </div>
              <div className="mt-3 font-semibold text-slate-900 dark:text-slate-100">Registar presença</div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Lançe horas e consolide custos por obra e equipa.
              </div>
            </button>

            <button
              className="group text-left rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm transition
                         hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]/40
                         dark:border-slate-800/70 dark:from-slate-900/70 dark:to-slate-900/40 dark:shadow-black/30 dark:hover:shadow-black/40"
              type="button"
              onClick={() => onNavigate?.('documentos')}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center ring-1 ring-black/5
                             dark:bg-red-500/15 dark:ring-white/10"
                >
                  <FileWarning size={18} className="text-red-600 dark:text-red-400" />
                </div>
                <ArrowUpRight
                  className="text-slate-400 group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-300"
                  size={18}
                />
              </div>
              <div className="mt-3 font-semibold text-slate-900 dark:text-slate-100">Ver documentos</div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Validades, pendências e alertas por colaborador/obra.
              </div>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
