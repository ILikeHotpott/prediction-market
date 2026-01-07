"use client"

import { useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

const backendBase = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

// Step 1: Welcome
function WelcomeStep({ onNext }) {
  return (
    <div className="flex flex-col items-center text-center px-4 py-8">
      {/* Logo */}
      <svg className="w-32 h-32 mb-6" viewBox="0 0 100 80" fill="none">
        <path d="M50 5 L65 35 L95 35 L70 55 L80 85 L50 65 L20 85 L30 55 L5 35 L35 35 Z"
              stroke="#F2C35B" strokeWidth="3" fill="none"/>
      </svg>

      <h1 className="text-3xl font-bold text-[#F2C35B] mb-6">
        Welcome to Monofuture!
      </h1>

      <p className="text-lg text-[#F3E1B6] mb-4">
        Monofuture is a play money prediction market platform.
      </p>

      <p className="text-lg text-[#F3E1B6] mb-8">
        Bet on politics, tech, sports, and more. Your bets contribute to the wisdom of the crowd.
      </p>

      <div className="w-full flex justify-end">
        <Button
          onClick={onNext}
          className="bg-[#2F6B4A] hover:bg-[#3d8a5f] text-white px-8 py-2 rounded-lg"
        >
          Next
        </Button>
      </div>
    </div>
  )
}

// Step 2: About You
function AboutYouStep({ displayName, setDisplayName, onPrev, onNext, error }) {
  return (
    <div className="flex flex-col px-4 py-8">
      <h1 className="text-3xl font-bold text-[#F2C35B] text-center mb-8">
        About You
      </h1>

      <div className="mb-6">
        <label className="block text-lg text-[#F3E1B6] mb-3">
          What should we call you?
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Enter your display name"
          className="w-full px-4 py-3 rounded-lg bg-[#1F2B24] border border-[#446f55] text-[#F3E1B6] placeholder:text-[#F3E1B6]/40 focus:outline-none focus:ring-2 focus:ring-[#F2C35B] focus:border-transparent"
        />
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </div>

      <p className="text-[#F3E1B6]/80 mb-8">
        Your display name will be shown to other users when you place bets or leave comments.
      </p>

      <div className="w-full flex justify-between">
        <button
          onClick={onPrev}
          className="text-[#F3E1B6]/60 hover:text-[#F3E1B6] transition-colors"
        >
          Previous
        </button>
        <Button
          onClick={onNext}
          className="bg-[#2F6B4A] hover:bg-[#3d8a5f] text-white px-8 py-2 rounded-lg"
        >
          Next
        </Button>
      </div>
    </div>
  )
}

// Step 3: How it works
function HowItWorksStep({ onPrev, onFinish, loading }) {
  return (
    <div className="flex flex-col px-4 py-8">
      <h1 className="text-3xl font-bold text-[#F2C35B] text-center mb-6">
        How it works
      </h1>

      <p className="text-lg text-[#F3E1B6] mb-4">
        We've sent you <span className="text-[#F2C35B] font-bold">$1,000</span> in play money. Bet on the answer you think is right.
      </p>

      <p className="text-[#F3E1B6]/80 mb-6">
        Research shows wagering currency leads to more accurate predictions than polls.
      </p>

      {/* Illustration */}
      <div className="bg-[#f9f6ee] rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col items-center">
            <p className="text-[#446f55] font-medium mb-2">Will it rain tomorrow?</p>
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-[#2F6B4A] rounded-full"></div>
              <span className="text-[#2F6B4A] text-sm">65%</span>
            </div>
            {/* Yes bird */}
            <svg className="w-16 h-16 mt-2" viewBox="0 0 60 50">
              <path d="M30 5 L40 20 L55 20 L45 32 L50 47 L30 37 L10 47 L15 32 L5 20 L20 20 Z"
                    fill="#2F6B4A"/>
            </svg>
            <span className="text-[#2F6B4A] font-bold">Yes</span>
          </div>

          <div className="flex flex-col items-center">
            {/* No bird */}
            <svg className="w-16 h-16" viewBox="0 0 60 50">
              <path d="M30 5 L40 20 L55 20 L45 32 L50 47 L30 37 L10 47 L15 32 L5 20 L20 20 Z"
                    fill="#B24A3F"/>
            </svg>
            <span className="text-[#B24A3F] font-bold">No</span>
          </div>
        </div>
      </div>

      <div className="w-full flex justify-between">
        <button
          onClick={onPrev}
          className="text-[#F3E1B6]/60 hover:text-[#F3E1B6] transition-colors"
        >
          Previous
        </button>
        <Button
          onClick={onFinish}
          disabled={loading}
          className="bg-[#2F6B4A] hover:bg-[#3d8a5f] text-white px-8 py-2 rounded-lg disabled:opacity-50"
        >
          {loading ? "Starting..." : "Get Started"}
        </Button>
      </div>
    </div>
  )
}

export default function OnboardingModal({ open, onComplete, userId, initialDisplayName }) {
  const [step, setStep] = useState(1)
  const [displayName, setDisplayName] = useState(initialDisplayName || "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleFinish = async () => {
    setLoading(true)
    setError("")

    try {
      const res = await fetch(`${backendBase}/api/users/me/onboarding/complete/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
        },
        body: JSON.stringify({ display_name: displayName }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.error === "Display name already taken") {
          setStep(2)
          setError("This display name is already taken. Please choose another.")
          setLoading(false)
          return
        }
        throw new Error(data.error || "Failed to complete onboarding")
      }

      onComplete?.(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={() => {}}>
      <DialogContent className="bg-[#1F2B24] border border-[#446f55] max-w-md mx-auto">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-4">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-colors ${
                s === step ? "bg-[#F2C35B]" : "bg-[#446f55]"
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <WelcomeStep onNext={() => setStep(2)} />
        )}

        {step === 2 && (
          <AboutYouStep
            displayName={displayName}
            setDisplayName={setDisplayName}
            onPrev={() => setStep(1)}
            onNext={() => {
              setError("")
              setStep(3)
            }}
            error={error}
          />
        )}

        {step === 3 && (
          <HowItWorksStep
            onPrev={() => setStep(2)}
            onFinish={handleFinish}
            loading={loading}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
