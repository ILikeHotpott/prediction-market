"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import useFinancePriceStream from "@/hooks/useFinancePriceStream"

const MAX_POINTS = 900
const DISPLAY_WINDOW_MS = 180000
const TIME_SCALE = 4
const CHART_PADDING = { top: 12, right: 64, bottom: 26, left: 8 }

function formatCountdown(ms) {
  if (ms <= 0) return "00:00"
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function FlipPrice({ value }) {
  const [display, setDisplay] = useState("")
  const [flipKey, setFlipKey] = useState(0)

  useEffect(() => {
    if (value == null) return
    const next = Number(value).toFixed(2)
    if (next !== display) {
      setDisplay(next)
      setFlipKey((k) => k + 1)
    }
  }, [value, display])

  if (!display) return <span className="finance-price">--</span>

  return (
    <span key={flipKey} className="finance-price finance-price-flip">
      {display}
    </span>
  )
}

export default function FinanceMarketChart({ finance, serverTime, nextEventId }) {
  const symbol = finance?.asset_symbol
  const titleText = useMemo(() => {
    const name = finance?.asset_name || symbol
    return name ? `${name} Up or Down` : "Up or Down"
  }, [finance?.asset_name, symbol])

  const windowLabel = useMemo(() => {
    if (!finance?.window_start || !finance?.window_end) return ""
    const start = new Date(finance.window_start)
    const end = new Date(finance.window_end)
    const date = new Intl.DateTimeFormat([], { month: "long", day: "numeric" }).format(start)
    const timeFmt = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" })
    const startTime = timeFmt.format(start)
    const endTime = timeFmt.format(end)
    const tzPart = new Intl.DateTimeFormat([], { timeZoneName: "short" })
      .formatToParts(end)
      .find((p) => p.type === "timeZoneName")
    const tz = tzPart?.value ? ` ${tzPart.value}` : ""
    return `${date}, ${startTime}-${endTime}${tz}`
  }, [finance?.window_start, finance?.window_end])
  const { price, timestamp, history } = useFinancePriceStream(symbol)
  const rawPointsRef = useRef([])
  const [remaining, setRemaining] = useState(null)
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 })
  const baselineRef = useRef(null)
  const rafRef = useRef(null)
  const startIndexRef = useRef(0)
  const labelRef = useRef({ start: "", end: "", lastUpdate: 0 })
  const offsetRef = useRef(0)
  const lastPriceRef = useRef(null)
  const targetPriceRef = useRef(null)
  const smoothPriceRef = useRef(null)
  const lastTimeRef = useRef(null)
  const lastRawTimeRef = useRef(null)

  useEffect(() => {
    if (!serverTime) return
    const serverMs = new Date(serverTime).getTime()
    offsetRef.current = serverMs - Date.now()
  }, [serverTime])

  useEffect(() => {
    rawPointsRef.current = []
    startIndexRef.current = 0
  }, [symbol])

  useEffect(() => {
    const fallback = finance?.prev_close_price
    if (fallback == null) return
    const base = Number(fallback)
    const now = Date.now()
    lastPriceRef.current = base
    targetPriceRef.current = base
    smoothPriceRef.current = base
    lastTimeRef.current = now
    lastRawTimeRef.current = now
    rawPointsRef.current = [
      { time: now - 500, price: base },
      { time: now, price: base },
    ]
    startIndexRef.current = 0
  }, [finance?.prev_close_price, symbol])
  
  useEffect(() => {
    baselineRef.current =
      finance?.prev_close_price != null ? Number(finance.prev_close_price) : null
  }, [finance?.prev_close_price])

  useEffect(() => {
    if (!history || !history.length) return
    const mapped = history
      .map((p) => ({
        time: new Date(p.ts).getTime(),
        price: Number(p.price),
      }))
      .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.price))
    if (!mapped.length) return
    mapped.sort((a, b) => a.time - b.time)
    const trimmed = mapped.slice(-MAX_POINTS)
    rawPointsRef.current = trimmed
    startIndexRef.current = 0
    const last = trimmed[trimmed.length - 1]
    lastPriceRef.current = last.price
    targetPriceRef.current = last.price
    smoothPriceRef.current = last.price
    lastTimeRef.current = last.time
    lastRawTimeRef.current = last.time
  }, [history, symbol])

  useEffect(() => {
    if (!finance?.window_end) return
    const timer = setInterval(() => {
      const now = Date.now() + offsetRef.current
      const end = new Date(finance.window_end).getTime()
      setRemaining(end - now)
    }, 500)
    return () => clearInterval(timer)
  }, [finance?.window_end])

  const showNext = nextEventId && remaining != null && remaining <= 0

  useEffect(() => {
    if (price == null) return
    const nextPrice = Number(price)
    if (Number.isFinite(nextPrice)) {
      lastPriceRef.current = nextPrice
      targetPriceRef.current = nextPrice
    }
  }, [price, timestamp])

  useEffect(() => {
    const timer = setInterval(() => {
      const fallback = finance?.prev_close_price
      const target = targetPriceRef.current ?? (fallback != null ? Number(fallback) : null)
      if (target == null || Number.isNaN(target)) return
      const now = Date.now() + offsetRef.current
      const lastTs = lastRawTimeRef.current
      if (lastTs != null && now <= lastTs) return
      lastRawTimeRef.current = now
      const next = rawPointsRef.current
      next.push({ time: now, price: target })
      if (next.length > MAX_POINTS) {
        next.splice(0, next.length - MAX_POINTS)
        startIndexRef.current = Math.max(0, startIndexRef.current - 1)
      }
    }, 500)
    return () => clearInterval(timer)
  }, [finance?.prev_close_price])

  useEffect(() => {
    const drawSmoothLine = (ctx, pts) => {
      if (!pts.length) return
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length - 1; i += 1) {
        const midX = (pts[i].x + pts[i + 1].x) / 2
        const midY = (pts[i].y + pts[i + 1].y) / 2
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY)
      }
      const last = pts[pts.length - 1]
      ctx.lineTo(last.x, last.y)
      ctx.stroke()
    }

    const render = () => {
      const canvas = canvasRef.current
      const { width, height } = sizeRef.current
      if (!canvas || width === 0 || height === 0) {
        rafRef.current = requestAnimationFrame(render)
        return
      }

      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const now = Date.now() + offsetRef.current
      const basePoints = rawPointsRef.current
      const endTime = now
      const windowMs = DISPLAY_WINDOW_MS / TIME_SCALE
      const startTime = endTime - windowMs
      let startIndex = startIndexRef.current
      if (startIndex > basePoints.length) startIndex = 0
      while (startIndex < basePoints.length && basePoints[startIndex].time < startTime) {
        startIndex += 1
      }
      startIndexRef.current = startIndex

      const target = targetPriceRef.current
      if (target != null && !Number.isNaN(target)) {
        if (smoothPriceRef.current == null) smoothPriceRef.current = target
        const alpha = 0.12
        smoothPriceRef.current =
          smoothPriceRef.current + alpha * (target - smoothPriceRef.current)
      }
      const smoothPrice = smoothPriceRef.current
      const currentPoint =
        smoothPrice != null && Number.isFinite(smoothPrice)
          ? { time: now, price: smoothPrice }
          : null

      let min = Infinity
      let max = -Infinity
      for (let i = startIndex; i < basePoints.length; i += 1) {
        const point = basePoints[i]
        if (point.time < startTime) continue
        const value = point.price
        if (value < min) min = value
        if (value > max) max = value
      }
      if (currentPoint) {
        if (currentPoint.price < min) min = currentPoint.price
        if (currentPoint.price > max) max = currentPoint.price
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        rafRef.current = requestAnimationFrame(render)
        return
      }

      const pad = Math.max((max - min) * 0.15, 0.1)
      const minY = min - pad
      const maxY = max + pad

      const plotWidth = width - CHART_PADDING.left - CHART_PADDING.right
      const plotHeight = height - CHART_PADDING.top - CHART_PADDING.bottom
      const scaleX = (t) =>
        CHART_PADDING.left + ((t - startTime) / windowMs) * plotWidth
      const scaleY = (p) =>
        CHART_PADDING.top + (1 - (p - minY) / (maxY - minY || 1)) * plotHeight

      ctx.clearRect(0, 0, width, height)

      const baseline = baselineRef.current
      if (baseline != null && Number.isFinite(baseline)) {
        const y = scaleY(baseline)
        ctx.save()
        ctx.setLineDash([6, 6])
        ctx.strokeStyle = "rgba(255,255,255,0.25)"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(CHART_PADDING.left, y)
        ctx.lineTo(width - CHART_PADDING.right, y)
        ctx.stroke()
        ctx.restore()
      }

      const linePoints = []
      for (let i = startIndex; i < basePoints.length; i += 1) {
        const point = basePoints[i]
        if (point.time < startTime) continue
        const x = Math.min(
          width - CHART_PADDING.right,
          Math.max(CHART_PADDING.left, scaleX(point.time))
        )
        linePoints.push({ x, y: scaleY(point.price) })
      }
      if (currentPoint) {
        linePoints.push({
          x: Math.min(
            width - CHART_PADDING.right,
            Math.max(CHART_PADDING.left, scaleX(currentPoint.time))
          ),
          y: scaleY(currentPoint.price),
        })
      }
      if (!linePoints.length) {
        rafRef.current = requestAnimationFrame(render)
        return
      }

      ctx.strokeStyle = "#f2c35b"
      ctx.lineWidth = 2.5
      ctx.lineJoin = "round"
      ctx.lineCap = "round"
      drawSmoothLine(ctx, linePoints)

      const last = linePoints[linePoints.length - 1]
      ctx.fillStyle = "#f2c35b"
      ctx.beginPath()
      ctx.arc(last.x, last.y, 4, 0, Math.PI * 2)
      ctx.fill()

      const tickColor = "rgba(255,255,255,0.6)"
      ctx.fillStyle = tickColor
      ctx.font = '12px "Noto Sans", sans-serif'
      ctx.textAlign = "right"
      ctx.textBaseline = "middle"
      const mid = (minY + maxY) / 2
      const yTicks = [minY, mid, maxY].map((v) => Number(v.toFixed(2)))
      yTicks.forEach((val) => {
        const y = scaleY(val)
        ctx.fillText(val.toFixed(2), width - 6, y)
      })

      if (now - labelRef.current.lastUpdate > 1000) {
        labelRef.current = {
          start: new Date(startTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          end: new Date(endTime).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          lastUpdate: now,
        }
      }

      ctx.textAlign = "left"
      ctx.textBaseline = "top"
      ctx.fillText(labelRef.current.start, CHART_PADDING.left, height - CHART_PADDING.bottom + 6)
      ctx.textAlign = "right"
      ctx.fillText(labelRef.current.end, width - CHART_PADDING.right, height - CHART_PADDING.bottom + 6)

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [finance?.prev_close_price, symbol])

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const ctx = canvas.getContext("2d")
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sizeRef.current = { width, height, dpr }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const displayPrice = price != null ? price : finance?.prev_close_price
  const baseline = finance?.prev_close_price

  return (
    <div className="bg-background rounded-2xl p-4 md:p-6 md:mt-4">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-3">
            {finance?.image_url && (
              <img
                src={finance.image_url}
                alt={finance.asset_name || symbol || "Asset"}
                className="w-8 h-8 md:w-9 md:h-9 object-contain"
              />
            )}
            <span className="text-2xl md:text-3xl font-semibold text-white">
              {titleText}
            </span>
          </div>
          {windowLabel && (
            <div className="text-xs text-white/50 mt-1">{windowLabel}</div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-baseline gap-6 mt-3">
            {baseline != null && (
              <div className="flex flex-col leading-none">
                <span className="text-xs uppercase tracking-[0.18em] text-white/40">
                  Price to beat
                </span>
                <span className="text-3xl font-bold text-white/50">
                  {Number(baseline).toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex flex-col leading-none">
              <span className="text-xs uppercase tracking-[0.18em] text-white/50">
                Current price
              </span>
              <span className="text-3xl font-bold text-white">
                <FlipPrice value={displayPrice} />
              </span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">Countdown</div>
          <div className="text-2xl font-semibold text-[#f2c35b] mt-1">
            {remaining == null ? "--" : formatCountdown(remaining)}
          </div>
        </div>
      </div>

      <div ref={containerRef} className="relative h-56 md:h-64 bg-background">
        <canvas ref={canvasRef} className="w-full h-full bg-background" />
      </div>

      {showNext && (
        <div className="mt-4 flex justify-end">
          <Link
            href={`/market/${nextEventId}`}
            className="px-4 py-2 rounded-lg bg-[#f2c35b] text-[#1f2b24] font-semibold shadow-[0_4px_0_rgba(0,0,0,0.15)]"
          >
            Next round {"->"}
          </Link>
        </div>
      )}
    </div>
  )
}
