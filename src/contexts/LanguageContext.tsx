// src/contexts/LanguageContext.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

export type Language = "pt" | "pt-BR" | "en" | "es" | "fr" | "hi" | "ar";
type Translations = Record<string, string>;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "app-language";

// Loader explícito = Vite estável
const loaders: Record<Language, () => Promise<{ default: Translations }>> = {
  pt: () => import("../i18n/pt.ts"),
  "pt-BR": () => import("../i18n/pt-BR.ts"),
  en: () => import("../i18n/en.ts"),
  es: () => import("../i18n/es.ts"),
  fr: () => import("../i18n/fr.ts"),
  hi: () => import("../i18n/hi.ts"),
  ar: () => import("../i18n/ar.ts"),
};

function applyHtmlLang(lang: Language) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang === "pt-BR" ? "pt-BR" : lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
}

function isLanguage(v: any): v is Language {
  return v === "pt" || v === "pt-BR" || v === "en" || v === "es" || v === "fr" || v === "hi" || v === "ar";
}

async function readUserLanguageByUserId(userId: string): Promise<Language | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("idioma")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[LANG] read idioma (by user_id) error:", JSON.stringify(error, null, 2));
    return null;
  }

  const idioma = (data as any)?.idioma;
  return isLanguage(idioma) ? idioma : null;
}

async function upsertUserLanguage(userId: string, lang: Language): Promise<void> {
  // Requer UNIQUE/PK em user_id (você tem)
  const { error } = await supabase
    .from("user_profiles")
    .upsert({ user_id: userId, idioma: lang }, { onConflict: "user_id" });

  if (error) {
    console.error("[LANG] upsert idioma error:", JSON.stringify(error, null, 2));
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return (isLanguage(saved) ? saved : null) ?? "pt";
  });

  const [translations, setTranslations] = useState<Translations>({});
  const loadSeq = useRef(0);

  // 1) Carrega traduções quando language muda (com proteção de corrida)
  useEffect(() => {
    let alive = true;
    const seq = ++loadSeq.current;

    (async () => {
      try {
        applyHtmlLang(language);
        const mod = await (loaders[language] ?? loaders.pt)();
        if (!alive || seq !== loadSeq.current) return;
        setTranslations(mod.default || {});
      } catch (err) {
        console.error("[LANG] Error loading translations:", err);
        try {
          const fallback = await loaders.pt();
          if (!alive || seq !== loadSeq.current) return;
          setTranslations(fallback.default || {});
        } catch {}
      }
    })();

    return () => {
      alive = false;
    };
  }, [language]);

  // 2) Quando fizer login (user.id existe), tenta buscar idioma no DB
  useEffect(() => {
    let cancelled = false;

    const uid = user?.id;
    if (!uid) return;

    (async () => {
      try {
        const dbLang = await readUserLanguageByUserId(uid);
        if (cancelled) return;

        if (dbLang && dbLang !== language) {
          setLanguageState(dbLang);
          localStorage.setItem(STORAGE_KEY, dbLang);
          applyHtmlLang(dbLang);
        }
      } catch (e) {
        // ✅ nunca quebra login por idioma
        console.error("[LANG] loadUserLanguage failed:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // language aqui é intencionalmente omitido para não ficar a “pingar” DB
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // 3) Trocar idioma (UI + persistência local + DB)
  const setLanguage = async (lang: Language) => {
    if (lang === language) return;

    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    applyHtmlLang(lang);

    const uid = user?.id;
    if (!uid) return;

    // ✅ não deve derrubar sessão se falhar
    try {
      await upsertUserLanguage(uid, lang);
    } catch (e) {
      console.error("[LANG] setLanguage failed:", e);
    }
  };

  const t = useMemo(() => {
    return (key: string) => translations[key] || key;
  }, [translations]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
