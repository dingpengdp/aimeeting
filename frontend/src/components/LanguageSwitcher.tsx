import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

const LANGUAGES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en', label: 'English' },
];

interface LanguageSwitcherProps {
  className?: string;
}

export default function LanguageSwitcher({ className = '' }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    void i18n.changeLanguage(e.target.value);
  };

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Globe className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
      <select
        value={i18n.language}
        onChange={handleChange}
        className="bg-transparent text-slate-400 hover:text-white text-xs border-none outline-none cursor-pointer
                   focus:outline-none appearance-none pr-1"
        aria-label="Language"
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code} className="bg-[#1e2433] text-white">
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
}
