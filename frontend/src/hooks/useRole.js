"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

const backendBase = typeof window !== "undefined"
  ? process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
  : "";

const ROLE_CHECK_INTERVAL = 60000; // 60 seconds

export function useRole() {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = useCallback(async () => {
    if (!user || !backendBase) {
      setRole(null);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${backendBase}/api/users/me/`, {
        headers: { "X-User-Id": user.id },
      });
      if (res.ok) {
        const data = await res.json();
        setRole(data.role);
      } else {
        setRole(null);
      }
    } catch (_e) {
      // Keep existing role on error
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial fetch
  useEffect(() => {
    if (!authLoading) {
      fetchRole();
    }
  }, [authLoading, fetchRole]);

  // Periodic refresh
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(fetchRole, ROLE_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [user, fetchRole]);

  const isAdmin = useMemo(() => role === "admin" || role === "superadmin", [role]);
  const isSuperAdmin = useMemo(() => role === "superadmin", [role]);

  return {
    role,
    loading: authLoading || loading,
    isAdmin,
    isSuperAdmin,
    refreshRole: fetchRole,
  };
}
