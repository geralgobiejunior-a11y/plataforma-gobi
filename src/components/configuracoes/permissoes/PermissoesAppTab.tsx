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
  avatar_url?: string | null; // opcional (tentamos carregar se existir)
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
  // Evita assumir coluna de foto; tenta as mais comuns e faz fallback.
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

  // ===== Acesso App: link/unlink (sem expor UID)
  const linkAccess = async (mode: 'link' | 'unlink') => {
    if (!selectedColab) {
      toast.error('Selecione um colaborador.');
      return;
    }

    const currentUid = String(selectedColab.user_id ?? '').trim();

    if (mode === 'link') {
      // operação: você vai colar/usar UID apenas via “Copiar UID” do Auth — aqui não inventamos
      // mas para ficar simples: se já está ligado, bloqueia
      if (isUuid(currentUid)) {
        toast.error('Este colaborador já tem acesso ao app.');
        return;
      }
      toast.error('Para ligar, use o fluxo “Ligar” no painel (cole o UID do Auth).');
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
      // refresh colabs
      const reload = await selectColaboradoresSmart();
      if (reload.error) {
        console.error(reload.error);
        toast.error('Não foi possível atualizar a lista de colaboradores.');
      } else {
        setColabs(reload.data);
      }

      // se removemos acesso e ele era encarregado em alguma obra, não mexemos aqui (regra de negócio sua).
      // O ideal é o operador ajustar “Encarregados por obra” depois.
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

      // PGRST116 = no rows. Não assumimos, mas tratamos o padrão do PostgREST.
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

      // reset picker
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
                  Aqui você vê quem está “com acesso” e consegue remover o vínculo.
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
                        Para ligar o acesso, primeiro crie o utilizador no Auth (ou pegue o UID) e depois faça o vínculo no painel (campo técnico).
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
                      title="Ligar exige UID do Auth; aqui você só visualiza/organiza"
                    >
                      <Link2 size={16} className="mr-2" />
                      Ligar (via UID)
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
        <Card className={`p-5 ${cardBase}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-slate-700 dark:text-slate-200" />
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Gestão no App (Encarregados)</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  “Gestão” aparece quando o user está em <span className="font-semibold">obra_encarregados</span> (ativo).
                </div>
              </div>
            </div>
            <Badge variant="info">Obras</Badge>
          </div>

          <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Obras */}
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Selecionar obra</div>
                <span className="text-xs text-slate-500 dark:text-slate-400">{obras.length}</span>
              </div>

              <div className="mt-3 relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  value={obraSearch}
                  onChange={(e) => setObraSearch(e.target.value)}
                  placeholder="Pesquisar obra (nome/cliente/status)…"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                             focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="mt-3 space-y-2 max-h-[360px] overflow-auto pr-1">
                {obrasFiltered.map((o) => {
                  const active = o.id === selectedObraId;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSelectedObraId(o.id)}
                      className={[
                        'w-full text-left p-3 rounded-2xl border transition',
                        active
                          ? 'border-[#0B4F8A] bg-[#0B4F8A]/5 dark:bg-[#0B4F8A]/15'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 hover:bg-slate-100 dark:hover:bg-slate-900/50',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{obraDisplayName(o)}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">cliente: {safeStr(o.cliente)}</div>
                        </div>
                        <Badge variant="default">{safeStr(o.status)}</Badge>
                      </div>
                    </button>
                  );
                })}

                {obrasFiltered.length === 0 && (
                  <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Nenhuma obra</div>
                )}
              </div>
            </div>

            {/* Encarregados */}
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Encarregados</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Obra: <span className="font-semibold">{selectedObra ? obraDisplayName(selectedObra) : '—'}</span>
                  </div>
                </div>
                {loadingEnc ? <Badge variant="default">A carregar…</Badge> : <Badge variant="info">{encarregados.length}</Badge>}
              </div>

              {/* Adicionar encarregado via picker */}
              <div className="mt-4">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Adicionar encarregado</label>

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
                    className="w-full pl-9 pr-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                               focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500 disabled:opacity-60"
                  />

                  {encPickerOpen && selectedObraId && (
                    <div className="absolute z-20 mt-2 w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-lg overflow-hidden">
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
                              className="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition flex items-center gap-3"
                            >
                              <div className="h-9 w-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 flex items-center justify-center overflow-hidden shrink-0">
                                {c.avatar_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={c.avatar_url} alt={colabDisplayName(c)} className="h-full w-full object-cover" />
                                ) : (
                                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{initials(colabDisplayName(c))}</span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{colabDisplayName(c)}</div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{safeStr(c.email)}</div>
                              </div>
                              <div className="ml-auto flex items-center gap-2">
                                <Badge variant={isActive(c) ? 'success' : 'default'}>{safeStr(c.status)}</Badge>
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

                      <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Apenas colaboradores com user_id ligado</span>
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

              {/* Lista */}
              <div className="mt-4 space-y-2 max-h-[300px] overflow-auto pr-1">
                {encarregados.map((e) => {
                  const c = colabByUserId.get(String(e.encarregado_user_id).trim()) || null;
                  const display = c ? colabDisplayName(c) : 'Utilizador sem perfil';
                  const email = c?.email ? safeStr(c.email) : '—';

                  return (
                    <div
                      key={e.id}
                      className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex items-center gap-3">
                          <div className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-center overflow-hidden shrink-0">
                            {c?.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={c.avatar_url} alt={display} className="h-full w-full object-cover" />
                            ) : c ? (
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{initials(display)}</span>
                            ) : (
                              <UserCircle2 size={18} className="text-slate-600 dark:text-slate-300" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{display}</div>
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

                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{email}</div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => copyToClipboard(e.encarregado_user_id)}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/30"
                                title="Copiar ID técnico"
                              >
                                <Copy size={14} />
                                Copiar ID
                              </button>

                              {c && (
                                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                  {safeStr(c.status)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
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
                  <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum encarregado nesta obra</div>
                )}

                {!selectedObraId && (
                  <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    Selecione uma obra para ver/definir encarregados
                  </div>
                )}
              </div>

              <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Regra do app: “Gestão” aparece quando existe registo em <span className="font-semibold">obra_encarregados</span> com{' '}
                <span className="font-semibold">encarregado_user_id = auth.uid()</span> e <span className="font-semibold">ativo = true</span>.
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Nota operacional curta */}
      <Card className={`p-5 ${cardBase}`}>
        <div className="text-sm text-slate-700 dark:text-slate-200">
          Operação recomendada: primeiro <span className="font-semibold">ligar o colaborador ao UID</span> (dar acesso ao app), depois definir{' '}
          <span className="font-semibold">encarregados por obra</span>.
        </div>
      </Card>
    </div>
  );
}
