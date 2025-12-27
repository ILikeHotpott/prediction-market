"use client";

import { useState } from "react";
import { Mail, X, ShieldAlert } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";

const walletOptions = [
  { label: "MetaMask", key: "metamask", icon: "🦊" },
  { label: "WalletConnect", key: "walletconnect", icon: "🛡️" },
  { label: "Trust Wallet", key: "trust", icon: "🅣" },
  { label: "Coinbase", key: "coinbase", icon: "⚪" },
  { label: "Phantom", key: "phantom", icon: "👻" },
  { label: "Rainbow", key: "rainbow", icon: "〰️" },
];

export default function AuthModal() {
  const {
    modalOpen,
    closeAuthModal,
    authView,
    setAuthView,
    signInWithEmail,
    signInWithGoogle,
    signInWithWallet,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWalletLoading, setIsWalletLoading] = useState(false);

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

  const handleWallet = async () => {
    setError("");
    setStatus("");
    setIsWalletLoading(true);
    if (typeof window === "undefined" || !window.ethereum) {
      setError("No compatible wallet found. Please install MetaMask or another EVM wallet.");
      setIsWalletLoading(false);
      return;
    }
    const { error: err } = await signInWithWallet();
    if (err) {
      setError(err.message);
    }
    setIsWalletLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-[#1f2937] text-white shadow-2xl border border-[#2b3a4b]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2b3a4b]">
          <div>
            <div className="text-sm uppercase tracking-wide text-gray-400">
              {authView === "login" ? "Log In" : "Sign Up"}
            </div>
            <h2 className="text-2xl font-semibold">Welcome to Monofuture</h2>
          </div>
          <button
            onClick={closeAuthModal}
            className="text-gray-400 hover:text-white"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-5">
          <Button
            onClick={handleGoogle}
            className="w-full bg-sky-600 hover:bg-sky-700 text-white flex items-center justify-center gap-2 py-3 text-lg"
          >
            <span className="text-xl">G</span>
            Continue with Google
          </Button>

          <div className="flex items-center gap-3 text-gray-400">
            <div className="flex-1 h-px bg-[#2b3a4b]" />
            <span className="text-sm">OR</span>
            <div className="flex-1 h-px bg-[#2b3a4b]" />
          </div>

          <div className="space-y-3">
            <div className="text-sm text-gray-300">Email address</div>
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEmailSubmit()}
                  placeholder="you@example.com"
                  className="w-full bg-[#111827] border border-[#2b3a4b] rounded-lg pl-10 pr-3 py-3 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-600"
                />
              </div>
              <Button
                onClick={handleEmailSubmit}
                disabled={isSubmitting}
                className="px-6 bg-sky-600 hover:bg-sky-700"
              >
                {isSubmitting ? "Sending..." : "Continue"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {walletOptions.map((wallet) => (
              <button
                key={wallet.key}
                onClick={handleWallet}
                disabled={isWalletLoading}
                className="flex flex-col items-center justify-center gap-2 rounded-xl bg-[#111827] border border-[#2b3a4b] px-4 py-3 text-sm text-gray-200 hover:border-sky-600 hover:text-white transition-colors"
              >
                <span className="text-2xl leading-none">{wallet.icon}</span>
                <span>{wallet.label}</span>
              </button>
            ))}
          </div>

          {(status || error) && (
            <div
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                status
                  ? "border-green-500/50 bg-green-500/10 text-green-200"
                  : "border-red-500/50 bg-red-500/10 text-red-200"
              }`}
            >
              {error && <ShieldAlert className="w-4 h-4 mt-0.5" />}
              <div>{status || error}</div>
            </div>
          )}

          <div className="text-center text-sm text-gray-400">
            {authView === "login" ? (
              <>
                New here?{" "}
                <button
                  className="text-sky-400 hover:underline"
                  onClick={() => setAuthView("signup")}
                >
                  Sign Up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  className="text-sky-400 hover:underline"
                  onClick={() => setAuthView("login")}
                >
                  Log In
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


