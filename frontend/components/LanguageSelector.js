"use client";

import { Globe } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { useTranslations } from "next-intl";

const languageFlags = {
  en: "🇺🇸",
  zh: "🇨🇳",
  es: "🇪🇸",
  pt: "🇧🇷",
  ja: "🇯🇵",
};

export default function LanguageSelector({ onSelect }) {
  const { locale, setLocale, locales } = useLanguage();
  const t = useTranslations("language");

  const handleSelect = (newLocale) => {
    setLocale(newLocale);
    onSelect?.();
  };

  return (
    <div className="py-1">
      <div className="flex items-center gap-3 px-3 py-2 text-gray-500 text-sm">
        <Globe className="w-4 h-4" />
        <span className="font-medium">{t("label")}</span>
      </div>
      {locales.map((loc) => (
        <button
          key={loc}
          onClick={() => handleSelect(loc)}
          className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-black/5 cursor-pointer ${
            locale === loc ? "bg-black/5" : ""
          }`}
        >
          <span className="w-4 text-center">{languageFlags[loc]}</span>
          <span className="font-medium">{t(loc)}</span>
          {locale === loc && <span className="ml-auto text-accent">✓</span>}
        </button>
      ))}
    </div>
  );
}
