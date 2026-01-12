"use client"

import { Suspense, useEffect, useMemo, useState, useRef, useCallback } from "react"
import Navigation from "@/components/Navigation"
import MarketChart from "@/components/MarketChart"
import Comments from "@/components/Comments"
import { Skeleton } from "@/components/ui/skeleton"
import Toast from "@/components/Toast"
import { useAuth } from "@/components/auth/AuthProvider"
import { usePortfolio } from "@/components/PortfolioProvider"
import { useParams } from "next/navigation"

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

export default function MarketDetail({ params }) {
  const routeParams = useParams()
  const { user, openAuthModal } = useAuth()
  const { refreshPortfolio } = usePortfolio()
  const [marketId, setMarketId] = useState(null)
  const [eventData, setEventData] = useState(null)
  const [selectedMarketId, setSelectedMarketId] = useState(null)
  const [selectedOptionId, setSelectedOptionId] = useState(null)
  const [amount, setAmount] = useState("0")
  const [side, setSide] = useState("buy")
  const [outcomeAction, setOutcomeAction] = useState("yes") // yes | no

  const normalizeId = (id) => (id != null ? String(id) : null)
  const [loading, setLoading] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [toastMessage, setToastMessage] = useState("")
  const [toastType, setToastType] = useState("success")
  const [balance, setBalance] = useState(null)
  const [positionsMap, setPositionsMap] = useState({})

  const marketsSorted = useMemo(() => {
    return (eventData?.markets || [])
      .slice()
      .sort((a, b) => (a.sort_weight ?? 0) - (b.sort_weight ?? 0) || (a.created_at || "").localeCompare(b.created_at || ""))
  }, [eventData])

  const selectedMarket = useMemo(() => {
    if (!eventData || !selectedMarketId) return null
    return (eventData.markets || []).find((m) => normalizeId(m.id) === normalizeId(selectedMarketId)) || null
  }, [eventData, selectedMarketId])

  const optionsSorted = useMemo(() => {
    return (selectedMarket?.options || []).slice().sort((a, b) => (a.option_index ?? 0) - (b.option_index ?? 0))
  }, [selectedMarket])

  const isBinary = useMemo(() => {
    if (!optionsSorted.length) return false
    if (selectedMarket?.is_binary) return true
    if (optionsSorted.length === 2) return true
    return false
  }, [optionsSorted, selectedMarket])

  useEffect(() => {
    let active = true
    Promise.resolve(params)
      .then((p) => p?.id || routeParams?.id)
      .then((id) => {
        if (active) setMarketId(id)
      })
    return () => {
      active = false
    }
  }, [params, routeParams])

  useEffect(() => {
    if (!marketId) return
    fetchEvent(marketId)
  }, [marketId])

  useEffect(() => {
    // when switching market, pick a sensible default option (prefer YES)
    if (!selectedMarket) return
    const yes = (selectedMarket.options || []).find((o) => (o.side || "").toLowerCase() === "yes")
    const first = (selectedMarket.options || [])[0]
    const target = yes || first || null
    if (target) {
      setSelectedOptionId(normalizeId(target.id))
      setOutcomeAction("yes")
      setSide("buy")
    }
  }, [selectedMarket])

  useEffect(() => {
    if (user) {
      fetchBalance()
      fetchPositions()
    } else {
      setBalance(null)
      setPositionsMap({})
    }
  }, [user])

  async function fetchEvent(id) {
    setLoading(true)
    setError("")
    setSuccess("")
    try {
      const res = await fetch(`${backendBase}/api/events/${id}/`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load event")
      setEventData(data)
      const primaryMarketId = data.primary_market_id || data.primary_market?.id || data.markets?.[0]?.id
      setSelectedMarketId(normalizeId(primaryMarketId))
      const firstMarket = (data.markets || []).find((m) => normalizeId(m.id) === normalizeId(primaryMarketId)) || data.markets?.[0]
      const firstOption =
        (firstMarket?.options || []).sort((a, b) => (a.option_index ?? 0) - (b.option_index ?? 0))[0]
      setSelectedOptionId(normalizeId(firstOption?.id))
    } catch (e) {
      setError(e.message || "Failed to load")
    } finally {
      setLoading(false)
    }
  }

  async function fetchBalance(token = "USDC") {
    try {
      const res = await fetch(`${backendBase}/api/users/me/balance/?token=${encodeURIComponent(token)}`, {
        headers: user ? { "X-User-Id": user.id } : {},
        cache: "no-store",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load balance")
      setBalance(data)
    } catch (_e) {
      // allow fail silently
    }
  }

  async function fetchPositions() {
    if (!user) return
    try {
      const res = await fetch(`${backendBase}/api/users/me/portfolio/`, {
        headers: { "X-User-Id": user.id },
        cache: "no-store",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load positions")
      const map = {}
      ;(data.positions || []).forEach((p) => {
        const id = normalizeId(p.option_id)
        if (!id) return
        const num = Number(p.shares || 0)
        map[id] = Number.isFinite(num) ? num : 0
      })
      setPositionsMap(map)
    } catch (_e) {
      // ignore silently for now
    }
  }

  const selectedOption = useMemo(() => {
    return (selectedMarket?.options || []).find((o) => normalizeId(o.id) === normalizeId(selectedOptionId)) || null
  }, [selectedMarket, selectedOptionId])

  const panelTitle = selectedOption?.title || selectedMarket?.title || eventData?.title

  const normalizedSelectedId = normalizeId(selectedOptionId)

  const yesOption = useMemo(() => {
    if (!optionsSorted.length) return null
    return (
      optionsSorted.find((o) => (o.side || "").toLowerCase() === "yes") ||
      optionsSorted.find((o) => String(o.title || "").toLowerCase() === "yes") ||
      optionsSorted[0]
    )
  }, [optionsSorted])

  const noOption = useMemo(() => {
    if (!optionsSorted.length) return null
    if (optionsSorted.length === 1) return null
    const explicitNo =
      optionsSorted.find((o) => (o.side || "").toLowerCase() === "no") ||
      optionsSorted.find((o) => String(o.title || "").toLowerCase() === "no")
    if (explicitNo) return explicitNo
    const yesId = normalizeId(yesOption?.id)
    return optionsSorted.find((o) => normalizeId(o.id) !== yesId) || null
  }, [optionsSorted, yesOption])

  // Keep selected option aligned with chosen action (yes/no) so orders use correct leg
  useEffect(() => {
    if (!optionsSorted.length) return
    if (outcomeAction === "no") {
      const target = noOption || optionsSorted[1] || optionsSorted[0]
      if (target && normalizeId(selectedOptionId) !== normalizeId(target.id)) {
        setSelectedOptionId(normalizeId(target.id))
      }
    } else {
      const target = yesOption || optionsSorted[0]
      if (target && normalizeId(selectedOptionId) !== normalizeId(target.id)) {
        setSelectedOptionId(normalizeId(target.id))
      }
    }
  }, [outcomeAction, optionsSorted, yesOption, noOption, selectedOptionId])

  const selectOption = (opt, action = outcomeAction) => {
    if (!opt) return
    setSelectedOptionId(normalizeId(opt.id))
    setOutcomeAction(action)
  }

  const selectMarket = (marketObj, action = "yes") => {
    if (!marketObj) return
    setSelectedMarketId(normalizeId(marketObj.id))
    const yes = (marketObj.options || []).find((o) => (o.side || "").toLowerCase() === "yes")
    const no = (marketObj.options || []).find((o) => (o.side || "").toLowerCase() === "no")
    const fallback = (marketObj.options || [])[0]
    const target = action === "no" ? no || fallback : yes || fallback
    if (target) {
      setSelectedOptionId(normalizeId(target.id))
    }
    setOutcomeAction(action)
  }

  const yesPrice = useMemo(() => {
    if (yesOption?.probability_bps == null) return null
    return yesOption.probability_bps / 10000
  }, [yesOption])

  const noPrice = useMemo(() => {
    if (noOption?.probability_bps != null) return noOption.probability_bps / 10000
    if (yesPrice != null) return 1 - yesPrice
    return null
  }, [noOption, yesPrice])

  // Selected option price (do not invert; option already matches outcomeAction)
  const selectedPrice = useMemo(() => {
    if (selectedOption?.probability_bps == null) return null
    return selectedOption.probability_bps / 10000
  }, [selectedOption])

  const actionPrice = useMemo(() => {
    if (outcomeAction === "no") {
      return noPrice != null ? noPrice : selectedPrice
    }
    return yesPrice != null ? yesPrice : selectedPrice
  }, [outcomeAction, yesPrice, noPrice, selectedPrice])

  const amountNum = useMemo(() => {
    const val = Number(amount)
    return Number.isFinite(val) ? Math.max(val, 0) : 0
  }, [amount])

  const shares = selectedPrice ? (amountNum > 0 ? amountNum / selectedPrice : 0) : 0
  const isSell = side === "sell"
  const effectivePriceForPayout = selectedPrice ?? actionPrice
  const potentialPayout =
    !isSell && effectivePriceForPayout && effectivePriceForPayout > 0
      ? amountNum / effectivePriceForPayout
      : 0
  const potentialProceeds = isSell && actionPrice ? amountNum * actionPrice : 0
  const avgPriceLabel = actionPrice != null ? `${(actionPrice * 100).toFixed(1)}¢` : "—"
  const toWinValue = isSell ? potentialProceeds : potentialPayout
  const toWinLabel =
    toWinValue > 0
      ? `$${toWinValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "$0.00"
  const proceedsLabel = `$${potentialProceeds.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
  const summaryTitle = isSell ? "You'll receive" : "To win"
  const summaryValueLabel = isSell ? proceedsLabel : toWinLabel
  const summarySubLabel = `Avg. Price ${avgPriceLabel}`
  const userSharesForOption = (opt) => {
    const id = normalizeId(opt?.id)
    if (!id) return 0
    const val = Number(positionsMap[id])
    return Number.isFinite(val) ? val : 0
  }
  const formattedSharesLabel = (opt) => {
    const s = userSharesForOption(opt)
    return `${s.toFixed(2)} shares`
  }

  const handleAmountPreset = (delta) => {
    setAmount((prev) => {
      const prevNum = Number(prev) || 0
      const next = Math.max(prevNum + delta, 0)
      return next.toFixed(2)
    })
  }

  const handlePlaceOrder = async () => {
    if (!user) {
      openAuthModal("login")
      return
    }
    if (!selectedMarket) {
      setError("No tradable market found")
      return
    }
    if (!selectedOption) {
      setError("Please select an option")
      return
    }
    if (actionPrice == null || actionPrice <= 0) {
      setError("Price unavailable")
      return
    }
    if (side === "buy") {
      if (!amountNum || amountNum <= 0) {
        setError("Please enter an amount")
        return
      }
    } else {
      if (!amountNum || amountNum <= 0) {
        setError("Please enter shares to sell")
        return
      }
    }
    setPlacing(true)
    setError("")
    setSuccess("")
    try {
      const nonce =
        typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined
      const isSellSide = side === "sell"
      const endpoint = isSellSide
        ? `${backendBase}/api/markets/${selectedMarket.id}/orders/sell/`
        : `${backendBase}/api/markets/${selectedMarket.id}/orders/buy/`

      // Check if selling all shares (within small tolerance)
      const currentShares = userSharesForOption(selectedOption)
      const isSellAll = isSellSide && Math.abs(amountNum - currentShares) < 0.0001

      const body = isSellSide
        ? {
            shares: isSellAll ? undefined : String(amountNum),
            sell_all: isSellAll,
            option_id: selectedOption.id,
            token: "USDC",
            client_nonce: nonce,
          }
        : {
            amount_in: String(amountNum),
            option_id: selectedOption.id,
            token: "USDC",
            client_nonce: nonce,
          }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": user.id,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Order failed")

      // Show success message
      const successMsg = isSellSide ? "Sell successful" : "Order successful"
      setSuccess(successMsg)
      setToastMessage(successMsg)
      setToastType("success")
      
      // Update balance
      setBalance({
        token: data.token,
        available_amount: data.balance_available,
        locked_amount: balance?.locked_amount ?? "0",
      })
      
      // Update positions
      const optId = normalizeId(data.option_id || selectedOption.id)
      if (optId && data.position?.shares != null) {
        const sharesNum = Number(data.position.shares)
        setPositionsMap((prev) => ({
          ...prev,
          [optId]: Number.isFinite(sharesNum) ? sharesNum : prev[optId] || 0,
        }))
      }
      
      // Update local prices using post_prob_bps from API response to avoid full page refresh
      if (data.post_prob_bps && Array.isArray(data.post_prob_bps) && selectedMarket) {
        setEventData((prev) => {
          if (!prev) return prev
          const updatedMarkets = (prev.markets || []).map((market) => {
            if (normalizeId(market.id) !== normalizeId(selectedMarket.id)) {
              return market
            }
            // Match using option_index since post_prob_bps array index corresponds to option_index
            const updatedOptions = (market.options || []).map((option) => {
              const optionIdx = option.option_index ?? 0
              const probBps = data.post_prob_bps[optionIdx]
              if (probBps != null && probBps >= 0 && probBps <= 10000) {
                return { ...option, probability_bps: probBps }
              }
              return option
            })
            return { ...market, options: updatedOptions }
          })
          return { ...prev, markets: updatedMarkets }
        })
      }
      
      // Clear input
      setAmount("0")

      // Update navigation portfolio overview; force refresh only after successful trade
      refreshPortfolio()
      
      // Async update balance and positions (non-blocking)
      fetchBalance().catch(() => {})
      fetchPositions().catch(() => {})
    } catch (e) {
      const errorMsg = e.message || "Order failed"
      setError(errorMsg)
      setToastMessage(errorMsg)
      setToastType("error")
    } finally {
      setPlacing(false)
    }
  }

  const formatCents = (price) =>
    price != null
      ? (price * 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 })
      : null
  const yesPriceCents = formatCents(yesPrice)
  const noPriceCents = formatCents(noPrice)
  const selectedYesPriceCents = yesPriceCents
  const selectedNoPriceCents = noPriceCents
  const displayYesPrice = selectedYesPriceCents != null ? `${selectedYesPriceCents}¢` : "—"
  const displayNoPrice = selectedNoPriceCents != null ? `${selectedNoPriceCents}¢` : "—"
  const selectedLabel =
    selectedMarket?.bucket_label ||
    selectedMarket?.title ||
    selectedOption?.title ||
    "Option"
  const actionLabel = outcomeAction === "no" ? "No" : "Yes"
  const isStandaloneEvent = (eventData?.group_rule || "").toLowerCase() === "standalone"
  const hideOutcomes = isStandaloneEvent

  // Ref for left scrollable area
  const leftScrollRef = useRef(null)

  // Handle wheel event on the entire page to scroll left area
  const handleWheel = useCallback((e) => {
    if (leftScrollRef.current && window.innerWidth >= 1024) {
      leftScrollRef.current.scrollTop += e.deltaY
    }
  }, [])

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden lg:overflow-hidden" onWheel={handleWheel}>
      <Suspense fallback={<div className="h-20" />}>
        <Navigation />
      </Suspense>
      <Toast
        message={toastMessage}
        type={toastType}
        onClose={() => {
          setToastMessage("")
          setSuccess("")
          setError("")
        }}
      />
      <div className="flex-1 overflow-y-auto lg:overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12 py-6 h-full">
        {loading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Chart Area Skeleton */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-[#f9f6ee] rounded-2xl border border-[#e6ddcb] p-6">
                <Skeleton className="h-6 w-2/3 mb-4" />
                <Skeleton className="h-10 w-32 mb-4" />
                <Skeleton className="h-[280px] w-full rounded-lg" />
                <div className="flex gap-2 mt-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-12 rounded" />
                  ))}
                </div>
              </div>
              <div className="bg-[#f9f6ee] rounded-2xl border border-[#e6ddcb] p-6">
                <Skeleton className="h-6 w-32 mb-4" />
                <Skeleton className="h-20 w-full" />
              </div>
            </div>
            {/* Sidebar Skeleton */}
            <div className="space-y-6">
              <div className="bg-[#f9f6ee] rounded-2xl border border-[#e6ddcb] p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Skeleton className="w-14 h-14 rounded-2xl" />
                  <div className="flex-1">
                    <Skeleton className="h-5 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
                <Skeleton className="h-10 w-full mb-4" />
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                </div>
                <Skeleton className="h-6 w-24 mb-3" />
                <Skeleton className="h-16 w-full rounded-xl mb-3" />
                <div className="grid grid-cols-4 gap-3 mb-6">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 rounded-lg" />
                  ))}
                </div>
                <Skeleton className="h-14 w-full rounded-xl" />
              </div>
            </div>
          </div>
        )}
        {!loading && error && <div className="text-red-400 mb-4">{error}</div>}
        {!loading && eventData && selectedMarket && (
          <div className="flex flex-col lg:flex-row gap-6 h-full">
            {/* Main Chart Area - scrollable on desktop */}
            <div ref={leftScrollRef} className="lg:w-2/3 space-y-6 lg:overflow-y-auto lg:h-full lg:pr-4 lg:pb-12">
              <MarketChart
                market={selectedMarket}
                eventId={eventData?.id}
                eventTitle={eventData?.title}
                coverUrl={eventData?.cover_url || selectedMarket?.cover_url}
                eventType={eventData?.group_rule || "standalone"}
                markets={marketsSorted}
                hideOutcomes={hideOutcomes}
                onSelectOutcome={selectOption}
                onSelectMarket={selectMarket}
                selectedOptionId={selectedMarketId}
                selectedAction={outcomeAction}
              />

              <Comments marketId={selectedMarket?.id} user={user} openAuthModal={openAuthModal} />
            </div>

            {/* Sidebar - fixed on desktop */}
            <div className="lg:w-1/3 space-y-6 lg:overflow-y-auto lg:h-full">
              {/* Trade Panel */}
              <div className="bg-[#f9f6ee] text-slate-900 rounded-2xl border border-[#e6ddcb] shadow-md p-6">
                {!isStandaloneEvent && (
                  <div className="mb-4">
                    <h3 className="text-slate-900 text-xl font-semibold leading-tight truncate">
                      {selectedMarket?.bucket_label || selectedMarket?.title || panelTitle}
                    </h3>
                    <div className="text-slate-600 text-xs truncate">{eventData?.title}</div>
                  </div>
                )}

                {/* Buy/Sell Tabs */}
                <div className="flex gap-6 mt-6 border-b border-[#e6ddcb]">
                  <button
                    onClick={() => setSide("buy")}
                    className={`pb-3 text-xl font-semibold transition-colors ${
                      side === "buy" ? "text-red-700 border-b-2 border-red-600" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => setSide("sell")}
                    className={`pb-3 text-xl font-semibold transition-colors ${
                      side === "sell" ? "text-red-700 border-b-2 border-red-600" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Sell
                  </button>
                </div>

                {/* Options */}
                <div className="grid grid-cols-2 gap-3 mt-6">
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => {
                        const target = yesOption || selectedOption || optionsSorted[0]
                        selectOption(target, "yes")
                      }}
                      className={`h-16 rounded-xl text-2xl font-semibold transition-all ${
                        outcomeAction === "yes"
                          ? "bg-emerald-700 text-white shadow-sm"
                          : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                      }`}
                    >
                      Yes {displayYesPrice}
                    </button>
                    {side === "sell" && yesOption && userSharesForOption(yesOption) > 0 && (
                      <div
                        className={`text-center text-sm ${
                          outcomeAction === "yes" ? "text-emerald-700" : "text-slate-600"
                        }`}
                      >
                        {formattedSharesLabel(yesOption)}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => {
                        const target = noOption || selectedOption || optionsSorted[1] || optionsSorted[0]
                        selectOption(target, "no")
                      }}
                      className={`h-16 rounded-xl text-2xl font-semibold transition-all ${
                        outcomeAction === "no"
                          ? "bg-red-700 text-white shadow-sm"
                          : "bg-red-100 text-red-800 hover:bg-red-200"
                      }`}
                    >
                      No {displayNoPrice}
                    </button>
                    {side === "sell" && noOption && userSharesForOption(noOption) > 0 && (
                      <div
                        className={`text-center text-sm ${
                          outcomeAction === "no" ? "text-red-700" : "text-slate-600"
                        }`}
                      >
                        {formattedSharesLabel(noOption)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <div className="mt-8 space-y-3">
                  <div className="text-slate-900 text-2xl font-semibold">{side === "buy" ? "Amount" : "Shares"}</div>

                  <div className="relative">
                    {side === "buy" && (
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-4xl text-slate-400">$</span>
                    )}
                    <input
                      type="number"
                      value={amount}
                    onChange={(e) => {
                      // Clear previous success/error messages
                      if (success || error) {
                        setSuccess("")
                        setError("")
                      }
                      let val = e.target.value
                      if (val === "") {
                        setAmount("")
                        return
                      }
                      val = val.replace(/[^\d.]/g, "")
                      if (val.startsWith(".")) {
                        val = `0${val}`
                      }
                      const [i, d] = val.split(".")
                      const limited = d != null ? `${i}.${d.slice(0, 2)}` : i
                      setAmount(limited)
                    }}
                      placeholder={side === "buy" ? "$0" : "0"}
                      className={`w-full bg-white border border-[#e6ddcb] rounded-xl px-4 py-4 text-right text-5xl font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/70 ${
                        side === "buy" ? "pl-12" : "pl-4"
                      }`}
                    />
                  </div>

                  {side === "buy" ? (
                    <div className="grid grid-cols-4 gap-3">
                      {[1, 20, 100].map((val) => (
                        <button
                          key={val}
                          onClick={() => handleAmountPreset(val)}
                          className="h-12 rounded-lg bg-white border border-[#e6ddcb] text-slate-900 text-lg font-semibold hover:bg-rose-50 transition-colors"
                        >
                          +${val}
                        </button>
                      ))}
                        <button
                          onClick={() =>
                            balance?.available_amount &&
                            setAmount(Math.max(Number(balance.available_amount), 0).toFixed(2))
                          }
                          className="h-12 rounded-lg bg-white border border-[#e6ddcb] text-slate-900 text-lg font-semibold hover:bg-rose-50 transition-colors"
                      >
                        Max
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {[25, 50].map((pct) => {
                        const currentShares = userSharesForOption(selectedOption)
                        const pctShares = currentShares * pct / 100
                        return (
                          <button
                            key={pct}
                            onClick={() => setAmount(pctShares.toFixed(2))}
                            disabled={currentShares <= 0}
                            className={`h-12 rounded-lg text-lg font-semibold transition-colors ${
                              currentShares > 0
                                ? "bg-white border border-[#e6ddcb] text-slate-900 hover:bg-rose-50"
                                : "bg-slate-200 text-slate-500 cursor-not-allowed"
                            }`}
                          >
                            {pct}%
                          </button>
                        )
                      })}
                      <button
                        onClick={() => {
                          const currentShares = userSharesForOption(selectedOption)
                          setAmount(currentShares.toFixed(8))
                        }}
                        disabled={userSharesForOption(selectedOption) <= 0}
                        className={`h-12 rounded-lg text-lg font-semibold transition-colors ${
                          userSharesForOption(selectedOption) > 0
                            ? "bg-white border border-[#e6ddcb] text-slate-900 hover:bg-rose-50"
                            : "bg-slate-200 text-slate-500 cursor-not-allowed"
                        }`}
                      >
                        Max
                      </button>
                    </div>
                  )}
                </div>

                {error && <div className="text-red-600 mt-4 text-sm">{error}</div>}
                {success && <div className="text-emerald-700 mt-4 text-sm">{success}</div>}

                {amountNum > 0 && actionPrice > 0 && (
                  <div className="mt-6 border-t border-[#e6ddcb] pt-4">
                    <div className="flex items-center justify-between text-lg text-slate-800">
                      <span className="flex items-center gap-2">
                        {summaryTitle} <span role="img" aria-label="money">💵</span>
                      </span>
                      <span className="text-3xl font-semibold text-emerald-700">
                        {summaryValueLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600 mt-2">
                      <span>{summarySubLabel}</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={handlePlaceOrder}
                  disabled={placing}
                  className="w-full mt-6 py-4 text-white text-xl font-semibold rounded-xl transition-colors shadow-sm bg-[#4b6ea9] hover:bg-[#3f5e9c] disabled:bg-[#c9d4ea] disabled:text-[#3f5e9c] disabled:cursor-not-allowed"
                >
                  {placing ? "Submitting..." : `${side === "buy" ? "Buy" : "Sell"} ${actionLabel} ${selectedLabel}`}
                </button>
              </div>

              {/* Related Markets placeholder */}
              <div className="bg-[#f9f6ee] text-slate-900 rounded-lg border border-[#e6ddcb] p-6 shadow-sm lg:mb-12">
                <div className="flex gap-4 border-b border-[#e6ddcb] mb-4">
                  <button className="pb-2 border-b-2 border-[#4b6ea9] text-[#2f4b7c] font-semibold text-sm">
                    All
                  </button>
                  <button className="pb-2 text-slate-600 hover:text-[#2f4b7c] text-sm transition-colors">
                    Politics
                  </button>
                  <button className="pb-2 text-slate-600 hover:text-[#2f4b7c] text-sm transition-colors">
                    Markets
                  </button>
                </div>
                <div className="space-y-3 text-slate-700 text-sm">More related markets coming soon</div>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
