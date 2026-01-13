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
  XCircle,
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

const HORAS_DIA = 8;

const cardBase =
  'border border-slate-200 bg-white shadow-sm ' +
  'dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30';

// --- Período: 24 -> 23 (mês de fecho dia 23) ---

function safeDateISO(y: number, m1: number, d: number) {
  const dt = new Date(y, m1 - 1, d);
  return dt.toISOString().split('T')[0];
}

function getPeriodo24a23(ano: number, mes1: number) {
  const end = safeDateISO(ano, mes1, 23);

  let prevMes1 = mes1 - 1;
  let prevAno = ano;
  if (prevMes1 < 1) {
    prevMes1 = 12;
    prevAno = ano - 1;
  }

  const start = safeDateISO(prevAno, prevMes1, 24);

  return {
    startISO: start,
    endISO: end,
    startAno: prevAno,
    startMes1: prevMes1,
    endAno: ano,
    endMes1: mes1,
  };
}

function calcularMetaPeriodo(startISO: string, endISO: string): number {
  const dataInicio = new Date(`${startISO}T00:00:00`);
  const dataFim = new Date(`${endISO}T00:00:00`);
  if (Number.isNaN(dataInicio.getTime()) || Number.isNaN(dataFim.getTime())) return 0;

  let diasUteis = 0;
  const cur = new Date(dataInicio);

  while (cur <= dataFim) {
    const dow = cur.getDay();
    // seg-sex
    if (dow !== 0 && dow !== 6) diasUteis++;
    cur.setDate(cur.getDate() + 1);
  }

  return diasUteis * HORAS_DIA;
}

function isBetweenISO(dateISO: string, startISO: string, endISO: string) {
  // ISO YYYY-MM-DD compara lexicograficamente
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
  const d = new Date(`${dateISO}T00:00:00`);
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
  const d = new Date(`${dateISO}T00:00:00`);
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

export function Presencas() {
  const now = new Date();
  const mesNow0 = now.getMonth();
  const anoNow = now.getFullYear();

  const [periodo, setPeriodo] = useState<string>(`${anoNow}-${String(mesNow0 + 1).padStart(2, '0')}`);
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

  // Registrar
  const [selectedObra, setSelectedObra] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedColaboradores, setSelectedColaboradores] = useState<Set<string>>(new Set());
  const [tipoRegistro, setTipoRegistro] = useState<'presenca' | 'falta'>('presenca');
  const [horaEntrada, setHoraEntrada] = useState('08:00');
  const [horaSaida, setHoraSaida] = useState('17:00');
  const [justificacaoFalta, setJustificacaoFalta] = useState(''); // opcional

  // Registrar: amarração com existentes (obra+data)
  const [existentesByColab, setExistentesByColab] = useState<Record<string, PresencaExistente>>({});
  const [loadingExistentes, setLoadingExistentes] = useState(false);

  // Modal de edição
  const [editOpen, setEditOpen] = useState(false);
  const [editColab, setEditColab] = useState<Colaborador | null>(null);
  const [editStatus, setEditStatus] = useState<RegistrarStatus>('presenca');
  const [editEntrada, setEditEntrada] = useState('08:00');
  const [editSaida, setEditSaida] = useState('17:00');
  const [editJustificacao, setEditJustificacao] = useState(''); // opcional
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

    const { startISO, endISO, startMes1, startAno, endMes1, endAno } = getPeriodo24a23(ano, mes1);

    const metaDefault = calcularMetaPeriodo(startISO, endISO);

    const startLabel = `24/${String(startMes1).padStart(2, '0')}/${startAno}`;
    const endLabel = `23/${String(endMes1).padStart(2, '0')}/${endAno}`;
    const label = `${startLabel} → ${endLabel}`;

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

  // Garante que a data selecionada do "Registrar" fique dentro do período 24→23
  useEffect(() => {
    if (viewMode !== 'registrar') return;

    const todayISO = new Date().toISOString().split('T')[0];
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

        const { startISO, endISO } = getPeriodo24a23(ano, mes1);
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
          entrada: entradaTs
            ? new Date(entradaTs).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
            : null,
          saida: saidaTs ? new Date(saidaTs).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : null,
          total_horas: safeNumber(p.total_horas, 0),
          faltou,
          justificacao_falta: (falta?.observacao ?? null) as any,
        };
      });

      let registrosFinal = registros;

      if (historicoColaboradorId) {
        registrosFinal = registrosFinal.filter((r) => r.colaborador_id === historicoColaboradorId);
      }

      setHistorico(registrosFinal);
    } catch (e: any) {
      console.error('[loadHistorico] erro inesperado:', e);
      toast.error('Erro ao carregar histórico');
      setHistorico([]);
    } finally {
      setLoadingHistorico(false);
    }
  };

  // Helpers de gravação (1 colaborador)
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

    if (Number.isNaN(entrada.getTime()) || Number.isNaN(saida.getTime())) {
      throw new Error('Horários inválidos');
    }
    if (saida.getTime() <= entrada.getTime()) {
      throw new Error('A hora de saída deve ser maior do que a entrada');
    }

    const diffMs = saida.getTime() - entrada.getTime();
    const diffHoras = diffMs / (1000 * 60 * 60);

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

  const editDiffPreview = useMemo(() => {
    if (editStatus !== 'presenca') return null;
    const entrada = new Date(`${selectedDate}T${editEntrada}:00`);
    const saida = new Date(`${selectedDate}T${editSaida}:00`);
    if (Number.isNaN(entrada.getTime()) || Number.isNaN(saida.getTime())) return null;
    if (saida.getTime() <= entrada.getTime()) return null;
    const diffHoras = (saida.getTime() - entrada.getTime()) / (1000 * 60 * 60);
    return diffHoras;
  }, [editStatus, editEntrada, editSaida, selectedDate]);

  const handleSaveEdit = async () => {
    if (!editColab) return;
    if (!selectedObra) {
      toast.error('Selecione uma obra');
      return;
    }

    if (selectedDateOutOfPeriodo) {
      toast.error(`Data fora do período selecionado (${periodoLabel})`);
      return;
    }

    if (selectedDateIsSunday) {
      toast.error('Não é permitido registrar/editar no domingo');
      return;
    }

    setEditSaving(true);
    try {
      if (editStatus === 'falta') {
        await registrarFaltaOne(editColab.id, editJustificacao);
      } else {
        await registrarPresencaOne(editColab.id, editEntrada, editSaida);
      }

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
    if (!existente) {
      toast.error('Não existe registo neste dia para remover');
      return;
    }

    if (selectedDateOutOfPeriodo) {
      toast.error(`Data fora do período selecionado (${periodoLabel})`);
      return;
    }

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
    if (!selectedObra || selectedColaboradores.size === 0) {
      toast.error('Selecione uma obra e pelo menos um colaborador');
      return;
    }

    if (selectedDateOutOfPeriodo) {
      toast.error(`Data fora do período selecionado (${periodoLabel})`);
      return;
    }

    if (selectedDateIsSunday) {
      toast.error('Não é permitido registrar no domingo');
      return;
    }

    if (tipoRegistro === 'presenca') {
      const entrada = new Date(`${selectedDate}T${horaEntrada}:00`);
      const saida = new Date(`${selectedDate}T${horaSaida}:00`);
      if (Number.isNaN(entrada.getTime()) || Number.isNaN(saida.getTime())) {
        toast.error('Horários inválidos');
        return;
      }
      if (saida.getTime() <= entrada.getTime()) {
        toast.error('A hora de saída deve ser maior do que a entrada');
        return;
      }
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
    return { totalHoras, totalFaltas };
  }, [presencasMes]);

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
    if (!historico.length) {
      toast.error('Sem dados para exportar');
      return;
    }

    const rows: string[][] = [
      ['Data', 'Colaborador', 'Entrada', 'Saída', 'Total (h)', 'Status', 'Justificação'],
      ...historico.map((r) => [
        new Date(r.data).toLocaleDateString('pt-PT'),
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className={cardBase}>
        <CardContent className="p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Presenças & Faltas</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Apuramento por período <span className="font-semibold">24 → 23</span> (fecho dia 23).{' '}
                  <span className="font-semibold">{periodoLabel}</span>
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant={viewMode === 'resumo' ? 'primary' : 'secondary'}
                  onClick={() => setViewMode('resumo')}
                  className="flex-1 sm:flex-none"
                >
                  <TrendingUp size={16} className="mr-2" />
                  Resumo
                </Button>
                <Button
                  variant={viewMode === 'registrar' ? 'primary' : 'secondary'}
                  onClick={() => setViewMode('registrar')}
                  className="flex-1 sm:flex-none"
                >
                  <Plus size={16} className="mr-2" />
                  Registrar
                </Button>
                <Button
                  variant={viewMode === 'historico' ? 'primary' : 'secondary'}
                  onClick={() => setViewMode('historico')}
                  className="flex-1 sm:flex-none"
                >
                  <Calendar size={16} className="mr-2" />
                  Histórico
                </Button>
              </div>
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
                    options={[
                      { value: '', label: 'Todas as obras' },
                      ...obras.map((o) => ({ value: o.id, label: o.nome })),
                    ]}
                    className="dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
                  />
                </div>

                <div className="flex items-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={refreshResumo}
                    className="w-full dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                  >
                    Atualizar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resumo Mensal */}
      {viewMode === 'resumo' && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className={cardBase}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Meta padrão do período</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{metaMesDefault}h</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">8h/dia (seg–sex) no período 24 → 23</div>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                    <Target size={24} className="text-blue-600 dark:text-blue-300" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={cardBase}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Colaboradores</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{presencasMes.length}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Com registos no período</div>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                    <Users size={24} className="text-emerald-600 dark:text-emerald-300" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={cardBase}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Total de horas</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                      {totaisResumo.totalHoras.toFixed(1)}h
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">No período</div>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                    <Clock size={24} className="text-amber-600 dark:text-amber-200" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={cardBase}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">Total de faltas</div>
                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{totaisResumo.totalFaltas}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">No período</div>
                  </div>
                  <div className="h-12 w-12 rounded-xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                    <UserX size={24} className="text-red-600 dark:text-red-300" />
                  </div>
                </div>
              </CardContent>
            </Card>
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
                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl bg-white text-slate-900 placeholder:text-slate-400
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
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0B4F8A] dark:border-[#66A7E6]" />
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
                        className="p-4 border border-slate-200 rounded-xl bg-white hover:shadow-md transition
                                   dark:border-slate-800/70 dark:bg-slate-950/35 dark:hover:bg-slate-950/45"
                      >
                        <div className="flex items-start gap-4">
                          {presenca.colaborador.foto_url ? (
                            <img
                              src={presenca.colaborador.foto_url}
                              alt={presenca.colaborador.nome_completo}
                              className="h-14 w-14 rounded-xl object-cover border border-slate-200 dark:border-slate-800"
                            />
                          ) : (
                            <div className="h-14 w-14 rounded-xl bg-[#0B4F8A] flex items-center justify-center text-white font-semibold">
                              {getInitials(presenca.colaborador.nome_completo)}
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                  {presenca.colaborador.nome_completo}
                                </div>
                                {presenca.colaborador.categoria && (
                                  <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
                                    {presenca.colaborador.categoria}
                                  </div>
                                )}
                              </div>

                              <Badge variant={atingiuMeta ? 'success' : proximo ? 'warning' : 'default'}>
                                {pct.toFixed(0)}% da meta
                              </Badge>
                            </div>

                            <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
                              <div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">Horas</div>
                                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                                  <Clock size={16} className="text-emerald-600 dark:text-emerald-300" />
                                  {presenca.horas_trabalhadas.toFixed(1)}h
                                </div>
                              </div>

                              <div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">Dias</div>
                                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                                  <CheckCircle size={16} className="text-blue-600 dark:text-blue-300" />
                                  {presenca.dias_trabalhados}
                                </div>
                              </div>

                              <div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">Faltas</div>
                                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                                  <XCircle size={16} className="text-red-600 dark:text-red-300" />
                                  {presenca.faltas}
                                </div>
                              </div>

                              <div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">Último registo</div>
                                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                  {presenca.ultimo_registro
                                    ? new Date(`${presenca.ultimo_registro}T00:00:00`).toLocaleDateString('pt-PT')
                                    : '-'}
                                </div>
                              </div>

                              <div>
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
                                    className="dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
                                  />
                                  <span className="text-xs text-slate-500 dark:text-slate-400">h</span>
                                </div>
                              </div>
                            </div>

                            <div className="mt-3">
                              <div className="h-2 bg-slate-100 dark:bg-slate-800/70 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all ${atingiuMeta ? 'bg-emerald-500' : proximo ? 'bg-amber-500' : 'bg-blue-500'}`}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
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

      {/* Registrar */}
      {viewMode === 'registrar' && (
        <Card className={cardBase}>
          <CardHeader>
            <div className="font-semibold text-slate-900 dark:text-slate-100">Registrar Presença ou Falta</div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/35">
              <div className="text-sm text-slate-700 dark:text-slate-200">
                Período ativo: <span className="font-semibold">{periodoLabel}</span>
              </div>
              {selectedDateOutOfPeriodo && (
                <div className="mt-2 text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25 rounded-lg p-2">
                  A data selecionada está fora do período. Ajuste para uma data entre <strong>{rangeInicio}</strong> e <strong>{rangeFim}</strong>.
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Obra *</label>
                <Select
                  value={selectedObra}
                  onChange={(e) => setSelectedObra(e.target.value)}
                  options={[
                    { value: '', label: 'Selecione uma obra' },
                    ...obras.map((o) => ({ value: o.id, label: o.nome })),
                  ]}
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

                {selectedDateIsSunday && (
                  <div className="mt-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/25 rounded-lg p-2">
                    Domingo: não é permitido registrar presenças/faltas.
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Tipo de registo</label>
                <div className="flex gap-3">
                  <Button
                    variant={tipoRegistro === 'presenca' ? 'primary' : 'secondary'}
                    onClick={() => setTipoRegistro('presenca')}
                    className="flex-1"
                  >
                    <LogIn size={16} className="mr-2" />
                    Presença
                  </Button>

                  <Button
                    variant={tipoRegistro === 'falta' ? 'primary' : 'secondary'}
                    onClick={() => setTipoRegistro('falta')}
                    className="flex-1"
                  >
                    <UserX size={16} className="mr-2" />
                    Falta
                  </Button>
                </div>
              </div>

              {selectedObra && colaboradores.length > 0 && (
                <div className="flex items-end">
                  <Button
                    variant="secondary"
                    onClick={() => loadExistentesRegistrar(selectedObra, selectedDate, colaboradores)}
                    className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                  >
                    <RefreshCcw size={16} className="mr-2" />
                    Atualizar estado
                  </Button>
                </div>
              )}
            </div>

            {tipoRegistro === 'presenca' && (
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
              </div>
            )}

            {tipoRegistro === 'falta' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Justificação (opcional)
                </label>
                <Input
                  value={justificacaoFalta}
                  onChange={(e) => setJustificacaoFalta(e.target.value)}
                  placeholder="Ex: Doença, assunto pessoal..."
                  className="dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
            )}

            {selectedObra && colaboradores.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Colaboradores da obra</label>
                  <div className="flex items-center gap-2">
                    {loadingExistentes && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">A carregar estado...</span>
                    )}
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

                <div
                  className="space-y-2 max-h-[420px] overflow-y-auto border border-slate-200 rounded-xl p-3 bg-white
                             dark:border-slate-800/70 dark:bg-slate-950/20"
                >
                  {colaboradores.map((colab) => {
                    const isSelected = selectedColaboradores.has(colab.id);
                    const existente = existentesByColab[colab.id];
                    const jaRegistrado = !!existente;

                    return (
                      <div
                        key={colab.id}
                        onClick={() => toggleColaborador(colab.id)}
                        className={`p-3 rounded-lg border-2 cursor-pointer transition ${
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
                            <img src={colab.foto_url} alt={colab.nome_completo} className="h-10 w-10 rounded-lg object-cover" />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-[#0B4F8A] flex items-center justify-center text-white text-sm font-semibold">
                              {getInitials(colab.nome_completo)}
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate">{colab.nome_completo}</div>
                            {colab.categoria && (
                              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{colab.categoria}</div>
                            )}

                            {jaRegistrado && existente.status === 'presenca' && (
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {existente.entrada ? isoToHHMM(existente.entrada) : '--'} — {existente.saida ? isoToHHMM(existente.saida) : '--'}
                                {' · '}
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
                </div>

                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/25">
                  <div className="text-sm text-blue-900 dark:text-blue-200">
                    <strong>{selectedColaboradores.size}</strong> colaborador(es) selecionado(s)
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

            <Button
              className="w-full"
              onClick={handleRegistrarPresenca}
              disabled={!selectedObra || selectedColaboradores.size === 0 || selectedDateIsSunday || selectedDateOutOfPeriodo}
            >
              <Plus size={18} className="mr-2" />
              {selectedColaboradores.size > 0 && Array.from(selectedColaboradores).some((id) => !!existentesByColab[id])
                ? `Atualizar ${tipoRegistro === 'falta' ? 'Falta' : 'Presença'}`
                : `Registrar ${tipoRegistro === 'falta' ? 'Falta' : 'Presença'}`}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Histórico */}
      {viewMode === 'historico' && (
        <Card className={cardBase}>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="font-semibold text-slate-900 dark:text-slate-100">Histórico de Registos</div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Select
                  value={filtroObra}
                  onChange={(e) => setFiltroObra(e.target.value)}
                  options={[
                    { value: '', label: 'Todas as obras' },
                    ...obras.map((o) => ({ value: o.id, label: o.nome })),
                  ]}
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
                  options={[
                    { value: '', label: 'Todos os colaboradores' },
                    ...historicoColaboradoresOptions,
                  ]}
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
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0B4F8A] dark:border-[#66A7E6]" />
              </div>
            ) : historico.length === 0 ? (
              <div className="text-center py-12">
                <Calendar size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
                <p className="text-slate-500 dark:text-slate-400">Nenhum registo encontrado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
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
                          {new Date(reg.data).toLocaleDateString('pt-PT')}
                        </td>
                        <td className="py-3 px-4 text-sm font-medium text-slate-900 dark:text-slate-100">
                          {reg.colaborador_nome}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-300">{reg.entrada || '-'}</td>
                        <td className="py-3 px-4 text-sm text-slate-600 dark:text-slate-300">{reg.saida || '-'}</td>
                        <td className="py-3 px-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {reg.faltou ? '-' : `${reg.total_horas.toFixed(1)}h`}
                        </td>
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

            <Button
              onClick={handleSaveEdit}
              disabled={editSaving || !editColab || selectedDateIsSunday || !selectedObra || selectedDateOutOfPeriodo}
            >
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
              {selectedDateOutOfPeriodo && (
                <div className="mt-2 text-xs text-amber-800 dark:text-amber-200">
                  Esta data está fora do período. Ajuste a data no ecrã “Registrar”.
                </div>
              )}
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
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('pt-PT')}
                </div>
                {selectedDateIsSunday && (
                  <div className="mt-1 text-xs text-red-700 dark:text-red-300">
                    Domingo: o sistema bloqueia edição/registo.
                  </div>
                )}
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
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {editDiffPreview !== null ? `${editDiffPreview.toFixed(2)}h` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                  Justificação (opcional)
                </label>
                <Input
                  value={editJustificacao}
                  onChange={(e) => setEditJustificacao(e.target.value)}
                  placeholder="Ex: Doença, assunto pessoal..."
                  className="dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>
            )}

            {existentesByColab[editColab.id] && (
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
