"use client"

import { useEffect, useRef, useState } from "react"
import Navigation from "@/components/Navigation"
import { useAuth } from "@/components/auth/AuthProvider"
import { usePortfolio } from "@/components/PortfolioProvider"
import { Button } from "@/components/ui/button"
import { Camera } from "lucide-react"

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

export default function ProfilePage() {
  const { user, openAuthModal } = useAuth()
  const { refreshPortfolio } = usePortfolio()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [pendingAvatar, setPendingAvatar] = useState(null) // File to upload on save
  const [previewUrl, setPreviewUrl] = useState(null) // Preview before save
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    fetchProfile()
  }, [user])

  async function fetchProfile() {
    setLoading(true)
    try {
      const res = await fetch(`${backendBase}/api/users/me/`, {
        headers: { "X-User-Id": user.id },
        cache: "no-store",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load profile")
      setProfile(data)
      setDisplayName(data.display_name || "")
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!user) return
    setSaving(true)
    setError("")
    setSuccess("")
    try {
      // Upload avatar first if pending
      let newAvatarUrl = null
      if (pendingAvatar) {
        const formData = new FormData()
        formData.append("file", pendingAvatar)
        const avatarRes = await fetch(`${backendBase}/api/users/me/avatar/`, {
          method: "POST",
          headers: { "X-User-Id": user.id },
          body: formData,
        })
        const avatarData = await avatarRes.json()
        if (!avatarRes.ok) throw new Error(avatarData.error || "Failed to upload avatar")
        newAvatarUrl = avatarData.url
      }

      // Update profile
      const res = await fetch(`${backendBase}/api/users/me/profile/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": user.id,
        },
        body: JSON.stringify({ display_name: displayName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save")

      // Update local state
      setProfile({ ...data, avatar_url: newAvatarUrl || data.avatar_url })
      setPendingAvatar(null)
      setPreviewUrl(null)
      setSuccess("Profile updated successfully")

      // Refresh portfolio to update Navigation avatar
      refreshPortfolio()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleAvatarSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingAvatar(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const avatarDisplay = previewUrl || profile?.avatar_url

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="max-w-[600px] mx-auto px-4 py-10 text-center">
          <p className="text-foreground mb-4">Please log in to view your profile</p>
          <Button onClick={() => openAuthModal("login")}>Log In</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="max-w-[600px] mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-bold text-foreground mb-8">Profile Settings</h1>

        {error && <div className="text-red-300 mb-4 p-3 bg-red-900/30 rounded-xl border border-red-800/50">{error}</div>}
        {success && <div className="text-green-300 mb-4 p-3 bg-green-900/30 rounded-xl border border-green-800/50">{success}</div>}

        {loading ? (
          <div className="space-y-6">
            <div className="h-20 w-20 rounded-full bg-white/10 animate-pulse" />
            <div className="h-12 w-full bg-white/10 rounded-xl animate-pulse" />
            <div className="h-12 w-full bg-white/10 rounded-xl animate-pulse" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-[#2F6B4A] border-2 border-white/20 overflow-hidden flex items-center justify-center shadow-lg">
                {avatarDisplay ? (
                  <img src={avatarDisplay} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-white">
                    {displayName?.charAt(0) || user?.email?.charAt(0) || "U"}
                  </span>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarSelect}
              />
              <Button
                className="bg-[#2F6B4A] hover:bg-[#3d8a5f] text-white border border-white/20"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="w-4 h-4 mr-2" />
                Upload
              </Button>
              {pendingAvatar && (
                <span className="text-sm text-yellow-300">Unsaved</span>
              )}
            </div>

            {/* Email (read-only) */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Email</label>
              <input
                type="email"
                value={profile?.email || user?.email || ""}
                disabled
                className="w-full px-4 py-3 rounded-xl bg-[#1F2B24] border border-white/10 text-white/50 cursor-not-allowed"
              />
            </div>

            {/* Username */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Username</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your username"
                className="w-full px-4 py-3 rounded-xl bg-[#1F2B24] border border-white/20 text-foreground placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#F2C35B] focus:border-transparent"
              />
            </div>

            {/* Save Button */}
            <Button
              className="bg-[#2F6B4A] hover:bg-[#3d8a5f] text-white px-8 py-3 font-semibold shadow-lg"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
