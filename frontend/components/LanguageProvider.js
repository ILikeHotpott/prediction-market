"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { IntlProvider } from "next-intl";

const LANG_STORAGE_KEY = "mf_language";
const locales = ["en", "zh", "es", "pt", "ja"];
const defaultLocale = "en";

const LanguageContext = createContext({
  locale: defaultLocale,
  setLocale: () => {},
  locales,
});

export function useLanguage() {
  return useContext(LanguageContext);
}

// Pre-load all messages
const messagesCache = {};

async function loadMessages(locale) {
  if (messagesCache[locale]) return messagesCache[locale];
  const messages = await import(`../messages/${locale}.json`);
  messagesCache[locale] = messages.default;
  return messages.default;
}

export function LanguageProvider({ children }) {
  const [locale, setLocaleState] = useState(defaultLocale);
  const [messages, setMessages] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    const initialLocale = stored && locales.includes(stored) ? stored : defaultLocale;
    setLocaleState(initialLocale);
    loadMessages(initialLocale).then(setMessages);
    setMounted(true);
  }, []);

  const setLocale = useCallback((newLocale) => {
    if (!locales.includes(newLocale)) return;
    localStorage.setItem(LANG_STORAGE_KEY, newLocale);
    setLocaleState(newLocale);
    loadMessages(newLocale).then(setMessages);
  }, []);

  // Don't render until we have messages to avoid hydration mismatch
  if (!mounted || !messages) {
    return null;
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale, locales }}>
      <IntlProvider locale={locale} messages={messages}>
        {children}
      </IntlProvider>
    </LanguageContext.Provider>
  );
}
