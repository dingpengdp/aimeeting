import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

const LANGUAGES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en', label: 'English' },
];

interface LanguageSwitcherProps {
  className?: string;
  iconOnly?: boolean;
}

export default function LanguageSwitcher({ className = '', iconOnly = false }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    void i18n.changeLanguage(e.target.value);
  };

  if (iconOnly) {
    return (
      <label className={`relative inline-flex h-9 w-9 cursor-pointer items-center justify-center text-slate-300 transition-colors hover:text-white ${className}`}>
        <Globe className="h-4 w-4" />
        <select
          value={i18n.language}
          onChange={handleChange}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={t('language.label')}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code} className="bg-[#111827] text-white">
              {lang.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className={`flex items-center gap-2 text-slate-400 ${className}`}>
      <Globe className="h-4 w-4 flex-shrink-0 text-current" />
      <select
        value={i18n.language}
        onChange={handleChange}
        className="min-w-0 appearance-none bg-transparent pr-1 text-xs text-current outline-none transition-colors focus:outline-none"
        aria-label={t('language.label')}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code} className="bg-[#111827] text-white">
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
}
