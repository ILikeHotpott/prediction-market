"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const backendBase =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    : "";

export default function DepositModal({ open, onClose, user, onSuccess }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);
  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [stripeError, setStripeError] = useState("");
  const [stripeLoadingId, setStripeLoadingId] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    async function loadPackages() {
      setPackagesLoading(true);
      setStripeError("");
      try {
        const res = await fetch(`${backendBase}/api/stripe/packages/`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load packages");
        if (active) setPackages(data.items || []);
      } catch (err) {
        if (active) {
          setStripeError(err.message);
          setPackages([]);
        }
      } finally {
        if (active) setPackagesLoading(false);
      }
    }
    loadPackages();
    return () => {
      active = false;
    };
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) {
      setError("Please enter a redemption code");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess(null);

    try {
      const res = await fetch(`${backendBase}/api/users/me/redeem/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": user?.id,
        },
        body: JSON.stringify({ code: code.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to redeem code");
      }

      setSuccess({
        amount: data.amount,
        newBalance: data.new_balance,
      });
      setCode("");
      onSuccess?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCode("");
    setError("");
    setSuccess(null);
    setStripeError("");
    setStripeLoadingId("");
    onClose();
  };

  const handleCheckout = async (pkg) => {
    if (!user?.id) {
      setStripeError("Please sign in to continue");
      return;
    }
    setStripeLoadingId(pkg.id);
    setStripeError("");
    try {
      const res = await fetch(`${backendBase}/api/users/me/stripe/checkout-session/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": user?.id,
        },
        body: JSON.stringify({ package_id: pkg.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start checkout");
      }
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      throw new Error("Missing checkout URL");
    } catch (err) {
      setStripeError(err.message);
      setStripeLoadingId("");
    }
  };

  const formatNumber = (value) => {
    try {
      return new Intl.NumberFormat("en-US").format(value);
    } catch {
      return String(value);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogContent className="mx-4">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display">Deposit Funds</DialogTitle>
          <DialogDescription className="sr-only">Deposit funds</DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-6">
            <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 text-center">
              <div className="text-green-400 text-lg font-semibold mb-2">
                Success!
              </div>
              <div className="text-white text-2xl font-bold font-display">
                +${Number(success.amount).toFixed(2)}
              </div>
              <div className="text-gray-400 text-sm mt-2">
                New balance: ${Number(success.newBalance).toFixed(2)}
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                onClick={handleClose}
                className="w-full bg-primary hover:bg-primary/90"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#0b1220] p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {packagesLoading && (
                  <div className="col-span-full text-sm text-gray-400">Loading packages...</div>
                )}
                {!packagesLoading && packages.length === 0 && (
                  <div className="col-span-full text-sm text-red-400">
                    Unable to load coin packages.
                  </div>
                )}
                {packages.map((pkg) => {
                  const totalCoins = Number(pkg.coins || 0);
                  const usd = pkg.usd_amount || pkg.usd || pkg.price;
                  const isLoading = stripeLoadingId === pkg.id;
                  return (
                    <div
                      key={pkg.id}
                      className={`rounded-xl border px-4 py-3 transition ${
                        pkg.highlight
                          ? "border-amber-400/70 bg-amber-500/10 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]"
                          : "border-white/10 bg-white/5 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-white">
                          {pkg.name || "Coin Pack"}
                        </div>
                        {pkg.badge && (
                          <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                            {pkg.badge}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 text-lg font-semibold text-white">
                        {formatNumber(totalCoins)} coins
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={isLoading}
                        onClick={() => handleCheckout(pkg)}
                        className="mt-3 w-full bg-amber-500/90 text-slate-900 hover:bg-amber-400"
                      >
                        {isLoading ? "Redirecting..." : `Buy $${usd}`}
                      </Button>
                    </div>
                  );
                })}
              </div>
              {stripeError && (
                <div className="mt-3 text-xs text-red-400">{stripeError}</div>
              )}
            </div>

            <form onSubmit={handleSubmit}>
              <div className="border-t border-white/10 pt-5">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Redemption Code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Enter your code"
                  className="w-full px-4 py-3 bg-[#0f172a] border border-[#334155] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono text-lg tracking-wider"
                  disabled={loading}
                  autoFocus
                />
                {error && (
                  <div className="mt-2 text-red-400 text-sm">{error}</div>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClose}
                  disabled={loading}
                  className="text-gray-400 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !code.trim()}
                  className="bg-primary hover:bg-primary/90 min-w-[120px]"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Redeeming...
                    </span>
                  ) : (
                    "Redeem Code"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
