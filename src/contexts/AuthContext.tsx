// src/contexts/AuthContext.tsx
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export type AccessType = "operacoes" | "administracao";

export interface UserData {
  id: string; // auth user id
  email: string;
  nome: string; // vem do metadata se existir, senão derivado do email
  tipo_acesso: AccessType; // derivado do role
  ativo: boolean; // user_profiles.is_active
  roles: string[]; // hoje 1 role, mas já deixo array
}

interface AuthContextType {
  user: UserData | null;
  loading: boolean;

  signIn: (email: string, password: string) => Promise<UserData>;
  signOut: () => Promise<void>;

  userRoles: string[];
  hasRole: (role: string) => boolean;

  isAdmin: boolean;
  isOperations: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function deriveNome(email: string, metaName?: string | null) {
  if (metaName && String(metaName).trim()) return String(metaName).trim();
  const left = email.split("@")[0] ?? "Utilizador";
  return left.replace(/[._-]+/g, " ").trim() || "Utilizador";
}

function roleToAccess(role: string): AccessType {
  const r = (role || "").toLowerCase();
  if (r === "owner" || r === "admin") return "administracao";
  return "operacoes";
}

function makeAuthedClient(accessToken: string, storageKey = "sb-authed-profile"): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anon) throw new Error("Missing Supabase environment variables for authed client");

  return createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      // evita conflito com o storage do client principal
      storageKey,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  // Evita hidratar múltiplas vezes no INITIAL_SESSION
  const hydratedInitialRef = useRef(false);

  // Singleton do client “authed” para ler user_profiles com Bearer
  const authedRef = useRef<{ token: string; client: SupabaseClient } | null>(null);

  const getAuthedClient = (token: string) => {
    const current = authedRef.current;
    if (current && current.token === token) return current.client;

    const client = makeAuthedClient(token);
    authedRef.current = { token, client };
    return client;
  };

  const userRoles = useMemo(() => (user?.roles ?? []).map((r) => String(r).toLowerCase()), [user]);

  const hasRole = (role: string) => {
    const r = String(role).toLowerCase();
    return userRoles.includes(r);
  };

  const isAdmin = hasRole("owner") || hasRole("admin");
  const isOperations = !isAdmin;

  const hydrateFromSession = async (session: any, reason: string) => {
    const authUser = session?.user;
    const accessToken = session?.access_token as string | undefined;

    if (!authUser) {
      setUser(null);
      return;
    }
    if (!accessToken) {
      // sem token não dá para garantir leitura do perfil com RLS
      throw new Error("Sessão sem access_token.");
    }

    const email = authUser.email ?? "";
    const nome = deriveNome(
      email,
      (authUser.user_metadata as any)?.nome ?? (authUser.user_metadata as any)?.name
    );

    const authed = getAuthedClient(accessToken);

    const { data, error } = await authed
      .from("user_profiles")
      .select("role, is_active")
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (error) throw new Error(error.message || "Erro ao carregar perfil (user_profiles)");
    if (!data) throw new Error("Perfil não configurado em user_profiles para este utilizador.");
    if (data.is_active !== true) throw new Error("Utilizador inativo.");

    const role = String(data.role || "operacoes");
    const tipo_acesso = roleToAccess(role);

    setUser({
      id: authUser.id,
      email,
      nome,
      tipo_acesso,
      ativo: true,
      roles: [role],
    });

    // Debug (podes remover depois)
    console.log("[AUTH] hydrated:", reason, email);
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      // evita duplicação do INITIAL_SESSION
      if (event === "INITIAL_SESSION") {
        if (hydratedInitialRef.current) return;
        hydratedInitialRef.current = true;
      }

      setLoading(true);
      console.log("[AUTH] onAuthStateChange:", event);

      try {
        if (!session?.user) {
          setUser(null);
        } else {
          await hydrateFromSession(session, `onAuthStateChange(${event})`);
        }
      } catch (e) {
        console.error("[AUTH] hydrate failed:", e);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    // NÃO chamamos getSession() aqui para evitar timeout/double hydrate.
    // O Supabase vai disparar INITIAL_SESSION automaticamente.

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setLoading(false);
      throw new Error(error.message || "Email ou palavra-passe incorretos.");
    }

    if (!data.user) {
      setLoading(false);
      throw new Error("Falha no login: utilizador não retornado.");
    }

    // signInWithPassword normalmente devolve session
    if (!data.session?.access_token) {
      setLoading(false);
      throw new Error("Falha no login: sessão não retornada (sem access_token).");
    }

    try {
      await hydrateFromSession(data.session, "signInWithPassword");
      // devolve o estado já hidratado
      const current = {
        id: data.user.id,
        email: data.user.email ?? "",
        nome: deriveNome(
          data.user.email ?? "",
          (data.user.user_metadata as any)?.nome ?? (data.user.user_metadata as any)?.name
        ),
        // estes 3 abaixo serão sobrescritos pelo setUser no hydrate,
        // mas retornamos o user do estado logo após.
        tipo_acesso: "operacoes" as AccessType,
        ativo: true,
        roles: [],
      };

      // Melhor: devolve o user do estado depois do hydrate
      // (garante role/tipo_acesso corretos)
      const u = await new Promise<UserData>((resolve) => {
        // microtask: esperar o setUser
        queueMicrotask(() => resolve((prev => prev) as any));
        queueMicrotask(() => resolve((() => (authedRef ? (null as any) : null)) as any));
      });

      // Como o acima não é confiável, devolvemos direto do estado via leitura síncrona:
      // (setUser já ocorreu no hydrate; ainda assim, para garantir, montamos pelo retorno do hydrate)
      // -> então, reconstruímos aqui com o resultado do perfil:
      // Para manter simples: fazemos uma leitura novamente do perfil e retornamos correto.

      const authed = getAuthedClient(data.session.access_token);
      const { data: prof, error: profErr } = await authed
        .from("user_profiles")
        .select("role, is_active")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (profErr) throw new Error(profErr.message || "Erro ao carregar perfil (user_profiles)");
      if (!prof) throw new Error("Perfil não configurado em user_profiles para este utilizador.");
      if (prof.is_active !== true) throw new Error("Utilizador inativo.");

      const role = String(prof.role || "operacoes");
      const tipo_acesso = roleToAccess(role);

      const userData: UserData = {
        id: data.user.id,
        email: data.user.email ?? "",
        nome: current.nome,
        tipo_acesso,
        ativo: true,
        roles: [role],
      };

      setUser(userData);
      return userData;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    loading,
    signIn,
    signOut,
    userRoles,
    hasRole,
    isAdmin,
    isOperations,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
