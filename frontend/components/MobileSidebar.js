"use client";

import { X, User, Trophy, Bookmark, Wallet, LogOut } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { usePortfolio } from "@/components/PortfolioProvider";
import LanguageSelector from "@/components/LanguageSelector";
import { useTranslations } from "next-intl";

export default function MobileSidebar({ isOpen, onClose }) {
  const { user, signOut } = useAuth();
  const { avatarUrl, displayName } = usePortfolio();
  const t = useTranslations("nav");

  if (!isOpen) return null;

  const name = displayName || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "User";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-50 md:hidden"
        onClick={onClose}
      />
      <div className="fixed left-0 top-0 bottom-0 w-80 bg-[#446f55] z-50 md:hidden overflow-y-auto transition-transform duration-300 ease-out animate-in slide-in-from-left">
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/10 overflow-hidden flex items-center justify-center">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="User" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold text-lg">{name.charAt(0)}</span>
                )}
              </div>
              <div>
                <div className="text-white font-bold text-lg">{name}</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white p-2"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-1 mb-8">
            <Link
              href="/portfolio"
              onClick={onClose}
              className="flex items-center gap-4 px-4 py-3 text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <Wallet className="w-5 h-5" />
              <span className="font-semibold">{t("portfolio")}</span>
            </Link>
            <Link
              href="/profile"
              onClick={onClose}
              className="flex items-center gap-4 px-4 py-3 text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <User className="w-5 h-5" />
              <span className="font-semibold">{t("profile")}</span>
            </Link>
            <Link
              href="/leaderboard"
              onClick={onClose}
              className="flex items-center gap-4 px-4 py-3 text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <Trophy className="w-5 h-5" />
              <span className="font-semibold">{t("leaderboard")}</span>
            </Link>
            <Link
              href="/watchlist"
              onClick={onClose}
              className="flex items-center gap-4 px-4 py-3 text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <Bookmark className="w-5 h-5" />
              <span className="font-semibold">{t("watchlist")}</span>
            </Link>
          </div>

          <div className="border-t border-white/10 pt-4 mb-8">
            <LanguageSelector onSelect={onClose} />
          </div>

          <button
            onClick={() => {
              signOut();
              onClose();
            }}
            className="w-full bg-[#1a3d2e] hover:bg-[#153426] text-white py-3 rounded-xl font-semibold transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </>
  );
}
