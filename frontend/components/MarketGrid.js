"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import MarketCard from "./MarketCard"
import SlotLever from "./SlotLever"
import { useAuth } from "@/components/auth/AuthProvider"
import { Skeleton } from "@/components/ui/skeleton"

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
const CACHE_KEY_PREFIX = "mf_events_"
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

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

async function fetchEventsData(category) {
  const url = new URL(`${backendBase}/api/events/`)
  if (category) url.searchParams.set("category", category)
  const res = await fetch(url.toString(), { cache: "no-store" })
  const data = await res.json()
  if (!res.ok) return null
  return normalizeEvents(data.items || [])
}

function normalizeEvents(items) {
  return items.map((evt) => {
    const groupRule = evt.group_rule || "standalone"
    const markets = evt.markets || []
    const primaryMarket = evt.primary_market || markets.find((m) => String(m.id) === String(evt.primary_market_id)) || markets[0]
    const standaloneOutcomes = (primaryMarket?.options || []).map((o) => ({
      name: o.title,
      probability: o.probability ?? (o.probability_bps != null ? Math.round(o.probability_bps / 100) : 0),
    }))
    const multiOutcomes = groupRule === "standalone" ? standaloneOutcomes : markets.map((m, idx) => {
      const yesOption = (m.options || []).find((o) => String(o.title || "").trim().toLowerCase() === "yes")
      const prob = yesOption?.probability ?? (yesOption?.probability_bps != null ? Math.round(yesOption.probability_bps / 100) : 0)
      return { name: m.title || m.assertion_text || `Option ${idx + 1}`, probability: prob, market_id: m.id }
    })
    const outcomeNames = standaloneOutcomes.map((o) => String(o.name || "").toLowerCase())
    const isBinaryYesNo = outcomeNames.length === 2 && outcomeNames.includes("yes") && outcomeNames.includes("no")
    const yesOption = standaloneOutcomes.find((o) => String(o.name || "").toLowerCase() === "yes")
    const totalVolume = groupRule === "standalone" ? primaryMarket?.volume_total : markets.reduce((sum, m) => sum + (Number(m.volume_total) || 0), 0) || "—"
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
    <div className="market-card" style={{ height: 200 }}>
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4 bg-[#e6ddcb]" />
        <Skeleton className="h-4 w-1/2 bg-[#e6ddcb]" />
        <div className="flex gap-2 mt-4">
          <Skeleton className="h-8 w-16 bg-[#e6ddcb]" />
          <Skeleton className="h-8 w-16 bg-[#e6ddcb]" />
        </div>
      </div>
    </div>
  )
}

export default function MarketGrid() {
  const searchParams = useSearchParams()
  const category = searchParams.get("category")
  const { user } = useAuth()

  // Initialize with cached data immediately
  const [markets, setMarkets] = useState(() => getCachedEvents(category) || [])
  const [watchedIds, setWatchedIds] = useState(new Set())
  const [spinningColumns, setSpinningColumns] = useState([false, false, false])
  const [isSpinning, setIsSpinning] = useState(false)
  const [spinKey, setSpinKey] = useState(0)
  const spinTimers = useRef([])
  const bodyOverflowRef = useRef()
  const hasFetched = useRef(false)

  // Load cached data instantly on category change
  useEffect(() => {
    const cached = getCachedEvents(category)
    if (cached) setMarkets(cached)
    // Always refresh in background (SWR pattern)
    fetchEventsData(category).then((data) => {
      if (data) {
        setMarkets(data)
        setCachedEvents(category, data)
      }
    }).catch(() => {})
    // Prefetch other categories on first load
    if (!hasFetched.current) {
      hasFetched.current = true
      setTimeout(prefetchAllCategories, 100)
    }
  }, [category])

  useEffect(() => {
    if (user) fetchWatchlist()
  }, [user])

  async function fetchWatchlist() {
    if (!user) return
    try {
      const res = await fetch(`${backendBase}/api/watchlist/`, { headers: { "X-User-Id": user.id } })
      const data = await res.json()
      if (res.ok) setWatchedIds(new Set(data.event_ids || []))
    } catch {}
  }

  const toggleWatchlist = useCallback(async (eventId) => {
    if (!user) return
    const wasWatched = watchedIds.has(eventId)
    setWatchedIds((prev) => {
      const next = new Set(prev)
      wasWatched ? next.delete(eventId) : next.add(eventId)
      return next
    })
    try {
      const res = await fetch(`${backendBase}/api/watchlist/${eventId}/toggle/`, {
        method: "POST", headers: { "X-User-Id": user.id },
      })
      if (!res.ok) {
        setWatchedIds((prev) => {
          const next = new Set(prev)
          wasWatched ? next.add(eventId) : next.delete(eventId)
          return next
        })
      }
    } catch {
      setWatchedIds((prev) => {
        const next = new Set(prev)
        wasWatched ? next.add(eventId) : next.delete(eventId)
        return next
      })
    }
  }, [user, watchedIds])

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

  const columns = useMemo(() => {
    const cols = [[], [], []]
    markets.forEach((market, idx) => cols[idx % 3].push(market))
    return cols
  }, [markets])

  useEffect(() => {
    return () => {
      spinTimers.current.forEach(clearTimeout)
      spinTimers.current = []
    }
  }, [])

  function startSpin() {
    if (!markets.length) return
    spinTimers.current.forEach(clearTimeout)
    spinTimers.current = []
    setIsSpinning(true)
    setSpinningColumns([true, true, true])
    setSpinKey((k) => k + 1)
    const durations = [1400, 2000, 2600]
    durations.forEach((duration, idx) => {
      const timer = setTimeout(() => {
        setSpinningColumns((prev) => prev.map((v, i) => (i === idx ? false : v)))
        if (idx === durations.length - 1) setIsSpinning(false)
      }, duration)
      spinTimers.current.push(timer)
    })
  }

  // Show skeleton cards if no data yet
  const showSkeleton = markets.length === 0

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12 pb-16 relative">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-6">
        {showSkeleton ? (
          // Skeleton loading
          Array.from({ length: 9 }).map((_, i) => (
            <div key={`skeleton-${i}`} className="slot-item">
              <SkeletonCard />
            </div>
          ))
        ) : (
          columns.map((column, colIdx) => {
            const spinning = spinningColumns[colIdx]
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
                      <MarketCard
                        market={market}
                        spinKey={spinKey}
                        isWatched={watchedIds.has(market.id)}
                        onToggleWatchlist={toggleWatchlist}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>

      {!showSkeleton && !markets.length && (
        <div className="text-center text-muted-foreground py-20 font-display text-xl">No markets available</div>
      )}

      <SlotLever onPull={startSpin} disabled={!markets.length} isSpinning={isSpinning} />
    </div>
  )
}
