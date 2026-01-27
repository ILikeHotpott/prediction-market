"use client"

import { useEffect, useRef, useState } from "react"

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
const wsBase = backendBase.replace(/^http/, "ws")
const CACHE_TTL = 15 * 1000

function getCachedHistory(symbol) {
  if (typeof window === "undefined" || !symbol) return null
  try {
    const raw = localStorage.getItem(`finance_history_${symbol}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.points || !parsed?.timestamp) return null
    if (Date.now() - parsed.timestamp > CACHE_TTL) return null
    return parsed.points
  } catch {
    return null
  }
}

function setCachedHistory(symbol, points) {
  if (typeof window === "undefined" || !symbol) return
  try {
    localStorage.setItem(
      `finance_history_${symbol}`,
      JSON.stringify({ points, timestamp: Date.now() })
    )
  } catch {}
}

export default function useFinancePriceStream(symbol) {
  const [price, setPrice] = useState(null)
  const [timestamp, setTimestamp] = useState(null)
  const [history, setHistory] = useState([])
  const wsRef = useRef(null)
  const reconnectRef = useRef(null)
  const attemptsRef = useRef(0)

  useEffect(() => {
    if (!symbol) return
    const cached = getCachedHistory(symbol)
    if (cached) setHistory(cached)

    const controller = new AbortController()
    fetch(`${backendBase}/api/finance/series/?symbol=${encodeURIComponent(symbol)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.points && Array.isArray(data.points)) {
          setHistory(data.points)
          setCachedHistory(symbol, data.points)
        }
        if (data?.latest?.price != null) {
          setPrice(data.latest.price)
          setTimestamp(data.latest.ts)
        }
      })
      .catch(() => {})

    function connect() {
      const ws = new WebSocket(`${wsBase}/ws/finance/price/`)
      wsRef.current = ws

      ws.onopen = () => {
        attemptsRef.current = 0
        ws.send(JSON.stringify({ action: "subscribe", symbol }))
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === "history" && data.symbol === symbol) {
            setHistory(Array.isArray(data.points) ? data.points : [])
            setCachedHistory(symbol, Array.isArray(data.points) ? data.points : [])
            return
          }
          if (data.type === "price" && data.symbol === symbol) {
            setPrice(data.price)
            setTimestamp(data.ts)
          }
        } catch {}
      }

      ws.onclose = () => {
        const attempt = Math.min(attemptsRef.current + 1, 6)
        attemptsRef.current = attempt
        const delay = Math.min(1000 * 2 ** attempt, 15000)
        reconnectRef.current = setTimeout(connect, delay)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      controller.abort()
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [symbol])

  return { price, timestamp, history }
}
