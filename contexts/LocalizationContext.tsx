import React, { createContext, useState, useMemo, useCallback } from 'react';
import { locales, Language, LocaleKeys } from '../i18n/locales';

interface LocalizationContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: LocaleKeys, replacements?: { [key: string]: string | number }) => string;
}

export const LocalizationContext = createContext<LocalizationContextType | undefined>(undefined);

export const LocalizationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('zh');

  const t = useCallback((key: LocaleKeys, replacements?: { [key: string]: string | number }): string => {
    let translation = locales[language][key] || locales['en'][key] || key;
    if (replacements) {
        for (const rKey in replacements) {
            translation = translation.replace(`{${rKey}}`, String(replacements[rKey]));
        }
    }
    return translation;
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t
  }), [language, t]);

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
};