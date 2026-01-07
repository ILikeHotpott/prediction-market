"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AuthModal from "../AuthModal";
import OnboardingModal from "../OnboardingModal";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [authView, setAuthView] = useState("login"); // "login" | "signup"
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const lastSyncRef = useRef({});
  const backendBase =
    typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
      : "";

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
      if (nextSession) {
        setModalOpen(false);
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // Sync user to backend users table on login and check onboarding status
  useEffect(() => {
    async function syncUser() {
      if (!user || !backendBase) return;
      const now = Date.now();
      const last = lastSyncRef.current[user.id] || 0;
      if (now - last < 10_000) return; // 10s guard
      if (typeof window !== "undefined") {
        const stored = window.sessionStorage.getItem("user-synced");
        if (stored === user.id) {
          // Already synced, just check onboarding status
          checkOnboardingStatus();
          return;
        }
      }
      lastSyncRef.current[user.id] = now;
      const profile = user.user_metadata || {};
      try {
        await fetch(`${backendBase}/api/users/sync/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: user.id,
            display_name:
              profile.full_name || profile.name || profile.username || user.email,
            avatar_url: profile.avatar_url,
            role: profile.role, // backend defaults to "user" if missing
          }),
        });
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("user-synced", user.id);
        }
        // Check onboarding status after sync
        checkOnboardingStatus();
      } catch (_e) {
        // best-effort; ignore
      }
    }

    async function checkOnboardingStatus() {
      if (!user || !backendBase || onboardingChecked) return;
      try {
        const res = await fetch(`${backendBase}/api/users/me/`, {
          headers: { "X-User-Id": user.id },
        });
        if (res.ok) {
          const data = await res.json();
          setOnboardingChecked(true);
          if (!data.onboarding_completed) {
            setShowOnboarding(true);
          }
        }
      } catch (_e) {
        // ignore
      }
    }

    syncUser();
  }, [user, backendBase, onboardingChecked]);

  const openAuthModal = (view = "login") => {
    setAuthView(view);
    setModalOpen(true);
  };

  const closeAuthModal = () => setModalOpen(false);

  const signInWithEmail = async (email) => {
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}` : undefined;
    return supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });
  };

  const signInWithGoogle = async () => {
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}` : undefined;
    return supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  };

  const signInWithWallet = async () => {
    return supabase.auth.signInWithWeb3({
      chain: "ethereum",
      wallet:
        typeof window !== "undefined" && window.ethereum
          ? window.ethereum
          : undefined,
      options: {
        statement: "Sign in to continue to Web3Gambling.",
      },
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = useMemo(
    () => ({
      session,
      user,
      loading,
      modalOpen,
      authView,
      openAuthModal,
      closeAuthModal,
      setAuthView,
      signInWithEmail,
      signInWithGoogle,
      signInWithWallet,
      signOut,
    }),
    [
      session,
      user,
      loading,
      modalOpen,
      authView,
      signInWithEmail,
      signInWithGoogle,
      signInWithWallet,
    ],
  );

  const handleOnboardingComplete = (data) => {
    setShowOnboarding(false);
    // Optionally refresh portfolio to show new balance
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("portfolio-refresh"));
    }
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthModal />
      {user && showOnboarding && (
        <OnboardingModal
          open={showOnboarding}
          onComplete={handleOnboardingComplete}
          userId={user.id}
          initialDisplayName={user.user_metadata?.full_name || user.user_metadata?.name || user.email || ""}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}


