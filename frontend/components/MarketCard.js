"use client"

import Link from "next/link"
import { Card } from "@/components/ui/card"

export default function MarketCard({ market }) {
  const outcomeNames = (market.outcomes || []).map((o) => String(o.name || "").trim().toLowerCase())
  const isBinaryYesNo = outcomeNames.length === 2 && outcomeNames.includes("yes") && outcomeNames.includes("no")
  
  return (
    <Link href={`/market/${market.id}`} className="block h-full">
      <Card className="p-0 bg-transparent border-0 shadow-none h-full">
        <div className="vintage-card-shell group h-full">
          <div className="vintage-card-frame h-full">
            <div className="vintage-card-panel h-full">
              {/* Header with badge and title strip */}
              <div className="vintage-card-header">
                <div className="badge-plaque">
                  <span className="badge-rivet" />
                  <span className="text-lg leading-none">{market.image}</span>
                  <span className="badge-rivet" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3
                    className="text-[15px] leading-tight font-semibold text-[#F3E1B6] drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)] line-clamp-2"
                    style={{ fontFamily: 'Google Sans, sans-serif' }}
                  >
                    {market.title}
                  </h3>
                </div>
              </div>

              {/* Body */}
              <div className="vintage-card-body">
                {isBinaryYesNo ? (
                  <div className="flex gap-3 mt-1">
                    <button className="chip-button yes">Yes</button>
                    <button className="chip-button no">No</button>
                  </div>
                ) : (
                  <div className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    {(market.outcomes || []).map((outcome, idx) => (
                      <div key={idx} className="outcome-row">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-[#F3E1B6] text-sm truncate">{outcome.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[#F2C35B] font-semibold text-sm w-12 text-right drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]">
                            {outcome.probability}%
                          </span>
                          <button className="chip-button yes small w-14">Yes</button>
                          <button className="chip-button no small w-14">No</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between text-[11px] text-[#F3E1B6] pt-2 vintage-divider">
                  <span className="tracking-wide">
                    {market.volume} Vol. 🔄
                  </span>
                  <div className="flex gap-2 text-[#F2C35B]">
                    <button className="hover:brightness-110 transition-transform hover:scale-105">🎁</button>
                    <button className="hover:brightness-110 transition-transform hover:scale-105">🔖</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}
