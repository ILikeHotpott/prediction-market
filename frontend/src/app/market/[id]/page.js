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
  const [market, setMarket] = useState(null)
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

  const optionsSorted = useMemo(() => {
    return (market?.options || []).slice().sort((a, b) => (a.option_index ?? 0) - (b.option_index ?? 0))
  }, [market])

  const isBinary = useMemo(() => {
    if (!optionsSorted.length) return false
    if (market?.is_binary) return true
    if (optionsSorted.length === 2) return true
    return false
  }, [optionsSorted, market])

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
    fetchMarket(marketId)
  }, [marketId])

  useEffect(() => {
    if (user) {
      fetchBalance()
    } else {
      setBalance(null)
    }
  }, [user])

  async function fetchMarket(id) {
    setLoading(true)
    setError("")
    setSuccess("")
    try {
      const res = await fetch(`${backendBase}/api/markets/${id}/`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load market")
      setMarket(data)
      const firstOption = (data.options || []).sort((a, b) => (a.option_index ?? 0) - (b.option_index ?? 0))[0]
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

  const selectedOption = useMemo(() => {
    return (market?.options || []).find((o) => normalizeId(o.id) === normalizeId(selectedOptionId)) || null
  }, [market, selectedOptionId])

  const panelTitle = selectedOption?.title || market?.title

  const normalizedSelectedId = normalizeId(selectedOptionId)

  const yesOption = useMemo(() => {
    if (!optionsSorted.length) return null
    return optionsSorted.find((o) => String(o.title || "").toLowerCase() === "yes") || optionsSorted[0]
  }, [optionsSorted])

  const noOption = useMemo(() => {
    if (!optionsSorted.length) return null
    if (optionsSorted.length === 1) return null
    const explicitNo = optionsSorted.find((o) => String(o.title || "").toLowerCase() === "no")
    if (explicitNo) return explicitNo
    const yesId = normalizeId(yesOption?.id)
    return optionsSorted.find((o) => normalizeId(o.id) !== yesId) || null
  }, [optionsSorted, yesOption])

  const selectOption = (opt, action = outcomeAction) => {
    if (!opt) return
    setSelectedOptionId(normalizeId(opt.id))
    setOutcomeAction(action)
    setSide("buy")
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
        ? `${backendBase}/api/markets/${market.id}/orders/sell/`
        : `${backendBase}/api/markets/${market.id}/orders/buy/`
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
  const balanceLabel = balance ? `$${Number(balance.available_amount || 0).toFixed(2)}` : "$0.00"
  const selectedLabel = selectedOption?.title || "Yes"
  const actionLabel = outcomeAction === "no" ? "No" : "Yes"
  const showOutcomeList = optionsSorted.length > 2

  return (
    <div className="min-h-screen bg-[#0f172a]">
      <Navigation />
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        {loading && (
          <div className="py-10">
            <LoadingSpinner />
          </div>
        )}
        {!loading && error && <div className="text-red-400 mb-4">{error}</div>}
        {!loading && market && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Chart Area */}
            <div className="lg:col-span-2 space-y-6">
              <MarketChart
                market={market}
                onSelectOutcome={selectOption}
                selectedOptionId={selectedOptionId}
                selectedAction={outcomeAction}
              />
              {showOutcomeList && (
                <div className="bg-[#0f1c2d] rounded-2xl border border-[#1f2e45] shadow-[0_12px_30px_rgba(0,0,0,0.35)] p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-white font-semibold">Outcome</div>
                    <div className="text-white font-semibold">% Chance</div>
                    <div className="text-white font-semibold text-right flex-1">Actions</div>
                  </div>
                  <div className="space-y-2">
                    {optionsSorted.map((opt) => {
                      const normId = normalizeId(opt.id)
                      const prob = opt.probability_bps != null ? opt.probability_bps / 100 : null
                      const yesPrice = prob != null ? `${(prob).toFixed(1)}¢` : "—"
                      const noPrice = prob != null ? `${(100 - prob).toFixed(1)}¢` : "—"
                      const isSelected = normalizedSelectedId === normId
                      const chanceLabel = prob != null ? `${prob.toFixed(0)}%` : "—"
                      return (
                        <div
                          key={opt.id}
                          className={`grid grid-cols-[1.5fr_0.6fr_1fr] items-center gap-4 px-4 py-3 rounded-xl border ${
                            isSelected ? "border-[#2b9ef8]" : "border-[#1f2e45]"
                          } bg-[#0c1624]`}
                        >
                          <div className="text-white font-semibold">{opt.title}</div>
                          <div className="text-white text-2xl font-bold text-center">{chanceLabel}</div>
                          <div className="flex justify-end gap-3">
                            <button
                              onClick={() => selectOption(opt, "yes")}
                              className={`px-4 py-2 rounded-lg text-white font-semibold text-sm transition-all ${
                                isSelected && outcomeAction === "yes"
                                  ? "bg-[#20af64] shadow-[0_8px_20px_rgba(22,163,74,0.35)]"
                                  : "bg-[#1d3c2e] text-white/90 hover:bg-[#20af64]"
                              }`}
                            >
                              Yes {yesPrice}
                            </button>
                            <button
                              onClick={() => selectOption(opt, "no")}
                              className={`px-4 py-2 rounded-lg text-white font-semibold text-sm transition-all ${
                                isSelected && outcomeAction === "no"
                                  ? "bg-[#2b3544]"
                                  : "bg-[#1c2533] text-white/70 hover:bg-[#2b3544]"
                              }`}
                            >
                              No {noPrice}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              <Comments />
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Trade Panel */}
              <div className="bg-[#0d1c2c] dark:bg-[#0f172a] rounded-2xl border border-[#1f2e45] shadow-[0_20px_40px_rgba(0,0,0,0.45)] p-6">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[#24344a] border border-[#1f2e45] flex-shrink-0">
                    {market?.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={market.cover_url}
                        alt={panelTitle || "Market"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl">📈</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white text-xl font-semibold leading-tight truncate">{panelTitle}</h3>
                  </div>
                  <div className="text-white font-semibold text-lg flex items-center gap-2">
                    Market <span className="text-xl">▾</span>
                  </div>
                </div>

                {/* Buy/Sell Tabs */}
                <div className="flex gap-6 mt-6 border-b border-[#1d2c3f]">
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
                  <button
                    onClick={() => {
                      const target = selectedOption || yesOption || optionsSorted[0]
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
                  <button
                    onClick={() => {
                      const target = selectedOption || noOption || optionsSorted[1] || optionsSorted[0]
                      selectOption(target, "no")
                    }}
                    className={`h-16 rounded-xl text-white text-2xl font-semibold transition-all ${
                      outcomeAction === "no"
                        ? "bg-[#2b3544] text-white"
                        : "bg-[#1c2533] text-white/70 hover:bg-[#2b3544]"
                    }`}
                  >
                    No {displayNoPrice}
                  </button>
                </div>

                {/* Amount */}
                <div className="mt-8 space-y-3">
                  <div className="text-white text-2xl font-semibold">{side === "buy" ? "Amount" : "Shares"}</div>
                  <div className="text-gray-400 text-sm">Balance {balanceLabel}</div>

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
                      className={`w-full bg-[#0b1624] border border-[#24344a] rounded-xl px-4 py-4 text-right text-5xl font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#2b9ef8] ${
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
                          className="h-12 rounded-lg bg-[#273448] text-white text-lg font-semibold hover:bg-[#30405a] transition-colors"
                        >
                          +${val}
                        </button>
                      ))}
                      <button
                        onClick={() =>
                          balance?.available_amount &&
                          setAmount(Math.max(Number(balance.available_amount), 0).toFixed(2))
                        }
                        className="h-12 rounded-lg bg-[#273448] text-white text-lg font-semibold hover:bg-[#30405a] transition-colors"
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
                          className="h-12 rounded-lg bg-[#273448] text-white/60 text-lg font-semibold cursor-not-allowed"
                        >
                          {pct}%
                        </button>
                      ))}
                      <button
                        disabled
                        className="h-12 rounded-lg bg-[#273448] text-white/60 text-lg font-semibold cursor-not-allowed"
                      >
                        Max
                      </button>
                    </div>
                  )}
                </div>

                {error && <div className="text-red-400 mt-4 text-sm">{error}</div>}
                {success && <div className="text-green-400 mt-4 text-sm">{success}</div>}

                {amountNum > 0 && actionPrice > 0 && (
                  <div className="mt-6 border-t border-[#1d2c3f] pt-4">
                    <div className="flex items-center justify-between text-lg text-gray-300">
                      <span className="flex items-center gap-2">
                        To win <span role="img" aria-label="money">💵</span>
                      </span>
                      <span className="text-3xl font-semibold text-green-400">
                        {isSell ? `$${potentialProceeds.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : toWinLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-400 mt-2">
                      <span>{isSell ? "Est. Proceeds" : `Avg. Price ${avgPriceLabel}`}</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={handlePlaceOrder}
                  disabled={placing}
                  className="w-full mt-6 py-4 bg-[#2b9ef8] hover:bg-[#268de0] disabled:bg-[#1d3c5e] disabled:cursor-not-allowed text-white text-xl font-semibold rounded-xl transition-colors shadow-[0_12px_30px_rgba(43,158,248,0.35)]"
                >
                  {placing ? "Submitting..." : `${side === "buy" ? "Buy" : "Sell"} ${actionLabel} ${selectedLabel}`}
                </button>
              </div>

              {/* Related Markets placeholder */}
              <div className="bg-[#1e293b] dark:bg-[#0f172a] rounded-lg border border-gray-700 p-6">
                <div className="flex gap-4 border-b border-gray-700 mb-4">
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

