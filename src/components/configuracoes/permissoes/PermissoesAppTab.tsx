// src/components/configuracoes/permissoes/PermissoesAppTab.tsx
import { useEffect, useMemo, useState } from 'react';
import {
  Smartphone,
  Users,
  Building2,
  Search,
  RefreshCcw,
  Unlink2,
  Plus,
  Copy,
  CheckCircle2,
  XCircle,
  UserCircle2,
  KeyRound,
} from 'lucide-react';

import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
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

export function PermissoesAppTab() {
  const [loading, setLoading] = useState(true);

  const [colabs, setColabs] = useState<ColaboradorRow[]>([]);
  const [obras, setObras] = useState<ObraRow[]>([]);

  const [colabSearch, setColabSearch] = useState('');
  const [selectedColabId, setSelectedColabId] = useState<string>('');
  const [linking, setLinking] = useState(false);
  const [creating, setCreating] = useState(false);

  const [accessFilter, setAccessFilter] = useState<'sem_acesso' | 'com_acesso'>('sem_acesso');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [obraSearch, setObraSearch] = useState('');
  const [selectedObraId, setSelectedObraId] = useState<string>('');
  const [encarregados, setEncarregados] = useState<ObraEncarregadoRow[]>([]);
  const [loadingEnc, setLoadingEnc] = useState(false);
  const [savingEnc, setSavingEnc] = useState(false);

  const [encPickerOpen, setEncPickerOpen] = useState(false);
  const [encPersonQuery, setEncPersonQuery] = useState('');
  const [encSelectedUserId, setEncSelectedUserId] = useState<string>('');

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

  const hasAppAccess = (c: ColaboradorRow | null) => !!c?.user_id && isUuid(String(c.user_id).trim());
  const isActive = (c: ColaboradorRow | null) => String(c?.status ?? '').toLowerCase() === 'ativo';

  useEffect(() => {
    if (!selectedColab) {
      setLoginEmail('');
      setLoginPassword('');
      return;
    }

    setLoginEmail(String(selectedColab.email ?? '').trim());
    setLoginPassword('');
  }, [selectedColabId, selectedColab]);

  const colabsFiltered = useMemo(() => {
    const s = colabSearch.trim().toLowerCase();

    let list = colabs.filter((c) =>
      accessFilter === 'sem_acesso' ? !hasAppAccess(c) : hasAppAccess(c)
    );

    if (s) {
      list = list.filter((c) => {
        const hay = `${c.nome_completo ?? ''} ${c.email ?? ''} ${c.status ?? ''} ${c.categoria ?? ''}`.toLowerCase();
        return hay.includes(s);
      });
    }

    return list.slice(0, 100);
  }, [colabs, colabSearch, accessFilter]);

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

  const colabByUserId = useMemo(() => {
    const map = new Map<string, ColaboradorRow>();
    for (const c of colabs) {
      const uid = String(c.user_id ?? '').trim();
      if (isUuid(uid)) map.set(uid, c);
    }
    return map;
  }, [colabs]);

  const encCandidates = useMemo(() => {
    const base = colabs
      .filter((c) => isUuid(String(c.user_id ?? '').trim()))
      .filter(
        (c) =>
          String(c.status ?? '').toLowerCase() === 'ativo' ||
          String(c.status ?? '').toLowerCase() === 'active'
      );

    const q = encPersonQuery.trim().toLowerCase();
    if (!q) return base.slice(0, 10);

    return base
      .filter((c) => `${c.nome_completo ?? ''} ${c.email ?? ''}`.toLowerCase().includes(q))
      .slice(0, 10);
  }, [colabs, encPersonQuery]);

  const createAccess = async () => {
    if (!selectedColab) {
      toast.error('Selecione primeiro um colaborador.');
      return;
    }

    const email = loginEmail.trim().toLowerCase();
    const password = loginPassword.trim();
    const nome = String(selectedColab.nome_completo ?? '').trim();

    if (!email || !email.includes('@')) {
      toast.error('Email inválido.');
      return;
    }

    if (!nome) {
      toast.error('Colaborador sem nome válido.');
      return;
    }

    if (password.length < 8) {
      toast.error('Senha deve ter pelo menos 8 caracteres.');
      return;
    }

    if (!isActive(selectedColab)) {
      toast.error('Não crie acesso para colaborador inativo/baixa.');
      return;
    }

    if (selectedColab.user_id && isUuid(String(selectedColab.user_id))) {
      toast.error('Este colaborador já tem acesso.');
      return;
    }

    setCreating(true);
    try {
     const res = await supabase.functions.invoke('admin-users', {
  body: {
    action: 'create_colaborador_access',
    colaborador_id: selectedColab.id,
    mode: 'password',
    email,
    password,
    nome_completo: nome,
    telefone: null,
    categoria: selectedColab.categoria ?? null,
    role: 'operacoes',
    idioma: 'pt',
  },
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

      toast.success('Login criado com sucesso.');

      const reload = await selectColaboradoresSmart();
      if (!reload.error) {
        setColabs(reload.data);
        const updated = reload.data.find((c) => c.id === selectedColab.id) ?? null;
        if (updated) setSelectedColabId(updated.id);
      }

      setLoginPassword('');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Falha inesperada ao criar acesso.');
    } finally {
      setCreating(false);
    }
  };

  const removeAccess = async () => {
    if (!selectedColab) {
      toast.error('Selecione um colaborador.');
      return;
    }

    const currentUid = String(selectedColab.user_id ?? '').trim();

    if (!isUuid(currentUid)) {
      toast.error('Este colaborador já está sem acesso.');
      return;
    }

    const ok = confirm('Remover acesso ao app deste colaborador?');
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

      toast.success('Acesso removido.');

      const reload = await selectColaboradoresSmart();
      if (!reload.error) {
        setColabs(reload.data);
        const updated = reload.data.find((c) => c.id === selectedColab.id) ?? null;
        if (updated) setSelectedColabId(updated.id);
      }

      setAccessFilter('sem_acesso');
    } finally {
      setLinking(false);
    }
  };

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
        toast.success('Encarregado reativado.');
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
        toast.success('Encarregado adicionado.');
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
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[#0B4F8A]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className={`p-5 ${cardBase}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
              <Smartphone size={18} className="text-slate-700 dark:text-slate-200" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                App: Acessos e Gestão
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Acesso ao app = colaborador com <span className="font-semibold">user_id</span> ligado e status ativo.
                Gestão = encarregado por obra.
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={loadAll}>
              <RefreshCcw size={16} className="mr-2" />
              Atualizar
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
            <div className="text-xs text-slate-500 dark:text-slate-400">Colaboradores</div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{colabs.length}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
            <div className="text-xs text-slate-500 dark:text-slate-400">Com acesso ao app</div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {colabs.filter((c) => hasAppAccess(c)).length}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
            <div className="text-xs text-slate-500 dark:text-slate-400">Obras</div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{obras.length}</div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className={`p-5 ${cardBase}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-slate-700 dark:text-slate-200" />
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Acesso do Colaborador
                </div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Escolha quem está sem acesso para criar login ou quem já tem acesso para remover.
                </div>
              </div>
            </div>
            <Badge variant="warning">Mobile</Badge>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAccessFilter('sem_acesso')}
              className={[
                'rounded-xl border px-4 py-2 text-sm font-semibold transition',
                accessFilter === 'sem_acesso'
                  ? 'border-[#0B4F8A] bg-[#0B4F8A]/10 text-[#0B4F8A]'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              Sem acesso
            </button>

            <button
              type="button"
              onClick={() => setAccessFilter('com_acesso')}
              className={[
                'rounded-xl border px-4 py-2 text-sm font-semibold transition',
                accessFilter === 'com_acesso'
                  ? 'border-[#0B4F8A] bg-[#0B4F8A]/10 text-[#0B4F8A]'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              Com acesso
            </button>

            <div className="ml-auto text-xs text-slate-500">
              {accessFilter === 'sem_acesso'
                ? `${colabs.filter((c) => !hasAppAccess(c)).length} sem acesso`
                : `${colabs.filter((c) => hasAppAccess(c)).length} com acesso`}
            </div>
          </div>

          <div className="relative mt-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              value={colabSearch}
              onChange={(e) => setColabSearch(e.target.value)}
              placeholder="Pesquisar colaborador (nome/email/status)…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-transparent focus:ring-2 focus:ring-[#0B4F8A]/30 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="mt-3 grid max-h-[420px] grid-cols-1 gap-2 overflow-auto pr-1 md:grid-cols-2">
            {colabsFiltered.map((c) => {
              const active = c.id === selectedColabId;
              const access = hasAppAccess(c);

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedColabId(c.id)}
                  className={[
                    'text-left rounded-2xl border p-3 transition',
                    active
                      ? 'border-[#0B4F8A] bg-[#0B4F8A]/5 dark:bg-[#0B4F8A]/15'
                      : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-950/40',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/30">
                        {c.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.avatar_url} alt={colabDisplayName(c)} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            {initials(colabDisplayName(c))}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900 dark:text-slate-100">
                          {colabDisplayName(c)}
                        </div>
                        <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {safeStr(c.email)}
                        </div>
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

            {colabsFiltered.length === 0 && (
              <div className="col-span-full py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                Nenhum colaborador encontrado
              </div>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/30">
            {!selectedColab ? (
              <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Selecione um colaborador
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {colabDisplayName(selectedColab)}
                    </div>
                    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {safeStr(selectedColab.categoria)} • {safeStr(selectedColab.status)}
                    </div>
                  </div>

                  {hasAppAccess(selectedColab) ? (
                    <Badge variant="success">Com acesso</Badge>
                  ) : (
                    <Badge variant="default">Sem acesso</Badge>
                  )}
                </div>

                {!hasAppAccess(selectedColab) ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Email do login
                        </label>
                        <input
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="email@..."
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-[#0B4F8A]/30 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                          Senha temporária
                        </label>
                        <input
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="mínimo 8 caracteres"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-[#0B4F8A]/30 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                        />
                      </div>
                    </div>

                    {!String(loginEmail || '').trim() && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        Este colaborador precisa de email para criar acesso.
                      </div>
                    )}

                    {!isActive(selectedColab) && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                        Este colaborador está inativo/baixa. O ideal é não criar acesso.
                      </div>
                    )}

                    <div className="flex items-center justify-end">
                      <Button
                        onClick={createAccess}
                        disabled={
                          creating ||
                          !String(loginEmail || '').trim() ||
                          String(loginPassword || '').trim().length < 8 ||
                          !isActive(selectedColab)
                        }
                      >
                        <KeyRound size={16} className="mr-2" />
                        {creating ? 'A criar…' : 'Criar login'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      Este colaborador já tem acesso ao app.
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(String(selectedColab.user_id))}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900/30"
                      >
                        <Copy size={14} />
                        Copiar ID
                      </button>

                      <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                        user_id: {String(selectedColab.user_id).slice(0, 8)}...
                      </span>
                    </div>

                    <div className="flex items-center justify-end">
                      <Button variant="secondary" onClick={removeAccess} disabled={linking}>
                        <Unlink2 size={16} className="mr-2" />
                        {linking ? 'A remover…' : 'Remover acesso'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card className={`p-5 ${cardBase}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-slate-700 dark:text-slate-200" />
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Gestão no App (Encarregados)
                </div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  “Gestão” aparece quando o user está em <span className="font-semibold">obra_encarregados</span> (ativo).
                </div>
              </div>
            </div>
            <Badge variant="info">Obras</Badge>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Selecionar obra
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">{obras.length}</span>
              </div>

              <div className="relative mt-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  value={obraSearch}
                  onChange={(e) => setObraSearch(e.target.value)}
                  placeholder="Pesquisar obra (nome/cliente/status)…"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-transparent focus:ring-2 focus:ring-[#0B4F8A]/30 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="mt-3 max-h-[360px] space-y-2 overflow-auto pr-1">
                {obrasFiltered.map((o) => {
                  const active = o.id === selectedObraId;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelectedObraId(o.id)}
                      className={[
                        'w-full rounded-2xl border p-3 text-left transition',
                        active
                          ? 'border-[#0B4F8A] bg-[#0B4F8A]/5 dark:bg-[#0B4F8A]/15'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/30 dark:hover:bg-slate-900/50',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900 dark:text-slate-100">
                            {obraDisplayName(o)}
                          </div>
                          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                            cliente: {safeStr(o.cliente)}
                          </div>
                        </div>
                        <Badge variant="default">{safeStr(o.status)}</Badge>
                      </div>
                    </button>
                  );
                })}

                {obrasFiltered.length === 0 && (
                  <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    Nenhuma obra
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Encarregados
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Obra: <span className="font-semibold">{selectedObra ? obraDisplayName(selectedObra) : '—'}</span>
                  </div>
                </div>
                {loadingEnc ? (
                  <Badge variant="default">A carregar…</Badge>
                ) : (
                  <Badge variant="info">{encarregados.length}</Badge>
                )}
              </div>

              <div className="mt-4">
                <label className="mb-2 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Adicionar encarregado
                </label>

                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input
                    value={encPersonQuery}
                    onChange={(e) => {
                      setEncPersonQuery(e.target.value);
                      setEncPickerOpen(true);
                      setEncSelectedUserId('');
                    }}
                    onFocus={() => setEncPickerOpen(true)}
                    placeholder={selectedObraId ? 'Pesquisar colaborador (com acesso ao app)…' : 'Selecione uma obra primeiro'}
                    disabled={!selectedObraId}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-transparent focus:ring-2 focus:ring-[#0B4F8A]/30 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  />

                  {encPickerOpen && selectedObraId && (
                    <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-950">
                      <div className="max-h-[280px] overflow-auto">
                        {encCandidates.map((c) => {
                          const uid = String(c.user_id ?? '').trim();
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setEncSelectedUserId(uid);
                                setEncPersonQuery(`${colabDisplayName(c)}${c.email ? ` • ${c.email}` : ''}`);
                                setEncPickerOpen(false);
                              }}
                              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900/40"
                            >
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/30">
                                {c.avatar_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={c.avatar_url} alt={colabDisplayName(c)} className="h-full w-full object-cover" />
                                ) : (
                                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                    {initials(colabDisplayName(c))}
                                  </span>
                                )}
                              </div>

                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {colabDisplayName(c)}
                                </div>
                                <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                                  {safeStr(c.email)}
                                </div>
                              </div>

                              <div className="ml-auto flex items-center gap-2">
                                <Badge variant={isActive(c) ? 'success' : 'default'}>
                                  {safeStr(c.status)}
                                </Badge>
                                <Badge variant="info">Com acesso</Badge>
                              </div>
                            </button>
                          );
                        })}

                        {encCandidates.length === 0 && (
                          <div className="px-3 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                            Nenhum colaborador com acesso ao app encontrado
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 dark:border-slate-800">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Apenas colaboradores com user_id ligado
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => setEncPickerOpen(false)}>
                          Fechar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-end">
                  <Button onClick={addOrEnableEncarregado} disabled={!selectedObraId || savingEnc || !isUuid(encSelectedUserId)}>
                    <Plus size={16} className="mr-2" />
                    {savingEnc ? 'A guardar…' : 'Adicionar'}
                  </Button>
                </div>
              </div>

              <div className="mt-4 max-h-[300px] space-y-2 overflow-auto pr-1">
                {encarregados.map((e) => {
                  const c = colabByUserId.get(String(e.encarregado_user_id).trim()) || null;
                  const display = c ? colabDisplayName(c) : 'Utilizador sem perfil';
                  const email = c?.email ? safeStr(c.email) : '—';

                  return (
                    <div
                      key={e.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/30"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                            {c?.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={c.avatar_url} alt={display} className="h-full w-full object-cover" />
                            ) : c ? (
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                {initials(display)}
                              </span>
                            ) : (
                              <UserCircle2 size={18} className="text-slate-600 dark:text-slate-300" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {display}
                              </div>
                              {e.ativo ? (
                                <Badge variant="success" className="inline-flex items-center gap-1">
                                  <CheckCircle2 size={14} /> Ativo
                                </Badge>
                              ) : (
                                <Badge variant="default" className="inline-flex items-center gap-1">
                                  <XCircle size={14} /> Inativo
                                </Badge>
                              )}
                            </div>

                            <div className="truncate text-xs text-slate-500 dark:text-slate-400">{email}</div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => copyToClipboard(e.encarregado_user_id)}
                                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900/30"
                                title="Copiar ID técnico"
                              >
                                <Copy size={14} />
                                Copiar ID
                              </button>

                              {c && (
                                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                                  {safeStr(c.status)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0">
                          <Button
                            size="sm"
                            variant={e.ativo ? 'secondary' : 'default'}
                            onClick={() => setEncarregadoAtivo(e, !e.ativo)}
                            title={e.ativo ? 'Desativar' : 'Ativar'}
                          >
                            {e.ativo ? 'Desativar' : 'Ativar'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!loadingEnc && selectedObraId && encarregados.length === 0 && (
                  <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    Nenhum encarregado nesta obra
                  </div>
                )}

                {!selectedObraId && (
                  <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    Selecione uma obra para ver/definir encarregados
                  </div>
                )}
              </div>

              <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Regra do app: “Gestão” aparece quando existe registo em{' '}
                <span className="font-semibold">obra_encarregados</span> com{' '}
                <span className="font-semibold">encarregado_user_id = auth.uid()</span> e{' '}
                <span className="font-semibold">ativo = true</span>.
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className={`p-5 ${cardBase}`}>
        <div className="text-sm text-slate-700 dark:text-slate-200">
          Fluxo recomendado: primeiro criar/remover o acesso ao app do colaborador, depois gerir encarregados por obra.
        </div>
      </Card>
    </div>
  );
}