import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

try {
  const u = new URL(supabaseUrl);
  console.log("SUPABASE_URL =", supabaseUrl);
  console.log("SUPABASE_HOST =", u.host);
  console.log(
    "SUPABASE_ANON_KEY preview =",
    String(supabaseAnonKey).slice(0, 20)
  );
} catch {
  console.log("SUPABASE_URL (invalid) =", supabaseUrl);
}

export const AUTH_STORAGE_KEY = "gobi-auth";
export const AUTH_STORAGE_PREF_KEY = "gobi-auth-storage";

function getPreferredStorage(): Storage {
  if (typeof window === "undefined") {
    return undefined as any;
  }

  try {
    const pref = window.localStorage.getItem(AUTH_STORAGE_PREF_KEY);
    return pref === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return window.localStorage;
  }
}

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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? (storageAdapter as any) : undefined,
    storageKey: AUTH_STORAGE_KEY,
  },
});

if (typeof window !== "undefined") {
  (window as any).supabase = supabase;
}