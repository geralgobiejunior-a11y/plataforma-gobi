import { useMemo, useState, useEffect } from 'react';
import {
  X,
  MapPin,
  Users,
  FileText,
  Info,
  Calendar,
  Euro,
  ExternalLink,
  Navigation,
  AlertTriangle,
  CheckCircle,
  XCircle,
  UserPlus,
  Trash2,
  Search as SearchIcon,
  Clock,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

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
}

interface Colaborador {
  id: string;
  nome_completo: string;
  foto_url: string | null;
  categoria: string | null;
  telefone: string | null;
  email: string | null;
  status: string;
  data_inicio: string | null;
  ativo: boolean; // vem de obras_colaboradores.ativo
  valor_hora: number | null;
}

interface Documento {
  id: string;
  tipo_documento_nome: string;
  data_upload: string;
  data_validade: string | null;
  entidade_tipo: string;
  entidade_nome: string;
  status_validade: 'valido' | 'vencido' | 'a_vencer';
}

interface ObraDetailsDrawerProps {
  obra: Obra;
  onClose: () => void;
  onEdit: () => void;
}

type Tab = 'info' | 'equipa' | 'documentos' | 'mapa';

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

const allowedColabStatuses = new Set(['ativo', 'ferias', 'férias']);

type WorkStat = {
  minutos: number;
  custo: number;
};

export function ObraDetailsDrawer({ obra, onClose, onEdit }: ObraDetailsDrawerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // stats de horas/custo por colaborador
  const [workStats, setWorkStats] = useState<Record<string, WorkStat>>({});

  // Modal alocação
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [allColabs, setAllColabs] = useState<Colaborador[]>([]);
  const [assignSearch, setAssignSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal remover (confirm)
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Colaborador | null>(null);

  useEffect(() => {
    if (activeTab === 'equipa') {
      loadEquipa();
    } else if (activeTab === 'documentos') {
      loadDocumentos();
    } else if (activeTab === 'mapa') {
      getUserLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, obra.id]);

  const loadEquipa = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('obras_colaboradores')
      .select(
        `
        ativo,
        data_inicio,
        colaboradores:colaborador_id (
          id,
          nome_completo,
          foto_url,
          categoria,
          telefone,
          email,
          status,
          valor_hora
        )
      `
      )
      .eq('obra_id', obra.id)
      .eq('ativo', true);

    if (error) {
      console.error('Erro ao carregar equipa:', error);
      toast.error(error.message || 'Erro ao carregar equipa');
      setLoading(false);
      return;
    }

    const equipa: Colaborador[] = (data || [])
      .map((item: any) => ({
        id: item.colaboradores?.id,
        nome_completo: item.colaboradores?.nome_completo,
        foto_url: item.colaboradores?.foto_url,
        categoria: item.colaboradores?.categoria,
        telefone: item.colaboradores?.telefone,
        email: item.colaboradores?.email,
        status: item.colaboradores?.status,
        valor_hora: item.colaboradores?.valor_hora ?? null,
        data_inicio: item.data_inicio,
        ativo: !!item.ativo,
      }))
      .filter((c: any) => c.id);

    setColaboradores(equipa);
    await loadWorkStatsForEquipa(equipa);
    setLoading(false);
  };

  const loadWorkStatsForEquipa = async (equipa: Colaborador[]) => {
    const ids = equipa.map((c) => c.id).filter(Boolean);
    if (ids.length === 0) {
      setWorkStats({});
      return;
    }

    const { data, error } = await supabase
      .from('presencas_dia')
      .select('colaborador_id, total_horas, total_minutos, faltou')
      .eq('obra_id', obra.id)
      .in('colaborador_id', ids);

    if (error) {
      console.error('Erro ao carregar presenças para stats:', error);
      // não bloqueia a UI, apenas não mostra stats
      setWorkStats({});
      return;
    }

    const minutesByColab = new Map<string, number>();
    for (const row of data || []) {
      const colabId = String((row as any).colaborador_id);
      const faltou = !!(row as any).faltou;

      let minutos = 0;
      if (!faltou) {
        const tm = (row as any).total_minutos;
        const th = (row as any).total_horas;

        if (typeof tm === 'number' && Number.isFinite(tm)) minutos = tm;
        else if (th != null && Number.isFinite(Number(th))) minutos = Math.round(Number(th) * 60);
      }

      minutesByColab.set(colabId, (minutesByColab.get(colabId) || 0) + minutos);
    }

    const stats: Record<string, WorkStat> = {};
    for (const c of equipa) {
      const minutos = minutesByColab.get(c.id) || 0;
      const vh = Number(c.valor_hora || 0);
      const custo = (minutos / 60) * vh;

      stats[c.id] = { minutos, custo };
    }

    setWorkStats(stats);
  };

  const loadAllColaboradores = async () => {
    setAssignLoading(true);

    const { data, error } = await supabase
      .from('colaboradores')
      .select('id, nome_completo, foto_url, categoria, telefone, email, status, valor_hora')
      .in('status', ['ativo', 'ferias', 'férias', 'Ativo', 'Ferias', 'Férias'])
      .order('nome_completo', { ascending: true });

    if (error) {
      console.error('Erro ao carregar colaboradores:', error);
      toast.error(error.message || 'Erro ao carregar colaboradores');
      setAssignLoading(false);
      return;
    }

    const filtered = (data || []).filter((c: any) => allowedColabStatuses.has(String(c.status || '').toLowerCase()));
    setAllColabs(filtered as any);
    setAssignLoading(false);
  };

  const openAssign = async () => {
    setAssignOpen(true);
    setAssignSearch('');
    setSelectedIds(new Set());
    await loadAllColaboradores();
  };

  const closeAssign = () => {
    setAssignOpen(false);
    setSelectedIds(new Set());
    setAssignSearch('');
  };

  const allocatedIds = useMemo(() => new Set(colaboradores.map((c) => c.id)), [colaboradores]);

  const filteredAllColabs = useMemo(() => {
    const s = assignSearch.trim().toLowerCase();
    return allColabs.filter((c) => {
      const statusOk = allowedColabStatuses.has(String(c.status || '').toLowerCase());
      if (!statusOk) return false;

      if (!c?.nome_completo) return false;
      if (!s) return true;

      const nomeOk = c.nome_completo.toLowerCase().includes(s);
      const catOk = (c.categoria || '').toLowerCase().includes(s);
      const telOk = (c.telefone || '').toLowerCase().includes(s);

      return nomeOk || catOk || telOk;
    });
  }, [allColabs, assignSearch]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allocateOne = async (colaborador_id: string) => {
    // Se existir alocação inativa anterior, reativa.
    const { data: existing, error: selErr } = await supabase
      .from('obras_colaboradores')
      .select('id, ativo')
      .eq('obra_id', obra.id)
      .eq('colaborador_id', colaborador_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (selErr) throw selErr;

    if (existing?.id) {
      const { error: updErr } = await supabase
        .from('obras_colaboradores')
        .update({
          ativo: true,
          data_inicio: todayISO(),
          data_fim: null,
        })
        .eq('id', existing.id);

      if (updErr) throw updErr;
      return;
    }

    const { error: insErr } = await supabase.from('obras_colaboradores').insert([
      {
        obra_id: obra.id,
        colaborador_id,
        ativo: true,
        data_inicio: todayISO(),
        data_fim: null,
      },
    ]);

    if (insErr) throw insErr;
  };

  const handleAssignSelected = async () => {
    const ids = Array.from(selectedIds).filter((id) => !allocatedIds.has(id));
    if (ids.length === 0) {
      toast.error('Selecione pelo menos um colaborador que ainda não esteja na obra.');
      return;
    }

    setAssignLoading(true);

    try {
      for (const id of ids) {
        await allocateOne(id);
      }

      toast.success('Colaborador(es) alocado(s) com sucesso');
      closeAssign();
      await loadEquipa();
    } catch (e: any) {
      console.error('Erro ao alocar colaboradores:', e);
      if (e?.code === '23505') toast.error('Já existe um colaborador ativo alocado nesta obra.');
      else toast.error(e?.message || 'Erro ao alocar colaboradores');
    } finally {
      setAssignLoading(false);
    }
  };

  const askRemoveFromObra = (colab: Colaborador) => {
    setRemoveTarget(colab);
    setRemoveOpen(true);
  };

  const closeRemove = () => {
    if (removeLoading) return;
    setRemoveOpen(false);
    setRemoveTarget(null);
  };

  const handleConfirmRemove = async () => {
    if (!removeTarget) return;

    setRemoveLoading(true);

    const { error } = await supabase
      .from('obras_colaboradores')
      .update({ ativo: false, data_fim: todayISO() })
      .eq('obra_id', obra.id)
      .eq('colaborador_id', removeTarget.id)
      .eq('ativo', true);

    if (error) {
      console.error('Erro ao remover colaborador da obra:', error);

      // mensagem específica (porque você já viu esse caso)
      if (String(error.message || '').toLowerCase().includes('updated_at')) {
        toast.error('O banco está com trigger de updated_at mas a coluna não existe. Adicione updated_at em obras_colaboradores.');
      } else {
        toast.error(error.message || 'Erro ao remover colaborador da obra');
      }

      setRemoveLoading(false);
      return;
    }

    toast.success('Colaborador desalocado da obra');
    setRemoveLoading(false);
    closeRemove();
    await loadEquipa();
  };

  const loadDocumentos = async () => {
    setLoading(true);
    const docs: Documento[] = [];

    if (obra.empresa_id) {
      const { data: docsEmpresa, error } = await supabase
        .from('documentos')
        .select(
          `
          id,
          data_upload,
          data_validade,
          entidade_tipo,
          tipos_documento:tipo_documento_id (nome)
        `
        )
        .eq('entidade_id', obra.empresa_id)
        .eq('entidade_tipo', 'empresa');

      if (error) console.error(error);

      if (docsEmpresa) {
        docsEmpresa.forEach((doc: any) => {
          const validade = getStatusValidade(doc.data_validade);
          docs.push({
            id: doc.id,
            tipo_documento_nome: doc.tipos_documento?.nome || 'Documento',
            data_upload: doc.data_upload,
            data_validade: doc.data_validade,
            entidade_tipo: 'Empresa',
            entidade_nome: obra.cliente || 'Cliente',
            status_validade: validade,
          });
        });
      }
    }

    const { data: equipaIds } = await supabase
      .from('obras_colaboradores')
      .select('colaborador_id')
      .eq('obra_id', obra.id)
      .eq('ativo', true);

    if (equipaIds && equipaIds.length > 0) {
      const ids = equipaIds.map((e: any) => e.colaborador_id);

      const { data: docsColabs } = await supabase
        .from('documentos')
        .select(
          `
          id,
          data_upload,
          data_validade,
          entidade_tipo,
          entidade_id,
          tipos_documento:tipo_documento_id (nome)
        `
        )
        .in('entidade_id', ids)
        .eq('entidade_tipo', 'colaborador');

      if (docsColabs) {
        const { data: colabs } = await supabase.from('colaboradores').select('id, nome_completo').in('id', ids);
        const colaboradoresMap = new Map((colabs || []).map((c: any) => [c.id, c.nome_completo]));

        docsColabs.forEach((doc: any) => {
          const validade = getStatusValidade(doc.data_validade);
          docs.push({
            id: doc.id,
            tipo_documento_nome: doc.tipos_documento?.nome || 'Documento',
            data_upload: doc.data_upload,
            data_validade: doc.data_validade,
            entidade_tipo: 'Colaborador',
            entidade_nome: colaboradoresMap.get(doc.entidade_id) || 'Colaborador',
            status_validade: validade,
          });
        });
      }
    }

    setDocumentos(
      docs.sort((a, b) => {
        const statusOrder = { vencido: 0, a_vencer: 1, valido: 2 };
        return statusOrder[a.status_validade] - statusOrder[b.status_validade];
      })
    );
    setLoading(false);
  };

  const getStatusValidade = (dataValidade: string | null): 'valido' | 'vencido' | 'a_vencer' => {
    if (!dataValidade) return 'valido';
    const hoje = new Date();
    const validade = new Date(dataValidade);
    const em30Dias = new Date();
    em30Dias.setDate(em30Dias.getDate() + 30);

    if (validade < hoje) return 'vencido';
    if (validade <= em30Dias) return 'a_vencer';
    return 'valido';
  };

  const getUserLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => console.log('Erro ao obter localização:', error)
    );
  };

  const openInGoogleMaps = () => {
    let url: string;
    if (obra.latitude && obra.longitude) {
      url = `https://www.google.com/maps/search/?api=1&query=${obra.latitude},${obra.longitude}`;
    } else {
      const address = obra.endereco || obra.localizacao || obra.nome;
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    }
    window.open(url, '_blank');
  };

  const formatDatePT = (date?: string | null) => {
    if (!date) return '-';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('pt-PT');
  };

  const eur = (v: number) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

  const statusVariant = (status: string) => {
    const s = String(status || '').toLowerCase();
    const variants: any = {
      ativa: 'success',
      pausada: 'warning',
      concluida: 'info',
      concluída: 'info',
      cancelada: 'danger',
    };
    return variants[s] || 'default';
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return '??';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  const formatHM = (minutos: number) => {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return `${h}h${String(m).padStart(2, '0')}`;
  };

  const totalEquipaMinutos = useMemo(
    () => Object.values(workStats).reduce((acc, s) => acc + (s?.minutos || 0), 0),
    [workStats]
  );

  const totalEquipaCusto = useMemo(
    () => Object.values(workStats).reduce((acc, s) => acc + (s?.custo || 0), 0),
    [workStats]
  );

  const tabs = [
    { id: 'info' as Tab, label: 'Visão Geral', icon: Info },
    { id: 'equipa' as Tab, label: 'Equipa', icon: Users },
    { id: 'documentos' as Tab, label: 'Documentos', icon: FileText },
    { id: 'mapa' as Tab, label: 'Localização', icon: MapPin },
  ];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full sm:w-[680px] bg-white z-50 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-slate-500 uppercase tracking-wide font-medium">Obra</div>
              <div className="mt-1 text-xl font-semibold text-slate-900">{obra.nome}</div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <Badge variant={statusVariant(obra.status)}>{obra.status}</Badge>
                {obra.cliente && (
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Users size={12} />
                    {obra.cliente}
                  </span>
                )}
                {obra.localizacao && (
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <MapPin size={12} />
                    {obra.localizacao}
                  </span>
                )}
              </div>
            </div>

            <button
              className="h-10 w-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
              onClick={onClose}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex gap-1 bg-slate-100 rounded-xl p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition flex items-center justify-center gap-2 ${
                    activeTab === tab.id ? 'bg-white text-[#0B4F8A] shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon size={14} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === 'info' && (
            <>
              <Card className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-slate-500">Data início</div>
                    <div className="text-sm font-semibold text-slate-900 mt-1 flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400" />
                      {formatDatePT(obra.data_inicio)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Fim previsto</div>
                    <div className="text-sm font-semibold text-slate-900 mt-1 flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400" />
                      {formatDatePT(obra.data_fim_prevista)}
                    </div>
                  </div>
                </div>
              </Card>

              {obra.endereco && (
                <Card className="p-4">
                  <div className="text-xs text-slate-500 mb-2">Endereço</div>
                  <div className="text-sm text-slate-900">{obra.endereco}</div>
                </Card>
              )}

              {obra.descricao && (
                <Card className="p-4">
                  <div className="text-xs text-slate-500 mb-2">Descrição</div>
                  <div className="text-sm text-slate-700 leading-relaxed">{obra.descricao}</div>
                </Card>
              )}

              <Card className="p-4 bg-gradient-to-br from-emerald-50 to-white border-emerald-200">
                <div className="text-sm font-semibold text-emerald-900 mb-1">Custo Mão de Obra</div>
                <div className="text-2xl font-bold text-emerald-900 flex items-center gap-2">
                  <Euro size={20} />
                  {eur(Number(obra.custo_mao_obra_acumulado || 0))}
                </div>
                <div className="mt-1 text-xs text-emerald-700">Custo acumulado</div>
              </Card>

              <div className="pt-2">
                <Button className="w-full" onClick={onEdit}>
                  Editar informações da obra
                </Button>
              </div>
            </>
          )}

          {activeTab === 'equipa' && (
            <>
              {/* Top bar da Equipa */}
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-slate-900">Equipa</div>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100">
                      <Clock size={14} />
                      Horas: <strong className="text-slate-900">{formatHM(totalEquipaMinutos)}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100">
                      <Euro size={14} />
                      Custo: <strong className="text-slate-900">{eur(totalEquipaCusto)}</strong>
                    </span>
                  </div>
                </div>

                <Button onClick={openAssign} variant="secondary">
                  <UserPlus size={16} className="mr-2" />
                  Alocar colaborador
                </Button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0B4F8A]" />
                </div>
              ) : colaboradores.length === 0 ? (
                <div className="text-center py-12">
                  <Users size={48} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-500 text-sm">Nenhum colaborador alocado nesta obra</p>
                  <div className="mt-4">
                    <Button onClick={openAssign}>
                      <UserPlus size={16} className="mr-2" />
                      Alocar agora
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {colaboradores.map((colab) => {
                    const st = workStats[colab.id] || { minutos: 0, custo: 0 };
                    const vh = Number(colab.valor_hora || 0);

                    return (
                      <Card key={colab.id} className="p-4 hover:shadow-md transition">
                        <div className="flex items-start gap-3">
                          {colab.foto_url ? (
                            <img
                              src={colab.foto_url}
                              alt={colab.nome_completo}
                              className="h-12 w-12 rounded-xl object-cover border border-slate-200"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-xl bg-[#0B4F8A] flex items-center justify-center text-white font-semibold text-sm">
                              {getInitials(colab.nome_completo)}
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-900">{colab.nome_completo}</div>
                            {colab.categoria && <div className="text-xs text-slate-500 mt-0.5">{colab.categoria}</div>}

                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                              {colab.telefone && <span>📞 {colab.telefone}</span>}
                              {colab.email && <span>✉️ {colab.email}</span>}
                            </div>

                            {colab.data_inicio && (
                              <div className="mt-2 text-xs text-slate-500">Na obra desde {formatDatePT(colab.data_inicio)}</div>
                            )}

                            {/* badges horas / €/h / custo */}
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                                <Clock size={14} />
                                Horas: <strong className="text-slate-900">{formatHM(st.minutos)}</strong>
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                                <Euro size={14} />
                                €/h: <strong className="text-slate-900">{eur(vh)}</strong>
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                                <Euro size={14} />
                                Custo: <strong className="text-slate-900">{eur(st.custo)}</strong>
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge variant={String(colab.status).toLowerCase() === 'ativo' ? 'success' : 'default'}>{colab.status}</Badge>

                            <Button variant="ghost" size="sm" title="Desalocar da obra" onClick={() => askRemoveFromObra(colab)}>
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Modal Alocar Colaborador */}
              {assignOpen && (
                <>
                  <div className="fixed inset-0 bg-black/40 z-[60]" onClick={closeAssign} />
                  <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                    <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                      <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">Alocar colaboradores</div>
                          <div className="text-xs text-slate-500">Selecione e adicione à obra: {obra.nome}</div>
                        </div>
                        <button
                          className="h-10 w-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                          onClick={closeAssign}
                          aria-label="Fechar"
                        >
                          <X size={18} />
                        </button>
                      </div>

                      <div className="p-4">
                        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                          <div className="relative w-full">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                              value={assignSearch}
                              onChange={(e) => setAssignSearch(e.target.value)}
                              placeholder="Pesquisar por nome, categoria ou telefone…"
                              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-900
                                         placeholder:text-slate-400 focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent"
                            />
                          </div>

                          <div className="text-xs text-slate-500 whitespace-nowrap">
                            Selecionados: <span className="font-semibold text-slate-900">{selectedIds.size}</span>
                          </div>
                        </div>

                        <div className="mt-4 max-h-[420px] overflow-y-auto space-y-2">
                          {assignLoading ? (
                            <div className="flex items-center justify-center py-10">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0B4F8A]" />
                            </div>
                          ) : filteredAllColabs.length === 0 ? (
                            <div className="text-center py-10 text-slate-500 text-sm">Nenhum colaborador encontrado.</div>
                          ) : (
                            filteredAllColabs.map((c) => {
                              const alreadyIn = allocatedIds.has(c.id);
                              const checked = selectedIds.has(c.id);

                              return (
                                <div
                                  key={c.id}
                                  className={`flex items-center gap-3 p-3 rounded-2xl border ${
                                    alreadyIn ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200 bg-white hover:bg-slate-50'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4"
                                    disabled={alreadyIn}
                                    checked={checked}
                                    onChange={() => toggleSelect(c.id)}
                                  />

                                  {c.foto_url ? (
                                    <img
                                      src={c.foto_url}
                                      alt={c.nome_completo}
                                      className="h-11 w-11 rounded-xl object-cover border border-slate-200"
                                    />
                                  ) : (
                                    <div className="h-11 w-11 rounded-xl bg-[#0B4F8A] flex items-center justify-center text-white font-semibold text-xs">
                                      {getInitials(c.nome_completo)}
                                    </div>
                                  )}

                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <div className="font-semibold text-slate-900 truncate">{c.nome_completo}</div>
                                      {alreadyIn && (
                                        <span className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600">
                                          Já alocado
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-0.5 truncate">
                                      {c.categoria || '—'} {c.telefone ? `• ${c.telefone}` : ''} • €/h:{' '}
                                      <span className="text-slate-700 font-semibold">{eur(Number((c as any).valor_hora || 0))}</span>
                                    </div>
                                  </div>

                                  <Badge variant={String(c.status).toLowerCase() === 'ativo' ? 'success' : 'default'}>{c.status}</Badge>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>

                      <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2">
                        <Button variant="secondary" onClick={closeAssign} disabled={assignLoading}>
                          Cancelar
                        </Button>
                        <Button onClick={handleAssignSelected} loading={assignLoading} disabled={assignLoading}>
                          Alocar selecionados
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Modal Confirmar Desalocação */}
              {removeOpen && removeTarget && (
                <>
                  <div className="fixed inset-0 bg-black/40 z-[80]" onClick={closeRemove} />
                  <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                    <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                      <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">Desalocar colaborador</div>
                          <div className="text-xs text-slate-500">
                            Isto vai remover o colaborador desta obra (não apaga o colaborador do sistema).
                          </div>
                        </div>
                        <button
                          className="h-10 w-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                          onClick={closeRemove}
                          aria-label="Fechar"
                        >
                          <X size={18} />
                        </button>
                      </div>

                      <div className="p-4 space-y-3">
                        <Card className="p-4 bg-slate-50">
                          <div className="flex items-center gap-3">
                            {removeTarget.foto_url ? (
                              <img
                                src={removeTarget.foto_url}
                                alt={removeTarget.nome_completo}
                                className="h-12 w-12 rounded-xl object-cover border border-slate-200"
                              />
                            ) : (
                              <div className="h-12 w-12 rounded-xl bg-[#0B4F8A] flex items-center justify-center text-white font-semibold text-sm">
                                {getInitials(removeTarget.nome_completo)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900">{removeTarget.nome_completo}</div>
                              <div className="text-xs text-slate-600">
                                {removeTarget.categoria || '—'} • Obra: {obra.nome}
                              </div>
                              <div className="text-xs text-slate-500 mt-1">
                                Se confirmar: ativo=false e data_fim=today em obras_colaboradores.
                              </div>
                            </div>
                          </div>
                        </Card>

                        <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs">
                          <strong>Atenção:</strong> se existirem presenças já registadas para este colaborador nesta obra, elas continuam no histórico.
                        </div>
                      </div>

                      <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2">
                        <Button variant="secondary" onClick={closeRemove} disabled={removeLoading}>
                          Cancelar
                        </Button>
                        <Button onClick={handleConfirmRemove} loading={removeLoading} disabled={removeLoading}>
                          Desalocar
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === 'documentos' && (
            <>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0B4F8A]" />
                </div>
              ) : documentos.length === 0 ? (
                <div className="text-center py-12">
                  <FileText size={48} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-500 text-sm">Nenhum documento encontrado</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {documentos.map((doc) => {
                    const StatusIcon =
                      doc.status_validade === 'vencido' ? XCircle : doc.status_validade === 'a_vencer' ? AlertTriangle : CheckCircle;

                    const statusColor =
                      doc.status_validade === 'vencido'
                        ? 'text-red-600'
                        : doc.status_validade === 'a_vencer'
                        ? 'text-amber-600'
                        : 'text-emerald-600';

                    const bgColor =
                      doc.status_validade === 'vencido'
                        ? 'bg-red-50 border-red-200'
                        : doc.status_validade === 'a_vencer'
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-white border-slate-200';

                    return (
                      <Card key={doc.id} className={`p-4 ${bgColor}`}>
                        <div className="flex items-start gap-3">
                          <div className={`${statusColor}`}>
                            <StatusIcon size={20} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-900">{doc.tipo_documento_nome}</div>
                            <div className="text-xs text-slate-600 mt-1">
                              {doc.entidade_tipo} • {doc.entidade_nome}
                            </div>
                            <div className="mt-2 text-xs text-slate-500">Upload: {formatDatePT(doc.data_upload)}</div>
                            {doc.data_validade && <div className="mt-1 text-xs text-slate-500">Validade: {formatDatePT(doc.data_validade)}</div>}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === 'mapa' && (
            <>
              <Card className="p-4 bg-gradient-to-br from-blue-50 to-white border-blue-200">
                <div className="flex items-start gap-3">
                  <MapPin size={24} className="text-blue-600 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <div className="font-semibold text-slate-900">{obra.localizacao || 'Localização'}</div>
                    {obra.endereco && <div className="text-sm text-slate-600 mt-1">{obra.endereco}</div>}
                  </div>
                </div>
              </Card>

              <Card className="overflow-hidden">
                <div className="relative h-[400px] bg-slate-100">
                  <iframe
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    src={
                      obra.latitude && obra.longitude
                        ? `https://www.google.com/maps/search/?api=1&query=${obra.latitude},${obra.longitude}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(obra.endereco || obra.localizacao || obra.nome)}`
                    }
                  />
                </div>
              </Card>

              {userLocation && (
                <Card className="p-4 bg-gradient-to-br from-emerald-50 to-white border-emerald-200">
                  <div className="flex items-center gap-2 text-sm text-emerald-900 mb-2">
                    <Navigation size={16} />
                    <span className="font-medium">Sua localização detectada</span>
                  </div>
                  <div className="text-xs text-emerald-700">
                    Lat: {userLocation.lat.toFixed(6)}, Lng: {userLocation.lng.toFixed(6)}
                  </div>
                </Card>
              )}

              <div className="space-y-2">
                <Button className="w-full" onClick={openInGoogleMaps}>
                  <ExternalLink size={16} className="mr-2" />
                  Abrir no Google Maps
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    const address = obra.endereco || obra.localizacao || obra.nome;
                    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
                    window.open(url, '_blank');
                  }}
                >
                  <Navigation size={16} className="mr-2" />
                  Obter direções
                </Button>
              </div>

              <Card className="p-4 bg-slate-50">
                <div className="text-xs text-slate-600">
                  <strong>Dica:</strong> Clique em "Obter direções" para navegar até a obra usando o Google Maps.
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
