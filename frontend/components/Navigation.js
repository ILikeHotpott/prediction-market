"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Search, Bell, Menu, Moon, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import Logo from "@/components/Logo";

const backendBase =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    : "";

export default function Navigation() {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const { user, session, openAuthModal, signOut } = useAuth();
  const [navPortfolio, setNavPortfolio] = useState(0);
  const [navCash, setNavCash] = useState(0);
  const router = useRouter();

  const categories = [
    "Trending", "Breaking", "New", "Politics", "Sports", "Finance", 
    "Crypto", "Geopolitics", "Earnings", "Tech", "Culture", "World", 
    "Economy", "Elections", "Mentions", "More"
  ];

  const displayName = useMemo(() => {
    if (!user) return "User";
    return (
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email ||
      "User"
    );
  }, [user]);

  const avatarUrl = user?.user_metadata?.avatar_url;
  const walletLabel =
    user?.user_metadata?.wallet_address ||
    user?.user_metadata?.sub ||
    user?.id ||
    "";

  const isAuthed = !!session;

  useEffect(() => {
    async function fetchPortfolio() {
      if (!backendBase || !user) {
        setNavPortfolio(0);
        setNavCash(0);
        return;
      }
      try {
        const res = await fetch(`${backendBase}/api/users/me/portfolio/`, {
          headers: { "X-User-Id": user.id },
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "failed");
        const cash = Number(data?.balance?.available_amount || 0);
        const portfolioValue = Number(data?.portfolio_value || 0);
        setNavCash(cash);
        setNavPortfolio(cash + portfolioValue);
      } catch (_e) {
        setNavCash(0);
        setNavPortfolio(0);
      }
    }
    fetchPortfolio();
  }, [user]);

  const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

  const SearchInput = ({ className = "" }) => (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <input
        type="text"
        placeholder="Search monofuture"
        className="w-full bg-black/20 text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent border border-white/10 placeholder-white/50"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">/</span>
    </div>
  );

  return (
    <nav className="sticky top-0 z-50 bg-background border-b border-white/10 shadow-md mb-6">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">
        <div className="flex items-center justify-between h-20 gap-3">
          {/* Retro Casino Logo */}
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <Logo width={220} />
          </Link>

          <SearchInput className="flex-1 max-w-xl hidden md:block" />

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-5">
              {!isAuthed ? (
                <>
                  <button
                    className="text-accent hover:text-white font-semibold font-display tracking-wide uppercase"
                    onClick={() => openAuthModal("login")}
                  >
                    Log In
                  </button>
                  <Button
                    className="bg-primary hover:bg-primary/90 text-white font-bold tracking-wide border-2 border-primary-foreground/20 shadow-[0_4px_0_rgb(150,0,0)] active:shadow-none active:translate-y-[4px] transition-all rounded-lg uppercase"
                    onClick={() => openAuthModal("signup")}
                  >
                    Sign Up
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/portfolio" className="flex items-center gap-5 hover:opacity-90">
                    <div className="text-left">
                      <div className="text-[13px] text-muted-foreground leading-tight font-bold">PORTFOLIO</div>
                      <div className="text-lg font-bold text-[#F4F6FA] leading-tight font-display tracking-wide">
                        {fmt(navPortfolio)}
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="text-[13px] text-muted-foreground leading-tight font-bold">CASH</div>
                      <div className="text-lg font-bold text-[#F4F6FA] leading-tight font-display tracking-wide">
                        {fmt(navCash)}
                      </div>
                    </div>
                  </Link>
                  <Button
                    style={{ backgroundColor: '#E15646', color: 'white' }}
                    className="h-10 px-6 font-bold border-2 border-white/20 shadow-[0_4px_0_rgba(0,0,0,0.2)] active:shadow-none active:translate-y-[4px] transition-all rounded-lg uppercase hover:opacity-90"
                    onClick={() => router.push("/portfolio")}
                  >
                    Deposit
                  </Button>
                  <Bell className="w-6 h-6 text-muted-foreground cursor-pointer hover:text-accent transition-colors" />

                  <div
                    className="relative"
                    onMouseEnter={() => setShowUserMenu(true)}
                    onMouseLeave={() => setShowUserMenu(false)}
                  >
                    <div className="w-10 h-10 rounded-full bg-white/10 border-2 border-white/20 cursor-pointer overflow-hidden flex items-center justify-center hover:border-accent transition-colors">
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
                    </div>

                    {showUserMenu && (
                      <div className="absolute right-0 top-full pt-2">
                        <div className="w-64 bg-[#1e293b] dark:bg-[#0f172a] rounded-lg shadow-xl border border-white/10 py-2 z-50">
                          <div className="px-4 py-3 border-b border-white/10">
                            <div className="font-semibold text-white font-display">
                              {displayName}
                            </div>
                            {walletLabel && (
                              <div className="text-sm text-gray-400 truncate">
                                {walletLabel}
                              </div>
                            )}
                          </div>

                          <MenuItem icon="🏆" label="Leaderboard" />
                          <MenuItem icon="💰" label="Rewards" />
                          <MenuItem icon="🔌" label="APIs" />

                          <div className="px-4 py-2 flex items-center justify-between hover:bg-white/10 cursor-pointer transition-colors">
                            <div className="flex items-center gap-2">
                              <span>{theme === "dark" ? "🌙" : "☀️"}</span>
                              <span className="text-white">Dark mode</span>
                            </div>
                            <button
                              onClick={() =>
                                setTheme(theme === "dark" ? "light" : "dark")
                              }
                              className={`w-12 h-6 rounded-full transition-colors ${
                                theme === "dark" ? "bg-accent" : "bg-gray-600"
                              } relative`}
                            >
                              <div
                                className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                                  theme === "dark"
                                    ? "translate-x-6"
                                    : "translate-x-0.5"
                                }`}
                              />
                            </button>
                          </div>

                          <div className="border-t border-white/10 mt-2 pt-2">
                            <MenuItem label="Accuracy" />
                            <MenuItem label="Watchlist" />
                            <MenuItem label="Documentation" />
                            <MenuItem label="Terms of Use" />
                            <MenuItem
                              label="Logout"
                              className="text-red-400"
                              onClick={signOut}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <button
              className="md:hidden p-2 rounded-lg hover:bg-white/10 text-white"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <div className="hidden md:flex gap-6 overflow-x-auto scrollbar-hide pt-4 pb-0 border-b border-white/10">
          {categories.map((category, idx) => (
            <Link
              key={idx}
              href={`/${category.toLowerCase()}`}
              className={`text-sm whitespace-nowrap pb-3 transition-colors font-medium tracking-wide uppercase ${
                idx === 0
                  ? "text-accent border-b-2 border-accent"
                  : "text-[#F4F6FA] hover:text-white"
              }`}
            >
              {idx === 0 && <span className="mr-1">🔥</span>}
              {category}
            </Link>
          ))}
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden pb-4 space-y-4 border-t border-white/10 pt-4 bg-background">
            <SearchInput />

            <div className="flex flex-col gap-3">
              {!isAuthed ? (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="ghost"
                    className="text-accent hover:text-white sm:flex-1 uppercase font-bold"
                    onClick={() => openAuthModal("login")}
                  >
                    Log In
                  </Button>
                  <Button
                    className="bg-primary hover:bg-primary/90 text-white sm:flex-1 uppercase font-bold"
                    onClick={() => openAuthModal("signup")}
                  >
                    Sign Up
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
                    <div className="w-10 h-10 rounded-full bg-gray-600 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="User" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white font-semibold">
                          {displayName.charAt(0)}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-semibold truncate font-display">{displayName}</div>
                      {walletLabel && <div className="text-xs text-gray-400 truncate">{walletLabel}</div>}
                    </div>
                    <button className="text-red-300 text-sm font-bold uppercase" onClick={signOut}>
                      Logout
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <Link href="/portfolio" className="flex-1">
                      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                        <div className="text-xs text-muted-foreground font-bold uppercase">Portfolio</div>
                        <div className="text-lg font-semibold text-secondary font-display">{fmt(navPortfolio)}</div>
                        <div className="text-xs text-muted-foreground font-bold uppercase">Cash {fmt(navCash)}</div>
                      </div>
                    </Link>
                    <Button
                      style={{ backgroundColor: '#E15646', color: 'white' }}
                      className="flex-shrink-0 font-bold h-12 px-4 uppercase hover:opacity-90"
                      onClick={() => router.push("/portfolio")}
                    >
                      Deposit
                    </Button>
                    <Bell className="w-5 h-5 text-gray-300 flex-shrink-0" />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 overflow-x-auto scrollbar-hide pt-1 pb-1">
              {categories.map((category, idx) => (
                <Link
                  key={idx}
                  href={`/${category.toLowerCase()}`}
                  className="text-muted-foreground hover:text-white whitespace-nowrap px-3 py-2 rounded-full bg-white/5 border border-white/10 uppercase font-medium text-xs"
                >
                  {category}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

function MenuItem({ icon, label, className = "", onClick }) {
  return (
    <div
      className={`px-4 py-2 hover:bg-white/10 cursor-pointer transition-colors ${className}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        {icon && <span>{icon}</span>}
        <span className="text-white font-sans">{label}</span>
      </div>
    </div>
  );
}
