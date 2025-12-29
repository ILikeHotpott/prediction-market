"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import Navigation from "@/components/Navigation"
import { useAuth } from "@/components/auth/AuthProvider"
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
      return
    }
    fetchPortfolio()
  }, [user])

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
      setError(e.message || "加载失败")
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
      setError(e.message || "加载失败")
    } finally {
      setHistoryLoading(false)
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
    const shares = Number(pos.shares || 0)
    if (!shares || shares <= 0) {
      setError("可卖出份额不足")
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
          shares: String(shares),
          token: "USDC",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "卖出失败")
      setActionMessage("卖出成功")
      await fetchPortfolio()
    } catch (e) {
      setError(e.message || "卖出失败")
    } finally {
      setSellingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#0f172a]">
      <Navigation />
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12 py-6">
        {!user && (
          <div className="text-center text-gray-300 py-10">
            请先登录。
            <Button className="ml-3" onClick={() => openAuthModal("login")}>
              登录
            </Button>
          </div>
        )}
        {user && (
          <>
            {error && <div className="text-red-400 mb-4">{error}</div>}
            {actionMessage && <div className="text-green-400 mb-4">{actionMessage}</div>}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <Card className="bg-[#1e293b] border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-gray-300 text-sm">Portfolio</CardTitle>
                </CardHeader>
                <CardContent>
                  {showPortfolioSkeleton ? (
                    <>
                      <Skeleton className="h-9 w-32 mb-3" />
                      <Skeleton className="h-4 w-48" />
                    </>
                  ) : (
                    <>
                      <div className="text-3xl font-bold text-white">${totalValue.toFixed(2)}</div>
                      <div className="text-sm text-gray-400 mt-2">
                        Cash: ${cashValue.toFixed(2)} | Holdings: ${holdingsValue.toFixed(2)}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
              <Card className="bg-[#1e293b] border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-gray-300 text-sm">Cash</CardTitle>
                </CardHeader>
                <CardContent>
                  {showPortfolioSkeleton ? (
                    <>
                      <Skeleton className="h-9 w-24 mb-3" />
                      <Skeleton className="h-4 w-28" />
                    </>
                  ) : (
                    <>
                      <div className="text-3xl font-bold text-white">${cashValue.toFixed(2)}</div>
                      <div className="text-sm text-gray-400 mt-2">Token: {balance?.token || "USDC"}</div>
                    </>
                  )}
                </CardContent>
              </Card>
              <Card className="bg-[#1e293b] border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-gray-300 text-sm">Actions</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-3">
                  {showPortfolioSkeleton ? (
                    <>
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </>
                  ) : (
                    <>
                      <Button className="flex-1 bg-blue-600 hover:bg-blue-700">Deposit</Button>
                      <Button className="flex-1 bg-gray-700 hover:bg-gray-600">Withdraw</Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="flex items-center gap-4 mb-4 border-b border-gray-700 pb-2">
              <button
                className={`pb-2 text-sm font-semibold ${
                  activeTab === "positions" ? "text-white border-b-2 border-blue-500" : "text-gray-400"
                }`}
                onClick={() => setActiveTab("positions")}
              >
                Positions
              </button>
              <button
                className={`pb-2 text-sm font-semibold ${
                  activeTab === "history" ? "text-white border-b-2 border-blue-500" : "text-gray-400"
                }`}
                onClick={() => setActiveTab("history")}
              >
                History
              </button>
            </div>

            {activeTab === "positions" && (
              <Card className="bg-[#1e293b] border-gray-700 mb-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white">Positions</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {showPortfolioSkeleton ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left text-gray-300">
                        <thead className="bg-[#223144] text-gray-400 uppercase text-xs">
                          <tr>
                            <th className="px-4 py-3">Market</th>
                            <th className="px-4 py-3">Price</th>
                            <th className="px-4 py-3">Bet</th>
                            <th className="px-4 py-3">To Win</th>
                            <th className="px-4 py-3">Value</th>
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
                      <table className="w-full text-sm text-left text-gray-300">
                        <thead className="bg-[#223144] text-gray-400 uppercase text-xs">
                          <tr>
                            <th className="px-4 py-3">Market</th>
                            <th className="px-4 py-3">Price</th>
                            <th className="px-4 py-3">Bet</th>
                            <th className="px-4 py-3">To Win</th>
                            <th className="px-4 py-3">Value</th>
                            <th className="px-4 py-3"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {positions.map((p, idx) => (
                            <tr key={idx} className="border-b border-gray-700 last:border-0">
                              <td className="px-4 py-3 text-white">
                                <Link
                                  href={`/market/${p.market_id}`}
                                  className="font-semibold text-white hover:text-blue-300"
                                  title={p.event_title || p.market_title}
                                >
                                  {truncateText(p.event_title || p.market_title || "", 60)}
                                </Link>
                                <div className="flex items-center gap-2 text-sm text-gray-400">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                      String(p.option_title || "").toLowerCase() === "no"
                                        ? "bg-red-900/50 text-red-300"
                                        : "bg-green-900/40 text-green-300"
                                    }`}
                                  >
                                    {p.option_title}
                                  </span>
                                  <span className="text-gray-500">{Number(p.shares).toFixed(2)} shares</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {p.price ? `${(Number(p.price) * 100).toFixed(1)}¢` : "—"}
                              </td>
                              <td className="px-4 py-3">${Number(p.cost_basis).toFixed(2)}</td>
                              <td className="px-4 py-3 text-green-400">
                                ${Number(p.shares).toFixed(2)}
                              </td>
                              <td className="px-4 py-3 text-green-400">
                                ${Number(p.value).toFixed(2)}
                              </td>
                              <td className="px-4 py-3">
                                <Button
                                  className="bg-blue-600 hover:bg-blue-700 h-9 px-4"
                                  disabled={sellingId === p.option_id}
                                  onClick={() => handleSellPosition(p)}
                                >
                                  {sellingId === p.option_id ? "Selling..." : "Sell"}
                                </Button>
                              </td>
                            </tr>
                          ))}
                          {!positions.length && (
                            <tr>
                              <td className="px-4 py-4 text-center text-gray-500" colSpan={7}>
                                No positions yet.
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
              <Card className="bg-[#1e293b] border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white">History</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto" style={{ minHeight: historyTableMinHeight }}>
                    <table className="w-full text-sm text-left text-gray-300">
                      <thead className="bg-[#223144] text-gray-400 uppercase text-xs">
                        <tr>
                          <th className="px-5 py-3">Activity</th>
                          <th className="px-5 py-3">Market</th>
                          <th className="px-5 py-3 text-right">Value</th>
                          <th className="px-5 py-3 text-right">Time</th>
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
                              <tr key={h.id} className="border-b border-gray-700 last:border-0">
                                <td className="px-5 py-3">
                                  <span
                                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                                      String(h.side || "").toLowerCase() === "sell"
                                        ? "bg-emerald-900/40 text-emerald-200"
                                        : String(h.side || "").toLowerCase() === "buy"
                                          ? "bg-sky-900/40 text-sky-200"
                                          : "bg-slate-800 text-slate-200"
                                    }`}
                                  >
                                    {(() => {
                                      const side = String(h.side || "").toLowerCase()
                                      if (side === "buy") return "Bought"
                                      if (side === "sell") return "Sold"
                                      if (side === "claim" || side === "claimed") return "Claimed"
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
                                          href={`/market/${h.market_id}`}
                                          className="text-white font-medium hover:text-blue-300"
                                          title={eventTitle}
                                        >
                                          {truncateText(eventTitle, 80)}
                                        </Link>
                                        <div className="flex items-center gap-3 text-sm text-gray-400 mt-1 flex-wrap">
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
                                            <span className="text-gray-400">
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
                                    const raw = Number(h.amount_in ?? h.amount ?? h.price ?? 0)
                                    const side = String(h.side || "").toLowerCase()
                                    const signed = side === "buy" ? -raw : raw
                                    const isGain = signed >= 0
                                    const color = isGain ? "text-green-400" : "text-red-400"
                                    const value = Number.isFinite(signed) ? Math.abs(signed).toFixed(2) : "—"
                                    return (
                                      <span className={color}>
                                        {Number.isFinite(signed) ? `${isGain ? "+" : "-"}$${value}` : "—"}
                                      </span>
                                    )
                                  })()}
                                </td>
                                <td className="px-5 py-3 text-right text-gray-400">
                                  {h.created_at ? new Date(h.created_at).toLocaleString() : "—"}
                                </td>
                              </tr>
                            ))}
                        {!showHistorySkeleton && !history.length && (
                          <tr>
                            <td className="px-4 py-4 text-center text-gray-500" colSpan={4}>
                              No history yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 text-sm text-gray-400">
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
                                isActive={p === historyPage}
                                onClick={() => goToPage(p)}
                                disabled={historyPage === p || historyLoading}
                              >
                                {p}
                              </PaginationLink>
                            </PaginationItem>
                          ) : (
                            <PaginationItem key={`${p}-${idx}`}>
                              <PaginationEllipsis />
                            </PaginationItem>
                          ),
                        )}
                        <PaginationItem>
                          <PaginationNext
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

