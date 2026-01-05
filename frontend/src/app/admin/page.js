"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import ResolveMarketDialog from "@/components/admin/ResolveMarketDialog";
import RedemptionCodeGenerator from "@/components/admin/RedemptionCodeGenerator";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { ADMIN_CATEGORIES } from "@/lib/constants/categories";

const backendBase =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export default function AdminMarketsPage() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [statusFilter, setStatusFilter] = useState("draft");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  const [userRole, setUserRole] = useState(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const defaultStandaloneMarkets = [{ title: "Primary", sort_weight: 0 }];
  const defaultMultiMarkets = [
    { title: "Yes", sort_weight: 0 },
    { title: "No", sort_weight: 1 },
  ];
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    trading_deadline: "",
    resolution_deadline: "",
    slug: "",
    chain: "",
    cover_url: "",
    group_rule: "standalone",
    markets: defaultStandaloneMarkets,
    amm_model: "lmsr",
    amm_b: "10000",
    amm_fee_bps: "0",
    amm_collateral_token: "USDC",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const validToSubmit = useMemo(() => {
    const requiredMarkets = form.group_rule === "standalone" ? 1 : 2;
    const marketsValid =
      Array.isArray(form.markets) &&
      form.markets.filter((o) => o.title?.trim()).length >= requiredMarkets;
    const bNum = Number(form.amm_b);
    const feeNum = Number(form.amm_fee_bps);
    const ammValid =
      Number.isFinite(bNum) &&
      bNum > 0 &&
      Number.isFinite(feeNum) &&
      feeNum >= 0 &&
      feeNum < 10000 &&
      (form.amm_collateral_token || "").trim();
    return form.title && form.description && form.trading_deadline && marketsValid && ammValid;
  }, [form]);

  const filteredEvents = useMemo(() => {
    if (statusFilter === "all") return events;
    return events.filter((e) => e.status === statusFilter);
  }, [events, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const pagedEvents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEvents.slice(start, start + pageSize);
  }, [filteredEvents, currentPage, pageSize]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  const pageList = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = [1];
    if (currentPage > 3) pages.push("ellipsis-left");
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("ellipsis-right");
    pages.push(totalPages);
    return pages;
  }, [totalPages, currentPage]);

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
      fetchEvents();
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

  async function fetchEvents() {
    setError("");
    try {
      const res = await fetch(`${backendBase}/api/events/?all=1`, {
        cache: "no-store",
        headers: user ? { "X-User-Id": user.id } : {},
      });
      const data = await res.json();
      setEvents(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError("加载事件列表失败");
    }
  }

  function handleChange(field, value) {
    if (field === "group_rule") {
      if (value === "standalone") {
        setForm((prev) => ({
          ...prev,
          group_rule: value,
          markets: defaultStandaloneMarkets,
        }));
      } else {
        setForm((prev) => {
          const nextMarkets =
            (prev.markets || []).length >= 2 ? prev.markets : defaultMultiMarkets;
          return { ...prev, group_rule: value, markets: nextMarkets };
        });
      }
      return;
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleMarketChange(idx, field, value) {
    setForm((prev) => {
      const next = [...(prev.markets || [])];
      next[idx] = { ...next[idx], [field]: value };
      return { ...prev, markets: next };
    });
  }

  function addMarket() {
    setForm((prev) => ({
      ...prev,
      markets: [
        ...(prev.markets || []),
        { title: "", sort_weight: (prev.markets?.length || 0) },
      ],
    }));
  }

  function removeMarket(idx) {
    setForm((prev) => {
      const next = [...(prev.markets || [])];
      next.splice(idx, 1);
      return { ...prev, markets: next };
    });
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${backendBase}/api/upload/image/`, {
        method: "POST",
        headers: user ? { "X-User-Id": user.id } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "上传失败");
      handleChange("cover_url", data.url);
    } catch (err) {
      setError(err.message || "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!validToSubmit) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const ammPayload = {
        model: form.amm_model || "lmsr",
        b: Number(form.amm_b),
        fee_bps: Number(form.amm_fee_bps),
        collateral_token: form.amm_collateral_token,
      };
      const payload = {
        title: form.title,
        description: form.description,
        category: form.category,
        trading_deadline: form.trading_deadline,
        resolution_deadline: form.resolution_deadline,
        slug: form.slug,
        chain: form.chain,
        cover_url: form.cover_url,
        group_rule: form.group_rule || "standalone",
        amm: ammPayload,
        markets: (form.markets || []).map((m, idx) => ({
          title: m.title,
          bucket_label: m.bucket_label,
          sort_weight: m.sort_weight ?? idx,
          trading_deadline: form.trading_deadline,
          resolution_deadline: form.resolution_deadline,
          options: [
            { title: "NO", side: "no", option_index: 0 },
            { title: "YES", side: "yes", option_index: 1 },
          ],
          amm: ammPayload,
        })),
      };
      const res = await fetch(`${backendBase}/api/events/create/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(user ? { "X-User-Id": user.id } : {}),
        },
        body: JSON.stringify(payload),
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
          group_rule: "standalone",
          markets: defaultStandaloneMarkets,
          amm_model: "lmsr",
          amm_b: "10000",
          amm_fee_bps: "0",
          amm_collateral_token: "USDC",
        });
        fetchEvents();
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
      const res = await fetch(`${backendBase}/api/events/${id}/publish/`, {
        method: "POST",
        headers: user ? { "X-User-Id": user.id } : {},
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "发布失败");
      } else {
        setSuccess("发布成功");
        fetchEvents();
      }
    } catch (err) {
      setError("发布失败");
    }
  }

  async function handleStatusChange(id, nextStatus) {
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${backendBase}/api/events/${id}/status/`, {
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
        fetchEvents();
      }
    } catch (err) {
      setError("更新状态失败");
    }
  }

  async function handleResolveClick(eventId) {
    setError("");
    setSuccess("");
    try {
      // Fetch full event data with markets and options
      const res = await fetch(`${backendBase}/api/events/${eventId}/`, {
        headers: user ? { "X-User-Id": user.id } : {},
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "加载事件数据失败");
        return;
      }
      setSelectedEvent(data);
      setResolveDialogOpen(true);
    } catch (err) {
      setError("加载事件数据失败");
    }
  }

  function handleResolveSuccess() {
    setResolveDialogOpen(false);
    setSelectedEvent(null);
    fetchEvents();
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
          <h2 className="text-xl font-semibold mb-4">创建新事件（draft）</h2>
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
              <select
                className="w-full mt-1 bg-[#0f172a] border border-[#334155] rounded-lg p-3 text-white"
                value={form.category}
                onChange={(e) => handleChange("category", e.target.value)}
              >
                <option value="">请选择类别</option>
                {ADMIN_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-300">封面图片</label>
              <div className="mt-1 flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? "上传中..." : "选择图片"}
                </Button>
                {form.cover_url && (
                  <div className="flex items-center gap-2">
                    <img
                      src={form.cover_url}
                      alt="封面预览"
                      className="h-10 w-10 object-cover rounded"
                    />
                    <span className="text-xs text-gray-400 truncate max-w-[150px]">
                      {form.cover_url.split("/").pop()}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleChange("cover_url", "")}
                      className="text-red-400 text-xs hover:text-red-300"
                    >
                      删除
                    </button>
                  </div>
                )}
              </div>
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
              <label className="text-sm text-gray-300">Group Rule</label>
              <select
                className="w-full mt-1 bg-[#0f172a] border border-[#334155] rounded-lg p-3 text-white"
                value={form.group_rule}
                onChange={(e) => handleChange("group_rule", e.target.value)}
              >
                <option value="standalone">Standalone（单个子市场，Yes/No）</option>
                <option value="exclusive">Exclusive（多个子市场，仅选一个答案）</option>
                <option value="independent">Independent（多个子市场，可多选）</option>
              </select>
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
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm text-gray-300">AMM 模型</label>
                <input
                  className="w-full mt-1 bg-[#0f172a] border border-[#334155] rounded-lg p-3 text-white"
                  value={form.amm_model}
                  onChange={(e) => handleChange("amm_model", e.target.value)}
                  placeholder="lmsr"
                />
              </div>
              <div>
                <label className="text-sm text-gray-300">AMM b（流动性参数） *</label>
                <input
                  type="number"
                  className="w-full mt-1 bg-[#0f172a] border border-[#334155] rounded-lg p-3 text-white"
                  value={form.amm_b}
                  onChange={(e) => handleChange("amm_b", e.target.value)}
                  min="0"
                  step="0.0001"
                  required
                />
              </div>
              <div>
                <label className="text-sm text-gray-300">交易费（bps） *</label>
                <input
                  type="number"
                  className="w-full mt-1 bg-[#0f172a] border border-[#334155] rounded-lg p-3 text-white"
                  value={form.amm_fee_bps}
                  onChange={(e) => handleChange("amm_fee_bps", e.target.value)}
                  min="0"
                  max="9999"
                  required
                />
              </div>
              <div>
                <label className="text-sm text-gray-300">抵押资产标识 *</label>
                <input
                  className="w-full mt-1 bg-[#0f172a] border border-[#334155] rounded-lg p-3 text-white"
                  value={form.amm_collateral_token}
                  onChange={(e) => handleChange("amm_collateral_token", e.target.value)}
                  placeholder="如 USDC 或合约地址"
                  required
                />
              </div>
            </div>
          </form>
          {form.group_rule === "standalone" ? (
            <div className="mt-6 text-sm text-gray-300">
              Standalone 模式下将自动创建一个二元市场（Yes / No），无需添加子市场。
            </div>
          ) : (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold">子市场（至少 2 个）</h3>
                <Button variant="outline" size="sm" onClick={addMarket}>
                  添加子市场
                </Button>
              </div>
              <div className="space-y-3">
                {(form.markets || []).map((opt, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-[#0f172a] border border-[#334155] rounded-lg p-3"
                  >
                    <div className="md:col-span-9">
                      <label className="text-xs text-gray-400">子市场标题 *</label>
                      <input
                        className="w-full mt-1 bg-[#111827] border border-[#1f2937] rounded-lg p-2 text-white"
                        value={opt.title}
                        onChange={(e) => handleMarketChange(idx, "title", e.target.value)}
                        placeholder={`子市场 ${idx + 1}`}
                        required
                      />
                    </div>
                    <div className="md:col-span-3 flex justify-end">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={(form.markets || []).length <= 2}
                        onClick={() => removeMarket(idx)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="bg-[#1f2937] border border-[#334155] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">事件列表</h2>
            <div className="flex items-center gap-4">
              <select
                className="bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2 text-white text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
                <option value="resolved">Resolved</option>
                <option value="canceled">Canceled</option>
              </select>
              <Button variant="outline" onClick={fetchEvents}>
                刷新
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-gray-300">
                <tr className="text-left">
                  <th className="p-2">标题</th>
                  <th className="p-2">状态</th>
                  <th className="p-2">子市场</th>
                  <th className="p-2">交易截止</th>
                  <th className="p-2">Slug</th>
                  <th className="p-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {pagedEvents.map((m) => (
                  <tr key={m.id} className="border-t border-[#334155]">
                    <td className="p-2">{m.title}</td>
                    <td className="p-2">
                      <span className="px-2 py-1 bg-[#0f172a] rounded">
                        {m.status}
                      </span>
                    </td>
                    <td className="p-2 text-gray-300">
                      {(m.markets || []).length}
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
                        {(m.status === "active" || m.status === "closed") && (
                          <Button
                            size="sm"
                            variant="default"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => handleResolveClick(m.id)}
                          >
                            Resolve
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!pagedEvents.length && (
                  <tr>
                    <td className="p-4 text-gray-400" colSpan={6}>
                      {statusFilter === "all" ? "暂无事件" : `暂无 ${statusFilter} 状态的事件`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#334155]">
              <div className="text-sm text-gray-400">
                共 {filteredEvents.length} 条，第 {currentPage}/{totalPages} 页
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      上一页
                    </PaginationPrevious>
                  </PaginationItem>
                  {pageList.map((p, idx) =>
                    typeof p === "number" ? (
                      <PaginationItem key={p}>
                        <PaginationLink
                          isActive={p === currentPage}
                          onClick={() => setCurrentPage(p)}
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={`${p}-${idx}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                      下一页
                    </PaginationNext>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </section>

        {/* Redemption Code Generator Section */}
        <section className="mt-8">
          <RedemptionCodeGenerator user={user} />
        </section>
          </>
        ) : (
          <section className="bg-[#1f2937] border border-[#334155] rounded-xl p-6">
            <div className="text-white text-lg">
              {authLoading ? "加载中..." : "仅管理员可访问此页面"}
            </div>
          </section>
        )}

        <ResolveMarketDialog
          open={resolveDialogOpen}
          onClose={() => {
            setResolveDialogOpen(false);
            setSelectedEvent(null);
          }}
          event={selectedEvent}
          user={user}
          onSuccess={handleResolveSuccess}
        />
      </main>
    </div>
  );
}

