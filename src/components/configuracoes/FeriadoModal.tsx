// src/components/configuracoes/FeriadoModal.tsx
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

interface FeriadoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  feriado?: {
    id: string;
    nome: string;
    data: string; // YYYY-MM-DD
    tipo: string;
  } | null;
}

type FeriadoTipo = 'nacional' | 'municipal' | 'facultativo' | 'interno';

export function FeriadoModal({ isOpen, onClose, onSuccess, feriado }: FeriadoModalProps) {
  const [nome, setNome] = useState('');
  const [data, setData] = useState('');
  const [tipo, setTipo] = useState<FeriadoTipo>('nacional');
  const [saving, setSaving] = useState(false);

  // Opções para o teu Select (ele exige `options`)
  const tipoOptions = useMemo(
    () => [
      { value: 'nacional', label: 'Nacional' },
      { value: 'municipal', label: 'Municipal' },
      { value: 'facultativo', label: 'Facultativo' },
      { value: 'interno', label: 'Interno' },
    ],
    []
  );

  useEffect(() => {
    if (!isOpen) return;

    if (feriado) {
      setNome(feriado.nome ?? '');
      setData(feriado.data ?? '');

      const t = String(feriado.tipo || 'nacional').toLowerCase() as FeriadoTipo;
      const allowed: FeriadoTipo[] = ['nacional', 'municipal', 'facultativo', 'interno'];
      setTipo(allowed.includes(t) ? t : 'nacional');
    } else {
      setNome('');
      setData('');
      setTipo('nacional');
    }
  }, [feriado, isOpen]);

  const validate = () => {
    if (!nome.trim()) {
      toast.error('Nome do feriado é obrigatório');
      return false;
    }
    if (!data) {
      toast.error('Data é obrigatória');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        nome: nome.trim(),
        data, // YYYY-MM-DD
        tipo,
      };

      if (feriado?.id) {
        const { error } = await supabase.from('feriados').update(payload).eq('id', feriado.id);
        if (error) throw error;
        toast.success('Feriado atualizado com sucesso');
      } else {
        const { error } = await supabase.from('feriados').insert([payload]);
        if (error) throw error;
        toast.success('Feriado criado com sucesso');
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Erro ao salvar feriado:', error);

      // Postgres unique_violation
      if (error?.code === '23505') {
        toast.error('Já existe um feriado nesta data');
      } else {
        toast.error('Erro ao salvar feriado');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!feriado?.id) return;

    const ok = confirm('Tem certeza que deseja eliminar este feriado?');
    if (!ok) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('feriados').delete().eq('id', feriado.id);
      if (error) throw error;

      toast.success('Feriado eliminado com sucesso');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Erro ao eliminar feriado:', error);
      toast.error('Erro ao eliminar feriado');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={feriado ? 'Editar Feriado' : 'Novo Feriado'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nome do Feriado"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Dia de Natal, Ano Novo..."
          required
          disabled={saving}
        />

        <Input
          label="Data"
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          required
          disabled={saving}
        />

        <Select
          label="Tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as FeriadoTipo)}
          options={tipoOptions}
          required
          disabled={saving}
          helperText="Tipo de feriado (nacional, municipal, facultativo ou interno)"
        />

        <div className="flex justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div>
            {feriado && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleDelete}
                disabled={saving}
                className="text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                Eliminar
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : feriado ? 'Atualizar' : 'Criar'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
