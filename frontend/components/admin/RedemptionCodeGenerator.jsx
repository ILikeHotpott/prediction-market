"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

const backendBase =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    : "";

export default function RedemptionCodeGenerator({ user }) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState(null);
  const [error, setError] = useState("");
  const [codes, setCodes] = useState([]);
  const [copied, setCopied] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (user) fetchCodes();
  }, [user]);

  async function fetchCodes() {
    if (!user?.id) return;
    try {
      const url = statusFilter === "all"
        ? `${backendBase}/api/admin/redemption-codes/`
        : `${backendBase}/api/admin/redemption-codes/?status=${statusFilter}`;
      const res = await fetch(url, {
        headers: { "X-User-Id": user.id },
      });
      if (!res.ok) {
        console.error("Failed to fetch codes:", res.status);
        return;
      }
      const data = await res.json();
      setCodes(data.items || []);
    } catch (err) {
      console.error("Failed to fetch codes:", err);
    }
  }

  useEffect(() => {
    if (user) fetchCodes();
  }, [statusFilter]);

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
      fetchCodes();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(code) {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-6">
      {/* Generator Form */}
      <div className="bg-[#1f2937] border border-[#334155] rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-4">Generate Redemption Code</h2>

        <form onSubmit={handleGenerate} className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm text-gray-300 mb-2">Amount (USD)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              min="0.01"
              step="0.01"
              className="w-full bg-[#0f172a] border border-[#334155] rounded-lg p-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
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
              <code className="text-2xl font-mono font-bold text-white tracking-wider">
                {generatedCode.code}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyToClipboard(generatedCode.code)}
                className="text-gray-400 hover:text-white"
              >
                {copied === generatedCode.code ? (
                  <Check className="w-5 h-5 text-green-400" />
                ) : (
                  <Copy className="w-5 h-5" />
                )}
              </Button>
            </div>
            <div className="text-gray-400 text-sm mt-2">
              Value: ${Number(generatedCode.amount).toFixed(2)} {generatedCode.token}
            </div>
          </div>
        )}
      </div>

      {/* Codes List */}
      <div className="bg-[#1f2937] border border-[#334155] rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Redemption Codes</h2>
          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="used">Used</option>
            </select>
            <Button variant="outline" size="sm" onClick={fetchCodes}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-gray-300">
              <tr className="text-left border-b border-[#334155]">
                <th className="p-3">Code</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3">Created</th>
                <th className="p-3">Used At</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code.id} className="border-b border-[#334155]/50 hover:bg-[#0f172a]/50">
                  <td className="p-3">
                    <code className="font-mono text-white">{code.code}</code>
                  </td>
                  <td className="p-3 text-white">
                    ${Number(code.amount).toFixed(2)}
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        code.status === "active"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-gray-500/20 text-gray-400"
                      }`}
                    >
                      {code.status}
                    </span>
                  </td>
                  <td className="p-3 text-gray-400">
                    {new Date(code.created_at).toLocaleString()}
                  </td>
                  <td className="p-3 text-gray-400">
                    {code.used_at ? new Date(code.used_at).toLocaleString() : "-"}
                  </td>
                  <td className="p-3">
                    {code.status === "active" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(code.code)}
                        className="text-gray-400 hover:text-white"
                      >
                        {copied === code.code ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {codes.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-gray-400">
                    No redemption codes found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
