"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import Navigation from "@/components/Navigation"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/components/auth/AuthProvider"
import { ADMIN_CATEGORIES } from "@/lib/constants/categories"

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

export default function EditEventPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useParams()
  const eventId = params?.id
  const fileInputRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [event, setEvent] = useState(null)
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    cover_url: "",
    slug: "",
    sort_weight: 0,
    is_hidden: false,
    trading_deadline: "",
    resolution_deadline: "",
    markets: [],
  })

  useEffect(() => {
    if (eventId && user) {
      fetchEvent()
    }
  }, [eventId, user])

  async function fetchEvent() {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`${backendBase}/api/events/${eventId}/`, {
        headers: user ? { "X-User-Id": user.id } : {},
      })
      if (!res.ok) throw new Error("Failed to load event")
      const data = await res.json()
      setEvent(data)
      setForm({
        title: data.title || "",
        description: data.description || "",
        category: data.category || "",
        cover_url: data.cover_url || "",
        slug: data.slug || "",
        sort_weight: data.sort_weight || 0,
        is_hidden: data.is_hidden || false,
        trading_deadline: data.trading_deadline ? data.trading_deadline.slice(0, 16) : "",
        resolution_deadline: data.resolution_deadline ? data.resolution_deadline.slice(0, 16) : "",
        markets: (data.markets || []).map((m) => ({
          id: m.id,
          title: m.title || "",
          description: m.description || "",
          bucket_label: m.bucket_label || "",
          sort_weight: m.sort_weight || 0,
          trading_deadline: m.trading_deadline ? m.trading_deadline.slice(0, 16) : "",
          resolution_deadline: m.resolution_deadline ? m.resolution_deadline.slice(0, 16) : "",
        })),
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleMarketChange(idx, field, value) {
    setForm((prev) => {
      const next = [...prev.markets]
      next[idx] = { ...next[idx], [field]: value }
      return { ...prev, markets: next }
    })
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError("")
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`${backendBase}/api/upload/image/`, {
        method: "POST",
        headers: user ? { "X-User-Id": user.id } : {},
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Upload failed")
      handleChange("cover_url", data.url)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError("")
    setSuccess("")
    try {
      const payload = {
        title: form.title,
        description: form.description,
        category: form.category,
        cover_url: form.cover_url,
        slug: form.slug,
        sort_weight: Number(form.sort_weight),
        is_hidden: form.is_hidden,
        trading_deadline: form.trading_deadline,
        resolution_deadline: form.resolution_deadline,
        markets: form.markets.map((m) => ({
          id: m.id,
          title: m.title,
          description: m.description,
          bucket_label: m.bucket_label,
          sort_weight: Number(m.sort_weight),
          trading_deadline: m.trading_deadline,
          resolution_deadline: m.resolution_deadline,
        })),
      }
      const res = await fetch(`${backendBase}/api/events/${eventId}/update/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(user ? { "X-User-Id": user.id } : {}),
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Update failed")
      setSuccess("Event updated successfully")
      setEvent(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
  const labelClass = "block text-sm font-semibold text-gray-800 mb-2"

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="text-gray-600 text-lg">Loading...</div>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="text-red-600 text-lg">{error || "Event not found"}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Edit Event</h1>
          <Button variant="outline" className="text-gray-700 border-gray-300 hover:bg-gray-100" onClick={() => router.push("/admin")}>
            Back to Admin
          </Button>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6">{success}</div>}

        <form onSubmit={handleSave} className="space-y-8">
          {/* Basic Info */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Basic Information</h2>
            <div className="space-y-6">
              <div>
                <label className={labelClass}>Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  className={inputClass}
                  placeholder="Enter event title"
                />
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  rows={4}
                  className={inputClass}
                  placeholder="Enter event description"
                />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className={labelClass}>Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => handleChange("category", e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select category</option>
                    {ADMIN_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Slug</label>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={(e) => handleChange("slug", e.target.value)}
                    className={inputClass}
                    placeholder="unique-identifier"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className={labelClass}>Sort Weight</label>
                  <input
                    type="number"
                    value={form.sort_weight}
                    onChange={(e) => handleChange("sort_weight", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="flex items-center pt-8">
                  <input
                    type="checkbox"
                    id="is_hidden"
                    checked={form.is_hidden}
                    onChange={(e) => handleChange("is_hidden", e.target.checked)}
                    className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <label htmlFor="is_hidden" className="ml-3 text-sm font-medium text-gray-800">
                    Hidden from public
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Cover Image */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Cover Image</h2>
            <div className="flex items-start gap-6">
              {form.cover_url ? (
                <img src={form.cover_url} alt="Cover" className="w-40 h-40 object-cover rounded-xl shadow-sm" />
              ) : (
                <div className="w-40 h-40 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400">
                  No image
                </div>
              )}
              <div className="flex-1 space-y-4">
                <input
                  type="text"
                  value={form.cover_url}
                  onChange={(e) => handleChange("cover_url", e.target.value)}
                  placeholder="Enter image URL"
                  className={inputClass}
                />
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                <Button type="button" variant="outline" className="text-gray-700 border-gray-300 hover:bg-gray-100" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? "Uploading..." : "Upload Image"}
                </Button>
              </div>
            </div>
          </div>

          {/* Deadlines */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Deadlines</h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>Trading Deadline</label>
                <input
                  type="datetime-local"
                  value={form.trading_deadline}
                  onChange={(e) => handleChange("trading_deadline", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Resolution Deadline</label>
                <input
                  type="datetime-local"
                  value={form.resolution_deadline}
                  onChange={(e) => handleChange("resolution_deadline", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Markets */}
          {form.markets.length > 0 && (
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Markets ({form.markets.length})</h2>
              <div className="space-y-6">
                {form.markets.map((m, idx) => (
                  <div key={m.id} className="bg-gray-50 rounded-xl p-6">
                    <div className="text-sm font-semibold text-indigo-600 mb-4">Market #{idx + 1}</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Title</label>
                        <input
                          type="text"
                          value={m.title}
                          onChange={(e) => handleMarketChange(idx, "title", e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Bucket Label</label>
                        <input
                          type="text"
                          value={m.bucket_label}
                          onChange={(e) => handleMarketChange(idx, "bucket_label", e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Sort Weight</label>
                        <input
                          type="number"
                          value={m.sort_weight}
                          onChange={(e) => handleMarketChange(idx, "sort_weight", e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Trading Deadline</label>
                        <input
                          type="datetime-local"
                          value={m.trading_deadline}
                          onChange={(e) => handleMarketChange(idx, "trading_deadline", e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status Info */}
          <div className="bg-indigo-50 rounded-xl p-6 border border-indigo-100">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-indigo-600 font-medium">Status:</span>
                <span className="ml-2 text-gray-900 font-semibold">{event.status}</span>
              </div>
              <div>
                <span className="text-indigo-600 font-medium">Group Rule:</span>
                <span className="ml-2 text-gray-900 font-semibold">{event.group_rule}</span>
              </div>
              <div>
                <span className="text-indigo-600 font-medium">Created:</span>
                <span className="ml-2 text-gray-900 font-semibold">{new Date(event.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-4 pt-4">
            <Button type="button" variant="outline" className="px-6 py-2 text-gray-700 border-gray-300 hover:bg-gray-100" onClick={() => router.push("/admin")}>
              Cancel
            </Button>
            <Button type="submit" className="px-8 py-2 bg-indigo-600 hover:bg-indigo-700 text-white" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
