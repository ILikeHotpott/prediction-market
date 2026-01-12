"use client";

import { useState } from "react";
import { Mail, X, CheckCircle, AlertCircle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";

export default function AuthModal() {
  const {
    modalOpen,
    closeAuthModal,
    authView,
    setAuthView,
    signInWithEmail,
    signInWithGoogle,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!modalOpen) return null;

  const handleEmailSubmit = async () => {
    setStatus("");
    setError("");
    if (!email) {
      setError("Please enter a valid email.");
      return;
    }
    setIsSubmitting(true);
    const { error: err } = await signInWithEmail(email.trim());
    if (err) {
      setError(err.message);
    } else {
      setStatus(
        "Check your inbox for a sign-in link. It may take a few seconds to arrive.",
      );
      setEmail("");
    }
    setIsSubmitting(false);
  };

  const handleGoogle = async () => {
    setStatus("");
    setError("");
    await signInWithGoogle();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-[#f9f6ee] shadow-2xl border border-[#e6ddcb]">
        {/* Header with theme color */}
        <div className="relative bg-[#5a7a5a] px-8 py-8 text-white">
          <button
            onClick={closeAuthModal}
            className="absolute right-4 top-4 rounded-full p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition-all"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-2xl font-bold">
            {authView === "login" ? "Welcome back" : "Create account"}
          </h2>
          <p className="mt-1 text-white/80 text-sm">
            {authView === "login"
              ? "Sign in to continue to Monofuture"
              : "Join Monofuture today"}
          </p>
        </div>

        {/* Content */}
        <div className="px-8 py-6 space-y-5">
          {/* Google Button */}
          <Button
            onClick={handleGoogle}
            className="w-full bg-white hover:bg-gray-50 text-gray-700 border border-[#e6ddcb] shadow-sm flex items-center justify-center gap-3 py-6 text-base font-medium transition-all hover:shadow-md"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-[#e6ddcb]" />
            <span className="text-xs text-[#8b7355] uppercase tracking-wider font-medium">or</span>
            <div className="flex-1 h-px bg-[#e6ddcb]" />
          </div>

          {/* Email Input */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#5a5a5a]">Email address</label>
            <div className="relative">
              <Mail className="w-5 h-5 text-[#8b7355] absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEmailSubmit()}
                placeholder="you@example.com"
                className="w-full bg-white border border-[#e6ddcb] rounded-xl pl-12 pr-4 py-3.5 text-gray-900 placeholder:text-[#b0a090] focus:outline-none focus:ring-2 focus:ring-[#5a7a5a] focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Continue Button */}
          <Button
            onClick={handleEmailSubmit}
            disabled={isSubmitting}
            className="w-full bg-[#5a7a5a] hover:bg-[#4a6a4a] text-white py-6 text-base font-medium rounded-xl transition-all hover:shadow-lg disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Sending link...
              </span>
            ) : (
              "Continue with Email"
            )}
          </Button>

          {/* Status/Error Messages */}
          {(status || error) && (
            <div
              className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ${
                status
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {status ? (
                <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              )}
              <div>{status || error}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 bg-[#f2eadc] border-t border-[#e6ddcb] text-center text-sm text-[#5a5a5a]">
          {authView === "login" ? (
            <>
              Don't have an account?{" "}
              <button
                className="text-[#5a7a5a] font-medium hover:underline"
                onClick={() => setAuthView("signup")}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                className="text-[#5a7a5a] font-medium hover:underline"
                onClick={() => setAuthView("login")}
              >
                Log in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
