import React, { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { staticTranslate } from './translations';

// Supported languages with native names
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština' }
];

const LanguageContext = createContext();

// Translation cache
const translationCache = {};

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    // Check localStorage first
    const saved = localStorage.getItem('app_language');
    if (saved) return saved;
    
    // Auto-detect browser language
    const browserLang = navigator.language.split('-')[0];
    const supported = SUPPORTED_LANGUAGES.find(l => l.code === browserLang);
    return supported ? browserLang : 'en';
  });

  useEffect(() => {
    localStorage.setItem('app_language', language);
    
    // Set HTML lang attribute for accessibility
    document.documentElement.lang = language;
    
    // Set RTL for Arabic
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }, [language]);

  const translate = async (text, targetLang = language) => {
    // Don't translate if already in English or same language
    if (targetLang === 'en' || !text || typeof text !== 'string') {
      return text;
    }

    // Check cache
    const cacheKey = `${text}:${targetLang}`;
    if (translationCache[cacheKey]) {
      return translationCache[cacheKey];
    }

    try {
      const { data } = await base44.functions.invoke('translateText', {
        text,
        targetLanguage: targetLang
      });

      const translated = data?.translated || text;
      translationCache[cacheKey] = translated;
      return translated;
    } catch (err) {
      console.warn('Translation failed:', err);
      return text;
    }
  };

  const t = (text) => {
    if (language === 'en') return text;
    
    // Check static dictionary first (instant, no API call)
    const staticResult = staticTranslate(text, language);
    if (staticResult !== text) return staticResult;
    
    // Fall back to cache then async translation
    const cacheKey = `${text}:${language}`;
    if (translationCache[cacheKey]) {
      return translationCache[cacheKey];
    }

    // Translate async and cache for next render
    translate(text, language).then(translated => {
      if (translated !== text) {
        translationCache[cacheKey] = translated;
      }
    });

    return text; // Return English until translated
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, translate, t, languages: SUPPORTED_LANGUAGES }}>
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