// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

// Logs úteis (você já está fazendo)
try {
  const u = new URL(supabaseUrl);
  console.log("SUPABASE_URL =", supabaseUrl);
  console.log("SUPABASE_HOST =", u.host);
} catch {
  console.log("SUPABASE_URL (invalid) =", supabaseUrl);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // garante storage no browser (alguns previews/iframes podem ser chatos)
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

// DEBUG: permite testar no console: await window.supabase.auth.getSession()
if (typeof window !== "undefined") {
  (window as any).supabase = supabase;
}
