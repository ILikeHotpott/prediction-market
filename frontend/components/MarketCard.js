"use client"

import Link from "next/link"
import { Card } from "@/components/ui/card"

export default function MarketCard({ market }) {
  const outcomeNames = (market.outcomes || []).map((o) => String(o.name || "").trim().toLowerCase())
  const isBinaryYesNo = outcomeNames.length === 2 && outcomeNames.includes("yes") && outcomeNames.includes("no")
  
  return (
    <Link href={`/market/${market.id}`}>
      <Card className="bg-[#323F4F] border border-[#425264] hover:bg-[#3a4a5c] transition-all cursor-pointer overflow-hidden group aspect-[1.618/1] flex flex-col">
        <div className="p-3.5 flex flex-col h-full">
          {/* Header with Image and Title */}
          <div className="flex gap-2.5 mb-3">
            <div className="w-11 h-11 rounded-lg bg-gray-700 flex items-center justify-center text-xl flex-shrink-0">
              {market.image}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-medium text-[15px] leading-tight line-clamp-2 group-hover:text-blue-400 transition-colors">
                {market.title}
              </h3>
            </div>
          </div>

          {/* Outcomes */}
          {isBinaryYesNo ? (
            <div className="mt-auto mb-3">
              <div className="flex gap-2.5">
                <button className="flex-1 py-2.5 bg-[#3B5355] hover:bg-[#5DA96E] text-[#6BC57B] hover:text-white text-sm font-semibold rounded transition-colors text-center">
                  Yes
                </button>
                <button className="flex-1 py-2.5 bg-[#4A414D] hover:bg-[#D04740] text-[#D04740] hover:text-white text-sm font-semibold rounded transition-colors text-center">
                  No
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-2 flex-1 min-h-0">
              <div className="space-y-1.5 h-full overflow-y-auto pr-1">
                {(market.outcomes || []).map((outcome, idx) => (
                  <div key={idx} className="flex items-center justify-between hover:bg-gray-700/30 dark:hover:bg-gray-800/30 px-2.5 py-1.5 rounded transition-colors">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-gray-300 text-sm truncate">{outcome.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-white font-semibold text-sm w-11 text-right">{outcome.probability}%</span>
                    <button className="px-2.5 py-1 bg-[#3B5355] hover:bg-[#5DA96E] text-[#6BC57B] hover:text-white text-xs rounded transition-colors w-11 flex-shrink-0">
                      Yes
                    </button>
                    <button className="px-2.5 py-1 bg-[#4A414D] hover:bg-[#D04740] text-[#D04740] hover:text-white text-xs rounded transition-colors w-11 flex-shrink-0">
                      No
                    </button>
                  </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between text-xs text-gray-500 pt-2.5 border-t border-gray-600">
            <span>{market.volume} Vol. 🔄</span>
            <div className="flex gap-2">
              <button className="hover:text-gray-400 transition-colors">🎁</button>
              <button className="hover:text-gray-400 transition-colors">🔖</button>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}

