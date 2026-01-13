// src/lib/supabase.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

// Logs úteis
try {
  const u = new URL(supabaseUrl);
  console.log("SUPABASE_URL =", supabaseUrl);
  console.log("SUPABASE_HOST =", u.host);
} catch {
  console.log("SUPABASE_URL (invalid) =", supabaseUrl);
}

export const AUTH_STORAGE_KEY = "diametro-auth";
export const AUTH_STORAGE_PREF_KEY = "auth-storage"; // "local" | "session"

// Escolhe o storage a usar (localStorage ou sessionStorage) com base na preferência
function getPreferredStorage(): Storage {
  // SSR/Node safety
  if (typeof window === "undefined") {
    // @ts-expect-error - no SSR storage; supabase vai ignorar
    return undefined;
  }

  try {
    const pref = window.localStorage.getItem(AUTH_STORAGE_PREF_KEY);
    return pref === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    // fallback seguro
    return window.localStorage;
  }
}

// Adapter para o Supabase (evita fixar sempre localStorage)
const storageAdapter = {
  getItem: (key: string) => {
    if (typeof window === "undefined") return null;
    return getPreferredStorage().getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window === "undefined") return;
    getPreferredStorage().setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof window === "undefined") return;
    getPreferredStorage().removeItem(key);
  },
};

// ✅ protege contra múltiplas instâncias em DEV/HMR
const g = globalThis as unknown as {
  __diametro_supabase__?: SupabaseClient;
};

export const supabase =
  g.__diametro_supabase__ ??
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,

      // ✅ sessão vai para o storage escolhido (local/session)
      storage: typeof window !== "undefined" ? (storageAdapter as any) : undefined,

      // ✅ FIXO: evita conflitos e sessões “fantasma” no browser
      storageKey: AUTH_STORAGE_KEY,
    },
  });

if (!g.__diametro_supabase__) {
  g.__diametro_supabase__ = supabase;
}

// DEBUG: console
if (typeof window !== "undefined") {
  (window as any).supabase = supabase;
}
