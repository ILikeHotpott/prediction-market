"use client"

import { useState, useRef, useEffect } from "react"
import { HexColorPicker } from "react-colorful"

const PRESET_COLORS = [
  "#22c55e", // green
  "#ef4444", // red
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#a855f7", // purple
]

export function ColorPicker({ value, onChange, label }) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState(value || "#22c55e")
  const popoverRef = useRef(null)

  useEffect(() => {
    setInputValue(value || "#22c55e")
  }, [value])

  useEffect(() => {
    function handleClickOutside(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleColorChange = (color) => {
    setInputValue(color)
    onChange?.(color)
  }

  const handleInputChange = (e) => {
    const val = e.target.value
    setInputValue(val)
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      onChange?.(val)
    }
  }

  const handleInputBlur = () => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(inputValue)) {
      setInputValue(value || "#22c55e")
    }
  }

  return (
    <div className="relative" ref={popoverRef}>
      {label && (
        <label className="text-sm text-foreground opacity-80 block mb-1">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-10 h-10 rounded-lg border border-gray-300 shadow-sm cursor-pointer flex-shrink-0"
          style={{ backgroundColor: value || "#22c55e" }}
          aria-label="Pick color"
        />
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          placeholder="#22c55e"
          className="flex-1 bg-popover border border rounded-lg p-2 text-foreground text-sm font-mono"
          maxLength={7}
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-2 p-3 bg-white rounded-xl shadow-lg border border-gray-200">
          <HexColorPicker color={value || "#22c55e"} onChange={handleColorChange} />
          <div className="mt-3 grid grid-cols-6 gap-1.5">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => handleColorChange(color)}
                className="w-6 h-6 rounded-md border border-gray-200 hover:scale-110 transition-transform"
                style={{ backgroundColor: color }}
                aria-label={`Select ${color}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ColorPicker
