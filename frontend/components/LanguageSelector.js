"use client";

import { Languages } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { useTranslations } from "next-intl";
import { useState } from "react";

const languageFlags = {
  en: "🇺🇸",
  zh: "🇨🇳",
  es: "🇪🇸",
  pt: "🇧🇷",
  ja: "🇯🇵",
};

export default function LanguageSelector({ onSelect, compact = false, theme = "light" }) {
  const { locale, setLocale, locales } = useLanguage();
  const t = useTranslations("language");
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (newLocale) => {
    setLocale(newLocale);
    setIsOpen(false);
    onSelect?.();
  };

  // Compact button mode for mobile
  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
        >
          <Languages className="w-5 h-5 text-white/80" />
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute right-0 top-full mt-2 w-40 bg-[#2a3847] rounded-lg shadow-xl border border-gray-700 py-2 z-50">
              {locales.map((loc) => (
                <button
                  key={loc}
                  onClick={() => handleSelect(loc)}
                  className={`w-full flex items-center gap-3 px-4 py-2 hover:bg-white/10 transition-colors ${
                    locale === loc ? "bg-white/5" : ""
                  }`}
                >
                  <span className="text-white text-sm font-medium">{t(loc)}</span>
                  {locale === loc && <span className="ml-auto text-blue-400">✓</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Default list mode for desktop dropdown
  const isDark = theme === "dark";
  const textColor = isDark ? "text-white" : "text-gray-700";
  const hoverBg = isDark ? "hover:bg-white/10" : "hover:bg-black/5";
  const activeBg = isDark ? "bg-white/5" : "bg-black/5";

  return (
    <div className="py-1">
      <div className={`flex items-center gap-3 px-3 py-2 ${textColor} text-sm`}>
        <Languages className="w-4 h-4" />
        <span className="font-medium">{t("label")}</span>
      </div>
      {locales.map((loc) => (
        <button
          key={loc}
          onClick={() => handleSelect(loc)}
          className={`w-full flex items-center gap-3 px-3 py-2 ${textColor} ${hoverBg} cursor-pointer ${
            locale === loc ? activeBg : ""
          }`}
        >
          <span className="w-4 text-center">{languageFlags[loc]}</span>
          <span className="font-medium">{t(loc)}</span>
          {locale === loc && <span className={`ml-auto ${textColor}`}>✓</span>}
        </button>
      ))}
    </div>
  );
}
