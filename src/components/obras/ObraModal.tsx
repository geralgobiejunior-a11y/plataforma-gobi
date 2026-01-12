import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { AddressAutocomplete } from '../ui/AddressAutocomplete';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { uploadFile } from '../../lib/storage';
import { toast } from '../../lib/toast';
import { useAuth } from '../../contexts/AuthContext';
import { createNotification } from '../../lib/notifications';

interface ObraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  obraId?: string | null;
}

interface AddressData {
  rua: string;
  numeroPorta: string;
  codigoPostal: string;
  freguesia: string;
  concelho: string;
  distrito: string;
  latitude?: number;
  longitude?: number;
}

interface FormData {
  logo_url: string | null;
  nome: string;
  cliente: string;
  localizacao: string;
  empresa_id: string;
  status: string;
  data_inicio: string;
  data_fim_prevista: string;
  descricao: string;
  address: AddressData;
}

interface Empresa {
  id: string;
  nome: string;
}

const STATUS_OPTIONS = [
  { value: 'ativa', label: 'Ativa' },
  { value: 'pausada', label: 'Pausada' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'cancelada', label: 'Cancelada' },
];

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export function ObraModal({ isOpen, onClose, onSuccess, obraId }: ObraModalProps) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [formData, setFormData] = useState<FormData>({
    logo_url: null,
    nome: '',
    cliente: '',
    localizacao: '',
    empresa_id: '',
    status: 'ativa',
    data_inicio: todayISO(),
    data_fim_prevista: '',
    descricao: '',
    address: {
      rua: '',
      numeroPorta: '',
      codigoPostal: '',
      freguesia: '',
      concelho: '',
      distrito: '',
    },
  });

  // Preview: arquivo escolhido > URL salva no DB
  useEffect(() => {
    if (logoFile) {
      const url = URL.createObjectURL(logoFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(formData.logo_url || null);
  }, [logoFile, formData.logo_url]);

  useEffect(() => {
    if (!isOpen) return;

    loadEmpresas();

    if (obraId) {
      loadObra();
    } else {
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, obraId]);

  const loadEmpresas = async () => {
    const { data, error } = await supabase.from('empresas').select('id, nome').order('nome');

    if (error) {
      console.error('Erro ao carregar empresas:', error);
      return;
    }

    if (data) setEmpresas(data);
  };

  const loadObra = async () => {
    if (!obraId) return;

    const { data, error } = await supabase.from('obras').select('*').eq('id', obraId).single();

    if (error) {
      toast.error('Erro ao carregar obra');
      return;
    }

    if (data) {
      setFormData({
        logo_url: data.logo_url || null,
        nome: data.nome || '',
        cliente: data.cliente || '',
        localizacao: data.localizacao || '',
        empresa_id: data.empresa_id || '',
        status: data.status || 'ativa',
        data_inicio: data.data_inicio || todayISO(),
        data_fim_prevista: data.data_fim_prevista || '',
        descricao: data.descricao || '',
        address: {
          rua: data.rua || '',
          numeroPorta: data.numero_porta || '',
          codigoPostal: data.codigo_postal || '',
          freguesia: data.freguesia || '',
          concelho: data.concelho || '',
          distrito: data.distrito || '',
          latitude: data.latitude || undefined,
          longitude: data.longitude || undefined,
        },
      });

      setLogoFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const resetForm = () => {
    setFormData({
      logo_url: null,
      nome: '',
      cliente: '',
      localizacao: '',
      empresa_id: '',
      status: 'ativa',
      data_inicio: todayISO(),
      data_fim_prevista: '',
      descricao: '',
      address: {
        rua: '',
        numeroPorta: '',
        codigoPostal: '',
        freguesia: '',
        concelho: '',
        distrito: '',
      },
    });

    setLogoFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // ===== Upload compacto (sem dropzone gigante) =====
  const openFotoPicker = () => fileInputRef.current?.click();

  const handleFotoPicked = (file: File | null) => {
    if (!file) return;

    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowed.has(file.type)) {
      toast.error('Formato inválido. Use PNG, JPG ou WEBP.');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Arquivo muito grande. Máximo 5MB.');
      return;
    }

    setLogoFile(file);
  };

  const removeFoto = () => {
    setLogoFile(null);
    setFormData((prev) => ({ ...prev, logo_url: null }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const empresaOptions = useMemo(
    () => [{ value: '', label: 'Selecione uma empresa (opcional)' }, ...empresas.map((e) => ({ value: e.id, label: e.nome }))],
    [empresas]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // validação mínima objetiva do topo (campos required já cobrem muita coisa)
    if (!formData.nome.trim() || !formData.cliente.trim() || !formData.data_inicio) {
      toast.error('Preencha Nome da Obra, Cliente e Data de Início.');
      return;
    }

    setLoading(true);

    try {
      let logoUrl = formData.logo_url;

      if (logoFile) {
        const { url, error: uploadError } = await uploadFile('logos-obras', 'obras', logoFile);

        if (uploadError) {
          toast.error('Erro ao fazer upload da foto');
          setLoading(false);
          return;
        }

        logoUrl = url;
      }

      const enderecoCompleto = `${formData.address.rua}, ${formData.address.numeroPorta}, ${formData.address.codigoPostal} ${formData.address.concelho}`;

      const obraData = {
        logo_url: logoUrl,
        nome: formData.nome,
        cliente: formData.cliente,
        localizacao: formData.address.concelho || formData.localizacao,
        endereco: enderecoCompleto,

        rua: formData.address.rua,
        numero_porta: formData.address.numeroPorta,
        codigo_postal: formData.address.codigoPostal,
        freguesia: formData.address.freguesia,
        concelho: formData.address.concelho,
        distrito: formData.address.distrito,
        latitude: formData.address.latitude || null,
        longitude: formData.address.longitude || null,

        empresa_id: formData.empresa_id || null,
        status: formData.status,

        data_inicio: formData.data_inicio || null,
        data_fim_prevista: formData.data_fim_prevista || null,

        descricao: formData.descricao,
      };

      if (obraId) {
        const { error } = await supabase.from('obras').update(obraData).eq('id', obraId);
        if (error) throw error;

        toast.success('Obra atualizada com sucesso');

        if (user) {
          await createNotification(user.id, 'obra', 'Obra atualizada', `A obra "${formData.nome}" foi atualizada.`);
        }
      } else {
        const { error } = await supabase.from('obras').insert([obraData]);
        if (error) throw error;

        toast.success('Obra criada com sucesso');

        if (user) {
          await createNotification(
            user.id,
            'obra',
            'Nova obra criada',
            `A obra "${formData.nome}" foi criada para o cliente ${formData.cliente}.`
          );
        }
      }

      onSuccess();
      handleClose();
    } catch (error: any) {
      toast.error(error?.message || 'Erro ao salvar obra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={obraId ? 'Editar Obra' : 'Nova Obra'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={loading} disabled={loading}>
            {obraId ? 'Salvar Alterações' : 'Criar Obra'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ===== FOTO DA OBRA (compacto) ===== */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Foto da Obra</h3>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">PNG, JPG ou WEBP até 5MB</div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFotoPicked(e.target.files?.[0] ?? null)}
          />

          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
            {/* Preview (mais “site”, sem dropzone gigante) */}
            <div className="space-y-2">
              <div
                className="w-full aspect-video rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-neutral-50 dark:bg-neutral-900"
                title="Pré-visualização"
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="Foto da obra" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-neutral-500 dark:text-neutral-400">
                    Sem foto
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={openFotoPicker} className="w-full">
                  {previewUrl ? 'Alterar foto' : 'Carregar foto'}
                </Button>

                {previewUrl ? (
                  <Button type="button" variant="secondary" onClick={removeFoto} className="w-full">
                    Remover
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Campos principais */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nome da Obra"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                required
                placeholder="Ex: Construção de Prédio Residencial"
              />

              <Input
                label="Cliente"
                value={formData.cliente}
                onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
                required
                placeholder="Nome do cliente"
              />

              <Select
                label="Empresa"
                value={formData.empresa_id}
                onChange={(e) => setFormData({ ...formData, empresa_id: e.target.value })}
                options={empresaOptions}
              />

              <Select
                label="Status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                options={STATUS_OPTIONS}
                required
              />

              <Input
                label="Data de Início"
                type="date"
                value={formData.data_inicio}
                onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
                required
              />

              <Input
                label="Data Fim Prevista"
                type="date"
                value={formData.data_fim_prevista}
                onChange={(e) => setFormData({ ...formData, data_fim_prevista: e.target.value })}
                placeholder="Data prevista para conclusão"
              />
            </div>
          </div>
        </section>

        <div className="border-t border-slate-200 pt-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Endereço da Obra</h3>
          <AddressAutocomplete value={formData.address} onChange={(address) => setFormData({ ...formData, address })} />
        </div>

        <Textarea
          label="Descrição"
          value={formData.descricao}
          onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
          placeholder="Descrição detalhada da obra, objetivos, especificações técnicas..."
          rows={4}
        />
      </form>
    </Modal>
  );
}
