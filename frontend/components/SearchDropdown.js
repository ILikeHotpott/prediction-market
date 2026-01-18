"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, TrendingUp, Flame, Clock, Droplet, Timer, Trophy, X } from "lucide-react";
import { useTranslations } from "next-intl";

const BROWSE_TAGS = [
  { key: "new", icon: TrendingUp },
  { key: "trending", icon: Flame },
  { key: "popular", icon: Flame },
  { key: "liquid", icon: Droplet },
  { key: "endingSoon", icon: Timer },
  { key: "competitive", icon: Trophy },
];

const RECENT_STORAGE_KEY = "mf_recent_searches";

export default function SearchDropdown({ className = "" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState([]);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const router = useRouter();
  const t = useTranslations("search");

  useEffect(() => {
    const stored = localStorage.getItem(RECENT_STORAGE_KEY);
    if (stored) {
      try {
        setRecent(JSON.parse(stored).slice(0, 5));
      } catch {}
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const saveRecent = (term) => {
    const updated = [term, ...recent.filter((r) => r !== term)].slice(0, 5);
    setRecent(updated);
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(updated));
  };

  const removeRecent = (term, e) => {
    e.stopPropagation();
    const updated = recent.filter((r) => r !== term);
    setRecent(updated);
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(updated));
  };

  const handleSearch = (term) => {
    if (!term.trim()) return;
    saveRecent(term.trim());
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(term.trim())}`);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSearch(query);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleTagClick = (tag) => {
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(t(`tags.${tag}`))}`);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={t("placeholder")}
          className="w-full bg-black/20 text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent border border-white/10 placeholder-white/50"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">/</span>
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {t("browse")}
            </div>
            <div className="flex flex-wrap gap-2">
              {BROWSE_TAGS.map((tag) => (
                <button
                  key={tag.key}
                  onClick={() => handleTagClick(tag.key)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 bg-white/5 hover:bg-white/10 text-foreground text-sm transition-colors"
                >
                  <tag.icon className="w-4 h-4" />
                  {t(`tags.${tag.key}`)}
                </button>
              ))}
            </div>
          </div>

          {recent.length > 0 && (
            <div className="p-4 border-t border-white/10">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {t("recent")}
              </div>
              <div className="space-y-1">
                {recent.map((term) => (
                  <div
                    key={term}
                    onClick={() => handleSearch(term)}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">{term}</span>
                    </div>
                    <button
                      onClick={(e) => removeRecent(term, e)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
