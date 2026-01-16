"use client"

import { Suspense, useEffect, useState } from "react"
import Navigation from "@/components/Navigation"
import MarketCard from "@/components/MarketCard"
import { useAuth } from "@/components/auth/AuthProvider"
import { Skeleton } from "@/components/ui/skeleton"
import { useTranslations } from "next-intl"

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

function formatVolume(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return "—"
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`
  if (num > 0) return `$${num.toFixed(0)}`
  return "$0"
}

export default function WatchlistPage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [watchedIds, setWatchedIds] = useState(new Set())
  const { user } = useAuth()
  const t = useTranslations("watchlist")

  useEffect(() => {
    if (user) fetchWatchlist()
  }, [user])

  async function fetchWatchlist() {
    setLoading(true)
    try {
      const res = await fetch(`${backendBase}/api/watchlist/`, {
        headers: { "X-User-Id": user.id },
      })
      const data = await res.json()
      if (res.ok && data.event_ids?.length) {
        setWatchedIds(new Set(data.event_ids))
        const eventsRes = await fetch(`${backendBase}/api/events/?ids=${data.event_ids.join(",")}`)
        const eventsData = await eventsRes.json()
        if (eventsRes.ok) {
          const normalized = (eventsData.items || []).map((evt) => {
            const groupRule = evt.group_rule || "standalone"
            const markets = evt.markets || []
            const primaryMarket = evt.primary_market || markets[0]
            const standaloneOutcomes = (primaryMarket?.options || []).map((o) => ({
              name: o.title,
              probability: o.probability ?? (o.probability_bps != null ? Math.round(o.probability_bps / 100) : 0),
            }))
            const exclusiveOutcomes = markets.map((m, idx) => {
              const yesOption = (m.options || []).find((o) => String(o.title || "").trim().toLowerCase() === "yes")
              const prob = yesOption?.probability ?? (yesOption?.probability_bps != null ? Math.round(yesOption.probability_bps / 100) : 0)
              return { name: m.title || m.assertion_text || `Option ${idx + 1}`, probability: prob, market_id: m.id }
            }).sort((a, b) => b.probability - a.probability)
            const multiOutcomes = groupRule === "standalone" ? standaloneOutcomes : exclusiveOutcomes
            const yesOption = standaloneOutcomes.find((o) => String(o.name || "").toLowerCase() === "yes")
            const rawVolume = groupRule === "standalone" ? Number(primaryMarket?.volume_total) || 0 : markets.reduce((sum, m) => sum + (Number(m.volume_total) || 0), 0)
            return {
              id: evt.id,
              title: evt.title,
              outcomes: multiOutcomes,
              chance: yesOption ? yesOption.probability : undefined,
              image: evt.cover_url || primaryMarket?.cover_url || "📈",
              volume: formatVolume(rawVolume),
              group_rule: groupRule,
            }
          })
          setEvents(normalized)
        }
      }
    } catch {}
    setLoading(false)
  }

  async function toggleWatchlist(eventId) {
    if (!user) return
    try {
      const res = await fetch(`${backendBase}/api/watchlist/${eventId}/toggle/`, {
        method: "POST",
        headers: { "X-User-Id": user.id },
      })
      const data = await res.json()
      if (res.ok) {
        if (!data.is_watched) {
          setEvents((prev) => prev.filter((e) => e.id !== eventId))
          setWatchedIds((prev) => {
            const next = new Set(prev)
            next.delete(eventId)
            return next
          })
        }
      }
    } catch {}
  }

  return (
    <div className="min-h-screen bg-background">
      <Suspense fallback={<div className="h-20" />}>
        <Navigation />
      </Suspense>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12 pb-16">
        <h1 className="text-2xl font-bold text-foreground mb-6">{t("title")}</h1>

        {!user && (
          <div className="text-center text-muted-foreground py-20">
            {t("pleaseLogin")}
          </div>
        )}

        {user && loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-[#f9f6ee] rounded-2xl border border-[#e6ddcb] p-4 space-y-3">
                <Skeleton className="h-32 w-full rounded-lg" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        )}

        {user && !loading && events.length === 0 && (
          <div className="text-center text-muted-foreground py-20">
            {t("empty")}
          </div>
        )}

        {user && !loading && events.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-6">
            {events.map((market) => (
              <MarketCard
                key={market.id}
                market={market}
                isWatched={watchedIds.has(market.id)}
                onToggleWatchlist={toggleWatchlist}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
