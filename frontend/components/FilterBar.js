"use client"

import { useState } from "react"

export default function FilterBar() {
  const filters = [
    "All", "Trump", "Gov Shutdown", "Global Elections", "NYC Mayor", 
    "Gaza", "Ukraine", "MLB Playoffs", "Venezuela", "China", "Epstein"
  ]
  
  const [activeFilter, setActiveFilter] = useState("All")

  return (
    <div className="bg-background border-[#425264] py-4 mb-2">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12">
        <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto scrollbar-hide">
          <button className="text-gray-400 hover:text-white transition-colors flex-shrink-0">
            ⚙️
          </button>
          <button className="text-gray-400 hover:text-white transition-colors flex-shrink-0">
            🔖
          </button>
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors flex-shrink-0 ${
                activeFilter === filter
                  ? "bg-blue-600 text-white"
                  : "bg-gray-700/50 text-gray-300 hover:bg-gray-700 hover:text-white"
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

