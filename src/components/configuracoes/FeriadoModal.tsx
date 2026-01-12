import { useState, useEffect } from 'react';
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
    data: string;
    tipo: string;
  } | null;
}

export function FeriadoModal({ isOpen, onClose, onSuccess, feriado }: FeriadoModalProps) {
  const [nome, setNome] = useState('');
  const [data, setData] = useState('');
  const [tipo, setTipo] = useState<string>('nacional');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (feriado) {
      setNome(feriado.nome);
      setData(feriado.data);
      setTipo(feriado.tipo || 'nacional');
    } else {
      setNome('');
      setData('');
      setTipo('nacional');
    }
  }, [feriado, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nome.trim()) {
      toast.error('Nome do feriado é obrigatório');
      return;
    }

    if (!data) {
      toast.error('Data é obrigatória');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        nome: nome.trim(),
        data,
        tipo,
      };

      if (feriado) {
        const { error } = await supabase
          .from('feriados')
          .update(payload)
          .eq('id', feriado.id);

        if (error) throw error;
        toast.success('Feriado atualizado com sucesso');
      } else {
        const { error } = await supabase
          .from('feriados')
          .insert([payload]);

        if (error) throw error;
        toast.success('Feriado criado com sucesso');
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Erro ao salvar feriado:', error);
      if (error.code === '23505') {
        toast.error('Já existe um feriado nesta data');
      } else {
        toast.error('Erro ao salvar feriado');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!feriado) return;

    if (!confirm('Tem certeza que deseja eliminar este feriado?')) {
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from('feriados')
        .delete()
        .eq('id', feriado.id);

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
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Nome do Feriado *
          </label>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Dia de Natal, Ano Novo..."
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Data *
          </label>
          <Input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Tipo *
          </label>
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)} required>
            <option value="nacional">Nacional</option>
            <option value="municipal">Municipal</option>
            <option value="facultativo">Facultativo</option>
          </Select>
          <div className="text-xs text-slate-500 mt-1">
            Tipo de feriado (nacional, municipal ou facultativo)
          </div>
        </div>

        <div className="flex justify-between gap-2 pt-4 border-t">
          <div>
            {feriado && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleDelete}
                disabled={saving}
                className="text-red-600 hover:bg-red-50"
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
