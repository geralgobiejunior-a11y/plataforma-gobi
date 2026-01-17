// src/pages/Colaboradores.tsx
import { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  Search,
  UserPlus,
  Edit,
  Eye,
  X,
  Phone,
  Mail,
  Calendar,
  Clock,
  FileWarning,
  TrendingUp,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ColaboradorModal } from '../components/colaboradores/ColaboradorModal';

interface Colaborador {
  id: string;
  nome_completo: string;
  email: string | null;
  telefone: string | null;
  status: string;
  valor_hora: number | null;
  data_entrada_plataforma: string | null; // YYYY-MM-DD
  categoria: string | null;
  foto_url: string | null;
}

type PresencaRow = {
  horas_trabalhadas: number | null;
  data: string; // YYYY-MM-DD
  colaborador_id: string;
};

type DocumentoRow = {
  data_validade: string | null; // YYYY-MM-DD
  colaborador_id: string;
};

type Metrics = {
  horas7d: number;
  horas30d: number;
  ultimaPresenca: string | null;
  docsVencidos: number;
  docsAVencer30: number;
};

const BRAND = { blue: '#0B4F8A', orange: '#F5A623' };

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Evita bugs de timezone:
 * - Para filtros no Postgres (data tipo date), use string YYYY-MM-DD construída em LOCAL.
 * - Para comparar datas YYYY-MM-DD, parse como local (T00:00:00) e compare com startOfDay(local).
 */
function toISODateLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateOnlyLocal(iso: string) {
  // iso esperado: YYYY-MM-DD
  // new Date('YYYY-MM-DD') pode ser UTC em alguns browsers; forçamos local.
  return new Date(`${iso}T00:00:00`);
}

function formatDatePT(date?: string | null) {
  if (!date) return '-';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-PT');
}

function formatEUR(value: number) {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);
}

function safeHours(n: number) {
  return Math.round((n || 0) * 10) / 10;
}

// normaliza para comparação robusta (remove acentos)
function normKey(s: string) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normStatus(s: string) {
  return normKey(s);
}

function statusLabel(s: string) {
  const v = normStatus(s);
  if (v === 'ativo') return 'Ativo';
  if (v === 'inativo') return 'Inativo';
  if (v === 'ferias') return 'Férias';
  if (v === 'baixa') return 'Baixa';
  return s || '-';
}

function getStatusVariant(status: string) {
  const s = normStatus(status);
  const variants: any = {
    ativo: 'success',
    inativo: 'default',
    ferias: 'info',
    baixa: 'warning',
  };
  return variants[s] || 'default';
}

function getInitials(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  const a = parts[0]?.[0] || 'U';
  const b = parts.length > 1 ? (parts[parts.length - 1]?.[0] || '') : '';
  return (a + b).toUpperCase();
}

function Avatar({
  name,
  foto_url,
  size = 'md',
}: {
  name: string;
  foto_url: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass = size === 'sm' ? 'h-10 w-10' : size === 'lg' ? 'h-16 w-16' : 'h-12 w-12';
  const fontSize = size === 'lg' ? 18 : size === 'md' ? 16 : 14;

  return (
    <div
      className={`${sizeClass} rounded-2xl overflow-hidden flex-shrink-0
                  ring-1 ring-slate-200 shadow-sm
                  dark:ring-slate-800 dark:shadow-black/20`}
    >
      {foto_url ? (
        <img src={foto_url} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center text-white font-bold"
          style={{
            backgroundImage: `linear-gradient(135deg, ${BRAND.blue}, #083B67)`,
            fontSize,
          }}
        >
          {getInitials(name)}
        </div>
      )}
    </div>
  );
}

function IconActionButton({
  title,
  onClick,
  children,
  danger,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      className={
        danger
          ? `p-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition
             dark:border-red-500/25 dark:text-red-200 dark:hover:bg-red-500/10`
          : `p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-[#0B4F8A] hover:bg-white transition
             dark:border-slate-800 dark:text-slate-300 dark:hover:text-[#66A7E6] dark:hover:bg-slate-900/60`
      }
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

function DocChip({
  tone,
  icon,
  label,
}: {
  tone: 'ok' | 'warn' | 'danger';
  icon: React.ReactNode;
  label: string;
}) {
  const base =
    'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold leading-none';
  const styles =
    tone === 'danger'
      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200'
        : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800/70 dark:bg-slate-900/40 dark:text-slate-200';

  return (
    <span className={`${base} ${styles}`}>
      {icon}
      {label}
    </span>
  );
}

type DeleteDeps = { presencasCount: number; docsCount: number };
type DeleteState =
  | { open: false }
  | {
      open: true;
      colaborador: Colaborador;
      checking: boolean;
      deps: DeleteDeps | null;
      deleting: boolean;
      error: string | null;
    };

function Segmented({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string; badge?: string }[];
}) {
  return (
    <div
      className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm
                 dark:border-slate-800/70 dark:bg-slate-950/30 dark:shadow-black/20"
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            className={
              active
                ? `px-3 py-2 rounded-xl text-sm font-semibold bg-[#0B4F8A] text-white`
                : `px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50
                   dark:text-slate-200 dark:hover:bg-slate-900/50`
            }
          >
            <span className="inline-flex items-center gap-2">
              {it.label}
              {it.badge ? (
                <span
                  className={
                    active
                      ? 'text-white/90 text-xs font-bold tabular-nums'
                      : 'text-slate-500 dark:text-slate-400 text-xs font-bold tabular-nums'
                  }
                >
                  {it.badge}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Colaboradores({
  onOpenDocumentosColaborador,
}: {
  onOpenDocumentosColaborador?: (colaboradorId: string) => void;
}) {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [metricsById, setMetricsById] = useState<Record<string, Metrics>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'ativos' | 'baixa'>('ativos'); // ✅ por padrão só ativos
  const [cargoFilter, setCargoFilter] = useState<string>('todos');
  const [sortKey, setSortKey] = useState<'nome' | 'horas7d' | 'docs' | 'valor'>('nome');

  const [selected, setSelected] = useState<Colaborador | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [deleteState, setDeleteState] = useState<DeleteState>({ open: false });

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setLoadError(null);

    const hoje = startOfDay(new Date());
    const cutoff30 = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000);
    const cutoff7 = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
    const em30 = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);

    const cutoff30ISO = toISODateLocal(cutoff30);

    try {
      const [colabRes, docsRes, presRes] = await Promise.all([
        supabase.from('colaboradores').select('*').order('nome_completo'),
        supabase.from('documentos').select('entidade_id, data_validade').eq('entidade_tipo', 'colaborador'),
        supabase
          .from('presencas_dia')
          .select('colaborador_id, total_horas, data')
          .gte('data', cutoff30ISO),
      ]);

      if (colabRes.error) throw colabRes.error;
      if (docsRes.error) throw docsRes.error;
      if (presRes.error) throw presRes.error;

      const colabs = (colabRes.data || []) as Colaborador[];
      setColaboradores(colabs);

      const docs = (docsRes.data || []).map((d: any) => ({
        data_validade: d.data_validade,
        colaborador_id: d.entidade_id,
      })) as DocumentoRow[];

      const presencas = (presRes.data || []).map((p: any) => ({
        horas_trabalhadas: p.total_horas,
        data: p.data,
        colaborador_id: p.colaborador_id,
      })) as PresencaRow[];

      // Docs agg
      const docsAgg: Record<string, { vencidos: number; aVencer30: number }> = {};
      for (const d of docs) {
        const id = d.colaborador_id;
        if (!id) continue;

        const dvRaw = d.data_validade;
        if (!dvRaw) continue;

        const dv = parseDateOnlyLocal(dvRaw);
        if (Number.isNaN(dv.getTime())) continue;

        if (!docsAgg[id]) docsAgg[id] = { vencidos: 0, aVencer30: 0 };

        if (dv < hoje) docsAgg[id].vencidos += 1;
        else if (dv >= hoje && dv <= em30) docsAgg[id].aVencer30 += 1;
      }

      // Presenças agg
      const presAgg: Record<string, { horas7d: number; horas30d: number; ultima: string | null }> = {};
      for (const p of presencas) {
        const id = p.colaborador_id;
        if (!id) continue;

        const dataObj = parseDateOnlyLocal(p.data);
        if (Number.isNaN(dataObj.getTime())) continue;

        const horas = Number(p.horas_trabalhadas || 0);

        if (!presAgg[id]) presAgg[id] = { horas7d: 0, horas30d: 0, ultima: null };

        presAgg[id].horas30d += horas;
        if (dataObj >= cutoff7) presAgg[id].horas7d += horas;

        if (!presAgg[id].ultima) presAgg[id].ultima = p.data;
        else {
          const prev = parseDateOnlyLocal(presAgg[id].ultima!);
          if (dataObj > prev) presAgg[id].ultima = p.data;
        }
      }

      const m: Record<string, Metrics> = {};
      for (const c of colabs) {
        const da = docsAgg[c.id] || { vencidos: 0, aVencer30: 0 };
        const pa = presAgg[c.id] || { horas7d: 0, horas30d: 0, ultima: null };

        m[c.id] = {
          horas7d: safeHours(pa.horas7d),
          horas30d: safeHours(pa.horas30d),
          ultimaPresenca: pa.ultima,
          docsVencidos: da.vencidos,
          docsAVencer30: da.aVencer30,
        };
      }

      setMetricsById(m);
    } catch (e: any) {
      console.error(e);
      setLoadError(e?.message || 'Falha ao carregar dados');
      setColaboradores([]);
      setMetricsById({});
    } finally {
      setLoading(false);
    }
  };

  const openProfile = (c: Colaborador) => setSelected(c);

  const openModal = (colaboradorId?: string) => {
    setEditingId(colaboradorId || null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const handleModalSuccess = () => {
    loadAll();
    closeModal();
  };

  // ✅ contagens para separador Ativos / Baixa
  const counts = useMemo(() => {
    const total = colaboradores.length;
    const ativos = colaboradores.filter((c) => normStatus(c.status) === 'ativo').length;
    const baixa = colaboradores.filter((c) => normStatus(c.status) === 'baixa').length;
    return { total, ativos, baixa };
  }, [colaboradores]);

  // ✅ KPIs alinhados: horas/alertas calculados sobre ATIVOS (página “normal”)
  const kpis = useMemo(() => {
    const ativosIds = new Set(colaboradores.filter((c) => normStatus(c.status) === 'ativo').map((c) => c.id));
    const alertasDocsAtivos = Object.entries(metricsById).reduce((acc, [id, m]) => {
      if (!ativosIds.has(id)) return acc;
      return acc + (m.docsVencidos + m.docsAVencer30);
    }, 0);
    const horas7dTotalAtivos = Object.entries(metricsById).reduce((acc, [id, m]) => {
      if (!ativosIds.has(id)) return acc;
      return acc + (m.horas7d || 0);
    }, 0);

    return {
      total: counts.total,
      ativos: counts.ativos,
      baixa: counts.baixa,
      alertasDocsAtivos,
      horas7dTotalAtivos: safeHours(horas7dTotalAtivos),
    };
  }, [colaboradores, metricsById, counts]);

  const cargosOptions = useMemo(() => {
    const set = new Set<string>();
    colaboradores.forEach((c) => {
      const nome = c.categoria?.trim();
      if (nome) set.add(nome);
    });
    return ['todos', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [colaboradores]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();

    // ✅ viewMode controla a listagem principal
    const statusTarget = viewMode === 'ativos' ? 'ativo' : 'baixa';

    let rows = colaboradores.filter((c) => {
      const nomeOk = !s || c.nome_completo.toLowerCase().includes(s);

      const st = normStatus(c.status);
      const statusOk = st === statusTarget;

      const cargoOk = cargoFilter === 'todos' ? true : (c.categoria || '-') === cargoFilter;
      return nomeOk && statusOk && cargoOk;
    });

    rows = rows.sort((a, b) => {
      const ma = metricsById[a.id];
      const mb = metricsById[b.id];

      if (sortKey === 'nome') return a.nome_completo.localeCompare(b.nome_completo);
      if (sortKey === 'horas7d') return (mb?.horas7d || 0) - (ma?.horas7d || 0);
      if (sortKey === 'docs')
        return (
          ((mb?.docsVencidos || 0) + (mb?.docsAVencer30 || 0)) -
          ((ma?.docsVencidos || 0) + (ma?.docsAVencer30 || 0))
        );
      if (sortKey === 'valor') return Number(b.valor_hora || 0) - Number(a.valor_hora || 0);
      return 0;
    });

    return rows;
  }, [colaboradores, search, cargoFilter, sortKey, metricsById, viewMode]);

  // ---------- DELETE (seguro) ----------
  const getDeleteDependencies = async (colaboradorId: string): Promise<DeleteDeps> => {
    // Se não existir coluna "id" nestas tabelas, ajusta para uma coluna existente.
    const [pres, docs] = await Promise.all([
      supabase
        .from('presencas_dia')
        .select('colaborador_id', { count: 'exact', head: true })
        .eq('colaborador_id', colaboradorId),
      supabase
        .from('documentos')
        .select('entidade_id', { count: 'exact', head: true })
        .eq('entidade_tipo', 'colaborador')
        .eq('entidade_id', colaboradorId),
    ]);

    if (pres.error) throw pres.error;
    if (docs.error) throw docs.error;

    return {
      presencasCount: pres.count || 0,
      docsCount: docs.count || 0,
    };
  };

  const requestDelete = async (c: Colaborador) => {
    setDeleteState({ open: true, colaborador: c, checking: true, deps: null, deleting: false, error: null });

    try {
      const deps = await getDeleteDependencies(c.id);
      setDeleteState({ open: true, colaborador: c, checking: false, deps, deleting: false, error: null });
    } catch (e: any) {
      console.error(e);
      setDeleteState({
        open: true,
        colaborador: c,
        checking: false,
        deps: null,
        deleting: false,
        error: e?.message || 'Falha ao verificar dependências',
      });
    }
  };

  const closeDelete = () => setDeleteState({ open: false });

  const markAsBaixa = async (c: Colaborador) => {
    // alternativa segura quando não dá para apagar (ou quando queres apenas “arquivar”)
    const { error } = await supabase.from('colaboradores').update({ status: 'Baixa' }).eq('id', c.id);
    if (error) {
      setDeleteState((s) =>
        s.open
          ? { ...s, error: error.message }
          : s,
      );
      return;
    }
    if (selected?.id === c.id) setSelected(null);
    closeDelete();
    await loadAll();
    setViewMode('ativos');
  };

  const confirmDelete = async () => {
    if (!deleteState.open) return;
    const c = deleteState.colaborador;

    // Se tiver dependências, não apaga por segurança (evita FK quebrar, histórico perdido, etc.)
    if (deleteState.deps && (deleteState.deps.presencasCount > 0 || deleteState.deps.docsCount > 0)) {
      setDeleteState((s) =>
        s.open
          ? { ...s, error: 'Este colaborador tem histórico (presenças/documentos). Para manter integridade, use “Marcar como Baixa”.' }
          : s,
      );
      return;
    }

    setDeleteState((s) => (s.open ? { ...s, deleting: true, error: null } : s));
    const { error } = await supabase.from('colaboradores').delete().eq('id', c.id);

    if (error) {
      setDeleteState((s) => (s.open ? { ...s, deleting: false, error: error.message } : s));
      return;
    }

    if (selected?.id === c.id) setSelected(null);
    closeDelete();
    await loadAll();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0B4F8A] dark:border-[#66A7E6]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <Card className="p-4 border border-red-200 bg-red-50 dark:border-red-500/25 dark:bg-red-500/10">
          <div className="text-sm font-semibold text-red-700 dark:text-red-300">Erro ao carregar</div>
          <div className="text-sm text-red-700 dark:text-red-200 mt-1">{loadError}</div>
          <div className="mt-3">
            <Button
              variant="secondary"
              onClick={loadAll}
              className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
            >
              Tentar novamente
            </Button>
          </div>
        </Card>
      )}

      {/* KPIs (mobile 2 colunas) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4 border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{kpis.total}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Colaboradores registados</div>
        </Card>

        <Card className="p-4 border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
          <div className="text-xs text-slate-500 dark:text-slate-400">Ativos</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{kpis.ativos}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Em operação</div>
        </Card>

        <Card className="p-4 border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
          <div className="text-xs text-slate-500 dark:text-slate-400">Alertas</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{kpis.alertasDocsAtivos}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Docs (ativos) venc./a vencer</div>
        </Card>

        <Card className="p-4 border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
          <div className="text-xs text-slate-500 dark:text-slate-400">Horas (7d)</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{kpis.horas7dTotalAtivos}h</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Total equipa (ativos, 7 dias)</div>
        </Card>
      </div>

      <Card className="p-5 border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
        {/* Toolbar */}
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3">
            {/* ✅ Toggle Ativos / Baixa */}
            <div className="flex flex-wrap items-center gap-3">
              <Segmented
                value={viewMode}
                onChange={(v) => setViewMode(v as any)}
                items={[
                  { value: 'ativos', label: 'Ativos', badge: String(kpis.ativos) },
                  { value: 'baixa', label: 'Baixa', badge: String(kpis.baixa) },
                ]}
              />

              <div className="text-xs text-slate-500 dark:text-slate-400">
                {viewMode === 'ativos'
                  ? 'A página mostra apenas colaboradores Ativos.'
                  : 'A lista “Baixa” é separada (não aparece na página principal).'}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="relative w-full sm:w-[360px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
                <input
                  type="text"
                  placeholder={viewMode === 'ativos' ? 'Pesquisar ativos…' : 'Pesquisar em baixa…'}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-900
                             placeholder:text-slate-400
                             focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent
                             dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-100 dark:placeholder:text-slate-500
                             dark:focus:ring-[#66A7E6]/25"
                />
              </div>

              <select
                value={cargoFilter}
                onChange={(e) => setCargoFilter(e.target.value)}
                className="w-full sm:w-[220px] px-3 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-900
                           focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent text-sm
                           dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-100 dark:focus:ring-[#66A7E6]/25"
              >
                {cargosOptions.map((c) => (
                  <option key={c} value={c}>
                    {c === 'todos' ? 'Todos os cargos' : c}
                  </option>
                ))}
              </select>

              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as any)}
                className="w-full sm:w-[190px] px-3 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-900
                           focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent text-sm
                           dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-100 dark:focus:ring-[#66A7E6]/25"
              >
                <option value="nome">Ordenar: Nome</option>
                <option value="horas7d">Ordenar: Horas (7d)</option>
                <option value="docs">Ordenar: Alertas docs</option>
                <option value="valor">Ordenar: Valor/hora</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={loadAll}
              className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
            >
              Atualizar
            </Button>
            <Button onClick={() => openModal()}>
              <UserPlus size={16} className="mr-2" />
              Novo Colaborador
            </Button>
          </div>
        </div>

        {/* MOBILE LIST */}
        <div className="mt-5 md:hidden space-y-3">
          {filtered.map((c) => {
            const m = metricsById[c.id] || {
              horas7d: 0,
              horas30d: 0,
              ultimaPresenca: null,
              docsVencidos: 0,
              docsAVencer30: 0,
            };

            const valorHora = Number(c.valor_hora || 0);
            const docTotal = (m.docsVencidos || 0) + (m.docsAVencer30 || 0);

            return (
              <div
                key={c.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm
                           dark:border-slate-800/70 dark:bg-slate-950/30 dark:shadow-black/30"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={c.nome_completo} foto_url={c.foto_url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 truncate">
                          {c.nome_completo}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {c.categoria || '—'} • Entrada: {formatDatePT(c.data_entrada_plataforma)}
                        </div>
                      </div>
                      <Badge variant={getStatusVariant(c.status)}>{statusLabel(c.status)}</Badge>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800/70 dark:bg-slate-900/35">
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <Clock size={13} className="text-slate-400 dark:text-slate-500" />
                          Atividade (7d)
                        </div>
                        <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {m.horas7d}h
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Última: {m.ultimaPresenca ? formatDatePT(m.ultimaPresenca) : '-'}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800/70 dark:bg-slate-900/35">
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <FileWarning
                            size={13}
                            className={docTotal ? 'text-amber-700 dark:text-amber-300' : 'text-slate-400 dark:text-slate-500'}
                          />
                          Documentos
                        </div>
                        {docTotal === 0 ? (
                          <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">OK</div>
                        ) : (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {m.docsVencidos > 0 && (
                              <DocChip tone="danger" icon={<FileWarning size={12} />} label={`${m.docsVencidos} venc.`} />
                            )}
                            {m.docsAVencer30 > 0 && (
                              <DocChip tone="warn" icon={<Calendar size={12} />} label={`${m.docsAVencer30} a vencer`} />
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <div className="flex items-center gap-2">
                        <Phone size={13} className="text-slate-400 dark:text-slate-500" />
                        <span className="font-medium">{c.telefone || '-'}</span>
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <Mail size={13} className="text-slate-400 dark:text-slate-500" />
                        <span className="truncate">{c.email || '-'}</span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {c.valor_hora != null ? (
                          <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                            €{Number(c.valor_hora).toFixed(2)}/h
                          </span>
                        ) : (
                          <span>—</span>
                        )}
                        {valorHora > 0 ? (
                          <span className="ml-2">
                            7d:{' '}
                            <span className="font-semibold tabular-nums">{formatEUR(valorHora * (m.horas7d || 0))}</span>
                          </span>
                        ) : null}
                      </div>

                      <div className="flex gap-2">
                        <IconActionButton title="Ver perfil" onClick={() => openProfile(c)}>
                          <Eye size={16} />
                        </IconActionButton>
                        <IconActionButton title="Editar" onClick={() => openModal(c.id)}>
                          <Edit size={16} />
                        </IconActionButton>
                        <IconActionButton title="Apagar" onClick={() => requestDelete(c)} danger>
                          <Trash2 size={16} />
                        </IconActionButton>
                      </div>
                    </div>

                    <div className="mt-3">
                      <Button
                        variant="secondary"
                        className="w-full dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                        onClick={() => onOpenDocumentosColaborador?.(c.id)}
                      >
                        Ver documentos
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              {viewMode === 'ativos' ? 'Nenhum colaborador ativo encontrado' : 'Nenhum colaborador em baixa encontrado'}
            </div>
          )}
        </div>

        {/* DESKTOP/TABLET TABLE */}
        <div className="mt-5 hidden md:block">
          <div className="rounded-2xl border border-slate-200 overflow-hidden dark:border-slate-800/70">
            <table className="w-full table-fixed">
              <thead className="bg-white dark:bg-slate-950/30">
                <tr className="border-b border-slate-200 dark:border-slate-800/70">
                  <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 w-[34%]">
                    Colaborador
                  </th>

                  <th className="hidden lg:table-cell text-left py-3 px-4 font-semibold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 w-[12%]">
                    Cargo
                  </th>

                  <th className="hidden xl:table-cell text-left py-3 px-4 font-semibold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 w-[14%]">
                    Contacto
                  </th>

                  <th className="hidden lg:table-cell text-right py-3 px-4 font-semibold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 w-[10%]">
                    Valor/Hora
                  </th>

                  <th className="text-right py-3 px-4 font-semibold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 w-[12%]">
                    Atividade
                  </th>

                  <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 w-[8%]">
                    Documentos
                  </th>

                  <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 w-[8%]">
                    Status
                  </th>

                  <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 w-[12%]">
                    Ações
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((c) => {
                  const m = metricsById[c.id] || {
                    horas7d: 0,
                    horas30d: 0,
                    ultimaPresenca: null,
                    docsVencidos: 0,
                    docsAVencer30: 0,
                  };

                  const valorHora = Number(c.valor_hora || 0);
                  const custo7d = valorHora > 0 ? valorHora * (m.horas7d || 0) : 0;
                  const docTotal = (m.docsVencidos || 0) + (m.docsAVencer30 || 0);

                  return (
                    <tr
                      key={c.id}
                      className="border-b border-slate-100 hover:bg-slate-50
                                 dark:border-slate-800/50 dark:hover:bg-slate-950/30"
                    >
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-4">
                          <Avatar name={c.nome_completo} foto_url={c.foto_url} size="md" />
                          <div className="min-w-0">
                            <div className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 truncate">
                              {c.nome_completo}
                            </div>

                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                              <span className="mr-2">Entrada: {formatDatePT(c.data_entrada_plataforma)}</span>
                              <span className="hidden lg:inline">• {c.categoria || '—'}</span>
                              <span className="xl:hidden"> • {c.categoria || '—'} • {c.telefone || '-'}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="hidden lg:table-cell py-2.5 px-4 text-sm text-slate-700 dark:text-slate-200 truncate">
                        {c.categoria || '-'}
                      </td>

                      <td className="hidden xl:table-cell py-2.5 px-4">
                        <div className="text-sm text-slate-700 dark:text-slate-200">
                          <div className="flex items-center gap-2">
                            <Phone size={14} className="text-slate-400 dark:text-slate-500" />
                            <span className="truncate">{c.telefone || '-'}</span>
                          </div>

                          <div className="hidden 2xl:flex items-center gap-2 mt-1">
                            <Mail size={14} className="text-slate-400 dark:text-slate-500" />
                            <span className="truncate">{c.email || '-'}</span>
                          </div>
                        </div>
                      </td>

                      <td className="hidden lg:table-cell py-2.5 px-4 text-right">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {c.valor_hora != null ? `€${Number(c.valor_hora).toFixed(2)}/h` : '-'}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          7d: {valorHora > 0 ? formatEUR(custo7d) : '—'}
                        </div>
                      </td>

                      <td className="py-2.5 px-4 text-right">
                        <div className="text-sm text-slate-900 dark:text-slate-100 font-semibold tabular-nums">
                          {m.horas7d}h
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Última: {m.ultimaPresenca ? formatDatePT(m.ultimaPresenca) : '-'}
                        </div>
                      </td>

                      <td className="py-2.5 px-4">
                        {docTotal === 0 ? (
                          <DocChip tone="ok" icon={<FileWarning size={12} className="opacity-60" />} label="OK" />
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {m.docsVencidos > 0 && (
                              <DocChip tone="danger" icon={<FileWarning size={12} />} label={`${m.docsVencidos} venc.`} />
                            )}
                            {m.docsAVencer30 > 0 && (
                              <DocChip tone="warn" icon={<Calendar size={12} />} label={`${m.docsAVencer30} a vencer`} />
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-4">
                        <Badge variant={getStatusVariant(c.status)}>{statusLabel(c.status)}</Badge>
                      </td>

                      <td className="py-2.5 px-4">
                        <div className="flex gap-2">
                          <IconActionButton title="Ver perfil" onClick={() => openProfile(c)}>
                            <Eye size={16} />
                          </IconActionButton>
                          <IconActionButton title="Editar" onClick={() => openModal(c.id)}>
                            <Edit size={16} />
                          </IconActionButton>
                          <IconActionButton title="Apagar" onClick={() => requestDelete(c)} danger>
                            <Trash2 size={16} />
                          </IconActionButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                {viewMode === 'ativos' ? 'Nenhum colaborador ativo encontrado' : 'Nenhum colaborador em baixa encontrado'}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Drawer de Perfil */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSelected(null)} aria-hidden="true" />
          <div
            className="fixed right-0 top-0 h-full w-full sm:w-[520px] bg-white z-50 border-l border-slate-200 shadow-xl
                       dark:bg-slate-950 dark:border-slate-800/70 dark:shadow-black/45"
          >
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-3 dark:border-slate-800/70">
              <div className="flex items-start gap-3 min-w-0">
                <Avatar name={selected.nome_completo} foto_url={selected.foto_url} size="lg" />

                <div className="min-w-0">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Perfil do colaborador</div>
                  <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {selected.nome_completo}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant={getStatusVariant(selected.status)}>{statusLabel(selected.status)}</Badge>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {selected.categoria || 'Sem categoria'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                className="h-10 w-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50
                           dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900/60"
                onClick={() => setSelected(null)}
                aria-label="Fechar"
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto h-[calc(100%-80px)]">
              <Card className="p-4 border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Email</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {selected.email || '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Telefone</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selected.telefone || '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Entrada</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatDatePT(selected.data_entrada_plataforma)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Valor/hora</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {selected.valor_hora != null ? `€${Number(selected.valor_hora).toFixed(2)}/h` : '-'}
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-4 border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <TrendingUp size={16} className="text-[#0B4F8A] dark:text-[#66A7E6]" />
                  Indicadores operacionais
                </div>

                {(() => {
                  const m = metricsById[selected.id];
                  const horas7d = m?.horas7d || 0;
                  const horas30d = m?.horas30d || 0;
                  const docsV = m?.docsVencidos || 0;
                  const docsA = m?.docsAVencer30 || 0;
                  const valorHora = Number(selected.valor_hora || 0);

                  return (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800/70 dark:bg-slate-900/40">
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <Clock size={14} className="text-slate-400 dark:text-slate-500" />
                          Horas (7d)
                        </div>
                        <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {horas7d}h
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          Custo: {valorHora > 0 ? formatEUR(valorHora * horas7d) : '—'}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800/70 dark:bg-slate-900/40">
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <Clock size={14} className="text-slate-400 dark:text-slate-500" />
                          Horas (30d)
                        </div>
                        <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {horas30d}h
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Última: {m?.ultimaPresenca ? formatDatePT(m.ultimaPresenca) : '-'}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800/70 dark:bg-slate-900/40">
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <FileWarning size={14} className="text-red-600 dark:text-red-400" />
                          Docs vencidos
                        </div>
                        <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {docsV}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800/70 dark:bg-slate-900/40">
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <Calendar size={14} className="text-amber-700 dark:text-amber-300" />
                          A vencer (30d)
                        </div>
                        <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {docsA}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </Card>

              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => openModal(selected.id)}>
                  Editar perfil
                </Button>

                <Button
                  variant="secondary"
                  className="flex-1 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                  onClick={() => {
                    if (!selected) return;
                    onOpenDocumentosColaborador?.(selected.id);
                    setSelected(null);
                  }}
                >
                  Ver documentos
                </Button>

                <Button
                  variant="secondary"
                  className="flex-1 border-red-200 text-red-700 hover:bg-red-50
                             dark:border-red-500/25 dark:text-red-200 dark:hover:bg-red-500/10"
                  onClick={() => requestDelete(selected)}
                >
                  <Trash2 size={16} className="mr-2" />
                  Apagar
                </Button>
              </div>

              <div className="text-xs text-slate-400 dark:text-slate-500">
                Observação: esta tela calcula horas/documentos a partir de <code>presencas_dia</code> e{' '}
                <code>documentos</code> (entidade_tipo='colaborador').
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal Apagar */}
      {deleteState.open && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[60]" onClick={closeDelete} aria-hidden="true" />
          <div className="fixed inset-x-0 top-10 z-[70] flex justify-center px-4">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800/70 dark:bg-slate-950">
              <div className="p-5 border-b border-slate-200 dark:border-slate-800/70 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />
                    Apagar colaborador
                  </div>
                  <div className="mt-1 text-sm text-slate-600 dark:text-slate-300 truncate">
                    {deleteState.colaborador.nome_completo}
                  </div>
                </div>

                <button
                  className="h-10 w-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50
                             dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900/60"
                  onClick={closeDelete}
                  aria-label="Fechar"
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {deleteState.checking ? (
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    A verificar histórico (presenças / documentos)…
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800/70 dark:bg-slate-900/40">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Validação de segurança</div>
                      <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        {deleteState.deps ? (
                          <>
                            Presenças: <span className="font-semibold tabular-nums">{deleteState.deps.presencasCount}</span>
                            {' · '}
                            Documentos: <span className="font-semibold tabular-nums">{deleteState.deps.docsCount}</span>
                          </>
                        ) : (
                          'Sem dados de dependências (não foi possível verificar).'
                        )}
                      </div>

                      {deleteState.deps && (deleteState.deps.presencasCount > 0 || deleteState.deps.docsCount > 0) ? (
                        <div className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                          Este colaborador tem histórico. Em vez de apagar (o que pode quebrar relatórios e histórico),
                          use <span className="font-semibold">Marcar como Baixa</span> para esconder da página principal.
                        </div>
                      ) : (
                        <div className="mt-3 text-sm text-slate-700 dark:text-slate-200">
                          Sem histórico encontrado. O apagamento será definitivo.
                        </div>
                      )}
                    </div>

                    {deleteState.error && (
                      <div className="text-sm text-red-700 dark:text-red-200 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-500/25 dark:bg-red-500/10">
                        {deleteState.error}
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                      <Button
                        variant="secondary"
                        className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                        onClick={closeDelete}
                        disabled={deleteState.deleting}
                      >
                        Cancelar
                      </Button>

                      <Button
                        variant="secondary"
                        className="border-amber-200 text-amber-900 hover:bg-amber-50
                                   dark:border-amber-500/25 dark:text-amber-200 dark:hover:bg-amber-500/10"
                        onClick={() => markAsBaixa(deleteState.colaborador)}
                        disabled={deleteState.deleting}
                      >
                        Marcar como Baixa
                      </Button>

                      <Button
                        className="bg-red-600 hover:bg-red-700 text-white"
                        onClick={confirmDelete}
                        disabled={
                          deleteState.deleting ||
                          deleteState.checking ||
                          !!(deleteState.deps && (deleteState.deps.presencasCount > 0 || deleteState.deps.docsCount > 0))
                        }
                      >
                        {deleteState.deleting ? 'A apagar…' : 'Apagar definitivamente'}
                      </Button>
                    </div>

                    {deleteState.deps && (deleteState.deps.presencasCount > 0 || deleteState.deps.docsCount > 0) ? (
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Nota: para permitir apagar mesmo com histórico, teria de existir “ON DELETE CASCADE” nas FKs ou uma rotina de limpeza
                        que apague também presenças/documentos relacionados (não recomendo para histórico operacional).
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <ColaboradorModal
        isOpen={modalOpen}
        onClose={closeModal}
        onSuccess={handleModalSuccess}
        colaboradorId={editingId}
      />
    </div>
  );
}
