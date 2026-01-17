// src/components/colaboradores/ColaboradorModal.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { uploadFile } from '../../lib/storage';
import { toast } from '../../lib/toast';
import { useAuth } from '../../contexts/AuthContext';
import { createNotification } from '../../lib/notifications';

interface ColaboradorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  colaboradorId?: string | null;
}

interface FormData {
  foto_url: string | null;
  nome_completo: string;
  apelido: string;

  nif: string;
  niss: string;
  codigo_funcionario: string;

  genero: string;
  data_nascimento: string;

  categoria: string;
  data_entrada_plataforma: string;

  valor_hora: string;

  email: string;
  telefone: string;
  iban: string;

  status: string;

  morada: string;
  observacoes: string;
}

const CATEGORIAS = [
  { value: 'Canalizador', label: 'Canalizador' },
  { value: 'Ajudante', label: 'Ajudante' },
  { value: 'Oficial', label: 'Oficial' },
  { value: 'Encarregado', label: 'Encarregado' },
  { value: 'Outro', label: 'Outro' },
];

const GENEROS = [
  { value: 'Masculino', label: 'Masculino' },
  { value: 'Feminino', label: 'Feminino' },
  { value: 'Outro', label: 'Outro' },
  { value: 'Prefiro não dizer', label: 'Prefiro não dizer' },
];

const STATUS_OPTIONS = [
  { value: 'ativo', label: 'Ativo' },
  { value: 'inativo', label: 'Inativo' },
  { value: 'ferias', label: 'Férias' },
  { value: 'baixa', label: 'Baixa' },
];

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function onlyDigits(v: string) {
  return (v || '').replace(/\D+/g, '');
}

function normalizeIban(v: string) {
  return (v || '').replace(/\s+/g, '').toUpperCase();
}

function safeParseMoney(v: string) {
  const x = Number(String(v).replace(',', '.'));
  return Number.isFinite(x) ? x : NaN;
}

function splitNomeFromDB(nomeCompletoDB: string, apelidoDB?: string | null) {
  const full = String(nomeCompletoDB || '').trim();
  const apDB = String(apelidoDB || '').trim();

  if (!full) return { nome: '', apelido: apDB || '' };

  if (apDB) {
    const fullLower = full.toLowerCase();
    const apLower = apDB.toLowerCase();
    if (fullLower === apLower) return { nome: '', apelido: apDB };
    if (fullLower.endsWith(` ${apLower}`)) {
      const nome = full.slice(0, full.length - apDB.length).trim();
      return { nome, apelido: apDB };
    }
    return { nome: full, apelido: apDB };
  }

  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { nome: full, apelido: '' };

  const apelido = parts.pop() || '';
  const nome = parts.join(' ');
  return { nome, apelido };
}

const emptyForm = (): FormData => ({
  foto_url: null,
  nome_completo: '',
  apelido: '',
  nif: '',
  niss: '',
  codigo_funcionario: '',
  genero: 'Masculino',
  data_nascimento: '',
  categoria: 'Canalizador',
  data_entrada_plataforma: todayISO(),
  valor_hora: '',
  email: '',
  telefone: '',
  iban: '',
  status: 'ativo',
  morada: '',
  observacoes: '',
});

export function ColaboradorModal({ isOpen, onClose, onSuccess, colaboradorId }: ColaboradorModalProps) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [formData, setFormData] = useState<FormData>(emptyForm());
  const isEdit = Boolean(colaboradorId);

  // ====== NIF duplicate (UX) ======
  const [nifDupInfo, setNifDupInfo] = useState<{ id: string; nome: string } | null>(null);
  const [checkingNif, setCheckingNif] = useState(false);

  const setField = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    if (fotoFile) {
      const url = URL.createObjectURL(fotoFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(formData.foto_url || null);
  }, [fotoFile, formData.foto_url]);

  useEffect(() => {
    if (!isOpen) return;

    // reset avisos ao abrir
    setNifDupInfo(null);
    setCheckingNif(false);

    if (colaboradorId) {
      loadColaborador();
      return;
    }

    setFormData((prev) => ({
      ...emptyForm(),
      codigo_funcionario: prev.codigo_funcionario || '',
    }));

    setFotoFile(null);
    setPreviewUrl(null);
    generateCodigoFuncionarioSafe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, colaboradorId]);

  const loadColaborador = async () => {
    if (!colaboradorId) return;

    const { data, error } = await supabase.from('colaboradores').select('*').eq('id', colaboradorId).single();

    if (error) {
      console.error(error);
      toast.error('Erro ao carregar colaborador');
      return;
    }

    if (data) {
      const { nome, apelido } = splitNomeFromDB(data.nome_completo || '', data.apelido);

      setFormData({
        foto_url: data.foto_url || null,
        nome_completo: nome || '',
        apelido: apelido || '',
        nif: data.nif || '',
        niss: data.niss || '',
        codigo_funcionario: data.codigo_funcionario || '',
        genero: data.genero || 'Masculino',
        data_nascimento: data.data_nascimento || '',
        categoria: data.categoria || 'Canalizador',
        data_entrada_plataforma: data.data_entrada_plataforma || todayISO(),
        valor_hora: data.valor_hora?.toString() || '',
        email: data.email || '',
        telefone: data.telefone || '',
        iban: data.iban || '',
        status: String(data.status || 'ativo').toLowerCase(),
        morada: data.morada || '',
        observacoes: data.observacoes || '',
      });

      setFotoFile(null);
    }
  };

  const generateCodigoFuncionarioSafe = async () => {
    try {
      const { data, error } = await supabase
        .from('colaboradores')
        .select('codigo_funcionario')
        .ilike('codigo_funcionario', 'FUNC%')
        .order('codigo_funcionario', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error(error);
        setFormData((prev) => ({ ...prev, codigo_funcionario: prev.codigo_funcionario || `FUNC0001` }));
        return;
      }

      const last = String(data?.codigo_funcionario || '').trim();
      const m = last.match(/^FUNC(\d+)$/i);
      const lastNum = m ? Number(m[1]) : 0;
      const nextNum = Number.isFinite(lastNum) ? lastNum + 1 : 1;

      setFormData((prev) => ({
        ...prev,
        codigo_funcionario: `FUNC${String(nextNum).padStart(4, '0')}`,
      }));
    } catch (e) {
      console.error(e);
      setFormData((prev) => ({ ...prev, codigo_funcionario: prev.codigo_funcionario || `FUNC0001` }));
    }
  };

  const checkNifDuplicate = useCallback(
    async (nifRaw: string) => {
      const nif = onlyDigits(nifRaw);
      if (nif.length !== 9) {
        setNifDupInfo(null);
        return;
      }

      setCheckingNif(true);
      try {
        let q = supabase.from('colaboradores').select('id, nome_completo').eq('nif', nif).limit(1);
        if (colaboradorId) q = q.neq('id', colaboradorId);

        const { data, error } = await q.maybeSingle();
        if (error) throw error;

        if (data?.id) setNifDupInfo({ id: data.id, nome: data.nome_completo || 'Sem nome' });
        else setNifDupInfo(null);
      } catch (e) {
        console.error('CHECK_NIF_ERROR', e);
        // não bloqueia por erro de rede
        setNifDupInfo(null);
      } finally {
        setCheckingNif(false);
      }
    },
    [colaboradorId]
  );

  // Debounce: verifica NIF quando tiver 9 dígitos
  useEffect(() => {
    if (!isOpen) return;

    const nif = onlyDigits(formData.nif);
    if (nif.length !== 9) {
      setNifDupInfo(null);
      return;
    }

    const t = setTimeout(() => {
      checkNifDuplicate(formData.nif);
    }, 350);

    return () => clearTimeout(t);
  }, [formData.nif, isOpen, checkNifDuplicate]);

  const openFotoPicker = () => fileInputRef.current?.click();

  const handleFotoPicked = (file: File | null) => {
    if (!file) return;

    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowed.has(file.type)) {
      toast.error('Formato inválido. Use JPG, PNG ou WEBP.');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Arquivo muito grande. Máximo 5MB.');
      return;
    }

    setFotoFile(file);
  };

  const removeFoto = () => {
    setFotoFile(null);
    setField('foto_url', null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Obrigatórios: Nome + Data Nascimento + NIF (9) + NISS (11)
  // E: não permitir salvar se NIF duplicado ou em verificação
  const canSubmit = useMemo(() => {
    const nome = formData.nome_completo.trim();
    const nif = onlyDigits(formData.nif);
    const niss = onlyDigits(formData.niss);

    if (!nome) return false;
    if (!formData.data_nascimento) return false;
    if (nif.length !== 9) return false;
    if (niss.length !== 11) return false;

    if (checkingNif) return false;
    if (nifDupInfo) return false;

    return true;
  }, [formData, nifDupInfo, checkingNif]);

  const handleClose = useCallback(() => {
    setFormData(emptyForm());
    setFotoFile(null);
    setPreviewUrl(null);
    setNifDupInfo(null);
    setCheckingNif(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  }, [onClose]);

  const handleSubmit = async (e?: any) => {
    e?.preventDefault?.();
    if (loading) return;

    if (!canSubmit) {
      if (nifDupInfo) {
        toast.error(`Este NIF já está registado em: ${nifDupInfo.nome}`);
      } else if (checkingNif) {
        toast.error('A verificar NIF… aguarde um instante.');
      } else {
        toast.error('Preencha Nome, Data de Nascimento, NIF e NISS corretamente.');
      }
      return;
    }

    setLoading(true);

    try {
      let fotoUrl = formData.foto_url;

      if (fotoFile) {
        // Mantém o teu helper. Se ele ainda der 409 por path, ajusta o helper para upsert/unique name.
        const { url, error: uploadError } = await uploadFile('avatars-colaboradores', 'colaboradores', fotoFile);
        if (uploadError) {
          console.error(uploadError);
          toast.error('Erro ao fazer upload da foto');
          setLoading(false);
          return;
        }
        fotoUrl = url;
      }

      const nome = formData.nome_completo.trim();
      const apelido = formData.apelido.trim();
      const nomeCompletoFinal = [nome, apelido].filter(Boolean).join(' ').trim();

      const valorHoraParsed = safeParseMoney(formData.valor_hora);
      const ibanNorm = normalizeIban(formData.iban);
      const codigoFunc = (formData.codigo_funcionario || '').trim();

      const nifDigits = onlyDigits(formData.nif);

      // Segurança extra (anti-corrida): valida NIF duplicado no submit
      {
        let q = supabase.from('colaboradores').select('id, nome_completo').eq('nif', nifDigits).limit(1);
        if (colaboradorId) q = q.neq('id', colaboradorId);

        const { data: dup, error: dupErr } = await q.maybeSingle();
        if (dupErr) throw dupErr;

        if (dup?.id) {
          toast.error(`Este NIF já está registado em: ${dup.nome_completo || 'Sem nome'}`);
          setLoading(false);
          return;
        }
      }

      const colaboradorData = {
        foto_url: fotoUrl,

        // Obrigatórios
        nome_completo: nomeCompletoFinal,
        data_nascimento: formData.data_nascimento,
        nif: nifDigits,
        niss: onlyDigits(formData.niss),

        // Opcionais
        apelido: apelido || null,
        codigo_funcionario: codigoFunc ? codigoFunc.toUpperCase() : null,
        genero: (formData.genero || '').trim() || null,
        categoria: (formData.categoria || '').trim() || null,
        data_entrada_plataforma: formData.data_entrada_plataforma || null,
        valor_hora: Number.isFinite(valorHoraParsed) && valorHoraParsed > 0 ? valorHoraParsed : null,
        email: (formData.email || '').trim() || null,
        telefone: (formData.telefone || '').trim() || null,
        iban: ibanNorm ? ibanNorm : null,
        status: String(formData.status || 'ativo').toLowerCase(),
        morada: (formData.morada || '').trim() || null,
        observacoes: (formData.observacoes || '').trim() || null,
      };

      if (colaboradorId) {
        const { error } = await supabase
          .from('colaboradores')
          .update(colaboradorData)
          .eq('id', colaboradorId)
          .select('id')
          .single();

        if (error) throw error;

        toast.success('Colaborador atualizado com sucesso');

        if (user) {
          await createNotification(
            user.id,
            'colaborador',
            'Colaborador atualizado',
            `O perfil de ${nomeCompletoFinal} foi atualizado com sucesso.`
          );
        }
      } else {
        const { error } = await supabase
          .from('colaboradores')
          .insert([colaboradorData])
          .select('id')
          .single();

        if (error) throw error;

        toast.success('Colaborador criado com sucesso');

        if (user) {
          await createNotification(
            user.id,
            'colaborador',
            'Novo colaborador adicionado',
            `${nomeCompletoFinal} foi adicionado à equipa.`
          );
        }
      }

      onSuccess();
      handleClose();
    } catch (error: any) {
      const msg = String(error?.message || '');
      const code = error?.code;

      if (code === '23505' && msg.includes('colaboradores_nif_unique')) {
        toast.error('Este NIF já está registado noutro colaborador.');
      } else {
        toast.error(error?.message || error?.details || 'Erro ao salvar colaborador');
      }

      console.error('SAVE_COLAB_ERROR', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        status: error?.status,
        raw: error,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEdit ? 'Editar Colaborador' : 'Novo Colaborador'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={loading} disabled={!canSubmit || loading}>
            {isEdit ? 'Salvar Alterações' : 'Criar Colaborador'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-7">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Foto e identificação</h3>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">Recomendado: retrato 3x4</div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFotoPicked(e.target.files?.[0] ?? null)}
          />

          <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-5 items-start">
            <div className="flex flex-col gap-3">
              <div className="w-28 sm:w-32 aspect-[3/4] rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-neutral-50 dark:bg-neutral-900">
                {previewUrl ? (
                  <img src={previewUrl} alt="Foto do colaborador" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-neutral-500 dark:text-neutral-400">
                    Sem foto
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Button type="button" onClick={openFotoPicker} variant="secondary" className="w-full">
                  {previewUrl ? 'Alterar foto' : 'Carregar foto'}
                </Button>

                {(previewUrl || formData.foto_url) ? (
                  <Button type="button" onClick={removeFoto} variant="secondary" className="w-full">
                    Remover foto
                  </Button>
                ) : null}

                <div className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                  JPG/PNG/WEBP • Máx 5MB
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Nome"
                  value={formData.nome_completo}
                  onChange={(e) => setField('nome_completo', e.target.value)}
                  required
                  placeholder="João"
                />

                <Input
                  label="Apelido (opcional)"
                  value={formData.apelido}
                  onChange={(e) => setField('apelido', e.target.value)}
                  placeholder="Silva"
                />

                <Input
                  label="Código Funcionário (opcional)"
                  value={formData.codigo_funcionario}
                  onChange={(e) => setField('codigo_funcionario', e.target.value.toUpperCase())}
                  placeholder="FUNC0001"
                />

                <Select
                  label="Status (opcional)"
                  value={formData.status}
                  onChange={(e) => setField('status', e.target.value)}
                  options={STATUS_OPTIONS}
                />
              </div>
            </div>
          </div>
        </section>

        <div className="h-px bg-neutral-200 dark:bg-neutral-800" />

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Dados pessoais</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Género (opcional)"
              value={formData.genero}
              onChange={(e) => setField('genero', e.target.value)}
              options={GENEROS}
            />

            <Input
              label="Data de Nascimento"
              type="date"
              value={formData.data_nascimento}
              onChange={(e) => setField('data_nascimento', e.target.value)}
              required
            />

            {/* NIF com aviso inline */}
            <div className="space-y-1">
              <Input
                label="NIF"
                value={formData.nif}
                onChange={(e) => setField('nif', onlyDigits(e.target.value).slice(0, 9))}
                required
                placeholder="123456789"
                maxLength={9}
              />

              {checkingNif && (
                <div className="text-xs text-neutral-500 dark:text-neutral-400">A verificar NIF…</div>
              )}

              {nifDupInfo && (
                <div className="text-xs font-medium text-red-600 dark:text-red-400">
                  Este NIF já está registado em: {nifDupInfo.nome}
                </div>
              )}
            </div>

            <Input
              label="NISS (Segurança Social)"
              value={formData.niss}
              onChange={(e) => setField('niss', onlyDigits(e.target.value).slice(0, 11))}
              required
              placeholder="12345678901"
              maxLength={11}
            />
          </div>
        </section>

        <div className="h-px bg-neutral-200 dark:bg-neutral-800" />

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Contrato e plataforma</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Categoria (opcional)"
              value={formData.categoria}
              onChange={(e) => setField('categoria', e.target.value)}
              options={CATEGORIAS}
            />

            <Input
              label="Data de Entrada (opcional)"
              type="date"
              value={formData.data_entrada_plataforma}
              onChange={(e) => setField('data_entrada_plataforma', e.target.value)}
            />

            <Input
              label="Valor/Hora (€) (opcional)"
              type="number"
              step="0.01"
              min="0"
              value={formData.valor_hora}
              onChange={(e) => setField('valor_hora', e.target.value)}
              placeholder="12.50"
            />
          </div>
        </section>

        <div className="h-px bg-neutral-200 dark:bg-neutral-800" />

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Contacto e pagamento</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Email (opcional)"
              type="email"
              value={formData.email}
              onChange={(e) => setField('email', e.target.value)}
              placeholder="colaborador@email.pt"
            />

            <Input
              label="Telefone (opcional)"
              type="tel"
              value={formData.telefone}
              onChange={(e) => setField('telefone', e.target.value)}
              placeholder="912345678"
            />

            <Input
              label="IBAN (opcional)"
              value={formData.iban}
              onChange={(e) => setField('iban', normalizeIban(e.target.value).slice(0, 34))}
              placeholder="PT50..."
              maxLength={34}
            />
          </div>
        </section>

        <div className="h-px bg-neutral-200 dark:bg-neutral-800" />

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Morada e observações</h3>

          <Input
            label="Morada (opcional)"
            value={formData.morada}
            onChange={(e) => setField('morada', e.target.value)}
            placeholder="Rua, número, localidade"
          />

          <Textarea
            label="Observações (opcional)"
            value={formData.observacoes}
            onChange={(e) => setField('observacoes', e.target.value)}
            placeholder="Notas adicionais sobre o colaborador..."
            rows={3}
          />
        </section>
      </form>
    </Modal>
  );
}
