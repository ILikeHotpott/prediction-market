"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

const backendBase =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    : "";

// Cache duration: 60 seconds - data won't be refetched within this window
const CACHE_DURATION_MS = 60 * 1000;

const PortfolioContext = createContext({
  portfolio: 0,
  cash: 0,
  loading: false,
  avatarUrl: null,
  refreshPortfolio: () => {},
});

export function PortfolioProvider({ children }) {
  const { user } = useAuth();
  const [portfolio, setPortfolio] = useState(0);
  const [cash, setCash] = useState(0);
  const [loading, setLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);

  // Track last fetch time to implement caching
  const lastFetchTime = useRef(0);
  const lastUserId = useRef(null);
  const fetchInProgress = useRef(false);

  const fetchPortfolio = useCallback(async (force = false) => {
    if (!backendBase || !user) {
      setPortfolio(0);
      setCash(0);
      setAvatarUrl(null);
      return;
    }

    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTime.current;
    const userChanged = lastUserId.current !== user.id;

    // Skip fetch if:
    // 1. Not forced AND
    // 2. User hasn't changed AND
    // 3. Cache is still valid AND
    // 4. No fetch in progress
    if (!force && !userChanged && timeSinceLastFetch < CACHE_DURATION_MS) {
      return;
    }

    // Prevent concurrent fetches
    if (fetchInProgress.current) {
      return;
    }

    fetchInProgress.current = true;
    setLoading(true);

    try {
      // Fetch portfolio and user profile in parallel
      const [portfolioRes, profileRes] = await Promise.all([
        fetch(`${backendBase}/api/users/me/portfolio/`, {
          headers: { "X-User-Id": user.id },
          cache: "no-store",
        }),
        fetch(`${backendBase}/api/users/me/`, {
          headers: { "X-User-Id": user.id },
          cache: "no-store",
        }),
      ]);

      const data = await portfolioRes.json();
      if (!portfolioRes.ok) throw new Error(data.error || "failed");

      const cashValue = Number(data?.balance?.available_amount || 0);
      const portfolioValue = Number(data?.portfolio_value || 0);

      setCash(cashValue);
      setPortfolio(cashValue + portfolioValue);

      // Update avatar from profile
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setAvatarUrl(profileData.avatar_url || null);
      }

      lastFetchTime.current = Date.now();
      lastUserId.current = user.id;
    } catch (_e) {
      setCash(0);
      setPortfolio(0);
    } finally {
      setLoading(false);
      fetchInProgress.current = false;
    }
  }, [user]);

  // Force refresh - call this after trades, deposits, etc.
  const refreshPortfolio = useCallback(() => {
    fetchPortfolio(true);
  }, [fetchPortfolio]);

  // Initial fetch when user changes (with cache check)
  useEffect(() => {
    if (user) {
      fetchPortfolio(false);
    } else {
      setPortfolio(0);
      setCash(0);
      setAvatarUrl(null);
      lastFetchTime.current = 0;
      lastUserId.current = null;
    }
  }, [user, fetchPortfolio]);

  // Listen for portfolio-refresh events (e.g., after onboarding)
  useEffect(() => {
    const handleRefresh = () => refreshPortfolio();
    window.addEventListener("portfolio-refresh", handleRefresh);
    return () => window.removeEventListener("portfolio-refresh", handleRefresh);
  }, [refreshPortfolio]);

  return (
    <PortfolioContext.Provider value={{ portfolio, cash, loading, avatarUrl, refreshPortfolio }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  return useContext(PortfolioContext);
}
