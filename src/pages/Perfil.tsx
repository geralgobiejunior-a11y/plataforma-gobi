// src/pages/Perfil.tsx
import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { LanguageSelector } from '../components/ui/LanguageSelector';
import {
  User,
  Mail,
  Phone,
  Briefcase,
  Shield,
  Save,
  Camera,
  AlertCircle,
  CheckCircle,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from '../lib/toast';
import { ImageUploadWithCrop } from '../components/ui/ImageUploadWithCrop';

interface UserProfile {
  user_id: string;
  nome: string | null;
  foto_url: string | null;
  telefone: string | null;
  idioma: string | null;
  cargo: string | null;
  nivel: number | null;
  role: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

const NIVEL_LABELS: Record<number, { label: string; description: string; variant: any }> = {
  1: {
    label: 'Nível 1 - Leitor',
    description: 'Pode visualizar informações, mas não pode criar ou editar',
    variant: 'default',
  },
  2: {
    label: 'Nível 2 - Operador',
    description: 'Pode criar e editar dados operacionais (documentos, presenças)',
    variant: 'warning',
  },
  3: {
    label: 'Nível 3 - Administrador',
    description: 'Acesso total ao sistema, incluindo gestão de utilizadores',
    variant: 'success',
  },
};

type FormState = {
  nome: string;
  telefone: string;
  idioma: string;
  cargo: string;
};

function SimpleModal({
  isOpen,
  title,
  onClose,
  children,
}: {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl
                     dark:border-slate-800/70 dark:bg-slate-900"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <div className="font-semibold text-slate-900 dark:text-slate-100">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50
                         dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800
                         flex items-center justify-center"
              aria-label="Fechar"
            >
              <X size={18} className="text-slate-700 dark:text-slate-200" />
            </button>
          </div>

          <div className="p-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function Perfil() {
  const { user } = useAuth();

  // Tipagem flexível (não te trava caso teu contexto seja diferente)
  const lang = useLanguage() as any;
  const t: (key: string) => string = lang?.t ?? ((s: string) => s);
  const currentLanguage: string = lang?.language ?? lang?.currentLanguage ?? 'pt-PT';
  const setLanguage: undefined | ((lng: string) => void) = lang?.setLanguage;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);

  const [formData, setFormData] = useState<FormState>({
    nome: '',
    telefone: '',
    idioma: 'pt-PT',
    cargo: '',
  });

  const [initialForm, setInitialForm] = useState<FormState | null>(null);

  // Mantém formData.idioma sempre alinhado com o LanguageContext
  useEffect(() => {
    setFormData((prev) => ({ ...prev, idioma: currentLanguage || prev.idioma }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLanguage]);

  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      loadProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const isDirty = useMemo(() => {
    if (!initialForm) return false;
    return (
      formData.nome !== initialForm.nome ||
      formData.telefone !== initialForm.telefone ||
      formData.idioma !== initialForm.idioma ||
      formData.cargo !== initialForm.cargo
    );
  }, [formData, initialForm]);

  const loadProfile = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProfile(data);

        const nextForm: FormState = {
          nome: data.nome || '',
          telefone: data.telefone || '',
          idioma: data.idioma || currentLanguage || 'pt-PT',
          cargo: data.cargo || '',
        };

        setFormData(nextForm);
        setInitialForm(nextForm);

        // Se teu contexto permitir, aplica o idioma salvo no perfil
        if (setLanguage && data.idioma && data.idioma !== currentLanguage) {
          setLanguage(data.idioma);
        }
      } else {
        const newProfile = {
          user_id: user.id,
          nome: user.email || 'Utilizador',
          nivel: 1,
          idioma: currentLanguage || 'pt-PT',
          is_active: true,
        };

        const { data: createdProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert([newProfile])
          .select()
          .single();

        if (createError) {
          console.error('Error creating profile:', createError);
          toast.error('Erro ao criar perfil. Contacte o administrador.');
          return;
        }

        setProfile(createdProfile);

        const nextForm: FormState = {
          nome: createdProfile.nome || '',
          telefone: createdProfile.telefone || '',
          idioma: createdProfile.idioma || currentLanguage || 'pt-PT',
          cargo: createdProfile.cargo || '',
        };

        setFormData(nextForm);
        setInitialForm(nextForm);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      toast.error('Erro ao carregar perfil');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    try {
      setSaving(true);

      // Garante que salva o idioma “real” que está no contexto
      const idiomaToSave = currentLanguage || formData.idioma || 'pt-PT';

      const updateData = {
        ...formData,
        idioma: idiomaToSave,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('user_profiles').update(updateData).eq('user_id', user.id);
      if (error) throw error;

      toast.success('Perfil atualizado com sucesso!');
      await loadProfile();
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Erro ao salvar perfil');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoSave = async (url: string) => {
    if (!user) return;

    try {
      setPhotoSaving(true);

      const { error } = await supabase
        .from('user_profiles')
        .update({
          foto_url: url,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success('Foto atualizada com sucesso!');
      setPhotoModalOpen(false);
      await loadProfile();
    } catch (error) {
      console.error('Error updating photo:', error);
      toast.error('Erro ao atualizar foto');
    } finally {
      setPhotoSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm animate-pulse
                      dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30"
        >
          <div className="h-6 w-56 rounded bg-slate-100 dark:bg-slate-800/70" />
          <div className="mt-3 h-4 w-96 rounded bg-slate-100 dark:bg-slate-800/70" />
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1 h-52 rounded-2xl bg-slate-100 dark:bg-slate-800/70" />
            <div className="md:col-span-2 h-52 rounded-2xl bg-slate-100 dark:bg-slate-800/70" />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Card
          className="rounded-2xl border border-slate-200 bg-white shadow-sm
                      dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30"
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-3 text-slate-500 dark:text-slate-400 py-12">
              <AlertCircle size={20} />
              <p>Perfil não encontrado</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const nivelInfo = NIVEL_LABELS[profile.nivel || 1];
  const displayName = (formData.nome || '').trim() || 'Utilizador';

  return (
    <div className="space-y-6 max-w-5xl">
      {/* CARD PRINCIPAL */}
      <Card
        className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden
                    dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30"
      >
        <div className="h-2 bg-gradient-to-r from-[#0B4F8A] via-[#0B4F8A]/70 to-[#F5A623]" />

        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-xl bg-[#0B4F8A]/10 flex items-center justify-center ring-1 ring-black/5
                           dark:bg-[#0B4F8A]/20 dark:ring-white/10"
              >
                <User className="text-[#0B4F8A] dark:text-[#66A7E6]" size={20} />
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {t('profile.title') || 'Meu Perfil'}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {t('profile.subtitle') || 'Gerir as suas informações pessoais'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant={profile.is_active ? 'success' : 'danger'}>
                {profile.is_active ? 'Conta ativa' : 'Conta suspensa'}
              </Badge>
              <Badge variant={nivelInfo.variant}>{nivelInfo.label}</Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* ESQUERDA: RESUMO + FOTO */}
            <div className="md:col-span-1">
              <div
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4
                           dark:border-slate-800/70 dark:bg-slate-900/40"
              >
                <div className="flex items-start gap-4">
                  <div className="relative">
                    {profile.foto_url ? (
                      <img
                        src={profile.foto_url}
                        alt={displayName}
                        className="h-20 w-20 rounded-2xl object-cover ring-2 ring-white shadow-sm dark:ring-slate-900"
                      />
                    ) : (
                      <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-[#0B4F8A] to-[#083B68] flex items-center justify-center ring-2 ring-white shadow-sm dark:ring-slate-900">
                        <User className="text-white" size={34} />
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setPhotoModalOpen(true)}
                      className="absolute -bottom-2 -right-2 h-9 w-9 rounded-xl bg-white border border-slate-200 shadow-sm
                                 flex items-center justify-center hover:bg-slate-50
                                 focus:outline-none focus:ring-2 focus:ring-[#0B4F8A]/30
                                 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
                      aria-label="Alterar foto"
                    >
                      <Camera size={16} className="text-slate-700 dark:text-slate-200" />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {displayName}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400 truncate">{email}</div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {profile.role ? <Badge variant="default">{profile.role}</Badge> : null}
                      {isDirty ? (
                        <Badge variant="warning">Alterações pendentes</Badge>
                      ) : (
                        <Badge variant="success">Tudo atualizado</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <Button
                    onClick={() => setPhotoModalOpen(true)}
                    className="w-full bg-[#0B4F8A] hover:bg-[#083B68]"
                  >
                    <Camera size={16} className="mr-2" />
                    Alterar foto
                  </Button>
                </div>

                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  PNG, JPG ou WEBP até 5MB.
                </p>
              </div>
            </div>

            {/* DIREITA: FORM */}
            <div className="md:col-span-2">
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Dados pessoais</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    Atualize apenas o necessário
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Nome completo"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="João Silva"
                    icon={<User size={16} />}
                  />

                  <Input
                    label="Email"
                    value={email}
                    disabled
                    placeholder="email@exemplo.com"
                    icon={<Mail size={16} />}
                    helperText="Email não pode ser alterado"
                  />

                  <Input
                    label="Telefone"
                    value={formData.telefone}
                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                    placeholder="+351 912 345 678"
                    icon={<Phone size={16} />}
                  />

                  {/* Idioma: UI + sincroniza com Supabase via currentLanguage */}
                  <div className="w-full">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                      Idioma
                    </label>
                    <div
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2.5
                                 dark:border-slate-800 dark:bg-slate-900"
                    >
                      <LanguageSelector />
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      O idioma selecionado é guardado no seu perfil.
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <Input
                      label="Cargo"
                      value={formData.cargo}
                      onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                      placeholder="Ex: Engenheiro Civil, Gestor de Obras, etc."
                      icon={<Briefcase size={16} />}
                    />
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (!initialForm) return;
                      setFormData(initialForm);
                      if (setLanguage && initialForm.idioma && initialForm.idioma !== currentLanguage) {
                        setLanguage(initialForm.idioma);
                      }
                    }}
                    disabled={!isDirty || saving}
                    className="dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
                  >
                    Cancelar
                  </Button>

                  <Button
                    onClick={handleSave}
                    disabled={saving || !isDirty}
                    className="bg-[#0B4F8A] hover:bg-[#083B68]"
                    title={!isDirty ? 'Sem alterações para guardar' : 'Guardar alterações'}
                  >
                    <Save size={16} className="mr-2" />
                    {saving ? 'A guardar...' : 'Guardar alterações'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CARD ACESSO */}
      <Card
        className="rounded-2xl border border-slate-200 bg-white shadow-sm
                    dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-black/30"
      >
        <CardHeader>
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center ring-1 ring-emerald-500/15
                          dark:bg-emerald-500/15 dark:ring-emerald-500/20"
            >
              <Shield className="text-emerald-600 dark:text-emerald-400" size={20} />
            </div>
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">Acesso e Permissões</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Informações sobre o seu nível de acesso (não editável)
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-4">
            <div
              className="rounded-xl border border-slate-200 bg-slate-50 p-4
                          dark:border-slate-800/70 dark:bg-slate-900/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Nível de acesso</span>
                    <Badge variant={nivelInfo.variant}>{nivelInfo.label}</Badge>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{nivelInfo.description}</p>
                </div>
              </div>
            </div>

            <div
              className="rounded-xl border border-slate-200 bg-slate-50 p-4
                          dark:border-slate-800/70 dark:bg-slate-900/40"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  {profile.is_active ? (
                    <CheckCircle className="text-emerald-600 dark:text-emerald-400" size={20} />
                  ) : (
                    <AlertCircle className="text-red-600 dark:text-red-400" size={20} />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Estado da conta</span>
                    <Badge variant={profile.is_active ? 'success' : 'danger'}>
                      {profile.is_active ? 'Ativa' : 'Suspensa'}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {profile.is_active
                      ? 'A sua conta está ativa e pode aceder às funcionalidades permitidas pelo seu nível.'
                      : 'A sua conta está suspensa. Contacte o administrador para mais informações.'}
                  </p>
                </div>
              </div>
            </div>

            <div
              className="rounded-xl border border-slate-200 bg-blue-50 p-4
                          dark:border-blue-900/30 dark:bg-blue-950/20"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="text-blue-600 dark:text-blue-400 flex-shrink-0" size={20} />
                <div className="text-sm text-blue-900 dark:text-blue-100">
                  <p className="font-medium mb-1">Informação importante</p>
                  <p className="text-blue-700 dark:text-blue-200">
                    O seu nível de acesso e estado da conta só podem ser alterados por um administrador de nível 3.
                    Se precisar de alterações, contacte o responsável do sistema.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MODAL FOTO */}
      <SimpleModal
        isOpen={photoModalOpen}
        title="Atualizar foto de perfil"
        onClose={() => setPhotoModalOpen(false)}
      >
        <div className="space-y-4">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Selecione uma imagem e ajuste o recorte (quadrado).
          </div>

          <div
            className="rounded-2xl border border-slate-200 bg-white p-4
                       dark:border-slate-800 dark:bg-slate-900/40"
          >
            <ImageUploadWithCrop
              bucket="perfis"
              currentImageUrl={profile.foto_url || undefined}
              onImageUploaded={handlePhotoSave}
              label={photoSaving ? 'A processar...' : 'Selecionar imagem'}
              icon={<Camera size={16} />}
              aspectRatio={1}
            />
          </div>

          <div className="flex justify-end">
            <Button
              variant="secondary"
              onClick={() => setPhotoModalOpen(false)}
              className="dark:bg-slate-900/40 dark:text-slate-100 dark:hover:bg-slate-900/60"
            >
              Fechar
            </Button>
          </div>
        </div>
      </SimpleModal>
    </div>
  );
}
