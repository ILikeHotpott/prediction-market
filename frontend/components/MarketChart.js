"use client"

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { mockChartData } from "@/lib/mockData"

const formatDate = (value) => {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

const normalizeId = (id) => (id != null ? String(id) : null)

export default function MarketChart({
  market,
  eventTitle,
  markets = [],
  hideOutcomes = false,
  onSelectOutcome,
  onSelectMarket,
  selectedOptionId,
  selectedAction,
}) {
  const title = eventTitle || market?.title || "Market"
  const volume = market?.volume_total || "—"
  const resolution = formatDate(market?.resolution_deadline)
  const outcomeMarkets = (markets || []).length ? markets : []
  const outcomes = outcomeMarkets.length
    ? outcomeMarkets.map((m) => {
        const yesOption =
          (m.options || []).find((o) => (o.side || "").toLowerCase() === "yes") ||
          (m.options || []).find((o) => String(o.title || "").toLowerCase() === "yes")
        const probability_bps = yesOption?.probability_bps
        return {
          id: m.id,
          title: m.bucket_label || m.title,
          probability_bps,
          probability: probability_bps != null ? Math.round(probability_bps / 100) : undefined,
          _market: m,
        }
      })
    : (market?.options || []).slice(0, 4)

  return (
    <div
      className="rounded-lg p-6 border border-[#2f4b3c]"
      style={{ backgroundColor: "var(--app-background)" }}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span>💰 {volume || "—"} Vol.</span>
            <span>📅 {resolution}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="p-2 hover:bg-white/10 rounded transition-colors">🔗</button>
          <button className="p-2 hover:bg-white/10 rounded transition-colors">🔖</button>
        </div>
      </div>

      {!hideOutcomes && (
        <div className="mb-4 flex gap-4 text-sm flex-wrap">
          {outcomes.map((o, idx) => {
            const palette = ["orange", "blue", "gray", "yellow"]
            const colors = {
              orange: "bg-orange-500",
              blue: "bg-blue-500",
              gray: "bg-gray-500",
              yellow: "bg-yellow-500",
            }
            const cls = colors[palette[idx % palette.length]] || "bg-blue-500"
            const probability = o.probability ?? (o.probability_bps != null ? Math.round(o.probability_bps / 100) : 0)
            return (
              <div key={o.id || idx} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${cls}`}></div>
                <span className="text-white">
                  {o.title} {probability}%
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div className="h-80 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={mockChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2f4b3c" />
            <XAxis dataKey="date" stroke="#dbe8de" />
            <YAxis stroke="#dbe8de" />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--app-background)",
                border: "1px solid #2f4b3c",
                borderRadius: "8px",
                color: "#fff",
              }}
            />
            <Line type="monotone" dataKey="zohran" stroke="#f97316" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="andrew" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="curtis" stroke="#6b7280" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="eric" stroke="#eab308" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-2 mb-6">
        <button className="px-3 py-1 bg-white/10 hover:bg-white/15 text-white text-sm rounded transition-colors">1H</button>
        <button className="px-3 py-1 bg-white/10 hover:bg-white/15 text-white text-sm rounded transition-colors">6H</button>
        <button className="px-3 py-1 bg-white/10 hover:bg-white/15 text-white text-sm rounded transition-colors">1D</button>
        <button className="px-3 py-1 bg-white/10 hover:bg-white/15 text-white text-sm rounded transition-colors">1W</button>
        <button className="px-3 py-1 bg-white/10 hover:bg-white/15 text-white text-sm rounded transition-colors">1M</button>
        <button className="px-3 py-1 bg-white/20 hover:bg-white/25 text-white text-sm rounded transition-colors">ALL</button>
      </div>

      {/* Outcome Table */}
      {!hideOutcomes && (
        <div className="border-t border-[#2f4b3c] pt-4">
          <div className="flex items-center justify-between mb-4 text-sm text-gray-400">
            <span>OUTCOME</span>
            <span>% CHANCE 🔄</span>
          </div>
          
          <div className="space-y-3">
            {outcomes.map((o, idx) => {
              const probability = o.probability ?? (o.probability_bps != null ? Math.round(o.probability_bps / 100) : 0)
              const yesPrice = o.probability_bps != null ? `${(o.probability_bps / 100).toFixed(1)}¢` : "—"
              const noPrice =
                o.probability_bps != null
                  ? `${((10000 - o.probability_bps) / 100).toFixed(1)}¢`
                  : "—"
              const isMarketRow = Boolean(o._market)
              return (
                <OutcomeRow
                  key={o.id || idx}
                  id={o.id}
                  name={o.title}
                  avatar="📊"
                  volume="—"
                  probability={probability}
                  change={null}
                  yesPrice={yesPrice}
                  noPrice={noPrice}
                  selectedOptionId={selectedOptionId}
                  selectedAction={selectedAction}
                  onSelect={(action) =>
                    isMarketRow && onSelectMarket
                      ? onSelectMarket(o._market, action)
                      : onSelectOutcome?.(o, action)
                  }
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function OutcomeRow({
  id,
  name,
  avatar,
  volume,
  probability,
  change,
  yesPrice,
  noPrice,
  onSelect,
  selectedOptionId,
  selectedAction,
}) {
  const isSelected = normalizeId(id) === normalizeId(selectedOptionId)
  const yesActive = isSelected && selectedAction === "yes"
  const noActive = isSelected && selectedAction === "no"

  return (
    <div className="flex items-center justify-between py-3 border-b border-[#2f4b3c] last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xl">
          {avatar}
        </div>
        <div>
          <div className="text-white font-medium">{name}</div>
          <div className="text-xs text-gray-400">{volume} Vol. ℹ️</div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-lg">{probability}%</span>
          {change && (
            <span className="text-green-400 text-sm">▲{change}%</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onSelect?.("yes")}
            className={`w-[180px] py-2 font-medium rounded transition-colors text-center ${
              yesActive
                ? "bg-[#20af64] text-white shadow-[0_8px_20px_rgba(22,163,74,0.35)]"
                : "bg-[#3B5355] hover:bg-[#5DA96E] text-[#6BC57B] hover:text-white"
            }`}
          >
            Buy Yes {yesPrice}
          </button>
          <button
            onClick={() => onSelect?.("no")}
            className={`w-[180px] py-2 font-medium rounded transition-colors text-center ${
              noActive
                ? "bg-[#2b3544] text-white"
                : "bg-[#4A414D] hover:bg-[#D04740] text-[#D04740] hover:text-white"
            }`}
          >
            Buy No {noPrice}
          </button>
        </div>
      </div>
    </div>
  )
}

