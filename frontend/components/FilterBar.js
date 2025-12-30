"use client"

import { useState } from "react"

export default function FilterBar() {
  const filters = [
    "All", "Trump", "Gov Shutdown", "Global Elections", "NYC Mayor", 
    "Gaza", "Ukraine", "MLB Playoffs", "Venezuela", "China", "Epstein"
  ]
  
  const [activeFilter, setActiveFilter] = useState("All")

  return (
    <div className="bg-background border-b border-white/10 py-4 mb-2 shadow-sm">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">
        <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto scrollbar-hide">
          <button className="text-muted-foreground hover:text-white transition-colors flex-shrink-0">
            ⚙️
          </button>
          <button className="text-muted-foreground hover:text-white transition-colors flex-shrink-0">
            🔖
          </button>
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-1.5 rounded-full text-sm uppercase tracking-wide whitespace-nowrap transition-all flex-shrink-0 ${
                activeFilter === filter
                  ? "bg-accent text-black shadow-[0_2px_0_rgba(180,83,9,1)] active:translate-y-[1px] active:shadow-none"
                  : "bg-white/10 text-muted-foreground hover:bg-white/20 hover:text-white border border-transparent hover:border-white/10"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
