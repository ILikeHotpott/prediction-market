"use client"

import { useEffect, useState, useMemo } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

const API = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
const INTERVALS = ["1H", "6H", "1D", "1W", "ALL"]
const COLORS = ["#3b82f6", "#ea580c", "#16a34a", "#9333ea", "#ca8a04", "#dc2626"]

// Global cache with stale-while-revalidate for instant switching
const cache = new Map()
const pending = new Map()
const timestamps = new Map()
const STALE_TIME = 120000 // 2 minutes (reduced API calls)
const MAX_CACHE_SIZE = 100

async function fetchData(marketIds, interval, forceRefresh = false) {
  const key = `${marketIds.sort().join(",")}:${interval}`
  const now = Date.now()
  const cached = cache.get(key)
  const timestamp = timestamps.get(key)

  // Return cached if fresh or if request is pending
  if (!forceRefresh && cached && timestamp && (now - timestamp < STALE_TIME)) {
    return cached
  }

  // Return stale data immediately, fetch in background
  if (cached && !pending.has(key)) {
    fetchInBackground(marketIds, interval, key)
    return cached
  }

  if (pending.has(key)) return pending.get(key)

  const promise = (async () => {
    try {
      const params = new URLSearchParams({ interval })
      marketIds.forEach(id => params.append("market_ids", id))
      const res = await fetch(`${API}/api/markets/series/?${params}`, {
        headers: { 'Accept-Encoding': 'gzip' }
      })
      const data = await res.json()
      const series = data.series || {}

      // LRU cache eviction
      if (cache.size >= MAX_CACHE_SIZE) {
        const oldestKey = timestamps.keys().next().value
        cache.delete(oldestKey)
        timestamps.delete(oldestKey)
      }

      cache.set(key, series)
      timestamps.set(key, Date.now())
      return series
    } catch {
      return cached || {}
    } finally {
      pending.delete(key)
    }
  })()

  pending.set(key, promise)
  return promise
}

function fetchInBackground(marketIds, interval, key) {
  const promise = (async () => {
    try {
      const params = new URLSearchParams({ interval })
      marketIds.forEach(id => params.append("market_ids", id))
      const res = await fetch(`${API}/api/markets/series/?${params}`, {
        headers: { 'Accept-Encoding': 'gzip' }
      })
      const data = await res.json()
      cache.set(key, data.series || {})
      timestamps.set(key, Date.now())
    } catch {}
  })()
  pending.set(key, promise)
}

export default function MarketChartRecharts({
  market,
  eventId,
  eventTitle,
  coverUrl,
  eventType = "standalone",
  eventStatus,
  markets = [],
  hideOutcomes = false,
  onSelectMarket,
  selectedOptionId,
  selectedAction,
  refreshTrigger = 0,
  scrolled = false,
}) {
  const [interval, setInterval] = useState("1H")
  const [allData, setAllData] = useState({})
  const [loading, setLoading] = useState(true)

  const isMulti = eventType === "exclusive" || eventType === "independent"
  const visibleMarkets = useMemo(() => {
    if (!isMulti) return markets
    const status = String(eventStatus || "").toLowerCase()
    const hideResolved = status !== "resolved"
    return markets.filter((m) => {
      const marketStatus = String(m.status || "").toLowerCase()
      if (marketStatus === "canceled") return false
      if (hideResolved && marketStatus === "resolved") return false
      return true
    })
  }, [isMulti, markets, eventStatus])

  // Memoize sorted markets to avoid re-sorting on every render
  const sortedMarkets = useMemo(() => {
    if (!isMulti || !visibleMarkets.length) return []
    return [...visibleMarkets].sort((a, b) => {
      const aP = a.options?.find(o => o.side === "yes")?.probability_bps || 0
      const bP = b.options?.find(o => o.side === "yes")?.probability_bps || 0
      return bP - aP
    })
  }, [isMulti, visibleMarkets])

  const marketIds = useMemo(() => {
    if (isMulti) {
      return sortedMarkets.slice(0, 4).map(m => m.id).filter(Boolean)
    }
    return market?.id ? [market.id] : []
  }, [isMulti, sortedMarkets, market?.id])

  // Fetch current interval first, then prefetch others
  useEffect(() => {
    if (!marketIds.length) return

    // Fetch current interval immediately
    fetchData(marketIds, interval).then(data => {
      setAllData(prev => ({ ...prev, [interval]: data }))
      setLoading(false)
    })

    // Prefetch other intervals after 100ms
    const timer = setTimeout(() => {
      INTERVALS.filter(int => int !== interval).forEach(int => {
        fetchData(marketIds, int).then(data => {
          setAllData(prev => ({ ...prev, [int]: data }))
        })
      })
    }, 100)

    return () => clearTimeout(timer)
  }, [marketIds.join(","), refreshTrigger])

  // When interval changes, use cached data or fetch
  useEffect(() => {
    if (!marketIds.length) return
    if (allData[interval]) return // Already have data

    fetchData(marketIds, interval).then(data => {
      setAllData(prev => ({ ...prev, [interval]: data }))
    })
  }, [interval, marketIds.join(",")])

  const chartData = useMemo(() => {
    const series = allData[interval] || {}

    if (isMulti && sortedMarkets.length) {
      const lines = sortedMarkets.slice(0, 4).map((m, i) => {
        const opt = m.options?.find(o => o.side === "yes") || m.options?.[0]
        return {
          id: m.id,
          label: m.bucket_label || m.title,
          color: COLORS[i],
          optionId: opt?.id,
          prob: opt?.probability_bps != null ? opt.probability_bps / 100 : null,
        }
      })

      // Find global min/max timestamps
      let minTime = Infinity
      let maxTime = -Infinity
      const lineData = {}

      lines.forEach(line => {
        const raw = series[line.optionId] || []
        lineData[line.label] = raw
        raw.forEach(p => {
          const time = new Date(p.bucket_start).getTime()
          if (time < minTime) minTime = time
          if (time > maxTime) maxTime = time
        })
      })

      // Build points with anchor values
      const points = {}
      lines.forEach(line => {
        const raw = lineData[line.label]

        // Get first and last values for anchoring
        const firstVal = raw.length > 0 ? raw[0].value_bps / 100 : line.prob
        const lastVal = raw.length > 0 ? raw[raw.length - 1].value_bps / 100 : line.prob

        // Add anchor at minTime if this line doesn't have data there
        if (raw.length > 0 && firstVal != null) {
          const firstTime = new Date(raw[0].bucket_start).getTime()
          if (firstTime > minTime) {
            if (!points[minTime]) points[minTime] = { time: minTime }
            points[minTime][line.label] = firstVal
          }
        }

        // Add all actual data points
        raw.forEach(p => {
          const time = new Date(p.bucket_start).getTime()
          if (!points[time]) points[time] = { time }
          points[time][line.label] = p.value_bps / 100
        })

        // Add anchor at maxTime if this line doesn't have data there
        if (raw.length > 0 && lastVal != null) {
          const lastTime = new Date(raw[raw.length - 1].bucket_start).getTime()
          if (lastTime < maxTime) {
            if (!points[maxTime]) points[maxTime] = { time: maxTime }
            points[maxTime][line.label] = lastVal
          }
        }
      })

      if (!Object.keys(points).length) {
        const now = Date.now()
        const fallbackPoints = {
          [now - 60000]: { time: now - 60000 },
          [now]: { time: now },
        }
        lines.forEach(line => {
          if (line.prob != null) {
            fallbackPoints[now - 60000][line.label] = line.prob
            fallbackPoints[now][line.label] = line.prob
          }
        })
        return { lines, points: Object.values(fallbackPoints) }
      }

      return { lines, points: Object.values(points).sort((a, b) => a.time - b.time) }
    }

    const opt = market?.options?.find(o => o.side === "yes") || market?.options?.[0]
    const raw = series[opt?.id] || []
    const points = raw.map(p => ({
      time: new Date(p.bucket_start).getTime(),
      value: p.value_bps / 100
    }))
    const prob = opt?.probability_bps != null ? opt.probability_bps / 100 : null
    if (!points.length && prob != null) {
      const now = Date.now()
      points.push({ time: now - 60000, value: prob }, { time: now, value: prob })
    }

    return {
      lines: [{ id: market?.id, label: opt?.title || "Yes", color: COLORS[0], prob }],
      points
    }
  }, [allData, interval, market, sortedMarkets, isMulti])

  const prob = chartData.lines[0]?.prob ?? chartData.points?.at(-1)?.value

  if (loading) {
    return (
      <div className="bg-background rounded-2xl p-6">
        <div className="h-8 w-64 bg-white/10 rounded animate-pulse mb-2" />
        <div className="h-12 w-24 bg-white/10 rounded animate-pulse mb-4" />
        <div className="h-[300px] bg-white/5 rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className="bg-background lg:rounded-2xl lg:mt-4 overflow-hidden">
      <div className={`px-4 lg:px-6 transition-all duration-300 lg:pt-5 lg:pb-4 ${scrolled ? 'pt-3 pb-2' : 'pt-5 pb-4'}`}>
        <div className={`flex items-center mb-2 transition-all duration-300 lg:gap-3 ${scrolled ? 'gap-2' : 'gap-3'}`}>
          {coverUrl && <img src={coverUrl} alt="" className={`rounded-lg object-cover transition-all duration-300 lg:w-12 lg:h-12 ${scrolled ? 'w-8 h-8' : 'w-12 h-12'}`} />}
          <h2 className={`font-bold text-white lg:text-xl transition-all duration-300 ${scrolled ? 'text-base' : 'text-xl'}`}>{eventTitle || market?.title}</h2>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold text-white">{prob != null ? `${prob.toFixed(0)}%` : "—"}</span>
          <span className="text-lg text-white/60">chance</span>
        </div>
      </div>

      {isMulti && chartData.lines.length > 1 && (
        <div className="px-4 lg:px-6 pb-3 flex flex-wrap gap-4 text-sm">
          {chartData.lines.map(line => (
            <button key={line.id} onClick={() => onSelectMarket?.(visibleMarkets.find(m => m.id === line.id))} className="flex items-center gap-2 hover:opacity-80">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: line.color }} />
              <span className="text-white/70">{line.label}</span>
              {line.prob != null && <span className="text-white/50">({line.prob.toFixed(0)}%)</span>}
            </button>
          ))}
        </div>
      )}

      <div className="px-2 pb-4">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData.points}>
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              scale="time"
              stroke="rgba(255,255,255,0.45)"
              tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            />
            <YAxis
              stroke="rgba(255,255,255,0.45)"
              domain={['dataMin - 5', 'dataMax + 5']}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              orientation="right"
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e6ddcb', borderRadius: '8px' }}
              labelStyle={{ color: '#475569' }}
              formatter={(v, name) => [`${v.toFixed(1)}%`, name]}
              labelFormatter={(t) => new Date(t).toLocaleString()}
            />
            {isMulti ? (
              chartData.lines.map(line => (
                <Line key={line.id} type="monotone" dataKey={line.label} stroke={line.color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
              ))
            ) : (
              <Line type="monotone" dataKey="value" stroke={chartData.lines[0].color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="px-4 lg:px-6 py-4 flex gap-2 border-t border-white/10">
        {INTERVALS.map(int => (
          <button
            key={int}
            onClick={() => setInterval(int)}
            onMouseEnter={() => fetchData(marketIds, int)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              interval === int ? "bg-[#4b6ea9] text-white" : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
          >
            {int}
          </button>
        ))}
      </div>

      {!hideOutcomes && isMulti && markets.length > 0 && (
        <div className="border-t border-gray-700 lg:border-[#e6ddcb] lg:px-6 lg:py-4">
          {/* Mobile: Edge-to-edge layout */}
          <div className="lg:hidden">
            {sortedMarkets.map((m, i) => {
              const opt = m.options?.find(o => o.side === "yes") || m.options?.[0]
              const p = opt?.probability_bps != null ? opt.probability_bps / 100 : 0
              const pDisp = p > 0 && p < 1 ? "<1" : Math.round(p)
              const yPrice = opt?.probability_bps != null ? `${(opt.probability_bps / 100).toFixed(1)}¢` : "—"
              const nPrice = opt?.probability_bps != null ? `${((10000 - opt.probability_bps) / 100).toFixed(1)}¢` : "—"

              return (
                <div key={m.id} className="px-4 py-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="text-white font-medium text-base">{m.bucket_label || m.title}</div>
                      <div className="text-gray-400 text-xs mt-1">
                        ${(m.volume_24h || 0).toLocaleString()} Vol.
                      </div>
                    </div>
                    <span className="text-white font-bold text-2xl ml-3">{pDisp}%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onSelectMarket?.(m, "yes")}
                      className="py-3 text-sm font-semibold rounded-lg transition-colors bg-emerald-700 hover:bg-emerald-600 text-white"
                    >
                      Buy Yes {yPrice}
                    </button>
                    <button
                      onClick={() => onSelectMarket?.(m, "no")}
                      className="py-3 text-sm font-semibold rounded-lg transition-colors bg-red-700 hover:bg-red-600 text-white"
                    >
                      Buy No {nPrice}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop: Table layout */}
          <div className="hidden lg:block">
            <div className="flex items-center justify-between mb-4 text-sm font-semibold text-white uppercase">
              <span>OUTCOME</span>
              <span>CHANCE</span>
            </div>
            <div className="space-y-3">
              {sortedMarkets.map((m, i) => {
                const opt = m.options?.find(o => o.side === "yes") || m.options?.[0]
                const p = opt?.probability_bps != null ? opt.probability_bps / 100 : 0
                const pDisp = p > 0 && p < 1 ? "<1" : Math.round(p)
                const yPrice = opt?.probability_bps != null ? `${(opt.probability_bps / 100).toFixed(1)}¢` : "—"
                const nPrice = opt?.probability_bps != null ? `${((10000 - opt.probability_bps) / 100).toFixed(1)}¢` : "—"
                const isSelected = m.id === selectedOptionId
                const isYesSelected = isSelected && selectedAction === "yes"
                const isNoSelected = isSelected && selectedAction === "no"

                return (
                  <div key={m.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3 flex-1">
                      {i < COLORS.length && <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i] }} />}
                      <span className="text-white font-medium">{m.bucket_label || m.title}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-white font-bold text-lg w-16 text-right">{pDisp}%</span>
                      <button
                        onClick={() => onSelectMarket?.(m, "yes")}
                        className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                          isYesSelected ? "bg-emerald-700 text-white shadow-sm" : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        }`}
                      >
                        Yes {yPrice}
                      </button>
                      <button
                        onClick={() => onSelectMarket?.(m, "no")}
                        className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                          isNoSelected ? "bg-red-700 text-white shadow-sm" : "bg-red-100 text-red-800 hover:bg-red-200"
                        }`}
                      >
                        No {nPrice}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
