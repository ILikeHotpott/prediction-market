"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import Navigation from "@/components/Navigation"
import { useAuth } from "@/components/auth/AuthProvider"
import { usePortfolio } from "@/components/PortfolioProvider"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { useTranslations } from "next-intl"

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

// Simple module-level cache/inflight to survive React strict remounts and de-dupe calls
const portfolioCache = {
  userId: null,
  lastFetched: 0,
  portfolio: null,
  history: [],
}
const inflight = new Map()

const truncateText = (value, max = 60) => {
  if (!value) return ""
  return value.length > max ? `${value.slice(0, max)}...` : value
}

async function fetchOnce(key, factory, ttlMs = 3000) {
  const existing = inflight.get(key)
  if (existing && Date.now() - existing.started < ttlMs) {
    return existing.promise
  }
  const entry = {
    started: Date.now(),
    promise: factory().finally(() => {
      setTimeout(() => inflight.delete(key), ttlMs)
    }),
  }
  inflight.set(key, entry)
  return entry.promise
}

export default function PortfolioPage() {
  const { user, openAuthModal } = useAuth()
  const { refreshPortfolio } = usePortfolio()
  const t = useTranslations("portfolio")
  const [activeTab, setActiveTab] = useState("positions")
  const [loadingPortfolio, setLoadingPortfolio] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [error, setError] = useState("")
  const [portfolio, setPortfolio] = useState(null)
  const [history, setHistory] = useState([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPagesCache, setHistoryPagesCache] = useState({})
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [sellingId, setSellingId] = useState(null)
  const [actionMessage, setActionMessage] = useState("")
  const [pnlHistory, setPnlHistory] = useState({ data: [], current_pnl: 0 })
  const [pnlPeriod, setPnlPeriod] = useState("1m")
  const [pnlLoading, setPnlLoading] = useState(false)
  const fetchGuardRef = useRef({ inFlight: false, last: 0 })
  const didInitRef = useRef(false)
  const historyPageSize = 10
  const historyRowHeight = 44
  const historySkeletonRows = historyPageSize
  const historyTableMinHeight = historyPageSize * historyRowHeight

  useEffect(() => {
    if (!user) {
      setPortfolio(null)
      setHistory([])
      setActionMessage("")
      setHistoryLoaded(false)
      didInitRef.current = false
      return
    }
    if (didInitRef.current) return
    didInitRef.current = true
    // if cache is fresh, hydrate and skip network
    const now = Date.now()
    if (
      portfolioCache.userId === user.id &&
      now - portfolioCache.lastFetched < 8000 &&
      portfolioCache.portfolio
    ) {
      setPortfolio(portfolioCache.portfolio)
      // Still fetch PnL in background
      fetchPnlHistory(pnlPeriod)
      return
    }
    // Parallel load: portfolio (fast, no PnL) + PnL history
    fetchPortfolioFast()
    fetchPnlHistory(pnlPeriod)
  }, [user])

  useEffect(() => {
    if (user && didInitRef.current) {
      fetchPnlHistory(pnlPeriod)
    }
  }, [pnlPeriod])

  useEffect(() => {
    if (activeTab !== "history" || !user) return
    const cached = historyPagesCache[historyPage]
    if (cached) {
      setHistory(cached.items || [])
      setHistoryTotal(cached.total || 0)
      setHistoryLoaded(true)
      return
    }
    if (!historyLoading) {
      fetchHistory(historyPage)
    }
  }, [activeTab, user, historyPage, historyLoading, historyPagesCache])

  useEffect(() => {
    const count = Math.max(1, Math.ceil((historyTotal || 0) / historyPageSize) || 1)
    setHistoryPage((prev) => {
      const next = Math.min(Math.max(1, prev || 1), count)
      return next === prev ? prev : next
    })
  }, [historyTotal, historyPageSize])

  async function fetchPortfolioFast() {
    // Fast load without PnL calculation
    if (fetchGuardRef.current.inFlight) return
    fetchGuardRef.current.inFlight = true
    setLoadingPortfolio(true)
    setError("")
    setActionMessage("")
    try {
      const pRes = await fetchOnce(
        `portfolio-fast-${user.id}`,
        () =>
          fetch(`${backendBase}/api/users/me/portfolio/?include_pnl=false`, {
            headers: { "X-User-Id": user.id },
            cache: "no-store",
          }),
      )
      const pData = await pRes.json()
      if (!pRes.ok) throw new Error(pData.error || "Failed to load portfolio")
      setPortfolio(pData)
      setLoadingPortfolio(false)
      // Fetch full data with PnL in background
      fetchPortfolioWithPnl()
    } catch (e) {
      setError(e.message || "Failed to load")
      setLoadingPortfolio(false)
      fetchGuardRef.current.inFlight = false
      fetchGuardRef.current.last = Date.now()
    }
  }

  async function fetchPortfolioWithPnl() {
    try {
      const pRes = await fetch(`${backendBase}/api/users/me/portfolio/`, {
        headers: { "X-User-Id": user.id },
        cache: "no-store",
      })
      const pData = await pRes.json()
      if (pRes.ok) {
        setPortfolio(pData)
        portfolioCache.userId = user.id
        portfolioCache.portfolio = pData
        portfolioCache.lastFetched = Date.now()
      }
    } catch (e) {
      // Silent fail for background fetch
    } finally {
      fetchGuardRef.current.inFlight = false
      fetchGuardRef.current.last = Date.now()
    }
  }

  async function fetchPortfolio() {
    if (fetchGuardRef.current.inFlight) return
    const now = Date.now()
    if (now - fetchGuardRef.current.last < 8000) return
    fetchGuardRef.current.inFlight = true
    setLoadingPortfolio(true)
    setError("")
    setActionMessage("")
    try {
      const pRes = await fetchOnce(
        `portfolio-${user.id}`,
        () =>
          fetch(`${backendBase}/api/users/me/portfolio/`, {
            headers: { "X-User-Id": user.id },
            cache: "no-store",
          }),
      )
      const pData = await pRes.json()
      if (!pRes.ok) throw new Error(pData.error || "Failed to load portfolio")
      setPortfolio(pData)
      portfolioCache.userId = user.id
      portfolioCache.portfolio = pData
      portfolioCache.lastFetched = Date.now()
    } catch (e) {
      setError(e.message || "Failed to load")
    } finally {
      fetchGuardRef.current.inFlight = false
      fetchGuardRef.current.last = Date.now()
      setLoadingPortfolio(false)
    }
  }

  async function fetchHistory(page = 1) {
    if (!user) return
    const cached = historyPagesCache[page]
    if (cached) {
      setHistory(cached.items || [])
      setHistoryTotal(cached.total || 0)
      setHistoryLoaded(true)
      return
    }
    setHistoryLoading(true)
    setError("")
    try {
      const hRes = await fetchOnce(
        `history-${user.id}-p${page}`,
        () =>
          fetch(`${backendBase}/api/users/me/history/?page=${page}&page_size=${historyPageSize}`, {
            headers: { "X-User-Id": user.id },
            cache: "no-store",
          }),
        5000,
      )
      const hData = await hRes.json()
      if (!hRes.ok) throw new Error(hData.error || "Failed to load history")
      const items = hData.items || []
      const total = hData.total || 0
      const pageCount = Math.max(1, Math.ceil((total || 0) / historyPageSize) || 1)
      if (total && !items.length && page > pageCount) {
        setHistoryPage(pageCount)
        return
      }
      setHistory(items)
      setHistoryTotal(total)
      setHistoryLoaded(true)
      setHistoryPagesCache((prev) => ({
        ...prev,
        [page]: { items, total },
      }))
      portfolioCache.history = items
    }
    catch (e) {
      setError(e.message || "Failed to load")
    } finally {
      setHistoryLoading(false)
    }
  }

  async function fetchPnlHistory(period) {
    if (!user) return
    setPnlLoading(true)
    try {
      const res = await fetch(`${backendBase}/api/users/me/pnl-history/?period=${period}`, {
        headers: { "X-User-Id": user.id },
        cache: "no-store",
      })
      const data = await res.json()
      if (res.ok) {
        setPnlHistory(data)
      }
    } catch (e) {
      console.error("Failed to fetch PnL history:", e)
    } finally {
      setPnlLoading(false)
    }
  }

  const balance = portfolio?.balance
  const positionsRaw = portfolio?.positions || []
  const positions = useMemo(
    () => positionsRaw.filter((p) => Number(p.shares || 0) > 0),
    [positionsRaw],
  )
  const historyMarketTitleMap = useMemo(() => {
    const map = {}
    ;(positionsRaw || []).forEach((p) => {
      if (!p?.market_id) return
      // Prefer event title when available, otherwise keep the market title as a fallback.
      map[p.market_id] = {
        eventTitle: p.event_title || map[p.market_id]?.eventTitle,
        marketTitle: p.market_title || map[p.market_id]?.marketTitle,
      }
    })
    return map
  }, [positionsRaw])
  const hasPortfolio = !!portfolio
  const showPortfolioSkeleton = loadingPortfolio && !hasPortfolio
  const cashValue = useMemo(() => Number(balance?.available_amount || 0), [balance])
  const holdingsValue = useMemo(() => Number(portfolio?.portfolio_value || 0), [portfolio])
  const totalCashOut = useMemo(() => Number(portfolio?.total_cash_out_value || 0), [portfolio])
  const totalValue = useMemo(() => cashValue + holdingsValue, [cashValue, holdingsValue])
  const historyPageCount = useMemo(() => {
    const total = Number.isFinite(historyTotal) ? historyTotal : 0
    const pages = Math.ceil(total / historyPageSize)
    return Math.max(1, pages || 1)
  }, [historyTotal, historyPageSize])
  const pagedHistory = history || []
  // Always show skeleton whenever history is loading (including pagination fetches)
  const showHistorySkeleton = historyLoading

  const pageList = useMemo(() => {
    const total = historyPageCount
    const current = historyPage
    if (!total) return []
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1)
    const pages = [1]
    if (current > 3) pages.push("ellipsis-left")
    const start = Math.max(2, current - 1)
    const end = Math.min(total - 1, current + 1)
    for (let i = start; i <= end; i += 1) pages.push(i)
    if (current < total - 2) pages.push("ellipsis-right")
    pages.push(total)
    return pages
  }, [historyPageCount, historyPage])

  const goToPage = (page) => {
    if (!Number.isFinite(page)) return
    const clamped = Math.min(Math.max(1, page), historyPageCount)
    if (clamped === historyPage) return
    setHistoryPage(clamped)
  }

  async function handleSellPosition(pos) {
    if (!user) {
      openAuthModal("login")
      return
    }
    const shares = pos.shares
    if (!shares || Number(shares) <= 0) {
      setError("Insufficient shares to sell")
      return
    }
    setSellingId(pos.option_id)
    setError("")
    setActionMessage("")
    try {
      const res = await fetch(`${backendBase}/api/markets/${pos.market_id}/orders/sell/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": user.id,
        },
        body: JSON.stringify({
          option_id: pos.option_id,
          shares: shares,  // Send original string to preserve precision
          token: "USDC",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Sell failed")
      setActionMessage("Sell successful")
      await fetchPortfolio()
      refreshPortfolio()
    } catch (e) {
      setError(e.message || "Sell failed")
    } finally {
      setSellingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-background text-slate-900">
      <Suspense fallback={<div className="h-20" />}>
        <Navigation />
      </Suspense>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12 py-6">
        {!user && (
          <div className="text-center text-slate-800 py-10">
            {t("pleaseLogin")}
            <Button
              className="ml-3 bg-[#4b6ea9] hover:bg-[#3f5e9c] text-white border border-[#3f5e9c] shadow-sm"
              onClick={() => openAuthModal("login")}
            >
              {t("loginRequired")}
            </Button>
          </div>
        )}
        {user && (
          <>
            {error && <div className="text-red-400 mb-4">{error}</div>}
            {actionMessage && <div className="text-green-400 mb-4">{actionMessage}</div>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <Card className="border border-[#e6ddcb] bg-[#f9f6ee] text-slate-900 shadow-md">
                <CardContent className="pt-5 pb-4">
                  {showPortfolioSkeleton ? (
                    <>
                      <Skeleton className="h-10 w-40 mb-4" />
                      <Skeleton className="h-4 w-32" />
                    </>
                  ) : (
                    <>
                      <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">{t("totalValue")}</div>
                      <div className="text-4xl font-bold text-slate-900 mb-4">${totalValue.toFixed(2)}</div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-slate-500 uppercase tracking-wide">{t("cash")}</div>
                          <div className="text-lg font-semibold text-slate-800">${cashValue.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 uppercase tracking-wide">{t("holdings")}</div>
                          <div className="text-lg font-semibold text-slate-800">${holdingsValue.toFixed(2)}</div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
              <Card className="border border-[#e6ddcb] bg-[#f9f6ee] text-slate-900 shadow-md">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 text-sm">
                        {pnlHistory.current_pnl >= 0 ? "▲" : "▼"}
                      </span>
                      <span className="text-slate-700 text-sm font-medium">{t("profitLoss")}</span>
                    </div>
                    <div className="flex gap-1">
                      {["1d", "1w", "1m", "all"].map((p) => (
                        <button
                          key={p}
                          onClick={() => setPnlPeriod(p)}
                          className={`px-2 py-1 text-xs rounded ${
                            pnlPeriod === p
                              ? "bg-[#4b6ea9] text-white"
                              : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                          }`}
                        >
                          {p.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="text-3xl font-bold text-slate-900">
                    {pnlHistory.current_pnl >= 0 ? "" : "-"}${Math.abs(pnlHistory.current_pnl).toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-500 mb-2">
                    {pnlPeriod === "1d" ? t("pastDay") : pnlPeriod === "1w" ? t("pastWeek") : pnlPeriod === "1m" ? t("pastMonth") : t("allTime")}
                  </div>
                  <div className="h-24">
                    {pnlLoading ? (
                      <Skeleton className="h-full w-full" />
                    ) : pnlHistory.data.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={pnlHistory.data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                          <defs>
                            <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#4b6ea9" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#4b6ea9" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" hide />
                          <YAxis hide domain={["dataMin", "dataMax"]} />
                          <Tooltip
                            contentStyle={{ background: "#f9f6ee", border: "1px solid #e6ddcb", borderRadius: "4px", fontSize: "12px" }}
                            formatter={(value) => [`$${value.toFixed(2)}`, "P&L"]}
                            labelFormatter={(label) => label}
                          />
                          <Area
                            type="monotone"
                            dataKey="pnl"
                            stroke="#4b6ea9"
                            fill="url(#pnlGradient)"
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-500 text-sm">{t("noData")}</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex items-center gap-4 mb-4 border-b border-[#e6ddcb] pb-2">
              <button
                className={`pb-2 text-sm font-semibold transition-colors ${
                  activeTab === "positions"
                    ? "text-slate-900 border-b-2 border-[#4b6ea9]"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                onClick={() => setActiveTab("positions")}
              >
                {t("positions")}
              </button>
              <button
                className={`pb-2 text-sm font-semibold transition-colors ${
                  activeTab === "history"
                    ? "text-slate-900 border-b-2 border-[#4b6ea9]"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                onClick={() => setActiveTab("history")}
              >
                {t("history")}
              </button>
            </div>

            {activeTab === "positions" && (
              <Card className="border border-[#e6ddcb] bg-[#f9f6ee] text-slate-900 shadow-md mb-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-slate-900">{t("positions")}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {showPortfolioSkeleton ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left text-slate-900">
                        <thead className="bg-[#f2eadc] text-slate-700 uppercase text-xs">
                          <tr>
                            <th className="px-4 py-3">{t("market")}</th>
                            <th className="px-4 py-3">{t("price")}</th>
                            <th className="px-4 py-3">{t("bet")}</th>
                            <th className="px-4 py-3">{t("cashOut")}</th>
                            <th className="px-4 py-3">{t("pnl")}</th>
                            <th className="px-4 py-3"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: 4 }).map((_, idx) => (
                            <tr key={idx} className="border-b border-gray-700 last:border-0">
                              <td className="px-4 py-4">
                                <Skeleton className="h-4 w-56 mb-2" />
                                <div className="flex items-center gap-2">
                                  <Skeleton className="h-5 w-16 rounded-full" />
                                  <Skeleton className="h-4 w-20" />
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <Skeleton className="h-4 w-10" />
                              </td>
                              <td className="px-4 py-4">
                                <Skeleton className="h-4 w-16" />
                              </td>
                              <td className="px-4 py-4">
                                <Skeleton className="h-4 w-16" />
                              </td>
                              <td className="px-4 py-4">
                                <Skeleton className="h-4 w-16" />
                              </td>
                              <td className="px-4 py-4">
                                <Skeleton className="h-9 w-20" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left text-slate-900">
                        <thead className="bg-[#f2eadc] text-slate-700 uppercase text-xs">
                          <tr>
                            <th className="px-4 py-3">{t("market")}</th>
                            <th className="px-4 py-3">{t("price")}</th>
                            <th className="px-4 py-3">{t("bet")}</th>
                            <th className="px-4 py-3">{t("cashOut")}</th>
                            <th className="px-4 py-3">{t("pnl")}</th>
                            <th className="px-4 py-3"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {positions.map((p, idx) => {
                            const pnl = Number(p.pnl || 0)
                            const cashOut = Number(p.cash_out_value || 0)
                            return (
                            <tr key={idx} className="border-b border-[#e6ddcb] last:border-0">
                              <td className="px-4 py-3 text-slate-900">
                                <Link
                                  href={`/market/${p.event_id || p.market_id}`}
                                  className="font-semibold text-slate-900 hover:text-red-600"
                                  title={p.event_title || p.market_title}
                                >
                                  {truncateText(p.event_title || p.market_title || "", 60)}
                                </Link>
                                <div className="flex items-center gap-2 text-sm text-slate-700">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                      String(p.option_title || "").toLowerCase() === "no"
                                        ? "bg-red-900/50 text-red-300"
                                        : "bg-green-900/40 text-green-300"
                                    }`}
                                  >
                                    {p.option_title}
                                  </span>
                                  <span className="text-slate-700">{Number(p.shares).toFixed(2)} shares</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {p.price ? `${(Number(p.price) * 100).toFixed(1)}¢` : "—"}
                              </td>
                              <td className="px-4 py-3">${Number(p.cost_basis).toFixed(2)}</td>
                              <td className="px-4 py-3">
                                ${cashOut.toFixed(2)}
                              </td>
                              <td className={`px-4 py-3 font-medium ${pnl >= 0 ? "text-green-600" : "text-red-500"}`}>
                                {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                              </td>
                              <td className="px-4 py-3">
                                <Button
                                  className="bg-[#4b6ea9] hover:bg-[#3f5e9c] h-9 px-4 text-white border border-[#3f5e9c] shadow-sm"
                                  disabled={sellingId === p.option_id}
                                  onClick={() => handleSellPosition(p)}
                                >
                                  {sellingId === p.option_id ? t("selling") : t("sell")}
                                </Button>
                              </td>
                            </tr>
                          )})}
                          {!positions.length && (
                            <tr>
                              <td className="px-4 py-4 text-center text-slate-700" colSpan={6}>
                                {t("noPositions")}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {activeTab === "history" && (
              <Card className="border border-[#e6ddcb] bg-[#f9f6ee] text-slate-900 shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-slate-900">{t("history")}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto" style={{ minHeight: historyTableMinHeight }}>
                    <table className="w-full text-sm text-left text-slate-900">
                      <thead className="bg-[#f2eadc] text-slate-700 uppercase text-xs">
                        <tr>
                          <th className="px-5 py-3">{t("activity")}</th>
                          <th className="px-5 py-3">{t("market")}</th>
                          <th className="px-5 py-3 text-right">{t("value")}</th>
                          <th className="px-5 py-3 text-right">{t("time")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {showHistorySkeleton
                          ? Array.from({ length: historySkeletonRows }).map((_, i) => (
                              <tr key={i} className="border-b border-gray-700 last:border-0">
                                <td className="px-5 py-3">
                                  <Skeleton className="h-4 w-20" />
                                </td>
                                <td className="px-5 py-3">
                                  <div className="space-y-2">
                                    <Skeleton className="h-4 w-[320px] max-w-[440px]" />
                                    <Skeleton className="h-3 w-[220px] max-w-[320px]" />
                                  </div>
                                </td>
                                <td className="px-5 py-3 text-right">
                                  <Skeleton className="h-4 w-16 ml-auto" />
                                </td>
                                <td className="px-5 py-3 text-right">
                                  <Skeleton className="h-4 w-20 ml-auto" />
                                </td>
                              </tr>
                            ))
                          : pagedHistory.map((h) => (
                              <tr key={h.id} className="border-b border-[#e6ddcb] last:border-0">
                                <td className="px-5 py-3">
                                  <span
                                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                                      String(h.side || "").toLowerCase() === "sell"
                                        ? "bg-emerald-900/40 text-emerald-200"
                                        : String(h.side || "").toLowerCase() === "buy"
                                          ? "bg-sky-900/40 text-sky-200"
                                          : String(h.side || "").toLowerCase() === "claimed"
                                            ? "bg-green-600/60 text-green-100"
                                            : String(h.side || "").toLowerCase() === "lost"
                                              ? "bg-red-600/50 text-red-100"
                                              : "bg-slate-800 text-slate-200"
                                    }`}
                                  >
                                    {(() => {
                                      const side = String(h.side || "").toLowerCase()
                                      if (side === "buy") return t("bought")
                                      if (side === "sell") return t("sold")
                                      if (side === "claimed") return t("claimed")
                                      if (side === "lost") return t("lost")
                                      if (side === "claim") return t("claimed")
                                      return h.side || "—"
                                    })()}
                                  </span>
                                </td>
                                <td className="px-5 py-3">
                                  {(() => {
                                    const mapped = historyMarketTitleMap?.[h.market_id] || {}
                                    const eventTitle =
                                      mapped.eventTitle ||
                                      mapped.marketTitle ||
                                      h.event_title ||
                                      h.market_title ||
                                      h.title ||
                                      h.market_name ||
                                      ""
                                    return (
                                      <>
                                        <Link
                                          href={`/market/${h.event_id || h.market_id}`}
                                          className="text-slate-900 font-medium hover:text-red-600"
                                          title={eventTitle}
                                        >
                                          {truncateText(eventTitle, 80)}
                                        </Link>
                                        <div className="flex items-center gap-3 text-sm text-slate-700 mt-1 flex-wrap">
                                          {h.option_title ? (
                                            <span
                                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                String(h.option_title || "").toLowerCase() === "no"
                                                  ? "bg-red-900/50 text-red-200"
                                                  : "bg-green-900/40 text-green-200"
                                              }`}
                                            >
                                              {h.option_title}
                                            </span>
                                          ) : null}
                                          {Number(h.shares_out || h.shares_in || 0) ? (
                                            <span className="text-slate-700">
                                              {Number(h.shares_out || h.shares_in || 0).toFixed(2)} shares
                                            </span>
                                          ) : null}
                                        </div>
                                      </>
                                    )
                                  })()}
                                </td>
                                <td className="px-5 py-3 text-right">
                                  {(() => {
                                    const side = String(h.side || "").toLowerCase()
                                    if (side === "claimed") {
                                      // Claimed: show payout amount (positive, green)
                                      const payout = Number(h.amount_in || 0)
                                      return (
                                        <span className="text-green-400">
                                          +${payout.toFixed(2)}
                                        </span>
                                      )
                                    }
                                    if (side === "lost") {
                                      // Lost: show cost_basis as lost amount (negative, red)
                                      const lost = Number(h.cost_basis || 0)
                                      return (
                                        <span className="text-red-400">
                                          -${lost.toFixed(2)}
                                        </span>
                                      )
                                    }
                                    // Buy/Sell: show amount_in as bet amount (positive for display)
                                    const raw = Number(h.amount_in ?? h.amount ?? h.price ?? 0)
                                    const value = Number.isFinite(raw) ? raw.toFixed(2) : "—"
                                    return (
                                      <span className="text-slate-700">
                                        ${value}
                                      </span>
                                    )
                                  })()}
                                </td>
                                <td className="px-5 py-3 text-right text-slate-700">
                                  {h.created_at ? new Date(h.created_at).toLocaleString() : "—"}
                                </td>
                              </tr>
                            ))}
                        {!showHistorySkeleton && !history.length && (
                          <tr>
                            <td className="px-4 py-4 text-center text-slate-700" colSpan={4}>
                              {t("noHistory")}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 border-t border-[#e6ddcb] text-sm text-slate-700">
                    <div className="whitespace-nowrap">
                      {historyTotal
                        ? `Showing ${(historyPage - 1) * historyPageSize + 1}-${Math.min(
                            historyPage * historyPageSize,
                            historyTotal,
                          )} of ${historyTotal}`
                        : "No history"}
                    </div>
                    <Pagination className="justify-end gap-2">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            className="text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40"
                            disabled={historyPage <= 1 || historyLoading}
                            onClick={() => goToPage(historyPage - 1)}
                          >
                            Previous
                          </PaginationPrevious>
                        </PaginationItem>
                        {pageList.map((p, idx) =>
                          typeof p === "number" ? (
                            <PaginationItem key={p}>
                              <PaginationLink
                                className="text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 data-[active=true]:bg-[#4b6ea9] data-[active=true]:text-white data-[active=true]:border-[#4b6ea9]"
                                isActive={p === historyPage}
                                onClick={() => goToPage(p)}
                                disabled={historyPage === p || historyLoading}
                              >
                                {p}
                              </PaginationLink>
                            </PaginationItem>
                          ) : (
                            <PaginationItem key={`${p}-${idx}`}>
                              <PaginationEllipsis className="text-slate-700" />
                            </PaginationItem>
                          ),
                        )}
                        <PaginationItem>
                          <PaginationNext
                            className="text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-40"
                            disabled={historyPage >= historyPageCount || historyLoading}
                            onClick={() => goToPage(historyPage + 1)}
                          >
                            Next
                          </PaginationNext>
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
