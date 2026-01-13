// src/pages/Documentos.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import {
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  Plus,
  Search,
  Filter,
  X,
  CalendarDays,
  Building2,
  Users,
  ExternalLink,
  Edit3,
  Copy,
  UploadCloud,
  Paperclip,
  Trash2,
  Hash,
  User,
  ChevronRight,
  Image as ImageIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type Scope = 'todos' | 'colaborador' | 'empresa';
type StatusFilter = 'todos' | 'sem_documento' | 'vencido' | 'a_vencer' | 'valido' | 'sem_validade';
type DocStatus = 'sem_documento' | 'vencido' | 'a_vencer' | 'valido' | 'sem_validade';
type EntidadeTipo = 'colaborador' | 'empresa';

export type DocumentosInitialSelection = {
  scope: Exclude<Scope, 'todos'>; // 'colaborador' | 'empresa'
  entidadeId: string;
  entidadeNome?: string | null;
};

interface Documento {
  id: string;
  entidade_tipo: string; // text NOT NULL
  entidade_id: string; // uuid NOT NULL
  entidade_nome: string | null;

  nome: string | null;
  tipo: string | null;

  arquivo_url: string | null; // text (URL pública OU path do storage)
  data_validade: string | null; // date

  tipo_documento_id: string | null;

  tipos_documento: { nome: string } | null; // embed
}

interface TipoDocumento {
  id: string;
  nome: string;
}

interface ColaboradorRow {
  id: string;
  nome_completo: string;
  email: string | null;
  telefone: string | null;
  status: string | null;
  categoria: string | null;
  foto_url: string | null;
}

interface EmpresaRow {
  id: string;
  nome?: string | null;
  razao_social?: string | null;
  logo_url?: string | null; // pode ser URL http(s) OU path do storage
}

const BRAND = { blue: '#0B4F8A', orange: '#F5A623' };
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

function normalize(s: unknown) {
  return String(s ?? '').trim().toLowerCase();
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

function scopeLabel(scope: Scope) {
  if (scope === 'colaborador') return 'Colaboradores';
  if (scope === 'empresa') return 'Empresa';
  return 'Todos';
}

function asEntidadeNice(entidade: string | null | undefined) {
  const e = String(entidade || '').toLowerCase();
  if (e === 'colaborador') return 'colaborador';
  if (e === 'empresa') return 'empresa';
  return entidade || '—';
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

function buildEmpresaLogoPath(empresaId: string, fileName: string) {
  const ext = safeFileExt(fileName) || 'png';
  return `empresas/logos/${empresaId}.${ext}`;
}

async function uploadToStorage(path: string, file: File) {
  const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    upsert: true,
    cacheControl: '3600',
    contentType: file.type || 'application/octet-stream',
  });
  if (upErr) throw upErr;
  return path; // guardamos o PATH no banco
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

/**
 * Componente simples que aceita URL http(s) OU path do storage e resolve para imagem.
 * Cache local por instância (bom para logos privados via signed URL).
 */
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
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const v = String(value || '').trim();

    (async () => {
      if (!v) {
        if (alive) setSrc(null);
        return;
      }
      if (isHttpUrl(v)) {
        if (alive) setSrc(v);
        return;
      }
      // storage path -> signed url
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(v, 60 * 60);
      if (!alive) return;
      if (error) {
        console.warn('SmartImage signed url erro:', error);
        setSrc(null);
        return;
      }
      setSrc(data?.signedUrl || null);
    })();

    return () => {
      alive = false;
    };
  }, [value]);

  if (!src) return <>{fallback}</>;

  return <img src={src} alt={alt} className={className} />;
}

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

type EntityDocStats = {
  total: number;
  sem_documento: number;
  vencido: number;
  a_vencer: number;
  valido: number;
  sem_validade: number;
};

function emptyStats(): EntityDocStats {
  return { total: 0, sem_documento: 0, vencido: 0, a_vencer: 0, valido: 0, sem_validade: 0 };
}

function buildStatsByEntidade(docs: Documento[], entidadeTipo: EntidadeTipo) {
  const map = new Map<string, EntityDocStats>();
  for (const d of docs) {
    if (normalize(d.entidade_tipo) !== entidadeTipo) continue;
    const key = String(d.entidade_id);
    if (!map.has(key)) map.set(key, emptyStats());
    const st = getDocumentoStatus(d);
    const s = map.get(key)!;
    s.total += 1;
    (s as any)[st] += 1;
  }
  return map;
}

function severityRank(st: EntityDocStats) {
  if (st.vencido > 0) return 0;
  if (st.sem_documento > 0) return 1;
  if (st.a_vencer > 0) return 2;
  if (st.sem_validade > 0) return 3;
  return 4;
}

/** Modal simples para criar empresa (insert em `empresas`). */
function NovaEmpresaModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (row: { id: string; label: string }) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState('');
  const [razao, setRazao] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSaving(false);
    setNome('');
    setRazao('');
  }, [isOpen]);

  const canSave = useMemo(() => {
    return String(nome || '').trim().length >= 2 || String(razao || '').trim().length >= 2;
  }, [nome, razao]);

  const save = async () => {
    if (!canSave) return;

    setSaving(true);
    try {
      const payload: any = {
        nome: nome.trim() ? nome.trim() : null,
        razao_social: razao.trim() ? razao.trim() : null,
      };

      const { data, error } = await supabase
        .from('empresas')
        .insert(payload)
        .select('id, nome, razao_social')
        .single();

      if (error) throw error;

      const id = String((data as any)?.id || '');
      const label = String((data as any)?.nome || (data as any)?.razao_social || id);

      onCreated({ id, label });
      onClose();
    } catch (e: any) {
      console.error('Erro ao criar empresa:', e);
      alert(
        'Não foi possível criar a empresa.\n\n' +
          (e?.message || 'Erro desconhecido') +
          (e?.details ? `\n\ndetails: ${e.details}` : '') +
          (e?.hint ? `\n\nhint: ${e.hint}` : '')
      );
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-[640px] bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Empresa</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                Criar nova empresa
              </div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Preenche pelo menos um dos campos (Nome ou Razão Social).
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

          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                Nome (fantasia)
              </label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder='Ex: "Diâmetro"'
                className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                           focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                Razão social
              </label>
              <input
                value={razao}
                onChange={(e) => setRazao(e.target.value)}
                placeholder='Ex: "Diâmetro Canalizações Lda"'
                className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                           focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>

            <div className="pt-1 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={!canSave || saving}>
                {saving ? 'A criar…' : 'Criar empresa'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** Modal para editar empresa + trocar/remover logo */
function EditEmpresaModal({
  isOpen,
  empresa,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  empresa: EmpresaRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState('');
  const [razao, setRazao] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen || !empresa) return;
    setSaving(false);
    setNome(String(empresa.nome || ''));
    setRazao(String(empresa.razao_social || ''));
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  }, [isOpen, empresa?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !empresa) return null;

  const save = async () => {
    setSaving(true);
    try {
      const payload: any = {
        nome: nome.trim() ? nome.trim() : null,
        razao_social: razao.trim() ? razao.trim() : null,
      };

      // 1) Update texto
      const { error: upErr } = await supabase.from('empresas').update(payload).eq('id', empresa.id);
      if (upErr) throw upErr;

      // 2) Upload logo (opcional)
      if (file) {
        const path = buildEmpresaLogoPath(empresa.id, file.name);
        const storedPath = await uploadToStorage(path, file);

        const { error: logoErr } = await supabase
          .from('empresas')
          .update({ logo_url: storedPath })
          .eq('id', empresa.id);

        if (logoErr) throw logoErr;
      }

      await onSaved();
      onClose();
    } catch (e: any) {
      console.error('Erro ao editar empresa:', e);
      alert('Não foi possível salvar a empresa.\n\n' + (e?.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  const removeLogo = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('empresas').update({ logo_url: null }).eq('id', empresa.id);
      if (error) throw error;
      await onSaved();
      onClose();
    } catch (e: any) {
      console.error('Erro ao remover logo:', e);
      alert('Não foi possível remover o logo.\n\n' + (e?.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-[720px] bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-slate-500 dark:text-slate-400">Empresa</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
                Editar: {String(empresa.nome || empresa.razao_social || empresa.id)}
              </div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Atualize os dados e troque o logo se necessário.
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

          <div className="p-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                  Nome (fantasia)
                </label>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                             focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
                  placeholder='Ex: "Diâmetro"'
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                  Razão social
                </label>
                <input
                  value={razao}
                  onChange={(e) => setRazao(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                             focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
                  placeholder='Ex: "Diâmetro Canalizações Lda"'
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <ImageIcon size={16} />
                    Logo da empresa
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Aceita PNG/JPG. O valor gravado em banco será o <span className="font-semibold">path</span> no storage.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {empresa.logo_url && (
                    <Button variant="secondary" onClick={removeLogo} disabled={saving}>
                      <Trash2 size={16} className="mr-2" />
                      Remover logo
                    </Button>
                  )}

                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition
                               bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950/40 disabled:opacity-60"
                    disabled={saving}
                  >
                    <UploadCloud size={16} />
                    Selecionar
                  </button>

                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <div className="h-14 w-14 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-center overflow-hidden">
                  {file ? (
                    <img src={URL.createObjectURL(file)} alt="Pré-visualização" className="h-full w-full object-cover" />
                  ) : (
                    <SmartImage
                      value={empresa.logo_url}
                      alt="Logo"
                      className="h-full w-full object-cover"
                      fallback={<Building2 size={20} className="text-slate-600 dark:text-slate-300" />}
                    />
                  )}
                </div>

                <div className="min-w-0">
                  {file ? (
                    <div className="text-sm text-slate-800 dark:text-slate-100">
                      <span className="font-semibold">Selecionado:</span> {file.name}{' '}
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        ({Math.round(file.size / 1024)} KB)
                      </span>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      Nenhuma alteração de logo selecionada.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-1 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? 'A guardar…' : 'Guardar'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function DocumentoModal({
  isOpen,
  onClose,
  onSuccess,
  initial,
  lockEntidade,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initial?: Partial<Documento> | null;
  lockEntidade?: { tipo: EntidadeTipo; id: string; nome?: string | null } | null;
}) {
  const [saving, setSaving] = useState(false);
  const [tipos, setTipos] = useState<TipoDocumento[]>([]);

  const [entidadeTipo, setEntidadeTipo] = useState<EntidadeTipo>('colaborador');
  const [entidadeId, setEntidadeId] = useState<string>('');
  const [entidadeNome, setEntidadeNome] = useState<string>('');

  const [colabOptions, setColabOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [empresaOptions, setEmpresaOptions] = useState<Array<{ id: string; label: string }>>([]);

  const [tipoDocumentoId, setTipoDocumentoId] = useState<string>('');
  const [nome, setNome] = useState<string>('');
  const [semValidade, setSemValidade] = useState<boolean>(false);
  const [validade, setValidade] = useState<string>('');

  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isEdit = Boolean(initial?.id);

  useEffect(() => {
    if (!isOpen) return;

    (async () => {
      const { data, error } = await supabase.from('tipos_documento').select('id, nome').order('nome');
      if (error) {
        console.error('Erro ao carregar tipos_documento:', error);
        setTipos([]);
      } else {
        setTipos((data || []) as TipoDocumento[]);
      }

      const col = await supabase.from('colaboradores').select('id, nome_completo').limit(500);
      if (!col.error) {
        setColabOptions(((col.data || []) as any[]).map((c) => ({ id: c.id, label: c.nome_completo })));
      } else {
        setColabOptions([]);
      }

      const emp = await supabase.from('empresas').select('id, nome, razao_social').limit(200);
      if (!emp.error) {
        setEmpresaOptions(
          ((emp.data || []) as any[]).map((e) => ({
            id: e.id,
            label: String(e.nome || e.razao_social || e.id),
          }))
        );
      } else {
        setEmpresaOptions([]);
      }
    })();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (lockEntidade?.id && lockEntidade?.tipo) {
      setEntidadeTipo(lockEntidade.tipo);
      setEntidadeId(lockEntidade.id);
      setEntidadeNome(String(lockEntidade.nome || ''));
    } else {
      const it = String(initial?.entidade_tipo || 'colaborador').toLowerCase();
      setEntidadeTipo(it === 'empresa' ? 'empresa' : 'colaborador');
      setEntidadeId(String((initial as any)?.entidade_id || '') || '');
      setEntidadeNome(String((initial as any)?.entidade_nome || '') || '');
    }

    setTipoDocumentoId(String((initial as any)?.tipo_documento_id || '') || '');
    setNome(String(initial?.nome || '') || '');

    if (initial?.data_validade) {
      setSemValidade(false);
      setValidade(String(initial.data_validade).slice(0, 10));
    } else {
      setSemValidade(true);
      setValidade('');
    }

    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [isOpen, initial, lockEntidade]);

  const canSave = useMemo(() => {
    const id = entidadeId.trim();
    const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!uuidOk) return false;
    if (!nome.trim()) return false;
    if (!semValidade && !validade) return false;
    return true;
  }, [entidadeId, nome, semValidade, validade]);

  const save = async () => {
    setSaving(true);

    const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entidadeId.trim());
    if (!uuidOk) {
      setSaving(false);
      alert('Entidade ID inválido. Precisa ser um UUID (ex: 00000000-0000-0000-0000-000000000000).');
      return;
    }

    const payload: any = {
      entidade_tipo: entidadeTipo,
      entidade_id: entidadeId.trim(),
      entidade_nome: entidadeNome.trim() ? entidadeNome.trim() : null,
      nome: nome.trim(),
      data_validade: semValidade ? null : validade || null,
      tipo_documento_id: tipoDocumentoId || null,
    };

    const describe = (e: any) => {
      const msg = e?.message || String(e);
      const code = e?.code ? `\ncode: ${e.code}` : '';
      const details = e?.details ? `\ndetails: ${e.details}` : '';
      const hint = e?.hint ? `\nhint: ${e.hint}` : '';
      const status = e?.status ? `\nstatus: ${e.status}` : '';
      return `${msg}${status}${code}${details}${hint}`;
    };

    try {
      let docId = String(initial?.id || '');

      if (isEdit && initial?.id) {
        const { error } = await supabase.from('documentos').update(payload).eq('id', initial.id);
        if (error) throw error;
        docId = String(initial.id);
      } else {
        const { data, error } = await supabase.from('documentos').insert(payload).select('id').single();
        if (error) throw error;
        docId = String((data as any)?.id || '');
        if (!docId) throw new Error('Insert sem retorno de id.');
      }

      let uploadError: any = null;

      if (file && docId) {
        try {
          const path = buildStoragePath(docId, file.name, entidadeTipo);
          const storedPath = await uploadToStorage(path, file);

          const { error: upErr } = await supabase.from('documentos').update({ arquivo_url: storedPath }).eq('id', docId);
          if (upErr) throw upErr;
        } catch (e) {
          uploadError = e;
          console.error('Upload falhou (mas o documento foi criado/atualizado):', e);
        }
      }

      await onSuccess();
      onClose();

      if (uploadError) {
        alert(
          'Documento criado/atualizado com sucesso, mas o upload do ficheiro falhou.\n' +
            'Você pode anexar depois.\n\n' +
            describe(uploadError)
        );
      }
    } catch (e: any) {
      console.error('Erro ao salvar documento:', e);
      alert('Falha ao salvar metadados do documento.\n\n' + (e?.message || 'Erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const locked = Boolean(lockEntidade?.id);
  const entidadeSelectOptions = entidadeTipo === 'colaborador' ? colabOptions : empresaOptions;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-[760px] bg-white dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{isEdit ? 'Editar documento' : 'Novo documento'}</div>
              <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {isEdit ? 'Atualizar metadados e ficheiro' : 'Adicionar documento (metadados + ficheiro)'}
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

          <div className="p-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Entidade (tipo)</label>
                <select
                  value={entidadeTipo}
                  onChange={(e) => {
                    if (locked) return;
                    const v = (e.target.value as string) === 'empresa' ? 'empresa' : 'colaborador';
                    setEntidadeTipo(v);
                    setEntidadeId('');
                    setEntidadeNome('');
                  }}
                  disabled={locked}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                             focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent disabled:opacity-60"
                >
                  <option value="colaborador">Colaborador</option>
                  <option value="empresa">Empresa</option>
                </select>
                {locked && <div className="mt-1 text-[11px] text-slate-400">Entidade bloqueada pela seleção atual.</div>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Tipo (catálogo)</label>
                <select
                  value={tipoDocumentoId}
                  onChange={(e) => setTipoDocumentoId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                             focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent"
                >
                  <option value="">Selecione (opcional)</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                  Entidade (seleção rápida)
                </label>
                <select
                  value={entidadeId}
                  onChange={(e) => {
                    if (locked) return;
                    const id = e.target.value;
                    setEntidadeId(id);
                    const picked = entidadeSelectOptions.find((x) => x.id === id);
                    if (picked) setEntidadeNome(picked.label);
                  }}
                  disabled={locked}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                             focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent disabled:opacity-60"
                >
                  <option value="">— Selecionar —</option>
                  {entidadeSelectOptions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>

                <div className="mt-1 text-[11px] text-slate-400">
                  Se não aparecer nada, a tabela pode estar vazia/sem acesso; nesse caso preenche manualmente.
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
                  Entidade ID (obrigatório)
                </label>
                <input
                  value={entidadeId}
                  onChange={(e) => {
                    if (locked) return;
                    setEntidadeId(e.target.value);
                  }}
                  disabled={locked}
                  placeholder="uuid (obrigatório)"
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                           focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500 disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Entidade nome (opcional)</label>
              <input
                value={entidadeNome}
                onChange={(e) => setEntidadeNome(e.target.value)}
                placeholder='Ex: "Pedro Costa" / "Diâmetro"'
                className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                           focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Nome do documento</label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder='Ex: "Seguro AT - Pedro Costa"'
                className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                           focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Validade</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={validade}
                  onChange={(e) => setValidade(e.target.value)}
                  disabled={semValidade}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                               focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent disabled:bg-slate-50 dark:disabled:bg-slate-900/40 disabled:text-slate-400 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setSemValidade((v) => !v)}
                  className={[
                    'shrink-0 px-3 py-2.5 rounded-xl border text-sm font-semibold transition',
                    semValidade
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100'
                      : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950/40',
                  ].join(' ')}
                  title="Alternar sem validade"
                >
                  Sem validade
                </button>
              </div>
            </div>

            <div
              className={`p-4 rounded-2xl border ${
                file
                  ? 'border-amber-200 bg-amber-50/40 dark:bg-amber-500/10 dark:border-amber-500/20'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Paperclip size={16} />
                    Ficheiro do documento
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Envie PDF/JPG/PNG. Se não enviar agora, o documento ficará marcado como{' '}
                    <span className="font-semibold">Sem documento</span>.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {file && (
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center hover:bg-white/60 dark:hover:bg-slate-950/40"
                      title="Remover ficheiro selecionado"
                    >
                      <Trash2 size={16} className="text-slate-600 dark:text-slate-300" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition
                               bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950/40"
                  >
                    <UploadCloud size={16} />
                    {isEdit ? 'Substituir' : 'Selecionar'}
                  </button>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />

              <div className="mt-3">
                {file ? (
                  <div className="text-sm text-slate-700 dark:text-slate-200">
                    <span className="font-semibold">Selecionado:</span> {file.name}{' '}
                    <span className="text-xs text-slate-500 dark:text-slate-400">({Math.round(file.size / 1024)} KB)</span>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500 dark:text-slate-400">Nenhum ficheiro selecionado.</div>
                )}
              </div>
            </div>

            <div className="pt-1 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={!canSave || saving}>
                {saving ? 'A guardar…' : isEdit ? 'Guardar alterações' : 'Criar documento'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function Documentos({ initialSelection }: { initialSelection?: DocumentosInitialSelection | null }) {
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);

  const [colaboradores, setColaboradores] = useState<ColaboradorRow[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaRow[]>([]);

  const [scope, setScope] = useState<Scope>('colaborador');

  const [selectedEntidadeId, setSelectedEntidadeId] = useState<string>('');
  const [selectedEntidadeNome, setSelectedEntidadeNome] = useState<string>('');
  const [entitySearch, setEntitySearch] = useState('');

  const [filter, setFilter] = useState<StatusFilter>('todos');
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('todos');
  const [validadeMes, setValidadeMes] = useState<string>('');

  const [selectedDoc, setSelectedDoc] = useState<Documento | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitial, setModalInitial] = useState<Partial<Documento> | null>(null);

  const [drawerFile, setDrawerFile] = useState<File | null>(null);
  const [drawerUploading, setDrawerUploading] = useState(false);
  const drawerFileInputRef = useRef<HTMLInputElement | null>(null);

  // CRÍTICO: pular reset 1x quando o scope mudou por navegação/pré-seleção
  const skipScopeResetRef = useRef(false);

  // Modal criar empresa
  const [empresaModalOpen, setEmpresaModalOpen] = useState(false);

  // Modal editar empresa
  const [editEmpresaOpen, setEditEmpresaOpen] = useState(false);
  const [editEmpresaTarget, setEditEmpresaTarget] = useState<EmpresaRow | null>(null);

  const loadDocumentos = async () => {
    setLoading(true);

    const r1 = await supabase
      .from('documentos')
      .select('*, tipos_documento(nome)')
      .order('data_validade', { ascending: true });

    if (!r1.error) {
      setDocumentos((r1.data || []) as Documento[]);
      setLoading(false);
      return (r1.data || []) as Documento[];
    }

    console.error('Erro ao carregar documentos (com embed):', r1.error);

    const r2 = await supabase.from('documentos').select('*').order('data_validade', { ascending: true });
    if (r2.error) console.error('Erro ao carregar documentos (fallback):', r2.error);

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
      setEmpresas([]);
      return [];
    }
    const rows = (r.data || []) as EmpresaRow[];
    setEmpresas(rows);
    return rows;
  };

  useEffect(() => {
    (async () => {
      await Promise.all([loadDocumentos(), loadColaboradores(), loadEmpresas()]);
    })();
  }, []);

  // FIX: reset de scope, mas com “skip” quando veio de navegação
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
  }, [scope]);

  // FIX: aplicar pré-seleção (Ver documentos)
  useEffect(() => {
    if (!initialSelection?.entidadeId) return;

    skipScopeResetRef.current = true;

    setScope(initialSelection.scope);
    setSelectedEntidadeId(initialSelection.entidadeId);
    setSelectedEntidadeNome(String(initialSelection.entidadeNome || ''));

    setEntitySearch('');
    setFilter('todos');
    setSearch('');
    setTipoFilter('todos');
    setValidadeMes('');
    setSelectedDoc(null);
  }, [initialSelection?.entidadeId, initialSelection?.entidadeNome, initialSelection?.scope]);

  const docsByScope = useMemo(() => {
    if (scope === 'todos') return documentos;
    return documentos.filter((d) => normalize(d.entidade_tipo) === scope);
  }, [documentos, scope]);

  const docsByEntity = useMemo(() => {
    if (scope === 'todos') return docsByScope;
    if (!selectedEntidadeId) return [];
    return docsByScope.filter((d) => String(d.entidade_id) === selectedEntidadeId);
  }, [docsByScope, scope, selectedEntidadeId]);

  const statsBase = useMemo(() => {
    if (scope === 'todos') return docsByScope;
    return selectedEntidadeId ? docsByEntity : docsByScope;
  }, [scope, docsByScope, docsByEntity, selectedEntidadeId]);

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
    return { todos: documentos.length, colaborador: colab, empresa: emp };
  }, [documentos]);

  const tiposOptions = useMemo(() => {
    const set = new Set<string>();
    for (const d of scope === 'todos' ? documentos : docsByScope) {
      const t = d.tipos_documento?.nome?.trim() || d.tipo?.trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [documentos, docsByScope, scope]);

  const filteredDocumentos = useMemo(() => {
    const base =
      scope === 'todos'
        ? docsByScope
        : selectedEntidadeId
        ? docsByEntity
        : [];

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

    const priority = (st: DocStatus) => {
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
  }, [docsByScope, docsByEntity, scope, selectedEntidadeId, filter, search, tipoFilter, validadeMes]);

  const exportCSV = () => {
    const base = filteredDocumentos;

    const header = [
      'Documento',
      'Tipo',
      'Entidade',
      'Entidade Nome',
      'Entidade ID',
      'Validade',
      'Status',
      'Urgência',
      'Tem ficheiro',
      'Arquivo (url/path)',
    ];

    const lines = base.map((d) => {
      const st = getDocumentoStatus(d);
      const urg = urgencyLabel(d).text;
      const tipoNome = d.tipos_documento?.nome || d.tipo || '-';

      return [
        d.nome || '-',
        tipoNome,
        d.entidade_tipo || '-',
        d.entidade_nome || '-',
        d.entidade_id || '-',
        d.data_validade ? formatDatePT(d.data_validade) : 'Sem validade',
        getStatusConfig(st).label,
        urg,
        d.arquivo_url ? 'Sim' : 'Não',
        d.arquivo_url || '',
      ]
        .map((x) => `"${String(x).replaceAll('"', '""')}"`)
        .join(',');
    });

    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `documentos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

  const openNew = () => {
    const lock =
      scope !== 'todos' && selectedEntidadeId
        ? { tipo: scope as EntidadeTipo, id: selectedEntidadeId, nome: selectedEntidadeNome || null }
        : null;

    setModalInitial({
      entidade_tipo: lock?.tipo || (scope === 'todos' ? 'colaborador' : scope),
      entidade_id: lock?.id || '',
      entidade_nome: lock?.nome || '',
      nome: '',
      tipo_documento_id: null,
      arquivo_url: null,
      data_validade: null,
    });
    setModalOpen(true);
  };

  const openEdit = (doc: Documento) => {
    setModalInitial(doc);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalInitial(null);
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
      const updated = (rows.find((d) => d.id === selectedDoc.id) as Documento | undefined) || null;

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

  const colabStats = useMemo(() => buildStatsByEntidade(documentos, 'colaborador'), [documentos]);
  const empresaStats = useMemo(() => buildStatsByEntidade(documentos, 'empresa'), [documentos]);

  const filteredEntities = useMemo(() => {
    const s = normalize(entitySearch);

    if (scope === 'colaborador') {
      const rows = colaboradores || [];
      if (!s) return rows;

      return rows.filter((c) => {
        const hay = [c.nome_completo, c.email || '', c.telefone || '', c.categoria || '', c.status || ''].join(' ').toLowerCase();
        return hay.includes(s);
      });
    }

    if (scope === 'empresa') {
      const rows = empresas || [];
      if (!s) return rows;

      return rows.filter((e) => {
        const hay = [e.nome || '', e.razao_social || '', e.id].join(' ').toLowerCase();
        return hay.includes(s);
      });
    }

    return [];
  }, [entitySearch, scope, colaboradores, empresas]);

  const sortedEntities = useMemo(() => {
    if (scope === 'colaborador') {
      const rows = [...(filteredEntities as ColaboradorRow[])];
      rows.sort((a, b) => {
        const sa = colabStats.get(a.id) || emptyStats();
        const sb = colabStats.get(b.id) || emptyStats();
        const ra = severityRank(sa);
        const rb = severityRank(sb);
        if (ra !== rb) return ra - rb;
        return a.nome_completo.localeCompare(b.nome_completo);
      });
      return rows;
    }

    if (scope === 'empresa') {
      const rows = [...(filteredEntities as EmpresaRow[])];
      rows.sort((a, b) => {
        const sa = empresaStats.get(a.id) || emptyStats();
        const sb = empresaStats.get(b.id) || emptyStats();
        const ra = severityRank(sa);
        const rb = severityRank(sb);
        if (ra !== rb) return ra - rb;
        const an = String(a.nome || a.razao_social || a.id);
        const bn = String(b.nome || b.razao_social || b.id);
        return an.localeCompare(bn);
      });
      return rows;
    }

    return [];
  }, [filteredEntities, scope, colabStats, empresaStats]);

  const selectedLabel = useMemo(() => {
    if (scope === 'colaborador') {
      const c = colaboradores.find((x) => x.id === selectedEntidadeId);
      return c?.nome_completo || selectedEntidadeNome || '';
    }
    if (scope === 'empresa') {
      const e = empresas.find((x) => x.id === selectedEntidadeId);
      return String(e?.nome || e?.razao_social || selectedEntidadeNome || '');
    }
    return '';
  }, [scope, colaboradores, empresas, selectedEntidadeId, selectedEntidadeNome]);

  const lockEntidadeForModal =
    scope !== 'todos' && selectedEntidadeId
      ? { tipo: scope as EntidadeTipo, id: selectedEntidadeId, nome: selectedLabel || null }
      : null;

  const selectedEmpresaRow = useMemo(() => {
    if (scope !== 'empresa' || !selectedEntidadeId) return null;
    return empresas.find((e) => e.id === selectedEntidadeId) || null;
  }, [scope, selectedEntidadeId, empresas]);

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

  const showEntityFlow = scope === 'colaborador' || scope === 'empresa';

  return (
    <div className="space-y-6">
      <Card className={`p-5 ${cardBase}`}>
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
          <div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">Documentos</div>
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
                { id: 'todos', label: 'Todos', count: scopeCounts.todos, icon: Filter },
              ]}
            />
          </div>
        </div>

        {showEntityFlow && (
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

              {scope === 'empresa' && selectedEmpresaRow && (
                <button
                  onClick={() => {
                    setEditEmpresaTarget(selectedEmpresaRow);
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
              <Button
                variant="secondary"
                onClick={async () => {
                  await Promise.all([loadDocumentos(), loadEmpresas(), loadColaboradores()]);
                }}
              >
                Atualizar
              </Button>

              <Button onClick={openNew} disabled={scope !== 'todos' && !selectedEntidadeId}>
                <Plus size={16} className="mr-2" />
                {scope === 'todos' ? 'Novo documento' : `Novo documento p/ ${scope}`}
              </Button>
            </div>
          </div>
        )}
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

      {/* ======== MODO: COLAB/EMPRESA (com lista de entidades) ======== */}
      {showEntityFlow ? (
        <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-4">
          <Card className={`p-5 ${cardBase}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {scope === 'colaborador' ? 'Colaboradores' : 'Empresas'} ({sortedEntities.length})
              </div>

              {scope === 'empresa' && (
                <Button variant="secondary" onClick={() => setEmpresaModalOpen(true)}>
                  <Plus size={16} className="mr-2" />
                  Nova
                </Button>
              )}
            </div>

            <div className="mt-3 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
              <input
                value={entitySearch}
                onChange={(e) => setEntitySearch(e.target.value)}
                placeholder={`Pesquisar ${scope === 'colaborador' ? 'colaborador' : 'empresa'}…`}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                           focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>

            <div className="mt-4 space-y-2 max-h-[620px] overflow-y-auto pr-1">
              {scope === 'colaborador' &&
                (sortedEntities as ColaboradorRow[]).map((c) => {
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
                        <div className={['font-semibold truncate', active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-900 dark:text-slate-100'].join(' ')}>
                          {c.nome_completo}
                        </div>
                        <div className={['text-xs mt-0.5 truncate', active ? 'text-slate-600 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'].join(' ')}>
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

              {scope === 'empresa' &&
                (sortedEntities as EmpresaRow[]).map((e) => {
                  const st = empresaStats.get(e.id) || emptyStats();
                  const active = selectedEntidadeId === e.id;
                  const label = String(e.nome || e.razao_social || e.id);

                  const cardCls = active
                    ? [
                        'border-[#0B4F8A]/35 bg-[#0B4F8A]/[0.06] ring-1 ring-[#0B4F8A]/20',
                        'dark:border-[#0B4F8A]/35 dark:bg-[#0B4F8A]/10 dark:ring-[#0B4F8A]/25',
                      ].join(' ')
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950/40';

                  return (
                    <button
                      key={e.id}
                      onClick={() => {
                        setSelectedEntidadeId(e.id);
                        setSelectedEntidadeNome(label);

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
                      title="Selecionar empresa"
                    >
                      <div className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-center overflow-hidden">
                        <SmartImage
                          value={e.logo_url}
                          alt={label}
                          className="h-full w-full object-cover"
                          fallback={<Building2 size={18} className="text-slate-600 dark:text-slate-300" />}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate text-slate-900 dark:text-slate-100">{label}</div>
                        <div className={['text-xs mt-0.5 truncate', active ? 'text-slate-600 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'].join(' ')}>
                          ID: <span className="font-mono">{e.id}</span>
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

                      {/* ações à direita */}
                      <div className="flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Editar empresa"
                          onClick={() => {
                            setEditEmpresaTarget(e);
                            setEditEmpresaOpen(true);
                          }}
                        >
                          <Edit3 size={16} />
                        </Button>
                        <ChevronRight size={18} className={active ? 'text-[#0B4F8A]' : 'text-slate-400 dark:text-slate-500'} />
                      </div>
                    </button>
                  );
                })}

              {sortedEntities.length === 0 && (
                <div className="text-center py-10 text-slate-500 dark:text-slate-400">Nenhuma entidade encontrada.</div>
              )}
            </div>
          </Card>

          <Card className={`p-5 ${cardBase}`}>
            <div className="flex flex-col xl:flex-row gap-4 xl:items-center xl:justify-between">
              <div>
                <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Documentos do {scope === 'colaborador' ? 'colaborador' : 'empresa'}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {selectedEntidadeId ? (
                    <>
                      Selecionado: <span className="font-semibold">{selectedLabel || selectedEntidadeId}</span>
                    </>
                  ) : (
                    'Selecione uma entidade na lista ao lado para carregar os documentos.'
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end">
                <Button variant="secondary" onClick={exportCSV} disabled={!selectedEntidadeId}>
                  Exportar CSV
                </Button>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await Promise.all([loadDocumentos(), loadEmpresas(), loadColaboradores()]);
                  }}
                >
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
                        placeholder={`Pesquisar em ${scopeLabel(scope).toLowerCase()}… (nome, tipo, validade, ficheiro)`}
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
                          <X size={16} />
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    <Button onClick={openNew}>
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
                            onClick={() => openDocDrawer(doc)}
                            title="Abrir detalhes"
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-start gap-3">
                                <div
                                  className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-center"
                                  style={{ boxShadow: '0 6px 20px rgba(2, 6, 23, 0.06)' }}
                                >
                                  <FileText size={18} className="text-slate-600 dark:text-slate-300" />
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
                                    onClick={() => openArquivo(String(doc.arquivo_url))}
                                    title="Abrir ficheiro"
                                  >
                                    <ExternalLink size={16} />
                                  </Button>
                                ) : (
                                  <Button variant="ghost" size="sm" onClick={() => openDocDrawer(doc)} title="Subir ficheiro">
                                    <UploadCloud size={16} />
                                  </Button>
                                )}

                                <Button variant="ghost" size="sm" onClick={() => openDocDrawer(doc)} title="Ver">
                                  Ver
                                </Button>

                                <Button variant="ghost" size="sm" onClick={() => openEdit(doc)} title="Editar">
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
                      Nenhum documento encontrado para esta entidade.
                    </div>
                  )}
                </div>
              </>
            )}

            {!selectedEntidadeId && (
              <div className="mt-10 text-center text-slate-500 dark:text-slate-400">
                Selecione um {scope === 'colaborador' ? 'colaborador' : 'empresa'} na lista ao lado para ver os documentos.
              </div>
            )}
          </Card>
        </div>
      ) : (
        /* ======== MODO: TODOS (LISTA COMPLETA) ======== */
        <Card className={`p-5 ${cardBase}`}>
          <div className="flex flex-col xl:flex-row gap-4 xl:items-center xl:justify-between">
            <div>
              <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">Todos os documentos</div>
              <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Lista completa (colaboradores + empresas), com filtros e exportação.
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <Button variant="secondary" onClick={exportCSV} disabled={filteredDocumentos.length === 0}>
                Exportar CSV
              </Button>
              <Button variant="secondary" onClick={loadDocumentos}>
                Atualizar
              </Button>
              <Button onClick={openNew}>
                <Plus size={16} className="mr-2" />
                Novo Documento
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-col xl:flex-row gap-4 xl:items-center xl:justify-between">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
              <div className="relative w-full lg:w-[420px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
                <input
                  type="text"
                  placeholder="Pesquisar em todos… (doc, tipo, entidade, validade, ficheiro)"
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
                    <X size={16} />
                    Limpar
                  </button>
                )}
              </div>
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
            <table className="w-full min-w-[1250px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800/70">
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Documento
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Tipo
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Entidade
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
                  const entidadeNome = doc.entidade_nome || doc.entidade_id;

                  return (
                    <tr
                      key={doc.id}
                      className={[
                        'hover:bg-slate-50 dark:hover:bg-slate-950/40 cursor-pointer relative',
                        'before:content-[""] before:absolute before:left-0 before:top-0 before:h-full before:w-1',
                        rowStripe,
                      ].join(' ')}
                      onClick={() => openDocDrawer(doc)}
                      title="Abrir detalhes"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-start gap-3">
                          <div
                            className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-center"
                            style={{ boxShadow: '0 6px 20px rgba(2, 6, 23, 0.06)' }}
                          >
                            <FileText size={18} className="text-slate-600 dark:text-slate-300" />
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
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {asEntidadeNice(doc.entidade_tipo)}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {entidadeNome}
                        </div>
                      </td>

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
                              onClick={() => openArquivo(String(doc.arquivo_url))}
                              title="Abrir ficheiro"
                            >
                              <ExternalLink size={16} />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => openDocDrawer(doc)} title="Subir ficheiro">
                              <UploadCloud size={16} />
                            </Button>
                          )}

                          <Button variant="ghost" size="sm" onClick={() => openDocDrawer(doc)} title="Ver">
                            Ver
                          </Button>

                          <Button variant="ghost" size="sm" onClick={() => openEdit(doc)} title="Editar">
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
                Nenhum documento encontrado (modo “Todos”).
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ======== DRAWER ======== */}
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
                      <span className="text-xs text-slate-500 dark:text-slate-400">({Math.round(drawerFile.size / 1024)} KB)</span>
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
        onSuccess={loadDocumentos}
        initial={modalInitial}
        lockEntidade={lockEntidadeForModal}
      />

      <NovaEmpresaModal
        isOpen={empresaModalOpen}
        onClose={() => setEmpresaModalOpen(false)}
        onCreated={async ({ id, label }) => {
          await loadEmpresas();

          // já seleciona a empresa criada
          skipScopeResetRef.current = true;
          setScope('empresa');
          setSelectedEntidadeId(id);
          setSelectedEntidadeNome(label);

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
