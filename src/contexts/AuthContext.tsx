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
import { supabase } from "../lib/supabase";

export type AccessType = "operacoes" | "administracao";
export type LoginMode = "operacoes" | "admin";

export interface UserData {
  id: string;
  email: string;
  nome: string;
  tipo_acesso: AccessType;
  ativo: boolean;
  roles: string[];
}

interface AuthContextType {
  user: UserData | null;
  loading: boolean;

  authError: string;
  clearAuthError: () => void;

  signIn: (email: string, password: string, mode?: LoginMode) => Promise<UserData>;
  signOut: () => Promise<void>;

  userRoles: string[];
  hasRole: (role: string) => boolean;

  isAdmin: boolean;
  isOperations: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOGIN_MODE_KEY = "diametro_login_mode";

// safe localStorage helpers (evita crash em ambientes sem window)
function lsGet(key: string): string {
  try {
    if (typeof window === "undefined") return "";
    return String(window.localStorage.getItem(key) || "");
  } catch {
    return "";
  }
}
function lsSet(key: string, value: string) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  } catch {}
}

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

function normalizeRole(role: any) {
  const r = String(role || "operacoes").toLowerCase();
  if (r === "owner" || r === "admin" || r === "operacoes") return r;
  return "operacoes";
}

function getSavedLoginMode(): LoginMode {
  const raw = lsGet(LOGIN_MODE_KEY).toLowerCase();
  return raw === "admin" ? "admin" : "operacoes";
}

function setSavedLoginMode(mode: LoginMode) {
  lsSet(LOGIN_MODE_KEY, mode);
}

function normalizeAuthError(err: any) {
  const msg = String(err?.message || err?.error_description || err?.error || "").toLowerCase();
  const code = String(err?.code || err?.error_code || "").toLowerCase();
  const status = Number(err?.status || err?.statusCode || 0);

  if (
    msg.includes("invalid login credentials") ||
    msg.includes("invalid_credentials") ||
    msg.includes("invalid_grant") ||
    code.includes("invalid") ||
    status === 400
  ) {
    return "Email ou palavra-passe incorretos.";
  }

  if (msg.includes("email not confirmed")) {
    return "Email ainda não confirmado. Verifique a caixa de entrada.";
  }

  if (msg.includes("too many requests") || msg.includes("rate limit")) {
    return "Muitas tentativas. Aguarde um pouco e tente novamente.";
  }

  if (msg.includes("network") || msg.includes("failed to fetch")) {
    return "Sem ligação ao servidor. Verifique a internet e tente novamente.";
  }

  if (err?.message) return String(err.message);
  return "Erro ao fazer login.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  const [authError, setAuthError] = useState<string>("");
  const clearAuthError = () => setAuthError("");

  const hydratedInitialRef = useRef(false);

  // indica tentativa manual de login em andamento
  const manualAuthInFlightRef = useRef(false);

  const userRoles = useMemo(
    () => (user?.roles ?? []).map((r) => String(r).toLowerCase()),
    [user]
  );

  const hasRole = (role: string) => userRoles.includes(String(role).toLowerCase());
  const isAdmin = hasRole("owner") || hasRole("admin");
  const isOperations = !isAdmin;

  const fetchRoleAndActive = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role, is_active")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message || "Erro ao carregar perfil (user_roles).");
    if (!data) throw new Error("Utilizador sem role configurada (user_roles).");
    if (data.is_active !== true) throw new Error("Utilizador inativo.");

    return { role: normalizeRole(data.role), ativo: true };
  };

  const assertModeAccess = (mode: LoginMode, roleLower: string) => {
    const isRoleAdmin = roleLower === "owner" || roleLower === "admin";
    const isRoleOper = roleLower === "operacoes";

    if (mode === "admin" && !isRoleAdmin) {
      throw new Error(
        'O seu login é de Operações. Use "Acesso Operações" ou peça acesso ao Owner/Admin.'
      );
    }
    if (mode === "operacoes" && !isRoleOper) {
      throw new Error('O seu login é de Administração. Use "Acesso Administração".');
    }
  };

  const buildUserData = async (session: any, mode: LoginMode, reason: string): Promise<UserData> => {
    const authUser = session?.user;
    if (!authUser) throw new Error("Sessão inválida (sem utilizador).");

    const email = authUser.email ?? "";
    const nome = deriveNome(
      email,
      (authUser.user_metadata as any)?.nome ?? (authUser.user_metadata as any)?.name
    );

    const prof = await fetchRoleAndActive(authUser.id);
    const roleLower = prof.role;

    assertModeAccess(mode, roleLower);

    const userData: UserData = {
      id: authUser.id,
      email,
      nome,
      tipo_acesso: roleToAccess(roleLower),
      ativo: true,
      roles: [roleLower],
    };

    console.log("[AUTH] hydrated:", reason, email, "role=", roleLower, "mode=", mode);
    return userData;
  };

  const hydrateFromSession = async (session: any, reason: string) => {
    const savedMode = getSavedLoginMode();
    const u = await buildUserData(session, savedMode, reason);
    setUser(u);
  };

  useEffect(() => {
    let mounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === "INITIAL_SESSION") {
        if (hydratedInitialRef.current) return;
        hydratedInitialRef.current = true;
      }

      console.log("[AUTH] onAuthStateChange:", event);

      // ✅ login manual controla o SIGNED_IN (evita duplicar hidratação)
      if (event === "SIGNED_IN") return;

      // ✅ SIGNED_OUT: não apaga authError; só limpa o user
      // e evita flicker de loading durante tentativa manual
      if (event === "SIGNED_OUT") {
        setUser(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        if (!session?.user) {
          setUser(null);
          return;
        }
        await hydrateFromSession(session, `onAuthStateChange(${event})`);
      } catch (e) {
        console.error("[AUTH] hydrate failed:", e);
        setUser(null);
        try {
          await supabase.auth.signOut();
        } catch {}
      } finally {
        setLoading(false);
      }
    });

    // carrega a sessão inicial via evento
    setLoading(true);

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string, mode: LoginMode = "operacoes") => {
    setAuthError("");
    manualAuthInFlightRef.current = true;

    let sessionCreated = false;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      sessionCreated = Boolean(data?.session);

      if (!data.user || !data.session) {
        throw new Error("Falha no login: sessão/utilizador não retornado.");
      }

      const u = await buildUserData(data.session, mode, "manual signIn");

      setSavedLoginMode(mode);
      setUser(u);
      return u;
    } catch (e: any) {
      const msg = normalizeAuthError(e);
      setAuthError(msg);
      setUser(null);

      // ✅ só faz signOut se chegou a existir sessão
      // (ex.: autenticou mas falhou em assertModeAccess)
      if (sessionCreated) {
        try {
          await supabase.auth.signOut();
        } catch {}
      }

      throw new Error(msg);
    } finally {
      manualAuthInFlightRef.current = false;
    }
  };

  const signOut = async () => {
    setAuthError("");
    await supabase.auth.signOut();
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    loading,
    authError,
    clearAuthError,
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
