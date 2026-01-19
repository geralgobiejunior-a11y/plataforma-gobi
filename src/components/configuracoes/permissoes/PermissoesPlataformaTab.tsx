/// src/components/configuracoes/permissoes/PermissoesPlataformaTab.tsx
import { useEffect, useMemo, useState } from 'react';
import { Shield, Search, RefreshCcw, Copy, Info } from 'lucide-react';

import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';

type Role = 'owner' | 'admin' | 'operacoes' | 'financeiro';

type DirectoryPerson = {
  user_id: string;
  nome: string;
  email: string;
  avatar_url?: string | null;
};

type RoleRow = {
  user_id: string;
  role: string | null;
  is_active: boolean | null;
};

type ProfileRow = {
  user_id: string;
  email: string | null;
  nome: string | null;
  role: string | null;
  is_active: boolean | null;
};

type RowView = {
  user_id: string;

  // Melhor esforço (pode vir do diretório ou do user_profiles)
  nome: string;
  email: string;
  avatar_url: string | null;

  // “perfil interno”
  role: Role | null;
  is_active: boolean;

  // origem dos dados (debug/clareza)
  has_colaborador: boolean;
  source_role: 'user_roles' | 'user_profiles' | 'none';
  source_identity: 'colaboradores' | 'user_profiles' | 'fallback';
};

const cardBase =
  'border border-slate-200 bg-white shadow-sm ' +
  'dark:border-slate-800/70 dark:bg-slate-950/30 dark:shadow-black/30';

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v || '').trim()
  );
}

function initials(name: string) {
  const n = (name || '').trim();
  if (!n) return '—';
  const parts = n.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || '';
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : '';
  return (a + b).toUpperCase() || n.slice(0, 2).toUpperCase();
}

function normalizeRole(v: any): Role | null {
  const r = String(v || '').trim().toLowerCase();
  if (r === 'owner') return 'owner';
  if (r === 'admin') return 'admin';
  if (r === 'operacoes') return 'operacoes';
  if (r === 'financeiro') return 'financeiro';
  return null;
}

function roleLabel(r: Role) {
  if (r === 'owner') return 'Owner';
  if (r === 'admin') return 'Admin';
  if (r === 'operacoes') return 'Operações';
  return 'Financeiro';
}

function roleDesc(r: Role) {
  if (r === 'owner') return 'Acesso total (inclui Configurações).';
  if (r === 'admin') return 'Operações + Pagamentos.';
  if (r === 'operacoes') return 'Colaboradores, Obras, Presenças, Documentos.';
  return 'Pagamentos e relatórios financeiros.';
}

function roleBadgeVariant(r: Role) {
  if (r === 'owner') return 'success';
  if (r === 'admin') return 'info';
  if (r === 'operacoes') return 'warning';
  return 'default';
}

/**
 * Diretório humano (colaboradores): tenta variações de colunas.
 * Evita 400 quando o schema não bate com um único select fixo.
 */
async function selectDirectorySmart(): Promise<{ data: DirectoryPerson[]; error: any }> {
  const attempts = [
    { nome: 'nome_completo', email: 'email', avatar: 'foto_url' },
    { nome: 'nome_completo', email: 'email', avatar: 'avatar_url' },
    { nome: 'nome', email: 'email', avatar: 'foto_url' },
    { nome: 'nome', email: 'email', avatar: 'avatar_url' },
  ];

  let lastError: any = null;

  for (const a of attempts) {
    const sel = `user_id,${a.nome},${a.email},${a.avatar}`;

    const res = await supabase
      .from('colaboradores')
      .select(sel)
      .not('user_id', 'is', null)
      .limit(5000);

    if (!res.error) {
      const rows = (res.data as any[]) || [];
      const map = new Map<string, DirectoryPerson>();

      for (const r of rows) {
        const uid = String(r.user_id ?? '').trim();
        if (!isUuid(uid)) continue;

        const nome = String(r[a.nome] ?? '').trim() || 'Sem nome';
        const email = String(r[a.email] ?? '').trim() || '';
        const avatar_url = r[a.avatar] ? String(r[a.avatar]) : null;

        map.set(uid, { user_id: uid, nome, email, avatar_url });
      }

      return { data: Array.from(map.values()), error: null };
    }

    lastError = res.error;
  }

  return { data: [], error: lastError };
}

export function PermissoesPlataformaTab() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RowView[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAll = async () => {
    setLoading(true);

    try {
      // 1) Diretório (colaboradores)
      const dirRes = await selectDirectorySmart();
      if (dirRes.error) {
        console.error(dirRes.error);
        toast.error('Não foi possível carregar colaboradores (diretório).');
      }
      const directory = dirRes.error ? [] : dirRes.data;

      // 2) Internos (user_roles + user_profiles)
      //    Aqui é o ponto-chave: mesmo que o user_id não exista em colaboradores,
      //    ele aparece na tela.
      const [rolesRes, profRes] = await Promise.all([
        supabase.from('user_roles').select('user_id, role, is_active').limit(5000),
        supabase.from('user_profiles').select('user_id, email, nome, role, is_active').limit(5000),
      ]);

      if (rolesRes.error) console.error(rolesRes.error);
      if (profRes.error) console.error(profRes.error);

      const roles = ((rolesRes.data as any[]) || []) as RoleRow[];
      const profiles = ((profRes.data as any[]) || []) as ProfileRow[];

      // maps
      const dirMap = new Map<string, DirectoryPerson>();
      for (const d of directory) dirMap.set(d.user_id, d);

      const rolesMap = new Map<string, RoleRow>();
      for (const r of roles) {
        if (!r?.user_id) continue;
        const uid = String(r.user_id).trim();
        if (!isUuid(uid)) continue;
        rolesMap.set(uid, r);
      }

      const profMap = new Map<string, ProfileRow>();
      for (const p of profiles) {
        if (!p?.user_id) continue;
        const uid = String(p.user_id).trim();
        if (!isUuid(uid)) continue;
        profMap.set(uid, p);
      }

      // 3) União de IDs
      const allIds = new Set<string>();
      for (const uid of dirMap.keys()) allIds.add(uid);
      for (const uid of rolesMap.keys()) allIds.add(uid);
      for (const uid of profMap.keys()) allIds.add(uid);

      // 4) Merge por user_id
      const merged: RowView[] = Array.from(allIds).map((user_id) => {
        const d = dirMap.get(user_id) || null;
        const r = rolesMap.get(user_id) || null;
        const p = profMap.get(user_id) || null;

        // Role: prioridade user_roles > user_profiles
        const roleFromRoles = normalizeRole(r?.role);
        const roleFromProfiles = normalizeRole(p?.role);
        const role = roleFromRoles ?? roleFromProfiles ?? null;

        // Ativo: prioridade user_roles > user_profiles > true
        const active =
          (typeof r?.is_active === 'boolean' ? r.is_active : null) ??
          (typeof p?.is_active === 'boolean' ? p.is_active : null) ??
          true;

        // Identidade (nome/email): prioridade colaboradores > user_profiles > fallback
        const nome =
          (d?.nome && d.nome.trim()) ||
          (p?.nome && String(p.nome).trim()) ||
          (p?.email && String(p.email).trim()) ||
          'Utilizador';

        const email =
          (d?.email && d.email.trim()) ||
          (p?.email && String(p.email).trim()) ||
          '';

        const avatar_url = d?.avatar_url ? String(d.avatar_url) : null;

        const source_role: RowView['source_role'] = roleFromRoles
          ? 'user_roles'
          : roleFromProfiles
            ? 'user_profiles'
            : 'none';

        const source_identity: RowView['source_identity'] = d
          ? 'colaboradores'
          : p
            ? 'user_profiles'
            : 'fallback';

        return {
          user_id,
          nome,
          email,
          avatar_url,
          role,
          is_active: !!active,
          has_colaborador: !!d,
          source_role,
          source_identity,
        };
      });

      // ordena: role > nome/email
      merged.sort((a, b) => {
        const ra = a.role || 'zzzz';
        const rb = b.role || 'zzzz';
        if (ra < rb) return -1;
        if (ra > rb) return 1;
        return (a.nome || a.email || '').localeCompare(b.nome || b.email || '');
      });

      setRows(merged);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Falha ao carregar diretório/perfis.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const hay = `${r.nome} ${r.email} ${r.user_id} ${r.role || ''}`.toLowerCase();
      return hay.includes(s);
    });
  }, [rows, search]);

  const counts = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.is_active).length;
    const inactive = total - active;

    const byRole: Record<string, number> = { operacoes: 0, financeiro: 0, admin: 0, owner: 0, sem_role: 0 };
    for (const r of rows) {
      if (!r.role) byRole.sem_role += 1;
      else byRole[r.role] = (byRole[r.role] || 0) + 1;
    }

    const colaboradores = rows.filter((r) => r.has_colaborador).length;
    const internos = total - colaboradores;

    return { total, active, inactive, byRole, colaboradores, internos };
  }, [rows]);

  const copyText = async (txt: string, label = 'Copiado') => {
    try {
      await navigator.clipboard.writeText(txt);
      toast.success(label);
    } catch (e) {
      console.error(e);
      toast.error('Não foi possível copiar');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0B4F8A]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className={`p-5 ${cardBase}`}>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-center">
              <Shield size={18} className="text-slate-700 dark:text-slate-200" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Plataforma: Diretório + Internos (Owner/Admin incluídos)
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Mostra colaboradores (<span className="font-semibold">colaboradores</span>) e também utilizadores internos
                (<span className="font-semibold">user_roles/user_profiles</span>), mesmo sem registo em colaboradores.
                <span className="ml-2 inline-flex items-center gap-1">
                  <Info size={14} /> Isto não cria login no Auth.
                </span>
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

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-6 gap-3">
          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
            <div className="text-xs text-slate-500 dark:text-slate-400">Total</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{counts.total}</div>
          </div>

          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
            <div className="text-xs text-slate-500 dark:text-slate-400">Ativos</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{counts.active}</div>
          </div>

          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
            <div className="text-xs text-slate-500 dark:text-slate-400">Inativos</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{counts.inactive}</div>
          </div>

          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
            <div className="text-xs text-slate-500 dark:text-slate-400">Colaboradores</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{counts.colaboradores}</div>
          </div>

          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
            <div className="text-xs text-slate-500 dark:text-slate-400">Internos</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{counts.internos}</div>
          </div>

          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-2">Perfis</div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="warning">Operações {counts.byRole.operacoes || 0}</Badge>
              <Badge variant="default">Financeiro {counts.byRole.financeiro || 0}</Badge>
              <Badge variant="info">Admin {counts.byRole.admin || 0}</Badge>
              <Badge variant="success">Owner {counts.byRole.owner || 0}</Badge>
              <span className="text-xs text-slate-500 dark:text-slate-400">Sem role {counts.byRole.sem_role || 0}</span>
            </div>
          </div>
        </div>
      </Card>

      <Card className={`p-5 ${cardBase}`}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Lista</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Pesquisa por nome, email, role ou user_id.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-full lg:w-[520px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar por nome, email, role ou user_id…"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-950 text-sm
                           focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>

            <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
              {filtered.length}/{rows.length}
            </span>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="py-3 pr-3">Utilizador</th>
                <th className="py-3 pr-3">Perfil</th>
                <th className="py-3 pr-3">Email</th>
                <th className="py-3 pr-3">user_id</th>
                <th className="py-3 text-right">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filtered.map((u) => {
                const displayName = u.nome || 'Utilizador';
                const displayEmail = u.email || '—';

                return (
                  <tr key={u.user_id} className="hover:bg-slate-50 dark:hover:bg-slate-950/40 transition">
                    <td className="py-4 pr-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 flex items-center justify-center overflow-hidden shrink-0">
                          {u.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.avatar_url} alt={displayName} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                              {initials(displayName)}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">{displayName}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {u.has_colaborador ? 'Colaborador' : 'Interno'}
                            <span className="mx-2 text-slate-300 dark:text-slate-700">•</span>
                            fonte: {u.source_identity}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 pr-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {u.role ? (
                          <Badge variant={roleBadgeVariant(u.role)}>{roleLabel(u.role)}</Badge>
                        ) : (
                          <span className="text-xs text-slate-500 dark:text-slate-400">Sem role</span>
                        )}
                        <Badge variant={u.is_active ? 'success' : 'default'}>
                          {u.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {u.role ? roleDesc(u.role) : 'Sem permissões internas atribuídas.'}
                        <span className="ml-2">• fonte role: {u.source_role}</span>
                      </div>
                    </td>

                    <td className="py-4 pr-3 text-slate-900 dark:text-slate-100">{displayEmail}</td>

                    <td className="py-4 pr-3">
                      <div className="font-mono text-xs text-slate-700 dark:text-slate-200">{u.user_id}</div>
                    </td>

                    <td className="py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => copyText(displayEmail, 'Email copiado')}
                          disabled={!u.email}
                          title="Copiar email"
                        >
                          <Copy size={16} />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => copyText(u.user_id, 'ID copiado')}
                          title="Copiar user_id"
                        >
                          <Copy size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    Nenhum utilizador encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-2">
          <Info size={14} className="mt-[2px]" />
          <div>
            Agora a lista inclui <span className="font-semibold">internos</span> (Owner/Admin) mesmo sem registo em colaboradores.
            Login/password do Auth é outra camada (fica para depois).
          </div>
        </div>
      </Card>
    </div>
  );
}
