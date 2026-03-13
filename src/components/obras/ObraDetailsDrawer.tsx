// src/components/obras/ObraDetailsDrawer.tsx
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from 'react';
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
  rua: string | null;
  numero_porta: string | null;
  codigo_postal: string | null;
  freguesia: string | null;
  concelho: string | null;
  distrito: string | null;
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
  ativo: boolean;
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

type WorkStat = {
  minutos: number;
  custo: number;
};

const ASSIGN_PAGE_SIZE = 40;
const allowedColabStatuses = new Set(['ativo', 'ferias', 'férias']);

/* ----------------------------- helpers ----------------------------- */

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);

  return debounced;
}

function sanitizeSearch(input: string) {
  return input.replace(/[%_,]/g, ' ').trim();
}

function formatDatePT(date?: string | null) {
  if (!date) return '-';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-PT');
}

function statusVariant(status: string) {
  const s = String(status || '').toLowerCase();
  const variants: Record<string, string> = {
    ativa: 'success',
    pausada: 'warning',
    concluida: 'info',
    concluída: 'info',
    cancelada: 'danger',
  };
  return variants[s] || 'default';
}

function getInitials(name: string) {
  const parts = String(name || '')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatHM(minutos: number) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function getStatusValidade(dataValidade: string | null): 'valido' | 'vencido' | 'a_vencer' {
  if (!dataValidade) return 'valido';
  const hoje = new Date();
  const validade = new Date(dataValidade);
  const em30Dias = new Date();
  em30Dias.setDate(em30Dias.getDate() + 30);

  if (validade < hoje) return 'vencido';
  if (validade <= em30Dias) return 'a_vencer';
  return 'valido';
}

function safeText(value?: string | null) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function hasValidCoords(obra: Obra) {
  return Number.isFinite(Number(obra.latitude)) && Number.isFinite(Number(obra.longitude));
}

function buildObraAddress(obra: Obra) {
  const rua = safeText(obra.rua);
  const numero = safeText(obra.numero_porta);
  const codigoPostal = safeText(obra.codigo_postal);
  const freguesia = safeText(obra.freguesia);
  const concelho = safeText(obra.concelho);
  const distrito = safeText(obra.distrito);

  const linha1 = [rua, numero].filter(Boolean).join(' ').trim();

  return [linha1, codigoPostal, freguesia, concelho, distrito, 'Portugal']
    .filter(Boolean)
    .join(', ');
}

function getBestObraAddress(obra: Obra) {
  const built = buildObraAddress(obra);
  if (built) return built;

  const endereco = safeText(obra.endereco);
  if (endereco && endereco !== ', ,' && endereco !== ',') return endereco;

  const localizacao = safeText(obra.localizacao);
  if (localizacao) return localizacao;

  return safeText(obra.nome);
}

function getDisplayLocation(obra: Obra) {
  const built = buildObraAddress(obra);
  if (built) return built;

  const endereco = safeText(obra.endereco);
  if (endereco && !/^(\s*,\s*)+$/.test(endereco)) return endereco;

  const localizacao = safeText(obra.localizacao);
  if (localizacao) return localizacao;

  return 'Local não definido';
}

/* --------------------------- memo row ------------------------------ */

const AssignRow = memo(function AssignRow(props: {
  c: Colaborador;
  alreadyIn: boolean;
  checked: boolean;
  onToggle: (id: string) => void;
  eur: (v: number) => string;
}) {
  const { c, alreadyIn, checked, onToggle, eur } = props;

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-2xl border transition ${
        alreadyIn
          ? 'border-slate-200 bg-slate-50 opacity-70 dark:border-slate-800 dark:bg-slate-900/40'
          : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900/40'
      }`}
    >
      <input
        type="checkbox"
        className="h-4 w-4 accent-[#0B4F8A]"
        disabled={alreadyIn}
        checked={checked}
        onChange={() => onToggle(c.id)}
      />

      {c.foto_url ? (
        <img
          src={c.foto_url}
          alt={c.nome_completo}
          loading="lazy"
          decoding="async"
          className="h-11 w-11 rounded-xl object-cover border border-slate-200 dark:border-slate-800"
        />
      ) : (
        <div className="h-11 w-11 rounded-xl bg-[#0B4F8A] flex items-center justify-center text-white font-semibold text-xs">
          {getInitials(c.nome_completo)}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-semibold text-slate-900 truncate dark:text-slate-100">
            {c.nome_completo}
          </div>
          {alreadyIn && (
            <span className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              Já alocado
            </span>
          )}
        </div>

        <div className="text-xs text-slate-500 mt-0.5 truncate dark:text-slate-400">
          {c.categoria || '—'} {c.telefone ? `• ${c.telefone}` : ''} • €/h:{' '}
          <span className="text-slate-700 font-semibold dark:text-slate-200">
            {eur(Number(c.valor_hora || 0))}
          </span>
        </div>
      </div>

      <Badge variant={String(c.status).toLowerCase() === 'ativo' ? 'success' : 'default'}>
        {c.status}
      </Badge>
    </div>
  );
});

/* ----------------------------- component --------------------------- */

export function ObraDetailsDrawer({ obra, onClose, onEdit }: ObraDetailsDrawerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('info');

  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(false);

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [workStats, setWorkStats] = useState<Record<string, WorkStat>>({});

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');
  const debouncedAssignSearch = useDebouncedValue(assignSearch, 250);

  const [assignItems, setAssignItems] = useState<Colaborador[]>([]);
  const [assignPage, setAssignPage] = useState(0);
  const [assignHasMore, setAssignHasMore] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const assignPageRef = useRef(0);
  const assignHasMoreRef = useRef(true);

  const assignFetchingRef = useRef(false);
  const assignReqIdRef = useRef(0);

  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Colaborador | null>(null);

  const eurFormatter = useMemo(
    () => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }),
    []
  );
  const eur = useCallback((v: number) => eurFormatter.format(v), [eurFormatter]);

  const allocatedIds = useMemo(() => new Set(colaboradores.map((c) => c.id)), [colaboradores]);

  const totalEquipaMinutos = useMemo(
    () => Object.values(workStats).reduce((acc, s) => acc + (s?.minutos || 0), 0),
    [workStats]
  );

  const totalEquipaCusto = useMemo(
    () => Object.values(workStats).reduce((acc, s) => acc + (s?.custo || 0), 0),
    [workStats]
  );

  const obraDisplayLocation = useMemo(() => getDisplayLocation(obra), [obra]);
  const obraBestAddress = useMemo(() => getBestObraAddress(obra), [obra]);
  const obraHasCoords = useMemo(() => hasValidCoords(obra), [obra]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const loadWorkStatsForEquipa = useCallback(
    async (equipa: Colaborador[]) => {
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
    },
    [obra.id]
  );

  const loadEquipa = useCallback(async () => {
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
  }, [obra.id, loadWorkStatsForEquipa]);

  const loadDocumentos = useCallback(async () => {
    setLoading(true);
    const docs: Documento[] = [];

    try {
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

        (docsEmpresa || []).forEach((doc: any) => {
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

      const { data: equipaIds, error: eqErr } = await supabase
        .from('obras_colaboradores')
        .select('colaborador_id')
        .eq('obra_id', obra.id)
        .eq('ativo', true);

      if (eqErr) console.error(eqErr);

      if (equipaIds && equipaIds.length > 0) {
        const ids = equipaIds.map((e: any) => e.colaborador_id);

        const { data: docsColabs, error: docsErr } = await supabase
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

        if (docsErr) console.error(docsErr);

        if (docsColabs) {
          const { data: colabs, error: colErr } = await supabase
            .from('colaboradores')
            .select('id, nome_completo')
            .in('id', ids);

          if (colErr) console.error(colErr);

          const colaboradoresMap = new Map(
            (colabs || []).map((c: any) => [c.id, c.nome_completo] as const)
          );

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
          const statusOrder = { vencido: 0, a_vencer: 1, valido: 2 } as const;
          return statusOrder[a.status_validade] - statusOrder[b.status_validade];
        })
      );
    } finally {
      setLoading(false);
    }
  }, [obra.id, obra.empresa_id, obra.cliente]);

  const getUserLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      (error) => console.log('Erro ao obter localização:', error),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      }
    );
  }, []);

  useEffect(() => {
    if (activeTab === 'equipa') {
      loadEquipa();
      return;
    }
    if (activeTab === 'documentos') {
      loadDocumentos();
      return;
    }
    if (activeTab === 'mapa') {
      getUserLocation();
      return;
    }
  }, [activeTab, obra.id, loadEquipa, loadDocumentos, getUserLocation]);

  /* ---------------------- assign: open/close/reset ---------------------- */

  const resetAssignState = useCallback(() => {
    setAssignItems([]);
    setAssignLoading(false);

    setAssignPage(0);
    setAssignHasMore(true);

    assignPageRef.current = 0;
    assignHasMoreRef.current = true;

    assignReqIdRef.current += 1;
    assignFetchingRef.current = false;
  }, []);

  const openAssign = useCallback(() => {
    setAssignSearch('');
    setSelectedIds(new Set());
    resetAssignState();
    setAssignOpen(true);
  }, [resetAssignState]);

  const closeAssign = useCallback(() => {
    setAssignOpen(false);
    setSelectedIds(new Set());
    setAssignSearch('');
    resetAssignState();
  }, [resetAssignState]);

  /* ------------------------ assign: fetch (stable) ----------------------- */

  const fetchAssignableColabs = useCallback(
    async (opts: { reset: boolean }) => {
      if (!assignOpen) return;

      if (assignFetchingRef.current) return;
      if (!assignHasMoreRef.current && !opts.reset) return;

      assignFetchingRef.current = true;
      const reqId = ++assignReqIdRef.current;

      setAssignLoading(true);

      try {
        const page = opts.reset ? 0 : assignPageRef.current;
        const from = page * ASSIGN_PAGE_SIZE;
        const to = from + ASSIGN_PAGE_SIZE - 1;

        const raw = String(debouncedAssignSearch || '');
        const s = sanitizeSearch(raw).toLowerCase();

        let q = supabase
          .from('colaboradores')
          .select('id, nome_completo, foto_url, categoria, telefone, email, status, valor_hora')
          .in('status', ['ativo', 'ferias', 'férias', 'Ativo', 'Ferias', 'Férias'])
          .order('nome_completo', { ascending: true })
          .range(from, to);

        if (s) {
          q = q.or(
            [
              `nome_completo.ilike.%${s}%`,
              `categoria.ilike.%${s}%`,
              `telefone.ilike.%${s}%`,
            ].join(',')
          );
        }

        const { data, error } = await q;
        if (error) throw error;

        if (reqId !== assignReqIdRef.current) return;

        const cleaned = (data || []).filter((c: any) =>
          allowedColabStatuses.has(String(c.status || '').toLowerCase())
        ) as Colaborador[];

        if (opts.reset) {
          setAssignItems(cleaned);
          assignPageRef.current = 1;
          setAssignPage(1);
        } else {
          setAssignItems((prev) => {
            const seen = new Set(prev.map((x) => x.id));
            const merged = [...prev];
            for (const item of cleaned) if (!seen.has(item.id)) merged.push(item);
            return merged;
          });

          assignPageRef.current += 1;
          setAssignPage((p) => p + 1);
        }

        const hasMore = cleaned.length === ASSIGN_PAGE_SIZE;
        assignHasMoreRef.current = hasMore;
        setAssignHasMore(hasMore);
      } catch (e: any) {
        console.error('Erro ao carregar colaboradores (alocar):', e);
        toast.error(e?.message || 'Erro ao carregar colaboradores');

        assignHasMoreRef.current = false;
        setAssignHasMore(false);
      } finally {
        assignFetchingRef.current = false;
        setAssignLoading(false);
      }
    },
    [assignOpen, debouncedAssignSearch]
  );

  useEffect(() => {
    if (!assignOpen) return;

    setAssignItems([]);
    setAssignPage(0);
    setAssignHasMore(true);

    assignPageRef.current = 0;
    assignHasMoreRef.current = true;

    assignReqIdRef.current += 1;
    assignFetchingRef.current = false;

    fetchAssignableColabs({ reset: true });
  }, [assignOpen, debouncedAssignSearch, fetchAssignableColabs]);

  const onAssignListScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 240;
      if (nearBottom) fetchAssignableColabs({ reset: false });
    },
    [fetchAssignableColabs]
  );

  /* --------------------------- assign: write ---------------------------- */

  const allocateOne = useCallback(
    async (colaborador_id: string) => {
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
    },
    [obra.id]
  );

  const handleAssignSelected = useCallback(async () => {
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
  }, [allocateOne, allocatedIds, closeAssign, loadEquipa, selectedIds]);

  /* --------------------------- remove flow ----------------------------- */

  const askRemoveFromObra = useCallback((colab: Colaborador) => {
    setRemoveTarget(colab);
    setRemoveOpen(true);
  }, []);

  const closeRemove = useCallback(() => {
    if (removeLoading) return;
    setRemoveOpen(false);
    setRemoveTarget(null);
  }, [removeLoading]);

  const handleConfirmRemove = useCallback(async () => {
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

      if (String(error.message || '').toLowerCase().includes('updated_at')) {
        toast.error(
          'O banco está com trigger de updated_at mas a coluna não existe. Adicione updated_at em obras_colaboradores.'
        );
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
  }, [closeRemove, loadEquipa, obra.id, removeTarget]);

  /* ----------------------------- maps ----------------------------- */

  const openInGoogleMaps = useCallback(() => {
    const url = obraHasCoords
      ? `https://www.google.com/maps/search/?api=1&query=${obra.latitude},${obra.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(obraBestAddress)}`;

    window.open(url, '_blank');
  }, [obraBestAddress, obraHasCoords, obra.latitude, obra.longitude]);

  const openDirections = useCallback(() => {
    const destination = obraHasCoords
      ? `${obra.latitude},${obra.longitude}`
      : obraBestAddress;

    const origin = userLocation ? `${userLocation.lat},${userLocation.lng}` : '';

    const url = origin
      ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
          origin
        )}&destination=${encodeURIComponent(destination)}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;

    window.open(url, '_blank');
  }, [obraBestAddress, obraHasCoords, obra.latitude, obra.longitude, userLocation]);

  const tabs = useMemo(
    () => [
      { id: 'info' as Tab, label: 'Visão Geral', icon: Info },
      { id: 'equipa' as Tab, label: 'Equipa', icon: Users },
      { id: 'documentos' as Tab, label: 'Documentos', icon: FileText },
      { id: 'mapa' as Tab, label: 'Localização', icon: MapPin },
    ],
    []
  );

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 dark:bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className="
          fixed inset-0 sm:inset-y-0 sm:right-0 sm:left-auto
          h-full w-full sm:w-[680px]
          bg-white dark:bg-slate-950
          z-50 shadow-2xl flex flex-col
          rounded-t-3xl sm:rounded-none
          overflow-x-hidden
          border-l border-slate-200 dark:border-slate-800
        "
      >
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide font-medium">
                Obra
              </div>
              <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
                {obra.nome}
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <Badge variant={statusVariant(obra.status)}>{obra.status}</Badge>
                {obra.cliente && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Users size={12} />
                    {obra.cliente}
                  </span>
                )}
                {obra.localizacao && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <MapPin size={12} />
                    {obra.localizacao}
                  </span>
                )}
                {obraHasCoords && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-300 flex items-center gap-1">
                    <Navigation size={12} />
                    Local exato configurado
                  </span>
                )}
              </div>
            </div>

            <button
              className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/40"
              onClick={onClose}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-1 bg-slate-100 dark:bg-slate-900/50 rounded-xl p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-2 sm:px-3 py-2 rounded-lg text-[11px] sm:text-xs font-medium transition flex items-center justify-center gap-1 sm:gap-2 ${
                    active
                      ? 'bg-white text-[#0B4F8A] shadow-sm dark:bg-slate-950 dark:text-slate-100 dark:shadow-none'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon size={14} />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          {activeTab === 'info' && (
            <>
              <Card className="p-4 dark:bg-slate-950 dark:border-slate-800">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Data início</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1 flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400" />
                      {formatDatePT(obra.data_inicio)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Fim previsto</div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1 flex items-center gap-2">
                      <Calendar size={14} className="text-slate-400" />
                      {formatDatePT(obra.data_fim_prevista)}
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-4 dark:bg-slate-950 dark:border-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">Morada da obra</div>
                <div className="text-sm text-slate-900 dark:text-slate-100 break-words">
                  {obraDisplayLocation}
                </div>

                {(safeText(obra.freguesia) || safeText(obra.concelho) || safeText(obra.distrito)) && (
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {[safeText(obra.freguesia), safeText(obra.concelho), safeText(obra.distrito)]
                      .filter(Boolean)
                      .join(' • ')}
                  </div>
                )}
              </Card>

              {obra.descricao && (
                <Card className="p-4 dark:bg-slate-950 dark:border-slate-800">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">Descrição</div>
                  <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                    {obra.descricao}
                  </div>
                </Card>
              )}

              <Card className="p-4 bg-gradient-to-br from-emerald-50 to-white border-emerald-200 dark:from-emerald-900/20 dark:to-slate-950 dark:border-emerald-900/40">
                <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200 mb-1">
                  Custo Mão de Obra
                </div>
                <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-100 flex items-center gap-2">
                  <Euro size={20} />
                  {eur(Number(obra.custo_mao_obra_acumulado || 0))}
                </div>
                <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-200/80">
                  Custo acumulado
                </div>
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
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Equipa
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-900/50">
                      <Clock size={14} />
                      Horas:{' '}
                      <strong className="text-slate-900 dark:text-slate-100">
                        {formatHM(totalEquipaMinutos)}
                      </strong>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-900/50">
                      <Euro size={14} />
                      Custo:{' '}
                      <strong className="text-slate-900 dark:text-slate-100">
                        {eur(totalEquipaCusto)}
                      </strong>
                    </span>
                  </div>
                </div>

                <Button
                  onClick={openAssign}
                  variant="secondary"
                  className="w-full sm:w-auto justify-center"
                >
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
                  <Users size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
                  <p className="text-slate-500 dark:text-slate-400 text-sm">
                    Nenhum colaborador alocado nesta obra
                  </p>
                  <div className="mt-4">
                    <Button onClick={openAssign} className="w-full sm:w-auto">
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
                      <Card
                        key={colab.id}
                        className="p-4 hover:shadow-md transition dark:bg-slate-950 dark:border-slate-800 dark:hover:bg-slate-900/30"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                          <div className="flex items-start gap-3">
                            {colab.foto_url ? (
                              <img
                                src={colab.foto_url}
                                alt={colab.nome_completo}
                                className="h-12 w-12 rounded-xl object-cover border border-slate-200 dark:border-slate-800"
                              />
                            ) : (
                              <div className="h-12 w-12 rounded-xl bg-[#0B4F8A] flex items-center justify-center text-white font-semibold text-sm">
                                {getInitials(colab.nome_completo)}
                              </div>
                            )}

                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                {colab.nome_completo}
                              </div>
                              {colab.categoria && (
                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                  {colab.categoria}
                                </div>
                              )}

                              <div className="mt-2 flex flex-col sm:flex-row sm:flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
                                {colab.telefone && (
                                  <span className="break-words">📞 {colab.telefone}</span>
                                )}
                                {colab.email && <span className="break-all">✉️ {colab.email}</span>}
                              </div>

                              {colab.data_inicio && (
                                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                  Na obra desde {formatDatePT(colab.data_inicio)}
                                </div>
                              )}

                              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200">
                                  <Clock size={14} />
                                  Horas:{' '}
                                  <strong className="text-slate-900 dark:text-slate-100">
                                    {formatHM(st.minutos)}
                                  </strong>
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200">
                                  <Euro size={14} />
                                  €/h:{' '}
                                  <strong className="text-slate-900 dark:text-slate-100">
                                    {eur(vh)}
                                  </strong>
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-200">
                                  <Euro size={14} />
                                  Custo:{' '}
                                  <strong className="text-slate-900 dark:text-slate-100">
                                    {eur(st.custo)}
                                  </strong>
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-2">
                            <Badge
                              variant={
                                String(colab.status).toLowerCase() === 'ativo' ? 'success' : 'default'
                              }
                            >
                              {colab.status}
                            </Badge>

                            <Button
                              variant="ghost"
                              size="sm"
                              title="Desalocar da obra"
                              onClick={() => askRemoveFromObra(colab)}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}

              {assignOpen && (
                <>
                  <div
                    className="fixed inset-0 bg-black/40 dark:bg-black/70 z-[60]"
                    onClick={closeAssign}
                  />
                  <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
                    <div className="w-full sm:max-w-3xl h-[92vh] sm:h-auto bg-white dark:bg-slate-950 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
                      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Alocar colaboradores
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Selecione e adicione à obra: {obra.nome}
                          </div>
                        </div>
                        <button
                          className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/40"
                          onClick={closeAssign}
                          aria-label="Fechar"
                        >
                          <X size={18} />
                        </button>
                      </div>

                      <div className="p-4 flex-1 overflow-hidden">
                        <div className="h-full flex flex-col">
                          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                            <div className="relative w-full">
                              <SearchIcon
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                                size={18}
                              />
                              <input
                                value={assignSearch}
                                onChange={(e) => setAssignSearch(e.target.value)}
                                placeholder="Pesquisar por nome, categoria ou telefone…"
                                className="
                                  w-full pl-10 pr-4 py-2.5
                                  border border-slate-200 dark:border-slate-800
                                  rounded-xl
                                  bg-white dark:bg-slate-950
                                  text-slate-900 dark:text-slate-100
                                  placeholder:text-slate-400
                                  focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent
                                "
                              />
                            </div>

                            <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              Selecionados:{' '}
                              <span className="font-semibold text-slate-900 dark:text-slate-100">
                                {selectedIds.size}
                              </span>
                            </div>
                          </div>

                          <div
                            className="
                              mt-4
                              overflow-y-auto space-y-2
                              rounded-xl
                              border border-slate-200 dark:border-slate-800
                              bg-white dark:bg-slate-950
                              p-2
                              h-[468px]
                              max-h-[60vh]
                              sm:h-[468px]
                            "
                            onScroll={onAssignListScroll}
                          >
                            {assignLoading && assignItems.length === 0 ? (
                              <div className="flex items-center justify-center py-10">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0B4F8A]" />
                              </div>
                            ) : assignItems.length === 0 ? (
                              <div className="text-center py-10 text-slate-500 dark:text-slate-400 text-sm">
                                Nenhum colaborador encontrado.
                              </div>
                            ) : (
                              <>
                                {assignItems.map((c) => (
                                  <AssignRow
                                    key={c.id}
                                    c={c}
                                    alreadyIn={allocatedIds.has(c.id)}
                                    checked={selectedIds.has(c.id)}
                                    onToggle={toggleSelect}
                                    eur={eur}
                                  />
                                ))}

                                {assignLoading && assignItems.length > 0 && (
                                  <div className="flex items-center justify-center py-4">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#0B4F8A]" />
                                  </div>
                                )}

                                {!assignHasMore && (
                                  <div className="text-center py-3 text-xs text-slate-500 dark:text-slate-400">
                                    Fim da lista.
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                        <Button variant="secondary" onClick={closeAssign} disabled={assignLoading}>
                          Cancelar
                        </Button>
                        <Button
                          onClick={handleAssignSelected}
                          loading={assignLoading}
                          disabled={assignLoading}
                        >
                          Alocar selecionados
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {removeOpen && removeTarget && (
                <>
                  <div
                    className="fixed inset-0 bg-black/40 dark:bg-black/70 z-[80]"
                    onClick={closeRemove}
                  />
                  <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-4">
                    <div className="w-full sm:max-w-xl max-w-[95vw] bg-white dark:bg-slate-950 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Desalocar colaborador
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Isto vai remover o colaborador desta obra (não apaga o colaborador do sistema).
                          </div>
                        </div>
                        <button
                          className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/40"
                          onClick={closeRemove}
                          aria-label="Fechar"
                        >
                          <X size={18} />
                        </button>
                      </div>

                      <div className="p-4 space-y-3">
                        <Card className="p-4 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-800">
                          <div className="flex items-center gap-3">
                            {removeTarget.foto_url ? (
                              <img
                                src={removeTarget.foto_url}
                                alt={removeTarget.nome_completo}
                                className="h-12 w-12 rounded-xl object-cover border border-slate-200 dark:border-slate-800"
                              />
                            ) : (
                              <div className="h-12 w-12 rounded-xl bg-[#0B4F8A] flex items-center justify-center text-white font-semibold text-sm">
                                {getInitials(removeTarget.nome_completo)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                {removeTarget.nome_completo}
                              </div>
                              <div className="text-xs text-slate-600 dark:text-slate-300">
                                {removeTarget.categoria || '—'} • Obra: {obra.nome}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                Se confirmar: ativo=false e data_fim=today em obras_colaboradores.
                              </div>
                            </div>
                          </div>
                        </Card>

                        <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
                          <strong>Atenção:</strong> se existirem presenças já registadas para este colaborador nesta obra, elas continuam no histórico.
                        </div>
                      </div>

                      <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
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
                  <FileText size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-3" />
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Nenhum documento encontrado</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {documentos.map((doc) => {
                    const StatusIcon =
                      doc.status_validade === 'vencido'
                        ? XCircle
                        : doc.status_validade === 'a_vencer'
                        ? AlertTriangle
                        : CheckCircle;

                    const statusColor =
                      doc.status_validade === 'vencido'
                        ? 'text-red-600'
                        : doc.status_validade === 'a_vencer'
                        ? 'text-amber-600'
                        : 'text-emerald-600';

                    const bgColor =
                      doc.status_validade === 'vencido'
                        ? 'bg-red-50 border-red-200 dark:bg-red-900/15 dark:border-red-900/40'
                        : doc.status_validade === 'a_vencer'
                        ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/15 dark:border-amber-900/40'
                        : 'bg-white border-slate-200 dark:bg-slate-950 dark:border-slate-800';

                    return (
                      <Card key={doc.id} className={`p-4 ${bgColor}`}>
                        <div className="flex items-start gap-3">
                          <div className={`${statusColor}`}>
                            <StatusIcon size={20} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {doc.tipo_documento_nome}
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                              {doc.entidade_tipo} • <span className="break-words">{doc.entidade_nome}</span>
                            </div>
                            <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                              Upload: {formatDatePT(doc.data_upload)}
                            </div>
                            {doc.data_validade && (
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Validade: {formatDatePT(doc.data_validade)}
                              </div>
                            )}
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
              <Card className="p-4 bg-gradient-to-br from-blue-50 to-white border-blue-200 dark:from-blue-900/15 dark:to-slate-950 dark:border-blue-900/40">
                <div className="flex items-start gap-3">
                  <MapPin size={24} className="text-blue-600 dark:text-blue-300 flex-shrink-0 mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {obra.localizacao || 'Localização'}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300 mt-1 break-words">
                      {obraDisplayLocation}
                    </div>

                    {obraHasCoords ? (
                      <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-300">
                        Localização exata disponível via latitude/longitude.
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-amber-600 dark:text-amber-300">
                        Sem coordenadas exatas. O mapa vai usar a melhor morada disponível.
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              <Card className="overflow-hidden dark:bg-slate-950 dark:border-slate-800">
                <div className="relative h-[260px] sm:h-[400px] bg-slate-100 dark:bg-slate-900/40">
              <iframe
  width="100%"
  height="100%"
  style={{ border: 0 }}
  loading="lazy"
  allowFullScreen
  referrerPolicy="no-referrer-when-downgrade"
  src={
    obraHasCoords
      ? `https://www.google.com/maps?q=${obra.latitude},${obra.longitude}&z=17&output=embed`
      : `https://www.google.com/maps?q=${encodeURIComponent(obraBestAddress)}&z=17&output=embed`
  }
/>
                </div>
              </Card>

              {userLocation && (
                <Card className="p-4 bg-gradient-to-br from-emerald-50 to-white border-emerald-200 dark:from-emerald-900/20 dark:to-slate-950 dark:border-emerald-900/40">
                  <div className="flex items-center gap-2 text-sm text-emerald-900 dark:text-emerald-100 mb-2">
                    <Navigation size={16} />
                    <span className="font-medium">Sua localização detectada</span>
                  </div>
                  <div className="text-xs text-emerald-700 dark:text-emerald-200/80">
                    Lat: {userLocation.lat.toFixed(6)}, Lng: {userLocation.lng.toFixed(6)}
                  </div>
                </Card>
              )}

              <div className="space-y-2">
                <Button className="w-full" onClick={openInGoogleMaps}>
                  <ExternalLink size={16} className="mr-2" />
                  Abrir no Google Maps
                </Button>

                <Button variant="secondary" className="w-full" onClick={openDirections}>
                  <Navigation size={16} className="mr-2" />
                  Obter direções
                </Button>
              </div>

              <Card className="p-4 bg-slate-50 dark:bg-slate-900/40 dark:border-slate-800">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  <strong>Dica:</strong> para navegação realmente exata, esta obra deve ter latitude e longitude guardadas.
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}