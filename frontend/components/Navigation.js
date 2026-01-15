"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Bell, Menu, X, User, Trophy, Bookmark, LogOut } from "lucide-react";
import SearchDropdown from "@/components/SearchDropdown";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/auth/AuthProvider";
import { usePortfolio } from "@/components/PortfolioProvider";
import Logo from "@/components/Logo";
import DepositModal from "@/components/DepositModal";
import { NAV_CATEGORIES, getCategoryEmoji } from "@/lib/constants/categories";

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
  const { theme, setTheme } = useTheme();
  const { user, session, openAuthModal, signOut } = useAuth();
  const { portfolio: navPortfolio, cash: navCash, loading: navLoading, avatarUrl: profileAvatarUrl, refreshPortfolio } = usePortfolio();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentCategory = searchParams.get("category");

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

  return (
    <nav className="sticky top-0 z-50 bg-background border-b border-white/10 shadow-md mb-6">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">
        <div className="flex items-center justify-center md:justify-between h-20 gap-3 relative">
          {/* Retro Casino Logo */}
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <div className="w-[180px] sm:w-[240px] md:w-[280px]">
              <Logo />
            </div>
          </Link>

          <SearchDropdown className="flex-1 max-w-xl hidden md:block" />

          <div className="flex items-center gap-3 absolute right-0 md:relative">
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
                      {navLoading ? (
                        <Skeleton className="h-5 w-24" style={{ background: 'rgba(255,255,255,0.15)' }} />
                      ) : (
                        <div className="text-lg font-bold text-[#F4F6FA] leading-tight font-display tracking-wide">
                          {fmt(navPortfolio)}
                        </div>
                      )}
                    </div>
                    <div className="text-left">
                      <div className="text-[13px] text-muted-foreground leading-tight font-bold">CASH</div>
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
                    Deposit
                  </Button>
                  <Bell className="w-6 h-6 text-muted-foreground cursor-pointer hover:text-accent transition-colors" />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="w-10 h-10 rounded-full bg-white/10 border-2 border-white/20 cursor-pointer overflow-hidden flex items-center justify-center hover:border-accent transition-colors focus:outline-none focus:ring-2 focus:ring-accent">
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
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-56 rounded-sm shadow-xl border border-[#e6ddcb] bg-[#f9f6ee] text-gray-700"
                    >
                      <DropdownMenuItem asChild>
                        <Link href="/profile" className="flex items-center gap-3 cursor-pointer">
                          <User className="w-4 h-4" />
                          <span className="font-medium">Profile</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/leaderboard" className="flex items-center gap-3 cursor-pointer">
                          <Trophy className="w-4 h-4" />
                          <span className="font-medium">Leaderboard</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/watchlist" className="flex items-center gap-3 cursor-pointer">
                          <Bookmark className="w-4 h-4" />
                          <span className="font-medium">Watchlist</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-[#e6ddcb]" />
                      <DropdownMenuItem
                        onClick={signOut}
                        className="text-red-500 cursor-pointer flex items-center gap-3"
                      >
                        <LogOut className="w-4 h-4" />
                        <span className="font-medium">Logout</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
          {NAV_CATEGORIES.map((category) => {
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

        {mobileMenuOpen && (
          <div className="md:hidden pb-4 space-y-4 border-t border-white/10 pt-4 bg-background">
            <SearchDropdown />

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
                    <Link href="/profile" className="w-10 h-10 rounded-full bg-gray-600 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="User" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white font-semibold">
                          {displayName.charAt(0)}
                        </span>
                      )}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link href="/profile" className="text-white font-semibold truncate font-display block hover:text-accent">{displayName}</Link>
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
                        {navLoading ? (
                          <Skeleton className="h-5 w-24" style={{ background: 'rgba(255,255,255,0.15)' }} />
                        ) : (
                          <div className="text-lg font-semibold text-secondary font-display">{fmt(navPortfolio)}</div>
                        )}
                        <div className="text-xs text-muted-foreground font-bold uppercase">
                          Cash{" "}
                          {navLoading ? (
                            <Skeleton className="h-4 w-20 inline-block align-middle" style={{ background: 'rgba(255,255,255,0.15)' }} />
                          ) : (
                            fmt(navCash)
                          )}
                        </div>
                      </div>
                    </Link>
                    <Button
                      style={{ backgroundColor: '#E15646', color: 'white' }}
                      className="flex-shrink-0 font-bold h-12 px-4 uppercase hover:opacity-90"
                      onClick={() => setDepositModalOpen(true)}
                    >
                      Deposit
                    </Button>
                    <Bell className="w-5 h-5 text-gray-300 flex-shrink-0" />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 overflow-x-auto scrollbar-hide pt-1 pb-1">
              {NAV_CATEGORIES.map((category) => {
                const isActive = currentCategory === category.value;
                return (
                  <Link
                    key={category.value}
                    href={`/?category=${category.value}`}
                    onMouseEnter={() => prefetchCategory(category.value)}
                    className={`whitespace-nowrap px-3 py-2 rounded-full border capitalize font-medium text-xs ${
                      isActive
                        ? "text-accent bg-accent/10 border-accent"
                        : "text-muted-foreground hover:text-white bg-white/5 border-white/10"
                    }`}
                  >
                    {category.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <DepositModal
        open={depositModalOpen}
        onClose={() => setDepositModalOpen(false)}
        user={user}
        onSuccess={() => refreshPortfolio()}
      />
    </nav>
  );
}
