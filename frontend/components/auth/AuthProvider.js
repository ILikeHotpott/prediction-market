"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import AuthModal from "../AuthModal";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [authView, setAuthView] = useState("login"); // "login" | "signup"
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

  // Sync user to backend users table on login
  useEffect(() => {
    async function syncUser() {
      if (!user || !backendBase) return;
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
      } catch (_e) {
        // best-effort; ignore
      }
    }
    syncUser();
  }, [user, backendBase]);

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

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthModal />
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


