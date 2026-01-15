"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

const backendBase =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    : "";

export default function RedemptionCodesList({ user }) {
  const [codes, setCodes] = useState([]);
  const [copied, setCopied] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (user) fetchCodes();
  }, [user, statusFilter]);

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

  function copyToClipboard(code) {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="bg-card border border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Redemption Codes</h2>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-popover border border rounded-lg px-3 py-2 text-foreground text-sm"
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
          <thead className="text-foreground opacity-80">
            <tr className="text-left border-b border">
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
              <tr key={code.id} className="border-b border/50 hover:bg-popover/50">
                <td className="p-3">
                  <code className="font-mono text-foreground">{code.code}</code>
                </td>
                <td className="p-3 text-foreground">
                  ${Number(code.amount).toFixed(2)}
                </td>
                <td className="p-3">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      code.status === "active"
                        ? "bg-green-500/20 text-green-400"
                        : "bg-gray-500/20 text-foreground opacity-60"
                    }`}
                  >
                    {code.status}
                  </span>
                </td>
                <td className="p-3 text-foreground opacity-60">
                  {new Date(code.created_at).toLocaleString()}
                </td>
                <td className="p-3 text-foreground opacity-60">
                  {code.used_at ? new Date(code.used_at).toLocaleString() : "-"}
                </td>
                <td className="p-3">
                  {code.status === "active" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(code.code)}
                      className="text-foreground opacity-60 hover:text-foreground"
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
                <td colSpan={6} className="p-4 text-center text-foreground opacity-60">
                  No redemption codes found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
