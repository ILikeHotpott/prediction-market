"use client"

import Link from "next/link"
import { memo, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts"

const clampProbability = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return undefined
  return Math.min(100, Math.max(0, Math.round(numeric)))
}

const getGaugeColors = (value) => {
  if (value < 20) {
    return { start: "#ef4444", end: "#fca5a5" }
  }
  if (value < 60) {
    return { start: "#f59e0b", end: "#fcd34d" }
  }
  return { start: "#22c55e", end: "#86efac" }
}

const MarketCard = memo(function MarketCard({ market }) {
  const outcomes = market.outcomes || []
  const outcomeNames = outcomes.map((o) => String(o.name || "").trim().toLowerCase())
  const yesOutcome = outcomes.find((o) => String(o.name || "").trim().toLowerCase() === "yes")
  const isBinaryYesNo = outcomeNames.length === 2 && outcomeNames.includes("yes") && outcomeNames.includes("no")
  const isStandalone = !market.group_rule || market.group_rule === "standalone"
  const showStandaloneBinary = isStandalone && isBinaryYesNo

  const cleanTitle = String(market.title || "").trim()
  const displayTitle = cleanTitle.length > 60 ? `${cleanTitle.slice(0, 60)}...` : cleanTitle

  const formatProb = (value) => {
    if (value == null || Number.isNaN(Number(value))) return "—"
    return `${Math.min(100, Math.max(0, Math.round(Number(value))))}%`
  }

  const chanceValue = clampProbability(
    market.chance ??
      yesOutcome?.probability ??
      (yesOutcome?.probability_bps != null ? yesOutcome.probability_bps / 100 : undefined)
  )

  const chartGradientId = useMemo(
    () => `chance-grad-${market.id || market.slug || Math.random().toString(36).slice(2)}`,
    [market.id, market.slug]
  )
  const chartTrackId = useMemo(
    () => `chance-track-${market.id || market.slug || Math.random().toString(36).slice(2)}`,
    [market.id, market.slug]
  )
  
  return (
    <Link href={`/market/${market.id}`} className="block h-full">
      <Card className={`market-card h-full ${showStandaloneBinary ? "market-card--standalone" : ""}`}>
        <div className={`market-card-header ${showStandaloneBinary ? "market-card-header--standalone" : ""}`}>
          <div className="market-card-header-main">
            <div className="market-card-badge">
              <span className="market-card-icon">{market.image}</span>
            </div>
            <h3
              className="market-card-title"
              style={{ fontFamily: 'Google Sans, sans-serif' }}
            >
              {displayTitle}
            </h3>
          </div>

          {showStandaloneBinary && chanceValue != null && (
            <div className="market-card-chance">
              <ChanceGauge
                value={chanceValue}
                formatProb={formatProb}
                gradientId={chartGradientId}
                trackId={chartTrackId}
              />
            </div>
          )}
        </div>

        <div className={`market-card-body ${showStandaloneBinary ? "market-card-body--standalone" : ""}`}>
          {showStandaloneBinary ? (
            <div className="market-card-actions">
              <button className="market-chip yes">Yes</button>
              <button className="market-chip no">No</button>
            </div>
          ) : (
            <div className="market-outcome-list scrollbar-thin scrollbar-thumb-slate-300/50 scrollbar-track-transparent">
              {outcomes.map((outcome, idx) => {
                const prob =
                  outcome.probability ??
                  (outcome.probability_bps != null ? Math.round(outcome.probability_bps / 100) : undefined)
                return (
                  <div key={idx} className="market-outcome">
                    <div className="market-outcome-main">
                      <span className="market-outcome-name">{outcome.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="market-outcome-prob">{formatProb(prob)}</span>
                        <div className="market-outcome-actions">
                          <button className="market-chip mini yes">Yes</button>
                          <button className="market-chip mini no">No</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="market-card-footer">
          <span className="market-volume">{market.volume} Vol. 🔄</span>
          <div className="market-footer-actions">
            <button className="market-footer-icon">🎁</button>
            <button className="market-footer-icon">🔖</button>
          </div>
        </div>
      </Card>
    </Link>
  )
})

function ChanceGauge({ value, formatProb, gradientId, trackId }) {
  const data = [{ name: "chance", value }]
  const fillColors = useMemo(() => getGaugeColors(value), [value])
  return (
    <div className="chance-gauge" aria-label="chance gauge">
      <div className="chance-gauge__chart">
        <RadialBarChart
          width={110}
          height={76}
          cx={55}
          cy={72}
          innerRadius={40}
          outerRadius={54}
          data={data}
          startAngle={180}
          endAngle={0}
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={fillColors.start} />
              <stop offset="100%" stopColor={fillColors.end} />
            </linearGradient>
            <linearGradient id={trackId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#e8e5dd" />
              <stop offset="100%" stopColor="#eae6db" />
            </linearGradient>
          </defs>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey="value"
            cornerRadius={12}
            background={{ fill: `url(#${trackId})` }}
            fill={`url(#${gradientId})`}
            clockWise
          />
        </RadialBarChart>
      </div>
      <div className="chance-gauge__value">
        <div className="chance-gauge__percent">{formatProb(value)}</div>
        <div className="chance-gauge__label">chance</div>
      </div>
    </div>
  )
}

export default MarketCard
