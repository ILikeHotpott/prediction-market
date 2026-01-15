"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

const backendBase =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    : "";

export default function RedemptionCodeGeneratorForm({ user, onGenerated }) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleGenerate(e) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setLoading(true);
    setError("");
    setGeneratedCode(null);

    try {
      const res = await fetch(`${backendBase}/api/admin/redemption-codes/generate/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": user?.id,
        },
        body: JSON.stringify({ amount: Number(amount) }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate code");
      }

      setGeneratedCode(data);
      setAmount("");
      onGenerated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(code) {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-card border border rounded-xl p-6">
      <h2 className="text-xl font-semibold mb-4">Generate Redemption Code</h2>

      <form onSubmit={handleGenerate} className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <label className="block text-sm text-foreground opacity-80 mb-2">Amount (USD)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
            min="0.01"
            step="0.01"
            className="w-full bg-popover border border rounded-lg p-3 text-foreground placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={loading}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="submit"
            disabled={loading || !amount}
            className="h-12 px-6 bg-green-600 hover:bg-green-700"
          >
            {loading ? "Generating..." : "Generate Code"}
          </Button>
        </div>
      </form>

      {error && (
        <div className="mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {generatedCode && (
        <div className="mt-4 p-4 bg-green-500/20 border border-green-500/50 rounded-lg">
          <div className="text-green-400 text-sm mb-2">Code Generated Successfully!</div>
          <div className="flex items-center gap-3">
            <code className="text-2xl font-mono font-bold text-foreground tracking-wider">
              {generatedCode.code}
            </code>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copyToClipboard(generatedCode.code)}
              className="text-foreground opacity-60 hover:text-foreground"
            >
              {copied ? (
                <Check className="w-5 h-5 text-green-400" />
              ) : (
                <Copy className="w-5 h-5" />
              )}
            </Button>
          </div>
          <div className="text-foreground opacity-60 text-sm mt-2">
            Value: ${Number(generatedCode.amount).toFixed(2)} {generatedCode.token}
          </div>
        </div>
      )}
    </div>
  );
}
