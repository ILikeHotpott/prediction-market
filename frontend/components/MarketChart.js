"use client"

import { useEffect, useMemo, useState, useRef, useCallback } from "react"
import { createChart, ColorType, LineSeries, LineType } from "lightweight-charts"
import { Skeleton } from "@/components/ui/skeleton"

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

const INTERVALS = [
  { key: "1M", label: "1M", hours: 1/60, seconds: 60 },
  { key: "1H", label: "1H", hours: 1, seconds: 3600 },
  { key: "4H", label: "4H", hours: 4, seconds: 14400 },
  { key: "1D", label: "1D", hours: 24, seconds: 86400 },
  { key: "1W", label: "1W", hours: 168, seconds: 604800 },
  { key: "ALL", label: "ALL", hours: null, seconds: null },
]

const COLORS = [
  "#ea580c", // orange
  "#2563eb", // blue
  "#ca8a04", // yellow
  "#16a34a", // green
  "#9333ea", // purple
  "#dc2626", // red
]

const normalizeId = (id) => (id != null ? String(id) : null)

export default function MarketChart({
  market,
  eventId,
  eventTitle,
  coverUrl,
  eventType = "standalone",
  markets = [],
  hideOutcomes = false,
  onSelectOutcome,
  onSelectMarket,
  selectedOptionId,
  selectedAction,
}) {
  const [interval, setIntervalState] = useState("1H")
  const [seriesData, setSeriesData] = useState({})
  const [loading, setLoading] = useState(false)
  const [tooltips, setTooltips] = useState([])
  const pollRef = useRef(null)
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef([])
  const chartDataRef = useRef([])

  const isMultiLine = eventType === "exclusive" || eventType === "independent"
  const effectiveEventId = eventId || market?.event_id

  // Fetch series data via HTTP polling (more reliable than WebSocket)
  const fetchSeriesData = useCallback(async () => {
    if (!effectiveEventId) return

    try {
      const marketIds = isMultiLine && markets.length > 0
        ? markets.map((m) => m.id)
        : market?.id ? [market.id] : []

      if (!marketIds.length) return

      const params = new URLSearchParams({ interval })
      marketIds.forEach((id) => params.append("market_ids", id))

      const res = await fetch(`${backendBase}/api/markets/series/?${params}`, {
        cache: "no-store",
      })
      if (res.ok) {
        const data = await res.json()
        setSeriesData(data.series || {})
      }
    } catch (e) {
      console.error("Failed to fetch series data:", e)
    } finally {
      setLoading(false)
    }
  }, [effectiveEventId, interval, isMultiLine, markets, market])

  // Initial fetch and polling
  useEffect(() => {
    if (effectiveEventId) {
      setLoading(true)
      fetchSeriesData()

      // Poll every 10 seconds for 1M, every 30 seconds for others (reduce egress)
      const pollInterval = interval === "1M" ? 10000 : 30000
      pollRef.current = window.setInterval(fetchSeriesData, pollInterval)
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
      }
    }
  }, [effectiveEventId, interval, fetchSeriesData])

  // Build chart data - sorted by probability, top 4 for chart
  const { chartData, sortedMarkets } = useMemo(() => {
    const processPoints = (points, currentProb) => {
      if (!points.length) {
        if (currentProb != null) {
          return [{ time: Math.floor(Date.now() / 1000), value: currentProb }]
        }
        return []
      }

      const byBucket = new Map()
      for (const p of points) {
        const time = Math.floor(new Date(p.bucket_start).getTime() / 1000)
        byBucket.set(time, { time, value: p.value_bps / 100 })
      }

      return Array.from(byBucket.values()).sort((a, b) => a.time - b.time)
    }

    if (isMultiLine && markets.length > 0) {
      // Sort markets by probability (high to low)
      const sorted = [...markets].sort((a, b) => {
        const aProb = (a.options || []).find((o) => o.side === "yes")?.probability_bps || 0
        const bProb = (b.options || []).find((o) => o.side === "yes")?.probability_bps || 0
        return bProb - aProb
      })

      const allData = sorted.map((m, idx) => {
        const yesOption = (m.options || []).find((o) => o.side === "yes") || m.options?.[0]
        const optionId = yesOption?.id?.toString()
        const rawPoints = seriesData[optionId] || []
        const currentProb = yesOption?.probability_bps ? yesOption.probability_bps / 100 : null
        const points = processPoints(rawPoints, currentProb)
        return {
          id: m.id,
          optionId,
          label: m.bucket_label || m.title,
          color: COLORS[idx % COLORS.length],
          points,
          currentProb,
          option: yesOption,
        }
      })

      // Only show top 4 in chart
      return { chartData: allData.slice(0, 4), sortedMarkets: sorted }
    } else {
      const yesOption = (market?.options || []).find((o) => o.side === "yes") || market?.options?.[0]
      const optionId = yesOption?.id?.toString()
      const rawPoints = seriesData[optionId] || []
      const currentProb = yesOption?.probability_bps ? yesOption.probability_bps / 100 : null
      const points = processPoints(rawPoints, currentProb)
      return {
        chartData: [{
          id: market?.id,
          optionId,
          label: "Yes",
          color: COLORS[0],
          points,
          currentProb,
          option: yesOption,
        }],
        sortedMarkets: markets,
      }
    }
  }, [market, markets, seriesData, isMultiLine])

  // Calculate price change
  const priceChange = useMemo(() => {
    if (!chartData.length || !chartData[0].points.length) return null
    const line = chartData[0]
    const sorted = [...line.points].sort((a, b) => a.time - b.time)
    if (sorted.length < 2) return null
    return sorted[sorted.length - 1].value - sorted[0].value
  }, [chartData])

  // Initialize and update TradingView Lightweight Chart
  useEffect(() => {
    if (!chartContainerRef.current) return

    // Configure time scale based on interval
    const getTimeScaleOptions = () => {
      const base = { borderColor: "#e6ddcb", fixLeftEdge: true, fixRightEdge: true }
      if (interval === "1M") {
        return { ...base, timeVisible: true, secondsVisible: true, tickMarkFormatter: (time) => {
          const d = new Date(time * 1000)
          return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
        }}
      } else if (interval === "1H" || interval === "4H") {
        return { ...base, timeVisible: true, secondsVisible: false, tickMarkFormatter: (time) => {
          const d = new Date(time * 1000)
          return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
        }}
      } else if (interval === "1D") {
        return { ...base, timeVisible: true, secondsVisible: false, tickMarkFormatter: (time) => {
          const d = new Date(time * 1000)
          return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
        }}
      } else {
        // 1W, ALL - show month/day like "Jan 12"
        const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        return { ...base, timeVisible: false, secondsVisible: false, tickMarkFormatter: (time) => {
          const d = new Date(time * 1000)
          return `${MONTHS[d.getMonth()]} ${d.getDate()}`
        }}
      }
    }

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#f9f6ee" },
        textColor: "#64748b",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#e6ddcb", style: 1 },
        horzLines: { color: "#e6ddcb", style: 1 },
      },
      width: chartContainerRef.current.clientWidth,
      height: 280,
      rightPriceScale: {
        borderColor: "#e6ddcb",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: getTimeScaleOptions(),
      crosshair: {
        mode: 1,
        vertLine: { color: "#4b6ea9", width: 1, style: 2 },
        horzLine: { color: "#4b6ea9", width: 1, style: 2 },
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: true },
      handleScale: { mouseWheel: false, pinch: false },
    })

    chartRef.current = chart

    // Handle crosshair move for tooltips
    chart.subscribeCrosshairMove((param) => {
      if (!param.point || !param.seriesData.size) {
        setTooltips([])
        return
      }
      const newTooltips = []
      const containerRect = chartContainerRef.current?.getBoundingClientRect()
      if (!containerRect) return

      seriesRef.current.forEach((series, idx) => {
        const data = param.seriesData.get(series)
        if (data && chartDataRef.current[idx]) {
          const lineInfo = chartDataRef.current[idx]
          const coordinate = series.priceToCoordinate(data.value)
          if (coordinate !== null) {
            newTooltips.push({
              label: lineInfo.label,
              value: data.value,
              color: lineInfo.color,
              x: param.point.x,
              y: coordinate,
            })
          }
        }
      })
      setTooltips(newTooltips)
    })

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth })
      }
    }
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      chart.remove()
      chartRef.current = null
      seriesRef.current = []
    }
  }, [interval])

  // Update series data
  useEffect(() => {
    if (!chartRef.current) return

    // Update chartDataRef for tooltip access
    chartDataRef.current = chartData

    // Remove old series
    seriesRef.current.forEach((s) => {
      try { chartRef.current.removeSeries(s) } catch {}
    })
    seriesRef.current = []

    // Add new series for each line
    chartData.forEach((line) => {
      if (!line.points.length) return

      const series = chartRef.current.addSeries(LineSeries, {
        color: line.color,
        lineWidth: 2,
        lineType: LineType.Curved,
        priceFormat: { type: "custom", formatter: (p) => `${p.toFixed(1)}%` },
      })

      series.setData(line.points)
      seriesRef.current.push(series)
    })

    chartRef.current.timeScale().fitContent()
  }, [chartData])

  const currentProb = chartData[0]?.currentProb

  return (
    <div className="bg-[#f9f6ee] rounded-2xl border border-[#e6ddcb] shadow-md overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            {coverUrl && (
              <img
                src={coverUrl}
                alt=""
                className="w-18 h-18 rounded-md object-cover flex-shrink-0"
              />
            )}
            <h2 className="text-2xl font-bold text-slate-900">{eventTitle || market?.title}</h2>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            {market?.resolution_deadline && (
              <span className="flex items-center gap-1">
                <span>⏱</span>
                {new Date(market.resolution_deadline).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
          </div>
        </div>

        {/* Current probability */}
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold text-[#4b6ea9]">
            {currentProb != null ? `${currentProb.toFixed(0)}%` : "—"}
          </span>
          <span className="text-lg text-slate-500">chance</span>
          {priceChange != null && (
            <span className={`text-sm font-medium ${priceChange >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {priceChange >= 0 ? "▲" : "▼"} {Math.abs(priceChange).toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Legend for multi-line */}
      {isMultiLine && chartData.length > 1 && (
        <div className="px-6 pb-3 flex flex-wrap gap-4 text-sm">
          {chartData.map((line) => (
            <button
              key={line.id}
              onClick={() => onSelectMarket && onSelectMarket(markets.find((m) => m.id === line.id))}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: line.color }} />
              <span className="text-slate-700">{line.label}</span>
              {line.currentProb != null && (
                <span className="text-slate-500">({line.currentProb.toFixed(0)}%)</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="relative px-2">
        {loading && (
          <div className="absolute inset-0 bg-[#f9f6ee]/80 z-10 p-4">
            <Skeleton className="w-full h-full rounded-lg" />
          </div>
        )}
        <div ref={chartContainerRef} />
        {/* Tooltips */}
        {tooltips.map((tip, idx) => (
          <div
            key={idx}
            className="absolute pointer-events-none px-2 py-1 rounded text-sm font-medium text-white whitespace-nowrap z-20"
            style={{
              backgroundColor: tip.color,
              left: tip.x + 12,
              top: tip.y - 12,
              transform: "translateY(-50%)",
            }}
          >
            {tip.label} {tip.value.toFixed(1)}%
          </div>
        ))}
      </div>

      {/* Interval selector */}
      <div className="px-6 py-4 flex items-center justify-between border-t border-[#e6ddcb]">
        <div className="flex gap-1">
          {INTERVALS.map((int) => (
            <button
              key={int.key}
              onClick={() => setIntervalState(int.key)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                interval === int.key
                  ? "bg-[#4b6ea9] text-white"
                  : "text-slate-600 hover:text-slate-900 hover:bg-[#e6ddcb]"
              }`}
            >
              {int.label}
            </button>
          ))}
        </div>
      </div>

      {/* Outcome Table */}
      {!hideOutcomes && isMultiLine && sortedMarkets.length > 0 && (
        <div className="border-t border-[#e6ddcb] px-6 py-4">
          <div className="flex items-center justify-between mb-3 text-xs text-slate-500 uppercase tracking-wider">
            <span>Outcome</span>
            <span>Chance</span>
          </div>

          <div className="space-y-2">
            {sortedMarkets.map((m, idx) => {
              const yesOption = (m.options || []).find((o) => o.side === "yes") || m.options?.[0]
              const probability = yesOption?.probability_bps != null ? Math.round(yesOption.probability_bps / 100) : 0
              const yesPrice = yesOption?.probability_bps != null ? `${(yesOption.probability_bps / 100).toFixed(1)}¢` : "—"
              const noPrice = yesOption?.probability_bps != null ? `${((10000 - yesOption.probability_bps) / 100).toFixed(1)}¢` : "—"
              const isSelected = normalizeId(m.id) === normalizeId(selectedOptionId)
              const yesActive = isSelected && selectedAction === "yes"
              const noActive = isSelected && selectedAction === "no"
              // Only show color dot for top 4 (those in chart)
              const showColor = idx < 4

              return (
                <div key={m.id} className="flex items-center justify-between py-2 border-b border-[#e6ddcb] last:border-0">
                  <div className="flex items-center gap-3">
                    {showColor ? (
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      />
                    ) : (
                      <div className="w-2.5 h-2.5" />
                    )}
                    <span className="text-slate-800 font-medium text-lg">{m.bucket_label || m.title}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-800 font-semibold text-xl w-16 text-right">{probability}%</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onSelectMarket?.(m, "yes")}
                        className={`w-28 py-2 text-base font-medium rounded-lg transition-colors ${
                          yesActive
                            ? "bg-emerald-700 text-white"
                            : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        }`}
                      >
                        Yes {yesPrice}
                      </button>
                      <button
                        onClick={() => onSelectMarket?.(m, "no")}
                        className={`w-28 py-2 text-base font-medium rounded-lg transition-colors ${
                          noActive
                            ? "bg-red-700 text-white"
                            : "bg-red-100 text-red-700 hover:bg-red-200"
                        }`}
                      >
                        No {noPrice}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
