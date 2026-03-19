import { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

import type {
  Documento,
  TipoDocumento,
  EntidadeTipo,
} from './documentos.types';

export function DocumentoModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;

  documento?: Documento | null;
  tiposDocumento: TipoDocumento[];

  lockEntidade?: {
    tipo: EntidadeTipo;
    id: string;
    nome?: string | null;
  } | null;
}) {
  const { isOpen, onClose, onSaved, documento, tiposDocumento, lockEntidade } = props;

  const isEdit = !!documento;

  const [nome, setNome] = useState('');
  const [tipoId, setTipoId] = useState<string | null>(null);
  const [dataValidade, setDataValidade] = useState<string | null>(null);

  const [entidadeTipo, setEntidadeTipo] = useState<EntidadeTipo>('colaborador');
  const [entidadeId, setEntidadeId] = useState<string>('');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (documento) {
      setNome(documento.nome || '');
      setTipoId(documento.tipo_documento_id || null);
      setDataValidade(documento.data_validade || null);
      setEntidadeTipo(documento.entidade_tipo as EntidadeTipo);
      setEntidadeId(documento.entidade_id);
    } else {
      setNome('');
      setTipoId(null);
      setDataValidade(null);

      if (lockEntidade) {
        setEntidadeTipo(lockEntidade.tipo);
        setEntidadeId(lockEntidade.id);
      } else {
        setEntidadeTipo('colaborador');
        setEntidadeId('');
      }
    }
  }, [isOpen, documento, lockEntidade]);

  const handleSave = async () => {
    if (!nome) {
      alert('Nome é obrigatório');
      return;
    }

    if (!entidadeId) {
      alert('Entidade é obrigatória');
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        const { error } = await supabase
          .from('documentos')
          .update({
            nome,
            tipo_documento_id: tipoId,
            data_validade: dataValidade,
          })
          .eq('id', documento.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('documentos').insert({
          nome,
          tipo_documento_id: tipoId,
          data_validade: dataValidade,
          entidade_tipo: entidadeTipo,
          entidade_id: entidadeId,
        });

        if (error) throw error;
      }

      await onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      alert('Erro ao salvar documento');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold text-lg">
              {isEdit ? 'Editar documento' : 'Novo documento'}
            </div>

            <button onClick={onClose}>
              <X />
            </button>
          </div>

          {/* Form */}
          <div className="space-y-3">
            <div>
              <label className="text-sm">Nome</label>
              <input
                className="w-full border rounded px-3 py-2 mt-1"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm">Tipo</label>
              <select
                className="w-full border rounded px-3 py-2 mt-1"
                value={tipoId || ''}
                onChange={(e) => setTipoId(e.target.value || null)}
              >
                <option value="">Selecione</option>
                {tiposDocumento.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm">Data validade</label>
              <input
                type="date"
                className="w-full border rounded px-3 py-2 mt-1"
                value={dataValidade || ''}
                onChange={(e) => setDataValidade(e.target.value || null)}
              />
            </div>

            {!lockEntidade && (
              <>
                <div>
                  <label className="text-sm">Tipo entidade</label>
                  <select
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={entidadeTipo}
                    onChange={(e) => setEntidadeTipo(e.target.value as EntidadeTipo)}
                  >
                    <option value="colaborador">Colaborador</option>
                    <option value="empresa">Empresa</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm">ID entidade</label>
                  <input
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={entidadeId}
                    onChange={(e) => setEntidadeId(e.target.value)}
                  />
                </div>
              </>
            )}

            {lockEntidade && (
              <div className="text-xs text-slate-500">
                Vinculado a {lockEntidade.tipo}: {lockEntidade.nome || lockEntidade.id}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>

            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}