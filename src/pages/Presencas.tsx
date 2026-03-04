// src/pages/Presencas.tsx
import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import {
  Users,
  Clock,
  Calendar,
  CheckCircle,
  Plus,
  Search,
  Download,
  LogIn,
  LogOut,
  UserX,
  TrendingUp,
  Target,
  Pencil,
  Trash2,
  RefreshCcw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { Input } from '../components/ui/Input';

interface Colaborador {
  id: string;
  nome_completo: string;
  foto_url: string | null;
  categoria: string | null;
  status: string;
}

interface PresencaMes {
  colaborador_id: string;
  colaborador: Colaborador;
  horas_trabalhadas: number;
  dias_trabalhados: number;
  faltas: number;
  ultimo_registro: string | null;
  meta_horas: number;
  percentual_meta: number;
}

interface Obra {
  id: string;
  nome: string;
}

interface RegistroPresenca {
  id: string;
  data: string;
  colaborador_id: string;
  colaborador_nome: string;
  entrada: string | null;
  saida: string | null;
  total_horas: number;
  faltou: boolean;
  justificacao_falta: string | null;
}

type RegistrarStatus = 'presenca' | 'falta';

type PresencaExistente = {
  presenca_dia_id: string;
  status: RegistrarStatus;
  entrada: string | null; // ISO
  saida: string | null; // ISO
  justificacao: string | null;
  total_horas: number;
};

const BRAND = { blue: '#0B4F8A' };
const HORAS_DIA = 8;

// Regras almoço (funcional):
// - Só desconta almoço se o turno "passar pelo horário de almoço" (ex.: 12:00–13:00)
// - E se o total bruto for >= MIN_HORAS_PARA_ALMOCO
const ALMOCO_HORAS = 1;
const MIN_HORAS_PARA_ALMOCO = 6;
const ALMOCO_INICIO = '12:00';
const ALMOCO_FIM = '13:00';

const cardBase =
  'border border-slate-200 bg-white shadow-sm ' +
  'dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30';

// -------------------- Período 23 -> 22 (mês de fecho dia 23) --------------------
const pad2 = (n: number) => String(n).padStart(2, '0');
function isoFromYMD(y: number, m1: number, d: number) {
  return `${y}-${pad2(m1)}-${pad2(d)}`;
}

function getPeriodo23a22(ano: number, mes1: number) {
  // termina dia 22 do mês selecionado
  const end = isoFromYMD(ano, mes1, 22);

  let prevMes1 = mes1 - 1;
  let prevAno = ano;
  if (prevMes1 < 1) {
    prevMes1 = 12;
    prevAno = ano - 1;
  }

  // começa dia 23 do mês anterior
  const start = isoFromYMD(prevAno, prevMes1, 23);

  return {
    startISO: start,
    endISO: end,
    startAno: prevAno,
    startMes1: prevMes1,
    endAno: ano,
    endMes1: mes1,
  };
}

// ✅ Mês de fecho correto (23..fim => próximo mês)
function getMesFechoFromNow(now = new Date()) {
  const y = now.getFullYear();
  const m0 = now.getMonth(); // 0..11
  const day = now.getDate();

  const fecho = new Date(y, m0 + (day >= 23 ? 1 : 0), 1);
  return `${fecho.getFullYear()}-${pad2(fecho.getMonth() + 1)}`;
}

function calcularMetaPeriodo(startISO: string, endISO: string): number {
  const dataInicio = new Date(`${startISO}T00:00:00`);
  const dataFim = new Date(`${endISO}T00:00:00`);
  if (Number.isNaN(dataInicio.getTime()) || Number.isNaN(dataFim.getTime())) return 0;

  let diasUteis = 0;
  const cur = new Date(dataInicio);

  while (cur <= dataFim) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) diasUteis++;
    cur.setDate(cur.getDate() + 1);
  }

  return diasUteis * HORAS_DIA;
}

function isBetweenISO(dateISO: string, startISO: string, endISO: string) {
  return dateISO >= startISO && dateISO <= endISO;
}

function clampISO(dateISO: string, startISO: string, endISO: string) {
  if (dateISO < startISO) return startISO;
  if (dateISO > endISO) return endISO;
  return dateISO;
}

function safeNumber(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getInitials(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatWeekdayLabel(dateISO: string) {
  const d = new Date(`${dateISO}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function toCSV(rows: string[][]) {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = String(cell ?? '');
          if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(';')
    )
    .join('\n');
}

function isSundayISO(dateISO: string) {
  const d = new Date(`${dateISO}T12:00:00`);
  return !Number.isNaN(d.getTime()) && d.getDay() === 0;
}

function isoToHHMM(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function hasFaltaRegisto(registos: any[]): boolean {
  return Array.isArray(registos) && registos.some((r) => r?.tipo === 'falta');
}

function eurPct(pct: number) {
  const v = Math.max(0, Math.min(100, pct));
  return `${v.toFixed(0)}%`;
}

// ✅ Horas líquidas (desconta almoço só quando faz sentido):
// - desconto de 1h apenas se houver sobreposição com o intervalo ALMOCO_INICIO–ALMOCO_FIM
// - e se bruto >= MIN_HORAS_PARA_ALMOCO
function calcHorasLiquidas(entrada: Date, saida: Date) {
  const bruto = (saida.getTime() - entrada.getTime()) / (1000 * 60 * 60);
  if (!Number.isFinite(bruto) || bruto <= 0) return 0;

  const y = entrada.getFullYear();
  const m = entrada.getMonth();
  const d = entrada.getDate();

  const [aiH, aiM] = ALMOCO_INICIO.split(':').map((x) => Number(x));
  const [afH, afM] = ALMOCO_FIM.split(':').map((x) => Number(x));

  const almocoInicio = new Date(y, m, d, aiH || 0, aiM || 0, 0, 0);
  const almocoFim = new Date(y, m, d, afH || 0, afM || 0, 0, 0);

  const overlapStart = Math.max(entrada.getTime(), almocoInicio.getTime());
  const overlapEnd = Math.min(saida.getTime(), almocoFim.getTime());
  const temOverlapAlmoco = overlapEnd > overlapStart; // passou pelo horário de almoço

  const desconta = bruto >= MIN_HORAS_PARA_ALMOCO && temOverlapAlmoco ? ALMOCO_HORAS : 0;
  return Math.max(0, bruto - desconta);
}

// -------------------- Modal simples (mantido) --------------------
function SimpleModal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!props.open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="font-semibold text-slate-900 dark:text-slate-100">{props.title}</div>
          <button
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            onClick={props.onClose}
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="p-5">{props.children}</div>

        {props.footer && (
          <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
            {props.footer}
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------- UI helpers --------------------
function SegmentedTabs(props: {
  value: 'resumo' | 'registrar' | 'historico';
  onChange: (v: 'resumo' | 'registrar' | 'historico') => void;
}) {
  const items = [
    { key: 'resumo' as const, label: 'Resumo', icon: <TrendingUp size={16} /> },
    { key: 'registrar' as const, label: 'Registrar', icon: <Plus size={16} /> },
    { key: 'historico' as const, label: 'Histórico', icon: <Calendar size={16} /> },
  ];

  return (
    <div className="w-full sm:w-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 p-1 flex gap-1">
      {items.map((it) => {
        const active = props.value === it.key;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => props.onChange(it.key)}
            className={[
              'flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition',
              active
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900/40',
            ].join(' ')}
          >
            {it.icon}
            <span>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function KpiCard(props: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string; tone?: 'default' | 'warn' }) {
  const bg = props.tone === 'warn' ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-blue-50 dark:bg-blue-500/10';
  const ring = props.tone === 'warn' ? 'border-amber-200 dark:border-amber-500/25' : 'border-slate-200 dark:border-slate-800/70';

  return (
    <Card className={`${cardBase}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`h-11 w-11 rounded-2xl border ${ring} ${bg} flex items-center justify-center`}>{props.icon}</div>
          <div className="min-w-0">
            <div className="text-xs text-slate-600 dark:text-slate-400">{props.label}</div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate">{props.value}</div>
            {props.hint && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{props.hint}</div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function Presencas() {
  const now = new Date();
  const mesNow0 = now.getMonth();
  const anoNow = now.getFullYear();

  // ✅ Default do período = mês de fecho correto
  const [periodo, setPeriodo] = useState<string>(() => getMesFechoFromNow(new Date()));

  const [periodoObra, setPeriodoObra] = useState<string>('');
  const [viewMode, setViewMode] = useState<'resumo' | 'registrar' | 'historico'>('resumo');

  const [presencasMes, setPresencasMes] = useState<PresencaMes[]>([]);
  const [obras, setObras] = useState<Obra[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [historico, setHistorico] = useState<RegistroPresenca[]>([]);
  const [loadingResumo, setLoadingResumo] = useState(true);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [resumoColaboradorId, setResumoColaboradorId] = useState<string>('');
  const [registrarSearch, setRegistrarSearch] = useState('');

  // Registrar
  const [selectedObra, setSelectedObra] = useState<string>('');
  const todayISO = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Lisbon',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }, []);
  const [selectedDate, setSelectedDate] = useState<string>(todayISO);
  const [selectedColaboradores, setSelectedColaboradores] = useState<Set<string>>(new Set());
  const [tipoRegistro, setTipoRegistro] = useState<'presenca' | 'falta'>('presenca');
  const [horaEntrada, setHoraEntrada] = useState('08:00');
  const [horaSaida, setHoraSaida] = useState('17:00');
  const [justificacaoFalta, setJustificacaoFalta] = useState('');

  // Registrar: existentes (obra+data)
  const [existentesByColab, setExistentesByColab] = useState<Record<string, PresencaExistente>>({});
  const [loadingExistentes, setLoadingExistentes] = useState(false);

  // Modal de edição
  const [editOpen, setEditOpen] = useState(false);
  const [editColab, setEditColab] = useState<Colaborador | null>(null);
  const [editStatus, setEditStatus] = useState<RegistrarStatus>('presenca');
  const [editEntrada, setEditEntrada] = useState('08:00');
  const [editSaida, setEditSaida] = useState('17:00');
  const [editJustificacao, setEditJustificacao] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Histórico
  const [filtroObra, setFiltroObra] = useState<string>('');
  const [filtroMes, setFiltroMes] = useState<string>(periodo);
  const [historicoColaboradorId, setHistoricoColaboradorId] = useState<string>('');

  // Metas por colaborador
  const [metasByColab, setMetasByColab] = useState<Record<string, number>>({});

  const { anoPeriodo, mesPeriodo1, mesPeriodo0, metaMesDefault, rangeInicio, rangeFim, periodoLabel } = useMemo(() => {
    const [a, m] = String(periodo).split('-');
    const ano = safeNumber(a, anoNow);
    const mes1 = safeNumber(m, mesNow0 + 1);
    const mes0 = Math.max(0, Math.min(11, mes1 - 1));

    const { startISO, endISO, startMes1, startAno, endMes1, endAno } = getPeriodo23a22(ano, mes1);

    const startLabel = `23/${pad2(startMes1)}/${startAno}`;
    const endLabel = `22/${pad2(endMes1)}/${endAno}`;
    const label = `${startLabel} → ${endLabel}`;

    const metaDefault = calcularMetaPeriodo(startISO, endISO);

    return {
      anoPeriodo: ano,
      mesPeriodo1: mes1,
      mesPeriodo0: mes0,
      metaMesDefault: metaDefault,
      rangeInicio: startISO,
      rangeFim: endISO,
      periodoLabel: label,
    };
  }, [periodo, anoNow, mesNow0]);

  // garantir data do Registrar dentro do período
  useEffect(() => {
    if (viewMode !== 'registrar') return;
    const clamped = clampISO(selectedDate || todayISO, rangeInicio, rangeFim);
    if (clamped !== selectedDate) setSelectedDate(clamped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, rangeInicio, rangeFim]);

  useEffect(() => {
    loadObras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setFiltroMes(periodo);
    refreshResumo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, periodoObra]);

  useEffect(() => {
    if (selectedObra && viewMode === 'registrar') loadColaboradoresObra();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedObra, viewMode]);

  useEffect(() => {
    setRegistrarSearch('');
  }, [selectedObra]);

  useEffect(() => {
    if (viewMode === 'historico') loadHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, filtroObra, filtroMes, historicoColaboradorId]);

  useEffect(() => {
    if (viewMode !== 'registrar') return;
    if (!selectedObra) return;
    if (!colaboradores.length) return;
    loadExistentesRegistrar(selectedObra, selectedDate, colaboradores);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedDate]);

  const loadObras = async () => {
    const { data, error } = await supabase.from('obras').select('id, nome').order('nome');
    if (error) {
      console.error('[obras] erro:', error);
      toast.error(`Erro ao carregar obras: ${error.message}`);
      return;
    }
    if (data) setObras(data);
  };

  const loadMetasMes = async (): Promise<Record<string, number>> => {
    try {
      const { data, error } = await supabase
        .from('metas_colaboradores_mes')
        .select('colaborador_id, meta_horas')
        .eq('ano', anoPeriodo)
        .eq('mes', mesPeriodo1);

      if (error) {
        console.warn('[metas_colaboradores_mes] erro ao carregar metas:', error);
        setMetasByColab({});
        return {};
      }

      const map: Record<string, number> = {};
      (data || []).forEach((r: any) => {
        if (!r?.colaborador_id) return;
        map[r.colaborador_id] = safeNumber(r.meta_horas, 0);
      });

      setMetasByColab(map);
      return map;
    } catch (e) {
      console.warn('[metas_colaboradores_mes] tabela não disponível ou erro:', e);
      setMetasByColab({});
      return {};
    }
  };

  const refreshResumo = async () => {
    setLoadingResumo(true);
    const metasMap = await loadMetasMes();
    await loadPresencasMes(metasMap);
    setLoadingResumo(false);
  };

  const saveMeta = async (colaboradorId: string, metaHoras: number) => {
    setMetasByColab((prev) => ({ ...prev, [colaboradorId]: metaHoras }));

    try {
      const { error } = await supabase
        .from('metas_colaboradores_mes')
        .upsert(
          { ano: anoPeriodo, mes: mesPeriodo1, colaborador_id: colaboradorId, meta_horas: metaHoras },
          { onConflict: 'ano,mes,colaborador_id' }
        );

      if (error) {
        console.warn('[metas_colaboradores_mes] erro ao salvar meta:', error);
        toast.error(`Não foi possível salvar a meta: ${error.message}`);
      } else {
        toast.success('Meta atualizada');
      }
    } catch (e) {
      console.warn('[metas_colaboradores_mes] erro ao salvar meta:', e);
      toast.error('Não foi possível salvar a meta');
    } finally {
      refreshResumo();
    }
  };

  const loadPresencasMes = async (metasMap?: Record<string, number>) => {
    const metasLocal = metasMap ?? metasByColab;

    let query = supabase
      .from('presencas_dia')
      .select(
        `
          id,
          data,
          total_horas,
          obra_id,
          colaborador_id,
          colaborador:colaborador_id (
            id,
            nome_completo,
            foto_url,
            categoria,
            status
          ),
          registos:presencas_registos!presencas_registos_presenca_dia_fk ( tipo )
        `
      )
      .gte('data', rangeInicio)
      .lte('data', rangeFim);

    if (periodoObra) query = query.eq('obra_id', periodoObra);

    const { data: presencas, error } = await query;

    if (error) {
      console.error('[presencas_dia] erro ao carregar presenças:', error);
      toast.error(`Erro ao carregar presenças: ${error.message}`);
      setPresencasMes([]);
      return;
    }

    if (!presencas?.length) {
      setPresencasMes([]);
      return;
    }

    const colaboradoresMap = new Map<string, PresencaMes>();

    presencas.forEach((p: any) => {
      if (!p.colaborador || !p.colaborador.id) return;

      const colabId = p.colaborador.id;

      if (!colaboradoresMap.has(colabId)) {
        const metaOverride = metasLocal[colabId];
        const metaFinal = metaOverride && metaOverride > 0 ? metaOverride : metaMesDefault;

        colaboradoresMap.set(colabId, {
          colaborador_id: colabId,
          colaborador: p.colaborador,
          horas_trabalhadas: 0,
          dias_trabalhados: 0,
          faltas: 0,
          ultimo_registro: null,
          meta_horas: metaFinal,
          percentual_meta: 0,
        });
      }

      const registro = colaboradoresMap.get(colabId)!;

      const registos = Array.isArray(p.registos) ? p.registos : [];
      const faltou = hasFaltaRegisto(registos);

      if (faltou) {
        registro.faltas++;
      } else {
        registro.horas_trabalhadas += safeNumber(p.total_horas, 0);
        registro.dias_trabalhados++;
      }

      if (!registro.ultimo_registro || p.data > registro.ultimo_registro) {
        registro.ultimo_registro = p.data;
      }
    });

    const resultado = Array.from(colaboradoresMap.values()).map((r) => {
      const meta = r.meta_horas > 0 ? r.meta_horas : metaMesDefault;
      return {
        ...r,
        meta_horas: meta,
        percentual_meta: meta > 0 ? (r.horas_trabalhadas / meta) * 100 : 0,
      };
    });

    setPresencasMes(resultado.sort((a, b) => b.horas_trabalhadas - a.horas_trabalhadas));
  };

  const loadColaboradoresObra = async () => {
    if (!selectedObra) return;

    const { data, error } = await supabase
      .from('obras_colaboradores')
      .select(
        `
          colaboradores:colaborador_id (
            id,
            nome_completo,
            foto_url,
            categoria,
            status
          )
        `
      )
      .eq('obra_id', selectedObra)
      .eq('ativo', true);

    if (error) {
      console.error('[obras_colaboradores] erro ao carregar colaboradores:', error);
      toast.error(`Erro ao carregar colaboradores: ${error.message}`);
      setColaboradores([]);
      setExistentesByColab({});
      return;
    }

    const colabs = (data || [])
      .map((item: any) => item.colaboradores)
      .filter((c: any) => c && c.id)
      .sort((a: Colaborador, b: Colaborador) => a.nome_completo.localeCompare(b.nome_completo));

    setColaboradores(colabs);
    await loadExistentesRegistrar(selectedObra, selectedDate, colabs);
  };

  const loadExistentesRegistrar = async (obraId: string, dateISO: string, colabs: Colaborador[]) => {
    if (!obraId || !dateISO || !colabs.length) {
      setExistentesByColab({});
      return;
    }

    setLoadingExistentes(true);
    try {
      const ids = colabs.map((c) => c.id).filter(Boolean);
      if (!ids.length) {
        setExistentesByColab({});
        return;
      }

      const { data, error } = await supabase
        .from('presencas_dia')
        .select(
          `
          id,
          colaborador_id,
          total_horas,
          registos:presencas_registos!presencas_registos_presenca_dia_fk ( tipo, momento, observacao )
        `
        )
        .eq('obra_id', obraId)
        .eq('data', dateISO)
        .in('colaborador_id', ids);

      if (error) {
        console.error('[loadExistentesRegistrar] erro:', error);
        setExistentesByColab({});
        return;
      }

      const map: Record<string, PresencaExistente> = {};
      (data || []).forEach((p: any) => {
        const registos = Array.isArray(p.registos) ? p.registos : [];
        registos.sort((a: any, b: any) => String(a.momento).localeCompare(String(b.momento)));

        const falta = registos.find((r: any) => r.tipo === 'falta') ?? null;
        const entrada = registos.find((r: any) => r.tipo === 'entrada')?.momento ?? null;
        const saida = registos.find((r: any) => r.tipo === 'saida')?.momento ?? null;

        const status: RegistrarStatus = falta ? 'falta' : 'presenca';

        map[p.colaborador_id] = {
          presenca_dia_id: p.id,
          status,
          entrada,
          saida,
          justificacao: (falta?.observacao ?? null) as any,
          total_horas: safeNumber(p.total_horas, 0),
        };
      });

      setExistentesByColab(map);
    } finally {
      setLoadingExistentes(false);
    }
  };

  const loadHistorico = async () => {
    setLoadingHistorico(true);

    try {
      let query = supabase
        .from('presencas_dia')
        .select(
          `
            id,
            data,
            total_horas,
            obra_id,
            colaborador_id,
            colaborador:colaborador_id ( id, nome_completo ),
            registos:presencas_registos!presencas_registos_presenca_dia_fk ( tipo, momento, observacao )
          `
        )
        .order('data', { ascending: false })
        .limit(200);

      if (filtroObra) query = query.eq('obra_id', filtroObra);

      if (filtroMes) {
        const [a, m] = filtroMes.split('-');
        const ano = safeNumber(a, anoNow);
        const mes1 = safeNumber(m, mesNow0 + 1);
        const { startISO, endISO } = getPeriodo23a22(ano, mes1);
        query = query.gte('data', startISO).lte('data', endISO);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[loadHistorico] presencas_dia erro:', error);
        toast.error(`Erro ao carregar histórico: ${error.message}`);
        setHistorico([]);
        return;
      }

      const registros: RegistroPresenca[] = (data || []).map((p: any) => {
        const registos = Array.isArray(p.registos) ? p.registos : [];
        registos.sort((a: any, b: any) => String(a.momento).localeCompare(String(b.momento)));

        const falta = registos.find((r: any) => r.tipo === 'falta') ?? null;
        const entradaTs = registos.find((r: any) => r.tipo === 'entrada')?.momento ?? null;
        const saidaTs = registos.find((r: any) => r.tipo === 'saida')?.momento ?? null;

        const inferido = !falta && safeNumber(p.total_horas, 0) === 0 && !entradaTs && !saidaTs;
        const faltou = !!falta || inferido;

        return {
          id: p.id,
          data: p.data,
          colaborador_id: p.colaborador_id,
          colaborador_nome: p.colaborador?.nome_completo || 'Desconhecido',
          entrada: entradaTs ? new Date(entradaTs).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : null,
          saida: saidaTs ? new Date(saidaTs).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : null,
          total_horas: safeNumber(p.total_horas, 0),
          faltou,
          justificacao_falta: (falta?.observacao ?? null) as any,
        };
      });

      let registrosFinal = registros;
      if (historicoColaboradorId) registrosFinal = registrosFinal.filter((r) => r.colaborador_id === historicoColaboradorId);

      setHistorico(registrosFinal);
    } catch (e: any) {
      console.error('[loadHistorico] erro inesperado:', e);
      toast.error('Erro ao carregar histórico');
      setHistorico([]);
    } finally {
      setLoadingHistorico(false);
    }
  };

  // Gravação (1 colaborador)
  const registrarFaltaOne = async (colaboradorId: string, justificacao: string) => {
    const { data: presencaDia, error: upsertErr } = await supabase
      .from('presencas_dia')
      .upsert(
        {
          data: selectedDate,
          obra_id: selectedObra,
          colaborador_id: colaboradorId,
          total_horas: 0,
          ultimo_registo_em: new Date().toISOString(),
        },
        { onConflict: 'data,obra_id,colaborador_id' }
      )
      .select('id')
      .single();

    if (upsertErr) throw upsertErr;

    const { error: delErr } = await supabase.from('presencas_registos').delete().eq('presenca_dia_id', presencaDia.id);
    if (delErr) console.error('[registrarFaltaOne] erro ao limpar registos:', delErr);

    const momentoFalta = new Date(`${selectedDate}T08:00:00`).toISOString();

    const { error: insErr } = await supabase.from('presencas_registos').insert([
      {
        presenca_dia_id: presencaDia.id,
        tipo: 'falta',
        momento: momentoFalta,
        observacao: justificacao.trim() || '',
      },
    ]);

    if (insErr) throw insErr;
  };

  const registrarPresencaOne = async (colaboradorId: string, entradaHHMM: string, saidaHHMM: string) => {
    const entrada = new Date(`${selectedDate}T${entradaHHMM}:00`);
    const saida = new Date(`${selectedDate}T${saidaHHMM}:00`);

    if (Number.isNaN(entrada.getTime()) || Number.isNaN(saida.getTime())) throw new Error('Horários inválidos');
    if (saida.getTime() <= entrada.getTime()) throw new Error('A hora de saída deve ser maior do que a entrada');

    // ✅ horas líquidas (desconta almoço quando cruza 12:00–13:00 e bruto >= 6h)
    const diffHoras = calcHorasLiquidas(entrada, saida);

    const { data: presencaDia, error: upsertErr } = await supabase
      .from('presencas_dia')
      .upsert(
        {
          data: selectedDate,
          obra_id: selectedObra,
          colaborador_id: colaboradorId,
          total_horas: diffHoras,
          ultimo_registo_em: new Date().toISOString(),
        },
        { onConflict: 'data,obra_id,colaborador_id' }
      )
      .select('id')
      .single();

    if (upsertErr) throw upsertErr;

    const { error: delErr } = await supabase.from('presencas_registos').delete().eq('presenca_dia_id', presencaDia.id);
    if (delErr) console.error('[registrarPresencaOne] erro ao limpar registos:', delErr);

    const { error: insErr } = await supabase.from('presencas_registos').insert([
      { presenca_dia_id: presencaDia.id, tipo: 'entrada', momento: entrada.toISOString(), observacao: 'manual' },
      { presenca_dia_id: presencaDia.id, tipo: 'saida', momento: saida.toISOString(), observacao: 'manual' },
    ]);

    if (insErr) throw insErr;
  };

  const limparRegistoDia = async (colaboradorId: string) => {
    const existente = existentesByColab[colaboradorId];
    if (!existente) return;

    const ok = window.confirm(
      'Tem certeza que deseja apagar o registo desse dia para este colaborador?\n\nIsso remove a presença/falta e os registos de entrada/saída.'
    );
    if (!ok) return;

    const { error: delReg } = await supabase.from('presencas_registos').delete().eq('presenca_dia_id', existente.presenca_dia_id);
    if (delReg) throw delReg;

    const { error: delDia } = await supabase.from('presencas_dia').delete().eq('id', existente.presenca_dia_id);
    if (delDia) throw delDia;
  };

  const openEditModal = (colab: Colaborador) => {
    const ex = existentesByColab[colab.id];

    setEditColab(colab);
    setEditStatus(ex?.status ?? 'presenca');
    setEditEntrada(ex?.entrada ? isoToHHMM(ex.entrada) : horaEntrada);
    setEditSaida(ex?.saida ? isoToHHMM(ex.saida) : horaSaida);
    setEditJustificacao((ex?.justificacao ?? '') as any);
    setEditOpen(true);
  };

  const selectedDateIsSunday = useMemo(() => isSundayISO(selectedDate), [selectedDate]);
  const selectedDateOutOfPeriodo = useMemo(() => !isBetweenISO(selectedDate, rangeInicio, rangeFim), [selectedDate, rangeInicio, rangeFim]);

  // ✅ Preview com almoço descontado
  const editDiffPreview = useMemo(() => {
    if (editStatus !== 'presenca') return null;
    const entrada = new Date(`${selectedDate}T${editEntrada}:00`);
    const saida = new Date(`${selectedDate}T${editSaida}:00`);
    if (Number.isNaN(entrada.getTime()) || Number.isNaN(saida.getTime())) return null;
    if (saida.getTime() <= entrada.getTime()) return null;
    return calcHorasLiquidas(entrada, saida);
  }, [editStatus, editEntrada, editSaida, selectedDate]);

  const handleSaveEdit = async () => {
    if (!editColab) return;
    if (!selectedObra) return toast.error('Selecione uma obra');
    if (selectedDateOutOfPeriodo) return toast.error(`Data fora do período selecionado (${periodoLabel})`);
    if (selectedDateIsSunday) return toast.error('Não é permitido registrar/editar no domingo');

    setEditSaving(true);
    try {
      if (editStatus === 'falta') await registrarFaltaOne(editColab.id, editJustificacao);
      else await registrarPresencaOne(editColab.id, editEntrada, editSaida);

      toast.success('Registo atualizado');

      setEditOpen(false);
      setEditColab(null);

      await loadExistentesRegistrar(selectedObra, selectedDate, colaboradores);
      refreshResumo();
      if (viewMode === 'historico') loadHistorico();
    } catch (e: any) {
      console.error('[handleSaveEdit] erro:', e);
      toast.error(`Não foi possível salvar: ${e?.message ?? 'erro'}`);
    } finally {
      setEditSaving(false);
    }
  };

  const handleClearEdit = async () => {
    if (!editColab) return;

    const existente = existentesByColab[editColab.id];
    if (!existente) return toast.error('Não existe registo neste dia para remover');
    if (selectedDateOutOfPeriodo) return toast.error(`Data fora do período selecionado (${periodoLabel})`);

    setEditSaving(true);
    try {
      await limparRegistoDia(editColab.id);

      toast.success('Registo removido');

      setEditOpen(false);
      setEditColab(null);

      await loadExistentesRegistrar(selectedObra, selectedDate, colaboradores);
      refreshResumo();
      if (viewMode === 'historico') loadHistorico();
    } catch (e: any) {
      console.error('[handleClearEdit] erro:', e);
      toast.error(`Não foi possível remover: ${e?.message ?? 'erro'}`);
    } finally {
      setEditSaving(false);
    }
  };

  const handleRegistrarPresenca = async () => {
    if (!selectedObra || selectedColaboradores.size === 0) return toast.error('Selecione uma obra e pelo menos um colaborador');
    if (selectedDateOutOfPeriodo) return toast.error(`Data fora do período selecionado (${periodoLabel})`);
    if (selectedDateIsSunday) return toast.error('Não é permitido registrar no domingo');

    if (tipoRegistro === 'presenca') {
      const entrada = new Date(`${selectedDate}T${horaEntrada}:00`);
      const saida = new Date(`${selectedDate}T${horaSaida}:00`);
      if (Number.isNaN(entrada.getTime()) || Number.isNaN(saida.getTime())) return toast.error('Horários inválidos');
      if (saida.getTime() <= entrada.getTime()) return toast.error('A hora de saída deve ser maior do que a entrada');
    }

    try {
      let teveUpdate = false;

      for (const colaboradorId of selectedColaboradores) {
        if (existentesByColab[colaboradorId]) teveUpdate = true;

        if (tipoRegistro === 'falta') {
          try {
            await registrarFaltaOne(colaboradorId, justificacaoFalta);
          } catch (e: any) {
            console.error('[registrar falta] erro:', e);
            toast.error(`Erro ao registrar falta: ${e?.message ?? 'erro'}`);
          }
          continue;
        }

        try {
          await registrarPresencaOne(colaboradorId, horaEntrada, horaSaida);
        } catch (e: any) {
          console.error('[registrar presenca] erro:', e);
          toast.error(`Erro ao registrar presença: ${e?.message ?? 'erro'}`);
        }
      }

      toast.success(
        teveUpdate
          ? `Registos atualizados para ${selectedColaboradores.size} colaborador(es)`
          : `${tipoRegistro === 'falta' ? 'Falta' : 'Presença'} registrada para ${selectedColaboradores.size} colaborador(es)`
      );

      setSelectedColaboradores(new Set());
      setJustificacaoFalta('');

      await loadExistentesRegistrar(selectedObra, selectedDate, colaboradores);
      refreshResumo();
      if (viewMode === 'historico') loadHistorico();
    } catch (error: any) {
      console.error('[handleRegistrarPresenca] erro:', error);
      toast.error('Erro ao registrar presença/falta');
    }
  };

  const toggleColaborador = (id: string) => {
    const newSet = new Set(selectedColaboradores);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedColaboradores(newSet);
  };

  const selecionarTodos = () => {
    if (selectedColaboradores.size === colaboradores.length) setSelectedColaboradores(new Set());
    else setSelectedColaboradores(new Set(colaboradores.map((c) => c.id)));
  };

  const filteredPresencas = useMemo(() => {
    let list = presencasMes;
    if (resumoColaboradorId) list = list.filter((p) => p.colaborador_id === resumoColaboradorId);
    if (!searchTerm) return list;
    const term = searchTerm.toLowerCase();
    return list.filter((p) => p.colaborador.nome_completo.toLowerCase().includes(term));
  }, [presencasMes, searchTerm, resumoColaboradorId]);

  const totaisResumo = useMemo(() => {
    const totalHoras = presencasMes.reduce((acc, p) => acc + safeNumber(p.horas_trabalhadas, 0), 0);
    const totalFaltas = presencasMes.reduce((acc, p) => acc + safeNumber(p.faltas, 0), 0);
    const totalDias = presencasMes.reduce((acc, p) => acc + safeNumber(p.dias_trabalhados, 0), 0);
    return { totalHoras, totalFaltas, totalDias };
  }, [presencasMes]);

  const historicoPeriodoLabel = useMemo(() => {
    if (!filtroMes) return '';

    const [a, m] = filtroMes.split('-');
    const ano = safeNumber(a, anoNow);
    const mes1 = safeNumber(m, mesNow0 + 1);

    const { startMes1, startAno, endMes1, endAno } = getPeriodo23a22(ano, mes1);

    const startLabel = `23/${pad2(startMes1)}/${startAno}`;
    const endLabel = `22/${pad2(endMes1)}/${endAno}`;

    return `${startLabel} → ${endLabel}`;
  }, [filtroMes, anoNow, mesNow0]);

  const historicoColaboradoresOptions = useMemo(() => {
    const map = new Map<string, string>();
    historico.forEach((h) => {
      if (!h.colaborador_id) return;
      if (!map.has(h.colaborador_id)) map.set(h.colaborador_id, h.colaborador_nome);
    });

    return Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, nome]) => ({ value: id, label: nome }));
  }, [historico]);

  const exportHistoricoCSV = () => {
    if (!historico.length) return toast.error('Sem dados para exportar');

    const rows: string[][] = [
      ['Data', 'Colaborador', 'Entrada', 'Saída', 'Total (h)', 'Status', 'Justificação'],
      ...historico.map((r) => [
        new Date(`${r.data}T12:00:00`).toLocaleDateString('pt-PT'),
        r.colaborador_nome,
        r.entrada || '',
        r.saida || '',
        r.faltou ? '' : r.total_horas.toFixed(2),
        r.faltou ? 'Falta' : 'Presença',
        r.justificacao_falta || '',
      ]),
    ];

    const csv = toCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `presencas_historico_${historicoColaboradorId ? `${historicoColaboradorId}_` : ''}${filtroMes || periodo}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const colaboradoresFilteredRegistrar = useMemo(() => {
    if (!registrarSearch) return colaboradores;
    const q = registrarSearch.toLowerCase().trim();
    return colaboradores.filter((c) => c.nome_completo.toLowerCase().includes(q) || (c.categoria || '').toLowerCase().includes(q));
  }, [colaboradores, registrarSearch]);

  const selectedCount = selectedColaboradores.size;
  const selectedHasExisting = useMemo(
    () => Array.from(selectedColaboradores).some((id) => !!existentesByColab[id]),
    [selectedColaboradores, existentesByColab]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className={cardBase}>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Presenças & Faltas</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Apuramento por período <span className="font-semibold">23 → 22</span> (fecho dia 23).{' '}
                  <span className="font-semibold">{periodoLabel}</span>
                </p>
              </div>

              <SegmentedTabs value={viewMode} onChange={setViewMode} />
            </div>

            {/* Controles globais do Resumo */}
            {viewMode === 'resumo' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Período (mês de fecho)</div>
                  <Input
                    type="month"
                    value={periodo}
                    onChange={(e) => setPeriodo(e.target.value)}
                    className="dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
                  />
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{periodoLabel}</div>
                </div>

                <div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Obra (opcional)</div>
                  <Select
                    value={periodoObra}
                    onChange={(e) => setPeriodoObra(e.target.value)}
                    options={[{ value: '', label: 'Todas as obras' }, ...obras.map((o) => ({ value: o.id, label: o.nome }))]}
                    className="dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="flex items-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={refreshResumo}
                    className="w-full dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                  >
                    <RefreshCcw size={16} className="mr-2" />
                    Atualizar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* -------------------- RESUMO -------------------- */}
      {viewMode === 'resumo' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <KpiCard
              icon={<Target size={20} className="text-blue-700 dark:text-blue-300" />}
              label="Meta padrão"
              value={`${metaMesDefault}h`}
              hint="8h/dia (seg–sex)"
            />
            <KpiCard
              icon={<Users size={20} className="text-emerald-700 dark:text-emerald-300" />}
              label="Colaboradores"
              value={presencasMes.length}
              hint="Com registos"
            />
            <KpiCard
              icon={<Clock size={20} className="text-amber-700 dark:text-amber-200" />}
              label="Total de horas"
              value={`${totaisResumo.totalHoras.toFixed(1)}h`}
              hint={`${totaisResumo.totalDias} dias`}
            />
            <KpiCard
              icon={<UserX size={20} className="text-red-700 dark:text-red-300" />}
              label="Faltas"
              value={totaisResumo.totalFaltas}
              tone={totaisResumo.totalFaltas > 0 ? 'warn' : 'default'}
            />
          </div>

          {/* Pesquisa + Select colaborador */}
          <Card className={cardBase}>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="relative sm:col-span-2">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input
                    type="text"
                    placeholder="Pesquisar colaborador..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400
                               focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent
                               dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-100 dark:placeholder:text-slate-500
                               dark:focus:ring-[#66A7E6]/25"
                  />
                </div>

                <div>
                  <Select
                    value={resumoColaboradorId}
                    onChange={(e) => setResumoColaboradorId(e.target.value)}
                    options={[
                      { value: '', label: 'Todos os colaboradores' },
                      ...presencasMes
                        .slice()
                        .sort((a, b) => a.colaborador.nome_completo.localeCompare(b.colaborador.nome_completo))
                        .map((p) => ({ value: p.colaborador_id, label: p.colaborador.nome_completo })),
                    ]}
                    className="dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lista */}
          <Card className={cardBase}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  Desempenho de Colaboradores — <span className="text-slate-500 dark:text-slate-400">{periodoLabel}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">Período</span>
                  <Input
                    type="month"
                    value={periodo}
                    onChange={(e) => setPeriodo(e.target.value)}
                    className="min-w-[170px] dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {loadingResumo ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{ borderColor: BRAND.blue }} />
                </div>
              ) : filteredPresencas.length === 0 ? (
                <div className="text-center py-12">
                  <Clock size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
                  <p className="text-slate-500 dark:text-slate-400">Nenhum registo encontrado</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredPresencas.map((presenca) => {
                    const meta = presenca.meta_horas || metaMesDefault;
                    const pct = presenca.percentual_meta;
                    const atingiuMeta = pct >= 100;
                    const proximo = pct >= 80 && pct < 100;

                    return (
                      <div
                        key={presenca.colaborador_id}
                        className="p-4 border border-slate-200 rounded-2xl bg-white hover:shadow-md transition
                                   dark:border-slate-800/70 dark:bg-slate-950/35 dark:hover:bg-slate-950/45"
                      >
                        <div className="flex items-start gap-4">
                          {presenca.colaborador.foto_url ? (
                            <img
                              src={presenca.colaborador.foto_url}
                              alt={presenca.colaborador.nome_completo}
                              className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl object-cover border border-slate-200 dark:border-slate-800"
                            />
                          ) : (
                            <div
                              className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center text-white font-semibold"
                              style={{ background: BRAND.blue }}
                            >
                              {getInitials(presenca.colaborador.nome_completo)}
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{presenca.colaborador.nome_completo}</div>
                                {presenca.colaborador.categoria && (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 truncate">{presenca.colaborador.categoria}</div>
                                )}
                              </div>

                              <Badge variant={atingiuMeta ? 'success' : proximo ? 'warning' : 'default'}>{eurPct(pct)} da meta</Badge>
                            </div>

                            <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-3">
                              <div className="rounded-xl border border-slate-200 dark:border-slate-800/70 bg-slate-50 dark:bg-slate-950/25 p-3">
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">Horas</div>
                                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{presenca.horas_trabalhadas.toFixed(1)}h</div>
                              </div>

                              <div className="rounded-xl border border-slate-200 dark:border-slate-800/70 bg-slate-50 dark:bg-slate-950/25 p-3">
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">Dias</div>
                                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{presenca.dias_trabalhados}</div>
                              </div>

                              <div className="rounded-xl border border-slate-200 dark:border-slate-800/70 bg-slate-50 dark:bg-slate-950/25 p-3">
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">Faltas</div>
                                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{presenca.faltas}</div>
                              </div>

                              <div className="hidden sm:block rounded-xl border border-slate-200 dark:border-slate-800/70 bg-slate-50 dark:bg-slate-950/25 p-3">
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">Último</div>
                                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {presenca.ultimo_registro ? new Date(`${presenca.ultimo_registro}T12:00:00`).toLocaleDateString('pt-PT') : '—'}
                                </div>
                              </div>

                              <div className="hidden sm:block rounded-xl border border-slate-200 dark:border-slate-800/70 bg-slate-50 dark:bg-slate-950/25 p-3">
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">Meta</div>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={String(metasByColab[presenca.colaborador_id] ?? meta)}
                                    onChange={(e) => {
                                      const v = safeNumber(e.target.value, meta);
                                      setMetasByColab((prev) => ({ ...prev, [presenca.colaborador_id]: v }));
                                    }}
                                    onBlur={(e) => {
                                      const v = safeNumber(e.target.value, metaMesDefault);
                                      if (v >= 0) saveMeta(presenca.colaborador_id, v);
                                    }}
                                    className="h-9 w-[110px] dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
                                  />
                                  <span className="text-xs text-slate-500 dark:text-slate-400">h</span>
                                </div>
                              </div>
                            </div>

                            <div className="sm:hidden mt-3 rounded-xl border border-slate-200 dark:border-slate-800/70 bg-slate-50 dark:bg-slate-950/25 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-xs text-slate-500 dark:text-slate-400">Meta (período)</div>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={String(metasByColab[presenca.colaborador_id] ?? meta)}
                                    onChange={(e) => {
                                      const v = safeNumber(e.target.value, meta);
                                      setMetasByColab((prev) => ({ ...prev, [presenca.colaborador_id]: v }));
                                    }}
                                    onBlur={(e) => {
                                      const v = safeNumber(e.target.value, metaMesDefault);
                                      if (v >= 0) saveMeta(presenca.colaborador_id, v);
                                    }}
                                    className="h-10 w-[120px] dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
                                  />
                                  <span className="text-xs text-slate-500 dark:text-slate-400">h</span>
                                </div>
                              </div>
                            </div>

                            <div className="mt-3">
                              <div className="h-2 bg-slate-100 dark:bg-slate-800/70 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all ${atingiuMeta ? 'bg-emerald-500' : proximo ? 'bg-amber-500' : 'bg-blue-500'}`}
                                  style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
                                <span>{presenca.horas_trabalhadas.toFixed(1)}h</span>
                                <span>Meta: {meta}h</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* -------------------- REGISTRAR -------------------- */}
      {viewMode === 'registrar' && (
        <Card className={cardBase}>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="font-semibold text-slate-900 dark:text-slate-100">Registrar Presença ou Falta</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Período ativo: <span className="font-semibold">{periodoLabel}</span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {(selectedDateOutOfPeriodo || selectedDateIsSunday) && (
              <div className="rounded-2xl border border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 p-4">
                <div className="text-sm text-amber-900 dark:text-amber-200 font-semibold">Atenção</div>
                {selectedDateOutOfPeriodo && (
                  <div className="mt-1 text-sm text-amber-900 dark:text-amber-200">
                    Data fora do período. Ajuste para uma data entre <strong>{rangeInicio}</strong> e <strong>{rangeFim}</strong>.
                  </div>
                )}
                {selectedDateIsSunday && <div className="mt-1 text-sm text-amber-900 dark:text-amber-200">Domingo: o sistema bloqueia registos.</div>}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Obra *</label>
                <Select
                  value={selectedObra}
                  onChange={(e) => setSelectedObra(e.target.value)}
                  options={[{ value: '', label: 'Selecione uma obra' }, ...obras.map((o) => ({ value: o.id, label: o.nome }))]}
                  className="dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Data *</label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
                  min={rangeInicio}
                  max={rangeFim}
                />
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatWeekdayLabel(selectedDate)}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800/70 bg-slate-50 dark:bg-slate-950/25 p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">Tipo de registo</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={tipoRegistro === 'presenca' ? 'primary' : 'secondary'} onClick={() => setTipoRegistro('presenca')} className="w-full">
                    <LogIn size={16} className="mr-2" />
                    Presença
                  </Button>
                  <Button variant={tipoRegistro === 'falta' ? 'primary' : 'secondary'} onClick={() => setTipoRegistro('falta')} className="w-full">
                    <UserX size={16} className="mr-2" />
                    Falta
                  </Button>
                </div>

                {selectedObra && colaboradores.length > 0 && (
                  <div className="mt-3">
                    <Button
                      variant="secondary"
                      onClick={() => loadExistentesRegistrar(selectedObra, selectedDate, colaboradores)}
                      className="w-full dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                    >
                      <RefreshCcw size={16} className="mr-2" />
                      Atualizar estado
                      {loadingExistentes ? <span className="ml-2 text-xs opacity-75">(a carregar)</span> : null}
                    </Button>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800/70 bg-white dark:bg-slate-950/20 p-4">
                {tipoRegistro === 'presenca' ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                        <LogIn size={14} className="inline mr-1" />
                        Entrada
                      </label>
                      <Input
                        type="time"
                        value={horaEntrada}
                        onChange={(e) => setHoraEntrada(e.target.value)}
                        className="dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                        <LogOut size={14} className="inline mr-1" />
                        Saída
                      </label>
                      <Input
                        type="time"
                        value={horaSaida}
                        onChange={(e) => setHoraSaida(e.target.value)}
                        className="dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
                      />
                    </div>

                    <div className="col-span-2 text-xs text-slate-500 dark:text-slate-400">
                      Dica: desconta 1h de almoço apenas se o turno cruzar <strong>{ALMOCO_INICIO}–{ALMOCO_FIM}</strong> e tiver pelo menos <strong>{MIN_HORAS_PARA_ALMOCO}h</strong> brutas.
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Justificação (opcional)</label>
                    <Input
                      value={justificacaoFalta}
                      onChange={(e) => setJustificacaoFalta(e.target.value)}
                      placeholder="Ex: Doença, assunto pessoal..."
                      className="dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                    <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">A justificação fica guardada como observação do registo de falta.</div>
                  </div>
                )}
              </div>
            </div>

            {/* Lista de colaboradores */}
            {selectedObra && colaboradores.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Colaboradores da obra</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Se já existir registo no dia, o botão vai atualizar (sobrescreve entrada/saída ou falta).
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={selecionarTodos}
                      className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                    >
                      {selectedColaboradores.size === colaboradores.length ? 'Desmarcar todos' : 'Selecionar todos'}
                    </Button>
                  </div>
                </div>

                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input
                    value={registrarSearch}
                    onChange={(e) => setRegistrarSearch(e.target.value)}
                    placeholder="Pesquisar na obra..."
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm text-slate-900
                               focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent
                               dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>

                <div
                  className="space-y-2 max-h-[520px] overflow-y-auto border border-slate-200 rounded-2xl p-3 bg-white
                             dark:border-slate-800/70 dark:bg-slate-950/20"
                >
                  {colaboradoresFilteredRegistrar.map((colab) => {
                    const isSelected = selectedColaboradores.has(colab.id);
                    const existente = existentesByColab[colab.id];
                    const jaRegistrado = !!existente;

                    return (
                      <div
                        key={colab.id}
                        onClick={() => toggleColaborador(colab.id)}
                        className={`p-3 rounded-xl border-2 cursor-pointer transition ${
                          isSelected
                            ? 'border-[#0B4F8A] bg-blue-50 dark:bg-blue-500/10'
                            : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700 dark:bg-slate-950/15'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-5 w-5 rounded border-2 flex items-center justify-center ${
                              isSelected ? 'border-[#0B4F8A] bg-[#0B4F8A]' : 'border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {isSelected && <CheckCircle size={14} className="text-white" />}
                          </div>

                          {colab.foto_url ? (
                            <img src={colab.foto_url} alt={colab.nome_completo} className="h-10 w-10 rounded-xl object-cover" />
                          ) : (
                            <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white text-sm font-semibold" style={{ background: BRAND.blue }}>
                              {getInitials(colab.nome_completo)}
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{colab.nome_completo}</div>
                            {colab.categoria && <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{colab.categoria}</div>}

                            {jaRegistrado && existente.status === 'presenca' && (
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {existente.entrada ? isoToHHMM(existente.entrada) : '--'} — {existente.saida ? isoToHHMM(existente.saida) : '--'} ·{' '}
                                {existente.total_horas.toFixed(1)}h
                              </div>
                            )}

                            {jaRegistrado && existente.status === 'falta' && (
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                                Motivo: {existente.justificacao ? existente.justificacao : '—'}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {jaRegistrado && (
                              <Badge variant={existente.status === 'falta' ? 'danger' : 'success'}>
                                {existente.status === 'falta' ? (
                                  <>
                                    <UserX size={12} className="mr-1" />
                                    Falta
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle size={12} className="mr-1" />
                                    Presente
                                  </>
                                )}
                              </Badge>
                            )}

                            <Badge variant={colab.status === 'ativo' ? 'success' : 'default'}>{colab.status}</Badge>

                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e: any) => {
                                e.stopPropagation();
                                openEditModal(colab);
                              }}
                              className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                            >
                              <Pencil size={14} className="mr-1" />
                              {jaRegistrado ? 'Editar' : 'Marcar'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {colaboradoresFilteredRegistrar.length === 0 && (
                    <div className="text-center py-10 text-slate-500 dark:text-slate-400">
                      <Users size={40} className="mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                      <div>Nenhum colaborador encontrado</div>
                    </div>
                  )}
                </div>

                <div className="sticky bottom-0 z-10">
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800/70 bg-white/95 dark:bg-slate-950/70 backdrop-blur p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-sm text-slate-700 dark:text-slate-200">
                      <strong>{selectedCount}</strong> selecionado(s)
                      {selectedCount > 0 && (
                        <span className="text-slate-500 dark:text-slate-400">
                          {' '}
                          • {selectedHasExisting ? 'vai atualizar' : 'vai registrar'} {tipoRegistro === 'falta' ? 'falta' : 'presença'}
                        </span>
                      )}
                    </div>

                    <Button
                      className="w-full sm:w-auto"
                      onClick={handleRegistrarPresenca}
                      disabled={!selectedObra || selectedCount === 0 || selectedDateIsSunday || selectedDateOutOfPeriodo}
                    >
                      <Plus size={18} className="mr-2" />
                      {selectedHasExisting
                        ? `Atualizar ${tipoRegistro === 'falta' ? 'Falta' : 'Presença'}`
                        : `Registrar ${tipoRegistro === 'falta' ? 'Falta' : 'Presença'}`}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {selectedObra && colaboradores.length === 0 && (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                <Users size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
                <p>Nenhum colaborador alocado nesta obra</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* -------------------- HISTÓRICO -------------------- */}
      {viewMode === 'historico' && (
        <Card className={cardBase}>
          <CardHeader>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 dark:text-slate-100">Histórico de Registos</div>
                {historicoPeriodoLabel && (
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Período: <span className="font-semibold">{historicoPeriodoLabel}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Select
                  value={filtroObra}
                  onChange={(e) => setFiltroObra(e.target.value)}
                  options={[{ value: '', label: 'Todas as obras' }, ...obras.map((o) => ({ value: o.id, label: o.nome }))]}
                  className="min-w-[180px] dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
                />

                <Input
                  type="month"
                  value={filtroMes}
                  onChange={(e) => setFiltroMes(e.target.value)}
                  className="min-w-[170px] dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
                />

                <Select
                  value={historicoColaboradorId}
                  onChange={(e) => setHistoricoColaboradorId(e.target.value)}
                  options={[{ value: '', label: 'Todos os colaboradores' }, ...historicoColaboradoresOptions]}
                  className="min-w-[220px] dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
                />

                <Button
                  variant="secondary"
                  onClick={exportHistoricoCSV}
                  className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                >
                  <Download size={16} className="mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {loadingHistorico ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto" style={{ borderColor: BRAND.blue }} />
              </div>
            ) : historico.length === 0 ? (
              <div className="text-center py-12">
                <Calendar size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
                <p className="text-slate-500 dark:text-slate-400">Nenhum registo encontrado</p>
              </div>
            ) : (
              <>
                {/* Mobile: cards */}
                <div className="md:hidden space-y-3">
                  {historico.map((reg) => (
                    <div key={reg.id} className="rounded-2xl border border-slate-200 dark:border-slate-800/70 bg-white dark:bg-slate-950/35 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {new Date(`${reg.data}T12:00:00`).toLocaleDateString('pt-PT', {
                              day: '2-digit',
                              month: 'short',
                              weekday: 'short',
                            })}
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-300 truncate">{reg.colaborador_nome}</div>
                        </div>

                        {reg.faltou ? (
                          <Badge variant="danger">
                            <UserX size={12} className="mr-1" />
                            Falta
                          </Badge>
                        ) : (
                          <Badge variant="success">
                            <CheckCircle size={12} className="mr-1" />
                            Presente
                          </Badge>
                        )}
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800/70 bg-slate-50 dark:bg-slate-950/25 p-3">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">Entrada</div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{reg.entrada || '—'}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800/70 bg-slate-50 dark:bg-slate-950/25 p-3">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">Saída</div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{reg.saida || '—'}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800/70 bg-slate-50 dark:bg-slate-950/25 p-3">
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">Total</div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{reg.faltou ? '—' : `${reg.total_horas.toFixed(1)}h`}</div>
                        </div>
                      </div>

                      {reg.faltou && reg.justificacao_falta && (
                        <div className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                          <span className="font-semibold">Justificação:</span> {reg.justificacao_falta}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop: tabela */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800/70">
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Data</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Colaborador</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Entrada</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Saída</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Total</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200">Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {historico.map((reg) => (
                        <tr
                          key={reg.id}
                          className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800/50 dark:hover:bg-slate-950/35"
                        >
                          <td className="py-3 px-4 text-sm text-slate-900 dark:text-slate-100">
                            {new Date(`${reg.data}T12:00:00`).toLocaleDateString('pt-PT')}
                          </td>
                          <td className="py-3 px-4 text-sm font-medium text-slate-900 dark:text-slate-100">{reg.colaborador_nome}</td>
                          <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-300">{reg.entrada || '-'}</td>
                          <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-300">{reg.saida || '-'}</td>
                          <td className="py-3 px-4 text-sm font-semibold text-slate-900 dark:text-slate-100">{reg.faltou ? '-' : `${reg.total_horas.toFixed(1)}h`}</td>
                          <td className="py-3 px-4">
                            {reg.faltou ? (
                              <Badge variant="danger">
                                <UserX size={12} className="mr-1" />
                                Falta
                              </Badge>
                            ) : (
                              <Badge variant="success">
                                <CheckCircle size={12} className="mr-1" />
                                Presente
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modal Editar/Marcar Registo */}
      <SimpleModal
        open={editOpen}
        title={
          editColab
            ? `${existentesByColab[editColab.id] ? 'Editar registo' : 'Marcar registo'} — ${editColab.nome_completo}`
            : 'Registo'
        }
        onClose={() => {
          if (editSaving) return;
          setEditOpen(false);
          setEditColab(null);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                if (editSaving) return;
                setEditOpen(false);
                setEditColab(null);
              }}
              className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
            >
              Cancelar
            </Button>

            <Button
              variant="secondary"
              onClick={handleClearEdit}
              disabled={editSaving || !editColab || !existentesByColab[editColab.id] || selectedDateOutOfPeriodo}
              className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
            >
              <Trash2 size={16} className="mr-2" />
              Remover do dia
            </Button>

            <Button onClick={handleSaveEdit} disabled={editSaving || !editColab || selectedDateIsSunday || !selectedObra || selectedDateOutOfPeriodo}>
              {editSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </>
        }
      >
        {!editColab ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">Selecione um colaborador.</div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="text-xs text-slate-500 dark:text-slate-400">Período ativo</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{periodoLabel}</div>
              {selectedDateOutOfPeriodo && <div className="mt-2 text-xs text-amber-800 dark:text-amber-200">Esta data está fora do período.</div>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Obra</div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {selectedObra ? obras.find((o) => o.id === selectedObra)?.nome ?? '—' : 'Selecione uma obra antes'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Data</div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('pt-PT')}</div>
                {selectedDateIsSunday && <div className="mt-1 text-xs text-red-700 dark:text-red-300">Domingo: bloqueado.</div>}
              </div>
            </div>

            {!selectedObra && (
              <div className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 rounded-lg p-3">
                Selecione uma obra no ecrã “Registrar” para gravar este registo.
              </div>
            )}

            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Tipo</div>
              <div className="flex gap-2">
                <Button
                  variant={editStatus === 'presenca' ? 'primary' : 'secondary'}
                  onClick={() => setEditStatus('presenca')}
                  className="flex-1"
                  disabled={editSaving || !selectedObra}
                >
                  <CheckCircle size={16} className="mr-2" />
                  Presença
                </Button>
                <Button
                  variant={editStatus === 'falta' ? 'primary' : 'secondary'}
                  onClick={() => setEditStatus('falta')}
                  className="flex-1"
                  disabled={editSaving || !selectedObra}
                >
                  <UserX size={16} className="mr-2" />
                  Falta
                </Button>
              </div>
            </div>

            {editStatus === 'presenca' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Entrada</label>
                  <Input
                    type="time"
                    value={editEntrada}
                    onChange={(e) => setEditEntrada(e.target.value)}
                    className="dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Saída</label>
                  <Input
                    type="time"
                    value={editSaida}
                    onChange={(e) => setEditSaida(e.target.value)}
                    className="dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="sm:col-span-2">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Total calculado:{' '}
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{editDiffPreview !== null ? `${editDiffPreview.toFixed(2)}h` : '—'}</span>
                    <span className="ml-2">(desconta almoço só se cruzar {ALMOCO_INICIO}–{ALMOCO_FIM})</span>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Justificação (opcional)</label>
                <Input
                  value={editJustificacao}
                  onChange={(e) => setEditJustificacao(e.target.value)}
                  placeholder="Ex: Doença, assunto pessoal..."
                  className="dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
            )}

            {editColab && existentesByColab[editColab.id] && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Estado atual</div>
                  <Badge variant={existentesByColab[editColab.id].status === 'falta' ? 'danger' : 'success'}>
                    {existentesByColab[editColab.id].status === 'falta' ? 'Falta' : 'Presença'}
                  </Badge>
                </div>

                {existentesByColab[editColab.id].status === 'presenca' ? (
                  <div className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                    {existentesByColab[editColab.id].entrada ? isoToHHMM(existentesByColab[editColab.id].entrada!) : '--'} —{' '}
                    {existentesByColab[editColab.id].saida ? isoToHHMM(existentesByColab[editColab.id].saida!) : '--'} ·{' '}
                    {existentesByColab[editColab.id].total_horas.toFixed(1)}h
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                    Motivo: {existentesByColab[editColab.id].justificacao ? existentesByColab[editColab.id].justificacao : '—'}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </SimpleModal>
    </div>
  );
}