// DEPLOY_TEST

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Upload,
  FileText,
  Eye,
  Download,
  Trash2,
  Search as SearchIcon,
  ChevronDown,
  Calendar,
} from 'lucide-react';

import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

type ReciboColaborador = {
  id: string;
  nome_completo: string;
  foto_url?: string | null;
};

type ExistingRecibo = {
  path: string; // ex: "{colaboradorId}/{YYYY-MM}.pdf"
  name: string; // ex: "2026-01.pdf"
  created_at?: string | null;
  updated_at?: string | null;
};

function toPtMonthLabel(yyyyMm: string) {
  const [y, m] = String(yyyyMm || '').split('-').map((x) => Number(x));
  if (!y || !m) return '—';
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
}

function formatDateTimePT(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-PT', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function initials(name: string) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

async function openSignedUrl(bucket: string, path: string, download?: boolean) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10); // 10 min
  if (error) throw error;

  const url = data?.signedUrl;
  if (!url) throw new Error('Não foi possível gerar URL assinada');

  if (download) {
    const a = document.createElement('a');
    a.href = url;
    a.download = path.split('/').pop() || 'recibo.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function ColaboradorPicker({
  value,
  onChange,
  colaboradores,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  colaboradores: ReciboColaborador[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (ev: MouseEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      if (ev.target instanceof Node && !el.contains(ev.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selected = useMemo(() => colaboradores.find((c) => c.id === value) || null, [colaboradores, value]);

  const filteredAll = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const list = (colaboradores || [])
      .slice()
      .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo))
      .filter((c) => (qq ? c.nome_completo.toLowerCase().includes(qq) : true));
    return list;
  }, [colaboradores, q]);

  const LIMIT = 80;
  const filtered = useMemo(() => filteredAll.slice(0, LIMIT), [filteredAll]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((s) => !s)}
        className={cx(
          'w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border bg-white text-left',
          'border-slate-200 hover:bg-slate-50',
          'dark:bg-slate-950/40 dark:border-slate-800 dark:hover:bg-slate-950/55',
          disabled && 'opacity-60 cursor-not-allowed'
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          {selected ? (
            selected.foto_url ? (
              <img
                src={selected.foto_url}
                alt={selected.nome_completo}
                className="h-9 w-9 rounded-xl object-cover border border-slate-200 dark:border-slate-800"
              />
            ) : (
              <div className="h-9 w-9 rounded-xl bg-[#0B4F8A] text-white flex items-center justify-center font-bold text-sm">
                {initials(selected.nome_completo)}
              </div>
            )
          ) : (
            <div className="h-9 w-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/25" />
          )}

          <div className="min-w-0">
            <div className={cx('text-sm font-semibold truncate', selected ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400')}>
              {selected ? selected.nome_completo : 'Selecionar colaborador…'}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-500 truncate">
              {selected ? selected.id : 'Pesquise e selecione na lista'}
            </div>
          </div>
        </div>

        <ChevronDown size={16} className="text-slate-400 dark:text-slate-500 shrink-0" />
      </button>

      {open && (
        <div
          className={cx(
            'absolute z-[80] mt-2 w-full rounded-2xl border shadow-xl overflow-hidden',
            'border-slate-200 bg-white',
            'dark:border-slate-800 dark:bg-slate-950'
          )}
        >
          <div className="p-3 border-b border-slate-200 dark:border-slate-800">
            <div className="relative">
              <SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Pesquisar colaborador…"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl bg-white text-sm text-slate-900
                           focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent
                           dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>

            <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-500">
              <span>{filteredAll.length} resultado(s)</span>
              {filteredAll.length > LIMIT ? <span>Mostrando {LIMIT}. Refine a pesquisa.</span> : <span />}
            </div>
          </div>

          <div className="max-h-[320px] overflow-auto p-2">
            {filtered.length === 0 ? (
              <div className="p-4 text-sm text-slate-600 dark:text-slate-400">Nenhum colaborador encontrado.</div>
            ) : (
              <div className="space-y-1">
                {filtered.map((c) => {
                  const active = c.id === value;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onChange(c.id);
                        setOpen(false);
                      }}
                      className={cx(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left border',
                        active
                          ? 'border-[#0B4F8A]/30 bg-[#0B4F8A]/5 dark:bg-[#0B4F8A]/15'
                          : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-900/40'
                      )}
                    >
                      {c.foto_url ? (
                        <img
                          src={c.foto_url}
                          alt={c.nome_completo}
                          className="h-9 w-9 rounded-xl object-cover border border-slate-200 dark:border-slate-800"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-xl bg-[#0B4F8A] text-white flex items-center justify-center font-bold text-sm">
                          {initials(c.nome_completo)}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {c.nome_completo}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-500 truncate">{c.id}</div>
                      </div>

                      {active ? (
                        <div className="h-8 w-8 rounded-xl border border-[#0B4F8A]/20 bg-[#0B4F8A]/10 flex items-center justify-center">
                          <span className="text-[#0B4F8A] font-bold text-xs">OK</span>
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RecibosModal({
  open,
  onClose,
  colaboradores,
  defaultCompetencia, // yyyy-mm
  defaultColaboradorId,
}: {
  open: boolean;
  onClose: () => void;
  colaboradores: ReciboColaborador[];
  defaultCompetencia?: string;
  defaultColaboradorId?: string;
}) {
  const BUCKET = 'recibos';

  const [colaboradorId, setColaboradorId] = useState<string>('');
  const [competencia, setCompetencia] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);

  const [loadingExisting, setLoadingExisting] = useState(false);
  const [existing, setExisting] = useState<ExistingRecibo | null>(null);

  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Inicializa defaults ao abrir
  useEffect(() => {
    if (!open) return;
    setCompetencia((prev) => prev || defaultCompetencia || '');
    setColaboradorId((prev) => prev || defaultColaboradorId || '');
    setFile(null);
  }, [open, defaultCompetencia, defaultColaboradorId]);

  const targetPath = useMemo(() => {
    if (!colaboradorId || !competencia) return null;
    return `${colaboradorId}/${competencia}.pdf`;
  }, [colaboradorId, competencia]);

  const refreshExisting = useCallback(async () => {
    if (!colaboradorId || !competencia) {
      setExisting(null);
      return;
    }

    setLoadingExisting(true);
    try {
      const name = `${competencia}.pdf`;

      // Otimização: pede ao storage para procurar especificamente esse nome
      const { data, error } = await supabase.storage.from(BUCKET).list(colaboradorId, {
        limit: 20,
        offset: 0,
        sortBy: { column: 'name', order: 'desc' },
        // @ts-ignore - dependendo da versão do supabase-js, search existe no tipo
        search: name,
      });

      if (error) throw error;

      const found = (data || []).find((o: any) => String(o?.name) === name);
      if (!found) {
        setExisting(null);
        return;
      }

      setExisting({
        path: `${colaboradorId}/${name}`,
        name,
        created_at: found.created_at ?? null,
        updated_at: found.updated_at ?? null,
      });
    } catch (e: any) {
      console.error(e);
      setExisting(null);
      toast.error('Erro ao verificar recibo existente');
    } finally {
      setLoadingExisting(false);
    }
  }, [BUCKET, colaboradorId, competencia]);

  useEffect(() => {
    if (!open) return;
    refreshExisting();
  }, [open, colaboradorId, competencia, refreshExisting]);

  const onPickFile = (f: File | null) => {
    if (!f) {
      setFile(null);
      return;
    }
    if (f.type !== 'application/pdf') {
      toast.error('Envie apenas ficheiro PDF (recibo).');
      setFile(null);
      return;
    }
    setFile(f);
  };

  const doUpload = async () => {
    if (!targetPath) {
      toast.error('Selecione colaborador e mês.');
      return;
    }
    if (!file) {
      toast.error('Selecione um PDF para enviar.');
      return;
    }

    setUploading(true);
    try {
      const { error } = await supabase.storage.from(BUCKET).upload(targetPath, file, {
        contentType: file.type,
        upsert: true,
        cacheControl: '3600',
      });

      if (error) throw error;

      toast.success('Recibo enviado com sucesso');
      setFile(null);
      await refreshExisting();
    } catch (e: any) {
      console.error(e);

      // Fato objetivo: com as policies que você colou antes, só existe SELECT para recibos.
      toast.error(
        'Falha no upload. No bucket "recibos" você precisa de policies de INSERT/UPDATE (e DELETE para remover) ou fazer upload via Edge Function.'
      );
    } finally {
      setUploading(false);
    }
  };

  const doRemove = async () => {
    if (!existing?.path) return;

    setRemoving(true);
    try {
      const { error } = await supabase.storage.from(BUCKET).remove([existing.path]);
      if (error) throw error;

      toast.success('Recibo removido');
      setExisting(null);
    } catch (e: any) {
      console.error(e);
      toast.error('Falha ao remover. Confirme policy de DELETE no bucket "recibos".');
    } finally {
      setRemoving(false);
    }
  };

  if (!open) return null;

  const selectedColab = colaboradores.find((c) => c.id === colaboradorId) || null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="absolute left-1/2 top-1/2 w-[calc(100%-24px)] max-w-4xl -translate-x-1/2 -translate-y-1/2">
        <Card className="border border-slate-200 bg-white shadow-2xl dark:border-slate-800/70 dark:bg-slate-950">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800">
            <div className="min-w-0">
              <div className="text-lg font-bold text-slate-900 dark:text-slate-100">Recibos</div>
              <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Enviar e consultar recibos por colaborador e competência (mês).
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/40"
              aria-label="Fechar"
              title="Fechar"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 sm:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left */}
              <Card className="p-4 border border-slate-200 bg-white dark:border-slate-800/70 dark:bg-slate-950/40">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Seleção</div>

                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Colaborador</div>
                    <ColaboradorPicker
                      value={colaboradorId}
                      onChange={(id) => setColaboradorId(id)}
                      colaboradores={colaboradores || []}
                    />
                  </div>

                  <div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Competência (mês)</div>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                        <Input
                          type="month"
                          value={competencia}
                          onChange={(e) => setCompetencia(e.target.value)}
                          className="w-full pl-9 dark:bg-slate-950/50 dark:border-slate-800 dark:text-slate-100"
                        />
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                      Selecionado: <span className="font-semibold">{competencia ? toPtMonthLabel(competencia) : '—'}</span>
                    </div>
                  </div>

                  <div className="pt-2">
                    <div className="text-xs text-slate-600 dark:text-slate-400 mb-1">Enviar PDF do recibo</div>

                    <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/25 p-4">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 flex items-center justify-center">
                          <Upload size={18} className="text-slate-700 dark:text-slate-200" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Escolher ficheiro</div>
                          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                            Apenas PDF. Nome padrão: <span className="font-mono">{colaboradorId || '{colaboradorId}'}/{competencia || 'YYYY-MM'}.pdf</span>
                          </div>

                          <input
                            type="file"
                            accept="application/pdf"
                            onChange={(e) => onPickFile(e.target.files?.[0] || null)}
                            className="mt-3 block w-full text-sm text-slate-700 dark:text-slate-200
                                       file:mr-3 file:py-2 file:px-3
                                       file:rounded-lg file:border-0
                                       file:text-sm file:font-semibold
                                       file:bg-white file:text-slate-800
                                       hover:file:bg-slate-50
                                       dark:file:bg-slate-900/60 dark:file:text-slate-100 dark:hover:file:bg-slate-900/80"
                          />

                          <div className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                            {file ? (
                              <>
                                Selecionado: <span className="font-semibold">{file.name}</span>
                              </>
                            ) : (
                              'Nenhum ficheiro selecionado.'
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Button onClick={doUpload} disabled={uploading || !file || !targetPath}>
                          {uploading ? 'Enviando…' : 'Enviar'}
                        </Button>

                        <Button
                          variant="secondary"
                          onClick={() => setFile(null)}
                          disabled={uploading}
                          className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                        >
                          Limpar
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-slate-500 dark:text-slate-500">
                      Bucket: <span className="font-mono">recibos</span> (privado). Abrir/baixar usa URL assinada.
                    </div>
                  </div>
                </div>
              </Card>

              {/* Right */}
              <Card className="p-4 border border-slate-200 bg-white dark:border-slate-800/70 dark:bg-slate-950/40">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Estado</div>

                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={refreshExisting}
                    disabled={loadingExisting}
                    className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                  >
                    {loadingExisting ? 'Verificando…' : 'Rever'}
                  </Button>
                </div>

                <div className="mt-3">
                  {!colaboradorId || !competencia ? (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/25 p-4 text-sm text-slate-600 dark:text-slate-400">
                      Selecione um colaborador e um mês para ver/gerir o recibo.
                    </div>
                  ) : existing ? (
                    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/25 bg-emerald-50 dark:bg-emerald-500/10 p-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-2xl bg-white/70 dark:bg-black/20 border border-emerald-200/70 dark:border-emerald-500/25">
                          <FileText size={18} className="text-emerald-700 dark:text-emerald-300" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Recibo encontrado</div>

                          <div className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-100/80">
                            Colaborador:{' '}
                            <span className="font-semibold">
                              {selectedColab ? selectedColab.nome_completo : colaboradorId}
                            </span>
                          </div>

                          <div className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-100/80">
                            Competência: <span className="font-semibold">{toPtMonthLabel(competencia)}</span>
                          </div>

                          <div className="mt-2 text-xs text-emerald-900/70 dark:text-emerald-100/70">
                            Ficheiro: <span className="font-mono">{existing.name}</span>
                          </div>

                          <div className="mt-1 text-xs text-emerald-900/70 dark:text-emerald-100/70">
                            Atualizado: <span className="font-semibold">{formatDateTimePT(existing.updated_at)}</span>
                          </div>

                          <div className="mt-1 text-xs text-emerald-900/70 dark:text-emerald-100/70">
                            Caminho: <span className="font-mono">{existing.path}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => openSignedUrl(BUCKET, existing.path, false)}
                          className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                        >
                          <Eye size={16} className="mr-2" />
                          Ver
                        </Button>

                        <Button
                          variant="secondary"
                          onClick={() => openSignedUrl(BUCKET, existing.path, true)}
                          className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                        >
                          <Download size={16} className="mr-2" />
                          Download
                        </Button>

                        <Button
                          variant="secondary"
                          onClick={doRemove}
                          disabled={removing}
                          className="col-span-2 border-red-200 bg-red-50 text-red-800 hover:bg-red-100
                                     dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/15"
                        >
                          <Trash2 size={16} className="mr-2" />
                          {removing ? 'Removendo…' : 'Remover'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
                      Nenhum recibo encontrado para este colaborador e mês.
                      <div className="mt-2 text-xs text-amber-900/70 dark:text-amber-200/80">
                        Se o upload falhar, faltam policies de <span className="font-semibold">INSERT/UPDATE</span> (e
                        <span className="font-semibold"> DELETE</span> para remover) no bucket <span className="font-mono">recibos</span>.
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 text-xs text-slate-500 dark:text-slate-500">
                  Nota operacional: como o bucket está privado, “Ver/Download” usa URL assinada por 10 minutos.
                </div>
              </Card>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                onClick={onClose}
                className="dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
              >
                Fechar
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
