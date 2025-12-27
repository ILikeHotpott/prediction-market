"use client";

import { useEffect, useMemo, useState } from "react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";

const backendBase =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export default function AdminMarketsPage() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [markets, setMarkets] = useState([]);
  const [userRole, setUserRole] = useState(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    trading_deadline: "",
    resolution_deadline: "",
    slug: "",
    chain: "",
    cover_url: "",
    options: [
      { title: "Yes", option_index: 0 },
      { title: "No", option_index: 1 },
    ],
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const validToSubmit = useMemo(
    () =>
      form.title &&
      form.description &&
      form.trading_deadline &&
      Array.isArray(form.options) &&
      form.options.filter((o) => o.title?.trim()).length >= 2,
    [form],
  );

  useEffect(() => {
    if (!user) return;
    const metaRole = user.user_metadata?.role;
    if (metaRole) {
      setUserRole(metaRole);
    }
    fetchUserRole();
  }, [user]);

  useEffect(() => {
    if (userRole === "admin") {
      fetchMarkets();
    }
  }, [userRole]);

  async function fetchUserRole() {
    if (!user) return;
    try {
      const res = await fetch(`${backendBase}/api/users/me/`, {
        headers: {
          "X-User-Id": user.id,
        },
      });
      const data = await res.json();
      if (res.ok) {
        setUserRole(data.role);
      } else {
        setUserRole(null);
      }
    } catch (_e) {
      // keep any previously set meta role
    }
  }

  async function fetchMarkets() {
    setError("");
    try {
      const res = await fetch(`${backendBase}/api/markets/?all=1`, {
        cache: "no-store",
        headers: user ? { "X-User-Id": user.id } : {},
      });
      const data = await res.json();
      setMarkets(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError("加载市场列表失败");
    }
  }

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleOptionChange(idx, field, value) {
    setForm((prev) => {
      const next = [...(prev.options || [])];
      next[idx] = { ...next[idx], [field]: value };
      return { ...prev, options: next };
    });
  }

  function addOption() {
    setForm((prev) => ({
      ...prev,
      options: [
        ...(prev.options || []),
        { title: "", option_index: (prev.options?.length || 0) },
      ],
    }));
  }

  function removeOption(idx) {
    setForm((prev) => {
      const next = [...(prev.options || [])];
      next.splice(idx, 1);
      return { ...prev, options: next };
    });
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!validToSubmit) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${backendBase}/api/markets/create/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(user ? { "X-User-Id": user.id } : {}),
        },
        body: JSON.stringify({
          ...form,
          options: (form.options || []).map((o) => ({
            title: o.title,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "创建失败");
      } else {
        setSuccess("创建成功，状态已设为 draft");
        setForm({
          title: "",
          description: "",
          category: "",
          trading_deadline: "",
          resolution_deadline: "",
          slug: "",
          chain: "",
          cover_url: "",
          options: [
            { title: "Yes", option_index: 0 },
            { title: "No", option_index: 1 },
          ],
        });
        fetchMarkets();
      }
    } catch (err) {
      setError("创建失败");
    } finally {
      setLoading(false);
    }
  }

  async function handlePublish(id) {
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${backendBase}/api/markets/${id}/publish/`, {
        method: "POST",
        headers: user ? { "X-User-Id": user.id } : {},
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "发布失败");
      } else {
        setSuccess("发布成功");
        fetchMarkets();
      }
    } catch (err) {
      setError("发布失败");
    }
  }

  async function handleStatusChange(id, nextStatus) {
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${backendBase}/api/markets/${id}/status/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(user ? { "X-User-Id": user.id } : {}),
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "更新状态失败");
      } else {
        setSuccess("状态已更新");
        fetchMarkets();
      }
    } catch (err) {
      setError("更新状态失败");
    }
  }

  return (
    <div className="min-h-screen bg-[#202b39] text-white">
      <Navigation />
      <main className="max-w-5xl mx-auto px-6 py-8">
        <header className="flex items-center justify-between mb-6">
          <div>
            <div className="text-sm text-gray-300">Admin</div>
            <h1 className="text-3xl font-semibold">市场管理</h1>
          </div>
          <span className="text-sm text-gray-400">
            后端地址：{backendBase}
          </span>
        </header>

        {userRole === "admin" ? (
          <>
        <section className="bg-[#1f2937] border border-[#334155] rounded-xl p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">创建新市场（draft）</h2>
          <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={handleCreate}>
            <div className="md:col-span-2">
              <label className="text-sm text-gray-300">标题 *</label>
              <input
                className="w-full mt-1 bg-[#0f172a] border border-[#334155] rounded-lg p-3 text-white"
                value={form.title}
                onChange={(e) => handleChange("title", e.target.value)}
                placeholder="市场标题"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-gray-300">描述 *</label>
              <textarea
                className="w-full mt-1 bg-[#0f172a] border border-[#334155] rounded-lg p-3 text-white h-28"
                value={form.description}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="简要描述"
                required
              />
            </div>
            <div>
              <label className="text-sm text-gray-300">类别</label>
              <input
                className="w-full mt-1 bg-[#0f172a] border border-[#334155] rounded-lg p-3 text-white"
                value={form.category}
                onChange={(e) => handleChange("category", e.target.value)}
                placeholder="如: sports"
              />
            </div>
            <div>
              <label className="text-sm text-gray-300">封面 URL</label>
              <input
                className="w-full mt-1 bg-[#0f172a] border border-[#334155] rounded-lg p-3 text-white"
                value={form.cover_url}
                onChange={(e) => handleChange("cover_url", e.target.value)}
                placeholder="https://example.com/cover.jpg 或 emoji"
              />
            </div>
            <div>
              <label className="text-sm text-gray-300">Slug</label>
              <input
                className="w-full mt-1 bg-[#0f172a] border border-[#334155] rounded-lg p-3 text-white"
                value={form.slug}
                onChange={(e) => handleChange("slug", e.target.value)}
                placeholder="唯一标识，可选"
              />
            </div>
            <div>
              <label className="text-sm text-gray-300">链/Network</label>
              <input
                className="w-full mt-1 bg-[#0f172a] border border-[#334155] rounded-lg p-3 text-white"
                value={form.chain}
                onChange={(e) => handleChange("chain", e.target.value)}
                placeholder="例如: base, polygon"
              />
            </div>
            <div>
              <label className="text-sm text-gray-300">交易截止时间 *</label>
              <input
                type="datetime-local"
                className="w-full mt-1 bg-[#0f172a] border border-[#334155] rounded-lg p-3 text-white"
                value={form.trading_deadline}
                onChange={(e) => handleChange("trading_deadline", e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm text-gray-300">结算截止时间</label>
              <input
                type="datetime-local"
                className="w-full mt-1 bg-[#0f172a] border border-[#334155] rounded-lg p-3 text-white"
                value={form.resolution_deadline}
                onChange={(e) => handleChange("resolution_deadline", e.target.value)}
              />
            </div>

            <div className="md:col-span-2 flex items-center gap-4 mt-2">
              <Button type="submit" disabled={!validToSubmit || loading}>
                {loading ? "创建中..." : "创建草稿市场"}
              </Button>
              {error && <span className="text-red-400">{error}</span>}
              {success && <span className="text-green-400">{success}</span>}
            </div>
          </form>
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">选项（至少 2 个）</h3>
              <Button variant="outline" size="sm" onClick={addOption}>
                添加选项
              </Button>
            </div>
            <div className="space-y-3">
              {(form.options || []).map((opt, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-[#0f172a] border border-[#334155] rounded-lg p-3"
                >
                  <div className="md:col-span-9">
                    <label className="text-xs text-gray-400">标题 *</label>
                    <input
                      className="w-full mt-1 bg-[#111827] border border-[#1f2937] rounded-lg p-2 text-white"
                      value={opt.title}
                      onChange={(e) => handleOptionChange(idx, "title", e.target.value)}
                      placeholder={`Option ${idx + 1}`}
                      required
                    />
                  </div>
                  <div className="md:col-span-3 flex justify-end">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={(form.options || []).length <= 2}
                      onClick={() => removeOption(idx)}
                    >
                      删除
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#1f2937] border border-[#334155] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">市场列表</h2>
            <Button variant="outline" onClick={fetchMarkets}>
              刷新
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-gray-300">
                <tr className="text-left">
                  <th className="p-2">标题</th>
                  <th className="p-2">状态</th>
                  <th className="p-2">交易截止</th>
                  <th className="p-2">Slug</th>
                  <th className="p-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {markets.map((m) => (
                  <tr key={m.id} className="border-t border-[#334155]">
                    <td className="p-2">{m.title}</td>
                    <td className="p-2">
                      <span className="px-2 py-1 bg-[#0f172a] rounded">
                        {m.status}
                      </span>
                    </td>
                    <td className="p-2 text-gray-300">
                      {m.trading_deadline
                        ? new Date(m.trading_deadline).toLocaleString()
                        : "-"}
                    </td>
                    <td className="p-2 text-gray-300">{m.slug || "-"}</td>
                    <td className="p-2">
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusChange(m.id, "draft")}
                        >
                          Draft
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusChange(m.id, "pending")}
                        >
                          Pending
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleStatusChange(m.id, "active")}
                        >
                          Active
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusChange(m.id, "closed")}
                        >
                          Closed
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusChange(m.id, "resolved")}
                        >
                          Resolved
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleStatusChange(m.id, "canceled")}
                        >
                          Canceled
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!markets.length && (
                  <tr>
                    <td className="p-4 text-gray-400" colSpan={5}>
                      暂无市场
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
          </>
        ) : (
          <section className="bg-[#1f2937] border border-[#334155] rounded-xl p-6">
            <div className="text-white text-lg">
              {authLoading ? "加载中..." : "仅管理员可访问此页面"}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

