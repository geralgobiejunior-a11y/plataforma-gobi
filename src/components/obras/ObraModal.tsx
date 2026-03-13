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

function clean(value?: string | null) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasValidCoords(address: AddressData) {
  return Number.isFinite(Number(address.latitude)) && Number.isFinite(Number(address.longitude));
}

function buildEnderecoCompleto(address: AddressData) {
  const rua = clean(address.rua);
  const numeroPorta = clean(address.numeroPorta);
  const codigoPostal = clean(address.codigoPostal);
  const freguesia = clean(address.freguesia);
  const concelho = clean(address.concelho);
  const distrito = clean(address.distrito);

  const linha1 = [rua, numeroPorta].filter(Boolean).join(' ').trim();

  return [linha1, codigoPostal, freguesia, concelho, distrito, 'Portugal']
    .filter(Boolean)
    .join(', ');
}

function buildLocalizacao(address: AddressData, fallback?: string) {
  return clean(address.concelho) || clean(address.freguesia) || clean(address.distrito) || clean(fallback);
}

function normalizeCoordinate(value?: string | number | null) {
  if (value == null || value === '') return undefined;
  const num = Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : undefined;
}

function normalizeAddress(address?: Partial<AddressData> | null): AddressData {
  return {
    rua: clean(address?.rua),
    numeroPorta: clean(address?.numeroPorta),
    codigoPostal: clean(address?.codigoPostal),
    freguesia: clean(address?.freguesia),
    concelho: clean(address?.concelho),
    distrito: clean(address?.distrito),
    latitude: normalizeCoordinate(address?.latitude),
    longitude: normalizeCoordinate(address?.longitude),
  };
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
      latitude: undefined,
      longitude: undefined,
    },
  });

  const previewSrc = useMemo(() => {
    if (logoFile) return URL.createObjectURL(logoFile);
    return formData.logo_url || null;
  }, [logoFile, formData.logo_url]);

  const normalizedAddress = useMemo(() => normalizeAddress(formData.address), [formData.address]);
  const enderecoCompletoPreview = useMemo(() => buildEnderecoCompleto(normalizedAddress), [normalizedAddress]);
  const hasCoords = useMemo(() => hasValidCoords(normalizedAddress), [normalizedAddress]);

  const mapPreviewSrc = useMemo(() => {
    if (hasCoords) {
      return `https://www.google.com/maps?q=${normalizedAddress.latitude},${normalizedAddress.longitude}&z=18&output=embed`;
    }

    const query =
      enderecoCompletoPreview ||
      [
        clean(formData.nome),
        clean(normalizedAddress.concelho),
        clean(normalizedAddress.distrito),
        'Portugal',
      ]
        .filter(Boolean)
        .join(', ');

    if (!query) return '';

    return `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed`;
  }, [hasCoords, normalizedAddress, enderecoCompletoPreview, formData.nome]);

  useEffect(() => {
    return () => {
      if (previewSrc && logoFile) {
        URL.revokeObjectURL(previewSrc);
      }
    };
  }, [previewSrc, logoFile]);

  useEffect(() => {
    if (!isOpen) return;

    loadEmpresas();

    if (obraId) {
      void loadObra();
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
        address: normalizeAddress({
          rua: data.rua,
          numeroPorta: data.numero_porta,
          codigoPostal: data.codigo_postal,
          freguesia: data.freguesia,
          concelho: data.concelho,
          distrito: data.distrito,
          latitude: data.latitude,
          longitude: data.longitude,
        }),
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
        latitude: undefined,
        longitude: undefined,
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

  const updateAddress = (patch: Partial<AddressData>) => {
    setFormData((prev) => ({
      ...prev,
      address: normalizeAddress({
        ...prev.address,
        ...patch,
      }),
    }));
  };

  const clearCoords = () => {
    updateAddress({
      latitude: undefined,
      longitude: undefined,
    });
  };

  const handleManualCoordinateChange =
    (field: 'latitude' | 'longitude') => (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const normalized = raw === '' ? undefined : normalizeCoordinate(raw);

      setFormData((prev) => ({
        ...prev,
        address: {
          ...prev.address,
          [field]: normalized,
        },
      }));
    };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!clean(formData.nome) || !clean(formData.cliente) || !formData.data_inicio) {
      toast.error('Preencha Nome da Obra, Cliente e Data de Início.');
      return;
    }

    const normalized = normalizeAddress(formData.address);

    const enderecoCompleto = buildEnderecoCompleto(normalized);
    const localizacaoFinal = buildLocalizacao(normalized, formData.localizacao);

    const hasAnyAddressData =
      !!clean(normalized.rua) ||
      !!clean(normalized.numeroPorta) ||
      !!clean(normalized.codigoPostal) ||
      !!clean(normalized.freguesia) ||
      !!clean(normalized.concelho) ||
      !!clean(normalized.distrito);

    const hasExactAddressCore =
      !!clean(normalized.rua) &&
      !!clean(normalized.numeroPorta) &&
      !!clean(normalized.codigoPostal) &&
      !!clean(normalized.concelho);

    if (hasAnyAddressData && !hasExactAddressCore) {
      toast.error('Para guardar a morada exata da obra, preencha Rua, Nº da Porta, Código Postal e Concelho.');
      return;
    }

    if (
      (normalized.latitude != null && normalized.longitude == null) ||
      (normalized.latitude == null && normalized.longitude != null)
    ) {
      toast.error('Preencha latitude e longitude juntas, ou deixe ambas vazias.');
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

      const obraData = {
        logo_url: logoUrl,
        nome: clean(formData.nome),
        cliente: clean(formData.cliente),
        localizacao: localizacaoFinal || null,
        endereco: enderecoCompleto || null,

        rua: clean(normalized.rua) || null,
        numero_porta: clean(normalized.numeroPorta) || null,
        codigo_postal: clean(normalized.codigoPostal) || null,
        freguesia: clean(normalized.freguesia) || null,
        concelho: clean(normalized.concelho) || null,
        distrito: clean(normalized.distrito) || null,
        latitude: hasValidCoords(normalized) ? Number(normalized.latitude) : null,
        longitude: hasValidCoords(normalized) ? Number(normalized.longitude) : null,

        empresa_id: clean(formData.empresa_id) || null,
        status: clean(formData.status) || 'ativa',

        data_inicio: formData.data_inicio || null,
        data_fim_prevista: formData.data_fim_prevista || null,

        descricao: clean(formData.descricao) || null,
      };

      console.log('DEBUG address before save:', normalized);
      console.log('DEBUG obraData before save:', obraData);

      if (obraId) {
        const { error } = await supabase.from('obras').update(obraData).eq('id', obraId);
        if (error) throw error;

        toast.success('Obra atualizada com sucesso');

        if (user) {
          await createNotification(
            user.id,
            'obra',
            'Obra atualizada',
            `A obra "${clean(formData.nome)}" foi atualizada.`
          );
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
            `A obra "${clean(formData.nome)}" foi criada para o cliente ${clean(formData.cliente)}.`
          );
        }
      }

      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Erro ao salvar obra:', error);
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
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="space-y-6"
      >
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
            <div className="space-y-2">
              <div
                className="w-full aspect-video rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-neutral-50 dark:bg-neutral-900"
                title="Pré-visualização"
              >
                {previewSrc ? (
                  <img src={previewSrc} alt="Foto da obra" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-neutral-500 dark:text-neutral-400">
                    Sem foto
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={openFotoPicker} className="w-full">
                  {previewSrc ? 'Alterar foto' : 'Carregar foto'}
                </Button>

                {previewSrc ? (
                  <Button type="button" variant="secondary" onClick={removeFoto} className="w-full">
                    Remover
                  </Button>
                ) : null}
              </div>
            </div>

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

        <div className="border-t border-slate-200 pt-6 space-y-5">
          <h3 className="text-lg font-semibold text-slate-900 mb-1">Endereço da Obra</h3>

          <AddressAutocomplete
            value={formData.address}
            onChange={(address) =>
              setFormData((prev) => ({
                ...prev,
                address: normalizeAddress(address),
              }))
            }
          />

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Coordenadas manuais</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Se o endereço automático errar, cole ou ajuste manualmente latitude e longitude.
                </p>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={clearCoords}
                  disabled={loading}
                >
                  Limpar coordenadas
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Latitude"
                value={normalizedAddress.latitude != null ? String(normalizedAddress.latitude) : ''}
                onChange={handleManualCoordinateChange('latitude')}
                placeholder="Ex: 38.70407242289292"
              />

              <Input
                label="Longitude"
                value={normalizedAddress.longitude != null ? String(normalizedAddress.longitude) : ''}
                onChange={handleManualCoordinateChange('longitude')}
                placeholder="Ex: -9.420752896585403"
              />
            </div>

            {hasCoords ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="text-sm font-medium text-emerald-900">Coordenadas ativas</div>
                <div className="text-xs text-emerald-700 mt-1">
                  Lat: {Number(normalizedAddress.latitude).toFixed(12)}, Lng: {Number(normalizedAddress.longitude).toFixed(12)}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-sm font-medium text-amber-900">Sem coordenadas definidas</div>
                <div className="text-xs text-amber-700 mt-1">
                  Pode usar a busca automática acima ou colar manualmente os valores certos.
                </div>
              </div>
            )}

            {mapPreviewSrc ? (
              <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white">
                <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                  <div className="text-sm font-medium text-slate-900">Pré-visualização do ponto</div>
                  <div className="text-xs text-slate-500 mt-1 break-all">
                    {enderecoCompletoPreview || buildLocalizacao(normalizedAddress, formData.localizacao) || 'Sem morada suficiente'}
                  </div>
                </div>

                <div className="h-[280px]">
                  <iframe
                    title="Pré-visualização da localização da obra"
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    src={mapPreviewSrc}
                  />
                </div>
              </div>
            ) : null}

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="text-xs text-blue-900">
                <strong>Dica:</strong> para obras novas ou terrenos, o ideal é confirmar no Google Maps e colar aqui a latitude e longitude corretas manualmente.
              </div>
            </div>
          </div>
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