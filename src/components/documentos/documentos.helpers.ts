import { AlertTriangle, CheckCircle, Clock, FileText, UploadCloud } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  DocStatus,
  Documento,
  DocsFocusPayload,
  DocumentosInitialSelection,
  EntidadeTipo,
  EntityDocStats,
  Scope,
} from './documentos.types';

export const BRAND = { blue: '#0B4F8A', orange: '#F5A623' };
export const STORAGE_BUCKET = 'documentos';
export const DOCS_FOCUS_KEY = 'documentos_focus';

export const cardBase =
  'border border-slate-200 bg-white shadow-sm ' +
  'dark:border-slate-800/70 dark:bg-slate-950/30 dark:shadow-black/30';

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function dayDiff(a: Date, b: Date) {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

export function formatDatePT(date?: string | null) {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-PT');
}

export function normalize(s: unknown) {
  return String(s ?? '').trim().toLowerCase();
}

export function getDocumentoStatus(doc: Documento): DocStatus {
  if (!doc.arquivo_url) return 'sem_documento';
  if (!doc.data_validade) return 'sem_validade';

  const hoje = startOfDay(new Date());
  const validade = startOfDay(new Date(doc.data_validade));
  const em30Dias = startOfDay(new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000));

  if (validade < hoje) return 'vencido';
  if (validade <= em30Dias) return 'a_vencer';
  return 'valido';
}

export function getStatusConfig(status: DocStatus) {
  const cfg = {
    sem_documento: { variant: 'warning', icon: UploadCloud, label: 'Sem documento' },
    vencido: { variant: 'danger', icon: AlertTriangle, label: 'Vencido' },
    a_vencer: { variant: 'warning', icon: Clock, label: 'A vencer' },
    valido: { variant: 'success', icon: CheckCircle, label: 'Válido' },
    sem_validade: { variant: 'default', icon: FileText, label: 'Sem validade' },
  } as const;

  return cfg[status];
}

export function urgencyLabel(doc: Documento) {
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

export function scopeLabel(scope: Scope) {
  if (scope === 'colaborador') return 'Colaboradores';
  return 'Empresa';
}

export function asEntidadeNice(entidade: string | null | undefined) {
  const e = String(entidade || '').toLowerCase();
  if (e === 'colaborador') return 'colaborador';
  if (e === 'empresa') return 'empresa';
  return entidade || '—';
}

export function safeFileExt(name: string) {
  const n = String(name || '');
  const i = n.lastIndexOf('.');
  if (i === -1) return '';
  const ext = n.slice(i + 1).toLowerCase();
  return ext.replace(/[^a-z0-9]/g, '').slice(0, 8);
}

export function buildStoragePath(docId: string, fileName: string, entidadeTipo: string) {
  const ext = safeFileExt(fileName);
  const base = `documentos/${String(entidadeTipo || 'geral')}/${docId}`;
  return ext ? `${base}.${ext}` : base;
}

export function buildEmpresaLogoPath(empresaId: string, fileName: string) {
  const ext = safeFileExt(fileName) || 'png';
  return `empresas/logos/${empresaId}.${ext}`;
}

export async function uploadToStorage(path: string, file: File) {
  const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    upsert: true,
    cacheControl: '3600',
    contentType: file.type || 'application/octet-stream',
  });
  if (upErr) throw upErr;
  return path;
}

export function isHttpUrl(v: string) {
  return /^https?:\/\//i.test(v);
}

export async function openArquivo(arquivoUrlOrPath: string) {
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

export function emptyStats(): EntityDocStats {
  return {
    total: 0,
    sem_documento: 0,
    vencido: 0,
    a_vencer: 0,
    valido: 0,
    sem_validade: 0,
  };
}

export function buildStatsByEntidade(docs: Documento[], entidadeTipo: EntidadeTipo) {
  const map = new Map<string, EntityDocStats>();

  for (const d of docs) {
    if (normalize(d.entidade_tipo) !== entidadeTipo) continue;

    const key = String(d.entidade_id);
    if (!map.has(key)) map.set(key, emptyStats());

    const st = getDocumentoStatus(d);
    const s = map.get(key)!;
    s.total += 1;
    (s as Record<DocStatus, number>)[st] += 1;
  }

  return map;
}

export function severityRank(st: EntityDocStats) {
  if (st.vencido > 0) return 0;
  if (st.sem_documento > 0) return 1;
  if (st.a_vencer > 0) return 2;
  if (st.sem_validade > 0) return 3;
  return 4;
}

export function pinSelectedFirst<T extends { id: string }>(rows: T[], selectedId: string) {
  if (!selectedId) return rows;
  const idx = rows.findIndex((r) => r.id === selectedId);
  if (idx <= 0) return rows;

  const selected = rows[idx];
  return [selected, ...rows.slice(0, idx), ...rows.slice(idx + 1)];
}

export function readDocsFocusFromSession(): DocumentosInitialSelection | null {
  try {
    const raw = sessionStorage.getItem(DOCS_FOCUS_KEY);
    if (!raw) return null;

    sessionStorage.removeItem(DOCS_FOCUS_KEY);

    const parsed = JSON.parse(raw) as DocsFocusPayload;

    if (!parsed?.id || !parsed?.tipo) return null;

    return {
      scope: parsed.tipo,
      entidadeId: String(parsed.id),
      entidadeNome: parsed.nome ?? null,
    };
  } catch {
    sessionStorage.removeItem(DOCS_FOCUS_KEY);
    return null;
  }
}