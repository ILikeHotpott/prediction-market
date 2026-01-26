"use client"

import Link from "next/link"
import { memo, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts"
import { useTranslations } from "next-intl"

const SUIT_SYMBOLS = ["♥", "♠", "♦", "♣"]
const SUIT_COLORS = {
  "♥": "rgba(220, 38, 38, 0.18)",  // 红桃 - 红色
  "♠": "rgba(30, 30, 30, 0.12)",   // 黑桃 - 黑色
  "♦": "rgba(220, 38, 38, 0.18)",  // 方块 - 红色
  "♣": "rgba(30, 30, 30, 0.12)",   // 梅花 - 黑色
}

const getRandomSuit = () => {
  return SUIT_SYMBOLS[Math.floor(Math.random() * 4)]
}

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

const MarketCard = memo(function MarketCard({ market, spinKey = 0, isWatched = false, onToggleWatchlist }) {
  const t = useTranslations("market")
  const outcomes = market.outcomes || []
  const outcomeNames = outcomes.map((o) => String(o.name || "").trim().toLowerCase())
  const yesOutcome = outcomes.find((o) => String(o.name || "").trim().toLowerCase() === "yes")
  const isBinaryYesNo = outcomeNames.length === 2 && outcomeNames.includes("yes") && outcomeNames.includes("no")
  const isStandalone = !market.group_rule || market.group_rule === "standalone"
  const isMatch = market.group_rule === "match"
  const isGrouped = !isStandalone
  const showStandaloneBinary = isStandalone && isBinaryYesNo

  // 每次 spinKey 变化时重新生成随机花色
  const suit = useMemo(() => getRandomSuit(), [spinKey])
  const suitColor = SUIT_COLORS[suit]

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

  // Match-specific rendering
  if (isMatch) {
    return (
      <Link href={`/market/${market.id}`} className="block">
        <Card className={`market-card market-card--match ${isGrouped ? "market-card--grouped" : ""}`}>
          <MatchCardContent
            market={market}
            outcomes={outcomes}
            formatProb={formatProb}
            isWatched={isWatched}
            onToggleWatchlist={onToggleWatchlist}
            volumeLabel={t("volume")}
          />
        </Card>
      </Link>
    )
  }

  return (
    <Link href={`/market/${market.id}`} className="block">
      <Card
        className={`market-card${showStandaloneBinary ? " market-card--standalone" : ""}${isGrouped ? " market-card--grouped" : ""}`}
      >
        {/* 左上角正方形图片 */}
        {market.image && market.image.startsWith("http") && (
          <div className="absolute top-3 left-3 pointer-events-none z-0">
            <img
              src={market.image}
              alt=""
              className="w-14 h-14 object-cover rounded-lg"
            />
          </div>
        )}

        {/* 花色背景 */}
        {/* <div
          className="market-card-suit-bg"
          style={{ color: suitColor }}
        >
          {suit}
        </div> */}

        <div className={`market-card-header ${showStandaloneBinary ? "market-card-header--standalone" : ""}`}>
          <div className="market-card-header-main">
            {market.image && market.image.startsWith("http") ? (
              <div className="w-12 flex-shrink-0" />
            ) : (
              <div className="market-card-badge flex-shrink-0">
                <span className="market-card-icon">{market.image || "📈"}</span>
              </div>
            )}
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
                chanceLabel={t("chance")}
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

        <MarketCardFooter
          market={market}
          volumeLabel={t("volume")}
          isWatched={isWatched}
          onToggleWatchlist={onToggleWatchlist}
        />
      </Card>
    </Link>
  )
})

function MatchCardContent({ market, outcomes, formatProb, isWatched, onToggleWatchlist, volumeLabel }) {
  const teamAName = market.team_a_name || outcomes[0]?.name || "Team A"
  const teamBName = market.team_b_name || outcomes[outcomes.length - 1]?.name || "Team B"
  const teamAImage = market.team_a_image_url
  const teamBImage = market.team_b_image_url
  const teamAColor = market.team_a_color || "#6c9b78"
  const teamBColor = market.team_b_color || "#c65a5a"

  // Get probabilities from outcomes
  const teamAOutcome = outcomes[0]
  const teamBOutcome = outcomes[outcomes.length - 1]

  const getProb = (outcome) => {
    if (!outcome) return null
    return outcome.probability ??
      (outcome.probability_bps != null ? Math.round(outcome.probability_bps / 100) : null)
  }

  const teamAProb = getProb(teamAOutcome)
  const teamBProb = getProb(teamBOutcome)

  return (
    <>
      {/* Match teams layout */}
      <div className="match-teams-container">
        {/* Team A Row */}
        <div className="match-team-row">
          <div className="match-team-info">
            <div className="match-team-avatar">
              {teamAImage ? (
                <img src={teamAImage} alt={teamAName} className="match-team-img" />
              ) : (
                <div className="match-team-placeholder" style={{ backgroundColor: teamAColor }}>
                  {teamAName.charAt(0)}
                </div>
              )}
            </div>
            <span className="match-team-name">{teamAName}</span>
          </div>
          <span className="match-team-prob">{formatProb(teamAProb)}</span>
        </div>

        {/* Team B Row */}
        <div className="match-team-row">
          <div className="match-team-info">
            <div className="match-team-avatar">
              {teamBImage ? (
                <img src={teamBImage} alt={teamBName} className="match-team-img" />
              ) : (
                <div className="match-team-placeholder" style={{ backgroundColor: teamBColor }}>
                  {teamBName.charAt(0)}
                </div>
              )}
            </div>
            <span className="match-team-name">{teamBName}</span>
          </div>
          <span className="match-team-prob">{formatProb(teamBProb)}</span>
        </div>
      </div>

      {/* Team buttons */}
      <div className="market-card-body market-card-body--standalone">
        <div className="market-card-actions">
          <button
            className="market-chip"
            style={{ backgroundColor: teamAColor, borderColor: teamAColor }}
          >
            {teamAName}
          </button>
          <button
            className="market-chip"
            style={{ backgroundColor: teamBColor, borderColor: teamBColor }}
          >
            {teamBName}
          </button>
        </div>
      </div>

      {/* Footer */}
      <MarketCardFooter
        market={market}
        volumeLabel={volumeLabel}
        isWatched={isWatched}
        onToggleWatchlist={onToggleWatchlist}
      />
    </>
  )
}

function ChanceGauge({ value, formatProb, gradientId, trackId, chanceLabel = "chance" }) {
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
        <div className="chance-gauge__label">{chanceLabel}</div>
      </div>
    </div>
  )
}

function MarketCardFooter({ market, volumeLabel, isWatched, onToggleWatchlist }) {
  return (
    <div className="market-card-footer">
      <div className="market-card-footer__content">
        <span className="market-volume">{market.volume} {volumeLabel}. </span>
        <div className="market-footer-actions">
          <button
            className="market-footer-icon"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggleWatchlist?.(market.id)
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={isWatched ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default MarketCard
