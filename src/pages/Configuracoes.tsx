// src/pages/Configuracoes.tsx
import { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import {
  Plus,
  Settings as SettingsIcon,
  CalendarDays,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Pencil,
  Power,
  Clock,
  Target,
  FileWarning,
  Shield,
  Info,
  RotateCcw,
  Undo2,
  Smartphone,
  Building2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { CargoModal } from '../components/configuracoes/CargoModal';
import { FeriadoModal } from '../components/configuracoes/FeriadoModal';

// ✅ novos tabs separados (mais fácil de operar)
import { PermissoesPlataformaTab } from '../components/configuracoes/permissoes/PermissoesPlataformaTab';
import { PermissoesAppTab } from '../components/configuracoes/permissoes/PermissoesAppTab';

type TabKey = 'regras' | 'cargos' | 'feriados' | 'plataforma' | 'app';

// OBS: no Supabase, colunas NUMERIC geralmente chegam como string no JS.
type Cargo = {
  id: string;
  nome: string;
  descricao: string | null;
  valor_hora_padrao: number; // normalizado
  ativo: boolean;
};

type Feriado = {
  id: string;
  nome: string;
  data: string; // YYYY-MM-DD
  tipo: string; // nacional | municipal | interno | etc
};

type SistemaConfig = {
  // Período
  dia_fecho_periodo: number; // ex: 22
  timezone: string; // ex: Europe/Lisbon

  // Jornada
  horas_dia: number; // ex: 8
  hora_entrada: string; // ex: 08:00
  hora_saida: string; // ex: 17:00
  pausa_minutos: number; // ex: 60
  descontar_pausa: boolean; // true

  // Presenças
  tolerancia_minutos: number; // ex: 10
  arredondamento_minutos: number; // ex: 15
  dia_sem_registo_gera_falta: boolean; // false = pendente

  // Horas extra
  multiplicador_hora_extra: number; // ex: 1.5
  exigir_aprovacao_extra: boolean; // true

  // Documentos
  dias_aviso_documentos: number; // ex: 30
  documento_vencido_bloqueia_presenca: boolean; // false
  documento_vencido_bloqueia_alocacao: boolean; // true
};

const DEFAULT_CONFIG: SistemaConfig = {
  dia_fecho_periodo: 22,
  timezone: 'Europe/Lisbon',

  horas_dia: 8,
  hora_entrada: '08:00',
  hora_saida: '17:00',
  pausa_minutos: 60,
  descontar_pausa: true,

  tolerancia_minutos: 10,
  arredondamento_minutos: 15,
  dia_sem_registo_gera_falta: false,

  multiplicador_hora_extra: 1.5,
  exigir_aprovacao_extra: true,

  dias_aviso_documentos: 30,
  documento_vencido_bloqueia_presenca: false,
  documento_vencido_bloqueia_alocacao: true,
};

const CONFIG_ID = '00000000-0000-0000-0000-000000000001';

const cardBase =
  'border border-slate-200 bg-white shadow-sm ' +
  'dark:border-slate-800/70 dark:bg-slate-950/30 dark:shadow-black/30';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function toNumber(v: unknown, fallback: number) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function toBool(v: unknown, fallback: boolean) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase().trim();
  if (s === 'true' || s === '1' || s === 't' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'f' || s === 'no') return false;
  return fallback;
}

function formatEUR(v: number) {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);
}

function isHHMM(v: string) {
  // 00:00–23:59
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '').trim());
}

function safeTimeOrDefault(v: unknown, fallback: string) {
  const s = String(v ?? '').trim();
  return isHHMM(s) ? s : fallback;
}

function safeTimezoneOrDefault(v: unknown, fallback: string) {
  const s = String(v ?? '').trim();
  return s ? s : fallback;
}

function safeDateForLocale(dateISO: string) {
  // Evita “voltar um dia” por timezone (usa meio-dia local).
  return new Date(`${dateISO}T12:00:00`);
}

function formatShortDatePT(dateISO: string) {
  const d = safeDateForLocale(dateISO);
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' });
}

function yearOf(dateISO: string) {
  return safeDateForLocale(dateISO).getFullYear();
}
function monthOf(dateISO: string) {
  return safeDateForLocale(dateISO).getMonth() + 1;
}

function toggleClass(on: boolean) {
  return on
    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-200'
    : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900/30 dark:border-slate-800 dark:text-slate-200';
}

function deepEqual(a: any, b: any) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeCargo(row: any): Cargo {
  return {
    id: String(row.id),
    nome: String(row.nome ?? ''),
    descricao: row.descricao ?? null,
    valor_hora_padrao: toNumber(row.valor_hora_padrao, 0),
    ativo: toBool(row.ativo, true),
  };
}

function normalizeFeriado(row: any): Feriado {
  return {
    id: String(row.id),
    nome: String(row.nome ?? ''),
    data: String(row.data ?? ''),
    tipo: String(row.tipo ?? 'nacional'),
  };
}

function normalizeConfigRow(row: any): SistemaConfig {
  return {
    dia_fecho_periodo: clamp(toNumber(row.dia_fecho_periodo, DEFAULT_CONFIG.dia_fecho_periodo), 1, 31),
    timezone: safeTimezoneOrDefault(row.timezone, DEFAULT_CONFIG.timezone),

    horas_dia: Math.max(1, toNumber(row.horas_dia, DEFAULT_CONFIG.horas_dia)),
    hora_entrada: safeTimeOrDefault(row.hora_entrada, DEFAULT_CONFIG.hora_entrada),
    hora_saida: safeTimeOrDefault(row.hora_saida, DEFAULT_CONFIG.hora_saida),
    pausa_minutos: Math.max(0, toNumber(row.pausa_minutos, DEFAULT_CONFIG.pausa_minutos)),
    descontar_pausa: toBool(row.descontar_pausa, DEFAULT_CONFIG.descontar_pausa),

    tolerancia_minutos: Math.max(0, toNumber(row.tolerancia_minutos, DEFAULT_CONFIG.tolerancia_minutos)),
    arredondamento_minutos: Math.max(0, toNumber(row.arredondamento_minutos, DEFAULT_CONFIG.arredondamento_minutos)),
    dia_sem_registo_gera_falta: toBool(row.dia_sem_registo_gera_falta, DEFAULT_CONFIG.dia_sem_registo_gera_falta),

    multiplicador_hora_extra: Math.max(1, toNumber(row.multiplicador_hora_extra, DEFAULT_CONFIG.multiplicador_hora_extra)),
    exigir_aprovacao_extra: toBool(row.exigir_aprovacao_extra, DEFAULT_CONFIG.exigir_aprovacao_extra),

    dias_aviso_documentos: Math.max(1, toNumber(row.dias_aviso_documentos, DEFAULT_CONFIG.dias_aviso_documentos)),
    documento_vencido_bloqueia_presenca: toBool(
      row.documento_vencido_bloqueia_presenca,
      DEFAULT_CONFIG.documento_vencido_bloqueia_presenca
    ),
    documento_vencido_bloqueia_alocacao: toBool(
      row.documento_vencido_bloqueia_alocacao,
      DEFAULT_CONFIG.documento_vencido_bloqueia_alocacao
    ),
  };
}

export function Configuracoes() {
  const [tab, setTab] = useState<TabKey>('regras');

  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros Cargos
  const [cargoSearch, setCargoSearch] = useState('');
  const [cargoStatus, setCargoStatus] = useState<'todos' | 'ativos' | 'inativos'>('todos');

  // Datas “fixas” da sessão (não recria Date a cada render)
  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();

  // Filtros Feriados
  const [feriadoSearch, setFeriadoSearch] = useState('');
  const [feriadoAno, setFeriadoAno] = useState<number>(currentYear);
  const [feriadoMes, setFeriadoMes] = useState<number | 'todos'>('todos');

  // Config do sistema
  const [cfg, setCfg] = useState<SistemaConfig>(DEFAULT_CONFIG);
  const [cfgBase, setCfgBase] = useState<SistemaConfig>(DEFAULT_CONFIG);
  const cfgDirty = useMemo(() => !deepEqual(cfg, cfgBase), [cfg, cfgBase]);
  const [savingCfg, setSavingCfg] = useState(false);

  // Modals
  const [cargoModalOpen, setCargoModalOpen] = useState(false);
  const [selectedCargo, setSelectedCargo] = useState<Cargo | null>(null);
  const [feriadoModalOpen, setFeriadoModalOpen] = useState(false);
  const [selectedFeriado, setSelectedFeriado] = useState<Feriado | null>(null);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    setLoading(true);

    const [cargosRes, feriadosRes, cfgRes] = await Promise.all([
      supabase.from('cargos').select('*').order('nome'),
      supabase.from('feriados').select('*').order('data'),
      supabase.from('configuracoes_sistema').select('*').eq('id', CONFIG_ID).maybeSingle(),
    ]);

    if (cargosRes.error) {
      console.error(cargosRes.error);
      toast.error('Sem acesso para listar cargos (permissões/RLS).');
    }
    if (feriadosRes.error) {
      console.error(feriadosRes.error);
      toast.error('Sem acesso para listar feriados (permissões/RLS).');
    }

    if (cargosRes.data) setCargos((cargosRes.data as any[]).map(normalizeCargo));
    if (feriadosRes.data) setFeriados((feriadosRes.data as any[]).map(normalizeFeriado));

    if (cfgRes.error) {
      console.error(cfgRes.error);
      toast.error('Não foi possível carregar configurações (permissões/RLS).');
      setCfg(DEFAULT_CONFIG);
      setCfgBase(DEFAULT_CONFIG);
    } else if (cfgRes.data) {
      const merged = normalizeConfigRow(cfgRes.data);
      setCfg(merged);
      setCfgBase(merged);
    } else {
      setCfg(DEFAULT_CONFIG);
      setCfgBase(DEFAULT_CONFIG);
    }

    setLoading(false);
  };

  const TabPill = ({
    id,
    label,
    icon: Icon,
    count,
  }: {
    id: TabKey;
    label: string;
    icon: any;
    count?: number;
  }) => {
    const active = tab === id;
    return (
      <button
        onClick={() => setTab(id)}
        className={[
          'inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition',
          active
            ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-200 dark:border-slate-800 dark:hover:bg-slate-950/40',
        ].join(' ')}
      >
        <Icon size={16} className={active ? 'text-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-300'} />
        {label}
        {typeof count === 'number' && (
          <span
            className={[
              'px-2 py-0.5 rounded-full text-xs',
              active
                ? 'bg-white/15 text-white dark:bg-slate-900/10 dark:text-slate-900'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-200',
            ].join(' ')}
          >
            {count}
          </span>
        )}
      </button>
    );
  };

  const cargosStats = useMemo(() => {
    const ativos = cargos.filter((c) => c.ativo).length;
    const inativos = cargos.length - ativos;
    return { total: cargos.length, ativos, inativos };
  }, [cargos]);

  const cargosFiltered = useMemo(() => {
    const s = cargoSearch.trim().toLowerCase();
    return cargos.filter((c) => {
      if (cargoStatus === 'ativos' && !c.ativo) return false;
      if (cargoStatus === 'inativos' && c.ativo) return false;

      if (!s) return true;
      const hay = `${c.nome} ${c.descricao ?? ''} ${c.valor_hora_padrao}`.toLowerCase();
      return hay.includes(s);
    });
  }, [cargos, cargoSearch, cargoStatus]);

  const feriadoAnosOptions = useMemo(() => {
    const years = new Set<number>(feriados.map((f) => yearOf(f.data)));
    years.add(currentYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [feriados, currentYear]);

  const feriadosFiltered = useMemo(() => {
    const s = feriadoSearch.trim().toLowerCase();
    return feriados.filter((f) => {
      if (yearOf(f.data) !== feriadoAno) return false;
      if (feriadoMes !== 'todos' && monthOf(f.data) !== feriadoMes) return false;

      if (!s) return true;
      const hay = `${f.nome} ${f.tipo} ${f.data}`.toLowerCase();
      return hay.includes(s);
    });
  }, [feriados, feriadoSearch, feriadoAno, feriadoMes]);

  const feriadosByMonth = useMemo(() => {
    const map = new Map<number, Feriado[]>();
    for (const f of feriadosFiltered) {
      const m = monthOf(f.data);
      if (!map.has(m)) map.set(m, []);
      map.get(m)!.push(f);
    }
    for (const [m, list] of map.entries()) {
      list.sort((a, b) => a.data.localeCompare(b.data));
      map.set(m, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [feriadosFiltered]);

  const feriadoCounts = useMemo(() => {
    const allYear = feriados.filter((f) => yearOf(f.data) === feriadoAno);
    const totalAno = allYear.length;
    const totalFiltro = feriadosFiltered.length;

    const byTipo = (tipo: string) =>
      feriadosFiltered.filter((f) => String(f.tipo || '').toLowerCase() === tipo).length;

    return {
      totalAno,
      totalFiltro,
      nacional: byTipo('nacional'),
      municipal: byTipo('municipal'),
      interno: byTipo('interno'),
    };
  }, [feriados, feriadosFiltered, feriadoAno]);

  const cfgSummary = useMemo(() => {
    return {
      periodo: `Fecha dia ${cfg.dia_fecho_periodo}`,
      jornada: `${cfg.horas_dia}h/dia · ${cfg.hora_entrada}–${cfg.hora_saida}`,
      pausa: cfg.descontar_pausa
        ? `Pausa ${cfg.pausa_minutos} min (desconta)`
        : `Pausa ${cfg.pausa_minutos} min (não desconta)`,
      presencas: `Tolerância ${cfg.tolerancia_minutos} min · Arredonda ${cfg.arredondamento_minutos} min`,
      falta: cfg.dia_sem_registo_gera_falta ? 'Sem registo = falta automática' : 'Sem registo = pendente',
      extra: `${cfg.multiplicador_hora_extra}x · ${cfg.exigir_aprovacao_extra ? 'exige aprovação' : 'sem aprovação'}`,
      docs: `Aviso ${cfg.dias_aviso_documentos} dias`,
    };
  }, [cfg]);

  const cfgIsValid = useMemo(() => {
    if (!cfg.timezone?.trim()) return false;
    if (!isHHMM(cfg.hora_entrada)) return false;
    if (!isHHMM(cfg.hora_saida)) return false;
    if (cfg.dia_fecho_periodo < 1 || cfg.dia_fecho_periodo > 31) return false;
    if (cfg.horas_dia < 1) return false;
    if (cfg.multiplicador_hora_extra < 1) return false;
    return true;
  }, [cfg]);

  const setCfgField = <K extends keyof SistemaConfig>(key: K, value: SistemaConfig[K]) => {
    setCfg((prev) => ({ ...prev, [key]: value }));
  };

  const discardChanges = () => {
    setCfg(cfgBase);
    toast.success('Alterações descartadas');
  };

  const resetToDefaults = () => {
    setCfg(DEFAULT_CONFIG);
    toast.success('Defaults aplicados (não esqueça de guardar)');
  };

  const saveConfig = async () => {
    if (!cfgIsValid) {
      toast.error('Config inválida: verifique timezone e horas (HH:MM).');
      return;
    }

    setSavingCfg(true);
    try {
      const payload = {
        id: CONFIG_ID,
        dia_fecho_periodo: clamp(cfg.dia_fecho_periodo, 1, 31),
        timezone: safeTimezoneOrDefault(cfg.timezone, DEFAULT_CONFIG.timezone),

        horas_dia: cfg.horas_dia,
        hora_entrada: cfg.hora_entrada,
        hora_saida: cfg.hora_saida,
        pausa_minutos: cfg.pausa_minutos,
        descontar_pausa: cfg.descontar_pausa,

        tolerancia_minutos: cfg.tolerancia_minutos,
        arredondamento_minutos: cfg.arredondamento_minutos,
        dia_sem_registo_gera_falta: cfg.dia_sem_registo_gera_falta,

        multiplicador_hora_extra: cfg.multiplicador_hora_extra,
        exigir_aprovacao_extra: cfg.exigir_aprovacao_extra,

        dias_aviso_documentos: cfg.dias_aviso_documentos,
        documento_vencido_bloqueia_presenca: cfg.documento_vencido_bloqueia_presenca,
        documento_vencido_bloqueia_alocacao: cfg.documento_vencido_bloqueia_alocacao,
      };

      const res = await supabase
        .from('configuracoes_sistema')
        .upsert(payload, { onConflict: 'id' })
        .select('*')
        .maybeSingle();

      if (res.error) {
        console.error(res.error);
        toast.error('Não foi possível guardar as configurações (permissões/RLS).');
      } else if (res.data) {
        toast.success('Configurações guardadas com sucesso');
        const merged = normalizeConfigRow(res.data);
        setCfg(merged);
        setCfgBase(merged);
      } else {
        toast.error('Não foi possível confirmar o retorno do upsert.');
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao guardar configurações');
    } finally {
      setSavingCfg(false);
    }
  };

  const toggleCargoAtivo = async (cargo: Cargo) => {
    const next = !cargo.ativo;
    const res = await supabase.from('cargos').update({ ativo: next }).eq('id', cargo.id);
    if (res.error) {
      console.error(res.error);
      toast.error('Erro ao atualizar cargo (permissões/RLS).');
      return;
    }
    toast.success(`Cargo ${next ? 'ativado' : 'desativado'}`);
    loadData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0B4F8A]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className={`p-5 ${cardBase}`}>
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-center">
                <SettingsIcon size={18} className="text-slate-700 dark:text-slate-200" />
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Regras do sistema, cargos, feriados e gestão de acessos (web/app).
                </p>
              </div>
            </div>

            {/* Resumo rápido */}
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { label: 'Período', value: cfgSummary.periodo, icon: CalendarDays },
                { label: 'Jornada', value: cfgSummary.jornada, icon: Clock },
                { label: 'Hora extra', value: cfgSummary.extra, icon: Target },
                { label: 'Documentos', value: cfgSummary.docs, icon: FileWarning },
              ].map((b) => {
                const Icon = b.icon;
                return (
                  <span
                    key={b.label}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    <Icon size={14} className="text-slate-600 dark:text-slate-300" />
                    <span className="text-slate-500 dark:text-slate-400">{b.label}:</span> {b.value}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 justify-end flex-wrap">
              <Button variant="secondary" onClick={loadData}>
                <RefreshCcw size={16} className="mr-2" />
                Atualizar
              </Button>

              <Button
                variant="secondary"
                onClick={discardChanges}
                disabled={!cfgDirty}
                title={!cfgDirty ? 'Sem alterações para descartar' : 'Descartar alterações'}
              >
                <Undo2 size={16} className="mr-2" />
                Descartar
              </Button>

              <Button variant="secondary" onClick={resetToDefaults} title="Aplicar defaults">
                <RotateCcw size={16} className="mr-2" />
                Defaults
              </Button>

              <Button
                onClick={saveConfig}
                disabled={!cfgDirty || savingCfg || !cfgIsValid}
                className={!cfgDirty || !cfgIsValid ? 'opacity-60 cursor-not-allowed' : ''}
                title={
                  !cfgIsValid
                    ? 'Config inválida (timezone e horas HH:MM)'
                    : !cfgDirty
                    ? 'Sem alterações para guardar'
                    : 'Guardar alterações'
                }
              >
                {savingCfg ? 'A guardar…' : 'Guardar alterações'}
              </Button>
            </div>

            {cfgDirty && (
              <div className="text-xs text-amber-700 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3 py-1.5 rounded-xl">
                Existem alterações pendentes. Guarde para aplicar nas regras do sistema.
              </div>
            )}
            {!cfgIsValid && (
              <div className="text-xs text-red-700 dark:text-red-200 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-1.5 rounded-xl">
                Config inválida: verifique timezone e horas (HH:MM).
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-5 flex flex-wrap gap-2">
          <TabPill id="regras" label="Regras do Sistema" icon={SlidersHorizontal} />
          <TabPill id="cargos" label="Cargos & Valores" icon={Target} count={cargosStats.total} />
          <TabPill id="feriados" label="Feriados" icon={CalendarDays} count={feriadoCounts.totalFiltro} />
          {/* ✅ troca “Permissões” por dois botões */}
          <TabPill id="plataforma" label="Plataforma" icon={Shield} />
          <TabPill id="app" label="App" icon={Smartphone} />
        </div>
      </Card>

      {/* TAB: Regras do Sistema */}
      {tab === 'regras' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Período */}
          <Card className={`p-5 ${cardBase}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Período e calendário</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Define o corte mensal, timezone e regras de base para apuramento.
                </div>
              </div>
              <Badge variant="info">Operação</Badge>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Dia de fecho do mês
                </label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={String(cfg.dia_fecho_periodo)}
                  onChange={(e) => setCfgField('dia_fecho_periodo', clamp(toNumber(e.target.value, 22), 1, 31))}
                />
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Ex.: 22 = o período conta do dia 1 ao dia 22.
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Timezone</label>
                <Input
                  value={cfg.timezone}
                  onChange={(e) => setCfgField('timezone', e.target.value)}
                  placeholder="Europe/Lisbon"
                />
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Evita divergências em datas/horas.</div>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
              <div className="flex items-start gap-2">
                <Info size={16} className="text-slate-600 dark:text-slate-300 mt-0.5" />
                <div className="text-xs text-slate-600 dark:text-slate-200">
                  Recomenda-se bloquear fecho de período se houver dias pendentes (sem presença/falta), para evitar ajustes
                  manuais no Financeiro.
                </div>
              </div>
            </div>
          </Card>

          {/* Jornada */}
          <Card className={`p-5 ${cardBase}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Jornada padrão</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Base para metas, apuramento de horas e consistência dos registos.
                </div>
              </div>
              <Badge variant="default">Presenças</Badge>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Horas por dia</label>
                <Input
                  type="number"
                  min={1}
                  step="0.5"
                  value={String(cfg.horas_dia)}
                  onChange={(e) => setCfgField('horas_dia', Math.max(1, toNumber(e.target.value, 8)))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Pausa (minutos)</label>
                <Input
                  type="number"
                  min={0}
                  step="5"
                  value={String(cfg.pausa_minutos)}
                  onChange={(e) => setCfgField('pausa_minutos', Math.max(0, toNumber(e.target.value, 60)))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Entrada padrão</label>
                <Input type="time" value={cfg.hora_entrada} onChange={(e) => setCfgField('hora_entrada', e.target.value)} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Saída padrão</label>
                <Input type="time" value={cfg.hora_saida} onChange={(e) => setCfgField('hora_saida', e.target.value)} />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold ${toggleClass(cfg.descontar_pausa)}`}
                onClick={() => setCfgField('descontar_pausa', !cfg.descontar_pausa)}
                type="button"
              >
                <Clock size={16} />
                {cfg.descontar_pausa ? 'Pausa desconta' : 'Pausa não desconta'}
              </button>
            </div>
          </Card>

          {/* Presenças */}
          <Card className={`p-5 ${cardBase}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Regras de presenças</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Tolerância, arredondamento e tratamento de pendências.
                </div>
              </div>
              <Badge variant="warning">Controle</Badge>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Tolerância (min)</label>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  value={String(cfg.tolerancia_minutos)}
                  onChange={(e) => setCfgField('tolerancia_minutos', Math.max(0, toNumber(e.target.value, 10)))}
                />
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Atrasos até este valor podem ser ignorados.</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Arredondamento (min)</label>
                <Input
                  type="number"
                  min={0}
                  step="5"
                  value={String(cfg.arredondamento_minutos)}
                  onChange={(e) => setCfgField('arredondamento_minutos', Math.max(0, toNumber(e.target.value, 15)))}
                />
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Ex.: 15 min para padronizar apuramento.</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold ${toggleClass(!cfg.dia_sem_registo_gera_falta)}`}
                onClick={() => setCfgField('dia_sem_registo_gera_falta', false)}
                type="button"
                title="Sem registo fica pendente (requer validação)"
              >
                <Info size={16} />
                Sem registo = pendente
              </button>

              <button
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold ${toggleClass(cfg.dia_sem_registo_gera_falta)}`}
                onClick={() => setCfgField('dia_sem_registo_gera_falta', true)}
                type="button"
                title="Sem registo vira falta automaticamente"
              >
                <FileWarning size={16} />
                Sem registo = falta automática
              </button>
            </div>
          </Card>

          {/* Horas extra + Documentos */}
          <Card className={`p-5 ${cardBase}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Horas extra e Documentos</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Regras que impactam Financeiro e Conformidade.
                </div>
              </div>
              <Badge variant="info">Crítico</Badge>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Multiplicador hora extra
                </label>
                <Input
                  type="number"
                  min={1}
                  step="0.1"
                  value={String(cfg.multiplicador_hora_extra)}
                  onChange={(e) => setCfgField('multiplicador_hora_extra', Math.max(1, toNumber(e.target.value, 1.5)))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Aviso de documentos (dias)
                </label>
                <Input
                  type="number"
                  min={1}
                  step="1"
                  value={String(cfg.dias_aviso_documentos)}
                  onChange={(e) => setCfgField('dias_aviso_documentos', Math.max(1, toNumber(e.target.value, 30)))}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold ${toggleClass(cfg.exigir_aprovacao_extra)}`}
                onClick={() => setCfgField('exigir_aprovacao_extra', !cfg.exigir_aprovacao_extra)}
                type="button"
              >
                <Shield size={16} />
                {cfg.exigir_aprovacao_extra ? 'Extra exige aprovação' : 'Extra sem aprovação'}
              </button>

              <button
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold ${toggleClass(cfg.documento_vencido_bloqueia_alocacao)}`}
                onClick={() => setCfgField('documento_vencido_bloqueia_alocacao', !cfg.documento_vencido_bloqueia_alocacao)}
                type="button"
              >
                <FileWarning size={16} />
                {cfg.documento_vencido_bloqueia_alocacao ? 'Doc vencido bloqueia alocação' : 'Doc vencido não bloqueia alocação'}
              </button>

              <button
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold ${toggleClass(cfg.documento_vencido_bloqueia_presenca)}`}
                onClick={() => setCfgField('documento_vencido_bloqueia_presenca', !cfg.documento_vencido_bloqueia_presenca)}
                type="button"
              >
                <Clock size={16} />
                {cfg.documento_vencido_bloqueia_presenca ? 'Doc vencido bloqueia presença' : 'Doc vencido não bloqueia presença'}
              </button>
            </div>

            <div className="mt-4 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
              <div className="text-xs text-slate-600 dark:text-slate-200">
                Compliance mínimo: doc vencido bloquear alocação e exigir aprovação de horas extra.
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB: Cargos */}
      {tab === 'cargos' && (
        <Card className={`p-5 ${cardBase}`}>
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Cargos e funções</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Base do valor/hora padrão e classificação interna.
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Total: {cargosStats.total}
                </span>
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                  Ativos: {cargosStats.ativos}
                </span>
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Inativos: {cargosStats.inativos}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <Button variant="secondary" onClick={loadData}>
                <RefreshCcw size={16} className="mr-2" />
                Atualizar
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setSelectedCargo(null);
                  setCargoModalOpen(true);
                }}
              >
                <Plus size={16} className="mr-2" />
                Novo Cargo
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            <div className="relative w-full lg:w-[420px]">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                value={cargoSearch}
                onChange={(e) => setCargoSearch(e.target.value)}
                placeholder="Pesquisar cargo, descrição ou valor…"
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                           focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={cargoStatus}
                onChange={(e) => setCargoStatus(e.target.value as any)}
                className="px-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                           focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100"
              >
                <option value="todos">Todos</option>
                <option value="ativos">Ativos</option>
                <option value="inativos">Inativos</option>
              </select>

              <span className="text-xs text-slate-500 dark:text-slate-400">
                {cargosFiltered.length} de {cargos.length}
              </span>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800/70">
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Cargo
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Descrição
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Valor/hora padrão
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Status
                  </th>
                  <th className="text-right py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {cargosFiltered.map((cargo) => (
                  <tr key={cargo.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/40">
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">{cargo.nome}</td>
                    <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-300">{cargo.descricao || '—'}</td>
                    <td className="py-3 px-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatEUR(Number(cargo.valor_hora_padrao || 0))}/h
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={cargo.ativo ? 'success' : 'default'}>{cargo.ativo ? 'Ativo' : 'Inativo'}</Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Editar"
                          onClick={() => {
                            setSelectedCargo(cargo);
                            setCargoModalOpen(true);
                          }}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={cargo.ativo ? 'Desativar' : 'Ativar'}
                          onClick={() => toggleCargoAtivo(cargo)}
                        >
                          <Power size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {cargosFiltered.length === 0 && (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400">Nenhum cargo encontrado</div>
            )}
          </div>
        </Card>
      )}

      {/* TAB: Feriados */}
      {tab === 'feriados' && (
        <Card className={`p-5 ${cardBase}`}>
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Feriados</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Filtra por ano/mês e mantém o calendário alinhado com presenças e metas.
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <Button variant="secondary" onClick={loadData}>
                <RefreshCcw size={16} className="mr-2" />
                Atualizar
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setSelectedFeriado(null);
                  setFeriadoModalOpen(true);
                }}
              >
                <Plus size={16} className="mr-2" />
                Novo Feriado
              </Button>
            </div>
          </div>

          {/* Filtros */}
          <div className="mt-4 flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
            <div className="relative w-full xl:w-[420px]">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                value={feriadoSearch}
                onChange={(e) => setFeriadoSearch(e.target.value)}
                placeholder="Pesquisar feriado (nome/tipo)…"
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                           focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={feriadoAno}
                onChange={(e) => setFeriadoAno(Number(e.target.value))}
                className="px-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                           focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100"
              >
                {feriadoAnosOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <select
                value={feriadoMes}
                onChange={(e) => {
                  const v = e.target.value;
                  setFeriadoMes(v === 'todos' ? 'todos' : Number(v));
                }}
                className="px-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                           focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent min-w-[180px] dark:text-slate-100"
              >
                <option value="todos">Todos os meses</option>
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(feriadoAno, i, 1).toLocaleDateString('pt-PT', { month: 'long' })}
                  </option>
                ))}
              </select>

              <span className="text-xs text-slate-500 dark:text-slate-400">
                {feriadoCounts.totalFiltro} (ano: {feriadoCounts.totalAno})
              </span>
            </div>
          </div>

          {/* Mini KPIs de tipos */}
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { label: 'Nacional', value: feriadoCounts.nacional, variant: 'info' as const },
              { label: 'Municipal', value: feriadoCounts.municipal, variant: 'default' as const },
              { label: 'Interno', value: feriadoCounts.interno, variant: 'warning' as const },
            ].map((k) => (
              <span
                key={k.label}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                <Badge variant={k.variant}>{k.label}</Badge>
                {k.value}
              </span>
            ))}
          </div>

          {/* Lista por mês */}
          <div className="mt-5 space-y-6">
            {feriadosByMonth.length === 0 ? (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400">Nenhum feriado encontrado</div>
            ) : (
              feriadosByMonth.map(([m, list]) => (
                <div key={m}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {new Date(feriadoAno, m - 1, 1).toLocaleDateString('pt-PT', { month: 'long' })}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{list.length} feriado(s)</div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {list.map((f) => (
                      <div
                        key={f.id}
                        className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-950/40 transition cursor-pointer"
                        onClick={() => {
                          setSelectedFeriado(f);
                          setFeriadoModalOpen(true);
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{f.nome}</div>
                            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2">
                              <CalendarDays size={14} className="text-slate-400 dark:text-slate-500" />
                              {formatShortDatePT(f.data)}
                            </div>
                          </div>
                          <Badge variant="info">{f.tipo}</Badge>
                        </div>

                        <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">Clique para editar ou eliminar</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* ✅ TAB: Plataforma (roles) */}
      {tab === 'plataforma' && <PermissoesPlataformaTab />}

      {/* ✅ TAB: App (acesso colaborador + encarregados) */}
      {tab === 'app' && <PermissoesAppTab />}

      {/* Rodapé de ajuda */}
      <Card className={`p-5 ${cardBase}`}>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-center">
            <Info size={18} className="text-slate-700 dark:text-slate-200" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Nota operacional</div>
            <div className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              Configurações mudam regras (cálculo, bloqueios, padrões e permissões). Dados operacionais ficam em Obras,
              Presenças, Financeiro e Documentos.
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Se a tabela <span className="font-semibold">configuracoes_sistema</span> estiver com RLS restrito, “Guardar
              alterações” vai falhar até o user ter permissão (owner/admin).
            </div>
          </div>
        </div>
      </Card>

      <CargoModal
        isOpen={cargoModalOpen}
        onClose={() => {
          setCargoModalOpen(false);
          setSelectedCargo(null);
        }}
        onSuccess={loadData}
        cargo={selectedCargo}
      />

      <FeriadoModal
        isOpen={feriadoModalOpen}
        onClose={() => {
          setFeriadoModalOpen(false);
          setSelectedFeriado(null);
        }}
        onSuccess={loadData}
        feriado={selectedFeriado}
      />
    </div>
  );
}
