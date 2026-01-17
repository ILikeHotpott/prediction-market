"use client"

import * as React from "react"
import { X } from "lucide-react"

const Sheet = ({ open, onOpenChange, children }) => {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      {children}
    </>
  )
}

const SheetContent = React.forwardRef(({ className = "", children, onClose }, ref) => {
  return (
    <div
      ref={ref}
      className={`fixed inset-x-0 bottom-0 z-50 bg-[#446f55] rounded-t-3xl shadow-xl animate-slide-up ${className}`}
      style={{
        maxHeight: '90vh',
        animation: 'slideUp 0.3s ease-out'
      }}
    >
      <style jsx>{`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>
      <div className="w-12 h-1.5 bg-white/30 rounded-full mx-auto mt-3 mb-4" />
      <div className="overflow-y-auto max-h-[calc(90vh-2rem)] pb-safe">
        {children}
      </div>
    </div>
  )
})
SheetContent.displayName = "SheetContent"

const SheetHeader = ({ className = "", children }) => (
  <div className={`px-6 pb-4 ${className}`}>
    {children}
  </div>
)

const SheetTitle = ({ className = "", children }) => (
  <h2 className={`text-lg font-semibold text-white ${className}`}>
    {children}
  </h2>
)

export { Sheet, SheetContent, SheetHeader, SheetTitle }
