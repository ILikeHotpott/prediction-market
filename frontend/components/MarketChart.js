"use client"

import { useEffect, useMemo, useState, useRef, useCallback } from "react"
import { createChart, ColorType, LineSeries, LineType } from "lightweight-charts"

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
  const pollRef = useRef(null)
  const chartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef([])

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

      // Poll every 2 seconds for 1M, every 5 seconds for others
      const pollInterval = interval === "1M" ? 2000 : 5000
      pollRef.current = window.setInterval(fetchSeriesData, pollInterval)
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
      }
    }
  }, [effectiveEventId, interval, fetchSeriesData])

  // Build chart data
  const chartData = useMemo(() => {
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
      return markets.map((m, idx) => {
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
    } else {
      const yesOption = (market?.options || []).find((o) => o.side === "yes") || market?.options?.[0]
      const optionId = yesOption?.id?.toString()
      const rawPoints = seriesData[optionId] || []
      const currentProb = yesOption?.probability_bps ? yesOption.probability_bps / 100 : null
      const points = processPoints(rawPoints, currentProb)
      return [{
        id: market?.id,
        optionId,
        label: "Yes",
        color: COLORS[0],
        points,
        currentProb,
        option: yesOption,
      }]
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
      timeScale: {
        borderColor: "#e6ddcb",
        timeVisible: true,
        secondsVisible: interval === "1M",
      },
      crosshair: {
        mode: 1,
        vertLine: { color: "#4b6ea9", width: 1, style: 2 },
        horzLine: { color: "#4b6ea9", width: 1, style: 2 },
      },
    })

    chartRef.current = chart

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
          <h2 className="text-xl font-bold text-slate-900">{eventTitle || market?.title}</h2>
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
          <div className="absolute inset-0 flex items-center justify-center bg-[#f9f6ee]/80 z-10">
            <div className="text-slate-500">Loading...</div>
          </div>
        )}
        <div ref={chartContainerRef} />
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
      {!hideOutcomes && isMultiLine && markets.length > 0 && (
        <div className="border-t border-[#e6ddcb] px-6 py-4">
          <div className="flex items-center justify-between mb-3 text-xs text-slate-500 uppercase tracking-wider">
            <span>Outcome</span>
            <span>Chance</span>
          </div>

          <div className="space-y-2">
            {markets.map((m, idx) => {
              const yesOption = (m.options || []).find((o) => o.side === "yes") || m.options?.[0]
              const probability = yesOption?.probability_bps != null ? Math.round(yesOption.probability_bps / 100) : 0
              const yesPrice = yesOption?.probability_bps != null ? `${(yesOption.probability_bps / 100).toFixed(1)}¢` : "—"
              const noPrice = yesOption?.probability_bps != null ? `${((10000 - yesOption.probability_bps) / 100).toFixed(1)}¢` : "—"
              const isSelected = normalizeId(m.id) === normalizeId(selectedOptionId)
              const yesActive = isSelected && selectedAction === "yes"
              const noActive = isSelected && selectedAction === "no"

              return (
                <div key={m.id} className="flex items-center justify-between py-2 border-b border-[#e6ddcb] last:border-0">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                    />
                    <span className="text-slate-800 font-medium">{m.bucket_label || m.title}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-800 font-semibold text-lg w-14 text-right">{probability}%</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onSelectMarket?.(m, "yes")}
                        className={`w-24 py-1.5 text-sm font-medium rounded transition-colors ${
                          yesActive
                            ? "bg-emerald-700 text-white"
                            : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        }`}
                      >
                        Yes {yesPrice}
                      </button>
                      <button
                        onClick={() => onSelectMarket?.(m, "no")}
                        className={`w-24 py-1.5 text-sm font-medium rounded transition-colors ${
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
