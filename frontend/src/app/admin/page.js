"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useMemo, useState, useRef } from "react";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRole } from "@/hooks/useRole";
import ResolveMarketDialog from "@/components/admin/ResolveMarketDialog";
import RedemptionCodeGeneratorForm from "@/components/admin/RedemptionCodeGeneratorForm";
import RedemptionCodesList from "@/components/admin/RedemptionCodesList";
import TagsManager from "@/components/admin/TagsManager";
import UserRoleManager from "@/components/admin/UserRoleManager";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Copy, Check } from "lucide-react";
import { ColorPicker } from "@/components/ui/color-picker";

const backendBase =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export default function AdminMarketsPage() {
  const { user, loading: authLoading } = useAuth();
  const { role: userRole, isAdmin, isSuperAdmin, loading: roleLoading } = useRole();
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [statusFilter, setStatusFilter] = useState("draft");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingTeamA, setUploadingTeamA] = useState(false);
  const [uploadingTeamB, setUploadingTeamB] = useState(false);
  const fileInputRef = useRef(null);
  const teamAFileInputRef = useRef(null);
  const teamBFileInputRef = useRef(null);
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
    // Match-specific fields
    team_a_name: "",
    team_a_image_url: "",
    team_a_color: "#22c55e",
    team_b_name: "",
    team_b_image_url: "",
    team_b_color: "#ef4444",
    allows_draw: false,
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [categories, setCategories] = useState([]);

  const validToSubmit = useMemo(() => {
    // Match events have different validation
    if (form.group_rule === "match") {
      const bNum = Number(form.amm_b);
      const feeNum = Number(form.amm_fee_bps);
      const ammValid =
        Number.isFinite(bNum) &&
        bNum > 0 &&
        Number.isFinite(feeNum) &&
        feeNum >= 0 &&
        feeNum < 10000 &&
        (form.amm_collateral_token || "").trim();
      return form.title && form.description && form.trading_deadline && form.team_a_name && form.team_b_name && ammValid;
    }
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
    if (isAdmin) {
      fetchEvents();
      fetchCategories();
    }
  }, [isAdmin]);

  async function fetchCategories() {
    try {
      const res = await fetch(`${backendBase}/api/tags/`);
      const data = await res.json();
      setCategories((data.items || []).map(t => ({ value: t.name, label: t.name })));
    } catch (_e) {}
  }

  async function fetchEvents() {
    setError("");
    try {
      const res = await fetch(`${backendBase}/api/events/?all=1&summary=1`, {
        cache: "no-store",
        headers: user ? { "X-User-Id": user.id } : {},
      });
      const data = await res.json();
      setEvents(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError("Failed to load events");
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
      } else if (value === "match") {
        // Match events don't need markets array - they auto-generate
        setForm((prev) => ({
          ...prev,
          group_rule: value,
          markets: [],
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
      if (!res.ok) throw new Error(data.error || "Upload failed");
      handleChange("cover_url", data.url);
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleTeamAImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingTeamA(true);
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
      if (!res.ok) throw new Error(data.error || "Upload failed");
      handleChange("team_a_image_url", data.url);
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploadingTeamA(false);
    }
  }

  async function handleTeamBImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingTeamB(true);
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
      if (!res.ok) throw new Error(data.error || "Upload failed");
      handleChange("team_b_image_url", data.url);
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploadingTeamB(false);
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
      };

      // Add match-specific fields if this is a match event
      if (form.group_rule === "match") {
        payload.team_a_name = form.team_a_name;
        payload.team_a_image_url = form.team_a_image_url;
        payload.team_a_color = form.team_a_color;
        payload.team_b_name = form.team_b_name;
        payload.team_b_image_url = form.team_b_image_url;
        payload.team_b_color = form.team_b_color;
        payload.allows_draw = form.allows_draw;
      } else {
        // Non-match events use markets array
        payload.markets = (form.markets || []).map((m, idx) => ({
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
        }));
      }

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
        setError(data.error || "Creation failed");
      } else {
        setSuccess("Created successfully, status set to draft");
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
          team_a_name: "",
          team_a_image_url: "",
          team_a_color: "#22c55e",
          team_b_name: "",
          team_b_image_url: "",
          team_b_color: "#ef4444",
          allows_draw: false,
        });
        fetchEvents();
      }
    } catch (err) {
      setError("Creation failed");
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
        setError(data.error || "Publish failed");
      } else {
        setSuccess("Published successfully");
        fetchEvents();
      }
    } catch (err) {
      setError("Publish failed");
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
        setError(data.error || "Status update failed");
      } else {
        setSuccess("Status updated");
        fetchEvents();
      }
    } catch (err) {
      setError("Status update failed");
    }
  }

  async function handleResolveClick(eventId) {
    setError("");
    setSuccess("");
    try {
      // Fetch full event data with markets and options
      const res = await fetch(`${backendBase}/api/events/${eventId}/?include_translations=0`, {
        headers: user ? { "X-User-Id": user.id } : {},
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load event data");
        return;
      }
      setSelectedEvent(data);
      setResolveDialogOpen(true);
    } catch (err) {
      setError("Failed to load event data");
    }
  }

  function handleResolveSuccess() {
    setResolveDialogOpen(false);
    setSelectedEvent(null);
    fetchEvents();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Suspense fallback={<div className="h-20 bg-background" />}>
        <Navigation />
      </Suspense>
      <main className="max-w-5xl mx-auto px-6 py-8">
        <header className="flex items-center justify-between mb-6">
          <div>
            <div className="text-sm opacity-70">Admin</div>
            <h1 className="text-3xl font-semibold">Market Management</h1>
          </div>
          <span className="text-sm opacity-60">
            Backend URL: {backendBase}
          </span>
        </header>

        {isAdmin ? (
          <Tabs defaultValue="events" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="create">Create Event</TabsTrigger>
              <TabsTrigger value="events">Event List</TabsTrigger>
              {isSuperAdmin && (
                <>
                  <TabsTrigger value="tags">Tags</TabsTrigger>
                  <TabsTrigger value="generate">Generate Code</TabsTrigger>
                  <TabsTrigger value="codes">Redemption Codes</TabsTrigger>
                  <TabsTrigger value="users">User Management</TabsTrigger>
                </>
              )}
            </TabsList>

            <TabsContent value="create">
        <section className="bg-card border border rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Create New Event (draft)</h2>
          <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={handleCreate}>
            <div className="md:col-span-2">
              <label className="text-sm text-foreground opacity-80">Title *</label>
              <input
                className="w-full mt-1 bg-popover border border rounded-lg p-3 text-foreground"
                value={form.title}
                onChange={(e) => handleChange("title", e.target.value)}
                placeholder="Market title"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm text-foreground opacity-80">Description *</label>
              <textarea
                className="w-full mt-1 bg-popover border border rounded-lg p-3 text-foreground h-28"
                value={form.description}
                onChange={(e) => handleChange("description", e.target.value)}
                placeholder="Brief description"
                required
              />
            </div>
            <div>
              <label className="text-sm text-foreground opacity-80">Category</label>
              <select
                className="w-full mt-1 bg-popover border border rounded-lg p-3 text-foreground"
                value={form.category}
                onChange={(e) => handleChange("category", e.target.value)}
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-foreground opacity-80">Cover Image</label>
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
                  {uploading ? "Uploading..." : "Select Image"}
                </Button>
                {form.cover_url && (
                  <div className="flex items-center gap-2">
                    <img
                      src={form.cover_url}
                      alt="Cover preview"
                      className="h-10 w-10 object-cover rounded"
                    />
                    <span className="text-xs text-foreground opacity-60 truncate max-w-[150px]">
                      {form.cover_url.split("/").pop()}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleChange("cover_url", "")}
                      className="text-red-400 text-xs hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm text-foreground opacity-80">Slug</label>
              <input
                className="w-full mt-1 bg-popover border border rounded-lg p-3 text-foreground"
                value={form.slug}
                onChange={(e) => handleChange("slug", e.target.value)}
                placeholder="Unique identifier, optional"
              />
            </div>
            <div>
              <label className="text-sm text-foreground opacity-80">Chain/Network</label>
              <input
                className="w-full mt-1 bg-popover border border rounded-lg p-3 text-foreground"
                value={form.chain}
                onChange={(e) => handleChange("chain", e.target.value)}
                placeholder="e.g. base, polygon"
              />
            </div>
            <div>
              <label className="text-sm text-foreground opacity-80">Group Rule</label>
              <select
                className="w-full mt-1 bg-popover border border rounded-lg p-3 text-foreground"
                value={form.group_rule}
                onChange={(e) => handleChange("group_rule", e.target.value)}
              >
                <option value="standalone">Standalone (single sub-market, Yes/No)</option>
                <option value="exclusive">Exclusive (multiple sub-markets, pick one answer)</option>
                <option value="independent">Independent (multiple sub-markets, multi-select)</option>
                <option value="match">Match (sports/competition with two teams)</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-foreground opacity-80">Trading Deadline *</label>
              <input
                type="datetime-local"
                className="w-full mt-1 bg-popover border border rounded-lg p-3 text-foreground"
                value={form.trading_deadline}
                onChange={(e) => handleChange("trading_deadline", e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm text-foreground opacity-80">Resolution Deadline</label>
              <input
                type="datetime-local"
                className="w-full mt-1 bg-popover border border rounded-lg p-3 text-foreground"
                value={form.resolution_deadline}
                onChange={(e) => handleChange("resolution_deadline", e.target.value)}
              />
            </div>

            <div className="md:col-span-2 flex items-center gap-4 mt-2">
              <Button type="submit" disabled={!validToSubmit || loading}>
                {loading ? "Creating..." : "Create Draft Market"}
              </Button>
              {error && <span className="text-red-400">{error}</span>}
              {success && <span className="text-green-400">{success}</span>}
            </div>
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm text-foreground opacity-80">AMM Model</label>
                <input
                  className="w-full mt-1 bg-popover border border rounded-lg p-3 text-foreground"
                  value={form.amm_model}
                  onChange={(e) => handleChange("amm_model", e.target.value)}
                  placeholder="lmsr"
                />
              </div>
              <div>
                <label className="text-sm text-foreground opacity-80">AMM b (Liquidity Parameter) *</label>
                <input
                  type="number"
                  className="w-full mt-1 bg-popover border border rounded-lg p-3 text-foreground"
                  value={form.amm_b}
                  onChange={(e) => handleChange("amm_b", e.target.value)}
                  min="0"
                  step="0.0001"
                  required
                />
              </div>
              <div>
                <label className="text-sm text-foreground opacity-80">Trading Fee (bps) *</label>
                <input
                  type="number"
                  className="w-full mt-1 bg-popover border border rounded-lg p-3 text-foreground"
                  value={form.amm_fee_bps}
                  onChange={(e) => handleChange("amm_fee_bps", e.target.value)}
                  min="0"
                  max="9999"
                  required
                />
              </div>
              <div>
                <label className="text-sm text-foreground opacity-80">Collateral Token *</label>
                <input
                  className="w-full mt-1 bg-popover border border rounded-lg p-3 text-foreground"
                  value={form.amm_collateral_token}
                  onChange={(e) => handleChange("amm_collateral_token", e.target.value)}
                  placeholder="e.g. USDC or contract address"
                  required
                />
              </div>
            </div>
          </form>
          {form.group_rule === "standalone" ? (
            <div className="mt-6 text-sm text-foreground opacity-80">
              Standalone mode will automatically create a binary market (Yes / No), no need to add sub-markets.
            </div>
          ) : form.group_rule === "match" ? (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4">Match Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Team A */}
                <div className="bg-popover border border rounded-lg p-4">
                  <h4 className="font-medium mb-3">Team A</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-foreground opacity-60">Team Name *</label>
                      <input
                        className="w-full mt-1 bg-background border border rounded-lg p-2 text-foreground"
                        value={form.team_a_name}
                        onChange={(e) => handleChange("team_a_name", e.target.value)}
                        placeholder="e.g. Lakers"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-foreground opacity-60">Team Image</label>
                      <div className="mt-1 flex items-center gap-3">
                        <input
                          ref={teamAFileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleTeamAImageUpload}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => teamAFileInputRef.current?.click()}
                          disabled={uploadingTeamA}
                        >
                          {uploadingTeamA ? "Uploading..." : "Upload"}
                        </Button>
                        {form.team_a_image_url && (
                          <div className="flex items-center gap-2">
                            <img
                              src={form.team_a_image_url}
                              alt="Team A"
                              className="h-10 w-10 object-cover rounded-full border-2"
                              style={{ borderColor: form.team_a_color }}
                            />
                            <button
                              type="button"
                              onClick={() => handleChange("team_a_image_url", "")}
                              className="text-red-400 text-xs hover:text-red-300"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <ColorPicker
                      label="Button Color"
                      value={form.team_a_color}
                      onChange={(color) => handleChange("team_a_color", color)}
                    />
                  </div>
                </div>

                {/* Team B */}
                <div className="bg-popover border border rounded-lg p-4">
                  <h4 className="font-medium mb-3">Team B</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-foreground opacity-60">Team Name *</label>
                      <input
                        className="w-full mt-1 bg-background border border rounded-lg p-2 text-foreground"
                        value={form.team_b_name}
                        onChange={(e) => handleChange("team_b_name", e.target.value)}
                        placeholder="e.g. Celtics"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs text-foreground opacity-60">Team Image</label>
                      <div className="mt-1 flex items-center gap-3">
                        <input
                          ref={teamBFileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleTeamBImageUpload}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => teamBFileInputRef.current?.click()}
                          disabled={uploadingTeamB}
                        >
                          {uploadingTeamB ? "Uploading..." : "Upload"}
                        </Button>
                        {form.team_b_image_url && (
                          <div className="flex items-center gap-2">
                            <img
                              src={form.team_b_image_url}
                              alt="Team B"
                              className="h-10 w-10 object-cover rounded-full border-2"
                              style={{ borderColor: form.team_b_color }}
                            />
                            <button
                              type="button"
                              onClick={() => handleChange("team_b_image_url", "")}
                              className="text-red-400 text-xs hover:text-red-300"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <ColorPicker
                      label="Button Color"
                      value={form.team_b_color}
                      onChange={(color) => handleChange("team_b_color", color)}
                    />
                  </div>
                </div>
              </div>

              {/* Allows Draw */}
              <div className="mt-4 flex items-center gap-3">
                <input
                  type="checkbox"
                  id="allows_draw"
                  checked={form.allows_draw}
                  onChange={(e) => handleChange("allows_draw", e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="allows_draw" className="text-sm text-foreground">
                  Allow Draw (creates 3 outcomes: Team A wins, Draw, Team B wins)
                </label>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold">Sub-markets (at least 2)</h3>
                <Button variant="outline" size="sm" onClick={addMarket}>
                  Add Sub-market
                </Button>
              </div>
              <div className="space-y-3">
                {(form.markets || []).map((opt, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center bg-popover border border rounded-lg p-3"
                  >
                    <div className="md:col-span-9">
                      <label className="text-xs text-foreground opacity-60">Sub-market Title *</label>
                      <input
                        className="w-full mt-1 bg-popover border border rounded-lg p-2 text-foreground"
                        value={opt.title}
                        onChange={(e) => handleMarketChange(idx, "title", e.target.value)}
                        placeholder={`Sub-market ${idx + 1}`}
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
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
            </TabsContent>

            <TabsContent value="events">
        <section className="bg-card border border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Event List</h2>
            <div className="flex items-center gap-4">
              <select
                className="bg-popover border border rounded-lg px-3 py-2 text-foreground text-sm"
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
                Refresh
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-foreground opacity-80">
                <tr className="text-left">
                  <th className="p-2">Title</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Sub-markets</th>
                  <th className="p-2">Trading Deadline</th>
                  <th className="p-2">Slug</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedEvents.map((m) => (
                  <tr key={m.id} className="border-t border">
                    <td className="p-2">{m.title}</td>
                    <td className="p-2">
                      <span className="px-2 py-1 bg-popover rounded">
                        {m.status}
                      </span>
                    </td>
                    <td className="p-2 text-foreground opacity-80">
                      {m.markets_count ?? (m.markets || []).length}
                    </td>
                    <td className="p-2 text-foreground opacity-80">
                      {m.trading_deadline
                        ? new Date(m.trading_deadline).toLocaleString()
                        : "-"}
                    </td>
                    <td className="p-2 text-foreground opacity-80">{m.slug || "-"}</td>
                    <td className="p-2">
                      <div className="flex gap-2 items-center">
                        <select
                          value={m.status}
                          onChange={(e) => handleStatusChange(m.id, e.target.value)}
                          className="bg-popover border border rounded-lg px-3 py-1.5 text-foreground text-sm"
                        >
                          <option value="draft">Draft</option>
                          <option value="pending">Pending</option>
                          <option value="active">Active</option>
                          <option value="closed">Closed</option>
                          <option value="resolved">Resolved</option>
                          <option value="canceled">Canceled</option>
                        </select>
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
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.location.href = `/admin/edit/${m.id}`}
                        >
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!pagedEvents.length && (
                  <tr>
                    <td className="p-4 text-foreground opacity-60" colSpan={6}>
                      {statusFilter === "all" ? "No events" : `No ${statusFilter} events`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border">
              <div className="text-sm text-foreground opacity-60">
                Total {filteredEvents.length} items, Page {currentPage}/{totalPages}
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
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
                      Next
                    </PaginationNext>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </section>
            </TabsContent>

            <TabsContent value="tags">
              <TagsManager user={user} />
            </TabsContent>

            <TabsContent value="generate">
              <RedemptionCodeGeneratorForm user={user} />
            </TabsContent>

            <TabsContent value="codes">
              <RedemptionCodesList user={user} />
            </TabsContent>

            {isSuperAdmin && (
              <TabsContent value="users">
                <UserRoleManager user={user} />
              </TabsContent>
            )}
          </Tabs>
        ) : (
          <section className="bg-card border border rounded-xl p-6">
            <div className="text-foreground text-lg">
              {(authLoading || roleLoading) ? "Loading..." : "Admin access only"}
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
