"use client"

import { Suspense, useEffect, useState, useMemo } from "react"
import Navigation from "@/components/Navigation"
import { useAuth } from "@/components/auth/AuthProvider"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

export default function LeaderboardPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({ users: [], current_user: null, categories: [] })
  const [period, setPeriod] = useState("all")
  const [category, setCategory] = useState("")
  const [sortBy, setSortBy] = useState("pnl")

  useEffect(() => {
    fetchLeaderboard()
  }, [period, category, sortBy])

  async function fetchLeaderboard() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ period, sort: sortBy })
      if (category) params.set("category", category)

      const headers = {}
      if (user?.id) headers["X-User-Id"] = user.id

      const res = await fetch(`${backendBase}/api/leaderboard/?${params}`, {
        headers,
        cache: "no-store",
      })
      const json = await res.json()
      if (res.ok) {
        setData(json)
      }
    } catch (e) {
      console.error("Failed to fetch leaderboard:", e)
    } finally {
      setLoading(false)
    }
  }

  const formatPnl = (num) => {
    const prefix = num >= 0 ? "+" : ""
    return `${prefix}$${Math.round(num).toLocaleString()}`
  }

  const formatVolume = (num) => {
    return `$${Math.round(num).toLocaleString()}`
  }

  const getRankIcon = (rank) => {
    if (rank === 1) return "🥇"
    if (rank === 2) return "🥈"
    if (rank === 3) return "🥉"
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <Suspense fallback={<div className="h-20" />}>
        <Navigation />
      </Suspense>
      <div className="max-w-[900px] mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white tracking-tight">Leaderboard</h1>
          <p className="text-white/60 mt-1">Top traders ranked by performance</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Period Tabs */}
          <div className="flex bg-white/10 backdrop-blur-sm rounded-xl p-1 border border-white/10">
            {[
              { value: "today", label: "Today" },
              { value: "weekly", label: "Week" },
              { value: "monthly", label: "Month" },
              { value: "all", label: "All Time" },
            ].map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  period === p.value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Category Select */}
          <Select value={category || "all"} onValueChange={(v) => setCategory(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[160px] bg-white/10 backdrop-blur-sm border-white/10 rounded-xl text-white font-medium">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent className="bg-[#2d3d2d] border border-white/20 rounded-xl shadow-xl">
              <SelectItem value="all">All Categories</SelectItem>
              {(data.categories || []).map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort Toggle */}
          <div className="flex bg-white/10 backdrop-blur-sm rounded-xl p-1 border border-white/10 ml-auto">
            <button
              onClick={() => setSortBy("pnl")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                sortBy === "pnl"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              P&L
            </button>
            <button
              onClick={() => setSortBy("volume")}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                sortBy === "volume"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
            >
              Volume
            </button>
          </div>
        </div>

        {/* Table Header */}
        <div className="flex items-center px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">
          <span className="w-16">Rank</span>
          <span className="flex-1">Trader</span>
          <span className="w-32 text-right">Profit/Loss</span>
          <span className="w-32 text-right">Volume</span>
        </div>

        {/* Leaderboard List */}
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden">
          {loading ? (
            <div className="divide-y divide-white/5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-4">
                  <Skeleton className="w-10 h-10 rounded-full bg-white/10" />
                  <Skeleton className="h-5 w-32 bg-white/10" />
                  <Skeleton className="h-5 w-24 ml-auto bg-white/10" />
                  <Skeleton className="h-5 w-24 bg-white/10" />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {data.users.map((u) => {
                const rankIcon = getRankIcon(u.rank)

                return (
                  <div
                    key={u.user_id}
                    className={`flex items-center px-4 py-4 transition-colors hover:bg-white/5 ${
                      u.is_current_user ? "bg-blue-500/10 border-l-2 border-l-blue-400" : ""
                    }`}
                  >
                    {/* Rank */}
                    <div className="w-16 flex items-center">
                      {rankIcon ? (
                        <span className="text-2xl">{rankIcon}</span>
                      ) : (
                        <span className="text-white/40 font-semibold text-lg">
                          #{u.rank}
                        </span>
                      )}
                    </div>

                    {/* User Info */}
                    <div className="flex-1 flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center overflow-hidden ring-2 ring-white/10">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white text-sm font-semibold">
                            {(u.display_name || "?")[0].toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate">
                          {u.display_name}
                          {u.is_current_user && (
                            <span className="ml-2 text-xs font-medium text-blue-300 bg-blue-500/20 px-2 py-0.5 rounded-full">
                              You
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* P&L */}
                    <div className={`w-32 text-right font-bold text-lg ${
                      u.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {formatPnl(u.pnl)}
                    </div>

                    {/* Volume */}
                    <div className="w-32 text-right text-white/60 font-medium">
                      {formatVolume(u.volume)}
                    </div>
                  </div>
                )
              })}

              {/* Current User (if not in top list) */}
              {data.current_user && !data.users.find((u) => u.user_id === data.current_user.user_id) && (
                <>
                  <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  <div className="flex items-center px-4 py-4 bg-blue-500/10 border-l-2 border-l-blue-400">
                    <div className="w-16">
                      <span className="text-white/40 font-semibold text-lg">
                        #{data.current_user.rank}
                      </span>
                    </div>
                    <div className="flex-1 flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center overflow-hidden ring-2 ring-white/10">
                        {data.current_user.avatar_url ? (
                          <img src={data.current_user.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white text-sm font-semibold">
                            {(data.current_user.display_name || "?")[0].toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate">
                          {data.current_user.display_name}
                          <span className="ml-2 text-xs font-medium text-blue-300 bg-blue-500/20 px-2 py-0.5 rounded-full">
                            You
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className={`w-32 text-right font-bold text-lg ${
                      data.current_user.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {formatPnl(data.current_user.pnl)}
                    </div>
                    <div className="w-32 text-right text-white/60 font-medium">
                      {formatVolume(data.current_user.volume)}
                    </div>
                  </div>
                </>
              )}

              {data.users.length === 0 && !loading && (
                <div className="text-center py-16">
                  <div className="text-4xl mb-3">🏆</div>
                  <div className="text-white/50">No traders found</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
