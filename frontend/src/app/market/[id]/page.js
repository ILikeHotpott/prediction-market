"use client"

import { useEffect, useMemo, useState } from "react"
import Navigation from "@/components/Navigation"
import MarketChart from "@/components/MarketChart"
import Comments from "@/components/Comments"
import LoadingSpinner from "@/components/LoadingSpinner"
import { useAuth } from "@/components/auth/AuthProvider"
import { useParams } from "next/navigation"

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

export default function MarketDetail({ params }) {
  const routeParams = useParams()
  const { user, openAuthModal } = useAuth()
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
      setError(e.message || "加载失败")
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

  const price = useMemo(() => {
    if (!selectedOption || selectedOption.probability_bps == null) return null
    return selectedOption.probability_bps / 10000
  }, [selectedOption])

  const actionPrice = useMemo(() => {
    if (!price && price !== 0) return null
    const yesPrice = price
    const noPrice = 1 - price
    return outcomeAction === "no" ? noPrice : yesPrice
  }, [price, outcomeAction])

  const amountNum = useMemo(() => {
    const val = Number(amount)
    return Number.isFinite(val) ? Math.max(val, 0) : 0
  }, [amount])

  const shares = price ? (amountNum > 0 ? amountNum / price : 0) : 0
  const isSell = side === "sell"
  const potentialPayout = !isSell && actionPrice && actionPrice > 0 ? amountNum / actionPrice : 0
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
      setError("未找到可交易的子市场")
      return
    }
    if (!selectedOption) {
      setError("请选择一个选项")
      return
    }
    if (!price || price <= 0) {
      setError("价格不可用")
      return
    }
    if (side === "buy") {
      if (!amountNum || amountNum <= 0) {
        setError("请输入下单金额")
        return
      }
    } else {
      if (!amountNum || amountNum <= 0) {
        setError("请输入卖出份额")
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
      const body = isSellSide
        ? {
            shares: String(amountNum),
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
      if (!res.ok) throw new Error(data.error || "下单失败")
      setSuccess(isSellSide ? "卖出成功" : "下单成功")
      setBalance({
        token: data.token,
        available_amount: data.balance_available,
        locked_amount: balance?.locked_amount ?? "0",
      })
      const optId = normalizeId(data.option_id || selectedOption.id)
      if (optId && data.position?.shares != null) {
        const sharesNum = Number(data.position.shares)
        setPositionsMap((prev) => ({
          ...prev,
          [optId]: Number.isFinite(sharesNum) ? sharesNum : prev[optId] || 0,
        }))
      }
    } catch (e) {
      setError(e.message || "下单失败")
    } finally {
      setPlacing(false)
    }
  }

  const yesPriceCents = yesOption?.probability_bps != null ? (yesOption.probability_bps / 100).toFixed(0) : null
  const noPriceCents =
    noOption?.probability_bps != null
      ? (noOption.probability_bps / 100).toFixed(0)
      : yesOption?.probability_bps != null
        ? (100 - yesOption.probability_bps / 100).toFixed(0)
        : null
  const selectedYesPriceCents =
    selectedOption?.probability_bps != null ? (selectedOption.probability_bps / 100).toFixed(0) : yesPriceCents
  const selectedNoPriceCents =
    selectedOption?.probability_bps != null && selectedOption.probability_bps != null
      ? (100 - selectedOption.probability_bps / 100).toFixed(0)
      : noPriceCents
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

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12 py-6">
        {loading && (
          <div className="py-10">
            <LoadingSpinner />
          </div>
        )}
        {!loading && error && <div className="text-red-400 mb-4">{error}</div>}
        {!loading && eventData && selectedMarket && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Chart Area */}
            <div className="lg:col-span-2 space-y-6">
              <MarketChart
                market={selectedMarket}
                eventTitle={eventData?.title}
                markets={marketsSorted}
                hideOutcomes={hideOutcomes}
                onSelectOutcome={selectOption}
                onSelectMarket={selectMarket}
                selectedOptionId={selectedOptionId}
                selectedAction={outcomeAction}
              />

              <Comments marketId={selectedMarket?.id} user={user} openAuthModal={openAuthModal} />
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Trade Panel */}
              <div className="bg-[#4B6BDA] rounded-2xl border border-[#0b75c0] shadow-[0_20px_40px_rgba(0,0,0,0.45)] p-6">
                {!isStandaloneEvent && (
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[#0fa0ff] border border-[#0b75c0] flex-shrink-0">
                      {selectedMarket?.cover_url || eventData?.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={selectedMarket?.cover_url || eventData?.cover_url}
                          alt={panelTitle || eventData?.title || "Market"}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">📈</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white text-xl font-semibold leading-tight truncate">
                        {selectedMarket?.bucket_label || selectedMarket?.title || panelTitle}
                      </h3>
                      <div className="text-gray-400 text-xs truncate">{eventData?.title}</div>
                    </div>
                  </div>
                )}

                {/* Buy/Sell Tabs */}
                <div className="flex gap-6 mt-6 border-b border-[#0b75c0]">
                  <button
                    onClick={() => setSide("buy")}
                    className={`pb-3 text-xl font-semibold transition-colors ${
                      side === "buy" ? "text-white border-b-2 border-white" : "text-gray-500"
                    }`}
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => setSide("sell")}
                    className={`pb-3 text-xl font-semibold transition-colors ${
                      side === "sell" ? "text-white border-b-2 border-white" : "text-gray-500"
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
                      className={`h-16 rounded-xl text-white text-2xl font-semibold transition-all ${
                        outcomeAction === "yes"
                          ? "bg-[#20af64] shadow-[0_10px_30px_rgba(22,163,74,0.35)]"
                          : "bg-[#1d3c2e] text-white/90 hover:bg-[#20af64]"
                      }`}
                    >
                      Yes {displayYesPrice}
                    </button>
                    {side === "sell" && yesOption && userSharesForOption(yesOption) > 0 && (
                      <div
                        className={`text-center text-sm ${
                          outcomeAction === "yes" ? "text-green-300" : "text-gray-400"
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
                      className={`h-16 rounded-xl text-white text-2xl font-semibold transition-all ${
                        outcomeAction === "no"
                          ? "bg-[#b91c1c] text-white shadow-[0_10px_30px_rgba(185,28,28,0.35)]"
                          : "bg-[#4d2a2a] text-white/80 hover:bg-[#b91c1c]"
                      }`}
                    >
                      No {displayNoPrice}
                    </button>
                    {side === "sell" && noOption && userSharesForOption(noOption) > 0 && (
                      <div
                        className={`text-center text-sm ${
                          outcomeAction === "no" ? "text-red-300" : "text-gray-400"
                        }`}
                      >
                        {formattedSharesLabel(noOption)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <div className="mt-8 space-y-3">
                  <div className="text-white text-2xl font-semibold">{side === "buy" ? "Amount" : "Shares"}</div>

                  <div className="relative">
                    {side === "buy" && (
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-4xl text-gray-500">$</span>
                    )}
                    <input
                      type="number"
                      value={amount}
                    onChange={(e) => {
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
                      className={`w-full bg-[#0fa0ff] border border-[#0b75c0] rounded-xl px-4 py-4 text-right text-5xl font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#58c7ff] ${
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
                          className="h-12 rounded-lg bg-[#0fa0ff] text-white text-lg font-semibold hover:bg-[#32b4ff] transition-colors"
                        >
                          +${val}
                        </button>
                      ))}
                        <button
                          onClick={() =>
                            balance?.available_amount &&
                            setAmount(Math.max(Number(balance.available_amount), 0).toFixed(2))
                          }
                          className="h-12 rounded-lg bg-[#0fa0ff] text-white text-lg font-semibold hover:bg-[#32b4ff] transition-colors"
                      >
                        Max
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {[25, 50].map((pct) => (
                        <button
                          key={pct}
                          disabled
                          className="h-12 rounded-lg bg-[#0fa0ff] text-white/70 text-lg font-semibold cursor-not-allowed"
                        >
                          {pct}%
                        </button>
                      ))}
                      <button
                        disabled
                        className="h-12 rounded-lg bg-[#0fa0ff] text-white/70 text-lg font-semibold cursor-not-allowed"
                      >
                        Max
                      </button>
                    </div>
                  )}
                </div>

                {error && <div className="text-red-400 mt-4 text-sm">{error}</div>}
                {success && <div className="text-green-400 mt-4 text-sm">{success}</div>}

                {amountNum > 0 && actionPrice > 0 && (
                  <div className="mt-6 border-t border-[#0b75c0] pt-4">
                    <div className="flex items-center justify-between text-lg text-gray-300">
                      <span className="flex items-center gap-2">
                        {summaryTitle} <span role="img" aria-label="money">💵</span>
                      </span>
                      <span className="text-3xl font-semibold text-green-400">
                        {summaryValueLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-400 mt-2">
                      <span>{summarySubLabel}</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={handlePlaceOrder}
                  disabled={placing}
                  className="w-full mt-6 py-4 bg-[#00a6ff] hover:bg-[#0094e6] disabled:bg-[#0fa0ff] disabled:cursor-not-allowed text-white text-xl font-semibold rounded-xl transition-colors shadow-[0_12px_30px_rgba(0,166,255,0.35)]"
                >
                  {placing ? "Submitting..." : `${side === "buy" ? "Buy" : "Sell"} ${actionLabel} ${selectedLabel}`}
                </button>
              </div>

              {/* Related Markets placeholder */}
              <div className="bg-[#3f6f56] rounded-lg border border-[#2f4b3c] p-6">
                <div className="flex gap-4 border-b border-[#2f4b3c] mb-4">
                  <button className="pb-2 border-b-2 border-white text-white font-semibold text-sm">
                    All
                  </button>
                  <button className="pb-2 text-gray-400 hover:text-white text-sm transition-colors">
                    Politics
                  </button>
                  <button className="pb-2 text-gray-400 hover:text-white text-sm transition-colors">
                    Markets
                  </button>
                </div>
                <div className="space-y-3 text-gray-300 text-sm">更多关联市场即将上线</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

