"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Bell, Menu, X, User, Trophy, Bookmark, LogOut, Wallet, Globe, Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import SearchDropdown from "@/components/SearchDropdown";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/components/auth/AuthProvider";
import { usePortfolio } from "@/components/PortfolioProvider";
import Logo from "@/components/Logo";
import DepositModal from "@/components/DepositModal";
import { NAV_CATEGORIES } from "@/lib/constants/categories";
import LanguageSelector from "@/components/LanguageSelector";
import MobileSidebar from "@/components/MobileSidebar";

const backendBase =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    : "";

// Prefetch cache for categories
const prefetchedCategories = new Set();

function prefetchCategory(categoryValue) {
  if (prefetchedCategories.has(categoryValue)) return;
  prefetchedCategories.add(categoryValue);
  const url = new URL(`${backendBase}/api/events/`);
  if (categoryValue) url.searchParams.set("category", categoryValue);
  fetch(url.toString(), { cache: "no-store" }).catch(() => {});
}

export default function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [avatarDropdownOpen, setAvatarDropdownOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [navCategories, setNavCategories] = useState(NAV_CATEGORIES);
  const dropdownRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const { theme, setTheme } = useTheme();
  const t = useTranslations("nav");

  // Fetch navigation categories from API
  useEffect(() => {
    fetch(`${backendBase}/api/tags/?nav=1`)
      .then((res) => res.json())
      .then((data) => {
        if (data.items?.length > 0) {
          setNavCategories(
            data.items.map((t) => ({
              value: t.name.toLowerCase().replace(/\s+/g, "-"),
              label: t.name,
            }))
          );
        }
      })
      .catch(() => {});
  }, []);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setAvatarDropdownOpen(true), 100);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setAvatarDropdownOpen(false), 150);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setAvatarDropdownOpen(false);
      }
    };
    if (avatarDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [avatarDropdownOpen]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const { user, session, openAuthModal, signOut } = useAuth();
  const { portfolio: navPortfolio, cash: navCash, loading: navLoading, avatarUrl: profileAvatarUrl, refreshPortfolio } = usePortfolio();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentCategory = searchParams.get("category");
  const lastStripeSessionRef = useRef(null);

  const displayName = useMemo(() => {
    if (!user) return "User";
    return (
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      "User"
    );
  }, [user]);

  // Prefer profile avatar (from database) over Google avatar (from auth metadata)
  const avatarUrl = profileAvatarUrl || user?.user_metadata?.avatar_url;
  const walletLabel =
    user?.user_metadata?.wallet_address ||
    user?.user_metadata?.sub ||
    user?.id ||
    "";

  const isAuthed = !!session;

  const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

  useEffect(() => {
    const depositStatus = searchParams.get("deposit");
    if (depositStatus !== "success") return;

    const sessionId = searchParams.get("session_id");
    if (sessionId && lastStripeSessionRef.current === sessionId) return;

    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("deposit");
    cleanUrl.searchParams.delete("session_id");
    router.replace(`${cleanUrl.pathname}${cleanUrl.search}`);

    if (!user?.id || !backendBase) return;

    async function confirmStripeDeposit() {
      if (!sessionId) {
        refreshPortfolio();
        return;
      }
      lastStripeSessionRef.current = sessionId;
      try {
        const res = await fetch(`${backendBase}/api/users/me/stripe/confirm/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": user.id,
          },
          body: JSON.stringify({ session_id: sessionId }),
        });
        if (!res.ok) {
          await res.json().catch(() => ({}));
        }
      } finally {
        refreshPortfolio();
      }
    }

    confirmStripeDeposit();
  }, [searchParams, router, user?.id, refreshPortfolio]);

  return (
    <nav className="sticky top-0 z-50 bg-background shadow-md">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">
        {/* Mobile Header */}
        <div className="flex md:hidden items-center justify-between h-16 gap-3">
          <Link href="/" className="flex items-center -ml-2">
            <div className="w-[160px] flex items-center -mt-4">
              <Logo />
            </div>
          </Link>

          <div className="flex items-center gap-3">
            {!isAuthed ? (
              <>
                <button
                  className="text-[#4A90E2] hover:text-white font-semibold text-sm"
                  onClick={() => openAuthModal("login")}
                >
                  Log In
                </button>
                <Button
                  className="bg-[#4A90E2] hover:bg-[#357ABD] text-white font-semibold text-sm h-9 px-4 rounded-lg"
                  onClick={() => openAuthModal("signup")}
                >
                  Sign Up
                </Button>
              </>
            ) : (
              <>
                <LanguageSelector onSelect={() => {}} compact />
                <Bell className="w-6 h-6 text-white/60" />
                <button
                  onClick={() => setMobileSidebarOpen(true)}
                  className="w-9 h-9 rounded-full bg-white/10 overflow-hidden flex items-center justify-center"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="User" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white font-bold text-sm">{displayName.charAt(0)}</span>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden md:flex items-center justify-between h-20 gap-3">
          {/* Left side: Logo and Search */}
          <div className="flex items-center gap-4 flex-1">
            <Link href="/" className="flex items-center gap-2 group shrink-0">
              <div className="w-[180px] sm:w-[240px] md:w-[280px]">
                <Logo />
              </div>
            </Link>
            <SearchDropdown className="flex-1 max-w-lg" />
          </div>

          {/* Right side: User controls */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-5">
              {!isAuthed ? (
                <>
                  <button
                    className="text-accent hover:text-white font-semibold font-display tracking-wide uppercase"
                    onClick={() => openAuthModal("login")}
                  >
                    {t("login")}
                  </button>
                  <Button
                    className="bg-primary hover:bg-primary/90 text-white font-bold tracking-wide border-2 border-primary-foreground/20 shadow-[0_4px_0_rgb(150,0,0)] active:shadow-none active:translate-y-[4px] transition-all rounded-lg uppercase"
                    onClick={() => openAuthModal("signup")}
                  >
                    {t("signup")}
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/portfolio" className="flex items-center gap-5 hover:opacity-90">
                    <div className="text-left">
                      <div className="text-[13px] text-muted-foreground leading-tight font-bold uppercase">{t("portfolio")}</div>
                      {navLoading ? (
                        <Skeleton className="h-5 w-24" style={{ background: 'rgba(255,255,255,0.15)' }} />
                      ) : (
                        <div className="text-lg font-bold text-[#F4F6FA] leading-tight font-display tracking-wide">
                          {fmt(navPortfolio)}
                        </div>
                      )}
                    </div>
                    <div className="text-left">
                      <div className="text-[13px] text-muted-foreground leading-tight font-bold uppercase">{t("cash")}</div>
                      {navLoading ? (
                        <Skeleton className="h-5 w-20" style={{ background: 'rgba(255,255,255,0.15)' }} />
                      ) : (
                        <div className="text-lg font-bold text-[#F4F6FA] leading-tight font-display tracking-wide">
                          {fmt(navCash)}
                        </div>
                      )}
                    </div>
                  </Link>
                  <Button
                    style={{ backgroundColor: '#E15646', color: 'white' }}
                    className="h-10 px-6 font-bold border-2 border-white/20 shadow-[0_4px_0_rgba(0,0,0,0.2)] active:shadow-none active:translate-y-[4px] transition-all rounded-lg uppercase hover:opacity-90"
                    onClick={() => setDepositModalOpen(true)}
                  >
                    {t("deposit")}
                  </Button>
                  <LanguageSelector onSelect={() => {}} compact />
                  <Bell className="w-6 h-6 text-muted-foreground cursor-pointer hover:text-accent transition-colors" />

                  <div
                    ref={dropdownRef}
                    className="relative"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                  >
                    <button
                      className="w-10 h-10 rounded-full bg-white/10 border-2 border-white/20 cursor-pointer overflow-hidden flex items-center justify-center hover:border-accent transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt="User"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-white font-bold font-display">
                          {displayName.charAt(0)}
                        </span>
                      )}
                    </button>

                    {avatarDropdownOpen && (
                      <div className="absolute right-0 top-full pt-2 z-50">
                        <div className="w-56 rounded-sm shadow-xl border border-[#e6ddcb] bg-[#f9f6ee] text-gray-700 py-1">
                          <Link
                            href="/portfolio"
                            className="flex items-center gap-3 px-3 py-2 hover:bg-black/5 cursor-pointer"
                            onClick={() => setAvatarDropdownOpen(false)}
                          >
                            <Wallet className="w-4 h-4" />
                            <span className="font-medium">{t("portfolio")}</span>
                          </Link>
                          <Link
                            href="/profile"
                            className="flex items-center gap-3 px-3 py-2 hover:bg-black/5 cursor-pointer"
                            onClick={() => setAvatarDropdownOpen(false)}
                          >
                            <User className="w-4 h-4" />
                            <span className="font-medium">{t("profile")}</span>
                          </Link>
                          <Link
                            href="/leaderboard"
                            className="flex items-center gap-3 px-3 py-2 hover:bg-black/5 cursor-pointer"
                            onClick={() => setAvatarDropdownOpen(false)}
                          >
                            <Trophy className="w-4 h-4" />
                            <span className="font-medium">{t("leaderboard")}</span>
                          </Link>
                          <Link
                            href="/watchlist"
                            className="flex items-center gap-3 px-3 py-2 hover:bg-black/5 cursor-pointer"
                            onClick={() => setAvatarDropdownOpen(false)}
                          >
                            <Bookmark className="w-4 h-4" />
                            <span className="font-medium">{t("watchlist")}</span>
                          </Link>
                          <div className="h-px bg-[#e6ddcb] my-1" />
                          <LanguageSelector onSelect={() => setAvatarDropdownOpen(false)} theme="light" />
                          <div className="h-px bg-[#e6ddcb] my-1" />
                          <button
                            onClick={() => { setAvatarDropdownOpen(false); signOut(); }}
                            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-black/5 cursor-pointer"
                          >
                            <LogOut className="w-4 h-4" />
                            <span className="font-medium">{t("logout")}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Category Pills */}
        <div className="md:hidden flex gap-6 overflow-x-auto scrollbar-hide py-3 px-4">
          <Link
            href="/"
            className={`text-sm font-medium whitespace-nowrap ${
              !currentCategory ? "text-white" : "text-white/60"
            }`}
          >
            All
          </Link>
          {navCategories.map((category) => (
            <Link
              key={category.value}
              href={`/?category=${category.value}`}
              className={`text-sm font-medium whitespace-nowrap ${
                currentCategory === category.value ? "text-white" : "text-white/60"
              }`}
            >
              {category.label}
            </Link>
          ))}
        </div>

        {/* Desktop Navigation Tabs */}
        <div className="hidden md:flex gap-6 overflow-x-auto scrollbar-hide pt-4 pb-0 border-b border-white/10">
          {navCategories.map((category) => {
            const isActive = currentCategory === category.value;
            return (
              <Link
                key={category.value}
                href={`/?category=${category.value}`}
                onMouseEnter={() => prefetchCategory(category.value)}
                className={`text-sm whitespace-nowrap pb-3 transition-colors font-medium tracking-wide capitalize ${
                  isActive
                    ? "text-accent border-b-2 border-accent"
                    : "text-[#F4F6FA] hover:text-white"
                }`}
              >
                {category.emoji && <span className="mr-1">{category.emoji}</span>}
                {category.label}
              </Link>
            );
          })}
        </div>
      </div>

      <DepositModal
        open={depositModalOpen}
        onClose={() => setDepositModalOpen(false)}
        user={user}
        onSuccess={() => refreshPortfolio()}
      />

      <MobileSidebar
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />
    </nav>
  );
}
