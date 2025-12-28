"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Search, Bell, Menu, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";

const backendBase =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    : "";

export default function Navigation() {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { theme, setTheme } = useTheme();
  const { user, session, openAuthModal, signOut } = useAuth();
  const [navPortfolio, setNavPortfolio] = useState(0);
  const [navCash, setNavCash] = useState(0);
  const router = useRouter();

  const categories = [
    "Trending",
    "Breaking",
    "New",
    "Politics",
    "Sports",
    "Finance",
    "Crypto",
    "Geopolitics",
    "Earnings",
    "Tech",
    "Culture",
    "World",
    "Economy",
    "Elections",
    "Mentions",
    "More",
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

  return (
    <nav className="sticky top-0 z-50 bg-[#202b39] border-b border-[#425264]">
      <div className="max-w-[1400px] mx-auto px-12">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 text-white">
            <div className="w-8 h-8 bg-white rounded flex items-center justify-center">
              <span className="text-[#1e293b] font-bold">M</span>
            </div>
            <span className="font-semibold text-lg">Monofuture</span>
          </Link>

          <div className="flex-1 max-w-xl mx-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search monofuture"
                className="w-full bg-[#2a3847] text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                /
              </span>
            </div>
          </div>

          <div className="flex items-center gap-5">
            {!isAuthed ? (
              <>
                <button
                  className="text-blue-300 hover:text-white font-semibold"
                  onClick={() => openAuthModal("login")}
                >
                  Log In
                </button>
                <Button
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                  onClick={() => openAuthModal("signup")}
                >
                  Sign Up
                </Button>
                <Menu className="w-6 h-6 text-white" />
              </>
            ) : (
              <>
                <Link href="/portfolio" className="flex items-center gap-5 hover:opacity-90">
                  <div className="text-left">
                    <div className="text-[13px] text-gray-300 leading-tight">Portfolio</div>
                    <div className="text-lg font-semibold text-green-400 leading-tight">
                      {fmt(navPortfolio)}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-[13px] text-gray-300 leading-tight">Cash</div>
                    <div className="text-lg font-semibold text-green-400 leading-tight">
                      {fmt(navCash)}
                    </div>
                  </div>
                </Link>
                <Button
                  className="h-10 px-6 bg-blue-500 hover:bg-blue-600 text-white"
                  onClick={() => router.push("/portfolio")}
                >
                  Deposit
                </Button>
                <Bell className="w-5 h-5 text-gray-400 cursor-pointer hover:text-white" />

                <div
                  className="relative"
                  onMouseEnter={() => setShowUserMenu(true)}
                  onMouseLeave={() => setShowUserMenu(false)}
                >
                  <div className="w-10 h-10 rounded-full bg-gray-600 cursor-pointer overflow-hidden flex items-center justify-center">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="User"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-white font-semibold">
                        {displayName.charAt(0)}
                      </span>
                    )}
                  </div>

                  {showUserMenu && (
                    <div className="absolute right-0 top-full pt-2">
                      <div className="w-64 bg-[#1e293b] dark:bg-[#0f172a] rounded-lg shadow-xl border border-gray-700 py-2">
                        <div className="px-4 py-3 border-b border-gray-700">
                          <div className="font-semibold text-white">
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

                        <div className="px-4 py-2 flex items-center justify-between hover:bg-[#334155] dark:hover:bg-[#1e293b] cursor-pointer transition-colors">
                          <div className="flex items-center gap-2">
                            <span>{theme === "dark" ? "🌙" : "☀️"}</span>
                            <span className="text-white">Dark mode</span>
                          </div>
                          <button
                            onClick={() =>
                              setTheme(theme === "dark" ? "light" : "dark")
                            }
                            className={`w-12 h-6 rounded-full transition-colors ${
                              theme === "dark" ? "bg-blue-600" : "bg-gray-600"
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

                        <div className="border-t border-gray-700 mt-2 pt-2">
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
        </div>

        <div className="flex gap-6 overflow-x-auto scrollbar-hide pt-4 pb-0 border-b border-gray-700">
          {categories.map((category, idx) => (
            <Link
              key={idx}
              href={`/${category.toLowerCase()}`}
              className={`text-sm whitespace-nowrap pb-3 transition-colors ${
                idx === 0
                  ? "text-white border-b-2 border-white font-semibold"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {idx === 0 && <span className="mr-1">📈</span>}
              {category}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

function MenuItem({ icon, label, className = "", onClick }) {
  return (
    <div
      className={`px-4 py-2 hover:bg-[#334155] dark:hover:bg-[#1e293b] cursor-pointer transition-colors ${className}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        {icon && <span>{icon}</span>}
        <span className="text-white">{label}</span>
      </div>
    </div>
  );
}
