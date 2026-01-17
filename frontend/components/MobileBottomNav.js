"use client";

import { Home, Search, TrendingUp, BarChart3 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { usePortfolio } from "@/components/PortfolioProvider";

export default function MobileBottomNav({ onMenuClick }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { cash } = usePortfolio();

  const isActive = (path) => pathname === path;

  const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#1a3d2e] border-t border-gray-700 z-40">
      <div className="flex items-center justify-around h-16 px-2">
        <Link
          href="/"
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            isActive("/") ? "text-white" : "text-gray-400"
          }`}
        >
          <Home className="w-6 h-6 mb-1" />
          <span className="text-xs font-medium">Home</span>
        </Link>

        <Link
          href="/search"
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            isActive("/search") ? "text-white" : "text-gray-400"
          }`}
        >
          <Search className="w-6 h-6 mb-1" />
          <span className="text-xs font-medium">Search</span>
        </Link>

        <Link
          href="/leaderboard"
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            isActive("/leaderboard") ? "text-white" : "text-gray-400"
          }`}
        >
          <TrendingUp className="w-6 h-6 mb-1" />
          <span className="text-xs font-medium">Breaking</span>
        </Link>

        <Link
          href="/portfolio"
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            isActive("/portfolio") ? "text-white" : "text-gray-400"
          }`}
        >
          <BarChart3 className="w-6 h-6 mb-0.5" />
          <div className="text-xs font-medium">{fmt(cash)}</div>
        </Link>
      </div>
    </nav>
  );
}
