import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';

export function NovaEmpresaModal({
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
                placeholder='Ex: "Gobi & Júnior"'
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
                placeholder='Ex: "Gobi & Júnior Canalizações Lda"'
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