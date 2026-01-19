"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import MarketCard from "./MarketCard"
import { useAuth } from "@/components/auth/AuthProvider"
import { Skeleton } from "@/components/ui/skeleton"
import { useLanguage } from "@/components/LanguageProvider"

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
const CACHE_KEY_PREFIX = "mf_events_"
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function formatVolume(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return "—"
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`
  if (num > 0) return `$${num.toFixed(0)}`
  return "$0"
}

// Global in-memory cache for instant access
const memoryCache = new Map()

function getCacheKey(category) {
  return `${CACHE_KEY_PREFIX}${category || "all"}`
}

function getCachedEvents(category) {
  const key = getCacheKey(category)
  // Try memory cache first (instant)
  if (memoryCache.has(key)) {
    const { data, timestamp } = memoryCache.get(key)
    if (Date.now() - timestamp < CACHE_TTL) return data
  }
  // Fall back to localStorage
  if (typeof window === "undefined") return null
  try {
    const cached = localStorage.getItem(key)
    if (!cached) return null
    const { data, timestamp } = JSON.parse(cached)
    if (Date.now() - timestamp > CACHE_TTL) return null
    memoryCache.set(key, { data, timestamp })
    return data
  } catch { return null }
}

function setCachedEvents(category, data) {
  const key = getCacheKey(category)
  const entry = { data, timestamp: Date.now() }
  memoryCache.set(key, entry)
  if (typeof window !== "undefined") {
    try { localStorage.setItem(key, JSON.stringify(entry)) } catch {}
  }
}

// Prefetch all categories in background
function prefetchAllCategories() {
  const categories = ["", "crypto", "sports", "politics", "entertainment", "science", "business"]
  categories.forEach((cat) => {
    if (!getCachedEvents(cat)) {
      fetchEventsData(cat).then((data) => {
        if (data) setCachedEvents(cat, data)
      }).catch(() => {})
    }
  })
}

async function fetchEventsData(category, lang = "en") {
  const url = new URL(`${backendBase}/api/events/`)
  if (category) url.searchParams.set("category", category)
  if (lang && lang !== "en") url.searchParams.set("lang", lang)
  url.searchParams.set("include_translations", "0")
  try {
    const res = await fetch(url.toString(), { cache: "no-store" })
    const data = await res.json()
    if (!res.ok) return []
    return normalizeEvents(data.items || [])
  } catch {
    return []
  }
}

function normalizeEvents(items) {
  return items.map((evt) => {
    const groupRule = evt.group_rule || "standalone"
    const markets = evt.markets || []
    const activeMarkets = markets.filter((m) => !["resolved", "canceled"].includes(m.status))
    const primaryMarket = evt.primary_market || markets.find((m) => String(m.id) === String(evt.primary_market_id)) || markets[0]
    const standaloneOutcomes = (primaryMarket?.options || []).map((o) => ({
      name: o.title,
      probability: o.probability ?? (o.probability_bps != null ? Math.round(o.probability_bps / 100) : 0),
    }))
    const exclusiveOutcomes = activeMarkets.map((m, idx) => {
      const yesOption = (m.options || []).find((o) => String(o.title || "").trim().toLowerCase() === "yes")
      const prob = yesOption?.probability ?? (yesOption?.probability_bps != null ? Math.round(yesOption.probability_bps / 100) : 0)
      return { name: m.title || m.assertion_text || `Option ${idx + 1}`, probability: prob, market_id: m.id }
    }).sort((a, b) => b.probability - a.probability)
    const multiOutcomes = groupRule === "standalone" ? standaloneOutcomes : exclusiveOutcomes
    const outcomeNames = standaloneOutcomes.map((o) => String(o.name || "").toLowerCase())
    const isBinaryYesNo = outcomeNames.length === 2 && outcomeNames.includes("yes") && outcomeNames.includes("no")
    const yesOption = standaloneOutcomes.find((o) => String(o.name || "").toLowerCase() === "yes")
    const rawVolume = groupRule === "standalone" ? Number(primaryMarket?.volume_total) || 0 : markets.reduce((sum, m) => sum + (Number(m.volume_total) || 0), 0)
    const totalVolume = formatVolume(rawVolume)
    return {
      id: evt.id, title: evt.title, description: evt.description, outcomes: multiOutcomes,
      is_binary: primaryMarket?.is_binary || isBinaryYesNo, chance: yesOption ? yesOption.probability : undefined,
      image: evt.cover_url || primaryMarket?.cover_url || "📈", volume: totalVolume, slug: evt.slug,
      primary_market_id: primaryMarket?.id, group_rule: groupRule,
    }
  })
}

function SkeletonCard() {
  return (
    <div className="market-card bg-[#f9f6ee] border border-[#e6ddcb] rounded-xl" style={{ height: 200 }}>
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4 bg-[#d4c9b5]" />
        <Skeleton className="h-4 w-1/2 bg-[#d4c9b5]" />
        <div className="flex gap-2 mt-4">
          <Skeleton className="h-8 w-16 bg-[#d4c9b5]" />
          <Skeleton className="h-8 w-16 bg-[#d4c9b5]" />
        </div>
        <Skeleton className="h-4 w-1/3 mt-2 bg-[#d4c9b5]" />
      </div>
    </div>
  )
}

export default function MarketGrid() {
  const searchParams = useSearchParams()
  const category = searchParams.get("category")
  const { user } = useAuth()
  const { locale } = useLanguage()

  // Try to get cached data immediately for faster initial render
  const [markets, setMarkets] = useState(() => {
    if (typeof window === "undefined") return []
    return getCachedEvents(category) || []
  })
  const [watchedIds, setWatchedIds] = useState(new Set())
  const [mounted, setMounted] = useState(false)
  const hasFetched = useRef(false)
  const isTogglingRef = useRef(false)

  // Set mounted flag after hydration
  useEffect(() => {
    setMounted(true)
    // Start fetching immediately with locale
    fetchEventsData(category, locale).then((data) => {
      setMarkets(data)
      if (data.length > 0 && locale === "en") setCachedEvents(category, data)
    }).catch(() => {})
    // Prefetch other categories (only for English)
    if (!hasFetched.current && locale === "en") {
      hasFetched.current = true
      setTimeout(prefetchAllCategories, 100)
    }
  }, [locale])

  // Handle category or locale changes after initial mount
  useEffect(() => {
    if (!mounted) return
    // Only use cache for English
    if (locale === "en") {
      const cached = getCachedEvents(category)
      if (cached) setMarkets(cached)
    }
    fetchEventsData(category, locale).then((data) => {
      setMarkets(data)
      if (data.length > 0 && locale === "en") setCachedEvents(category, data)
    }).catch(() => {})
  }, [category, locale, mounted])

  useEffect(() => {
    if (user) fetchWatchlist()
  }, [user])

  async function fetchWatchlist() {
    if (!user || isTogglingRef.current) return
    try {
      const res = await fetch(`${backendBase}/api/watchlist/`, { headers: { "X-User-Id": user.id } })
      const data = await res.json()
      if (res.ok && !isTogglingRef.current) setWatchedIds(new Set(data.event_ids || []))
    } catch {}
  }

  const toggleWatchlist = useCallback(async (eventId) => {
    if (!user || isTogglingRef.current) return
    isTogglingRef.current = true

    setWatchedIds((prev) => {
      const next = new Set(prev)
      prev.has(eventId) ? next.delete(eventId) : next.add(eventId)
      return next
    })

    try {
      const res = await fetch(`${backendBase}/api/watchlist/${eventId}/toggle/`, {
        method: "POST", headers: { "X-User-Id": user.id },
      })
      if (!res.ok) {
        // Revert on failure
        setWatchedIds((prev) => {
          const next = new Set(prev)
          prev.has(eventId) ? next.delete(eventId) : next.add(eventId)
          return next
        })
      }
    } catch {
      // Revert on error
      setWatchedIds((prev) => {
        const next = new Set(prev)
        prev.has(eventId) ? next.delete(eventId) : next.add(eventId)
        return next
      })
    } finally {
      isTogglingRef.current = false
    }
  }, [user])

  // Show skeleton cards only when not mounted yet
  const showSkeleton = !mounted

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12 lg:mt-6 pb-16 relative">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
        {showSkeleton ? (
          Array.from({ length: 9 }).map((_, i) => (
            <SkeletonCard key={`skeleton-${i}`} />
          ))
        ) : markets.length === 0 ? (
          null
        ) : (
          markets.map((market) => (
            <MarketCard
              key={market.id}
              market={market}
              isWatched={watchedIds.has(market.id)}
              onToggleWatchlist={toggleWatchlist}
            />
          ))
        )}
      </div>

      {mounted && markets.length === 0 && (
        <div className="text-center text-muted-foreground py-20 font-display text-xl">No markets available</div>
      )}
    </div>
  )
}
