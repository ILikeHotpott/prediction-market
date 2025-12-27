"use client"

import { useEffect, useState } from "react"
import MarketCard from "./MarketCard"
import ChanceMarketCard from "./ChanceMarketCard"
import LoadingSpinner from "./LoadingSpinner"

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

export default function MarketGrid() {
  const [markets, setMarkets] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetchMarkets()
  }, [])

  async function fetchMarkets() {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`${backendBase}/api/markets/`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load markets")
      const normalized = (data.items || []).map((m) => {
        const outcomes = (m.options || []).map((o) => ({
          name: o.title,
          probability: o.probability ?? (o.probability_bps != null ? Math.round(o.probability_bps / 100) : 0),
        }))

        const outcomeNames = outcomes.map((o) => String(o.name || "").toLowerCase())
        const isBinaryYesNo = outcomeNames.length === 2 && outcomeNames.includes("yes") && outcomeNames.includes("no")
        const yesOption = outcomes.find((o) => String(o.name || "").toLowerCase() === "yes")

        return {
          id: m.id,
          title: m.title,
          description: m.description,
          outcomes,
          is_binary: m.is_binary || isBinaryYesNo,
          chance: yesOption ? yesOption.probability : undefined,
          image: m.cover_url || "📈",
          volume: m.volume_total || "—",
          slug: m.slug,
        }
      })
      setMarkets(normalized)
    } catch (e) {
      setError(e.message || "加载失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-[1400px] mx-auto px-12">
      {error && <div className="text-red-400 mb-3">{error}</div>}
      {loading && <LoadingSpinner />}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {markets.map((market, idx) => {
          if (
            market.chance !== undefined ||
            (market.is_binary &&
              (market.outcomes || []).map((o) => String(o.name || "").toLowerCase()).sort().join("-") === "no-yes")
          ) {
            return <ChanceMarketCard key={`${market.id}-${idx}`} market={market} />
          }
          return <MarketCard key={`${market.id}-${idx}`} market={market} />
        })}
      </div>
      {!loading && !markets.length && (
        <div className="text-center text-gray-500 py-8">暂无市场</div>
      )}
    </div>
  )
}

