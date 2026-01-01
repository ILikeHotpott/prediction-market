"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import MarketCard from "./MarketCard"
import LoadingSpinner from "./LoadingSpinner"

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

export default function MarketGrid() {
  const [markets, setMarkets] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [spinningColumns, setSpinningColumns] = useState([false, false, false])
  const [isSpinning, setIsSpinning] = useState(false)
  const spinTimers = useRef([])
  const bodyOverflowRef = useRef()

  useEffect(() => {
    fetchMarkets()
  }, [])

  useEffect(() => {
    if (typeof document === "undefined") return
    if (isSpinning) {
      bodyOverflowRef.current = document.body.style.overflow
      document.body.style.overflow = "hidden"
    } else if (bodyOverflowRef.current !== undefined) {
      document.body.style.overflow = bodyOverflowRef.current
      bodyOverflowRef.current = undefined
    }

    return () => {
      if (bodyOverflowRef.current !== undefined) {
        document.body.style.overflow = bodyOverflowRef.current
        bodyOverflowRef.current = undefined
      }
    }
  }, [isSpinning])

  async function fetchMarkets() {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`${backendBase}/api/events/`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load events")
      const normalized = (data.items || []).map((evt) => {
        const groupRule = evt.group_rule || "standalone"
        const markets = evt.markets || []

        const primaryMarket =
          evt.primary_market ||
          markets.find((m) => String(m.id) === String(evt.primary_market_id)) ||
          markets[0]

        const standaloneOutcomes = (primaryMarket?.options || []).map((o) => ({
          name: o.title,
          probability: o.probability ?? (o.probability_bps != null ? Math.round(o.probability_bps / 100) : 0),
        }))

        const multiOutcomes =
          groupRule === "standalone"
            ? standaloneOutcomes
            : markets.map((m, idx) => {
                const yesOption = (m.options || []).find((o) => String(o.title || "").trim().toLowerCase() === "yes")
                const prob =
                  yesOption?.probability ??
                  (yesOption?.probability_bps != null ? Math.round(yesOption.probability_bps / 100) : 0)
                return {
                  name: m.title || m.assertion_text || `Option ${idx + 1}`,
                  probability: prob,
                  market_id: m.id,
                }
              })

        const outcomeNames = standaloneOutcomes.map((o) => String(o.name || "").toLowerCase())
        const isBinaryYesNo = outcomeNames.length === 2 && outcomeNames.includes("yes") && outcomeNames.includes("no")
        const yesOption = standaloneOutcomes.find((o) => String(o.name || "").toLowerCase() === "yes")

        const totalVolume =
          groupRule === "standalone"
            ? primaryMarket?.volume_total
            : markets.reduce((sum, m) => sum + (Number(m.volume_total) || 0), 0) || "—"

        return {
          id: evt.id,
          title: evt.title,
          description: evt.description,
          outcomes: multiOutcomes,
          is_binary: primaryMarket?.is_binary || isBinaryYesNo,
          chance: yesOption ? yesOption.probability : undefined,
          image: evt.cover_url || primaryMarket?.cover_url || "📈",
          volume: totalVolume,
          slug: evt.slug,
          primary_market_id: primaryMarket?.id,
          group_rule: groupRule,
        }
      })
      setMarkets(normalized)
    } catch (e) {
      setError(e.message || "加载失败")
    } finally {
      setLoading(false)
    }
  }

  const columns = useMemo(() => {
    const cols = [[], [], []]
    markets.forEach((market, idx) => {
      cols[idx % 3].push(market)
    })
    return cols
  }, [markets])

  useEffect(() => {
    return () => {
      spinTimers.current.forEach(clearTimeout)
      spinTimers.current = []
    }
  }, [])

  function startSpin() {
    if (!markets.length || loading) return
    spinTimers.current.forEach(clearTimeout)
    spinTimers.current = []
    setIsSpinning(true)
    setSpinningColumns([true, true, true])

    const durations = [2000, 2600, 3200]
    durations.forEach((duration, idx) => {
      const timer = setTimeout(() => {
        setSpinningColumns((prev) => prev.map((v, i) => (i === idx ? false : v)))
        if (idx === durations.length - 1) {
          setIsSpinning(false)
        }
      }, duration)
      spinTimers.current.push(timer)
    })
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12 pb-16 relative">
      {error && <div className="text-red-400 mb-3 text-center font-bold bg-red-900/20 p-2 rounded border border-red-500/50">{error}</div>}
      {loading && <div className="flex justify-center py-20"><LoadingSpinner /></div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-6">
        {columns.map((column, colIdx) => {
          const spinning = spinningColumns[colIdx]
          // duplicate once for seamless loop but avoid unnecessary DOM bloat while spinning
          const renderItems = spinning ? [...column, ...column] : column
          return (
            <div
              key={`slot-column-${colIdx}`}
              className={`slot-column ${spinning ? "slot-column--spinning" : ""}`}
              style={{ ["--slot-speed"]: `${0.22 + colIdx * 0.04}s` }}
            >
              <div className="slot-track flex flex-col gap-5 md:gap-6">
                {renderItems.map((market, idx) => (
                  <div key={`${market.id}-${idx}`} className="slot-item">
                    <MarketCard market={market} />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {!loading && !markets.length && (
        <div className="text-center text-muted-foreground py-20 font-display text-xl">No markets available</div>
      )}

      <div className="fixed right-4 sm:right-6 top-1/2 -translate-y-1/2 z-40">
        <button
          onClick={startSpin}
          disabled={loading || !markets.length || isSpinning}
          className="slot-trigger vintage-trigger inline-flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full font-black tracking-[0.08em] uppercase text-sm sm:text-base text-[#fff5e6] transition-all duration-150 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <span>{isSpinning ? "WAIT" : "PULL"}</span>
          <span className="sr-only">{isSpinning ? "滚动中" : "拉动老虎机"}</span>
        </button>
      </div>
    </div>
  )
}
