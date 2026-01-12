import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export type Language = 'pt' | 'pt-BR' | 'en' | 'es' | 'fr' | 'hi' | 'ar';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('app-language');
    return (saved as Language) || 'pt';
  });

  const [translations, setTranslations] = useState<Record<string, string>>({});

  useEffect(() => {
    loadTranslations(language);
  }, [language]);

  useEffect(() => {
    if (user) {
      loadUserLanguage();
    }
  }, [user]);

  const loadUserLanguage = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('user_profiles')
      .select('idioma')
      .eq('id', user.id)
      .maybeSingle();

    if (data?.idioma) {
      setLanguageState(data.idioma as Language);
    }
  };

  const loadTranslations = async (lang: Language) => {
    try {
      const module = await import(`../i18n/${lang}.ts`);
      setTranslations(module.default);
    } catch (error) {
      console.error('Error loading translations:', error);
      const fallback = await import('../i18n/pt.ts');
      setTranslations(fallback.default);
    }
  };

  const setLanguage = async (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('app-language', lang);

    if (user) {
      await supabase
        .from('user_profiles')
        .update({ idioma: lang })
        .eq('id', user.id);
    }
  };

  const t = (key: string): string => {
    return translations[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
