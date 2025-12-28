"use client"

import { useEffect, useMemo, useState } from "react"
import Navigation from "@/components/Navigation"
import LoadingSpinner from "@/components/LoadingSpinner"
import { useAuth } from "@/components/auth/AuthProvider"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

export default function PortfolioPage() {
  const { user, openAuthModal } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [portfolio, setPortfolio] = useState(null)
  const [history, setHistory] = useState([])
  const [sellingId, setSellingId] = useState(null)
  const [actionMessage, setActionMessage] = useState("")

  useEffect(() => {
    if (!user) {
      setPortfolio(null)
      setHistory([])
      setActionMessage("")
      return
    }
    fetchData()
  }, [user])

  async function fetchData() {
    setLoading(true)
    setError("")
    setActionMessage("")
    try {
      const [pRes, hRes] = await Promise.all([
        fetch(`${backendBase}/api/users/me/portfolio/`, {
          headers: { "X-User-Id": user.id },
          cache: "no-store",
        }),
        fetch(`${backendBase}/api/users/me/history/`, {
          headers: { "X-User-Id": user.id },
          cache: "no-store",
        }),
      ])
      const pData = await pRes.json()
      const hData = await hRes.json()
      if (!pRes.ok) throw new Error(pData.error || "Failed to load portfolio")
      if (!hRes.ok) throw new Error(hData.error || "Failed to load history")
      setPortfolio(pData)
      setHistory(hData.items || [])
    } catch (e) {
      setError(e.message || "加载失败")
    } finally {
      setLoading(false)
    }
  }

  const balance = portfolio?.balance
  const positions = portfolio?.positions || []
  const cashValue = useMemo(() => Number(balance?.available_amount || 0), [balance])
  const holdingsValue = useMemo(() => Number(portfolio?.portfolio_value || 0), [portfolio])
  const totalValue = useMemo(() => cashValue + holdingsValue, [cashValue, holdingsValue])

  async function handleSellPosition(pos) {
    if (!user) {
      openAuthModal("login")
      return
    }
    const shares = Number(pos.shares || 0)
    if (!shares || shares <= 0) {
      setError("可卖出份额不足")
      return
    }
    setSellingId(pos.option_id)
    setError("")
    setActionMessage("")
    try {
      const res = await fetch(`${backendBase}/api/markets/${pos.market_id}/orders/sell/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": user.id,
        },
        body: JSON.stringify({
          option_id: pos.option_id,
          shares: String(shares),
          token: "USDC",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "卖出失败")
      setActionMessage("卖出成功")
      await fetchData()
    } catch (e) {
      setError(e.message || "卖出失败")
    } finally {
      setSellingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#0f172a]">
      <Navigation />
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        {!user && (
          <div className="text-center text-gray-300 py-10">
            请先登录。
            <Button className="ml-3" onClick={() => openAuthModal("login")}>
              登录
            </Button>
          </div>
        )}
        {user && (
          <>
            {loading && (
              <div className="py-8">
                <LoadingSpinner />
              </div>
            )}
            {error && <div className="text-red-400 mb-4">{error}</div>}
            {actionMessage && <div className="text-green-400 mb-4">{actionMessage}</div>}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              <Card className="bg-[#1e293b] border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-gray-300 text-sm">Portfolio</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">${totalValue.toFixed(2)}</div>
                  <div className="text-sm text-gray-400 mt-2">
                    Cash: ${cashValue.toFixed(2)} | Holdings: ${holdingsValue.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-[#1e293b] border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-gray-300 text-sm">Cash</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-white">
                    ${cashValue.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-400 mt-2">Token: {balance?.token || "USDC"}</div>
                </CardContent>
              </Card>
              <Card className="bg-[#1e293b] border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-gray-300 text-sm">Actions</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-3">
                  <Button className="flex-1 bg-blue-600 hover:bg-blue-700">Deposit</Button>
                  <Button className="flex-1 bg-gray-700 hover:bg-gray-600">Withdraw</Button>
                </CardContent>
              </Card>
            </div>

            <Card className="bg-[#1e293b] border-gray-700 mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-white">Positions</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-gray-300">
                    <thead className="bg-[#223144] text-gray-400 uppercase text-xs">
                      <tr>
                        <th className="px-4 py-3">Market</th>
                        <th className="px-4 py-3">Price</th>
                        <th className="px-4 py-3">Bet</th>
                        <th className="px-4 py-3">To Win</th>
                        <th className="px-4 py-3">Value</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((p, idx) => (
                        <tr key={idx} className="border-b border-gray-700 last:border-0">
                          <td className="px-4 py-3 text-white">
                            <div className="font-semibold">{p.market_title}</div>
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                              <span
                                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  String(p.option_title || "").toLowerCase() === "no"
                                    ? "bg-red-900/50 text-red-300"
                                    : "bg-green-900/40 text-green-300"
                                }`}
                              >
                                {p.option_title}
                              </span>
                              <span className="text-gray-500">{Number(p.shares).toFixed(2)} shares</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {p.price ? `${(Number(p.price) * 100).toFixed(1)}¢` : "—"}
                          </td>
                          <td className="px-4 py-3">${Number(p.cost_basis).toFixed(2)}</td>
                          <td className="px-4 py-3 text-green-400">
                            ${Number(p.shares).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-green-400">
                            ${Number(p.value).toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <Button
                              className="bg-blue-600 hover:bg-blue-700 h-9 px-4"
                              disabled={sellingId === p.option_id}
                              onClick={() => handleSellPosition(p)}
                            >
                              {sellingId === p.option_id ? "Selling..." : "Sell"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {!positions.length && (
                        <tr>
                          <td className="px-4 py-4 text-center text-gray-500" colSpan={7}>
                            No positions yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#1e293b] border-gray-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-white">History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left text-gray-300">
                    <thead className="bg-[#223144] text-gray-400 uppercase text-xs">
                      <tr>
                        <th className="px-4 py-3">Market</th>
                        <th className="px-4 py-3">Option</th>
                        <th className="px-4 py-3">Side</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Shares</th>
                        <th className="px-4 py-3">Price</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id} className="border-b border-gray-700 last:border-0">
                          <td className="px-4 py-3 text-white">{h.market_title}</td>
                          <td className="px-4 py-3">{h.option_title}</td>
                          <td className="px-4 py-3 uppercase">{h.side}</td>
                          <td className="px-4 py-3">${h.amount_in ? Number(h.amount_in).toFixed(2) : "—"}</td>
                          <td className="px-4 py-3">{h.shares_out ? Number(h.shares_out).toFixed(2) : "—"}</td>
                          <td className="px-4 py-3">{h.price ? `$${Number(h.price).toFixed(2)}` : "—"}</td>
                          <td className="px-4 py-3">{h.status}</td>
                          <td className="px-4 py-3 text-gray-400">
                            {h.created_at ? new Date(h.created_at).toLocaleString() : "—"}
                          </td>
                        </tr>
                      ))}
                      {!history.length && (
                        <tr>
                          <td className="px-4 py-4 text-center text-gray-500" colSpan={8}>
                            No history yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}

