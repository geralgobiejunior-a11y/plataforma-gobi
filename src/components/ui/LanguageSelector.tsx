import { Globe } from 'lucide-react';
import { useLanguage, Language } from '../../contexts/LanguageContext';

interface LanguageSelectorProps {
  showLabel?: boolean;
  className?: string;
}

const LANGUAGES = [
  { code: 'pt', flag: '🇵🇹', label: 'Português (PT)' },
  { code: 'pt-BR', flag: '🇧🇷', label: 'Português (BR)' },
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'hi', flag: '🇮🇳', label: 'हिन्दी' },
  { code: 'ar', flag: '🇸🇦', label: 'العربية' },
];

export function LanguageSelector({ showLabel = true, className = '' }: LanguageSelectorProps) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
          {t('perfil.language')}
        </label>
      )}
      <div className="relative">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
          <Globe size={16} />
        </div>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
          className="w-full pl-10 pr-10 py-2.5 rounded-xl text-sm outline-none appearance-none
                    border bg-white text-slate-900 border-slate-200
                    dark:bg-slate-900 dark:text-slate-100 dark:border-slate-800
                    focus:ring-2 focus:ring-[#0B4F8A]/30 focus:border-transparent
                    dark:focus:ring-[#0B4F8A]/35"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.flag} {lang.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            className="text-slate-400 dark:text-slate-400"
            fill="none"
          >
            <path
              d="M7 10l5 5 5-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
