// C:\Users\gabri\Desktop\Projetos Bolt\plataforma-diametro\project\src\components\documentos\ColaboradorDocsDrawer.tsx
import { useMemo, useRef, useState } from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import {
  X,
  FileText,
  UploadCloud,
  ExternalLink,
  Edit3,
  CalendarDays,
  AlertTriangle,
  Clock,
  CheckCircle,
  Paperclip,
  User,
  Phone,
  Mail,
  Hash,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type DocStatus = 'sem_documento' | 'vencido' | 'a_vencer' | 'valido' | 'sem_validade';

export interface Documento {
  id: string;
  entidade_tipo: string;
  entidade_id: string;
  entidade_nome: string | null;

  nome: string | null;
  tipo: string | null;

  arquivo_url: string | null;
  data_validade: string | null;

  tipo_documento_id: string | null;
  tipos_documento: { nome: string } | null;
}

export interface ColaboradorLite {
  id: string;
  nome_completo: string;
  foto_url: string | null;
  telefone?: string | null;
  email?: string | null;
  categoria?: string | null;
  status?: string | null;
}

const STORAGE_BUCKET = 'documentos';

const cardBase =
  'border border-slate-200 bg-white shadow-sm ' +
  'dark:border-slate-800/70 dark:bg-slate-950/30 dark:shadow-black/30';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayDiff(a: Date, b: Date) {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function formatDatePT(date?: string | null) {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-PT');
}

function safeFileExt(name: string) {
  const n = String(name || '');
  const i = n.lastIndexOf('.');
  if (i === -1) return '';
  const ext = n.slice(i + 1).toLowerCase();
  return ext.replace(/[^a-z0-9]/g, '').slice(0, 8);
}

function buildStoragePath(docId: string, fileName: string, entidadeTipo: string) {
  const ext = safeFileExt(fileName);
  const base = `documentos/${String(entidadeTipo || 'geral')}/${docId}`;
  return ext ? `${base}.${ext}` : base;
}

async function uploadToStorage(path: string, file: File) {
  const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    upsert: true,
    cacheControl: '3600',
    contentType: file.type || 'application/octet-stream',
  });
  if (upErr) throw upErr;
  return path;
}

function isHttpUrl(v: string) {
  return /^https?:\/\//i.test(v);
}

async function openArquivo(arquivoUrlOrPath: string) {
  const v = String(arquivoUrlOrPath || '').trim();
  if (!v) return;

  if (isHttpUrl(v)) {
    window.open(v, '_blank');
    return;
  }

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(v, 60 * 10);
  if (error) {
    console.error('Erro signed url:', error);
    alert('Não foi possível abrir o ficheiro (signed URL). Verifica permissões do bucket/policy.');
    return;
  }
  if (data?.signedUrl) window.open(data.signedUrl, '_blank');
}

function getDocumentoStatus(doc: Documento): DocStatus {
  if (!doc.arquivo_url) return 'sem_documento';
  if (!doc.data_validade) return 'sem_validade';

  const hoje = startOfDay(new Date());
  const validade = startOfDay(new Date(doc.data_validade));
  const em30Dias = startOfDay(new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000));

  if (validade < hoje) return 'vencido';
  if (validade <= em30Dias) return 'a_vencer';
  return 'valido';
}

function getStatusConfig(status: DocStatus) {
  const cfg = {
    sem_documento: { variant: 'warning', icon: UploadCloud, label: 'Sem documento' },
    vencido: { variant: 'danger', icon: AlertTriangle, label: 'Vencido' },
    a_vencer: { variant: 'warning', icon: Clock, label: 'A vencer' },
    valido: { variant: 'success', icon: CheckCircle, label: 'Válido' },
    sem_validade: { variant: 'default', icon: FileText, label: 'Sem validade' },
  } as const;

  return cfg[status];
}

function urgencyLabel(doc: Documento) {
  if (!doc.arquivo_url) return { text: 'Sem ficheiro', tone: 'warning' as const };
  if (!doc.data_validade) return { text: 'Sem prazo', tone: 'neutral' as const };

  const hoje = startOfDay(new Date());
  const validade = startOfDay(new Date(doc.data_validade));
  const d = dayDiff(hoje, validade);

  if (d < 0) return { text: `Atrasado ${Math.abs(d)}d`, tone: 'danger' as const };
  if (d === 0) return { text: 'Vence hoje', tone: 'warning' as const };
  if (d <= 30) return { text: `Vence em ${d}d`, tone: 'warning' as const };
  return { text: `Em ${d}d`, tone: 'ok' as const };
}

function resumoDocs(docs: Documento[]) {
  const acc = { total: docs.length, sem_documento: 0, vencido: 0, a_vencer: 0, valido: 0, sem_validade: 0 };
  for (const d of docs) acc[getDocumentoStatus(d)]++;
  return acc;
}

export function ColaboradorDocsDrawer(props: {
  isOpen: boolean;
  onClose: () => void;

  colaborador: ColaboradorLite | null;

  documentos: Documento[];
  onRefresh: () => Promise<void>;

  onNovoDocumento: () => void;
  onEditarDocumento: (doc: Documento) => void;
}) {
  const { isOpen, onClose, colaborador, documentos, onRefresh, onNovoDocumento, onEditarDocumento } = props;

  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [pickedDoc, setPickedDoc] = useState<Documento | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resumo = useMemo(() => resumoDocs(documentos), [documentos]);

  const pickFileFor = (doc: Documento) => {
    setPickedDoc(doc);
    if (fileInputRef.current) fileInputRef.current.value = '';
    fileInputRef.current?.click();
  };

  const onFilePicked = async (file: File | null) => {
    if (!file || !pickedDoc) return;

    setUploadingDocId(pickedDoc.id);
    try {
      const entidadeTipo = String(pickedDoc.entidade_tipo || 'colaborador');
      const path = buildStoragePath(pickedDoc.id, file.name, entidadeTipo);
      const storedPath = await uploadToStorage(path, file);

      const { error } = await supabase.from('documentos').update({ arquivo_url: storedPath }).eq('id', pickedDoc.id);
      if (error) throw error;

      await onRefresh();
    } catch (e) {
      console.error('Upload erro:', e);
      alert('Falha ao enviar ficheiro. Verifica policies do bucket/tabela e permissões do utilizador.');
    } finally {
      setUploadingDocId(null);
      setPickedDoc(null);
    }
  };

  if (!isOpen || !colaborador) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full sm:w-[640px] bg-white dark:bg-slate-950 z-50 border-l border-slate-200 dark:border-slate-800 shadow-xl">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="min-w-0 w-full">
            <div className="text-xs text-slate-500 dark:text-slate-400">Documentos do colaborador</div>

            <div className="mt-2 flex items-center gap-3 min-w-0">
              <div className="h-12 w-12 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-900/30 flex items-center justify-center">
                {colaborador.foto_url ? (
                  <img src={colaborador.foto_url} alt={colaborador.nome_completo} className="h-full w-full object-cover" />
                ) : (
                  <User className="text-slate-500" size={22} />
                )}
              </div>

              <div className="min-w-0">
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {colaborador.nome_completo}
                </div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-3">
                  {colaborador.categoria ? <span>{colaborador.categoria}</span> : null}
                  {colaborador.status ? <span className="capitalize">{colaborador.status}</span> : null}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                  {colaborador.telefone ? (
                    <span className="inline-flex items-center gap-2">
                      <Phone size={14} className="text-slate-400" />
                      {colaborador.telefone}
                    </span>
                  ) : null}
                  {colaborador.email ? (
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <Mail size={14} className="text-slate-400" />
                      <span className="truncate max-w-[320px]">{colaborador.email}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <button
            className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-950/40"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto h-[calc(100%-88px)]">
          {/* Resumo */}
          <Card className={`p-4 ${cardBase}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Resumo</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {resumo.total} documento(s) associado(s) a este colaborador
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={onRefresh}>
                  Atualizar
                </Button>
                <Button onClick={onNovoDocumento}>
                  <FileText size={16} className="mr-2" />
                  Novo documento
                </Button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/20">
                <UploadCloud size={14} /> Sem ficheiro: {resumo.sem_documento}
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/20">
                <AlertTriangle size={14} /> Vencidos: {resumo.vencido}
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/20">
                <Clock size={14} /> A vencer: {resumo.a_vencer}
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:border-emerald-500/20">
                <CheckCircle size={14} /> Válidos: {resumo.valido}
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-200 dark:border-slate-800">
                <FileText size={14} /> Sem validade: {resumo.sem_validade}
              </span>
            </div>
          </Card>

          {/* Lista */}
          <Card className={`p-4 ${cardBase}`}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Documentos</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-2">
                <Hash size={14} className="text-slate-400 dark:text-slate-500" />
                {colaborador.id}
              </div>
            </div>

            {documentos.length === 0 ? (
              <div className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                Nenhum documento criado/associado a este colaborador ainda.
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {documentos.map((doc) => {
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

                  const tipoNome = doc.tipos_documento?.nome || doc.tipo || '—';

                  return (
                    <div
                      key={doc.id}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950/40 transition"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {doc.nome || '—'}
                          </div>

                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-3">
                            <span className="inline-flex items-center gap-2">
                              <FileText size={14} className="text-slate-400" />
                              {tipoNome}
                            </span>

                            <span className="inline-flex items-center gap-2">
                              <CalendarDays size={14} className="text-slate-400" />
                              {doc.data_validade ? formatDatePT(doc.data_validade) : 'Sem validade'}
                            </span>

                            {doc.arquivo_url ? (
                              <span className="inline-flex items-center gap-2">
                                <Paperclip size={14} className="text-slate-400" />
                                Com ficheiro
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-2 text-amber-700 dark:text-amber-200">
                                <UploadCloud size={14} />
                                Falta ficheiro
                              </span>
                            )}
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Badge variant={cfg.variant}>
                              <Icon size={12} className="mr-1" />
                              {cfg.label}
                            </Badge>

                            <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-semibold ${urgCls}`}>
                              <Clock size={14} />
                              {urg.text}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {doc.arquivo_url ? (
                            <Button variant="secondary" onClick={() => openArquivo(String(doc.arquivo_url))} title="Abrir ficheiro">
                              <ExternalLink size={16} className="mr-2" />
                              Abrir
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              onClick={() => pickFileFor(doc)}
                              disabled={uploadingDocId === doc.id}
                              title="Enviar ficheiro"
                            >
                              <UploadCloud size={16} className="mr-2" />
                              {uploadingDocId === doc.id ? 'A enviar…' : 'Enviar'}
                            </Button>
                          )}

                          <Button
                            variant="secondary"
                            onClick={() => pickFileFor(doc)}
                            disabled={uploadingDocId === doc.id}
                            title={doc.arquivo_url ? 'Substituir ficheiro' : 'Enviar ficheiro'}
                          >
                            <UploadCloud size={16} className="mr-2" />
                            {doc.arquivo_url ? 'Substituir' : 'Enviar'}
                          </Button>

                          <Button onClick={() => onEditarDocumento(doc)} title="Editar metadados">
                            <Edit3 size={16} className="mr-2" />
                            Editar
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => onFilePicked(e.target.files?.[0] || null)}
          />
        </div>
      </div>
    </>
  );
}
