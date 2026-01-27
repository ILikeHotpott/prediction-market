"use client"

import { useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FINANCE_INTERVALS, FINANCE_ASSETS } from "@/lib/constants/finance"

export default function FinanceSidebar() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const category = searchParams.get("category")
  const financeInterval = searchParams.get("finance_interval")
  const financeAsset = searchParams.get("finance_asset")

  const activeInterval = useMemo(() => {
    if (financeAsset) return null
    return financeInterval || "15m"
  }, [financeAsset, financeInterval])

  const activeAsset = useMemo(() => {
    if (financeInterval) return null
    return financeAsset || null
  }, [financeAsset, financeInterval])

  const updateQuery = (next) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("category", "finance")
    Object.entries(next).forEach(([key, value]) => {
      if (value == null || value === "") params.delete(key)
      else params.set(key, value)
    })
    router.push(`/?${params.toString()}`)
  }

  if (category !== "finance") return null

  return (
    <div className="w-full md:w-56 lg:w-64 flex-shrink-0">
      <div className="bg-[#1f2b24] border border-white/10 rounded-2xl p-4 md:p-5 sticky top-24">
        <div className="text-xs uppercase tracking-[0.2em] text-white/50 mb-4">
          Finance
        </div>
        <div className="space-y-2">
          {FINANCE_INTERVALS.map((item) => {
            const isActive = activeInterval === item.value
            return (
              <button
                key={item.value}
                onClick={() => updateQuery({ finance_interval: item.value, finance_asset: null })}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition ${
                  isActive
                    ? "bg-[#f2c35b] text-[#1f2b24] shadow-[0_6px_0_rgba(0,0,0,0.15)]"
                    : "text-white/80 hover:bg-white/10"
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>

        <div className="my-4 border-t border-white/10" />

        <div className="space-y-2">
          {FINANCE_ASSETS.map((item) => {
            const isActive = activeAsset === item.value
            return (
              <button
                key={item.value}
                onClick={() => updateQuery({ finance_asset: item.value, finance_interval: null })}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition ${
                  isActive
                    ? "bg-[#f2c35b] text-[#1f2b24] shadow-[0_6px_0_rgba(0,0,0,0.15)]"
                    : "text-white/80 hover:bg-white/10"
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
