import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { toast } from '../../lib/toast';

interface CargoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  cargo?: {
    id: string;
    nome: string;
    descricao: string | null;
    valor_hora_padrao: number;
    ativo: boolean;
  } | null;
}

function parseMoney(input: string) {
  // aceita "10,5" ou "10.5"
  const n = Number(String(input).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export function CargoModal({ isOpen, onClose, onSuccess, cargo }: CargoModalProps) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valorHora, setValorHora] = useState('');
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (cargo) {
      setNome(cargo.nome ?? '');
      setDescricao(cargo.descricao ?? '');
      setValorHora(String(cargo.valor_hora_padrao ?? ''));
      setAtivo(!!cargo.ativo);
    } else {
      setNome('');
      setDescricao('');
      setValorHora('');
      setAtivo(true);
    }
  }, [cargo, isOpen]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const nomeFinal = nome.trim();
    const descricaoFinal = descricao.trim();
    const valor = parseMoney(valorHora);

    if (!nomeFinal) {
      toast.error('Nome do cargo é obrigatório');
      return;
    }

    if (!Number.isFinite(valor) || valor <= 0) {
      toast.error('Valor/hora deve ser maior que zero');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        nome: nomeFinal,
        descricao: descricaoFinal || null,
        valor_hora_padrao: valor,
        ativo,
      };

      if (cargo?.id) {
        const { error } = await supabase.from('cargos').update(payload).eq('id', cargo.id);
        if (error) throw error;
        toast.success('Cargo atualizado com sucesso');
      } else {
        const { error } = await supabase.from('cargos').insert([payload]);
        if (error) throw error;
        toast.success('Cargo criado com sucesso');
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Erro ao salvar cargo:', error);
      if (error?.code === '23505') toast.error('Já existe um cargo com este nome');
      else toast.error('Erro ao salvar cargo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={cargo ? 'Editar Cargo' : 'Novo Cargo'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
            Nome do Cargo *
          </label>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Pedreiro, Eletricista..."
            required
            disabled={saving}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
            Descrição
          </label>
          <Textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Descrição opcional do cargo..."
            rows={3}
            disabled={saving}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
            Valor/Hora Padrão (€) *
          </label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={valorHora}
            onChange={(e) => setValorHora(e.target.value)}
            placeholder="0.00"
            required
            disabled={saving}
          />
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Este valor será usado como base para novos colaboradores deste cargo
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="cargo-ativo"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="rounded border-slate-300 text-[#0B4F8A] focus:ring-[#0B4F8A]"
            disabled={saving}
          />
          <label htmlFor="cargo-ativo" className="text-sm text-slate-700 dark:text-slate-200">
            Cargo ativo (disponível para seleção)
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Guardando...' : cargo ? 'Atualizar' : 'Criar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
