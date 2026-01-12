// src/pages/Obras.tsx
import { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  Search,
  Plus,
  MapPin,
  Calendar,
  Clock,
  Euro,
  AlertTriangle,
  Edit,
  ArrowRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ObraModal } from '../components/obras/ObraModal';
import { ObraDetailsDrawer } from '../components/obras/ObraDetailsDrawer';

interface Obra {
  id: string;
  nome: string;
  cliente: string | null;
  localizacao: string | null;
  endereco: string | null;
  status: string;
  data_inicio: string | null;
  data_fim_prevista: string | null;
  custo_mao_obra_acumulado: number | null;
  empresa_id: string | null;
  descricao: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at?: string | null;

  // IMPORTANTE: já existe no ObraModal / DB
  logo_url?: string | null;
}

function formatDatePT(date?: string | null) {
  if (!date) return '-';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-PT');
}

function eur(v: number) {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayDiff(a: Date, b: Date) {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function statusVariant(status: string) {
  const s = String(status || '').toLowerCase();
  const variants: any = {
    ativa: 'success',
    pausada: 'warning',
    concluida: 'info',
    concluída: 'info',
    cancelada: 'danger',
  };
  return variants[s] || 'default';
}

function isActive(status: string) {
  return String(status || '').toLowerCase() === 'ativa';
}

function obraInitials(nome: string) {
  const clean = String(nome || '').trim();
  if (!clean) return 'OB';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

/**
 * Logo da obra (maior, mas mantém o look “pasta”).
 * - Se tiver logo_url: mostra imagem
 * - Se não: iniciais
 */
function ObraLogo({
  nome,
  logo_url,
  size = 'md',
}: {
  nome: string;
  logo_url?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  // Ajuste: maior que antes, sem ficar gigante
  const sizeClass = size === 'sm' ? 'h-11 w-11' : size === 'lg' ? 'h-16 w-16' : 'h-14 w-14';
  const textClass = size === 'lg' ? 'text-base' : 'text-sm';

  return (
    <div
      className={`${sizeClass} shrink-0 rounded-2xl overflow-hidden
                  ring-1 ring-slate-200 bg-white/80 shadow-sm
                  dark:ring-slate-800 dark:bg-slate-950/40 dark:shadow-black/30`}
      title="Logo da obra"
    >
      {logo_url ? (
        <img src={logo_url} alt={nome} className="w-full h-full object-cover" />
      ) : (
        <div
          className={`w-full h-full flex items-center justify-center font-bold tracking-tight text-slate-900 ${textClass}
                      dark:text-slate-100`}
        >
          {obraInitials(nome)}
        </div>
      )}
    </div>
  );
}

export function Obras() {
  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'todos' | 'ativa' | 'pausada' | 'concluida' | 'cancelada'
  >('todos');

  const [selected, setSelected] = useState<Obra | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadObras();
  }, []);

  const loadObras = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('obras')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) console.error('Erro ao carregar obras:', error);
    if (data) setObras(data as Obra[]);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();

    return obras.filter((o) => {
      const nomeOk = !s || o.nome.toLowerCase().includes(s);
      const clienteOk = !s || (o.cliente ? o.cliente.toLowerCase().includes(s) : false);

      const statusOk =
        statusFilter === 'todos' ? true : String(o.status || '').toLowerCase() === statusFilter;

      return statusOk && (nomeOk || clienteOk);
    });
  }, [obras, search, statusFilter]);

  const kpis = useMemo(() => {
    const total = obras.length;
    const ativas = obras.filter((o) => String(o.status).toLowerCase() === 'ativa').length;
    const pausadas = obras.filter((o) => String(o.status).toLowerCase() === 'pausada').length;
    const concluidas = obras.filter((o) =>
      ['concluida', 'concluída'].includes(String(o.status).toLowerCase())
    ).length;

    const custoTotal = obras.reduce((acc, o) => acc + Number(o.custo_mao_obra_acumulado || 0), 0);

    const hoje = startOfDay(new Date());
    const atrasadas = obras.filter((o) => {
      if (!isActive(o.status)) return false;
      if (!o.data_fim_prevista) return false;
      const fim = new Date(o.data_fim_prevista);
      return !Number.isNaN(fim.getTime()) && fim < hoje;
    }).length;

    return { total, ativas, pausadas, concluidas, custoTotal, atrasadas };
  }, [obras]);

  const prazoInfo = (o: Obra) => {
    const hoje = startOfDay(new Date());
    const inicio = o.data_inicio ? new Date(o.data_inicio) : null;
    const fim = o.data_fim_prevista ? new Date(o.data_fim_prevista) : null;

    const inicioOk = inicio && !Number.isNaN(inicio.getTime());
    const fimOk = fim && !Number.isNaN(fim.getTime());

    if (!inicioOk && !fimOk) return { label: 'Sem datas', tone: 'neutral' as const };

    if (fimOk) {
      const d = dayDiff(hoje, fim!);
      if (d < 0) return { label: `Atrasada ${Math.abs(d)}d`, tone: 'danger' as const };
      if (d === 0) return { label: 'Prazo: hoje', tone: 'warning' as const };
      return { label: `${d}d restantes`, tone: 'ok' as const };
    }

    return {
      label: `Início: ${inicioOk ? formatDatePT(o.data_inicio) : '-'}`,
      tone: 'neutral' as const,
    };
  };

  const prazoPill = (o: Obra) => {
    const p = prazoInfo(o);

    const cls =
      p.tone === 'danger'
        ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/25'
        : p.tone === 'warning'
          ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/25'
          : p.tone === 'ok'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/25'
            : 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-200 dark:border-slate-800/70';

    return (
      <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-medium ${cls}`}>
        <Clock size={14} />
        {p.label}
      </span>
    );
  };

  const open = (o: Obra) => setSelected(o);
  const close = () => setSelected(null);

  const openModal = (obraId?: string) => {
    setEditingId(obraId || null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const handleModalSuccess = () => {
    loadObras();
    closeModal();
  };

  const handleEditFromDrawer = () => {
    if (selected) {
      openModal(selected.id);
      setSelected(null);
    }
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
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="p-4 border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
          <div className="text-xs text-slate-500 dark:text-slate-400">Obras</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{kpis.total}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Total registadas</div>
        </Card>

        <Card className="p-4 border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
          <div className="text-xs text-slate-500 dark:text-slate-400">Ativas</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{kpis.ativas}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Em execução</div>
        </Card>

        <Card className="p-4 border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
          <div className="text-xs text-slate-500 dark:text-slate-400">Pausadas</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{kpis.pausadas}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Aguardam retomada</div>
        </Card>

        <Card className="p-4 border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
          <div className="text-xs text-slate-500 dark:text-slate-400">Concluídas</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{kpis.concluidas}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">Finalizadas</div>
        </Card>

        <Card className="p-4 border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
          <div className="text-xs text-slate-500 dark:text-slate-400">Custo M.O.</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{eur(kpis.custoTotal)}</div>
          <div
            className={`mt-1 text-xs ${
              kpis.atrasadas > 0 ? 'text-red-700 dark:text-red-300' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {kpis.atrasadas > 0 ? `${kpis.atrasadas} obra(s) atrasada(s)` : 'Sem atrasos críticos'}
          </div>
        </Card>
      </div>

      <Card className="p-5 border border-slate-200 bg-white shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30">
        {/* Toolbar */}
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative w-full sm:w-[360px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
              <input
                type="text"
                placeholder="Pesquisar por obra ou cliente…"
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
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full sm:w-[190px] px-3 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-900
                         focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent text-sm
                         dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-100 dark:focus:ring-[#66A7E6]/25"
            >
              <option value="todos">Todos os status</option>
              <option value="ativa">Ativa</option>
              <option value="pausada">Pausada</option>
              <option value="concluida">Concluída</option>
              <option value="cancelada">Cancelada</option>
            </select>

            <Button
              variant="secondary"
              onClick={loadObras}
              className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
            >
              Atualizar
            </Button>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <Button onClick={() => openModal()}>
              <Plus size={16} className="mr-2" />
              Nova Obra
            </Button>
          </div>
        </div>

        {/* Grid */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((obra) => {
            const custo = Number(obra.custo_mao_obra_acumulado || 0);
            const prazo = prazoInfo(obra);

            return (
              <Card
                key={obra.id}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-md
                           dark:border-slate-800/70 dark:bg-slate-900/60 dark:hover:bg-slate-900/70 dark:shadow-black/30"
              >
                {/* “Pasta” (accent + aba superior) */}
                <div className="absolute inset-0 bg-gradient-to-br from-amber-50/60 via-white to-white pointer-events-none
                                dark:from-amber-500/10 dark:via-slate-950/20 dark:to-slate-950/10" />
                <div className="absolute inset-y-0 left-0 w-1.5 bg-amber-500/90 dark:bg-amber-400/80" />
                <div className="absolute -top-3 left-6 h-7 w-28 rounded-t-2xl bg-amber-100 border border-amber-200 border-b-0 shadow-sm
                                dark:bg-amber-500/15 dark:border-amber-500/25 dark:shadow-black/30" />

                <div className="relative p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-3">
                      {/* Logo da obra (agora maior) */}
                      <ObraLogo nome={obra.nome} logo_url={obra.logo_url} size="md" />

                      <div className="min-w-0 pt-0.5">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">{obra.nome}</h3>
                          {prazo.tone === 'danger' && (
                            <span
                              className="inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-300"
                              title="Obra atrasada"
                            >
                              <AlertTriangle size={14} />
                            </span>
                          )}
                        </div>
                        {obra.cliente && (
                          <p className="text-sm text-slate-500 dark:text-slate-300 mt-0.5 truncate">{obra.cliente}</p>
                        )}
                      </div>
                    </div>

                    <Badge variant={statusVariant(obra.status)}>{obra.status}</Badge>
                  </div>

                  {/* Pills */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {prazoPill(obra)}
                    {obra.localizacao && (
                      <span
                        className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-slate-200 bg-white/80 text-xs text-slate-700
                                   dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200"
                      >
                        <MapPin size={14} />
                        <span className="truncate max-w-[220px]">{obra.localizacao}</span>
                      </span>
                    )}
                  </div>

                  {/* Datas */}
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/35">
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <Calendar size={14} className="text-slate-400 dark:text-slate-500" />
                        Início
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {formatDatePT(obra.data_inicio)}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-950/35">
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <Calendar size={14} className="text-slate-400 dark:text-slate-500" />
                        Fim previsto
                      </div>
                      <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {formatDatePT(obra.data_fim_prevista)}
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800/70 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <Euro size={14} className="text-slate-400 dark:text-slate-500" />
                        Custo mão de obra
                      </div>
                      <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{eur(custo)}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openModal(obra.id)}
                        title="Editar obra"
                        className="dark:text-slate-100 dark:hover:bg-slate-900/60"
                      >
                        <Edit size={16} />
                      </Button>

                      <Button size="sm" onClick={() => open(obra)} className="whitespace-nowrap">
                        Ver obra
                        <ArrowRight size={16} className="ml-2" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">Nenhuma obra encontrada</div>
        )}
      </Card>

      {/* Drawer Detalhes */}
      {selected && <ObraDetailsDrawer obra={selected} onClose={close} onEdit={handleEditFromDrawer} />}

      <ObraModal isOpen={modalOpen} onClose={closeModal} onSuccess={handleModalSuccess} obraId={editingId} />
    </div>
  );
}
