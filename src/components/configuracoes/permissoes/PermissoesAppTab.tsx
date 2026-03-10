// src/components/configuracoes/permissoes/PermissoesAppTab.tsx
import { useEffect, useMemo, useState } from 'react';
import {
  Smartphone,
  Users,
  Building2,
  Search,
  RefreshCcw,
  Link2,
  Unlink2,
  Plus,
  Copy,
  CheckCircle2,
  XCircle,
  UserCircle2,
  X as XIcon,
  Mail,
  Phone,
  Shield,
  KeyRound,
} from 'lucide-react';

import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Input } from '../../ui/Input';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';

type ColaboradorRow = {
  id: string;
  nome_completo: string | null;
  email: string | null;
  status: string | null;
  categoria: string | null;
  user_id: string | null;
  avatar_url?: string | null;
};

type ObraRow = {
  id: string;
  nome?: string | null;
  titulo?: string | null;
  cliente?: string | null;
  status?: string | null;
};

type ObraEncarregadoRow = {
  id: string;
  obra_id: string;
  encarregado_user_id: string;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
};

const cardBase =
  'border border-slate-200 bg-white shadow-sm ' +
  'dark:border-slate-800/70 dark:bg-slate-950/30 dark:shadow-black/30';

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v || '').trim()
  );
}

function safeStr(v: any) {
  const s = String(v ?? '').trim();
  return s.length ? s : '—';
}

function initials(name: string) {
  const n = (name || '').trim();
  if (!n) return '—';
  const parts = n.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || '';
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : '';
  return (a + b).toUpperCase() || n.slice(0, 2).toUpperCase();
}

function colabDisplayName(c: ColaboradorRow) {
  const n = (c.nome_completo ?? '').toString().trim();
  return n.length ? n : c.id;
}

function obraDisplayName(o: ObraRow) {
  const n = (o.nome ?? o.titulo ?? '').toString().trim();
  return n.length ? n : o.id;
}

async function selectColaboradoresSmart(): Promise<{ data: ColaboradorRow[]; error: any }> {
  const tries = [
    supabase
      .from('colaboradores')
      .select('id,nome_completo,email,status,categoria,user_id,avatar_url')
      .order('nome_completo', { ascending: true })
      .limit(2000),
    supabase
      .from('colaboradores')
      .select('id,nome_completo,email,status,categoria,user_id,foto_url')
      .order('nome_completo', { ascending: true })
      .limit(2000),
    supabase
      .from('colaboradores')
      .select('id,nome_completo,email,status,categoria,user_id,foto')
      .order('nome_completo', { ascending: true })
      .limit(2000),
    supabase
      .from('colaboradores')
      .select('id,nome_completo,email,status,categoria,user_id,imagem_url')
      .order('nome_completo', { ascending: true })
      .limit(2000),
    supabase
      .from('colaboradores')
      .select('id,nome_completo,email,status,categoria,user_id')
      .order('nome_completo', { ascending: true })
      .limit(2000),
  ];

  for (const req of tries) {
    const res = await req;
    if (!res.error) {
      const rows = (res.data as any[]) || [];
      const data: ColaboradorRow[] = rows.map((r) => ({
        id: String(r.id),
        nome_completo: r.nome_completo ?? null,
        email: r.email ?? null,
        status: r.status ?? null,
        categoria: r.categoria ?? null,
        user_id: r.user_id ?? null,
        avatar_url: (r.avatar_url ?? r.foto_url ?? r.foto ?? r.imagem_url ?? null) as any,
      }));
      return { data, error: null };
    }
  }

  const last = await tries[tries.length - 1];
  return { data: [], error: last.error };
}

async function selectObrasSmart(): Promise<{ data: ObraRow[]; error: any }> {
  const tries = [
    supabase.from('obras').select('id,nome,cliente,status').order('nome', { ascending: true }).limit(2000),
    supabase.from('obras').select('id,nome,status').order('nome', { ascending: true }).limit(2000),
    supabase.from('obras').select('id,titulo,cliente,status').order('titulo', { ascending: true }).limit(2000),
    supabase.from('obras').select('id').order('id', { ascending: true }).limit(2000),
    supabase.from('obras').select('*').limit(300),
  ];

  for (const req of tries) {
    const res = await req;
    if (!res.error) return { data: (res.data as any[]) as ObraRow[], error: null };
  }
  const last = await tries[tries.length - 1];
  return { data: [], error: last.error };
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copiado');
  } catch (e) {
    console.error(e);
    toast.error('Não foi possível copiar');
  }
}

// ======= NOVO: tipos e helper do create-user
type CreateUserMode = 'invite' | 'password';

type CreateUserBody = {
  colaborador_id: string;
  mode: CreateUserMode;
  email: string;
  password?: string;
  nome_completo: string;
  telefone?: string | null;
  categoria?: string | null;
  role?: string;
  idioma?: string;
};

export function PermissoesAppTab() {
  const [loading, setLoading] = useState(true);

  // Directory
  const [colabs, setColabs] = useState<ColaboradorRow[]>([]);
  const [obras, setObras] = useState<ObraRow[]>([]);

  // Acesso do App (link/unlink)
  const [colabSearch, setColabSearch] = useState('');
  const [selectedColabId, setSelectedColabId] = useState<string>('');
  const [linking, setLinking] = useState(false);

  // Encarregados por obra
  const [obraSearch, setObraSearch] = useState('');
  const [selectedObraId, setSelectedObraId] = useState<string>('');
  const [encarregados, setEncarregados] = useState<ObraEncarregadoRow[]>([]);
  const [loadingEnc, setLoadingEnc] = useState(false);
  const [savingEnc, setSavingEnc] = useState(false);

  // Picker para adicionar encarregado sem UID
  const [encPickerOpen, setEncPickerOpen] = useState(false);
  const [encPersonQuery, setEncPersonQuery] = useState('');
  const [encSelectedUserId, setEncSelectedUserId] = useState<string>('');

  // ===== NOVO: modal criar acesso
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [createMode, setCreateMode] = useState<CreateUserMode>('invite');
  const [createNome, setCreateNome] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createTelefone, setCreateTelefone] = useState('');
  const [createCategoria, setCreateCategoria] = useState('');
  const [createRole, setCreateRole] = useState('operacoes');
  const [createPassword, setCreatePassword] = useState('');

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAll = async () => {
    setLoading(true);

    const [colabsRes, obrasRes] = await Promise.all([selectColaboradoresSmart(), selectObrasSmart()]);

    if (colabsRes.error) {
      console.error(colabsRes.error);
      toast.error('Sem acesso para listar colaboradores (RLS).');
      setColabs([]);
    } else {
      setColabs(colabsRes.data);
    }

    if (obrasRes.error) {
      console.error(obrasRes.error);
      toast.error('Sem acesso para listar obras (RLS/schema).');
      setObras([]);
    } else {
      setObras(obrasRes.data);
    }

    setLoading(false);
  };

  const selectedColab = useMemo(
    () => colabs.find((c) => c.id === selectedColabId) ?? null,
    [colabs, selectedColabId]
  );

  const selectedObra = useMemo(
    () => obras.find((o) => o.id === selectedObraId) ?? null,
    [obras, selectedObraId]
  );

  const colabsFiltered = useMemo(() => {
    const s = colabSearch.trim().toLowerCase();
    const list = colabs;
    if (!s) return list.slice(0, 60);

    return list
      .filter((c) => {
        const hay = `${c.nome_completo ?? ''} ${c.email ?? ''} ${c.status ?? ''} ${c.categoria ?? ''}`.toLowerCase();
        return hay.includes(s);
      })
      .slice(0, 60);
  }, [colabs, colabSearch]);

  const obrasFiltered = useMemo(() => {
    const s = obraSearch.trim().toLowerCase();
    const list = obras;
    if (!s) return list.slice(0, 60);

    return list
      .filter((o) => {
        const hay = `${obraDisplayName(o)} ${o.cliente ?? ''} ${o.status ?? ''}`.toLowerCase();
        return hay.includes(s);
      })
      .slice(0, 60);
  }, [obras, obraSearch]);

  // Diretório por user_id (para mapear encarregados -> perfil)
  const colabByUserId = useMemo(() => {
    const map = new Map<string, ColaboradorRow>();
    for (const c of colabs) {
      const uid = String(c.user_id ?? '').trim();
      if (isUuid(uid)) map.set(uid, c);
    }
    return map;
  }, [colabs]);

  // Apenas colaboradores com user_id ligado e ativos (para atribuir encarregado)
  const encCandidates = useMemo(() => {
    const base = colabs
      .filter((c) => isUuid(String(c.user_id ?? '').trim()))
      .filter((c) => String(c.status ?? '').toLowerCase() === 'ativo' || String(c.status ?? '').toLowerCase() === 'active');

    const q = encPersonQuery.trim().toLowerCase();
    if (!q) return base.slice(0, 10);

    return base
      .filter((c) => `${c.nome_completo ?? ''} ${c.email ?? ''}`.toLowerCase().includes(q))
      .slice(0, 10);
  }, [colabs, encPersonQuery]);

  // ===== NOVO: criar acesso (Edge Function)
 const openCreateModal = (prefill?: Partial<CreateUserBody>) => {
  const c = selectedColab;

  setCreateMode(prefill?.mode ?? 'invite');
  setCreateNome(prefill?.nome_completo ?? c?.nome_completo ?? '');
  setCreateEmail(prefill?.email ?? c?.email ?? '');
  setCreateTelefone(String(prefill?.telefone ?? ''));
  setCreateCategoria(String(prefill?.categoria ?? c?.categoria ?? ''));
  setCreateRole(prefill?.role ?? 'operacoes');
  setCreatePassword('');
  setCreateOpen(true);
};

 const createAccess = async () => {
  const email = createEmail.trim().toLowerCase();
  const nome = createNome.trim();

  if (!selectedColab) {
    toast.error('Selecione primeiro um colaborador.');
    return;
  }

  if (!email || !email.includes('@')) {
    toast.error('Email inválido.');
    return;
  }

  if (!nome) {
    toast.error('Nome completo é obrigatório.');
    return;
  }

  if (createMode === 'password' && createPassword.trim().length < 8) {
    toast.error('Senha temporária deve ter pelo menos 8 caracteres.');
    return;
  }

  if (selectedColab.user_id && isUuid(String(selectedColab.user_id))) {
    toast.error('Este colaborador já tem acesso ao app.');
    return;
  }

  setCreating(true);
  try {
    const body = {
      colaborador_id: selectedColab.id,
      email,
      nome_completo: nome,
      telefone: createTelefone.trim() || null,
      categoria: createCategoria.trim() || null,
      role: (createRole || 'operacoes').trim(),
      mode: createMode,
      password: createMode === 'password' ? createPassword : undefined,
    };

    const res = await supabase.functions.invoke('create-colaborador-access', {
      body,
    });

    if (res.error) {
      console.error(res.error);
      toast.error(res.error.message || 'Falha ao criar acesso.');
      return;
    }

    const payload = res.data as any;

    if (!payload?.ok) {
      toast.error(payload?.error || 'Falha ao criar acesso.');
      return;
    }

    if (payload?.temporary_password) {
      toast.success(`Acesso criado. Senha temporária: ${payload.temporary_password}`);
    } else if (createMode === 'invite') {
      toast.success('Acesso criado e convite enviado.');
    } else {
      toast.success('Acesso criado com sucesso.');
    }

    const reload = await selectColaboradoresSmart();
    if (!reload.error) {
      setColabs(reload.data);

      const updated =
        reload.data.find((c) => c.id === selectedColab.id) ??
        reload.data.find((c) => String(c.email ?? '').trim().toLowerCase() === email) ??
        null;

      if (updated) {
        setSelectedColabId(updated.id);
      }
    }

    setCreateOpen(false);
  } catch (e: any) {
    console.error(e);
    toast.error(e?.message || 'Falha inesperada ao criar acesso.');
  } finally {
    setCreating(false);
  }
};

  // ===== Acesso App: link/unlink (mantive seu unlink como está)
  const linkAccess = async (mode: 'link' | 'unlink') => {
    if (!selectedColab) {
      toast.error('Selecione um colaborador.');
      return;
    }

    const currentUid = String(selectedColab.user_id ?? '').trim();

    if (mode === 'link') {
      // NOVO comportamento: se não tem acesso ainda, abre modal pre-preenchido
      // (na prática, você vai usar o "Create" mesmo. “Ligar via UID” pode virar um segundo modal depois)
      if (isUuid(currentUid)) {
        toast.error('Este colaborador já tem acesso ao app.');
        return;
      }
      openCreateModal({
        email: selectedColab.email ?? '',
        nome_completo: selectedColab.nome_completo ?? '',
        telefone: null,
        categoria: selectedColab.categoria ?? null,
        role: 'operacoes',
        mode: 'invite',
      });
      return;
    }

    // unlink
    if (!isUuid(currentUid)) {
      toast.error('Este colaborador já está sem acesso.');
      return;
    }

    const ok = confirm('Remover acesso ao app deste colaborador? (user_id ficará nulo)');
    if (!ok) return;

    setLinking(true);
    try {
      const res = await supabase
        .from('colaboradores')
        .update({ user_id: null, updated_at: new Date().toISOString() })
        .eq('id', selectedColab.id);

      if (res.error) {
        console.error(res.error);
        toast.error('Falha ao remover acesso (RLS).');
        return;
      }

      toast.success('Acesso removido');
      const reload = await selectColaboradoresSmart();
      if (reload.error) {
        console.error(reload.error);
        toast.error('Não foi possível atualizar a lista de colaboradores.');
      } else {
        setColabs(reload.data);
      }
    } finally {
      setLinking(false);
    }
  };

  // ===== Encarregados por obra
  useEffect(() => {
    if (!selectedObraId) {
      setEncarregados([]);
      return;
    }
    loadEncarregados(selectedObraId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedObraId]);

  const loadEncarregados = async (obraId: string) => {
    setLoadingEnc(true);
    try {
      const res = await supabase
        .from('obra_encarregados')
        .select('id,obra_id,encarregado_user_id,ativo,created_at,updated_at')
        .eq('obra_id', obraId)
        .order('created_at', { ascending: false });

      if (res.error) {
        console.error(res.error);
        toast.error('Sem acesso para listar encarregados (RLS).');
        setEncarregados([]);
        return;
      }

      setEncarregados((res.data as any[]) as ObraEncarregadoRow[]);
    } finally {
      setLoadingEnc(false);
    }
  };

  const addOrEnableEncarregado = async () => {
    const obraId = String(selectedObraId || '').trim();
    const uid = String(encSelectedUserId || '').trim();

    if (!isUuid(obraId)) {
      toast.error('Selecione uma obra.');
      return;
    }
    if (!isUuid(uid)) {
      toast.error('Selecione um colaborador com acesso ao app (user_id).');
      return;
    }

    setSavingEnc(true);
    try {
      const existing = await supabase
        .from('obra_encarregados')
        .select('id,ativo')
        .eq('obra_id', obraId)
        .eq('encarregado_user_id', uid)
        .maybeSingle();

      if (existing.error && existing.error.code !== 'PGRST116') {
        console.error(existing.error);
        toast.error('Falha ao verificar encarregado (RLS).');
        return;
      }

      if (existing.data?.id) {
        const upd = await supabase
          .from('obra_encarregados')
          .update({ ativo: true, updated_at: new Date().toISOString() })
          .eq('id', existing.data.id);

        if (upd.error) {
          console.error(upd.error);
          toast.error('Falha ao reativar encarregado (RLS).');
          return;
        }
        toast.success('Encarregado reativado');
      } else {
        const ins = await supabase.from('obra_encarregados').insert({
          obra_id: obraId,
          encarregado_user_id: uid,
          ativo: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (ins.error) {
          console.error(ins.error);
          toast.error('Falha ao adicionar encarregado (RLS).');
          return;
        }
        toast.success('Encarregado adicionado');
      }

      setEncSelectedUserId('');
      setEncPersonQuery('');
      setEncPickerOpen(false);

      await loadEncarregados(obraId);
    } finally {
      setSavingEnc(false);
    }
  };

  const setEncarregadoAtivo = async (row: ObraEncarregadoRow, ativo: boolean) => {
    const res = await supabase
      .from('obra_encarregados')
      .update({ ativo, updated_at: new Date().toISOString() })
      .eq('id', row.id);

    if (res.error) {
      console.error(res.error);
      toast.error('Falha ao atualizar encarregado (RLS).');
      return;
    }

    toast.success(ativo ? 'Ativado' : 'Desativado');
    await loadEncarregados(row.obra_id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0B4F8A]" />
      </div>
    );
  }

  const hasAppAccess = (c: ColaboradorRow | null) => !!c?.user_id && isUuid(String(c.user_id).trim());
  const isActive = (c: ColaboradorRow | null) => String(c?.status ?? '').toLowerCase() === 'ativo';

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className={`p-5 ${cardBase}`}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-center">
              <Smartphone size={18} className="text-slate-700 dark:text-slate-200" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">App: Acessos e Gestão</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Acesso ao app = colaborador com <span className="font-semibold">user_id</span> ligado e status ativo. Gestão = encarregado por obra.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <Button variant="secondary" onClick={loadAll}>
              <RefreshCcw size={16} className="mr-2" />
              Atualizar
            </Button>

            <Button onClick={() => openCreateModal()}>
              <Plus size={16} className="mr-2" />
              Criar acesso
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
            <div className="text-xs text-slate-500 dark:text-slate-400">Colaboradores</div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{colabs.length}</div>
          </div>

          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
            <div className="text-xs text-slate-500 dark:text-slate-400">Com acesso ao app</div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {colabs.filter((c) => hasAppAccess(c)).length}
            </div>
          </div>

          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
            <div className="text-xs text-slate-500 dark:text-slate-400">Obras</div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{obras.length}</div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* ===== Acesso do colaborador ===== */}
        <Card className={`p-5 ${cardBase}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-slate-700 dark:text-slate-200" />
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Acesso do Colaborador</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Aqui você vê quem está “com acesso” e consegue remover o vínculo ou criar o acesso.
                </div>
              </div>
            </div>
            <Badge variant="warning">Mobile</Badge>
          </div>

          <div className="mt-4 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              value={colabSearch}
              onChange={(e) => setColabSearch(e.target.value)}
              placeholder="Pesquisar colaborador (nome/email/status)…"
              className="w-full pl-9 pr-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                         focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            {colabsFiltered.map((c) => {
              const active = c.id === selectedColabId;
              const access = hasAppAccess(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedColabId(c.id)}
                  className={[
                    'text-left p-3 rounded-2xl border transition',
                    active
                      ? 'border-[#0B4F8A] bg-[#0B4F8A]/5 dark:bg-[#0B4F8A]/15'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-950/40',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 flex items-center justify-center overflow-hidden shrink-0">
                        {c.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.avatar_url} alt={colabDisplayName(c)} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{initials(colabDisplayName(c))}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{colabDisplayName(c)}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{safeStr(c.email)}</div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={String(c.status ?? '').toLowerCase() === 'ativo' ? 'success' : 'default'}>
                        {safeStr(c.status)}
                      </Badge>
                      {access ? <Badge variant="info">Com acesso</Badge> : <Badge variant="default">Sem acesso</Badge>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Selecionado</div>
              {selectedColab ? (
                hasAppAccess(selectedColab) ? <Badge variant="success">Com acesso</Badge> : <Badge variant="default">Sem acesso</Badge>
              ) : (
                <Badge variant="default">Selecione um</Badge>
              )}
            </div>

            <div className="mt-3">
              {selectedColab ? (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {colabDisplayName(selectedColab)}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {safeStr(selectedColab.email)} • {safeStr(selectedColab.categoria)}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-200">
                        Status: {safeStr(selectedColab.status)}
                      </span>
                      {hasAppAccess(selectedColab) && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(String(selectedColab.user_id))}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/30"
                          title="Copiar user_id"
                        >
                          <Copy size={14} />
                          Copiar ID (técnico)
                        </button>
                      )}
                    </div>

                    {!hasAppAccess(selectedColab) && (
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Este colaborador está sem acesso. Você pode criar agora o acesso (convite ou senha temporária).
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 items-end">
                    <Button
                      variant="secondary"
                      onClick={() => linkAccess('unlink')}
                      disabled={!selectedColab || linking || !hasAppAccess(selectedColab)}
                      title="Remove o acesso ao app (user_id = null)"
                    >
                      <Unlink2 size={16} className="mr-2" />
                      {linking ? 'A remover…' : 'Remover acesso'}
                    </Button>

                    <Button
                      onClick={() => linkAccess('link')}
                      disabled={!selectedColab || linking || hasAppAccess(selectedColab)}
                      title="Criar o acesso para este colaborador"
                    >
                      <Link2 size={16} className="mr-2" />
                      Criar acesso
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  Selecione um colaborador para gerir o acesso ao app
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* ===== Encarregados por obra ===== */}
        {/* ... (restante do seu código de encarregados fica IGUAL) */}
        <Card className={`p-5 ${cardBase}`}>
          {/* (mantive exatamente como está no teu código original daqui pra baixo) */}
          {/* ======= COLE AQUI O BLOCO “Gestão no App (Encarregados)” INTEIRO DO TEU ARQUIVO ORIGINAL ======= */}
          {/* Para não estourar mensagem, não repliquei 100% aqui. */}
        </Card>
      </div>

      {/* Nota operacional curta */}
      <Card className={`p-5 ${cardBase}`}>
        <div className="text-sm text-slate-700 dark:text-slate-200">
          Operação recomendada: primeiro <span className="font-semibold">criar/ligar o acesso</span> (Auth + user_profiles + colaboradores.user_id), depois definir{' '}
          <span className="font-semibold">encarregados por obra</span>.
        </div>
      </Card>

      {/* ===== MODAL Criar Acesso ===== */}
      {createOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => !creating && setCreateOpen(false)}
          />

          <div className="relative w-full max-w-xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 flex items-center justify-center">
                  <KeyRound size={18} className="text-slate-700 dark:text-slate-200" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Criar acesso ao App</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Isto cria Auth + user_profiles + colaboradores.user_id.
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-900/40"
                onClick={() => !creating && setCreateOpen(false)}
                title="Fechar"
              >
                <XIcon size={18} className="text-slate-700 dark:text-slate-200" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* modo */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCreateMode('invite')}
                  disabled={creating}
                  className={[
                    'p-3 rounded-2xl border text-left',
                    createMode === 'invite'
                      ? 'border-[#0B4F8A] bg-[#0B4F8A]/5 dark:bg-[#0B4F8A]/15'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900/30',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2">
                    <Mail size={16} />
                    <div className="text-sm font-semibold">Convite por email</div>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Recomendado: colaborador define a própria senha.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setCreateMode('password')}
                  disabled={creating}
                  className={[
                    'p-3 rounded-2xl border text-left',
                    createMode === 'password'
                      ? 'border-[#0B4F8A] bg-[#0B4F8A]/5 dark:bg-[#0B4F8A]/15'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900/30',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2">
                    <KeyRound size={16} />
                    <div className="text-sm font-semibold">Senha temporária</div>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Você define uma senha inicial (mín. 6).
                  </div>
                </button>
              </div>

              {/* campos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Nome completo</label>
                  <Input
                    value={createNome}
                    onChange={(e: any) => setCreateNome(e.target.value)}
                    placeholder="Ex.: Alexandre da Silva Pedro"
                    disabled={creating}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Email</label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={createEmail}
                      onChange={(e) => setCreateEmail(e.target.value)}
                      placeholder="email@..."
                      disabled={creating}
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                                 focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Telefone (opcional)</label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={createTelefone}
                      onChange={(e) => setCreateTelefone(e.target.value)}
                      placeholder="9xx xxx xxx"
                      disabled={creating}
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                                 focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Categoria (opcional)</label>
                  <input
                    value={createCategoria}
                    onChange={(e) => setCreateCategoria(e.target.value)}
                    placeholder="Ex.: Canalizador"
                    disabled={creating}
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                               focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Role (user_profiles)</label>
                  <div className="relative">
                    <Shield size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={createRole}
                      onChange={(e) => setCreateRole(e.target.value)}
                      placeholder="operacoes / admin / ..."
                      disabled={creating}
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                                 focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                  </div>
                </div>

                {createMode === 'password' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Senha temporária</label>
                    <input
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      placeholder="mínimo 6 caracteres"
                      disabled={creating}
                      className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                                 focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
                    />
                  </div>
                )}
              </div>

              <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 text-xs text-slate-600 dark:text-slate-300">
                Dica: use <span className="font-semibold">Convite</span> como padrão (você não precisa lidar com senha de ninguém).
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancelar
              </Button>
              <Button onClick={createAccess} disabled={creating}>
                <Plus size={16} className="mr-2" />
                {creating ? 'A criar…' : 'Criar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}