"use client";

import { useState } from "react";
import { X, CheckCircle, AlertCircle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";

export default function AuthModal() {
  const {
    modalOpen,
    closeAuthModal,
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
      <div className="relative w-full max-w-md bg-[#2C3E50] rounded-2xl p-8 shadow-2xl">
        <button
          onClick={closeAuthModal}
          className="absolute right-4 top-4 rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white transition-all"
          aria-label="Close"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex flex-col items-center">
        <h1 className="text-white text-3xl font-bold mb-12 text-center">Welcome to Monofuture</h1>

        <div className="w-full space-y-4">
          <Button
            onClick={handleGoogle}
            className="w-full bg-[#4A90E2] hover:bg-[#357ABD] text-white border-0 shadow-none flex items-center justify-center gap-3 h-14 text-base font-semibold rounded-xl transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </Button>

          <div className="flex items-center gap-4 py-2">
            <div className="flex-1 h-px bg-white/20" />
            <span className="text-sm text-white/60 uppercase tracking-wider font-medium">OR</span>
            <div className="flex-1 h-px bg-white/20" />
          </div>

          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEmailSubmit()}
              placeholder="Email address"
              className="flex-1 bg-[#34495E] border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#4A90E2] focus:border-transparent transition-all"
            />
            <Button
              onClick={handleEmailSubmit}
              disabled={isSubmitting}
              className="bg-[#5A6C7D] hover:bg-[#4A5C6D] text-white px-6 h-auto rounded-xl transition-all disabled:opacity-50 font-semibold"
            >
              {isSubmitting ? "..." : "Continue"}
            </Button>
          </div>

          {(status || error) && (
            <div
              className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ${
                status
                  ? "bg-green-500/20 text-green-300 border border-green-500/30"
                  : "bg-red-500/20 text-red-300 border border-red-500/30"
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

          <div className="text-center pt-4">
            <a href="#" className="text-white/60 text-sm hover:text-white/80 transition-colors">Terms</a>
            <span className="text-white/40 mx-2">•</span>
            <a href="#" className="text-white/60 text-sm hover:text-white/80 transition-colors">Privacy</a>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
