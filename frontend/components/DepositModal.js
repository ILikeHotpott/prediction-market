"use client";

import { useState } from "react";
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
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogContent className="mx-4">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display">Deposit Funds</DialogTitle>
          <DialogDescription>
            Enter your redemption code to add funds to your account
          </DialogDescription>
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
          <form onSubmit={handleSubmit}>
            <div className="py-4">
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
        )}
      </DialogContent>
    </Dialog>
  );
}
