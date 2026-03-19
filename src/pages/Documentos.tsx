import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  Plus,
  UploadCloud,
  ExternalLink,
  Edit3,
  Copy,
  Paperclip,
  Hash,
  CalendarDays,
  Building2,
  Users,
  X,
} from 'lucide-react';

import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

import { supabase } from '../lib/supabase';

import { DocumentosColaboradores } from '../components/documentos/DocumentosColaboradores';
import { DocumentosEmpresas } from '../components/documentos/DocumentosEmpresas';
import { DocumentoModal } from '../components/documentos/DocumentoModal';
import { NovaEmpresaModal } from '../components/documentos/NovaEmpresaModal';
import { EditEmpresaModal } from '../components/documentos/EditEmpresaModal';

import type {
  Scope,
  StatusFilter,
  EntidadeTipo,
  DocumentosInitialSelection,
  Documento,
  TipoDocumento,
  ColaboradorRow,
  EmpresaRow,
} from '../components/documentos/documentos.types';

import {
  BRAND,
  cardBase,
  formatDatePT,
  normalize,
  getDocumentoStatus,
  getStatusConfig,
  urgencyLabel,
  asEntidadeNice,
  buildStoragePath,
  uploadToStorage,
  openArquivo,
  buildStatsByEntidade,
  readDocsFocusFromSession,
} from '../components/documentos/documentos.helpers';

function Segmented({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (v: string) => void;
  items: Array<{ id: string; label: string; count?: number; icon?: any }>;
}) {
  return (
    <div className="inline-flex items-center rounded-2xl border border-slate-200 bg-white p-1 gap-1 dark:border-slate-800 dark:bg-slate-950/40">
      {items.map((it) => {
        const active = value === it.id;
        const Icon = it.icon;

        return (
          <button
            key={it.id}
            onClick={() => onChange(it.id)}
            className={[
              'inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition',
              active
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-950/50',
            ].join(' ')}
          >
            {Icon && (
              <Icon
                size={16}
                className={active ? 'text-white dark:text-slate-900' : 'text-slate-500 dark:text-slate-400'}
              />
            )}

            {it.label}

            {typeof it.count === 'number' && (
              <span
                className={[
                  'px-2 py-0.5 rounded-full text-xs',
                  active
                    ? 'bg-white/15 text-white dark:bg-slate-900/10 dark:text-slate-900'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-900/50 dark:text-slate-200',
                ].join(' ')}
              >
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Documentos({ initialSelection }: { initialSelection?: DocumentosInitialSelection | null }) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumento[]>([]);
  const [loading, setLoading] = useState(true);

  const [colaboradores, setColaboradores] = useState<ColaboradorRow[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaRow[]>([]);

  const [scope, setScope] = useState<Scope>('colaborador');

  const [selectedEntidadeId, setSelectedEntidadeId] = useState('');
  const [selectedEntidadeNome, setSelectedEntidadeNome] = useState('');
  const [entitySearch, setEntitySearch] = useState('');
  const [pinSelectedToTop, setPinSelectedToTop] = useState(false);

  const [filter, setFilter] = useState<StatusFilter>('todos');
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState('todos');
  const [validadeMes, setValidadeMes] = useState('');

  const [selectedDoc, setSelectedDoc] = useState<Documento | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalDocumento, setModalDocumento] = useState<Documento | null>(null);

  const [empresaModalOpen, setEmpresaModalOpen] = useState(false);
  const [editEmpresaOpen, setEditEmpresaOpen] = useState(false);
  const [editEmpresaTarget, setEditEmpresaTarget] = useState<EmpresaRow | null>(null);

  const [drawerFile, setDrawerFile] = useState<File | null>(null);
  const [drawerUploading, setDrawerUploading] = useState(false);
  const drawerFileInputRef = useRef<HTMLInputElement | null>(null);

  const skipScopeResetRef = useRef(false);

  const [resolvedInitialSelection, setResolvedInitialSelection] =
    useState<DocumentosInitialSelection | null>(initialSelection ?? null);

  useEffect(() => {
    if (initialSelection?.entidadeId) {
      setResolvedInitialSelection(initialSelection);
    }
  }, [initialSelection?.entidadeId, initialSelection?.entidadeNome, initialSelection?.scope]);

  useEffect(() => {
    if (initialSelection?.entidadeId) return;

    const fromSession = readDocsFocusFromSession();
    if (fromSession?.entidadeId) {
      setResolvedInitialSelection(fromSession);
    }
  }, [initialSelection?.entidadeId]);

  const loadTiposDocumento = async () => {
    const { data, error } = await supabase.from('tipos_documento').select('id, nome').order('nome');
    if (error) {
      console.error('Erro ao carregar tipos_documento:', error);
      setTiposDocumento([]);
      return [];
    }

    const rows = (data || []) as TipoDocumento[];
    setTiposDocumento(rows);
    return rows;
  };

  const loadDocumentos = async () => {
    setLoading(true);

    const r1 = await supabase
      .from('documentos')
      .select('*, tipos_documento(nome)')
      .order('data_validade', { ascending: true });

    if (!r1.error) {
      const rows = (r1.data || []) as Documento[];
      setDocumentos(rows);
      setLoading(false);
      return rows;
    }

    console.error('Erro ao carregar documentos (com embed):', r1.error);

    const r2 = await supabase.from('documentos').select('*').order('data_validade', { ascending: true });

    if (r2.error) {
      console.error('Erro ao carregar documentos (fallback):', r2.error);
      setDocumentos([]);
      setLoading(false);
      return [];
    }

    const rows = (r2.data || []).map((d: any) => ({ ...d, tipos_documento: null })) as Documento[];
    setDocumentos(rows);
    setLoading(false);
    return rows;
  };

  const loadColaboradores = async () => {
    const r = await supabase
      .from('colaboradores')
      .select('id, nome_completo, email, telefone, status, categoria, foto_url')
      .order('nome_completo', { ascending: true })
      .limit(2000);

    if (r.error) {
      console.error('Erro ao carregar colaboradores:', r.error);
      setColaboradores([]);
      return [];
    }

    const rows = (r.data || []) as ColaboradorRow[];
    setColaboradores(rows);
    return rows;
  };

  const loadEmpresas = async () => {
    const r = await supabase
      .from('empresas')
      .select('id, nome, razao_social, logo_url')
      .order('nome', { ascending: true })
      .limit(1000);

    if (r.error) {
      console.error('Erro ao carregar empresas:', r.error);
      setEmpresas([]);
      return [];
    }

    const rows = (r.data || []) as EmpresaRow[];
    setEmpresas(rows);
    return rows;
  };

  useEffect(() => {
    (async () => {
      await Promise.all([loadTiposDocumento(), loadDocumentos(), loadColaboradores(), loadEmpresas()]);
    })();
  }, []);

  useEffect(() => {
    if (skipScopeResetRef.current) {
      skipScopeResetRef.current = false;
      return;
    }

    setSelectedEntidadeId('');
    setSelectedEntidadeNome('');
    setEntitySearch('');
    setFilter('todos');
    setSearch('');
    setTipoFilter('todos');
    setValidadeMes('');
    setSelectedDoc(null);
    setPinSelectedToTop(false);
  }, [scope]);

  useEffect(() => {
    if (!resolvedInitialSelection?.entidadeId) return;

    skipScopeResetRef.current = true;

    setScope(resolvedInitialSelection.scope);
    setSelectedEntidadeId(resolvedInitialSelection.entidadeId);
    setSelectedEntidadeNome(String(resolvedInitialSelection.entidadeNome || ''));

    setEntitySearch('');
    setFilter('todos');
    setSearch('');
    setTipoFilter('todos');
    setValidadeMes('');
    setSelectedDoc(null);
    setPinSelectedToTop(true);
  }, [
    resolvedInitialSelection?.entidadeId,
    resolvedInitialSelection?.entidadeNome,
    resolvedInitialSelection?.scope,
  ]);

  const docsByScope = useMemo(() => {
    return documentos.filter((d) => normalize(d.entidade_tipo) === scope);
  }, [documentos, scope]);

  const docsByEntity = useMemo(() => {
    if (!selectedEntidadeId) return [];
    return docsByScope.filter((d) => String(d.entidade_id) === selectedEntidadeId);
  }, [docsByScope, selectedEntidadeId]);

  const statsBase = useMemo(() => {
    return selectedEntidadeId ? docsByEntity : docsByScope;
  }, [docsByEntity, docsByScope, selectedEntidadeId]);

  const stats = useMemo(() => {
    const all = statsBase;

    const count = (st: StatusFilter) => {
      if (st === 'todos') return all.length;
      return all.filter((d) => getDocumentoStatus(d) === st).length;
    };

    return {
      semDocumento: count('sem_documento'),
      vencidos: count('vencido'),
      aVencer: count('a_vencer'),
      validos: count('valido'),
      semValidade: count('sem_validade'),
      total: all.length,
    };
  }, [statsBase]);

  const scopeCounts = useMemo(() => {
    const colab = documentos.filter((d) => normalize(d.entidade_tipo) === 'colaborador').length;
    const emp = documentos.filter((d) => normalize(d.entidade_tipo) === 'empresa').length;
    return { colaborador: colab, empresa: emp };
  }, [documentos]);

  const tiposOptions = useMemo(() => {
    const set = new Set<string>();
    for (const d of docsByScope) {
      const t = d.tipos_documento?.nome?.trim() || d.tipo?.trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [docsByScope]);

  const filteredDocumentos = useMemo(() => {
    const base = selectedEntidadeId ? docsByEntity : [];
    const s = normalize(search);

    const rows = base.filter((doc) => {
      const st = getDocumentoStatus(doc);
      if (filter !== 'todos' && st !== filter) return false;

      const tipoNome = doc.tipos_documento?.nome || doc.tipo || '-';
      if (tipoFilter !== 'todos' && tipoNome !== tipoFilter) return false;

      if (validadeMes) {
        if (!doc.data_validade) return false;
        const ym = String(doc.data_validade).slice(0, 7);
        if (ym !== validadeMes) return false;
      }

      if (!s) return true;

      const hay = [
        doc.nome || '',
        tipoNome,
        doc.entidade_tipo || '',
        doc.entidade_nome || '',
        doc.entidade_id || '',
        doc.data_validade ? formatDatePT(doc.data_validade) : '',
        doc.arquivo_url ? 'com ficheiro' : 'sem ficheiro',
      ]
        .join(' ')
        .toLowerCase();

      return hay.includes(s);
    });

    const priority = (st: ReturnType<typeof getDocumentoStatus>) => {
      if (st === 'sem_documento') return 0;
      if (st === 'vencido') return 1;
      if (st === 'a_vencer') return 2;
      if (st === 'sem_validade') return 3;
      return 4;
    };

    rows.sort((a, b) => {
      const pa = priority(getDocumentoStatus(a));
      const pb = priority(getDocumentoStatus(b));
      if (pa !== pb) return pa - pb;

      const da = a.data_validade ? new Date(a.data_validade).getTime() : Number.POSITIVE_INFINITY;
      const db = b.data_validade ? new Date(b.data_validade).getTime() : Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;

      return String(a.nome || '').localeCompare(String(b.nome || ''));
    });

    return rows;
  }, [docsByEntity, selectedEntidadeId, filter, search, tipoFilter, validadeMes]);

  const colabStats = useMemo(() => buildStatsByEntidade(documentos, 'colaborador'), [documentos]);
  const empresaStats = useMemo(() => buildStatsByEntidade(documentos, 'empresa'), [documentos]);

  const selectedLabel = useMemo(() => {
    if (scope === 'colaborador') {
      const c = colaboradores.find((x) => x.id === selectedEntidadeId);
      return c?.nome_completo || selectedEntidadeNome || '';
    }

    const e = empresas.find((x) => x.id === selectedEntidadeId);
    return String(e?.nome || e?.razao_social || selectedEntidadeNome || '');
  }, [scope, colaboradores, empresas, selectedEntidadeId, selectedEntidadeNome]);

  const lockEntidadeForModal =
    selectedEntidadeId
      ? { tipo: scope as EntidadeTipo, id: selectedEntidadeId, nome: selectedLabel || null }
      : null;

  const openNew = () => {
    setModalDocumento(null);
    setModalOpen(true);
  };

  const openEdit = (doc: Documento) => {
    setModalDocumento(doc);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalDocumento(null);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  };

  const openDocDrawer = (doc: Documento) => {
    setSelectedDoc(doc);
    setDrawerFile(null);
    if (drawerFileInputRef.current) drawerFileInputRef.current.value = '';
  };

  const uploadInDrawer = async () => {
    if (!selectedDoc || !drawerFile) return;

    setDrawerUploading(true);
    try {
      const entidadeTipo = String(selectedDoc.entidade_tipo || 'geral');
      const path = buildStoragePath(selectedDoc.id, drawerFile.name, entidadeTipo);
      const storedPath = await uploadToStorage(path, drawerFile);

      const { error } = await supabase.from('documentos').update({ arquivo_url: storedPath }).eq('id', selectedDoc.id);
      if (error) throw error;

      const rows = await loadDocumentos();
      const updated = rows.find((d) => d.id === selectedDoc.id) || null;

      setSelectedDoc(updated);
      setDrawerFile(null);
      if (drawerFileInputRef.current) drawerFileInputRef.current.value = '';
    } catch (e) {
      console.error('Erro ao enviar ficheiro no drawer:', e);
      alert(
        'Não foi possível enviar o ficheiro.\n\nCheca:\n- policies do bucket documentos (INSERT/UPDATE)\n- se teu user tem permissão no storage'
      );
    } finally {
      setDrawerUploading(false);
    }
  };

  const handleRefreshAll = async () => {
    await Promise.all([loadDocumentos(), loadEmpresas(), loadColaboradores(), loadTiposDocumento()]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedDoc(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0B4F8A]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className={`p-5 ${cardBase}`}>
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Gestão de documentos
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Gestão por entidade: escolha o colaborador/empresa, depois visualize e gere os documentos.
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end">
            {scope === 'empresa' && (
              <Button variant="secondary" onClick={() => setEmpresaModalOpen(true)}>
                <Plus size={16} className="mr-2" />
                Nova empresa
              </Button>
            )}

            <Segmented
              value={scope}
              onChange={(v) => setScope(v as Scope)}
              items={[
                { id: 'colaborador', label: 'Colaboradores', count: scopeCounts.colaborador, icon: Users },
                { id: 'empresa', label: 'Empresa', count: scopeCounts.empresa, icon: Building2 },
              ]}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 lg:items-center">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Selecionado:</div>

            <div
              className={[
                'inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold',
                'bg-[#0B4F8A]/[0.06] border-[#0B4F8A]/25 text-slate-900 dark:text-slate-100',
                'dark:bg-[#0B4F8A]/10 dark:border-[#0B4F8A]/25',
              ].join(' ')}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: BRAND.blue }} />
              {selectedEntidadeId ? (selectedLabel || selectedEntidadeId) : 'Nenhum'}
            </div>

            {selectedEntidadeId && (
              <button
                onClick={() => {
                  setPinSelectedToTop(false);
                  setSelectedEntidadeId('');
                  setSelectedEntidadeNome('');
                  setSelectedDoc(null);
                  setFilter('todos');
                  setSearch('');
                  setTipoFilter('todos');
                  setValidadeMes('');
                }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-semibold
                           hover:bg-slate-50 dark:hover:bg-slate-950/40 text-slate-700 dark:text-slate-200"
                title="Limpar seleção"
              >
                <X size={16} />
                Limpar
              </button>
            )}

            {scope === 'empresa' && selectedEntidadeId && (
              <button
                onClick={() => {
                  const empresa = empresas.find((e) => e.id === selectedEntidadeId) || null;
                  setEditEmpresaTarget(empresa);
                  setEditEmpresaOpen(true);
                }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-sm font-semibold
                           hover:bg-slate-50 dark:hover:bg-slate-950/40 text-slate-700 dark:text-slate-200"
                title="Editar empresa"
              >
                <Edit3 size={16} />
                Editar empresa
              </button>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={handleRefreshAll}>
              Atualizar
            </Button>

            <Button onClick={openNew} disabled={!selectedEntidadeId}>
              <Plus size={16} className="mr-2" />
              Novo documento
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card className={`${cardBase} ${stats.semDocumento > 0 ? 'border-l-4 border-l-amber-500 p-5' : 'p-5'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Sem documento</p>
              <p className="text-3xl font-semibold text-amber-700 mt-1">{stats.semDocumento}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Falta anexar ficheiro</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center border border-amber-100 dark:border-amber-500/20">
              <UploadCloud className="text-amber-700 dark:text-amber-200" size={24} />
            </div>
          </div>
        </Card>

        <Card className={`${cardBase} ${stats.vencidos > 0 ? 'border-l-4 border-l-red-500 p-5' : 'p-5'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Vencidos</p>
              <p className="text-3xl font-semibold text-red-600 mt-1">{stats.vencidos}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Requer ação imediata</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center border border-red-100 dark:border-red-500/20">
              <AlertTriangle className="text-red-600 dark:text-red-200" size={24} />
            </div>
          </div>
        </Card>

        <Card className={`${cardBase} ${stats.aVencer > 0 ? 'border-l-4 border-l-amber-500 p-5' : 'p-5'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">A vencer</p>
              <p className="text-3xl font-semibold text-amber-700 mt-1">{stats.aVencer}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Próximos 30 dias</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center border border-amber-100 dark:border-amber-500/20">
              <Clock className="text-amber-700 dark:text-amber-200" size={24} />
            </div>
          </div>
        </Card>

        <Card className={`p-5 ${cardBase}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Válidos</p>
              <p className="text-3xl font-semibold text-emerald-700 mt-1">{stats.validos}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Em conformidade</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20">
              <CheckCircle className="text-emerald-700 dark:text-emerald-200" size={24} />
            </div>
          </div>
        </Card>

        <Card className={`p-5 ${cardBase}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Sem validade</p>
              <p className="text-3xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{stats.semValidade}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Sem prazo definido</p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-slate-50 dark:bg-slate-900/30 flex items-center justify-center border border-slate-200 dark:border-slate-800">
              <FileText className="text-slate-700 dark:text-slate-200" size={24} />
            </div>
          </div>
        </Card>
      </div>

      {scope === 'colaborador' ? (
        <DocumentosColaboradores
          colaboradores={colaboradores}
          documentos={documentos}
          selectedEntidadeId={selectedEntidadeId}
          selectedEntidadeNome={selectedEntidadeNome}
          entitySearch={entitySearch}
          setEntitySearch={setEntitySearch}
          setSelectedEntidadeId={setSelectedEntidadeId}
          setSelectedEntidadeNome={setSelectedEntidadeNome}
          setSelectedDoc={setSelectedDoc}
          filter={filter}
          setFilter={setFilter}
          search={search}
          setSearch={setSearch}
          tipoFilter={tipoFilter}
          setTipoFilter={setTipoFilter}
          validadeMes={validadeMes}
          setValidadeMes={setValidadeMes}
          tiposOptions={tiposOptions}
          filteredDocumentos={filteredDocumentos}
          stats={stats}
          colabStats={colabStats}
          pinSelectedToTop={pinSelectedToTop}
          setPinSelectedToTop={setPinSelectedToTop}
          onOpenNew={openNew}
          onOpenEdit={openEdit}
          onOpenArquivo={openArquivo}
          onRefreshAll={handleRefreshAll}
          onOpenDocDrawer={openDocDrawer}
        />
      ) : (
        <DocumentosEmpresas
          empresas={empresas}
          documentos={documentos}
          selectedEntidadeId={selectedEntidadeId}
          selectedEntidadeNome={selectedEntidadeNome}
          entitySearch={entitySearch}
          setEntitySearch={setEntitySearch}
          setSelectedEntidadeId={setSelectedEntidadeId}
          setSelectedEntidadeNome={setSelectedEntidadeNome}
          setSelectedDoc={setSelectedDoc}
          filter={filter}
          setFilter={setFilter}
          search={search}
          setSearch={setSearch}
          tipoFilter={tipoFilter}
          setTipoFilter={setTipoFilter}
          validadeMes={validadeMes}
          setValidadeMes={setValidadeMes}
          tiposOptions={tiposOptions}
          filteredDocumentos={filteredDocumentos}
          stats={stats}
          empresaStats={empresaStats}
          pinSelectedToTop={pinSelectedToTop}
          setPinSelectedToTop={setPinSelectedToTop}
          onOpenNew={openNew}
          onOpenEdit={openEdit}
          onOpenArquivo={openArquivo}
          onRefreshAll={handleRefreshAll}
          onOpenDocDrawer={openDocDrawer}
          onOpenNovaEmpresa={() => setEmpresaModalOpen(true)}
          onOpenEditEmpresa={(empresa) => {
            setEditEmpresaTarget(empresa);
            setEditEmpresaOpen(true);
          }}
        />
      )}

      {selectedDoc && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSelectedDoc(null)} />
          <div className="fixed right-0 top-0 h-full w-full sm:w-[580px] bg-white dark:bg-slate-950 z-50 border-l border-slate-200 dark:border-slate-800 shadow-xl">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-slate-500 dark:text-slate-400">Documento</div>
                <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {selectedDoc.nome || '—'}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="default">{asEntidadeNice(selectedDoc.entidade_tipo)}</Badge>
                  <Badge variant="default">{selectedDoc.tipos_documento?.nome || selectedDoc.tipo || '—'}</Badge>

                  {(selectedDoc.entidade_nome || selectedDoc.entidade_id) && (
                    <span
                      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-semibold"
                      style={{
                        borderColor: BRAND.blue + '33',
                        background: BRAND.blue + '0D',
                        color: BRAND.blue,
                      }}
                    >
                      Entidade: {selectedDoc.entidade_nome || selectedDoc.entidade_id}
                    </span>
                  )}
                </div>
              </div>

              <button
                className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-950/40"
                onClick={() => setSelectedDoc(null)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto h-[calc(100%-80px)]">
              <Card className={`p-4 ${cardBase}`}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <Hash size={14} className="text-slate-400 dark:text-slate-500" />
                      Entidade ID
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2">
                      <span className="font-mono text-xs">{selectedDoc.entidade_id}</span>
                      <button
                        onClick={() => copyToClipboard(selectedDoc.entidade_id)}
                        className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-950/40"
                        title="Copiar ID"
                      >
                        <Copy size={14} className="text-slate-600 dark:text-slate-300" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <CalendarDays size={14} className="text-slate-400 dark:text-slate-500" />
                      Validade
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selectedDoc.data_validade ? formatDatePT(selectedDoc.data_validade) : 'Sem validade'}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  {(() => {
                    const st = getDocumentoStatus(selectedDoc);
                    const cfg = getStatusConfig(st);
                    const Icon = cfg.icon;
                    const urg = urgencyLabel(selectedDoc);

                    return (
                      <div className="flex items-center justify-between gap-3">
                        <Badge variant={cfg.variant}>
                          <Icon size={12} className="mr-1" />
                          {cfg.label}
                        </Badge>

                        <span
                          className="text-xs font-semibold px-3 py-1 rounded-full border"
                          style={{
                            borderColor: BRAND.blue + '33',
                            background: BRAND.blue + '0D',
                            color: BRAND.blue,
                          }}
                        >
                          {urg.text}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </Card>

              <Card className={`p-4 ${cardBase}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Paperclip size={16} />
                      Ficheiro
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {selectedDoc.arquivo_url
                        ? 'Ficheiro anexado e pronto para consulta.'
                        : 'Nenhum ficheiro anexado. Envie para completar o documento.'}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedDoc.arquivo_url && (
                      <Button variant="secondary" onClick={() => openArquivo(String(selectedDoc.arquivo_url))}>
                        <ExternalLink size={16} className="mr-2" />
                        Abrir
                      </Button>
                    )}

                    <button
                      className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition
                                 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950/40 disabled:opacity-60"
                      onClick={() => drawerFileInputRef.current?.click()}
                      disabled={drawerUploading}
                      title={selectedDoc.arquivo_url ? 'Substituir ficheiro' : 'Enviar ficheiro'}
                    >
                      <UploadCloud size={16} />
                      {selectedDoc.arquivo_url ? 'Substituir' : 'Enviar'}
                    </button>

                    <input
                      ref={drawerFileInputRef}
                      type="file"
                      accept="application/pdf,image/*"
                      className="hidden"
                      onChange={(e) => setDrawerFile(e.target.files?.[0] || null)}
                    />
                  </div>
                </div>

                {drawerFile && (
                  <div className="mt-3 p-3 rounded-xl border border-amber-200 bg-amber-50/40 dark:bg-amber-500/10 dark:border-amber-500/20">
                    <div className="text-sm text-slate-800 dark:text-slate-100">
                      <span className="font-semibold">Selecionado:</span> {drawerFile.name}{' '}
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        ({Math.round(drawerFile.size / 1024)} KB)
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setDrawerFile(null);
                          if (drawerFileInputRef.current) drawerFileInputRef.current.value = '';
                        }}
                        disabled={drawerUploading}
                      >
                        Cancelar
                      </Button>
                      <Button onClick={uploadInDrawer} disabled={drawerUploading}>
                        {drawerUploading ? 'A enviar…' : selectedDoc.arquivo_url ? 'Substituir ficheiro' : 'Enviar ficheiro'}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>

              <div className="grid grid-cols-2 gap-2">
                <Button className="w-full" onClick={() => openEdit(selectedDoc)}>
                  <Edit3 size={16} className="mr-2" />
                  Editar
                </Button>

                <Button variant="secondary" className="w-full" onClick={loadDocumentos}>
                  Atualizar lista
                </Button>

                <Button variant="secondary" className="w-full" onClick={() => setSelectedDoc(null)}>
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      <DocumentoModal
        isOpen={modalOpen}
        onClose={closeModal}
        onSaved={loadDocumentos}
        documento={modalDocumento}
        tiposDocumento={tiposDocumento}
        lockEntidade={lockEntidadeForModal}
      />

      <NovaEmpresaModal
        isOpen={empresaModalOpen}
        onClose={() => setEmpresaModalOpen(false)}
        onCreated={async ({ id, label }) => {
          await loadEmpresas();

          skipScopeResetRef.current = true;
          setScope('empresa');
          setSelectedEntidadeId(id);
          setSelectedEntidadeNome(label);
          setPinSelectedToTop(true);

          setFilter('todos');
          setSearch('');
          setTipoFilter('todos');
          setValidadeMes('');
          setSelectedDoc(null);
        }}
      />

      <EditEmpresaModal
        isOpen={editEmpresaOpen}
        empresa={editEmpresaTarget}
        onClose={() => {
          setEditEmpresaOpen(false);
          setEditEmpresaTarget(null);
        }}
        onSaved={async () => {
          await loadEmpresas();
        }}
      />
    </div>
  );
}