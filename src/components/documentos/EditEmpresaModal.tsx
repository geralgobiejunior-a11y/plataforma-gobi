import { useEffect, useRef, useState } from 'react';
import { X, Image as ImageIcon, Trash2, UploadCloud, Building2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';

import type { EmpresaRow } from './documentos.types';
import { buildEmpresaLogoPath, uploadToStorage } from './documentos.helpers';

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

export function EditEmpresaModal({
  isOpen,
  empresa,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  empresa: EmpresaRow | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
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

      const { error: upErr } = await supabase.from('empresas').update(payload).eq('id', empresa.id);
      if (upErr) throw upErr;

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
                  placeholder='Ex: "Gobi & Júnior"'
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
                  placeholder='Ex: "Gobi & Júnior Canalizações Lda"'
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