import { Search, User, ChevronRight, Plus, Filter, CalendarDays, Clock, UploadCloud, ExternalLink, Edit3, Paperclip } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

import type {
  ColaboradorRow,
  Documento,
  EntityDocStats,
  StatusFilter,
} from './documentos.types';

import {
  cardBase,
  emptyStats,
  formatDatePT,
  getDocumentoStatus,
  getStatusConfig,
  normalize,
  pinSelectedFirst,
  scopeLabel,
  severityRank,
  urgencyLabel,
} from './documentos.helpers';

function SmartImage({
  value,
  alt,
  className,
  fallback,
}: {
  value: string | null | undefined;
  alt: string;
  className?: string;
  fallback: React.ReactNode;
}) {
  if (!value) return <>{fallback}</>;
  return <img src={value} alt={alt} className={className} />;
}

export function DocumentosColaboradores(props: {
  colaboradores: ColaboradorRow[];
  documentos: Documento[];
  selectedEntidadeId: string;
  selectedEntidadeNome: string;
  entitySearch: string;
  setEntitySearch: (v: string) => void;
  setSelectedEntidadeId: (v: string) => void;
  setSelectedEntidadeNome: (v: string) => void;
  setSelectedDoc: (doc: Documento | null) => void;
  filter: StatusFilter;
  setFilter: (v: StatusFilter) => void;
  search: string;
  setSearch: (v: string) => void;
  tipoFilter: string;
  setTipoFilter: (v: string) => void;
  validadeMes: string;
  setValidadeMes: (v: string) => void;
  tiposOptions: string[];
  filteredDocumentos: Documento[];
  stats: {
    semDocumento: number;
    vencidos: number;
    aVencer: number;
    validos: number;
    semValidade: number;
    total: number;
  };
  colabStats: Map<string, EntityDocStats>;
  pinSelectedToTop: boolean;
  setPinSelectedToTop: (v: boolean) => void;
  onOpenNew: () => void;
  onOpenEdit: (doc: Documento) => void;
  onOpenArquivo: (url: string) => void;
  onRefreshAll: () => Promise<void>;
  onOpenDocDrawer: (doc: Documento) => void;
}) {
  const {
    colaboradores,
    selectedEntidadeId,
    entitySearch,
    setEntitySearch,
    setSelectedEntidadeId,
    setSelectedEntidadeNome,
    setSelectedDoc,
    filter,
    setFilter,
    search,
    setSearch,
    tipoFilter,
    setTipoFilter,
    validadeMes,
    setValidadeMes,
    tiposOptions,
    filteredDocumentos,
    stats,
    colabStats,
    pinSelectedToTop,
    setPinSelectedToTop,
    onOpenNew,
    onOpenEdit,
    onOpenArquivo,
    onRefreshAll,
    onOpenDocDrawer,
  } = props;

  const filteredEntities = (() => {
    const s = normalize(entitySearch);
    if (!s) return colaboradores;

    return colaboradores.filter((c) => {
      const hay = [c.nome_completo, c.email || '', c.telefone || '', c.categoria || '', c.status || '']
        .join(' ')
        .toLowerCase();
      return hay.includes(s);
    });
  })();

  const sortedEntities = (() => {
    const searching = normalize(entitySearch).length > 0;
    let rows = [...filteredEntities];

    rows.sort((a, b) => {
      const sa = colabStats.get(a.id) || emptyStats();
      const sb = colabStats.get(b.id) || emptyStats();
      const ra = severityRank(sa);
      const rb = severityRank(sb);
      if (ra !== rb) return ra - rb;
      return a.nome_completo.localeCompare(b.nome_completo);
    });

    if (!searching && pinSelectedToTop && selectedEntidadeId) {
      rows = pinSelectedFirst(rows, selectedEntidadeId);
    }

    return rows;
  })();

  const selectedLabel =
    colaboradores.find((x) => x.id === selectedEntidadeId)?.nome_completo || '';

  const StatusTab = ({ id, label, count }: { id: StatusFilter; label: string; count: number }) => {
    const active = filter === id;
    return (
      <button
        onClick={() => setFilter(id)}
        className={[
          'inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition',
          active
            ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
            : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950/40',
        ].join(' ')}
      >
        {label}
        <span
          className={[
            'px-2 py-0.5 rounded-full text-xs',
            active
              ? 'bg-white/15 text-white dark:bg-slate-900/10 dark:text-slate-900'
              : 'bg-slate-100 text-slate-700 dark:bg-slate-900/50 dark:text-slate-200',
          ].join(' ')}
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-4">
      <Card className={`p-5 ${cardBase}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Colaboradores ({sortedEntities.length})
          </div>
        </div>

        <div className="mt-3 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
          <input
            value={entitySearch}
            onChange={(e) => setEntitySearch(e.target.value)}
            placeholder="Pesquisar colaborador…"
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                       focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>

        <div className="mt-4 space-y-2 max-h-[620px] overflow-y-auto pr-1">
          {sortedEntities.map((c) => {
            const st = colabStats.get(c.id) || emptyStats();
            const active = selectedEntidadeId === c.id;

            const cardCls = active
              ? [
                  'border-[#0B4F8A]/35 bg-[#0B4F8A]/[0.06] ring-1 ring-[#0B4F8A]/20',
                  'dark:border-[#0B4F8A]/35 dark:bg-[#0B4F8A]/10 dark:ring-[#0B4F8A]/25',
                ].join(' ')
              : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950/40';

            return (
              <button
                key={c.id}
                onClick={() => {
                  setPinSelectedToTop(false);
                  setSelectedEntidadeId(c.id);
                  setSelectedEntidadeNome(c.nome_completo);
                  setFilter('todos');
                  setSearch('');
                  setTipoFilter('todos');
                  setValidadeMes('');
                  setSelectedDoc(null);
                }}
                className={[
                  'w-full text-left p-3 rounded-2xl border transition flex items-center gap-3',
                  'focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]/25',
                  cardCls,
                ].join(' ')}
                title="Selecionar colaborador"
              >
                <div className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-center overflow-hidden">
                  <SmartImage
                    value={c.foto_url}
                    alt={c.nome_completo}
                    className="h-full w-full object-cover"
                    fallback={<User size={18} className="text-slate-600 dark:text-slate-300" />}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate text-slate-900 dark:text-slate-100">
                    {c.nome_completo}
                  </div>
                  <div className="text-xs mt-0.5 truncate text-slate-500 dark:text-slate-400">
                    {c.categoria || '—'} {c.status ? `• ${c.status}` : ''}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {st.vencido > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold border border-red-200 bg-red-50 text-red-700 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-200">
                        Vencidos: {st.vencido}
                      </span>
                    )}
                    {st.a_vencer > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold border border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-200">
                        A vencer: {st.a_vencer}
                      </span>
                    )}
                    {st.sem_documento > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold border border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-200">
                        Sem ficheiro: {st.sem_documento}
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight size={18} className={active ? 'text-[#0B4F8A]' : 'text-slate-400 dark:text-slate-500'} />
              </button>
            );
          })}

          {sortedEntities.length === 0 && (
            <div className="text-center py-10 text-slate-500 dark:text-slate-400">
              Nenhum colaborador encontrado.
            </div>
          )}
        </div>
      </Card>

      <Card className={`p-5 ${cardBase}`}>
        <div className="flex flex-col xl:flex-row gap-4 xl:items-center xl:justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Documentos do colaborador
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {selectedEntidadeId ? (
                <>
                  Selecionado: <span className="font-semibold">{selectedLabel || selectedEntidadeId}</span>
                </>
              ) : (
                'Selecione um colaborador na lista ao lado para carregar os documentos.'
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <Button variant="secondary" onClick={onRefreshAll} disabled={!selectedEntidadeId}>
              Atualizar
            </Button>
          </div>
        </div>

        {selectedEntidadeId && (
          <>
            <div className="mt-4 flex flex-col xl:flex-row gap-4 xl:items-center xl:justify-between">
              <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
                <div className="relative w-full lg:w-[420px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
                  <input
                    type="text"
                    placeholder={`Pesquisar em ${scopeLabel('colaborador').toLowerCase()}… (nome, tipo, validade, ficheiro)`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                       focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>

                <div className="flex items-center flex-wrap gap-2">
                  <Filter size={18} className="text-slate-400 dark:text-slate-500" />

                  <select
                    value={tipoFilter}
                    onChange={(e) => setTipoFilter(e.target.value)}
                    className="px-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                       focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent min-w-[210px] dark:text-slate-100"
                  >
                    <option value="todos">Todos os tipos</option>
                    {tiposOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-2">
                    <CalendarDays size={18} className="text-slate-400 dark:text-slate-500" />
                    <input
                      type="month"
                      value={validadeMes}
                      onChange={(e) => setValidadeMes(e.target.value)}
                      className="px-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                         focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent min-w-[170px] dark:text-slate-100"
                      title="Filtrar por mês de validade"
                    />
                  </div>

                  {(tipoFilter !== 'todos' || search.trim() || validadeMes) && (
                    <button
                      onClick={() => {
                        setTipoFilter('todos');
                        setSearch('');
                        setValidadeMes('');
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-sm
                         hover:bg-slate-50 dark:hover:bg-slate-950/40 text-slate-700 dark:text-slate-200"
                      title="Limpar filtros"
                    >
                      <Filter size={16} />
                      Limpar
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end">
                <Button onClick={onOpenNew}>
                  <Plus size={16} className="mr-2" />
                  Novo Documento
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <StatusTab id="todos" label="Todos" count={stats.total} />
              <StatusTab id="sem_documento" label="Sem documento" count={stats.semDocumento} />
              <StatusTab id="vencido" label="Vencidos" count={stats.vencidos} />
              <StatusTab id="a_vencer" label="A vencer" count={stats.aVencer} />
              <StatusTab id="valido" label="Válidos" count={stats.validos} />
              <StatusTab id="sem_validade" label="Sem validade" count={stats.semValidade} />
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800/70">
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Documento
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Tipo
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Validade
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
                  {filteredDocumentos.map((doc) => {
                    const st = getDocumentoStatus(doc);
                    const cfg = getStatusConfig(st);
                    const Icon = cfg.icon;
                    const urg = urgencyLabel(doc);

                    const urgCls =
                      urg.tone === 'danger'
                        ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/20'
                        : urg.tone === 'warning'
                        ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/20'
                        : urg.tone === 'ok'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/20'
                        : 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-200 dark:border-slate-800';

                    const rowStripe =
                      st === 'sem_documento'
                        ? 'before:bg-amber-500'
                        : st === 'vencido'
                        ? 'before:bg-red-500'
                        : st === 'a_vencer'
                        ? 'before:bg-amber-500'
                        : st === 'valido'
                        ? 'before:bg-emerald-500'
                        : 'before:bg-slate-300';

                    const tipoNome = doc.tipos_documento?.nome || doc.tipo || '—';

                    return (
                      <tr
                        key={doc.id}
                        className={[
                          'hover:bg-slate-50 dark:hover:bg-slate-950/40 cursor-pointer relative',
                          'before:content-[""] before:absolute before:left-0 before:top-0 before:h-full before:w-1',
                          rowStripe,
                        ].join(' ')}
                        onClick={() => onOpenDocDrawer(doc)}
                        title="Abrir detalhes"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-start gap-3">
                            <div
                              className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-center"
                              style={{ boxShadow: '0 6px 20px rgba(2, 6, 23, 0.06)' }}
                            >
                              <Paperclip size={18} className="text-slate-600 dark:text-slate-300" />
                            </div>

                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {doc.nome || '—'}
                              </div>

                              <div className="mt-2 flex flex-wrap gap-2">
                                <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-semibold ${urgCls}`}>
                                  <Clock size={14} />
                                  {urg.text}
                                </span>

                                {doc.arquivo_url ? (
                                  <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-semibold bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-200 dark:border-slate-800">
                                    <Paperclip size={14} />
                                    Com ficheiro
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-semibold bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/20">
                                    <UploadCloud size={14} />
                                    Falta ficheiro
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4 text-sm text-slate-700 dark:text-slate-300">{tipoNome}</td>

                        <td className="py-3 px-4">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <CalendarDays size={14} className="text-slate-400 dark:text-slate-500" />
                            {doc.data_validade ? formatDatePT(doc.data_validade) : 'Sem validade'}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <Badge variant={cfg.variant}>
                            <Icon size={12} className="mr-1" />
                            {cfg.label}
                          </Badge>
                        </td>

                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1">
                            {doc.arquivo_url ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onOpenArquivo(String(doc.arquivo_url))}
                                title="Abrir ficheiro"
                              >
                                <ExternalLink size={16} />
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" onClick={() => onOpenDocDrawer(doc)} title="Subir ficheiro">
                                <UploadCloud size={16} />
                              </Button>
                            )}

                            <Button variant="ghost" size="sm" onClick={() => onOpenDocDrawer(doc)} title="Ver">
                              Ver
                            </Button>

                            <Button variant="ghost" size="sm" onClick={() => onOpenEdit(doc)} title="Editar">
                              <Edit3 size={16} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredDocumentos.length === 0 && (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                  Nenhum documento encontrado para este colaborador.
                </div>
              )}
            </div>
          </>
        )}

        {!selectedEntidadeId && (
          <div className="mt-10 text-center text-slate-500 dark:text-slate-400">
            Selecione um colaborador na lista ao lado para ver os documentos.
          </div>
        )}
      </Card>
    </div>
  );
}